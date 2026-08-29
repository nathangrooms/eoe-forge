import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckValidator } from './validation-warnings.ts';

/**
 * The deck page prints two land counts and they disagreed on screen.
 *
 * `/deck/:id` draws a type breakdown at the top from the canonical categoriser
 * and `DeckLegalityPanel` draws this validator's advice at the bottom. For the
 * Atraxa deck the top read "32 Lands" and the bottom read "33 lands may be
 * slightly low", because this file tested `type_line.includes('land')` over the
 * whole string and Agadeem's Awakening // Agadeem, the Undercrypt is
 * `Sorcery // Land`.
 *
 * A card is a land if its FRONT face is, which is the rule every other deck
 * surface already follows.
 */

const card = (name: string, type_line: string, extra: Record<string, unknown> = {}) =>
  ({ id: name, name, type_line, cmc: 2, quantity: 1, ...extra }) as never;

/** 32 real lands, one modal double-faced spell, the rest cheap creatures. */
function commanderDeck() {
  const cards = [] as never[];
  for (let i = 0; i < 32; i++) cards.push(card(`Forest ${i}`, 'Basic Land — Forest'));
  cards.push(card("Agadeem's Awakening // Agadeem, the Undercrypt", 'Sorcery // Land'));
  for (let i = 0; i < 67; i++) cards.push(card(`Bear ${i}`, 'Creature — Bear'));
  return cards;
}

test('a modal double-faced spell with a land on the back is not a land', () => {
  const warnings = DeckValidator.validate(commanderDeck(), 'commander');
  const mana = warnings.filter(w => w.category === 'mana').map(w => w.message);
  assert.ok(
    mana.some(m => m.includes('32 lands')),
    `expected the advice to say 32 lands, got: ${JSON.stringify(mana)}`
  );
  assert.ok(
    !mana.some(m => m.includes('33 lands')),
    `the back face of an MDFC was counted as a land: ${JSON.stringify(mana)}`
  );
});

test('a land on the front face still counts, even with a spell on the back', () => {
  const cards = [] as never[];
  for (let i = 0; i < 32; i++) cards.push(card(`Forest ${i}`, 'Basic Land — Forest'));
  cards.push(card('Zanarkand // Lasting Fayth', 'Land — Town // Sorcery — Adventure'));
  for (let i = 0; i < 67; i++) cards.push(card(`Bear ${i}`, 'Creature — Bear'));

  const mana = DeckValidator.validate(cards, 'commander')
    .filter(w => w.category === 'mana')
    .map(w => w.message);
  assert.ok(
    mana.some(m => m.includes('33 lands')),
    `an adventure land should still be a land: ${JSON.stringify(mana)}`
  );
});

test('the curve is measured over the spells, MDFC spells included', () => {
  /* An MDFC counted as a land dropped out of `nonLands` and so out of the
     curve. With every spell in this deck read as a land the divisor was zero,
     every percentage was NaN, and a deck of nothing but seven-drops was told
     its curve was fine. The two curve checks only run outside Commander. */
  const cards = [] as never[];
  for (let i = 0; i < 24; i++) cards.push(card(`Island ${i}`, 'Basic Land — Island'));
  for (let i = 0; i < 36; i++) cards.push(card(`Big ${i}`, 'Sorcery // Land', { cmc: 7 }));

  const curve = DeckValidator.validate(cards, 'standard').filter(w => w.category === 'curve');
  assert.ok(
    curve.some(w => w.message === 'Curve is very top-heavy'),
    `a deck of nothing but seven-drops has a top-heavy curve: ${JSON.stringify(curve)}`
  );
});
