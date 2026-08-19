/**
 * The batch run's lifecycle, as pure functions over plain data.
 *
 * ## Why the resume pointer gets its own module and its own tests
 *
 * This project has already lost months to a completion path that did not clear
 * its pointer: `scryfall-sync` finished a page, wrote `next_page_url`, and the
 * run that was supposed to be over looked permanently mid-flight. Nothing was
 * broken enough to alarm anybody, which is precisely why it survived.
 *
 * So the pointer is defended three times over, at three different levels, and
 * each one is capable of catching the mistake alone:
 *
 *   1. **The database.** `llm_compile_runs` carries
 *      `check (status <> 'complete' or cursor is null)`. A completed run that
 *      still holds a pointer cannot be written at all.
 *   2. **This module.** `completionPatch()` is the only way the pipeline is
 *      allowed to spell "done", and it always sets `cursor: null`. The script
 *      never constructs that object itself.
 *   3. **`llm-validation.test.ts`.** The test named "THE COMPLETION PATH CLEARS
 *      THE POINTER" asserts it, so a later edit that "tidies up" the null fails
 *      a test instead of freezing a sync. (There is no `llm-run-state.test.ts`;
 *      an earlier version of this comment named one, which is the same defect
 *      class as a fabricated measurement.)
 *
 * Belt, braces and a written reason. The bug was cheap to prevent and expensive
 * to have.
 */

export type RunStatus = 'running' | 'complete' | 'failed' | 'aborted';

export interface RunPatch {
  status?: RunStatus;
  cursor?: string | null;
  finished_at?: string | null;
  totals?: unknown;
}

/**
 * Advance after a batch was fully written. The pointer is the LAST card whose
 * row landed, never the last card that was requested: a batch that died between
 * the model answering and the rows being stored must be re-run, and pointing at
 * a card whose result was never saved is how a resumable job silently skips work.
 */
export function advancePatch(lastWrittenKey: string): RunPatch {
  if (!lastWrittenKey) throw new Error('advancePatch needs the key of a row that was actually written');
  return { cursor: lastWrittenKey };
}

/**
 * The completion path. `cursor: null` is not optional and not conditional.
 *
 * `finished_at` is passed in rather than read from a clock so the function stays
 * pure and the test can assert on it.
 */
export function completionPatch(finishedAt: string, totals?: unknown): RunPatch {
  return { status: 'complete', cursor: null, finished_at: finishedAt, totals };
}

/**
 * A run that stopped badly. The pointer is KEPT — that is the difference between
 * this and completion, and it is the whole reason a failed run is resumable.
 */
export function failurePatch(finishedAt: string, status: 'failed' | 'aborted' = 'failed'): RunPatch {
  return { status, finished_at: finishedAt };
}

/**
 * Where to start. A run with no pointer starts at the beginning; one with a
 * pointer starts strictly AFTER it, because the pointed-at row is already saved.
 */
export function resumeFrom<T>(items: readonly T[], keyOf: (item: T) => string, cursor: string | null | undefined): T[] {
  if (!cursor) return [...items];
  const at = items.findIndex((item) => keyOf(item) === cursor);
  // A pointer naming a row that is not in this work list means the list changed
  // under the run — a new sample, a re-fetched catalogue. Starting over is the
  // conservative direction: re-compiling a card costs tokens, skipping one
  // leaves a hole nothing will ever notice.
  if (at < 0) return [...items];
  return items.slice(at + 1);
}

/** Fixed-size batches, in order, so a resume lands on a batch boundary. */
export function batched<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`batch size must be a positive integer, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Batches capped by BOTH a card count and a summed input-size budget.
 *
 * ## The failure this exists to prevent, measured
 *
 * The first 500-card run put eight Sagas in one call. Their combined oracle text
 * asked for more output than the call's `max_tokens` ceiling, the JSON truncated
 * mid-object, and `parseModelJson` recovered nothing — so all eight cards failed
 * `transport` together. 24 of that run's 64 cards were lost that way, and every
 * one of them was a sizing mistake reported as a model failure. A count-only cap
 * cannot see it coming, because eight tiny cards and eight Sagas are the same
 * number of cards and an order of magnitude apart in the thing that actually
 * overflows.
 *
 * So the budget is over the summed size of what goes IN, which is the only
 * predictor of output length available before the call. `sizeOf` is the card's
 * oracle-text length in characters.
 *
 * A single item larger than `maxTotal` still gets its own batch rather than being
 * dropped or looping forever: one oversized card that truncates costs one card,
 * whereas skipping it silently costs a card nobody will ever notice is missing.
 */
export function batchedByBudget<T>(
  items: readonly T[],
  size: number,
  sizeOf: (item: T) => number,
  maxTotal: number,
): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`batch size must be a positive integer, got ${size}`);
  if (!(maxTotal > 0)) throw new Error(`character budget must be positive, got ${maxTotal}`);

  const out: T[][] = [];
  let current: T[] = [];
  let total = 0;

  for (const item of items) {
    const cost = Math.max(0, sizeOf(item) || 0);
    if (current.length > 0 && (current.length >= size || total + cost > maxTotal)) {
      out.push(current);
      current = [];
      total = 0;
    }
    current.push(item);
    total += cost;
  }
  if (current.length) out.push(current);
  return out;
}
