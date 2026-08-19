/**
 * The acceptance pipeline for model-produced ability JSON.
 *
 * One card in, one verdict out, through five gates in a fixed order. The order
 * is not arbitrary — each gate is meaningless unless the ones before it passed:
 *
 *   1. **transport** — is this even the shape of an answer about this card?
 *   2. **schema**    — does every ability satisfy the DSL, with no unknown field
 *                      and no coerced number? (`validate.ts`)
 *   3. **verbatim**  — did the model QUOTE the card, or write about it? Every
 *                      `text` must be findable in the oracle text, and between
 *                      them they must account for all of it. Running the round
 *                      trip before this would be worthless: the oracle side is
 *                      reduced by the spans declared unparsed, so a paraphrased
 *                      "unparsed" span could delete text that was never there
 *                      and make an incomplete answer look complete.
 *   4. **roundtrip** — render the DSL back to English and diff it against the
 *                      oracle text the model claimed. (`roundtrip.ts`)
 *   5. **behaviour** — run it on a real board and refuse anything that throws or
 *                      resolves to silence. (`behaviour-probe.ts`)
 *
 * ## What this module refuses to let the model decide
 *
 * `id`, `confidence`, `span`, `coverage` and `source` are assigned here, never
 * read from the answer.
 *
 * `confidence` is set to `'approximate'` unconditionally, for every card, for
 * ever. The DSL defines `'approximate'` as "still runs, but the runtime logs
 * that it is an approximation", and that is the true description of anything a
 * language model wrote, including the ones that pass all five gates. Letting the
 * model claim `'exact'` — or inferring it from a clean round trip — would put a
 * confidence label on the engine's output that no measurement here supports.
 *
 * `coverage` is DERIVED by `deriveCoverage`, which is the same function the
 * hand-written compiler goes through. There is deliberately no path by which a
 * card can be marked fully covered while a clause sits in `unparsed`.
 */

import type { Ability, CardAbilities, Coverage, UnparsedClause } from './dsl.ts';
import { deriveCoverage } from './dsl.ts';
import type { AbilityCard } from './normalize.ts';
import { normalizeCard, normalizeParagraph, selfNames } from './normalize.ts';
import { validateAbilities, validateUnparsed, type ValidationError } from './validate.ts';
import { checkVerbatim, describeRoundTrip, roundTrip, type RoundTripVerdict } from './roundtrip.ts';
import { probeBehaviour, type BehaviourVerdict } from '../../game/abilities/behaviour-probe.ts';

export type AcceptStage = 'transport' | 'schema' | 'verbatim' | 'roundtrip' | 'behaviour' | 'accepted';

export interface NeededPrimitive {
  primitive: string;
  why: string;
}

export interface AcceptOutcome {
  oracleId: string;
  name: string;
  /** Hash of the NORMALISED oracle text. A card whose text moves is recompiled. */
  oracleHash: string;
  /** The first gate that failed, or `'accepted'`. */
  stage: AcceptStage;
  accepted: boolean;
  /** Non-null only when accepted. A rejected card never contributes DSL. */
  card: CardAbilities | null;
  /**
   * Present whether or not the card was accepted. The clauses a model could not
   * express are useful even when the ones it could express were wrong — they are
   * the raw material of the build list.
   */
  unparsed: UnparsedClause[];
  needs: NeededPrimitive[];
  coverage: Coverage | null;
  /**
   * True only when coverage is `'full'` AND the behaviour probe ran every
   * ability with nothing deferred. This is the AUTOMATED number's contribution
   * from this card, and it is a different and much smaller thing than `accepted`.
   */
  automatable: boolean;
  detail: {
    reason?: string;
    schemaErrors?: ValidationError[];
    verbatimNotFound?: string[];
    verbatimUnaccounted?: string[];
    roundTrip?: Omit<RoundTripVerdict, 'rendered' | 'claimed'> & { rendered?: string; summary?: string };
    behaviour?: Omit<BehaviourVerdict, 'perAbility'>;
  };
}

/** A model answer, before anything has been checked about it. */
export interface RawModelResult {
  oracle_id?: unknown;
  abilities?: unknown;
  unparsed?: unknown;
  needs?: unknown;
}

const fail = (
  base: Pick<AcceptOutcome, 'oracleId' | 'name' | 'oracleHash'>,
  stage: AcceptStage,
  detail: AcceptOutcome['detail'],
  unparsed: UnparsedClause[] = [],
  needs: NeededPrimitive[] = [],
): AcceptOutcome => ({
  ...base,
  stage,
  accepted: false,
  card: null,
  unparsed,
  needs,
  coverage: null,
  automatable: false,
  detail,
});

/**
 * `needs` never rejects a card. It is commentary the model was asked for, and a
 * malformed entry is dropped rather than allowed to sink an otherwise good
 * compilation. The identifier shape is enforced because the whole value of the
 * field is that the same capability gets the same name across 34,000 cards, and
 * free-text would aggregate into nothing.
 */
const PRIMITIVE_ID = /^[a-z][A-Za-z0-9]{2,48}$/;

