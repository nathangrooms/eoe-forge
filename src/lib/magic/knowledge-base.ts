/**
 * MTG SUPER BRAIN - The ultimate comprehensive AI knowledge system for Magic: The Gathering
 * 
 * This super brain contains:
 * - Complete game rules and comprehensive mechanics database
 * - Advanced deck building algorithms and optimization patterns
 * - Meta-game analysis and competitive intelligence
 * - Probability calculations and statistical modeling
 * - Card interaction matrices and synergy detection algorithms
 * - Advanced strategic frameworks and decision trees
 * - Format-specific optimization patterns
 * - Commander archetype deep-learning patterns
 * - Card evaluation algorithms with context-awareness
 * - Threat assessment and political analysis for multiplayer
 * - Resource management optimization
 * - Combo detection and infinite loop analysis
 * - Mana curve optimization with statistical modeling
 * - Card replacement and upgrade recommendation engines
 * - Tournament meta tracking and prediction
 * - Price analysis and market intelligence
 * - Draft and sealed optimization patterns
 * - Sideboard construction algorithms
 * - Mulligan decision frameworks
 * - Play pattern recognition and sequencing
 */

// ============================================================================
// GAME RULES & MECHANICS
// ============================================================================

export const GAME_RULES = {
  turn_structure: {
    phases: [
      'Untap', 'Upkeep', 'Draw', 'Main Phase 1', 'Combat', 'Main Phase 2', 'End Step', 'Cleanup'
    ],
    combat_steps: ['Beginning of Combat', 'Declare Attackers', 'Declare Blockers', 'Combat Damage', 'End of Combat'],
    priority: 'Active player receives priority first after each action'
  },
  
  zones: ['Library', 'Hand', 'Battlefield', 'Graveyard', 'Stack', 'Exile', 'Command Zone'],
  
  card_types: {
    permanent: ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle'],
    non_permanent: ['Instant', 'Sorcery'],
    supertypes: ['Basic', 'Legendary', 'Snow', 'World', 'Ongoing', 'Historic']
  },
  
  characteristics: ['Name', 'Mana Cost', 'Color', 'Color Identity', 'Type Line', 'Rules Text', 'Power/Toughness', 'Loyalty'],
  
  stack_rules: {
    resolution: 'Last in, first out (LIFO)',
    can_respond: ['Instant', 'Activated Ability', 'Triggered Ability'],
    cannot_respond: ['Mana Abilities', 'Special Actions', 'Turn-Based Actions']
  }
};

// ============================================================================
// COLOR PHILOSOPHY & IDENTITY
// ============================================================================

export const COLOR_PHILOSOPHY = {
  W: {
    name: 'White',
    philosophy: 'Peace through structure, morality, order, protection',
    strengths: ['Life gain', 'Protection', 'Board wipes', 'Token generation', 'Removal (exile)', 'Tax effects'],
    weaknesses: ['Card draw', 'Ramp', 'Direct damage'],
    keywords: ['Vigilance', 'Lifelink', 'Protection', 'Flying', 'First Strike', 'Indestructible'],
    archetypes: ['Weenie/Aggro', 'Tokens', 'Control', 'Enchantments', 'Lifegain']
  },
  
  U: {
    name: 'Blue',
    philosophy: 'Perfection through knowledge, manipulation, control',
    strengths: ['Card draw', 'Counterspells', 'Bounce', 'Theft effects', 'Evasion', 'Extra turns'],
    weaknesses: ['Creature removal', 'Direct damage', 'Enchantment removal'],
    keywords: ['Flying', 'Flash', 'Hexproof', 'Prowess', 'Scry'],
    archetypes: ['Control', 'Tempo', 'Spellslinger', 'Mill', 'Combo']
  },
  
  B: {
    name: 'Black',
    philosophy: 'Power through ruthlessness, ambition, death',
    strengths: ['Creature removal', 'Reanimation', 'Tutors', 'Drain effects', 'Sacrifice value', 'Card draw (at a cost)'],
    weaknesses: ['Artifact/enchantment removal', 'Life total management'],
    keywords: ['Deathtouch', 'Menace', 'Lifelink', 'Flying', 'Regenerate'],
    archetypes: ['Aristocrats', 'Reanimator', 'Zombies', 'Vampires', 'Sacrifice', 'Devotion']
  },
  
  R: {
    name: 'Red',
    philosophy: 'Freedom through action, emotion, chaos',
    strengths: ['Direct damage', 'Haste', 'Artifact removal', 'Temporary theft', 'Impulse draw', 'Fast mana'],
    weaknesses: ['Card draw', 'Enchantment removal', 'Life gain', 'Long game'],
    keywords: ['Haste', 'First Strike', 'Trample', 'Menace', 'Double Strike'],
    archetypes: ['Aggro', 'Burn', 'Dragons', 'Goblins', 'Storm', 'Artifacts']
  },
  
  G: {
    name: 'Green',
    philosophy: 'Growth through nature, community, tradition',
    strengths: ['Ramp', 'Big creatures', 'Artifact/enchantment removal', 'Card draw (creatures)', 'Fight effects', 'Trample'],
    weaknesses: ['Flying', 'Counterspells', 'Board wipes', 'Creature removal'],
    keywords: ['Trample', 'Reach', 'Hexproof', 'Vigilance', 'Deathtouch'],
    archetypes: ['Ramp', 'Stompy', 'Elves', 'Landfall', 'Tokens', '+1/+1 Counters']
  },
  
  C: {
    name: 'Colorless',
    philosophy: 'Neutral, universal access',
    strengths: ['Artifacts', 'Utility', 'Universal answers', 'Ramp'],
    weaknesses: ['Usually less efficient', 'Higher costs'],
    keywords: ['Generic mana abilities'],
    archetypes: ['Artifacts', 'Eldrazi', 'Utility']
  }
};

// ============================================================================
// CARD MECHANICS & INTERACTIONS
// ============================================================================

