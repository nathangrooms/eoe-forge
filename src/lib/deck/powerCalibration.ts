/**
 * Checking our score against edhpowerlevel.com, honestly.
 *
 * The owner asked for our figure to be sanity-checked against theirs before it
 * is shown. That is a good instinct and it has one trap in it, so the shape of
 * this module is the argument:
 *
 *   **Ours is computed. Theirs is scraped.** Ours comes from the actual
 *   decklist and the actual mana base, with an exact hypergeometric behind the
 *   castability half of it. Theirs arrives as regex matches against rendered
 *   HTML, sometimes as `NaN`, and stops meaning anything the moment their
 *   markup changes. When the two disagree, ours is the more likely to be right.
 *
 * So this is a CALIBRATION CHECK, not an authority:
 *
 *   - it never overwrites our number;
 *   - it never blocks output, so their site being down changes nothing;
 *   - it surfaces the gap only when the gap is big enough to act on.
 *
 * WHAT IT CANNOT SETTLE, AND WHY
 * ------------------------------
 * They hold inclusion data over millions of real decklists. We hold none: the
 * `cards` table has 26 columns and not one of them is a play count or a win
 * rate. So a systematic gap between the two numbers is mostly a DATA gap, not a
 * formula gap, and closing it by tuning our weights until they match would fit
 * our model to a scrape of a site we cannot see inside. That would produce one
 * more power implementation, which is the thing this whole exercise exists to
 * stop. If the measurement shows a systematic gap, the honest response is to
 * report the gap, not to erase it.
 */

/** Our score and theirs are on the same 1 to 10 scale, so they compare directly. */
export interface PowerComparison {
  ours: number;
  theirs: number | null;
  /** `theirs - ours`. Positive means they rated the deck higher than we did. */
  gap: number | null;
  /** True when the gap is worth putting in front of a player. */
  worthShowing: boolean;
  /** One plain sentence for the interface. Null when there is nothing to say. */
  note: string | null;
}

/**
 * Below this the two numbers are saying the same thing.
 *
 * A whole point on a ten-point scale is a real disagreement about what a deck
 * is; half a point is two models rounding differently. Set at 1.5 so we are not
 * showing a player a discrepancy notice on every deck, which would train them
 * to ignore it.
 */
export const NOTABLE_GAP = 1.5;

/**
 * A usable score, or null.
 *
 * The same guard `deck-optimizer` applies to castability, for the same reason:
 * the scrape returns `NaN`, empty strings and occasional nonsense, and a
 * coercion that turns any of those into 0 would tell a player their deck scored
 * zero out of ten. Unknown has to stay unknown.
 */
export function finiteScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 10) return null;
  return n;
}

/**
 * Compare, and decide whether it is worth saying anything.
 *
 * Deliberately returns a sentence rather than a flag, because "our score and
 * edhpowerlevel disagree" is only useful to a player if it also says which way
 * and by how much.
 */
export function comparePower(ours: number, scraped: unknown): PowerComparison {
  const theirs = finiteScore(scraped);
  if (theirs === null) {
    return { ours, theirs: null, gap: null, worthShowing: false, note: null };
  }

  const gap = Math.round((theirs - ours) * 10) / 10;
  const size = Math.abs(gap);
  if (size < NOTABLE_GAP) {
    return { ours, theirs, gap, worthShowing: false, note: null };
  }

  return {
    ours,
    theirs,
    gap,
    worthShowing: true,
    note:
      gap > 0
        ? `edhpowerlevel rates this ${size.toFixed(1)} higher than we do. They count how often ` +
          `cards show up in real decklists and we cannot, so they see popularity we do not.`
        : `edhpowerlevel rates this ${size.toFixed(1)} lower than we do. Our number is worked out ` +
          `from your actual mana base, so check the castability breakdown before changing anything.`,
  };
}

/**
 * The line that goes in the console when the two are compared.
 *
 * Logged on every comparison, agreement included, because a calibration check
 * nobody records tells you nothing about whether the two models track each
 * other. Kept to one line so it stays readable in the edge function logs.
 */
export function logDivergence(deckLabel: string, comparison: PowerComparison): void {
  if (comparison.theirs === null) {
    console.info(`power calibration: ${deckLabel} ours=${comparison.ours} theirs=unavailable`);
    return;
  }
  console.info(
    `power calibration: ${deckLabel} ours=${comparison.ours} theirs=${comparison.theirs} ` +
      `gap=${comparison.gap} notable=${comparison.worthShowing}`
  );
}
