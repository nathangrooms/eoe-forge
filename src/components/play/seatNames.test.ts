/**
 * Seat names are user-facing copy, so they are asserted as whole strings.
 *
 * The hyphen case is the reason this file exists. While the logic sat inside
 * `src/pages/Simulate.tsx` no test could import it, and a split that treated a
 * hyphen as a separator sat there naming a seat "The Ur" for a table running
 * The Ur-Dragon.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { seatName, shortSeatName, uniqueSeatNames } from './seatNames.ts';

const deck = (name: string, commander?: string) => ({
  name,
  commanders: commander ? [{ name: commander }] : [],
});

test('a legend is cut at its title, not in the middle of its name', () => {
  assert.equal(shortSeatName("Yeva, Nature's Herald"), 'Yeva');
  assert.equal(shortSeatName('Alesha, Who Smiles at Death'), 'Alesha');
  assert.equal(shortSeatName('Rin and Seri, Inseparable'), 'Rin and Seri');
});

test('a hyphen is part of a name and is never cut at', () => {
  /* Every one of these lost most of its name to a hyphen in the split. */
  assert.equal(shortSeatName('The Ur-Dragon'), 'The Ur-Dragon');
  assert.equal(shortSeatName('Nine-Fingers Keene'), 'Nine-Fingers Keene');
  assert.equal(shortSeatName('Sun-Crowned Hunters'), 'Sun-Crowned Hunters');
  assert.equal(shortSeatName('Ich-Tekik, Salvage Splicer'), 'Ich-Tekik');
});

test('a seat falls back to its number rather than to a name that breaks a sentence', () => {
  /* "You wins." is the sentence this prevents. Nobody sits at this table. */
  assert.equal(seatName(deck('You'), 0), 'Seat 1');
  assert.equal(seatName(deck('you'), 2), 'Seat 3');
  assert.equal(seatName(deck('   '), 1), 'Seat 2');
});

test('the commander names the seat, and the deck name only stands in for it', () => {
  assert.equal(seatName(deck('Elf Ramp', 'Yeva, Nature’s Herald'), 0), 'Yeva');
  assert.equal(seatName(deck('Elf Ramp'), 0), 'Elf Ramp');
});

test('two seats on the same commander are told apart, not renamed', () => {
  const names = uniqueSeatNames([
    deck('a', 'Yeva, Nature’s Herald'),
    deck('b', 'Yeva, Nature’s Herald'),
    deck('c', 'The Ur-Dragon'),
    deck('d', 'Yeva, Nature’s Herald'),
  ]);
  assert.deepEqual(names, ['Yeva', 'Yeva 2', 'The Ur-Dragon', 'Yeva 3']);
});

test('no seat name contains an em-dash', () => {
  const names = uniqueSeatNames([
    deck('a', 'Kroxa, Titan of Death’s Hunger'),
    deck('b', 'The Ur-Dragon'),
    deck('You'),
  ]);
  for (const name of names) assert.equal(name.indexOf('—'), -1, `em-dash in: ${name}`);
});
