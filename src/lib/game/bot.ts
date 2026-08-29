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
  lanesNeedingDamageOrder,
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
import {
  castingCostOf,
  isLand,
  isPermanent,
  manaSourcesFor,
  planPayment,
  type ManaSource,
  type PaymentPlan,
} from './mana.ts';
import { advanceActions, planCastFromHand, planLandDrop, declareAttack } from './moves.ts';
// One asker for a spell's targets, reusing `activate.ts`'s legality rules. See
// the "What a spell is FOR" section for the policy that drives it.
import { planCastWith, spellAbilitiesOf } from './cast-targets.ts';
import { auraNeedsHost, legalHostsFor } from './attach.ts';
// CR 903.9a. The bot answers the same offer a human seat is shown, built by the
// same function, so a bot deck and a player's deck lose a commander the same way.
import { commanderZoneOffers } from './commander.ts';
import { staticAbilitiesOf } from './abilities/card-abilities.ts';
import { hasPriority, stackOf } from './stack.ts';
import {
  counterCanTarget,
  countersSpells,
  isInstantSpeed,
  responseOptions,
  spellToAnswer,
} from './respond.ts';
// The bot activates abilities through the identical planner a human click goes
// through. It gets no private route onto the stack, which is the property that
// makes a bot seat and a human seat the same thing to everything downstream.
import { activatablePermanents, planActivationWith, type PendingChoice } from './activate.ts';
// CR 603.3d — the other half of the same seam. `answerTriggerTargets` runs the
// ask-and-answer loop with this file's policy injected, the exact twin of
// `planCastWith` above, so a bot cannot drift into its own idea of a legal
// target for a trigger.
import { answerTriggerTargets, triggerAwaitingTargets } from './announce.ts';
import type { Effect } from '../cards/abilities/dsl.ts';
import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PendingTrigger,
  PlayerId,
  StackTarget,
} from './types.ts';

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
   * ON BY DEFAULT, and that is the change this option exists to record. Off is
   * what made a bot's spell something nobody at the table could answer:
   * `planCastFromHand` takes its non-stack branch, the card goes straight from
   * hand to the battlefield or the graveyard, and there is never a moment at
   * which it is an object. A counterspell has nothing to be cast at, an instant
   * has no window, and the priority round is skipped entirely. Twenty recorded
   * games with it off put 3 spells on the stack; the same twenty seeds with it
   * on put 872.
   *
   * With it on the bot casts through the stack, holds a real priority round,
   * passes when it has no answer, and counters an opponent's spell when it is
   * holding one it can pay for.
   *
   * Lands are NOT affected. `planLandDrop` builds a `PLAY` and never comes
   * through the cast planner, which is CR 305.1: a land is put onto the
   * battlefield without using the stack and cannot be responded to. Mana
   * abilities are not affected either. CR 605.3a keeps them off the stack and
   * `activate.ts` already resolves one inline.
   *
   * Pass `false` for the old immediate cast. `/simulate` does, through
   * `usePlayGame`, because a spell left on a stack whose priority round nobody
   * runs is a hung game rather than a more correct one, and that surface has a
   * human seat which is never asked to pass. Every seat in the playtest harness
   * is a bot and a bot always passes, so the round always completes there.
   */
  useStack?: boolean;
  /**
   * DOES THIS SEAT CAST INSTANTS AND SORCERIES.
   *
   * `'all'` is the default and it is the policy the "What a spell is FOR"
   * section of this file describes. `'permanents-only'` is the behaviour from
   * before that policy existed, when `chooseSpell` filtered its candidates with
   * `isPermanent` and every instant and sorcery in a bot deck was a dead card.
   *
   * The old behaviour is kept, named, for ONE reason: it is the control arm.
   * "Instants cast rose from 3 to 113" is a measure of louder, not of better,
   * and a bot with all access and no judgement moves that number exactly as far
   * as a bot that plays well. The only way to tell the two apart is to sit them
   * at the same table and count who wins, which is what
   * `scripts/playtest/run.ts --ab` does with this option.
   *
   * It is not a difficulty setting and should not become one. If the A/B run
   * ever says `'permanents-only'` is stronger, the answer is to fix the policy,
   * not to ship the switch.
   */
  castingPolicy?: 'all' | 'permanents-only';
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

/**
 * Rough "is this worth casting" score: bodies first, then anything permanent,
 * then a sorcery or a non-answer instant.
 *
 * The last band is where an instant or a sorcery now lands, and its position is
 * the policy: DEVELOP THE BOARD FIRST. A four-drop creature and a Divination
 * both cost four, and the creature is the one that is still there next turn. So
 * a `now` spell is cast out of what is left over rather than instead of the
 * curve, which is also why the counterspell reserve almost never has to argue
 * with one.
 */
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

/* -------------------------------------------------------------------------- */
/* What a spell is FOR — the policy this whole tranche is                     */
/* -------------------------------------------------------------------------- */

/**
 * The four things a card in hand can be, and the whole instant policy in one
 * type.
 *
 * ## Why this exists
 *
 * `chooseSpell` used to read `.filter(card => isPermanent(card))`. Twenty
 * recorded commander games measured the cost: 650 instants and sorceries were
 * dealt into eighty decks, 125 of them reached a hand, and **3 were ever cast**
 * — all three counterspells, all three from the one branch elsewhere in this
 * file that already knew how. Every other instant and every sorcery in every
 * bot deck was a dead card.
 *
 * Taking the filter out is one line and it is not the work. Teaching a bot to
 * cast instants means teaching it WHEN, because an instant cast in your own
 * main phase for no reason is a sorcery you paid a premium for. So each card
 * gets a role and each role gets a window:
 *
 * | role | what it is | when it is cast |
 * |---|---|---|
 * | `permanent` | a creature, a rock, a land's worth of board | main phase, as before |
 * | `now` | a sorcery, or an instant that answers nothing — a draw spell, ramp, a tutor | main phase, after the permanents |
 * | `answer` | an instant whose text harms what it points at | held, and spent at one of the two moments below |
 * | `counter` | an instant that counters a spell | held, and only ever cast at somebody else's spell |
 *
 * The distinction between `answer` and `now` is the one the owner's "smart
 * play" turns on, and it is read off the card's own compiled effects rather
 * than a name list: see `spellPunishes`.
 */
type SpellRole = 'permanent' | 'now' | 'answer' | 'counter';

