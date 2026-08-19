/**
 * scripts/coverage/llm/flush.ts — replay the journal into Postgres.
 *
 *   node --experimental-strip-types scripts/coverage/llm/flush.ts \
 *        --run <run_token> --journal .data/journal.sample-500.seed-1.ndjson
 *
 * ## Why this exists
 *
 * `compile.ts` appends every validated row to a local NDJSON journal BEFORE it
 * attempts to store it, because everything upstream of that line cost money.
 * During this pipeline's first runs the project's database became unreachable
 * twice, for minutes at a time, under another process's DDL — and a store that
 * gives up without a journal has thrown away validated output somebody paid for.
 *
 * So the journal is the durable record and this script is how it gets to the
 * database afterwards. It is idempotent: `llm_ability_compilations` is keyed by
 * `oracle_id` and the store upserts, so replaying a journal twice writes the same
 * rows twice and changes nothing.
 *
 * It moves NO pointer. Flushing is catching up on writes, not making progress
 * through the work list, and a flush that advanced the cursor would let a resumed
 * run skip cards whose rows were journalled but whose batch never completed.
 *
 * ## Why it re-validates, even though `compile.ts` already did
 *
 * The journal is a file on a laptop. Between `compile.ts` writing it and this
 * script reading it, it can be truncated, hand-edited, concatenated with another
 * run's journal, or simply be older than the DSL it was written against. A flush
 * that posted its contents unexamined would be a SECOND writer to
 * `llm_ability_compilations` that had not been through the five gates — and the
 * only thing that table promises is that everything in it has. `dsl-compile-store`
 * cannot catch it for us: that function holds no copy of the DSL validator.
 *
 * So every accepted row is re-checked here against `validate.ts`, and its
 * `coverage` is RE-DERIVED rather than read from the file. A row that fails is
 * DROPPED with its reason printed — never downgraded, never sent. Fail-closed: a
 * validation a bad input can walk around is not a validation.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';

import { validateAbilities, validateUnparsed } from '../../../src/lib/cards/abilities/validate.ts';
import { deriveCoverage } from '../../../src/lib/cards/abilities/dsl.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const argv = process.argv.slice(2);
const arg = (name: string, fallback = ''): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const RUN_TOKEN = arg('--run');
const JOURNAL_ARG = arg('--journal');
if (!RUN_TOKEN) throw new Error('--run <run_token> is required');
if (!JOURNAL_ARG) throw new Error('--journal <path> is required');
const JOURNAL = isAbsolute(JOURNAL_ARG) ? JOURNAL_ARG : join(here, JOURNAL_ARG);
if (!existsSync(JOURNAL)) throw new Error(`no journal at ${JOURNAL}`);

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing');

/**
 * Last write wins within the journal. A card recompiled under a later prompt
 * appears twice; the newer row is the one at the end, and sending both would
 * make the outcome depend on the order the database happened to apply them.
 */
const byOracleId = new Map<string, unknown>();
let malformed = 0;
for (const line of readFileSync(JOURNAL, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line) as { oracle_id?: string };
    if (row?.oracle_id) byOracleId.set(row.oracle_id, row);
    else malformed++;
  } catch {
    // A journal is append-only and can be truncated mid-line by a kill. One
    // unparseable tail line is expected; counting them is how a corrupted
    // journal announces itself instead of silently shrinking the flush.
    malformed++;
  }
}

console.log(`journal ${JOURNAL}`);
console.log(`${byOracleId.size} distinct oracle_id in the journal${malformed ? ` (${malformed} unparseable lines skipped)` : ''}`);

/* ------------------------------------------------------------------ *
 * Re-validation — see the header. Nothing leaves this file unchecked.
 * ------------------------------------------------------------------ */

interface JournalRow {
  oracle_id?: string;
  accepted?: unknown;
  stage?: unknown;
  abilities?: unknown;
  unparsed?: unknown;
  coverage?: unknown;
}

const rows: unknown[] = [];
const refused: Array<{ oracleId: string; why: string }> = [];

for (const value of byOracleId.values()) {
  const row = value as JournalRow;
  const oracleId = String(row.oracle_id ?? '');
  const accepted = row.accepted === true;

  // The invariants `dsl-compile-store` also enforces, applied here so a bad
  // journal fails on the laptop with a card name rather than as an HTTP 400
  // that abandons the other 99 rows in its chunk.
  if (accepted !== (row.stage === 'accepted')) {
    refused.push({ oracleId, why: `accepted=${accepted} disagrees with stage=${JSON.stringify(row.stage)}` });
    continue;
  }
  if (!accepted) {
    if (row.abilities != null) {
      refused.push({ oracleId, why: 'rejected row carries abilities' });
      continue;
    }
    rows.push(row);
    continue;
  }

  const abilityCheck = validateAbilities(row.abilities);
  const unparsedCheck = validateUnparsed(Array.isArray(row.unparsed) ? row.unparsed : []);
  if (!abilityCheck.ok || !unparsedCheck.ok) {
    const first = [...abilityCheck.errors, ...unparsedCheck.errors][0];
    refused.push({ oracleId, why: `schema: ${first ? `${first.path} — ${first.message}` : 'invalid'}` });
    continue;
  }

  // Coverage is COMPUTED. Whatever the file says is discarded, and a file that
  // disagrees with the derivation is reported rather than quietly corrected —
  // a journal that has drifted from the DSL is a fact worth seeing.
  const derived = deriveCoverage(abilityCheck.value, unparsedCheck.value);
  if (row.coverage != null && row.coverage !== derived) {
    console.warn(`  ${oracleId}: journal said coverage ${JSON.stringify(row.coverage)}, derived ${derived} — using the derived value`);
  }
  rows.push({ ...row, coverage: derived });
}

if (refused.length) {
  console.log('');
  console.log(`REFUSED ${refused.length} row(s) — these are NOT sent:`);
  for (const r of refused.slice(0, 25)) console.log(`  ${r.oracleId}: ${r.why}`);
  if (refused.length > 25) console.log(`  … and ${refused.length - 25} more`);
  console.log('');
}
console.log(`${rows.length} row(s) to flush`);

const CHUNK = 100;
let written = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  let lastError = '';
  let ok = false;
  for (let attempt = 1; attempt <= 8 && !ok; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dsl-compile-store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      // No `cursor`, no `complete`. Flushing is not progress.
      body: JSON.stringify({ run_token: RUN_TOKEN, rows: chunk }),
    });
    const text = await res.text();
    if (res.ok) { ok = true; break; }
    lastError = `${res.status} ${text.slice(0, 200)}`;
    if (res.status < 500 && res.status !== 429) break;
    console.warn(`  chunk ${i / CHUNK + 1}: ${lastError} — retry ${attempt}/8`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  if (!ok) throw new Error(`flush stopped at row ${i}: ${lastError}`);
  written += chunk.length;
  console.log(`  ${written}/${rows.length}`);
}

console.log(`flushed ${written} rows; no pointer was moved`);
