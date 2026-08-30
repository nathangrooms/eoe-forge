/**
 * Split the silent commanders into slices an agent can actually read, and write
 * the facet vocabulary beside them.
 *
 * A rule has to be written against REAL CARD TEXT or it is invented, so each
 * slice carries every silent commander's full oracle text, its compiled facets
 * (to show what the engine already saw and failed to act on) and its rank.
 *
 *   node --experimental-strip-types scripts/commander-coverage-slices.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const IN = process.env.IN ?? '.shots/commander-coverage.json';
const OUT = process.env.SLICE_OUT ?? '.shots/coverage-slices';
const SLICES = Number(process.env.SLICES ?? 8);

const data = JSON.parse(fs.readFileSync(path.resolve(IN), 'utf8'));
const silent = data.silentCards;
const withText = silent.filter(s => s.text.trim());
const vanilla = silent.filter(s => !s.text.trim());

fs.mkdirSync(path.resolve(OUT), { recursive: true });

/* Rank first so each slice leads with commanders people actually build, and a
   slice that runs out of time has still covered the ones that matter. Then
   round-robin, so every slice gets a mix rather than slice 1 getting all the
   popular ones and slice 8 getting only obscurities. */
const ordered = [...withText].sort(
  (a, b) => (a.rank ?? 9_999_999) - (b.rank ?? 9_999_999)
);
const buckets = Array.from({ length: SLICES }, () => []);
ordered.forEach((card, i) => buckets[i % SLICES].push(card));

for (let i = 0; i < SLICES; i++) {
  const file = path.join(path.resolve(OUT), `slice-${i + 1}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        slice: i + 1,
        of: SLICES,
        note:
          'Every one of these is a commander-legal legend the engine produces NO wants for. ' +
          'Write intent rules against this text. Do not invent cards.',
        commanders: buckets[i].map(c => ({
          name: c.name,
          rank: c.rank,
          typeLine: c.typeLine,
          identity: c.identity,
          facetsTheCompilerFound: c.facets,
          text: c.text,
        })),
      },
      null,
      2
    )
  );
  console.log(`${file}  ${buckets[i].length} commanders`);
}

fs.writeFileSync(
  path.join(path.resolve(OUT), 'vanilla.json'),
  JSON.stringify(
    {
      note:
        'Commander-legal legends with NO rules text at all. No pattern over text can ' +
        'reach these; they need a principled floor, not a rule.',
      count: vanilla.length,
      commanders: vanilla.map(c => ({
        name: c.name,
        rank: c.rank,
        typeLine: c.typeLine,
        identity: c.identity,
        facetsTheCompilerFound: c.facets,
      })),
    },
    null,
    2
  )
);
console.log(`vanilla.json  ${vanilla.length} commanders`);

/* The facet vocabulary, measured rather than listed from memory: a rule whose
   `wants` name a facet no card carries is a rule that does nothing. Counted
   over the 2,000 most-built cards so the frequencies mean something. */
const URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const counts = new Map();
let cursor = '';
let seen = 0;
while (seen < 6000) {
  let url =
    `${URL}/rest/v1/cards_unique` +
    `?select=id,name,type_line,oracle_text,colors,color_identity,keywords,faces&order=id.asc&limit=500`;
  if (cursor) url += `&id=gt.${cursor}`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const page = await res.json();
  if (!Array.isArray(page) || !page.length) break;
  seen += page.length;
  for (const row of page) {
    for (const f of facetsForCard(row).facets) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const last = page[page.length - 1];
  cursor = last.id ?? cursor;
  if (!last.id) break;
  if (page.length < 500) break;
}

/* The walk above needs `id` to page; select it explicitly rather than relying
   on it being returned. If it was not, the loop stops after one page and the
   vocabulary is measured over 500 cards instead of 6,000, which is still a
   vocabulary but a thinner one. Reported so the number is not silently wrong. */
const vocab = [...counts.entries()].sort((a, b) => b[1] - a[1]);
fs.writeFileSync(
  path.join(path.resolve(OUT), 'facet-vocabulary.json'),
  JSON.stringify(
    {
      measuredOverCards: seen,
      note:
        'Facets real cards carry, with how many of the sampled cards carry each. ' +
        'A want naming a facet that is not here reaches no cards.',
      facets: Object.fromEntries(vocab),
    },
    null,
    2
  )
);
console.log(`facet-vocabulary.json  ${vocab.length} distinct facets over ${seen} cards`);
