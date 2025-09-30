import { Card, BuildContext, BuildResult, Pick, ArchetypeTemplate, FormatRules } from './types';
import { getFormatRules, isLegalInFormat, isLegalCommander, validateColorIdentity } from './rules/formats';
import { getTemplate } from './templates/base-templates';
import { UniversalTagger } from './tagger/universal-tagger';
import { ManabaseBuilder } from './land/manabase-builder';
import { UniversalScorer } from './score/universal-scorer';

// Seeded PRNG for deterministic builds
function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export class UniversalDeckBuilder {
  private changeLog: string[] = [];
  private rng: () => number;
  
  constructor(private seed: number = Date.now()) {
    this.rng = mulberry32(seed);
  }
  
  public buildDeck(pool: Card[], context: BuildContext): BuildResult {
    this.changeLog = [];
    this.rng = mulberry32(context.seed);
    
    const rules = getFormatRules(context.format);
    if (!rules) {
      throw new Error(`Unknown format: ${context.format}`);
    }
    
    const template = getTemplate(context.themeId);
    if (!template) {
      throw new Error(`Unknown archetype: ${context.themeId}`);
    }
    
    this.log(`Starting deck build: ${template.name} in ${rules.name}`);
    
    // 1. Filter pool by legality & identity
    let filteredPool = this.filterPool(pool, context, rules);
    this.log(`Filtered pool: ${filteredPool.length} legal cards`);
    
    // 2. Pick commander (if relevant)
    const commander = rules.hasCommander ? 
      this.pickCommander(filteredPool, context, template) : undefined;
    
    if (commander) {
      this.log(`Selected commander: ${commander.name}`);
      // Update color identity based on commander
      context.identity = commander.color_identity;
      // Re-filter pool with commander's color identity
      filteredPool = this.filterPool(pool, context, rules);
    }
    
    // 3. Build deck in stages
    let picks: Pick[] = [];
    
    picks = this.seedRequiredCards(filteredPool, template, commander, picks);
    picks = this.fillInteraction(filteredPool, template, rules, commander, picks);
    picks = this.fillAdvantage(filteredPool, template, rules, context.powerTarget, commander, picks);
    picks = this.fillCurve(filteredPool, template, commander, picks);
    picks = this.pickWincons(filteredPool, template, context, commander, picks);
    
    // 4. Build manabase
    const nonLandPicks = picks.filter(p => !p.card.type_line.includes('Land'));
    const colorRequirements = this.calculateColorRequirements(nonLandPicks);
    const manabase = ManabaseBuilder.buildManabase(
      filteredPool.filter(c => c.type_line.includes('Land')),
      context,
      rules,
      colorRequirements
    );
    
    // Add manabase to picks
    manabase.forEach(land => {
      picks.push({
        card: land,
        reason: 'Manabase requirement',
        stage: 'manabase',
        priority: 1
      });
    });
    
    // 5. Power tuning
    picks = this.tunePowerLevel(filteredPool, picks, template, rules, context, commander);
    
    
    // 6. Validate and return
    const deck = picks.map(p => p.card);
    const analysis = UniversalScorer.scoreDeck(deck, context);
    const validation = this.validateDeck(deck, commander, rules, context);
    
    return {
      deck,
      commander,
      sideboard: [], // TODO: Implement sideboard building
      analysis,
      changeLog: this.changeLog,
      validation
    };
  }
  
  private filterPool(pool: Card[], context: BuildContext, rules: FormatRules): Card[] {
    return pool.filter(card => {
      // Check format legality
      if (!isLegalInFormat(card, context.format)) return false;
      
      // Check color identity (for commander formats)
      if (rules.colorIdentityEnforced && context.identity) {
        if (!validateColorIdentity(card, context.identity)) return false;
      }
      
      // Check ban list
      if (rules.banList.includes(card.name)) return false;
      
      // Tag the card if not already tagged
      if (!card.tags || card.tags.size === 0) {
        card.tags = UniversalTagger.tagCard(card);
      }
      
      // Filter out low-quality cards
      if (!this.meetsMinimumQuality(card)) return false;
      
      return true;
    });
  }
  
  private meetsMinimumQuality(card: Card): boolean {
    // Always include lands
    if (card.type_line.includes('Land')) return true;
    
    const price = parseFloat(card.prices?.usd || '0');
    const text = card.oracle_text || '';
    
    // Exclude bulk junk equipment/artifacts
    if ((card.type_line.includes('Equipment') || card.type_line.includes('Artifact')) && 
        price < 0.25 && card.rarity === 'common') {
      
      // Check if it's just a weak stat boost or cantrip with no other value
      const junkPatterns = [
        /^equipped creature gets \+[012]\/\+[012]\.?$/i,
        /^tap: draw a card\.?$/i,
        /^sacrifice.*: draw a card\.?$/i
      ];
      
      if (junkPatterns.some(p => p.test(text.trim()))) {
        return false;
      }
    }
    
    // Exclude vanilla creatures that are overcosted
    if (card.type_line.includes('Creature') && !text && card.cmc > 3) {
      const power = parseInt(card.power || '0');
      const toughness = parseInt(card.toughness || '0');
      const stats = power + toughness;
      
      // Expect at least CMC * 2 in stats for vanilla creatures
      if (stats < card.cmc * 2) {
        return false;
      }
    }
    
    return true;
  }
  
  private pickCommander(
    pool: Card[],
    context: BuildContext,
    template: ArchetypeTemplate
  ): Card | undefined {
    const commanderCandidates = pool.filter(card => isLegalCommander(card));
    
    if (commanderCandidates.length === 0) return undefined;
    
    // Score commanders based on template synergy
    const scoredCommanders = commanderCandidates.map(card => ({
      card,
      score: this.scoreCardForTemplate(card, template) + this.scoreCardQuality(card)
    }));
    
    scoredCommanders.sort((a, b) => b.score - a.score);
    
    // Add some randomness to the top candidates
    const topCandidates = scoredCommanders.slice(0, Math.min(5, scoredCommanders.length));
    const chosen = topCandidates[Math.floor(this.rng() * topCandidates.length)];
    
    return chosen.card;
  }
  
  private seedRequiredCards(
    pool: Card[],
    template: ArchetypeTemplate,
    commander: Card | undefined,
    picks: Pick[]
  ): Pick[] {
    this.log(`Seeding required packages`);
    
    for (const pkg of template.packages) {
      for (const requirement of pkg.require) {
        const candidates = pool.filter(card => 
          card.tags.has(requirement.tag) &&
          !picks.some(p => p.card.id === card.id)
        );
        
        const needed = requirement.count;
        const selected = this.selectTopCandidates(candidates, template, needed, commander);
        
        selected.forEach(card => {
          picks.push({
            card,
            reason: `Required for ${pkg.name}: ${requirement.tag}`,
            stage: 'seed',
            priority: 10
          });
        });
        
        this.log(`Added ${selected.length} cards for ${requirement.tag}`);
      }
    }
    
    return picks;
  }
  
  private fillInteraction(
    pool: Card[],
    template: ArchetypeTemplate,
    rules: FormatRules,
    commander: Card | undefined,
    picks: Pick[]
  ): Pick[] {
    this.log(`Filling interaction suite`);
    
    const interactionTags = ['removal-spot', 'removal-sweeper', 'counterspell'];
    
    for (const tag of interactionTags) {
      const quota = template.quotas.counts[tag];
      if (!quota) continue;
      
      const currentCount = picks.filter(p => p.card.tags.has(tag)).length;
      const needed = Math.max(0, quota.min - currentCount);
      
      if (needed > 0) {
        const candidates = pool.filter(card =>
          card.tags.has(tag) &&
          !picks.some(p => p.card.id === card.id)
        );
        
        const selected = this.selectTopCandidates(candidates, template, needed, commander);
        selected.forEach(card => {
          picks.push({
            card,
            reason: `Interaction: ${tag}`,
            stage: 'interaction',
            priority: 8
          });
        });
        
        this.log(`Added ${selected.length} ${tag} cards`);
      }
    }
    
    return picks;
  }
  
  private fillAdvantage(
    pool: Card[],
    template: ArchetypeTemplate,
    rules: FormatRules,
    powerTarget: number,
    commander: Card | undefined,
    picks: Pick[]
  ): Pick[] {
    this.log(`Filling card advantage and acceleration`);
    
    const advantageTags = ['draw', 'ramp', 'tutor-broad', 'tutor-narrow'];
    
    for (const tag of advantageTags) {
      const quota = template.quotas.counts[tag];
      if (!quota) continue;
      
      // Adjust quota based on power level
      const powerMultiplier = powerTarget >= 7 ? 1.2 : powerTarget <= 4 ? 0.8 : 1.0;
      const adjustedMin = Math.floor(quota.min * powerMultiplier);
      
      const currentCount = picks.filter(p => p.card.tags.has(tag)).length;
      const needed = Math.max(0, adjustedMin - currentCount);
      
      if (needed > 0) {
        const candidates = pool.filter(card =>
          card.tags.has(tag) &&
          !picks.some(p => p.card.id === card.id)
        );
        
        const selected = this.selectTopCandidates(candidates, template, needed, commander);
        selected.forEach(card => {
          picks.push({
            card,
            reason: `Advantage: ${tag}`,
            stage: 'advantage',
            priority: 7
          });
        });
        
        this.log(`Added ${selected.length} ${tag} cards`);
      }
    }
    
    return picks;
  }
  
  private fillCurve(
    pool: Card[], 
    template: ArchetypeTemplate, 
    commander: Card | undefined,
    picks: Pick[]
  ): Pick[] {
    this.log(`Filling mana curve`);
    
    const creatureCurve = template.quotas.creatures_curve;
    
    for (const [mvRange, countRange] of Object.entries(creatureCurve)) {
      const [min, max] = countRange.split('-').map(Number);
      const target = Math.floor((min + max) / 2);
      
      const tag = `creature-${mvRange}mv`;
      const currentCount = picks.filter(p => p.card.tags.has(tag)).length;
      const needed = Math.max(0, target - currentCount);
      
      if (needed > 0) {
        const candidates = pool.filter(card =>
          card.tags.has(tag) &&
          !picks.some(p => p.card.id === card.id)
        );
        
        const selected = this.selectTopCandidates(candidates, template, needed, commander);
        selected.forEach(card => {
          picks.push({
            card,
            reason: `Curve: ${mvRange} mana`,
            stage: 'curve',
            priority: 6
          });
        });
        
        this.log(`Added ${selected.length} creatures at ${mvRange} mana`);
      }
    }
    
    return picks;
  }
  
  private pickWincons(
    pool: Card[],
    template: ArchetypeTemplate,
    context: BuildContext,
    commander: Card | undefined,
    picks: Pick[]
  ): Pick[] {
    this.log(`Selecting win conditions`);
    
    const winconQuota = template.quotas.counts['wincon'];
    if (!winconQuota) return picks;
    
    const currentCount = picks.filter(p => p.card.tags.has('wincon')).length;
    const needed = Math.max(0, winconQuota.min - currentCount);
    
    if (needed > 0) {
      const candidates = pool.filter(card =>
        card.tags.has('wincon') &&
        !picks.some(p => p.card.id === card.id)
      );
      
      const selected = this.selectTopCandidates(candidates, template, needed, commander);
      selected.forEach(card => {
        picks.push({
          card,
          reason: 'Win condition',
          stage: 'wincons',
          priority: 9
        });
      });
      
      this.log(`Added ${selected.length} win conditions`);
    }
    
    return picks;
  }
  
  private tunePowerLevel(
    pool: Card[],
    picks: Pick[],
    template: ArchetypeTemplate,
    rules: FormatRules,
    context: BuildContext,
    commander: Card | undefined
  ): Pick[] {
    this.log(`Tuning power level to ${context.powerTarget}`);
    
    for (let iteration = 0; iteration < 8; iteration++) {
      const currentDeck = picks.map(p => p.card);
      const analysis = UniversalScorer.scoreDeck(currentDeck, context);
      
      const powerDiff = analysis.power - context.powerTarget;
      
      if (Math.abs(powerDiff) <= 1) {
        this.log(`Power level converged at ${analysis.power}`);
        break;
      }
      
      if (powerDiff < 0) {
        // Need to escalate power
        picks = this.escalatePower(pool, picks, template, rules, commander);
        this.log(`Escalated power (iteration ${iteration + 1})`);
      } else {
        // Need to de-escalate power
        picks = this.deescalatePower(pool, picks, template, rules, commander);
        this.log(`De-escalated power (iteration ${iteration + 1})`);
      }
    }
    
    return picks;
  }
  
  private escalatePower(
    pool: Card[],
    picks: Pick[],
    template: ArchetypeTemplate,
    rules: FormatRules,
    commander: Card | undefined
  ): Pick[] {
    // Add cheap interaction, tutors, fast mana
    const upgrades = [
      { tag: 'tutor-broad', priority: 10 },
      { tag: 'fast-mana', priority: 9 },
      { tag: 'removal-spot', priority: 8, filter: (c: Card) => c.cmc <= 2 }
    ];
    
    for (const upgrade of upgrades) {
      const candidates = pool.filter(card =>
        card.tags.has(upgrade.tag) &&
        !picks.some(p => p.card.id === card.id) &&
        (!upgrade.filter || upgrade.filter(card))
      );
      
      if (candidates.length > 0) {
        const best = this.selectTopCandidates(candidates, template, 1, commander)[0];
        if (best) {
          // Replace a lower-priority card
          const replaceIndex = picks.findIndex(p => p.priority < upgrade.priority);
          if (replaceIndex >= 0) {
            picks[replaceIndex] = {
              card: best,
              reason: 'Power escalation',
              stage: 'tuning',
              priority: upgrade.priority
            };
            break;
          }
        }
      }
    }
    
    return picks;
  }
  
  private deescalatePower(
    pool: Card[],
    picks: Pick[],
    template: ArchetypeTemplate,
    rules: FormatRules,
    commander: Card | undefined
  ): Pick[] {
    // Replace high-power cards with more fair alternatives
    const downgrades = ['tutor-broad', 'fast-mana', 'combo-piece'];
    
    for (const tag of downgrades) {
      const highPowerIndex = picks.findIndex(p => p.card.tags.has(tag));
      if (highPowerIndex >= 0) {
        // Find a replacement
        const candidates = pool.filter(card =>
          !card.tags.has(tag) &&
          !picks.some(p => p.card.id === card.id) &&
          card.type_line.includes(picks[highPowerIndex].card.type_line.split(' ')[0])
        );
        
        if (candidates.length > 0) {
          const replacement = this.selectTopCandidates(candidates, template, 1, commander)[0];
          if (replacement) {
            picks[highPowerIndex] = {
              card: replacement,
              reason: 'Power de-escalation',
              stage: 'tuning',
              priority: 4
            };
            break;
          }
        }
      }
    }
    
    return picks;
  }
  
  private selectTopCandidates(
    candidates: Card[],
    template: ArchetypeTemplate,
    count: number,
    commander?: Card
  ): Card[] {
    if (candidates.length === 0) return [];
    
    const scored = candidates.map(card => ({
      card,
      score: this.scoreCardForTemplate(card, template) + 
             (commander ? this.scoreCommanderSynergy(card, commander) : 0) +
             (this.rng() * 0.1)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, count).map(s => s.card);
  }
  
  private scoreCommanderSynergy(card: Card, commander: Card): number {
    let synergy = 0;
    const commanderText = (commander.oracle_text || '').toLowerCase();
    const commanderTags = commander.tags;
    const cardTags = card.tags;
    
    // Direct tag overlap
    const sharedTags = Array.from(cardTags).filter(tag => commanderTags.has(tag));
    synergy += sharedTags.length * 0.5;
    
    // Specific synergies for common commander mechanics
    if (commanderText.includes('counter')) {
      if (cardTags.has('counters') || cardTags.has('proliferate')) synergy += 3;
    }
    
    if (commanderText.includes('proliferate')) {
      if (cardTags.has('counters') || cardTags.has('planeswalker')) synergy += 3;
    }
    
    if (commanderText.includes('sacrifice')) {
      if (cardTags.has('sac_outlet') || cardTags.has('aristocrats') || cardTags.has('tokens')) synergy += 3;
    }
    
    if (commanderText.includes('token')) {
      if (cardTags.has('tokens') || cardTags.has('aristocrats')) synergy += 3;
    }
    
    if (commanderText.includes('spell') || commanderText.includes('instant') || commanderText.includes('sorcery')) {
      if (cardTags.has('spellslinger') || cardTags.has('instant') || cardTags.has('sorcery')) synergy += 2;
    }
    
    if (commanderText.includes('enters the battlefield')) {
      if (cardTags.has('etb') || cardTags.has('blink')) synergy += 2;
    }
    
    if (commanderText.includes('artifact')) {
      if (cardTags.has('artifact') || cardTags.has('artifacts_matter')) synergy += 2;
    }
    
    if (commanderText.includes('enchantment')) {
      if (cardTags.has('enchantment') || cardTags.has('enchantments_matter')) synergy += 2;
    }
    
    return synergy;
  }
  
  private scoreCardForTemplate(card: Card, template: ArchetypeTemplate): number {
    let score = 0;
    
    // Synergy bonus
    for (const [tag, weight] of Object.entries(template.weights.synergy)) {
      if (card.tags.has(tag)) {
        score += weight;
      }
    }
    
    // Role bonus
    for (const [tag, weight] of Object.entries(template.weights.roles)) {
      if (card.tags.has(tag)) {
        score += weight;
      }
    }
    
    // Card quality scoring
    score += this.scoreCardQuality(card);
    
    // Mana cost efficiency (reduced weight)
    score += Math.max(0, 6 - card.cmc) * 0.05;
    
    return score;
  }
  
  private scoreCardQuality(card: Card): number {
    let qualityScore = 0;
    
    // Rarity bonus
    const rarityScores: Record<string, number> = {
      'mythic': 3,
      'rare': 2,
      'uncommon': 1,
      'common': 0
    };
    qualityScore += rarityScores[card.rarity] || 0;
    
    // Price indicates power/demand
    const price = parseFloat(card.prices?.usd || '0');
    if (price > 20) qualityScore += 4;
    else if (price > 10) qualityScore += 3;
    else if (price > 5) qualityScore += 2;
    else if (price > 1) qualityScore += 1;
    else if (price < 0.1) qualityScore -= 2; // Penalize bulk cards
    
    // Legendary bonus (commanders, high-power permanents)
    if (card.is_legendary) qualityScore += 1;
    
    // Filter out clearly weak equipment/artifacts
    if (card.type_line.includes('Equipment') || card.type_line.includes('Artifact')) {
      // Weak equipment patterns
      const weakEquipment = [
        /gets \+1\/\+0/i,
        /gets \+0\/\+1/i,
        /gets \+1\/\+1/i,
        /equipped creature has/i
      ];
      
      const isWeakEquipment = weakEquipment.some(pattern => 
        pattern.test(card.oracle_text || '')
      );
      
      // Strong artifact patterns
      const strongArtifact = [
        /add.*mana/i,
        /draw.*card/i,
        /search your library/i,
        /sacrifice.*:/i,
        /whenever/i,
        /at the beginning/i
      ];
      
      const hasStrongEffect = strongArtifact.some(pattern =>
        pattern.test(card.oracle_text || '')
      );
      
      if (isWeakEquipment && !hasStrongEffect && price < 0.5) {
        qualityScore -= 5; // Heavily penalize junk equipment
      }
    }
    
    // Penalize cards that just cantrip with no other effect
    if ((card.oracle_text || '').match(/^(tap: )?draw a card\.?$/i)) {
      qualityScore -= 3;
    }
    
    return qualityScore;
  }
  
  private calculateColorRequirements(picks: Pick[]): Record<string, number> {
    const requirements: Record<string, number> = {};
    
    for (const pick of picks) {
      for (const color of pick.card.color_identity) {
        requirements[color] = (requirements[color] || 0) + 1;
      }
    }
    
    return requirements;
  }
  
  private validateDeck(
    deck: Card[],
    commander: Card | undefined,
    rules: FormatRules,
    context: BuildContext
  ): { isLegal: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check deck size
    if (deck.length < rules.deckSize.min || deck.length > rules.deckSize.max) {
      errors.push(`Deck size ${deck.length} is outside allowed range ${rules.deckSize.min}-${rules.deckSize.max}`);
    }
    
    // Check singleton rule
    if (rules.singleton) {
      const cardCounts = new Map<string, number>();
      for (const card of deck) {
        const count = cardCounts.get(card.name) || 0;
        cardCounts.set(card.name, count + 1);
        if (count >= 1 && !card.type_line.includes('Basic Land')) {
          errors.push(`${card.name} appears more than once in singleton format`);
        }
      }
    }
    
    // Check commander rules
    if (rules.hasCommander) {
      if (!commander) {
        errors.push('Commander format requires a commander');
      } else if (!isLegalCommander(commander)) {
        errors.push(`${commander.name} is not a legal commander`);
      }
    }
    
    // Check color identity
    if (rules.colorIdentityEnforced && context.identity && commander) {
      for (const card of deck) {
        if (!validateColorIdentity(card, commander.color_identity)) {
          errors.push(`${card.name} violates color identity`);
        }
      }
    }
    
    return {
      isLegal: errors.length === 0,
      errors,
      warnings
    };
  }
  
  private log(message: string): void {
    this.changeLog.push(message);
  }
}