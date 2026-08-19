/**
 * Backfill `cards.produced_mana` from Scryfall.
 *
 * A land's colour is not `card.colors` — that array is empty for every land on
 * Scryfall, because a land's colour is a property of what it TAPS FOR. Scryfall
 * publishes that separately as `produced_mana`, and the cards table did not have
 * the column, so every mana-base number in the app was counting the wrong thing.
 *
 * This reads the card ids that could produce mana (every land, plus anything
 * whose rules text contains an "Add" clause) through the public anon key, asks
 * Scryfall's /cards/collection endpoint in batches of 75 — its documented
 * maximum — and writes the answers out as SQL. It does not hold a service-role
 * key and does not write to the database itself; the emitted file is applied as
 * a migration.
 *
 *   node scripts/backfill-produced-mana.mjs
 *   -> .tmp/produced-mana-backfill.sql
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://udnaflcohfyljrsgqggy.supabase.co';
/* `.env` holds a stale key; the one the app actually ships with is the literal
   in client.ts, which is the publishable (anon) key and public by design. */
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  readClientKey() ||
  readEnv('VITE_SUPABASE_PUBLISHABLE_KEY');

function readClientKey() {
  try {
    const src = fs.readFileSync('src/integrations/supabase/client.ts', 'utf8');
    return src.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}
const OUT_DIR = '.tmp';
const OUT = path.join(OUT_DIR, 'produced-mana-backfill.sql');

function readEnv(key) {
  try {
    const line = fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .find(l => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim() : null;
  } catch {
    return null;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Every land in the catalogue.
 *
 * Read by walking the primary key rather than by filtering server-side: an
 * `ilike` over 34,088 `type_line` values has no index behind it and PostgREST
 * cancels the statement on timeout. Paging on `id` is an index scan, and the
 * type line is cheap to test here.
 */
async function loadCandidateIds() {
  const ids = [];
  const PAGE = 1000;
  let cursor = '';
  for (;;) {
    const url =
      `${SUPABASE_URL}/rest/v1/cards?select=id,type_line&order=id.asc&limit=${PAGE}` +
      (cursor ? `&id=gt.${encodeURIComponent(cursor)}` : '');
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) {
      if (/land/i.test(r.type_line || '')) ids.push(r.id);
    }
    cursor = rows[rows.length - 1].id;
    process.stdout.write(`\r  scanned, ${ids.length} lands so far`);
    if (rows.length < PAGE) break;
  }
  process.stdout.write('\n');
  return ids;
}

/** Scryfall answers 75 identifiers per call. */
async function fetchProduced(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 75) {
    const batch = ids.slice(i, i + 75);
    let res = null;
    /* Scryfall throttles hard near the end of a long run. Back off and retry
       rather than dropping the batch: a partial backfill is the same failure
       mode as no backfill, because a single unresolved land makes the whole
       mana breakdown unreportable. */
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeckMatrix-ProducedManaBackfill/1.0',
          Accept: 'application/json',
        },
        body: JSON.stringify({ identifiers: batch.map(id => ({ id })) }),
      });
      if (res.ok) break;
      await sleep(1000 * 2 ** attempt);
    }
    if (!res?.ok) {
      console.warn(`\n  batch ${i / 75}: HTTP ${res?.status}, gave up`);
      continue;
    }
    const json = await res.json();
    for (const card of json.data ?? []) {
      out.set(card.id, Array.isArray(card.produced_mana) ? card.produced_mana : []);
    }
    process.stdout.write(`\r  ${out.size}/${ids.length} resolved`);
    await sleep(150); // Scryfall asks for 50-100ms between requests
  }
  process.stdout.write('\n');
  return out;
}

const lit = s => `'${String(s).replace(/'/g, "''")}'`;
const arrLit = a => (a.length ? `ARRAY[${a.map(lit).join(',')}]::text[]` : `'{}'::text[]`);

const ids = await loadCandidateIds();
console.log(`${ids.length} candidate cards`);

const produced = await fetchProduced(ids);
console.log(`${produced.size} resolved from Scryfall`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const chunks = [];
const entries = [...produced.entries()];
for (let i = 0; i < entries.length; i += 400) {
  const values = entries
    .slice(i, i + 400)
    .map(([id, pm]) => `(${lit(id)}, ${arrLit(pm)})`)
    .join(',\n  ');
  chunks.push(
    `update public.cards c set produced_mana = v.pm\n` +
      `from (values\n  ${values}\n) as v(id, pm)\nwhere c.id = v.id;`
  );
}
fs.writeFileSync(
  OUT,
  `-- Generated by scripts/backfill-produced-mana.mjs on ${new Date().toISOString()}\n` +
    `-- ${produced.size} rows resolved from Scryfall /cards/collection.\n\n` +
    chunks.join('\n\n') +
    '\n'
);
console.log(`wrote ${OUT} (${chunks.length} statements)`);
