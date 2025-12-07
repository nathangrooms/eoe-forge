// Admin configuration for AI Deck Builder
// These settings can be modified by admins to tune the deck building process

export interface AdminConfig {
  // Build iteration settings
  maxBuildIterations: number;  // Maximum rebuild attempts
  powerLevelTolerance: number; // +/- tolerance for power level (e.g., 1.5 means target 7 accepts 5.5-8.5)
  budgetTolerance: number;     // Percentage tolerance for budget (0.2 = 20%)
  
  // Card selection settings
  minLandCount: number;
  maxLandCount: number;
  minRampCount: number;
  minDrawCount: number;
  minRemovalCount: number;
  
  // Quality thresholds
  minCardPrice: number;        // Minimum card price to include (filter bulk)
  preferRareCards: boolean;    // Weight rares/mythics higher
  
  // AI settings
  useAIValidation: boolean;    // Run AI validation after build
  aiValidationModel: string;   // Model to use for validation
  
  // Singleton enforcement
  strictSingleton: boolean;    // Strictly enforce singleton rule
  
  // Logging
  verboseLogging: boolean;
}

export const DEFAULT_CONFIG: AdminConfig = {
  // Build settings - allow 5 iterations with 20% tolerance
  maxBuildIterations: 5,
  powerLevelTolerance: 1.5,
  budgetTolerance: 0.20, // 20%
  
  // Card quotas
  minLandCount: 35,
  maxLandCount: 38,
  minRampCount: 10,
  minDrawCount: 10,
  minRemovalCount: 8,
  
  // Quality
  minCardPrice: 0.10, // Filter cards under $0.10
  preferRareCards: true,
  
  // AI
  useAIValidation: true,
  aiValidationModel: 'google/gemini-2.5-flash',
  
  // Rules
  strictSingleton: true,
  
  // Debug
  verboseLogging: true
};

