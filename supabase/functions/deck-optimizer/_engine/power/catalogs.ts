/**
 * GENERATED FILE — do not edit.
 *
 * Rendered from src/lib/deckbuilder/score/{staples.json, combos.json, catalog.tutors.json, catalog.gamechangers.json}
 * by scripts/vendor-engine.mjs, and re-rendered and byte-compared by
 * src/engine/engine-parity.test.ts, so it cannot drift from the JSON without
 * the suite going red.
 *
 * WHY IT EXISTS
 * The engine must be plain TypeScript with relative specifiers and nothing
 * else, because that is what lets the whole tree be mirrored byte for byte
 * into a Deno edge function. A JSON import would break that: Vite, Node's
 * type-stripping loader and Deno each want a different incantation for it.
 * The JSON files stay where they are because a marketing component imports one
 * of them directly.
 *
 * These are CURATED LISTS, not measurements. They are a written-down judgement
 * about which cards are fast mana, tutors, removal and so on, so that the
 * judgement can be argued with. Every number the power score derives from them
 * is traceable to a named card on one of these lists, which is what lets the
 * score explain itself card by card.
 *
 * 38 fast-mana entries, 36 tutors, 10 two-card combos.
 */

export interface WeightedList {
  weight: number;
  cards: string[];
}

export interface TwoCardCombo {
  name: string;
  cards: string[];
  total_mv: number;
  win_type?: string;
  protection_requirement?: string;
  tags?: string[];
}

export interface CompactCombo {
  name: string;
  requires: string[];
}

export interface FinisherConditions {
  min_inst_sorc?: number;
  min_creatures?: number;
  min_ramp?: number;
}

