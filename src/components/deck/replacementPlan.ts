import type { IncomingCard } from '@/lib/deck/deckMutations';
import type { DeckCardRow } from '@/lib/deck/deckCards';

/** What one batch of replacements does to the deck, worked out before any write. */
export interface ReplacementPlan {
  /** The decklist afterwards. What goes on screen, and what the writes serve. */
  next: DeckCardRow[];
  /** Row ids to delete. Never a row whose card is still in `next`. */
  doomedIds: string[];
  /** Final quantity for every card the batch touched. One upsert, not one each. */
  upserts: Array<
    Pick<DeckCardRow, 'card_id' | 'card_name' | 'quantity' | 'is_commander' | 'is_sideboard'>
  >;
  /** Why a card was turned down, in the words of the rule that turned it down. */
  refused: string[];
}

export interface PlanRules {
  /**
   * Whether this card may go in at that many copies, and why not.
   *
   * The deck's own two rules — colour identity and the copy limit — live on the
   * editor, which is the only thing that knows the format and the commander.
   */
  refuse: (card: IncomingCard, wanted: number) => string | null;
  /**
   * Build the row for a card the deck does not hold yet.
   *
   * Injected rather than imported so this file has NO runtime dependencies at
   * all. That is what lets `replacementPlan.test.ts` run under the project's
   * bare `node --test` without dragging in the Supabase client, and the rule
   * being ratcheted here is worth a test more than it is worth one import.
   */
  newRow: (card: IncomingCard, quantity: number) => DeckCardRow;
}

export interface ResolvedReplacement {
  /** The card to take out, by name. Empty means nothing comes out. */
  remove: string;
  /** The card to put in, already in hand. Null means this line is a removal. */
  card: IncomingCard | null;
}

/**
 * A batch of replacements, worked out against ONE snapshot that moves as it goes.
 *
 * ## The bug this shape exists to prevent
 *
 * The deck page used to apply a list by looping it and calling a single-card
 * edit per row, awaiting each. Every call in such a loop is the same closure
 * over the same decklist, because React does not re-render while the loop runs,
 * so each iteration computed its result from the deck as it was BEFORE the
 * first change. The last write won and the rest were painted over. Measured on
 * the built bundle: nine swaps, nine landed in the database, one landed on
 * screen.
 *
 * Pulling the arithmetic out here is not tidying. It is so the rule can be
 * stated once and tested: `rows` goes in, one finished list comes out, and
 * nothing in between reads a decklist that has already been superseded. A loop
 * of per-card edits cannot be made correct by adding awaits, and the next
 * person to try needs `replacementPlan.test.ts` to say so.
 *
 * ## The rules it applies, each one learned by losing cards
 *
 *  - A line with no card is a removal. Nothing is looked up for it.
 *  - A card that would replace itself is not a change, and treating it as one
 *    would delete the row the same batch is about to write.
 *  - Copy limits and colour identity are checked against the deck AS IT WILL BE,
 *    not as it was, so two lines that both add the same card see the second one
 *    refused rather than both slipping through.
 *  - A refusal leaves the card it would have replaced exactly where it is. It
 *    never removes half a swap.
 *  - A card traded out by one line and back in by another is not deleted. The
 *    delete would land after the upsert and take the row it had just written.
 */
export function planReplacements(
  rows: DeckCardRow[],
  resolved: ResolvedReplacement[],
  { refuse, newRow }: PlanRules
): ReplacementPlan {
  const nameOf = (row: DeckCardRow) => row.card?.name ?? row.card_name;

  /* Copied, not aliased. Quantities are edited in place below, and the caller
     holds `rows` as the version to put back if the write fails. */
  let next = rows.map(row => ({ ...row }));
  const doomed = new Map<string, DeckCardRow>();
  const touched = new Set<string>();
  const refused: string[] = [];

  for (const { remove, card } of resolved) {
    const outgoing = remove
      ? next.find(row => nameOf(row) === remove && !row.is_commander && !row.is_sideboard)
      : undefined;

    if (!card) {
      if (outgoing) {
        doomed.set(outgoing.id, outgoing);
        next = next.filter(row => row !== outgoing);
      }
      continue;
    }

    if (outgoing && outgoing.card_id === card.id) continue;

    const already = next.find(row => row.card_id === card.id && !row.is_sideboard);
    const wanted = (already?.quantity ?? 0) + (outgoing?.quantity ?? 1);

    const problem = refuse(card, wanted);
    if (problem) {
      refused.push(problem);
      continue;
    }

    if (outgoing) {
      doomed.set(outgoing.id, outgoing);
      next = next.filter(row => row !== outgoing);
    }
    if (already) already.quantity = wanted;
    else next.push(newRow(card, wanted));
    touched.add(card.id);
  }

  const survivors = new Set(next.map(row => row.card_id));
  const doomedIds = [...doomed.values()]
    .filter(row => !survivors.has(row.card_id))
    .map(row => row.id);

  const upserts = next
    .filter(row => touched.has(row.card_id) && !row.is_commander && !row.is_sideboard)
    .map(row => ({
      card_id: row.card_id,
      card_name: row.card_name,
      quantity: row.quantity,
      is_commander: false,
      is_sideboard: false,
    }));

  return { next, doomedIds, upserts, refused };
}
