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
/*
 * PAGE BY RANK, FILTER THE TYPE LOCALLY.
 *
 * This asked PostgREST for `type_line=like.*Legendary*Creature*` - a LEADING
 * WILDCARD, which cannot use a btree index - inside a loop of forty. Each
 * iteration was a sequential scan of 33,000 rows plus an ordering, and on
 * 6 Sep 2026 it returned 57014 immediately after the health gate had passed at
 * 0.18 s. CLAUDE.md already records the same shape costing 2,007 ms against
 * 172 ms elsewhere.
 *
 * `edhrec_rank` bands ride `cards_pool_rank_idx`. 600 keeps every band under
 * PostgREST's 1000-row cap, which is silent when exceeded.
 */
async function allCommanders() {
  const seen = new Map();
  const BAND = 600;
  for (let from = 0; from < 30000; from += BAND) {
    const res = await fetch(
      `${BASE}/rest/v1/cards_pool?select=name,type_line,color_identity,edhrec_rank,tags,facets` +
        `&commander_legal=eq.legal&edhrec_rank=gte.${from}&edhrec_rank=lt.${from + BAND}` +
        `&order=edhrec_rank.asc`,
      { headers: { apikey: K, Authorization: `Bearer ${K}` } }
    );
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
    const rows = await res.json();
    if (rows.length >= 1000) {
      throw new Error(`rank band ${from}-${from + BAND} returned ${rows.length} rows; PostgREST caps at 1000 and this band may be TRUNCATED. Narrow BAND.`);
    }
    for (const r of rows) {
      const t = String(r.type_line ?? '');
      if (t.includes('Legendary') && t.includes('Creature')) seen.set(r.name, r);
    }
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

/* THE TEXT FOR THE SAMPLED COMMANDERS ONLY, from `cards_unique`, because
   `cards_pool` carries no `oracle_text` and `planForCommander` needs it to run
   the English intent rules. Forty names, one chunked read. */
{
  const names = picked.map(p => p.name);
  for (let i = 0; i < names.length; i += 40) {
    const chunk = names
      .slice(i, i + 40)
      .map(n => `"${String(n).replace(/"/g, '')}"`)
      .join(',');
    const res = await fetch(
      `${BASE}/rest/v1/cards_unique?select=name,oracle_text,faces&name=in.(${encodeURIComponent(chunk).replace(/%2C/g, ',')})`,
      { headers: { apikey: K, Authorization: `Bearer ${K}` } }
    );
    if (!res.ok) continue;
    const rows = await res.json();
    if (!Array.isArray(rows)) continue;
    const byName = new Map(rows.map(r => [r.name, r]));
    for (const p of picked) {
      const r = byName.get(p.name);
      if (r) {
        p.oracle_text = r.oracle_text ?? null;
        p.faces = r.faces ?? null;
      }
    }
  }
  const withText = picked.filter(p => p.oracle_text != null).length;
  console.log(`oracle text read for ${withText} of ${picked.length} sampled commanders`);
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

  /*
   * THE ORACLE TEXT, because the generator reads the commander WITH it.
   *
   * `planForCommander` runs the 113 English intent rules only when it is
   * handed the text, and `cards_pool` does not carry `oracle_text` - it is a
   * thin projection by design. So this scored every deck against a plan
   * missing the intent-rule half, and reported decks as generic that are not:
   * Isamaru, Hound of Konda came back at 18% holding Sram, Kor Spiritdancer,
   * All That Glitters, Eidolon of Countless Battles and Sage's Reverie, which
   * is a good voltron deck by any reading.
   *
   * The generator builds its commander through `toBuildCard(commanderRow)` and
   * that row DOES carry the text, so this was the instrument being wrong and
   * not the product. Same trap `scratch/_whynot.mjs` was fixed for.
   */
  const plan = planForCommander({
    name: c.name,
    typeLine: c.type_line,
    facets: c.facets ?? [],
    tags: c.tags ?? [],
    oracleText: c.oracle_text ?? null,
    faces: c.faces ?? null,
  });
  const nonland = deck.filter(x => !/\bLand\b/i.test(String(x.type_line ?? '')));
  /*
   * HOW MANY CARDS CAN ACTUALLY ANSWER A PERMANENT, on random commanders.
   *
   * The `removal` ROLE is granted by `eff:damage`, which cannot tell a creature
   * from a face, so a deck of pings reads as fully stocked. Measured on the
   * SAME metric over the 30 MTGJSON Commander decks whose cards all resolve:
   * min 4, p10 6, median 9, p90 12. A hard verb only - `eff:damage` is excluded
   * on both sides, which undercounts a real burn spell but keeps the comparison
   * honest.
   *
   * The eighteen shells are a fixed list. This is the instrument that says
   * whether interaction holds up across the whole commander space.
   */
  const ANSWER_FACETS = ['eff:destroy', 'eff:exile', 'eff:neutralise', 'eff:gain-control'];
  const answers = nonland.filter(x =>
    ANSWER_FACETS.some(f => (facets.get(x.name) ?? []).includes(f))
  ).length;

  const keyed = nonland.filter(
    x => planFit(plan, { facets: facets.get(x.name) ?? [] }).fit >= 0.45
  ).length;
  const keyedPct = Math.round((100 * keyed) / Math.max(1, nonland.length));

  const flags = [];
  if (total !== 99) flags.push(`CARDS ${total}+1`);
  if (ramp < 11) flags.push(`RAMP ${ramp}`);
  if (lands < 35) flags.push(`LANDS ${lands}`);
  if (staples < want.length) flags.push(`staples ${staples}/${want.length}`);

  rows.push({ name: c.name, ok: true, total, ramp, lands, staples, want: want.length, keyedPct, answers, ms, flags });
  console.log(
    `${c.name.slice(0, 30).padEnd(31)} ${String(total).padStart(3)} cards  ` +
      `ramp ${String(ramp).padStart(2)}  lands ${String(lands).padStart(2)}  ` +
      `staples ${staples}/${want.length}  keyed ${String(keyedPct).padStart(3)}%  ` +
      `answers ${String(answers).padStart(2)}${answers < 6 ? '!' : ' '} ` +
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
console.log(
  `answers          median ${med(ok.map(r => r.answers))}   ` +
  `below the real p10 of 6: ${ok.filter(r => r.answers < 6).length}/${ok.length}   ` +
  `(real decks: p10 6, median 9, p90 12)`
);
/* The SPREAD matters more than the median. A deck at 6% keyed is a pile of good
   cards in the commander's colours: legal, playable, and not that commander's
   deck. That is the honest failure mode and a median hides it. */
const band = (lo, hi) => ok.filter(r => r.keyedPct >= lo && r.keyedPct < hi).length;
console.log(
  `  keyed spread   under 30%: ${band(0, 30)}   30-59%: ${band(30, 60)}   ` +
    `60-79%: ${band(60, 80)}   80%+: ${band(80, 101)}`
);
console.log(`build time       median ${med(ok.map(r => r.ms))} ms, slowest ${Math.max(...ok.map(r => r.ms))} ms`);
