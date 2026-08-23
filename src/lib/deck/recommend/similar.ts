/**
 * "Similar" means DOES A SIMILAR THING.
 *
 * The owner, 2026-08-23, about the card page: *"Card pages have recommendations
 * too - looks great, but results dont seem right"*. Measured in
 * `docs/design/ENGINE-PICKS.md` part one: 22 of 70 entries across the page's
 * five lists were genuinely similar, 31%. Every list matched a WORD.
 *
 * WHAT WAS ACTUALLY BROKEN, AND IT IS TWO THINGS
 * ----------------------------------------------
 * 1. **The pool.** Each tag probe ran `tags @> {tag} limit 60` with no
 *    `order by`, so Postgres handed back an arbitrary sixty rows out of 327
 *    and the ranking never saw the rest. For Counterspell all sixty scored
 *    exactly 6.32, so the fourteen shown were the sixty's most expensive.
 *    Mana Drain, Force of Will, Fierce Guardianship, Pact of Negation, Dovin's
 *    Veto and Negate carry the identical tags and none of them appeared.
 * 2. **The ranking.** Tag rarity cannot separate two cards that share the tag.
 *    Frost Titan is tagged `counterspell` because one of its abilities counters
 *    a spell that targets it. So is Counterspell. The tag cannot tell them
 *    apart and neither could the page.
 *
 * This module fixes the second and the caller fixes the first: the pool comes
 * in whole, and what comes out is ordered by what the two cards DO, read from
 * their ability records through `behaviourSimilarity`.
 *
 * THE FALLBACK IS AN ENTRY, NOT A DISAPPEARANCE
 * ---------------------------------------------
 * 7,589 of 31,833 commander-legal cards carry no ability record at all, and
 * some of them are the answer: Arcane Signet and Fellwar Stone are the two
 * cards a Sol Ring list most needs, and the oracle-text compiler reads neither.
 * A card with no record is therefore still ranked, on tags, and comes back
 * marked `basis: 'tags'` so the caller can say so on the tile rather than
 * present a word match as a behaviour match. It sorts below every card whose
 * record actually matched, because a real answer outranks a guess.
 *
 * Pure. No network, no database, no AI. The compiler call is the only
 * expensive part and it is linear in the pool.
 */

import { facetsForCard, type FacetInput } from './behaviour.ts';
import {
  behaviourSimilarity,
  describeSharedFacets,
  type Facet,
} from '../../../engine/knowledge/behaviour.ts';
import { sharedTagScore, sharedTags, signalTags } from '../../../engine/knowledge/tag-signal.ts';

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** A candidate row. Every field is a column on `cards` / `cards_unique`. */
export interface SimilarCard extends FacetInput {
  id?: string | null;
  name?: string | null;
  cmc?: number | string | null;
  tags?: string[] | null;
}

export interface SimilarEntry<T> {
  card: T;
  /** 0 to 1 for a record match; the tag score, unbounded, for a tag match. */
  score: number;
  /**
   * Which evidence produced this entry.
   *
   *   `record`  - both cards were read completely and share what they do.
   *   `partial` - they share what was read, and at least one record is short.
   *   `tags`    - one of the two has no record. This is the old signal, kept
   *               so the answer is not silently missing, and labelled so it is
   *               not silently trusted.
   */
  basis: 'record' | 'partial' | 'tags';
  /** The shared facets, heaviest first. Empty for a tag entry. */
  shared: readonly Facet[];
  /** The tile's one-line reason, built from `shared` or from the shared tags. */
  note: string;
}

export interface SimilarCensus {
  /** Rows handed in. */
  pool: number;
  /** Of those, how many carry an ability record at all. */
  withRecord: number;
  /** How many entries in the returned list were decided by a record. */
  byRecord: number;
  /** How many were decided by tags because a record was missing. */
  byTags: number;
}

export interface SimilarResult<T> {
  /**
   * The subject's own reading, so a caller can say whether it could speak.
   *
   * `reads` is that reading in plain English — "counters a spell", "adds mana,
   * costs nothing to use, 2 mana at a time" — built here rather than in the
   * component so a page cannot invent its own phrasing for a facet. A player
   * has to see what the ranking read before they can disagree with it.
   */
  subject: {
    facets: readonly Facet[];
    reads: string;
    source: 'compiler' | 'xmage' | 'none';
    coverage: string;
  };
  entries: SimilarEntry<T>[];
  census: SimilarCensus;
}

