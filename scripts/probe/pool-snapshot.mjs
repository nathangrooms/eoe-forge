/*
 * ONE FETCH OF THE CANDIDATE POOL, SHARED BY EVERY PROBE.
 *
 * WHY THIS EXISTS. Production was taken down THREE times on 5 Sep 2026 by
 * measurement runs, not by players. Every probe paged the whole pool for
 * itself - 43 requests each - and a full pass is about sixty deck builds. The
 * database is the constraint on this project's ability to measure itself, and
 * refetching the same 33,000 rows per probe is the whole of the load.
 *
 * A probe that RANKS cards against each other - dominance, what was left out,
 * which pass took what - needs a consistent pool, not a live one. This is for
 * those.
 *
 * ⚠️ IT IS NOT FOR MEASURING THE GENERATOR. CLAUDE.md records a snapshot being
 * used that way once: `.shots/pool-snapshot.json` carried no `oracle_text`, so
 * every facet computed from it was computed from nothing, and Kaalia was
 * diagnosed as a compiler bug on the strength of it. A deck build must go
 * through `Catalog` against the live database. This file feeds ANALYSIS ONLY.
 *
 *   node --experimental-strip-types scripts/probe/pool-snapshot.mjs --refresh
 *
 * Refresh runs the gate first and refuses when the database cannot afford it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import process from 'node:process';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const H = { apikey: K, Authorization: `Bearer ${K}` };
const FILE = '.pool/pool.json';

/* PostgREST caps EVERY response at 1000 rows whatever `limit` says. Bands of
   600 ranks keep each one under the cap - asking for 5000 silently returned
   the first 1000 and made a "6,000 card pool" a sixth of itself. */
const BAND = 600;
const MAX_RANK = 30000;

/** A snapshot older than this describes a catalogue that has since moved. */
const STALE_HOURS = Number(process.env.POOL_STALE_HOURS ?? 24);

export function loadPool() {
  if (!existsSync(FILE)) {
    throw new Error(
      `no pool snapshot. Run: node --experimental-strip-types scripts/probe/pool-snapshot.mjs --refresh`
    );
  }
  const snap = JSON.parse(readFileSync(FILE, 'utf8'));
  const ageH = (Date.now() - Date.parse(snap.generatedAt)) / 3_600_000;
  if (ageH > STALE_HOURS) {
    throw new Error(
      `pool snapshot is ${ageH.toFixed(1)}h old (limit ${STALE_HOURS}h). Refresh it, or raise POOL_STALE_HOURS deliberately.`
    );
  }
  return { rows: snap.rows, generatedAt: snap.generatedAt, ageHours: ageH };
}

if (process.argv.includes('--refresh')) {
  /* The gate, in-process, so a refresh cannot be the thing that saturates it. */
  const times = [];
  for (let i = 0; i < 6; i++) {
    const t = Date.now();
    const r = await fetch(`${BASE}/rest/v1/cards_pool?select=id&limit=1`, { headers: H });
    await r.text();
    if (!r.ok) { console.error(`pool-snapshot: HTTP ${r.status} on a probe read. REFUSING.`); process.exit(1); }
    times.push((Date.now() - t) / 1000);
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  const med = warm[Math.floor(warm.length / 2)];
  if (med > 0.30) {
    console.error(`pool-snapshot: warm median ${med.toFixed(2)}s. REFUSING - leave the database alone.`);
    process.exit(1);
  }

  const rows = [];
  for (let r = 0; r < MAX_RANK; r += BAND) {
    const res = await fetch(
      `${BASE}/rest/v1/cards_pool?select=name,facets,tags,edhrec_rank,color_identity,type_line,cmc,mana_cost` +
        `&commander_legal=eq.legal&edhrec_rank=gte.${r}&edhrec_rank=lt.${r + BAND}&order=edhrec_rank.asc`,
      { headers: H }
    );
    if (!res.ok) { console.error(`pool-snapshot: HTTP ${res.status} at rank ${r}. Stopping.`); process.exit(1); }
    const page = await res.json();
    if (!Array.isArray(page)) { console.error('pool-snapshot: non-array page. Stopping.'); process.exit(1); }
    if (page.length >= 1000) {
      console.error(`pool-snapshot: rank band ${r}-${r + BAND} returned ${page.length} rows and may be TRUNCATED at the 1000 cap. Narrow BAND.`);
      process.exit(1);
    }
    rows.push(...page);
  }
  mkdirSync('.pool', { recursive: true });
  writeFileSync(FILE, JSON.stringify({ generatedAt: new Date().toISOString(), rows }));
  console.log(`pool-snapshot: ${rows.length} cards written to ${FILE}`);
}
