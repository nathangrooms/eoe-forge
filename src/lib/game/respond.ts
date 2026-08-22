/**
 * DeckMatrix — shared game-state core: answering somebody else's spell.
 *
 * Owner: *"no opportunity to use instants to counter a spell either?"* and
 * *"Counter spells dont work at all, should detect if you can counter a cast
 * from opponent."*
 *
 * Neither of those was an engine failure. `stack.ts` is 825 lines with 32 tests
 * covering announcement, targeting, fizzling, split second and countering;
 * `PASS_PRIORITY` is validated in `rules.ts` and its consequences are derived
 * in `stackFollowUps`. Every piece worked. Nothing outside the engine had ever
 * built a `CAST_SPELL`, so no spell had ever been on the stack, so there had
 * never been a moment at which a counterspell could be cast. The feature was
 * unreachable rather than broken, which from a seat at the table is the same
 * thing and is why the owner concluded the engine was bad.
 *
 * This module is the missing question: **given the board right now, is there
 * anything this player could actually do about it, and what.**
 *
 * The important half is the negative one. A prompt with one answer is noise, and
 * a table that stops to ask "respond?" every time anybody casts anything trains
 * a player to hammer through it. So the answer is empty unless the player holds
 * a card they could legally cast at this moment AND can pay for. Only then is
 * there a question worth asking.
 *
 * ## What this covers, and what it does not
 *
 * Covered: responding to a spell already on the stack, at instant speed, paid
 * for from untapped permanents, including countering it.
 *
 * NOT covered, and deliberately not pretended: activated abilities from the
 * battlefield, mana abilities during a cost payment, targeting anything other
 * than the whole spell, holding priority to respond to your own spell more than
 * once, split-second edge cases beyond the flat refusal `canRespond` already
 * makes, and the full priority round through every step of a turn. Those are
 * real and they are not here.
 *
 * Pure: no clock, no randomness, no React.
 */

import { canRespond, stackTop, stackOf } from './stack.ts';
import { isLand, castingCostOf, manaSourcesFor, planPayment } from './mana.ts';
import { hasKeyword } from './keywords.ts';
import { getPlayer } from './rules.ts';
import type { CardInstance, GameState, PlayerId, StackObject } from './types.ts';

/**
 * Can this card be cast at instant speed?
 *
 * An instant, anything with flash, and nothing else. Read from the type line,
 * the keyword list and the oracle text in that order, because a card loaded
 * without keywords still prints the word "Flash" in its rules box.
 *
 * Deliberately conservative. Offering a response that turns out to be illegal
 * is worse than not offering one, because the player builds a plan around it.
 */
export function isInstantSpeed(card: CardInstance | null | undefined): boolean {
  if (!card) return false;
  const line = (card.typeLine ?? '').toLowerCase();
  if (line.includes('instant')) return true;
  if (hasKeyword(card, 'flash')) return true;
  return /\bflash\b/i.test(card.oracleText ?? '');
}

/**
 * Does this card's own text say it counters a spell?
 *
 * Text matching, and it is honest about being that: this is what decides
 * whether the cast is announced with the opponent's spell as its target and a
 * `counter-spell` effect attached. A card the pattern misses is still castable
 * as a response, it just resolves as an ordinary spell and the player resolves
 * its text by hand, which is the same bargain every other card in the
 * catalogue gets.
 */
export function countersSpells(card: CardInstance | null | undefined): boolean {
  const text = card?.oracleText ?? '';
  if (!text) return false;
  return /counter target (?:spell|instant|sorcery|creature spell|noncreature spell|activated|triggered)/i.test(
    text
  );
}

