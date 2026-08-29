/**
 * The collection export writes a file that leaves the app, and the collection
 * page needs an account, so nothing on screen can show these are right. These
 * run them.
 *
 * Every fixture below is a real shape from the export query: a row carrying the
 * stored 'UNK' placeholder, a row the catalogue holds no USD price for, and two
 * Sol Rings from the same set that only a collector number can tell apart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateCSV,
  generateJSON,
  generateMoxfield,
  priceOf,
  setCodeOf,
  cell,
  MOXFIELD_HEADERS,
  type ExportRow,
  type ExportFields,
} from './exportFormats.ts';

const ALL: ExportFields = {
  quantity: true,
  foil: true,
  condition: true,
  price: true,
  setCode: true,
};

/** Esper Sentinel: the collection row says UNK, the catalogue says mh2. */
const unkRow: ExportRow = {
  card_name: 'Esper Sentinel',
  quantity: 1,
  foil: 0,
  condition: 'near_mint',
  set_code: 'UNK',
  updated_at: '2026-08-01T00:00:00.000Z',
  cards: { set_code: 'mh2', collector_number: '12', prices: { usd: '58.16' } },
};

/** A printing the catalogue holds no USD price for at all. */
const unpricedRow: ExportRow = {
  card_name: 'Shivan Dragon',
  quantity: 1,
  foil: 0,
  condition: 'near_mint',
  set_code: 'SLD',
  updated_at: '2026-08-01T00:00:00.000Z',
  cards: { set_code: 'sld', collector_number: '1499', prices: { usd: null, eur: '2199.95' } },
};

/** Two Sol Rings, same set, wildly different money. */
const solA: ExportRow = {
  card_name: 'Sol Ring',
  quantity: 1,
  foil: 0,
  condition: 'near_mint',
  set_code: 'PIP',
  cards: { set_code: 'pip', collector_number: '345', prices: { usd: '17.19' } },
};
const solB: ExportRow = {
  card_name: 'Sol Ring',
  quantity: 1,
  foil: 0,
  condition: 'near_mint',
  set_code: 'PIP',
  cards: { set_code: 'pip', collector_number: '1049', prices: { usd: '266.14' } },
};

test('the joined card row decides the set, and UNK never survives', () => {
  assert.equal(setCodeOf(unkRow), 'mh2');
  assert.equal(setCodeOf({ set_code: 'UNK' }), '');
  assert.equal(setCodeOf({ set_code: 'unknown' }), '');
  assert.equal(setCodeOf({ set_code: 'mkm' }), 'mkm');
  assert.equal(setCodeOf({}), '');
});

test('a missing price is null, never 0', () => {
  assert.equal(priceOf(unpricedRow), null);
  assert.equal(priceOf(unkRow), 58.16);
  assert.equal(priceOf({ cards: { prices: { usd: '0' } } }), null);
  assert.equal(priceOf({ cards: { prices: { usd: '0.01' } } }), 0.01);
});

test('a foil-only holding is priced at the foil price', () => {
  const foilOnly: ExportRow = {
    quantity: 0,
    foil: 2,
    cards: { prices: { usd: '1.00', usd_foil: '9.00' } },
  };
  assert.equal(priceOf(foilOnly), 9);
});

test('CSV writes an empty price cell rather than a zero', () => {
  const csv = generateCSV([unpricedRow], ALL);
  const [, row] = csv.split('\n');
  assert.equal(row.includes('"0"'), false, `a literal zero got into: ${row}`);
  assert.equal(row.includes('"0.00"'), false, `a literal zero got into: ${row}`);
  assert.match(row, /,""$/, `the price cell should be empty: ${row}`);
});

test('CSV never exports UNK, and carries the collector number', () => {
  const csv = generateCSV([unkRow], ALL);
  assert.equal(/UNK/.test(csv), false, csv);
  assert.match(csv, /"MH2"/);
  assert.match(csv, /"12"/);
  assert.match(csv.split('\n')[0], /Collector Number/);
});

test('CSV tells the two Sol Rings apart', () => {
  const csv = generateCSV([solA, solB], ALL);
  const [, a, b] = csv.split('\n');
  assert.notEqual(a, b, 'two printings worth $17.19 and $266.14 exported identically');
  assert.match(a, /"345"/);
  assert.match(b, /"1049"/);
});

test('CSV escapes a quote inside a card name instead of breaking the row', () => {
  assert.equal(cell('Ach! Hans, Run!'), '"Ach! Hans, Run!"');
  assert.equal(cell('a "b" c'), '"a ""b"" c"');
});

test('JSON gives null for a missing price and never the string UNK', () => {
  const parsed = JSON.parse(generateJSON([unpricedRow, unkRow], ALL));
  assert.equal(parsed[0].price_usd, null);
  assert.equal(parsed[0].set_code, 'sld');
  assert.equal(parsed[1].price_usd, 58.16);
  assert.equal(parsed[1].set_code, 'mh2');
  assert.equal(parsed[1].collector_number, '12');
});

test('Moxfield gets a real edition, so an import can match the printing', () => {
  const out = generateMoxfield([unkRow, solA, solB]);
  const lines = out.split('\n');
  assert.equal(lines[0], MOXFIELD_HEADERS);
  assert.equal(/UNK/.test(out), false, out);
  assert.match(lines[1], /,MH2,/);
  assert.match(lines[2], /,345,/);
  assert.match(lines[3], /,1049,/);
});

test('Moxfield leaves Purchase Price empty, because we do not know what you paid', () => {
  const line = generateMoxfield([unkRow]).split('\n')[1];
  const columns = line.split(',');
  assert.equal(
    columns.length,
    MOXFIELD_HEADERS.split(',').length,
    `column count drifted: ${line}`
  );
  assert.equal(columns[columns.length - 1], '', `a price got into Purchase Price: ${line}`);
});

test('turning a field off removes its column and nothing else', () => {
  const csv = generateCSV([unkRow], { ...ALL, price: false });
  assert.equal(/Price/.test(csv), false);
  assert.match(csv, /"MH2"/);
});
