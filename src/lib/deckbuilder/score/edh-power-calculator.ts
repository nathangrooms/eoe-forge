import { Card } from '@/lib/deckbuilder/types';
import { FeatureExtractor, FeatureExtraction } from './features';
import { PlayabilitySimulator, PlayabilityMetrics, GoldfishMetrics } from './simulation';
import { DeckCoach, CoachingOperation } from './coach';

export interface EDHPowerScore {
  power: number;
  band: 'casual' | 'mid' | 'high' | 'cedh';
  subscores: {
    speed: number;
    interaction: number;
    tutors: number;
    resilience: number;
    card_advantage: number;
    mana: number;
    consistency: number;
    stax_pressure: number;
    synergy: number;
  };
  flags: {
    no_tutors: boolean;
    no_game_changers: boolean;
  };
  diagnostics: {
    tutors: {
      count_raw: number;
      count_quality: number;
      list: Array<{name: string; quality: string; mv: number}>;
    };
    game_changers: {
      count: number;
      classes: {
        compact_combo: number;
        finisher_bombs: number;
        inevitability_engines: number;
        massive_swing: number;
      };
      list: Array<{name: string; class: string; reason: string}>;
    };
  };
  playability: PlayabilityMetrics;
  goldfish: GoldfishMetrics;
  legality: {
    ok: boolean;
    issues: string[];
  };
  drivers: string[];
  drags: string[];
  recommendations: string[];
  coaching_operations: CoachingOperation[];
  thresholds: {
    casual_max: number;
    mid_max: number;
    high_max: number;
  };
}

export interface PowerCalculatorConfig {
  weights: {
    speed: number;
    interaction: number;
    tutors: number;
    resilience: number;
    card_advantage: number;
    mana: number;
    consistency: number;
    stax_pressure: number;
    synergy: number;
  };
  thresholds: {
    casual_max: number;
    mid_max: number;
    high_max: number;
  };
  logistic_params: {
    mu: number;
    sigma: number;
  };
}

export class EDHPowerCalculator {
  private static defaultConfig: PowerCalculatorConfig = {
    weights: {
      speed: 0.20,
      interaction: 0.15,
      tutors: 0.12,
      resilience: 0.12,
      card_advantage: 0.10,
      mana: 0.12,
      consistency: 0.12,
      stax_pressure: 0.04,
      synergy: 0.03
    },
    thresholds: {
      casual_max: 3.4,
      mid_max: 6.6,
      high_max: 8.5
    },
    logistic_params: {
      mu: 55,
      sigma: 12
    }
  };

