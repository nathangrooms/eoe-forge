/**
 * Which facets do commanders WANT that no shell signal claims?
 *
 *   node --experimental-strip-types scripts/probe/unclaimed-wants.mjs
 *
 * A shell is EARNED when one of its signal facets appears in the commander's
 * plan. Measured 4 Sep 2026 the average commander has 12.1 wants and earns 3.2
 * shells, against an owner target of 4-10, so the gap is not that commanders
 * are unread - only 7.9% of their ability lines produce nothing - it is that
 * most of what they want, no shell is listening for.
 *
 * This ranks the unheard wants by how many commanders hold them, which is the
 * work list. The same question found `eff:damage`, `cares:zone:exile`,
 * `tok:treasure`, `eff:impulse` and `eff:discard` on 3 Sep and took the
 * commanders earning NOTHING from 81 to 49.
 *
 * A facet appearing here is not automatically a shell signal. It has to be
 * something a DECK IS BUILT AROUND: `type:creature` is wanted by nearly every
 * commander and belongs to no strategy, which is why `PLAN_IGNORED` exists.
 * Read the list, do not apply it.
 */
import { readFileSync } from 'node:fs';
import { planForCommander } from '../../src/engine/knowledge/behaviour.ts';
import { SHELL_SIGNALS } from '../../src/lib/deck/commanderStrategies.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const H = { apikey: K, Authorization: `Bearer ${K}` };

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

const claimed = new Set();
for (const sig of Object.values(SHELL_SIGNALS)) for (const f of sig.facets) claimed.add(f);

const rows = await commanders();
console.log(`${rows.length} commanders; ${claimed.size} facets claimed by a shell signal\n`);

/* Counted two ways. A want held by many commanders FAINTLY is a different
   problem from one held LOUDLY by a few: only the loud one is a strategy
   somebody would pick. */
const anyCount = new Map();
const loudCount = new Map();
let earnedNothing = 0;

for (const c of rows) {
  const plan = planForCommander({
    name: c.name,
    typeLine: c.type_line,
    facets: c.facets ?? [],
    tags: c.tags ?? [],
  });
  let earns = false;
  for (const w of plan.wants) {
    if (claimed.has(w.facet)) { earns = true; continue; }
    anyCount.set(w.facet, (anyCount.get(w.facet) ?? 0) + 1);
    if (w.weight >= 0.6) loudCount.set(w.facet, (loudCount.get(w.facet) ?? 0) + 1);
  }
  if (!earns) earnedNothing += 1;
}

console.log(`commanders whose wants include NOTHING any shell listens for: ${earnedNothing}\n`);
console.log('UNHEARD WANTS, ranked by commanders holding them LOUDLY (>= 0.6)\n');
console.log('facet'.padEnd(30) + 'loud'.padStart(6) + 'any'.padStart(8));
for (const [facet, n] of [...loudCount].sort((a, b) => b[1] - a[1]).slice(0, 28)) {
  console.log(facet.padEnd(30) + String(n).padStart(6) + String(anyCount.get(facet) ?? 0).padStart(8));
}
