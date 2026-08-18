import { Card } from '../types';
import { BuildContext, DeckAnalysis } from '../types';
import { computeDeckPower, type PowerDeckEntry } from '@/lib/deck/power';

/**
 * Adapter, not a model.
 *
 * `UniversalScorer` used to be a second, independent 1–10 scoring model living
 * beside `EDHPowerCalculator`. It was later half-converted into a wrapper, and
 * the conversion left three real defects behind:
 *
 * 1. it passed `undefined` for the commander with the comment "context doesn't
 *    have this", so colour identity, commander synergy and legality all scored
 *    against no commander at all;
 * 2. it mapped `stax_pressure` into a field named `wincon`, so resource-denial
 *    pressure was displayed under a "win condition" label;
 * 3. roughly 130 lines of the old independent model — `scoreSpeed`,
 *    `scoreInteraction`, `scoreTutors`, `scoreWincons`, `scoreManabase`,
 *    `scoreConsistency` — were unreachable and still read as if they described
 *    how the app scores decks.
 *
 * All three are gone. This file now does exactly one thing: shape the deck
 * builder's internal `DeckAnalysis` from the canonical {@link computeDeckPower}
 * result. There is no second scoring implementation left in the codebase.
 */
export class UniversalScorer {
  static scoreDeck(deck: Card[], context: BuildContext, commander?: Card): DeckAnalysis {
    const entries: PowerDeckEntry[] = deck.map(card => ({ card, quantity: 1 }));
    if (commander) entries.unshift({ card: commander, quantity: 1, isCommander: true });

    const power = computeDeckPower(entries, {
      format: context.format,
      commander,
    });

    // Subscores are canonical on 0–100; rescaled once here to the 0–10 the
    // builder's own heuristics expect, rather than at each read site.
    const toTen = (value: number) => Math.round(value) / 10;

    return {
      power: power?.score ?? 1,
      subscores: {
        speed: toTen(power?.subscores.speed ?? 0),
        interaction: toTen(power?.subscores.interaction ?? 0),
        tutors: toTen(power?.subscores.tutors ?? 0),
        // Named for what it is. `wincon` in this interface has always been read
        // as "how well the deck closes"; synergy is the closest honest proxy the
        // engine produces. Stax pressure — which used to be piped in here — is
        // the opposite of a win condition.
        wincon: toTen(power?.subscores.synergy ?? 0),
        mana: toTen(power?.subscores.mana ?? 0),
        consistency: toTen(power?.subscores.consistency ?? 0),
      },
      curve: this.analyzeCurve(deck),
      colorDistribution: this.analyzeColorDistribution(deck),
      tags: this.analyzeTagDistribution(deck),
    };
  }

  private static analyzeCurve(deck: Card[]): Record<string, number> {
    const curve: Record<string, number> = {
      '0': 0,
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
      '6': 0,
      '7+': 0,
    };

    deck
      .filter(c => !c.type_line.includes('Land'))
      .forEach(card => {
        const cmc = card.cmc;
        if (cmc <= 6) {
          curve[cmc.toString()]++;
        } else {
          curve['7+']++;
        }
      });

    return curve;
  }

  private static analyzeColorDistribution(deck: Card[]): Record<string, number> {
    const colors: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

    deck.forEach(card => {
      if (card.colors.length === 0) {
        colors['C']++;
      } else {
        card.colors.forEach(color => {
          colors[color] = (colors[color] || 0) + 1;
        });
      }
    });

    return colors;
  }

  private static analyzeTagDistribution(deck: Card[]): Record<string, number> {
    const tagCounts: Record<string, number> = {};

    deck.forEach(card => {
      card.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.fromEntries(
      Object.entries(tagCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
    );
  }
}
