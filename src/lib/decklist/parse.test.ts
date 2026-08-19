import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeParsedLines, parseCardLine, parseDeckList, tidyName } from './parse.ts';

/**
 * Every format in here is one somebody actually pastes. The point of the file
 * is that adding support for a sixth site cannot quietly break the first five.
 */

test('the plain forms', () => {
  assert.deepEqual(pick(parseCardLine('4 Lightning Bolt')), { name: 'Lightning Bolt', quantity: 4 });
  assert.deepEqual(pick(parseCardLine('4x Lightning Bolt')), { name: 'Lightning Bolt', quantity: 4 });
  assert.deepEqual(pick(parseCardLine('4 x Lightning Bolt')), { name: 'Lightning Bolt', quantity: 4 });
  assert.deepEqual(pick(parseCardLine('x4 Lightning Bolt')), { name: 'Lightning Bolt', quantity: 4 });
  assert.deepEqual(pick(parseCardLine('Lightning Bolt')), { name: 'Lightning Bolt', quantity: 1 });
  assert.deepEqual(pick(parseCardLine('Lightning Bolt x4')), { name: 'Lightning Bolt', quantity: 4 });
  assert.deepEqual(pick(parseCardLine('  4   Lightning   Bolt  ')), { name: 'Lightning Bolt', quantity: 4 });
  assert.deepEqual(pick(parseCardLine('- Lightning Bolt')), { name: 'Lightning Bolt', quantity: 1 });
});

test('the printing is kept, not thrown away', () => {
  const arena = parseCardLine('1 Lightning Bolt (M21) 163');
  assert.equal(arena?.name, 'Lightning Bolt');
  assert.equal(arena?.quantity, 1);
  assert.equal(arena?.setCode, 'm21');
  assert.equal(arena?.collectorNumber, '163');

  const noNumber = parseCardLine('2 Counterspell (MH2)');
  assert.equal(noNumber?.name, 'Counterspell');
  assert.equal(noNumber?.setCode, 'mh2');
  assert.equal(noNumber?.collectorNumber, undefined);

  const deckstats = parseCardLine('4 [M21] Lightning Bolt');
  assert.equal(deckstats?.name, 'Lightning Bolt');
  assert.equal(deckstats?.quantity, 4);
  assert.equal(deckstats?.setCode, 'm21');
});

test('a collector number is never read as a quantity', () => {
  /* The whole reason the printing comes off the line first. */
  const line = parseCardLine('1 Sol Ring (LTC) 284');
  assert.equal(line?.name, 'Sol Ring');
  assert.equal(line?.quantity, 1);
  assert.equal(line?.collectorNumber, '284');
});

test('foil markers and category tags', () => {
  const foil = parseCardLine('1 Sol Ring (LTC) 284 *F*');
  assert.equal(foil?.name, 'Sol Ring');
  assert.equal(foil?.finish, 'foil');

  const etched = parseCardLine('1 Sol Ring (LTC) 284 *E*');
  assert.equal(etched?.finish, 'etched');

  const archidekt = parseCardLine('1x Sol Ring (ltc) 284 [Ramp]');
  assert.equal(archidekt?.name, 'Sol Ring');
  assert.equal(archidekt?.setCode, 'ltc');
  assert.equal(archidekt?.collectorNumber, '284');
});

test('double faced names survive whole', () => {
  assert.equal(parseCardLine('1 Delver of Secrets // Insectile Aberration')?.name,
    'Delver of Secrets // Insectile Aberration');
  assert.equal(parseCardLine('Fire // Ice')?.name, 'Fire // Ice');
});

test('a card whose name contains a section word is not a heading', () => {
  /* The original read this line as a "Commander" heading and dropped the card. */
  const parsed = parseDeckList('4 Commander\'s Sphere\n1 Command Tower\n2 Sideboard Smash');
  assert.deepEqual(parsed.cards.map(c => c.name), [
    "Commander's Sphere",
    'Command Tower',
    'Sideboard Smash',
  ]);
  assert.equal(parsed.cards.every(c => c.section === 'main'), true);
});

