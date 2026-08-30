/**
 * Try a set of proposed intent rules against every commander, without editing
 * the engine.
 *
 * Rules are proposed as JSON so several people can work at once and every
 * proposal is measured the same way before any of it reaches
 * `src/engine/knowledge/behaviour.ts`. A rule that reads well and rescues
 * nothing is not a rule, and the only way to know which is which is to run it
 * over the real 3,781 commander-legal legends.
 *
 * INPUT: a JSON file holding `{ "rules": [ ... ] }` where each rule is
 *
 *   {
 *     "when":   "whenever you cast (or copy )?an instant or sorcery",
 *     "flags":  "i",
 *     "reads":  "triggers on your instants and sorceries",
 *     "wants":  [["cares:type:instant", 0.85], ["type:instant", 0.6]]
 *   }
 *
 * `reads` completes the sentence "<Commander name> ...", so it must be written
 * in the third person and in a player's words. No jargon, no em-dashes.
 *
 * USAGE
 *   node --experimental-strip-types scripts/coverage-try-rules.mjs my-rules.json
 *   BASELINE=1 node --experimental-strip-types scripts/coverage-try-rules.mjs
 *
 * WHAT IT REPORTS, and why each number is there:
 *
 *   RESCUED       silent commanders this rule set now gives a plan. The point.
 *   PER RULE      how many EACH rule rescues on its own, so a rule that earns
 *                 nothing can be deleted rather than kept for tidiness.
 *   FIRST ONLY    how many a rule rescues that no other rule would have, which
 *                 is the honest measure when rules overlap.
 *   OVERREACH     commanders that ALREADY had a plan and whose text this rule
 *                 also matches. Intent rules only fire on silence so this costs
 *                 nothing today, but a high number means the pattern is loose
 *                 and would do damage the moment that guard changed.
 *   STILL SILENT  what is left, which is the work list for the next pass.
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const COVERAGE = process.env.IN ?? '.shots/commander-coverage.json';
const RULES_FILE = process.argv[2] ?? null;
const VOCAB = '.shots/coverage-slices/facet-vocabulary.json';

const data = JSON.parse(fs.readFileSync(path.resolve(COVERAGE), 'utf8'));
const silent = data.silentCards;
const spoke = data.spoke;
const total = data.total;

let rules = [];
if (RULES_FILE) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(RULES_FILE), 'utf8'));
  rules = parsed.rules ?? parsed;
  if (!Array.isArray(rules)) throw new Error('rules file must hold an array, or {rules: [...]}');
}

/* A want naming a facet no card carries reaches nothing, so proposals are
   checked against the measured vocabulary before they are measured for reach.
   This catches the most common way a plausible rule does nothing at all. */
let vocab = null;
try {
  vocab = new Set(Object.keys(JSON.parse(fs.readFileSync(path.resolve(VOCAB), 'utf8')).facets));
} catch {
  console.log('(no facet vocabulary found, skipping the facet-exists check)');
}

const compiled = [];
const problems = [];
rules.forEach((r, i) => {
  const label = r.reads ? `"${r.reads}"` : `rule ${i + 1}`;
  if (!r.when) { problems.push(`${label}: no \`when\` pattern`); return; }
  if (!r.reads) problems.push(`rule ${i + 1}: no \`reads\`, so it cannot say why`);
  if (/—|–/.test(r.reads ?? '')) problems.push(`${label}: em-dash in player-facing text`);
  if (!Array.isArray(r.wants) || !r.wants.length) { problems.push(`${label}: no wants`); return; }
  for (const [facet, weight] of r.wants) {
    if (vocab && !vocab.has(facet) && !facet.startsWith('sub:') && !facet.startsWith('tok:')) {
      problems.push(`${label}: wants \`${facet}\`, which no sampled card carries`);
    }
    if (typeof weight !== 'number' || weight <= 0 || weight > 1) {
      problems.push(`${label}: weight ${weight} for \`${facet}\` is outside 0 to 1`);
    }
  }
  try {
    compiled.push({ ...r, re: new RegExp(r.when, r.flags ?? 'i') });
  } catch (e) {
    problems.push(`${label}: \`when\` is not a valid regex (${String(e).slice(0, 60)})`);
  }
});

if (problems.length) {
  console.log('PROBLEMS WITH THE PROPOSAL');
  for (const p of problems) console.log(`  ${p}`);
  console.log('');
}

/* Reach, per rule and overall. */
const rescuedBy = new Map(compiled.map(r => [r.reads ?? r.when, []]));
const firstOnly = new Map(compiled.map(r => [r.reads ?? r.when, []]));
const rescued = [];
const stillSilent = [];

for (const c of silent) {
  const hits = compiled.filter(r => r.re.test(c.text));
  if (!hits.length) { stillSilent.push(c); continue; }
  rescued.push(c);
  for (const h of hits) rescuedBy.get(h.reads ?? h.when).push(c.name);
  if (hits.length === 1) firstOnly.get(hits[0].reads ?? hits[0].when).push(c.name);
}

/* Overreach: does this pattern also match commanders that already read fine?
   Recomputing their plans is the only way to know they were not silent. */
const overreach = new Map(compiled.map(r => [r.reads ?? r.when, 0]));
const coverageAll = JSON.parse(fs.readFileSync(path.resolve(COVERAGE), 'utf8'));
for (const c of coverageAll.silentCards) void c; // silent already counted above
if (fs.existsSync(path.resolve('.shots/commander-coverage-spoke.json'))) {
  const spokeCards = JSON.parse(
    fs.readFileSync(path.resolve('.shots/commander-coverage-spoke.json'), 'utf8')
  );
  for (const c of spokeCards) {
    for (const r of compiled) if (r.re.test(c.text ?? '')) {
      overreach.set(r.reads ?? r.when, (overreach.get(r.reads ?? r.when) ?? 0) + 1);
    }
  }
}

const withText = silent.filter(s => s.text.trim()).length;
const vanilla = silent.length - withText;
const pct = x => `${((x / total) * 100).toFixed(1)}%`;

console.log(`every commander-legal legend: ${total}`);
console.log(`  had a plan before        ${spoke} (${pct(spoke)})`);
console.log(`  silent before            ${silent.length} (${pct(silent.length)})`);
console.log(`    of which vanilla       ${vanilla} (no rules text, no pattern can reach them)`);
console.log('');
console.log(`RESCUED by these ${compiled.length} rules: ${rescued.length}`);
console.log(`  coverage now             ${spoke + rescued.length} (${pct(spoke + rescued.length)})`);
console.log(`  STILL SILENT             ${stillSilent.length} (${pct(stillSilent.length)})`);
console.log(`    with text              ${stillSilent.filter(s => s.text.trim()).length}`);
console.log(`    vanilla                ${stillSilent.filter(s => !s.text.trim()).length}`);
console.log('');

if (compiled.length) {
  console.log('PER RULE');
  const sorted = [...rescuedBy.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [label, names] of sorted) {
    const only = firstOnly.get(label)?.length ?? 0;
    const over = overreach.get(label) ?? 0;
    const flag = names.length === 0 ? '   <- rescues nothing, delete it' : '';
    console.log(
      `  ${String(names.length).padStart(4)} rescued  ${String(only).padStart(4)} only-this-rule  ` +
      `${String(over).padStart(4)} overreach   ${label}${flag}`
    );
  }
  console.log('');
}

const out = process.env.OUT_STILL ?? '.shots/still-silent.json';
fs.writeFileSync(
  path.resolve(out),
  JSON.stringify({ count: stillSilent.length, commanders: stillSilent }, null, 2)
);
console.log(`what is still silent: ${out}`);