export function readNeeds(value: unknown): NeededPrimitive[] {
  if (!Array.isArray(value)) return [];
  const out: NeededPrimitive[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const primitive = String((entry as Record<string, unknown>).primitive ?? '').trim();
    const why = String((entry as Record<string, unknown>).why ?? '').trim();
    if (!PRIMITIVE_ID.test(primitive) || seen.has(primitive)) continue;
    seen.add(primitive);
    out.push({ primitive, why: why.slice(0, 240) });
  }
  return out;
}

export function acceptModelResult(card: AbilityCard, raw: unknown): AcceptOutcome {
  const normalized = normalizeCard(card);
  const base = {
    oracleId: String(card.oracle_id ?? card.id ?? card.name ?? ''),
    name: String(card.name ?? ''),
    oracleHash: normalized.hash,
  };
  const oracleText = String(card.oracle_text ?? '');
  const needs = readNeeds((raw as RawModelResult | null)?.needs);

  /* ---------------------------------------------------------- transport */

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail(base, 'transport', { reason: 'result is not an object' }, [], needs);
  }
  const result = raw as RawModelResult;
  if (!Array.isArray(result.abilities)) {
    return fail(base, 'transport', { reason: '"abilities" is missing or not an array' }, [], needs);
  }
  if (result.unparsed !== undefined && !Array.isArray(result.unparsed)) {
    return fail(base, 'transport', { reason: '"unparsed" is present but not an array' }, [], needs);
  }

  /* ------------------------------------------------------------- schema */

  const abilityCheck = validateAbilities(result.abilities);
  const unparsedCheck = validateUnparsed(result.unparsed ?? []);
  if (!abilityCheck.ok || !unparsedCheck.ok) {
    return fail(
      base,
      'schema',
      { schemaErrors: [...abilityCheck.errors, ...unparsedCheck.errors].slice(0, 25) },
      [],
      needs,
    );
  }

  // Ids and confidence are ours. Assigned before anything downstream sees them
  // so no later stage can be reading a value the model chose.
  const abilities: Ability[] = abilityCheck.value.map((ability, index) => ({
    ...ability,
    id: `a${index}`,
    confidence: 'approximate' as const,
  }));

  /* ----------------------------------------------------------- verbatim */

  const quoted = [...abilities.map((a) => a.text), ...unparsedCheck.value.map((c) => c.text)];
  const verbatim = checkVerbatim(quoted, oracleText);
  if (!verbatim.ok) {
    return fail(
      base,
      'verbatim',
      { verbatimNotFound: verbatim.notFound.slice(0, 8), verbatimUnaccounted: verbatim.unaccounted.slice(0, 20) },
      [],
      needs,
    );
  }

  // Spans are ours too, and they are computed against the NORMALISED text
  // because that is what `UnparsedClause.span` indexes. A clause that cannot be
  // located there is a verbatim failure, not a zero span: `[0,0]` would claim a
  // position the clause does not occupy and quietly satisfy the accounting
  // assertion the compiler leans on.
  const names = selfNames(card);
  const unparsed: UnparsedClause[] = [];
  for (const clause of unparsedCheck.value) {
    const needle = normalizeParagraph(clause.text, names);
    const at = needle ? normalized.text.indexOf(needle) : -1;
    if (at < 0) {
      return fail(
        base,
        'verbatim',
        { reason: `unparsed clause could not be located in the normalised text: ${JSON.stringify(clause.text.slice(0, 80))}` },
        [],
        needs,
      );
    }
    unparsed.push({ text: clause.text, reason: clause.reason, span: [at, at + needle.length] });
  }

  /* ---------------------------------------------------------- roundtrip */

  const trip = roundTrip(abilities, unparsed, oracleText, card);
  if (!trip.ok) {
    return fail(
      base,
      'roundtrip',
      {
        roundTrip: {
          ok: false,
          invented: trip.invented,
          dropped: trip.dropped,
          rendered: trip.rendered.slice(0, 400),
          summary: describeRoundTrip(trip),
        },
      },
      unparsed,
      needs,
    );
  }

  /* ---------------------------------------------------------- behaviour */

  const behaviour = probeBehaviour(abilities);
  const behaviourDetail = {
    outcome: behaviour.outcome,
    ok: behaviour.ok,
    actions: behaviour.actions,
    deferred: behaviour.deferred.slice(0, 6),
    error: behaviour.error,
  };
  if (!behaviour.ok) {
    return fail(base, 'behaviour', { behaviour: behaviourDetail }, unparsed, needs);
  }

  /* ----------------------------------------------------------- accepted */

  const coverage = deriveCoverage(abilities, unparsed);

  return {
    ...base,
    stage: 'accepted',
    accepted: true,
    card: {
      oracleId: base.oracleId,
      name: base.name,
      abilities,
      unparsed,
      // `'book'` is the DSL's word for "authored outside the oracle-text
      // compiler". These rows did not come from `compiler.ts` and must never be
      // mistaken for rows that did.
      source: unparsed.length === 0 ? 'book' : 'book-partial',
      oracleHash: base.oracleHash,
      coverage,
    },
    unparsed,
    needs,
    coverage,
    automatable: coverage === 'full' && behaviour.outcome === 'ran',
    detail: { behaviour: behaviourDetail, roundTrip: { ok: true, invented: trip.invented, dropped: trip.dropped } },
  };
}