export const STAPLES: Record<string, Record<string, WeightedList>> = {
    "card_advantage": {
      "burst": {
        "cards": [
          "Ad Nauseam",
          "Wheel of Fortune",
          "Windfall",
          "Timetwister",
          "Ancestral Recall"
        ],
        "weight": 6
      },
      "engines": {
        "cards": [
          "Rhystic Study",
          "Mystic Remora",
          "Sylvan Library",
          "Necropotence",
          "Phyrexian Arena",
          "Smothering Tithe"
        ],
        "weight": 8
      }
    },
    "fast_mana": {
      "tier_0": {
        "cards": [
          "Mana Crypt",
          "Sol Ring",
          "Black Lotus",
          "Mox Diamond",
          "Mox Opal",
          "Lion's Eye Diamond"
        ],
        "weight": 15
      },
      "tier_1": {
        "cards": [
          "Mana Vault",
          "Chrome Mox",
          "Lotus Petal",
          "Ancient Tomb",
          "City of Traitors",
          "Grim Monolith"
        ],
        "weight": 12
      },
      "tier_2": {
        "cards": [
          "Gemstone Caverns",
          "Simian Spirit Guide",
          "Elvish Spirit Guide",
          "Basalt Monolith",
          "Thran Dynamo",
          "Worn Powerstone"
        ],
        "weight": 8
      },
      "tier_3": {
        "cards": [
          "Azorius Signet",
          "Dimir Signet",
          "Rakdos Signet",
          "Gruul Signet",
          "Selesnya Signet",
          "Orzhov Signet",
          "Golgari Signet",
          "Simic Signet",
          "Izzet Signet",
          "Boros Signet"
        ],
        "weight": 5
      },
      "tier_4": {
        "cards": [
          "Talisman of Progress",
          "Talisman of Dominance",
          "Talisman of Indulgence",
          "Talisman of Impulse",
          "Talisman of Unity",
          "Talisman of Hierarchy",
          "Talisman of Resilience",
          "Talisman of Curiosity",
          "Talisman of Creativity",
          "Talisman of Conviction"
        ],
        "weight": 3
      }
    },
    "interaction": {
      "free_interaction": {
        "cards": [
          "Force of Will",
          "Force of Negation",
          "Mental Misstep",
          "Deflecting Swat",
          "Fierce Guardianship",
          "Force of Vigor",
          "Pyroblast",
          "Red Elemental Blast"
        ],
        "weight": 18
      },
      "premium_counters": {
        "cards": [
          "Force of Will",
          "Force of Negation",
          "Mana Drain",
          "Counterspell",
          "Mental Misstep",
          "Fierce Guardianship",
          "Swan Song",
          "Flusterstorm",
          "Negate",
          "Dispel"
        ],
        "weight": 15
      },
      "premium_removal": {
        "cards": [
          "Swords to Plowshares",
          "Path to Exile",
          "Lightning Bolt",
          "Fatal Push",
          "Abrupt Decay",
          "Assassin's Trophy",
          "Prismatic Ending",
          "Rapid Hybridization"
        ],
        "weight": 12
      },
      "stax_interaction": {
        "cards": [
          "Null Rod",
          "Stony Silence",
          "Collector Ouphe",
          "Kataki War's Wage",
          "Sphere of Resistance",
          "Thorn of Amethyst"
        ],
        "weight": 12
      },
      "sweepers": {
        "cards": [
          "Wrath of God",
          "Damnation",
          "Cyclonic Rift",
          "Toxic Deluge",
          "Blasphemous Act",
          "Supreme Verdict",
          "Austere Command"
        ],
        "weight": 10
      }
    },
    "protection": {
      "permanent": {
        "cards": [
          "Privileged Position",
          "Sterling Grove",
          "Greater Auramancy",
          "Asceticism"
        ],
        "weight": 6
      },
      "premium": {
        "cards": [
          "Teferi's Protection",
          "Heroic Intervention",
          "Boros Charm",
          "Autumn's Veil",
          "Veil of Summer"
        ],
        "weight": 8
      }
    },
    "stax": {
      "resource_denial": {
        "cards": [
          "Winter Orb",
          "Static Orb",
          "Stasis",
          "Armageddon",
          "Ravages of War"
        ],
        "weight": 7
      },
      "tax_effects": {
        "cards": [
          "Sphere of Resistance",
          "Thorn of Amethyst",
          "Trinisphere",
          "Lodestone Golem"
        ],
        "weight": 5
      }
    },
    "tutors": {
      "broad": {
        "cards": [
          "Enlightened Tutor",
          "Mystical Tutor",
          "Worldly Tutor",
          "Survival of the Fittest",
          "Gamble",
          "Lim-Dul's Vault"
        ],
        "weight": 12
      },
      "category": {
        "cards": [
          "Chord of Calling",
          "Green Sun's Zenith",
          "Finale of Devastation",
          "Natural Order",
          "Eldritch Evolution",
          "Merchant Scroll"
        ],
        "weight": 10
      },
      "narrow": {
        "cards": [
          "Steelshaper's Gift",
          "Stoneforge Mystic",
          "Fabricate",
          "Whir of Invention",
          "Trinket Mage",
          "Idyllic Tutor"
        ],
        "weight": 6
      },
      "ultra_broad": {
        "cards": [
          "Demonic Tutor",
          "Vampiric Tutor",
          "Imperial Seal",
          "Grim Tutor",
          "Diabolic Intent",
          "Personal Tutor"
        ],
        "weight": 15
      }
    },
    "win_conditions": {
      "combo_pieces": {
        "cards": [
          "Isochron Scepter",
          "Dramatic Reversal",
          "Kiki-Jiki, Mirror Breaker",
          "Zealous Conscripts",
          "Splinter Twin",
          "Deceiver Exarch",
          "Food Chain",
          "Eternal Scourge"
        ],
        "weight": 14
      },
      "compact_combos": {
        "cards": [
          "Rings of Brighthearth",
          "Basalt Monolith",
          "Worldgorger Dragon",
          "Animate Dead",
          "Hermit Druid",
          "Mikaeus, the Unhallowed",
          "Triskelion"
        ],
        "weight": 16
      },
      "efficient": {
        "cards": [
          "Craterhoof Behemoth",
          "Walking Ballista",
          "Finale of Devastation",
          "Torment of Hailfire",
          "Exsanguinate"
        ],
        "weight": 12
      },
      "instant_wins": {
        "cards": [
          "Thassa's Oracle",
          "Laboratory Maniac",
          "Jace, Wielder of Mysteries",
          "Demonic Consultation",
          "Tainted Pact"
        ],
        "weight": 15
      }
    }
  };

