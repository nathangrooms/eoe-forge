/**
 * What these sheets are for, said plainly and never hidden.
 *
 * Wizards' Fan Content Policy requires fan content to be free, so a proxy sheet
 * must never sit behind a payment and nothing in this product may suggest these
 * are sellable or legal at an event. The sentence is short and it is on the
 * page rather than in a help article, because the person about to press print
 * is the person who needs to read it.
 *
 * It lives in its own file because the proxy page shows it twice over: once on
 * a list with cards on it and once on an empty one, and the two must not be
 * allowed to drift into two different promises.
 */
export function PlaytestOnlyNote() {
  return (
    <p className="text-sm text-muted-foreground">
      These are for playtesting at your own table. They are free, they are not real cards, and they
      are not legal at any event. Do not sell them.
    </p>
  );
}
