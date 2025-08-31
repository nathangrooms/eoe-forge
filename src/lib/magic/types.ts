// Comprehensive Magic: The Gathering Type System
// Based on official Magic rules and Scryfall data

// Supertypes
export const SUPERTYPES = [
  'Basic',
  'Legendary', 
  'Snow',
  'World',
  'Host',
  'Ongoing',
  'Token'
] as const;

// Card Types (primary types)
export const CARD_TYPES = [
  'Artifact',
  'Battle',
  'Conspiracy',
  'Creature',
  'Dungeon',
  'Enchantment',
  'Instant',
  'Land',
  'Phenomenon',
  'Plane',
  'Planeswalker',
  'Scheme',
  'Sorcery',
  'Tribal',
  'Vanguard'
] as const;

// Artifact subtypes
export const ARTIFACT_SUBTYPES = [
  'Attraction', 'Blood', 'Clue', 'Contraption', 'Equipment', 'Food', 'Fortification',
  'Gold', 'Incubator', 'Junk', 'Map', 'Powerstone', 'Treasure', 'Vehicle'
] as const;

// Battle subtypes  
export const BATTLE_SUBTYPES = [
  'Siege'
] as const;

// Creature subtypes (200+ types)
export const CREATURE_SUBTYPES = [
  'Advisor', 'Aetherborn', 'Angel', 'Antelope', 'Ape', 'Archer', 'Archon', 'Army', 'Artificer',
  'Assassin', 'Assembly-Worker', 'Atog', 'Aurochs', 'Avatar', 'Azra', 'Badger', 'Barbarian',
  'Bard', 'Basilisk', 'Bat', 'Bear', 'Beast', 'Beeble', 'Berserker', 'Bird', 'Blinkmoth',
  'Boar', 'Bringer', 'Brushwagg', 'Camarid', 'Camel', 'Caribou', 'Carrier', 'Cat', 'Centaur',
  'Cephalid', 'Chimera', 'Citizen', 'Cleric', 'Cockatrice', 'Construct', 'Coward', 'Crab',
  'Crocodile', 'Cyclops', 'Dauthi', 'Demigod', 'Demon', 'Deserter', 'Devil', 'Dinosaur',
  'Djinn', 'Dog', 'Dragon', 'Drake', 'Dreadnought', 'Drone', 'Druid', 'Dryad', 'Dwarf',
  'Efreet', 'Egg', 'Elder', 'Eldrazi', 'Elemental', 'Elephant', 'Elf', 'Elk', 'Eye',
  'Faerie', 'Ferret', 'Fish', 'Flagbearer', 'Fox', 'Fractal', 'Frog', 'Fungus', 'Gargoyle',
  'Germ', 'Giant', 'Gnoll', 'Gnome', 'Goat', 'Goblin', 'God', 'Golem', 'Gorgon', 'Graveborn',
  'Gremlin', 'Griffin', 'Hag', 'Harpy', 'Hellion', 'Hippo', 'Hippogriff', 'Homarid',
  'Homunculus', 'Horror', 'Horse', 'Human', 'Hydra', 'Hyena', 'Illusion', 'Imp', 'Incarnation',
  'Insect', 'Jackal', 'Jellyfish', 'Juggernaut', 'Kavu', 'Kirin', 'Kithkin', 'Knight',
  'Kobold', 'Kor', 'Kraken', 'Lamia', 'Lammasu', 'Leech', 'Leviathan', 'Lhurgoyf', 'Licid',
  'Lizard', 'Manticore', 'Masticore', 'Mercenary', 'Merfolk', 'Metathran', 'Minion', 'Minotaur',
  'Mole', 'Monger', 'Mongoose', 'Monk', 'Monkey', 'Moonfolk', 'Mouse', 'Mutant', 'Myr',
  'Mystic', 'Naga', 'Nautilus', 'Nephilim', 'Nightmare', 'Nightstalker', 'Ninja', 'Noble',
  'Noggle', 'Nomad', 'Nymph', 'Octopus', 'Ogre', 'Ooze', 'Orb', 'Orc', 'Orgg', 'Otter',
  'Ouphe', 'Ox', 'Oyster', 'Pangolin', 'Peasant', 'Pegasus', 'Pentavite', 'Pest', 'Phelddagrif',
  'Phoenix', 'Phyrexian', 'Pilot', 'Pincher', 'Pirate', 'Plant', 'Praetor', 'Prism', 'Processor',
  'Rabbit', 'Raccoon', 'Ranger', 'Rat', 'Rebel', 'Reflection', 'Rhino', 'Rigger', 'Rogue',
  'Sable', 'Salamander', 'Samurai', 'Sand', 'Saproling', 'Satyr', 'Scarecrow', 'Scion',
  'Scorpion', 'Scout', 'Serf', 'Serpent', 'Servo', 'Shade', 'Shaman', 'Shapeshifter', 'Shark',
  'Sheep', 'Siren', 'Skeleton', 'Slith', 'Sliver', 'Slug', 'Snake', 'Soldier', 'Soltari',
  'Spawn', 'Specter', 'Spellshaper', 'Sphinx', 'Spider', 'Spike', 'Spirit', 'Splinter',
  'Sponge', 'Squid', 'Squirrel', 'Starfish', 'Surrakar', 'Survivor', 'Tetravite', 'Thalakos',
  'Thopter', 'Thrull', 'Treefolk', 'Trilobite', 'Triskelavite', 'Troll', 'Turtle', 'Unicorn',
  'Vampire', 'Vedalken', 'Viashino', 'Volver', 'Wall', 'Warlock', 'Warrior', 'Weird', 'Werewolf',
  'Whale', 'Wizard', 'Wolf', 'Wolverine', 'Wombat', 'Worm', 'Wraith', 'Wurm', 'Yeti',
  'Zombie', 'Zubera'
] as const;

