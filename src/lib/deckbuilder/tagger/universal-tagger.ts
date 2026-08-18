import { Card } from '../types';

/**
 * In-memory fallback tagger for a card pool that arrives without `cards.tags`.
 *
 * The authoritative role vocabulary is `src/lib/cards/tagger.ts`, compiled into
 * `public.derive_card_tags` and stored on every one of the 34,088 rows. This
 * class only runs when a pool reaches the builder untagged, and it exists to
 * keep the quota machinery working in that case.
 *
 * ⚠️ THE KEYS OF `PATTERNS` ARE THE EMITTED TAG NAMES.
 *
 * They were `removal_spot`, `removal_sweeper`, `tutors_broad`, `tutors_narrow`,
 * `sac_outlet`, `artifacts_matter`, `enchantments_matter`, `lands_matter` and
 * `tribal` — underscores, and two of them pluralised. Every template in
 * `templates/base-templates.ts` asks for the hyphenated spelling
 * (`removal-spot`, `tutor-broad`, `sac-outlet`, …), so those quotas could never
 * be satisfied from a pool this tagger had classified: `fillInteraction` looked
 * for `removal-spot`, found zero cards carrying it, and gave up. They are now
 * spelled exactly as the database spells them.
 */
export class UniversalTagger {
  private static readonly PATTERNS: Record<string, RegExp[]> = {
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
    
    'tutor-broad': [
      /search your library for a card/i,
      /search your library.*card.*hand/i,
      /tutor/i
    ],
    
    'tutor-narrow': [
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
    
    'removal-spot': [
      /(destroy|exile) target (creature|artifact|enchantment|permanent)/i,
      /(destroy|exile).*target/i,
      /target.*gets -\d+\/-\d+ until end of turn/i,
      /deal \d+ damage to (target creature|any target)/i,
      /target.*loses all abilities/i,
      /return target.*to.*hand/i,
      /target.*owner.*hand/i
    ],
    
    'removal-sweeper': [
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
    
    'sac-outlet': [
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
    
    'artifacts-matter': [
      /artifact.*you control/i,
      /whenever.*artifact.*enters/i,
      /affinity for artifacts/i
    ],
    
    'enchantments-matter': [
      /enchantment.*you control/i,
      /whenever.*enchantment.*enters/i,
      /constellation/i
    ],
    
    'lands-matter': [
      /landfall/i,
      /whenever a land enters/i,
      /land.*you control/i
    ],
    
    'tribal-payoff': [
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

  /**
   * Everything derivable from a card's *shape* rather than its rules text:
   * card type, curve bucket, colour identity, printed keywords.
   *
   * `public.derive_card_tags` deliberately emits none of these beyond the card
   * types — a curve bucket is a property of the deck slot, not of the card's
   * role — but `fillCurve` fills `creatures_curve` by asking for
   * `creature-3mv`, and `tunePowerLevel` reads `low-mv`. So a pool that arrives
   * already carrying database tags still needs these merged in, which is what
   * `UniversalDeckBuilder.filterPool` does. They are cheap, deterministic, and
   * cannot contradict a database tag because the two vocabularies are disjoint
   * apart from the card types, which agree by construction.
   */
  public static structuralTags(card: Card): Set<string> {
    const tags = new Set<string>();
    const text = (card.oracle_text || '').toLowerCase();
    const typeLine = card.type_line.toLowerCase();

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

  /**
   * Full classification for a card the database has not tagged.
   *
   * Roles from `PATTERNS`, plus two mana heuristics, plus everything
   * `structuralTags` derives. The two heuristics live here and not in
   * `structuralTags` on purpose: "cmc ≤ 2 and the text says add and mana" calls
   * Chromatic Sphere ramp and would over-tag a card the database has already
   * classified precisely.
   */
  public static tagCard(card: Card): Set<string> {
    const text = (card.oracle_text || '').toLowerCase();
    const typeLine = card.type_line.toLowerCase();
    const tags = this.structuralTags(card);

    for (const [tag, patterns] of Object.entries(this.PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text) || pattern.test(typeLine)) {
          tags.add(tag);
          break;
        }
      }
    }

    // Fast mana detection
    if (card.cmc === 0 && text.includes('add') && text.includes('mana')) {
      tags.add('fast-mana');
    }

    // Mana rocks and dorks (1-2 CMC ramp)
    if ((card.cmc === 1 || card.cmc === 2) && text.includes('add') && text.includes('mana')) {
      tags.add('ramp');
    }

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