/**
 * Which of the cards a player actually plays can the compiler not read, and
 * what SHAPE are they?
 *
 *   node --experimental-strip-types scripts/compiler-gap-probe.ts
 *   node --experimental-strip-types scripts/compiler-gap-probe.ts --top 6000
 *
 * WHY THIS EXISTS
 * ---------------
 * Coverage over the whole catalogue is the wrong denominator for the deck
 * generator, which draws from the most played few thousand cards. Measured on
 * 30 Aug against the stored memo:
 *
 *   top 100     26.3% no record
 *   101-500     12.0%
 *   501-2000    20.4%
 *
 * Twenty six percent of the hundred most played cards in Commander produce no
 * ability record, and that caps every consumer at once: a card with no record
 * cannot be keyed to a commander, cannot be ranked on what it does, and in play
 * mode resolves to nothing.
 *
 * This compiles them HERE, with the working tree's compiler, rather than
 * reading the stored memo, so a rule added five minutes ago is measured before
 * anything is refilled or deployed. The clusters it prints are the work list,
 * ranked by how many played cards each one unlocks.
 *
 * Nothing is written. Read-only against the anon key.
 */
import process from 'node:process';

import { compileCardAbilities } from '../src/lib/cards/abilities/compiler.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const TOP = Number(arg('top', '3000'));

interface Row {
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  edhrec_rank: number | null;
  faces: unknown;
}

async function page(from: number, to: number): Promise<Row[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/cards_unique?select=name,type_line,oracle_text,edhrec_rank,faces` +
    `&legalities->>commander=eq.legal&edhrec_rank=gte.${from}&edhrec_rank=lt.${to}` +
    `&order=edhrec_rank.asc&limit=1000`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * The shapes worth naming, in the words the card uses.
 *
 * A cluster is only useful if it points at ONE rule. "Draws a card" is not a
 * cluster; "adds one mana of any colour that something else determines" is,
 * because one rule reads all of them.
 */
const CLUSTERS: { name: string; test: (t: string) => boolean }[] = [
  { name: 'conditional mana (any colour from a described source)', test: t => /add one mana of any (color|type)/i.test(t) },
  { name: 'search library, destination not covered', test: t => /search your library/i.test(t) },
  { name: 'shockland (pay 2 life or enters tapped)', test: t => /as this land enters, you may pay 2 life/i.test(t) },
  { name: 'modal (choose one)', test: t => /choose one/i.test(t) },
  { name: 'land type changing', test: t => /is a [A-Z][a-z]+ in addition to/i.test(t) },
  { name: 'cost taxing (unless that player pays)', test: t => /unless (that player|they|its controller) pays/i.test(t) },
  { name: 'cast without paying its mana cost', test: t => /without paying its mana cost/i.test(t) },
  { name: 'replacement (if .. would .. instead)', test: t => /would .{0,60}\binstead\b/i.test(t) },
];

async function main() {
  const rows: Row[] = [];
  for (let from = 1; from < TOP; from += 750) rows.push(...(await page(from, from + 750)));

  const withText = rows.filter(r => (r.oracle_text ?? '') !== '' || Array.isArray(r.faces));
  let read = 0;
  const blind: Row[] = [];

  for (const r of withText) {
    let compiled;
    try {
      compiled = compileCardAbilities({
        name: r.name,
        type_line: r.type_line ?? '',
        oracle_text: r.oracle_text ?? '',
        ...(Array.isArray(r.faces) ? { card_faces: r.faces } : {}),
      } as never);
    } catch {
      blind.push(r);
      continue;
    }
    if ((compiled?.abilities?.length ?? 0) > 0) read++;
    else blind.push(r);
  }

  console.log(`top ${TOP} commander-legal, ${withText.length} carry rules text`);
  console.log(`the compiler produces a record for ${read} (${((100 * read) / withText.length).toFixed(1)}%)`);
  console.log(`it reads nothing on ${blind.length} (${((100 * blind.length) / withText.length).toFixed(1)}%)\n`);

  const bands = [
    ['top 100', 1, 100],
    ['101-500', 101, 500],
    ['501-2000', 501, 2000],
    ['2001+', 2001, Infinity],
  ] as const;
  for (const [label, lo, hi] of bands) {
    const inBand = withText.filter(r => (r.edhrec_rank ?? 0) >= lo && (r.edhrec_rank ?? 0) <= hi);
    const b = blind.filter(r => (r.edhrec_rank ?? 0) >= lo && (r.edhrec_rank ?? 0) <= hi);
    if (inBand.length) {
      console.log(`  ${label.padEnd(10)} ${String(b.length).padStart(4)} of ${String(inBand.length).padStart(4)} blind  ${((100 * b.length) / inBand.length).toFixed(1)}%`);
    }
  }

  console.log('\n--- clusters among the blind, biggest first ---');
  const counted = CLUSTERS.map(c => ({
    name: c.name,
    hits: blind.filter(r => c.test(`${r.oracle_text ?? ''}`)),
  })).sort((a, b) => b.hits.length - a.hits.length);

  for (const c of counted) {
    if (!c.hits.length) continue;
    const best = c.hits.slice(0, 4).map(r => `${r.name} (${r.edhrec_rank})`).join(', ');
    console.log(`  ${String(c.hits.length).padStart(4)}  ${c.name}`);
    console.log(`        ${best}`);
  }

  const matched = new Set(counted.flatMap(c => c.hits.map(r => r.name)));
  const rest = blind.filter(r => !matched.has(r.name));
  console.log(`\n  ${rest.length} blind cards match no named cluster. The 20 most played:`);
  for (const r of rest.slice(0, 20)) {
    console.log(`    ${String(r.edhrec_rank).padStart(4)}  ${r.name.padEnd(30)} ${String(r.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 78)}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
