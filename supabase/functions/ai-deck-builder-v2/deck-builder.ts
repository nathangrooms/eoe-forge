// Deck builder logic for V2
// This imports and wraps the UniversalDeckBuilder with enhanced AI-guided selection

import { UniversalDeckBuilder } from '../../../src/lib/deckbuilder/build.ts';
import { Card, BuildContext, BuildResult } from '../../../src/lib/deckbuilder/types.ts';

export function buildDeck(
  cardPool: Card[],
  format: string,
  archetype: string,
  powerLevel: number = 6,
  colors?: string[],
  seed?: number
): BuildResult {
  const builder = new UniversalDeckBuilder(seed);
  
  const context: BuildContext = {
    format,
    themeId: archetype,
    powerTarget: powerLevel,
    colors,
    budget: 'med',
    seed: seed || Date.now()
  };
  
  return builder.buildDeck(cardPool, context);
}
