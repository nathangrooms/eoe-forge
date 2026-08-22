/**
 * DeckMatrix — shared game-state core: the bot.
 *
 * A goldfish that never blocks and never punishes a bad attack teaches nothing.
 * This policy is not trying to be strong — it is trying to be *plausible*: it
 * curves out, holds up a commander until it can afford the tax, attacks when
 * the maths favour it, and blocks when a block is good or when it is about to
 * die.
 *
 * The important architectural property is that it decides in `GameAction`s.
 * It has no private board representation and no private rules — it reads a
 * `GameState`, calls the same `moves.ts` helpers a human's click calls, and
 * hands back a batch for `applyActions`. When real multiplayer arrives, a bot
 * seat and a human seat are indistinguishable to everything downstream: both
 * are just a source of actions arriving over a transport.
 *
 * Pure. No clock (timestamps arrive as `at`) and no `Math.random`, so a bot
 * game replays identically — which is what makes a bad beat reproducible
 * instead of anecdotal.
 */

import { getPlayer, isAlive, livingPlayers } from './rules.ts';
import {
  blockersRequiredFor,
  canBlock,
  eligibleAttackers,
  eligibleBlockers,
  validateBlockGroup,
} from './combat.ts';
// The bot reads the same layered characteristics the board draws. If it read
// printed values it would decline attacks the player can see are good, and the
// disagreement would look like a bot bug rather than a missing anthem.
import {
  combatPowerIn,
  combatToughnessIn,
  hasKeywordIn,
  isCreatureIn,
} from './characteristics.ts';
import { isLand, isPermanent, manaSourcesFor } from './mana.ts';
import { advanceActions, planCastFromHand, planLandDrop, declareAttack } from './moves.ts';
import { auraNeedsHost, legalHostsFor } from './attach.ts';
// CR 903.9a. The bot answers the same offer a human seat is shown, built by the
// same function, so a bot deck and a player's deck lose a commander the same way.
import { commanderZoneOffers } from './commander.ts';
import { staticAbilitiesOf } from './abilities/card-abilities.ts';
import { hasPriority, stackOf } from './stack.ts';
import { responseOptions, spellToAnswer } from './respond.ts';
// The bot activates abilities through the identical planner a human click goes
// through. It gets no private route onto the stack, which is the property that
// makes a bot seat and a human seat the same thing to everything downstream.
import { activatablePermanents, planActivationWith, type PendingChoice } from './activate.ts';
import type { CardInstance, GameAction, GameState, InstanceId, PlayerId, StackTarget } from './types.ts';

/** One visible decision. The surface applies the whole batch, then re-renders. */
export interface BotMove {
  actions: GameAction[];
  /** Short prose for the log strip, so a watcher can see what it decided and why. */
  note: string;
}

