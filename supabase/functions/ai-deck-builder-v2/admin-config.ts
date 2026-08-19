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

/**
 * Prompts for the deck generator.
 *
 * There is exactly one of them now, and it is a CHOOSING prompt rather than a
 * recalling prompt. The four that used to live here (`deckPlanning`,
 * `cardSelection`, `validation`, `refinement`) all asked the model to produce
 * card NAMES out of its own memory. Two of them were never called by anything.
 * The one that was — `deckPlanning` — asked for twenty names, which the builder
 * then string-matched against an arbitrary 8,000-row slice of the catalogue;
 * measured on 2026-08-19 that slice held neither Arcane Signet nor Command
 * Tower, so most of what the model named could not be found and the deck was
 * assembled by a rarity heuristic instead.
 *
 * The prompt below is handed a ranked shortlist that came out of the engine and
 * asks the model to pick from it by id. Its influence is bounded by the list,
 * so a card it invents cannot reach a player, and its judgement about which
 * real cards suit an archetype is the one thing it is genuinely better at than
 * a tag score.
 */
export const AI_PROMPTS = {
  plannerSystem:
    'You are an expert Magic: The Gathering Commander deck architect working from ' +
    'retrieved data.\n\n' +
    'The user message contains a CANDIDATE LIST fetched from a card database and ranked ' +
    'by an in-house engine. Every entry is a real card, legal in Commander, inside the ' +
    "commander's colour identity, and castable off the mana base already chosen for this " +
    'deck. Your job is to CHOOSE from that list, not to recall card names from memory.\n\n' +
    'Hard rules:\n' +
    '1. Answer only with the `id` values printed in the CANDIDATE LIST. An id that is not ' +
    'in that list is discarded before it reaches anything, so inventing one only wastes a ' +
    'slot in your own answer.\n' +
    '2. Never write a card name in `include` or `exclude`. Ids only.\n' +
    '3. You are NOT responsible for the card count, the mana base, the role quotas or the ' +
    'budget. A deterministic builder settles all of those after you, and it will ignore ' +
    'you where it must.\n' +
    '4. Return raw JSON and nothing else. No prose, no markdown fences.',

  /**
   * Choose from the ranked list.
   *
   * The list is capped by the caller and each entry carries the engine's own
   * reason for its position, so the model is choosing between measured
   * alternatives rather than being asked to invent a ranking of its own.
   */
  groundedPlan: (
    commander: { name: string; type_line?: string | null; oracle_text?: string | null; color_identity?: string[] | null },
    archetype: string,
    powerLevel: number,
    customPrompt: string,
    shortlist: Array<{
      oracleId: string;
      name: string;
      typeLine: string;
      cmc: number;
      manaCost: string | null;
      tags: string[];
      usd: number | null;
      reason: string;
    }>
  ) => {
    const identity = commander.color_identity?.length
      ? commander.color_identity.join('')
      : 'colourless';

    const rows = shortlist
      .map(
        c =>
          `- id=${c.oracleId} | ${c.name} | ${c.typeLine} | ${c.manaCost ?? 'no cost'} (mv ${c.cmc}) | ` +
          `tags: ${c.tags.join(', ') || 'none'} | ${c.usd === null ? 'unpriced' : '$' + c.usd.toFixed(2)} | ${c.reason}`
      )
      .join('\n');

    return `## COMMANDER
${commander.name} — ${commander.type_line ?? ''} — colour identity ${identity}
${commander.oracle_text ?? 'No rules text'}

## WHAT THE PLAYER ASKED FOR
Archetype: ${archetype || 'not specified'}
Target power: ${powerLevel}/10
- 1-3 casual: fun and creative, no tutor chains, no two-card combos
- 4-6 focused: one clear plan, strong synergy, a few tutors
- 7-8 optimised: efficient and consistent, real combos
- 9-10 cEDH: fast mana, free interaction, combo kills
${customPrompt ? `Extra instructions from the player: ${customPrompt}` : ''}

## CANDIDATE LIST (${shortlist.length} cards, ranked best first)
${rows}

## YOUR TASK
Pick the cards from that list that make this commander's ${archetype || 'chosen'} plan work
at power ${powerLevel}. Favour, in order: cards the commander's own text enables or is
enabled by, the archetype's engine pieces, then general efficiency at this power level.

Put in \`exclude\` any card from the list that looks synergistic here but is a trap for
this specific deck, so the builder can pass over it.

Return ONLY this JSON object, with ids copied verbatim from the list above:

{
  "strategy": "2-3 sentences: how this deck wins and what its engine is",
  "winConditions": ["primary", "backup", "backup"],
  "include": ["id", "id", "..."],
  "exclude": ["id", "..."],
  "warnings": ["the 2 realistic weaknesses of this build"]
}
`;
  },
};
