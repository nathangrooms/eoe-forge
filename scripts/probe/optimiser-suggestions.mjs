/**
 * What does the optimiser want to PUT IN a real deck, and how played is it?
 *
 *   node --experimental-strip-types scripts/probe/optimiser-suggestions.mjs
 *
 * Every other instrument here scores the GENERATOR. The optimiser is the other
 * half of the same engine and had never been measured, partly because it could
 * not even be deployed until 4 Sep 2026.
 *
 * It scores against a NON-EMPTY deck, where `popularityWeight` is 0.8 rather
 * than the empty-deck 2.4 while the role gap stays at 3.0. So the question is
 * whether a cheap card that technically fills a role beats a better card that
 * does the same job, which is what "Chatterfang, Squirrel General out for Black
 * Sun's Twilight" looked like.
 *
 * The deck it is handed is one the generator built, because that is what a
 * player who used this app actually has.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Catalog } from '../../supabase/functions/deck-optimizer/catalog.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const U = 'https://udnaflcohfyljrsgqggy.supabase.co/functions/v1';
const catalog = new Catalog({
  url: 'https://udnaflcohfyljrsgqggy.supabase.co', anonKey: K, authorization: null,
});

const COMMANDERS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Meren of Clan Nel Toth', 'Krenko, Mob Boss', 'Talrand, Sky Summoner',
     'Teysa Karlov', 'Sythis, Harvest\u2019s Hand'];

const rows = [];
for (const name of COMMANDERS) {
  const g = await (await fetch(`${U}/ai-deck-builder-v2`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ commander: { name }, powerLevel: 7, includeLands: true }),
  })).json();
  const deck = g?.result?.deck;
  if (!deck) { console.log(`${name}: generate failed`); continue; }

  const r = await fetch(`${U}/deck-optimizer`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      deckContext: {
        id: null, name: 'probe', format: 'commander', commander: { name },
        cards: deck.map(c => ({
          name: c.name, type_line: c.type_line, mana_cost: c.mana_cost,
          cmc: c.cmc, quantity: c.quantity || 1,
        })),
      },
      useCollection: false, collectionCards: [],
    }),
  });
  const a = (await r.json())?.analysis ?? {};
  /* `add` and `remove` are NAMES on a replacement, and the reasons live on
     `addBenefit` / `removeReason`. A probe reading `reason` prints blanks and
     looks like a feature with no explanations. */
  const swaps = a.replacements ?? [];
  const wanted = swaps.map(s => s.add).filter(Boolean);
  const dropped = swaps.map(s => s.remove).filter(Boolean);
  const meta = await catalog.cardsByName([...wanted, ...dropped], 'commander');
  const rank = new Map(meta.map(m => [m.name, m.edhrec_rank ?? null]));
  const rk = n => (typeof rank.get(n) === 'number' ? rank.get(n) : null);

  const inRanks = wanted.map(rk).filter(n => n !== null).sort((x, y) => x - y);
  const outRanks = dropped.map(rk).filter(n => n !== null).sort((x, y) => x - y);
  const med = xs => (xs.length ? xs[Math.floor(xs.length / 2)] : null);
  const deep = inRanks.filter(n => n > 12000).length;

  rows.push({ name, swaps: swaps.length, inMed: med(inRanks), outMed: med(outRanks), deep });
  console.log(
    `${name.slice(0, 24).padEnd(25)} ${String(swaps.length).padStart(2)} swaps  ` +
      `in median ${String(med(inRanks) ?? '-').padStart(5)}  ` +
      `out median ${String(med(outRanks) ?? '-').padStart(5)}  ` +
      `past 12k in ${deep}`
  );
  for (const s of swaps.slice(0, 3)) {
    console.log(
      `    ${String(s.remove).slice(0, 22).padEnd(23)}(${rk(s.remove) ?? '-'})` +
        ` -> ${String(s.add).slice(0, 22).padEnd(23)}(${rk(s.add) ?? '-'})`
    );
  }
}

const worse = rows.filter(r => r.inMed !== null && r.outMed !== null && r.inMed > r.outMed);
console.log(
  `\n${worse.length} of ${rows.length} decks are being handed cards LESS played ` +
    `than the ones they lose.\nA swap is only an improvement if what arrives is ` +
    `better, and rank is the only external evidence here.`
);
