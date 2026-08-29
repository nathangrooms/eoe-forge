/**
 * The same question the action census asks, asked of STATE instead.
 *
 * `action-census.mjs` walks the import graph and reports which `GameAction`s a
 * player at the table can build. It answers completely for actions, and it
 * cannot see the failure one level down: a FIELD on the game state that no
 * action writes at all. `CardInstance.faceDown` and `CardInstance.flipped` are
 * declared, initialised to `false` in `rules.ts`, carried forward on every zone
 * change, and READ by `mana.ts` to decide which face a card taps for. Nothing
 * in the engine or the app ever sets either to `true`. No action is missing, so
 * the action census is silent, and a player who wants to turn a card face down
 * has nothing to press and never will.
 *
 * This reads the reducer the way the reducer is written. `rules.ts` applies an
 * action inside `case 'X':` in the apply switch, so:
 *
 *   1. cut the apply switch into per-action blocks;
 *   2. for each declared field of `CardInstance`, `Player` and `GameState`,
 *      find the blocks that WRITE it (`field:` in an object literal, or
 *      `field =`, or `field++`);
 *   3. join that to the action census, which knows whether a player at the
 *      table can build the action.
 *
 * A field written only by blocks whose action is resolution-only, or by no
 * block at all, is a piece of the game a player cannot change by hand.
 *
 *   node scripts/playtest/state-census.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { census } from './action-census.mjs';

const rules = readFileSync('src/lib/game/rules.ts', 'utf8');
const types = readFileSync('src/lib/game/types.ts', 'utf8');

/** Field names declared on one interface, in source order. */
function fieldsOf(name) {
  const start = types.indexOf(`export interface ${name} {`);
  if (start < 0) throw new Error(`no interface ${name}`);
  let depth = 0;
  let i = types.indexOf('{', start);
  const from = i;
  for (; i < types.length; i++) {
    if (types[i] === '{') depth++;
    else if (types[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = types.slice(from, i);
  const out = [];
  for (const m of body.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9_]*)\??:/gm)) out.push(m[1]);
  return [...new Set(out)];
}

/**
 * The apply switch, cut into `case 'ACTION':` blocks.
 *
 * There are two switches over the action type in this file: one validates and
 * one applies. Only the second writes state, and it is the later of the two, so
 * the cut starts at the last `switch (action.type)`.
 */