function spellRole(card: CardInstance): SpellRole {
  if (isPermanent(card)) return 'permanent';
  if (countersSpells(card)) return 'counter';
  if (isInstantSpeed(card) && spellPunishes(card)) return 'answer';
  return 'now';
}

/** Every `{do: ...}` node in an effect tree, modal and conditional branches included. */
function walkEffects(node: unknown, visit: (effect: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const entry of node) walkEffects(entry, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.do === 'string') visit(record);
  for (const value of Object.values(record)) walkEffects(value, visit);
}

/** Does any part of this effect node point at something the caster chose? */
function mentionsTarget(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(mentionsTarget);
  if (!node || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.sel === 'target') return true;
  return Object.values(record).some(mentionsTarget);
}

/** A `ValueExpr` that is a plain number, or 0. Enough to read a sign off. */
function flatNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * Does this spell HARM the thing it is pointed at?
 *
 * The same question `auraPunishes` asks of an Aura, asked of an instant, and
 * for the same reason: the card has to decide whose board it is about, because
 * nothing else in this file can. A removal spell aimed at the bot's own best
 * creature is the single most embarrassing thing a bot can do, and it is what
 * happens by default — `botChoice` prefers "an opponent" and falls back to the
 * bot's own board when no opponent is on offer, which is right for an equip
 * ability and catastrophic for a Doom Blade.
 *
 * Read off the compiled `kind: 'spell'` effects, so it is the card's own text
 * answering. A verb that harms, aimed at something the caster chose, makes the
 * spell an answer.
 *
 * Deliberately narrow, exactly as `auraPunishes` is. It says nothing about a
 * spell whose harm the compiler did not model, and such a spell is treated as
 * beneficial and pointed at the bot's own board. The cost of that mistake is
 * one wasted card on the bot's own side, which is loud and visible; the cost of
 * the opposite mistake is a bot handing an opponent a free Giant Growth, which
 * is quiet. Narrow and wrong-in-the-loud-direction is the choice made here.
 */
const HARMS_ITS_TARGET = new Set([
  'destroy',
  'exile',
  'damage',
  'counter',
  'tap',
  'sacrifice',
  'mill',
  'discard',
  'lose-life',
  'gain-control',
  'poison',
]);

/**
 * Does this effect tree do something UNPLEASANT to the thing it names?
 *
 * Lifted out of `spellPunishes` on 23 Aug 2026 so a TRIGGERED ability can ask
 * the identical question. A trigger's targets are announced through the same
 * `chooseTargetsFor` a spell's are, so which way to point them has to be read
 * the same way too: two copies of "is this removal" is exactly how a bot ends
 * up aiming Angel of Despair at its own board and its Doom Blade at nothing.
 */
function punishesItsTarget(effects: readonly Effect[]): boolean {
  let harmful = false;
  walkEffects(effects, node => {
    if (harmful) return;
    if (!mentionsTarget(node)) return;
    const verb = node.do as string;
    if (HARMS_ITS_TARGET.has(verb)) harmful = true;
    // "Target creature gets -3/-3" is removal; the same node with +3/+3 is a
    // combat trick for the bot's own creature. Only the sign separates them.
    if (verb === 'pump' && (flatNumber(node.power) < 0 || flatNumber(node.toughness) < 0)) {
      harmful = true;
    }
    if (verb === 'add-counters' && String(node.counter ?? '').startsWith('-')) harmful = true;
    // Anywhere but the battlefield is a bounce, a tuck or a bin.
    if (verb === 'move-zone' && node.to !== 'battlefield') harmful = true;
  });
  return harmful;
}

function spellPunishes(card: CardInstance): boolean {
  return spellAbilitiesOf(card).some(ability => punishesItsTarget(ability.effects));
}

/* -------------------------------------------------------------------------- */
/* WHAT THE BOT WILL NOT THROW AWAY                                           */
/* -------------------------------------------------------------------------- */

/**
 * CAN THE ENGINE ACTUALLY RUN THIS SPELL, or would casting it bin the card?
 *
 * ## The measurement this exists for
 *
 * The pass that taught the bot to cast instants and sorceries was checked by
 * counting casts, and casts went from 3 to 113 over twenty games. Replaying
 * those same twenty games and reading what the engine DID at each resolution
 * gives a different number: **72 of the 113 resolved having changed nothing at
 * all**, printed a note saying so, and went to the graveyard. Broken down by
 * the compiled text rather than by the outcome:
 *
 *   65 of 113 were cards with no `kind: 'spell'` ability at all — 63 of those
 *      65 did nothing, and the other two only looked busy because something
 *      else resolved in the same batch
 *    4 more compiled to nothing but `manual` and `choose-mode`, and a mode is a
 *      decision no surface makes, so none of its branches ever runs
 *   44 had a verb the engine runs, and 39 of those 44 did real work
 *
 * A card the engine cannot run is a dead card in hand and a dead card is worth
 * exactly nothing. Casting it is worse than nothing: it spends the mana, it
 * spends the card, and it produces the event this project's own law calls a
 * serious bug — a spell that resolves and does nothing. It also lengthens
 * games, which is where the one seed in fifty that stopped finishing came from.
 *
 * So the bot holds it. This is not the coverage gap being hidden: 227 of the
 * 498 distinct instants and sorceries in these eighty decks compile to nothing
 * runnable, that number is unchanged, and `stack-census.ts` still reports it.
 * What changes is that the gap stays a gap instead of being converted into
 * wasted cards.
 *
 * A PERMANENT is not asked this question. A creature with no compiled text is
 * still a body that blocks and attacks, so it is worth casting whatever the
 * compiler made of its rules box; an instant with no compiled text is only its
 * rules box.
 */
function engineCanRunSpell(card: CardInstance): boolean {
  for (const ability of spellAbilitiesOf(card)) {
    const effects = Array.isArray(ability.effects) ? ability.effects : [ability.effects];
    for (const effect of effects) {
      const verb = (effect as { do?: unknown } | null)?.do;
      if (typeof verb !== 'string') continue;
      /* `manual` is the compiler saying "a person has to do this". `choose-mode`
         is a decision `planCastFromHand` has no field to carry, stated at the
         top of `cast-targets.ts`, so a modal spell resolves on none of its
         modes. Neither is text the engine runs. */
      if (verb === 'manual' || verb === 'choose-mode') continue;
      return true;
    }
  }
  return false;
}

