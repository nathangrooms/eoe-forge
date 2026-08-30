/**
 * Turn a measured rule set into the TypeScript that goes in behaviour.ts.
 *
 * WHY THIS IS GENERATED AND NOT TYPED IN
 *
 * A rule is a regex, and a regex retyped by hand is a regex with a different
 * meaning. This session has already lost time four separate ways to exactly
 * that: `\b` inside a template literal is the BACKSPACE character, so
 * `/\bCreature\b/i` matched nothing and looked like a clean result; a Python
 * replace wrote a literal newline into `[^\n]`; and the deployed tagger's own
 * 4,000-character creature-type regex was left alone specifically because
 * re-emitting it by hand risked silently breaking tribal tagging on 34,000
 * cards. The rules here were MEASURED as JSON. What lands in the engine has to
 * be the same bytes that were measured, so it is written by a program.
 *
 * It prints the block to stdout. Read it, then paste it in, or use --write to
 * splice it between the markers in behaviour.ts.
 *
 *   node --experimental-strip-types scripts/coverage-apply-rules.mjs .shots/coverage-slices/merged.json
 *   node --experimental-strip-types scripts/coverage-apply-rules.mjs merged.json --write
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.argv[2];
const WRITE = process.argv.includes('--write');
const TARGET = 'src/engine/knowledge/behaviour.ts';

const BEGIN = '  /* BEGIN GENERATED INTENT RULES */';
const END = '  /* END GENERATED INTENT RULES */';

if (!FILE) {
  console.error('usage: coverage-apply-rules.mjs <rules.json> [--write]');
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(path.resolve(FILE), 'utf8'));
const rules = parsed.rules ?? parsed;
if (!Array.isArray(rules)) throw new Error('expected {rules: [...]} or an array');

/** A want is either ["facet", 0.8] or {facet, weight}. Read both. */
const wantsOf = (r) =>
  (r.wants ?? []).map(w => (Array.isArray(w) ? { facet: w[0], weight: w[1] } : w));

const problems = [];
for (const r of rules) {
  if (!r.when) problems.push(`a rule has no \`when\``);
  if (!r.reads) problems.push(`${r.when}: no \`reads\``);
  if (/[—–]/.test(r.reads ?? '')) problems.push(`${r.reads}: em-dash in player-facing copy`);
  if (!wantsOf(r).length) problems.push(`${r.reads}: no wants`);
  try { new RegExp(r.when, r.flags ?? 'i'); }
  catch (e) { problems.push(`${r.reads}: bad regex (${String(e).slice(0, 60)})`); }
}
if (problems.length) {
  console.error('REFUSING TO EMIT:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

/* A regex written into TS source as a literal has to survive the TS lexer, and
   the only characters that can end it early are an unescaped `/` and a newline.
   Everything else, backslashes included, is passed through untouched, which is
   the whole reason the pattern is emitted as a LITERAL rather than as a string
   handed to `new RegExp`: a string would need its backslashes doubled, and that
   doubling is precisely the step that keeps going wrong. */
const asLiteral = (source, flags = 'i') => {
  if (/\n|\r/.test(source)) throw new Error(`pattern contains a newline: ${source}`);
  const escaped = source.replace(/(^|[^\\])\//g, '$1\\/');
  return `/${escaped}/${flags}`;
};

const wrap = (text, width, indent) => {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line.trim());
  return lines.map(l => `${indent}// ${l}`).join('\n');
};

const body = rules
  .map(r => {
    const why = r.why ? `${wrap(r.why, 68, '    ')}\n` : '';
    const wants = wantsOf(r)
      .map(w => `      ['${w.facet}', ${w.weight}],`)
      .join('\n');
    return (
      `  {\n` +
      why +
      `    when: ${asLiteral(r.when, r.flags ?? 'i')},\n` +
      `    reads: ${JSON.stringify(r.reads)},\n` +
      `    wants: [\n${wants}\n    ],\n` +
      `  },`
    );
  })
  .join('\n');

const block = `${BEGIN}\n${body}\n${END}`;

if (!WRITE) {
  console.log(block);
  console.error(`\n${rules.length} rules, ${rules.reduce((a, r) => a + wantsOf(r).length, 0)} wants`);
  process.exit(0);
}

const target = path.resolve(TARGET);
let src = fs.readFileSync(target, 'utf8');
const a = src.indexOf(BEGIN);
const b = src.indexOf(END);
if (a === -1 || b === -1) {
  console.error(
    `Could not find the markers in ${TARGET}.\n` +
    `Add these two lines inside the INTENT_RULES array, with the hand-written\n` +
    `rules outside them, then re-run:\n\n${BEGIN}\n${END}`
  );
  process.exit(1);
}
src = src.slice(0, a) + block + src.slice(b + END.length);
fs.writeFileSync(target, src);
console.error(`wrote ${rules.length} rules into ${TARGET}`);
