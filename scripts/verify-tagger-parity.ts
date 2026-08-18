/**
 * Proves the TypeScript tagger and the Postgres tagger agree, and reports the
 * live tag distribution.
 *
 *   node --experimental-strip-types scripts/verify-tagger-parity.ts
 *
 * There are two implementations of one rule set — `src/lib/cards/tagger.ts` for
 * anything holding a card in memory, `public.derive_card_tags` for the 34,000
 * rows we are not going to ship to a browser. The SQL is generated from the TS,
 * but "generated from" is a claim, not a proof: a `.` that means one thing to
 * V8 and another to Postgres would compile fine and silently mis-tag thousands
 * of cards.
 *
 * So this reads every row's stored `tags` (written by the database tagger) and
 * recomputes them locally with the TypeScript tagger. Any disagreement is a
 * defect in one of the two and is printed with the card that exposes it.
 *
 * Reads through the publishable key — the same anon access the browser has —
 * and writes nothing.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deriveCardTags, type TaggerCard } from '../src/lib/cards/tagger.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const env: Record<string, string> = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env');

const COLUMNS = 'id,name,type_line,oracle_text,keywords,mana_cost,cmc,faces,tags';
const PAGE = 1000;

/**
 * `--until <id>` stops at a card id. The bulk backfill walks ids in ascending
 * order, so passing its current `last_id` checks exactly the prefix that has
 * been reclassified so far — otherwise every row the runner has not reached yet
 * reports as a disagreement, and a genuine one would be lost in the noise.
 */
const untilIndex = process.argv.indexOf('--until');
const until = untilIndex > -1 ? process.argv[untilIndex + 1] : null;

interface Row extends TaggerCard {
  id: string;
  tags: string[] | null;
}

async function fetchPage(afterId: string): Promise<Row[]> {
  const qs = new URLSearchParams({
    select: COLUMNS,
    order: 'id.asc',
    limit: String(PAGE),
    ...(afterId ? { id: `gt.${afterId}` } : {}),
  });
  const res = await fetch(`${url}/rest/v1/cards?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

const distribution = new Map<string, number>();
const mismatches: { id: string; name: string; db: string[]; ts: string[] }[] = [];
let rows = 0;
let untagged = 0;
let cursor = '';

let finished = false;

while (!finished) {
  const page = await fetchPage(cursor);
  if (page.length === 0) break;
  cursor = page[page.length - 1].id;

  for (const row of page) {
    // Ends the walk. Setting the cursor instead would send fetchPage back to
    // the top of the table on the next iteration and loop forever.
    if (until && row.id > until) { finished = true; break; }
    rows++;
    const ts = deriveCardTags(row);
    const db = row.tags ?? [];

    for (const tag of ts) distribution.set(tag, (distribution.get(tag) ?? 0) + 1);
    if (ts.length === 0) untagged++;

    if (ts.length !== db.length || ts.some((t, i) => t !== db[i])) {
      if (mismatches.length < 25) {
        mismatches.push({ id: row.id, name: row.name ?? '?', db, ts });
      }
    }
  }

  process.stderr.write(`\r${rows} rows checked…`);
}

process.stderr.write('\n');

const mismatchCount = mismatches.length;
console.log(`rows:        ${rows}`);
console.log(`untagged:    ${untagged}`);
console.log(`mismatches:  ${mismatchCount === 25 ? '25+ (truncated)' : mismatchCount}`);
if (mismatchCount > 0) {
  console.log('\nDISAGREEMENTS (db = Postgres, ts = TypeScript):');
  for (const m of mismatches) {
    console.log(`  ${m.name}`);
    console.log(`    db: ${m.db.join(', ') || '(none)'}`);
    console.log(`    ts: ${m.ts.join(', ') || '(none)'}`);
  }
}

console.log('\nTAG DISTRIBUTION');
const sorted = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
const width = Math.max(...sorted.map(([t]) => t.length));
for (const [tag, n] of sorted) {
  console.log(`  ${tag.padEnd(width)}  ${String(n).padStart(6)}  ${((n / rows) * 100).toFixed(1)}%`);
}

process.exit(mismatchCount > 0 ? 1 : 0);
