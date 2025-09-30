import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useDeckStore } from '@/stores/deckStore';
import { EDHPowerCalculator } from '@/lib/deckbuilder/score/edh-power-calculator';
import { PowerLevelFlags } from './deck-builder/PowerLevelFlags';

interface PowerScore {
  power: number;
  band: string;
  subscores: Record<string, number>;
  drivers: string[];
  drags: string[];
  recommendations: string[];
  playability: {
    keepable7_pct: number;
    t1_color_hit_pct: number;
    untapped_land_ratio: number;
    avg_cmc: number;
  };
}

interface PowerScoringEngineProps {
  deck?: any[];
  format?: string;
}

export function PowerScoringEngine({ deck, format }: PowerScoringEngineProps) {
  const { cards: deckCards, format: deckFormat, commander } = useDeckStore();
  
  const activeDeck = deck || deckCards;
  const activeFormat = format || deckFormat;

  // Calculate power score using new EDH calculator
  const calculatePowerScore = React.useCallback((): PowerScore => {
    if (!activeDeck || activeDeck.length === 0) {
      return {
        power: 5,
        band: 'casual',
        subscores: {
          speed: 0,
          interaction: 0,
          tutors: 0,
          resilience: 0,
          card_advantage: 0,
          mana: 0,
          consistency: 0,
          stax_pressure: 0,
          synergy: 0
        },
        drivers: [],
        drags: [],
        recommendations: [],
        playability: {
          keepable7_pct: 0,
          t1_color_hit_pct: 0,
          untapped_land_ratio: 0,
          avg_cmc: 0
        }
      };
    }

    // Convert deck store cards to EDH calculator format
    const convertedDeck = activeDeck.map(card => ({
      id: card.id || '',
      oracle_id: card.id || '',
      name: card.name,
      mana_cost: card.mana_cost || '',
      cmc: card.cmc,
      type_line: card.type_line,
      oracle_text: card.oracle_text || '',
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      power: card.power,
      toughness: card.toughness,
      keywords: card.keywords || [],
      legalities: (card.legalities as any) || {},
      image_uris: card.image_uris,
      prices: card.prices,
      set: card.set || '',
      set_name: card.set_name || '',
      collector_number: card.collector_number || '',
      rarity: (card.rarity as any) || 'common',
      layout: card.layout || 'normal',
      is_legendary: false,
      tags: new Set<string>(),
      derived: {
        mv: card.cmc,
        colorPips: {},
        producesMana: false,
        etbTapped: false
      }
    }));

    const convertedCommander = commander ? {
      id: commander.id || '',
      oracle_id: commander.id || '',
      name: commander.name,
      mana_cost: commander.mana_cost || '',
      cmc: commander.cmc || 0,
      type_line: commander.type_line || '',
      oracle_text: commander.oracle_text || '',
      colors: commander.colors || [],
      color_identity: commander.color_identity || [],
      power: commander.power,
      toughness: commander.toughness,
      keywords: commander.keywords || [],
      legalities: (commander.legalities as any) || {},
      image_uris: commander.image_uris,
      prices: commander.prices,
      set: commander.set || '',
      set_name: commander.set_name || '',
      collector_number: commander.collector_number || '',
      rarity: 'mythic' as any,
      layout: commander.layout || 'normal',
      is_legendary: true,
      tags: new Set<string>(),
      derived: {
        mv: commander.cmc || 0,
        colorPips: {},
        producesMana: false,
        etbTapped: false
      }
    } : undefined;

    const result = EDHPowerCalculator.calculatePower(
      convertedDeck,
      activeFormat,
      42,
      convertedCommander
    );

    return {
      power: result.power,
      band: result.band,
      subscores: result.subscores,
      drivers: result.drivers,
      drags: result.drags,
      recommendations: result.recommendations,
      playability: result.playability
    };
  }, [activeDeck, activeFormat, commander]);

  const scoreData = calculatePowerScore();

  if (!activeDeck || activeDeck.length === 0) {
    return (
      <Card className="p-6 text-center">
        <h3 className="text-lg font-semibold mb-2">Power Analysis</h3>
        <p className="text-muted-foreground">Add cards to your deck to see power analysis</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        {/* Overall Power Score */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Power Level</h3>
          <Badge variant={scoreData.band === 'cedh' ? 'destructive' : scoreData.band === 'high' ? 'default' : 'secondary'}>
            {scoreData.power.toFixed(1)}/10 - {scoreData.band.toUpperCase()}
          </Badge>
        </div>
        
        <Progress value={scoreData.power * 10} className="h-3 mb-4" />
        
        {(scoreData as any).flags && (scoreData as any).diagnostics && (
          <PowerLevelFlags 
            flags={(scoreData as any).flags}
            diagnostics={(scoreData as any).diagnostics}
            targetPower={scoreData.power}
          />
        )}

        {/* Playability Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {scoreData.playability.keepable7_pct.toFixed(0)}%
            </div>
            <div className="text-sm text-muted-foreground">Keepable Hands</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {scoreData.playability.t1_color_hit_pct.toFixed(0)}%
            </div>
            <div className="text-sm text-muted-foreground">T1 Color Hit</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {scoreData.playability.avg_cmc.toFixed(1)}
            </div>
            <div className="text-sm text-muted-foreground">Avg CMC</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {scoreData.playability.untapped_land_ratio.toFixed(0)}%
            </div>
            <div className="text-sm text-muted-foreground">Untapped Lands</div>
          </div>
        </div>

        {/* Subscores */}
        <div className="space-y-3">
          <h4 className="font-medium">Component Scores</h4>
          {Object.entries(scoreData.subscores).map(([category, score]) => (
            <div key={category} className="flex items-center justify-between">
              <span className="text-sm capitalize">{category.replace('_', ' ')}</span>
              <div className="flex items-center space-x-2">
                <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full" 
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-8 text-right">
                  {Math.round(score)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Drivers and Drags */}
        {scoreData.drivers.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-green-600 mb-2">Strengths</h4>
            <div className="space-y-1">
              {scoreData.drivers.map((driver, index) => (
                <div key={index} className="text-sm text-green-600">• {driver}</div>
              ))}
            </div>
          </div>
        )}

        {scoreData.drags.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-orange-600 mb-2">Weaknesses</h4>
            <div className="space-y-1">
              {scoreData.drags.map((drag, index) => (
                <div key={index} className="text-sm text-orange-600">• {drag}</div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {scoreData.recommendations.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-blue-600 mb-2">Recommendations</h4>
            <div className="space-y-1">
              {scoreData.recommendations.slice(0, 3).map((rec, index) => (
                <div key={index} className="text-sm text-blue-600">• {rec}</div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}