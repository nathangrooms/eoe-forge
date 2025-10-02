// AI-Powered Deck Replacements Panel
// Generates and displays AI suggestions for card replacements with visual comparison

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, ArrowRight, Check, X, DollarSign, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { scryfallAPI } from '@/lib/api/scryfall';

interface ReplacementSuggestion {
  currentCard: {
    name: string;
    image: string;
    price: number;
    reason: string;
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
  onApplyReplacements: (replacements: Array<{ remove: string; add: string }>) => void;
}

export function AIReplacementsPanel({
  deckId,
  deckName,
  deckSummary,
  onApplyReplacements
}: AIReplacementsPanelProps) {
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const generateReplacements = async () => {
    if (!deckId || !deckName) {
      toast.error('Deck not loaded');
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);

    try {
      const deckCards = deckSummary?.cards?.map((dc: any) => ({
        name: dc.card_name,
        mana_cost: dc.card_data?.mana_cost,
        cmc: dc.card_data?.cmc,
        type_line: dc.card_data?.type_line,
        colors: dc.card_data?.colors,
        quantity: dc.quantity || 1
      })) || [];

      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: `Generate 5-8 specific card replacement suggestions for my deck. For each suggestion, provide:
- The current card to replace
- The upgrade card to add
- The reason for replacement
- The benefit of the upgrade
Format as a clear list. Finish with: Referenced Cards: [list all cards mentioned]`,
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
        toast.error('AI credits required. Please add credits and try again.');
      } else if (/429|rate/i.test(msg)) {
        toast.error('Rate limit reached. Please wait and try again.');
      } else {
        toast.error('Failed to generate replacements. Please try again.');
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
      
      if (replaceMatch) {
        currentCard = replaceMatch[1].trim();
        newCard = replaceMatch[2].trim();
        reason = lines[i + 1]?.trim() || 'Upgrade suggestion';
        benefit = lines[i + 2]?.trim() || 'Improved performance';
      } else if (arrowMatch) {
        currentCard = arrowMatch[1].trim();
        newCard = arrowMatch[2].trim();
        reason = lines[i + 1]?.trim() || 'Upgrade suggestion';
        benefit = lines[i + 2]?.trim() || 'Improved performance';
      }

      if (currentCard && newCard) {
        // Find images and prices for both cards
        const currentCardData = aiCards.find(c => c.name === currentCard) || 
          (await fetchCardData(currentCard));
        const newCardData = aiCards.find(c => c.name === newCard) || 
          (await fetchCardData(newCard));

        if (currentCardData && newCardData) {
          const curPrice = Number(currentCardData.prices?.usd) || 0;
          const newPrice = Number(newCardData.prices?.usd) || 0;
          suggestions.push({
            currentCard: {
              name: currentCard,
              image: currentCardData.image_uri || '/placeholder.svg',
              price: curPrice,
              reason: reason.replace(/^[-*•]\s*/, '')
            },
            newCard: {
              name: newCard,
              image: newCardData.image_uri || '/placeholder.svg',
              price: newPrice,
              benefit: benefit.replace(/^[-*•]\s*/, '')
            },
            selected: true // Selected by default
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-spacecraft" />
              DeckMatrix AI Replacements
            </div>
            <Button
              onClick={generateReplacements}
              disabled={isGenerating || !deckId}
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Suggestions
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {suggestions.length === 0 && !isGenerating && (
            <div className="text-center p-8 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Click "Generate Suggestions" to get AI-powered replacement recommendations</p>
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <Card key={index} className="border-2 hover:border-spacecraft/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <Checkbox
                            checked={suggestion.selected}
                            onCheckedChange={() => toggleSuggestion(index)}
                            className="mt-2"
                          />
                          
                          <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                            {/* Current Card */}
                            <div className="space-y-2">
                              <div className="relative">
                                <img
                                  src={suggestion.currentCard.image}
                                  alt={suggestion.currentCard.name}
                                  className="w-full rounded-lg border-2 border-red-500/50"
                                />
                                <Badge className="absolute top-2 right-2 bg-red-500">Out</Badge>
                              </div>
                              <div>
                                <p className="font-medium text-sm">{suggestion.currentCard.name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  ${suggestion.currentCard.price.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {suggestion.currentCard.reason}
                                </p>
                              </div>
                            </div>

                            {/* Arrow */}
                            <ArrowRight className="h-8 w-8 text-spacecraft flex-shrink-0" />

                            {/* New Card */}
                            <div className="space-y-2">
                              <div className="relative">
                                <img
                                  src={suggestion.newCard.image}
                                  alt={suggestion.newCard.name}
                                  className="w-full rounded-lg border-2 border-green-500/50"
                                />
                                <Badge className="absolute top-2 right-2 bg-green-500">In</Badge>
                              </div>
                              <div>
                                <p className="font-medium text-sm">{suggestion.newCard.name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  ${suggestion.newCard.price.toFixed(2)}
                                  <span className={`ml-1 ${suggestion.newCard.price > suggestion.currentCard.price ? 'text-red-500' : 'text-green-500'}`}>
                                    ({suggestion.newCard.price > suggestion.currentCard.price ? '+' : ''}
                                    ${(suggestion.newCard.price - suggestion.currentCard.price).toFixed(2)})
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
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
                <div>
                  <p className="text-sm font-medium">
                    {suggestions.filter(s => s.selected).length} of {suggestions.length} selected
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Total cost difference: 
                    <span className={totalCostDifference >= 0 ? 'text-red-500' : 'text-green-500'}>
                      {totalCostDifference >= 0 ? '+' : ''}${totalCostDifference.toFixed(2)}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSuggestions([])}
                    disabled={isApplying}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={applySelectedReplacements}
                    disabled={isApplying || suggestions.filter(s => s.selected).length === 0}
                  >
                    {isApplying ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Apply Selected
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
