/**
 * Tests for the legality verdict.
 *
 *   node --test --experimental-strip-types src/lib/deck/deckLegality.test.ts
 *
 * The Legality tab used to hand a player a list of English sentences built by
 * `DeckLegalityChecker`, which is untestable in the way that matters: you can
 * assert the wording and not the ruling. What is locked here is the ruling —
 * one fault per card, in the order that decides which reason is worth showing,
 * the copy limit counted by card name rather than by row, and a format the
 * catalogue reports but `ALL_FORMATS` does not model answering card legality
 * while saying out loud that it cannot answer deck construction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cardFaults,
  deckFormatVerdicts,
  deckRules,
  formatsInDeck,
  type LegalityInput,
} from './deckLegality.ts';
import type { DeckCardRow } from './deckCards.ts';

let seq = 0;

function row(
  name: string,
  options: {
    quantity?: number;
    legalities?: Record<string, string>;
    colorIdentity?: string[];
    typeLine?: string;
    isCommander?: boolean;
    /** Pass `null` for a printing that has not synced. */
    synced?: boolean;
  } = {}
): DeckCardRow {
  const id = `row-${++seq}`;
  return {
    id,
    card_id: id,
    card_name: name,
    quantity: options.quantity ?? 1,
    is_commander: options.isCommander ?? false,
    is_sideboard: false,
    card:
      options.synced === false
        ? null
        : ({
            name,
            type_line: options.typeLine ?? 'Creature — Human',
            mana_cost: '{1}',
            cmc: 1,
            colors: [],
            color_identity: options.colorIdentity ?? [],
            image_uris: null,
            prices: null,
            oracle_text: null,
            power: null,
            toughness: null,
            rarity: 'rare',
            set_code: 'tst',
            legalities: options.legalities ?? { commander: 'legal', modern: 'legal' },
            is_legendary: false,
            keywords: [],
            tags: [],
            oracle_id: null,
            edhrec_rank: null,
            is_reserved: false,
            produced_mana: [],
          } as DeckCardRow['card']),
  };
}

test('a banned card is one fault, named as banned', () => {
  const input: LegalityInput = {
    rows: [row('Black Lotus', { legalities: { commander: 'banned' } })],
  };
  const faults = cardFaults(input, 'commander');
  assert.equal(faults.length, 1);
  assert.equal(faults[0].fault, 'banned');
});

test('banned outranks the copy limit, so one card is one job', () => {
  // Banned AND four copies in a singleton format. Listing it twice would say
  // the player has two problems when they have one card to take out.
  const input: LegalityInput = {
    rows: [row('Banned Thing', { quantity: 4, legalities: { commander: 'banned' } })],
  };
  const faults = cardFaults(input, 'commander');
  assert.equal(faults.length, 1);
  assert.equal(faults[0].fault, 'banned');
});

test('the copy limit counts by card name, not by row', () => {
  // Two rows, two printings, one card. A checker counting rows passes this and
  // the deck is illegal.
  const input: LegalityInput = {
    rows: [row('Sol Ring'), row('Sol Ring')],
  };
  const faults = cardFaults(input, 'commander');
  assert.equal(faults.length, 2);
  assert.ok(faults.every(f => f.fault === 'copy-limit'));
});

test('basic lands are exempt from the copy limit, Wastes included', () => {
  const input: LegalityInput = {
    rows: [
      row('Forest', { quantity: 12, typeLine: 'Basic Land — Forest' }),
      row('Wastes', { quantity: 6, typeLine: 'Basic Land' }),
    ],
  };
  assert.deepEqual(cardFaults(input, 'commander'), []);
});

test('colour identity is measured against the commander, and only when there is one', () => {
  const island = row('Island Thing', { colorIdentity: ['U'] });
  const noCommander: LegalityInput = { rows: [island] };
  assert.deepEqual(cardFaults(noCommander, 'commander'), []);

  const withCommander: LegalityInput = {
    rows: [island],
    commander: row('Red Boss', { colorIdentity: ['R'], isCommander: true }),
  };
  const faults = cardFaults(withCommander, 'commander');
  assert.equal(faults.length, 1);
  assert.equal(faults[0].fault, 'colour-identity');
});

test('an unsynced printing is reported as having no data, not as legal', () => {
  const input: LegalityInput = { rows: [row('Mystery', { synced: false })] };
  const faults = cardFaults(input, 'commander');
  assert.equal(faults.length, 1);
  assert.equal(faults[0].fault, 'no-data');
});

test('restricted only fires above one copy', () => {
  const one: LegalityInput = {
    rows: [row('Ancestral Recall', { legalities: { vintage: 'restricted' } })],
  };
  assert.deepEqual(cardFaults(one, 'vintage'), []);

  const two: LegalityInput = {
    rows: [row('Ancestral Recall', { quantity: 2, legalities: { vintage: 'restricted' } })],
  };
  assert.equal(cardFaults(two, 'vintage')[0].fault, 'restricted');
});

test('deck rules count the commander towards the size', () => {
  const rows = Array.from({ length: 99 }, (_, i) => row(`Card ${i}`));
  const input: LegalityInput = {
    rows,
    commander: row('The Boss', { isCommander: true }),
  };
  const size = deckRules(input, 'commander').find(r => r.id === 'size');
  assert.ok(size);
  assert.equal(size.ok, true);
  assert.match(size.reading, /100/);
});

test('the format keys come from the cards, so nothing is invented', () => {
  const rows = [
    row('A', { legalities: { commander: 'legal', predh: 'legal' } }),
    row('B', { legalities: { commander: 'legal', modern: 'banned' } }),
  ];
  assert.deepEqual(formatsInDeck(rows).sort(), ['commander', 'modern', 'predh']);
});

test('a format ALL_FORMATS does not model reports card legality and admits the rest', () => {
  const rows = [row('A', { legalities: { predh: 'legal' } })];
  const predh = deckFormatVerdicts({ rows }).find(v => v.format === 'predh');
  assert.ok(predh);
  assert.equal(predh.rulesKnown, false);
  assert.deepEqual(predh.rules, []);
  // Card legality still answered.
  assert.equal(predh.offendingRows, 0);
});

test('a banned commander makes the format illegal even with a clean mainboard', () => {
  const input: LegalityInput = {
    rows: [row('Fine', { legalities: { duel: 'legal' } })],
    commander: row('Golos', { legalities: { duel: 'banned' }, isCommander: true }),
  };
  const duel = deckFormatVerdicts(input).find(v => v.format === 'duel');
  assert.ok(duel);
  assert.equal(duel.legal, false);
  assert.equal(duel.offendingRows, 1);
});

test('formats the deck is legal in are listed first', () => {
  const input: LegalityInput = {
    rows: [
      row('A', { legalities: { commander: 'legal', modern: 'banned', legacy: 'legal' } }),
    ],
  };
  const verdicts = deckFormatVerdicts(input);
  const firstIllegal = verdicts.findIndex(v => !v.legal);
  const lastLegal = verdicts.map(v => v.legal).lastIndexOf(true);
  assert.ok(firstIllegal === -1 || lastLegal < firstIllegal);
});
