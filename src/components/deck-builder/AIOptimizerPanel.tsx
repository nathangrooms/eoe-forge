// Combined AI Coach + Replacements Panel
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Brain, 
  Sparkles, 
  Target, 
  Loader2, 
  AlertCircle,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Zap,
  RefreshCw,
  DollarSign,
  Check,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { scryfallAPI } from '@/lib/api/scryfall';
import { EdhAnalysisData } from './EdhAnalysisPanel';
import { cn } from '@/lib/utils';

interface ReplacementSuggestion {
  currentCard: {
    name: string;
    image: string;
    price: number;
    reason: string;
    playability?: number | null;
  };
  newCard: {
    name: string;
    image: string;
    price: number;
    benefit: string;
  };
  selected: boolean;
}

interface AnalysisResult {
  issues: Array<{ card: string; reason: string; severity: 'high' | 'medium' | 'low' }>;
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  summary: string;
}

interface AIOptimizerPanelProps {
  deckId: string;
  deckName: string;
  deckCards: Array<{
    id: string;
    name: string;
    type_line?: string;
    mana_cost?: string;
    cmc?: number;
    prices?: { usd?: string };
  }>;
  format?: string;
  commander?: { name: string };
  powerLevel?: number;
  edhAnalysis?: EdhAnalysisData | null;
  onApplyReplacements: (replacements: Array<{ remove: string; add: string }>) => void;
}

