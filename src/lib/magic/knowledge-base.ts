/**
 * MTG Knowledge Base - The central brain for all Magic: The Gathering game knowledge
 * This file contains comprehensive information about game mechanics, card interactions,
 * deck composition, synergies, and strategic principles.
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
  KNOWLEDGE_UTILS
};