/**
 * Does this card print a cost the engine will not charge for it?
 *
 * CR 601.2f–h: an additional cost is paid as the spell is cast, and it is not
 * optional. `planCastFromHand` prices the mana cost and nothing else, and says
 * so at `mana.ts`. So a bot casting one of these plays a card that does not
 * exist: measured over the twenty recorded games, six casts skipped a printed
 * cost, including Wicked Reward's "sacrifice a creature" for a free +4/+2 and
 * Wild Guess's "discard a card" for two free cards.
 *
 * Text matching, and honest about being that, exactly as `countersSpells` is.
 * The compiler already classifies this phrase as an `alt-cast` gap, so the two
 * agree about which cards they are; this is the same question asked where a
 * decision is made.
 *
 * KICKER, AWAKEN AND OVERLOAD ARE NOT THIS. They are optional extra costs a
 * caster may decline, and declining them is a legal way to cast the card, so
 * the bot casting the cheap mode is playing the card as printed.
 */
function costsMoreThanTheEngineCharges(card: CardInstance): boolean {
  return /as an additional cost to cast/i.test(card.oracleText ?? '');
}

/**
 * WOULD THIS ANSWER ACTUALLY DEAL WITH THAT CREATURE?
 *
 * `spellPunishes` asks whether a spell harms what it points at. It says nothing
 * about whether the harm is enough, and the gap was measured rather than
 * guessed: in seed 9003 the bot cast Moment of Craving, "target creature gets
 * -2/-2 until end of turn", at a 3/3 in its OWN precombat main because the 3/3
 * outclassed its board. The creature became a 1/1 until end of turn and was a
 * 3/3 again before it ever attacked. A card and two mana for nothing.
 *
 * So in the window where the creature is standing on the battlefield doing
 * nothing yet, the answer has to REMOVE it: destroy, exile, bounce, tuck, steal
 * it, or put enough damage or enough minus on it to kill it outright.
 *
 * The declare-blockers window asks a weaker question and gets it from the
 * caller, because there a shrink is not nothing: three damage off a 5/4
 * attacker is three life this seat keeps.
 *
 * Deliberately narrow, in the same direction as `spellPunishes`: harm the
 * compiler did not model reads as "does not remove", so the card is held rather
 * than spent. Holding a removal spell one turn too long costs a turn; spending
 * it on a creature it cannot kill costs the card.
 */
function answerRemoves(state: GameState, card: CardInstance, victim: CardInstance): boolean {
  const toughness = combatToughnessIn(state, victim);
  let removes = false;

  for (const ability of spellAbilitiesOf(card)) {
    walkEffects(ability.effects, node => {
      if (removes) return;
      if (!mentionsTarget(node)) return;
      const verb = node.do as string;
      if (verb === 'destroy' || verb === 'exile' || verb === 'sacrifice' || verb === 'gain-control') {
        removes = true;
        return;
      }
      // Anywhere off the battlefield is gone: a bounce, a tuck or a bin.
      if (verb === 'move-zone' && node.to !== 'battlefield') {
        removes = true;
        return;
      }
      if (verb === 'damage' && flatNumber(node.amount) >= toughness && toughness > 0) removes = true;
      if (verb === 'pump' && -flatNumber(node.toughness) >= toughness) removes = true;
    });
    if (removes) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Holding mana open                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What is left to tap after a payment has been planned out of `sources`.
 *
 * `planPayment` is pure over a source list, so "could I still pay for X after
 * casting Y" is answerable exactly rather than by counting lands. One entry is
 * removed per tapped permanent and one pool unit per colour spent, which is
 * precisely what `paymentActions` will emit.
 */
function sourcesLeftAfter(sources: readonly ManaSource[], payment: PaymentPlan): ManaSource[] {
  const tapped = new Set(payment.tapIds);
  const spent = [...payment.spend];
  const left: ManaSource[] = [];
  for (const source of sources) {
    if (tapped.has(source.instanceId)) {
      tapped.delete(source.instanceId);
      continue;
    }
    if (source.poolColor) {
      const index = spent.indexOf(source.poolColor);
      if (index !== -1) {
        spent.splice(index, 1);
        continue;
      }
    }
    left.push(source);
  }
  return left;
}

/**
 * THE MANA THIS SEAT WILL NOT SPEND, and why only a counterspell earns it.
 *
 * A counterspell's entire value is that the mana was open on somebody else's
 * turn. Tap out for a four-drop while holding one and the counterspell is not a
 * card, it is a piece of paper — which is the "all access and no judgement"
 * failure the owner's brief names.
 *
 * REMOVAL DOES NOT EARN THE RESERVE, and that is a decision rather than an
 * oversight. Removal keeps its value when it is cast on this seat's own turn,
 * so holding mana back for it buys nothing; a bot that reserved for every
 * instant in hand would stop developing its board altogether, which is a worse
 * bot by a wide margin than one that occasionally taps out.
 *
 * Returns the cost string to keep open, or null when there is nothing to hold.
 */
function reservedCounterCost(state: GameState, playerId: PlayerId): string | null {
  const sources = manaSourcesFor(state, playerId);
  const held = handCards(state, playerId)
    .filter(card => !isLand(card) && countersSpells(card) && isInstantSpeed(card))
    .filter(card => planPayment(castingCostOf(card), sources).ok)
    .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0));
  const cheapest = held[0];
  return cheapest ? castingCostOf(cheapest) : null;
}

/** Would this payment still leave the reserved counterspell payable? */
function keepsTheReserve(
  sources: readonly ManaSource[],
  payment: PaymentPlan,
  reserve: string | null
): boolean {
  if (!reserve) return true;
  return planPayment(reserve, sourcesLeftAfter(sources, payment)).ok;
}

/* -------------------------------------------------------------------------- */
/* Casting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The best castable thing right now, commander included, or null.
 *
 * `roles` is the window: a main phase asks for `permanent` and `now`, and the
 * answer windows ask for `answer` on their own. A role is never cast outside
 * the window that names it, which is what stops the bot dumping its whole hand
 * in its first main phase.
 *
 * ## Instants and sorceries are only cast when the stack is on
 *
 * `useStack: false` is `/simulate`'s configuration, and on that path
 * `planCastFromHand` builds a bare `PLAY` straight to the resolution zone.
 * `compiledSpellActions` only runs from `stack.ts` at resolution, so an instant
 * cast without the stack moves from hand to graveyard having done NOTHING. A
 * bot allowed to do that would discard its whole hand for no effect, which is
 * strictly worse than the dead card this tranche is removing. So the old
 * behaviour is kept exactly, on purpose, wherever the stack is off.
 */
