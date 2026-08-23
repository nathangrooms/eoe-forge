/**
 * Tests for what a deck costs.
 *
 *   node --test --experimental-strip-types src/lib/deck/deckValue.test.ts
 *
 * Three rules are locked here and each of them has been broken in this codebase
 * before: copies count, an unpriced card is not a free card, and a copy you
 * already own is not a copy you have to buy. The fourth is new and is the one
 * most likely to be got wrong by the next person: ownership is SPENT as the
 * rows are walked, so two rows pointing at two printings of one card cannot
 * both claim the single copy in the box.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deckValueLines,
  summariseDeckValue,
  type SpreadLike,
} from './deckValue.ts';
import type { DeckCardRow } from './deckCards.ts';

let seq = 0;

function row(
  name: string,
  options: {
    usd?: string | null;
    quantity?: number;
    oracleId?: string;
    reserved?: boolean;
    rarity?: string;
    sideboard?: boolean;
  } = {}
): DeckCardRow {
  const id = `row-${++seq}`;
  return {
    id,
    card_id: id,
    card_name: name,
    quantity: options.quantity ?? 1,
    is_commander: false,
    is_sideboard: options.sideboard ?? false,
    card: {
      name,
      type_line: 'Artifact',
      mana_cost: '{1}',
      cmc: 1,
      colors: [],
      color_identity: [],
      image_uris: null,
      prices: options.usd === undefined ? { usd: '1.00' } : { usd: options.usd },
      oracle_text: null,
      power: null,
      toughness: null,
      rarity: options.rarity ?? 'rare',
      set_code: 'tst',
      legalities: null,
      is_legendary: false,
      keywords: [],
      tags: [],
      oracle_id: options.oracleId ?? `oracle-${name}`,
      edhrec_rank: null,
      is_reserved: options.reserved ?? false,
      produced_mana: [],
    },
  };
}

test('copies count, in the total and in the shortfall', () => {
  const lines = deckValueLines({ rows: [row('Bolt', { usd: '2.50', quantity: 4 })] });
  assert.equal(lines[0].total, 10);
  const summary = summariseDeckValue(lines);
  assert.equal(summary.total, 10);
  assert.equal(summary.toFinish, 10);
});

test('an unpriced card is counted as unpriced, never as zero', () => {
  const lines = deckValueLines({ rows: [row('Mystery', { usd: null })] });
  assert.equal(lines[0].unit, null);
  assert.equal(lines[0].total, null);
  const summary = summariseDeckValue(lines);
  assert.equal(summary.total, 0);
  assert.equal(summary.unpricedRows, 1);
  assert.equal(summary.toFinishUnpricedRows, 1);
});

test('copies you own are not copies you have to buy', () => {
  const lines = deckValueLines({
    rows: [row('Bolt', { usd: '2.00', quantity: 4 })],
    ownedByName: new Map([['bolt', 3]]),
  });
  assert.equal(lines[0].owned, 3);
  assert.equal(lines[0].needed, 1);
  const summary = summariseDeckValue(lines);
  assert.equal(summary.ownedValue, 6);
  assert.equal(summary.toFinish, 2);
});

test('owning more copies than the deck needs does not go negative', () => {
  const lines = deckValueLines({
    rows: [row('Bolt', { usd: '2.00', quantity: 1 })],
    ownedByName: new Map([['bolt', 9]]),
  });
  assert.equal(lines[0].owned, 1);
  assert.equal(lines[0].needed, 0);
});

test('ownership is spent across rows, so two printings cannot claim one copy', () => {
  // Two rows, two printings, one Sol Ring in the box.
  const lines = deckValueLines({
    rows: [row('Sol Ring', { usd: '2.00' }), row('Sol Ring', { usd: '90.00' })],
    ownedByName: new Map([['sol ring', 1]]),
  });
  assert.equal(lines[0].owned + lines[1].owned, 1);
  assert.equal(lines[0].needed + lines[1].needed, 1);
});

test('the sideboard is not part of the deck value', () => {
  const lines = deckValueLines({
    rows: [row('Main', { usd: '5.00' }), row('Side', { usd: '5.00', sideboard: true })],
  });
  assert.equal(lines.length, 1);
});

test('the cheapest printing total uses the spread, and falls back honestly', () => {
  const spreads = new Map<string, SpreadLike>([
    ['oracle-Sol Ring', { usdMin: 0.35, usdMax: 400, printings: 40 }],
  ]);
  const lines = deckValueLines({
    rows: [row('Sol Ring', { usd: '4.10', oracleId: 'oracle-Sol Ring' }), row('Other', { usd: '3.00' })],
    spreads,
  });
  const summary = summariseDeckValue(lines);
  // 0.35 for the card we have a spread for, 3.00 carried for the one we do not.
  assert.equal(summary.cheapestTotal, 3.35);
  assert.equal(summary.spreadUnknownRows, 1);
  assert.ok(summary.savingAtCheapest !== null);
  assert.ok(Math.abs(summary.savingAtCheapest - 3.75) < 1e-9);
});

test('a saving is never negative', () => {
  const spreads = new Map<string, SpreadLike>([
    ['oracle-Cheap', { usdMin: 9, usdMax: 9, printings: 1 }],
  ]);
  const lines = deckValueLines({
    rows: [row('Cheap', { usd: '1.00', oracleId: 'oracle-Cheap' })],
    spreads,
  });
  assert.equal(summariseDeckValue(lines).savingAtCheapest, 0);
});

test('only copies you still need count towards the proxy saving', () => {
  const lines = deckValueLines({
    rows: [row('Expensive', { usd: '60.00' }), row('Also Expensive', { usd: '60.00' })],
    ownedByName: new Map([['expensive', 1]]),
  });
  const summary = summariseDeckValue(lines, { proxyThreshold: 20 });
  assert.equal(summary.proxyCards, 1);
  assert.equal(summary.proxySaving, 60);
});

test('reserved list value is counted separately', () => {
  const lines = deckValueLines({
    rows: [row('Bazaar', { usd: '400.00', reserved: true }), row('Normal', { usd: '1.00' })],
  });
  const summary = summariseDeckValue(lines);
  assert.equal(summary.reservedRows, 1);
  assert.equal(summary.reservedValue, 400);
});

test('the most expensive stack outranks the most expensive single card', () => {
  const lines = deckValueLines({
    rows: [row('Playset', { usd: '12.00', quantity: 4 }), row('Single', { usd: '30.00' })],
  });
  const summary = summariseDeckValue(lines);
  assert.equal(summary.topLines[0].name, 'Playset');
});
