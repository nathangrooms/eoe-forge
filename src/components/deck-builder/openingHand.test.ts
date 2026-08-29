import test from 'node:test';
import assert from 'node:assert/strict';
import { fanned, handVerdict, isLand, shuffled, statsFor, type DeckCard } from './openingHand.ts';

/**
 * The two faults `/deck/:id/testhand` shipped, written as ratchets.
 *
 * Both were arithmetic. Both were visible in a single screenshot of the page.
 * Neither could be reached by a test, because the whole tester lived in a
 * `.tsx` file and the runner cannot parse JSX — which is why the logic is a
 * `.ts` module now.
 */

const card = (over: Partial<DeckCard> & { name: string; type_line: string }): DeckCard => ({
  id: over.name,
  cmc: 0,
  ...over,
});

test('a modal double-faced spell is not a land, and the land count matches the deck page', () => {
  /* Real rows. `Pinnacle Monk // Mystic Peak` was in the hand in the
     screenshot that showed `Lands 0` in the header and `Lands 1` in the panel
     at the same time, for the same deck. The three below are every card in the
     fixture deck's 100 whose full type line contains "land". */
  const mdfcs = [
    card({ name: 'Pinnacle Monk // Mystic Peak', type_line: 'Creature — Djinn Monk // Land' }),
    card({ name: 'Witch Enchanter // Witch-Blessed Meadow', type_line: 'Creature — Human Warlock // Land' }),
    card({ name: 'Disciple of Freyalise // Garden of Freyalise', type_line: 'Creature — Elf Druid // Land' }),
  ];

  for (const c of mdfcs) {
    /* The old test was `type_line.toLowerCase().includes('land')`, which is
       true for every one of these. */
    assert.equal(c.type_line.toLowerCase().includes('land'), true, `${c.name} trips the old test`);
    assert.equal(isLand(c), false, `${c.name} is cast as a spell from hand, so it is not a land`);
  }

  assert.equal(statsFor(mdfcs).lands, 0);
  assert.equal(statsFor(mdfcs).creatures, 3);

  /* A real land still counts, or the fix would have broken the thing it fixed. */
  assert.equal(isLand(card({ name: 'Forest', type_line: 'Basic Land — Forest' })), true);
  assert.equal(
    isLand(card({ name: 'Dryad Arbor', type_line: 'Land Creature — Forest Dryad' })),
    true,
    'front face names Land first, so the canonical categoriser calls it a land'
  );
});

test('a hand of seven spells holding MDFCs is called a mulligan, not a keep', () => {
  /* This is the fault that mattered. With the old land test, two MDFCs read as
     two lands and `handVerdict` returned "Average" on a hand that cannot cast
     anything at all. */
  const hand = [
    card({ name: 'Pinnacle Monk // Mystic Peak', type_line: 'Creature — Djinn Monk // Land', cmc: 3 }),
    card({ name: 'Witch Enchanter // Witch-Blessed Meadow', type_line: 'Creature — Human Warlock // Land', cmc: 4 }),
    card({ name: 'Massacre Wurm', type_line: 'Creature — Phyrexian Wurm', cmc: 6 }),
    card({ name: 'Solemn Simulacrum', type_line: 'Artifact Creature — Golem', cmc: 4 }),
    card({ name: 'Llanowar Elves', type_line: 'Creature — Elf Druid', cmc: 1 }),
    card({ name: 'Eternal Witness', type_line: 'Creature — Human Shaman', cmc: 3 }),
    card({ name: 'Blood Artist', type_line: 'Creature — Vampire', cmc: 2 }),
  ];
  const stats = statsFor(hand);
  assert.equal(stats.lands, 0);
  assert.equal(handVerdict(stats, hand.length).verdict, 'Poor');
});

test('the shuffle is uniform, so the top of the decklist is not over-drawn', () => {
  /* `[...deck].sort(() => Math.random() - 0.5)` gave the first card in the
     list a 2.148x share of opening hands and a 2.68x spread across the list.
     `fetchDeckCards` returns rows in a stable order, so that bias lands on the
     same cards every time somebody presses draw.

     40,000 trials keeps this well under a second while leaving the old
     shuffle's 2.15x far outside the tolerance — it fails this by 15x its own
     margin. */
  const N = 60;
  const TRIALS = 40_000;
  const deck = Array.from({ length: N }, (_, i) => i);
  const seen = new Array(N).fill(0);

  for (let t = 0; t < TRIALS; t++) {
    const s = shuffled(deck);
    for (let i = 0; i < 7; i++) seen[s[i]]++;
  }

  const expected = (TRIALS * 7) / N;
  const ratios = seen.map(c => c / expected);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);

  assert.ok(max < 1.1, `most-drawn card ${max.toFixed(3)}x should be near 1.0`);
  assert.ok(min > 0.9, `least-drawn card ${min.toFixed(3)}x should be near 1.0`);
  assert.ok(max / min < 1.2, `spread ${(max / min).toFixed(2)}x should be near 1.0, was 2.68x`);
});

test('shuffling keeps every card exactly once', () => {
  const deck = Array.from({ length: 99 }, (_, i) => i);
  const s = shuffled(deck);
  assert.equal(s.length, 99);
  assert.deepEqual([...s].sort((a, b) => a - b), deck);
  assert.deepEqual(deck, Array.from({ length: 99 }, (_, i) => i), 'the input is not mutated');
});

test('the hand is fanned lands first, then up the curve', () => {
  const hand = [
    card({ name: 'Massacre Wurm', type_line: 'Creature — Phyrexian Wurm', cmc: 6 }),
    card({ name: 'Llanowar Elves', type_line: 'Creature — Elf Druid', cmc: 1 }),
    card({ name: 'Forest', type_line: 'Basic Land — Forest', cmc: 0 }),
    card({ name: 'Blood Artist', type_line: 'Creature — Vampire', cmc: 2 }),
  ];
  assert.deepEqual(
    fanned(hand).map(c => c.name),
    ['Forest', 'Llanowar Elves', 'Blood Artist', 'Massacre Wurm']
  );
});
