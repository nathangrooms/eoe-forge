/**
 * Score a LOCALLY built Syr Vondam deck against the two human-built ones.
 *
 *   ARCHETYPE=blink node --experimental-strip-types scripts/probe/vondam-local-score.mjs
 *
 * `vondam-score.mjs` asks the DEPLOYED function, which is the right instrument
 * for "is the product good" and the wrong one for sweeping a constant: every
 * value needs a deploy. This builds in-process against the same live pool, so a
 * sweep costs seconds instead of minutes.
 *
 * Use the deployed one before believing any number reported to the owner.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../../supabase/functions/ai-deck-builder-v2/pipeline.ts';

const ANON = readFileSync(new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const bench = JSON.parse(readFileSync(new URL('vondam-benchmark.json', import.meta.url), 'utf8'));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

const catalog = new Catalog({
  url: 'https://udnaflcohfyljrsgqggy.supabase.co', anonKey: ANON, authorization: null,
});

const started = Date.now();
const out = await build({
  catalog,
  request: {
    commander: {
      name: bench.commander, type_line: 'Legendary Creature',
      color_identity: ['W', 'B'], colors: ['W', 'B'],
    },
    powerLevel: 7, useAIPlanning: false, includeLands: true,
    ...(process.env.ARCHETYPE ? { archetype: process.env.ARCHETYPE } : {}),
  },
  apiKey: null,
  startedAt: started,
});
if (out.kind !== 'ok') { console.error('REFUSED: ' + out.error); process.exit(1); }

const list = (out.body.result?.deck ?? []).map(d => d.card ?? d);
const have = new Set(list.map(c => norm(c.name)));

const groups = [
  ['blink spells', bench.blinkSpells],
  ['blink engines', bench.blinkEngines],
  ['worth blinking', bench.worthBlinking],
];
let hit = 0;
let of = 0;
const parts = [];
for (const [label, cards] of groups) {
  const n = cards.filter(c => have.has(norm(c))).length;
  hit += n; of += cards.length;
  parts.push(`${label} ${n}/${cards.length}`);
}
const both = (bench.inBothDecks ?? []).filter(c => have.has(norm(c))).length;
const ranks = list
  .filter(c => !String(c.type_line ?? '').toLowerCase().includes('land'))
  .map(c => c.edhrec_rank).filter(r => typeof r === 'number').sort((a, b) => a - b);

console.log(
  `archetype ${hit}/${of}  (${((hit / of) * 100).toFixed(1)}%)   ` +
  `${parts.join('  ')}   both-decks ${both}/${bench.inBothDecks.length}   ` +
  `median ${ranks[Math.floor(ranks.length / 2)] ?? '-'}  past15k ${ranks.filter(r => r > 15000).length}`
);
