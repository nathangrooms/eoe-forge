import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, TrendingDown, TrendingUp, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface CardReplacementEngineProps {
  deckCards: any[];
  onReplaceCard: (oldCardId: string, newCard: any) => void;
}

export function CardReplacementEngine({ deckCards, onReplaceCard }: CardReplacementEngineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replacementType, setReplacementType] = useState<'budget' | 'upgrade' | 'similar'>('budget');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      showError('Enter a card name', 'Please search for a card to find replacements');
      return;
    }

    setLoading(true);
    try {
      // Find the card in the deck
      const card = deckCards.find(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (!card) {
        showError('Card not found', 'This card is not in your deck');
        setLoading(false);
        return;
      }

      setSelectedCard(card);

      // Get similar cards based on type and CMC
      const typeQuery = card.type_line?.split('—')[0]?.trim() || 'Creature';
      const cmc = card.cmc || 0;

      let query = supabase
        .from('cards')
        .select('*')
        .ilike('type_line', `%${typeQuery}%`)
        .neq('id', card.id);

      if (replacementType === 'budget') {
        // Find cheaper alternatives
        const currentPrice = parseFloat(card.prices?.usd || '999');
        query = query
          .lte('prices->usd', Math.max(currentPrice * 0.5, 5).toString())
          .gte('cmc', Math.max(0, cmc - 1))
          .lte('cmc', cmc + 1);
      } else if (replacementType === 'upgrade') {
        // Find more powerful alternatives
        const currentPrice = parseFloat(card.prices?.usd || '0');
        query = query
          .gte('prices->usd', (currentPrice * 1.5).toString())
          .gte('cmc', Math.max(0, cmc - 1))
          .lte('cmc', cmc + 2);
      } else {
        // Find similar cards
        query = query
          .gte('cmc', Math.max(0, cmc - 1))
          .lte('cmc', cmc + 1);
      }

      // Match colors if possible
      if (card.color_identity && card.color_identity.length > 0) {
        query = query.contains('color_identity', card.color_identity);
      }

      const { data, error } = await query.limit(10);

      if (error) throw error;

      setSuggestions(data || []);
      if (!data || data.length === 0) {
        showError('No replacements found', 'Try adjusting your search criteria');
      }
    } catch (error: any) {
      showError('Search failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReplace = (newCard: any) => {
    if (selectedCard) {
      onReplaceCard(selectedCard.id, newCard);
      showSuccess('Card replaced', `${selectedCard.name} → ${newCard.name}`);
      setSearchQuery('');
      setSelectedCard(null);
      setSuggestions([]);
    }
  };

  const getTypeIcon = (type: string) => {
    if (type === 'budget') return <TrendingDown className="h-4 w-4 text-green-500" />;
    if (type === 'upgrade') return <TrendingUp className="h-4 w-4 text-blue-500" />;
    return <ArrowRightLeft className="h-4 w-4 text-yellow-500" />;
  };

  const getTypeBadge = (type: string) => {
    if (type === 'budget') return 'Budget Alternative';
    if (type === 'upgrade') return 'Upgrade Option';
    return 'Similar Card';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Card Replacement Engine
        </CardTitle>
        <CardDescription>Find budget alternatives or upgrades for cards in your deck</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Controls */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for a card in your deck..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                className="pl-10"
              />
            </div>
            <Select value={replacementType} onValueChange={(value: any) => setReplacementType(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="budget">Budget Options</SelectItem>
                <SelectItem value="upgrade">Upgrade Options</SelectItem>
                <SelectItem value="similar">Similar Cards</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? 'Searching...' : 'Find Replacements'}
          </Button>
        </div>

        {/* Selected Card */}
        {selectedCard && (
          <div className="p-3 rounded-lg border bg-muted/50">
            <div className="text-sm font-medium mb-1">Replacing:</div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{selectedCard.name}</span>
              <Badge variant="outline">
                ${parseFloat(selectedCard.prices?.usd || '0').toFixed(2)}
              </Badge>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {getTypeIcon(replacementType)}
              <span>{getTypeBadge(replacementType)}</span>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {suggestions.map((card) => {
                const price = parseFloat(card.prices?.usd || '0');
                const originalPrice = parseFloat(selectedCard?.prices?.usd || '0');
                const priceDiff = price - originalPrice;
                const isPriceDiffPositive = priceDiff > 0;

                return (
                  <div key={card.id} className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{card.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            CMC {card.cmc}
                          </Badge>
                          {card.rarity && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {card.rarity}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="font-bold">${price.toFixed(2)}</div>
                        {selectedCard && (
                          <div className={`text-xs ${isPriceDiffPositive ? 'text-red-500' : 'text-green-500'}`}>
                            {isPriceDiffPositive ? '+' : ''}{priceDiff.toFixed(2)}
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReplace(card)}
                        >
                          Replace
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!selectedCard && suggestions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-2">Search for a card in your deck to find replacements</p>
            <p className="text-sm">Find budget alternatives or powerful upgrades</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
