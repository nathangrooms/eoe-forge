import { Card, BuildContext, BuildResult, ArchetypeTemplate } from './types';
import { UniversalDeckBuilder } from './build';
import { getTemplate } from './templates/base-templates';

/**
 * AI-Guided Builder that uses MTG Brain feedback to create better decks
 */
export class AIGuidedBuilder {
  private builder: UniversalDeckBuilder;
  
  constructor(seed?: number) {
    this.builder = new UniversalDeckBuilder(seed);
  }
  
  /**
   * Build a deck with AI planning insights
   */
  async buildWithPlan(
    pool: Card[],
    context: BuildContext,
    plan?: {
      strategy: string;
      keyCards: string[];
      cardQuotas: Record<string, { min: number; max: number }>;
      synergies: string[];
    }
  ): Promise<BuildResult> {
    // If we have a plan, create a custom template that incorporates it
    if (plan) {
      const baseTemplate = getTemplate(context.themeId);
      if (baseTemplate) {
        const enhancedTemplate = this.enhanceTemplateWithPlan(baseTemplate, plan);
        // Use the enhanced template by temporarily modifying context
        // In production, you'd pass this to the builder differently
      }
    }
    
    // Build the deck
    return this.builder.buildDeck(pool, context);
  }
  
  /**
   * Enhance a template with AI planning insights
   */
  private enhanceTemplateWithPlan(
    template: ArchetypeTemplate,
    plan: {
      cardQuotas: Record<string, { min: number; max: number }>;
      synergies: string[];
    }
  ): ArchetypeTemplate {
    const enhanced = { ...template };
    
    // Update quotas based on AI recommendations
    const quotaMapping: Record<string, string> = {
      'ramp': 'ramp',
      'card_draw': 'draw',
      'removal': 'removal-spot',
      'board_wipes': 'removal-sweeper',
      'counterspells': 'counterspell',
      'synergy_pieces': 'counters' // or other synergy tag
    };
    
    for (const [planKey, quota] of Object.entries(plan.cardQuotas)) {
      const templateKey = quotaMapping[planKey];
      if (templateKey && quota.min && quota.max) {
        enhanced.quotas.counts[templateKey] = {
          min: quota.min,
          max: quota.max
        };
      }
    }
    
    // Boost weights for AI-identified synergies
    for (const synergy of plan.synergies) {
      const synergyKey = synergy.toLowerCase().replace(/\s+/g, '_');
      if (enhanced.weights.synergy[synergyKey]) {
        enhanced.weights.synergy[synergyKey] += 2;
      }
    }
    
    return enhanced;
  }
  
  /**
   * Validate deck quality post-build
   */
  static validateDeckQuality(deck: Card[], commander?: Card): {
    score: number;
    issues: string[];
    strengths: string[];
  } {
    const issues: string[] = [];
    const strengths: string[] = [];
    let score = 50; // Start at 50/100
    
    // Check card quotas
    const ramp = deck.filter(c => c.tags.has('ramp')).length;
    const draw = deck.filter(c => c.tags.has('draw')).length;
    const removal = deck.filter(c => c.tags.has('removal-spot') || c.tags.has('removal-sweeper')).length;
    const creatures = deck.filter(c => c.type_line.includes('Creature') && !c.is_legendary).length;
    
    // Ramp check (should be 10-14 for Commander)
    if (ramp < 8) {
      issues.push(`Too little ramp (${ramp} cards) - aim for 10-14`);
      score -= 10;
    } else if (ramp >= 10 && ramp <= 14) {
      strengths.push(`Good ramp package (${ramp} cards)`);
      score += 10;
    }
    
    // Card draw check (should be 10-15 for Commander)
    if (draw < 8) {
      issues.push(`Insufficient card draw (${draw} cards) - aim for 10-15`);
      score -= 10;
    } else if (draw >= 10) {
      strengths.push(`Solid card draw (${draw} cards)`);
      score += 10;
    }
    
    // Interaction check (should be 10-15 total)
    if (removal < 8) {
      issues.push(`Not enough interaction (${removal} cards) - aim for 10-15`);
      score -= 10;
    } else if (removal >= 10) {
      strengths.push(`Good interaction suite (${removal} cards)`);
      score += 10;
    }
    
    // Creature count (should be 20-35 for most Commander decks)
    if (creatures < 15) {
      issues.push(`Low creature count (${creatures}) - most decks need 20-35`);
      score -= 5;
    } else if (creatures >= 20 && creatures <= 35) {
      strengths.push(`Balanced creature count (${creatures})`);
      score += 5;
    }
    
    // Mana curve analysis
    const avgCMC = deck.reduce((sum, c) => sum + c.cmc, 0) / deck.length;
    if (avgCMC < 2.5) {
      issues.push(`Mana curve too low (${avgCMC.toFixed(2)}) - lacks impactful spells`);
      score -= 10;
    } else if (avgCMC >= 2.8 && avgCMC <= 3.5) {
      strengths.push(`Good mana curve (${avgCMC.toFixed(2)} avg CMC)`);
      score += 10;
    } else if (avgCMC > 4.5) {
      issues.push(`Mana curve too high (${avgCMC.toFixed(2)}) - may be too slow`);
      score -= 5;
    }
    
    // Check for card quality (price as proxy)
    const avgPrice = deck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0) / deck.length;
    const bulkCards = deck.filter(c => parseFloat(c.prices?.usd || '0') < 0.25).length;
    
    if (bulkCards > 20) {
      issues.push(`Too many bulk cards (${bulkCards}) - lacks impactful pieces`);
      score -= 15;
    }
    
    // Commander synergy check
    if (commander) {
      const commanderText = (commander.oracle_text || '').toLowerCase();
      let synergyCount = 0;
      
      if (commanderText.includes('counter')) {
        synergyCount = deck.filter(c => c.tags.has('counters') || c.tags.has('proliferate')).length;
      } else if (commanderText.includes('token')) {
        synergyCount = deck.filter(c => c.tags.has('tokens')).length;
      } else if (commanderText.includes('sacrifice')) {
        synergyCount = deck.filter(c => c.tags.has('sac_outlet') || c.tags.has('aristocrats')).length;
      }
      
      if (synergyCount < 10) {
        issues.push(`Weak commander synergy - only ${synergyCount} synergistic cards`);
        score -= 10;
      } else if (synergyCount >= 15) {
        strengths.push(`Strong commander synergy (${synergyCount} cards)`);
        score += 15;
      }
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      strengths
    };
  }
}
