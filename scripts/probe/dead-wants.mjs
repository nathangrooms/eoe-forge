/**
 * A want no card can satisfy is a slot the deck never fills.
 *
 *   node --experimental-strip-types scripts/probe/dead-wants.mjs
 *   SHOW=60 ... more rows
 *
 * THE QUESTION THIS ASKS, and nothing else in this repo has ever asked it:
 * when the engine decides what a commander wants, are those things the pool can
 * actually give it?
 *
 * Found by reading one bad deck. Syr Vondam is paid when your own creatures are
 * exiled, so his plan asks for `eff:move-zone` at 0.80 and `eff:exile` at 0.45.
 * Both are wrong in different ways:
 *
 *   eff:move-zone   Ephemerate, Cloudshift and Ghostly Flicker produce NO
 *                   effect facets at all, so nothing the player would call a
 *                   blink spell carries it. The want is dead.
 *   eff:exile       every removal spell in the format carries it, so the deck
 *                   fills with Swords to Plowshares and Path to Exile, which do
 *                   nothing for him whatsoever.
 *
 * The generator was not confused. It did exactly what it was told, and what it
 * was told named things that either nothing has or the wrong things have. That
 * is a much cheaper class of bug than "the compiler cannot read Magic", and
 * this file finds all of it at once.
 *
 * TWO FAILURE MODES, and they need opposite fixes:
 *
 *   DEAD     almost no card carries the facet. The want does nothing, and the
 *            weight it was given is spent on nothing.
 *   FLOODED  so many cards carry it that it separates nothing, and the deck
 *            fills with whatever is most played among them. `eff:exile` on
 *            2,000 cards is not a plan, it is a shrug.
 *
 * The middle is where a want is worth having. This prints all three so the
 * judgement is visible rather than asserted.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const SHOW = Number(process.env.SHOW || 40);
const POOL = Number(process.env.POOL || 3000);

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);
const commanders = JSON.parse(
  readFileSync(new URL('../../scratch/commander-cache.json', import.meta.url), 'utf8')
);

const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);
const eng = await import(new URL('../../src/engine/knowledge/behaviour.ts', import.meta.url).href);

/*
 * THE POOL IS THE WHOLE CATALOGUE, and the first version of this file got that
 * wrong in a way worth recording.
 *
 * It filtered on `edhrec_rank`, which `catalogue-cache.json` DOES NOT CARRY —
 * the census fetches twelve columns and rank is not one of them. So the pool
 * was EMPTY, every facet had a supply of zero, and it printed "673 wants, all
 * DEAD" and "median usable plan weight 0.0%" with total confidence. Three of
 * the four instrument failures CLAUDE.md records made the product look worse
 * than it is; this would have been the fourth.
 *
 * The whole catalogue is the right denominator anyway. The owner's standing
 * instruction is that everything should be covered rather than a top-N slice,
 * and "does ANY card in Magic carry this facet" is the question that decides
 * whether a want can ever be answered.
 */
const ranked = cards;
void POOL;

process.stderr.write(`  compiling ${ranked.length} pool cards\n`);
const poolFacets = ranked.map(c => {
  try {
    return new Set(beh.facetsForCard(c).facets);
  } catch {
    return new Set();
  }
});

const carriedBy = new Map();
for (const set of poolFacets) {
  for (const f of set) carriedBy.set(f, (carriedBy.get(f) ?? 0) + 1);
}

/*
 * Every want the engine will ever produce for a real commander. Reading
 * PLAN_RULES directly would miss the wants that come from a commander's own
 * facets, which is most of them, so this runs the real function over the real
 * commanders.
 */
process.stderr.write(`  planning ${commanders.length} commanders\n`);
const wantUses = new Map();
let planned = 0;

for (const c of commanders) {
  let facets;
  try {
    facets = beh.facetsForCard(c).facets;
  } catch {
    continue;
  }
  let plan;
  try {
    plan = eng.planForCommander({
      name: c.name,
      oracleText: c.oracle_text,
      typeLine: c.type_line,
      facets,
      tags: c.tags ?? [],
      colorIdentity: c.color_identity ?? [],
    });
  } catch {
    continue;
  }
  planned++;
  for (const w of plan.wants ?? []) {
    let e = wantUses.get(w.facet);
    if (!e) {
      e = { facet: w.facet, commanders: 0, weightSum: 0, maxWeight: 0, example: '', because: '' };
      wantUses.set(w.facet, e);
    }
    e.commanders += 1;
    e.weightSum += w.weight;
    if (w.weight > e.maxWeight) {
      e.maxWeight = w.weight;
      e.example = c.name;
      e.because = w.because;
    }
  }
}

