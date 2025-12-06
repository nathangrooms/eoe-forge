import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, 
  Sparkles, 
  Target, 
  Loader2, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Replace,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { AIErrorBoundary } from '@/components/ai/AIErrorBoundary';
import { EdhAnalysisData, CardAnalysis } from './EdhAnalysisPanel';
import { cn } from '@/lib/utils';

interface AIDeckCoachProps {
  deckCards?: Array<{
    name: string;
    type_line?: string;
    mana_cost?: string;
    cmc?: number;
  }>;
  deckName?: string;
  format?: string;
  commander?: {
    name: string;
  };
  powerLevel?: number;
  edhAnalysis?: EdhAnalysisData | null;
}

interface CoachingSection {
  title: string;
  icon: React.ReactNode;
  items: Array<{
    type: 'improvement' | 'issue' | 'suggestion' | 'strength';
    text: string;
    cardName?: string;
    priority?: 'high' | 'medium' | 'low';
  }>;
}

export function AIDeckCoach({ 
  deckCards = [], 
  deckName, 
  format, 
  commander, 
  powerLevel,
  edhAnalysis 
}: AIDeckCoachProps) {
  const [loading, setLoading] = useState(false);
  const [coaching, setCoaching] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Analyze low playability cards from EDH data
  const lowPlayabilityCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a, b) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10);

  const highImpactCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.impact > 10 && !c.isCommander)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const gameChangers = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.isGameChanger && !c.isCommander);

  const generateCoaching = async () => {
    setLoading(true);
    setError('');
    
    try {
      const cardList = deckCards.map(c => c.name).join('\n');
      const cardTypes = deckCards.reduce((acc, c) => {
        const type = c.type_line?.split('—')[0].trim() || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const typeBreakdown = Object.entries(cardTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      // Build EDH analysis context
      let edhContext = '';
      if (edhAnalysis) {
        const metrics = edhAnalysis.metrics;
        edhContext = `
**EDH Power Analysis (from edhpowerlevel.com):**
- Power Level: ${metrics?.powerLevel?.toFixed(2) || 'Unknown'}/10
- Tipping Point: Turn ${metrics?.tippingPoint ?? 'Unknown'}
- Efficiency: ${metrics?.efficiency?.toFixed(1) ?? 'Unknown'}/10
- Impact: ${metrics?.impact?.toFixed(0) ?? 'Unknown'}
- Playability: ${metrics?.playability ?? 'Unknown'}%

**Bracket Analysis:**
- Recommended Bracket: ${edhAnalysis.bracket?.recommended ?? 'Unknown'}
- Minimum Bracket: ${edhAnalysis.bracket?.minimum ?? 'Unknown'}
- Extra Turns: ${edhAnalysis.bracket?.extraTurns ?? 0}
- Mass Land Denial: ${edhAnalysis.bracket?.massLandDenial ?? 0}
- Early 2-Card Combos: ${edhAnalysis.bracket?.earlyTwoCardCombos ?? 0}
- Game Changers: ${edhAnalysis.bracket?.gameChangers ?? 0}

**Low Playability Cards (underperformers to consider replacing):**
${lowPlayabilityCards.map(c => `- ${c.name}: ${c.playability}% playability, ${c.impact} impact`).join('\n') || 'None identified'}

**High Impact Cards (deck strengths):**
${highImpactCards.map(c => `- ${c.name}: ${c.impact} impact, ${c.playability}% playability`).join('\n') || 'None identified'}

**Game Changers:**
${gameChangers.map(c => c.name).join(', ') || 'None'}

**Mana Base Analysis:**
- Land Count: ${edhAnalysis.landAnalysis?.landCount ?? 'Unknown'}
- Non-Land Count: ${edhAnalysis.landAnalysis?.nonLandCount ?? 'Unknown'}
- Mana Screw Probability: ${edhAnalysis.landAnalysis?.manaScrewPct ?? 'Unknown'}%
- Mana Flood Probability: ${edhAnalysis.landAnalysis?.manaFloodPct ?? 'Unknown'}%
- Sweet Spot: ${edhAnalysis.landAnalysis?.sweetSpotPct ?? 'Unknown'}%
`;
      }

      const prompt = `You are an expert MTG deck coach. Analyze this ${format} deck and provide SPECIFIC, ACTIONABLE coaching.

**Deck:** ${deckName || 'Untitled Deck'}
${commander ? `**Commander:** ${commander.name}` : ''}
**Format:** ${format}
**Power Level:** ${powerLevel || 'Unknown'}
**Total Cards:** ${deckCards.length}
**Type Distribution:** ${typeBreakdown}

${edhContext}

**Current Decklist (${deckCards.length} cards):**
${cardList}

Based on the EDH analysis data (especially the LOW PLAYABILITY cards), provide:

1. **CRITICAL ISSUES** (2-3 max): Cards with very low playability (<30%) that are actively hurting the deck. Explain WHY they underperform and suggest specific replacements.

2. **CARD SWAPS** (3-5): For each low playability card, suggest a specific replacement that would improve the deck. Format: "Replace [Card A] with [Card B] - [reason]"

3. **STRATEGY IMPROVEMENTS** (2-3): Based on the bracket analysis and game changers, how can this deck be more consistent?

4. **MANA BASE FIXES** (1-2): Based on the mana screw/flood probabilities, what changes are needed?

5. **POWER LEVEL TUNING**: Is this deck at the right power level? How to adjust up or down?

Be SPECIFIC with card names. Focus on the data provided. Keep each point concise.

End with: **Suggested Replacements:** [List all card swaps in format "Old Card -> New Card"]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setCoaching(data.text);
      } else {
        throw new Error('No coaching generated');
      }
    } catch (err) {
      console.error('AI coaching error:', err);
      setError('Failed to generate coaching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate when EDH analysis is available
  useEffect(() => {
    if (edhAnalysis && deckCards.length > 0 && !coaching && !loading) {
      // Don't auto-generate, let user trigger it
    }
  }, [edhAnalysis]);

  const hasEdhData = edhAnalysis && edhAnalysis.cardAnalysis?.length > 0;

  return (
    <AIErrorBoundary featureName="AI Deck Coach">
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">AI Deck Coach</h3>
              <p className="text-sm text-muted-foreground">
                {hasEdhData ? 'Powered by EDH Power Level analysis' : 'Strategic analysis and improvement suggestions'}
              </p>
            </div>
            {hasEdhData && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                <Zap className="h-3 w-3 mr-1" />
                EDH Data Ready
              </Badge>
            )}
          </div>

          {/* Quick Stats from EDH Analysis */}
          {hasEdhData && !coaching && (
            <div className="mb-4 space-y-3">
              {/* Low Playability Cards Preview */}
              {lowPlayabilityCards.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-orange-400" />
                    <span className="text-sm font-medium text-orange-400">
                      {lowPlayabilityCards.length} Low Playability Cards Detected
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {lowPlayabilityCards.slice(0, 5).map((card, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-orange-500/5">
                        {card.name} ({card.playability}%)
                      </Badge>
                    ))}
                    {lowPlayabilityCards.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{lowPlayabilityCards.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* High Impact Cards Preview */}
              {highImpactCards.length > 0 && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">
                      Top Performing Cards
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {highImpactCards.map((card, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-green-500/5">
                        {card.name} ({card.impact} impact)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Game Changers */}
              {gameChangers.length > 0 && (
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-400">
                      {gameChangers.length} Game Changers
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {gameChangers.map((card, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-purple-500/5">
                        {card.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!coaching && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {hasEdhData 
                  ? 'Get AI-powered coaching based on your EDH power analysis. The AI will identify underperforming cards and suggest specific replacements.'
                  : 'Fetch EDH analysis first for better recommendations, or get general coaching.'}
              </p>
              <Button 
                onClick={generateCoaching}
                className="w-full bg-gradient-cosmic hover:opacity-90"
                disabled={loading || deckCards.length === 0}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {deckCards.length === 0 
                  ? 'Add cards to deck first' 
                  : hasEdhData 
                    ? 'Get EDH-Powered Coaching'
                    : 'Get Coaching'}
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                {hasEdhData ? 'Analyzing EDH data and generating recommendations...' : 'Analyzing your deck...'}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {coaching && (
            <div className="space-y-4">
              <ScrollArea className="h-[500px]">
                <div className="border-l-4 border-primary/50 pl-4 bg-primary/5 rounded-r-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                      <Brain className="h-3 w-3 text-primary-foreground" />
                    </div>
                    <span className="text-xs font-bold text-primary">AI DECK COACH</span>
                    {hasEdhData && (
                      <Badge variant="outline" className="text-xs">EDH-Powered</Badge>
                    )}
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/80 prose-strong:text-foreground prose-li:text-foreground/80">
                    <ReactMarkdown>{coaching}</ReactMarkdown>
                  </div>
                </div>
              </ScrollArea>
              
              <Button 
                onClick={generateCoaching}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Target className="h-4 w-4 mr-2" />
                Refresh Analysis
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AIErrorBoundary>
  );
}
