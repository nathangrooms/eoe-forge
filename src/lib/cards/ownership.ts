/**
 * How many copies of a card you own, counting every printing of it.
 *
 * ## The bug this closes
 *
 * `user_collections.card_id` and `deck_cards.card_id` are both PRINTING ids,
 * and five surfaces matched one against the other directly. That nearly worked
 * until 19 Aug 2026, when `cards` held one printing per card and a printing id
 * and a card were almost the same thing. It now holds every printing, so a deck
 * listing the Commander Legends Sol Ring and a collection holding the Revised
 * one are two ids for one card, and the deck says you do not own it.
 *
 * Measured on the real database: of 16 deck rows whose card the owner genuinely
 * holds, 4 were reported missing. `compute_deck_summary` was fixed in
 * `20260830210000_owning_a_card_is_not_owning_one_printing_of_it.sql`; this is
 * the same rule for the surfaces that count in the browser.
 *
 * ## Why it hands back a map keyed by PRINTING id
 *
 * Because every caller already has a printing id in hand and asks "do I own
 * this line". Keying the answer by `oracle_id` would push the join outwards
 * into five components. The counting happens by card; the answer is addressed
 * the way the question was asked.
 *
 * A card you own three of appears under every one of its printings with the
 * value 3. It is an answer about the CARD, so two deck rows for two printings
 * of the same card both read 3, and a caller walking a decklist must subtract
 * as it goes if it wants copies to be spent rather than counted twice. That is
 * `spendOwned` below, and the reason it exists.
 */

/** The shape both `user_collections` and any owned-copies read already have. */
export interface OwnedRow {
  card_id: string;
  quantity?: number | null;
  foil?: number | null;
}

/** Printing id to the card it is a printing of. A missing entry stays missing. */
export type OracleIndex = ReadonlyMap<string, string | null | undefined>;

const copies = (row: OwnedRow): number =>
  Math.max(0, Math.trunc(row.quantity ?? 0)) + Math.max(0, Math.trunc(row.foil ?? 0));

/**
 * Copies owned per card, keyed by `oracle_id`.
 *
 * A collection row whose printing is not in the index is counted under its own
 * printing id instead of being dropped. Losing a row would understate what
 * somebody owns, and the whole point of this file is not doing that.
 */
export function ownedByOracle(owned: readonly OwnedRow[], oracleOf: OracleIndex): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of owned) {
    if (!row?.card_id) continue;
    const key = oracleOf.get(row.card_id) ?? row.card_id;
    out.set(key, (out.get(key) ?? 0) + copies(row));
  }
  return out;
}

/**
 * The same answer, addressed by printing id, for every id the caller asks about.
 *
 * Ids with no entry in the index fall back to their own id, which is what makes
 * this degrade to the old behaviour rather than to zero when the index could
 * not be built.
 */
export function ownedByCardId(
  owned: readonly OwnedRow[],
  oracleOf: OracleIndex,
  ids: Iterable<string>
): Map<string, number> {
  const byOracle = ownedByOracle(owned, oracleOf);
  const out = new Map<string, number>();
  for (const id of ids) {
    if (!id) continue;
    out.set(id, byOracle.get(oracleOf.get(id) ?? id) ?? 0);
  }
  return out;
}

/** One line of a decklist, as every caller of this already has it. */
export interface RequiredLine {
  card_id: string;
  quantity?: number | null;
}

export interface ShortfallLine {
  card_id: string;
  required: number;
  owned: number;
  missing: number;
}

/**
 * Walk a decklist spending the copies you own as it goes.
 *
 * Two rows for two printings of the same card must not both claim the same
 * copy. A decklist that lists Sol Ring twice under different printings and an
 * owner with one Sol Ring is short one, not short none. Order is the caller's,
 * so the answer is stable for a stable list.
 */
export function spendOwned(lines: readonly RequiredLine[], owned: ReadonlyMap<string, number>, oracleOf: OracleIndex): ShortfallLine[] {
  const left = new Map<string, number>();
  for (const line of lines) {
    const key = oracleOf.get(line.card_id) ?? line.card_id;
    if (!left.has(key)) left.set(key, owned.get(line.card_id) ?? 0);
  }

  return lines.map(line => {
    const key = oracleOf.get(line.card_id) ?? line.card_id;
    const required = Math.max(0, Math.trunc(line.quantity ?? 0));
    const available = left.get(key) ?? 0;
    const used = Math.min(required, available);
    left.set(key, available - used);
    return { card_id: line.card_id, required, owned: used, missing: required - used };
  });
}
