/**
 * What the Mana tab counts, split out of `LandEnhancerUX.tsx`.
 *
 * It is here as a `.ts` file for one reason: `node --test` cannot strip `.tsx`,
 * and this counter is the thing on the deck page that disagreed with the rest
 * of the deck page, so it has to be runnable. `landCount.test.ts` runs it.
 */
import type { PowerDeckEntry } from '../../lib/deck/power.ts';
/* The power score's own land rule, imported rather than reimplemented. The
   panel tells the reader it uses "the same maths the power score uses"; this
   import is what makes that sentence true. */
import { isLandCard } from '../../engine/core/card.ts';

export interface LandStats {
  landCount: number;
  totalCards: number;
  tappedLands: Array<{ name: string; quantity: number }>;
  pipsByColor: Record<string, number>;
}

/**
 * How many lands, how many cards, which lands enter tapped, and how many
 * coloured pips the manabase has to support.
 */
export function analyseLands(entries: PowerDeckEntry[], identity: string[]): LandStats {
  const pipsByColor: Record<string, number> = {};
  const tapped: Array<{ name: string; quantity: number }> = [];

  let landCount = 0;
  let totalCards = 0;

  for (const color of identity) pipsByColor[color] = 0;

  for (const entry of entries) {
    const qty = Math.max(1, entry.quantity);
    totalCards += qty;

    const type = (entry.card.type_line || '').toLowerCase();
    const text = (entry.card.oracle_text || '').toLowerCase();
    const name = entry.card.name;

    // Coloured pips in the mana costs the manabase has to support.
    const cost = entry.card.mana_cost || '';
    for (const color of identity) {
      const pips = (cost.match(new RegExp(`\\{${color}\\}`, 'g')) || []).length;
      if (pips > 0) pipsByColor[color] = (pipsByColor[color] ?? 0) + pips * qty;
    }

    /*
     * FRONT FACE ONLY, and the word rather than the substring.
     *
     * `type.includes('land')` matched anywhere in the type line, including
     * after the `//` of a modal double-faced card. So
     * `Agadeem's Awakening // Agadeem, the Undercrypt` counted as a land here
     * and nowhere else. It is a black sorcery cast off its front; the land is
     * the other side.
     *
     * That one card is why this panel said a deck had 33 lands directly under
     * the sentence "by the same maths the power score uses", while the power
     * score, the type breakdown and the legality tab all said 32. Verified in
     * SQL on the real deck: 33 with the old rule, 32 with this one, and the
     * extra row is that card.
     *
     * This is `isLandCard` from `src/engine/core/card.ts`, which is the rule
     * the power score itself uses, so the sentence is now true.
     */
    if (!isLandCard(entry.card as never)) continue;
    landCount += qty;

    if (text.includes('enters the battlefield tapped') || text.includes('enters tapped')) {
      tapped.push({ name, quantity: qty });
    }
  }

  return {
    landCount,
    totalCards,
    tappedLands: tapped.sort((a, b) => b.quantity - a.quantity),
    pipsByColor,
  };
}