export const TUTOR_TIERS: Record<string, WeightedList> = {
    "broad": {
      "cards": [
        "Demonic Tutor",
        "Vampiric Tutor",
        "Imperial Seal",
        "Diabolic Intent",
        "Grim Tutor",
        "Cruel Tutor",
        "Profane Tutor"
      ],
      "weight": 1
    },
    "category_high": {
      "cards": [
        "Enlightened Tutor",
        "Mystical Tutor",
        "Worldly Tutor",
        "Gamble",
        "Burning Wish",
        "Living Wish"
      ],
      "weight": 0.85
    },
    "category_mid": {
      "cards": [
        "Idyllic Tutor",
        "Fabricate",
        "Steelshaper's Gift",
        "Chord of Calling",
        "Green Sun's Zenith",
        "Finale of Devastation",
        "Eladamri's Call",
        "Congregation at Dawn"
      ],
      "weight": 0.7
    },
    "narrow": {
      "cards": [
        "Expedition Map",
        "Muddle the Mixture",
        "Dimir Infiltrator",
        "Drift of Phantasms",
        "Perplex",
        "Dizzy Spell",
        "Merchant Scroll",
        "Mystical Teachings",
        "Shred Memory"
      ],
      "weight": 0.5
    },
    "pseudo": {
      "cards": [
        "Dig Through Time",
        "Treasure Cruise",
        "Intuition",
        "Impulse",
        "Fact or Fiction",
        "Brainstorm"
      ],
      "weight": 0.35
    }
  };

export const TWO_CARD_COMBOS: TwoCardCombo[] = [
    {
      "cards": [
        "Thassa's Oracle",
        "Demonic Consultation"
      ],
      "name": "Thassa's Oracle + Demonic Consultation",
      "protection_requirement": "counterspell",
      "tags": [
        "oracle",
        "consultation"
      ],
      "total_mv": 3,
      "win_type": "instant"
    },
    {
      "cards": [
        "Isochron Scepter",
        "Dramatic Reversal"
      ],
      "name": "Isochron Scepter + Dramatic Reversal",
      "protection_requirement": "artifact",
      "tags": [
        "dramatic",
        "scepter"
      ],
      "total_mv": 4,
      "win_type": "infinite_mana"
    },
    {
      "cards": [
        "Kiki-Jiki, Mirror Breaker",
        "Zealous Conscripts"
      ],
      "name": "Kiki-Jiki + Zealous Conscripts",
      "protection_requirement": "creature",
      "tags": [
        "kiki",
        "conscripts"
      ],
      "total_mv": 10,
      "win_type": "infinite_creatures"
    },
    {
      "cards": [
        "Splinter Twin",
        "Deceiver Exarch"
      ],
      "name": "Splinter Twin + Deceiver Exarch",
      "protection_requirement": "enchantment",
      "tags": [
        "twin",
        "exarch"
      ],
      "total_mv": 7,
      "win_type": "infinite_creatures"
    },
    {
      "cards": [
        "Dualcaster Mage",
        "Ghostly Flicker"
      ],
      "name": "Dualcaster Mage + Ghostly Flicker",
      "protection_requirement": "counterspell",
      "tags": [
        "dualcaster",
        "flicker"
      ],
      "total_mv": 5,
      "win_type": "infinite_etb"
    },
    {
      "cards": [
        "Dockside Extortionist",
        "Temur Sabertooth"
      ],
      "name": "Dockside Extortionist + Temur Sabertooth",
      "protection_requirement": "creature",
      "tags": [
        "dockside",
        "sabertooth"
      ],
      "total_mv": 6,
      "win_type": "infinite_mana"
    },
    {
      "cards": [
        "Hermit Druid",
        "Laboratory Maniac"
      ],
      "name": "Hermit Druid + Laboratory Maniac",
      "protection_requirement": "creature",
      "tags": [
        "hermit",
        "labman"
      ],
      "total_mv": 4,
      "win_type": "mill_win"
    },
    {
      "cards": [
        "Necrotic Ooze",
        "Phyrexian Devourer"
      ],
      "name": "Necrotic Ooze + Phyrexian Devourer",
      "protection_requirement": "graveyard",
      "tags": [
        "ooze",
        "devourer"
      ],
      "total_mv": 5,
      "win_type": "combo_kill"
    },
    {
      "cards": [
        "Basalt Monolith",
        "Rings of Brighthearth"
      ],
      "name": "Basalt Monolith + Rings of Brighthearth",
      "protection_requirement": "artifact",
      "tags": [
        "basalt",
        "rings"
      ],
      "total_mv": 6,
      "win_type": "infinite_mana"
    },
    {
      "cards": [
        "Food Chain",
        "Eternal Scourge"
      ],
      "name": "Food Chain + Eternal Scourge",
      "protection_requirement": "enchantment",
      "tags": [
        "food_chain",
        "scourge"
      ],
      "total_mv": 6,
      "win_type": "infinite_mana"
    }
  ];