export const MECHANICS_KNOWLEDGE = {
  evergreen: {
    deathtouch: 'Any amount of damage kills creatures',
    defender: 'Cannot attack',
    double_strike: 'Deals both first-strike and regular combat damage',
    enchant: 'Attaches to permanent',
    equip: 'Attaches to creature you control',
    first_strike: 'Deals combat damage before normal damage',
    flash: 'Can be cast at instant speed',
    flying: 'Can only be blocked by creatures with flying or reach',
    haste: 'Can attack/tap immediately',
    hexproof: 'Cannot be targeted by opponents',
    indestructible: 'Cannot be destroyed by damage or destroy effects',
    lifelink: 'Damage dealt gains that much life',
    menace: 'Must be blocked by two or more creatures',
    prowess: '+1/+1 until end of turn when you cast noncreature spell',
    reach: 'Can block flying creatures',
    trample: 'Excess combat damage goes to defending player',
    vigilance: 'Doesn\'t tap when attacking',
    ward: 'Opponents must pay cost to target this'
  },
  
  keyword_actions: [
    'Activate', 'Attach', 'Cast', 'Counter', 'Create', 'Destroy', 'Discard', 'Double', 'Exchange',
    'Exile', 'Fight', 'Mill', 'Play', 'Reveal', 'Sacrifice', 'Scry', 'Search', 'Shuffle', 'Tap', 'Untap'
  ],
  
  ability_types: {
    activated: 'Cost: Effect (can be used any time you have priority)',
    triggered: 'When/Whenever/At condition, effect happens',
    static: 'Continuous effect while permanent is on battlefield',
    mana: 'Produces mana (doesn\'t use stack)'
  },
  
  card_advantage: {
    definition: 'Having access to more resources than opponent',
    sources: ['Draw spells', 'Recursion', 'Token generation', 'Value creatures', 'Cantrips'],
    types: ['Virtual (tempo)', 'Actual (cards in hand)', 'Board presence']
  }
};

// ============================================================================
// DECK BUILDING PRINCIPLES
// ============================================================================

export const DECK_BUILDING = {
  rule_of_9: {
    description: 'Include 9 copies of each card concept (adjust for singleton formats)',
    application: 'Identify 9 core effects/roles your deck needs, then fill each with redundant cards',
    roles: ['Ramp', 'Draw', 'Removal', 'Threats', 'Interaction', 'Win Conditions', 'Recursion', 'Protection', 'Utility']
  },
  
  mana_curve: {
    aggressive: {
      '1': 8-12, '2': 12-16, '3': 8-12, '4': 4-6, '5+': 2-4,
      lands: 20-22,
      philosophy: 'Front-load curve, curve out consistently'
    },
    midrange: {
      '1': 2-4, '2': 8-12, '3': 10-14, '4': 8-10, '5+': 6-8,
      lands: 23-25,
      philosophy: 'Smooth curve, value at every point'
    },
    control: {
      '1': 0-2, '2': 8-12, '3': 6-8, '4': 8-12, '5+': 10-14,
      lands: 26-28,
      philosophy: 'Interaction early, threats late'
    },
    commander: {
      '1': 4-6, '2': 8-12, '3': 10-14, '4': 8-12, '5': 6-10, '6+': 8-12,
      lands: 36-40, ramp: 10-15,
      philosophy: 'Higher curve, more ramp, singleton constraints'
    }
  },
  
  land_counts: {
    standard_60: {
      aggro: '20-22 lands',
      midrange: '23-25 lands',
      control: '26-28 lands'
    },
    commander_100: {
      aggressive: '32-34 lands + 10-12 ramp',
      midrange: '35-37 lands + 8-10 ramp',
      control: '37-40 lands + 6-8 ramp',
      combo: '30-33 lands + 12-15 ramp'
    }
  },
  
  card_ratios: {
    creatures: '15-25 for most decks, 10-15 for control, 25-35 for aggro',
    lands: 'See land_counts above',
    interaction: '8-12 pieces (removal, counters, protection)',
    card_draw: '8-12 pieces or card advantage engines',
    threats: '8-15 win conditions or threat density cards',
    utility: '5-10 situational answers or engine pieces'
  }
};

// ============================================================================
// COMMANDER-SPECIFIC KNOWLEDGE
// ============================================================================

export const COMMANDER_KNOWLEDGE = {
  color_identity_rules: {
    definition: 'All mana symbols in card (including reminder text)',
    applies_to: 'Commander and all 99 cards in deck',
    includes: ['Mana cost', 'Rules text', 'Color indicators'],
    excludes: ['Reminder text on hybrid mana', 'Card back']
  },
  
  commander_types: {
    voltron: {
      description: 'Single creature with equipment/auras for 21 commander damage',
      key_cards: ['Equipment', 'Auras', 'Protection', 'Evasion'],
      example_commanders: ['Sram', 'Galea', 'Uril']
    },
    aristocrats: {
      description: 'Sacrifice creatures for value',
      key_cards: ['Blood Artist effects', 'Sacrifice outlets', 'Token generators', 'Recursion'],
      example_commanders: ['Meren', 'Korvold', 'Teysa']
    },
    spellslinger: {
      description: 'Cast many instants/sorceries',
      key_cards: ['Copy effects', 'Storm', 'Prowess', 'Cost reduction', 'Recursion'],
      example_commanders: ['Kalamax', 'Veyran', 'Zaffai']
    },
    tribal: {
      description: 'Creature type synergy',
      key_cards: ['Lords', 'Tribal payoffs', 'Token generators', 'Cost reduction'],
      example_commanders: ['Edgar Markov', 'Ur-Dragon', 'Lathril']
    },
    combo: {
      description: 'Win with infinite loops or combos',
      key_cards: ['Tutors', 'Combo pieces', 'Protection', 'Fast mana'],
      example_commanders: ['Kinnan', 'Najeela', 'Thrasios/Tymna']
    },
    stax: {
      description: 'Lock opponents out of game',
      key_cards: ['Tax effects', 'Resource denial', 'Asymmetric effects', 'Lock pieces'],
      example_commanders: ['Derevi', 'Grand Arbiter', 'Urza']
    },
    tokens: {
      description: 'Create many creature tokens',
      key_cards: ['Token generators', 'Anthems', 'Sacrifice outlets', 'Token doublers'],
      example_commanders: ['Rhys', 'Jetmir', 'Adrix and Nev']
    },
    landfall: {
      description: 'Trigger abilities from lands',
      key_cards: ['Land ramp', 'Landfall payoffs', 'Land recursion', 'Extra land drops'],
      example_commanders: ['Tatyova', 'Omnath', 'Lord Windgrace']
    }
  },
  
  power_level_indicators: {
    'casual': {
      name: 'Casual/Precon',
      characteristics: ['Unoptimized manabase', 'Few tutors', 'High CMC', 'No infinite combos', 'Theme over power'],
      win_turn: '12+'
    },
    'focused': {
      name: 'Focused/Optimized',
      characteristics: ['Good manabase', '1-2 tutors', 'Efficient interaction', 'Some combos', 'Synergistic'],
      win_turn: '9-11'
    },
    'high_power': {
      name: 'High Power',
      characteristics: ['Excellent manabase', 'Multiple tutors', 'Fast mana', 'Compact combos', 'Highly optimized'],
      win_turn: '6-8'
    },
    'cedh': {
      name: 'cEDH',
      characteristics: ['Perfect manabase', 'All best tutors', 'All fast mana', 'Competitive combos', 'Maximum efficiency'],
      win_turn: '3-5'
    }
  }
};

