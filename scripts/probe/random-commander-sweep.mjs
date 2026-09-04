/**
 * Build a deck for a RANDOM sample of commanders, against the DEPLOYED function.
 *
 *   node --experimental-strip-types scripts/probe/random-commander-sweep.mjs
 *   N=60 SEED=7 node --experimental-strip-types scripts/probe/random-commander-sweep.mjs
 *
 * ## Why this exists
 *
 * Every other instrument in this repo builds the SAME commanders: fourteen in
 * `deployed-deck-sweep`, twenty in `commander-bench`, seven in the roster. They
 * are the commanders whose faults have already been fixed, which is exactly the
 * population least likely to show a new one. The owner's question is whether
 * this works for **3,500 commanders**, and a fixed list cannot answer it.
 *
 * So this samples the whole commander space at random and reports, per deck,
 * the things that make a deck PLAYABLE rather than merely legal:
 *
 *   cards     100 or it is not a Commander deck
 *   ramp      the owner: "decks need way to make mana - game unplayable
 *             otherwise". Real decks run 11 at the tenth percentile.
 *   lands     37 at the tenth percentile in the 192 real decks
 *   staples   Sol Ring and Arcane Signet in every deck, plus Boots and Greaves
 *             when the commander is a creature
 *   keyed     nonland cards the commander's own plan actually wanted
 *
 * A deck that builds but runs six ramp is a deck nobody can play, so "it built"
 * is not the measurement.
 *
 * The sample is SEEDED so a bad result can be re-run and investigated rather
 * than being a story about a commander nobody can find again.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { Catalog } from '../../supabase/functions/deck-optimizer/catalog.ts';
import { planForCommander, planFit } from '../../src/engine/knowledge/behaviour.ts';
import { cardRole } from '../../src/engine/index.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const catalog = new Catalog({ url: BASE, anonKey: K, authorization: null });

const N = Number(process.env.N ?? 40);
const SEED = Number(process.env.SEED ?? 1);

/* A seeded generator, so the sample is reproducible. `Math.random` would make
   every failure a one-off anecdote. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* Rank keyset, never `offset`: this file's own repo records page two of an
   offset walk returning 57014. */
