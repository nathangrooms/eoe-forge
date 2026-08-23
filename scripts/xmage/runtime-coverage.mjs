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

for (const row of surface.workOrder) {
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
    distinctFunctionsInTheApi: surface.workOrder.length,
    functionsWritten: rowsBy.implemented.length + rowsBy.refuses.length,
    source: 'scripts/coverage/.data/xmage-api-surface.json joined against xmageApiManifest()',
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
console.log('distinct functions in that API: ' + surface.workOrder.length.toLocaleString());
console.log('functions written here: ' + report.meta.functionsWritten);
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
