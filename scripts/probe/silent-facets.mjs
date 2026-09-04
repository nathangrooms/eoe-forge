/*
 * Which commander facets produce NO want, ranked by how many commanders they
 * leave with nothing to say.
 *
 *   node --experimental-strip-types scripts/probe/silent-facets.mjs
 *   LOUD=0.7 THIN=2 node --experimental-strip-types scripts/probe/silent-facets.mjs
 *
 * ## Why this exists
 *
 * `random-commander-sweep` reports about 30% of random commanders building a
 * deck that does not feel like theirs. `scratch/_thinplans.mjs` found the shape
 * behind it: NINETEEN of forty had two or fewer LOUD wants, and for many the
 * entire top of the plan was the protection floor - `grants:hexproof` 0.5,
 * `grants:shroud` 0.45, `grants:indestructible` 0.4 - which every creature
 * commander gets so that Swiftfoot Boots can be chosen. For a commander whose
 * abilities produce no want, that floor IS the plan, and the deck is built
 * around protecting a commander rather than around what the commander does.
 *
 * Quake, Agent of S.H.I.E.L.D. and Sidar Jabari are `rec:full` - the compiler
 * read every clause - and still produce five wants, all of them the floor. So
 * this is NOT the reading gap that `commander-read-audit` measures. It is the
 * gap between reading a card and representing what it WANTS, which is a
 * different job and has never been counted.
 *
 * ## What it reports
 *
 * A facet is SILENT for a commander when the commander carries it and no want
 * in the resulting plan came from it - neither the facet itself nor anything
 * `PLAN_RULES` derives from it. Ranked by how many THIN commanders carry it,
 * because a silent facet on a commander with a rich plan costs nothing.
 *
 * Each row is a candidate PLAN_RULE, and the count is how many commanders it
 * would give something to say. That is the same shape that fixed `trig:dies`,
 * where the rule asked only for self-recursion and left every aristocrats
 * commander planning as a counters deck.
 *
 * ## Read the list, do not apply it
 *
 * A facet at the top is not automatically a rule. `type:creature` is carried by
 * every creature commander and says nothing about a deck, which is what
 * `PLAN_IGNORED` is for. The test is whether a PLAYER would name a different
 * deck on seeing it.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import {
  planForCommander,
  PLAN_RULES,
  PLAN_IGNORED,
} from '../../src/engine/knowledge/behaviour.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const H = { apikey: K, Authorization: `Bearer ${K}` };
const LOUD = Number(process.env.LOUD ?? 0.7);
const THIN = Number(process.env.THIN ?? 2);

/* Rank keyset, never `offset`: page two of an offset walk returns 57014. */
async function commanders() {
  const seen = new Map();
  let from = 0;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${BASE}/rest/v1/cards_pool?select=name,type_line,edhrec_rank,tags,facets` +
        `&commander_legal=eq.legal&type_line=like.*Legendary*Creature*` +
        `&edhrec_rank=gte.${from}&order=edhrec_rank.asc&limit=1000`,
      { headers: H }
    );
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) seen.set(r.name, r);
    const last = rows[rows.length - 1].edhrec_rank;
    if (rows.length < 1000) break;
    from = last === from ? last + 1 : last;
  }
  return [...seen.values()];
}

/* What each facet can produce, so a want DERIVED from a facet counts as that
   facet speaking. Without this every source facet reads as silent and the
   ranking is meaningless - the same redundancy that put `eff:recur-self` at the
   top of `unclaimed-wants` before it learned to read PLAN_RULES. */
const derives = new Map();
for (const rule of PLAN_RULES) {
  const set = derives.get(rule.when) ?? new Set();
  for (const w of rule.wants) set.add(w.facet);
  derives.set(rule.when, set);
}

/* The floor every creature commander gets. A plan made only of these is a plan
   that says nothing about the commander. */
const FLOOR = new Set([
  'grants:hexproof',
  'grants:shroud',
  'grants:indestructible',
  'grants:haste',
  'type:creature',
]);

const rows = await commanders();
const silentThin = new Map();
const silentAll = new Map();
let thin = 0;
let floorOnly = 0;

for (const c of rows) {
  const facets = c.facets ?? [];
  const plan = planForCommander({
    name: c.name,
    typeLine: c.type_line,
    facets,
    tags: c.tags ?? [],
  });
  const wantFacets = new Set(plan.wants.map(w => w.facet));
  const loud = plan.wants.filter(w => w.weight >= LOUD).length;
  const isThin = loud <= THIN;
  if (isThin) thin += 1;
  if (plan.wants.every(w => FLOOR.has(w.facet))) floorOnly += 1;

  for (const f of new Set(facets)) {
    if (PLAN_IGNORED.has(f)) continue;
    if (f.startsWith('rec:')) continue;
    /* Spoke for itself, or something it derives is in the plan. */
    if (wantFacets.has(f)) continue;
    const from = derives.get(f);
    if (from && [...from].some(w => wantFacets.has(w))) continue;
    silentAll.set(f, (silentAll.get(f) ?? 0) + 1);
    if (isThin) silentThin.set(f, (silentThin.get(f) ?? 0) + 1);
  }
}

console.log(`${rows.length} commanders read from cards_pool\n`);
console.log(`plans with ${THIN} or fewer wants at weight ${LOUD}+   ${thin}  (${Math.round((100 * thin) / rows.length)}%)`);
console.log(`plans made ONLY of the protection floor            ${floorOnly}\n`);
console.log(
  'facet'.padEnd(30) + 'THIN'.padStart(6) + 'all'.padStart(7) + '   a rule here would give these commanders something to say'
);
console.log('-'.repeat(100));
for (const [facet, n] of [...silentThin].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(facet.padEnd(30) + String(n).padStart(6) + String(silentAll.get(facet) ?? 0).padStart(7));
}
console.log(
  '\nTHIN counts only commanders whose plan is already too quiet to build around.\n' +
    'Rank the work by THIN. Read each facet as a player before writing a rule:\n' +
    'a facet that does not change what deck you would build is not a plan rule.'
);
