/**
 * scripts/coverage/llm/compile.ts — the batch pipeline.
 *
 *   node --experimental-strip-types scripts/coverage/llm/compile.ts \
 *        --run <run_token> [--sample 500] [--batch 8] [--dry] [--seed 1]
 *
 * ## What this is, in one line
 *
 * A ONE-TIME batch over cards our own compiler cannot fully represent, asking a
 * model for DSL, validating every answer through five gates, and caching what
 * survives in Postgres keyed by `oracle_id` + the oracle text hash.
 *
 * ## What it is NOT, and this matters more than what it is
 *
 * It is not a runtime dependency, and nothing it builds may become one. The
 * scanner's per-scan vision model is being removed for cost, and a per-request
 * model call arriving through a different door would be the same mistake with a
 * new name. The re-run cost of this pipeline is "the cards in the next set", not
 * "every card, every time somebody opens a deck".
 *
 * ## Nothing reads `llm_ability_compilations` yet. Stated as fact, not intent.
 *
 * As of 19 Aug 2026 the app has NO read path to that table. `abilitiesFor()` in
 * `src/lib/game/abilities/card-abilities.ts` calls `compileCardAbilities` and
 * nothing else, so not one model-produced ability reaches a game. That is why
 * "can something claim to be automated when it is not?" currently answers no —
 * and it answers no because there is no reader, not because a reader is safe.
 *
 * Whoever writes the first reader owns these preconditions:
 *   - run `validateAbilities()` over the `abilities` column before the engine
 *     sees it. The column is opaque `jsonb`; `dsl-compile-store` holds no copy
 *     of the validator and cannot have checked it;
 *   - honour `source: 'book' | 'book-partial'`, which exists precisely so these
 *     rows are never mistaken for `compiler.ts` output;
 *   - keep `confidence: 'approximate'`, which the harness stamps on every row it
 *     accepts, no matter how cleanly it passed;
 *   - count a card toward AUTOMATED only on the terms `behaviour-probe.ts` uses
 *     (coverage 'full' AND every ability actually ran). ACCEPTED is a
 *     REPRESENTABLE figure and is much larger.
 *
 * ## Resumability, and the bug it is guarding against
 *
 * The run's pointer lives in `llm_compile_runs.cursor` and is advanced only
 * after a batch's rows are actually WRITTEN — never after they are merely
 * requested, because a batch that dies between the model answering and the rows
 * landing must be re-run, and pointing at a card whose result was never saved is
 * how a resumable job silently skips work.
 *
 * The completion path clears the pointer. That is enforced in three independent
 * places: `completionPatch()` here, the `dsl-compile-store` function, and a
 * CHECK constraint on the table itself. A completion path that did not clear its
 * pointer froze this project's card sync for months.
 *
 * ## Getting a run token
 *
 * Minting one is an admin act and is deliberately not automated:
 *
 *   insert into public.llm_compile_runs
 *     (label, model, prompt_version, batch_size, max_calls, expires_at)
 *   values ('sample-500', 'google/gemini-2.5-flash', '<PROMPT_VERSION>', 8, 80,
 *           now() + interval '6 hours')
 *   returning run_token;
 *
 * `max_calls` is a hard budget the edge function charges before every model
 * call, so a leaked token can spend at most what its owner chose.
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileWithTrace } from '../../../src/lib/cards/abilities/compiler.ts';
import { normalizeCard, type AbilityCard } from '../../../src/lib/cards/abilities/normalize.ts';
import { acceptModelResult, type AcceptOutcome } from '../../../src/lib/cards/abilities/llm-accept.ts';
import { PROMPT_VERSION, SYSTEM_PROMPT } from '../../../src/lib/cards/abilities/llm-prompt.ts';
import { oracleHash } from '../../../src/lib/cards/abilities/normalize.ts';
import {
  advancePatch, batchedByBudget, completionPatch, failurePatch, resumeFrom,
} from '../../../src/lib/cards/abilities/llm-run-state.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });
const CATALOGUE = join(here, '..', '.data', 'catalogue.json');

/* ------------------------------------------------------------------ *
 * Arguments and environment
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const RUN_TOKEN = arg('--run', '');
const SAMPLE = Number(arg('--sample', '500'));
const BATCH = Number(arg('--batch', '8'));
/**
 * The summed-oracle-text budget per call, in characters. See `batchedByBudget`.
 *
 * A batch is closed when EITHER cap is reached. `--batch` alone is not enough:
 * the first 500-card run lost 24 of 64 cards because eight Sagas in one call
 * overran the output ceiling and truncated the JSON, and eight Sagas look
 * identical to eight one-liners if you are only counting cards.
 *
 * 1200 is deliberately conservative — roughly 300 input tokens of oracle text
 * per call. Raise it and `--batch` together; the two caps are what make raising
 * `--batch` (the largest cost lever, since the ~4,300-token system prompt is
 * charged once per call) safe rather than a way to reintroduce truncation.
 */
