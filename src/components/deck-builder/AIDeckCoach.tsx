import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  Sparkles, 
  Target, 
  Loader2, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Zap,
  RefreshCw,
  Layers,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { AIErrorBoundary } from '@/components/ai/AIErrorBoundary';
import { EdhAnalysisData } from './EdhAnalysisPanel';
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

interface AnalysisResult {
  issues: Array<{ card: string; reason: string; severity: 'high' | 'medium' | 'low' }>;
  swaps: Array<{ remove: string; add: string; reason: string }>;
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  summary: string;
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
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [rawCoaching, setRawCoaching] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');

  // Analyze cards from EDH data
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
**EDH Power Analysis:**
- Power Level: ${metrics?.powerLevel?.toFixed(2) || 'Unknown'}/10
- Tipping Point: Turn ${metrics?.tippingPoint ?? 'Unknown'}
- Efficiency: ${metrics?.efficiency?.toFixed(1) ?? 'Unknown'}/10

**Low Playability Cards:**
${lowPlayabilityCards.map(c => `- ${c.name}: ${c.playability}% playability`).join('\n') || 'None'}

**High Impact Cards:**
${highImpactCards.map(c => `- ${c.name}: ${c.impact} impact`).join('\n') || 'None'}

**Mana Base:**
- Lands: ${edhAnalysis.landAnalysis?.landCount ?? 'Unknown'}
- Mana Screw Risk: ${edhAnalysis.landAnalysis?.manaScrewPct ?? 'Unknown'}%
- Mana Flood Risk: ${edhAnalysis.landAnalysis?.manaFloodPct ?? 'Unknown'}%
`;
      }

      const prompt = `Analyze this ${format} deck and provide improvement suggestions in a structured format.

**Deck:** ${deckName || 'Deck'}
${commander ? `**Commander:** ${commander.name}` : ''}
**Format:** ${format}
**Cards:** ${deckCards.length}
**Types:** ${typeBreakdown}

${edhContext}

**Decklist:**
${cardList}

Provide analysis in EXACTLY this format (use these exact headers):

## SUMMARY
One paragraph summary of the deck's current state and main focus area.

## CRITICAL ISSUES
List 2-3 cards that are underperforming. Format each as:
- **[Card Name]** - [Why it's a problem] (Severity: High/Medium/Low)

## RECOMMENDED SWAPS
List 3-5 specific card replacements. Format each as:
- **Remove:** [Card to remove] → **Add:** [Card to add] - [Reason]

## DECK STRENGTHS
List 2-3 things the deck does well:
- [Strength 1]
- [Strength 2]

## STRATEGY TIPS
List 2-3 strategic improvements:
- [Tip 1]
- [Tip 2]

## MANA BASE
List 1-2 mana base observations:
- [Observation]

Be specific with card names. Keep each point concise (1-2 sentences max).`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setRawCoaching(data.text);
        parseAnalysis(data.text);
      } else {
        throw new Error('No coaching generated');
      }
    } catch (err) {
      console.error('AI coaching error:', err);
      setError('Failed to generate analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const parseAnalysis = (text: string) => {
    const result: AnalysisResult = {
      issues: [],
      swaps: [],
      strengths: [],
      strategy: [],
      manabase: [],
      summary: ''
    };

    // Extract summary
    const summaryMatch = text.match(/## SUMMARY\s*([\s\S]*?)(?=## |$)/i);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    // Extract issues
    const issuesMatch = text.match(/## CRITICAL ISSUES\s*([\s\S]*?)(?=## |$)/i);
    if (issuesMatch) {
      const issueLines = issuesMatch[1].match(/[-•]\s*\*\*([^*]+)\*\*\s*[-–]\s*([^(]+)\(Severity:\s*(High|Medium|Low)\)/gi);
      issueLines?.forEach(line => {
        const match = line.match(/\*\*([^*]+)\*\*\s*[-–]\s*([^(]+)\(Severity:\s*(High|Medium|Low)\)/i);
        if (match) {
          result.issues.push({
            card: match[1].trim(),
            reason: match[2].trim(),
            severity: match[3].toLowerCase() as 'high' | 'medium' | 'low'
          });
        }
      });
    }

    // Extract swaps
    const swapsMatch = text.match(/## RECOMMENDED SWAPS\s*([\s\S]*?)(?=## |$)/i);
    if (swapsMatch) {
      const swapLines = swapsMatch[1].match(/[-•]\s*\*\*Remove:\*\*\s*([^→]+)→\s*\*\*Add:\*\*\s*([^-–]+)[-–]\s*(.+)/gi);
      swapLines?.forEach(line => {
        const match = line.match(/\*\*Remove:\*\*\s*([^→]+)→\s*\*\*Add:\*\*\s*([^-–]+)[-–]\s*(.+)/i);
        if (match) {
          result.swaps.push({
            remove: match[1].trim(),
            add: match[2].trim(),
            reason: match[3].trim()
          });
        }
      });
    }

    // Extract strengths
    const strengthsMatch = text.match(/## DECK STRENGTHS\s*([\s\S]*?)(?=## |$)/i);
    if (strengthsMatch) {
      const lines = strengthsMatch[1].match(/[-•]\s*(.+)/g);
      lines?.forEach(line => {
        result.strengths.push({ text: line.replace(/^[-•]\s*/, '').trim() });
      });
    }

    // Extract strategy
    const strategyMatch = text.match(/## STRATEGY TIPS\s*([\s\S]*?)(?=## |$)/i);
    if (strategyMatch) {
      const lines = strategyMatch[1].match(/[-•]\s*(.+)/g);
      lines?.forEach(line => {
        result.strategy.push({ text: line.replace(/^[-•]\s*/, '').trim() });
      });
    }

    // Extract mana base
    const manaMatch = text.match(/## MANA BASE\s*([\s\S]*?)(?=## |$)/i);
    if (manaMatch) {
      const lines = manaMatch[1].match(/[-•]\s*(.+)/g);
      lines?.forEach(line => {
        result.manabase.push({ text: line.replace(/^[-•]\s*/, '').trim() });
      });
    }

    setAnalysis(result);
  };

  const hasEdhData = edhAnalysis && edhAnalysis.cardAnalysis?.length > 0;
  const hasAnalysis = analysis && (analysis.issues.length > 0 || analysis.swaps.length > 0 || analysis.summary);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'medium': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'low': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <AIErrorBoundary featureName="Deck Coach">
      <div className="space-y-4">
        {/* Header */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
                  <Brain className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Deck Coach</h3>
                  <p className="text-sm text-muted-foreground">
                    {hasEdhData ? 'Analysis powered by EDH data' : 'Strategic deck analysis'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasEdhData && (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Zap className="h-3 w-3 mr-1" />
                    EDH Ready
                  </Badge>
                )}
                <Button 
                  onClick={generateCoaching}
                  disabled={loading || deckCards.length === 0}
                  size="sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : hasAnalysis ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analyze Deck
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                  <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Analyzing your deck...</p>
                  <p className="text-sm text-muted-foreground">
                    {hasEdhData ? 'Processing EDH metrics and card data' : 'Evaluating card synergies and strategy'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pre-Analysis Quick Stats */}
        {!hasAnalysis && !loading && hasEdhData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {lowPlayabilityCards.length > 0 && (
              <Card className="border-orange-500/30 bg-orange-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-orange-400" />
                    <span className="text-sm font-medium text-orange-400">Underperformers</span>
                  </div>
                  <p className="text-2xl font-bold">{lowPlayabilityCards.length}</p>
                  <p className="text-xs text-muted-foreground">cards with low playability</p>
                </CardContent>
              </Card>
            )}
            {highImpactCards.length > 0 && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">High Impact</span>
                  </div>
                  <p className="text-2xl font-bold">{highImpactCards.length}</p>
                  <p className="text-xs text-muted-foreground">top performing cards</p>
                </CardContent>
              </Card>
            )}
            {gameChangers.length > 0 && (
              <Card className="border-purple-500/30 bg-purple-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-400">Game Changers</span>
                  </div>
                  <p className="text-2xl font-bold">{gameChangers.length}</p>
                  <p className="text-xs text-muted-foreground">powerful threats</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Empty State */}
        {!hasAnalysis && !loading && !error && (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Ready to Analyze</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                {deckCards.length === 0 
                  ? 'Add cards to your deck to get analysis and improvement suggestions.'
                  : 'Click "Analyze Deck" to get strategic insights, card recommendations, and improvement suggestions.'}
              </p>
              {deckCards.length > 0 && (
                <Button onClick={generateCoaching}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Analysis
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analysis Results */}
        {hasAnalysis && !loading && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">
                <Layers className="h-4 w-4 mr-1 hidden sm:inline" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="issues" className="text-xs sm:text-sm">
                <AlertTriangle className="h-4 w-4 mr-1 hidden sm:inline" />
                Issues
                {analysis.issues.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">{analysis.issues.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="swaps" className="text-xs sm:text-sm">
                <ArrowRight className="h-4 w-4 mr-1 hidden sm:inline" />
                Swaps
                {analysis.swaps.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">{analysis.swaps.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tips" className="text-xs sm:text-sm">
                <Lightbulb className="h-4 w-4 mr-1 hidden sm:inline" />
                Tips
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              {analysis.summary && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Analysis Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
                  </CardContent>
                </Card>
              )}

              {analysis.strengths.length > 0 && (
                <Card className="border-green-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      Deck Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.strengths.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 shrink-0" />
                          <span className="text-muted-foreground">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Quick Issue Summary */}
              {analysis.issues.length > 0 && (
                <Card className="border-orange-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-400">
                      <AlertTriangle className="h-4 w-4" />
                      {analysis.issues.length} Issues Found
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analysis.issues.map((issue, i) => (
                        <Badge 
                          key={i} 
                          variant="outline" 
                          className={cn("text-xs", getSeverityColor(issue.severity))}
                        >
                          {issue.card}
                        </Badge>
                      ))}
                    </div>
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="px-0 mt-2 h-auto text-orange-400"
                      onClick={() => setActiveTab('issues')}
                    >
                      View details →
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Issues Tab */}
            <TabsContent value="issues" className="space-y-3">
              {analysis.issues.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No critical issues found!</p>
                  </CardContent>
                </Card>
              ) : (
                analysis.issues.map((issue, i) => (
                  <Card key={i} className={cn("border-l-4", 
                    issue.severity === 'high' ? 'border-l-destructive' :
                    issue.severity === 'medium' ? 'border-l-orange-500' : 'border-l-yellow-500'
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{issue.card}</span>
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs capitalize", getSeverityColor(issue.severity))}
                            >
                              {issue.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{issue.reason}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Swaps Tab */}
            <TabsContent value="swaps" className="space-y-3">
              {analysis.swaps.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No swaps suggested - deck looks optimized!</p>
                  </CardContent>
                </Card>
              ) : (
                analysis.swaps.map((swap, i) => (
                  <Card key={i} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex items-stretch">
                        <div className="flex-1 p-4 bg-destructive/5 border-r border-border">
                          <p className="text-xs text-muted-foreground mb-1">Remove</p>
                          <p className="font-medium text-destructive">{swap.remove}</p>
                        </div>
                        <div className="flex items-center justify-center px-3 bg-muted/30">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 p-4 bg-green-500/5">
                          <p className="text-xs text-muted-foreground mb-1">Add</p>
                          <p className="font-medium text-green-400">{swap.add}</p>
                        </div>
                      </div>
                      <div className="px-4 py-3 bg-muted/20 border-t border-border">
                        <p className="text-xs text-muted-foreground">{swap.reason}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Tips Tab */}
            <TabsContent value="tips" className="space-y-4">
              {analysis.strategy.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Strategy Improvements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {analysis.strategy.map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Lightbulb className="h-3 w-3 text-primary" />
                          </div>
                          <span className="text-muted-foreground">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {analysis.manabase.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="h-4 w-4 text-blue-400" />
                      Mana Base
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.manabase.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                          <span className="text-muted-foreground">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {analysis.strategy.length === 0 && analysis.manabase.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Lightbulb className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No additional tips at this time.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AIErrorBoundary>
  );
}
