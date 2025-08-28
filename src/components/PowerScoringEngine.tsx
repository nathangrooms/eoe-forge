import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useDeckStore } from '@/stores/deckStore';

interface PowerScore {
  power: number;
  score: number;
  band: string;
  subscores: Record<string, number>;
  drivers: string[];
  drags: string[];
  recommendations: Array<{
    change: string;
    impact: Record<string, number>;
  }>;
}

interface PowerScoringEngineProps {
  deck?: any[];
  format?: string;
}

export function PowerScoringEngine({ deck, format }: PowerScoringEngineProps) {
  const { cards: deckCards, format: deckFormat } = useDeckStore();
  
  const activeDeck = deck || deckCards;
  const activeFormat = format || deckFormat;

  // Calculate power score based on the deck
  const calculatePowerScore = React.useCallback((): PowerScore => {
    if (!activeDeck || activeDeck.length === 0) {
      return {
        power: 5,
        score: 50,
        band: 'Casual',
        subscores: {
          speed: 0,
          interaction: 0,
          ramp: 0,
          cardAdvantage: 0,
          tutors: 0,
          wincon: 0,
          resilience: 0,
          mana: 0,
          synergy: 0
        },
        drivers: [],
        drags: [],
        recommendations: []
      };
    }

    // Simplified scoring algorithm
    const subscores = {
      speed: calculateSpeedScore(activeDeck),
      interaction: calculateInteractionScore(activeDeck),
      ramp: calculateRampScore(activeDeck),
      cardAdvantage: calculateCardAdvantageScore(activeDeck),
      tutors: calculateTutorScore(activeDeck),
      wincon: calculateWinconScore(activeDeck),
      resilience: calculateResilienceScore(activeDeck),
      mana: calculateManaScore(activeDeck),
      synergy: calculateSynergyScore(activeDeck)
    };

    // Weighted average based on format
    const weights = getFormatWeights(activeFormat);
    const weightedScore = Object.entries(subscores).reduce((total, [key, score]) => {
      return total + (score * (weights[key] || 1));
    }, 0) / Object.values(weights).reduce((a, b) => a + b, 0);

    // Convert to 1-10 scale using logistic function
    const power = Math.max(1, Math.min(10, Math.round(1 + 9 / (1 + Math.exp(-0.1 * (weightedScore - 50))))));
    
    const band = getPowerBand(power);
    const drivers = getDrivers(subscores);
    const drags = getDrags(subscores);
    const recommendations = getRecommendations(subscores, power);

    return {
      power,
      score: Math.round(weightedScore),
      band,
      subscores,
      drivers,
      drags,
      recommendations
    };
  }, [activeDeck, activeFormat]);

  const scoreData = calculatePowerScore();

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Overall Power Score */}
        <div className="text-center">
          <div className="text-4xl font-bold text-primary mb-2">
            {scoreData.power}/10
          </div>
          <Badge variant="outline" className="text-sm">
            {scoreData.band}
          </Badge>
          <p className="text-sm text-muted-foreground mt-2">
            Raw Score: {scoreData.score}/100
          </p>
        </div>

        {/* Subscores */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Detailed Analysis</h4>
          {Object.entries(scoreData.subscores).map(([category, score]) => (
            <div key={category} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="capitalize">{category.replace(/([A-Z])/g, ' $1')}</span>
                <span>{Math.round(score)}/100</span>
              </div>
              <Progress value={score} className="h-2" />
            </div>
          ))}
        </div>

        {/* Drivers */}
        {scoreData.drivers.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-green-600">Strengths</h4>
            <div className="space-y-1">
              {scoreData.drivers.map((driver, index) => (
                <p key={index} className="text-sm text-green-700">
                  • {driver}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Drags */}
        {scoreData.drags.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-orange-600">Weaknesses</h4>
            <div className="space-y-1">
              {scoreData.drags.map((drag, index) => (
                <p key={index} className="text-sm text-orange-700">
                  • {drag}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {scoreData.recommendations.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-blue-600">Recommendations</h4>
            <div className="space-y-1">
              {scoreData.recommendations.map((rec, index) => (
                <p key={index} className="text-sm text-blue-700">
                  • {rec.change}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Helper functions for scoring
function calculateSpeedScore(deck: any[]): number {
  const lowCostCards = deck.filter(card => card.cmc <= 2).length;
  const fastMana = deck.filter(card => 
    card.type_line?.includes('Artifact') && 
    card.oracle_text?.includes('add') && 
    card.cmc <= 2
  ).length;
  
  return Math.min(100, (lowCostCards * 2) + (fastMana * 10));
}

function calculateInteractionScore(deck: any[]): number {
  const removal = deck.filter(card => 
    card.oracle_text?.includes('destroy') || 
    card.oracle_text?.includes('exile')
  ).length;
  const counterspells = deck.filter(card => 
    card.oracle_text?.includes('counter target')
  ).length;
  
  return Math.min(100, (removal * 8) + (counterspells * 10));
}

function calculateRampScore(deck: any[]): number {
  const rampCards = deck.filter(card => 
    card.oracle_text?.includes('add') && card.oracle_text?.includes('mana')
  ).length;
  
  return Math.min(100, rampCards * 10);
}

function calculateCardAdvantageScore(deck: any[]): number {
  const drawCards = deck.filter(card => 
    card.oracle_text?.includes('draw') && card.oracle_text?.includes('card')
  ).length;
  
  return Math.min(100, drawCards * 12);
}

function calculateTutorScore(deck: any[]): number {
  const tutors = deck.filter(card => 
    card.oracle_text?.includes('search') && card.oracle_text?.includes('library')
  ).length;
  
  return Math.min(100, tutors * 15);
}

function calculateWinconScore(deck: any[]): number {
  const legendaryCreatures = deck.filter(card => 
    card.type_line?.includes('Legendary') && card.type_line?.includes('Creature')
  ).length;
  const planeswalkers = deck.filter(card => 
    card.type_line?.includes('Planeswalker')
  ).length;
  
  return Math.min(100, (legendaryCreatures * 8) + (planeswalkers * 12));
}

function calculateResilienceScore(deck: any[]): number {
  const protection = deck.filter(card => 
    card.oracle_text?.includes('hexproof') || 
    card.oracle_text?.includes('indestructible') ||
    card.oracle_text?.includes('protection')
  ).length;
  
  return Math.min(100, protection * 15);
}

function calculateManaScore(deck: any[]): number {
  const lands = deck.filter(card => card.type_line?.includes('Land')).length;
  const deckSize = deck.length;
  const ratio = deckSize > 0 ? lands / deckSize : 0;
  
  // Optimal land ratio is around 35-40% for most decks
  const optimal = 0.375;
  const deviation = Math.abs(ratio - optimal);
  
  return Math.max(0, 100 - (deviation * 200));
}

function calculateSynergyScore(deck: any[]): number {
  // Simplified synergy calculation based on shared types and themes
  const types = deck.reduce((acc, card) => {
    const type = card.type_line?.split(' ')[0];
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const maxType = Math.max(...Object.values(types).map(Number), 0);
  return Math.min(100, (maxType / deck.length) * 150);
}

function getFormatWeights(format: string): Record<string, number> {
  switch (format) {
    case 'commander':
      return {
        speed: 0.8,
        interaction: 1.2,
        ramp: 1.1,
        cardAdvantage: 1.3,
        tutors: 0.9,
        wincon: 1.0,
        resilience: 1.1,
        mana: 1.0,
        synergy: 1.4
      };
    case 'modern':
      return {
        speed: 1.3,
        interaction: 1.1,
        ramp: 0.8,
        cardAdvantage: 1.0,
        tutors: 1.2,
        wincon: 1.2,
        resilience: 0.9,
        mana: 1.1,
        synergy: 1.0
      };
    case 'standard':
      return {
        speed: 1.1,
        interaction: 1.0,
        ramp: 0.9,
        cardAdvantage: 1.1,
        tutors: 0.8,
        wincon: 1.0,
        resilience: 0.9,
        mana: 1.0,
        synergy: 1.0
      };
    default:
      return {
        speed: 1.0,
        interaction: 1.0,
        ramp: 1.0,
        cardAdvantage: 1.0,
        tutors: 1.0,
        wincon: 1.0,
        resilience: 1.0,
        mana: 1.0,
        synergy: 1.0
      };
  }
}

function getPowerBand(power: number): string {
  if (power >= 9) return 'Competitive';
  if (power >= 7) return 'High Power';
  if (power >= 5) return 'Mid Power';
  if (power >= 3) return 'Casual';
  return 'Precon';
}

function getDrivers(subscores: Record<string, number>): string[] {
  const drivers = [];
  const threshold = 70;
  
  Object.entries(subscores).forEach(([category, score]) => {
    if (score >= threshold) {
      const categoryName = category.replace(/([A-Z])/g, ' $1').toLowerCase();
      drivers.push(`Strong ${categoryName} package`);
    }
  });
  
  return drivers;
}

function getDrags(subscores: Record<string, number>): string[] {
  const drags = [];
  const threshold = 30;
  
  Object.entries(subscores).forEach(([category, score]) => {
    if (score <= threshold) {
      const categoryName = category.replace(/([A-Z])/g, ' $1').toLowerCase();
      drags.push(`Weak ${categoryName} package`);
    }
  });
  
  return drags;
}

function getRecommendations(subscores: Record<string, number>, power: number): Array<{ change: string; impact: Record<string, number> }> {
  const recommendations = [];
  
  if (subscores.interaction < 40) {
    recommendations.push({
      change: 'Add 2-3 more removal spells',
      impact: { interaction: 15, power: 0.5 }
    });
  }
  
  if (subscores.ramp < 30) {
    recommendations.push({
      change: 'Include more mana acceleration',
      impact: { ramp: 20, speed: 10 }
    });
  }
  
  if (subscores.cardAdvantage < 35) {
    recommendations.push({
      change: 'Add card draw engines',
      impact: { cardAdvantage: 18, resilience: 8 }
    });
  }
  
  if (subscores.mana < 60) {
    recommendations.push({
      change: 'Optimize manabase fixing',
      impact: { mana: 15, speed: 5 }
    });
  }
  
  return recommendations;
}