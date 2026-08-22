/**
 * Coverage, reported as four numbers because there are four consumers.
 *
 * Measures records derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The XMage clone is read in place and nothing from it is vendored. Forge is
 * GPL-3.0 and was not fetched, read or referenced.
 *
 * ## `searchable` is the weakest of the four and the easiest to over-read
 *
 * It asks only whether the card has AT LEAST ONE structural facet, and every
 * effect contributes its own class name as one. So a card whose arguments all
 * refused still counts, on the strength of a class name — which is what the
 * import-based extraction already had, and what the 22 Aug settlement called a
 * fingerprint rather than a recipe. Measured over the corpus: 29,618 cards are
 * searchable and 17,739 of them, 59.9%, carry nothing beyond the effect and
 * trigger class names. Quote it with that sentence attached or do not quote it.
 *
 * ## Why one number is always wrong here
 *
 * Coverage has been overstated twice on this project. The first was 95.7%
 * measured over the first 12,000 rows of a 34,088 row catalogue. The second was
 * 59.26%, which counted a card as automated when ONE of its abilities compiled.
 * Both were single numbers, and a single number has to pick one consumer's
 * question and then gets quoted as if it answered all four.
 *
 * The four questions are genuinely different and a card can pass one and fail
 * another:
 *
 *   playable       can the reducer run every ability of every face
 *   aggregatable   can a deck builder say what this does for a list
 *   searchable     can an index return it for a structural query
 *   comparable     can it be ranked against another card that does the same job
 *
 * Dockside Extortionist is a worked example of the split. Its token count is a
 * card-local `DynamicValue`, so it is NOT playable. It creates Treasure tokens,
 * which is enough to be aggregatable as ramp with an unknown magnitude,
 * searchable on `effect=create-token produces=treasure-token`, and comparable
 * against other Treasure makers on everything except how many.
 *
 * Reporting that as "one card, 25% covered" would be arithmetic on four
 * unrelated things. Reporting it as four booleans is what it is.
 *
 * ## The rule about denominators
 *
 * Every function here takes the records it counts and returns the count with
 * the denominator attached. There is no way to call one of these and get a
 * percentage without also getting what it was a percentage of.
 */

import {
  type AbilityRecord,
  type CardRecord,
  type Slot,
  type SlotState,
  abilitiesOf,
  slotState,
  slotsInAbility,
  slotsInRecord,
} from './record.ts';
import { type RoleRule, ROLE_RULES, facetsOf, rolesOf } from './roles.ts';
import { type Lowering, LOWERINGS, lowerCard } from './lower.ts';
import { comparisonClasses } from './compare.ts';
import type { PrimId } from './record.ts';

/* ------------------------------------------------------------------ *
 * The slot census
 * ------------------------------------------------------------------ */

export interface SlotCensus {
  total: number;
  value: number;
  carried: number;
  hole: number;
}

export function censusOf(slots: readonly Slot[]): SlotCensus {
  const census: SlotCensus = { total: 0, value: 0, carried: 0, hole: 0 };
  for (const slot of slots) {
    census.total += 1;
    census[slotState(slot) as SlotState] += 1;
  }
  return census;
}

export function addCensus(a: SlotCensus, b: SlotCensus): SlotCensus {
  return {
    total: a.total + b.total,
    value: a.value + b.value,
    carried: a.carried + b.carried,
    hole: a.hole + b.hole,
  };
}

/* ------------------------------------------------------------------ *
 * The four answers, per card
 * ------------------------------------------------------------------ */

export interface CardCoverage {
  oracleId: string;
  name: string;
  slots: SlotCensus;
  /** Every ability of every face lowers completely. */
  playable: boolean;
  /** Playable because it has no abilities at all. True but not progress; counted separately. */
  vacuous: boolean;
  /** At least one role, and that role's magnitude is not unknown. */
  aggregatable: boolean;
  /** Roles assigned but at least one magnitude is a hole. Useful, and not the same as aggregatable. */
  aggregatablePartly: boolean;
  /** At least one structural facet beyond the card's own name. */
  searchable: boolean;
  /** The comparison classes this card can be ranked inside. */
  comparable: string[];
  /** Primitives that block play, so a per-card answer rolls up into a work order. */
  blockedBy: PrimId[];
  /**
   * Why play is blocked when no primitive is missing: an unresolved intervening
   * if, a static helper, a lowering that refused these arguments. Without this,
   * a card can read `playable: false, blockedBy: []`, which looks like a bug and
   * is really a hole with nobody's name on it. Battle of Wits is that card.
   */
  blockedByReason: string[];
}

