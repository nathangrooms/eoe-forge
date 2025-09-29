import { Card } from '@/lib/deckbuilder/types';

export interface CoachingOperation {
  op: string;
  role?: string;
  qty?: number;
  constraint?: string;
  target_pct?: number;
  line?: string;
  reason: string;
  priority: number; // 1-10, 10 being highest
}

export interface PowerAnalysis {
  subscores: Record<string, number>;
  targetPower: number;
  currentPower: number;
  format: string;
  commander?: Card;
}

export class DeckCoach {
  static generateRecommendations(
    analysis: PowerAnalysis,
    deck: Card[]
  ): { recommendations: string[]; operations: CoachingOperation[] } {
    const recommendations: string[] = [];
    const operations: CoachingOperation[] = [];
    
    const powerGap = analysis.targetPower - analysis.currentPower;
    const { subscores } = analysis;
    
    // Identify the weakest areas
    const weakestAreas = this.identifyWeakAreas(subscores, analysis.targetPower);
    
    if (Math.abs(powerGap) <= 1) {
      recommendations.push("Deck power level is well-tuned for your target.");
      return { recommendations, operations };
    }
    
    if (powerGap > 0) {
      // Need to increase power
      this.generateEscalationRecommendations(
        weakestAreas, 
        powerGap, 
        deck, 
        recommendations, 
        operations,
        analysis.targetPower
      );
    } else {
      // Need to decrease power
      this.generateDeescalationRecommendations(
        subscores,
        Math.abs(powerGap),
        deck,
        recommendations,
        operations,
        analysis.targetPower
      );
    }
    
    // Sort operations by priority
    operations.sort((a, b) => b.priority - a.priority);
    
    return { recommendations, operations };
  }

  private static identifyWeakAreas(
    subscores: Record<string, number>, 
    targetPower: number
  ): Array<{ area: string; deficit: number }> {
    const targetSubscores = this.getTargetSubscores(targetPower);
    const weakAreas: Array<{ area: string; deficit: number }> = [];
    
    Object.entries(subscores).forEach(([area, score]) => {
      const target = targetSubscores[area] || 50;
      const deficit = target - score;
      
      if (deficit > 10) {
        weakAreas.push({ area, deficit });
      }
    });
    
    return weakAreas.sort((a, b) => b.deficit - a.deficit);
  }

  private static getTargetSubscores(targetPower: number): Record<string, number> {
    if (targetPower >= 9) {
      // cEDH targets
      return {
        speed: 85,
        interaction: 80,
        tutors: 90,
        resilience: 75,
        card_advantage: 70,
        mana: 85,
        consistency: 80,
        stax_pressure: 40,
        synergy: 60
      };
    } else if (targetPower >= 7) {
      // High power targets
      return {
        speed: 70,
        interaction: 70,
        tutors: 60,
        resilience: 60,
        card_advantage: 65,
        mana: 75,
        consistency: 70,
        stax_pressure: 20,
        synergy: 70
      };
    } else if (targetPower >= 4) {
      // Mid power targets
      return {
        speed: 50,
        interaction: 55,
        tutors: 30,
        resilience: 45,
        card_advantage: 50,
        mana: 65,
        consistency: 60,
        stax_pressure: 10,
        synergy: 65
      };
    } else {
      // Casual targets
      return {
        speed: 30,
        interaction: 40,
        tutors: 15,
        resilience: 35,
        card_advantage: 40,
        mana: 55,
        consistency: 50,
        stax_pressure: 5,
        synergy: 70
      };
    }
  }

