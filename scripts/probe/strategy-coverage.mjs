/**
 * Does EVERY commander get strategies, and are they the commander's own?
 *
 *   node --experimental-strip-types scripts/probe/strategy-coverage.mjs
 *
 * The owner: *"each commander has 4-10 different strategies it can be selected
 * and played by"* and *"there are like 3.5k commanders, need strategies for
 * all of them correctly."* Twenty benchmark commanders cannot answer that, and
 * every strategy fault found so far was invisible on a small sample: the
 * Tribal signal never read the tribe, and it took looking at Krenko to notice.
 *
 * So this runs `strategiesFor` over EVERY commander-legal legendary creature
 * and reports the distribution. The number that matters is not how many
 * strategies are offered - the panel always fills its slots - but how many the
 * COMMANDER ASKED FOR. An offer with score 0 is one of the shells shown to
 * everybody; a commander whose whole list is score 0 has been read as nothing
 * and is being sold a generic deck.
 */
import { readFileSync } from 'node:fs';
import { strategiesFor } from '../../src/lib/deck/commanderStrategies.ts';
import { facetsForCard } from '../../src/lib/deck/recommend/behaviour.ts';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}` };

async function page(path, from = 0, size = 1000, acc = []) {
  const res = await fetch(`${URL}/${path}&limit=${size}&offset=${from}`, { headers: H });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  acc.push(...rows);
  return rows.length < size ? acc : page(path, from + size, size, acc);
}

console.log('reading every commander ...');
const commanders = await page(
  /* `cards_pool` carries no oracle text and no keywords - it is the nine
     ranking columns plus facets - and `strategiesFor` needs the text only to
     derive facets and tags when it has neither. A pool row has both, and they
     are the same ones the app reads, so this is the app's own reading. */
  'cards_pool?select=name,type_line,mana_cost,cmc,tags,facets' +
    '&commander_legal=eq.legal&type_line=like.*Legendary*Creature*'
);
console.log(`${commanders.length} commander-legal legendary creatures\n`);

const byCount = new Map();
const shellUse = new Map();
const noneAsked = [];
let offered = 0;
let asked = 0;

for (const c of commanders) {
  const offers = strategiesFor(c);
  offered += offers.length;
  const real = offers.filter(o => o.score > 0);
  asked += real.length;
  byCount.set(real.length, (byCount.get(real.length) ?? 0) + 1);
  for (const o of real) shellUse.set(o.label, (shellUse.get(o.label) ?? 0) + 1);
  if (real.length === 0) noneAsked.push(c.name);
}

console.log(`offered      ${(offered / commanders.length).toFixed(1)} strategies per commander (the panel fills its slots)`);
console.log(`ASKED FOR    ${(asked / commanders.length).toFixed(1)} per commander — the ones the commander's own record earned\n`);

console.log('how many strategies each commander actually earned:');
for (const n of [...byCount.keys()].sort((a, b) => a - b)) {
  const c = byCount.get(n);
  console.log(
    `  ${String(n).padStart(2)} earned  ${String(c).padStart(5)}  ${((100 * c) / commanders.length).toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round((60 * c) / commanders.length))}`
  );
}

console.log(`\ncommanders whose list is ENTIRELY generic: ${noneAsked.length} (${((100 * noneAsked.length) / commanders.length).toFixed(1)}%)`);
if (noneAsked.length) console.log('  e.g. ' + noneAsked.slice(0, 12).join(', '));

console.log('\nhow often each shell is EARNED (not merely shown):');
for (const [label, n] of [...shellUse].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${label.padEnd(18)} ${String(n).padStart(5)}  ${((100 * n) / commanders.length).toFixed(1).padStart(5)}%`
  );
}
