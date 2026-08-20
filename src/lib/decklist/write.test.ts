/**
 * The writer, held to the reader.
 *
 * Most of this file is one test said four ways: write a list, read it back with
 * `parseDeckList`, and require the same cards, quantities and printings. That
 * is the only check that actually proves there is one dialect here rather than
 * two, and it is the check that would have caught an export nobody can import.
 *
 * Run with the rest: `npm test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeckList } from './parse.ts';
import {
  DECKLIST_FORMATS,
  countWithoutPrinting,
  countWrittenCards,
  countWrittenCopies,
  deckListFileName,
  writeDeckList,
  type DeckListFormat,
  type WriteCard,
} from './write.ts';

/** A proxy list, in the shape the page hands over: every row is the main deck. */
const LIST: WriteCard[] = [
  { name: 'Sol Ring', quantity: 1, setCode: 'ltc', setName: "The Lord of the Rings Commander", collectorNumber: '284' },
  { name: 'Lightning Bolt', quantity: 4, setCode: '2x2', setName: 'Double Masters 2022', collectorNumber: '117' },
  { name: "Urza's Saga", quantity: 1, setCode: 'mh2', setName: 'Modern Horizons 2', collectorNumber: '259' },
  { name: 'Fire // Ice', quantity: 2, setCode: 'apc', setName: 'Apocalypse', collectorNumber: '128' },
];

/** What came back, keyed the way a reader would compare it. */
function readBack(text: string) {
  return parseDeckList(text).cards.map(card => ({
    name: card.name,
    quantity: card.quantity,
    setCode: card.setCode ?? null,
    collectorNumber: card.collectorNumber ?? null,
  }));
}

test('a written list reads back as the same cards, in every text format', () => {
  for (const format of ['text', 'arena'] as DeckListFormat[]) {
    const text = writeDeckList(LIST, format);
    assert.deepEqual(
      readBack(text),
      LIST.map(card => ({
        name: card.name,
        quantity: card.quantity,
        setCode: card.setCode ?? null,
        collectorNumber: card.collectorNumber ?? null,
      })),
      `${format} did not survive the round trip`
    );
  }
});

test('MTGO carries the cards but never a printing, and says so on the format', () => {
  const spec = DECKLIST_FORMATS.find(f => f.id === 'modo');
  assert.equal(spec?.canNamePrinting, false);

  assert.deepEqual(
    readBack(writeDeckList(LIST, 'modo')),
    LIST.map(card => ({ name: card.name, quantity: card.quantity, setCode: null, collectorNumber: null }))
  );
});

test('turning the printing off leaves plain names that still read back', () => {
  const text = writeDeckList(LIST, 'text', { printing: false });
  assert.equal(text.includes('('), false, 'a plain name list should carry no printing');
  assert.deepEqual(
    readBack(text),
    LIST.map(card => ({ name: card.name, quantity: card.quantity, setCode: null, collectorNumber: null }))
  );
});

test('the quantity is always written, so a name ending in a number survives', () => {
  /*
   * Six catalogue names end in a bare number, counted 20 Aug 2026. `Pain 101`
   * with no leading quantity reads as 101 copies of Pain, and `parse.ts` is
   * honest enough to keep both readings rather than pick. Writing `1 Pain 101`
   * settles it here, so nothing downstream has to.
   */
  const numbered: WriteCard[] = [
    { name: 'Pain 101', quantity: 1, setCode: 'unf', collectorNumber: '4' },
    { name: 'Black Waltz No. 3', quantity: 1 },
  ];

  for (const format of ['text', 'arena', 'modo'] as DeckListFormat[]) {
    const read = parseDeckList(writeDeckList(numbered, format)).cards;
    assert.deepEqual(
      read.map(card => ({ name: card.name, quantity: card.quantity })),
      [
        { name: 'Pain 101', quantity: 1 },
        { name: 'Black Waltz No. 3', quantity: 1 },
      ],
      `${format} lost a name ending in a number`
    );
  }
});

test('a card whose own name looks like a set code goes out without a printing', () => {
  /*
   * `Hazmat Suit (Used)` is the only name in 97,140 catalogue printings with a
   * set-shaped parenthetical, measured 20 Aug 2026. Writing the printing too
   * would put two of them on one line and the reader would take the wrong one.
   * So it goes out by name, which `parse.ts` resolves through its second
   * reading.
   *
   * It is NOT counted as a row we have no printing for, and this line used to
   * say the opposite. `countWithoutPrinting` feeds one sentence on the export
   * panel, "N cards are not in our card list", and that sentence was appearing
   * for a card that is in the card list and whose printing we know exactly.
   * Seen on the page on 20 Aug 2026 with this card on a proxy list.
   */
  const odd: WriteCard[] = [{ name: 'Hazmat Suit (Used)', quantity: 1, setCode: 'ust', collectorNumber: '57' }];

  assert.equal(writeDeckList(odd, 'text'), '1x Hazmat Suit (Used)');
  assert.equal(countWithoutPrinting(odd), 0);

  const read = parseDeckList(writeDeckList(odd, 'text')).cards[0];
  assert.equal(read.name, 'Hazmat Suit');
  assert.deepEqual(read.alternate, { name: 'Hazmat Suit (Used)', quantity: 1 });
});

