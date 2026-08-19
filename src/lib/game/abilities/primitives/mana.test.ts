/**
 * GATE 3 — behaviour, for P04 and P16.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/mana.test.ts
 *
 * P16/A8 is the assertion worth reading. It runs the parser over every distinct
 * `mana_cost` in the cached catalogue and requires 99% recognition with every
 * failure enumerated. A hand-written table of six symbols would pass A1–A7 and
 * fall over on the real corpus; this is the test that decides whether the
 * grammar is finished, and it is measured rather than asserted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { Effect } from '../../../cards/abilities/dsl.ts';
import { addManaToActions, parseManaSymbols } from './mana.ts';
import { assertOracleContains, board, ctxFor, env } from './harness.testlib.ts';

test('P04/cards — the fixture cards are real and say what the spec claims', () => {
  assertOracleContains('Llanowar Elves', 'Add {G}');
  assertOracleContains('Sol Ring', 'Add {C}{C}');
});

/* ------------------------------------------------------------------ *
 * P16 — the parser
 * ------------------------------------------------------------------ */

test('P16/A1 — a single green symbol', () => {
  const parse = parseManaSymbols('{G}');
  assert.equal(parse.ok, true);
  assert.deepEqual(parse.symbols, [{ sym: 'colored', color: 'G' }]);
});

test('P16/A2 — two colourless symbols', () => {
  const parse = parseManaSymbols('{C}{C}');
  assert.equal(parse.ok, true);
  assert.equal(parse.symbols.length, 2);
  assert.ok(parse.symbols.every(s => s.sym === 'colored' && s.color === 'C'));
});

test('P16/A3 — generic plus coloured', () => {
  const parse = parseManaSymbols('{2}{W}');
  assert.equal(parse.generic, 2);
  assert.deepEqual(parse.symbols[1], { sym: 'colored', color: 'W' });
});

test('P16/A4 — hybrid carries both colours', () => {
  const parse = parseManaSymbols('{W/U}');
  assert.equal(parse.ok, true);
  assert.deepEqual(parse.symbols, [{ sym: 'hybrid', colors: ['W', 'U'] }]);
});

test('P16/A5 — Phyrexian is marked as such', () => {
  const parse = parseManaSymbols('{B/P}');
  assert.equal(parse.ok, true);
  assert.deepEqual(parse.symbols, [{ sym: 'phyrexian', color: 'B' }]);
});

test('P16/A6 — an unknown symbol is listed, never dropped', () => {
  const parse = parseManaSymbols('{G}{QQ}');
  assert.equal(parse.ok, false);
  assert.deepEqual(parse.unrecognised, ['{QQ}']);
});

test('P16/A7 — the empty string parses ok and empty, distinct from a failure', () => {
  const parse = parseManaSymbols('');
  assert.equal(parse.ok, true);
  assert.deepEqual(parse.symbols, []);
  assert.deepEqual(parse.unrecognised, []);
});

test('P16/A8 — measured against every distinct mana cost in the catalogue', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '..', '..', '..', '..', '..', 'scripts', 'primitives', '.data', 'catalogue.json');
  const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<{ mana_cost: string | null }>;

  const distinct = new Set<string>();
  for (const row of rows) {
    const cost = String(row.mana_cost ?? '').trim();
    if (cost) distinct.add(cost);
  }

  const failures: string[] = [];
  for (const cost of distinct) {
    if (!parseManaSymbols(cost).ok) failures.push(cost);
  }

  const rate = 1 - failures.length / distinct.size;
  // Reported, not just asserted: a passing gate that hides a shrinking margin is
  // how a grammar rots.
  console.log(`      P16/A8: ${distinct.size} distinct mana costs, ${failures.length} unrecognised (${(rate * 100).toFixed(2)}%)`);
  if (failures.length) console.log(`      first failures: ${failures.slice(0, 10).join(' ')}`);
  assert.ok(rate >= 0.99, `only ${(rate * 100).toFixed(2)}% recognised; failures: ${failures.slice(0, 20).join(' ')}`);
});

/* ------------------------------------------------------------------ *
 * P04 — the handler
 * ------------------------------------------------------------------ */

const addMana = (mana: string): Extract<Effect, { do: 'add-mana' }> => ({
  do: 'add-mana',
  who: { who: 'you' },
  mana,
});

test('P04/A1 — Add {G} emits no action and exactly one deferred line', () => {
  const state = board([{ id: 'elves', card: 'Llanowar Elves' }]);
  const result = addManaToActions(addMana('{G}'), ctxFor(state, 'elves'), env());
  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /\{G\}/);
});

test('P04/A2 — Add {C}{C} names two colourless', () => {
  const state = board([{ id: 'ring', card: 'Sol Ring' }]);
  const result = addManaToActions(addMana('{C}{C}'), ctxFor(state, 'ring'), env());
  assert.match(result.deferred[0], /\{CC\}/);
});

test('P04/A3 — a malformed string says so rather than adding nothing quietly', () => {
  const state = board([{ id: 'elves', card: 'Llanowar Elves' }]);
  const result = addManaToActions(addMana('two green mana'), ctxFor(state, 'elves'), env());
  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0], /not understood/);
});

test('P04/never-silent — the result is never empty on both channels', () => {
  const state = board([{ id: 'elves', card: 'Llanowar Elves' }]);
  for (const mana of ['{G}', '{C}{C}', '{2}{W}', 'nonsense', '']) {
    const result = addManaToActions(addMana(mana), ctxFor(state, 'elves'), env());
    assert.ok(result.actions.length + result.deferred.length > 0, `silent for "${mana}"`);
  }
});
