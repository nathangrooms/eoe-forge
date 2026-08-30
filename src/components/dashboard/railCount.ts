/**
 * The count beside a dashboard rail's title, which was describing a longer list
 * than the rail holds.
 *
 * Both rails cap what they draw and neither said so:
 *
 *   - **Wanted next** printed every copy on the wishlist ("94 cards,
 *     $8,102.41 to buy") above a rail that stops at 18 tiles.
 *   - **Recent decks** printed an exact count of every deck the account owns
 *     above a rail fed by a 24-deck window, and kept printing it when the
 *     Starred toggle cut the rail to two tiles.
 *
 * Same family as the tournaments rail that read "2 decks in your library" above
 * one card. A heading that promises more than the row beneath it holds teaches
 * a reader to stop believing headings, and this product asks people to trust an
 * EDH power score.
 */

/**
 * What to add when a rail is holding some back, and nothing when it is not.
 *
 * Returns the empty string rather than null so a caller can concatenate it
 * without a branch. No em-dash, per the copy rules.
 */
export function showingFirst(shown: number, total: number): string {
  if (shown <= 0 || shown >= total) return '';
  return ` · showing the first ${shown.toLocaleString()}`;
}

/**
 * The "Recent decks" heading.
 *
 * With the Starred toggle on, the rail is no longer showing recent decks at
 * all, so the number describes the starred ones instead of quietly staying at
 * the library total. With it off, the exact library count leads and the window
 * discloses itself.
 */
export function recentDecksCount(
  total: number,
  shown: number,
  starredOnly: boolean
): string | undefined {
  if (starredOnly) {
    if (shown <= 0) return undefined;
    return `${shown.toLocaleString()} starred`;
  }
  if (total <= 0) return undefined;
  return `${total.toLocaleString()} ${total === 1 ? 'deck' : 'decks'}${showingFirst(shown, total)}`;
}