/**
 * MAY THIS COUNTERSPELL BE CAST AT THIS OBJECT?
 *
 * `countersSpells` asks whether a card counters anything. It says nothing about
 * WHAT, and the gap was measured rather than theorised: across twenty recorded
 * commander games all three counterspells a bot ever cast were aimed at an
 * ACTIVATED ABILITY. Essence Capture, which reads "counter target creature
 * spell", countered Blinding Mage's "{W}, {T}: Tap target creature". Quench
 * countered an equip ability. Spell Rupture countered Lembas.
 *
 * Nothing refused any of them. `validateAction` in `rules.ts` checks that the
 * object exists and is not marked can't-be-countered, and asks nothing about
 * its kind; `spellToAnswer` hands back `stackTop` whatever it is, which is
 * right for its own job — being offered an ability to answer IS a real decision
 * — and wrong as an answer to this question.
 *
 * So this is the missing check, and it is deliberately narrow. It reads the
 * phrase the card itself prints after "counter target" and asks whether the
 * object on the stack matches it:
 *
 *   - "counter target spell" and its kin need a SPELL. An activated or a
 *     triggered ability is not a spell (CR 111.1, CR 113.1).
 *   - "creature spell" needs a creature spell, "noncreature spell" needs
 *     anything but, "instant or sorcery spell" needs one of those two.
 *   - "counter target activated or triggered ability" is the one printed form
 *     that wants an ability, and it is matched as one.
 *
 * A phrase the pattern does not recognise falls through to "it must at least be
 * a spell", which is the weakest claim still true of every printed
 * counterspell. Being narrow costs a counter that could have been cast; being
 * wide costs a card resolving as though it read something it does not, and only
 * one of those two is a rules error.
 *
 * The type line is read WHOLE rather than by face, for the one reason
 * `faceTypeLine` exists to avoid elsewhere: a modal double-faced card is cast
 * as one of its faces and `StackObject` does not record which. Reading the
 * front face alone would refuse counters that are legal. A wider read here can
 * only offer more, and everything it offers still goes through
 * `validateAction`.
 */
export function counterCanTarget(
  state: GameState,
  card: CardInstance | null | undefined,
  object: StackObject | null | undefined
): boolean {
  if (!card || !object) return false;

  const match = /counter target ([a-z ]*?)(?:\.|,| unless| if| with| and| that| you| whose|$)/i.exec(
    card.oracleText ?? ''
  );
  const phrase = (match?.[1] ?? '').trim().toLowerCase();

  /*
   * ABILITY FIRST, AND ONLY WHEN THE PHRASE DOES NOT ALSO SAY SPELL.
   *
   * Counted over the 426 cards in the cached snapshot that print "counter
   * target": four of them read "counter target spell or ability" — Diplomatic
   * Escort and its kin — and the first version of this check saw the word
   * ability, decided the card wanted an ability, and refused every spell. A
   * card that counters both must be offered against both.
   */
  const wantsAbility = phrase.includes('ability');
  const wantsSpell = !wantsAbility || phrase.includes('spell');

  if (object.kind === 'activated' || object.kind === 'triggered') return wantsAbility;
  if (object.kind !== 'spell' || !wantsSpell) return false;

  const spellCard = object.cardInstanceId ? state.cards[object.cardInstanceId] : undefined;
  const line = (spellCard?.typeLine ?? '').toLowerCase();

  if (phrase.includes('noncreature')) return !line.includes('creature');

  /*
   * "creature or planeswalker spell", "artifact or creature spell", "instant or
   * aura spell" — 22 of the 426 name more than one type, and asking about the
   * first one alone refused counters that are legal. Any named type matching is
   * the printed rule.
   */
  const NAMED_TYPES = [
    'creature',
    'instant',
    'sorcery',
    'artifact',
    'enchantment',
    'planeswalker',
    'land',
    'battle',
    'aura',
  ];
  const named = NAMED_TYPES.filter(type => phrase.includes(type));
  if (named.length > 0) return named.some(type => line.includes(type));

  /*
   * A colour word — "counter target blue spell", "red or green spell" — is not
   * read. `CardInstance` carries colour IDENTITY, which is a deck-building
   * property and not the colour of a spell on the stack, so answering from it
   * would be a guess. 12 of the 426 are in this shape and all of them are
   * offered against any spell, which is the same answer the engine gave before
   * this function existed.
   */
  return true;
}

/**
 * May this player cast this card AT THIS MOMENT, cost set aside?
 *
 * `planCastFromHand` answers zone and cost and deliberately answers nothing
 * about timing. `rules.ts` says why in as many words at its `CAST_SPELL`
 * validation: the older manual-first surfaces do not drive a priority loop, so
 * a reducer that refused an out-of-turn cast would break them for no benefit,
 * and *"a UI that wants the real thing gates on `canRespond()`"*.
 *
 * `/play` is that UI and it was not gating. Measured by playing it on
 * 2026-08-19: on the opponent's untap, upkeep and draw steps the centre preview
 * offered **Cast** on a sorcery-speed creature six times out of six, and
 * pressing it announced the creature onto the stack and resolved it onto the
 * battlefield. Casting a creature during somebody else's untap step is not a
 * legal game of Magic, and it takes a player's trust in the whole table with
 * it.
 *
 * So this is the gate, written once so the preview, the page and any later
 * caller cannot disagree about it:
 *
 *   - **Instant speed** — an instant, or anything with flash — needs only that
 *     the player may act at all. With something on the stack that is
 *     `canRespond`: priority, and no split-second spell waiting.
 *   - **Everything else is sorcery speed** (CR 307.1): your own turn, one of
 *     your two main phases, and an empty stack.
 *
 * It answers with a sentence rather than a bare false, because the refusal is
 * drawn on the mat under the card. Project law: never silently do nothing.
 *
 * Pure: no clock, no randomness, no React.
 */