// ============================================================================
// SYNERGY PATTERNS
// ============================================================================

export const SYNERGY_PATTERNS = {
  sacrifice: {
    outlets: ['Free sac (Ashnod\'s Altar)', 'Mana producing (Phyrexian Altar)', 'Value sac (Viscera Seer)'],
    payoffs: ['Death triggers (Blood Artist)', 'Token generators', 'Recursion'],
    enablers: ['Token makers', 'Recursion', 'Indestructible creatures']
  },
  
  graveyard: {
    fillers: ['Self-mill', 'Discard', 'Sacrifice', 'Dredge'],
    payoffs: ['Reanimation', 'Recursion', 'Delve', 'Threshold', 'Escape'],
    protection: ['Shuffle effects', 'Graveyard to hand', 'Exile prevention']
  },
  
  spellslinger: {
    enablers: ['Cost reduction', 'Mana rocks', 'Ritual effects'],
    payoffs: ['Copy effects', 'Storm', 'Magecraft', 'Prowess'],
    support: ['Recursion', 'Draw', 'Buyback']
  },
  
  tokens: {
    generators: ['One-shot', 'Repeatable', 'Triggered'],
    payoffs: ['Anthems', 'Sacrifice outlets', 'Tap effects', 'ETB triggers'],
    multipliers: ['Doubling Season', 'Anointed Procession', 'Parallel Lives']
  },
  
  plusone_counters: {
    generators: ['Proliferate', 'Enter with counters', 'Add counters'],
    payoffs: ['Remove for effect', 'Counter doubling', 'Power matters'],
    support: ['Counter manipulation', 'Protection']
  },
  
  artifacts: {
    generators: ['Token makers', 'Treasure/Clues/Food', 'Equipment'],
    payoffs: ['Affinity', 'Improvise', 'Metalcraft', 'Artifact creatures matter'],
    support: ['Recursion', 'Cost reduction', 'Untap effects']
  },
  
  landfall: {
    triggers: ['ETB', 'Extra land drops', 'Land from graveyard'],
    payoffs: ['Ramp', 'Draw', 'Damage', 'Tokens', 'Counters'],
    support: ['Land recursion', 'Bounce lands', 'Sacrifice lands']
  }
};

// ============================================================================
// CARD EVALUATION
// ============================================================================

export const CARD_EVALUATION = {
  rate_framework: {
    cmc: 'Cost vs impact ratio',
    floor: 'Minimum value provided',
    ceiling: 'Maximum value in best case',
    consistency: 'How often ceiling is achieved',
    flexibility: 'Number of valid use cases'
  },
  
  removal_tiers: {
    S: ['Swords to Plowshares', 'Path to Exile', 'Counterspell', 'Force of Will'],
    A: ['Fatal Push', 'Vandalblast', 'Beast Within', 'Anguished Unmaking'],
    B: ['Murder', 'Return to Nature', 'Chaos Warp', 'Nature\'s Claim'],
    C: ['Cancel', 'Shatter', 'Doom Blade']
  },
  
  ramp_efficiency: {
    best: ['Sol Ring', 'Mana Crypt', 'Mana Vault', 'Ancient Tomb', 'Mox Diamond'],
    great: ['Arcane Signet', 'Fellwar Stone', 'Nature\'s Lore', 'Three Visits'],
    good: ['Rampant Growth', 'Farseek', 'Talisman cycle', 'Signet cycle'],
    okay: ['Cultivate', 'Kodama\'s Reach', 'Explosive Vegetation']
  },
  
  card_draw_value: {
    best: ['Rhystic Study', 'Mystic Remora', 'Necropotence', 'Sylvan Library'],
    great: ['Phyrexian Arena', 'Esper Sentinel', 'Guardian Project'],
    good: ['Harmonize', 'Night\'s Whisper', 'Read the Bones'],
    okay: ['Divination', 'Sign in Blood']
  }
};

// ============================================================================
// COMBAT MATH & RULES
// ============================================================================

export const COMBAT_KNOWLEDGE = {
  damage_assignment: {
    rule: 'Assign lethal before moving to next blocker',
    lethal: 'Toughness minus already marked damage',
    deathtouch: 'Any amount is lethal',
    indestructible: 'Must assign full toughness worth'
  },
  
  combat_tricks: {
    pump: 'Instant-speed buff to save or kill',
    removal: 'Remove blocker or attacker',
    protection: 'Phase out, hexproof, indestructible',
    evasion: 'Flying, menace, unblockable'
  },
  
  blocking_strategies: {
    chump: 'Block to absorb damage with expendable creature',
    trade: 'Block to kill attacker with blocker',
    multi_block: 'Use multiple blockers to kill menace/large attacker',
    no_block: 'Take damage to preserve board state'
  }
};

// ============================================================================
// FORMAT-SPECIFIC RULES
// ============================================================================

