/**
 * One deck, one land count.
 *
 * The deck page's Mana tab said a deck had 33 lands, directly under the words
 * "Measured from this decklist, by the same maths the power score uses". The
 * power score, the type breakdown and the legality tab all said 32, on the same
 * screen. Verified in SQL against the real deck: `type_line ILIKE '%Land%'`
 * returns 33, front-face-only returns 32, and the extra row is
 * `Agadeem's Awakening // Agadeem, the Undercrypt`, a black sorcery whose BACK
 * face is a land.
 *
 * The deck page needs an account, so this is how the claim is checked: by
 * running the panel's own counter and the engine's own rule against the same
 * card and asserting they agree.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { analyseLands } from './landStats.ts';
import { isLandCard } from '../../engine/core/card.ts';

function entry(name: string, type_line: string, quantity = 1, mana_cost = '') {
  return {
    card: { name, type_line, mana_cost, cmc: 0, oracle_text: '', color_identity: ['B'] },
    quantity,
  } as never;
}

/** The card that caused the disagreement. Its front is a sorcery. */
const MDFC = entry(
  "Agadeem's Awakening // Agadeem, the Undercrypt",
  'Sorcery // Land',
  1,
  '{X}{B}{B}{B}'
);

describe('the mana tab counts lands the way the power score does', () => {
  it('the engine does not treat a sorcery with a land on the back as a land', () => {
    assert.equal(
      isLandCard({
        name: "Agadeem's Awakening // Agadeem, the Undercrypt",
        type_line: 'Sorcery // Land',
        cmc: 6,
      } as never),
      false
    );
  });

  it('and neither does the panel', () => {
    const stats = analyseLands([entry('Swamp', 'Basic Land — Swamp', 32), MDFC], ['B']);
    assert.equal(
      stats.landCount,
      32,
      `counted ${stats.landCount}: the same off-by-one that made this panel say 33 while ` +
        `every other surface on the deck page said 32`
    );
  });

  it('a real land is still counted, and quantity still multiplies', () => {
    const stats = analyseLands(
      [entry('Swamp', 'Basic Land — Swamp', 32), MDFC, entry('Command Tower', 'Land', 1)],
      ['B']
    );
    assert.equal(stats.landCount, 33);
  });

  it('the word has to be the word, not a substring of another one', () => {
    const stats = analyseLands(
      [entry('Islandwalker', 'Creature — Merfolk', 1), entry('Plains', 'Basic Land — Plains', 1)],
      ['W']
    );
    assert.equal(stats.landCount, 1);
  });

  it('the two rules agree on every shape that has ever caused trouble', () => {
    const cases: Array<[string, boolean]> = [
      ['Basic Land — Swamp', true],
      ['Land', true],
      ['Land — Gate', true],
      ['Artifact Land', true],
      ['Legendary Land', true],
      ['Sorcery // Land', false],
      ['Creature — Merfolk', false],
      ['Instant', false],
      ['Enchantment — Aura', false],
    ];
    for (const [type_line, expected] of cases) {
      const stats = analyseLands([entry('X', type_line, 1)], ['B']);
      assert.equal(
        stats.landCount === 1,
        expected,
        `the panel disagrees with the engine about "${type_line}"`
      );
      assert.equal(
        isLandCard({ name: 'X', type_line, cmc: 0 } as never),
        expected,
        `the engine's own rule changed for "${type_line}"`
      );
    }
  });
});