// Get config from environment or use defaults
export function getAdminConfig(): AdminConfig {
  try {
    const envConfig = Deno.env.get('AI_BUILDER_CONFIG');
    if (envConfig) {
      const parsed = JSON.parse(envConfig);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.log('Using default admin config');
  }
  return DEFAULT_CONFIG;
}

// AI Prompts - detailed prompts for deck building stages
export const AI_PROMPTS = {
  deckPlanning: (commander: any, archetype: string, powerLevel: number, budget: number) => `
You are an expert Magic: The Gathering Commander deck architect with deep knowledge of EDH meta, synergies, and card interactions.

## COMMANDER ANALYSIS
**Name:** ${commander.name}
**Type:** ${commander.type_line}
**Color Identity:** ${commander.color_identity?.join(', ') || 'Colorless'}
**Abilities:** ${commander.oracle_text || 'None'}

## BUILD PARAMETERS
**Archetype:** ${archetype}
**Target Power Level:** ${powerLevel}/10
- Power 1-3: CASUAL - Fun, janky, creative builds. Win on turn 12+. Minimal tutors/combos.
- Power 4-6: FOCUSED - Clear gameplan, good synergy. Win on turn 8-11. Some tutors.
- Power 7-8: OPTIMIZED - Efficient, consistent. Win on turn 6-8. Multiple tutors, strong combos.
- Power 9-10: cEDH - Maximum efficiency. Win on turn 3-5. Fast mana, free counters, combo kills.
**Budget:** $${budget}

## CRITICAL RULES - COMMANDER FORMAT
1. **SINGLETON**: Every card except basic lands must be UNIQUE. NO DUPLICATES.
2. **COLOR IDENTITY**: Every card's color identity must be within [${commander.color_identity?.join(', ') || 'Colorless'}]. Cards with mana symbols or color indicators outside this identity are ILLEGAL.
3. **EXACTLY 99 CARDS**: The deck must have exactly 99 cards (commander is separate, making 100 total).

## CARD QUOTAS (adjust for archetype)
- **Lands:** 35-38 (more for landfall/lands-matter, less for fast mana builds)
- **Ramp:** 10-14 cards (Sol Ring, signets, land ramp, mana dorks)
- **Card Draw:** 10-15 cards (card advantage is king in EDH)
- **Spot Removal:** 8-12 cards (Beast Within, Swords to Plowshares, etc.)
- **Board Wipes:** 3-5 cards (Wrath of God, Damnation, Cyclonic Rift)
- **Protection:** 3-6 cards (Lightning Greaves, counterspells for combo protection)
- **Win Conditions:** 3-5 cards (how does this deck win?)

## YOUR TASK
Create a comprehensive deck building blueprint. Return ONLY valid JSON (no markdown):

{
  "strategy": "2-3 sentence summary of how this deck wins and its core gameplan",
  "winConditions": ["Primary win con", "Backup win con 1", "Backup win con 2"],
  "keyCards": ["Card Name 1", "Card Name 2", ...15-20 essential cards for this strategy],
  "mustAvoidCards": ["Cards that don't fit despite seeming synergistic"],
  "cardQuotas": {
    "ramp": {"min": 10, "max": 14},
    "card_draw": {"min": 10, "max": 15},
    "spot_removal": {"min": 8, "max": 12},
    "board_wipes": {"min": 3, "max": 5},
    "counterspells": {"min": 0, "max": 6},
    "protection": {"min": 3, "max": 6},
    "wincons": {"min": 3, "max": 5}
  },
  "synergies": ["key synergy 1", "key synergy 2", "key synergy 3"],
  "colorWeights": {"W": 0.3, "U": 0.2, ...percentage of deck in each color},
  "cmc_distribution": "Describe ideal mana curve for this archetype",
  "warnings": ["Weakness 1", "Weakness 2"],
  "recommendations": ["Specific strategic advice 1", "Advice 2"]
}
`,

  cardSelection: (commander: any, archetype: string, powerLevel: number, role: string, count: number) => `
You are selecting ${count} ${role} cards for a ${archetype} Commander deck.

**Commander:** ${commander.name} (${commander.color_identity?.join('')})
**Power Level:** ${powerLevel}/10

CRITICAL REQUIREMENTS:
1. ALL cards must have color identity within [${commander.color_identity?.join(', ')}]
2. NO duplicate card names - each card must be unique
3. Prioritize cards that synergize with the commander's abilities
4. For power ${powerLevel}:
   ${powerLevel >= 7 ? '- Include efficient, competitive staples' : ''}
   ${powerLevel <= 4 ? '- Include fun, flavorful cards over pure efficiency' : ''}
   ${powerLevel >= 5 && powerLevel <= 6 ? '- Balance efficiency with interesting synergies' : ''}

Return a JSON array of exactly ${count} card names:
["Card Name 1", "Card Name 2", ...]
`,

  validation: (deck: any[], commander: any, powerLevel: number) => `
Review this ${commander.name} Commander deck for quality and legality.

**Commander:** ${commander.name}
**Color Identity:** ${commander.color_identity?.join('')}
**Target Power:** ${powerLevel}/10
**Card Count:** ${deck.length}

VALIDATE:
1. All cards legal in Commander format?
2. All cards within color identity [${commander.color_identity?.join(', ')}]?
3. No duplicate non-basic-lands?
4. Exactly 99 cards (excluding commander)?
5. Sufficient ramp (10+), draw (10+), removal (8+)?
6. Clear win conditions present?
7. Power level appropriate for target ${powerLevel}?

Respond with brief assessment (2-3 sentences) and list any issues.
`,

  refinement: (issues: string[], cardsToReplace: string[], archetype: string, powerLevel: number) => `
The current deck has these issues:
${issues.map(i => `- ${i}`).join('\n')}

Cards to replace:
${cardsToReplace.map(c => `- ${c}`).join('\n')}

Suggest replacement cards that:
1. Fix the identified issues
2. Fit the ${archetype} archetype
3. Match power level ${powerLevel}/10
4. Are unique (not already in deck)

Return JSON array of replacement card names:
["Card Name 1", "Card Name 2", ...]
`
};
