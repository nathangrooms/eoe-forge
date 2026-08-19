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
