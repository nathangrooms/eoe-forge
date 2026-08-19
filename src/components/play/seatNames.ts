/**
 * What to call each seat at a watched table.
 *
 * A table of four seats all labelled "Player 2", or all labelled with the full
 * 40-character name of a commander, is a table you cannot follow: the seat
 * picker, the turn banner, the play line and the winner line all say the seat's
 * name, and every one of them is short on room.
 *
 * ## Why this is a module and not a helper inside the page
 *
 * It lived in `src/pages/Simulate.tsx`, where `node --test` cannot reach it,
 * because tests here cannot import `.tsx`. It shipped a bug that one assertion
 * would have caught (see `shortSeatName`), and nothing could assert on it.
 * Project law: pure logic belongs in a `.ts` so it CAN be tested. This is that.
 *
 * Copy rules apply: these strings are read by players. No jargon, no em-dashes.
 */

/** Anything with a `name` and a list of commanders is enough to name a seat. */
export interface SeatNameSource {
  name: string;
  commanders: ReadonlyArray<{ name: string }>;
}

/**
 * A seat's short name: its commander, trimmed to the part before the title.
 *
 * "Yeva, Nature's Herald" is Yeva. The comma is what opens a legend's title
 * clause, so it is the only thing worth cutting at, along with the em-dash a
 * handful of names use for a subtitle.
 *
 * **A hyphen is not a separator.** It used to be in this split, and it cut
 * every name that contains one at the wrong place: "The Ur-Dragon" became "The
 * Ur", "Nine-Fingers Keene" became "Nine", "Sun-Crowned Hunters" became "Sun".
 * A hyphen lives *inside* a name, never between a name and its title.
 */
export function shortSeatName(source: string): string {
  return source.split(/[,—]/)[0].trim();
}

/**
 * The name for one seat, with a fallback that is never "You".
 *
 * Nobody sits at this table: every seat is played by the bot. A seat called
 * "You" made the winner line read "You wins.", so a source that would produce
 * it is refused here rather than at the twelve places that render a name.
 */
export function seatName(deck: SeatNameSource, index: number): string {
  const short = shortSeatName(deck.commanders[0]?.name ?? deck.name);
  if (short.length === 0 || short.toLowerCase() === 'you') return `Seat ${index + 1}`;
  return short;
}

/**
 * Seat names, made distinguishable.
 *
 * Two seats can genuinely land on the same commander: the same deck picked
 * twice, or two seats falling back to the same offline list when the card
 * database is unreachable. A table with two seats both called "Yeva" is a table
 * you cannot follow. The duplicate is numbered rather than renamed, so the deck
 * it came from is still readable.
 */
export function uniqueSeatNames(decks: ReadonlyArray<SeatNameSource>): string[] {
  const seen: Record<string, number> = {};
  return decks.map((deck, index) => {
    const base = seatName(deck, index);
    seen[base] = (seen[base] ?? 0) + 1;
    return seen[base] === 1 ? base : `${base} ${seen[base]}`;
  });
}
