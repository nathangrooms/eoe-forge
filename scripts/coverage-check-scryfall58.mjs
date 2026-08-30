/**
 * Score a proposed rule file against the 58 commanders Scryfall offers that our
 * plan reader says nothing about.
 *
 * `coverage-try-rules.mjs` is the right tool for reach and overreach, but it
 * scores against `.shots/commander-coverage.json`, our own catalogue census,
 * whose silent set is 44. The set the deck generator's picker actually offers
 * is Scryfall's `is:commander`, and the 58 in
 * `.shots/quality/coverage-against-scryfall.json` are the ones that matter.
 *
 * That file truncates oracle text at 200 characters and leaves it empty for
 * every double-faced card, so the text is re-read from
 * `.shots/quality/scryfall-commanders.json`, faces joined with a newline
 * exactly as `planForCommander` joins them.
 */
import fs from 'node:fs';

const RULES_FILE = process.argv[2];
const cov = JSON.parse(fs.readFileSync('.shots/quality/coverage-against-scryfall.json', 'utf8'));
const sf = JSON.parse(fs.readFileSync('.shots/quality/scryfall-commanders.json', 'utf8'));
const vocab = new Set(
  Object.keys(JSON.parse(fs.readFileSync('.shots/coverage-slices/facet-vocabulary.json', 'utf8')).facets)
);
const byName = new Map(sf.map(c => [c.name, c]));

const textOf = name => {
  const c = byName.get(name);
  if (!c) return '';
  const own = (c.oracle_text ?? '').trim();
  if (own) return own;
  return (c.card_faces ?? []).map(f => f.oracle_text ?? '').filter(Boolean).join('\n');
};

const parsed = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
const rules = (parsed.rules ?? parsed).map(r => ({
  ...r,
  wants: r.wants.map(w => (Array.isArray(w) ? w : [w.facet, w.weight])),
  re: new RegExp(r.when, r.flags ?? 'i'),
}));

const problems = [];
for (const r of rules) {
  if (/—|–/.test(r.reads ?? '')) problems.push(`${r.reads}: em-dash`);
  for (const [f, w] of r.wants) {
    if (!vocab.has(f) && !f.startsWith('sub:') && !f.startsWith('tok:')) {
      problems.push(`${r.reads}: wants \`${f}\`, which no sampled card carries`);
    }
    if (typeof w !== 'number' || w <= 0 || w > 1) problems.push(`${r.reads}: weight ${w} out of range`);
  }
}
if (problems.length) console.log('PROBLEMS\n  ' + problems.join('\n  ') + '\n');

const silent = cov.silent.map(c => ({ ...c, full: textOf(c.name) }));
const vanilla = silent.filter(c => !c.full.trim());
const withText = silent.filter(c => c.full.trim());

const per = new Map(rules.map(r => [r.reads, []]));
const only = new Map(rules.map(r => [r.reads, []]));
const rescued = [];
const left = [];
for (const c of silent) {
  const hits = rules.filter(r => r.re.test(c.full));
  if (!hits.length) { left.push(c); continue; }
  rescued.push(c);
  for (const h of hits) per.get(h.reads).push(c.name);
  if (hits.length === 1) only.get(hits[0].reads).push(c.name);
}

/* Overreach against the set the picker offers: commanders that already read
   fine and whose text a pattern also matches. */
const silentNames = new Set(cov.silent.map(c => c.name));
const over = new Map(rules.map(r => [r.reads, 0]));
for (const c of sf) {
  if (silentNames.has(c.name)) continue;
  const t = (c.oracle_text ?? '') || (c.card_faces ?? []).map(f => f.oracle_text ?? '').join('\n');
  for (const r of rules) if (r.re.test(t)) over.set(r.reads, over.get(r.reads) + 1);
}

console.log(`offered by Scryfall as is:commander   ${cov.offered}`);
console.log(`  already had a plan                  ${cov.covered}`);
console.log(`  silent                              ${silent.length}`);
console.log(`    with rules text                   ${withText.length}`);
console.log(`    no rules text at all              ${vanilla.length}  (needs the floor, not a rule)`);
console.log('');
console.log(`RESCUED by these ${rules.length} rules: ${rescued.length} of 58  (${rescued.length}/${withText.length} of those with text)`);
console.log(`STILL SILENT: ${left.length}   with text: ${left.filter(c => c.full.trim()).length}`);
console.log('');
console.log('PER RULE  (rescued / only-this-rule / overreach onto the 3,353 already covered)');
for (const r of rules) {
  const n = per.get(r.reads).length;
  console.log(
    `  ${String(n).padStart(3)}  ${String(only.get(r.reads).length).padStart(3)}  ` +
    `${String(over.get(r.reads)).padStart(5)}   ${r.reads}` +
    (n === 0 ? '   <- rescues nothing here' : '') +
    `\n         ${per.get(r.reads).join(', ')}`
  );
}
console.log('\nSTILL SILENT WITH TEXT');
for (const c of left.filter(x => x.full.trim())) console.log(`  ${c.name}`);
console.log('\nSTILL SILENT, NO TEXT (the floor population)');
for (const c of left.filter(x => !x.full.trim())) console.log(`  ${c.name}  r${c.rank}  ${c.typeLine}`);