const CHARS = Number(arg('--chars', '1200'));
const SEED = Number(arg('--seed', '1'));
const DRY = flag('--dry');
const MODEL = arg('--model', 'google/gemini-2.5-flash');
const RETRIES = Number(arg('--retries', '40'));

/** Linear to 30s, then flat. Long enough to outlast an outage, short enough to
 *  notice a recovery within half a minute of it happening. */
const backoffMs = (attempt: number): number => Math.min(30_000, 3000 * attempt);

if (!DRY && !RUN_TOKEN) throw new Error('--run <run_token> is required (or --dry to select cards only)');

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing');

/* ------------------------------------------------------------------ *
 * Candidate selection
 *
 * "Cards with no confident compiled abilities" is the brief. That is exactly
 * `coverage !== 'full'` from our own compiler: anything else already has a
 * hand-written, tested representation and asking a model about it would spend
 * tokens to arrive where we already are.
 *
 * The sample is STRATIFIED across difficulty rather than drawn uniformly,
 * because a uniform draw from this population is dominated by short cards and
 * would report a pass rate that says nothing about the cards the exercise exists
 * for. Difficulty here is normalised-text length, which the XMage spike measured
 * as an almost perfect predictor of how hard a card is to represent (0% bespoke
 * code below 45 lines, 96.6% above 80).
 * ------------------------------------------------------------------ */

interface Candidate {
  card: AbilityCard & { id: string };
  oracleId: string;
  hash: string;
  chars: number;
  compilerCoverage: string;
  tier: string;
}

