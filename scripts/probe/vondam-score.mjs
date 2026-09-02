/**
 * Score a generated Syr Vondam deck against the two human-built ones.
 *
 *   node scripts/probe/vondam-score.mjs
 *
 * The owner linked two Moxfield decks on 31 Aug 2026 with the words *"this is
 * just to test our system against, not to copy"*. `vondam-benchmark.json` holds
 * CARD NAMES ONLY, read once, as a scoring target. CLAUDE.md ruling Moxfield
 * out as a DATA SOURCE still stands and no scraper exists.
 *
 * ## What it scores, and why not overlap
 *
 * Overlap with a human decklist is the WRONG measure and would reward copying.
 * Two builders agreeing on 32 cards is evidence those cards belong to the
 * ARCHETYPE, so what is scored is whether the generator finds the archetype:
 *
 *     blink spells      the effect itself
 *     blink engines     repeatable, which is what makes it a deck
 *     worth blinking    creatures whose ETB is the payoff
 *
 * Those three groups are the thing that was missing. The aristocrats half of
 * Vondam the generator already found on its own, because "dies" was read and
 * "is put into exile" was not.
 *
 * `notATheme` is scored SEPARATELY and a hit there is not a win. Swords to
 * Plowshares is a fine card in a white deck and is not blink; the generator
 * used to fill with it because `eff:exile` sat at 0.45 of Vondam's plan, and
 * the failure was never that removal is bad, it was that removal was counted as
 * synergy.
 *
 * Read-only. Builds against the DEPLOYED function, because CLAUDE.md records
 * this generator serving old code for days while the repo was correct.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const K = readFileSync(new URL('../../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const bench = JSON.parse(readFileSync(new URL('vondam-benchmark.json', import.meta.url), 'utf8'));

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

const t0 = Date.now();
const res = await fetch(`${BASE}/functions/v1/ai-deck-builder-v2`, {
  method: 'POST',
  headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    commander: {
      name: bench.commander,
      color_identity: ['W', 'B'],
      colors: ['W', 'B'],
      type_line: 'Legendary Creature',
    },
    powerLevel: 7,
    includeLands: true,
    useAIPlanning: false,
    ...(process.env.ARCHETYPE ? { archetype: process.env.ARCHETYPE } : {}),
  }),
});
const ms = Date.now() - t0;

if (!res.ok) {
  console.error(`generator -> ${res.status} after ${ms} ms`);
  console.error((await res.text()).slice(0, 500));
  process.exit(1);
}
const body = await res.json();

/* `result.deck` is the shape the deployed function returns; entries are card
   rows directly, though older builds wrapped them in `.card`. */
const list = (body?.result?.deck ?? []).map(d => d?.card ?? d);
const names = list.map(c => c?.name).filter(Boolean);

if (!names.length) {
  console.error('no card names in the response. Keys: ' + Object.keys(body).join(', '));
  console.error(JSON.stringify(body).slice(0, 600));
  process.exit(1);
}

const have = new Set(names.map(norm));
const groups = [
  ['blink spells', bench.blinkSpells],
  ['blink engines', bench.blinkEngines],
  ['worth blinking', bench.worthBlinking],
  ['in both human decks', bench.inBothDecks],
];

console.log(`\nSYR VONDAM, against the DEPLOYED generator. ${names.length} cards, ${ms} ms\n`);

let totalHit = 0;
let totalOf = 0;
for (const [label, cards] of groups) {
  if (!cards?.length) continue;
  const hit = cards.filter(c => have.has(norm(c)));
  if (label !== 'in both human decks') { totalHit += hit.length; totalOf += cards.length; }
  const pct = ((hit.length / cards.length) * 100).toFixed(0);
  console.log(`  ${label.padEnd(22)} ${String(hit.length).padStart(2)}/${String(cards.length).padEnd(3)} ${pct.padStart(3)}%`);
  if (hit.length) console.log(`      found: ${hit.join(', ')}`);
}

console.log(`\n  THE ARCHETYPE (first three groups)  ${totalHit}/${totalOf}  ` +
  `${((totalHit / totalOf) * 100).toFixed(1)}%`);

const notTheme = (bench.notATheme?.cards ?? []).filter(c => have.has(norm(c)));
console.log(`\n  cards that are fine but are NOT the theme: ` +
  (notTheme.length ? notTheme.join(', ') : 'none'));
console.log(`      ${bench.notATheme?.note?.slice(0, 150) ?? ''}`);

/* The junk tail, which is the other half of "is this deck good". */
const ranks = list
  .filter(c => !String(c?.type_line ?? '').toLowerCase().includes('land'))
  .map(c => c?.edhrec_rank)
  .filter(r => typeof r === 'number');
if (ranks.length) {
  ranks.sort((a, b) => a - b);
  console.log(`\n  median EDHREC rank ${ranks[Math.floor(ranks.length / 2)]}, ` +
    `${ranks.filter(r => r > 15000).length} cards past 15,000`);
}
