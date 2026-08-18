/**
 * DeckMatrix — the card-ability DSL: coverage and clause accounting.
 *
 * "What does the engine actually do?" should be a query, not an opinion. This
 * module makes it one.
 *
 * ## Clause accounting is the anti-silent-no-op proof
 *
 * `assertClausesAccounted` checks that the spans of every compiled ability plus
 * the spans of every `UnparsedClause` cover the whole normalised oracle text.
 * A clause the compiler quietly dropped fails this check, so a dropped clause
 * is a failing TEST rather than a card that mysteriously does nothing at a
 * table three weeks later. It is the same discipline `tagger.ts` uses to keep
 * its TypeScript and SQL in step: prove the property, do not rely on care.
 */

import type { CardAbilities, GapReason, Coverage } from './dsl.ts';
import { GAP_REASONS } from './dsl.ts';
import type { CompileInput } from './compiler.ts';
import { compile, normaliseOracle, splitClauses } from './compiler.ts';
import { abilityNeedsManual } from './registry.ts';

/* -------------------------------------------------------------------------- */
/* Accounting                                                                 */
/* -------------------------------------------------------------------------- */

export interface AccountingResult {
  ok: boolean;
  /** Character ranges of the normalised text that reached neither path. */
  gaps: Array<[number, number]>;
  /** The text of those ranges, for the failure message. */
  dropped: string[];
  normalised: string;
}

/**
 * Prove that every character of a card's oracle text was either compiled into
 * an ability or recorded as an unparsed clause.
 *
 * Whitespace-only ranges are covered by definition: a blank line carries no
 * rules text and there is nothing to lose.
 */
export function accountClauses(input: CompileInput): AccountingResult {
  const normalised = normaliseOracle(input);
  const record = compile(input);

  const covered: boolean[] = new Array(normalised.length).fill(false);

  const mark = (start: number, end: number) => {
    for (let i = Math.max(0, start); i < Math.min(normalised.length, end); i++) covered[i] = true;
  };

  for (const clause of record.unparsed) mark(clause.span[0], clause.span[1]);

  // A segment that produced at least one ability is consumed. Abilities carry
  // their verbatim clause text, so the segment they came from is found by text
  // rather than by a span the builder had to remember to record — one fewer
  // place for the accounting to be wrong in the same way the compiler is.
  const producedTexts = new Set(record.abilities.map(ability => ability.text));
  for (const segment of splitClauses(normalised)) {
    if (!segment.text) {
      mark(segment.start, segment.end);
      continue;
    }
    const wasCompiled =
      producedTexts.has(segment.text) ||
      record.abilities.some(ability => segment.text.includes(ability.text));
    if (wasCompiled) mark(segment.start, segment.end);
  }

  const gaps: Array<[number, number]> = [];
  const dropped: string[] = [];
  let runStart = -1;

  for (let i = 0; i <= normalised.length; i++) {
    const isCovered = i === normalised.length ? true : covered[i];
    if (!isCovered && runStart === -1) runStart = i;
    if (isCovered && runStart !== -1) {
      const text = normalised.slice(runStart, i);
      if (text.trim().length > 0) {
        gaps.push([runStart, i]);
        dropped.push(text.trim());
      }
      runStart = -1;
    }
  }

  return { ok: gaps.length === 0, gaps, dropped, normalised };
}

/** Throws with the dropped text quoted. Used by the compiler test suite. */
export function assertClausesAccounted(input: CompileInput): void {
  const result = accountClauses(input);
  if (result.ok) return;
  throw new Error(
    `${input.name}: ${result.dropped.length} clause(s) reached neither an ability nor the unparsed list:\n` +
      result.dropped.map(text => `  - "${text}"`).join('\n')
  );
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

export interface CoverageReport {
  total: number;
  byCoverage: Record<Coverage, number>;
  byGapReason: Record<GapReason, number>;
  /** Cards whose every clause was modelled. */
  fullyAutomated: string[];
  /** Cards that run some of their text — the loud category. */
  partial: string[];
}

function emptyReport(): CoverageReport {
  const byGapReason = {} as Record<GapReason, number>;
  for (const reason of GAP_REASONS) byGapReason[reason] = 0;
  return {
    total: 0,
    byCoverage: { full: 0, partial: 0, manual: 0, none: 0 },
    byGapReason,
    fullyAutomated: [],
    partial: [],
  };
}

/**
 * Histogram a set of card records.
 *
 * `partial` is the category that matters. A card the engine does not touch at
 * all is obvious to the player; a card that half-resolved is the one they
 * assume was handled, which is the original complaint this work answers.
 */
export function coverageReport(records: readonly CardAbilities[]): CoverageReport {
  const report = emptyReport();

  for (const record of records) {
    report.total += 1;
    report.byCoverage[record.coverage] += 1;
    for (const clause of record.unparsed) report.byGapReason[clause.reason] += 1;
    if (record.coverage === 'full') report.fullyAutomated.push(record.name);
    if (record.coverage === 'partial') report.partial.push(record.name);
  }

  return report;
}

/**
 * One line for a badge or a tooltip. Never empty, and never claims more than
 * `coverage` allows.
 */
export function coverageSummary(record: CardAbilities): string {
  const manualCount = record.abilities.filter(abilityNeedsManual).length;

  switch (record.coverage) {
    case 'none':
      return 'No rules text — nothing to resolve.';
    case 'full':
      return `Fully automated (${record.abilities.length} abilit${record.abilities.length === 1 ? 'y' : 'ies'}).`;
    case 'partial': {
      const parts: string[] = [];
      if (record.unparsed.length > 0) {
        parts.push(`${record.unparsed.length} clause${record.unparsed.length === 1 ? '' : 's'} not modelled`);
      }
      if (manualCount > 0) {
        parts.push(`${manualCount} abilit${manualCount === 1 ? 'y' : 'ies'} partly manual`);
      }
      return `Partly automated — ${parts.join(', ')}. Resolve the rest by hand.`;
    }
    case 'manual':
      return 'The engine resolves none of this card — resolve it by hand.';
    default:
      return 'Unknown coverage.';
  }
}
