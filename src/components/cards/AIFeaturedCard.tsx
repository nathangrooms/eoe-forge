import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, Star, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AIFeaturedCardProps {
  onRequestInsights?: () => void;
}

export function AIFeaturedCard({ onRequestInsights }: AIFeaturedCardProps) {
  const [loading, setLoading] = useState(false);
  const [featured, setFeatured] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateFeatured = async () => {
    setLoading(true);
    setError('');
    
    try {
      const prompt = `You are a Magic: The Gathering expert curator. Select and analyze one exceptional card that players should know about.

Consider cards that are:
- Format staples with broad applications
- Hidden gems with unique strategic value
- Recently printed cards changing the meta
- Classic cards with enduring relevance
- Underrated cards with high upside

Provide:
1. **Featured Card**: [Card Name]
2. **Why It Matters**: Strategic importance and meta relevance
3. **Best Uses**: Optimal decks and strategies
4. **Synergies**: Key cards it pairs well with
5. **Alternatives**: Similar options for different budgets

Keep it engaging and informative. End with: Referenced Cards: [card name and similar cards mentioned]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setFeatured(data.text);
      } else {
        throw new Error('No featured card generated');
      }
    } catch (err) {
      console.error('AI featured card error:', err);
      setError('Failed to generate featured card. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
            <Star className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-bold text-lg">AI Featured Card</h3>
            <p className="text-sm text-muted-foreground">Discover a hand-picked card worth knowing about</p>
          </div>
        </div>

        {!featured && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get AI-curated recommendations for format staples, hidden gems, and meta-relevant cards.
            </p>
            <Button 
              onClick={generateFeatured}
              className="w-full bg-gradient-cosmic hover:opacity-90"
              disabled={loading}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Discover Featured Card
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Curating the perfect card...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {featured && (
          <div className="space-y-4">
            <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">AI</span>
                </div>
                <span className="text-xs font-bold text-spacecraft">FEATURED CARD SPOTLIGHT</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{featured}</ReactMarkdown>
              </div>
            </div>
            
            <Button 
              onClick={generateFeatured}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Star className="h-4 w-4 mr-2" />
              Discover Another
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
