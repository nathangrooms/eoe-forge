import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, Target, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AICardInsightsProps {
  cardName: string;
  cardData?: {
    type_line?: string;
    mana_cost?: string;
    oracle_text?: string;
    colors?: string[];
    cmc?: number;
  };
}

export function AICardInsights({ cardName, cardData }: AICardInsightsProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateInsights = async () => {
    setLoading(true);
    setError('');
    
    try {
      const prompt = `Provide a strategic analysis of "${cardName}" for Magic: The Gathering:

${cardData ? `**Card Details:**
- Type: ${cardData.type_line}
- Mana Cost: ${cardData.mana_cost}
- Colors: ${cardData.colors?.join(', ')}
- CMC: ${cardData.cmc}
- Text: ${cardData.oracle_text}
` : ''}

Analyze:
1. Strategic value and power level assessment
2. Best Commander archetypes and decks for this card
3. Synergy opportunities and combo potential
4. Meta relevance and competitive viability
5. Budget alternatives or similar cards

Keep it concise and actionable. End with: Referenced Cards: [list cards mentioned]`;

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
      console.error('AI card insights error:', err);
      setError('Failed to generate insights. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-cosmic flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <h4 className="font-semibold text-sm">AI Strategic Analysis</h4>
        </div>

        {!insights && !loading && (
          <Button 
            onClick={generateInsights}
            size="sm"
            className="w-full bg-gradient-cosmic hover:opacity-90"
          >
            <Sparkles className="h-3 w-3 mr-2" />
            Analyze Card
          </Button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {insights && (
          <div className="space-y-3">
            <div className="border-l-2 border-spacecraft/50 pl-3 bg-spacecraft/5 rounded-r p-3">
              <div className="prose prose-xs max-w-none dark:prose-invert">
                <ReactMarkdown>{insights}</ReactMarkdown>
              </div>
            </div>
            
            <Button 
              onClick={generateInsights}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Target className="h-3 w-3 mr-2" />
              Refresh
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
