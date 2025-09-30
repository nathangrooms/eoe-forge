import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, Zap, Target, Shield, Sparkles, TrendingUp, 
  Mountain, Eye, AlertTriangle, Info, Lightbulb, RefreshCw, Star
} from 'lucide-react';
import { EDHPowerCalculator, EDHPowerScore } from '@/lib/deckbuilder/score/edh-power-calculator';
import { Card as DeckCard } from '@/stores/deckStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ComprehensiveAnalyticsProps {
  deck: DeckCard[];
  format: string;
  commander?: DeckCard;
  deckId?: string;
}

const SUBSCORE_CONFIG: Record<string, { icon: any; color: string; desc: string }> = {
  speed: { icon: Zap, color: 'text-yellow-500', desc: 'Fast mana and early game tempo' },
  interaction: { icon: Shield, color: 'text-blue-500', desc: 'Removal and counterspells' },
  tutors: { icon: Target, color: 'text-purple-500', desc: 'Consistency through tutoring' },
  resilience: { icon: Shield, color: 'text-green-500', desc: 'Protection and recovery' },
  card_advantage: { icon: Sparkles, color: 'text-cyan-500', desc: 'Card draw engines' },
  mana: { icon: Mountain, color: 'text-orange-500', desc: 'Mana base quality' },
  consistency: { icon: TrendingUp, color: 'text-indigo-500', desc: 'Curve and redundancy' },
  stax_pressure: { icon: AlertTriangle, color: 'text-red-500', desc: 'Resource denial' },
  synergy: { icon: Brain, color: 'text-pink-500', desc: 'Card interactions' },
};

