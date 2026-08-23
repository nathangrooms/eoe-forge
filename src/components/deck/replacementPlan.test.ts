import test from 'node:test';
import assert from 'node:assert/strict';
import { planReplacements } from './replacementPlan.ts';
import type { IncomingCard } from '../../lib/deck/deckMutations.ts';
import type { DeckCardRow } from '../../lib/deck/deckCards.ts';

/**
 * The batch that nine swaps go through, and the fault it exists to make
 * impossible.
 *
 * Applying a list used to mean looping it and calling a single-card edit per
 * row. Every call in that loop closes over the same decklist, so each one
 * computed its result from the deck as it was before the first change and the
 * last write won. Measured on the built bundle with
 * `scripts/optimiser-apply-measure.mjs`: nine swaps, all nine in `deck_cards`,
 * **one** on screen, and the auto pass then reported "16 cards did not move"
 * about nine changes it had just made.
 *
 * The first test is that fault stated as a ratchet. If somebody replaces this
 * planner with a loop of per-card edits, it fails.
 */

const card = (id: string, name: string, extra: Partial<IncomingCard> = {}): IncomingCard => ({
  id,
  name,
  type_line: 'Artifact',
  color_identity: [],
  colors: [],
  ...extra,
});

const row = (id: string, cardId: string, name: string, quantity = 1): DeckCardRow =>
  ({
    id,
    card_id: cardId,
    card_name: name,
    quantity,
    is_commander: false,
    is_sideboard: false,
    card: { name, type_line: 'Creature', color_identity: [] },
  }) as unknown as DeckCardRow;

/** The row a real editor would build. Enough of one for the planner's purposes. */
const newRow = (c: IncomingCard, quantity: number): DeckCardRow =>
  ({
    id: `pending-${c.id}`,
    card_id: c.id,
    card_name: c.name,
    quantity,
    is_commander: false,
    is_sideboard: false,
    card: { name: c.name, type_line: c.type_line, color_identity: c.color_identity },
  }) as unknown as DeckCardRow;

/** Nothing is refused. Isolates the batching from the deck's own rules. */
const allow = { refuse: () => null, newRow };

/** The deck's rules, supplied per test, with the same row builder. */
const rules = (refuse: (c: IncomingCard, wanted: number) => string | null) => ({
  refuse,
  newRow,
});

const deckOfTen = () =>
  Array.from({ length: 10 }, (_, i) => row(`dc-${i}`, `old-${i}`, `Old Card ${i}`));

test('nine swaps in one batch all land, not just the last one', () => {
  const rows = deckOfTen();
  const resolved = Array.from({ length: 9 }, (_, i) => ({
    remove: `Old Card ${i}`,
    card: card(`new-${i}`, `New Card ${i}`),
  }));

  const plan = planReplacements(rows, resolved, allow);

  assert.equal(plan.doomedIds.length, 9, 'every outgoing row is deleted');
  assert.equal(plan.upserts.length, 9, 'every incoming card is written');
  assert.equal(plan.refused.length, 0);

  const names = plan.next.map(r => r.card?.name ?? r.card_name);
  for (let i = 0; i < 9; i++) {
    assert.ok(!names.includes(`Old Card ${i}`), `Old Card ${i} should be gone`);
    assert.ok(names.includes(`New Card ${i}`), `New Card ${i} should be in`);
  }
  // The tenth card was never mentioned and must be untouched.
  assert.ok(names.includes('Old Card 9'));
  assert.equal(plan.next.length, 10, 'a swap is one out and one in, so the size holds');
});

test('the deck stays the size it was, however many swaps are in the batch', () => {
  const rows = deckOfTen();
  const plan = planReplacements(
    rows,
    Array.from({ length: 5 }, (_, i) => ({
      remove: `Old Card ${i}`,
      card: card(`new-${i}`, `New Card ${i}`),
    })),
    allow
  );
  assert.equal(plan.next.length, rows.length);
});

test('an empty card is a removal, and takes nothing else with it', () => {
  const rows = deckOfTen();
  const plan = planReplacements(rows, [{ remove: 'Old Card 3', card: null }], allow);

  assert.deepEqual(plan.doomedIds, ['dc-3']);
  assert.equal(plan.upserts.length, 0, 'a removal writes nothing');
  assert.equal(plan.next.length, 9);
});

test('an empty remove adds a card and takes nothing out', () => {
  const rows = deckOfTen();
  const plan = planReplacements(rows, [{ remove: '', card: card('new-a', 'Sol Ring') }], allow);

  assert.deepEqual(plan.doomedIds, []);
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.next.length, 11);
});

