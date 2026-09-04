/**
 * Does a generated deck have the SHAPE of a real deck?
 *
 *   node --experimental-strip-types scripts/probe/deck-shape-check.mjs
 *   ONLY="Krenko" node --experimental-strip-types scripts/probe/deck-shape-check.mjs
 *
 * WHY THIS EXISTS. Every other instrument here scores a deck against something
 * we wrote: role floors we chose, a benchmark whose job lists were typed from
 * knowledge. The owner's criterion is different and is the right one - *"We
 * should be getting similar results to them"* - and nothing measured it,
 * because we had no THEM.
 *
 * `meta_decks` is them: 192 real Commander decks (MTGJSON, MIT, already
 * ingested; see docs/overhaul/META-INGESTION.md). `real-deck-roles.mjs` runs
 * OUR `cardRole` over THEIR decklists and writes the p10/p50/p90 per role to
 * `real-deck-roles.json`, which this reads. No scraping, no new source.
 *
 * ROLES, NOT TAGS, and the difference was a real misreading on 3 Sep 2026. The
 * first version compared our role fill against their TAG counts and called ramp
 * wrong on 16 of 20 decks, because the ramp TAG has a median of 9 and the ramp
 * ROLE has a median of 16. Two vocabularies, one subtraction, and the
 * difference reported as a fault.
 *
 * WHAT IT IS NOT. These are precons. A precon is a weaker list than a good
 * hand-built deck, so sitting inside this distribution is a FLOOR rather than a
 * ceiling: it says our decks are shaped like real decks, not that they are good
 * ones. It is still the only external evidence in the repo, and a deck outside
 * the range 192 real decks occupy is wrong in a way nobody has to argue about.
 *
 * AND IT IS A RANGE, NOT AN AVERAGE, because the owner is right that every
 * commander is different: real decks run 22 to 37 creatures. A deck with 24 is
 * not "5 under the median", it is normal. Only p10..p90 breaches are reported.
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';

import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import { cardRole, ROLES } from '../../src/engine/index.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = readFileSync('scratch/anon.txt', 'utf8').trim();
const catalog = new Catalog({ url: SUPABASE_URL, anonKey: ANON, authorization: null });

const bench = JSON.parse(readFileSync('scripts/probe/commander-benchmark.json', 'utf8'));
const only = process.env.ONLY?.toLowerCase();
const commanders = bench.commanders.filter(c => !only || c.name.toLowerCase().includes(only));

const yardstick = JSON.parse(readFileSync('scripts/probe/real-deck-roles.json', 'utf8'));
const real = new Map(Object.entries(yardstick.roles));

console.log(`the yardstick: ${yardstick.decks} real Commander decks, classified by our own cardRole`);
console.log('');

let checked = 0;
let outside = 0;
const offenders = new Map();
const rows = [];

for (const entry of commanders) {
  const result = await build({
    catalog,
    request: {
      commander: { name: entry.name },
      powerLevel: 7,
      includeLands: true,
      useAIPlanning: false,
    },
    apiKey: null,
    startedAt: Date.now(),
  });
  if (result.kind !== 'ok') {
    rows.push(`${entry.name.padEnd(30)} BUILD REFUSED: ${String(result.error).slice(0, 70)}`);
    continue;
  }

  const counts = {};
  for (const card of result.body.result.deck) {
    const qty = Math.max(1, Number(card.quantity) || 1);
    const shaped = {
      name: card.name,
      typeLine: card.type_line,
      type_line: card.type_line,
      cmc: card.cmc,
      facets: card.facets ?? [],
      tags: card.tags ?? [],
    };
    for (const role of ROLES) {
      if (cardRole(shaped, role)) counts[role] = (counts[role] ?? 0) + qty;
    }
  }

  const notes = [];
  for (const role of ROLES) {
    const band = real.get(role);
    if (!band) continue;
    const n = counts[role] ?? 0;
    checked += 1;
    if (n < band.p10 || n > band.p90) {
      outside += 1;
      offenders.set(role, (offenders.get(role) ?? 0) + 1);
      notes.push(`${role} ${n} (real ${band.p10}-${band.p90}, median ${band.p50})`);
    }
  }
  rows.push(
    `${entry.name.padEnd(30)} ${notes.length === 0 ? 'shaped like a real deck' : notes.join('; ')}`
  );
}

console.log(rows.join('\n'));
console.log(
  `\n${checked - outside} of ${checked} role checks inside the range real decks occupy ` +
    `(${Math.round((100 * (checked - outside)) / Math.max(1, checked))}%)`
);
if (offenders.size) {
  console.log('worst roles, by how many decks fall outside:');
  for (const [role, n] of [...offenders].sort((a, b) => b[1] - a[1])) {
    const band = real.get(role);
    console.log(`  ${role.padEnd(14)} ${n} decks outside ${band.p10}-${band.p90} (median ${band.p50})`);
  }
}
