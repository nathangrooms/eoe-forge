/**
 * Caches the `cards` catalogue to `scripts/primitives/.data/catalogue.json`.
 *
 * The harness needs REAL oracle text — the whole point of the behavioural gate
 * is that it asserts against cards that exist, not fixtures invented to make a
 * primitive pass. Reads through the publishable key, the same anon access the
 * browser has. Cached because the harness runs this measurement repeatedly and
 * paging 31k rows over the network on every run would make the gate slow enough
 * that someone would be tempted to skip it.
 *
 *   node scripts/primitives/fetch-catalogue.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'scripts', 'primitives', '.data', 'catalogue.json');

const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env');

const COLUMNS = 'id,oracle_id,name,type_line,oracle_text,keywords,mana_cost,cmc,power,toughness,layout,faces,legalities';
const PAGE = 1000;

const rows = [];
let after = '';
for (;;) {
  const qs = new URLSearchParams({ select: COLUMNS, order: 'id.asc', limit: String(PAGE) });
  if (after) qs.set('id', `gt.${after}`);
  const res = await fetch(`${url}/rest/v1/cards?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const page = await res.json();
  if (!page.length) break;
  rows.push(...page);
  after = page[page.length - 1].id;
  if (rows.length % 5000 === 0) process.stderr.write(`  fetched ${rows.length}\n`);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(rows));
console.log(`${rows.length} printings -> ${out}`);
