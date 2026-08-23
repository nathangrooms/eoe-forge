/**
 * scripts/xmage/runtime-coverage.mjs
 *
 * The number that decides whether the runtime port is worth anything: what
 * SHARE OF CALLS in XMage's 7,931 card-local class bodies now has a function
 * behind it. Not what share of methods is written. Those two are very different
 * and only the first one matters.
 *
 * ## Where every figure comes from
 *
 *   - the denominator and the ranking:  scripts/coverage/.data/xmage-api-surface.json,
 *     written by `api-surface-typed.mjs` over the XMage clone;
 *   - the implemented set:              `xmageApiManifest()` in
 *     `src/lib/game/xmage/index.ts`, which builds one of every facade and reads
 *     its OWN method names back off the object. Nothing here is a list a human
 *     typed, so this cannot claim a method the code does not have.
 *
 * ## Four buckets, and they are never merged into one headline
 *
 *   implemented    a function in `src/lib/game/xmage/` does the thing.
 *   refuses        a function exists and DECLINES, out loud, with a deferral
 *                  naming what it could not do. `getWatcher` is the example:
 *                  answering 0 would be a wrong number, so it answers null.
 *                  Counting these as implemented would be the third coverage
 *                  overstatement on this project.
 *   native         the row is java.util, not XMage: `Collection#add`,
 *                  `Stream#filter`, `UUID#equals`. A TypeScript translation
 *                  emits `push`, `filter`, `===`. Real coverage, zero code, and
 *                  reported separately so it cannot be hidden inside the first
 *                  number.
 *   open           nothing behind it yet.
 *
 * Plus `unresolved`: calls whose receiver type the analyser could not determine.
 * They are in the denominator, never dropped.
 *
 * Run: node --experimental-strip-types scripts/xmage/runtime-coverage.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { xmageApiManifest } from '../../src/lib/game/xmage/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DATA = join(REPO, 'scripts/coverage/.data');

const surface = JSON.parse(readFileSync(join(DATA, 'xmage-api-surface.json'), 'utf8'));
const manifest = xmageApiManifest();

/* -------------------------------------------------------------------------- */
/* Rows whose class name is wrong, corrected from the engine index            */
/* -------------------------------------------------------------------------- */

/**
 * `api-surface-typed.mjs` resolves a simple type name by package preference
 * alone, and that picks a NESTED class over a top-level one with the same
 * name. It costs two of the biggest rows on the whole work order:
 * `getTopCards` and `getFromTop` are keyed `ZoneChangeInfo.Library#…`, and
 * `mage.game.ZoneChangeInfo.Library` declares `top`, three constructors and
 * `copy()` and nothing else. The COUNTS are right; the class name is not.
 * `docs/engine/RUNTIME-API.md` prints the wrong name for the same reason.
 *
 * The correction is DERIVED, not a list somebody typed. For a row whose type
 * name is nested, this asks the engine index whether that class can own the
 * method at all — its own declarations plus its whole chain — and if it cannot
 * while exactly one same-named top-level class can, the row is re-keyed to the
 * one that can. A row the index cannot settle is left exactly as it is.
 *
 * `api-surface-typed.mjs` itself is deliberately NOT edited: it produced the
 * published ranking, and quietly changing the script behind a published number
 * is how numbers drift. The correction happens here, in the open, and the
 * script prints how many rows and calls it moved. Run with `--no-rekey` to see
 * the join without it.
 */
const engine = JSON.parse(readFileSync(join(DATA, 'xmage-engine-index.json'), 'utf8'));
const methodIdx = JSON.parse(readFileSync(join(DATA, 'xmage-engine-methods.json'), 'utf8'));
const REKEY = !process.argv.includes('--no-rekey');

const declares = (fqn, method) => {
  const rec = engine.classes[fqn];
  for (const c of [fqn, ...(rec?.chain ?? [])]) {
    if (methodIdx.methods[c]?.[method]) return true;
  }
  return false;
};

/** `ZoneChangeInfo.Library#getFromTop` -> `Library#getFromTop`, or null. */
function correctedKey(key) {
  const hash = key.indexOf('#');
  if (hash < 0) return null;
  const type = key.slice(0, hash);
  const method = key.slice(hash + 1);
  if (!type.includes('.')) return null;

  const simple = type.split('.').pop();
  const candidates = engine.bySimple[simple] ?? [];
  if (candidates.length < 2) return null;

  const picked = candidates.find(fqn => fqn.endsWith(`.${type}`));
  if (!picked || declares(picked, method)) return null;

  const able = candidates.filter(fqn => fqn !== picked && declares(fqn, method));
  if (able.length !== 1) return null;
  // Only a TOP-LEVEL class is a better answer; swapping one nested name for
  // another would be guessing rather than correcting.
  const parts = able[0].split('.');
  if (parts.length > 2 && /^[A-Z]/.test(parts[parts.length - 2])) return null;
  return `${simple}#${method}`;
}

const rekeyed = { rows: 0, calls: 0, merged: 0, examples: [] };
const corrected = surface.workOrder.map(row => {
  if (!REKEY) return row;
  const fixed = correctedKey(row.key);
  if (!fixed) return row;
  rekeyed.rows += 1;
  rekeyed.calls += row.calls;
  if (rekeyed.examples.length < 4) rekeyed.examples.push(`${row.key} -> ${fixed}`);
  return { ...row, key: fixed, keyAsMeasured: row.key };
});