function chooseSpell(
  state: GameState,
  playerId: PlayerId,
  at: number,
  viaStack = true,
  roles: readonly SpellRole[] = ['permanent'],
  reserve: string | null = null
): { card: CardInstance; actions: GameAction[] } | null {
  const player = getPlayer(state, playerId);
  if (!player) return null;

  const candidates: CardInstance[] = [
    ...handCards(state, playerId).filter(card => !isLand(card)),
    // The commander is a card in a zone like any other; the tax is priced in by
    // `planCastFromHand`, so the bot naturally holds it when it cannot pay.
    ...player.zones.command.map(id => state.cards[id]).filter(Boolean),
  ];

  const sources = manaSourcesFor(state, playerId);

  const ranked = candidates
    .filter(card => {
      const role = spellRole(card);
      if (roles.indexOf(role) === -1) return false;
      // See the doc comment. Nothing but a permanent is cast without the stack.
      if (!viaStack && role !== 'permanent') return false;
      /* An instant or a sorcery IS its rules box, so one the engine cannot run
         is a card thrown away and one whose printed extra cost the engine will
         not charge is a card that does not exist. A permanent is a body either
         way and is asked neither question. See `engineCanRunSpell`. */
      if (role !== 'permanent') {
        if (!engineCanRunSpell(card)) return false;
        if (costsMoreThanTheEngineCharges(card)) return false;
      }
      return true;
    })
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

    /*
     * `planCastWith` rather than `planCastFromHand`, and this is the second
     * half of the tranche. A spell that names a target is announced AT
     * something (CR 601.2c) or it resolves having affected nobody — measured on
     * the eighty decks of the twenty game run, 187 of the 271 runnable instants
     * and sorceries are in that shape. The decider below is this file's policy;
     * the legality is `activate.ts`'s, unchanged and shared with every
     * activated ability.
     *
     * It also gives "a removal spell with no legal target is not cast" for
     * nothing: `chooseTargetsFor` refuses with CR 601.2c's own sentence, the
     * plan comes back not ok, and the loop moves on to the next card.
     */
    const plan = planCastWith(
      state,
      playerId,
      card.instanceId,
      choice => botSpellTarget(state, playerId, card, choice),
      { at, viaStack, ...(hostId ? { hostId } : {}) }
    );
    if (!plan.ok) continue;
    if (!keepsTheReserve(sources, plan.payment, reserve)) continue;
    return { card, actions: plan.actions };
  }
  return null;
}

/**
 * WHERE THE BOT POINTS A SPELL, decided by whether the spell hurts.
 *
 * `botChoice` is this file's answer for an activated ability and it is the
 * wrong answer for a spell: it prefers an opponent and falls back to the bot's
 * own board when no opponent is on offer, which turns "destroy target creature"
 * into a bot destroying its own creature the moment the opponents have none.
 *
 * So the direction is read off the card first, through `spellPunishes`, and
 * then the pick inside that direction is the obvious one:
 *
 *   - A spell that harms goes at the biggest creature an opponent controls. A
 *     creature rather than a face, because a burn spell that kills a blocker
 *     changes a game and three damage to a forty life commander seat does not.
 *     Only if no opposing permanent is legal does it go at an opponent's seat.
 *   - A spell that helps goes at this seat's own biggest creature, or at this
 *     seat. It is NEVER pointed across the table.
 *
 * Declining is a real answer. A harmful spell with nothing but the bot's own
 * board to choose from is not cast at all, which is the whole reason this
 * function exists rather than reusing `botChoice`.
 */
function botSpellTarget(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  choice: PendingChoice
): StackTarget | null {
  if (choice.kind !== 'target') return null;
  return aimByDirection(state, playerId, spellPunishes(card), choice);
}

/**
 * THE PICK, once the direction is known. Shared by a spell and a trigger.
 *
 * Harmful goes at the biggest creature an opponent controls, and at an
 * opponent's seat only when no permanent of theirs is legal. Beneficial goes at
 * this seat's own biggest creature, or at this seat, and is NEVER pointed
 * across the table.
 *
 * `null` means the direction had nothing in it. What that MEANS is the caller's
 * business and the two callers read it oppositely, which is why the decision is
 * theirs and not this function's — see `botTriggerTarget`.
 */
function aimByDirection(
  state: GameState,
  playerId: PlayerId,
  harmful: boolean,
  choice: PendingChoice
): StackTarget | null {
  const theirs = choice.instanceIds.filter(id => state.cards[id]?.controllerId !== playerId);
  const mine = choice.instanceIds.filter(id => state.cards[id]?.controllerId === playerId);

  if (harmful) {
    const opponentSeat = choice.playerIds.find(id => id !== playerId);
    return pickBiggest(state, theirs) ?? (opponentSeat ? { kind: 'player', playerId: opponentSeat } : null);
  }

  const own = choice.playerIds.indexOf(playerId) !== -1 ? playerId : undefined;
  return pickBiggest(state, mine) ?? (own ? { kind: 'player', playerId: own } : null);
}

/** The biggest of these permanents as a `StackTarget`, with CR 400.7's snapshot. */
function pickBiggest(state: GameState, ids: readonly InstanceId[]): StackTarget | null {
  const chosen = bestHostOf(state, ids, () => true);
  if (!chosen) return null;
  const target = state.cards[chosen];
  return {
    kind: 'card',
    instanceId: chosen,
    zone: target?.zone,
    zoneChangeCounter: target?.zoneChangeCounter ?? 0,
  };
}

/**
 * WHERE THE BOT POINTS A TRIGGER, and the one way it differs from a spell.
 *
 * The direction is read off the ability's own compiled effects through the same
 * `punishesItsTarget` a spell uses, so Angel of Despair's "destroy target
 * permanent" goes across the table and Guardian Gladewalker's "+1/+1 counter on
 * target creature" stays home. Nothing about that is new policy.
 *
 * **DECLINING IS NOT AN OPTION HERE, AND THAT IS THE RULE RATHER THAN A
 * CONCESSION TO THE HARNESS.** A spell that has nothing worth pointing at is
 * simply not cast, which is `botSpellTarget` returning null and the cast loop
 * moving on. A trigger has already triggered: CR 603.3d says its controller
 * chooses a legal target, and "I would rather not" is not among the answers. So
 * when the preferred direction is empty the bot takes whatever is legal instead
 * of refusing.
 *
 * It matters beyond correctness. `drainTriggers` HALTS on an unanswered
 * trigger, so a bot that declined would hang its own table — and the failure
 * would be a game that stopped, on a board that looks fine, with nothing in the
 * log saying why. The playtest harness would report it as a stall, which is the
 * right way to find out and the wrong way to ship.
 *
 * The cost of the fallback is a bot occasionally aiming its own removal at its
 * own creature, when the card gave it no other legal choice. That is what the
 * card says to do.
 */
