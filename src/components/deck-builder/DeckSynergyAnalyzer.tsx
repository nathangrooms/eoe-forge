import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Zap, Target, TrendingUp, AlertTriangle } from 'lucide-react';

interface SynergyCluster {
  theme: string;
  cards: string[];
  strength: number;
  description: string;
}

interface ComboDetection {
  cards: string[];
  description: string;
  winCondition: boolean;
}

interface DeckSynergyAnalyzerProps {
  deckCards: Array<{
    name: string;
    type_line: string;
    oracle_text?: string;
    keywords?: string[];
  }>;
}

export function DeckSynergyAnalyzer({ deckCards }: DeckSynergyAnalyzerProps) {
  const [synergies, setSynergies] = useState<SynergyCluster[]>([]);
  const [combos, setCombos] = useState<ComboDetection[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyzeDeck();
  }, [deckCards]);

  const analyzeDeck = () => {
    try {
      setLoading(true);

      // Detect synergy clusters
      const detectedSynergies = detectSynergyClusters(deckCards);
      setSynergies(detectedSynergies);

      // Detect combos
      const detectedCombos = detectCombos(deckCards);
      setCombos(detectedCombos);

      // Calculate overall synergy score
      const score = calculateSynergyScore(detectedSynergies, detectedCombos);
      setOverallScore(score);
    } catch (error) {
      console.error('Error analyzing deck:', error);
    } finally {
      setLoading(false);
    }
  };

  const detectSynergyClusters = (cards: typeof deckCards): SynergyCluster[] => {
    const clusters: SynergyCluster[] = [];

    // Creature type synergies
    const creatureTypes = cards
      .filter(c => c.type_line.toLowerCase().includes('creature'))
      .map(c => {
        const match = c.type_line.match(/(?:Creature — |Creature—)(.+)/);
        return match ? match[1].split(' ').filter(t => t.length > 2) : [];
      })
      .flat();

    const typeCount: Record<string, string[]> = {};
    cards.forEach(card => {
      creatureTypes.forEach(type => {
        if (card.type_line.includes(type) || card.oracle_text?.toLowerCase().includes(type.toLowerCase())) {
          if (!typeCount[type]) typeCount[type] = [];
          typeCount[type].push(card.name);
        }
      });
    });

    Object.entries(typeCount)
      .filter(([_, cards]) => cards.length >= 5)
      .forEach(([type, cards]) => {
        clusters.push({
          theme: `${type} Tribal`,
          cards,
          strength: Math.min(100, (cards.length / deckCards.length) * 200),
          description: `Strong ${type} tribal synergy with ${cards.length} related cards`
        });
      });

    // Keyword synergies
    const keywordGroups = {
      '+1/+1 Counters': ['counter', 'proliferate', 'evolve', 'adapt'],
      'Card Draw': ['draw', 'card advantage'],
      'Ramp': ['search', 'land', 'mana'],
      'Removal': ['destroy', 'exile', 'damage'],
      'Graveyard': ['graveyard', 'dies', 'return'],
      'Artifacts': ['artifact', 'equipment'],
      'Tokens': ['token', 'create'],
    };

    Object.entries(keywordGroups).forEach(([theme, keywords]) => {
      const matchingCards = cards.filter(card => 
        keywords.some(kw => 
          card.oracle_text?.toLowerCase().includes(kw) ||
          card.keywords?.some(k => k.toLowerCase().includes(kw))
        )
      );

      if (matchingCards.length >= 5) {
        clusters.push({
          theme,
          cards: matchingCards.map(c => c.name),
          strength: Math.min(100, (matchingCards.length / cards.length) * 150),
          description: `${matchingCards.length} cards supporting ${theme.toLowerCase()} strategy`
        });
      }
    });

    return clusters.sort((a, b) => b.strength - a.strength).slice(0, 6);
  };

  const detectCombos = (cards: typeof deckCards): ComboDetection[] => {
    const combos: ComboDetection[] = [];

    // Known infinite combos (simplified detection)
    const comboPatterns = [
      {
        cards: ['Thassa\'s Oracle', 'Demonic Consultation'],
        description: 'Exile library, win with Thassa\'s Oracle',
        winCondition: true
      },
      {
        cards: ['Dramatic Reversal', 'Isochron Scepter'],
        description: 'Infinite mana with mana rocks',
        winCondition: false
      },
      {
        cards: ['Underworld Breach', 'Lion\'s Eye Diamond'],
        description: 'Storm combo with LED and Breach',
        winCondition: true
      }
    ];

    comboPatterns.forEach(pattern => {
      const hasAllCards = pattern.cards.every(comboCard =>
        cards.some(deckCard => deckCard.name.includes(comboCard))
      );

      if (hasAllCards) {
        combos.push(pattern);
      }
    });

    // Generic synergy combos
    const hasDoubler = cards.some(c => 
      c.oracle_text?.toLowerCase().includes('double') && 
      (c.oracle_text?.toLowerCase().includes('token') || c.oracle_text?.toLowerCase().includes('counter'))
    );
    
    const hasTokenMakers = cards.filter(c => 
      c.oracle_text?.toLowerCase().includes('create') && 
      c.oracle_text?.toLowerCase().includes('token')
    ).length >= 3;

    if (hasDoubler && hasTokenMakers) {
      combos.push({
        cards: ['Token doublers', 'Token generators'],
        description: 'Exponential token generation',
        winCondition: false
      });
    }

    return combos;
  };

  const calculateSynergyScore = (
    synergies: SynergyCluster[],
    combos: ComboDetection[]
  ): number => {
    const synergyScore = synergies.reduce((acc, s) => acc + s.strength, 0) / Math.max(synergies.length, 1);
    const comboBonus = combos.length * 15;
    return Math.min(100, synergyScore + comboBonus);
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 75) return 'Highly Synergistic';
    if (score >= 50) return 'Moderately Synergistic';
    return 'Low Synergy';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Synergy Analysis
          </CardTitle>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
              {overallScore.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {getScoreLabel(overallScore)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Deck Cohesion</span>
            <span className="font-medium">{overallScore.toFixed(0)}%</span>
          </div>
          <Progress value={overallScore} className="h-2" />
        </div>

        {/* Synergy Clusters */}
        {synergies.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Synergy Themes
            </h4>
            <ScrollArea className="h-[200px]">
              <div className="space-y-3">
                {synergies.map((synergy, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{synergy.theme}</span>
                          <Badge variant="secondary" className="text-xs">
                            {synergy.cards.length} cards
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {synergy.description}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <div className={`text-sm font-bold ${getScoreColor(synergy.strength)}`}>
                          {synergy.strength.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                    <Progress value={synergy.strength} className="h-1" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Combo Detection */}
        {combos.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Detected Combos
            </h4>
            <div className="space-y-2">
              {combos.map((combo, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-start gap-2">
                    {combo.winCondition && (
                      <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {combo.cards.join(' + ')}
                        </span>
                        {combo.winCondition && (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                            Win Con
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {combo.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {overallScore < 50 && (
          <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-medium text-yellow-600 dark:text-yellow-400">
                  Low Synergy Detected
                </p>
                <p className="text-muted-foreground">
                  Consider focusing on 2-3 main themes and adding more cards that support them.
                  Look for cards that work well together rather than standalone powerful cards.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
