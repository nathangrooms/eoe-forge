/**
 * What the shared record actually says about a card, before any copy is written
 * around it.
 *
 *   node --experimental-strip-types scripts/tutor-behaviour-probe.ts
 *   node --experimental-strip-types scripts/tutor-behaviour-probe.ts --sample=400
 *
 * Tutor is about to start answering "what does this card do" from behaviour
 * facets rather than from the oracle text alone. Two things have to be measured
 * before that is worth doing, and both are measured here against real rows read
 * from `cards_unique` over PostgREST with the publishable key:
 *
 *   1. HOW OFTEN THE RECORD IS THIN. `facetsForCard` reports which source spoke
 *      for a card, and the facets carry `rec:full` or `rec:partial`. CLAUDE.md
 *      quotes 30.3% full and 46.4% partial over 35,663 cards with rules text.
 *      An answer built on a partial record must not read like one built on a
 *      full one, so the rate decides how often that sentence appears.
 *   2. WHETHER THE PHRASES ARE SAYABLE. `describeSharedFacets` is the engine's
 *      own phrasing and it refuses rather than guesses, so a facet with no
 *      phrase contributes nothing. What matters for Tutor is how often it
 *      contributes NOTHING AT ALL, because a card that produces no phrase must
 *      fall back rather than print an empty line, and whether any phrase it
 *      does produce breaks the copy rules.
 *
 * Nothing here writes. It reads the catalogue and prints counts.
 */

import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';
import { REC_FULL, REC_PARTIAL } from '../src/engine/knowledge/behaviour.ts';
import { looksWrong } from '../supabase/functions/mtg-brain/answer/voice.ts';
import { readRecord, whatItDoes } from '../supabase/functions/mtg-brain/answer/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const COLUMNS =
  'id,oracle_id,name,type_line,oracle_text,mana_cost,cmc,keywords,power,toughness,layout,faces,tags,edhrec_rank';

interface Row {
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  tags: string[] | null;
  [k: string]: unknown;
}

async function get(query: string): Promise<Row[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as Row[];
}

/** The named cards every reviewer has an opinion about, read one by one. */
const NAMED = [
  'Sol Ring',
  'Rhystic Study',
  'Smothering Tithe',
  'Wrath of God',
  'Craterhoof Behemoth',
  'Cyclonic Rift',
  'Swords to Plowshares',
  'Atraxa, Praetors\' Voice',
  'Krenko, Mob Boss',
  'Mystic Remora',
  'Doubling Season',
  'Bone Saw',
  'Squire',
  'Esper Sentinel',
  'Agadeem\'s Awakening // Agadeem, the Undercrypt',
];

async function read(row: Row) {
  const result = facetsForCard(row as never);
  const raw = result.facets.includes(REC_FULL)
    ? 'full'
    : result.facets.includes(REC_PARTIAL)
      ? 'partial'
      : 'none';
  /* Through Tutor's own reader, so what is counted here is what a player would
     actually be shown rather than everything the engine could say. */
  const record = await readRecord(row as never);
  return { ...result, standing: raw, record, phrases: whatItDoes(record) };
}

const sampleArg = process.argv.find(a => a.startsWith('--sample='));
const SAMPLE = sampleArg ? Number(sampleArg.split('=')[1]) : 1000;

console.log('=== named cards ===');
for (const name of NAMED) {
  const rows = await get(
    `cards_unique?select=${COLUMNS}&name=eq.${encodeURIComponent(name)}&limit=1`
  );
  if (!rows.length) {
    console.log(`${name.padEnd(34)} NOT IN THE CATALOGUE`);
    continue;
  }
  const r = await read(rows[0]);
  console.log(
    `${name.slice(0, 33).padEnd(34)} ${r.source.padEnd(8)} ${r.standing.padEnd(7)} ` +
      `${String(r.facets.length).padStart(3)} facets | ${r.phrases.join('; ') || '(no phrase)'}`
  );
}

/**
 * Two samples, because the two answer different questions and quoting either
 * without saying which is how a coverage figure misleads.
 *
 * `popular` is the cards a player is most likely to ask Tutor about, ordered by
 * how many Commander decks run them. That is the denominator for "how often
 * will a player see the thin reading sentence".
 *
 * `arbitrary` is ordered by id, which has nothing to do with play or with the
 * compiler, so it stands in for the catalogue as a whole. That is the
 * denominator CLAUDE.md's 30.3% / 46.4% / 23.3% is quoted against, and this is
 * the one to compare it with.
 */
const ORDER: Record<string, string> = {
  popular: '&edhrec_rank=not.is.null&order=edhrec_rank.asc',
  arbitrary: '&order=id.asc',
};

for (const [label, order] of Object.entries(ORDER)) {
  await measureSample(label, order);
}

async function measureSample(label: string, order: string) {
console.log(`\n=== a sample of ${SAMPLE} Commander legal cards, ${label} order ===`);
const page = 500;
const rows: Row[] = [];
for (let offset = 0; offset < SAMPLE; offset += page) {
  const got = await get(
    `cards_unique?select=${COLUMNS}&legalities->>commander=eq.legal${order}` +
      `&limit=${Math.min(page, SAMPLE - offset)}&offset=${offset}`
  );
  rows.push(...got);
  if (got.length < page) break;
}

const counts = {
  total: rows.length,
  withText: 0,
  source: { compiler: 0, xmage: 0, none: 0 } as Record<string, number>,
  standing: { full: 0, partial: 0, none: 0 } as Record<string, number>,
  noPhrase: 0,
  phraseFaults: [] as string[],
  phraseHistogram: new Map<number, number>(),
};

for (const row of rows) {
  if (row.oracle_text && row.oracle_text.trim()) counts.withText++;
  const r = await read(row);
  counts.source[r.source]++;
  counts.standing[r.standing]++;
  const n = r.phrases.length;
  counts.phraseHistogram.set(n, (counts.phraseHistogram.get(n) ?? 0) + 1);
  if (n === 0) counts.noPhrase++;
  for (const phrase of r.phrases) {
    const faults = looksWrong(phrase);
    if (faults.length) counts.phraseFaults.push(`${row.name}: "${phrase}" ${faults.join(', ')}`);
  }
}

const pct = (n: number) => `${((n / counts.total) * 100).toFixed(1)}%`;
console.log(`rows ${counts.total}, with rules text ${counts.withText}`);
console.log(
  `source   compiler ${counts.source.compiler} (${pct(counts.source.compiler)}) ` +
    `xmage ${counts.source.xmage} (${pct(counts.source.xmage)}) ` +
    `none ${counts.source.none} (${pct(counts.source.none)})`
);
console.log(
  `standing full ${counts.standing.full} (${pct(counts.standing.full)}) ` +
    `partial ${counts.standing.partial} (${pct(counts.standing.partial)}) ` +
    `no record ${counts.standing.none} (${pct(counts.standing.none)})`
);
console.log(`cards producing NO sayable phrase: ${counts.noPhrase} (${pct(counts.noPhrase)})`);
console.log(
  'phrases per card: ' +
    [...counts.phraseHistogram.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, c]) => `${n}:${c}`)
      .join('  ')
);
console.log(`phrases breaking the copy rules: ${counts.phraseFaults.length}`);
for (const f of counts.phraseFaults.slice(0, 20)) console.log('  ' + f);
}
