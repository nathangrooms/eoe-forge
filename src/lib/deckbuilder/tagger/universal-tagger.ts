import { Card } from '../types';

// Universal card tagger - deterministic tagging for all MTG cards
export class UniversalTagger {
  private static readonly PATTERNS = {
    // Role patterns
    ramp: [
      /add [\{\w\}]+ to your mana pool/i,
      /add.*mana.*any.*color/i,
      /add.*\{[wubrgc]\}/i,
      /create a treasure/i,
      /create.*treasure token/i,
      /search.*basic land.*put.*onto the battlefield/i,
      /search your library for.*land.*battlefield/i,
      /you may put a land card/i,
      /put.*land.*onto the battlefield/i,
      /whenever a land enters.*add/i
    ],
    
    tutors_broad: [
      /search your library for a card/i,
      /search your library.*card.*hand/i,
      /tutor/i
    ],
    
    tutors_narrow: [
      /search your library for a.*creature card/i,
      /search your library for.*creature/i,
      /search your library for a.*instant.*sorcery/i,
      /search your library for.*instant.*sorcery/i,
      /search your library for a.*artifact/i,
      /search your library for.*artifact/i,
      /search your library for a.*enchantment/i,
      /search your library for.*enchantment/i,
      /search your library for.*land/i
    ],
    
    removal_spot: [
      /(destroy|exile) target (creature|artifact|enchantment|permanent)/i,
      /(destroy|exile).*target/i,
      /target.*gets -\d+\/-\d+ until end of turn/i,
      /deal \d+ damage to (target creature|any target)/i,
      /target.*loses all abilities/i,
      /return target.*to.*hand/i,
      /target.*owner.*hand/i
    ],
    
    removal_sweeper: [
      /(destroy|exile) all (creatures|artifacts|enchantments)/i,
      /all creatures get -\d+\/-\d+/i,
      /damage to each creature/i,
      /wrath/i,
      /board wipe/i
    ],
    
    counterspell: [
      /counter target spell/i,
      /counter target.*spell/i
    ],
    
    draw: [
      /draw (a card|\d+ cards?)/i,
      /you may draw/i,
      /draws? a card/i,
      /draw.*equal to/i,
      /each player draws/i,
      /whenever.*draws.*draw/i,
      /card advantage/i
    ],
    
    protection: [
      /hexproof/i,
      /shroud/i,
      /protection from/i,
      /indestructible/i,
      /can't be blocked/i
    ],
    
    recursion: [
      /return.*from your graveyard to your hand/i,
      /return.*from your graveyard to the battlefield/i
    ],
    
    wincon: [
      /you win the game/i,
      /target player loses the game/i,
      /poison counter/i,
      /mill.*cards.*library/i
    ],
    
    // Synergy patterns
    tokens: [
      /create.*token/i,
      /\d+\/\d+ token/i,
      /token creatures?/i
    ],
    
    aristocrats: [
      /whenever.*creature.*dies/i,
      /when.*dies.*you.*may/i,
      /sacrifice.*creature/i
    ],
    
    sac_outlet: [
      /sacrifice.*:/i,
      /sacrifice another/i,
      /sacrifice a creature/i
    ],
    
    blink: [
      /exile.*return.*(the battlefield|under.*control)/i,
      /flicker/i,
      /enters the battlefield.*exile/i
    ],
    
    etb: [
      /when.*enters the battlefield/i,
      /enters the battlefield.*may/i
    ],
    
    spellslinger: [
      /whenever you cast.*instant.*sorcery/i,
      /instant.*sorcery.*spells/i,
      /noncreature spell/i
    ],
    
    prowess: [
      /prowess/i,
      /whenever you cast a noncreature spell/i
    ],
    
    counters: [
      /\+1\/\+1 counter/i,
      /put.*\+1\/\+1 counters/i,
      /counter.*on.*creature/i,
      /counter.*on/i,
      /enters.*with.*counter/i,
      /loyalty counter/i,
      /charge counter/i,
      /experience counter/i,
      /gets.*\+1\/\+1 for each/i,
      /modular/i,
      /undying/i,
      /persist/i,
      /evolve/i,
      /adapt/i,
      /bolster/i,
      /support/i,
      /renown/i
    ],
    
    proliferate: [
      /proliferate/i,
      /double.*counters/i,
      /each counter/i
    ],
    
    artifacts_matter: [
      /artifact.*you control/i,
      /whenever.*artifact.*enters/i,
      /affinity for artifacts/i
    ],
    
    enchantments_matter: [
      /enchantment.*you control/i,
      /whenever.*enchantment.*enters/i,
      /constellation/i
    ],
    
    lands_matter: [
      /landfall/i,
      /whenever a land enters/i,
      /land.*you control/i
    ],
    
    tribal: [
      /creature type/i,
      /creatures you control get/i,
      /creatures of the chosen type/i
    ],
    
    reanimator: [
      /return.*creature.*graveyard.*battlefield/i,
      /reanimate/i,
      /unearth/i
    ],
    
    storm: [
      /storm/i,
      /spells cast.*turn/i
    ],
    
    energy: [
      /energy counter/i,
      /\{e\}/i,
      /get.*energy/i
    ]
  };

