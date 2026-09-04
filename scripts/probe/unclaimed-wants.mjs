/**
 * Which facets do commanders want that no shell hears, AND WOULD IT HELP?
 *
 *   node --experimental-strip-types scripts/probe/unclaimed-wants.mjs
 *
 * A shell is EARNED when one of its signal facets appears in the commander's
 * plan. Measured 4 Sep 2026 the average commander holds 12.1 wants and earns
 * 3.3 shells against an owner target of 4-10, and only 7.9% of commander
 * ability lines produce nothing - so the gap is not unread text, it is that
 * most of what a commander asks for, no shell is listening for.
 *
 * ## The flaw this version fixes
 *
 * The first version ranked by "commanders holding this want loudly" and put
 * `eff:recur-self` at the top with 329. Teaching two shells to hear it moved
 * the earned count from 3.2 to 3.3. The reason is that `PLAN_RULES` DERIVES
 * that want: a commander gets `eff:recur-self` BECAUSE it already has
 * `cost:sacrifice` or `trig:dies`, and Aristocrats and Reanimator claimed both
 * of those already. Those commanders were earning the shell anyway.
 *
 * **A want downstream of a claimed want is not a gap.** So this version:
 *
 *   - reads `PLAN_RULES` and marks each want DERIVED, naming its sources and
 *     whether any source is already claimed by a shell;
 *   - counts a want only for commanders who would actually BENEFIT, meaning
 *     those currently earning fewer than the target;
 *   - calls `strategiesFor` for the earned count rather than reimplementing
 *     the rule, because a second copy would drift from the one the app uses.
 *
 * A facet at the top of this list is still not automatically a shell signal.
 * It has to be something a DECK IS BUILT AROUND. `type:creature` is wanted by
 * nearly every commander and belongs to no strategy, which is what
 * `PLAN_IGNORED` is for. Read the list, do not apply it.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { planForCommander, PLAN_RULES } from '../../src/engine/knowledge/behaviour.ts';
import { SHELL_SIGNALS, strategiesFor } from '../../src/lib/deck/commanderStrategies.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const H = { apikey: K, Authorization: `Bearer ${K}` };
const TARGET = Number(process.env.TARGET ?? 4);

async function commanders() {
  const seen = new Map();
  let from = 0;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${BASE}/cards_pool?select=name,type_line,tags,facets,edhrec_rank` +
        `&commander_legal=eq.legal&type_line=like.*Legendary*Creature*` +
        `&edhrec_rank=gte.${from}&order=edhrec_rank.asc&limit=1000`,
      { headers: H }
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

/* Every facet any shell listens for. */
const claimed = new Set();
for (const sig of Object.values(SHELL_SIGNALS)) for (const f of sig.facets) claimed.add(f);

/* want -> the source facets that derive it, from PLAN_RULES. */
const sources = new Map();
for (const rule of PLAN_RULES) {
  for (const w of rule.wants) {
    if (!sources.has(w.facet)) sources.set(w.facet, new Set());
    sources.get(w.facet).add(rule.when);
  }
}

const rows = await commanders();
console.log(
  `${rows.length} commanders · ${claimed.size} facets heard by a shell · ` +
    `target ${TARGET} strategies\n`
);

const held = new Map();   // facet -> commanders holding it loudly
const wouldHelp = new Map(); // facet -> commanders holding it who are UNDER target
let under = 0;

for (const c of rows) {
  const card = {
    name: c.name,
    typeLine: c.type_line,
    type_line: c.type_line,
    facets: c.facets ?? [],
    tags: c.tags ?? [],

  };
  const earned = strategiesFor(card).filter(o => o.score > 0).length;
  const needy = earned < TARGET;
  if (needy) under += 1;

  const plan = planForCommander({
    name: c.name,
    typeLine: c.type_line,
    facets: c.facets ?? [],
    tags: c.tags ?? [],
  });
  /*
   * THE TRIBE IS A SECOND PATH TO A SHELL, and the probe has to know it.
   *
   * `strategiesFor` earns Tribal from `plan.tribe` rather than from a signal
   * facet - the Tribal signal is only `kw:changeling`, because the tribe is
   * different for every commander and no fixed list can name them all. So a
   * spider commander wanting `sub:spider` and `cares:sub:spider` ALREADY earns
   * Tribal, and counting those words as unheard is the same redundancy that put
   * `eff:recur-self` at the top of the first version of this list.
   *
   * Verified: the two real Spider commanders in the catalogue both come back
   * with `plan.tribe = spider` and `tribal` among their earned strategies.
   */
  const tribal = Boolean(plan.tribe);

  for (const w of plan.wants) {
    if (w.weight < 0.6 || claimed.has(w.facet)) continue;
    if (tribal && /^(sub:|cares:sub:|tok:)/.test(w.facet)) continue;
    held.set(w.facet, (held.get(w.facet) ?? 0) + 1);
    if (needy) wouldHelp.set(w.facet, (wouldHelp.get(w.facet) ?? 0) + 1);
  }
}

console.log(`commanders under the target: ${under} of ${rows.length}\n`);
console.log(
  'facet'.padEnd(28) + 'HELPS'.padStart(6) + 'held'.padStart(7) + '  derived from'
);
console.log('-'.repeat(78));

for (const [facet, help] of [...wouldHelp].sort((a, b) => b[1] - a[1]).slice(0, 26)) {
  const from = sources.get(facet);
  /* A source that a shell ALREADY hears makes this want redundant: the
     commander earns that shell through the source and gains nothing here. */
  const redundant = from && [...from].some(f => claimed.has(f));
  const note = !from
    ? 'read off the card'
    : `${[...from].slice(0, 3).join(', ')}${redundant ? '   << REDUNDANT' : ''}`;
  console.log(
    facet.padEnd(28) +
      String(help).padStart(6) +
      String(held.get(facet) ?? 0).padStart(7) +
      '  ' +
      note
  );
}

console.log(
  '\nHELPS counts only commanders currently UNDER the target, and a want marked\n' +
    'REDUNDANT is derived from a facet a shell already hears, so claiming it wins\n' +
    'nothing. Rank the work by HELPS, and ignore the redundant rows.'
);