export function ComprehensiveAnalytics({ deck, format, commander, deckId }: ComprehensiveAnalyticsProps) {
  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [activeInsightType, setActiveInsightType] = useState<string | null>(null);
  const [archetype, setArchetype] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const powerScore = useMemo<EDHPowerScore | null>(() => {
    if (!deck || deck.length === 0) return null;

    const convertedDeck = deck.map(card => ({
      id: card.id || '',
      oracle_id: card.id || '',
      name: card.name,
      mana_cost: card.mana_cost || '',
      cmc: card.cmc,
      type_line: card.type_line,
      oracle_text: '',
      colors: card.colors || [],
      color_identity: card.colors || [],
      power: card.power,
      toughness: card.toughness,
      keywords: card.mechanics || [],
      legalities: {},
      image_uris: undefined,
      prices: { usd: '0' },
      set: '',
      set_name: '',
      collector_number: '',
      rarity: 'common' as any,
      layout: 'normal',
      is_legendary: false,
      tags: new Set<string>(),
      derived: { mv: card.cmc, colorPips: {}, producesMana: false, etbTapped: false }
    }));

    const convertedCommander = commander ? {
      ...convertedDeck[0],
      name: commander.name,
      cmc: commander.cmc || 0,
      type_line: commander.type_line || '',
      is_legendary: true,
    } : undefined;

    return EDHPowerCalculator.calculatePower(convertedDeck, format, 42, convertedCommander);
  }, [deck, format, commander]);

  // Load saved archetype on mount
  useEffect(() => {
    const loadArchetype = async () => {
      if (!deckId) return;
      
      try {
        const { data } = await supabase
          .from('user_decks')
          .select('archetype')
          .eq('id', deckId)
          .maybeSingle();
        
        if (data?.archetype) {
          setArchetype(data.archetype as string);
          setAiInsights(prev => ({ ...prev, archetype: data.archetype as string }));
        }
      } catch (err) {
        console.error('Failed to load archetype:', err);
      }
    };
    
    loadArchetype();
  }, [deckId]);

  const getAIInsight = async (analysisType: 'power-breakdown' | 'mana-analysis' | 'archetype' | 'recommendations') => {
    if (!powerScore) return;
    
    // Return cached insight if available (except recommendations which should always be fresh)
    if (aiInsights[analysisType] && analysisType !== 'recommendations') {
      setActiveInsightType(analysisType);
      return;
    }
    
    setLoadingInsight(true);
    setActiveInsightType(analysisType);

    try {
      const deckData = {
        totalCards: deck.length,
        commander: commander ? {
          name: commander.name,
          colors: commander.colors || []
        } : undefined,
        lands: deck.filter(c => c.type_line?.includes('Land')).length,
        creatures: deck.filter(c => c.type_line?.includes('Creature')).length,
        instants: deck.filter(c => c.type_line?.includes('Instant')).length,
        sorceries: deck.filter(c => c.type_line?.includes('Sorcery')).length,
        artifacts: deck.filter(c => c.type_line?.includes('Artifact')).length,
        enchantments: deck.filter(c => c.type_line?.includes('Enchantment')).length,
        avgCMC: powerScore.playability.avg_cmc,
        colors: commander?.colors || [],
        topCards: deck.slice(0, 15).map(c => c.name),
      };

      const { data, error } = await supabase.functions.invoke('gemini-deck-coach', {
        body: { powerData: powerScore, deckData, analysisType }
      });

      if (error) throw error;
      
      setAiInsights(prev => ({ ...prev, [analysisType]: data.insight }));
      
      // Save archetype to database
      if (analysisType === 'archetype' && deckId && data.insight) {
        const archetypeLabel = data.insight.split('\n')[0]; // First line is usually the label
        setArchetype(archetypeLabel);
        
        await supabase
          .from('user_decks')
          .update({ archetype: archetypeLabel } as any)
          .eq('id', deckId);
      }
    } catch (err) {
      console.error('Failed to get AI insight:', err);
      toast.error('Failed to get AI analysis');
    } finally {
      setLoadingInsight(false);
    }
  };

  if (!powerScore) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Add cards to see comprehensive analytics
        </CardContent>
      </Card>
    );
  }

  const bandColor = 
    powerScore.band === 'cedh' ? 'text-red-500' :
    powerScore.band === 'high' ? 'text-purple-500' :
    powerScore.band === 'mid' ? 'text-blue-500' : 'text-green-500';

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="power">Power</TabsTrigger>
        <TabsTrigger value="mana">Mana</TabsTrigger>
        <TabsTrigger value="strategy">Strategy</TabsTrigger>
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview" className="space-y-4">
        {/* Archetype Badge */}
        {archetype && (
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-500" />
                  <div>
                    <div className="font-semibold">Archetype</div>
                    <div className="text-sm text-muted-foreground">{archetype}</div>
                  </div>
                </div>
                <Button
                  onClick={() => getAIInsight('archetype')}
                  disabled={loadingInsight}
                  variant="ghost"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Power Score */}
        <Card className="border-l-4" style={{ borderLeftColor: `hsl(var(--primary))` }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Power Level
              </CardTitle>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={bandColor}>
                  {powerScore.band.toUpperCase()}
                </Badge>
                <div className="text-3xl font-bold">{powerScore.power.toFixed(1)}<span className="text-xl text-muted-foreground">/10</span></div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={powerScore.power * 10} className="h-3 mb-2" />
            <p className="text-sm text-muted-foreground">
              This deck operates at a <strong>{powerScore.band}</strong> power level with {powerScore.drivers.length} key strengths and {powerScore.drags.length} areas for improvement.
            </p>
          </CardContent>
        </Card>

        {/* Playability Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{powerScore.playability.keepable7_pct.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Keepable Hands</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{powerScore.playability.t1_color_hit_pct.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">T1 Color</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{powerScore.playability.avg_cmc.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Avg CMC</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{powerScore.playability.untapped_land_ratio.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Untapped</div>
            </CardContent>
          </Card>
        </div>

        {/* Get Recommendations Button */}
        <Button
          onClick={() => getAIInsight('recommendations')}
          disabled={loadingInsight}
          variant="default"
          size="lg"
          className="w-full"
        >
          {loadingInsight && activeInsightType === 'recommendations' ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating Recommendations...</>
          ) : (
            <><Star className="h-4 w-4 mr-2" /> Get Card Recommendations</>
          )}
        </Button>

        {aiInsights.recommendations && (
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiInsights.recommendations}</div>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* Power Tab */}
      <TabsContent value="power" className="space-y-4">
        <Card className="border-l-4" style={{ borderLeftColor: `hsl(var(--primary))` }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Power Breakdown
              </CardTitle>
              <div className="text-3xl font-bold">{powerScore.power.toFixed(1)}<span className="text-xl text-muted-foreground">/10</span></div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={powerScore.power * 10} className="h-3 mb-4" />
            
            <Button
              onClick={() => getAIInsight('power-breakdown')}
              disabled={loadingInsight}
              variant="outline"
              size="sm"
              className="w-full mb-4"
            >
              {loadingInsight && activeInsightType === 'power-breakdown' ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Brain className="h-4 w-4 mr-2" /> Get Detailed Analysis</>
              )}
            </Button>

            {aiInsights['power-breakdown'] && (
              <Card className="mb-4 bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <Brain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiInsights['power-breakdown']}</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Power Components */}
        <Card>
          <CardHeader>
            <CardTitle>Power Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(powerScore.subscores)
              .sort(([, a], [, b]) => b - a)
              .map(([key, score]) => {
                const config = SUBSCORE_CONFIG[key];
                if (!config) return null;
                const Icon = config.icon;
                
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        <span className="font-medium capitalize">{key.replace('_', ' ')}</span>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          title={config.desc}
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                      <Badge variant="outline">{Math.round(score)}/100</Badge>
                    </div>
                    <Progress value={score} className="h-2" />
                  </div>
                );
              })}
          </CardContent>
        </Card>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {powerScore.drivers.length > 0 && (
            <Card className="border-l-4 border-l-green-500">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {powerScore.drivers.map((driver, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span>{driver}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {powerScore.drags.length > 0 && (
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {powerScore.drags.map((drag, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">!</span>
                      <span>{drag}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </TabsContent>

      {/* Mana Tab */}
      <TabsContent value="mana" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mountain className="h-5 w-5" />
              Mana Base Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{powerScore.playability.keepable7_pct.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Keepable Hands</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{powerScore.playability.t1_color_hit_pct.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">T1 Color Hit</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{powerScore.playability.avg_cmc.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Average CMC</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded">
                <div className="text-2xl font-bold">{powerScore.playability.untapped_land_ratio.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Untapped Lands</div>
              </div>
            </div>

            <Button
              onClick={() => getAIInsight('mana-analysis')}
              disabled={loadingInsight}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {loadingInsight && activeInsightType === 'mana-analysis' ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Mountain className="h-4 w-4 mr-2" /> Get Detailed Mana Analysis</>
              )}
            </Button>

            {aiInsights['mana-analysis'] && (
              <Card className="mt-4 bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <Mountain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiInsights['mana-analysis']}</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Strategy Tab */}
      <TabsContent value="strategy" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Deck Strategy & Archetype
            </CardTitle>
          </CardHeader>
          <CardContent>
            {archetype && (
              <div className="mb-4 p-3 bg-primary/10 rounded-lg">
                <div className="font-semibold text-lg mb-1">{archetype}</div>
              </div>
            )}

            <Button
              onClick={() => getAIInsight('archetype')}
              disabled={loadingInsight}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {loadingInsight && activeInsightType === 'archetype' ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Lightbulb className="h-4 w-4 mr-2" /> {archetype ? 'Refresh' : 'Identify'} Strategy</>
              )}
            </Button>

            {aiInsights['archetype'] && (
              <Card className="mt-4 bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <Target className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiInsights['archetype']}</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