  public static tagCard(card: Card): Set<string> {
    const tags = new Set<string>();
    const text = (card.oracle_text || '').toLowerCase();
    const typeLine = card.type_line.toLowerCase();
    
    // Tag based on patterns
    for (const [tag, patterns] of Object.entries(this.PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text) || pattern.test(typeLine)) {
          tags.add(tag);
          break;
        }
      }
    }
    
    // Type-based tags
    if (typeLine.includes('creature')) tags.add('creature');
    if (typeLine.includes('instant')) tags.add('instant');
    if (typeLine.includes('sorcery')) tags.add('sorcery');
    if (typeLine.includes('artifact')) tags.add('artifact');
    if (typeLine.includes('enchantment')) tags.add('enchantment');
    if (typeLine.includes('planeswalker')) tags.add('planeswalker');
    if (typeLine.includes('land')) tags.add('land');
    
    // Basic land types
    if (typeLine.includes('basic')) tags.add('basic-land');
    
    // Fast mana detection
    if (card.cmc === 0 && text.includes('add') && text.includes('mana')) {
      tags.add('fast-mana');
    }
    
    // Mana rocks and dorks (1-2 CMC ramp)
    if ((card.cmc === 1 || card.cmc === 2) && text.includes('add') && text.includes('mana')) {
      tags.add('ramp');
    }
    
    // ETB tapped detection
    if (text.includes('enters the battlefield tapped') || text.includes('enters tapped')) {
      tags.add('etb-tapped');
    }
    
    // Mana value categories for creatures
    if (typeLine.includes('creature')) {
      const mv = card.cmc;
      if (mv <= 1) tags.add('creature-1mv');
      else if (mv === 2) tags.add('creature-2mv');
      else if (mv === 3) tags.add('creature-3mv');
      else if (mv === 4) tags.add('creature-4mv');
      else if (mv === 5) tags.add('creature-5mv');
      else if (mv >= 6 && mv <= 7) tags.add('creature-6-7mv');
      else if (mv >= 8 && mv <= 9) tags.add('creature-8-9mv');
      else if (mv >= 10) tags.add('creature-10plus');
    }
    
    // Keyword abilities from keywords array
    for (const keyword of card.keywords) {
      tags.add(keyword.toLowerCase().replace(/\s+/g, '-'));
    }
    
    // Color identity tags
    for (const color of card.color_identity) {
      tags.add(`identity-${color.toLowerCase()}`);
    }
    
    // CMV-based categories
    if (card.cmc <= 2) tags.add('low-mv');
    else if (card.cmc <= 4) tags.add('mid-mv');
    else tags.add('high-mv');
    
    return tags;
  }

  public static extractTribalType(card: Card): string | null {
    const text = card.oracle_text || '';
    const typeLine = card.type_line;
    
    // Look for creature types in type line
    const creatureTypes = [
      'Human', 'Elf', 'Goblin', 'Wizard', 'Warrior', 'Soldier', 'Beast', 'Dragon',
      'Angel', 'Demon', 'Vampire', 'Zombie', 'Spirit', 'Elemental', 'Artifact',
      'Merfolk', 'Knight', 'Cleric', 'Rogue', 'Shaman', 'Scout', 'Giant'
    ];
    
    for (const type of creatureTypes) {
      if (typeLine.toLowerCase().includes(type.toLowerCase()) ||
          text.toLowerCase().includes(type.toLowerCase())) {
        return type;
      }
    }
    
    return null;
  }
}