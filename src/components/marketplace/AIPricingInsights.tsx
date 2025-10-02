import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, DollarSign, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AIPricingInsightsProps {
  listings: Array<{
    cards?: {
      name: string;
      set_code?: string;
      rarity?: string;
    };
    price_usd: number;
    qty: number;
    condition?: string | null;
    foil?: boolean | null;
  }>;
}

export function AIPricingInsights({ listings }: AIPricingInsightsProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateInsights = async () => {
    setLoading(true);
    setError('');
    
    try {
      const listingSummary = listings.map(l => 
        `${l.cards?.name || 'Unknown'} (${l.cards?.set_code || 'N/A'}) - $${l.price_usd} x${l.qty} ${l.foil ? 'FOIL' : ''} ${l.condition || 'NM'}`
      ).join('\n');

      const totalValue = listings.reduce((sum, l) => sum + (l.price_usd * l.qty), 0);
      const avgPrice = listings.length > 0 ? totalValue / listings.length : 0;

      const prompt = `Analyze this MTG marketplace listing portfolio and provide pricing insights:

**Current Listings (${listings.length}):**
${listingSummary}

**Portfolio Stats:**
- Total Listed Value: $${totalValue.toFixed(2)}
- Average Price per Listing: $${avgPrice.toFixed(2)}

Provide:
1. Market trends for listed cards
2. Pricing optimization recommendations
3. Which cards are likely to sell fastest
4. Cards that may be under/overpriced
5. Strategic selling advice

Keep it actionable and market-focused. End with: Referenced Cards: [list all cards mentioned]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'concise'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setInsights(data.text);
      } else {
        throw new Error('No insights generated');
      }
    } catch (err) {
      console.error('AI pricing insights error:', err);
      setError('Failed to generate insights. Please try again.');
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
            <h3 className="font-bold text-lg">AI Pricing Strategist</h3>
            <p className="text-sm text-muted-foreground">Market analysis and pricing optimization</p>
          </div>
        </div>

        {!insights && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get AI-powered insights on market trends and pricing strategy for your listings.
            </p>
            <Button 
              onClick={generateInsights}
              className="w-full bg-gradient-cosmic hover:opacity-90"
              disabled={loading || listings.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {listings.length === 0 ? 'Add listings first' : 'Analyze Pricing'}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Analyzing market data...</span>
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
                <span className="text-xs font-bold text-spacecraft">PRICING INSIGHTS</span>
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
              <DollarSign className="h-4 w-4 mr-2" />
              Refresh Insights
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
