import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { CardRecommendationDisplay, type CardData } from '@/components/shared/CardRecommendationDisplay';

interface AIWishlistSuggestionsProps {
  wishlistItems: Array<{
    card_name: string;
    priority: string;
    note?: string;
  }>;
  onAddCard?: (card: any) => void;
}

export function AIWishlistSuggestions({ wishlistItems, onAddCard }: AIWishlistSuggestionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string>('');
  const [cards, setCards] = useState<CardData[]>([]);
  const [error, setError] = useState<string>('');

  const generateSuggestions = async () => {
    setLoading(true);
    setError('');
    
    try {
      const highPriority = wishlistItems.filter(i => i.priority === 'high');
      const mediumPriority = wishlistItems.filter(i => i.priority === 'medium');
      
      const prompt = `Based on this Magic: The Gathering wishlist, provide strategic purchasing recommendations:

**Current Wishlist (${wishlistItems.length} cards):**
${highPriority.length > 0 ? `\n**High Priority:**\n${highPriority.map(i => `- ${i.card_name}${i.note ? ` (${i.note})` : ''}`).join('\n')}` : ''}
${mediumPriority.length > 0 ? `\n**Medium Priority:**\n${mediumPriority.slice(0, 10).map(i => `- ${i.card_name}`).join('\n')}` : ''}

Provide:
1. Strategic purchasing order based on impact and synergy
2. Budget-friendly alternatives for expensive cards
3. Missing staples that should be added to wishlist
4. Cards that pair well with current wishlist items
5. 5-7 specific card recommendations with reasoning

End with: Referenced Cards: [list all cards mentioned]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setSuggestions(data.text);
        if (data.cards && data.cards.length > 0) {
          setCards(data.cards);
        }
      } else {
        throw new Error('No suggestions generated');
      }
    } catch (err) {
      console.error('AI suggestions error:', err);
      setError('Failed to generate suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-bold text-lg">AI Shopping Assistant</h3>
            <p className="text-sm text-muted-foreground">Smart recommendations for your wishlist</p>
          </div>
        </div>

        {!suggestions && !loading && (
          <Button 
            onClick={generateSuggestions}
            className="w-full bg-gradient-cosmic hover:opacity-90"
            disabled={loading || wishlistItems.length === 0}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {wishlistItems.length === 0 ? 'Add cards to get suggestions' : 'Generate Suggestions'}
          </Button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Analyzing wishlist...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {suggestions && (
          <div className="space-y-4">
            <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">AI</span>
                </div>
                <span className="text-xs font-bold text-spacecraft">WISHLIST RECOMMENDATIONS</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{suggestions}</ReactMarkdown>
              </div>
            </div>

            {cards.length > 0 && (
              <CardRecommendationDisplay 
                cards={cards} 
                onAddCard={onAddCard}
              />
            )}
            
            <Button 
              onClick={generateSuggestions}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Refresh Suggestions
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