/** Deterministic, order-independent, seedable. Same sample every run. */
function hash32(text: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

const TIERS: Array<{ name: string; max: number; share: number }> = [
  { name: 't1-tiny',   max: 60,       share: 0.15 },
  { name: 't2-short',  max: 120,      share: 0.25 },
  { name: 't3-medium', max: 220,      share: 0.30 },
  { name: 't4-long',   max: 380,      share: 0.20 },
  { name: 't5-huge',   max: Infinity, share: 0.10 },
];

function tierOf(chars: number): string {
  for (const tier of TIERS) if (chars <= tier.max) return tier.name;
  return TIERS[TIERS.length - 1].name;
}

function selectCandidates(): Candidate[] {
  if (!existsSync(CATALOGUE)) {
    throw new Error(`no cached catalogue at ${CATALOGUE}; run scripts/coverage/dsl-coverage.ts first`);
  }
  const cached = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as {
    fetchedAt: string;
    rows: Array<AbilityCard & { id: string }>;
  };
  console.log(`catalogue: ${cached.rows.length} printings (fetched ${cached.fetchedAt})`);

  const seen = new Set<string>();
  const pool: Candidate[] = [];
  let alreadyFull = 0;
  let blank = 0;

  for (const row of cached.rows) {
    const oracleId = row.oracle_id;
    if (!oracleId || seen.has(oracleId)) continue;
    seen.add(oracleId);

    const normalized = normalizeCard(row);
    if (!normalized.text.trim()) { blank++; continue; }

    const result = compileWithTrace(row).result;
    if (result.coverage === 'full') { alreadyFull++; continue; }

    pool.push({
      card: row,
      oracleId,
      hash: normalized.hash,
      chars: normalized.text.length,
      compilerCoverage: result.coverage,
      tier: tierOf(normalized.text.length),
    });
  }

  console.log(
    `distinct oracle_id ${seen.size} · blank ${blank} · already 'full' ${alreadyFull} · candidates ${pool.length}`,
  );

  if (!Number.isFinite(SAMPLE) || SAMPLE <= 0 || SAMPLE >= pool.length) {
    return pool.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  }

  const picked: Candidate[] = [];
  for (const tier of TIERS) {
    const want = Math.round(SAMPLE * tier.share);
    const inTier = pool
      .filter((c) => c.tier === tier.name)
      .sort((a, b) => hash32(a.oracleId, SEED) - hash32(b.oracleId, SEED));
    picked.push(...inTier.slice(0, want));
    console.log(`  ${tier.name.padEnd(10)} pool ${String(inTier.length).padStart(6)}  sampled ${Math.min(want, inTier.length)}`);
  }
  return picked.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/**
 * A 5xx from PostgREST or the gateway is weather, not a verdict. The first run of
 * this pipeline died at batch 8 of 63 on a single transient "run lookup failed",
 * having already spent seven batches of tokens; retrying is what turns that into
 * a pause. 4xx is NOT retried — a rejected token or a malformed body will be
 * rejected identically next time, and retrying it would just spend the budget.
 */
async function callFunction(name: string, body: unknown, attempts = RETRIES): Promise<Record<string, unknown>> {
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      lastError = `${res.status} non-JSON response: ${text.slice(0, 200)}`;
      if (attempt === attempts) break;
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      continue;
    }
    if (res.ok) return parsed;
    lastError = `${res.status} ${JSON.stringify(parsed).slice(0, 200)}`;
    const retryable = res.status >= 500 || res.status === 429;
    if (!retryable || attempt === attempts) break;
    // Patient on purpose, and the default is high because it was measured:
    // during development this project's PostgREST returned PGRST002 or simply
    // stopped answering for stretches of ten minutes or more under another
    // process's DDL. A run that gives up inside that window burns its token —
    // and a failed run needs an admin to mint a new one — so the default is
    // roughly twenty minutes of patience rather than four.
    console.warn(`  ${name}: ${lastError} — retry ${attempt}/${attempts}`);
    await new Promise((r) => setTimeout(r, backoffMs(attempt)));
  }
  throw new Error(`${name}: ${lastError}`);
}

/**
 * Models wrap JSON in fences, prefix it with prose, or append a note, whatever
 * the instructions said. Recovering from that is transport, not validation:
 * refusing a correct answer because it arrived inside a code fence would make
 * the pass rate a measure of formatting compliance rather than compilation.
 */
function parseModelJson(raw: string): { results?: unknown[] } | null {
  const text = String(raw ?? '').trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const braced = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (braced) candidates.push(braced);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { results?: unknown[] };
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* try the next shape */ }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

interface Tally {
  requested: number;
  byStage: Record<string, number>;
  accepted: number;
  automatable: number;
  byCoverage: Record<string, number>;
  byTier: Record<string, { requested: number; accepted: number }>;
  promptTokens: number;
  completionTokens: number;
  calls: number;
  needs: Record<string, { cards: number; why: string }>;
  schemaErrorHist: Record<string, number>;
  roundTripHist: Record<string, number>;
}

const bump = (m: Record<string, number>, k: string, by = 1): void => { m[k] = (m[k] ?? 0) + by; };

const candidates = selectCandidates();
console.log(`\nselected ${candidates.length} cards`);

if (DRY) {
  writeFileSync(
    join(DATA, 'sample.json'),
    JSON.stringify(candidates.map((c) => ({ oracleId: c.oracleId, name: c.card.name, tier: c.tier, chars: c.chars, compilerCoverage: c.compilerCoverage })), null, 1),
  );
  console.log(`dry run — wrote ${join(DATA, 'sample.json')}, called no model`);
  process.exit(0);
}

/**
 * The prompt key is the label plus a fingerprint of the prompt's own text, so a
 * prompt edited without its label being bumped still lands under a different
 * key. Every compiled row records the key it was produced under, which makes
 * "which exact words produced this answer" a join rather than an act of faith.
 *
 * Registration is insert-only and idempotent: a resumed run re-registers the
 * identical version and the database no-ops.
 */
