/**
 * The line above a rail of your decks, which has to say what is under it.
 *
 * This started life on the tournaments page, where a heading read "2 DECKS IN
 * YOUR LIBRARY, READY TO REGISTER" above exactly ONE card: the rail filtered on
 * the commander having artwork and the count did not. It has moved here because
 * three surfaces now draw the same rail (register a deck for an event, print a
 * deck as proxies, take your decklists with you) and a count that lies is worth
 * fixing once rather than three times.
 *
 * A count that does not match what is under it is the kind of small lie that
 * makes somebody stop trusting the bigger numbers on the page, and this app
 * asks people to trust an EDH power score.
 *
 * `purpose` is the tail, because what the decks are ready FOR differs per
 * surface and nothing else does. No jargon and no em-dash, per the copy rules.
 */
export function deckRailLine(total: number, shown: number, purpose?: string): string {
  if (shown <= 0) return 'No decks in your library yet';

  const decks = (n: number) => `${n} deck${n === 1 ? '' : 's'}`;
  const tail = purpose ? `, ${purpose}` : '';

  /* Everything the player has is on screen, which is the common case. */
  if (shown >= total) return `${decks(total)} in your library${tail}`;

  /* Held back by a tile cap, or by a missing commander image. The player does
     not care which, only that there are more than they can see. */
  return `Showing ${shown} of ${decks(total)} in your library${tail}`;
}
