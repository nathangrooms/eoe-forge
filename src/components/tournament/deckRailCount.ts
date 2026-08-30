/**
 * The line above the deck rail, which was telling the truth only by accident.
 *
 * Both tournament rails drew `withArt = decks.filter(d => d.commanderCard).slice(0, 12)`
 * and then wrote `{decks.length} decks in your library, ready to register`
 * above it. Two ways for that sentence to be false, and one of them was on
 * screen: measured on the tournaments page, the heading read "2 DECKS IN YOUR
 * LIBRARY, READY TO REGISTER" above exactly ONE card, because the second deck's
 * commander had no image and was filtered out of the grid but not out of the
 * count. The other way is the slice: a player with thirty decks reads "30"
 * above twelve tiles.
 *
 * A count that does not match what is under it is the kind of small lie that
 * makes somebody stop trusting the bigger numbers on the page, and this app
 * asks people to trust an EDH power score.
 *
 * So the sentence now says what is actually visible, and says so plainly when
 * that is not everything. No jargon and no em-dash, per the copy rules.
 */
export function deckRailCount(total: number, shown: number): string {
  if (shown <= 0) return 'No decks in your library yet';

  const decks = (n: number) => `${n} deck${n === 1 ? '' : 's'}`;

  /* Everything the player has is on screen, which is the common case. */
  if (shown >= total) return `${decks(total)} in your library, ready to register`;

  /* Held back by the twelve-tile cap, or by a missing commander image. The
     player does not care which, only that there are more than they can see. */
  return `Showing ${shown} of ${decks(total)} in your library, ready to register`;
}