function botTriggerTarget(
  state: GameState,
  playerId: PlayerId,
  trigger: PendingTrigger,
  choice: PendingChoice
): StackTarget | null {
  return botTargetForEffects(state, playerId, trigger.dsl?.effects ?? [], choice);
}

/**
 * The same pick, taken from an EFFECT LIST rather than from a pending trigger.
 *
 * `botTriggerTarget` above is now one line and calls this, so there is one
 * implementation of "which legal target does a bot take" rather than two that
 * can drift. The split exists because `behaviour-probe.ts` has to aim an
 * ability that is on no stack: it holds the compiled effects and there is no
 * `PendingTrigger` to hand it. A probe that answered with a rule of its own
 * would be measuring its own rule, which is the one thing it must not do.
 *
 * Direction is read off the effects by `punishesItsTarget`, exactly as before,
 * and declining is still not an option here for the CR 603.3d reason above.
 */
export function botTargetForEffects(
  state: GameState,
  playerId: PlayerId,
  effects: readonly Effect[],
  choice: PendingChoice
): StackTarget | null {
  if (choice.kind !== 'target') return null;
  const harmful = punishesItsTarget(effects);
  return (
    aimByDirection(state, playerId, harmful, choice) ??
    // The other direction, because a legal target must be chosen.
    aimByDirection(state, playerId, !harmful, choice) ??
    pickBiggest(state, choice.instanceIds) ??
    (choice.playerIds.length > 0 ? { kind: 'player', playerId: choice.playerIds[0] } : null)
  );
}

/**
 * Answer a triggered ability of this seat's that is waiting to be aimed.
 *
 * FIRST, before priority and before anything else `nextBotMove` considers,
 * because the game is stopped: `drainTriggers` returned without emptying the
 * queue and nothing else will move until this action lands.
 *
 * It answers only for seats this bot plays — `triggerAwaitingTargets` reports
 * the controller and the caller passes its own id — so a human's waiting
 * trigger is left for the human's mat, exactly as priority is.
 */
function announceTriggerMove(state: GameState, playerId: PlayerId, at: number): BotMove | null {
  const ask = triggerAwaitingTargets(state);
  if (!ask || ask.playerId !== playerId) return null;

  const action = answerTriggerTargets(
    state,
    pending => botTriggerTarget(state, playerId, pending.trigger, pending.choice),
    at
  );
  if (!action) return null;

  return {
    actions: [action],
    note: `Aims ${ask.trigger.sourceName}'s triggered ability.`,
  };
}

/* -------------------------------------------------------------------------- */
/* WHEN AN ANSWER IS SPENT                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How big a creature has to be before a removal spell is spent on it.
 *
 * A POLICY NUMBER, not a rule, and written down here rather than inlined so it
 * can be argued with. Without a floor, a bot that controls no creatures on turn
 * two finds that every creature on the table "outclasses its board" — which is
 * true and useless — and fires its Doom Blade at a Llanowar Elves. Three power
 * is the point at which a creature is doing something a chump block cannot
 * survive and a two-drop cannot trade with.
 *
 * The cost of being wrong is a removal spell held one turn longer than it
 * needed to be. The cost of no floor at all was measured in the other
 * direction: it is the "all access and no judgement" the brief warns about.
 */
const REMOVAL_WORTH_SPENDING_ON = 3;

/** The biggest power and toughness this seat has on the board, or 0 and 0. */
function boardCeiling(state: GameState, playerId: PlayerId): { power: number; toughness: number } {
  const player = getPlayer(state, playerId);
  let power = 0;
  let toughness = 0;
  for (const id of player?.zones.battlefield ?? []) {
    const card = state.cards[id];
    if (!card || !isCreatureIn(state, card)) continue;
    power = Math.max(power, combatPowerIn(state, card));
    toughness = Math.max(toughness, combatToughnessIn(state, card));
  }
  return { power, toughness };
}

/**
 * Creatures on an opponent's board that THIS SEAT'S COMBAT CANNOT DEAL WITH.
 *
 * The definition is the bot's own attack maths read from the other side: a
 * creature whose toughness is greater than the power of everything this seat
 * controls, so nothing here can kill it, AND whose power is at least the
 * toughness of the biggest thing here, so it kills whatever blocks it. That is
 * what "combat has no answer" means, stated as two comparisons rather than a
 * feeling.
 *
 * This is the release valve on holding an answer, and it needs one. A seat that
 * is never attacked would otherwise hold its removal for the whole game, which
 * is the dead card this tranche exists to remove wearing a different hat.
 */
function outclassingCreatures(state: GameState, playerId: PlayerId): Set<InstanceId> {
  const ceiling = boardCeiling(state, playerId);
  const out = new Set<InstanceId>();
  for (const player of livingPlayers(state)) {
    if (player.id === playerId) continue;
    for (const id of player.zones.battlefield) {
      const card = state.cards[id];
      if (!card || !isCreatureIn(state, card)) continue;
      const power = combatPowerIn(state, card);
      const toughness = combatToughnessIn(state, card);
      if (power < REMOVAL_WORTH_SPENDING_ON) continue;
      if (toughness <= ceiling.power) continue;
      if (power < ceiling.toughness) continue;
      out.add(id);
    }
  }
  return out;
}

/**
 * Attackers pointed at this seat that no block can answer.
 *
 * Every eligible blocker is tried against each attacker: if not one of them can
 * block it and either kill it or survive it, the only block available is a
 * chump block, and this is the moment a removal spell is worth the most in the
 * whole game. The creature is already tapped and committed, the damage has not
 * happened yet, and the trade that would have made the removal unnecessary does
 * not exist.
 *
 * An attacker nothing may legally block at all — flying over an empty board,
 * menace against one body — is in the list for the same reason.
 *
 * The same `REMOVAL_WORTH_SPENDING_ON` floor `outclassingCreatures` uses, for
 * the same reason and because it was missing here: seed 9003 spent Dark Deed on
 * a 2/2 and seed 9007 spent Lightning Dart on a 2/1, each a whole card to stop
 * two damage in a format that starts on forty life. A swing that would actually
 * kill this seat overrides the floor, because at that point the card is worth
 * whatever it costs.
 */
