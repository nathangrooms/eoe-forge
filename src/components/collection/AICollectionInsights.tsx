import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Sparkles, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AICollectionInsightsProps {
  stats: {
    totalCards: number;
    uniqueCards: number;
    totalValue: number;
    byColor: Record<string, number>;
    byRarity: Record<string, number>;
  };
  topCards?: Array<{ name: string; quantity: number; value?: number }>;
}

export function AICollectionInsights({ stats, topCards = [] }: AICollectionInsightsProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateInsights = async () => {
    setLoading(true);
    setError('');
    
    try {
      const prompt = `Analyze this Magic: The Gathering collection and provide strategic insights:

**Collection Statistics:**
- Total Cards: ${stats.totalCards}
- Unique Cards: ${stats.uniqueCards}
- Total Value: $${stats.totalValue.toFixed(2)}
- Color Distribution: ${Object.entries(stats.byColor).map(([c, n]) => `${c}: ${n}`).join(', ')}
- Rarity Breakdown: ${Object.entries(stats.byRarity).map(([r, n]) => `${r}: ${n}`).join(', ')}

${topCards.length > 0 ? `**Top Cards:**\n${topCards.slice(0, 10).map(c => `- ${c.name} (×${c.quantity})${c.value ? ` - $${c.value.toFixed(2)}` : ''}`).join('\n')}` : ''}

Provide a concise analysis covering:
1. Collection strengths and color identity
2. Deck building potential and archetypes supported
3. Notable cards and value pieces
4. Gaps or weaknesses to address
5. 3-5 specific card recommendations to enhance the collection

Keep it actionable and strategic. Format with clear sections.`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      // Check for response in multiple possible formats
      const responseText = data?.text || data?.response || data?.message;
      
      if (responseText && typeof responseText === 'string' && responseText.trim()) {
        setInsights(responseText);
      } else {
        throw new Error('No insights generated - empty response from AI');
      }
    } catch (err: any) {
      console.error('AI insights error:', err);
      setError(err?.message || 'Failed to generate insights. Please try again.');
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
            <h3 className="font-bold text-lg">AI Collection Insights</h3>
            <p className="text-sm text-muted-foreground">Get strategic analysis of your collection</p>
          </div>
        </div>

        {!insights && !loading && (
          <Button 
            onClick={generateInsights}
            className="w-full bg-gradient-cosmic hover:opacity-90"
            disabled={loading}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Insights
          </Button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Analyzing collection...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {insights && (
          <div className="space-y-4">
            <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">AI</span>
                </div>
                <span className="text-xs font-bold text-spacecraft">COLLECTION ANALYSIS</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{insights}</ReactMarkdown>
              </div>
            </div>
            
            <Button 
              onClick={generateInsights}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Refresh Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