// Enchantment subtypes
export const ENCHANTMENT_SUBTYPES = [
  'Aura', 'Background', 'Cartouche', 'Class', 'Curse', 'Role', 'Rune', 'Saga', 'Shard', 'Shrine'
] as const;

// Instant/Sorcery subtypes
export const SPELL_SUBTYPES = [
  'Adventure', 'Arcane', 'Lesson', 'Trap'
] as const;

// Land subtypes
export const LAND_SUBTYPES = [
  'Cave', 'Desert', 'Forest', 'Gate', 'Island', 'Lair', 'Locus', 'Mine', 'Mountain',
  'Plains', 'Sphere', 'Swamp', 'Tower', 'Urza\'s'
] as const;

// Planeswalker subtypes
export const PLANESWALKER_SUBTYPES = [
  'Ajani', 'Aminatou', 'Angrath', 'Arlinn', 'Ashiok', 'Bahamut', 'Basri', 'Bolas', 'Calix',
  'Chandra', 'Dack', 'Dakkon', 'Daretti', 'Davriel', 'Dihada', 'Domri', 'Dovin', 'Ellywick',
  'Elminster', 'Elspeth', 'Estrid', 'Freyalise', 'Garruk', 'Gideon', 'Grist', 'Huatli',
  'Jace', 'Jared', 'Jeska', 'Kaito', 'Karn', 'Kasmina', 'Kaya', 'Kiora', 'Koth', 'Liliana',
  'Lolth', 'Lukka', 'Minsc', 'Mordenkainen', 'Nahiri', 'Narset', 'Niko', 'Nissa', 'Nixilis',
  'Oko', 'Ral', 'Rowan', 'Saheeli', 'Samut', 'Sarkhan', 'Serra', 'Sorin', 'Szat', 'Tamiyo',
  'Teferi', 'Teyo', 'Tezzeret', 'Tibalt', 'Tyvar', 'Ugin', 'Venser', 'Vivien', 'Vraska',
  'Will', 'Windgrace', 'Wrenn', 'Xenagos', 'Yanggu', 'Yanling', 'Zariel'
] as const;

