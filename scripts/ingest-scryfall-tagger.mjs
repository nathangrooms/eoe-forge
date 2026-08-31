/**
 * Ingest Scryfall Tagger's oracle tags: a functional reading of every card.
 *
 *   RUN_TOKEN=<uuid> node scripts/ingest-scryfall-tagger.mjs
 *   FRESH=1 ... redownload the bulk file
 *
 * Derived from Scryfall, whose bulk endpoint publishes the Tagger project's
 * oracle tags. Tagger is community-maintained. Attribution is required and
 * endorsement must not be implied; see docs/overhaul/DATA-SOURCES.md.
 *
 * ## Why this exists
 *
 * Measured before writing a line of it: Tagger has tags for **99.9% of the
 * cards our own compiler produces no behavioural word for**, at 6.0 tags each.
 * The cards this project has spent two days failing to read are already read.
 *
 *     Ad Nauseam            ours: type:instant
 *                         theirs: burst draw, life for cards
 *     Drannith Magistrate   ours: type:creature sub:human sub:wizard
 *                         theirs: hate-nonhand-cast, prevent cast, hatebear
 *     Syr Vondam            ours: kw:vigilance kw:menace + the type line
 *                         theirs: synergy-exiling, gains pp counters,
 *                                 repeatable lifegain, removal-destroy,
 *                                 power matters-self
 *
 * ## It does not replace the compiler and must never be merged into it
 *
 * They answer different questions and only one of them can be checked:
 *
 *     compiler   `eff:draw` with a count of 2, from a PARSED RECORD
 *     tagger     "burst draw", from a person who read the card
 *
 * The compiler's version is structured, so play mode can resolve it and it can
 * serve as an answer key for everything else. Tagger's version is a judgement,
 * so it covers cards no parser reaches. Kept in their own tables for exactly
 * that reason: the day these blend into `card_facet_memo` is the day nobody can
 * say where a word came from.
 *
 * ## Everything is stored, including the junk
 *
 * Tagger holds "alliteration", "french vanilla" and "single english word name"
 * beside "spot removal" and "mana sink". Filtering here would bake one
 * judgement about usefulness into the data and make it unrevisable. The filter
 * belongs in the reader, where it can be argued with.
 */
import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import process from 'node:process';

const KEY = readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const GZ = new URL('../scratch/scryfall/oracle-tags.jsonl.gz', import.meta.url);
const JSONL = new URL('../scratch/scryfall/oracle-tags.jsonl', import.meta.url);

const RUN_TOKEN = process.env.RUN_TOKEN;
if (!RUN_TOKEN) {
  console.error('Needs a run token, the same gate facet-memo-fill uses:');
  console.error("  insert into public.facet_memo_runs (max_calls, note) values (400, 'tagger ingest') returning run_token;");
  process.exit(1);
}

/* ------------------------------------------------------------- download --- */

if (process.env.FRESH || !existsSync(JSONL)) {
  process.stderr.write('  finding the current bulk file\n');
  const bulk = await (await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': 'DeckMatrix/1.0', Accept: 'application/json' },
  })).json();
  const entry = (bulk.data ?? []).find(d => d.type === 'oracle_tags');
  if (!entry) throw new Error('no oracle_tags in the bulk index');
  process.stderr.write(`  ${entry.jsonl_download_uri}\n`);
  const res = await fetch(entry.jsonl_download_uri, { headers: { 'User-Agent': 'DeckMatrix/1.0' } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(GZ));
  await pipeline(
    (await import('node:fs')).createReadStream(GZ),
    createGunzip(),
    createWriteStream(JSONL)
  );
}
process.stderr.write(`  ${(statSync(JSONL).size / 1048576).toFixed(1)} MB of tag data\n`);

/* ---------------------------------------------------------------- parse --- */

const tags = [];
const cardTags = [];
const byId = new Map();

for (const line of readFileSync(JSONL, 'utf8').split('\n')) {
  if (!line) continue;
  let t;
  try {
    t = JSON.parse(line);
  } catch {
    continue;
  }
  byId.set(t.id, t.slug);
  tags.push({
    slug: t.slug,
    label: t.label ?? t.slug,
    description: t.description ?? null,
    parent_ids: t.parent_ids ?? [],
    card_count: (t.taggings ?? []).length,
  });
  for (const g of t.taggings ?? []) {
    if (!g.oracle_id) continue;
    cardTags.push({ oracle_id: g.oracle_id, slug: t.slug });
  }
}

/*
 * `parent_ids` are Tagger's own UUIDs and useless to anyone reading the table.
 * Resolved to slugs here, because doing it at read time means every consumer
 * needs the id map and one of them will forget.
 */
for (const t of tags) {
  t.ancestry = (t.parent_ids ?? []).map(id => byId.get(id)).filter(Boolean);
  t.parent_ids = t.ancestry;
}

const cards = new Set(cardTags.map(c => c.oracle_id));
console.log(`\n  tags      ${tags.length}`);
console.log(`  taggings  ${cardTags.length}`);
console.log(`  cards     ${cards.size}`);

/* ----------------------------------------------------------------- write -- */

const post = async (table, rows, conflict) => {
  const res = await fetch(`${BASE}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      'x-run-token': RUN_TOKEN,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
};

/*
 * 2,000 a call. PostgREST is happy far above this; the network is not, and a
 * failed 10,000-row insert costs ten times as much to retry as a failed 2,000.
 */
const CHUNK = 2000;
let done = 0;
for (let i = 0; i < tags.length; i += CHUNK) {
  await post('scryfall_tags', tags.slice(i, i + CHUNK), 'slug');
  done += Math.min(CHUNK, tags.length - i);
  process.stderr.write(`\r  tags ${done}/${tags.length}   `);
}
done = 0;
for (let i = 0; i < cardTags.length; i += CHUNK) {
  await post('scryfall_card_tags', cardTags.slice(i, i + CHUNK), 'oracle_id,slug');
  done += Math.min(CHUNK, cardTags.length - i);
  process.stderr.write(`\r  taggings ${done}/${cardTags.length}   `);
}
console.log('\n  done');