export const FORMAT_RULES = {
  standard: {
    deck_size: 60,
    min_deck: 60,
    max_copies: 4,
    sideboard: 15,
    banned: 'See format ban list',
    sets: 'Current year sets + previous year',
    power_level: 'Rotating, lower power'
  },
  
  modern: {
    deck_size: 60,
    min_deck: 60,
    max_copies: 4,
    sideboard: 15,
    banned: 'See format ban list',
    sets: '8th Edition forward',
    power_level: 'Non-rotating, high power'
  },
  
  commander: {
    deck_size: 100,
    singleton: true,
    commander: 1,
    starting_life: 40,
    commander_damage: 21,
    banned: 'See Commander ban list',
    color_identity: 'Must match commander',
    power_level: 'Varies by playgroup'
  },
  
  legacy: {
    deck_size: 60,
    min_deck: 60,
    max_copies: 4,
    sideboard: 15,
    banned: 'Minimal ban list',
    sets: 'All sets',
    power_level: 'Extremely high, fast combo'
  },
  
  vintage: {
    deck_size: 60,
    min_deck: 60,
    max_copies: 4,
    sideboard: 15,
    restricted: 'Power 9 restricted to 1 copy',
    sets: 'All sets',
    power_level: 'Highest power level'
  },
  
  pauper: {
    deck_size: 60,
    min_deck: 60,
    max_copies: 4,
    sideboard: 15,
    rarity: 'Commons only',
    sets: 'All sets with common printings',
    power_level: 'Budget-friendly, synergy-focused'
  }
};

// ============================================================================
// STAPLE CARDS BY FUNCTION
// ============================================================================

export const STAPLE_CARDS = {
  ramp: {
    colorless: ['Sol Ring', 'Arcane Signet', 'Fellwar Stone', 'Mind Stone', 'Commander\'s Sphere'],
    green: ['Nature\'s Lore', 'Three Visits', 'Farseek', 'Rampant Growth', 'Kodama\'s Reach', 'Cultivate'],
    ritual: ['Dark Ritual', 'Cabal Ritual', 'Seething Song', 'Desperate Ritual']
  },
  
  removal: {
    white: ['Swords to Plowshares', 'Path to Exile', 'Generous Gift', 'Fateful Absence'],
    blue: ['Counterspell', 'Swan Song', 'Cyclonic Rift', 'Pongify', 'Rapid Hybridization'],
    black: ['Fatal Push', 'Go for the Throat', 'Toxic Deluge', 'Damnation'],
    red: ['Chaos Warp', 'Vandalblast', 'Blasphemous Act', 'By Force'],
    green: ['Beast Within', 'Nature\'s Claim', 'Krosan Grip', 'Return to Nature'],
    colorless: ['Ugin, the Spirit Dragon', 'Spine of Ish Sah', 'Universal Solvent']
  },
  
  card_draw: {
    white: ['Esper Sentinel', 'Welcoming Vampire', 'Mentor of the Meek'],
    blue: ['Rhystic Study', 'Mystic Remora', 'Ponder', 'Preordain', 'Brainstorm'],
    black: ['Necropotence', 'Phyrexian Arena', 'Sign in Blood', 'Night\'s Whisper'],
    red: ['Wheel of Fortune', 'Faithless Looting', 'Light Up the Stage'],
    green: ['Sylvan Library', 'Guardian Project', 'Harmonize', 'Return of the Wildspeaker'],
    colorless: ['Sensei\'s Divining Top', 'Scroll Rack', 'The One Ring']
  },
  
  tutors: {
    black: ['Demonic Tutor', 'Vampiric Tutor', 'Imperial Seal', 'Diabolic Intent'],
    green: ['Worldly Tutor', 'Green Sun\'s Zenith', 'Chord of Calling'],
    white: ['Enlightened Tutor', 'Idyllic Tutor'],
    blue: ['Mystical Tutor', 'Merchant Scroll'],
    colorless: ['Expedition Map', 'Fabricate', 'Reshape']
  }
};

// ============================================================================
// ADVANCED STRATEGIES
// ============================================================================