// Type line parsing utilities
export class TypeLine {
  static parse(typeLine: string): {
    supertypes: string[];
    types: string[];
    subtypes: string[];
  } {
    const [leftSide, rightSide] = typeLine.split(' — ');
    const leftParts = leftSide.trim().split(' ');
    
    const supertypes: string[] = [];
    const types: string[] = [];
    
    leftParts.forEach(part => {
      if (SUPERTYPES.includes(part as any)) {
        supertypes.push(part);
      } else if (CARD_TYPES.includes(part as any)) {
        types.push(part);
      }
    });
    
    const subtypes = rightSide ? rightSide.trim().split(' ') : [];
    
    return { supertypes, types, subtypes };
  }

  static hasType(typeLine: string, type: string): boolean {
    const { types } = this.parse(typeLine);
    return types.some(t => t.toLowerCase().includes(type.toLowerCase()));
  }

  static hasSupertype(typeLine: string, supertype: string): boolean {
    const { supertypes } = this.parse(typeLine);
    return supertypes.some(s => s.toLowerCase().includes(supertype.toLowerCase()));
  }

  static hasSubtype(typeLine: string, subtype: string): boolean {
    const { subtypes } = this.parse(typeLine);
    return subtypes.some(s => s.toLowerCase().includes(subtype.toLowerCase()));
  }

  static isCreature(typeLine: string): boolean {
    return this.hasType(typeLine, 'Creature');
  }

  static isLand(typeLine: string): boolean {
    return this.hasType(typeLine, 'Land');
  }

  static isInstant(typeLine: string): boolean {
    return this.hasType(typeLine, 'Instant');
  }

  static isSorcery(typeLine: string): boolean {
    return this.hasType(typeLine, 'Sorcery');
  }

  static isSpell(typeLine: string): boolean {
    return this.isInstant(typeLine) || this.isSorcery(typeLine);
  }

  static isPermanent(typeLine: string): boolean {
    const { types } = this.parse(typeLine);
    const permanentTypes = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
    return types.some(type => permanentTypes.includes(type));
  }

  static isLegendary(typeLine: string): boolean {
    return this.hasSupertype(typeLine, 'Legendary');
  }

  static isBasic(typeLine: string): boolean {
    return this.hasSupertype(typeLine, 'Basic');
  }

  static isSnow(typeLine: string): boolean {
    return this.hasSupertype(typeLine, 'Snow');
  }
}

// Scryfall search syntax helpers for types
export class TypeSearch {
  static buildTypeQuery(type: string): string {
    return `t:${type.toLowerCase()}`;
  }

  static buildSupertypeQuery(supertype: string): string {
    return `t:${supertype.toLowerCase()}`;
  }

  static buildSubtypeQuery(subtype: string): string {
    return `t:${subtype.toLowerCase()}`;
  }

  static buildCreatureTypeQuery(creatureType: string): string {
    return `t:creature t:${creatureType.toLowerCase()}`;
  }

  static buildLegendaryQuery(): string {
    return 't:legendary';
  }

  static buildBasicQuery(): string {
    return 't:basic';
  }

  static buildArtifactQuery(): string {
    return 't:artifact';
  }

  static buildLandQuery(): string {
    return 't:land';
  }

  static buildCreatureQuery(): string {
    return 't:creature';
  }

  static buildSpellQuery(): string {
    return '(t:instant OR t:sorcery)';
  }

  static buildPermanentQuery(): string {
    return '(t:artifact OR t:battle OR t:creature OR t:enchantment OR t:land OR t:planeswalker)';
  }
}

export type Supertype = typeof SUPERTYPES[number];
export type CardType = typeof CARD_TYPES[number];
export type CreatureSubtype = typeof CREATURE_SUBTYPES[number];
export type ArtifactSubtype = typeof ARTIFACT_SUBTYPES[number];
export type EnchantmentSubtype = typeof ENCHANTMENT_SUBTYPES[number];
export type LandSubtype = typeof LAND_SUBTYPES[number];
export type PlaneswalkerSubtype = typeof PLANESWALKER_SUBTYPES[number];