export function castTiming(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance | null | undefined
): { ok: boolean; reason: string } {
  if (!card) return { ok: false, reason: 'That card is not in this game.' };
  if (state.status !== 'playing') return { ok: false, reason: 'The game is over.' };

  const stack = stackOf(state);

  if (isInstantSpeed(card)) {
    if (stack.length === 0) return { ok: true, reason: '' };
    const allowed = canRespond(state, playerId);
    return allowed.ok ? { ok: true, reason: '' } : { ok: false, reason: allowed.reason };
  }

  if (stack.length > 0) {
    return {
      ok: false,
      reason: 'Something is on the stack. Only an instant or a card with flash can be cast now.',
    };
  }
  if (state.activePlayerId !== playerId) {
    return {
      ok: false,
      reason: 'It is not your turn. Only an instant or a card with flash can be cast now.',
    };
  }
  if (state.step !== 'precombat_main' && state.step !== 'postcombat_main') {
    return { ok: false, reason: 'This can only be cast in one of your main phases.' };
  }
  return { ok: true, reason: '' };
}

/** One thing this player could do about the spell on the stack. */
export interface ResponseOption {
  card: CardInstance;
  /** True when this card counters the thing it is being cast at. */
  counters: boolean;
  /** Permanents this cast would tap, in order. */
  tapIds: string[];
}

/**
 * The spell this player is being given the chance to answer, or null.
 *
 * Null whenever there is nothing to answer: an empty stack, no priority, a
 * split-second spell already waiting, or the top of the stack is this player's
 * own. Answering your own spell is legal in Magic and is not offered here,
 * because the case that matters — and the case the owner reported — is the one
 * where somebody else is doing something to you.
 */
export function spellToAnswer(
  state: GameState,
  playerId: PlayerId
): StackObject | null {
  if (state.status !== 'playing') return null;
  if (stackOf(state).length === 0) return null;
  if (!canRespond(state, playerId).ok) return null;

  const top = stackTop(state);
  if (!top) return null;
  if (top.controllerId === playerId) return null;
  return top;
}

export interface ResponseOptions {
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
}

/**
 * Everything in hand this player could legally cast right now, in response.
 *
 * Empty is the normal answer and it means "do not ask". Counters come first,
 * then the cheapest, because when a player is offered a choice under pressure
 * the answer they most often want should be the one nearest their thumb.
 */
export function responseOptions(
  state: GameState,
  playerId: PlayerId,
  options: ResponseOptions = {}
): ResponseOption[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  if (!canRespond(state, playerId).ok) return [];

  const sources = manaSourcesFor(state, playerId);
  const found: ResponseOption[] = [];

  for (const instanceId of player.zones.hand) {
    const card = state.cards[instanceId];
    if (!card || isLand(card)) continue;
    if (!isInstantSpeed(card)) continue;

    const payment = options.freeCast
      ? { ok: true, tapIds: [] as string[] }
      : planPayment(castingCostOf(card), sources);
    if (!payment.ok) continue;

    found.push({
      card,
      counters: countersSpells(card),
      tapIds: [...payment.tapIds],
    });
  }

  return found.sort((a, b) => {
    if (a.counters !== b.counters) return a.counters ? -1 : 1;
    return (a.card.cmc ?? 0) - (b.card.cmc ?? 0) || a.card.name.localeCompare(b.card.name);
  });
}

/**
 * Is there a question worth putting on screen?
 *
 * This is the whole "detect if you can counter a cast from opponent" test, and
 * it is two conditions rather than one: something to answer, and something to
 * answer it with. Either alone is not a decision.
 */
export function hasResponse(
  state: GameState,
  playerId: PlayerId,
  options: ResponseOptions = {}
): boolean {
  if (!spellToAnswer(state, playerId)) return false;
  return responseOptions(state, playerId, options).length > 0;
}
