import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lightbulb, Target, Zap } from 'lucide-react';
import { tagEnrichment } from '@/lib/cards/tag-signal';

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

    /**
     * A theme counts only when the deck is meaningfully denser in it than a
     * random pile of cards would be.
     *
     * The absolute floors below ("8 or more token makers") were written when
     * `cards.tags` held four role names and almost nothing carried them, so a
     * floor was the only test that could fail. The vocabulary now covers 34,067
     * cards and the common tags are common: `counters` sits on 8.45% of the
     * catalogue, so *every* 100-card deck clears "8 or more" without being a
     * counters deck, and all six 60-plus-card decks in our own table did.
     *
     * Two is a stated design choice, not a number fitted to those six decks:
     * twice the catalogue's own density is the least that can honestly be
     * called a theme. It changes nothing for the rare tags — three `storm`
     * cards in a 100-card deck is already 25 times baseline — and bites exactly
     * where the vocabulary is broad.
     */
    const THEME_ENRICHMENT = 2;

    const enrichmentOf = (count: number, tags: string[]) =>
      tagEnrichment(count, totalCards, tags);

    /** Clears its floor and is at least twice as dense as the catalogue. */
    const fires = (count: number, floor: number, tags: string[]) =>
      count >= floor && enrichmentOf(count, tags) >= THEME_ENRICHMENT;

    /**
     * Confidence on one scale for every archetype: twice baseline reads 50,
     * three times reads 100.
     *
     * Each detector used to multiply its own share of the deck by a hand-picked
     * constant between 200 and 500, so a Storm score and an Artifacts score were
     * not comparable — and this component sorts by confidence and shows the top
     * three, which made that ordering meaningless.
     */
    const confidenceOf = (count: number, tags: string[]) =>
      Math.max(0, Math.min(100, (enrichmentOf(count, tags) - 1) * 50));

    // Aristocrats Detection
    if (
      fires(typeAnalysis.aristocrats, 5, ['aristocrats']) ||
      (fires(typeAnalysis.sacOutlet, 3, ['sac-outlet']) && fires(typeAnalysis.tokens, 5, ['tokens']))
    ) {
      matches.push({
        name: 'Aristocrats',
        confidence: confidenceOf(typeAnalysis.aristocrats + typeAnalysis.sacOutlet, [
          'aristocrats',
          'sac-outlet',
        ]),
        primaryStrategy: 'Sacrifice creatures for value and drain opponents',
        secondaryStrategies: ['Token generation', 'Death triggers', 'Recursion'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('aristocrats') || c.tags?.includes('sac-outlet'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Blink/Flicker Detection
    if (fires(typeAnalysis.blink, 5, ['blink']) && fires(typeAnalysis.etb, 8, ['etb'])) {
      matches.push({
        name: 'Blink/ETB',
        confidence: confidenceOf(typeAnalysis.blink, ['blink']),
        primaryStrategy: 'Repeatedly flicker creatures for ETB value',
        secondaryStrategies: ['Card advantage', 'Removal', 'Combo potential'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('blink') || c.tags?.includes('etb'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Spellslinger Detection
    if (fires(typeAnalysis.spellslinger, 5, ['spellslinger'])) {
      const instSorc = deckCards.filter(c => 
        c.type_line?.includes('Instant') || c.type_line?.includes('Sorcery')
      ).length;
      matches.push({
        name: 'Spellslinger',
        confidence: confidenceOf(typeAnalysis.spellslinger + instSorc / 3, [
          'spellslinger',
          'instant',
        ]),
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
        confidence: confidenceOf(typeAnalysis.voltron, ['equipment', 'aura']),
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
    if (fires(typeAnalysis.ramp, 12, ['ramp'])) {
      matches.push({
        name: 'Ramp/Big Mana',
        confidence: confidenceOf(typeAnalysis.ramp, ['ramp']),
        primaryStrategy: 'Accelerate mana to cast big threats',
        secondaryStrategies: ['Landfall', 'X-spells', 'Big creatures'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('ramp'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Control Detection
    if (fires(typeAnalysis.control, 15, ['counterspell', 'removal-spot'])) {
      matches.push({
        name: 'Control',
        confidence: confidenceOf(typeAnalysis.control, ['counterspell', 'removal-spot']),
        primaryStrategy: 'Control the board and win with late-game threats',
        secondaryStrategies: ['Counterspells', 'Removal', 'Card advantage'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('counterspell') || c.tags?.includes('removal-spot'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Tokens Detection
    if (fires(typeAnalysis.tokens, 8, ['tokens'])) {
      matches.push({
        name: 'Token Swarm',
        confidence: confidenceOf(typeAnalysis.tokens, ['tokens']),
        primaryStrategy: 'Generate many tokens to overwhelm opponents',
        secondaryStrategies: ['Go-wide', 'Anthems', 'Sacrifice fodder'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('tokens'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Counters Theme Detection
    if (fires(typeAnalysis.counters, 8, ['counters'])) {
      matches.push({
        name: '+1/+1 Counters',
        confidence: confidenceOf(typeAnalysis.counters, ['counters']),
        primaryStrategy: 'Build up creatures with +1/+1 counters',
        secondaryStrategies: ['Proliferate', 'Synergy', 'Scaling threats'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('counters'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Reanimator Detection
    if (fires(typeAnalysis.reanimator, 5, ['reanimator'])) {
      matches.push({
        name: 'Reanimator',
        confidence: confidenceOf(typeAnalysis.reanimator, ['reanimator']),
        primaryStrategy: 'Cheat big creatures from graveyard into play',
        secondaryStrategies: ['Self-mill', 'Discard', 'Recursion'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('reanimator') || c.tags?.includes('recursion'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Stax Detection
    if (fires(typeAnalysis.stax, 5, ['stax'])) {
      matches.push({
        name: 'Stax',
        confidence: confidenceOf(typeAnalysis.stax, ['stax']),
        primaryStrategy: 'Lock down opponents with resource denial',
        secondaryStrategies: ['Tax effects', 'Symmetrical disruption', 'Control'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('stax'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Storm Detection
    if (fires(typeAnalysis.storm, 3, ['storm'])) {
      matches.push({
        name: 'Storm',
        confidence: confidenceOf(typeAnalysis.storm, ['storm']),
        primaryStrategy: 'Chain many spells together for explosive turns',
        secondaryStrategies: ['Ritual effects', 'Cost reduction', 'Draw engines'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('storm') || c.keywords?.includes('Storm'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Landfall Detection
    if (fires(typeAnalysis.landfall, 6, ['landfall'])) {
      matches.push({
        name: 'Landfall',
        confidence: confidenceOf(typeAnalysis.landfall, ['landfall']),
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
        confidence: confidenceOf(typeAnalysis.artifacts, ['artifact']),
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
        confidence: confidenceOf(typeAnalysis.enchantments, ['enchantment']),
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
    if (confidence >= 70) return 'text-foreground';
    if (confidence >= 50) return 'text-foreground';
    return 'text-foreground';
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
          Counts the role tags on the cards in this deck and reports any theme the deck
          is at least twice as concentrated in as the card catalogue. No model, no guesswork.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {archetypes.length === 0 ? (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertDescription>
              {deckCards.length < 20
                ? `Only ${deckCards.length} card${deckCards.length === 1 ? '' : 's'} here — too few to read a strategy from.`
                : 'No theme in this deck is concentrated enough to name. Every role tag it carries ' +
                  'appears at close to the rate a random pile of cards would have, so claiming an ' +
                  'archetype would be inventing one.'}
            </AlertDescription>
          </Alert>
        ) : (
          archetypes.map((archetype, idx) => (
            <div key={idx} className="space-y-3 rounded-lg bg-muted/20 p-4 shadow-lg shadow-black/20">
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