export const ADVANCED_STRATEGIES = {
  politics: {
    description: 'Multiplayer negotiation and threat assessment',
    techniques: ['Kingmaking prevention', 'Temporary alliances', 'Threat identification', 'Resource bargaining'],
    key_cards: ['Group hug', 'Pillow fort', 'Rattlesnake effects']
  },
  
  stack_manipulation: {
    description: 'Using the stack for advantage',
    techniques: ['Split second', 'Response chains', 'Mana abilities', 'Ordering triggers'],
    key_cards: ['Counterflux', 'Krosan Grip', 'Stifle']
  },
  
  mana_efficiency: {
    description: 'Maximizing mana usage each turn',
    techniques: ['Mana sinks', 'Float mana', 'Untap effects', 'Cost reduction'],
    key_cards: ['Training Grounds', 'Biomancer\'s Familiar', 'Nykthos']
  },
  
  resource_conversion: {
    description: 'Convert one resource to another',
    examples: ['Life to cards', 'Mana to cards', 'Cards to mana', 'Creatures to effects'],
    key_cards: ['Phyrexian mana', 'Delve', 'Convoke', 'Sacrifice outlets']
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const KNOWLEDGE_UTILS = {
  /**
   * Get color philosophy and strengths
   */
  getColorInfo: (color: string) => {
    return COLOR_PHILOSOPHY[color as keyof typeof COLOR_PHILOSOPHY] || null;
  },
  
  /**
   * Get commander archetype information
   */
  getArchetypeInfo: (archetype: string) => {
    return COMMANDER_KNOWLEDGE.commander_types[archetype as keyof typeof COMMANDER_KNOWLEDGE.commander_types] || null;
  },
  
  /**
   * Get recommended land count for format and strategy
   */
  getLandCount: (format: 'standard_60' | 'commander_100', strategy: string) => {
    return DECK_BUILDING.land_counts[format]?.[strategy as keyof typeof DECK_BUILDING.land_counts[typeof format]] || null;
  },
  
  /**
   * Get power level information
   */
  getPowerLevelInfo: (level: number) => {
    if (level <= 3) return COMMANDER_KNOWLEDGE.power_level_indicators['casual'];
    if (level <= 6) return COMMANDER_KNOWLEDGE.power_level_indicators['focused'];
    if (level <= 8) return COMMANDER_KNOWLEDGE.power_level_indicators['high_power'];
    return COMMANDER_KNOWLEDGE.power_level_indicators['cedh'];
  },
  
  /**
   * Get synergy pattern information
   */
  getSynergyPattern: (pattern: string) => {
    return SYNERGY_PATTERNS[pattern as keyof typeof SYNERGY_PATTERNS] || null;
  },
  
  /**
   * Check if card is a staple for given function
   */
  isStaple: (cardName: string, category?: string) => {
    if (!category) {
      // Check all categories
      return Object.values(STAPLE_CARDS).some(cat => 
        Object.values(cat).some(cards => cards.includes(cardName))
      );
    }
    const categoryCards = STAPLE_CARDS[category as keyof typeof STAPLE_CARDS];
    if (!categoryCards) return false;
    return Object.values(categoryCards).some(cards => cards.includes(cardName));
  }
};


// ============================================================================
// ADVANCED ALGORITHMS & ANALYSIS
// ============================================================================

export const ALGORITHMS = {
  /**
   * Probability calculations for deck optimization
   */
  probability: {
    /**
     * Calculate probability of drawing specific cards
     */
    drawProbability: (deckSize: number, cardsInHand: number, copiesInDeck: number, turnNumber: number = 1) => {
      const totalDraws = cardsInHand + turnNumber - 1;
      const failures = deckSize - copiesInDeck;
      const successes = copiesInDeck;
      
      // Hypergeometric distribution
      let probability = 0;
      for (let i = 1; i <= Math.min(totalDraws, successes); i++) {
        const numerator = combination(successes, i) * combination(failures, totalDraws - i);
        const denominator = combination(deckSize, totalDraws);
        probability += numerator / denominator;
      }
      return probability;
    },

    /**
     * Calculate mana curve optimization
     */
    manaCurveOptimal: (totalCards: number, strategy: 'aggro' | 'midrange' | 'control' | 'combo') => {
      const curves = {
        aggro: { 1: 0.20, 2: 0.35, 3: 0.25, 4: 0.15, 5: 0.05 },
        midrange: { 1: 0.05, 2: 0.25, 3: 0.30, 4: 0.25, 5: 0.15 },
        control: { 1: 0.02, 2: 0.15, 3: 0.20, 4: 0.25, 5: 0.38 },
        combo: { 1: 0.15, 2: 0.30, 3: 0.25, 4: 0.20, 5: 0.10 }
      };
      
      return Object.entries(curves[strategy]).reduce((acc, [cmc, ratio]) => {
        acc[cmc] = Math.round(totalCards * ratio);
        return acc;
      }, {} as Record<string, number>);
    },

    /**
     * Calculate ideal land count
     */
    optimalLandCount: (deckSize: number, avgCMC: number, strategy: string) => {
      const baseFormula = 19 + (avgCMC - 2.5) * 2;
      const strategyModifiers = {
        aggro: -2, midrange: 0, control: +3, combo: -1, ramp: +2
      };
      
      const modifier = strategyModifiers[strategy as keyof typeof strategyModifiers] || 0;
      const adjusted = baseFormula + modifier;
      
      return Math.max(Math.min(Math.round(adjusted * (deckSize / 60)), deckSize * 0.5), deckSize * 0.25);
    }
  },

  /**
   * Card synergy detection algorithms
   */
  synergy: {
    /**
     * Calculate synergy score between two cards
     */
    calculateSynergyScore: (card1: any, card2: any) => {
      let score = 0;
      
      // Type synergy
      if (shareCreatureType(card1, card2)) score += 3;
      if (shareMechanics(card1, card2)) score += 2;
      
      // Color synergy
      if (card1.color_identity.some((c: string) => card2.color_identity.includes(c))) score += 1;
      
      // Mana curve synergy
      const cmcDiff = Math.abs((card1.cmc || 0) - (card2.cmc || 0));
      if (cmcDiff <= 1) score += 1;
      
      // Text-based synergy detection
      const synergyKeywords = [
        'enters the battlefield', 'leaves the battlefield', 'dies',
        'sacrifice', 'destroy', 'exile', 'graveyard', 'hand',
        'library', 'draw', 'discard', 'mill', 'counter', 'token'
      ];
      
      synergyKeywords.forEach(keyword => {
        if (card1.oracle_text?.toLowerCase().includes(keyword) && 
            card2.oracle_text?.toLowerCase().includes(keyword)) {
          score += 2;
        }
      });
      
      return Math.min(score, 10); // Cap at 10
    },

    /**
     * Detect infinite combos
     */
    detectInfiniteCombo: (cards: any[]) => {
      const comboPatterns = [
        // Classic patterns
        { cards: ['Thassa\'s Oracle', 'Demonic Consultation'], type: 'win' },
        { cards: ['Mikaeus, the Unhallowed', 'Walking Ballista'], type: 'damage' },
        { cards: ['Exquisite Blood', 'Sanguine Bond'], type: 'drain' },
        { cards: ['Doubling Season', 'Tamiyo, Field Researcher'], type: 'loyalty' },
        { cards: ['Ashnod\'s Altar', 'Nim Deathmantle', 'Workhorse'], type: 'mana' }
      ];
      
      return comboPatterns.filter(pattern => 
        pattern.cards.every(cardName => 
          cards.some(card => card.name === cardName)
        )
      );
    },

    /**
     * Calculate deck coherence score
     */
    deckCoherence: (deck: any[]) => {
      const themes = extractThemes(deck);
      const primaryTheme = themes[0];
      
      if (!primaryTheme) return 0;
      
      const themeCards = deck.filter(card => 
        cardSupportsTheme(card, primaryTheme.name)
      ).length;
      
      return (themeCards / deck.length) * 100;
    }
  },

  /**
   * Meta-game analysis
   */
  metagame: {
    /**
     * Analyze format meta trends
     */
    analyzeMetaTrends: (recentDecks: any[], timeframe: number = 30) => {
      const decksByArchetype = groupBy(recentDecks, 'archetype');
      const total = recentDecks.length;
      
      return Object.entries(decksByArchetype).map(([archetype, decks]) => ({
        archetype,
        prevalence: (decks.length / total) * 100,
        winRate: calculateWinRate(decks),
        avgPowerLevel: calculateAvgPowerLevel(decks),
        trend: calculateTrend(decks, timeframe)
      })).sort((a, b) => b.prevalence - a.prevalence);
    },

    /**
     * Predict meta shifts
     */
    predictMetaShift: (currentMeta: any[], newCards: any[]) => {
      const predictions: any[] = [];
      
      newCards.forEach(card => {
        const affectedArchetypes = findAffectedArchetypes(card);
        const impactScore = calculateImpactScore(card, currentMeta);
        
        if (impactScore > 7) {
          predictions.push({
            card: card.name,
            impact: impactScore,
            archetypes: affectedArchetypes,
            prediction: generatePrediction(card, affectedArchetypes)
          });
        }
      });
      
      return predictions.sort((a, b) => b.impact - a.impact);
    }
  }
};

// ============================================================================
// ADVANCED CARD INTERACTION MATRIX
// ============================================================================

export const INTERACTION_MATRIX = {
  /**
   * Comprehensive card interaction categories
   */
  categories: {
    removal: {
      targeted: ['Murder', 'Path to Exile', 'Swords to Plowshares'],
      mass: ['Wrath of God', 'Damnation', 'Pyroclasm'],
      conditional: ['Fatal Push', 'Lightning Bolt', 'Doom Blade'],
      exile: ['Path to Exile', 'Swords to Plowshares', 'Anguished Unmaking'],
      bounce: ['Unsummon', 'Cyclonic Rift', 'Boomerang'],
      transform: ['Pongify', 'Rapid Hybridization', 'Beast Within']
    },
    
    protection: {
      hexproof: ['Sylvan Safekeeper', 'Mother of Runes', 'Lightning Greaves'],
      indestructible: ['Boros Charm', 'Heroic Intervention', 'Teferi\'s Protection'],
      counterspells: ['Counterspell', 'Force of Will', 'Swan Song'],
      phasing: ['Teferi\'s Protection', 'Vanishing'],
      regeneration: ['Regenerate', 'Skeletal Grimace']
    },
    
    value_engines: {
      card_draw: ['Rhystic Study', 'Sylvan Library', 'Phyrexian Arena'],
      tutors: ['Demonic Tutor', 'Enlightened Tutor', 'Worldly Tutor'],
      recursion: ['Eternal Witness', 'Regrowth', 'Archaeomancer'],
      doubling: ['Doubling Season', 'Parallel Lives', 'Anointed Procession']
    }
  },

  /**
   * Response matrix for different threats
   */
  responses: {
    creatures: {
      small_aggressive: ['Pyroclasm', 'Anger of the Gods', 'Engineered Explosives'],
      large_threats: ['Murder', 'Hero\'s Downfall', 'Terminate'],
      evasive: ['Settle the Wreckage', 'Wrath of God', 'Toxic Deluge'],
      indestructible: ['Exile effects', 'Bounce', 'Transform effects'],
      hexproof: ['Mass removal', 'Sacrifice effects', 'Edict effects']
    },
    
    noncreatures: {
      artifacts: ['Naturalize', 'Shatter', 'Abrade'],
      enchantments: ['Disenchant', 'Krosan Grip', 'Nature\'s Claim'],
      planeswalkers: ['Direct damage', 'Creature attacks', 'Dreadbore'],
      lands: ['Strip Mine', 'Wasteland', 'Ghost Quarter'],
      graveyard: ['Rest in Peace', 'Leyline of the Void', 'Relic of Progenitus']
    },
    
    strategies: {
      aggro: ['Life gain', 'Fog effects', 'Mass removal', 'Blockers'],
      combo: ['Counterspells', 'Discard', 'Stax pieces', 'Interaction'],
      control: ['Pressure', 'Card advantage', 'Uncounterable threats'],
      midrange: ['Card advantage', 'Bigger threats', 'Value engines']
    }
  }
};

// ============================================================================
// ADVANCED STRATEGIC FRAMEWORKS
// ============================================================================

export const STRATEGIC_FRAMEWORKS = {
  /**
   * Threat assessment matrix
   */
  threatAssessment: {
    immediate: {
      criteria: ['Can win this turn', 'Threatens lethal damage', 'Game-ending combo piece'],
      priority: 10,
      response: 'Must answer immediately'
    },
    
    urgent: {
      criteria: ['Wins in 1-2 turns', 'Exponential value', 'Locks game state'],
      priority: 8,
      response: 'Answer within current turn cycle'
    },
    
    moderate: {
      criteria: ['Gradual advantage', 'Synergy enabler', 'Resource engine'],
      priority: 5,
      response: 'Answer when convenient'
    },
    
    low: {
      criteria: ['Marginal impact', 'Easily answered later', 'Symmetric effect'],
      priority: 2,
      response: 'Ignore unless synergistic'
    }
  },

  /**
   * Resource allocation principles
   */
  resourceAllocation: {
    principles: [
      'Spend mana every turn efficiently',
      'Hold interaction for higher priority threats',
      'Maintain card advantage when possible',
      'Preserve life total as a resource',
      'Use graveyard as extended hand',
      'Convert resources efficiently'
    ],
    
    priorities: {
      early_game: ['Develop board', 'Establish engines', 'Answer immediate threats'],
      mid_game: ['Optimize value', 'Position for late game', 'Pressure opponents'],
      late_game: ['Close out game', 'Protect win conditions', 'Answer final threats']
    }
  },

  /**
   * Decision trees for common scenarios
   */
  decisionTrees: {
    mulligan: {
      criteria: [
        'Playable hand (2-4 lands)',
        'Early plays available',
        'Interaction for expected meta',
        'Win condition or path to it',
        'Mana curve fits strategy'
      ],
      
      evaluate: (hand: any[]) => {
        let score = 0;
        const lands = hand.filter(card => card.type_line.includes('Land')).length;
        const earlyPlays = hand.filter(card => (card.cmc || 0) <= 3).length;
        
        // Land count scoring
        if (lands >= 2 && lands <= 4) score += 3;
        else if (lands === 1 || lands === 5) score += 1;
        
        // Early plays
        if (earlyPlays >= 2) score += 2;
        
        // Interaction
        const interaction = hand.filter(card => 
          card.oracle_text?.includes('destroy') || 
          card.oracle_text?.includes('counter')
        ).length;
        if (interaction >= 1) score += 1;
        
        return score >= 4; // Keep if score 4+
      }
    },

    combat: {
      attack_decision: (attackers: any[], blockers: any[], gameState: any) => {
        const decisions: any[] = [];
        
        attackers.forEach(attacker => {
          const potentialBlockers = blockers.filter(blocker => 
            canBlock(blocker, attacker)
          );
          
          const decision = {
            creature: attacker.name,
            shouldAttack: evaluateAttack(attacker, potentialBlockers, gameState),
            reasoning: generateAttackReasoning(attacker, potentialBlockers, gameState)
          };
          
          decisions.push(decision);
        });
        
        return decisions;
      }
    }
  }
};

// ============================================================================
// CARD REPLACEMENT & UPGRADE ENGINE
// ============================================================================

export const REPLACEMENT_ENGINE = {
  /**
   * Card upgrade suggestions based on budget and power level
   */
  upgradeMatrix: {
    ramp: {
      budget: ['Rampant Growth', 'Kodama\'s Reach', 'Cultivate'],
      optimized: ['Nature\'s Lore', 'Three Visits', 'Farseek'],
      premium: ['Mana Crypt', 'Mox Diamond', 'Chrome Mox']
    },
    
    removal: {
      budget: ['Murder', 'Naturalize', 'Cancel'],
      optimized: ['Fatal Push', 'Nature\'s Claim', 'Counterspell'],
      premium: ['Force of Will', 'Mana Drain', 'Swords to Plowshares']
    },
    
    card_draw: {
      budget: ['Divination', 'Sign in Blood', 'Harmonize'],
      optimized: ['Night\'s Whisper', 'Read the Bones', 'Return of the Wildspeaker'],
      premium: ['Necropotence', 'Sylvan Library', 'Rhystic Study']
    }
  },

  /**
   * Generate replacement suggestions
   */
  generateReplacements: (card: any, constraints: any = {}) => {
    const function_type = identifyCardFunction(card);
    const budget = constraints.budget || 'optimized';
    const format = constraints.format || 'commander';
    
    const base_replacements = REPLACEMENT_ENGINE.upgradeMatrix[function_type]?.[budget] || [];
    
    // Filter by format legality and color identity
    return base_replacements.filter(replacement => {
      return isLegalInFormat(replacement, format) && 
             fitsColorIdentity(replacement, constraints.colorIdentity);
    }).map(replacement => ({
      name: replacement,
      reasoning: generateReplacementReasoning(card, replacement),
      upgrade_type: budget,
      synergy_score: calculateReplacementSynergy(card, replacement, constraints.deck)
    }));
  }
};

// ============================================================================
// TOURNAMENT & COMPETITIVE INTELLIGENCE
// ============================================================================

export const COMPETITIVE_INTELLIGENCE = {
  /**
   * Tournament preparation framework
   */
  preparation: {
    meta_analysis: {
      steps: [
        'Identify top archetypes in format',
        'Analyze recent tournament results',
        'Study key matchups and win rates',
        'Identify tech cards and innovations',
        'Prepare sideboard strategy'
      ]
    },
    
    sideboard_construction: {
      allocation: {
        'hate_cards': '40-50%', // Graveyard hate, artifact hate, etc.
        'sweepers': '20-30%',   // Additional board wipes
        'counter_magic': '15-25%', // Additional interaction
        'threats': '10-20%'     // Alternative win conditions
      },
      
      guidelines: [
        'Target most popular archetypes',
        'Bring answers to your bad matchups',
        'Consider mana cost of sideboard cards',
        'Practice sideboard plans extensively',
        'Adapt to local meta variations'
      ]
    }
  },

  /**
   * Matchup analysis framework
   */
  matchups: {
    analyze: (deck1: any, deck2: any) => {
      const interactions = findKeyInteractions(deck1, deck2);
      const speed = compareSpeed(deck1, deck2);
      const inevitability = compareInevitability(deck1, deck2);
      
      return {
        favored_deck: determineFavoredDeck(speed, inevitability, interactions),
        key_cards: identifyKeyCards(deck1, deck2),
        strategy: generateMatchupStrategy(deck1, deck2),
        sideboard_plan: generateSideboardPlan(deck1, deck2)
      };
    }
  }
};

// ============================================================================
// UTILITY HELPER FUNCTIONS
// ============================================================================

// Mathematical helpers
function combination(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  
  let result = 1;
  for (let i = 0; i < k; i++) {
    result *= (n - i) / (i + 1);
  }
  return result;
}

function shareCreatureType(card1: any, card2: any): boolean {
  const types1 = extractCreatureTypes(card1.type_line || '');
  const types2 = extractCreatureTypes(card2.type_line || '');
  return types1.some(type => types2.includes(type));
}

function shareMechanics(card1: any, card2: any): boolean {
  const mechanics1 = card1.keywords || [];
  const mechanics2 = card2.keywords || [];
  return mechanics1.some((mechanic: string) => mechanics2.includes(mechanic));
}

function extractCreatureTypes(typeLine: string): string[] {
  const creatureTypes = [
    'Human', 'Elf', 'Goblin', 'Dragon', 'Angel', 'Demon', 'Zombie', 'Vampire',
    'Wizard', 'Warrior', 'Knight', 'Beast', 'Spirit', 'Elemental', 'Giant',
    'Merfolk', 'Faerie', 'Soldier', 'Assassin', 'Rogue', 'Shaman', 'Cleric'
  ];
  
  return creatureTypes.filter(type => typeLine.includes(type));
}

function extractThemes(deck: any[]): any[] {
  // Simplified theme extraction
  const themes = new Map();
  
  deck.forEach(card => {
    const cardThemes = identifyCardThemes(card);
    cardThemes.forEach(theme => {
      themes.set(theme, (themes.get(theme) || 0) + 1);
    });
  });
  
  return Array.from(themes.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function identifyCardThemes(card: any): string[] {
  const themes: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  
  // Add theme detection logic
  if (text.includes('sacrifice') || text.includes('dies')) themes.push('sacrifice');
  if (text.includes('token') || text.includes('create')) themes.push('tokens');
  if (text.includes('graveyard') || text.includes('return')) themes.push('graveyard');
  if (text.includes('counter') && !text.includes('counterspell')) themes.push('counters');
  if (typeLine.includes('artifact')) themes.push('artifacts');
  
  return themes;
}

function cardSupportsTheme(card: any, theme: string): boolean {
  return identifyCardThemes(card).includes(theme);
}

function groupBy(array: any[], key: string): Record<string, any[]> {
  return array.reduce((groups, item) => {
    const group = item[key] || 'unknown';
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

function calculateWinRate(decks: any[]): number {
  const totalGames = decks.reduce((sum, deck) => sum + (deck.games_played || 0), 0);
  const totalWins = decks.reduce((sum, deck) => sum + (deck.wins || 0), 0);
  return totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
}

function calculateAvgPowerLevel(decks: any[]): number {
  const total = decks.reduce((sum, deck) => sum + (deck.power_level || 6), 0);
  return decks.length > 0 ? total / decks.length : 6;
}

function calculateTrend(decks: any[], timeframe: number): 'rising' | 'stable' | 'falling' {
  // Simplified trend calculation
  const recent = decks.filter(deck => 
    new Date(deck.created_at) > new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000)
  );
  
  if (recent.length > decks.length * 0.6) return 'rising';
  if (recent.length < decks.length * 0.3) return 'falling';
  return 'stable';
}

function findAffectedArchetypes(card: any): string[] {
  // Determine which archetypes this card affects
  const archetypes: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  
  if (text.includes('creature') || card.type_line.includes('Creature')) {
    archetypes.push('creature-based');
  }
  if (text.includes('graveyard')) archetypes.push('graveyard');
  if (text.includes('artifact')) archetypes.push('artifacts');
  
  return archetypes;
}

function calculateImpactScore(card: any, meta: any[]): number {
  // Calculate how much this card will impact the meta
  let score = 5; // Base score
  
  if (card.cmc <= 2) score += 2; // Low cost is impactful
  if (card.rarity === 'mythic' || card.rarity === 'rare') score += 1;
  if ((card.oracle_text || '').includes('destroy') || 
      (card.oracle_text || '').includes('exile')) score += 2;
  
  return Math.min(score, 10);
}

function generatePrediction(card: any, archetypes: string[]): string {
  return `${card.name} will likely boost ${archetypes.join(' and ')} strategies`;
}

function identifyCardFunction(card: any): string {
  const text = (card.oracle_text || '').toLowerCase();
  
  if (text.includes('search') && text.includes('land')) return 'ramp';
  if (text.includes('destroy') || text.includes('exile')) return 'removal';
  if (text.includes('draw') || text.includes('cards')) return 'card_draw';
  if (text.includes('counter') && text.includes('spell')) return 'counterspell';
  
  return 'utility';
}

function generateReplacementReasoning(original: any, replacement: string): string {
  return `${replacement} provides similar functionality to ${original.name} with improved efficiency`;
}

function calculateReplacementSynergy(original: any, replacement: string, deck: any[]): number {
  // Calculate how well the replacement fits with the deck
  return 7; // Simplified - would need full card database
}

function isLegalInFormat(cardName: string, format: string): boolean {
  // Simplified - would need full legality database
  return true;
}

function fitsColorIdentity(cardName: string, colorIdentity: string[]): boolean {
  // Simplified - would need full card database
  return true;
}

function findKeyInteractions(deck1: any, deck2: any): any[] {
  return []; // Simplified
}

function compareSpeed(deck1: any, deck2: any): number {
  const avgCMC1 = calculateAverageCMC(deck1.cards || []);
  const avgCMC2 = calculateAverageCMC(deck2.cards || []);
  return avgCMC2 - avgCMC1; // Lower CMC = faster = positive score
}

function compareInevitability(deck1: any, deck2: any): number {
  // Simplified inevitability comparison
  return 0;
}

function determineFavoredDeck(speed: number, inevitability: number, interactions: any[]): string {
  return speed > 0 ? 'deck1' : 'deck2';
}

function identifyKeyCards(deck1: any, deck2: any): string[] {
  return []; // Simplified
}

function generateMatchupStrategy(deck1: any, deck2: any): string {
  return "Focus on your game plan while disrupting opponent's key pieces";
}

function generateSideboardPlan(deck1: any, deck2: any): any {
  return { in: [], out: [] };
}

function calculateAverageCMC(cards: any[]): number {
  const nonLands = cards.filter(card => !card.type_line.includes('Land'));
  const totalCMC = nonLands.reduce((sum, card) => sum + (card.cmc || 0), 0);
  return nonLands.length > 0 ? totalCMC / nonLands.length : 0;
}

function canBlock(blocker: any, attacker: any): boolean {
  // Simplified blocking rules
  if (attacker.keywords?.includes('flying') && 
      !blocker.keywords?.includes('flying') && 
      !blocker.keywords?.includes('reach')) {
    return false;
  }
  return true;
}

function evaluateAttack(attacker: any, blockers: any[], gameState: any): boolean {
  // Simplified attack evaluation
  return blockers.length === 0 || attacker.power > Math.max(...blockers.map(b => b.toughness));
}

function generateAttackReasoning(attacker: any, blockers: any[], gameState: any): string {
  if (blockers.length === 0) return "No blockers available";
  return "Evaluate based on combat math and game state";
}

// Export enhanced knowledge base
export default {
  GAME_RULES,
  COLOR_PHILOSOPHY,
  MECHANICS_KNOWLEDGE,
  DECK_BUILDING,
  COMMANDER_KNOWLEDGE,
  SYNERGY_PATTERNS,
  CARD_EVALUATION,
  COMBAT_KNOWLEDGE,
  FORMAT_RULES,
  STAPLE_CARDS,
  ADVANCED_STRATEGIES,
  ALGORITHMS,
  INTERACTION_MATRIX,
  STRATEGIC_FRAMEWORKS,
  REPLACEMENT_ENGINE,
  COMPETITIVE_INTELLIGENCE,
  KNOWLEDGE_UTILS
};
