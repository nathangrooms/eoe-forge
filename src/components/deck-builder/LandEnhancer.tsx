import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Target, 
  TrendingUp, 
  Map, 
  Plus,
  Sparkles,
  BarChart3
} from 'lucide-react';

interface LandSuggestion {
  name: string;
  colors: string[];
  type: 'basic' | 'dual' | 'fetch' | 'shock' | 'check' | 'fast' | 'pain' | 'utility';
  etb: 'untapped' | 'tapped' | 'conditional';
  reason: string;
  impact: number; // 1-5 rating
}

interface ManabaseAnalysis {
  totalLands: number;
  colorRequirements: Record<string, number>;
  turnTargets: {
    turn1: number;
    turn2: number;
    turn3: number;
  };
  hitRates: {
    turn1: number;
    turn2: number;
    turn3: number;
  };
  suggestions: LandSuggestion[];
}

interface LandEnhancerProps {
  deck: any[];
  format: string;
  onAddLand: (landName: string) => void;
}

export function LandEnhancer({ deck, format, onAddLand }: LandEnhancerProps) {
  const [analysis, setAnalysis] = useState<ManabaseAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    analyzeManabase();
  }, [deck, format]);

  const analyzeManabase = async () => {
    setLoading(true);
    
    // Simulate analysis
    setTimeout(() => {
      const lands = deck.filter(card => card.type_line?.includes('Land'));
      const nonlands = deck.filter(card => !card.type_line?.includes('Land'));
      
      // Color requirements analysis
      const colorRequirements: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
      nonlands.forEach(card => {
        card.colors?.forEach((color: string) => {
          colorRequirements[color] = (colorRequirements[color] || 0) + card.quantity;
        });
      });

      // Turn targets (simplified hypergeometric)
      const totalCards = deck.reduce((sum, card) => sum + card.quantity, 0);
      const landCount = lands.reduce((sum, card) => sum + card.quantity, 0);
      
      const hitRates = {
        turn1: Math.min(95, (landCount / totalCards) * 100 * 7), // 7 cards in opening hand
        turn2: Math.min(95, (landCount / totalCards) * 100 * 8), // +1 draw
        turn3: Math.min(95, (landCount / totalCards) * 100 * 9)   // +1 draw
      };

      // Generate suggestions based on format and colors
      const activeColors = Object.entries(colorRequirements)
        .filter(([_, count]) => count > 0)
        .map(([color, _]) => color);

      const suggestions: LandSuggestion[] = [];

      if (activeColors.length === 2) {
        // Dual color suggestions
        const colorPair = activeColors.sort().join('');
        const dualLands = getDualLandSuggestions(colorPair, format);
        suggestions.push(...dualLands);
      } else if (activeColors.length > 2) {
        // Multicolor suggestions
        suggestions.push({
          name: 'Command Tower',
          colors: activeColors,
          type: 'utility',
          etb: 'untapped',
          reason: 'Perfect fixing for multicolor decks',
          impact: 5
        });
        
        if (format === 'commander') {
          suggestions.push({
            name: 'Exotic Orchard',
            colors: activeColors,
            type: 'utility',
            etb: 'untapped',
            reason: 'Usually produces any color needed',
            impact: 4
          });
        }
      }

      // Add basic lands if needed
      activeColors.forEach(color => {
        const basicName = getBasicLandName(color);
        if (basicName) {
          suggestions.push({
            name: basicName,
            colors: [color],
            type: 'basic',
            etb: 'untapped',
            reason: 'Reliable color source',
            impact: 3
          });
        }
      });

      setAnalysis({
        totalLands: landCount,
        colorRequirements,
        turnTargets: { turn1: 1, turn2: 2, turn3: 3 },
        hitRates,
        suggestions: suggestions.slice(0, 6) // Limit suggestions
      });
      
      setLoading(false);
    }, 1000);
  };

  const getDualLandSuggestions = (colorPair: string, format: string): LandSuggestion[] => {
    const suggestions: LandSuggestion[] = [];
    
    // Format-specific suggestions
    if (format === 'standard' || format === 'pioneer') {
      suggestions.push({
        name: `${colorPair} Shock Land`,
        colors: colorPair.split(''),
        type: 'shock',
        etb: 'conditional',
        reason: 'Enters untapped with payment',
        impact: 5
      });
    }
    
    if (format === 'modern' || format === 'legacy') {
      suggestions.push({
        name: `${colorPair} Fetch Land`,
        colors: colorPair.split(''),
        type: 'fetch',
        etb: 'untapped',
        reason: 'Perfect fixing and deck thinning',
        impact: 5
      });
    }
    
    suggestions.push({
      name: `${colorPair} Check Land`,
      colors: colorPair.split(''),
      type: 'check',
      etb: 'conditional',
      reason: 'Good with basics and shocks',
      impact: 4
    });

    return suggestions;
  };

  const getBasicLandName = (color: string): string | null => {
    const basicMap: Record<string, string> = {
      W: 'Plains',
      U: 'Island', 
      B: 'Swamp',
      R: 'Mountain',
      G: 'Forest'
    };
    return basicMap[color] || null;
  };

  const getHitRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Map className="h-5 w-5 mr-2" />
            Land Enhancer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-20 bg-muted rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Map className="h-5 w-5 mr-2" />
          Land Enhancer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-4">
            {/* Current Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{analysis.totalLands}</div>
                <div className="text-sm text-muted-foreground">Total Lands</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {Object.keys(analysis.colorRequirements).filter(c => analysis.colorRequirements[c] > 0).length}
                </div>
                <div className="text-sm text-muted-foreground">Colors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {Math.round((analysis.totalLands / (analysis.totalLands + deck.filter(c => !c.type_line?.includes('Land')).length)) * 100)}%
                </div>
                <div className="text-sm text-muted-foreground">Land Ratio</div>
              </div>
            </div>

            {/* Hit Rates */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center">
                <Target className="h-4 w-4 mr-2" />
                Land Drop Probability
              </h4>
              
              {[
                { turn: 'Turn 1', rate: analysis.hitRates.turn1, target: 95 },
                { turn: 'Turn 2', rate: analysis.hitRates.turn2, target: 90 },
                { turn: 'Turn 3', rate: analysis.hitRates.turn3, target: 85 }
              ].map(({ turn, rate, target }) => (
                <div key={turn} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">{turn}</span>
                    <span className={`text-sm font-medium ${getHitRateColor(rate)}`}>
                      {rate.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={rate} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    Target: {target}%
                  </div>
                </div>
              ))}
            </div>

            {/* Color Requirements */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center">
                <BarChart3 className="h-4 w-4 mr-2" />
                Color Distribution
              </h4>
              
              {Object.entries(analysis.colorRequirements)
                .filter(([_, count]) => count > 0)
                .map(([color, count]) => (
                  <div key={color} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{
                          backgroundColor: {
                            W: '#fffbd5',
                            U: '#0e68ab', 
                            B: '#150b00',
                            R: '#d3202a',
                            G: '#00733e'
                          }[color]
                        }}
                      />
                      <span className="text-sm">{color}</span>
                    </div>
                    <Badge variant="outline">{count} sources needed</Badge>
                  </div>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center">
                <Sparkles className="h-4 w-4 mr-2" />
                Recommended Lands
              </h4>
              <Badge variant="outline">{analysis.suggestions.length} suggestions</Badge>
            </div>

            <div className="space-y-3">
              {analysis.suggestions.map((suggestion, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium">{suggestion.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {suggestion.type}
                      </Badge>
                      <div className="flex space-x-1">
                        {suggestion.colors.map(color => (
                          <div
                            key={color}
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: {
                                W: '#fffbd5',
                                U: '#0e68ab',
                                B: '#150b00', 
                                R: '#d3202a',
                                G: '#00733e'
                              }[color]
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">{suggestion.reason}</div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-xs">+{suggestion.impact}</span>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => onAddLand(suggestion.name)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}