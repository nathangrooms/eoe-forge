import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Target, 
  Palette, 
  Cpu,
  TrendingUp,
  Rocket,
  Globe,
  Zap,
  Activity,
  Sparkles,
  Wand2
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { UniversalScorer, Card as BuilderCard, BuildContext } from '@/lib/deckbuilder';

export const EnhancedAnalysisPanel = () => {
  const deck = useDeckStore();
  const [activeAnalysis, setActiveAnalysis] = useState<'basic' | 'advanced'>('basic');

  // Convert deck to analysis format
  const convertDeckForAnalysis = (): BuilderCard[] => {
    return deck.cards.map(card => ({
      id: card.id,
      oracle_id: card.id,
      name: card.name,
      mana_cost: '',
      cmc: card.cmc,
      type_line: card.type_line,
      oracle_text: '',
      colors: card.colors,
      color_identity: card.colors,
      power: undefined,
      toughness: undefined,
      keywords: card.mechanics,
      legalities: { [deck.format]: 'legal' } as any,
      image_uris: undefined,
      prices: undefined,
      set: '',
      set_name: '',
      collector_number: '1',
      rarity: 'common' as any,
      layout: 'normal',
      is_legendary: false,
      tags: new Set(card.mechanics),
      derived: {
        mv: card.cmc,
        colorPips: {},
        producesMana: card.type_line.includes('Land'),
        etbTapped: false
      }
    }));
  };

  // Get advanced analysis using Universal Scorer
  const getAdvancedAnalysis = () => {
    if (deck.cards.length === 0) return null;
    
    const builderCards = convertDeckForAnalysis();
    const context: BuildContext = {
      format: deck.format || 'standard',
      themeId: 'generic',
      powerTarget: deck.powerLevel,
      budget: 'med',
      seed: Date.now()
    };
    
    return UniversalScorer.scoreDeck(builderCards, context);
  };

  const analysis = getAdvancedAnalysis();

  // Mock data for basic analysis (keeping original functionality)
  const mockAnalysis = {
    curve: [
      { cmc: 0, count: 1 },
      { cmc: 1, count: 3 },
      { cmc: 2, count: 8 },
      { cmc: 3, count: 12 },
      { cmc: 4, count: 7 },
      { cmc: 5, count: 4 },
      { cmc: 6, count: 2 },
      { cmc: 7, count: 1 }
    ],
    colors: {
      W: 12, U: 18, B: 8, R: 3, G: 5
    },
    mechanics: {
      spacecraft: 6, station: 4, warp: 8, void: 5, planet: 3
    },
    roles: {
      ramp: 6, draw: 8, removal: 10, protection: 4, finishers: 3, synergy: 12
    }
  };

  const maxCurveCount = Math.max(...mockAnalysis.curve.map(c => c.count));
  const totalColorSources = Object.values(mockAnalysis.colors).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Analysis Mode Toggle */}
      <Card>
        <CardContent className="p-4">
          <Tabs value={activeAnalysis} onValueChange={(value: any) => setActiveAnalysis(value)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Analysis</TabsTrigger>
              <TabsTrigger value="advanced">AI Analysis</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {activeAnalysis === 'advanced' && analysis ? (
        // Advanced AI Analysis
        <div className="space-y-6">
          {/* Power Level Overview */}
          <Card className="cosmic-glow">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <Wand2 className="h-5 w-5 mr-2 text-primary" />
                AI Power Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{analysis.power.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Overall Power</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">{analysis.subscores.speed.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Speed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{analysis.subscores.interaction.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Interaction</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-500">{analysis.subscores.tutors.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Tutors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{analysis.subscores.wincon.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Win Cons</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">{analysis.subscores.mana.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Manabase</div>
                </div>
              </div>
              <Progress value={analysis.power * 10} className="h-3" />
              <div className="text-xs text-muted-foreground text-center">
                Power level {analysis.power.toFixed(1)}/10 - 
                {analysis.power >= 8 ? ' Highly Competitive' :
                 analysis.power >= 6 ? ' Competitive' :
                 analysis.power >= 4 ? ' Casual Competitive' : ' Casual'}
              </div>
            </CardContent>
          </Card>

          {/* Advanced Curve Analysis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-primary" />
                Mana Curve Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(analysis.curve).map(([cmc, count]) => (
                  <div key={cmc} className="flex items-center space-x-3">
                    <span className="text-sm font-medium w-8">{cmc}</span>
                    <div className="flex-1">
                      <Progress 
                        value={(count / Math.max(...Object.values(analysis.curve))) * 100} 
                        className="h-3"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-8">{count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Average CMC: {(Object.entries(analysis.curve).reduce((sum, [cmc, count]) => 
                  sum + (parseInt(cmc.replace('+', '')) * count), 0) / 
                  Object.values(analysis.curve).reduce((sum, count) => sum + count, 0)).toFixed(1)}
              </div>
            </CardContent>
          </Card>

          {/* Tag Analysis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <Target className="h-5 w-5 mr-2 text-primary" />
                Deck Composition
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(analysis.tags).slice(0, 10).map(([tag, count]) => (
                  <div key={tag} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <span className="text-sm capitalize">{tag.replace(/-/g, ' ')}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        // Basic Analysis (Original)
        <div className="space-y-6">
          {/* Mana Curve */}
          <Card className="cosmic-glow">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-primary" />
                Mana Curve
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mockAnalysis.curve.map((point) => (
                  <div key={point.cmc} className="flex items-center space-x-3">
                    <span className="text-sm font-medium w-6">{point.cmc}</span>
                    <div className="flex-1">
                      <Progress 
                        value={(point.count / maxCurveCount) * 100} 
                        className="h-3"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-6">{point.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Average CMC: 3.2 • Peak: 3 CMC
              </div>
            </CardContent>
          </Card>

          {/* Analysis Tabs */}
          <Card>
            <CardContent className="p-0">
              <Tabs defaultValue="colors" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="colors" className="text-xs">Colors</TabsTrigger>
                  <TabsTrigger value="mechanics" className="text-xs">EOE</TabsTrigger>
                  <TabsTrigger value="roles" className="text-xs">Roles</TabsTrigger>
                </TabsList>
                
                <TabsContent value="colors" className="p-4 space-y-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <Palette className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Color Distribution</span>
                  </div>
                  {Object.entries(mockAnalysis.colors).map(([color, count]) => (
                    <div key={color} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-4 h-4 rounded-full border"
                          style={{
                            backgroundColor: {
                              W: '#FFFBD5', U: '#0E68AB', B: '#150B00', R: '#D3202A', G: '#00733E'
                            }[color]
                          }}
                        />
                        <span className="text-sm">{color}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{count}</span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round((count / totalColorSources) * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="mechanics" className="p-4 space-y-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <Cpu className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">EOE Mechanics</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Spacecraft', icon: Rocket, color: 'text-spacecraft', count: mockAnalysis.mechanics.spacecraft },
                      { name: 'Station', icon: Cpu, color: 'text-station', count: mockAnalysis.mechanics.station },
                      { name: 'Warp', icon: Zap, color: 'text-warp', count: mockAnalysis.mechanics.warp },
                      { name: 'Void', icon: Activity, color: 'text-void', count: mockAnalysis.mechanics.void },
                      { name: 'Planet', icon: Globe, color: 'text-planet', count: mockAnalysis.mechanics.planet }
                    ].map(({ name, icon: Icon, color, count }) => (
                      <div key={name} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <span className="text-sm">{name}</span>
                        </div>
                        <Badge variant="outline" className={`${color} border-current/30`}>
                          {count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="roles" className="p-4 space-y-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Deck Roles</span>
                  </div>
                  {Object.entries(mockAnalysis.roles).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{role}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Power Level Indicator */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center">
            <TrendingUp className="h-4 w-4 mr-2 text-primary" />
            Deck Strength
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Power Level</span>
              <Badge variant="default" className="bg-primary">
                {analysis ? analysis.power.toFixed(1) : deck.powerLevel}/10
              </Badge>
            </div>
            <Progress value={(analysis ? analysis.power : deck.powerLevel) * 10} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {analysis 
                ? `AI-analyzed power level with ${analysis.power >= 7 ? 'high' : analysis.power >= 5 ? 'medium' : 'low'} competitive strength.`
                : 'High-power competitive deck with strong synergies and efficient curve.'
              }
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {deck.cards.length === 0 && (
        <Card className="p-12 text-center">
          <Sparkles className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-medium mb-2">No Deck to Analyze</h3>
          <p className="text-muted-foreground">
            Add cards to your deck to see detailed analysis and power level assessment.
          </p>
        </Card>
      )}
    </div>
  );
};
