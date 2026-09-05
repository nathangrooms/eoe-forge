/**
 * "Reads the whole card" does not mean the card is understood.
 *
 *   node --experimental-strip-types scripts/probe/whole-card-honesty.mjs [n]
 *
 * `coverage: 'full'` means the compiler CONSUMED every paragraph. It does not
 * mean it understood them: a paragraph can be consumed into a `{do:'manual'}`
 * marker, which is a note to a human and does nothing at all. CLAUDE.md has
 * warned for weeks that "read the whole card" and "read it correctly" are two
 * numbers that must never be quoted as one, and the headline 33.6% is the
 * first one.
 *
 * This splits it. For a sample of the catalogue by play rate it reports, of the
 * cards the compiler says it read whole:
 *
 *   runs        no marker anywhere - every clause became something executable
 *   marker      at least one clause consumed into a note for a human
 *   all-marker  every effect it produced is a marker: read whole, understood
 *               not at all
 *
 * The third is the one that makes the headline dishonest, and it is the number
 * to quote when somebody asks how much of a card the engine really knows.
 */
import { readFileSync } from 'node:fs';
import { facetsForCard } from '../../src/lib/deck/recommend/behaviour.ts';
import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect } from '../../src/lib/cards/abilities/dsl.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const H = { apikey: K, Authorization: `Bearer ${K}` };
const WANT = Number(process.argv[2] ?? 2000);

/* Rank keyset, never `offset`: page two of an offset walk returns 57014. */
const rows = [];
let from = 0;
while (rows.length < WANT) {
  const res = await fetch(
    `${BASE}/rest/v1/cards_unique?select=name,type_line,oracle_text,keywords,mana_cost,cmc,faces,edhrec_rank` +
      `&oracle_text=not.is.null&edhrec_rank=gte.${from}&order=edhrec_rank.asc&limit=1000`,
    { headers: H }
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const page = await res.json();
  if (!page.length) break;
  rows.push(...page);
  const last = page[page.length - 1].edhrec_rank;
  from = last === from ? last + 1 : last;
  if (page.length < 1000) break;
}

let full = 0, runs = 0, someMarker = 0, allMarker = 0, other = 0;
const examples = [];
for (const r of rows.slice(0, WANT)) {
  /* `compileWithTrace` returns { result, ruleHits } - the coverage and the
     abilities are on `.result`. Reading them off the top level gave 0 of 2,000
     cards as 'full', which is a perfect score for a broken instrument. */
  const compiled = compileWithTrace({
    name: r.name, type_line: r.type_line, oracle_text: r.oracle_text,
    keywords: r.keywords, mana_cost: r.mana_cost, cmc: r.cmc, faces: r.faces,
  }).result;
  if (compiled.coverage !== 'full') { other += 1; continue; }
  full += 1;
  const abilities = compiled.abilities ?? [];
  const withEffects = abilities.filter(a => Array.isArray(a.effects) && a.effects.length);
  const markers = withEffects.filter(a => hasManualEffect(a.effects));
  if (markers.length === 0) { runs += 1; continue; }
  someMarker += 1;
  if (withEffects.length > 0 && markers.length === withEffects.length) {
    allMarker += 1;
    if (examples.length < 12) examples.push(`${r.name} (#${r.edhrec_rank})`);
  }
}

const pct = n => `${((100 * n) / Math.max(1, full)).toFixed(1)}%`;
console.log(`\n${rows.slice(0, WANT).length} cards by play rate; ${full} report coverage 'full'\n`);
console.log(`  runs           ${String(runs).padStart(5)}  ${pct(runs).padStart(6)}   every clause became something executable`);
console.log(`  some marker    ${String(someMarker).padStart(5)}  ${pct(someMarker).padStart(6)}   at least one clause is a note for a human`);
console.log(`  ALL marker     ${String(allMarker).padStart(5)}  ${pct(allMarker).padStart(6)}   read whole, understood not at all`);
console.log(`\n  (${other} of the sample are not 'full' and are not counted above)`);
if (examples.length) console.log(`\n  read whole and entirely markers:\n    ${examples.join('\n    ')}`);