export function coverageOf(
  record: CardRecord,
  options: { rules?: RoleRule[]; table?: Record<PrimId, Lowering> } = {},
): CardCoverage {
  const rules = options.rules ?? ROLE_RULES;
  const table = options.table ?? LOWERINGS;

  const lowered = lowerCard(record, table);
  const roles = rolesOf(record, rules);
  const facets = facetsOf(record, rules);
  const classes = comparisonClasses(record);

  const missing: PrimId[] = [];
  const reasons: string[] = [];
  for (const entry of lowered.blocked) {
    missing.push(...entry.result.missing);
    for (const r of entry.result.refused) reasons.push(`${r.prim}: ${r.why}`);
  }
  const blockedBy: PrimId[] = Array.from(new Set(missing));
  const blockedByReason: string[] = Array.from(new Set(reasons));

  return {
    oracleId: record.oracleId,
    name: record.name,
    slots: censusOf(slotsInRecord(record)),
    playable: lowered.ok && !lowered.vacuous,
    vacuous: lowered.ok && lowered.vacuous,
    aggregatable: roles.length > 0 && roles.every((r) => r.scale.s !== 'unknown'),
    aggregatablePartly: roles.length > 0,
    searchable: facets.length > 0,
    comparable: classes.map((c) => c.key),
    blockedBy,
    blockedByReason,
  };
}

/* ------------------------------------------------------------------ *
 * Rolling up
 * ------------------------------------------------------------------ */

export interface CoverageReport {
  /** Stated on every report so a figure cannot be quoted without it. */
  denominator: number;
  denominatorMeaning: string;
  measuredAt: string;
  playable: number;
  /** Cards with no abilities. Never added to `playable`; reported so the gap is visible. */
  vacuous: number;
  aggregatable: number;
  aggregatablePartly: number;
  searchable: number;
  comparable: number;
  slots: SlotCensus;
  /** Cards blocked, by the primitive that blocks them, most first. */
  workOrder: Array<{ prim: PrimId; cards: number }>;
}

export function reportCoverage(
  records: readonly CardRecord[],
  denominatorMeaning: string,
  options: { rules?: RoleRule[]; table?: Record<PrimId, Lowering>; now?: string } = {},
): CoverageReport {
  const report: CoverageReport = {
    denominator: records.length,
    denominatorMeaning,
    measuredAt: options.now ?? new Date().toISOString(),
    playable: 0,
    vacuous: 0,
    aggregatable: 0,
    aggregatablePartly: 0,
    searchable: 0,
    comparable: 0,
    slots: { total: 0, value: 0, carried: 0, hole: 0 },
    workOrder: [],
  };

  const blockers = new Map<PrimId, Set<string>>();

  for (const record of records) {
    const coverage = coverageOf(record, options);
    if (coverage.playable) report.playable += 1;
    if (coverage.vacuous) report.vacuous += 1;
    if (coverage.aggregatable) report.aggregatable += 1;
    if (coverage.aggregatablePartly) report.aggregatablePartly += 1;
    if (coverage.searchable) report.searchable += 1;
    if (coverage.comparable.length > 0) report.comparable += 1;
    report.slots = addCensus(report.slots, coverage.slots);
    for (const prim of coverage.blockedBy) {
      if (!blockers.has(prim)) blockers.set(prim, new Set());
      blockers.get(prim)!.add(record.oracleId);
    }
  }

  report.workOrder = [...blockers.entries()]
    .map(([prim, ids]) => ({ prim, cards: ids.size }))
    .sort((a, b) => b.cards - a.cards);

  return report;
}

/**
 * The per-ability census, so "which ability of this card is the problem" is
 * answerable without re-deriving it.
 */
export function abilityCensus(ability: AbilityRecord): SlotCensus {
  return censusOf(slotsInAbility(ability));
}

/** Every ability of a card with its own census. Reads nothing the walkers do not. */
export function censusByAbility(record: CardRecord): Array<{ id: string; census: SlotCensus }> {
  return abilitiesOf(record).map((a) => ({ id: a.id, census: abilityCensus(a) }));
}