  static calculatePower(
    deck: Card[],
    format: string = 'commander',
    seed: number = 42,
    commander?: Card,
    targetPower?: number,
    config: PowerCalculatorConfig = this.defaultConfig
  ): EDHPowerScore {
    // Extract features
    const features = FeatureExtractor.extractFeatures(deck, commander);
    
    // Calculate subscores (0-100 scale)
    let subscores = this.calculateSubscores(features, deck, commander);
    
    // Calculate raw weighted score
    const rawScore = this.calculateWeightedScore(subscores, config.weights);
    
    // Convert to 1-10 power scale using logistic function
    let power = this.mapToPowerScale(rawScore, config.logistic_params);
    
    // Determine band (before adjustments for threshold checks)
    const band = this.determineBand(power, config.thresholds);
    
    // Detect flags based on band thresholds
    const tutorThreshold = band === 'cedh' ? 6.0 : (band === 'high' ? 3.0 : 1.5);
    const gcThreshold = (band === 'cedh' || band === 'high') ? 2 : 1;
    
    const no_tutors = features.tutorQuality < tutorThreshold;
    const no_game_changers = features.gameChangerCount < gcThreshold;
    
    // Apply penalties if flags are true
    let powerAdjustment = 0;
    
    if (no_tutors) {
      subscores = { ...subscores, tutors: Math.min(subscores.tutors, 35) };
      powerAdjustment -= band === 'cedh' ? 1.0 : 0.6;
    }
    
    if (no_game_changers) {
      subscores = {
        ...subscores,
        speed: Math.max(0, subscores.speed - 8),
        resilience: Math.max(0, subscores.resilience - 6)
      };
      powerAdjustment -= band === 'cedh' ? 1.4 : 0.8;
    }
    
    // Recalculate power with adjusted subscores
    if (powerAdjustment !== 0) {
      const adjustedRawScore = this.calculateWeightedScore(subscores, config.weights);
      power = this.mapToPowerScale(adjustedRawScore, config.logistic_params) + powerAdjustment;
      power = Math.max(1, Math.min(10, power)); // Clamp to 1-10
    }
    
    // Calculate playability metrics
    const playability = PlayabilitySimulator.simulatePlayability(deck, seed);
    
    // Calculate goldfish metrics
    const goldfish = PlayabilitySimulator.calculateGoldfishMetrics(deck, features);
    
    // Check legality
    const legality = this.checkLegality(deck, format, commander);
    
    // Identify drivers and drags
    const drivers = this.identifyDrivers(subscores, power);
    const drags = this.identifyDrags(subscores, power);
    
    // Generate coaching recommendations
    const coachingResult = targetPower 
      ? DeckCoach.generateRecommendations({
          subscores,
          targetPower,
          currentPower: power,
          format,
          commander
        }, deck)
      : { recommendations: [], operations: [] };
    
    return {
      power: Math.round(power * 10) / 10,
      band,
      subscores,
      flags: {
        no_tutors,
        no_game_changers
      },
      diagnostics: {
        tutors: {
          count_raw: features.tutorDetails.length,
          count_quality: features.tutorQuality,
          list: features.tutorDetails
        },
        game_changers: {
          count: features.gameChangerCount,
          classes: {
            compact_combo: features.gameChangerDetails.compact_combo,
            finisher_bombs: features.gameChangerDetails.finisher_bombs,
            inevitability_engines: features.gameChangerDetails.inevitability_engines,
            massive_swing: features.gameChangerDetails.massive_swing
          },
          list: features.gameChangerDetails.list
        }
      },
      playability,
      goldfish,
      legality,
      drivers,
      drags,
      recommendations: coachingResult.recommendations,
      coaching_operations: coachingResult.operations,
      thresholds: config.thresholds
    };
  }

  private static calculateSubscores(
    features: FeatureExtraction,
    deck: Card[],
    commander?: Card
  ): EDHPowerScore['subscores'] {
    return {
      speed: Math.min(100, features.speedProxy),
      interaction: Math.min(100, features.interactionDensity),
      tutors: Math.min(100, features.tutorDensity),
      resilience: Math.min(100, features.resilienceIndex),
      card_advantage: Math.min(100, features.cardAdvantageEngines),
      mana: Math.min(100, features.manaQuality),
      consistency: Math.min(100, features.consistencyMetrics),
      stax_pressure: Math.min(100, features.staxPressure),
      synergy: Math.min(100, features.synergyScore)
    };
  }

  private static calculateWeightedScore(
    subscores: EDHPowerScore['subscores'],
    weights: PowerCalculatorConfig['weights']
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;
    
    Object.entries(weights).forEach(([key, weight]) => {
      const score = subscores[key as keyof typeof subscores];
      weightedSum += score * weight;
      totalWeight += weight;
    });
    
    return weightedSum / totalWeight;
  }

  private static mapToPowerScale(
    rawScore: number,
    params: { mu: number; sigma: number }
  ): number {
    // Logistic function to map 0-100 to 1-10
    const normalized = (rawScore - params.mu) / params.sigma;
    const sigmoid = 1 / (1 + Math.exp(-normalized));
    return 1 + (sigmoid * 9);
  }

  private static determineBand(
    power: number,
    thresholds: PowerCalculatorConfig['thresholds']
  ): 'casual' | 'mid' | 'high' | 'cedh' {
    if (power <= thresholds.casual_max) return 'casual';
    if (power <= thresholds.mid_max) return 'mid';
    if (power <= thresholds.high_max) return 'high';
    return 'cedh';
  }

  private static checkLegality(
    deck: Card[],
    format: string,
    commander?: Card
  ): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Basic format checks
    if (format === 'commander') {
      if (!commander) {
        issues.push('Commander format requires a commander');
      }
      
      const totalCards = deck.length;
      const expectedSize = commander ? 99 : 100;
      
      if (totalCards !== expectedSize) {
        issues.push(`Deck has ${totalCards} cards, expected ${expectedSize}`);
      }
      
      // Check singleton rule (except basic lands)
      const cardCounts = new Map<string, number>();
      deck.forEach(card => {
        const name = card.name;
        const isBasicLand = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(name);
        
        if (!isBasicLand) {
          const count = cardCounts.get(name) || 0;
          cardCounts.set(name, count + 1);
        }
      });
      
      cardCounts.forEach((count, name) => {
        if (count > 1) {
          issues.push(`${name} appears ${count} times (singleton rule violation)`);
        }
      });
      
      // Color identity check
      if (commander) {
        const commanderColors = new Set(commander.color_identity || []);
        deck.forEach(card => {
          const cardColors = card.color_identity || [];
          const hasInvalidColors = cardColors.some(color => !commanderColors.has(color));
          if (hasInvalidColors) {
            issues.push(`${card.name} has colors outside commander's identity`);
          }
        });
      }
    }
    