/*
 * A corrected row can land on a key that already exists — some files import
 * `mage.players.Library` explicitly and were typed right all along, so
 * `Library#getFromTop` is both 273 calls and 11. They are ONE function and are
 * added together; leaving them apart would count the same function twice in
 * "distinct functions in that API" and list it twice in the work order. The
 * calls total is untouched either way, which the assertion below checks.
 */
const byKey = new Map();
for (const row of corrected) {
  const seen = byKey.get(row.key);
  if (!seen) { byKey.set(row.key, { ...row }); continue; }
  seen.calls += row.calls;
  seen.cards += row.cards;
  if (typeof seen.share === 'number' && typeof row.share === 'number') seen.share += row.share;
  rekeyed.merged += 1;
}
const workOrder = [...byKey.values()].sort((a, b) => b.calls - a.calls);

const callsBefore = surface.workOrder.reduce((n, r) => n + r.calls, 0);
const callsAfter = workOrder.reduce((n, r) => n + r.calls, 0);
if (callsBefore !== callsAfter) {
  throw new Error(`re-keying changed the denominator: ${callsBefore} -> ${callsAfter}`);
}

/**
 * Receiver types that are the Java standard library. A translated body reaches
 * for TypeScript syntax instead of anything in this repository.
 */
const NATIVE_TYPES = new Set([
  'Collection', 'Map', 'Stream', 'Optional', 'String', 'UUID', 'Number', 'Boolean',
]);

/**
 * Rows where the implementation is a REFUSAL. Enumerated by hand, and that is
 * deliberate: promoting one out of this set has to be an edit somebody makes on
 * purpose, not something that happens because a function grew a body.
 */
const REFUSALS = new Set([
  'GameState#getWatcher',
  'Game#addDelayedTriggeredAbility',
]);

/** `Type#method` -> true, from the derived manifest. */
const implemented = new Set();
for (const [type, methods] of Object.entries(manifest)) {
  for (const method of methods) implemented.add(`${type}#${method}`);
}

const buckets = { implemented: 0, refuses: 0, native: 0, open: 0, unresolved: 0 };
const rowsBy = { implemented: [], refuses: [], native: [], open: [], unresolved: [] };
let total = 0;

for (const row of workOrder) {
  total += row.calls;
  const [type] = row.key.split('#');
  let bucket;
  if (type === '?') bucket = 'unresolved';
  else if (NATIVE_TYPES.has(type)) bucket = 'native';
  else if (REFUSALS.has(row.key)) bucket = 'refuses';
  else if (implemented.has(row.key)) bucket = 'implemented';
  else bucket = 'open';
  buckets[bucket] += row.calls;
  rowsBy[bucket].push(row);
}

const pct = n => +((n / total) * 100).toFixed(2);

const report = {
  meta: {
    builtAt: new Date().toISOString(),
    denominator: total,
    cardFilesWithLocalClass: surface.meta.cardFilesWithLocalClass,
    distinctFunctionsInTheApi: workOrder.length,
    functionsWritten: rowsBy.implemented.length + rowsBy.refuses.length,
    source: 'scripts/coverage/.data/xmage-api-surface.json joined against xmageApiManifest()',
    /* Rows the engine index says were keyed to a class that cannot own the
       method. The denominator is unchanged; only the class name is. */
    rekeyed,
  },
  shareOfCalls: {
    implemented: pct(buckets.implemented),
    refuses: pct(buckets.refuses),
    native: pct(buckets.native),
    open: pct(buckets.open),
    unresolved: pct(buckets.unresolved),
  },
  calls: buckets,
  /** The next twenty, biggest first. This is the work order from here. */
  nextUp: rowsBy.open.slice(0, 20).map(r => ({ key: r.key, calls: r.calls, cards: r.cards, share: r.share })),
  implementedRows: rowsBy.implemented.map(r => ({ key: r.key, calls: r.calls })),
  refusalRows: rowsBy.refuses.map(r => ({ key: r.key, calls: r.calls })),
};

writeFileSync(join(DATA, 'xmage-runtime-coverage.json'), JSON.stringify(report, null, 1));

const line = (label, n) =>
  `  ${label.padEnd(12)} ${String(n).padStart(7)} calls  ${String(pct(n)).padStart(6)}%`;

console.log('denominator: ' + total.toLocaleString() + ' calls in ' + surface.meta.cardFilesWithLocalClass.toLocaleString() + ' card-local class bodies');
console.log('distinct functions in that API: ' + workOrder.length.toLocaleString());
console.log('functions written here: ' + report.meta.functionsWritten);
if (REKEY && rekeyed.rows) {
  console.log('re-keyed from a nested class that declares none of them: '
    + rekeyed.rows + ' rows, ' + rekeyed.calls.toLocaleString() + ' calls, '
    + rekeyed.merged + ' merged into a row that was already right');
  for (const e of rekeyed.examples) console.log('    ' + e);
} else if (!REKEY) {
  console.log('re-keying OFF (--no-rekey): rows keep the class name the analyser gave them');
}
console.log('');
console.log(line('implemented', buckets.implemented));
console.log(line('refuses', buckets.refuses));
console.log(line('native', buckets.native));
console.log(line('open', buckets.open));
console.log(line('unresolved', buckets.unresolved));
console.log('');
console.log('  implemented + native, the share a translated body can actually run: '
  + (pct(buckets.implemented) + pct(buckets.native)).toFixed(2) + '%');
console.log('');
console.log('next twenty, biggest first:');
for (const row of report.nextUp) {
  console.log('  ' + String(row.calls).padStart(5) + '  ' + String(row.share).padStart(5) + '%  '
    + row.key.padEnd(38) + ' ' + String(row.cards).padStart(5) + ' cards');
}