export interface SimilarOptions<T> {
  /** How many entries to return. Applied AFTER the whole pool is scored. */
  limit?: number;
  /** Ids or names already on the page, so one card is not shown twice. */
  exclude?: ReadonlySet<string>;
  /** Last tie break, when behaviour and mana value both tie. Market price, usually. */
  priceOf?: (card: T) => number | null;
}

/* ------------------------------------------------------------------ *
 * The ranking
 * ------------------------------------------------------------------ */

/**
 * A record match, however weak, beats a tag match, however strong.
 *
 * Not a weighting, a partition. The two numbers are not on the same scale:
 * `behaviourSimilarity` returns a bounded 0 to 1 and `sharedTagScore` returns
 * an unbounded sum of IDF weights, so adding them would let a rare tag drown a
 * real answer. Ordering them instead says what is actually true, which is that
 * one of these is evidence about the card and the other is evidence about our
 * tagger.
 */
const RECORD_TIER = 1;
const TAG_TIER = 0;

/**
 * Below this the overlap is one shape fact and nothing else - two instants,
 * two artifacts - and calling that "does the same thing" is the mistake this
 * whole module exists to stop making. Such a card drops to the tag tier, where
 * it is judged on the only other thing we know and labelled as such.
 *
 * 0.15 is where a single `type:` match lands for a subject of average facet
 * weight, and it is a declared position, not a fitted one.
 */
const MIN_RECORD_SCORE = 0.15;

/**
 * DOING THE SAME THING FOR MORE MANA IS NOT DOING THE SAME THING.
 *
 * This is not an invention of this file. `src/lib/cards/xmage/compare.ts`, the
 * port's own comparison, puts `manaValue` and `pipCount` first and grades them
 * `lowerIsBetter`, and its doc comment says an optimiser without them "cannot
 * tell Wrath of God from Damnation apart at all". The card page already says
 * the same thing out loud in its second section: "a mana value within one".
 *
 * AND IT IS ONE-SIDED, deliberately. A candidate cheaper than the subject is
 * not less similar, it is a better version of the same card, so it is not
 * penalised at all. Only paying MORE for the same behaviour costs anything
 * here. Measured on 2026-08-23 against the live catalogue, this is the rule
 * that puts Mana Crypt above a Dimir Signet on the Sol Ring page: both do
 * exactly what Sol Ring does, and one of them does it for two mana.
 *
 * A gap of `COST_HALF_LIFE` halves the score. Two is a declared position: it is
 * the difference between a one-mana rock and a three-mana rock, which is the
 * point at which a deckbuilder stops calling them the same card.
 */
const COST_HALF_LIFE = 2;

function costFactor(subjectCmc: number, candidateCmc: number): number {
  const over = candidateCmc - subjectCmc;
  if (over <= 0) return 1;
  return COST_HALF_LIFE / (COST_HALF_LIFE + over);
}

export function rankBySameBehaviour<T extends SimilarCard>(
  subject: SimilarCard,
  candidates: readonly T[],
  options: SimilarOptions<T> = {}
): SimilarResult<T> {
  const limit = options.limit ?? 14;
  const exclude = options.exclude ?? new Set<string>();
  const priceOf = options.priceOf ?? (() => null);

  const self = facetsForCard(subject);
  const subjectTags = signalTags(subject.tags);
  const subjectCmc = numberOf(subject.cmc);

  const scored: (SimilarEntry<T> & { tier: number; gap: number })[] = [];
  let withRecord = 0;

  for (const card of candidates) {
    if (isExcluded(card, exclude)) continue;

    const read = facetsForCard(card);
    const match = behaviourSimilarity({ facets: self.facets }, { facets: read.facets });
    const hasRecord = read.facets.some(f => f.startsWith('rec:'));
    if (hasRecord) withRecord += 1;

    const usableRecord = match.basis !== 'none' && match.score >= MIN_RECORD_SCORE;
    const gap = Math.abs(numberOf(card.cmc) - subjectCmc);

    if (usableRecord) {
      scored.push({
        card,
        score: match.score * costFactor(subjectCmc, numberOf(card.cmc)),
        basis: match.basis === 'record' ? 'record' : 'partial',
        shared: match.shared,
        note: recordNote(match.shared),
        tier: RECORD_TIER,
        gap,
      });
      continue;
    }

    /*
     * A POSITIVE NO, and it is the same rule `cardServesRole` runs on.
     *
     * Both records read their whole card and the two cards share nothing. That
     * is an answer, not a gap, so the candidate is dropped rather than demoted.
     * This is what keeps Counterspell's list free of the cards whose only claim
     * was the word `counterspell` in a tag array.
     */
    if (match.basis === 'record') continue;

    const tagScore = sharedTagScore(subjectTags, card.tags);
    if (tagScore <= 0) continue;
    scored.push({
      card,
      score: tagScore,
      basis: 'tags',
      shared: [],
      note: tagNote(subjectTags, card.tags, hasRecord),
      tier: TAG_TIER,
      gap,
    });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    if (a.score !== b.score) return b.score - a.score;
    // Two cards that do the same thing are separated by what they cost, which
    // is the next thing a deckbuilder asks and the only one of the remaining
    // axes that is about the card rather than about the market.
    if (a.gap !== b.gap) return a.gap - b.gap;
    return (priceOf(b.card) ?? 0) - (priceOf(a.card) ?? 0);
  });

  const entries = scored.slice(0, limit).map(({ card, score, basis, shared, note }) => ({
    card,
    score,
    basis,
    shared,
    note,
  }));

  return {
    subject: {
      facets: self.facets,
      reads: describeSharedFacets(verbFirst(self.facets), 4).join(', ') || 'only its type line',
      source: self.source,
      coverage: self.coverage,
    },
    entries,
    census: {
      pool: candidates.length,
      withRecord,
      byRecord: entries.filter(e => e.basis !== 'tags').length,
      byTags: entries.filter(e => e.basis === 'tags').length,
    },
  };
}