export function AIOptimizerPanel({
  deckId,
  deckName,
  deckCards = [],
  format,
  commander,
  powerLevel,
  edhAnalysis,
  onApplyReplacements
}: AIOptimizerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [error, setError] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [showConfirmAll, setShowConfirmAll] = useState(false);
  const [showConfirmSingle, setShowConfirmSingle] = useState<number | null>(null);

  // Extract low playability cards from EDH analysis
  const lowPlayabilityCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a, b) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10);

  const highImpactCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.impact > 10 && !c.isCommander)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const hasEdhData = edhAnalysis && edhAnalysis.cardAnalysis?.length > 0;
  const hasResults = analysis || suggestions.length > 0;

  const generateOptimizations = async () => {
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

**Low Playability Cards (prioritize replacing these):**
${lowPlayabilityCards.map(c => `- ${c.name}: ${c.playability}% playability`).join('\n') || 'None'}

**High Impact Cards:**
${highImpactCards.map(c => `- ${c.name}: ${c.impact} impact`).join('\n') || 'None'}

**Mana Base:**
- Lands: ${edhAnalysis.landAnalysis?.landCount ?? 'Unknown'}
- Mana Screw Risk: ${edhAnalysis.landAnalysis?.manaScrewPct ?? 'Unknown'}%
- Mana Flood Risk: ${edhAnalysis.landAnalysis?.manaFloodPct ?? 'Unknown'}%
`;
      }

      const prompt = `Analyze this ${format} deck and provide both analysis AND specific card replacement suggestions.

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
List 5-8 specific card replacements. PRIORITIZE cards with low playability scores. Format each as:
- **Remove:** [Card to remove] → **Add:** [Card to add]
  - Reason: [Why current card is weak]
  - Benefit: [Why new card is better]

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

Be specific with card names. Suggest real, affordable alternatives.
Referenced Cards: [list all cards mentioned]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed',
          deckContext: {
            id: deckId,
            name: deckName,
            format,
            commander,
            cards: deckCards,
            power: { score: powerLevel }
          }
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        const parsed = parseAnalysis(data.text);
        setAnalysis(parsed);
        
        // Parse replacements and fetch card images
        const replacements = await parseReplacementSuggestions(data.text, data.cards || []);
        setSuggestions(replacements);
        
        if (replacements.length > 0) {
          toast.success(`Generated ${replacements.length} replacement suggestions`);
        }
      } else {
        throw new Error('No response generated');
      }
    } catch (err: any) {
      console.error('AI optimizer error:', err);
      const msg = String(err?.message || err);
      if (/402|credit|payment/i.test(msg)) {
        setError('AI credits required. Please add credits and try again.');
      } else if (/429|rate/i.test(msg)) {
        setError('Rate limit reached. Please wait and try again.');
      } else {
        setError('Failed to generate analysis. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const parseAnalysis = (text: string): AnalysisResult => {
    const result: AnalysisResult = {
      issues: [],
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

    return result;
  };

  const parseReplacementSuggestions = async (
    message: string,
    aiCards: any[]
  ): Promise<ReplacementSuggestion[]> => {
    const suggestions: ReplacementSuggestion[] = [];
    
    const lines = message.split('\n');
    let currentCard = '';
    let newCard = '';
    let reason = '';
    let benefit = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect replacement patterns
      const replaceMatch = line.match(/(?:Remove|Replace|Swap|Upgrade)[:\s]+\*\*([^*]+)\*\*\s*(?:with|→|to)\s*\*\*([^*]+)\*\*/i);
      const arrowMatch = line.match(/\*\*Remove:\*\*\s*([^→]+)→\s*\*\*Add:\*\*\s*([^\n]+)/i);
      const simpleMatch = line.match(/\*\*([^*]+)\*\*\s*→\s*\*\*([^*]+)\*\*/);
      
      if (arrowMatch) {
        currentCard = arrowMatch[1].trim();
        newCard = arrowMatch[2].trim();
      } else if (replaceMatch) {
        currentCard = replaceMatch[1].trim();
        newCard = replaceMatch[2].trim();
      } else if (simpleMatch && !currentCard) {
        currentCard = simpleMatch[1].trim();
        newCard = simpleMatch[2].trim();
      }

      if (line.toLowerCase().includes('reason:')) {
        reason = line.replace(/^[-\s]*reason:\s*/i, '').trim();
      }
      if (line.toLowerCase().includes('benefit:')) {
        benefit = line.replace(/^[-\s]*benefit:\s*/i, '').trim();
      }

      if (currentCard && newCard && (reason || benefit || lines[i + 1]?.includes('**Remove') || i === lines.length - 1)) {
        // Fetch card images from Scryfall
        const [currentCardData, newCardData] = await Promise.all([
          fetchCardData(currentCard, aiCards),
          fetchCardData(newCard, aiCards)
        ]);

        if (currentCardData && newCardData) {
          const curPrice = Number(currentCardData.prices?.usd) || 0;
          const newPrice = Number(newCardData.prices?.usd) || 0;
          
          const edhCardData = edhAnalysis?.cardAnalysis?.find(
            c => c.name.toLowerCase() === currentCard.toLowerCase()
          );
          
          suggestions.push({
            currentCard: {
              name: currentCard,
              image: currentCardData.image_uri || '/placeholder.svg',
              price: curPrice,
              reason: reason || 'Underperforming card',
              playability: edhCardData?.playability ?? null
            },
            newCard: {
              name: newCard,
              image: newCardData.image_uri || '/placeholder.svg',
              price: newPrice,
              benefit: benefit || 'Better synergy and performance'
            },
            selected: true
          });
        }

        currentCard = '';
        newCard = '';
        reason = '';
        benefit = '';
      }
    }

    return suggestions;
  };

  const fetchCardData = async (cardName: string, aiCards: any[]): Promise<any> => {
    // Check AI cards first
    const aiCard = aiCards.find(c => c.name?.toLowerCase() === cardName.toLowerCase());
    if (aiCard) {
      return {
        name: aiCard.name,
        image_uri: aiCard.image_uri || aiCard.image_uris?.normal,
        prices: aiCard.prices
      };
    }

    try {
      const card = await scryfallAPI.getCardByName(cardName);
      return {
        name: card.name,
        image_uri: card.image_uris?.normal || card.image_uris?.large,
        prices: card.prices
      };
    } catch (error) {
      console.error(`Failed to fetch card: ${cardName}`, error);
      return null;
    }
  };

  const toggleSuggestion = (index: number) => {
    setSuggestions(prev => prev.map((s, i) => 
      i === index ? { ...s, selected: !s.selected } : s
    ));
  };

  const applySelectedReplacements = async () => {
    const selected = suggestions.filter(s => s.selected);
    
    if (selected.length === 0) {
      toast.error('No replacements selected');
      return;
    }

    setIsApplying(true);
    
    try {
      const replacements = selected.map(s => ({
        remove: s.currentCard.name,
        add: s.newCard.name
      }));

      await onApplyReplacements(replacements);
      
      toast.success(`Applied ${selected.length} replacement${selected.length > 1 ? 's' : ''}`);
      setSuggestions([]);
    } catch (error) {
      console.error('Error applying replacements:', error);
      toast.error('Failed to apply replacements');
    } finally {
      setIsApplying(false);
      setShowConfirmAll(false);
    }
  };

  const applySingleReplacement = async (index: number) => {
    const suggestion = suggestions[index];
    
    setIsApplying(true);
    
    try {
      await onApplyReplacements([{
        remove: suggestion.currentCard.name,
        add: suggestion.newCard.name
      }]);
      
      toast.success(`Replaced ${suggestion.currentCard.name} with ${suggestion.newCard.name}`);
      setSuggestions(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Error applying replacement:', error);
      toast.error('Failed to apply replacement');
    } finally {
      setIsApplying(false);
      setShowConfirmSingle(null);
    }
  };

  const totalCostDifference = suggestions
    .filter(s => s.selected)
    .reduce((sum, s) => sum + (s.newCard.price - s.currentCard.price), 0);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'medium': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'low': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
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
                <h3 className="font-bold text-lg">AI Deck Optimizer</h3>
                <p className="text-sm text-muted-foreground">
                  {hasEdhData ? 'Powered by EDH playability data' : 'Analysis + replacement suggestions'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasEdhData && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                  <Zap className="h-3 w-3 mr-1" />
                  EDH Data
                </Badge>
              )}
              <Button 
                onClick={generateOptimizations}
                disabled={loading || deckCards.length === 0}
                size="sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : hasResults ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Optimize Deck
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EDH Low Playability Preview */}
      {hasEdhData && lowPlayabilityCards.length > 0 && !hasResults && !loading && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-orange-400">
                {lowPlayabilityCards.length} Low Playability Cards Detected
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              These cards have low playability scores and are candidates for replacement.
            </p>
            <div className="flex flex-wrap gap-2">
              {lowPlayabilityCards.slice(0, 6).map((card, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className="text-xs bg-orange-500/10 border-orange-500/30"
                >
                  {card.name} 
                  <span className="ml-1 text-orange-400">({card.playability}%)</span>
                </Badge>
              ))}
              {lowPlayabilityCards.length > 6 && (
                <Badge variant="outline" className="text-xs">
                  +{lowPlayabilityCards.length - 6} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
                  Finding optimizations and fetching card images
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!hasResults && !loading && !error && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Brain className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">Ready to Optimize</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {deckCards.length === 0 
                ? 'Add cards to your deck to get AI-powered analysis.'
                : 'Click "Optimize Deck" to get analysis, issues, and replacement suggestions with card images.'}
            </p>
            {deckCards.length > 0 && (
              <Button onClick={generateOptimizations}>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Optimization
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Analysis Summary */}
      {analysis && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Analysis Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysis.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
            )}

            {analysis.issues.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  Issues Found
                </h4>
                <div className="space-y-2">
                  {analysis.issues.map((issue, i) => (
                    <div key={i} className={cn("p-2 rounded-lg border text-sm", getSeverityColor(issue.severity))}>
                      <span className="font-medium">{issue.card}:</span> {issue.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.strengths.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  Deck Strengths
                </h4>
                <ul className="space-y-1">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {s.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.strategy.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-blue-400">
                  <Lightbulb className="h-4 w-4" />
                  Tips
                </h4>
                <ul className="space-y-1">
                  {analysis.strategy.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {s.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Replacement Suggestions */}
      {suggestions.length > 0 && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                {suggestions.length} Suggested Replacements
              </span>
              <div className="flex items-center gap-3 text-sm font-normal">
                <span className="text-muted-foreground">
                  {suggestions.filter(s => s.selected).length} selected
                </span>
                <span className={cn(
                  "flex items-center",
                  totalCostDifference >= 0 ? 'text-destructive' : 'text-green-500'
                )}>
                  <DollarSign className="h-3 w-3" />
                  {totalCostDifference >= 0 ? '+' : ''}
                  {totalCostDifference.toFixed(2)}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {suggestions.map((suggestion, index) => (
                  <Card 
                    key={index} 
                    className={cn(
                      "border transition-colors overflow-hidden",
                      suggestion.selected ? "border-primary/50 bg-primary/5" : "border-border"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        {/* Current Card */}
                        <div className="flex-1">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={suggestion.selected}
                              onCheckedChange={() => toggleSuggestion(index)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-destructive font-medium uppercase">Remove</span>
                                {suggestion.currentCard.playability !== null && (
                                  <Badge variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30 text-orange-400">
                                    {suggestion.currentCard.playability}% play
                                  </Badge>
                                )}
                              </div>
                              <img 
                                src={suggestion.currentCard.image}
                                alt={suggestion.currentCard.name}
                                className="w-full max-w-[180px] rounded-lg shadow-md mb-2"
                                onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                              />
                              <p className="text-sm font-medium">{suggestion.currentCard.name}</p>
                              <p className="text-xs text-muted-foreground">${suggestion.currentCard.price.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground mt-1">{suggestion.currentCard.reason}</p>
                            </div>
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className="flex items-center">
                          <ArrowRight className="h-6 w-6 text-primary" />
                        </div>

                        {/* New Card */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-green-500 font-medium uppercase">Add</span>
                          </div>
                          <img 
                            src={suggestion.newCard.image}
                            alt={suggestion.newCard.name}
                            className="w-full max-w-[180px] rounded-lg shadow-md mb-2"
                            onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                          />
                          <p className="text-sm font-medium">{suggestion.newCard.name}</p>
                          <p className="text-xs text-muted-foreground">${suggestion.newCard.price.toFixed(2)}</p>
                          <p className="text-xs text-green-600 mt-1">{suggestion.newCard.benefit}</p>
                        </div>

                        {/* Apply Button */}
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            onClick={() => setShowConfirmSingle(index)}
                            disabled={isApplying}
                            className="whitespace-nowrap"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Apply
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* Bulk Actions */}
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <Button
                onClick={() => setShowConfirmAll(true)}
                disabled={isApplying || suggestions.filter(s => s.selected).length === 0}
                className="flex-1"
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Apply Selected ({suggestions.filter(s => s.selected).length})
              </Button>
              <Button
                variant="outline"
                onClick={() => setSuggestions(prev => prev.map(s => ({ ...s, selected: !prev.every(p => p.selected) })))}
              >
                {suggestions.every(s => s.selected) ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm All Dialog */}
      <AlertDialog open={showConfirmAll} onOpenChange={setShowConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply All Selected Replacements?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace {suggestions.filter(s => s.selected).length} cards in your deck. 
              The total price difference is ${totalCostDifference >= 0 ? '+' : ''}{totalCostDifference.toFixed(2)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applySelectedReplacements}>
              Apply Replacements
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Single Dialog */}
      <AlertDialog open={showConfirmSingle !== null} onOpenChange={() => setShowConfirmSingle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply This Replacement?</AlertDialogTitle>
            <AlertDialogDescription>
              {showConfirmSingle !== null && (
                <>
                  Replace <strong>{suggestions[showConfirmSingle]?.currentCard.name}</strong> with{' '}
                  <strong>{suggestions[showConfirmSingle]?.newCard.name}</strong>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => showConfirmSingle !== null && applySingleReplacement(showConfirmSingle)}>
              Apply Replacement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
