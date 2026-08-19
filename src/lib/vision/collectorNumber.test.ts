/**
 * Reading the printing off the bottom of a card.
 *
 *   node --test --experimental-strip-types src/lib/vision/collectorNumber.test.ts
 *
 * The property that matters most here is not accuracy, it is FAIL-SAFETY. A
 * collector number that is read wrongly but still matches a real sibling
 * printing would silently record the wrong card in someone's collection, where
 * the printings differ in price by orders of magnitude and nothing on screen
 * would ever reveal the mistake. A number that is not read at all merely shows
 * the user a picker.
 *
 * So most of these tests assert that ambiguous input produces NO match rather
 * than a plausible one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCollectorLine,
  matchPrintingByCollector,
  normaliseCollectorNumber,
  type PrintingIdentity,
} from './collectorNumber.ts';

test('reads the modern "number/total" form', () => {
  const r = parseCollectorLine('0166/291 C');
  assert.equal(r.collectorNumber, '166');
  assert.equal(r.setTotal, '291');
});

test('reads number and set code from a realistic two-line block', () => {
  const r = parseCollectorLine('0166/291 C\nCLU • EN Mark Poole');
  assert.equal(r.collectorNumber, '166');
  assert.equal(r.setCode, 'CLU');
});

/**
 * Raw Tesseract output observed on a real capture of Ivy Lane Denizen (clu,
 * 2024). Pinned verbatim: this is what the OCR layer actually has to cope with,
 * not a tidied-up version of it.
 */
test('survives the observed OCR mangling of a modern card', () => {
  const r = parseCollectorLine('C 0166 / CLU EN');
  assert.equal(r.collectorNumber, '166');
  // "CLU" is the only 3-letter run that is not a language tag.
  assert.equal(r.setCode, 'CLU');
});

/**
 * Kor Outfitter (zen, 2009). Pre-2015 cards carry no collector number at all —
 * the bottom line is a copyright notice. This is ~30% of the catalogue, and no
 * vision technique can recover a number that was never printed.
 */
test('recognises a pre-2015 copyright line and reports no number', () => {
  const r = parseCollectorLine('O 1993-2009 WZ C');
  assert.equal(r.looksPre2015, true);
  assert.equal(
    r.collectorNumber,
    null,
    'a year range must never be mistaken for a collector number',
  );
});

test('does not read a bare year as a collector number', () => {
  for (const line of ['1993', '2009 Wizards', '© 2015']) {
    assert.equal(parseCollectorLine(line).collectorNumber, null, `misread "${line}"`);
  }
});

test('rejects language tags and legal boilerplate as set codes', () => {
  for (const line of ['123/456 EN', '12/34 THE', '5/10 NOT FOR SALE']) {
    const r = parseCollectorLine(line);
    assert.notEqual(r.setCode, 'EN');
    assert.notEqual(r.setCode, 'THE');
    assert.notEqual(r.setCode, 'NOT');
  }
});

test('keeps a letter suffix, which is part of the printing identity', () => {
  const r = parseCollectorLine('0166a/291 C');
  assert.equal(r.collectorNumber, '166');
  assert.equal(r.numberSuffix, 'a');
});

test('empty and junk input parse to nulls rather than throwing', () => {
  for (const line of ['', '   ', '\n\n', '~~~', '||||']) {
    const r = parseCollectorLine(line);
    assert.equal(r.collectorNumber, null);
    assert.equal(r.setCode, null);
  }
});

test('normaliseCollectorNumber strips leading zeros but keeps suffixes', () => {
  assert.equal(normaliseCollectorNumber('0166'), '166');
  assert.equal(normaliseCollectorNumber('166'), '166');
  assert.equal(normaliseCollectorNumber('166a'), '166a');
  assert.equal(normaliseCollectorNumber('0007b'), '7b');
  assert.equal(normaliseCollectorNumber('★0166'), '★166');
});

// ---- the fail-safe property ---------------------------------------------

const printings: PrintingIdentity[] = [
  { cardId: 'card-clu-166', setCode: 'CLU', collectorNumber: '166' },
  { cardId: 'card-ecc-170', setCode: 'ECC', collectorNumber: '170' },
  { cardId: 'card-msc-88', setCode: 'MSC', collectorNumber: '88' },
];

test('an exact read on both number and set code resolves one printing', () => {
  const matches = matchPrintingByCollector(parseCollectorLine('0166/291 C CLU EN'), printings);
  const exact = matches.filter((m) => m.exact);
  assert.equal(exact.length, 1);
  assert.equal(exact[0].cardId, 'card-clu-166');
});