test('headings move the section, with or without decoration', () => {
  const parsed = parseDeckList([
    'Commander (1)',
    '1 Atraxa, Praetors\' Voice',
    'Deck',
    '1 Sol Ring',
    'Sideboard:',
    '2 Pithing Needle',
    'Maybeboard',
    '1 Rhystic Study',
  ].join('\n'));
  assert.deepEqual(parsed.cards.map(c => [c.name, c.section]), [
    ["Atraxa, Praetors' Voice", 'commander'],
    ['Sol Ring', 'main'],
    ['Pithing Needle', 'sideboard'],
    ['Rhystic Study', 'maybeboard'],
  ]);
});

test('Arena About blocks carry no cards', () => {
  const parsed = parseDeckList('About\nName Mono Red\n\nDeck\n4 Lightning Bolt');
  assert.deepEqual(parsed.cards.map(c => c.name), ['Lightning Bolt']);
  assert.equal(parsed.unreadable.length, 0);
});

test('MTGO sideboard prefixes and Deckstats role markers', () => {
  const parsed = parseDeckList('4 Lightning Bolt\nSB: 2 Pithing Needle\n1 Sol Ring #!Commander');
  assert.deepEqual(parsed.cards.map(c => [c.name, c.quantity, c.section]), [
    ['Lightning Bolt', 4, 'main'],
    ['Pithing Needle', 2, 'sideboard'],
    ['Sol Ring', 1, 'commander'],
  ]);
});

test('comments are skipped, and a comment that is a heading still moves the section', () => {
  const parsed = parseDeckList('//Main\n4 Lightning Bolt\n// just a note\n//Sideboard\n2 Pithing Needle');
  assert.deepEqual(parsed.cards.map(c => [c.name, c.section]), [
    ['Lightning Bolt', 'main'],
    ['Pithing Needle', 'sideboard'],
  ]);
});

test('a line ending in a bare number keeps both readings', () => {
  /* `Pain 101` is a real card. `Lightning Bolt 4` is four Lightning Bolts.
     Nothing in the text tells them apart, so neither is guessed at. */
  const card = parseCardLine('Pain 101');
  assert.equal(card?.name, 'Pain 101');
  assert.equal(card?.quantity, 1);
  assert.deepEqual(card?.alternate, { name: 'Pain', quantity: 101 });

  const bolts = parseCardLine('Lightning Bolt 4');
  assert.equal(bolts?.name, 'Lightning Bolt 4');
  assert.deepEqual(bolts?.alternate, { name: 'Lightning Bolt', quantity: 4 });

  /* An explicit x is not ambiguous, so it gets no second reading. */
  assert.equal(parseCardLine('Lightning Bolt x4')?.alternate, undefined);
  assert.equal(parseCardLine('4 Lightning Bolt')?.alternate, undefined);
});

test('curly apostrophes from a web page fold to plain ones', () => {
  assert.equal(tidyName('Urza’s Saga'), "Urza's Saga");
  assert.equal(parseCardLine('1 Urza’s Saga')?.name, "Urza's Saga");
});

test('blank lines and stray whitespace cost nothing', () => {
  const parsed = parseDeckList('\n\n   \n4 Lightning Bolt\n\t\n\t2 Counterspell\t\n\n');
  assert.deepEqual(parsed.cards.map(c => [c.name, c.quantity]), [
    ['Lightning Bolt', 4],
    ['Counterspell', 2],
  ]);
  assert.equal(parsed.copies, 6);
  assert.equal(parsed.unreadable.length, 0);
});

test('nothing is dropped silently', () => {
  const parsed = parseDeckList('4 Lightning Bolt\n17\n2 Counterspell');
  assert.equal(parsed.cards.length, 2);
  assert.deepEqual(parsed.unreadable.map(u => [u.line, u.raw]), [[2, '17']]);
});

