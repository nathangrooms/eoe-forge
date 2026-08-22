/**
 * The vocabulary every listing surface shares, with no React in it.
 *
 * This file is the part that can be tested without a browser: the skins each
 * control wears, the rule for remembering a surface's view, and the one
 * sentence a page uses to say how many results it found. The components in this
 * folder are thin wrappers over these.
 *
 * Nothing here was invented. Each constant is lifted from whichever existing
 * implementation the consistency audit found to be the best one, and the file it
 * came from is named beside it so the lineage stays checkable.
 * See `docs/design/CONSISTENCY.md`.
 */

/* ================================================================== *
 * Skins
 * ================================================================== */

/**
 * A form field, borderless.
 *
 * `Input` and `SelectTrigger` both ship `border border-input`, so every surface
 * that wants the house style has to opt out by hand. The audit counted 99
 * mounts that never did, plus four separate local `FIELD` constants that had
 * drifted apart (two `focus-visible:ring-1`, one `focus:ring-1`, one both).
 * This is that constant, once. Both focus rules are kept because Radix triggers
 * answer to `focus` and native inputs to `focus-visible`.
 */
export const FIELD =
  'border-0 bg-muted/50 focus:ring-1 focus:ring-ring focus:ring-offset-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0';

/** A popover, dropdown or menu. Depth from shadow, never from a hairline. */
export const SURFACE = 'border-0 bg-popover shadow-xl shadow-black/40';

/**
 * The toolbar ground: a raised surface, not a boxed one.
 * From `CollectionBrowser`, which is the only toolbar that already reads as one
 * band rather than three loose rows.
 */
export const TOOLBAR = 'rounded-lg bg-card p-3 shadow-lg shadow-black/20';

/**
 * A metric tile's ground, by the surface it sits on.
 *
 * Depth in this palette comes from surface tint because the owner banned
 * hairlines, so a `bg-card` tile on a `bg-card` panel is not a subtle tile, it
 * is no tile at all. `Collection` already documents that as the reason its
 * metric row sits below the header band rather than inside it. Two grounds
 * exist in this design and there is no third: `page` is the raised treatment My
 * Decks established, `card` is the recessed one for a row inside a panel that
 * is already raised.
 *
 * `Card` ships `bg-card shadow-lg shadow-black/20`, so `page` restates nothing
 * and `card` has to put the shadow out. A recessed tile that still casts a
 * shadow reads as a raised tile somebody tinted by mistake.
 *
 * There is deliberately no third entry for "smaller". Two of the six metric
 * rows the audit found had a size prop, and shrinking a row of figures to fit
 * is the complaint that started this work.
 */
export type MetricGround = 'page' | 'card';

export const METRIC_TILE: Record<MetricGround, string> = {
  page: 'border-0',
  card: 'border-0 bg-muted/30 shadow-none',
};

/**
 * The segmented-control shell.
 *
 * `bg-muted`, not `bg-muted/40`. This matters and it is the one measurement in
 * the audit that is a bug rather than an inconsistency: a selected chip drawn
 * with `variant="secondary"` on a `bg-muted/40` shell measured **1.09:1**
 * against the shell on My Collection, because `--secondary` sits one lightness
 * point from `--muted` in dark and is identical to it in light. The same
 * control on My Decks, `variant="default"` on `bg-muted`, measured **15.80:1**.
 * `ViewModeToggle` is the only place either choice is made now.
 */
export const SEGMENTED = 'flex items-center gap-0.5 rounded-md bg-muted p-0.5';

/**
 * How long a search field waits before it commits.
 *
 * The audit found 250ms, 300ms, 400ms, 220ms and four surfaces with none at
 * all. 250 is the majority and the smallest that stopped the collection
 * re-filtering on every keystroke, so it is the one.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/* ================================================================== *
 * Remembering a view
 * ================================================================== */

export type SortDirection = 'asc' | 'desc';

export interface ListingViewState {
  /** Which of the surface's declared modes is showing. */
  mode: string;
  sortKey: string;
  sortDir: SortDirection;
}

/**
 * Pick a mode that actually exists on this surface.
 *
 * A stored mode outlives the code that offered it: somebody who last used the
 * collection's table view and then finds themselves on a surface with no table
 * must land on that surface's first mode rather than on a blank panel.
 */
export function resolveMode(stored: unknown, modes: readonly string[], fallback?: string): string {
  const first = fallback && modes.includes(fallback) ? fallback : modes[0];
  if (typeof stored !== 'string') return first;
  return modes.includes(stored) ? stored : first;
}

