/**
 * Compile every card's behaviour facets once, into `public.card_facet_memo`.
 *
 * WHY THIS EXISTS
 *
 * No commander with three or more colours could be built. Measured live:
 * Atraxa 546 after 37 s, Kaalia 546 after 17 s, Talrand 200 in 4 s. 546 is
 * WORKER_RESOURCE_LIMIT, and the deployed log ends "CPU Time exceeded" on the
 * line after the facet compile every time.
 *
 *   Kozilek   colourless   2,733 pool cards    15,300 facets   built
 *   Ghalta    G            7,366 pool cards    40,020 facets   built
 *   Yuriko    UB          12,606 pool cards    66,457 facets   CPU exceeded
 *   Edgar     WBR         18,467 pool cards   100,737 facets   CPU exceeded
 *
 * with `cached: 0` on every one. `FACET_MEMO` is a Map on the module, so it
 * only survives while an instance stays warm, and instances do not stay warm
 * between one player's requests. Every build recompiled the whole pool from
 * oracle text, and past roughly twelve thousand cards that does not fit in the
 * CPU an edge function is given.
 *
 * Facets are a pure function of oracle text and the compiler's rules, so the
 * answer does not change between requests. Computing them here, once, turns
 * the hot path into a single indexed read.
 *
 * USAGE
 *   node --experimental-strip-types scripts/fill-facet-memo.mjs
 *   FACET_LIMIT=500 node --experimental-strip-types scripts/fill-facet-memo.mjs
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: the table is service-role only, because a
 * cache of derived data is not something a client should be able to write.
 *
 * SAFE TO RE-RUN. It only computes cards whose oracle_id is missing at the
 * current compiler version, so a second run does nothing and a run interrupted
 * halfway resumes where it stopped. That matters: this project has taken its
 * own database down twice with unbounded catalogue work, so every batch is
 * bounded, the pages are sequential rather than concurrent, and it reports as
 * it goes rather than going quiet for ten minutes.
 */
import { createClient } from '@supabase/supabase-js';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const URL = process.env.SUPABASE_URL ?? 'https://udnaflcohfyljrsgqggy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPILER_VERSION = Number(process.env.FACET_COMPILER_VERSION ?? 1);
const LIMIT = Number(process.env.FACET_LIMIT ?? 0);

/** One page of cards to read, and one batch of memo rows to write. */
const READ_PAGE = 500;
const WRITE_BATCH = 500;

if (!SERVICE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. This writes a service-role table and\n' +
    'will not fall back to the publishable key, which cannot write it anyway.'
  );
  process.exit(1);
}

const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

const started = Date.now();
const seconds = () => ((Date.now() - started) / 1000).toFixed(1);

/* Which oracle ids already have facets at THIS compiler version. Read once and
   held as a Set, because asking the database per card would be 33,000 round
   trips to avoid work that takes a millisecond. */
console.log('reading what is already compiled...');
const done = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('card_facet_memo')
    .select('oracle_id')
    .eq('compiler_version', COMPILER_VERSION)
    .range(from, from + 999);
  if (error) throw new Error(`reading the memo failed: ${error.message}`);
  if (!data?.length) break;
  for (const row of data) done.add(row.oracle_id);
  if (data.length < 1000) break;
}
console.log(`  ${done.size} already compiled at version ${COMPILER_VERSION}`);

let read = 0;
let compiled = 0;
let skipped = 0;
let written = 0;
const census = { compiler: 0, xmage: 0, none: 0 };
let pending = [];

const flush = async () => {
  if (!pending.length) return;
  const { error } = await db
    .from('card_facet_memo')
    .upsert(pending, { onConflict: 'oracle_id' });
  if (error) throw new Error(`writing the memo failed: ${error.message}`);
  written += pending.length;
  pending = [];
};

/* Sequential paging by oracle_id. A keyset walk rather than an offset, for the
   reason recorded in CLAUDE.md section 10d: an ORDER BY that an index cannot
   supply makes the database sort the whole table before returning the first
   row, and that is what made the pool query time out at 13.7 s. */
let cursor = '';
for (;;) {
  let q = db
    .from('cards_unique')
    .select('oracle_id, name, type_line, oracle_text, mana_cost, cmc, keywords, colors, color_identity, faces, power, toughness, layout')
    .order('oracle_id', { ascending: true })
    .limit(READ_PAGE);
  if (cursor) q = q.gt('oracle_id', cursor);

  const { data, error } = await q;
  if (error) throw new Error(`reading cards failed: ${error.message}`);
  if (!data?.length) break;

  cursor = data[data.length - 1].oracle_id;
  read += data.length;

  for (const row of data) {
    if (!row.oracle_id) continue;
    if (done.has(row.oracle_id)) { skipped++; continue; }

    let result;
    try {
      result = facetsForCard(row);
    } catch (e) {
      /* A card the compiler throws on is recorded as having no facets rather
         than skipped, so it is not recompiled on every future run. Silence
         here would mean this script never finishes converging. */
      console.warn(`  ${row.name}: compiler threw, recording empty (${String(e).slice(0, 80)})`);
      result = { facets: [], source: 'none' };
    }

    census[result.source] = (census[result.source] ?? 0) + 1;
    compiled++;
    pending.push({
      oracle_id: row.oracle_id,
      facets: result.facets,
      source: result.source,
      compiler_version: COMPILER_VERSION,
      computed_at: new Date().toISOString(),
    });

    if (pending.length >= WRITE_BATCH) await flush();
    if (LIMIT && compiled >= LIMIT) break;
  }

  console.log(`  read ${read}  compiled ${compiled}  skipped ${skipped}  ${seconds()}s`);
  if (LIMIT && compiled >= LIMIT) break;
  if (data.length < READ_PAGE) break;
}

await flush();

console.log('');
console.log(`cards read       ${read}`);
console.log(`compiled         ${compiled}`);
console.log(`already had them ${skipped}`);
console.log(`rows written     ${written}`);
console.log(`  compiler spoke ${census.compiler ?? 0}`);
console.log(`  xmage spoke    ${census.xmage ?? 0}`);
console.log(`  neither        ${census.none ?? 0}`);
console.log(`took             ${seconds()}s`);