test('a number that matches but a set code that does not is NOT exact', () => {
  // The single most important test in this file. If the number is misread as
  // another printing's number, the set code disagreeing is what stops us
  // committing to the wrong row.
  const reading = parseCollectorLine('0170/291 C CLU EN');
  const matches = matchPrintingByCollector(reading, printings);
  assert.equal(
    matches.filter((m) => m.exact).length,
    0,
    'number and set code disagreed, so nothing may be treated as ground truth',
  );
});

test('an unreadable line produces no matches at all', () => {
  const matches = matchPrintingByCollector(parseCollectorLine('~~~~~'), printings);
  assert.equal(matches.length, 0);
});

test('a pre-2015 copyright line produces no exact match', () => {
  const matches = matchPrintingByCollector(
    parseCollectorLine('™ & © 1993-2009 Wizards of the Coast'),
    printings,
  );
  assert.equal(matches.filter((m) => m.exact).length, 0);
});

test('leading zeros on the card do not prevent a match', () => {
  const matches = matchPrintingByCollector(
    { collectorNumber: '88', numberSuffix: null, setCode: 'MSC', setTotal: null, looksPre2015: false, raw: '' },
    printings,
  );
  assert.equal(matches.filter((m) => m.exact)[0]?.cardId, 'card-msc-88');
});

test('matching is case-insensitive on the set code', () => {
  const matches = matchPrintingByCollector(
    { collectorNumber: '166', numberSuffix: null, setCode: 'clu', setTotal: null, looksPre2015: false, raw: '' },
    printings,
  );
  assert.equal(matches.filter((m) => m.exact)[0]?.cardId, 'card-clu-166');
});

test('digit confusions are corrected only inside the number slot', () => {
  // "O166" with a letter O for a zero. The number must still read 166, and the
  // O must not leak into the set code.
  const r = parseCollectorLine('O166/291 CLU');
  assert.equal(r.collectorNumber, '166');
  assert.equal(r.setCode, 'CLU');
});

test('reads set codes that contain digits', () => {
  // Set codes are alphanumeric. An earlier implementation stripped digits to
  // get "letters only", which silently discarded every code of this shape —
  // and there are a lot of them.
  const cases: Array<[string, string]> = [
    ['3/300 C\nGN3 • EN', 'GN3'],
    ['0166/291 C\nM21 • EN', 'M21'],
    ['12/350 R\n3ED • EN', '3ED'],
    ['7/249 U\n10E • EN', '10E'],
  ];
  for (const [line, expected] of cases) {
    assert.equal(parseCollectorLine(line).setCode, expected, `failed on "${line}"`);
  }
});

test('an all-digit run is never mistaken for a set code', () => {
  assert.equal(parseCollectorLine('0166/291 C').setCode, null);
});

/**
 * "The List" (`plst`) reprints carry the ORIGINAL set's symbol and number on
 * the card face. The catalogue stores that as a compound collector number —
 * `plst` / "RNA-91" — so a correct read of "RNA 91" describes two different
 * rows equally well: the original Ravnica Allegiance printing and the List one.
 *
 * Measured: this was 4 of the 12 wrong printings in a 1,680-capture run, and
 * every one of them recorded a card the user did not own.
 */
test('a List reprint matches the original set code and number printed on it', () => {
  const listPrintings: PrintingIdentity[] = [
    { cardId: 'plst-row', setCode: 'plst', collectorNumber: 'RNA-91' },
  ];
  const matches = matchPrintingByCollector(parseCollectorLine('091/259 C RNA EN'), listPrintings);
  assert.equal(matches.filter((m) => m.exact).length, 1);
  assert.equal(matches[0].cardId, 'plst-row');
});

test('a List reprint and its original are BOTH matched, so the user is asked', () => {
  // The correct outcome is ambiguity, not a winner. The two cards genuinely
  // look the same to OCR; only a List card's extra marking distinguishes them,
  // and committing to either would be a guess.
  const both: PrintingIdentity[] = [
    { cardId: 'rna-row', setCode: 'rna', collectorNumber: '91' },
    { cardId: 'plst-row', setCode: 'plst', collectorNumber: 'RNA-91' },
  ];
  const exact = matchPrintingByCollector(
    parseCollectorLine('091/259 C RNA EN'),
    both,
  ).filter((m) => m.exact);
  assert.equal(exact.length, 2, 'both readings are equally consistent, so neither may win');
});

test('a compound number does not match an unrelated set code', () => {
  const listPrintings: PrintingIdentity[] = [
    { cardId: 'plst-row', setCode: 'plst', collectorNumber: 'RNA-91' },
  ];
  const matches = matchPrintingByCollector(parseCollectorLine('091/259 C WAR EN'), listPrintings);
  assert.equal(matches.filter((m) => m.exact).length, 0);
});