export interface BotOptions {
  /** Epoch ms stamped onto every action in the batch. */
  at?: number;
  /**
   * Announce spells onto the stack, and take priority.
   *
   * Off by default so `/simulate` and every existing test keep the immediate
   * cast they were written against. On, the bot casts through the stack, holds
   * a real priority round, and — the point of the whole thing — counters an
   * opponent's spell when it is holding an answer and can pay for it. A bot
   * that never responds makes every instant in a deck dead weight, and reads as
   * an engine that does not implement counterspells.
   */
  useStack?: boolean;
  /**
   * 'timid' never attacks into a possible trade, 'normal' trades up,
   * 'aggressive' attacks whenever it is not strictly losing the exchange.
   */
  aggression?: 'timid' | 'normal' | 'aggressive';
  /**
   * Seats the bot must not play through. An attacking bot stops at the declare
   * blockers step while one of these is being attacked, and waits for that
   * player to confirm — otherwise it would swing and resolve damage before a
   * human ever saw the attack, which is the difference between a playtest
   * opponent and a cutscene.
   */
  waitForPlayerIds?: readonly PlayerId[];
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

function handCards(state: GameState, playerId: PlayerId): CardInstance[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return player.zones.hand.map(id => state.cards[id]).filter(Boolean);
}

/** Rough "is this worth casting" score: bodies first, then anything permanent. */
function castScore(state: GameState, card: CardInstance): number {
  const cmc = card.cmc ?? 0;
  // A card in hand has no layered entry; `characteristics.ts` falls back to its
  // printed values, which is right — an anthem does not pump a card in hand.
  if (isCreatureIn(state, card))
    return 100 + combatPowerIn(state, card) * 3 + combatToughnessIn(state, card) + cmc;
  if (isPermanent(card)) return 50 + cmc;
  return 10 + cmc;
}

/**
 * Pick a land to play. Prefers an untapped-looking basic over a colour the bot
 * already has plenty of — approximated by favouring the colour its hand needs
 * most, using colour identity as the proxy for what a land produces.
 */
function chooseLand(state: GameState, playerId: PlayerId): CardInstance | null {
  const lands = handCards(state, playerId).filter(isLand);
  if (lands.length === 0) return null;

  const owned = new Set<string>();
  const player = getPlayer(state, playerId);
  for (const id of player?.zones.battlefield ?? []) {
    const card = state.cards[id];
    if (card && isLand(card)) for (const color of card.colorIdentity ?? []) owned.add(color);
  }

  const wanted = new Map<string, number>();
  for (const card of handCards(state, playerId)) {
    if (isLand(card)) continue;
    for (const color of card.colorIdentity ?? []) {
      wanted.set(color, (wanted.get(color) ?? 0) + 1);
    }
  }

  const score = (land: CardInstance): number => {
    const colors = land.colorIdentity ?? [];
    if (colors.length === 0) return 0;
    let value = 0;
    for (const color of colors) {
      value += wanted.get(color) ?? 0;
      // A colour it cannot yet make is worth more than a fifth copy of one it can.
      if (!owned.has(color)) value += 5;
    }
    return value;
  };

  return lands.slice().sort((a, b) => score(b) - score(a))[0];
}

/** The best castable thing right now, commander included, or null. */
function chooseSpell(
  state: GameState,
  playerId: PlayerId,
  at: number,
  viaStack = false
): { card: CardInstance; actions: GameAction[] } | null {
  const player = getPlayer(state, playerId);
  if (!player) return null;

  const candidates: CardInstance[] = [
    ...handCards(state, playerId).filter(card => !isLand(card)),
    // The commander is a card in a zone like any other; the tax is priced in by
    // `planCastFromHand`, so the bot naturally holds it when it cannot pay.
    ...player.zones.command.map(id => state.cards[id]).filter(Boolean),
  ];

  const ranked = candidates
    .filter(card => isPermanent(card))
    .sort((a, b) => castScore(state, b) - castScore(state, a));

  for (const card of ranked) {
    /*
     * An Aura is the one permanent that cannot be cast without naming
     * something, and the bot has to name it or it holds every Aura in its deck
     * forever. `planCastFromHand` refuses and hands back the legal hosts, so
     * the bot answers and asks again, which is the identical loop a person goes
     * round by pressing a name on the mat.
     *
     * WHICH side of the table it goes on is read off the card rather than
     * guessed, and it had to be: the first run put every Aura on the bot's own
     * biggest creature, and 3 of 71 Aura plays across 80 games were a Debilitating
     * Injury or a Twisted Experiment killing the creature the bot had just chosen
     * to protect. Rules-correct, and nonsense to watch. `auraPunishes` asks the
     * compiled static whether this Aura makes its host smaller; if it does it is
     * removal and goes across the table, and if it does not it is a bonus and
     * stays home.
     */
    const wantsHost = auraNeedsHost(card);
    const hosts = wantsHost ? legalHostsFor(state, playerId, card) : [];
    const hostId = wantsHost
      ? auraPunishes(card)
        ? bestHostOf(state, hosts, id => state.cards[id]?.controllerId !== playerId)
        : bestOwnHost(state, playerId, hosts)
      : undefined;
    if (wantsHost && !hostId) continue;

    const plan = planCastFromHand(state, playerId, card.instanceId, {
      at,
      viaStack,
      ...(hostId ? { hostId } : {}),
    });
    if (plan.ok) return { card, actions: plan.actions };
  }
  return null;
}

/**
 * The bot's own permanent to point something beneficial at: the biggest, so a
 * pump or a sword lands where it does the most.
 *
 * `combatPowerIn` rather than the printed power, so a creature that is already
 * carrying an anthem or a sword is correctly seen as the biggest. Ties break on
 * the instance id, because two bots replaying the same log have to make the
 * same choice and "whichever came back first" is only stable by accident.
 */
function bestOwnHost(
  state: GameState,
  playerId: PlayerId,
  candidates: readonly InstanceId[]
): InstanceId | undefined {
  return bestHostOf(state, candidates, id => state.cards[id]?.controllerId === playerId);
}

/** The biggest candidate passing a test, or undefined when none does. */
function bestHostOf(
  state: GameState,
  candidates: readonly InstanceId[],
  keep: (id: InstanceId) => boolean
): InstanceId | undefined {
  const kept = candidates.filter(keep);
  if (kept.length === 0) return undefined;
  return kept
    .slice()
    .sort((a, b) => combatPowerIn(state, b) - combatPowerIn(state, a) || (a < b ? -1 : a > b ? 1 : 0))[0];
}

/**
 * Does this Aura make the thing it enchants WORSE?
 *
 * Read off the compiled static ability, so it is the card's own text answering
 * rather than a name list somebody has to maintain: a modification in layer 7c
 * that subtracts power or toughness from `{sel:'attached'}` is a Pacifism-shaped
 * card and belongs on an opponent's creature.
 *
 * Deliberately narrow. It says nothing about an Aura whose drawback is a
 * restriction the compiler has not modelled, and such an Aura is treated as a
 * bonus and put on the bot's own board, which is the mistake this catches only
 * some of. Narrow and right beats wide and guessing, and a false negative here
 * costs the bot one creature rather than making it play an opponent's card for
 * them.
 */
function auraPunishes(card: CardInstance): boolean {
  return staticAbilitiesOf(card).some(ability => {
    if (ability.affects.sel !== 'attached') return false;
    return ability.modifications.some(modification => {
      if (modification.layer !== 'pt-modify' && modification.layer !== 'pt-set') return false;
      const power = modification.power;
      const toughness = modification.toughness;
      return (
        (typeof power === 'number' && power < 0) || (typeof toughness === 'number' && toughness < 0)
      );
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Activated abilities                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How many abilities the bot will activate in one of its turns.
 *
 * Not a rules limit and not pretending to be one. A permanent with an ability
 * costing only mana can legally be activated until the mana runs out, and a
 * bot that empties its board into one Rod of Ruin every turn is not a plausible
 * opponent, which is this file's stated aim. Three is a turn where the ability
 * mattered and not a turn that is only the ability.
 */
const MAX_ACTIVATIONS_PER_TURN = 3;

/** Activations this seat has already made this turn, read from the state's own count. */
function activationsThisTurn(state: GameState, playerId: PlayerId): number {
  const uses = state.abilityUses;
  if (!uses) return 0;
  let total = 0;
  for (const [key, count] of Object.entries(uses)) {
    const instanceId = key.slice(0, key.lastIndexOf(':'));
    if (state.cards[instanceId]?.controllerId === playerId) total += count;
  }
  return total;
}

/**
 * Would paying for this cost the bot something it would rather keep?
 *
 * Sacrificing and discarding are refused outright rather than weighed. Judging
 * whether this creature is worth that effect needs a plan for the board, and
 * `bot.ts` deliberately has none; a bot that fed its team to a sacrifice outlet
 * every turn would look far more broken than one that never used the outlet,
 * and only one of those two mistakes is quiet.
 *
 * Sacrificing the SOURCE is allowed, because that is the card spending itself
 * and there is nothing to weigh.
 */
function willingToPay(state: GameState, playerId: PlayerId, option: AbilityCandidate): boolean {
  const player = getPlayer(state, playerId);
  if (!player) return false;

  for (const cost of option.costs) {
    if (cost.pay === 'sacrifice') {
      // `{sel:'self'}` is "sacrifice this"; anything wider names other cards.
      if (cost.what.sel !== 'self') return false;
    }
    if (cost.pay === 'discard' || cost.pay === 'exile' || cost.pay === 'return-to-hand') return false;
    if (cost.pay === 'tap-others') return false;
    // Paying life is fine while there is life to spare. The exact amount is the
    // planner's problem; this is only about whether the bot wants to be in that
    // business at all at this life total.
    if (cost.pay === 'life' && player.life <= 15) return false;
  }
  return true;
}

/** What `activatablePermanents` hands back, narrowed to what this file reads. */
type AbilityCandidate = ReturnType<typeof activatablePermanents>[number]['options'][number];

/**
 * The bot's answer to a decision the engine refused to take.
 *
 * Targets go at an opponent where an opponent is on offer: their seat first,
 * then a permanent they control. Pointing an ability at its own controller's
 * board when it could have gone the other way is occasionally right and usually
 * a misplay, and the bot has no way to tell the two apart.
 *
 * ## When every candidate is the bot's own permanent
 *
 * Then the CARD has already decided whose board this is about, and declining is
 * not caution, it is the bot refusing to use an ability that was only ever
 * going to point at its own team. That is what left equip unused: "Attach this
 * permanent to target creature you control" (CR 702.6a) offers nothing but the
 * bot's own creatures, so the old rule declined every equip ability on the
 * board and the sword sat there. The owner reported the same shape from the
 * other side, watching a bot with a board full of permanents that could act
 * trigger none of them.
 *
 * It is still a policy and it is still not free: a "destroy target creature you
 * control" would be answered rather than declined. Such abilities exist and are
 * rare, and the failure is loud and on the bot's own board, which is the right
 * direction for a mistake this file cannot avoid making one way or the other.
 *
 * A cost choice is declined outright, for the reason `willingToPay` gives.
 */
function botChoice(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  choice: PendingChoice
): StackTarget | InstanceId[] | number[] | null {
  if (choice.kind === 'cost') return null;

  /*
   * A MODE, answered by taking the card's own first option.
   *
   * That is a policy and a weak one, and it is the right weak one here. Nearly
   * every modal ability the bot can reach is a mana ability — "{T}: Add {R} or
   * {G}", "Add one mana of any color" — where the bot has no way to know which
   * colour it will want and any pick is as good as any other. Declining instead
   * would put the bot back where it was before this tranche, with a Talisman on
   * the board it can never tap.
   *
   * The cost of being wrong is one mana of the wrong colour, gone at the end of
   * the step. Compare the cost of being wrong on a `cost` choice, which is a
   * permanent sacrificed, and which this function still declines outright.
   */
  if (choice.kind === 'mode') {
    const modes = choice.modes ?? [];
    if (modes.length === 0) return null;
    return modes.slice(0, Math.max(1, choice.min)).map(mode => mode.index);
  }

  const opponentSeat = choice.playerIds.find(id => id !== playerId);
  if (opponentSeat) return { kind: 'player', playerId: opponentSeat };

  const theirs = choice.instanceIds.find(id => state.cards[id]?.controllerId !== playerId);

  /*
   * Anything already carrying this attachment is taken out of the running
   * first. Equipping a sword to the creature it is already on is legal, costs
   * the mana again and moves nothing, so a bot that kept choosing the biggest
   * creature would pay for the same equip every turn for the rest of the game.
   */
  const usable = choice.instanceIds.filter(id => state.cards[source.instanceId]?.attachedTo !== id);
  const chosen = theirs ?? bestOwnHost(state, playerId, usable) ?? bestOwnHost(state, playerId, choice.instanceIds);
  if (!chosen) return null;

  const card = state.cards[chosen];
  return {
    kind: 'card',
    instanceId: chosen,
    zone: card?.zone,
    zoneChangeCounter: card?.zoneChangeCounter ?? 0,
  };
}

/**
 * One ability worth using, planned and ready to dispatch, or null.
 *
 * Board order, then the card's own ability order. No scoring: ranking effects
 * against each other needs a model of what the board is for, and inventing one
 * here would be the "plausible rather than strong" line crossed in the
 * direction that produces confident nonsense.
 */
function chooseActivation(
  state: GameState,
  playerId: PlayerId,
  at: number
): { card: CardInstance; option: AbilityCandidate; actions: GameAction[] } | null {
  if (activationsThisTurn(state, playerId) >= MAX_ACTIVATIONS_PER_TURN) return null;

  for (const entry of activatablePermanents(state, playerId, { at })) {
    for (const option of entry.options) {
      if (!willingToPay(state, playerId, option)) continue;

      const plan = planActivationWith(
        state,
        playerId,
        entry.card.instanceId,
        option.abilityId,
        choice => botChoice(state, playerId, entry.card, choice),
        { at }
      );
      if (plan.ok) return { card: entry.card, option, actions: plan.actions };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Priority                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What the bot does while something is on the stack.
 *
 * Only two answers, and both are real moves rather than a shrug: counter it, or
 * pass. Countering is offered when the top of the stack belongs to somebody
 * else, the bot is holding a card whose text says it counters a spell, and it
 * can pay for it out of untapped permanents. `responseOptions` answers all
 * three at once and puts counters first, so this takes the head of the list.
 *
 * The bot does not respond to its own spell. Holding priority to stack a second
 * effect on your own first one is a real Magic play and it is not modelled
 * here; a bot that did it would need a plan for what the two spells are doing
 * together, and it does not have one.
 */
function priorityMove(state: GameState, playerId: PlayerId, options: BotOptions): BotMove | null {
  const at = options.at ?? 0;
  if (!hasPriority(state, playerId)) return null;

  const answering = spellToAnswer(state, playerId);
  if (answering) {
    const counter = responseOptions(state, playerId).find(option => option.counters);
    if (counter) {
      const plan = planCastFromHand(state, playerId, counter.card.instanceId, {
        at,
        viaStack: true,
        counterStackId: answering.stackId,
      });
      if (plan.ok) {
        return {
          actions: plan.actions,
          note: `Counters ${answering.name} with ${counter.card.name}.`,
        };
      }
    }
  }

  return { actions: [{ type: 'PASS_PRIORITY', playerId, at }], note: 'Passes priority.' };
}

/**
 * Living opponents, easiest first.
 *
 * Ranking on life alone makes every bot in a pod pile onto the same seat and
 * leaves a third player untouched at 40 for the whole game — which is not how
 * anyone plays. Defence counts too: an open board is a better target than a
 * lower life total behind three untapped blockers.
 */
function attackTargets(state: GameState, playerId: PlayerId) {
  const openness = (opponentId: PlayerId): number =>
    eligibleBlockers(state, opponentId).reduce(
      (sum, blocker) => sum + 2 + combatToughnessIn(state, blocker),
      0
    );

  return livingPlayers(state)
    .filter(p => p.id !== playerId)
    .map(p => ({ player: p, score: p.life + openness(p.id) }))
    .sort((a, b) => a.score - b.score || a.player.seat - b.player.seat)
    .map(entry => entry.player);
}

/**
 * Would attacking with this creature be a mistake? A creature is held back when
 * a defender can block it, kill it, and live — unless the swing is lethal or the
 * bot is far enough ahead on board that trades are fine.
 */
function shouldAttackWith(
  state: GameState,
  attacker: CardInstance,
  defenders: CardInstance[],
  aggression: BotOptions['aggression'],
  lethalSwing: boolean,
  boardAdvantage: boolean
): boolean {
  const power = combatPowerIn(state, attacker);
  const toughness = combatToughnessIn(state, attacker);
  if (power <= 0) return false;
  if (lethalSwing) return true;

  const relevant = defenders.filter(defender => canBlock(state, attacker, defender));
  if (relevant.length === 0) return true;

  const killsMeAndLives = relevant.some(
    defender =>
      combatPowerIn(state, defender) >= toughness &&
      combatToughnessIn(state, defender) > power
  );
  const iKillIt = relevant.some(
    defender => power >= combatToughnessIn(state, defender)
  );

  if (aggression === 'aggressive') return !killsMeAndLives || boardAdvantage;
  if (aggression === 'timid') return !killsMeAndLives && iKillIt;
  return !killsMeAndLives || (boardAdvantage && iKillIt);
}

/* -------------------------------------------------------------------------- */
/* CR 903.9a — where a dead commander goes                                    */
/* -------------------------------------------------------------------------- */

/**
 * Take the commander back, one at a time.
 *
 * The rule is a *may*, and `commanderZoneOffers` refuses to answer it for
 * anybody. So this file answers it, which is the right place: a policy is what
 * a bot is, and this policy is written down rather than buried in the engine
 * where a human seat would inherit it silently.
 *
 * The policy is "always", and the reason is that the alternative needs
 * knowledge this bot does not have. Leaving a commander in a graveyard is
 * correct only for a deck built to bring it back from there, and nothing here
 * reads a decklist's intent. The cost of guessing wrong in the other direction
 * is one commander that is castable instead of one that is not, which is the
 * cheaper mistake by a wide margin.
 *
 * One offer per move so the surface redraws between them, the same as every
 * other decision this file makes.
 */
function chooseCommanderZone(state: GameState, playerId: PlayerId, at: number): BotMove | null {
  const [offer] = commanderZoneOffers(state, playerId);
  if (!offer) return null;
  return {
    actions: offer.actions.map(action => ({ ...action, at })),
    note:
      `Puts ${offer.name} into the command zone from the ${offer.from}. ` +
      `Recasting it costs ${offer.nextCastMana}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* The active turn                                                            */
/* -------------------------------------------------------------------------- */

function activeMove(state: GameState, playerId: PlayerId, options: BotOptions): BotMove | null {
  const at = options.at ?? 0;
  const aggression = options.aggression ?? 'normal';
  const advance = (note: string): BotMove => ({ actions: advanceActions(state, at), note });

  switch (state.step) {
    case 'untap':
      return advance('Untaps.');
    case 'upkeep':
      return advance('Upkeep.');
    case 'draw':
      return advance('Draws for turn.');

    case 'precombat_main':
    case 'postcombat_main': {
      const player = getPlayer(state, playerId);
      if (!player) return null;

      /*
       * CR 903.9a, first, before anything else this turn.
       *
       * First because it costs nothing and because a commander back in the
       * command zone is a card `chooseSpell` can see three lines below — so the
       * bot can lose its commander and recast it in the same turn, which is
       * what makes commander tax something that happens in a game rather than
       * something the reducer merely supports. Measured before: 24 commanders
       * died over 80 games, none came back, and tax was charged 0 times.
       */
      const recovery = chooseCommanderZone(state, playerId, at);
      if (recovery) return recovery;

      if (state.step === 'precombat_main' && player.landsPlayedThisTurn === 0) {
        const land = chooseLand(state, playerId);
        if (land) {
          const plan = planLandDrop(state, playerId, land.instanceId, { at });
          if (plan.ok) return { actions: plan.actions, note: `Plays ${land.name}.` };
        }
      }

      const spell = chooseSpell(state, playerId, at, options.useStack);
      if (spell) {
        const mana = manaSourcesFor(state, playerId).length;
        return {
          actions: spell.actions,
          note: `Casts ${spell.card.name} (${mana} untapped before).`,
        };
      }

      /*
       * Abilities AFTER the curve, deliberately. Mana spent on an ability is
       * mana not spent developing the board, and a bot that fired a Rod of Ruin
       * before playing its four-drop would be making the mistake every new
       * player makes. It also means the mana this ability taps is mana nothing
       * else wanted this turn.
       */
      const activation = chooseActivation(state, playerId, at);
      if (activation) {
        return {
          actions: activation.actions,
          note: `Uses ${activation.card.name}: ${activation.option.text}`,
        };
      }

      return advance(state.step === 'precombat_main' ? 'Moves to combat.' : 'Ends the turn.');
    }

    case 'begin_combat':
      return advance('Begins combat.');

    case 'declare_attackers': {
      /*
       * An attack that has already been declared is never declared again.
       *
       * `eligibleAttackers` answers "could this creature be declared", and a
       * creature with vigilance does not tap when it attacks — so it is still
       * an eligible attacker the instant after it was declared as one. Without
       * this guard the bot re-declared the same creature forever: each pass
       * replaced `combat.attackers` with an identical list, nothing about the
       * state changed, and any table where a bot controlled a vigilance
       * creature locked the tab in a hot loop. Found by playing a real game —
       * Syr Vondam, Sunstar Exemplar has vigilance and it hung on turn 6.
       */
      if (state.combat.attackers.length > 0) return advance('Attackers are declared.');

      const targets = attackTargets(state, playerId);
      if (targets.length === 0) return advance('Nobody left to attack.');

      const target = targets[0];
      /* Declared attackers are filtered out for the same reason. */
      const declared = new Set(state.combat.attackers.map(d => d.attackerId));
      const available = eligibleAttackers(state, playerId).filter(
        card => !declared.has(card.instanceId)
      );
      if (available.length === 0) return advance('No attackers.');

      const defenders = eligibleBlockers(state, target.id);
      const totalPower = available.reduce((sum, card) => sum + combatPowerIn(state, card), 0);
      const lethalSwing = totalPower >= target.life && defenders.length === 0;
      const boardAdvantage = available.length > defenders.length + 1;

      const attacking = available.filter(card =>
        shouldAttackWith(state, card, defenders, aggression, lethalSwing, boardAdvantage)
      );

      if (attacking.length === 0) return advance('Holds back this turn.');

      return {
        actions: declareAttack(
          state,
          attacking.map(card => ({ attackerId: card.instanceId, defenderPlayerId: target.id })),
          at
        ),
        note: `Attacks ${target.name} with ${attacking.length} creature${attacking.length === 1 ? '' : 's'}.`,
      };
    }

    case 'declare_blockers': {
      // The attacking player does not block — but it must not steamroll a human
      // defender's decision either. Returning null hands control back to the UI.
      const waiting = options.waitForPlayerIds ?? [];
      const humanDefenderPending = state.combat.attackers.some(
        declaration =>
          declaration.defenderPlayerId &&
          waiting.indexOf(declaration.defenderPlayerId) !== -1
      );
      if (humanDefenderPending) return null;
      return advance('Waits for blocks.');
    }

    case 'combat_damage':
      return advance('Combat damage.');

    case 'end_combat':
      return advance('Combat ends.');

    case 'end':
      return advance('End step.');

    case 'cleanup':
      return advance('Passes the turn.');

    default:
      return advance('Continues.');
  }
}

/* -------------------------------------------------------------------------- */
/* Responding on someone else's turn                                          */
/* -------------------------------------------------------------------------- */

/**
 * Blocks. Priorities, in order: survive lethal by chumping, take a block that
 * kills the attacker and lives, then trade when the attacker is the bigger
 * investment. Everything else is let through.
 */
function blockMove(state: GameState, playerId: PlayerId, options: BotOptions): BotMove | null {
  const at = options.at ?? 0;
  const player = getPlayer(state, playerId);
  if (!player || !isAlive(player)) return null;

  const incoming = state.combat.attackers.filter(
    declaration => declaration.defenderPlayerId === playerId && declaration.blockedBy.length === 0
  );
  if (incoming.length === 0) return null;

  const attackers = incoming
    .map(declaration => state.cards[declaration.attackerId])
    .filter(Boolean)
    .sort((a, b) => combatPowerIn(state, b) - combatPowerIn(state, a));

  const incomingDamage = attackers.reduce((sum, card) => sum + combatPowerIn(state, card), 0);
  const facingDeath = incomingDamage >= player.life;

  // A creature already assigned to a block stays assigned. Blocking does not
  // tap, so without this the bot would happily block twice with one body every
  // time the surface asked it for a decision again.
  const alreadyBlocking = new Set<string>();
  for (const declaration of state.combat.attackers) {
    for (const id of declaration.blockedBy) alreadyBlocking.add(id);
  }

  const availableBlockers = eligibleBlockers(state, playerId).filter(
    card => !alreadyBlocking.has(card.instanceId)
  );
  const used = new Set<string>();
  const blocks: Array<{ blockerId: string; attackerId: string }> = [];

  for (const attacker of attackers) {
    const candidates = availableBlockers.filter(
      blocker => !used.has(blocker.instanceId) && canBlock(state, attacker, blocker)
    );
    if (candidates.length === 0) continue;

    const kind = (blocker: CardInstance) => {
      const kills =
        combatPowerIn(state, blocker) >= combatToughnessIn(state, attacker) ||
        hasKeywordIn(state, blocker, 'deathtouch');
      const survives = combatToughnessIn(state, blocker) > combatPowerIn(state, attacker);
      if (kills && survives) return 3; // clean block
      if (kills) return 2; // trade
      if (survives) return 1; // wall
      return 0; // chump
    };

    const ranked = candidates.slice().sort((a, b) => {
      const byKind = kind(b) - kind(a);
      if (byKind !== 0) return byKind;
      // Among equals, spend the cheapest creature.
      return (a.cmc ?? 0) - (b.cmc ?? 0);
    });

    /*
     * Menace is a property of the whole block, not of one blocker, so the
     * group has to be assembled before it can be judged legal.
     * `blockersRequiredFor` is two for a menacing attacker and one otherwise;
     * `validateBlockGroup` is the authority and is asked before the block is
     * proposed. Without this the bot happily put one creature in front of a
     * menacing attacker and the reducer took it — which is how Syr Vondam,
     * Sunstar Exemplar (vigilance, menace) got chump-blocked by a single body
     * in a real test game.
     */
    const required = blockersRequiredFor(state, attacker);
    if (ranked.length < required) continue;

    const group = ranked.slice(0, required);
    const legality = validateBlockGroup(state, attacker, group);
    if (!legality.ok) continue;

    const best = group[0];
    const quality = kind(best);
    const attackerValue = attacker.cmc ?? 0;
    // Menace costs a second body, so the block has to be worth both of them.
    const blockerValue = group.reduce((sum, blocker) => sum + (blocker.cmc ?? 0), 0);

    const worthIt =
      quality === 3 ||
      quality === 1 ||
      (quality === 2 && attackerValue >= blockerValue) ||
      (quality === 0 && facingDeath);

    if (!worthIt) continue;

    for (const blocker of group) {
      used.add(blocker.instanceId);
      blocks.push({ blockerId: blocker.instanceId, attackerId: attacker.instanceId });
    }
  }

  if (blocks.length === 0) return null;

  return {
    actions: [{ type: 'BLOCK', blocks, at }],
    note: `Blocks with ${blocks.length} creature${blocks.length === 1 ? '' : 's'}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The bot's next decision, or null when it has nothing to do and the surface
 * should hand control back. Call it on a timer while a bot seat is active, or
 * whenever the step changes to `declare_blockers` for a bot defender.
 */
export function nextBotMove(
  state: GameState,
  playerId: PlayerId,
  options: BotOptions = {}
): BotMove | null {
  if (state.status !== 'playing') return null;
  const player = getPlayer(state, playerId);
  if (!player || !isAlive(player)) return null;

  /*
   * A non-empty stack outranks everything.
   *
   * Nothing else may happen while a spell is waiting: not a land drop, not
   * another cast, not a step change. Checked before the turn test because
   * priority is the one thing that passes round the table regardless of whose
   * turn it is — which is exactly what makes an instant an instant.
   *
   * Returning null when this bot does not hold priority is what hands control
   * back to the surface so the human can answer.
   */
  if (stackOf(state).length > 0) return priorityMove(state, playerId, options);

  if (state.activePlayerId === playerId) return activeMove(state, playerId, options);
  if (state.step === 'declare_blockers') return blockMove(state, playerId, options);
  return null;
}

/**
 * Bot seats with something to do right now, in seat order. The surface ticks
 * through this list; when it is empty the humans are holding the game up.
 */
export function botsAwaitingMove(
  state: GameState,
  botPlayerIds: readonly PlayerId[],
  options: BotOptions = {}
): PlayerId[] {
  return botPlayerIds.filter(id => nextBotMove(state, id, options) !== null);
}
