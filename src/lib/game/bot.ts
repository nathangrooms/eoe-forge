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
import type { CardInstance, GameAction, GameState, PlayerId } from './types.ts';

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
  at: number
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
    const plan = planCastFromHand(state, playerId, card.instanceId, { at });
    if (plan.ok) return { card, actions: plan.actions };
  }
  return null;
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

      if (state.step === 'precombat_main' && player.landsPlayedThisTurn === 0) {
        const land = chooseLand(state, playerId);
        if (land) {
          const plan = planLandDrop(state, playerId, land.instanceId, { at });
          if (plan.ok) return { actions: plan.actions, note: `Plays ${land.name}.` };
        }
      }

      const spell = chooseSpell(state, playerId, at);
      if (spell) {
        const mana = manaSourcesFor(state, playerId).length;
        return {
          actions: spell.actions,
          note: `Casts ${spell.card.name} (${mana} untapped before).`,
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
