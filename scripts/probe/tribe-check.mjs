/**
 * Does a tribal commander's deck actually hold its tribe?
 *
 *   node --experimental-strip-types scripts/probe/tribe-check.mjs [names...]
 *
 * WHY THIS EXISTS. The candidate pool is the top N by POPULARITY, and a tribe's
 * members are played only in that tribe's decks, so they rank badly and a
 * bounded pool held none of them. SLIVER HIVELORD came back with ZERO SLIVERS
 * in 99 cards and six per cent keyed synergy, and no yardstick in this repo
 * could see it: the deck was 99 cards, hit every role floor, held every staple
 * and passed the shape check.
 *
 * Measured 6 Sep 2026, of the tribes with 40 or more members, how many are in
 * the top 2,500 by rank: Hero 0, Sliver 0, Mutant 1, Villain 2, Robot 2, Rat 2,
 * Ally 3, Spider 3, Ninja 3. Any tribal commander whose identity forces a small
 * budget was building a deck without its tribe.
 *
 * The tribe is read from `planForCommander`, not guessed from the name - Marneus
 * Calgar's tribe is `astartes`, and a hand-typed list would have said Ally and
 * measured the wrong thing. A commander with NO tribe reporting 0 is correct:
 * Kykar, Wind's Fury makes Spirit tokens and is a spellslinger, not Spirit
 * tribal.
 *
 * Default roster after the fix:
 *   Krenko 24 goblins · Sliver Hivelord 19 · Lathril 19 · Yuriko 14 ·
 *   Arasta 14 spiders · Marneus Calgar 6 astartes · Kykar no tribe, 0
 */
import { readFileSync } from 'node:fs';
import { planForCommander } from '../../src/engine/knowledge/behaviour.ts';
const ANON = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const B = 'https://udnaflcohfyljrsgqggy.supabase.co';
const DEFAULT_ROSTER = [
  'Sliver Hivelord', 'Krenko, Mob Boss', 'Lathril, Blade of the Elves',
  "Yuriko, the Tiger's Shadow", 'Arasta of the Endless Web', 'Marneus Calgar',
  "Kykar, Wind's Fury", 'Edgar Markov', 'Lathliss, Dragon Queen',
];
const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROSTER;
for (const name of names) {
  const [row] = await (await fetch(`${B}/rest/v1/cards_unique?select=name,type_line,oracle_text,faces,color_identity,keywords,mana_cost,cmc,power&name=eq.${encodeURIComponent(name)}`, { headers: H })).json();
  if (!row) { console.log(`${name.slice(0,28).padEnd(30)} not in the catalogue`); continue; }
  const [p] = await (await fetch(`${B}/rest/v1/cards_pool?select=facets&name=eq.${encodeURIComponent(name)}`, { headers: H })).json();
  const tribe = planForCommander({ ...row, typeLine: row.type_line, oracleText: row.oracle_text, facets: p?.facets ?? [] }).tribe;
  const res = await fetch(`${B}/functions/v1/ai-deck-builder-v2`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ commander: { name }, format: 'commander', powerLevel: 7 }) });
  const body = await res.json();
  const deck = (body?.result?.deck ?? []).map(d => d.card ?? d);
  if (!deck.length) { console.log(`${name.slice(0,28).padEnd(30)} BUILD FAILED ${String(body?.error ?? body?.code ?? '').slice(0,40)}`); continue; }
  const re = tribe ? new RegExp(tribe, 'i') : null;
  const n = re ? deck.filter(c => re.test(c.typeLine ?? c.type_line ?? '')).length : 0;
  console.log(`${name.slice(0,28).padEnd(30)} tribe=${String(tribe ?? 'none').padEnd(10)} ${String(deck.length).padStart(3)} cards, ${String(n).padStart(2)} of them`);
}

/* A tribal commander holding fewer than this reads as a deck that is not its
   tribe. Not a hard threshold - a small tribe genuinely has few members - which
   is why the row prints the count rather than a pass or a fail. */
console.log('');
console.log('A commander with no tribe holding 0 is correct. A tribal one in single figures is worth reading as a player.');