/**
 * Can this card's record speak at all?
 *
 * The caller needs this BEFORE it queries, because a subject with no record has
 * nothing to rank on and the honest answer is to leave the old tag group in
 * place rather than dress a tag list up as a behaviour list. Rite of Flame is
 * the case: the compiler returns `coverage: 'manual'` and no abilities, so its
 * only facet is `type:sorcery`.
 */
export function canReadBehaviour(card: SimilarCard): boolean {
  return facetsForCard(card).facets.some(f => f.startsWith('rec:'));
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

/**
 * "Also", not "Both".
 *
 * The phrases come out of the engine in the third person singular, because the
 * same table writes the SUBJECT's reading — "Sol Ring adds mana, 2 mana at a
 * time". Prefixing them with "Both" produced "Both counters a spell". "Also"
 * reads correctly against either, and one phrase table is worth more than two.
 */
function recordNote(shared: readonly Facet[]): string {
  const phrases = describeSharedFacets(shared, 3);
  if (phrases.length === 0) return 'Same card type, nothing else in common';
  return `Also ${phrases.join(', ')}`;
}

/**
 * Two different silences, and the tile says which.
 *
 * "No ability record" means the compiler produced nothing for this card at all.
 * "Record is incomplete" means it read some clauses and refused others, so the
 * card may well do the same thing and we cannot see it. Collapsing the two into
 * one phrase would be the same mistake as collapsing Wrath of God and Armageddon
 * into one `DestroyAllEffect`.
 */
function tagNote(
  subjectTags: readonly string[],
  tags: readonly string[] | null | undefined,
  candidateHasRecord: boolean
): string {
  const head = candidateHasRecord ? 'Record is incomplete' : 'No ability record';
  const words = sharedTags(subjectTags, tags).slice(0, 3).join(', ');
  return words ? `${head}. Tagged ${words}` : head;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/**
 * Verb, then arguments, then magnitudes.
 *
 * Facets arrive sorted alphabetically, which reads as "Sol Ring costs nothing
 * to use, adds mana, 2 mana at a time". A sentence about a card starts with
 * what the card does.
 */
const READING_ORDER = ['eff:', 'scope:', 'cares:', 'mana:', 'acost:', 'ctr:', 'tok:', 'trig:'];

function verbFirst(facets: readonly Facet[]): Facet[] {
  const rank = (f: Facet) => {
    const i = READING_ORDER.findIndex(p => f.startsWith(p));
    return i < 0 ? READING_ORDER.length : i;
  };
  return [...facets].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function numberOf(value: number | string | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Keyed on the oracle id AND the name, the same rule `CardRelated` dedupes by,
 * because `cards` holds two distinct oracle ids named "Black Lotus".
 */
function isExcluded(card: SimilarCard, exclude: ReadonlySet<string>): boolean {
  if (card.oracle_id && exclude.has(`id:${card.oracle_id}`)) return true;
  if (card.name && exclude.has(`name:${card.name}`)) return true;
  return false;
}