test('the same card under two headings becomes one entry', () => {
  const parsed = parseDeckList('Deck\n2 Sol Ring\nSideboard\n1 Sol Ring');
  const merged = mergeParsedLines(parsed.cards);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 3);
});

test('two printings of one card stay two entries', () => {
  /* On a proxy sheet these are two different pieces of art, so merging them
     would throw away the choice the paste made. */
  const parsed = parseDeckList('1 Sol Ring (LTC) 284\n1 Sol Ring (C21) 263');
  assert.equal(mergeParsedLines(parsed.cards).length, 2);
});

test('a whole Moxfield style commander paste', () => {
  const parsed = parseDeckList([
    'Commander',
    "1 Atraxa, Praetors' Voice (CMR) 1",
    '',
    'Deck',
    '1 Sol Ring (LTC) 284 *F*',
    '1 Arcane Signet (ELD) 331',
    "1 Urza’s Saga (MH2) 259",
    '1 Delver of Secrets',
    '',
    'Sideboard',
    '1 Pithing Needle',
  ].join('\n'));

  assert.equal(parsed.unreadable.length, 0);
  assert.equal(parsed.cards.length, 6);
  assert.equal(parsed.cards[0].section, 'commander');
  assert.equal(parsed.cards[1].finish, 'foil');
  assert.equal(parsed.cards[3].name, "Urza's Saga");
  assert.equal(parsed.cards[5].section, 'sideboard');
});

test('a card whose name ends in a short parenthetical keeps both readings', () => {
  /*
   * `Hazmat Suit (Used)` is a real Unstable card. `Used` is four characters, so
   * the printing rule reads it as a set code and asks for `Hazmat Suit`, which
   * is not a card: before this the line came back as a GUESS in "Worth a look"
   * rather than as the exact match it is. Both readings go in the same batch,
   * the way `Pain 101` already did, and the lookup settles it.
   */
  const line = parseCardLine('1 Hazmat Suit (Used)');
  assert.equal(line?.name, 'Hazmat Suit');
  assert.equal(line?.setCode, 'used');
  assert.deepEqual(line?.alternate, { name: 'Hazmat Suit (Used)', quantity: 1 });

  /* The quantity travels with the other reading. */
  assert.deepEqual(parseCardLine('3 Hazmat Suit (Used)')?.alternate, {
    name: 'Hazmat Suit (Used)',
    quantity: 3,
  });
});

test('a real printing is not turned into a second reading', () => {
  /* `(LTC) 284` is not ambiguous, so there is nothing to keep. */
  const withNumber = parseCardLine('1 Sol Ring (LTC) 284');
  assert.equal(withNumber?.setCode, 'ltc');
  assert.equal(withNumber?.collectorNumber, '284');
  assert.equal(withNumber?.alternate, undefined);

  /* A set code in the middle of a line is not the end of a name either. */
  const deckstats = parseCardLine('4 [M21] Lightning Bolt');
  assert.equal(deckstats?.name, 'Lightning Bolt');
  assert.equal(deckstats?.alternate, undefined);
});

test('a long parenthetical in a name is never mistaken for a set', () => {
  /* Three real cards, none of which this rule may touch. */
  assert.equal(parseCardLine('1 B.F.M. (Big Furry Monster)')?.name, 'B.F.M. (Big Furry Monster)');
  assert.equal(parseCardLine('1 B.O.B. (Bevy of Beebles)')?.name, 'B.O.B. (Bevy of Beebles)');
  assert.equal(
    parseCardLine("1 Erase (Not the Urza's Legacy One)")?.name,
    "Erase (Not the Urza's Legacy One)"
  );
});

function pick(line: ReturnType<typeof parseCardLine>) {
  return line ? { name: line.name, quantity: line.quantity } : null;
}