/**
 * Read a surface's remembered view.
 *
 * ## Why `view` is read as well as `mode`
 *
 * `CollectionBrowser` has been writing `{ view, sortKey, sortDir }` under
 * `deckmatrix.collection.view` for as long as it has existed, and there are
 * real accounts carrying that key right now. Renaming the field to `mode`
 * without reading the old one would silently reset every one of those people to
 * the grid. So both are read, newest name first, and both are written.
 *
 * ## Why a bare string is read too
 *
 * Card search wrote `localStorage.setItem('dm.cardSearch.view', viewMode)` —
 * the literal word `grid`, `list` or `compact`, with no object around it. That
 * one key is shared by every mount of the search component, so it sits on more
 * accounts than any other view key in the product. `JSON.parse('grid')` throws,
 * the catch below turns that into a default, and everyone who had chosen the
 * table would have been put back on the grid the first time this ran. Same
 * class of mistake as renaming the field, so it gets the same treatment: read
 * the old shape, write the new one.
 */
export function readListingView(
  surface: string | undefined,
  modes: readonly string[],
  fallback: ListingViewState
): ListingViewState {
  const safe: ListingViewState = {
    mode: resolveMode(fallback.mode, modes),
    sortKey: fallback.sortKey,
    sortDir: fallback.sortDir === 'asc' ? 'asc' : 'desc',
  };
  if (!surface || typeof window === 'undefined') return safe;

  try {
    const raw = window.localStorage.getItem(surface);
    if (!raw) return safe;
    /* A value an older build wrote as the mode on its own rather than as a
       payload. Checked before `JSON.parse` rather than after, because `"grid"`
       is not valid JSON while `null`, `12` and `"true"` all are, and none of
       those three is a mode. */
    if (!raw.startsWith('{')) return { ...safe, mode: resolveMode(raw, modes, safe.mode) };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: resolveMode(parsed.mode ?? parsed.view, modes, safe.mode),
      sortKey: typeof parsed.sortKey === 'string' ? parsed.sortKey : safe.sortKey,
      sortDir: parsed.sortDir === 'asc' ? 'asc' : parsed.sortDir === 'desc' ? 'desc' : safe.sortDir,
    };
  } catch {
    // Private mode, blocked storage, or a value written by an older build.
    // A preference that cannot be read is not an error; it is a default.
    return safe;
  }
}

/** The payload written for a surface. Carries `view` for the readers above. */
export function listingViewPayload(state: ListingViewState): Record<string, unknown> {
  return { mode: state.mode, view: state.mode, sortKey: state.sortKey, sortDir: state.sortDir };
}

export function writeListingView(surface: string | undefined, state: ListingViewState): void {
  if (!surface || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(surface, JSON.stringify(listingViewPayload(state)));
  } catch {
    /* non-fatal: the choice simply does not persist */
  }
}

/* ================================================================== *
 * Saying how many results there are
 * ================================================================== */

export interface ResultPart {
  /** The figure, already formatted. */
  value: string;
  /** What it counts. Omit for a bare figure such as a price. */
  label?: string;
  /** Hover text, for a figure that needs a caveat. */
  title?: string;
}

/**
 * "3 of 9 decks", and only "9 decks" when nothing is narrowed.
 *
 * Six phrasings were counted across the product for this one job. This is the
 * one. Narrowing is stated as "of", because a reader who filtered needs to know
 * what they filtered out of, and a reader who did not should not be shown the
 * same number twice.
 */
export function matchedLabel(
  shown: number,
  total: number,
  noun: string,
  nounPlural?: string
): ResultPart {
  const plural = nounPlural ?? `${noun}s`;
  const word = total === 1 ? noun : plural;
  return {
    value: shown === total ? total.toLocaleString() : `${shown.toLocaleString()} of ${total.toLocaleString()}`,
    label: word,
  };
}

/**
 * The count line, as one sentence.
 *
 * Parts are joined with a middle dot, which is what the collection already
 * does and the only separator in the product that does not read as punctuation
 * inside a figure. `null` parts drop out, so a caller can write a figure that
 * only sometimes applies without building the array conditionally.
 */
export function resultSentence(parts: (ResultPart | null | undefined | false)[]): string {
  return parts
    .filter((part): part is ResultPart => Boolean(part))
    .map(part => (part.label ? `${part.value} ${part.label}` : part.value))
    .join(' · ');
}

/**
 * How many filters are on, counting a page's own extras.
 *
 * A page whose facets live outside the shared filter state (the collection's
 * condition and foil chips) has to add them in, or the badge under-reports and
 * the reader cannot tell why the grid is short. One function so nobody adds
 * them twice.
 */
export function totalActiveFilters(...counts: (number | undefined)[]): number {
  return counts.reduce<number>((sum, n) => sum + (Number.isFinite(n) ? (n as number) : 0), 0);
}
