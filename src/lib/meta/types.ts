/**
 * Row shapes for the `meta_*` tables, and the rules for presenting them honestly.
 *
 * There is deliberately NO normalisation logic in this directory. The transform from a
 * third-party payload into `meta_*` rows lives once, in SQL, as `meta_load_spellbook_page` and
 * `meta_load_mtgjson_deck`. Every ingestion client calls those. A second copy in TypeScript
 * would eventually disagree with the first, and the way that failure surfaces is a corpus
 * quietly containing something it should never have contained.
 *
 * What lives here is the read side: types, and the presentation rules that stop a real number
 * from being rendered as a bigger claim than it is.
 */

/** Formats we hold decklists for. Aggregates are always scoped to one of these. */
export type MetaFormat = 'commander' | 'brawl' | 'constructed' | 'multiplayer';

export interface MetaInclusion {
  scope_kind: 'format' | 'commander';
  /** A format name, or a commander's oracle_id. */
  scope_key: string;
  /** Numerator: decks in scope that play this card. */
  decks_containing: number;
  /** Denominator: decks in scope at all. Never absent, by table constraint. */
  decks_in_scope: number;
  /** decks_containing / decks_in_scope. Stored, not recomputed on read. */
  inclusion_rate: number;
}

export interface MetaPartner {
  partner_oracle_id: string;
  scope_key: string;
  decks_together: number;
  decks_in_scope: number;
  /** Observed co-occurrence over what independence predicts. Above 1 is more than chance. */
  lift: number | null;
}

export interface MetaCombo {
  combo_id: string;
  identity: string | null;
  produces: string[];
  /** Commander Spellbook's OWN deck count, over THEIR corpus. Never ours. See labelCombo. */
  popularity: number | null;
  bracket_tag: string | null;
  piece_count: number;
}

/**
 * The sample size below which a proportion is not reported at all.
 *
 * Mirrors `public.meta_min_scope_decks()`. The database is the enforcement point: it simply
 * does not write rows for scopes under the threshold, so this constant exists to explain the
 * absence to a reader, not to filter anything a second time. If the two ever disagree, the
 * database wins.
 */
export const MIN_SCOPE_DECKS = 30;

/**
 * Turn an inclusion row into text a person can check.
 *
 * The rule this enforces: a percentage never appears without the count it came from. "Played in
 * 62% of decks" and "played in 62% of decks (118 of 190)" look similar and are not the same
 * claim. The first invites the reader to assume a corpus the size of EDHREC's. The second lets
 * them judge it, and is the difference between a figure that is defensible and one that is
 * merely confident.
 *
 * Returns null when there is no evidence. Callers must render that as an absent section, never
 * as "0%", which is a factual assertion we have not earned.
 */
export function describeInclusion(row: MetaInclusion | null | undefined): string | null {
  if (!row) return null;
  if (!Number.isFinite(row.decks_in_scope) || row.decks_in_scope <= 0) return null;
  if (!Number.isFinite(row.decks_containing) || row.decks_containing < 0) return null;

  const percent = Math.round((row.decks_containing / row.decks_in_scope) * 100);
  return `${percent}% of ingested ${row.scope_key} decks (${row.decks_containing} of ${row.decks_in_scope})`;
}

/**
 * Whether a scope is large enough to describe as evidence rather than as an observation.
 *
 * Kept separate from `describeInclusion` because the honest move at a small sample is to change
 * the wording, not to hide the number. A reader who can see "2 of 3 decks" is better served
 * than one shown nothing, provided nobody calls it a rate.
 */
export function isReportableScope(decksInScope: number): boolean {
  return Number.isFinite(decksInScope) && decksInScope >= MIN_SCOPE_DECKS;
}

/**
 * Attribution for a combo, which is a licence obligation and not decoration.
 *
 * Commander Spellbook's data is MIT licensed and their popularity figure is computed over their
 * corpus, not ours. Presenting it unlabelled next to a DeckMatrix-computed inclusion rate would
 * imply both came from the same place.
 */
export function labelComboPopularity(combo: MetaCombo): string | null {
  if (combo.popularity == null || !Number.isFinite(combo.popularity)) return null;
  return `${combo.popularity.toLocaleString()} decks on Commander Spellbook`;
}

export const COMBO_ATTRIBUTION = 'Combo data from Commander Spellbook';
export const DECK_ATTRIBUTION = 'Deck data from MTGJSON';