function unanswerableAttackers(state: GameState, playerId: PlayerId): Set<InstanceId> {
  const out = new Set<InstanceId>();
  const blockers = eligibleBlockers(state, playerId);
  const life = getPlayer(state, playerId)?.life ?? 0;

  for (const declaration of state.combat.attackers) {
    if (declaration.defenderPlayerId !== playerId) continue;
    if (declaration.blockedBy.length > 0) continue;
    const attacker = state.cards[declaration.attackerId];
    if (!attacker) continue;

    const power = combatPowerIn(state, attacker);
    const toughness = combatToughnessIn(state, attacker);
    if (power < REMOVAL_WORTH_SPENDING_ON && power < life) continue;
    const answered = blockers.some(blocker => {
      if (!canBlock(state, attacker, blocker)) return false;
      if (blockersRequiredFor(state, attacker) > blockers.length) return false;
      const kills =
        combatPowerIn(state, blocker) >= toughness || hasKeywordIn(state, blocker, 'deathtouch');
      const survives = combatToughnessIn(state, blocker) > power;
      return kills || survives;
    });
    if (!answered) out.add(declaration.attackerId);
  }
  return out;
}

/**
 * Spend one held answer on one of these creatures, or hold it.
 *
 * The cheapest answer that can legally be aimed at a creature in `victims` is
 * the one spent, because a Doom Blade and a Ruinous Ultimatum kill the same 4/4
 * and only one of them is still in hand afterwards.
 *
 * A card whose targets cannot reach any victim is NOT cast — an "exile target
 * artifact" is not spent on a creature it cannot touch just because the bot
 * wanted to do something. That is the same refusal `chooseTargetsFor` makes for
 * a spell with no legal target at all, one step narrower.
 *
 * `mustRemove` is the difference between the two windows this is called from.
 * In the caster's own main phase the creature is standing there doing nothing,
 * so an answer that does not actually remove it achieves nothing at all and the
 * card is held — see `answerRemoves` for the game that measured it. At declare
 * blockers the damage is already pointed at this seat, so shrinking the
 * attacker is worth something even when it does not kill it.
 */
