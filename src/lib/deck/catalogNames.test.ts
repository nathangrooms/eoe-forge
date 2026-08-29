/**
 * The card-name lookup, and the one character that made it return nothing.
 *
 *   node --test --experimental-strip-types src/lib/deck/catalogNames.test.ts
 *
 * WHY THIS EXISTS
 * ---------------
 * `Catalog.cardsByName` asks PostgREST `name=in.("…")`, which is byte equality.
 * `normalizeName` folds the typographic apostrophe, but it was only ever
 * applied to rows that had already come back — so the fold ran on the answer
 * and never on the question. A name arriving as "Yuriko, the Tiger’s Shadow"
 * matched nothing, and nothing normalised anything because nothing came back.
 *
 * The commander is resolved through that same method, and `pipeline.ts` throws
 * "is not in the card database" on an empty result, so this was not a worse
 * deck. It was no deck. Measured live on 2026-08-28 against `cards_unique`:
 * the ASCII spelling returns one row, the typographic spelling returns zero,
 * and 2,258 commander-legal card names carry an apostrophe.
 *
 * `nameVariants` is the fix and these are its rules. It is asserted here rather
 * than only in the live probe because the live probe is not run on every commit
 * and this is a one-character regression waiting to happen again.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  asciiPunctuation,
  nameVariants,
  normalizeName,
} from '../../../supabase/functions/deck-optimizer/catalog.ts';

describe('a name is asked for in every spelling it could be stored under', () => {
  it('sends the ASCII apostrophe alongside the typographic one', () => {
    assert.deepEqual(nameVariants('Yuriko, the Tiger’s Shadow'), [
      'Yuriko, the Tiger’s Shadow',
      "Yuriko, the Tiger's Shadow",
    ]);
  });

  it('sends ONE spelling when the name is already ASCII, so nothing is paid for nothing', () => {
    assert.deepEqual(nameVariants("Yuriko, the Tiger's Shadow"), [
      "Yuriko, the Tiger's Shadow",
    ]);
    assert.deepEqual(nameVariants('Sol Ring'), ['Sol Ring']);
  });

  it('keeps the caller’s own spelling first and never replaces it', () => {
    // Folding is a guess about how the catalogue is written. The raw name is
    // what was actually asked for, so it must still go out: a row that really
    // does carry a typographic character has to stay findable.
    const [first] = nameVariants('Atraxa, Praetors’ Voice');
    assert.equal(first, 'Atraxa, Praetors’ Voice');
  });

  it('drops an empty or whitespace-only name rather than asking for ""', () => {
    assert.deepEqual(nameVariants('   '), []);
    assert.deepEqual(nameVariants(''), []);
  });

  it('trims, because a pasted decklist carries trailing spaces', () => {
    assert.deepEqual(nameVariants('  Sol Ring  '), ['Sol Ring']);
  });
});

describe('the fold covers the punctuation an editor substitutes', () => {
  const cases: [string, string][] = [
    // Every one of these is what Word, Google Docs, Notion or iOS produces
    // from ordinary typing, and none of them appears in any of the 33,032
    // rows of `cards_unique` — measured 2026-08-28.
    ['Yuriko, the Tiger’s Shadow', "Yuriko, the Tiger's Shadow"],
    ['Yuriko, the Tiger‘s Shadow', "Yuriko, the Tiger's Shadow"],
    ['Yuriko, the Tigerʼs Shadow', "Yuriko, the Tiger's Shadow"],
    ['Ranger‑Captain of Eos', 'Ranger-Captain of Eos'],
    ['Ranger–Captain of Eos', 'Ranger-Captain of Eos'],
    ['Ranger—Captain of Eos', 'Ranger-Captain of Eos'],
    ['Sol Ring', 'Sol Ring'],
    ['Sol  Ring', 'Sol Ring'],
    ['“Ace”', '"Ace"'],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(asciiPunctuation(input), expected);
    });
  }

  it('leaves a name that is already ASCII exactly as it is', () => {
    for (const name of [
      "Atraxa, Praetors' Voice",
      'Agadeem’s Awakening // Agadeem, the Undercrypt'.replace('’', "'"),
      'Sol Ring',
      'Ranger-Captain of Eos',
      'Borrowing 100,000 Arrows',
    ]) {
      assert.equal(asciiPunctuation(name), name);
    }
  });
});

describe('normalizeName still answers the question it always answered', () => {
  it('folds case, whitespace and the apostrophe to one key', () => {
    assert.equal(
      normalizeName('  Yuriko, the Tiger’s SHADOW '),
      "yuriko, the tiger's shadow"
    );
  });

  it('agrees with the fold the query now uses, so a row that is fetched is matched', () => {
    // The two must not drift. Fetching under a folded spelling and then
    // failing to recognise the row would trade one silent miss for another.
    const written = 'Ranger‑Captain of Eos';
    assert.equal(normalizeName(written), normalizeName(asciiPunctuation(written)));
  });
});
