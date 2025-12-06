// AI-Powered Deck Replacements Panel
// Generates and displays AI suggestions for card replacements with visual comparison

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, 
  ArrowRight, 
  Check, 
  X, 
  DollarSign, 
  Loader2,
  TrendingDown,
  AlertTriangle,
  Zap,
  BarChart3
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

interface AIReplacementsPanelProps {
  deckId: string;
  deckName: string;
  deckSummary: any;
  edhAnalysis?: EdhAnalysisData | null;
  onApplyReplacements: (replacements: Array<{ remove: string; add: string }>) => void;
}

export function AIReplacementsPanel({
  deckId,
  deckName,
  deckSummary,
  edhAnalysis,
  onApplyReplacements
}: AIReplacementsPanelProps) {
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('suggestions');

  // Extract low playability cards from EDH analysis
  const lowPlayabilityCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a, b) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10);

  const hasEdhData = edhAnalysis && edhAnalysis.cardAnalysis && edhAnalysis.cardAnalysis.length > 0;

  const generateReplacements = async () => {
    if (!deckId || !deckName) {
      toast.error('Deck not loaded');
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);
    setErrorMsg(null);

    try {
      const deckCards = deckSummary?.cards?.map((dc: any) => ({
        name: dc.card_name,
        mana_cost: dc.card_data?.mana_cost,
        cmc: dc.card_data?.cmc,
        type_line: dc.card_data?.type_line,
        colors: dc.card_data?.colors,
        quantity: dc.quantity || 1
      })) || [];

      // Build EDH context for better suggestions
      let edhContext = '';
      if (hasEdhData) {
        const metrics = edhAnalysis!.metrics;
        edhContext = `
**EDH Analysis Data:**
- Power Level: ${metrics?.powerLevel?.toFixed(2) || 'Unknown'}/10
- Playability: ${metrics?.playability ?? 'Unknown'}%

**Low Playability Cards (prioritize replacing these):**
${lowPlayabilityCards.map(c => `- ${c.name}: ${c.playability}% playability, ${c.impact} impact`).join('\n') || 'None identified'}

**Mana Base:**
- Lands: ${edhAnalysis!.landAnalysis?.landCount ?? 'Unknown'}
- Mana Screw Risk: ${edhAnalysis!.landAnalysis?.manaScrewPct ?? 'Unknown'}%
`;
      }

      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: `Generate 5-8 specific card replacement suggestions for my deck.
          
${edhContext}

For each suggestion, provide EXACTLY in this format:
**Replace [Current Card]** → **[New Card]**
- Reason: [Why current card is weak]
- Benefit: [Why new card is better]

${hasEdhData ? 'PRIORITIZE replacing the low playability cards listed above.' : ''}
Focus on upgrades that improve consistency and power level.
Finish with: Referenced Cards: [list all cards mentioned]`,
          deckContext: {
            id: deckId,
            name: deckName,
            format: deckSummary?.format || 'commander',
            commander: deckSummary?.commander,
            cards: deckCards,
            power: deckSummary?.power
          },
          responseStyle: 'detailed'
        }
      });

      if (response.error || response.data?.error) {
        throw new Error(response.error?.message || response.data?.error);
      }

      const aiCards = response.data?.cards || [];
      const message = response.data?.message || '';

      // Parse the AI response to extract replacement suggestions
      const parsed = await parseReplacementSuggestions(message, aiCards);
      setSuggestions(parsed);

      if (parsed.length === 0) {
        toast.error('No replacement suggestions generated. Try again.');
      } else {
        toast.success(`Generated ${parsed.length} replacement suggestions`);
      }
    } catch (error: any) {
      console.error('Error generating replacements:', error);
      const msg = String(error?.message || error);
      if (/402|credit|payment/i.test(msg)) {
        const m = 'AI credits required. Please add credits and try again.';
        setErrorMsg(m);
        toast.error(m);
      } else if (/429|rate/i.test(msg)) {
        const m = 'Rate limit reached. Please wait and try again.';
        setErrorMsg(m);
        toast.error(m);
      } else {
        const m = 'Failed to generate replacements. Please try again.';
        setErrorMsg(m);
        toast.error(m);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const parseReplacementSuggestions = async (
    message: string,
    aiCards: any[]
  ): Promise<ReplacementSuggestion[]> => {
    const suggestions: ReplacementSuggestion[] = [];
    
    // Look for patterns like "Replace X with Y" or "X → Y"
    const lines = message.split('\n');
    let currentCard = '';
    let newCard = '';
    let reason = '';
    let benefit = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect replacement patterns
      const replaceMatch = line.match(/(?:Replace|Swap|Upgrade)\s+\*\*([^*]+)\*\*\s+(?:with|→|to)\s+\*\*([^*]+)\*\*/i);
      const arrowMatch = line.match(/\*\*([^*]+)\*\*\s*→\s*\*\*([^*]+)\*\*/);
      const simpleArrowMatch = line.match(/\*\*Replace\s+([^*]+)\*\*\s*→\s*\*\*([^*]+)\*\*/i);
      
      if (replaceMatch) {
        currentCard = replaceMatch[1].trim();
        newCard = replaceMatch[2].trim();
      } else if (simpleArrowMatch) {
        currentCard = simpleArrowMatch[1].trim();
        newCard = simpleArrowMatch[2].trim();
      } else if (arrowMatch) {
        currentCard = arrowMatch[1].trim();
        newCard = arrowMatch[2].trim();
      }

      // Look for reason/benefit on subsequent lines
      if (line.toLowerCase().startsWith('- reason:') || line.toLowerCase().startsWith('reason:')) {
        reason = line.replace(/^[-\s]*reason:\s*/i, '').trim();
      }
      if (line.toLowerCase().startsWith('- benefit:') || line.toLowerCase().startsWith('benefit:')) {
        benefit = line.replace(/^[-\s]*benefit:\s*/i, '').trim();
      }

      if (currentCard && newCard && (reason || benefit || i === lines.length - 1 || lines[i + 1]?.includes('**'))) {
        // Find images and prices for both cards
        const currentCardData = aiCards.find(c => c.name === currentCard) || 
          (await fetchCardData(currentCard));
        const newCardData = aiCards.find(c => c.name === newCard) || 
          (await fetchCardData(newCard));

        if (currentCardData && newCardData) {
          const curPrice = Number(currentCardData.prices?.usd) || 0;
          const newPrice = Number(newCardData.prices?.usd) || 0;
          
          // Get playability from EDH data if available
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

  const fetchCardData = async (cardName: string): Promise<any> => {
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
    }
  };

  const totalCostDifference = suggestions
    .filter(s => s.selected)
    .reduce((sum, s) => sum + (s.newCard.price - s.currentCard.price), 0);

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-lg">AI Replacements</h3>
                <p className="text-sm text-muted-foreground">
                  {hasEdhData ? 'Powered by EDH playability data' : 'AI-powered card upgrades'}
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
                onClick={generateReplacements}
                disabled={isGenerating || !deckId}
                size="sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EDH Low Playability Preview */}
      {hasEdhData && lowPlayabilityCards.length > 0 && suggestions.length === 0 && !isGenerating && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-orange-400">
                {lowPlayabilityCards.length} Low Playability Cards Detected
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              These cards have low playability scores from edhpowerlevel.com and are good candidates for replacement.
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
      {errorMsg && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{errorMsg}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {suggestions.length === 0 && !isGenerating && !errorMsg && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">Ready to Optimize</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {hasEdhData 
                ? `Found ${lowPlayabilityCards.length} underperforming cards. Generate AI suggestions to find better replacements.`
                : 'Click "Generate" to get AI-powered card replacement recommendations.'}
            </p>
            <Button onClick={generateReplacements} disabled={!deckId}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Suggestions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isGenerating && (
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
                  {hasEdhData ? 'Using EDH playability data for smarter suggestions' : 'Finding optimal card upgrades'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions List */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>{suggestions.length} Suggested Replacements</span>
              <div className="flex items-center gap-2 text-sm font-normal">
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
            <ScrollArea className="h-[450px] pr-4">
              <div className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <Card 
                    key={index} 
                    className={cn(
                      "border transition-colors",
                      suggestion.selected ? "border-primary/50 bg-primary/5" : "border-border"
                    )}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={suggestion.selected}
                          onCheckedChange={() => toggleSuggestion(index)}
                          className="mt-1"
                        />
                        
                        <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                          {/* Current Card */}
                          <div className="space-y-2">
                            <div className="relative aspect-[5/7] w-full max-w-[120px]">
                              <img
                                src={suggestion.currentCard.image}
                                alt={suggestion.currentCard.name}
                                className="w-full h-full object-cover rounded-lg border-2 border-destructive/50"
                              />
                              <Badge className="absolute top-1 right-1 text-xs bg-destructive px-1.5 py-0.5">
                                Out
                              </Badge>
                            </div>
                            <div>
                              <p className="font-medium text-sm truncate">{suggestion.currentCard.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="flex items-center">
                                  <DollarSign className="h-3 w-3" />
                                  {suggestion.currentCard.price.toFixed(2)}
                                </span>
                                {suggestion.currentCard.playability !== null && (
                                  <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30 px-1">
                                    {suggestion.currentCard.playability}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {suggestion.currentCard.reason}
                              </p>
                            </div>
                          </div>

                          {/* Arrow */}
                          <div className="flex items-center justify-center">
                            <ArrowRight className="h-6 w-6 text-primary flex-shrink-0" />
                          </div>

                          {/* New Card */}
                          <div className="space-y-2">
                            <div className="relative aspect-[5/7] w-full max-w-[120px]">
                              <img
                                src={suggestion.newCard.image}
                                alt={suggestion.newCard.name}
                                className="w-full h-full object-cover rounded-lg border-2 border-green-500/50"
                              />
                              <Badge className="absolute top-1 right-1 text-xs bg-green-500 px-1.5 py-0.5">
                                In
                              </Badge>
                            </div>
                            <div>
                              <p className="font-medium text-sm truncate">{suggestion.newCard.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center">
                                <DollarSign className="h-3 w-3" />
                                {suggestion.newCard.price.toFixed(2)}
                                <span className={cn(
                                  "ml-1",
                                  suggestion.newCard.price > suggestion.currentCard.price 
                                    ? 'text-destructive' 
                                    : 'text-green-500'
                                )}>
                                  ({suggestion.newCard.price > suggestion.currentCard.price ? '+' : ''}
                                  ${(suggestion.newCard.price - suggestion.currentCard.price).toFixed(2)})
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {suggestion.newCard.benefit}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setSuggestions([])}
                disabled={isApplying}
                size="sm"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button
                onClick={applySelectedReplacements}
                disabled={isApplying || suggestions.filter(s => s.selected).length === 0}
                size="sm"
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Apply {suggestions.filter(s => s.selected).length} Selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
