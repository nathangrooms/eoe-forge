/**
 * Whether opening a deck should write to its row, and whether that write counts
 * as an edit.
 *
 * ## The bug
 *
 * The deck page computes the power score on mount and caches it. The cache
 * write went through `saveDeckRecord`, which stamps `updated_at` unless told
 * not to. So simply LOOKING at a deck rewrote its row and pushed it to the top
 * of "Last updated" on My Decks. Observed as a deck's date moving from
 * 31 January to 29 August between two reads, with nothing changed in between.
 *
 * That makes the column mean "when I last opened this" rather than "when I last
 * changed this", which is not what anybody sorts by.
 *
 * ## Why it cannot simply stop touching
 *
 * Card edits write to `deck_cards`, not to `user_decks`, and do not stamp
 * `updated_at` themselves. This cache write is deliberately the thing that
 * carries it, so that adding a card costs one request rather than two. Removing
 * the touch entirely would freeze every deck's date instead.
 *
 * ## So there are three answers, and the stored score tells them apart
 *
 * The row the page already loaded carries the previous score and the hash of
 * the decklist it was computed from, so no extra request is needed:
 *
 *   same hash, same score  -> nothing moved. Write nothing at all.
 *   same hash, new score   -> the ENGINE moved, not the deck. Refresh the cache
 *                             so My Decks stops showing a number the engine no
 *                             longer produces, and leave the date alone.
 *   different hash         -> the decklist changed. This is an edit.
 *   nothing stored         -> first score. Write it, and treat it as an edit,
 *                             because a deck with no cached score is almost
 *                             always one that was just built. It happens once
 *                             per deck at most: after this there is a hash.
 */

/** The shape actually stored at `user_decks.edh_analysis.deckmatrix`. */
export interface StoredScoreShape {
  hash?: string;
  score?: number;
}

export type RecordWritePlan =
  /** Write nothing. */
  | 'skip'
  /** Write the cache, leave `updated_at` alone. */
  | 'cache'
  /** Write the cache and stamp `updated_at`. */
  | 'edit';

export function recordWrite(
  stored: StoredScoreShape | null | undefined,
  power: { hash: string; score: number } | null | undefined
): RecordWritePlan {
  /* No score to cache. Nothing to say about the row either way. */
  if (!power) return 'skip';

  if (!stored || typeof stored.hash !== 'string') return 'edit';

  if (stored.hash !== power.hash) return 'edit';

  if (stored.score === power.score) return 'skip';

  return 'cache';
}