test('a row with no printing to name still exports, by name', () => {
  /*
   * Production held exactly one of these on 20 Aug 2026: a proxy row whose
   * `card_id` is the literal text `sol-ring` from an old import, so no
   * catalogue row joins onto it and there is no set code to write.
   */
  const orphan: WriteCard[] = [
    { name: 'Sol Ring', quantity: 3 },
    { name: 'Mana Crypt', quantity: 1, setCode: 'ema', collectorNumber: '225' },
  ];

  assert.equal(writeDeckList(orphan, 'text'), '3x Sol Ring\n1x Mana Crypt (EMA) 225');
  assert.equal(countWithoutPrinting(orphan), 1);
});

test('foil and etched are marked, and read back as the finish', () => {
  const shiny: WriteCard[] = [
    { name: 'Sol Ring', quantity: 1, setCode: 'ltc', collectorNumber: '284', finish: 'foil' },
    { name: 'Mana Crypt', quantity: 1, setCode: 'ema', collectorNumber: '225', finish: 'etched' },
    { name: 'Arcane Signet', quantity: 1, setCode: 'eld', collectorNumber: '331', finish: 'nonfoil' },
  ];

  const read = parseDeckList(writeDeckList(shiny, 'text')).cards;
  assert.deepEqual(read.map(card => card.finish ?? null), ['foil', 'etched', null]);
  assert.deepEqual(read.map(card => card.setCode), ['ltc', 'ema', 'eld']);
});

test('sections come back the way they went out', () => {
  const deck: WriteCard[] = [
    { name: 'Atraxa, Praetors\' Voice', quantity: 1, setCode: '2xm', collectorNumber: '190', section: 'commander' },
    { name: 'Sol Ring', quantity: 1, setCode: 'ltc', collectorNumber: '284' },
    { name: 'Pithing Needle', quantity: 2, setCode: 'm21', collectorNumber: '234', section: 'sideboard' },
  ];

  for (const format of ['text', 'arena', 'modo'] as DeckListFormat[]) {
    const read = parseDeckList(writeDeckList(deck, format)).cards;
    assert.deepEqual(
      read.map(card => card.section),
      ['commander', 'main', 'sideboard'],
      `${format} lost a section`
    );
  }
});

test("a card named Commander's Sphere is not read as a heading", () => {
  /* The bug `parse.ts` was written to fix, checked from the writing side too. */
  const read = parseDeckList(
    writeDeckList([{ name: "Commander's Sphere", quantity: 4, setCode: 'c21', collectorNumber: '246' }], 'text')
  );
  assert.equal(read.cards.length, 1);
  assert.equal(read.cards[0].name, "Commander's Sphere");
  assert.equal(read.cards[0].quantity, 4);
});

test('nothing readable is dropped, and nothing empty is written', () => {
  const messy: WriteCard[] = [
    { name: '  Sol Ring  ', quantity: 0, setCode: 'ltc', collectorNumber: '284' },
    { name: '', quantity: 4 },
    { name: 'Mana Crypt', quantity: -2 },
  ];

  assert.equal(writeDeckList(messy, 'text'), '1x Sol Ring (LTC) 284\n1x Mana Crypt');
  assert.equal(countWrittenCards(messy), 2);
  assert.equal(parseDeckList(writeDeckList(messy, 'text')).unreadable.length, 0);
});

test('the spreadsheet has one column each, and quotes what would split a cell', () => {
  const csv = writeDeckList(
    [
      { name: 'Sol Ring', quantity: 2, setCode: 'ltc', setName: 'The Lord of the Rings, Tales of Middle-earth', collectorNumber: '284', finish: 'foil' },
    ],
    'csv'
  );

  const [header, row] = csv.split('\n');
  assert.equal(header, 'Quantity,Name,Set,Set code,Collector number,Finish');
  assert.equal(
    row,
    '2,Sol Ring,"The Lord of the Rings, Tales of Middle-earth",LTC,284,Foil'
  );
});

test('the counts are copies, not lines', () => {
  assert.equal(countWrittenCards(LIST), 4);
  assert.equal(countWrittenCopies(LIST), 8);
});

test('the file name carries the format, the date and the right extension', () => {
  const day = new Date('2026-08-20T09:00:00Z');
  assert.equal(
    deckListFileName('text', 'deckmatrix-proxy-list', day),
    'deckmatrix-proxy-list-text-2026-08-20.txt'
  );
  assert.equal(
    deckListFileName('csv', 'deckmatrix-proxy-list', day),
    'deckmatrix-proxy-list-csv-2026-08-20.csv'
  );
});

test('every format offered has instructions and an extension', () => {
  assert.equal(DECKLIST_FORMATS.length, 4);
  for (const spec of DECKLIST_FORMATS) {
    assert.ok(spec.name.length > 0, `${spec.id} has no name`);
    assert.ok(spec.instructions.length > 0, `${spec.id} has no instructions`);
    assert.ok(['txt', 'csv'].includes(spec.extension));
    assert.equal(spec.instructions.includes('—'), false, `${spec.id} uses an em-dash`);
  }
});