const rows = [...wantUses.values()].map(e => {
  const supply = carriedBy.get(e.facet) ?? 0;
  const share = supply / ranked.length;
  return {
    ...e,
    supply,
    share,
    avgWeight: e.weightSum / e.commanders,
    /* DEAD is measured against the deck, not against zero. A Commander deck
       holds about 63 spells, and a facet fewer than a handful of playables
       carry cannot fill even one slot reliably. */
    verdict: supply === 0 ? 'DEAD' : supply < 25 ? 'nearly dead' : share > 0.20 ? 'FLOODED' : 'usable',
  };
});

const pct = n => `${(n * 100).toFixed(1)}%`;

console.log(`\nWANTS THE ENGINE ASKS FOR, AGAINST WHAT THE POOL HOLDS\n`);
console.log(`  commanders planned            ${planned}`);
console.log(`  pool (whole catalogue)        ${ranked.length}`);
console.log(`  distinct wants ever produced  ${rows.length}\n`);

const counts = {};
for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)} wants`);

const dead = rows
  .filter(r => r.verdict === 'DEAD' || r.verdict === 'nearly dead')
  .sort((a, b) => b.commanders - a.commanders);

console.log(`\nDEAD OR NEARLY DEAD, by how many commanders are told to want them:\n`);
console.log(`  ${'commanders'.padStart(10)}  ${'in pool'.padStart(7)}  ${'avg wt'.padStart(6)}  facet`);
for (const r of dead.slice(0, SHOW)) {
  console.log(
    `  ${String(r.commanders).padStart(10)}  ${String(r.supply).padStart(7)}  ` +
      `${r.avgWeight.toFixed(2).padStart(6)}  ${r.facet.padEnd(30)} e.g. ${r.example}`
  );
}

const flooded = rows
  .filter(r => r.verdict === 'FLOODED')
  .sort((a, b) => b.commanders * b.avgWeight - a.commanders * a.avgWeight);

console.log(`\nFLOODED, so the want separates nothing and the deck fills with whatever is popular:\n`);
console.log(`  ${'commanders'.padStart(10)}  ${'in pool'.padStart(7)}  ${'share'.padStart(6)}  ${'avg wt'.padStart(6)}  facet`);
for (const r of flooded.slice(0, SHOW)) {
  console.log(
    `  ${String(r.commanders).padStart(10)}  ${String(r.supply).padStart(7)}  ` +
      `${pct(r.share).padStart(6)}  ${r.avgWeight.toFixed(2).padStart(6)}  ${r.facet}`
  );
}

/* Commanders whose WHOLE plan is dead or flooded get the worst decks, and they
   are the ones a person notices. Rank them so the complaint has a list. */
const perCommander = [];
for (const c of commanders) {
  let facets;
  try {
    facets = beh.facetsForCard(c).facets;
  } catch {
    continue;
  }
  let plan;
  try {
    plan = eng.planForCommander({
      name: c.name, oracleText: c.oracle_text, typeLine: c.type_line,
      facets, tags: c.tags ?? [], colorIdentity: c.color_identity ?? [],
    });
  } catch {
    continue;
  }
  const wants = plan.wants ?? [];
  if (wants.length === 0) continue;
  let live = 0;
  let weightLive = 0;
  let weightAll = 0;
  for (const w of wants) {
    const supply = carriedBy.get(w.facet) ?? 0;
    const usable = supply >= 25 && supply / ranked.length <= 0.20;
    weightAll += w.weight;
    if (usable) { live++; weightLive += w.weight; }
  }
  perCommander.push({
    name: c.name,
    rank: c.edhrec_rank ?? null,
    wants: wants.length,
    live,
    liveWeightShare: weightAll > 0 ? weightLive / weightAll : 0,
  });
}

const worst = perCommander
  .filter(p => p.rank !== null && p.rank < 2000)
  .sort((a, b) => a.liveWeightShare - b.liveWeightShare);

console.log(`\nMOST PLAYED COMMANDERS WHOSE PLAN THE POOL CANNOT ANSWER:\n`);
console.log(`  ${'rank'.padStart(5)}  ${'live/wants'.padStart(10)}  ${'usable wt'.padStart(9)}  commander`);
for (const p of worst.slice(0, 25)) {
  console.log(
    `  ${String(p.rank).padStart(5)}  ${`${p.live}/${p.wants}`.padStart(10)}  ` +
      `${pct(p.liveWeightShare).padStart(9)}  ${p.name}`
  );
}

const median = arr => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
console.log(`\n  median share of plan weight that is usable, all commanders: ${pct(median(perCommander.map(p => p.liveWeightShare)))}`);

writeFileSync(
  new URL('../../scratch/dead-wants.json', import.meta.url),
  JSON.stringify({ pool: ranked.length, planned, rows, worst: worst.slice(0, 200) }, null, 1)
);
console.log(`\nwrote scratch/dead-wants.json`);
