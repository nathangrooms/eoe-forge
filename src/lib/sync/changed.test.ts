/**
 * The sync's change filter, tested against the ways it can silently do nothing.
 *
 * A filter that reports everything as changed is the old behaviour with extra
 * steps, and it would look exactly like a working optimisation. Two of these
 * tests exist for that specific failure.
 *
 * The module under test lives with the edge function, because that is the only
 * thing that runs it, and is imported by path rather than vendored: it has no
 * dependencies and nothing else may use it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonical,
  fingerprint,
  splitChanged,
  SYNCED_COLUMNS,
} from '../../../supabase/functions/scryfall-sync/changed.ts';

const card = (over: Record<string, unknown> = {}) => ({
  id: 'card-1',
  oracle_id: 'oracle-1',
  name: 'Sol Ring',
  set_code: 'lea',
  collector_number: '270',
  layout: 'normal',
  type_line: 'Artifact',
  cmc: 1,
  colors: [],
  color_identity: [],
  oracle_text: '{T}: Add {C}{C}.',
  mana_cost: '{1}',
  power: null,
  toughness: null,
  loyalty: null,
  keywords: [],
  legalities: { commander: 'legal', modern: 'not_legal' },
  image_uris: { normal: 'https://example/normal.jpg', large: 'https://example/large.jpg' },
  faces: null,
  prices: { usd: '1.50', eur: '1.20' },
  is_legendary: false,
  is_reserved: false,
  rarity: 'uncommon',
  artist: 'Mark Tedin',
  illustration_id: 'illo-1',
  released_at: '1993-08-05',
  set_name: 'Limited Edition Alpha',
  finishes: ['nonfoil'],
  border_color: 'black',
  frame_effects: null,
  full_art: false,
  variation: false,
  promo: false,
  edhrec_rank: 1,
  game_changer: false,
  ...over,
});

describe('the sync writes only what changed', () => {
  it('a row identical to the stored copy is not written', () => {
    const rows = [card()];
    const stored = new Map([['card-1', card()]]);
    const { changed, unchanged } = splitChanged(rows, stored);
    assert.equal(changed.length, 0);
    assert.equal(unchanged, 1);
  });

  it('a row we do not hold yet is always written', () => {
    const { changed, unchanged } = splitChanged([card()], new Map());
    assert.equal(changed.length, 1);
    assert.equal(unchanged, 0);
  });

  it('a price move is a change, because that is most of what moves', () => {
    const stored = new Map([['card-1', card({ prices: { usd: '1.50', eur: '1.20' } })]]);
    const { changed } = splitChanged([card({ prices: { usd: '1.75', eur: '1.20' } })], stored);
    assert.equal(changed.length, 1);
  });

  it('JSONB KEY ORDER IS NOT A CHANGE', () => {
    /* THE TEST THIS MODULE EXISTS FOR. Postgres stores jsonb with its keys
       sorted and returns them that way, while the object built from Scryfall's
       response is in Scryfall's order. Comparing raw JSON.stringify would
       report every card as changed on every run: the whole write load, saved
       nothing, and no error anywhere to say so. */
    const fromScryfall = card({
      legalities: { commander: 'legal', modern: 'not_legal' },
      image_uris: { normal: 'https://example/normal.jpg', large: 'https://example/large.jpg' },
      prices: { usd: '1.50', eur: '1.20' },
    });
    const fromPostgres = card({
      legalities: { modern: 'not_legal', commander: 'legal' },
      image_uris: { large: 'https://example/large.jpg', normal: 'https://example/normal.jpg' },
      prices: { eur: '1.20', usd: '1.50' },
    });
    assert.equal(fingerprint(fromScryfall), fingerprint(fromPostgres));
    const { changed, unchanged } = splitChanged([fromScryfall], new Map([['card-1', fromPostgres]]));
    assert.equal(changed.length, 0, 'key order was read as a change');
    assert.equal(unchanged, 1);
  });

  it('a number and its text are the same value', () => {
    /* PostgREST returns `numeric` as a string, so `cmc: 1` from Scryfall meets
       `cmc: "1"` from the database. Reading that as a change would mark every
       card with a mana value, which is every card. */
    assert.equal(canonical(1), canonical('1'));
    const { changed } = splitChanged([card({ cmc: 1 })], new Map([['card-1', card({ cmc: '1' })]]));
    assert.equal(changed.length, 0);
  });

  it('absent and null are the same value', () => {
    /* A column left out of the payload and a column explicitly null both read
       back from Postgres as null. */
    const withUndefined = card();
    delete (withUndefined as Record<string, unknown>).artist;
    const { changed } = splitChanged([withUndefined], new Map([['card-1', card({ artist: null })]]));
    assert.equal(changed.length, 0);
  });

  it('ARRAY ORDER IS a change, because in these columns it means something', () => {
    // `colors` is WUBRG-ordered and `faces` is front then back.
    const a = card({ colors: ['W', 'U'] });
    const b = card({ colors: ['U', 'W'] });
    assert.notEqual(fingerprint(a), fingerprint(b));
  });

  it('every column the sync writes is compared', () => {
    /* A column missing from this list is a column whose changes are invisible,
       and the card would never be rewritten no matter what moved. Each is
       poked individually rather than trusting the list to be complete. */
    for (const column of SYNCED_COLUMNS) {
      const stored = new Map([['card-1', card()]]);
      const poked = card({ [column]: 'something-else-entirely' });
      const { changed } = splitChanged([poked], stored);
      assert.equal(changed.length, 1, `a change to ${column} was not noticed`);
    }
  });

  it('a mixed page splits into exactly the rows that moved', () => {
    const rows = [
      card({ id: 'a' }),
      card({ id: 'b', prices: { usd: '9.99' } }),
      card({ id: 'c' }),
    ];
    const stored = new Map([
      ['a', card({ id: 'a' })],
      ['b', card({ id: 'b', prices: { usd: '1.50', eur: '1.20' } })],
      // 'c' is new
    ]);
    const { changed, unchanged } = splitChanged(rows, stored);
    assert.deepEqual(changed.map(r => r.id).sort(), ['b', 'c']);
    assert.equal(unchanged, 1);
  });
});
