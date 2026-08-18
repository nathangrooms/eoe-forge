/**
 * DeckMatrix — printed characteristics: what the cardboard says, before layers.
 *
 * These four accessors used to live in `combat.ts` and were, until the layer
 * engine was wired in, what the whole application displayed. They are now one
 * level down: the **base** values that `layers.ts` starts from, not the answer.
 *
 * ## Ask `characteristics.ts` instead
 *
 * Nothing that renders a board, resolves combat or drives the bot should call
 * these. They cannot see an anthem, because they are handed a `CardInstance`
 * and an anthem is a property of the *battlefield*, not of the card. That is
 * not a bug here — it is the reason a layer engine exists at all. The single
 * accessor everything should ask is `characteristics.ts`, which takes the state.
 *
 * They stay exported because three callers legitimately want printed values:
 *
 *   - `layers.ts` builds its `BaseObject` from them (via `baseObjectFromCard`);
 *   - `context.ts` falls back to them when no layered view has been computed
 *     yet — the first of the two passes in `scanStatics`, by construction;
 *   - `manual.ts` offers "set power to its current value", which means the
 *     value a player can see and reason about.
 *
 * ## The `*` problem, stated rather than hidden
 *
 * `baseNumber` runs `parseInt`, so Tarmogoyf's printed `1+*` toughness reads as
 * a confident `1` and its `*` power reads as `0`. Both are wrong, and worse,
 * they are wrong *silently* — a number with no marker that it was guessed.
 *
 * `layers.ts` makes the opposite choice: a characteristic-defining `*` it
 * cannot evaluate is `null`, which forces the caller to decide what to show.
 * `characteristics.ts` keeps the `null` and the UI prints the printed string
 * (`*`, `1+*`) with the manual override offered, because project law is that
 * nothing is fabricated. This module keeps `parseInt` only so the pre-layer
 * fallbacks above stay unchanged; it is deliberately not the display path.
 */

import type { CardInstance } from './types.ts';
import { isCreature } from './mana.ts';

/**
 * A printed P/T box as a number.
 *
 * Returns 0 for anything non-numeric. See the header: this is the lossy read,
 * kept for the pre-layer fallbacks. `printedIsVariable` tells you when it lied.
 */
function baseNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function counterDelta(card: CardInstance): number {
  const plus = card.counters['+1/+1'] ?? 0;
  const minus = card.counters['-1/-1'] ?? 0;
  return plus - minus;
}

/**
 * True when a printed P/T box is a characteristic-defining `*` expression
 * rather than a plain number — a bare star, `1+*`, or `2+*`.
 *
 * This is the predicate that separates "the engine knows this is 3" from "the
 * engine printed 3 and had no idea". A hand-set override counts as knowing.
 */
export function printedIsVariable(value: string | undefined | null): boolean {
  if (!value) return false;
  return value.includes('*');
}

/** Does this card have a `*` in either P/T box, with no override supplied? */
export function hasVariablePT(card: CardInstance | null | undefined): boolean {
  if (!card) return false;
  const powerUnknown = printedIsVariable(card.power) && card.powerOverride === undefined;
  const toughnessUnknown = printedIsVariable(card.toughness) && card.toughnessOverride === undefined;
  return powerUnknown || toughnessUnknown;
}

/**
 * Printed power: the hand-set override if there is one, otherwise the printed
 * value, plus counters either way.
 *
 * Pre-layer. Does not see anthems. See the module header.
 */
export function powerOf(card: CardInstance | null | undefined): number {
  if (!card) return 0;
  const base = card.powerOverride ?? baseNumber(card.power);
  return Math.max(0, base + counterDelta(card));
}

/** Printed toughness, override and counters included. Pre-layer. */
export function toughnessOf(card: CardInstance | null | undefined): number {
  if (!card) return 0;
  const base = card.toughnessOverride ?? baseNumber(card.toughness);
  return base + counterDelta(card);
}

/** Printed power/toughness for a creature. Pre-layer. */
export function statLine(card: CardInstance | null | undefined): string | null {
  if (!card || !isCreature(card)) return null;
  return `${powerOf(card)}/${toughnessOf(card)}`;
}

/** True when the printed stats have been overridden by hand. */
export function hasStatOverride(card: CardInstance | null | undefined): boolean {
  return !!card && (card.powerOverride !== undefined || card.toughnessOverride !== undefined);
}