  private static generateEscalationRecommendations(
    weakAreas: Array<{ area: string; deficit: number }>,
    powerGap: number,
    deck: Card[],
    recommendations: string[],
    operations: CoachingOperation[],
    targetPower: number
  ): void {
    weakAreas.slice(0, 3).forEach((weakness, index) => {
      const priority = 10 - index * 2;
      
      switch (weakness.area) {
        case 'speed':
          recommendations.push("Add fast mana to accelerate your game plan");
          operations.push({
            op: "add_role",
            role: "fast_mana",
            qty: Math.min(3, Math.ceil(powerGap)),
            constraint: "mv<=2",
            reason: "Increase speed through fast mana acceleration",
            priority
          });
          break;
          
        case 'interaction':
          const interactionNeeded = Math.ceil(weakness.deficit / 15);
          recommendations.push(`Add ${interactionNeeded} efficient removal or counterspells`);
          operations.push({
            op: "add_role",
            role: "interaction",
            qty: interactionNeeded,
            constraint: "mv<=3",
            reason: "Improve interaction density for higher power play",
            priority
          });
          break;
          
        case 'tutors':
          const tutorsNeeded = Math.ceil(weakness.deficit / 20);
          recommendations.push(`Add ${tutorsNeeded} tutors to improve consistency`);
          operations.push({
            op: "add_role",
            role: "tutor",
            qty: tutorsNeeded,
            reason: "Increase consistency through tutoring effects",
            priority
          });
          break;
          
        case 'mana':
          const landsInDeck = deck.filter(c => c.type_line.includes('Land')).length;
          const deckSize = deck.length;
          const landRatio = landsInDeck / deckSize;
          
          if (landRatio < 0.35) {
            recommendations.push("Add 2-3 lands to improve mana consistency");
            operations.push({
              op: "add_role",
              role: "lands",
              qty: 3,
              reason: "Improve mana base consistency",
              priority
            });
          } else {
            recommendations.push("Replace ETB tapped lands with untapped sources");
            operations.push({
              op: "reduce_etb_tap",
              target_pct: targetPower >= 7 ? 0.25 : 0.30,
              reason: "Improve mana curve through untapped sources",
              priority
            });
          }
          break;
          
        case 'card_advantage':
          recommendations.push("Add repeatable card draw engines");
          operations.push({
            op: "add_role",
            role: "card_advantage",
            qty: 2,
            constraint: "repeatable",
            reason: "Improve late game through card advantage",
            priority
          });
          break;
          
        case 'resilience':
          recommendations.push("Add protection or recursion effects");
          operations.push({
            op: "add_role",
            role: "protection",
            qty: 2,
            reason: "Improve deck resilience against disruption",
            priority
          });
          break;
          
        case 'consistency':
          recommendations.push("Improve curve and add cheap card selection");
          operations.push({
            op: "improve_curve",
            reason: "Smooth mana curve for better consistency",
            priority
          });
          break;
      }
    });

    // High-power specific recommendations
    if (targetPower >= 7) {
      const hasCompactCombo = this.detectCompactCombos(deck);
      if (!hasCompactCombo) {
        recommendations.push("Consider adding a compact win condition (2-3 card combo)");
        operations.push({
          op: "add_combo_line",
          reason: "High power decks benefit from compact win conditions",
          priority: 8
        });
      }
    }
  }

  private static generateDeescalationRecommendations(
    subscores: Record<string, number>,
    powerGap: number,
    deck: Card[],
    recommendations: string[],
    operations: CoachingOperation[],
    targetPower: number
  ): void {
    const strongestAreas = Object.entries(subscores)
      .filter(([_, score]) => score > 70)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    strongestAreas.forEach(([area, score], index) => {
      const priority = 8 - index;
      
      switch (area) {
        case 'speed':
          recommendations.push("Remove fast mana and replace with fair ramp");
          operations.push({
            op: "reduce_role",
            role: "fast_mana",
            qty: Math.ceil(powerGap),
            reason: "Reduce speed to match target power level",
            priority
          });
          break;
          
        case 'tutors':
          recommendations.push("Remove some tutors to reduce consistency");
          operations.push({
            op: "reduce_role",
            role: "tutor",
            qty: Math.ceil(powerGap / 2),
            reason: "Lower tutor density for target power level",
            priority
          });
          break;
          
        case 'interaction':
          recommendations.push("Replace premium interaction with budget alternatives");
          operations.push({
            op: "replace_premium_interaction",
            reason: "Use appropriate interaction for power level",
            priority
          });
          break;
          
        case 'mana':
          recommendations.push("Add more ETB tapped lands to slow down the deck");
          operations.push({
            op: "increase_etb_tap",
            target_pct: 0.4,
            reason: "Slow down mana development for lower power",
            priority
          });
          break;
      }
    });

    // Remove compact combos for lower power
    if (targetPower <= 5) {
      const hasCombo = this.detectCompactCombos(deck);
      if (hasCombo) {
        recommendations.push("Remove compact combos for a more casual experience");
        operations.push({
          op: "remove_combo_lines",
          reason: "Compact combos are inappropriate for this power level",
          priority: 9
        });
      }
    }
  }

  private static detectCompactCombos(deck: Card[]): boolean {
    const cardNames = deck.map(c => c.name.toLowerCase());
    
    // Check for known combo pieces
    const comboChecks = [
      ['thassa', 'oracle', 'consultation'],
      ['isochron', 'scepter', 'dramatic', 'reversal'],
      ['kiki-jiki', 'zealous', 'conscripts'],
      ['splinter', 'twin', 'deceiver', 'exarch']
    ];
    
    return comboChecks.some(combo => 
      combo.every(piece => 
        cardNames.some(name => name.includes(piece))
      )
    );
  }

  static formatRecommendations(recommendations: string[]): string[] {
    return recommendations.map((rec, index) => `${index + 1}. ${rec}`);
  }

  static getQuickFixes(powerGap: number, targetPower: number): string[] {
    const fixes: string[] = [];
    
    if (powerGap > 2) {
      if (targetPower >= 7) {
        fixes.push("Add Sol Ring and 2 efficient tutors");
        fixes.push("Include 2-3 free counterspells");
        fixes.push("Add a compact combo as backup win condition");
      } else if (targetPower >= 4) {
        fixes.push("Add 2-3 signets and card draw engines");
        fixes.push("Include efficient removal suite");
        fixes.push("Improve mana base with dual lands");
      } else {
        fixes.push("Focus on curve and basic land fixing");
        fixes.push("Add incremental card advantage");
        fixes.push("Include board presence and protection");
      }
    }
    
    return fixes;
  }
}