const PROMPT_KEY = `${PROMPT_VERSION}.${oracleHash(SYSTEM_PROMPT)}`;

const runRow = await fetch(
  `${SUPABASE_URL}/rest/v1/llm_compile_runs?select=cursor,status,calls_made,max_calls&run_token=eq.${RUN_TOKEN}`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
).then((r) => r.json()).catch(() => []);

// `llm_compile_runs` is admin-only under RLS, so the anon key reads nothing back.
// That is deliberate — the token is the capability, not the row — and it means
// the cursor has to come from our own local checkpoint file.
// Keyed by the WORK LIST, not by the token. A run that failed can only be
// resumed under a fresh token (an admin decides to resume), and a checkpoint
// keyed by the token would silently restart from zero and re-spend everything
// already paid for. The work list is identified by its sample size and seed.
const CHECKPOINT = join(DATA, `checkpoint.sample-${SAMPLE}.seed-${SEED}.json`);
/** Append-only NDJSON of every validated row, written before any network write. */
const JOURNAL = join(DATA, `journal.sample-${SAMPLE}.seed-${SEED}.ndjson`);
let cursor: string | null = existsSync(CHECKPOINT)
  ? (JSON.parse(readFileSync(CHECKPOINT, 'utf8')) as { cursor: string | null }).cursor
  : null;
if (Array.isArray(runRow) && runRow.length && typeof runRow[0]?.cursor === 'string') cursor = runRow[0].cursor;
if (cursor) console.log(`resuming after ${cursor}`);

await callFunction('dsl-compile-store', {
  run_token: RUN_TOKEN,
  register_prompt: {
    version: PROMPT_KEY,
    label: PROMPT_VERSION,
    fingerprint: oracleHash(SYSTEM_PROMPT),
    system_prompt: SYSTEM_PROMPT,
  },
});
console.log(`prompt ${PROMPT_KEY} registered (${SYSTEM_PROMPT.length} chars)`);

const outstanding = resumeFrom(candidates, (c) => c.oracleId, cursor);
// Two caps, whichever binds first. `chars` is the one that stops a batch of long
// cards from overrunning the model's output ceiling and truncating the JSON —
// the failure that cost the first 500-card run 24 of its 64 cards.
const batches = batchedByBudget(outstanding, BATCH, (c) => c.chars, CHARS);
const biggest = batches.reduce((m, b) => Math.max(m, b.reduce((s, c) => s + c.chars, 0)), 0);
console.log(
  `${outstanding.length} cards outstanding in ${batches.length} batches ` +
    `(≤${BATCH} cards and ≤${CHARS} chars each; largest batch ${biggest} chars, ` +
    `${(outstanding.length / Math.max(1, batches.length)).toFixed(1)} cards/call average)\n`,
);

const tally: Tally = {
  requested: 0,
  byStage: {},
  accepted: 0,
  automatable: 0,
  byCoverage: {},
  byTier: {},
  promptTokens: 0,
  completionTokens: 0,
  calls: 0,
  needs: {},
  schemaErrorHist: {},
  roundTripHist: {},
};
const outcomes: Array<AcceptOutcome & { tier: string }> = [];

let failedHard = false;

