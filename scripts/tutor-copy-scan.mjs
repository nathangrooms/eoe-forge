/**
 * The copy rules, run over the fifty stored answers.
 *
 * This is the mechanical half of the editor's pass. It checks only what a
 * machine can check without judgement: em dashes, en dashes, the banned words
 * from CLAUDE.md 10a, a price rendered as zero, and number agreement of the
 * "1 cards" kind. Everything else in the review is read by eye, because
 * "does this sentence answer the question that was asked" is not a regex.
 *
 * The banned word list and the em dash and zero price rules are copied from
 * supabase/functions/mtg-brain/answer/voice.ts on purpose, so this script
 * checks the shipped output rather than re-running the shipped checker. If the
 * two ever disagree, that disagreement is the finding.
 *
 *   node scripts/tutor-copy-scan.mjs
 */

import { readFileSync } from 'node:fs';

const file = new URL('./tutor-fifty-answers.json', import.meta.url);
const run = JSON.parse(readFileSync(file, 'utf8'));

const BANNED = [
  'ai', 'assistant', 'smart', 'intelligent', 'powered by', 'neural', 'gpt',
  'model', 'bot', 'llm', 'algorithm',
];

/** Product vocabulary a Magic player would not say at a table. */
const HOUSE_WORDS = [
  'portability', 'round trip', 'subscore', 'taxonomy', 'canonical', 'engine',
  'pipeline', 'primitive', 'schema', 'endpoint', 'payload', 'metadata',
  'parse', 'render', 'boolean', 'null',
];

/** Short forms that are ours or the combo list's, not plain speech. */
const SHORT_FORMS = [/\bETB\b/, /\bLTB\b/, /\bCMC\b/, /\bEDH(?!REC)\b/];

function faults(text) {
  const out = [];
  const emDashes = (text.match(/—/g) || []).length;
  if (emDashes) out.push(`em dash x${emDashes}`);
  if (text.includes('–')) out.push('en dash');
  if (/[$€£]\s?0\.00/.test(text)) out.push('price printed as zero');

  const flat = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')} `;
  for (const word of BANNED) if (flat.includes(` ${word} `)) out.push(`banned word "${word}"`);
  for (const word of HOUSE_WORDS) if (flat.includes(` ${word} `)) out.push(`house word "${word}"`);
  for (const re of SHORT_FORMS) if (re.test(text)) out.push(`short form ${re.source}`);

  // "The 1 most played", "1 cards", "1 combos": a count of one wearing a plural.
  const agreement = text.match(/\b1 (cards|combos|printings|decks|copies|lands)\b/g) || [];
  for (const hit of agreement) out.push(`number agreement: "${hit}"`);
  if (/\bThe 1 \b/.test(text)) out.push('number agreement: "The 1 ..."');

  return out;
}

const rows = run.results;
let clean = 0;
const flagged = [];

for (const row of rows) {
  const found = faults(row.answer ?? '');
  if (found.length === 0) clean += 1;
  else flagged.push({ id: row.id, found });
}

console.log(`answers scanned: ${rows.length}`);
console.log(`clean on the mechanical rules: ${clean}`);
console.log(`flagged: ${flagged.length}`);
for (const row of flagged) console.log(`  ${row.id}  ${row.found.join(' | ')}`);

// How many answers are one of the repeated blocks rather than a written reply.
const byOpening = new Map();
for (const row of rows) {
  const key = (row.answer ?? '').slice(0, 60);
  if (!byOpening.has(key)) byOpening.set(key, []);
  byOpening.get(key).push(row.id);
}
console.log('\nrepeated blocks:');
for (const [key, ids] of byOpening) {
  if (ids.length > 1) console.log(`  ${ids.length} x ${JSON.stringify(key)}`);
}

const refused = rows.filter(r => r.standing === 'refused');
console.log(`\nanswers whose standing is a refusal: ${refused.length}`);