async function allCommanders() {
  const seen = new Map();
  let from = 0;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${BASE}/rest/v1/cards_pool?select=name,type_line,color_identity,edhrec_rank,tags,facets` +
        `&commander_legal=eq.legal&type_line=like.*Legendary*Creature*` +
        `&edhrec_rank=gte.${from}&order=edhrec_rank.asc&limit=1000`,
      { headers: { apikey: K, Authorization: `Bearer ${K}` } }
    );
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) seen.set(r.name, r);
    const last = rows[rows.length - 1].edhrec_rank;
    if (rows.length < 1000) break;
    from = last === from ? last + 1 : last;
  }
  return [...seen.values()];
}

const pool = await allCommanders();
console.log(`${pool.length} commanders in the pool; sampling ${N} with seed ${SEED}\n`);

const rand = rng(SEED);
const picked = [];
const used = new Set();
while (picked.length < Math.min(N, pool.length)) {
  const i = Math.floor(rand() * pool.length);
  if (used.has(i)) continue;
  used.add(i);
  picked.push(pool[i]);
}

const STAPLES = ['Sol Ring', 'Arcane Signet'];
const CREATURE_STAPLES = ['Lightning Greaves', 'Swiftfoot Boots'];
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

const rows = [];
let failed = 0;

for (const c of picked) {
  const started = Date.now();
  let deck = null;
  let err = null;
  try {
    const res = await fetch(`${BASE}/functions/v1/ai-deck-builder-v2`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ commander: { name: c.name }, powerLevel: 7, includeLands: true }),
    });
    const body = await res.json().catch(() => null);
    deck = body?.result?.deck ?? null;
    if (!deck) err = `${res.status} ${JSON.stringify(body).slice(0, 60)}`;
  } catch (e) {
    err = String(e).slice(0, 60);
  }
  const ms = Date.now() - started;

  if (!deck) {
    failed += 1;
    rows.push({ name: c.name, ok: false, err, ms });
    console.log(`${c.name.slice(0, 30).padEnd(31)} FAILED  ${err}  ${ms}ms`);
    continue;
  }

  /* 99, NOT 100. The response `deck` is the NINETY-NINE, and the commander is
     the hundredth card - `deployed-deck-sweep` prints exactly that as "99+1".
     The first version of this file checked for 100 and flagged all 40 decks in
     the sample as wrong, which is the instrument being wrong rather than the
     product, and it is the fourth time this repo has recorded that shape. */
  const total = deck.reduce((n, x) => n + (Number(x.quantity) || 1), 0);
  const lands = deck
    .filter(x => /\bLand\b/i.test(String(x.type_line ?? '')))
    .reduce((n, x) => n + (Number(x.quantity) || 1), 0);

  /* Facets from the POOL. A response card carries none, and `cardRole` would
     fall through to the tag door - a different classifier answering a different
     question, which this repo has already been caught by twice. */
  const facets = await catalog.poolFacetsByName(deck.map(x => x.name));
  const ramp = deck
    .filter(x =>
      cardRole(
        {
          name: x.name,
          typeLine: x.type_line,
          type_line: x.type_line,
          cmc: x.cmc,
          tags: x.tags ?? [],
          facets: facets.get(x.name) ?? [],
        },
        'ramp'
      )
    )
    .reduce((n, x) => n + (Number(x.quantity) || 1), 0);

  const isCreature = (c.facets ?? []).includes('type:creature');
  const want = [...STAPLES, ...(isCreature ? CREATURE_STAPLES : [])];
  const have = new Set(deck.map(x => norm(x.name)));
  const staples = want.filter(s => have.has(norm(s))).length;

  const plan = planForCommander({
    name: c.name,
    typeLine: c.type_line,
    facets: c.facets ?? [],
    tags: c.tags ?? [],
  });
  const nonland = deck.filter(x => !/\bLand\b/i.test(String(x.type_line ?? '')));
  const keyed = nonland.filter(
    x => planFit(plan, { facets: facets.get(x.name) ?? [] }).fit >= 0.45
  ).length;
  const keyedPct = Math.round((100 * keyed) / Math.max(1, nonland.length));

  const flags = [];
  if (total !== 99) flags.push(`CARDS ${total}+1`);
  if (ramp < 11) flags.push(`RAMP ${ramp}`);
  if (lands < 35) flags.push(`LANDS ${lands}`);
  if (staples < want.length) flags.push(`staples ${staples}/${want.length}`);

  rows.push({ name: c.name, ok: true, total, ramp, lands, staples, want: want.length, keyedPct, ms, flags });
  console.log(
    `${c.name.slice(0, 30).padEnd(31)} ${String(total).padStart(3)} cards  ` +
      `ramp ${String(ramp).padStart(2)}  lands ${String(lands).padStart(2)}  ` +
      `staples ${staples}/${want.length}  keyed ${String(keyedPct).padStart(3)}%  ` +
      `${String(ms).padStart(5)}ms  ${flags.join(' ') || 'ok'}`
  );
}

const ok = rows.filter(r => r.ok);
const clean = ok.filter(r => r.flags.length === 0);
const med = xs => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

console.log('\n' + '='.repeat(78));
console.log(`built            ${ok.length}/${rows.length}   (${failed} failed outright)`);
console.log(`99 + commander   ${ok.filter(r => r.total === 99).length}/${ok.length}`);
console.log(`ramp >= 11       ${ok.filter(r => r.ramp >= 11).length}/${ok.length}   median ${med(ok.map(r => r.ramp))}`);
console.log(`lands >= 35      ${ok.filter(r => r.lands >= 35).length}/${ok.length}   median ${med(ok.map(r => r.lands))}`);
console.log(`every staple     ${ok.filter(r => r.staples === r.want).length}/${ok.length}`);
console.log(`NOTHING flagged  ${clean.length}/${ok.length}`);
console.log(`keyed synergy    median ${med(ok.map(r => r.keyedPct))}%`);
/* The SPREAD matters more than the median. A deck at 6% keyed is a pile of good
   cards in the commander's colours: legal, playable, and not that commander's
   deck. That is the honest failure mode and a median hides it. */
const band = (lo, hi) => ok.filter(r => r.keyedPct >= lo && r.keyedPct < hi).length;
console.log(
  `  keyed spread   under 30%: ${band(0, 30)}   30-59%: ${band(30, 60)}   ` +
    `60-79%: ${band(60, 80)}   80%+: ${band(80, 101)}`
);
console.log(`build time       median ${med(ok.map(r => r.ms))} ms, slowest ${Math.max(...ok.map(r => r.ms))} ms`);