export const COMPACT_COMBOS: CompactCombo[] = [
    {
      "name": "Thassa's Oracle",
      "requires": [
        "Demonic Consultation",
        "Tainted Pact"
      ]
    },
    {
      "name": "Isochron Scepter",
      "requires": [
        "Dramatic Reversal"
      ]
    },
    {
      "name": "Dockside Extortionist",
      "requires": [
        "Temur Sabertooth",
        "Cloudstone Curio",
        "Deadeye Navigator"
      ]
    },
    {
      "name": "Kiki-Jiki, Mirror Breaker",
      "requires": [
        "Deceiver Exarch",
        "Pestermite",
        "Felidar Guardian",
        "Zealous Conscripts"
      ]
    },
    {
      "name": "Splinter Twin",
      "requires": [
        "Deceiver Exarch",
        "Pestermite"
      ]
    },
    {
      "name": "Underworld Breach",
      "requires": [
        "Brain Freeze",
        "Lion's Eye Diamond"
      ]
    },
    {
      "name": "Food Chain",
      "requires": [
        "Eternal Scourge",
        "Misthollow Griffin",
        "Squee, the Immortal"
      ]
    },
    {
      "name": "Protean Hulk",
      "requires": []
    }
  ];

export const FINISHER_BOMBS: {
  cards: string[];
  conditional: Record<string, FinisherConditions>;
} = {
    "cards": [
      "Craterhoof Behemoth",
      "Torment of Hailfire",
      "Exsanguinate",
      "Aetherflux Reservoir",
      "Approach of the Second Sun",
      "Finale of Devastation",
      "Crackle with Power",
      "Expropriate",
      "Insurrection",
      "Triumph of the Hordes"
    ],
    "conditional": {
      "Aetherflux Reservoir": {
        "min_inst_sorc": 25
      },
      "Craterhoof Behemoth": {
        "min_creatures": 20
      },
      "Exsanguinate": {
        "min_ramp": 12
      },
      "Torment of Hailfire": {
        "min_ramp": 12
      }
    }
  };

export const INEVITABILITY_ENGINES: string[] = [
    "Rhystic Study",
    "Mystic Remora",
    "Bolas's Citadel",
    "The Gitrog Monster",
    "Dark Confidant",
    "Necropotence",
    "Phyrexian Arena",
    "Ad Nauseam",
    "Thrasios, Triton Hero",
    "Kinnan, Bonder Prodigy"
  ];

export const MASSIVE_SWINGS: string[] = [
    "Cyclonic Rift",
    "Time Warp",
    "Nexus of Fate",
    "Temporal Manipulation",
    "Capture of Jingzhou",
    "Time Stretch",
    "Aggravated Assault",
    "Savage Beating",
    "Waves of Aggression",
    "Insurrection",
    "Expropriate"
  ];
