/**
 * Regenerate the compiler's subtype vocabulary from the card pool.
 *
 * `grammar.ts` carries `SUBTYPES_RAW`, and its own comment says what it is:
 * "every subtype word on three or more rows", derived from the catalogue, and
 * "regenerating it is a data question, not a memory one". This script is that
 * question, asked against the cached Scryfall bulk file rather than against the
 * `cards` table, because the table is a stale snapshot and the bulk file is not.
 *
 * A missing word is not a cosmetic gap. `parseObject` refuses any phrase
 * containing a word it cannot place, so one absent subtype refuses every rule
 * that reads the phrase: "Saproling" is absent, so "create a 1/1 green Saproling
 * creature token" compiles to a `{do:'manual'}` marker on every card that says
 * it, and each of those cards is SILENT.
 *
 * Prints three lists: what the pool has and the file does not, what the file has
 * and the pool does not, and the words the pool would add that are also ordinary
 * English and therefore belong in `SUBTYPE_BLOCKLIST` instead. The last list is
 * the reason this is not applied automatically: adding "Time" or "Lord" to the
 * vocabulary makes `parseObject` produce a filter for half the sentences in the
 * game.
 *
 * No Supabase, no network, no model. Reads the cached bulk file on disk.
 *
 * Usage:  node --experimental-strip-types scripts/subtype-vocabulary.mjs
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubtypeWord } from '../src/lib/cards/abilities/grammar.ts';
import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { effectsOf } from '../src/lib/cards/abilities/dsl.ts';

/** Every `{do:'manual'}` marker text in a tree. */
function manualTexts(effects, out = []) {
  for (const e of effects ?? []) {
    if (e.do === 'manual') out.push(String(e.text ?? ''));
    else if (e.do === 'if') { manualTexts(e.then, out); manualTexts(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may') manualTexts(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes) manualTexts(m.effects, out);
    else if (e.do === 'unless-pays') manualTexts(e.effects, out);
  }
  return out;
}
import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,

} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`);
  process.exit(1);
}

/** The threshold `grammar.ts` says it used. Kept identical so the two agree. */
const MIN_ROWS = 3;

/**
 * Words that are subtypes AND ordinary English. Flagged rather than added, so a
 * reader decides. This is the same judgement `SUBTYPE_BLOCKLIST` already
 * encodes; the list is here so the script can say "this one needs a decision"
 * instead of silently proposing it.
 */
const ALSO_ENGLISH = new Set([
  'time', 'will', 'lord', 'book', 'eye', 'plan', 'planet', 'seal', 'child',
  'sphere', 'gamma', 'town', 'cave', 'gate', 'mount', 'omen', 'trap', 'shrine',
  'assembly', 'arcane', 'adventure', 'lesson', 'background', 'desert', 'locus',
  'rune', 'lair', 'elder', 'processor', 'carrier', 'case', 'siege', 'attraction',
  'doctor', 'sorcerer', 'ranger', 'guest', 'blood', 'map', 'junk', 'gold',
  'class', 'room', 'saga', 'curse', 'aura', 'equipment', 'vehicle', 'hero',
  'villain', 'spy', 'noble', 'monk', 'archer', 'citizen', 'peasant', 'employee',
  'survivor', 'officer', 'pilot', 'scientist', 'gamer', 'clown', 'performer',
  'coward', 'minion', 'ally', 'god', 'shade', 'spike', 'egg', 'food', 'clue',
  'treasure', 'incubator', 'contraption', 'powerstone', 'synth', 'drone',
  'mystic', 'bard', 'detective', 'advisor', 'rebel', 'nomad', 'mercenary',
  'berserker', 'assassin', 'artificer', 'scout', 'rigger', 'druid', 'shaman',
  'cleric', 'warlock', 'wizard', 'warrior', 'knight', 'soldier', 'human',
]);

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

const counts = new Map();
let pool = 0;

/** Census-pool rows only, kept for the blocking count below. */
const poolRows = [];

for await (const card of rows(SRC)) {
  const inPool =
    !EXCLUDED_LAYOUTS.has(card.layout) &&
    !EXCLUDED_SET_TYPES.has(card.set_type) &&
    !EXCLUDED_LAYOUTS_NON_GAME.has(card.layout) &&
    !card.digital &&
    (card.games ?? []).includes('paper');
  if (inPool) { pool++; poolRows.push(card); }

  /* The vocabulary is derived from EVERY row, pool or not, and that is the
   * correction this script exists to make. A word is a subtype whether or not
   * the row carrying it is a playable card, and the biggest omissions are
   * exactly the words that only ever appear on rows the census throws away:
   * "Saproling" and "Servo" have no card of their own, only a token, so a
   * vocabulary derived from the pool alone can never contain them — while the
   * oracle text of 39 pool cards says "create a 1/1 green Saproling creature
   * token" and is refused for want of the word. */

  // Subtypes are whatever follows the em dash on a type line, on every face.
  // Read off the raw rows rather than through `facesOf`, which returns oracle
  // text and names and has no type line on it.
  const faces = Array.isArray(card.card_faces) && card.card_faces.length
    ? card.card_faces
    : [card];
  const seen = new Set();
  for (const face of faces) {
    const line = String(face.type_line ?? card.type_line ?? '');
    const dash = line.indexOf('—');
    if (dash < 0) continue;
    for (const word of line.slice(dash + 1).trim().split(/\s+/)) {
      const w = word.toLowerCase().replace(/[^a-z-]/g, '');
      // Multi-word subtypes ("Time Lord") arrive as separate words, which is
      // exactly how `parseObject` reads them, so they are counted that way.
      if (w.length > 1) seen.add(w);
    }
  }
  for (const w of seen) counts.set(w, (counts.get(w) ?? 0) + 1);
}

const qualifying = [...counts.entries()]
  .filter(([, n]) => n >= MIN_ROWS)
  .sort((a, b) => b[1] - a[1]);

const missing = qualifying.filter(([w]) => !isSubtypeWord(w));
const safe = missing.filter(([w]) => !ALSO_ENGLISH.has(w));
const needsJudgement = missing.filter(([w]) => ALSO_ENGLISH.has(w));

console.log('=========================================================');
console.log(' SUBTYPE VOCABULARY — pool vs grammar.ts');
console.log('=========================================================');
console.log();
console.log(`pool                       ${pool}`);
console.log(`distinct subtype words     ${counts.size}`);
console.log(`on ${MIN_ROWS}+ cards               ${qualifying.length}`);
console.log(`accepted by grammar.ts     ${qualifying.length - missing.length}`);
console.log(`MISSING                    ${missing.length}  (${safe.length} plain, ${needsJudgement.length} need a decision)`);

/* ------------------------------------------------------------------ *
 * What each missing word actually COSTS
 *
 * A frequency list says which words exist. It does not say which ones are
 * standing between a card and a player, and those are different questions:
 * "Chandra" is a subtype on nine rows and blocks nothing, while "Saproling" is
 * a subtype on far fewer and blocks every card that makes one. So every
 * candidate is re-asked against the compiler as it stands, and ranked by cards
 * whose oracle text the compiler failed to read WHILE containing that word.
 * ------------------------------------------------------------------ */

const blocks = new Map();
const blockExample = new Map();
const candidates = new Set(missing.map(([w]) => w));

for (const card of poolRows) {
  let trace;
  try { trace = compileWithTrace(card); } catch { continue; }
  const texts = [];
  for (const u of trace.result.unparsed ?? []) texts.push(String(u.text ?? '').toLowerCase());
  for (const a of trace.result.abilities ?? []) {
    for (const t of manualTexts(effectsOf(a))) texts.push(t.toLowerCase());
  }
  if (texts.length === 0) continue;
  /* The match has to be in a position where a SUBTYPE is what the word means.
   *
   * A bare `\bword\b` over the clause counted "the" as blocking 9,349 cards and
   * "time" as blocking 716, which is the English words "the" and "time" and not
   * the subtypes Time Lord and Time. Two positions are unambiguous and between
   * them cover the rules that actually refuse: the descriptor of a token being
   * created, and a filter phrase naming permanents of that type. Anything else
   * is left uncounted rather than guessed at, so this list under-reports on
   * purpose. */
  const hit = new Set();
  for (const t of texts) {
    for (const w of candidates) {
      if (hit.has(w)) continue;
      const inToken = new RegExp(`\\bcreates?\\b[^.]{0,60}\\b${w}s?\\b[^.]{0,40}\\btokens?\\b`);
      const inFilter = new RegExp(`\\b${w}s?\\b (?:you control|an opponent controls|creature|permanent|card)\\b`);
      if (inToken.test(t) || inFilter.test(t)) hit.add(w);
    }
  }
  for (const w of hit) {
    blocks.set(w, (blocks.get(w) ?? 0) + 1);
    if (!blockExample.has(w)) blockExample.set(w, card.name);
  }
}

console.log();
console.log('-- missing words ranked by CARDS THEY BLOCK, not by frequency --');
console.log('  blocks  onRows  word            example');
for (const [w, n] of [...blocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`  ${String(n).padStart(6)}  ${String(counts.get(w) ?? 0).padStart(6)}  ${w.padEnd(15)} ${blockExample.get(w)}`);
}

console.log();
console.log('-- missing and unambiguous: safe to add --');
console.log('  cards  word');
for (const [w, n] of safe) console.log(`  ${String(n).padStart(5)}  ${w}`);
console.log();
console.log('-- missing but also ordinary English: a decision, not an addition --');
for (const [w, n] of needsJudgement) console.log(`  ${String(n).padStart(5)}  ${w}`);
console.log();
console.log('-- the literal array, ready to paste --');
console.log(safe.map(([w]) => `'${w}'`).join(', '));
