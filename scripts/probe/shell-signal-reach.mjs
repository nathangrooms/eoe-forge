/**
 * Can each shell actually be EARNED through the facets it keys on?
 *
 *   node --experimental-strip-types scripts/probe/shell-signal-reach.mjs
 *
 * `strategiesFor` scores a shell against the COMMANDER'S PLAN WANTS, never
 * against its raw facets. So a signal facet that no plan ever produces is a
 * signal that can never fire, and the shell is reachable only through its
 * remaining signals or its tag fallback.
 *
 * That is not hypothetical. `SHELL_SIGNALS.lands` keys on `cares:type:land`,
 * and `planForCommander` skipped it for every commander - against its own
 * comment, which said the echo stays. Tatyova, Benthic Druid, who draws a card
 * whenever a land enters, read as "Tokens and Aristocrats" until 5 Sep 2026.
 *
 * This prints, for every signal facet of every shell, how many commanders
 * carry it and how many get it as a WANT. A row with commanders carrying it
 * and ZERO wanting it is the Lands bug in a new place.
 */
import { readFileSync } from 'node:fs';
import { planForCommander } from '../../src/engine/knowledge/behaviour.ts';
import { SHELL_SIGNALS } from '../../src/lib/deck/commanderStrategies.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const H = { apikey: K, Authorization: `Bearer ${K}` };

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

const cmds = await commanders();
const carries = new Map();
const wants = new Map();
for (const c of cmds) {
  const facets = c.facets ?? [];
  const plan = planForCommander({
    name: c.name, typeLine: c.type_line, facets, tags: c.tags ?? [],
  });
  const wantSet = new Set(plan.wants.map(w => w.facet));
  for (const [, signal] of Object.entries(SHELL_SIGNALS)) {
    for (const f of signal.facets) {
      if (facets.includes(f)) carries.set(f, (carries.get(f) ?? 0) + 1);
      if (wantSet.has(f)) wants.set(f, (wants.get(f) ?? 0) + 1);
    }
  }
}

console.log(`${cmds.length} commanders read from cards_pool\n`);
console.log('shell            signal facet                    carry   want');
console.log('-'.repeat(74));
const dead = [];
for (const [id, signal] of Object.entries(SHELL_SIGNALS)) {
  for (const f of signal.facets) {
    const c = carries.get(f) ?? 0;
    const w = wants.get(f) ?? 0;
    const flag = c > 0 && w === 0 ? '   <-- CARRIED BY COMMANDERS, WANTED BY NONE' : '';
    if (flag) dead.push(`${id}: ${f} (${c} commanders carry it)`);
    console.log(`${id.padEnd(16)} ${f.padEnd(30)} ${String(c).padStart(5)} ${String(w).padStart(6)}${flag}`);
  }
}
console.log(
  dead.length
    ? `\n${dead.length} signal(s) that can never fire:\n  ${dead.join('\n  ')}`
    : '\nEvery signal a commander carries can also be wanted. No dead signals.'
);
