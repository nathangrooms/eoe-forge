// Comprehensive AI Optimizer Panel with proper formatting
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Plus,
  Package,
  Library
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { scryfallAPI } from '@/lib/api/scryfall';
import { EdhAnalysisData } from './EdhAnalysisPanel';
import { cn } from '@/lib/utils';

interface CardSuggestion {
  name: string;
  image: string;
  price: number;
  reason: string;
  type?: string;
  playability?: number | null;
  inCollection?: boolean;
}

interface ReplacementSuggestion {
  currentCard: CardSuggestion;
  newCard: CardSuggestion;
  selected: boolean;
}

interface AnalysisResult {
  issues: Array<{ card: string; reason: string; severity: 'high' | 'medium' | 'low' }>;
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  summary: string;
  missingCount: number;
  recommendations: CardSuggestion[];
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
  onAddCard?: (cardName: string) => void;
}

export function AIOptimizerPanel({
  deckId,
  deckName,
  deckCards = [],
  format,
  commander,
  powerLevel,
  edhAnalysis,
  onApplyReplacements,
  onAddCard
}: AIOptimizerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [additionSuggestions, setAdditionSuggestions] = useState<CardSuggestion[]>([]);
  const [error, setError] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [showConfirmAll, setShowConfirmAll] = useState(false);
  const [showConfirmSingle, setShowConfirmSingle] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [useCollection, setUseCollection] = useState(false);

  // Calculate required cards based on format
  const getRequiredCards = () => {
    if (format?.toLowerCase() === 'commander' || format?.toLowerCase() === 'edh') {
      return 100;
    }
    return 60; // Standard/Modern/etc
  };

  const requiredCards = getRequiredCards();
  const missingCards = Math.max(0, requiredCards - deckCards.length);

  // Extract low playability cards from EDH analysis
  const lowPlayabilityCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a, b) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10);

  const hasEdhData = edhAnalysis && edhAnalysis.cardAnalysis?.length > 0;
  const hasResults = analysis || suggestions.length > 0 || additionSuggestions.length > 0;

  const generateOptimizations = async (fromCollection = false) => {
    setLoading(true);
    setError('');
    setUseCollection(fromCollection);
    
    try {
      // If using collection, fetch user's collection first
      let collectionCards: string[] = [];
      if (fromCollection) {
        setLoadingCollection(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_collections')
            .select('card_name')
            .eq('user_id', user.id);
          collectionCards = (data || []).map(c => c.card_name);
        }
        setLoadingCollection(false);
      }

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
`;
      }

      let collectionContext = '';
      if (fromCollection && collectionCards.length > 0) {
        collectionContext = `
**IMPORTANT: Only suggest cards from the user's collection:**
${collectionCards.slice(0, 200).join(', ')}
`;
      }

      const prompt = `Analyze this ${format} deck and provide structured recommendations.

**Deck:** ${deckName || 'Deck'}
${commander ? `**Commander:** ${commander.name}` : ''}
**Format:** ${format}
**Cards:** ${deckCards.length}/${requiredCards} (${missingCards > 0 ? `MISSING ${missingCards} CARDS` : 'Complete'})
**Types:** ${typeBreakdown}

${edhContext}
${collectionContext}

**Current Decklist:**
${cardList}

Respond in EXACTLY this JSON format (no markdown, just JSON):
{
  "summary": "One paragraph deck analysis",
  "issues": [
    {"card": "Card Name", "reason": "Why it's problematic", "severity": "high|medium|low"}
  ],
  "strengths": ["Strength 1", "Strength 2"],
  "strategy": ["Strategic tip 1", "Strategic tip 2"],
  "manabase": ["Mana observation 1"],
  "replacements": [
    {
      "remove": "Card to remove",
      "removeReason": "Why remove this card",
      "add": "Card to add",
      "addBenefit": "Why this is better",
      "addType": "Creature/Instant/etc"
    }
  ]${missingCards > 0 ? `,
  "additions": [
    {
      "name": "Card to add",
      "reason": "Why add this",
      "type": "Card type"
    }
  ]` : ''}
}

${missingCards > 0 ? `IMPORTANT: This deck needs ${missingCards} more cards. Include ${Math.min(missingCards, 10)} card addition suggestions.` : ''}
Prioritize replacing low playability cards. Suggest real, legal cards only.`;

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

      if (fnError) {
        const errMsg = fnError.message || String(fnError);
        if (/429|rate/i.test(errMsg)) {
          throw new Error('RATE_LIMIT');
        }
        if (/402|payment|credit/i.test(errMsg)) {
          throw new Error('PAYMENT_REQUIRED');
        }
        throw fnError;
      }
      
      if (data?.text) {
        const parsed = parseJsonResponse(data.text);
        setAnalysis(parsed);
        
        // Parse replacements and fetch card images
        if (parsed.replacements?.length > 0) {
          const replacements = await fetchReplacementImages(parsed.replacements, fromCollection ? collectionCards : []);
          setSuggestions(replacements);
        }

        // Parse additions if deck is missing cards
        if (parsed.additions?.length > 0) {
          const additions = await fetchAdditionImages(parsed.additions, fromCollection ? collectionCards : []);
          setAdditionSuggestions(additions);
        }
        
        setActiveTab(suggestions.length > 0 ? 'replacements' : 'overview');
        toast.success('Analysis complete');
      } else {
        throw new Error('No response generated');
      }
    } catch (err: any) {
      console.error('AI optimizer error:', err);
      const msg = String(err?.message || err);
      if (msg === 'RATE_LIMIT' || /429|rate/i.test(msg)) {
        setError('Rate limit exceeded. Please wait 30 seconds and try again.');
      } else if (msg === 'PAYMENT_REQUIRED' || /402|credit|payment/i.test(msg)) {
        setError('AI credits required. Please add credits in Settings → Workspace → Usage.');
      } else {
        setError('Failed to generate analysis. Please try again.');
      }
    } finally {
      setLoading(false);
      setLoadingCollection(false);
    }
  };

  const parseJsonResponse = (text: string): AnalysisResult & { replacements?: any[]; additions?: any[] } => {
    // Try to extract JSON from the response
    try {
      // Look for JSON object in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          issues: (parsed.issues || []).map((i: any) => ({
            card: i.card || '',
            reason: i.reason || '',
            severity: i.severity || 'medium'
          })),
          strengths: (parsed.strengths || []).map((s: any) => ({ text: typeof s === 'string' ? s : s.text })),
          strategy: (parsed.strategy || []).map((s: any) => ({ text: typeof s === 'string' ? s : s.text })),
          manabase: (parsed.manabase || []).map((s: any) => ({ text: typeof s === 'string' ? s : s.text })),
          missingCount: missingCards,
          recommendations: [],
          replacements: parsed.replacements || [],
          additions: parsed.additions || []
        };
      }
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
    }

    // Fallback: return empty result
    return {
      summary: 'Analysis could not be parsed. Please try again.',
      issues: [],
      strengths: [],
      strategy: [],
      manabase: [],
      missingCount: missingCards,
      recommendations: [],
      replacements: [],
      additions: []
    };
  };

  const fetchReplacementImages = async (
    replacements: any[],
    collectionCards: string[]
  ): Promise<ReplacementSuggestion[]> => {
    const results: ReplacementSuggestion[] = [];
    
    for (const rep of replacements.slice(0, 8)) {
      try {
        const [currentCardData, newCardData] = await Promise.all([
          fetchCardData(rep.remove),
          fetchCardData(rep.add)
        ]);

        if (currentCardData && newCardData) {
          const edhCardData = edhAnalysis?.cardAnalysis?.find(
            c => c.name.toLowerCase() === rep.remove.toLowerCase()
          );
          
          results.push({
            currentCard: {
              name: rep.remove,
              image: currentCardData.image_uri || '/placeholder.svg',
              price: Number(currentCardData.prices?.usd) || 0,
              reason: rep.removeReason || 'Underperforming',
              playability: edhCardData?.playability ?? null
            },
            newCard: {
              name: rep.add,
              image: newCardData.image_uri || '/placeholder.svg',
              price: Number(newCardData.prices?.usd) || 0,
              reason: rep.addBenefit || 'Better synergy',
              type: rep.addType || newCardData.type_line,
              inCollection: collectionCards.some(c => c.toLowerCase() === rep.add.toLowerCase())
            },
            selected: true
          });
        }
      } catch (e) {
        console.error('Error fetching replacement card:', e);
      }
    }

    return results;
  };

  const fetchAdditionImages = async (
    additions: any[],
    collectionCards: string[]
  ): Promise<CardSuggestion[]> => {
    const results: CardSuggestion[] = [];
    
    for (const add of additions.slice(0, 10)) {
      try {
        const cardData = await fetchCardData(add.name);
        if (cardData) {
          results.push({
            name: add.name,
            image: cardData.image_uri || '/placeholder.svg',
            price: Number(cardData.prices?.usd) || 0,
            reason: add.reason || 'Recommended addition',
            type: add.type || cardData.type_line,
            inCollection: collectionCards.some(c => c.toLowerCase() === add.name.toLowerCase())
          });
        }
      } catch (e) {
        console.error('Error fetching addition card:', e);
      }
    }

    return results;
  };

  const fetchCardData = async (cardName: string): Promise<any> => {
    try {
      const card = await scryfallAPI.getCardByName(cardName);
      return {
        name: card.name,
        image_uri: card.image_uris?.normal || card.image_uris?.large,
        prices: card.prices,
        type_line: card.type_line
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
      
      toast.success(`Replaced ${suggestion.currentCard.name}`);
      setSuggestions(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Error applying replacement:', error);
      toast.error('Failed to apply replacement');
    } finally {
      setIsApplying(false);
      setShowConfirmSingle(null);
    }
  };

  const handleAddCard = (cardName: string) => {
    if (onAddCard) {
      onAddCard(cardName);
      setAdditionSuggestions(prev => prev.filter(c => c.name !== cardName));
      toast.success(`Added ${cardName}`);
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
                <Brain className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-lg">AI Deck Optimizer</h3>
                <p className="text-sm text-muted-foreground">
                  {deckCards.length}/{requiredCards} cards
                  {missingCards > 0 && (
                    <span className="text-orange-400 ml-2">• {missingCards} needed</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasEdhData && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                  <Zap className="h-3 w-3 mr-1" />
                  EDH Data
                </Badge>
              )}
              <Button 
                variant="outline"
                onClick={() => generateOptimizations(true)}
                disabled={loading}
                size="sm"
              >
                {loadingCollection ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Library className="h-4 w-4 mr-2" />
                )}
                From Collection
              </Button>
              <Button 
                onClick={() => generateOptimizations(false)}
                disabled={loading || deckCards.length === 0}
                size="sm"
              >
                {loading && !loadingCollection ? (
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
                    Optimize
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Missing Cards Warning */}
      {missingCards > 0 && !hasResults && !loading && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              <span className="font-medium text-orange-400">
                Deck Incomplete: {missingCards} Cards Needed
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {format === 'commander' || format === 'edh'
                ? 'Commander decks require exactly 100 cards including the commander.'
                : 'Standard deck requires at least 60 cards.'}
              {' '}Run the optimizer to get card recommendations.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Low Playability Preview */}
      {hasEdhData && lowPlayabilityCards.length > 0 && !hasResults && !loading && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-orange-400">
                {lowPlayabilityCards.length} Low Playability Cards
              </span>
            </div>
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
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">{error}</p>
                {error.includes('Rate limit') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Too many requests. Please wait before trying again.
                  </p>
                )}
                {error.includes('credits') && (
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs mt-1">
                    Add Credits →
                  </Button>
                )}
              </div>
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
                <p className="font-medium">
                  {loadingCollection ? 'Loading your collection...' : 'Analyzing your deck...'}
                </p>
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
                : 'Get card replacement suggestions with visual previews.'}
            </p>
            {deckCards.length > 0 && (
              <div className="flex gap-2 justify-center">
                <Button onClick={() => generateOptimizations(false)}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Optimize Deck
                </Button>
                <Button variant="outline" onClick={() => generateOptimizations(true)}>
                  <Library className="h-4 w-4 mr-2" />
                  Use My Collection
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results Tabs */}
      {hasResults && !loading && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="replacements" className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Swaps
              {suggestions.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {suggestions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="additions" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Cards
              {additionSuggestions.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {additionSuggestions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <Card>
              <CardContent className="p-4 space-y-4">
                {analysis?.summary && (
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-sm leading-relaxed">{analysis.summary}</p>
                  </div>
                )}

                {analysis?.issues && analysis.issues.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-400" />
                      Issues ({analysis.issues.length})
                    </h4>
                    <div className="space-y-2">
                      {analysis.issues.map((issue, i) => (
                        <div key={i} className={cn("p-3 rounded-lg border text-sm", getSeverityColor(issue.severity))}>
                          <span className="font-medium">{issue.card}:</span> {issue.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis?.strengths && analysis.strengths.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      Strengths
                    </h4>
                    <ul className="space-y-1.5">
                      {analysis.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-green-400 mt-0.5">•</span>
                          {s.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis?.strategy && analysis.strategy.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-blue-400">
                      <Lightbulb className="h-4 w-4" />
                      Tips
                    </h4>
                    <ul className="space-y-1.5">
                      {analysis.strategy.map((s, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-blue-400 mt-0.5">•</span>
                          {s.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Replacements Tab */}
          <TabsContent value="replacements">
            {suggestions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No replacement suggestions available.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      {suggestions.length} Replacements
                      {useCollection && (
                        <Badge variant="outline" className="ml-2">
                          <Package className="h-3 w-3 mr-1" />
                          From Collection
                        </Badge>
                      )}
                    </span>
                    <span className={cn(
                      "text-sm font-normal flex items-center",
                      totalCostDifference >= 0 ? 'text-destructive' : 'text-green-500'
                    )}>
                      <DollarSign className="h-3 w-3" />
                      {totalCostDifference >= 0 ? '+' : ''}
                      {totalCostDifference.toFixed(2)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[450px] pr-2">
                    <div className="space-y-4">
                      {suggestions.map((suggestion, index) => (
                        <div 
                          key={index} 
                          className={cn(
                            "p-3 rounded-lg border transition-colors",
                            suggestion.selected ? "border-primary/50 bg-primary/5" : "border-border"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={suggestion.selected}
                              onCheckedChange={() => toggleSuggestion(index)}
                              className="mt-1"
                            />
                            
                            {/* Current Card */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                                  Remove
                                </Badge>
                                {suggestion.currentCard.playability !== null && (
                                  <Badge variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30 text-orange-400">
                                    {suggestion.currentCard.playability}% play
                                  </Badge>
                                )}
                              </div>
                              <img 
                                src={suggestion.currentCard.image}
                                alt={suggestion.currentCard.name}
                                className="w-32 rounded-lg shadow-md mb-2"
                                onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                              />
                              <p className="text-sm font-medium truncate">{suggestion.currentCard.name}</p>
                              <p className="text-xs text-muted-foreground">${suggestion.currentCard.price.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{suggestion.currentCard.reason}</p>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center py-8">
                              <ArrowRight className="h-5 w-5 text-primary flex-shrink-0" />
                            </div>

                            {/* New Card */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">
                                  Add
                                </Badge>
                                {suggestion.newCard.inCollection && (
                                  <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-400">
                                    <Package className="h-3 w-3 mr-1" />
                                    Owned
                                  </Badge>
                                )}
                              </div>
                              <img 
                                src={suggestion.newCard.image}
                                alt={suggestion.newCard.name}
                                className="w-32 rounded-lg shadow-md mb-2"
                                onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                              />
                              <p className="text-sm font-medium truncate">{suggestion.newCard.name}</p>
                              <p className="text-xs text-muted-foreground">${suggestion.newCard.price.toFixed(2)}</p>
                              <p className="text-xs text-green-600 mt-1 line-clamp-2">{suggestion.newCard.reason}</p>
                            </div>

                            {/* Apply Button */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowConfirmSingle(index)}
                              disabled={isApplying}
                              className="flex-shrink-0"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
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
          </TabsContent>

          {/* Additions Tab */}
          <TabsContent value="additions">
            {additionSuggestions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground mb-2">
                    {missingCards > 0 
                      ? 'Run the optimizer to get card recommendations.'
                      : 'Your deck is complete!'}
                  </p>
                  {missingCards > 0 && (
                    <Badge variant="outline" className="text-orange-400 border-orange-400/30">
                      {missingCards} cards needed
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    Recommended Additions
                    <Badge variant="secondary" className="ml-2">
                      {additionSuggestions.length} cards
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[450px] pr-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {additionSuggestions.map((card, index) => (
                        <div 
                          key={index}
                          className="p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex gap-3">
                            <img 
                              src={card.image}
                              alt={card.name}
                              className="w-24 rounded-lg shadow-md flex-shrink-0"
                              onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {card.inCollection && (
                                  <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-400">
                                    <Package className="h-3 w-3 mr-1" />
                                    Owned
                                  </Badge>
                                )}
                                {card.type && (
                                  <Badge variant="outline" className="text-xs">
                                    {card.type.split('—')[0].trim()}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium truncate">{card.name}</p>
                              <p className="text-xs text-muted-foreground">${card.price.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.reason}</p>
                              <Button
                                size="sm"
                                className="mt-2 w-full"
                                onClick={() => handleAddCard(card.name)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add to Deck
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Confirm All Dialog */}
      <AlertDialog open={showConfirmAll} onOpenChange={setShowConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply All Selected Replacements?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace {suggestions.filter(s => s.selected).length} cards in your deck. 
              Price difference: ${totalCostDifference >= 0 ? '+' : ''}{totalCostDifference.toFixed(2)}
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
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