    return {
      ok: issues.length === 0,
      issues
    };
  }

  private static identifyDrivers(
    subscores: EDHPowerScore['subscores'],
    power: number
  ): string[] {
    const drivers: string[] = [];
    const threshold = power >= 7 ? 70 : power >= 4 ? 60 : 50;
    
    Object.entries(subscores).forEach(([category, score]) => {
      if (score >= threshold) {
        drivers.push(this.getDriverDescription(category, score));
      }
    });
    
    return drivers.slice(0, 3); // Top 3 drivers
  }

  private static identifyDrags(
    subscores: EDHPowerScore['subscores'],
    power: number
  ): string[] {
    const drags: string[] = [];
    const threshold = power >= 7 ? 50 : power >= 4 ? 40 : 30;
    
    Object.entries(subscores).forEach(([category, score]) => {
      if (score <= threshold) {
        drags.push(this.getDragDescription(category, score));
      }
    });
    
    return drags.slice(0, 3); // Top 3 drags
  }

  private static getDriverDescription(category: string, score: number): string {
    const descriptions = {
      speed: `Explosive speed (${Math.round(score)}/100) from fast mana and low curve`,
      interaction: `Strong interaction suite (${Math.round(score)}/100) with efficient answers`,
      tutors: `High tutor density (${Math.round(score)}/100) for consistency`,
      resilience: `Excellent resilience (${Math.round(score)}/100) with protection`,
      card_advantage: `Strong card advantage (${Math.round(score)}/100) engines`,
      mana: `Optimized manabase (${Math.round(score)}/100) with fixing`,
      consistency: `High consistency (${Math.round(score)}/100) with smooth curve`,
      stax_pressure: `Significant stax pressure (${Math.round(score)}/100)`,
      synergy: `Excellent synergy (${Math.round(score)}/100) between cards`
    };
    
    return descriptions[category] || `Strong ${category} (${Math.round(score)}/100)`;
  }

  private static getDragDescription(category: string, score: number): string {
    const descriptions = {
      speed: `Slow development (${Math.round(score)}/100) - needs acceleration`,
      interaction: `Limited interaction (${Math.round(score)}/100) - vulnerable to threats`,
      tutors: `Low tutor count (${Math.round(score)}/100) - inconsistent execution`,
      resilience: `Poor resilience (${Math.round(score)}/100) - fragile game plan`,
      card_advantage: `Limited card draw (${Math.round(score)}/100) - runs out of gas`,
      mana: `Mana issues (${Math.round(score)}/100) - fixing or curve problems`,
      consistency: `Inconsistent draws (${Math.round(score)}/100) - curve or redundancy issues`,
      stax_pressure: `No resource denial (${Math.round(score)}/100)`,
      synergy: `Poor synergy (${Math.round(score)}/100) - cards don't work together`
    };
    
    return descriptions[category] || `Weak ${category} (${Math.round(score)}/100)`;
  }

  // Configuration methods for tuning
  static updateConfig(newConfig: Partial<PowerCalculatorConfig>): PowerCalculatorConfig {
    return {
      ...this.defaultConfig,
      ...newConfig,
      weights: { ...this.defaultConfig.weights, ...newConfig.weights },
      thresholds: { ...this.defaultConfig.thresholds, ...newConfig.thresholds },
      logistic_params: { ...this.defaultConfig.logistic_params, ...newConfig.logistic_params }
    };
  }

  static calibrateForDeck(
    knownDecks: Array<{ deck: Card[]; commander?: Card; expectedPower: number }>,
    currentConfig: PowerCalculatorConfig = this.defaultConfig
  ): PowerCalculatorConfig {
    // This would implement calibration logic based on known deck ratings
    // For now, return the current config
    // In practice, this could use gradient descent or other optimization
    return currentConfig;
  }
}