function applyBlocks() {
  const marks = [...rules.matchAll(/switch \(action\.type\)/g)].map(m => m.index);
  const start = marks[marks.length - 1];
  // Bound the switch at its own closing brace, or the last case swallows the
  // rest of the file and every field looks written by it.
  let depth = 0;
  let i = rules.indexOf('{', start);
  const from = i;
  for (; i < rules.length; i++) {
    if (rules[i] === '{') depth++;
    else if (rules[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = rules.slice(from, i);
  const hits = [...body.matchAll(/\n\s*case '([A-Z_]+)':/g)];
  const blocks = new Map();
  for (let k = 0; k < hits.length; k++) {
    const a = hits[k].index;
    const b = k + 1 < hits.length ? hits[k + 1].index : body.length;
    blocks.set(hits[k][1], (blocks.get(hits[k][1]) || '') + body.slice(a, b));
  }
  return blocks;
}

/**
 * Top-level helper bodies in `rules.ts`, so a case that calls `moveCard` is
 * judged on what `moveCard` writes.
 *
 * Without this the census reports `CardInstance.zone` as written by nothing,
 * which is obviously false and would make the whole list untrustworthy. One
 * hop is enough here because the reducer's helpers are flat.
 */
/**
 * The body of the function whose parameter list opens at `parenAt`.
 *
 * Naively taking the next `{` after the name is wrong on this codebase and was:
 * `moveCard(state, instanceId, to, options: { position?: ... })` has an object
 * TYPE in its parameter list, so the first brace belongs to that and the
 * "body" came back as the options type. `moveCard` is the function that writes
 * `CardInstance.zone`, so the census reported the most-used field in the engine
 * as written by nothing.
 */
function bodyAfter(text, parenAt) {
  let depth = 0;
  let i = parenAt;
  for (; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  // Past the parameter list. A return-type annotation may itself be an object
  // type, so skip any brace group that is not followed by a line break.
  i++;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace < 0) return null;
    let d = 0;
    let j = brace;
    for (; j < text.length; j++) {
      if (text[j] === '{') d++;
      else if (text[j] === '}') {
        d--;
        if (d === 0) break;
      }
    }
    if (/^[ \t]*\r?\n/.test(text.slice(brace + 1, brace + 4))) return text.slice(brace, j);
    i = j + 1;
  }
  return null;
}

function helperBodies() {
  const out = new Map();
  /*
   * Every engine module, not only `rules.ts`. The reducer delegates: the
   * keyword flags are written by `keywords.ts::withKeywordFlag`, combat by
   * `combat.ts`, the stack by `stack.ts`. A census that read only `rules.ts`
   * reported `grantedKeywords` as written by nothing, which is false and would
   * have made the whole list untrustworthy.
   */
  const files = readdirSync('src/lib/game')
    .filter(f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
    .map(f => `src/lib/game/${f}`);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const re = /\n(?:export\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/g;
    for (const m of text.matchAll(re)) {
      const body = bodyAfter(text, m.index + m[0].length - 1);
      // First definition wins; a name defined twice is rare and either body
      // is evidence that the field is written somewhere reachable.
      if (body && !out.has(m[1])) out.set(m[1], body);
    }
  }
  return out;
}

const HELPERS = helperBodies();

/** A case block plus the bodies of the helpers it calls, two hops deep. */
function expand(block) {
  let text = block;
  const seen = new Set();
  for (let hop = 0; hop < 2; hop++) {
    let added = '';
    for (const [name, body] of HELPERS) {
      if (seen.has(name)) continue;
      if (new RegExp(String.raw`\b${name}\s*\(`).test(text)) {
        seen.add(name);
        added += '\n' + body;
      }
    }
    if (!added) break;
    text += added;
  }
  return text;
}

const BLOCKS = new Map([...applyBlocks()].map(([a, b]) => [a, expand(b)]));

/**
 * Does this block CHANGE the field, as opposed to laying it down at its
 * default when a fresh object is built?
 *
 * This distinction is the whole point of the census. `CREATE_TOKEN` builds a
 * complete `CardInstance` literal, `faceDown: false` included, so a plain
 * "does the text mention the field" test reports that a player can turn a card
 * face down by making a Treasure. Two values are not a change: a constant that
 * is the field's own default, and a carry-forward of the same field off
 * another object (`faceDown: card.faceDown`).
 */
const INERT = /^(false|0|undefined|null|\[\]|\{\}|''|"")$/;

function assignments(block, field) {
  const f = field.replace(/[$]/g, '\\$');
  const out = [];
  for (const m of block.matchAll(new RegExp(String.raw`\b${f}\s*:\s*([^,\n]+)`, 'g'))) {
    out.push(m[1].trim().replace(/[,;]$/, ''));
  }
  for (const m of block.matchAll(new RegExp(String.raw`\.${f}\s*=\s*([^;\n]+)`, 'g'))) {
    if (!m[1].startsWith('=')) out.push(m[1].trim().replace(/[,;]$/, ''));
  }
  /*
   * Shorthand. `return { ...card, faceDown, flipped }` writes both and mentions
   * neither with a colon, so the two patterns above see nothing. The value is
   * whatever the local binding above it holds, which is what is read here.
   * Missing this is not academic: it is exactly how `SET_FACE` is written, so
   * the census reported the field that action exists to write as written by
   * nothing at all.
   */
  if (new RegExp(String.raw`[,{]\s*${f}\s*[,}]`).test(block)) {
    for (const m of block.matchAll(
      new RegExp(String.raw`\b(?:const|let)\s+${f}\s*=\s*([^;\n]+)`, 'g')
    )) {
      out.push(m[1].trim().replace(/[,;]$/, ''));
    }
  }
  if (new RegExp(String.raw`\b${f}\s*(\+\+|--)`).test(block)) out.push('++');
  return out;
}

/**
 * The VALUES an expression can produce, ignoring the test that chooses between
 * them.
 *
 * `moveCard` writes `faceDown: to === 'battlefield' || to === 'exile' ? card.faceDown : false`.
 * Read whole, that expression is neither a constant nor a bare carry-forward,
 * so a naive test calls it a write and reports that `MOVE_ZONE` can turn a card
 * face down. It cannot: both branches are either the card's own value or
 * `false`, so the line propagates or clears and can never INTRODUCE a face-down
 * card. Getting this wrong is not academic — it is the difference between this
 * census catching the `faceDown` gap and sitting silently on top of it, which
 * is the failure the whole file is about.
 */
function valueTerms(expr) {
  const q = expr.indexOf('?');
  const body = q >= 0 && expr[q + 1] !== '?' && expr[q - 1] !== '?' ? expr.slice(q + 1) : expr;
  return body
    .split(/\s*(?::|\?\?)\s*/)
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * Is this term the field carrying its own old value forward?
 *
 * `card.faceDown` is. `action.faceDown` is NOT, and the difference is the whole
 * point: a value read off the ACTION is what the player supplied, which is
 * exactly the write being looked for. Treating both as a carry made `SET_FACE`
 * invisible to the census that exists because of it.
 */
function isCarry(term, field) {
  const f = field.replace(/[$]/g, '\\$');
  if (/^action\b/.test(term)) return false;
  return new RegExp(String.raw`^[A-Za-z0-9_.?[\]']+\.${f}$`).test(term);
}

function writes(block, field) {
  return assignments(block, field).some(expr =>
    valueTerms(expr).some(term => !INERT.test(term) && !isCarry(term, field))
  );
}

const { rows } = census();
const byAction = new Map(rows.map(r => [r.action, r]));

/** Fields that are structure rather than a thing a player changes by hand. */
const NOT_A_PLAYER_CHOICE = new Set([
  'id', 'cardId', 'name', 'ownerId', 'seat', 'mode', 'format', 'rules', 'players',
  'cards', 'log', 'rng', 'startedAt', 'updatedAt', 'version', 'status', 'winnerIds',
  'manaCost', 'cmc', 'typeLine', 'power', 'toughness', 'loyalty', 'colorIdentity',
  'imageUrl', 'keywords', 'oracleText', 'oracleId', 'isToken', 'isCommander',
  'zoneChangeCounter', 'castCount', 'profileId', 'deckId', 'avatarUrl',
  'commanders', 'zones', 'nextStackId', 'passedPriority', 'abilityUses',
  'startingPlayerId', 'priorityPlayerId', 'activePlayerId', 'turn', 'round', 'step',
  /*
   * Losing, and running out of library. All three are written by state-based
   * actions in `sba.ts` rather than by any action's own case, which is correct
   * under CR 704: whether a player has lost is checked continuously and is not
   * a thing anybody presses. `CONCEDE` is the player-facing half and it is
   * measured separately.
   */
  'hasLost', 'lossReasons', 'drewFromEmptyLibrary',
]);

const GROUPS = [
  ['CardInstance', fieldsOf('CardInstance')],
  ['Player', fieldsOf('Player')],
  ['GameState', fieldsOf('GameState')],
];

const report = [];
for (const [owner, fields] of GROUPS) {
  for (const field of fields) {
    if (NOT_A_PLAYER_CHOICE.has(field)) continue;
    const writers = [...BLOCKS].filter(([, block]) => writes(block, field)).map(([a]) => a);
    const byPlayer = writers.filter(a => byAction.get(a)?.atTheTable);
    const verdict =
      writers.length === 0 ? 'NOTHING WRITES IT'
        : byPlayer.length === 0 ? 'ONLY WHEN A CARD RESOLVES'
          : 'a player can change it';
    report.push({ owner, field, writers, byPlayer, verdict });
  }
}

const order = { 'NOTHING WRITES IT': 0, 'ONLY WHEN A CARD RESOLVES': 1, 'a player can change it': 2 };
report.sort((a, b) => order[a.verdict] - order[b.verdict] || a.field.localeCompare(b.field));

/** The report, for `reachability.test.ts` to ratchet on. */
export function stateCensus() {
  return report;
}

const RUN_DIRECTLY = process.argv[1] && process.argv[1].endsWith('state-census.mjs');

if (RUN_DIRECTLY && process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else if (RUN_DIRECTLY) {
  let last = null;
  for (const row of report) {
    if (row.verdict !== last) {
      console.log(`\n=== ${row.verdict.toUpperCase()} ===`);
      last = row.verdict;
    }
    const how = row.byPlayer.length ? row.byPlayer.join(', ') : row.writers.join(', ') || '(no reducer case)';
    console.log(`  ${(row.owner + '.' + row.field).padEnd(34)} ${how}`);
  }
  const dead = report.filter(r => r.verdict === 'NOTHING WRITES IT');
  const engineOnly = report.filter(r => r.verdict === 'ONLY WHEN A CARD RESOLVES');
  console.log(
    `\n${report.length} fields judged: ${dead.length} nothing writes, ` +
      `${engineOnly.length} only on resolution, ` +
      `${report.length - dead.length - engineOnly.length} a player can change.`
  );
}
