/**
 * Em-dashes in text a player reads.
 *
 * Copy rule, project-wide: "No em-dashes in user-facing copy. Rewrite the
 * sentence rather than swapping the dash for a semicolon or brackets. A
 * sentence that needed an em-dash usually wanted to be two sentences." Code
 * comments are exempt, so they are stripped before looking, or the real hits
 * drown in this repo's very long explanatory comments.
 *
 * This cannot be a grep. `grep` does not read \u escapes, and a naive sweep of
 * whole files reports about 1,700 hits of which roughly ten are real.
 *
 * THREE THINGS ARE NOT VIOLATIONS AND ARE SKIPPED:
 *
 *   A MAGIC TYPE LINE. "Creature — Bear" is how Wizards prints it and how
 *   Scryfall stores it. It is card data, not our copy, and flagging it would
 *   mean rewriting the game's own notation.
 *
 *   A RANGE OR A SCORE. "2–5 lands", "$2 – $10", "wins 2–0", "W–L–D". That is
 *   an EN dash doing the job en dashes exist for, between numbers.
 *
 *   A BARE DASH. A literal that is nothing but a dash is the standard
 *   placeholder for a cell with no value, which is what a table should show
 *   instead of a zero.
 *
 * A NOTE ON EDITING THIS FILE. It was first written through a shell heredoc and
 * then patched through two more, and a pass ate a backslash: `\b` in the
 * type-line pattern became U+0008 BACKSPACE, so the exemption asked for a
 * backspace character, matched nothing, and cheerfully reported "skipped 0
 * Magic type lines" while printing forty of them. That is the fifth time in one
 * session a backslash escape has been destroyed by passing code through a
 * string transformation. Edit this file DIRECTLY. Nothing below uses `\b`, so
 * there is one fewer escape to lose.
 *
 *   node scripts/probe/em-dash-sweep.mjs
 *   node scripts/probe/em-dash-sweep.mjs src/components/play
 *
 * Exits non-zero when anything is found, so it can gate a commit.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? 'src';

const EM = '—';
const EN = '–';
const DASH = new RegExp('[' + EM + EN + ']');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

/* Comments out first. A block comment can hold quotes and a string can hold a
   slash, so neither pass is perfect alone; this order gets this repo right,
   because its comments are prose and its strings are short. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

const CARD_TYPES = new Set([
  'Artifact', 'Creature', 'Enchantment', 'Instant', 'Sorcery', 'Land',
  'Planeswalker', 'Battle', 'Tribal', 'Kindred', 'Dungeon', 'Plane',
  'Scheme', 'Vanguard', 'Conspiracy', 'Phenomenon', 'Emblem', 'Token',
  'Legendary', 'Basic', 'Snow', 'World', 'Ongoing', 'Host', 'Elite',
]);

/** "Legendary Creature — Angel Horror", including one built from a template. */
const isTypeLine = (text) => {
  const before = text.split(EM)[0];
  if (before === text) return false;
  const words = before.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  return words.every((w) => CARD_TYPES.has(w));
};

/** A range or a score: numbers, currency or a template hole on both sides. */
const isNumericRange = (text) => {
  const filled = text.replace(/\$\{[^}]*\}/g, '0');
  const between = new RegExp('[0-9.$)]\\s*[' + EM + EN + ']\\s*[0-9.$(]');
  if (between.test(filled)) return true;
  return new RegExp('^[WLD0-9' + EM + EN + ' ]+$').test(text.trim());
};

const isPlaceholder = (text) =>
  new RegExp('^[\\s' + EM + EN + ']*$').test(text);

const isTest = (f) =>
  /\.test\.[tj]sx?$/.test(f) || /[\\/](__tests__|fixtures)[\\/]/.test(f);

const hits = [];
const skipped = { typeLine: 0, range: 0, placeholder: 0, testFiles: 0 };

for (const file of walk(ROOT)) {
  if (isTest(file)) { skipped.testFiles++; continue; }
  const body = stripComments(fs.readFileSync(file, 'utf8'));
  for (const m of body.matchAll(LITERAL)) {
    const text = m[2];
    if (!DASH.test(text)) continue;
    if (isPlaceholder(text)) { skipped.placeholder++; continue; }
    if (isTypeLine(text.trim())) { skipped.typeLine++; continue; }
    if (isNumericRange(text)) { skipped.range++; continue; }
    hits.push({ file, text });
  }
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);

for (const h of hits) {
  console.log(h.file.replace(/\\/g, '/'));
  console.log('    ' + h.text.replace(/\s+/g, ' ').slice(0, 110));
}
console.log('');
console.log(`em-dashes in player copy: ${hits.length} across ${byFile.size} files`);
console.log(
  `skipped: ${skipped.typeLine} type lines, ${skipped.range} ranges and scores, ` +
  `${skipped.placeholder} bare-dash placeholders, ${skipped.testFiles} test files`
);
process.exit(hits.length ? 1 : 0);
