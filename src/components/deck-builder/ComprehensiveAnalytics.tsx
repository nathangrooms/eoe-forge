import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, Zap, Target, Shield, Sparkles, TrendingUp, 
  Mountain, Eye, AlertTriangle, Info, Lightbulb, RefreshCw
} from 'lucide-react';
import { EDHPowerCalculator, EDHPowerScore } from '@/lib/deckbuilder/score/edh-power-calculator';
import { Card as DeckCard } from '@/stores/deckStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ComprehensiveAnalyticsProps {
  deck: DeckCard[];
  format: string;
  commander?: DeckCard;
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

export function ComprehensiveAnalytics({ deck, format, commander }: ComprehensiveAnalyticsProps) {
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [activeInsightType, setActiveInsightType] = useState<string | null>(null);

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

  const getAIInsight = async (analysisType: 'power-breakdown' | 'mana-analysis' | 'archetype') => {
    if (!powerScore) return;
    
    setLoadingInsight(true);
    setActiveInsightType(analysisType);

    try {
      const deckData = {
        totalCards: deck.length,
        commander: commander,
        lands: deck.filter(c => c.type_line?.includes('Land')).length,
        creatures: deck.filter(c => c.type_line?.includes('Creature')).length,
        instants: deck.filter(c => c.type_line?.includes('Instant')).length,
        sorceries: deck.filter(c => c.type_line?.includes('Sorcery')).length,
        artifacts: deck.filter(c => c.type_line?.includes('Artifact')).length,
        enchantments: deck.filter(c => c.type_line?.includes('Enchantment')).length,
        avgCMC: powerScore.playability.avg_cmc,
        colors: commander?.colors || [],
        manaSources: {}, // Would be calculated from mana base
        topCards: deck.slice(0, 10).map(c => c.name),
      };

      const { data, error } = await supabase.functions.invoke('gemini-deck-coach', {
        body: { powerData: powerScore, deckData, analysisType }
      });

      if (error) throw error;
      setAiInsight(data.insight);
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
    <div className="space-y-4">
      {/* Main Power Score */}
      <Card className="border-l-4" style={{ borderLeftColor: `hsl(var(--primary))` }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Power Level Analysis
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
          <Progress value={powerScore.power * 10} className="h-3 mb-4" />
          
          <Button
            onClick={() => getAIInsight('power-breakdown')}
            disabled={loadingInsight}
            variant="outline"
            size="sm"
            className="w-full"
          >
            {loadingInsight && activeInsightType === 'power-breakdown' ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" /> Get AI Breakdown</>
            )}
          </Button>

          {aiInsight && activeInsightType === 'power-breakdown' && (
            <Card className="mt-4 bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <Brain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-sm whitespace-pre-wrap">{aiInsight}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Detailed Subscores */}
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

      {/* Playability Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Playability Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
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
            className="w-full mt-4"
          >
            {loadingInsight && activeInsightType === 'mana-analysis' ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
            ) : (
              <><Mountain className="h-4 w-4 mr-2" /> Analyze Mana Base</>
            )}
          </Button>

          {aiInsight && activeInsightType === 'mana-analysis' && (
            <Card className="mt-4 bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <Mountain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-sm whitespace-pre-wrap">{aiInsight}</div>
                </div>
              </CardContent>
            </Card>
          )}
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

      {/* Archetype Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Deck Archetype
          </CardTitle>
        </CardHeader>
        <CardContent>
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
              <><Lightbulb className="h-4 w-4 mr-2" /> Identify Strategy</>
            )}
          </Button>

          {aiInsight && activeInsightType === 'archetype' && (
            <Card className="mt-4 bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <Target className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-sm whitespace-pre-wrap">{aiInsight}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
