import { ArchetypeTemplate } from '../types';

// Base archetype templates - extensible DSL-based system
export const BASE_TEMPLATES: Record<string, ArchetypeTemplate> = {
  'aggro-burn': {
    id: 'aggro-burn',
    name: 'Aggressive Burn',
    formats: ['standard', 'pioneer', 'modern', 'legacy'],
    colors: ['R'],
    weights: {
      synergy: { 'spellslinger': 3, 'prowess': 2 },
      roles: { 'removal-spot': 4, 'draw': 1, 'wincon': 3 }
    },
    quotas: {
      counts: {
        'removal-spot': { min: 8, max: 12 },
        'draw': { min: 2, max: 4 },
        'wincon': { min: 3, max: 5 }
      },
      creatures_curve: {
        '1': '8-12',
        '2': '6-10', 
        '3': '2-4',
        '4': '0-2',
        '5': '0-1',
        '6-7': '0-1',
        '8-9': '0',
        '10+': '0'
      }
    },
    packages: [
      {
        name: 'burn-core',
        require: [
          { tag: 'removal-spot', count: 8 },
          { tag: 'creature-1mv', count: 6 }
        ]
      }
    ],
    bans: [],
    requires: [],
    power_gates: {
      low: { cap: { 'fast-mana': 0, 'tutor-broad': 0 } },
      high: { floor: { 'removal-spot': 10 } }
    }
  },

  'control-draw-go': {
    id: 'control-draw-go',
    name: 'Draw-Go Control',
    formats: ['standard', 'pioneer', 'modern', 'legacy'],
    colors: ['U', 'W'],
    weights: {
      synergy: { 'spellslinger': 2 },
      roles: { 'counterspell': 4, 'removal-spot': 3, 'draw': 4, 'wincon': 2 }
    },
    quotas: {
      counts: {
        'counterspell': { min: 8, max: 12 },
        'removal-spot': { min: 4, max: 8 },
        'removal-sweeper': { min: 2, max: 4 },
        'draw': { min: 8, max: 12 },
        'wincon': { min: 2, max: 4 }
      },
      creatures_curve: {
        '1': '0-2',
        '2': '0-2',
        '3': '0-2',
        '4': '1-3',
        '5': '1-3',
        '6-7': '1-2',
        '8-9': '0-1',
        '10+': '0-1'
      }
    },
    packages: [
      {
        name: 'control-core',
        require: [
          { tag: 'counterspell', count: 8 },
          { tag: 'draw', count: 8 },
          { tag: 'removal-sweeper', count: 2 }
        ]
      }
    ],
    bans: [],
    requires: [],
    power_gates: {
      low: { cap: { 'fast-mana': 1, 'tutor-broad': 1 } },
      high: { floor: { 'counterspell': 10, 'draw': 10 } }
    }
  },

  'commander-aristocrats': {
    id: 'commander-aristocrats',
    name: 'Aristocrats',
    formats: ['commander'],
    colors: ['B', 'R'],
    weights: {
      synergy: { 'aristocrats': 4, 'tokens': 3, 'sac-outlet': 4 },
      roles: { 'draw': 3, 'removal-spot': 2, 'recursion': 3 }
    },
    quotas: {
      counts: {
        'ramp': { min: 10, max: 14 },
        'draw': { min: 8, max: 12 },
        'removal-spot': { min: 6, max: 10 },
        'removal-sweeper': { min: 1, max: 3 },
        'sac-outlet': { min: 6, max: 10 },
        'aristocrats': { min: 8, max: 12 }
      },
      creatures_curve: {
        '1': '5-8',
        '2': '8-12',
        '3': '6-10',
        '4': '4-8',
        '5': '3-6',
        '6-7': '2-4',
        '8-9': '1-2',
        '10+': '0-1'
      }
    },
    packages: [
      {
        name: 'aristocrats-core',
        require: [
          { tag: 'sac-outlet', count: 6 },
          { tag: 'aristocrats', count: 8 },
          { tag: 'tokens', count: 4 }
        ]
      }
    ],
    bans: [],
    requires: [],
    power_gates: {
      low: { cap: { 'tutor-broad': 2, 'fast-mana': 1 } },
      high: { floor: { 'tutor-broad': 4, 'fast-mana': 3 } }
    }
  },

  'midrange-value': {
    id: 'midrange-value',
    name: 'Midrange Value',
    formats: ['standard', 'pioneer', 'modern'],
    colors: ['B', 'G'],
    weights: {
      synergy: { 'etb': 3, 'recursion': 2 },
      roles: { 'removal-spot': 3, 'draw': 3, 'ramp': 2 }
    },
    quotas: {
      counts: {
        'removal-spot': { min: 6, max: 10 },
        'draw': { min: 4, max: 8 },
        'ramp': { min: 2, max: 6 }
      },
      creatures_curve: {
        '1': '2-4',
        '2': '4-8',
        '3': '6-10',
        '4': '6-10',
        '5': '4-6',
        '6-7': '2-4',
        '8-9': '0-2',
        '10+': '0-1'
      }
    },
    packages: [
      {
        name: 'value-core',
        require: [
          { tag: 'etb', count: 6 },
          { tag: 'creature-3mv', count: 4 },
          { tag: 'creature-4mv', count: 4 }
        ]
      }
    ],
    bans: [],
    requires: [],
    power_gates: {
      low: { cap: { 'tutor-broad': 1 } },
      high: { floor: { 'removal-spot': 8 } }
    }
  },

  'combo-storm': {
    id: 'combo-storm',
    name: 'Storm Combo',
    formats: ['legacy', 'vintage'],
    colors: ['U', 'R'],
    weights: {
      synergy: { 'storm': 5, 'spellslinger': 4 },
      roles: { 'tutor-narrow': 4, 'fast-mana': 5, 'protection': 3 }
    },
    quotas: {
      counts: {
        'tutor-narrow': { min: 8, max: 12 },
        'fast-mana': { min: 8, max: 16 },
        'protection': { min: 4, max: 8 },
        'storm': { min: 4, max: 8 }
      },
      creatures_curve: {
        '1': '0-2',
        '2': '0-2',
        '3': '0-1',
        '4': '0-1',
        '5': '0',
        '6-7': '0',
        '8-9': '0',
        '10+': '0'
      }
    },
    packages: [
      {
        name: 'storm-engine',
        require: [
          { tag: 'storm', count: 4 },
          { tag: 'fast-mana', count: 8 },
          { tag: 'tutor-narrow', count: 6 }
        ]
      }
    ],
    bans: [],
    requires: [],
    power_gates: {
      low: { cap: { 'fast-mana': 4 } },
      high: { floor: { 'fast-mana': 12, 'tutor-narrow': 8 } }
    }
  },

  'commander-counters': {
    id: 'commander-counters',
    name: 'Counters & Proliferate',
    formats: ['commander'],
    colors: ['W', 'U', 'B', 'G'],
    weights: {
      synergy: { 
        'counters': 5, 
        'proliferate': 5, 
        'planeswalker': 3,
        'tokens': 2,
        'etb': 2
      },
      roles: { 
        'draw': 4, 
        'ramp': 4,
        'removal-spot': 3, 
        'removal-sweeper': 2,
        'tutor-broad': 3,
        'protection': 2
      }
    },
    quotas: {
      counts: {
        'ramp': { min: 10, max: 14 },
        'draw': { min: 10, max: 14 },
        'removal-spot': { min: 8, max: 12 },
        'removal-sweeper': { min: 2, max: 4 },
        'counterspell': { min: 4, max: 8 },
        'tutor-broad': { min: 3, max: 6 },
        'tutor-narrow': { min: 2, max: 4 },
        'counters': { min: 12, max: 18 },
        'proliferate': { min: 4, max: 8 },
        'planeswalker': { min: 3, max: 6 },
        'wincon': { min: 3, max: 5 }
      },
      creatures_curve: {
        '1': '4-6',
        '2': '8-12',
        '3': '8-12',
        '4': '6-10',
        '5': '4-6',
        '6-7': '2-4',
        '8-9': '1-2',
        '10+': '0-1'
      }
    },
    packages: [
      {
        name: 'counters-core',
        require: [
          { tag: 'counters', count: 12 },
          { tag: 'proliferate', count: 4 },
          { tag: 'ramp', count: 10 },
          { tag: 'draw', count: 10 }
        ]
      }
    ],
    bans: [],
    requires: [],
    power_gates: {
      low: { cap: { 'tutor-broad': 2, 'fast-mana': 1 } },
      high: { floor: { 'tutor-broad': 5, 'fast-mana': 3, 'counters': 15 } }
    }
  }
};

export function getTemplate(templateId: string): ArchetypeTemplate | null {
  return BASE_TEMPLATES[templateId] || null;
}

export function getTemplatesForFormat(formatId: string): ArchetypeTemplate[] {
  return Object.values(BASE_TEMPLATES).filter(template => 
    template.formats.includes(formatId)
  );
}

export function loadCustomTemplates(): ArchetypeTemplate[] {
  // In a real implementation, this would load from user-defined YAML/JSON files
  // For now, return empty array - can be extended with file system reads
  return [];
}