/**
 * The line under a storage container on the shelf, which invited a subtraction
 * that did not work.
 *
 * Measured 30 Aug 2026. A bulk box holding 1,200 copies across 400 different
 * cards, previewing five of them, rendered:
 *
 *     1,200 cards · 395 more inside
 *
 * because the headline is `itemCount` (copies, summed from `qty`) and the
 * second figure was `uniqueCards - preview.length` (distinct cards, minus a
 * picture count). A reader takes 1,200 and 5 and expects 1,195. The
 * subtraction was real; it was just against the wrong total.
 *
 * The two facts are kept, and the subtraction is only offered when it is safe:
 * a container whose copies and distinct cards are the same number can honestly
 * say how many are not on the picture, and one where they differ says both
 * figures instead and leaves the reader nothing false to work out.
 */

/**
 * @param copies   physical cards in the container (`itemCount`)
 * @param distinct different cards in it (`uniqueCards`)
 * @param shown    how many the preview picture is drawing
 */
export function containerCountLine(copies: number, distinct: number, shown: number): string {
  const cards = `${copies.toLocaleString()} ${copies === 1 ? 'card' : 'cards'}`;

  /* Every card in here is a different card, so "how many are not in the
     picture" is a subtraction the reader can do and get the same answer. */
  if (distinct === copies) {
    const hidden = Math.max(0, distinct - shown);
    return hidden > 0 ? `${cards} · ${hidden.toLocaleString()} more inside` : cards;
  }

  /* Copies and different cards are not the same number, so no difference
     between them means anything. State both and stop. */
  return `${cards} · ${distinct.toLocaleString()} different`;
}