for (const [index, batch] of batches.entries()) {
  const label = `batch ${index + 1}/${batches.length}`;
  let answer: Record<string, unknown>;
  try {
    answer = await callFunction('dsl-compile-batch', {
      run_token: RUN_TOKEN,
      model: MODEL,
      prompt_key: PROMPT_KEY,
      cards: batch.map((c) => ({
        oracle_id: c.oracleId,
        name: String(c.card.name ?? ''),
        type_line: String(c.card.type_line ?? ''),
        mana_cost: c.card.mana_cost ?? undefined,
        power: c.card.power ?? undefined,
        toughness: c.card.toughness ?? undefined,
        layout: c.card.layout ?? undefined,
        oracle_text: String(c.card.oracle_text ?? ''),
      })),
    });
  } catch (err) {
    console.error(`${label}: ${(err as Error).message}`);
    failedHard = true;
    break;
  }

  tally.calls++;
  const usage = (answer.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  tally.promptTokens += Number(usage.prompt_tokens ?? 0);
  tally.completionTokens += Number(usage.completion_tokens ?? 0);

  const parsed = parseModelJson(String(answer.raw ?? ''));
  const results = Array.isArray(parsed?.results) ? parsed!.results : [];
  const byId = new Map<string, unknown>();
  for (const [i, result] of results.entries()) {
    const id = (result as { oracle_id?: unknown } | null)?.oracle_id;
    // Positional fallback: a model that echoes the id wrongly but answers in
    // order is still answering. A model that does neither loses the batch.
    byId.set(typeof id === 'string' && id ? id : (batch[i]?.oracleId ?? `#${i}`), result);
  }

  const rows: unknown[] = [];
  for (const candidate of batch) {
    tally.requested++;
    tally.byTier[candidate.tier] ??= { requested: 0, accepted: 0 };
    tally.byTier[candidate.tier].requested++;

    const raw = byId.get(candidate.oracleId) ?? null;
    const outcome = acceptModelResult(candidate.card, raw);
    outcomes.push({ ...outcome, tier: candidate.tier });

    bump(tally.byStage, outcome.stage);
    if (outcome.accepted) {
      tally.accepted++;
      tally.byTier[candidate.tier].accepted++;
      bump(tally.byCoverage, outcome.coverage ?? 'unknown');
      if (outcome.automatable) tally.automatable++;
    }
    for (const need of outcome.needs) {
      tally.needs[need.primitive] ??= { cards: 0, why: need.why };
      tally.needs[need.primitive].cards++;
    }
    for (const error of outcome.detail.schemaErrors ?? []) bump(tally.schemaErrorHist, error.message.slice(0, 90));
    if (outcome.stage === 'roundtrip') {
      const trip = outcome.detail.roundTrip;
      for (const t of trip?.invented.words ?? []) bump(tally.roundTripHist, `invented word:${t}`);
      for (const t of trip?.invented.numbers ?? []) bump(tally.roundTripHist, `invented num:${t}`);
      for (const t of trip?.dropped.words ?? []) bump(tally.roundTripHist, `dropped word:${t}`);
      for (const t of trip?.dropped.numbers ?? []) bump(tally.roundTripHist, `dropped num:${t}`);
    }

    rows.push({
      oracle_id: outcome.oracleId,
      oracle_hash: outcome.oracleHash,
      name: outcome.name,
      model: String(answer.model ?? MODEL),
      prompt_version: String(answer.prompt_version ?? PROMPT_VERSION),
      raw,
      abilities: outcome.accepted ? outcome.card?.abilities : null,
      unparsed: outcome.unparsed,
      needs: outcome.needs,
      coverage: outcome.coverage,
      accepted: outcome.accepted,
      stage: outcome.stage,
      stage_detail: outcome.detail,
    });
  }

  // THE JOURNAL, written before the store is attempted.
  //
  // Everything above this line cost money. If the database is unreachable — and
  // during this pipeline's first run it was, twice, for minutes at a time — a
  // store that gives up would discard validated output that was already paid
  // for. Appending to a local file first makes the network the only thing that
  // can fail, and `flush.ts` can replay the journal later.
  appendFileSync(JOURNAL, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');

  // Rows first, THEN the pointer. Never the other way round.
  try {
    const stored = await callFunction('dsl-compile-store', {
      run_token: RUN_TOKEN,
      rows,
      cursor: batch[batch.length - 1].oracleId,
    });
    cursor = advancePatch(batch[batch.length - 1].oracleId).cursor ?? null;
    writeFileSync(CHECKPOINT, JSON.stringify({ cursor, at: new Date().toISOString() }));
    console.log(
      `${label}: ${stored.written} written · accepted ${tally.accepted}/${tally.requested} · ` +
        `${tally.promptTokens + tally.completionTokens} tokens so far`,
    );
  } catch (err) {
    console.error(`${label}: STORE FAILED — ${(err as Error).message}`);
    failedHard = true;
    break;
  }
}

/* ------------------------------------------------------------------ *
 * Finish
 * ------------------------------------------------------------------ */

const totals = {
  requested: tally.requested,
  accepted: tally.accepted,
  automatable: tally.automatable,
  byStage: tally.byStage,
  byCoverage: tally.byCoverage,
  promptTokens: tally.promptTokens,
  completionTokens: tally.completionTokens,
  calls: tally.calls,
};

if (failedHard) {
  await callFunction('dsl-compile-store', { run_token: RUN_TOKEN, failed: true, totals }).catch(() => {});
  console.error('\nrun marked FAILED; the pointer is kept so a re-run resumes.');
} else {
  const patch = completionPatch(new Date().toISOString(), totals);
  await callFunction('dsl-compile-store', { run_token: RUN_TOKEN, complete: true, totals: patch.totals });
  writeFileSync(CHECKPOINT, JSON.stringify({ cursor: null, at: new Date().toISOString() }));
  console.log('\nrun COMPLETE; pointer cleared.');
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);

console.log('');
console.log(`cards requested                 ${tally.requested}`);
console.log('');
console.log('VALIDATION, per stage — a card is counted at the FIRST gate it failed:');
const order = ['transport', 'schema', 'verbatim', 'roundtrip', 'behaviour', 'accepted'];
let surviving = tally.requested;
for (const stage of order) {
  const failed = stage === 'accepted' ? 0 : (tally.byStage[stage] ?? 0);
  const label = stage === 'accepted' ? 'accepted' : `failed ${stage}`;
  const count = stage === 'accepted' ? (tally.byStage.accepted ?? 0) : failed;
  console.log(
    `  ${label.padEnd(18)} ${String(count).padStart(5)}  ${pct(count, tally.requested).padStart(6)}` +
      (stage === 'accepted' ? '' : `   (of ${surviving} reaching it: ${pct(count, surviving)})`),
  );
  surviving -= failed;
}
console.log('');
console.log(`ACCEPTED (representable)        ${tally.accepted}  ${pct(tally.accepted, tally.requested)}`);
for (const [bucket, n] of Object.entries(tally.byCoverage).sort((a, b) => b[1] - a[1])) {
  console.log(`  of which coverage '${bucket}'`.padEnd(32) + `${n}`);
}
console.log(`AUTOMATABLE (engine runs it)    ${tally.automatable}  ${pct(tally.automatable, tally.requested)}`);
console.log('  ^ these two are different numbers and must never be quoted as one.');
console.log('');
console.log('by difficulty tier:');
for (const tier of TIERS) {
  const row = tally.byTier[tier.name];
  if (!row) continue;
  console.log(`  ${tier.name.padEnd(10)} ${String(row.accepted).padStart(4)}/${String(row.requested).padStart(4)}  ${pct(row.accepted, row.requested)}`);
}
console.log('');
console.log(`tokens: prompt ${tally.promptTokens} · completion ${tally.completionTokens} · calls ${tally.calls}`);
if (tally.requested) {
  console.log(
    `per card: ${(tally.promptTokens / tally.requested).toFixed(0)} prompt + ` +
      `${(tally.completionTokens / tally.requested).toFixed(0)} completion`,
  );
}

console.log('');
console.log('MISSING PRIMITIVES the model asked for, most cards first:');
for (const [name, row] of Object.entries(tally.needs).sort((a, b) => b[1].cards - a[1].cards).slice(0, 30)) {
  console.log(`  ${String(row.cards).padStart(4)}  ${name.padEnd(32)} ${row.why.slice(0, 60)}`);
}

console.log('');
console.log('top schema errors:');
for (const [msg, n] of Object.entries(tally.schemaErrorHist).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)}  ${msg}`);
}
console.log('');
console.log('top round-trip differences:');
for (const [msg, n] of Object.entries(tally.roundTripHist).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(n).padStart(4)}  ${msg}`);
}

writeFileSync(
  join(DATA, 'run-report.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), model: MODEL, promptVersion: PROMPT_VERSION, tally, outcomes: outcomes.map((o) => ({ oracleId: o.oracleId, name: o.name, tier: o.tier, stage: o.stage, accepted: o.accepted, coverage: o.coverage, automatable: o.automatable, detail: o.detail })) }, null, 0),
);
console.log(`\nwrote ${join(DATA, 'run-report.json')}`);
