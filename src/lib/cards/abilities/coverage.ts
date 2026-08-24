/**
 * Coverage measurement.
 *
 * The compiler's own numbers, computed the same way every time and honest about
 * which way they lean. Three counts matter and they are deliberately different:
 *
 *   - `cardsWithAnyAbility` — at least one `Ability` came out. Generous: a
 *     triggered ability whose whole body is `{do:'manual'}` counts, because the
 *     engine genuinely does know WHEN to fire it and can put a marked item on
 *     the stack. That is real, and it is still not automation.
 *   - `cardsWithAutomatedAbility` — at least one ability with no `{do:'manual'}`
 *     anywhere in it. This is the number to quote when someone asks "how much
 *     works".
 *   - `fullyCovered` — `coverage === 'full'`: nothing dropped, nothing manual,
 *     anywhere on the card.
 *
 * Quoting only the first would be the same dishonesty the design exists to
 * prevent, one level up.
 */

import type { Ability, CardAbilities, Effect, GapReason } from './dsl.ts';
import { effectsOf, hasManualEffect } from './dsl.ts';
import type { AbilityCard } from './normalize.ts';
import { assertClausesAccounted, compileWithTrace } from './compiler.ts';

export interface CoverageReport {
  cards: number;
  /** Rows whose normalised oracle text is empty — vanilla creatures, basic lands. */
  blank: number;
  cardsWithAnyAbility: number;
  cardsWithAutomatedAbility: number;
  fullyCovered: number;
  byCoverage: Record<string, number>;
  byAbilityKind: Record<string, number>;
  byRule: Record<string, number>;
  byGapReason: Record<GapReason | string, number>;
  /** `{do:'manual'}` hints, most common first — the vocabulary's to-do list. */
  byManualHint: Record<string, number>;
  totalAbilities: number;
  totalUnparsed: number;
  /** Cards where `assertClausesAccounted` threw. Must be zero. */
  accountingFailures: string[];
}

const bump = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };

function walkManualHints(effects: readonly Effect[], out: Record<string, number>): void {
  for (const e of effects) {
    if (e.do === 'manual') { bump(out, e.hint ?? '(no hint)'); continue; }
    if (e.do === 'if' || e.do === 'do-if-cost-paid') { walkManualHints(e.then, out); if (e.else) walkManualHints(e.else, out); }
    // `unless-pays` is in this list for the same reason the others are: an
    // effect member that nests effects and is not walked here is a `manual`
    // marker missing from the histogram — a to-do item nobody ever sees.
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') {
      walkManualHints(e.effects, out);
    }
    else if (e.do === 'choose-mode') for (const m of e.modes) walkManualHints(m.effects, out);
  }
}

/** True if the card has at least one ability with no manual marker anywhere in it. */
export function hasAutomatedAbility(card: CardAbilities): boolean {
  return card.abilities.some((a: Ability) => !hasManualEffect(effectsOf(a)));
}

/**
 * Compile a whole catalogue and report. `checkAccounting` runs the no-silent-drop
 * proof on every row; leave it on — it is the assertion the design leans on, and
 * it is cheap relative to compiling.
 */
export function measureCoverage(cards: readonly AbilityCard[], checkAccounting = true): CoverageReport {
  const report: CoverageReport = {
    cards: cards.length,
    blank: 0,
    cardsWithAnyAbility: 0,
    cardsWithAutomatedAbility: 0,
    fullyCovered: 0,
    byCoverage: {},
    byAbilityKind: {},
    byRule: {},
    byGapReason: {},
    byManualHint: {},
    totalAbilities: 0,
    totalUnparsed: 0,
    accountingFailures: [],
  };

  for (const card of cards) {
    const trace = compileWithTrace(card);
    const result = trace.result;

    if (checkAccounting) {
      try {
        assertClausesAccounted(trace);
      } catch (err) {
        report.accountingFailures.push(`${result.name}: ${(err as Error).message}`);
      }
    }

    if (!trace.normalized.text.trim()) report.blank++;
    if (result.abilities.length) report.cardsWithAnyAbility++;
    if (hasAutomatedAbility(result)) report.cardsWithAutomatedAbility++;
    if (result.coverage === 'full') report.fullyCovered++;

    bump(report.byCoverage, result.coverage);
    for (const a of result.abilities) {
      bump(report.byAbilityKind, a.kind);
      walkManualHints(effectsOf(a), report.byManualHint);
    }
    for (const rule of trace.ruleHits) bump(report.byRule, rule);
    for (const clause of result.unparsed) bump(report.byGapReason, clause.reason);

    report.totalAbilities += result.abilities.length;
    report.totalUnparsed += result.unparsed.length;
  }

  return report;
}

/** Sorted, truncated view of a histogram, for printing. */
export function topOf(hist: Record<string, number>, n = 25): Array<[string, number]> {
  return Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, n);
}
