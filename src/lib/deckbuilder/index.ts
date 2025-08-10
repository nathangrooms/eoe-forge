// Main export for the universal deck builder system
export { UniversalDeckBuilder } from './build';
export { UniversalTagger } from './tagger/universal-tagger';
export { UniversalScorer } from './score/universal-scorer';
export { ManabaseBuilder } from './land/manabase-builder';
export { getFormatRules, isLegalCommander, isLegalInFormat } from './rules/formats';
export { getTemplate, getTemplatesForFormat } from './templates/base-templates';
export * from './types';

// Quick build function for easy integration
import { UniversalDeckBuilder } from './build';
import { Card, BuildContext, BuildResult } from './types';

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