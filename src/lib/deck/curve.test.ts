/**
 * Tests for the two mana-value averages.
 *
 *   node --test --experimental-strip-types src/lib/deck/curve.test.ts
 *
 * `deckAverageManaValue` is printed on `/deck/:id` beside the curve and on
 * `/p/:slug` beside the same curve for the same deck seen by somebody else.
 * Before it existed, those were two implementations and the public one averaged
 * bucket midpoints, so a deck of ten two-drops read 2.00 in one place and a
 * deck of ten one-drops read 0.50 in the other. What is locked here is the
 * rule, because the two pages agreeing depends on exactly one function holding
 * it: no sideboard, no commander, no lands, once per copy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { averageManaValue, deckAverageManaValue, type ManaValueRow } from './curve.ts';

const row = (
  name: string,
  type_line: string,
  cmc: number,
  extra: Partial<ManaValueRow> = {}
): ManaValueRow => ({
  quantity: 1,
  card: { type_line, cmc },
  ...extra,
});

test('averages the mana value of the spells, weighted by copies', () => {
  const rows = [
    row('One', 'Creature — Human', 1),
    row('Three', 'Sorcery', 3, { quantity: 3 }),
  ];
  // (1 + 3 + 3 + 3) / 4
  assert.equal(deckAverageManaValue(rows), 2.5);
});

test('lands are not in the average', () => {
  const rows = [
    row('Spell', 'Instant', 4),
    row('Forest', 'Basic Land — Forest', 0),
    row('Seat', 'Artifact Land', 0),
  ];
  assert.equal(deckAverageManaValue(rows), 4);
});

test('an artifact land is a land, not a zero-cost artifact', () => {
  // The one case the four categorisers this project used to carry disagreed
  // about. If it ever counts as an artifact, the average drops silently.
  const withLand = deckAverageManaValue([
    row('Spell', 'Sorcery', 2),
    row('Seat of the Synod', 'Artifact Land', 0),
  ]);
  assert.equal(withLand, 2);
});

test('the commander is not in the average', () => {
  const rows = [
    row('Commander', 'Legendary Creature — Elf Druid', 5, { is_commander: true }),
    row('Spell', 'Instant', 1),
  ];
  assert.equal(deckAverageManaValue(rows), 1);
});

test('the sideboard is not in the average', () => {
  const rows = [
    row('Main', 'Creature — Goblin', 2),
    row('Board', 'Creature — Giant', 8, { is_sideboard: true }),
  ];
  assert.equal(deckAverageManaValue(rows), 2);
});

test('a deck of nothing but lands averages zero rather than dividing by zero', () => {
  assert.equal(deckAverageManaValue([row('Forest', 'Basic Land — Forest', 0)]), 0);
  assert.equal(deckAverageManaValue([]), 0);
});

test('a missing card row contributes nothing rather than a zero-cost spell', () => {
  // A row whose card is not in the local table has no type line, so it is
  // "other" and carries cmc 0. It counts as a copy, which is why the deck page
  // says out loud how many rows have no local data.
  const rows: ManaValueRow[] = [
    row('Known', 'Creature — Bear', 2),
    { quantity: 1, card: null },
  ];
  assert.equal(deckAverageManaValue(rows), 1);
});

test('a zero or negative quantity is skipped, not counted as one copy', () => {
  const rows = [
    row('Real', 'Sorcery', 6),
    row('Ghost', 'Sorcery', 0, { quantity: 0 }),
  ];
  assert.equal(deckAverageManaValue(rows), 6);
});

test('the bucket approximation is still the approximation it claims to be', () => {
  // Kept so nobody "fixes" the two into one. Ten one-drops read 0.50 here,
  // because the stored curve cannot tell a nought from a one, and that is
  // exactly the reason the exact version exists for callers holding rows.
  assert.equal(averageManaValue({ '0-1': 10 }, 0), 0.5);
  // Lands come out of the bottom bucket before averaging.
  assert.equal(averageManaValue({ '0-1': 12, '2': 4 }, 10), 1.5);
});
