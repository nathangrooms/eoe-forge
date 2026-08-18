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
  /**
   * The planner's job is JUDGEMENT — which cards, and why. It is explicitly NOT
   * asked to count to 99, hit quotas, or balance a manabase, because it kept
   * getting that arithmetic wrong and the builder shipped whatever it said.
   * index.ts owns every count; this prompt says so out loud so the model does
   * not pad its answer to make numbers work.
   */
  plannerSystem:
    'You are an expert Magic: The Gathering Commander (EDH) deck architect. ' +
    'You return a card-selection blueprint as raw JSON and nothing else — no prose, ' +
    'no markdown fences, no commentary before or after the object. ' +
    'You are NOT responsible for the final card count, the mana base, or hitting exact quotas: ' +
    'a deterministic builder enforces all of that after you. ' +
    'Give it the best possible cards to choose from, named exactly as they are printed.',

  deckPlanning: (
    commander: any,
    archetype: string,
    powerLevel: number,
    budget: number,
    customPrompt: string = ''
  ) => {
  const identity = commander.color_identity?.length
    ? commander.color_identity.join('')
    : 'C (colourless)';
  const identityList = commander.color_identity?.length
    ? commander.color_identity.join(', ')
    : 'none — colourless only';

  return `
## COMMANDER
**Name:** ${commander.name}
**Type:** ${commander.type_line}
**Colour identity:** ${identity}
**Oracle text:** ${commander.oracle_text || 'None'}

## BUILD PARAMETERS
**Archetype:** ${archetype}
**Target power:** ${powerLevel}/10
- 1-3 CASUAL: fun, janky, creative. Wins turn 12+. No tutor chains, no two-card combos.
- 4-6 FOCUSED: one clear gameplan, strong synergy. Wins turn 8-11. A few tutors.
- 7-8 OPTIMIZED: efficient and consistent. Wins turn 6-8. Multiple tutors, real combos.
- 9-10 cEDH: maximum efficiency. Wins turn 3-5. Fast mana, free interaction, combo kills.
**Budget:** $${budget} for the whole deck. Do not name cards that would eat most of it on their own
unless the budget genuinely supports them.
${customPrompt ? `**Player's extra instructions (honour these):** ${customPrompt}` : ''}

## HARD RULE — COLOUR IDENTITY
Every card you name must have a colour identity that is a SUBSET of [${identityList}].
A card's colour identity includes mana symbols in its cost, in its rules text, and any colour
indicator — not just what colour it looks like. Hybrid and phyrexian symbols count too.
${commander.color_identity?.length
  ? `So: no card may require or reference any of ${['W','U','B','R','G'].filter(c => !commander.color_identity.includes(c)).join(', ') || '(nothing)'}.`
  : 'This commander is COLOURLESS: only cards with a completely empty colour identity are legal. No coloured mana symbols anywhere.'}
Any card outside this identity is silently discarded by the builder, so naming one just wastes a slot.

## HARD RULE — SINGLETON
Name each card at most once. Basic lands are the only cards that may repeat, and the builder
supplies those itself — do not list basic lands.

## WHAT THE BUILDER DOES AFTER YOU (do not duplicate this work)
The builder deterministically assembles exactly 99 cards plus the commander, to this shape:
- Lands: 35-38 total (roughly 15 nonbasic/utility, the rest basics it adds itself)
- Ramp: 10  |  Card draw: 10  |  Spot removal + wipes: 8  |  Counterspells: 4 if blue
- Creatures and flex slots: everything remaining, curved 1-6 mana
It fills any shortfall from the legal pool and trims any overflow. It will never ship a deck
that is not exactly 100 cards. Your list does not need to add up to anything.

## YOUR TASK
Name the cards that make THIS commander's ${archetype} plan work at power ${powerLevel}.
Prioritise, in order: (1) cards that directly enable or are enabled by the commander's text,
(2) the archetype's core engine pieces, (3) format-defining efficiency at this power level.
Prefer specific, real, currently-printed card names spelled exactly as on the card
(including commas and apostrophes). Never invent a card. Never name the commander itself.

Return ONLY this JSON object:

{
  "strategy": "2-3 sentences: how this deck actually wins and what its engine is",
  "winConditions": ["primary win condition", "backup 1", "backup 2"],
  "keyCards": [
    "20 card names, most important first.",
    "These are the cards the builder will lock in before anything else,",
    "so put the true engine pieces at the top and do not pad the list with generic staples",
    "— the builder already adds Sol Ring, Arcane Signet and Command Tower itself."
  ],
  "mustAvoidCards": ["cards that look synergistic here but are traps, with none named in keyCards"],
  "rampPicks": ["6-10 ramp spells that fit this colour identity and budget"],
  "drawPicks": ["6-10 card-advantage pieces that fit this commander's plan"],
  "removalPicks": ["6-10 spot removal and board wipes legal in this identity"],
  "synergies": ["the 3 interactions that matter most, one line each"],
  "curveNote": "one line on the ideal curve for this archetype",
  "warnings": ["the 2 realistic weaknesses of this build"],
  "recommendations": ["2 pieces of concrete play or upgrade advice"]
}
`;
  },

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
