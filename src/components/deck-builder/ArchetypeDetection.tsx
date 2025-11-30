import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lightbulb, Target, Zap } from 'lucide-react';

interface ArchetypeDetectionProps {
  deckCards: any[];
  commander?: any;
  format: string;
}

interface ArchetypeMatch {
  name: string;
  confidence: number;
  primaryStrategy: string;
  secondaryStrategies: string[];
  keyCards: string[];
}

export function ArchetypeDetection({ deckCards, commander, format }: ArchetypeDetectionProps) {
  const [archetypes, setArchetypes] = useState<ArchetypeMatch[]>([]);

  useEffect(() => {
    detectArchetypes();
  }, [deckCards, commander, format]);

  const detectArchetypes = () => {
    const matches: ArchetypeMatch[] = [];
    
    // Count synergy tags
    const tagCounts = deckCards.reduce((acc, card) => {
      const tags = card.tags || [];
      tags.forEach((tag: string) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    // Count card types
    const typeAnalysis = {
      tribal: deckCards.filter(c => c.type_line?.includes('Tribal') || 
        (c.oracle_text?.match(/creature type/i) && !c.type_line?.includes('Changeling'))).length,
      tokens: tagCounts['tokens'] || 0,
      aristocrats: tagCounts['aristocrats'] || 0,
      sacOutlet: tagCounts['sac-outlet'] || 0,
      blink: tagCounts['blink'] || 0,
      etb: tagCounts['etb'] || 0,
      spellslinger: tagCounts['spellslinger'] || 0,
      counters: tagCounts['counters'] || 0,
      voltron: deckCards.filter(c => c.type_line?.includes('Equipment') || c.type_line?.includes('Aura')).length,
      ramp: tagCounts['ramp'] || 0,
      control: (tagCounts['counterspell'] || 0) + (tagCounts['removal-spot'] || 0),
      storm: tagCounts['storm'] || 0,
      reanimator: tagCounts['reanimator'] || 0,
      stax: tagCounts['stax'] || 0,
      landfall: tagCounts['landfall'] || 0,
      artifacts: deckCards.filter(c => c.type_line?.toLowerCase().includes('artifact')).length,
      enchantments: deckCards.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length,
    };

    const totalCards = Math.max(deckCards.length, 1);

    // Aristocrats Detection
    if (typeAnalysis.aristocrats >= 5 || (typeAnalysis.sacOutlet >= 3 && typeAnalysis.tokens >= 5)) {
      matches.push({
        name: 'Aristocrats',
        confidence: Math.min(100, ((typeAnalysis.aristocrats + typeAnalysis.sacOutlet) / totalCards) * 400),
        primaryStrategy: 'Sacrifice creatures for value and drain opponents',
        secondaryStrategies: ['Token generation', 'Death triggers', 'Recursion'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('aristocrats') || c.tags?.includes('sac-outlet'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Blink/Flicker Detection
    if (typeAnalysis.blink >= 5 && typeAnalysis.etb >= 8) {
      matches.push({
        name: 'Blink/ETB',
        confidence: Math.min(100, ((typeAnalysis.blink + typeAnalysis.etb / 2) / totalCards) * 300),
        primaryStrategy: 'Repeatedly flicker creatures for ETB value',
        secondaryStrategies: ['Card advantage', 'Removal', 'Combo potential'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('blink') || c.tags?.includes('etb'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Spellslinger Detection
    if (typeAnalysis.spellslinger >= 5) {
      const instSorc = deckCards.filter(c => 
        c.type_line?.includes('Instant') || c.type_line?.includes('Sorcery')
      ).length;
      matches.push({
        name: 'Spellslinger',
        confidence: Math.min(100, ((typeAnalysis.spellslinger + instSorc / 3) / totalCards) * 250),
        primaryStrategy: 'Cast many instants and sorceries for value',
        secondaryStrategies: ['Storm', 'Prowess triggers', 'Spell copy'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('spellslinger') || c.tags?.includes('prowess'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Voltron Detection
    if (typeAnalysis.voltron >= 8 && commander?.type_line?.includes('Creature')) {
      matches.push({
        name: 'Voltron',
        confidence: Math.min(100, (typeAnalysis.voltron / totalCards) * 400),
        primaryStrategy: 'Equip/enchant commander for one-shot kills',
        secondaryStrategies: ['Protection', 'Evasion', 'Commander damage'],
        keyCards: deckCards
          .filter(c => c.type_line?.includes('Equipment') || 
            (c.type_line?.includes('Aura') && c.oracle_text?.includes('creature')))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Ramp/Big Mana Detection
    if (typeAnalysis.ramp >= 12) {
      matches.push({
        name: 'Ramp/Big Mana',
        confidence: Math.min(100, (typeAnalysis.ramp / totalCards) * 300),
        primaryStrategy: 'Accelerate mana to cast big threats',
        secondaryStrategies: ['Landfall', 'X-spells', 'Big creatures'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('ramp'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Control Detection
    if (typeAnalysis.control >= 15) {
      matches.push({
        name: 'Control',
        confidence: Math.min(100, (typeAnalysis.control / totalCards) * 250),
        primaryStrategy: 'Control the board and win with late-game threats',
        secondaryStrategies: ['Counterspells', 'Removal', 'Card advantage'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('counterspell') || c.tags?.includes('removal-spot'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Tokens Detection
    if (typeAnalysis.tokens >= 8) {
      matches.push({
        name: 'Token Swarm',
        confidence: Math.min(100, (typeAnalysis.tokens / totalCards) * 350),
        primaryStrategy: 'Generate many tokens to overwhelm opponents',
        secondaryStrategies: ['Go-wide', 'Anthems', 'Sacrifice fodder'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('tokens'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Counters Theme Detection
    if (typeAnalysis.counters >= 8) {
      matches.push({
        name: '+1/+1 Counters',
        confidence: Math.min(100, (typeAnalysis.counters / totalCards) * 350),
        primaryStrategy: 'Build up creatures with +1/+1 counters',
        secondaryStrategies: ['Proliferate', 'Synergy', 'Scaling threats'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('counters'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Reanimator Detection
    if (typeAnalysis.reanimator >= 5) {
      matches.push({
        name: 'Reanimator',
        confidence: Math.min(100, (typeAnalysis.reanimator / totalCards) * 400),
        primaryStrategy: 'Cheat big creatures from graveyard into play',
        secondaryStrategies: ['Self-mill', 'Discard', 'Recursion'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('reanimator') || c.tags?.includes('recursion'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Stax Detection
    if (typeAnalysis.stax >= 5) {
      matches.push({
        name: 'Stax',
        confidence: Math.min(100, (typeAnalysis.stax / totalCards) * 450),
        primaryStrategy: 'Lock down opponents with resource denial',
        secondaryStrategies: ['Tax effects', 'Symmetrical disruption', 'Control'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('stax'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Storm Detection
    if (typeAnalysis.storm >= 3) {
      matches.push({
        name: 'Storm',
        confidence: Math.min(100, (typeAnalysis.storm / totalCards) * 500),
        primaryStrategy: 'Chain many spells together for explosive turns',
        secondaryStrategies: ['Ritual effects', 'Cost reduction', 'Draw engines'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('storm') || c.keywords?.includes('Storm'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Landfall Detection
    if (typeAnalysis.landfall >= 6) {
      matches.push({
        name: 'Landfall',
        confidence: Math.min(100, (typeAnalysis.landfall / totalCards) * 400),
        primaryStrategy: 'Trigger landfall effects with extra land plays',
        secondaryStrategies: ['Ramp', 'Land recursion', 'Value engines'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('landfall') || c.tags?.includes('lands-matter'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Artifact Theme Detection
    if (typeAnalysis.artifacts >= 20) {
      matches.push({
        name: 'Artifacts Matter',
        confidence: Math.min(100, (typeAnalysis.artifacts / totalCards) * 200),
        primaryStrategy: 'Leverage artifacts and artifact synergies',
        secondaryStrategies: ['Artifact tokens', 'Cost reduction', 'Synergy'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('artifacts-matter') || c.type_line?.includes('Artifact'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Enchantment Theme Detection
    if (typeAnalysis.enchantments >= 15) {
      matches.push({
        name: 'Enchantress',
        confidence: Math.min(100, (typeAnalysis.enchantments / totalCards) * 250),
        primaryStrategy: 'Draw cards from casting enchantments',
        secondaryStrategies: ['Pillow fort', 'Value engines', 'Control'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('enchantments-matter') || c.type_line?.includes('Enchantment'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Sort by confidence and keep top 3
    matches.sort((a, b) => b.confidence - a.confidence);
    setArchetypes(matches.slice(0, 3));
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-emerald-500';
    if (confidence >= 50) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 70) return 'Strong Match';
    if (confidence >= 50) return 'Good Match';
    return 'Partial Match';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Archetype Detection
        </CardTitle>
        <CardDescription>
          AI-powered analysis of your deck's strategy and playstyle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {archetypes.length === 0 ? (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertDescription>
              Add more cards to your deck for accurate archetype detection. Need at least 20 cards with clear synergies.
            </AlertDescription>
          </Alert>
        ) : (
          archetypes.map((archetype, idx) => (
            <div key={idx} className="p-4 rounded-lg border bg-card space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">{archetype.name}</h3>
                    {idx === 0 && (
                      <Badge variant="default" className="text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        Primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{archetype.primaryStrategy}</p>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${getConfidenceColor(archetype.confidence)}`}>
                    {Math.round(archetype.confidence)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getConfidenceLabel(archetype.confidence)}
                  </div>
                </div>
              </div>

              {archetype.secondaryStrategies.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Sub-themes:</div>
                  <div className="flex flex-wrap gap-1">
                    {archetype.secondaryStrategies.map((strategy, sIdx) => (
                      <Badge key={sIdx} variant="outline" className="text-xs">
                        {strategy}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {archetype.keyCards.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Key Cards:</div>
                  <div className="text-sm space-y-1">
                    {archetype.keyCards.map((card, cIdx) => (
                      <div key={cIdx} className="text-muted-foreground">• {card}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