function chooseAnswer(
  state: GameState,
  playerId: PlayerId,
  at: number,
  viaStack: boolean,
  victims: Set<InstanceId>,
  mustRemove: boolean
): { card: CardInstance; victim: string; actions: GameAction[] } | null {
  if (!viaStack) return null; // See `chooseSpell`: an instant off the stack does nothing.
  if (victims.size === 0) return null;

  const held = handCards(state, playerId)
    .filter(card => !isLand(card) && spellRole(card) === 'answer')
    /* The same two questions `chooseSpell` asks of a `now` spell, and for the
       same reasons: a removal spell the engine cannot run kills nothing, and one
       whose printed additional cost nothing charges is a card that does not
       exist. See `engineCanRunSpell`. */
    .filter(card => engineCanRunSpell(card) && !costsMoreThanTheEngineCharges(card))
    .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name));

  for (const card of held) {
    /*
     * WHICH VICTIMS THIS CARD MAY BE POINTED AT, worked out once so the loop
     * below can ask about them and the check after the plan can ask again.
     *
     * In the main-phase window the answer has to finish the job, so a victim
     * this card cannot actually remove is not a victim for it. See
     * `answerRemoves`.
     */
    const reachableVictim = (id: InstanceId): boolean => {
      if (!victims.has(id)) return false;
      if (!mustRemove) return true;
      const victim = state.cards[id];
      return Boolean(victim) && answerRemoves(state, card, victim);
    };

    let aimedAt: string | null = null;

    const plan = planCastWith(
      state,
      playerId,
      card.instanceId,
      choice => {
        if (choice.kind !== 'target') return null;
        const reachable = choice.instanceIds.filter(reachableVictim);
        if (reachable.length > 0) {
          const chosen = bestHostOf(state, reachable, () => true);
          if (chosen) {
            aimedAt = state.cards[chosen]?.name ?? 'it';
            const target = state.cards[chosen];
            return {
              kind: 'card',
              instanceId: chosen,
              zone: target?.zone,
              zoneChangeCounter: target?.zoneChangeCounter ?? 0,
            };
          }
        }
        /* A second target on the same card — "and put a +1/+1 counter on target
           creature you control" — is answered by the ordinary policy. */
        return botSpellTarget(state, playerId, card, choice);
      },
      { at, viaStack }
    );

    if (!plan.ok) continue;

    /*
     * THE DECIDER IS NOT ALWAYS ASKED, and reading the answer off `aimedAt`
     * alone was a defect that hid in the one case that matters most.
     *
     * `chooseTargetsFor` takes a forced choice without asking — one legal
     * candidate is not a decision. So when the opponent's creature is the ONLY
     * creature on the battlefield, which is most of the early game, the callback
     * above never ran, `aimedAt` stayed null, and the bot declined to cast a
     * removal spell it had every reason to cast. Reproduced as a unit test in
     * `botSpells.test.ts`: with a 4/4 across the table and nothing on the bot's
     * own board, the bot held Murder and moved to combat.
     *
     * So the plan is asked what it announced, rather than the callback being
     * asked what it was told. The targets ride on the last action of the batch,
     * which is the `CAST_SPELL` (or the `PLAY` when the stack is off).
     */
    const announced = plan.actions
      .flatMap(action => ('targets' in action ? (action.targets ?? []) : []))
      .filter((target): target is StackTarget & { kind: 'card' } => target.kind === 'card')
      .filter(target => reachableVictim(target.instanceId));

    const hit = aimedAt ?? (announced.length > 0 ? state.cards[announced[0].instanceId]?.name : null);
    if (!hit) continue;
    return { card, victim: hit, actions: plan.actions };
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
 *
 * Exported so `behaviour-probe.ts` answers a mode and an activated ability's
 * target with THIS function and not with one of its own. If the probe answered
 * differently from the game, its number would be about the probe.
 */
export function botChoice(
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
  at: number,
  reserve: string | null = null
): { card: CardInstance; option: AbilityCandidate; actions: GameAction[] } | null {
  if (activationsThisTurn(state, playerId) >= MAX_ACTIVATIONS_PER_TURN) return null;

  const sources = manaSourcesFor(state, playerId);

  for (const entry of activatablePermanents(state, playerId, { at })) {
    for (const option of entry.options) {
      /*
       * A MANA ABILITY IS NEVER ACTIVATED FOR ITS OWN SAKE, AND THIS IS NOT A
       * PREFERENCE — IT IS THE FIX FOR A GAME THAT HANGS.
       *
       * Measured in a browser on 29 Aug 2026, four-player table, turn 11,
       * reproduced twice on the same seed. A bot seat holding Initiates of the
       * Ebon Hand ("{1}: Add {B}") sat in precombat main producing this, without
       * end:
       *
       *     SPEND_MANA -> ADD_MANA -> NOTE -> SPEND_MANA -> ADD_MANA -> NOTE ...
       *
       * A filter converts mana rather than making it, so the pool never grows
       * and never empties: the ability is payable on every pass, `chooseSpell`
       * has already returned null, and this function offers the same activation
       * for ever. `/play` asks `nextBotMove` on a timer and dispatches whatever
       * it gets, so the table never reached turn 12 and the human seat had no
       * control that could move it. The harness does not see this because
       * `runner.ts` carries `loopRepeatLimit` and `maxActionsPerTurn`; the
       * browser carries neither.
       *
       * The guard at the top of this function could not catch it either.
       * `activationsThisTurn` reads `state.abilityUses`, which `rules.ts` only
       * writes in `PUT_ABILITY_ON_STACK`, and CR 605.3a keeps a mana ability off
       * the stack entirely. So mana activations are invisible to the counter and
       * MAX_ACTIVATIONS_PER_TURN never fires for them.
       *
       * The rule that removes the whole class: mana is produced to PAY for
       * something, and everything the bot pays for already taps its own sources
       * inside `planCastFromHand` / `planActivationWith`. An activation reached
       * here has no payee by construction, because `chooseSpell` ran first and
       * found nothing. So a mana ability at this point can only ever float mana
       * that nothing will spend.
       */
      if (option.isManaAbility) continue;
      if (!willingToPay(state, playerId, option)) continue;

      const plan = planActivationWith(
        state,
        playerId,
        entry.card.instanceId,
        option.abilityId,
        choice => botChoice(state, playerId, entry.card, choice),
        { at }
      );
      if (!plan.ok) continue;

      /*
       * The counterspell reserve applies here too, or it is not a reserve: a
       * bot that declined to cast a four-drop and then tapped the same four
       * lands to equip a sword has held nothing open.
       *
       * The mana-ability exemption that used to sit here is gone, because mana
       * abilities no longer reach this line at all: they are skipped at the top
       * of the loop. See the note there.
       *
       * Approximate in one direction and stated as such: `ActivationPlan`
       * reports `tapIds` and not the pool mana a cost spent, so an ability paid
       * for out of floating mana is judged as cheaper than it was. The error
       * lets a reserve slip, never invents one.
       */
      const asPayment: PaymentPlan = {
        ok: true,
        tapIds: plan.tapIds,
        spend: [],
        required: 0,
        available: sources.length,
        reason: '',
      };
      if (!keepsTheReserve(sources, asPayment, reserve)) continue;

      return { card: entry.card, option, actions: plan.actions };
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
 *
 * ## Why a removal spell is not cast here
 *
 * A counterspell is the only card whose window IS this one. Answering a
 * creature spell on the stack with a removal spell means paying for the removal
 * and still letting the creature resolve, and answering an ability with it does
 * less than that. So an `answer` is held for the two windows
 * `unanswerableAttackers` and `outclassingCreatures` describe, where the
 * creature is on the battlefield and killing it changes something. A bot that
 * fired removal at every stack object would be casting more spells and playing
 * worse, which is the failure this tranche is written against.
 */
function priorityMove(state: GameState, playerId: PlayerId, options: BotOptions): BotMove | null {
  const at = options.at ?? 0;
  if (!hasPriority(state, playerId)) return null;

  const answering = spellToAnswer(state, playerId);
  if (answering) {
    /*
     * `counterCanTarget` as well as `counters`, and the second half is a defect
     * this tranche closes. `responseOptions` reports that a card counters
     * SOMETHING; it says nothing about what. Measured across twenty recorded
     * games: all three counterspells a bot ever cast were aimed at an activated
     * ability, one of them Essence Capture — "counter target creature spell" —
     * countering a tap ability. Nothing in the engine refused it.
     */
    const counter = responseOptions(state, playerId).find(
      option => option.counters && counterCanTarget(state, option.card, answering)
    );
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

      /* `?? true`, not `options.useStack`. A caller that says nothing gets the
         stack, and only a caller that says `false` out loud gets the immediate
         cast. The old reading, where undefined is falsy so silence meant off,
         is how every surface except `/play` ended up casting spells nobody
         could answer without anybody choosing that. */
      const useStack = options.useStack ?? true;
      /* The control arm. See `BotOptions.castingPolicy`. */
      const castsSpells = (options.castingPolicy ?? 'all') === 'all';

      /*
       * REMOVAL BEFORE DEVELOPMENT, and only against a creature combat cannot
       * deal with.
       *
       * Before, because if a creature is bigger than everything this seat
       * controls then the four-drop cast instead does not change that: next
       * turn the bot is one card down and still behind it. Killing it first is
       * the play, and it is the reason removal is worth holding at all.
       *
       * Only in the precombat main. Casting it after combat spends a card to
       * change a board that is not about to be attacked into, and the same
       * spell is worth more in the declare blockers window on the next seat's
       * turn, which `nextBotMove` now offers.
       */
      if (state.step === 'precombat_main' && castsSpells) {
        const answer = chooseAnswer(
          state,
          playerId,
          at,
          useStack,
          outclassingCreatures(state, playerId),
          /* The creature is standing on the battlefield with nothing pointed at
             anybody yet, so an answer that does not remove it changes nothing
             before it wears off. See `answerRemoves`. */
          true
        );
        if (answer) {
          return {
            actions: answer.actions,
            note: `Casts ${answer.card.name} at ${answer.victim}, which its board cannot beat in combat.`,
          };
        }
      }

      /*
       * The mana this seat will not spend, worked out once and applied to both
       * the cast below and the activation after it. See `reservedCounterCost`
       * for why only a counterspell earns it.
       */
      const reserve = castsSpells ? reservedCounterCost(state, playerId) : null;

      /*
       * TWO PASSES, and the second one is the concession that makes the reserve
       * safe to ship.
       *
       * First the bot looks for something it can cast while still leaving the
       * counterspell payable — which is the behaviour asked for: with six lands,
       * a three-drop and a four-drop in hand and a Counterspell held, it casts
       * the three-drop and keeps two open. Only if NOTHING at all fits does it
       * drop the reserve and cast the best thing it can.
       *
       * Holding a counterspell is worth a cheaper spell. It is not worth a whole
       * turn: a bot that sat on five lands doing nothing for six turns because
       * it was "holding up mana" would be the worse-to-play-against bot this
       * tranche is written against, and it would show up in the harness as
       * games that never end.
       */
      const wanted: SpellRole[] = castsSpells ? ['permanent', 'now'] : ['permanent'];
      const spell =
        chooseSpell(state, playerId, at, useStack, wanted, reserve) ??
        chooseSpell(state, playerId, at, useStack, wanted, null);
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
      const activation = chooseActivation(state, playerId, at, reserve);
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

      /*
       * CR 509.2 — order the blockers before damage, exactly as a human seat
       * now does through `OrderBlockersBar`.
       *
       * Without this the bot's own attackers were damaged in the order the
       * DEFENDER declared the blocks, which is the rule backwards, and a human
       * double-blocking a bot got to choose which of their own creatures died.
       * `orderBlockersMove` proposes nothing when the lane is already in the
       * order it wants, so this cannot loop the no-progress detector.
       */
      const ordering = orderBlockersMove(state, playerId, at);
      if (ordering) return ordering;

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
 * THE OTHER WINDOW AN ANSWER IS SPENT IN: being attacked by something no block
 * can deal with.
 *
 * Taken before blocks are declared, on purpose. Killing the attacker means the
 * block that would have been a chump block is not needed at all, and the
 * creature spared is still there on the next turn — whereas removal cast after
 * the block has already traded a body for nothing.
 *
 * This is the one place the bot acts at instant speed on somebody else's turn,
 * and it is reachable because `seatOrder` in the playtest runner asks the
 * DEFENDERS first at this step. The attacking seat's own move here is "waits
 * for blocks", so a defender that has something to do gets to do it.
 */
function answerAttackerMove(
  state: GameState,
  playerId: PlayerId,
  options: BotOptions
): BotMove | null {
  const player = getPlayer(state, playerId);
  if (!player || !isAlive(player)) return null;

  if ((options.castingPolicy ?? 'all') !== 'all') return null;

  const answer = chooseAnswer(
    state,
    playerId,
    options.at ?? 0,
    options.useStack ?? true,
    unanswerableAttackers(state, playerId),
    /* The damage is already aimed at this seat, so shrinking an attacker that
       survives is still life this seat keeps. See `chooseAnswer`. */
    false
  );
  if (!answer) return null;

  return {
    actions: answer.actions,
    note: `Casts ${answer.card.name} at ${answer.victim}, an attacker it cannot block and live.`,
  };
}

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

/**
 * CR 509.2 — put a double block into the order this bot wants damage spent in.
 *
 * The policy is "kill the biggest thing I can afford to kill first": blockers
 * are sorted by toughness ASCENDING, so the attacker's power is spent on the
 * cheapest lethal assignments first and kills as many bodies as it can. That is
 * the assignment a human makes almost every time, and it is a real improvement
 * over the previous behaviour, which was no policy at all — the order the
 * DEFENDER happened to click in.
 *
 * Deathtouch reverses nothing: one point is lethal to everything, so ascending
 * toughness still spends the fewest points per kill.
 *
 * Returns null when every lane is already in the wanted order. That is what
 * keeps the harness's no-progress detector quiet: `ORDER_BLOCKERS` returns the
 * same state reference when nothing moves, and a bot that proposed one anyway
 * would look like a seat with a move that changes nothing, forever.
 */
function orderBlockersMove(state: GameState, playerId: PlayerId, at: number): BotMove | null {
  const actions: GameAction[] = [];
  for (const lane of lanesNeedingDamageOrder(state, playerId)) {
    const live = lane.blockedBy.filter(id => state.cards[id]?.zone === 'battlefield');
    const wanted = live.slice().sort((a, b) => {
      const ca = state.cards[a];
      const cb = state.cards[b];
      if (!ca || !cb) return 0;
      const byToughness = combatToughnessIn(state, ca) - combatToughnessIn(state, cb);
      if (byToughness !== 0) return byToughness;
      // Among equals, take the biggest hitter off the board first.
      return combatPowerIn(state, cb) - combatPowerIn(state, ca);
    });
    // Blockers that have already left keep their place at the back rather than
    // being dropped: `ORDER_BLOCKERS` refuses anything that is not a
    // permutation of the whole lane.
    const order = [...wanted, ...lane.blockedBy.filter(id => wanted.indexOf(id) === -1)];
    if (order.join('|') === lane.blockedBy.join('|')) continue;
    actions.push({ type: 'ORDER_BLOCKERS', attackerId: lane.attackerId, blockerIds: order, at });
  }
  if (actions.length === 0) return null;
  return {
    actions,
    note: `Orders blockers on ${actions.length} lane${actions.length === 1 ? '' : 's'}.`,
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
   * A TRIGGER WAITING TO BE AIMED OUTRANKS EVEN THE STACK.
   *
   * `drainTriggers` stopped, so the game is not merely waiting on a decision,
   * it is not running at all: no step advances, no spell resolves, nothing on
   * the stack moves. Anything this function returned instead would be a move
   * into a game that has paused. See `announceTriggerMove`.
   */
  const aiming = announceTriggerMove(state, playerId, options.at ?? 0);
  if (aiming) return aiming;

  /*
   * ...AND SOMEBODY ELSE'S WAITING TRIGGER STOPS THIS SEAT TOO.
   *
   * Returning null here is the same move `priorityMove` makes when this bot
   * does not hold priority: it hands control back to the surface so the seat
   * that owes an answer can give one. Without it a bot whose turn it is would
   * keep advancing steps around a human's unanswered trigger, which is a board
   * moving underneath a decision that was taken about an older one.
   */
  if (triggerAwaitingTargets(state)) return null;

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
  if (state.step === 'declare_blockers') {
    return answerAttackerMove(state, playerId, options) ?? blockMove(state, playerId, options);
  }
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