test('swapping a card for itself is not a change, and does not delete it', () => {
  const rows = deckOfTen();
  const plan = planReplacements(
    rows,
    [{ remove: 'Old Card 2', card: card('old-2', 'Old Card 2') }],
    allow
  );

  assert.deepEqual(plan.doomedIds, [], 'the row it would write must not be deleted');
  assert.deepEqual(plan.upserts, []);
  assert.equal(plan.next.length, 10);
});

test('a card traded out and back in inside one batch is not deleted', () => {
  const rows = deckOfTen();
  const plan = planReplacements(
    rows,
    [
      { remove: 'Old Card 0', card: card('new-x', 'Swap In') },
      { remove: 'Swap In', card: card('old-0', 'Old Card 0') },
    ],
    allow
  );

  /* The delete is issued after the upsert, so deleting a card the batch has
     just written back would take the row it wrote. */
  assert.ok(
    !plan.doomedIds.includes('dc-0'),
    'Old Card 0 is in the finished deck, so its row must survive'
  );
  const names = plan.next.map(r => r.card?.name ?? r.card_name);
  assert.ok(names.includes('Old Card 0'));
  assert.ok(!names.includes('Swap In'));
});

test('a refusal leaves the card it would have replaced exactly where it was', () => {
  const rows = deckOfTen();
  const refuseSecond = (c: IncomingCard) =>
    c.name === 'New Card 1' ? 'New Card 1 is red, which the commander cannot support.' : null;

  const plan = planReplacements(
    rows,
    [
      { remove: 'Old Card 0', card: card('new-0', 'New Card 0') },
      { remove: 'Old Card 1', card: card('new-1', 'New Card 1') },
      { remove: 'Old Card 2', card: card('new-2', 'New Card 2') },
    ],
    rules(refuseSecond)
  );

  assert.equal(plan.refused.length, 1);
  assert.ok(!plan.doomedIds.includes('dc-1'), 'the refused swap must not remove its card');
  const names = plan.next.map(r => r.card?.name ?? r.card_name);
  assert.ok(names.includes('Old Card 1'), 'half a swap is worse than no swap');
  assert.ok(!names.includes('New Card 1'));
  // The other two are unaffected by their neighbour being turned down.
  assert.ok(names.includes('New Card 0'));
  assert.ok(names.includes('New Card 2'));
});

test('copy limits are checked against the deck as it will be, not as it was', () => {
  const rows = deckOfTen();
  const seen: number[] = [];
  const record = (_c: IncomingCard, wanted: number) => {
    seen.push(wanted);
    return wanted > 1 ? 'capped at 1 copy' : null;
  };

  const plan = planReplacements(
    rows,
    [
      { remove: 'Old Card 0', card: card('dup', 'Sol Ring') },
      { remove: 'Old Card 1', card: card('dup', 'Sol Ring') },
    ],
    rules(record)
  );

  assert.deepEqual(seen, [1, 2], 'the second line sees the copy the first one added');
  assert.equal(plan.refused.length, 1, 'the second copy is turned down');
  assert.ok(!plan.doomedIds.includes('dc-1'));
});

test('the commander is never the card a replacement takes out', () => {
  const rows = deckOfTen();
  rows[0] = { ...rows[0], is_commander: true };
  const plan = planReplacements(
    rows,
    [{ remove: 'Old Card 0', card: card('new-0', 'New Card 0') }],
    allow
  );

  assert.deepEqual(plan.doomedIds, [], 'nothing is removed');
  // With nothing to replace, the incoming card is simply added.
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.next.length, 11);
});

test('the sideboard is left alone', () => {
  const rows = deckOfTen();
  rows.push({ ...row('dc-sb', 'sb-0', 'Old Card 0'), is_sideboard: true } as DeckCardRow);

  const plan = planReplacements(
    rows,
    [{ remove: 'Old Card 0', card: card('new-0', 'New Card 0') }],
    allow
  );

  assert.deepEqual(plan.doomedIds, ['dc-0'], 'the maindeck copy goes, not the sideboard one');
  assert.ok(plan.next.some(r => r.id === 'dc-sb'));
  assert.ok(plan.upserts.every(u => u.is_sideboard === false));
});

test('the rows handed in are never mutated', () => {
  const rows = deckOfTen();
  const before = JSON.stringify(rows);
  planReplacements(
    rows,
    [
      { remove: 'Old Card 0', card: card('new-0', 'New Card 0') },
      { remove: '', card: card('new-1', 'New Card 1') },
      { remove: 'Old Card 2', card: null },
    ],
    allow
  );
  assert.equal(JSON.stringify(rows), before, 'the caller holds these as the revert copy');
});
