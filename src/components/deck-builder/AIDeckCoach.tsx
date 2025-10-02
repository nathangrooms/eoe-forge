import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, Target, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AIDeckCoachProps {
  deckCards?: Array<{
    name: string;
    type_line?: string;
    mana_cost?: string;
  }>;
  deckName?: string;
  format?: string;
  commander?: {
    name: string;
  };
  powerLevel?: number;
}

export function AIDeckCoach({ deckCards = [], deckName, format, commander, powerLevel }: AIDeckCoachProps) {
  const [loading, setLoading] = useState(false);
  const [coaching, setCoaching] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateCoaching = async () => {
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

      const prompt = `Provide strategic coaching for this ${format} deck:

**Deck:** ${deckName || 'Untitled Deck'}
${commander ? `**Commander:** ${commander.name}` : ''}
**Format:** ${format}
**Power Level:** ${powerLevel || 'Unknown'}
**Total Cards:** ${deckCards.length}
**Type Distribution:** ${typeBreakdown}

**Current Decklist (${deckCards.length} cards):**
${cardList}

Analyze and provide:
1. Overall deck strategy and win conditions
2. Key strengths and potential weaknesses
3. Mana curve and consistency improvements
4. 3-5 specific card recommendations with explanations
5. Power level assessment and ways to adjust it

Keep it actionable and specific. End with: Referenced Cards: [list all cards mentioned]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setCoaching(data.text);
      } else {
        throw new Error('No coaching generated');
      }
    } catch (err) {
      console.error('AI coaching error:', err);
      setError('Failed to generate coaching. Please try again.');
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
            <h3 className="font-bold text-lg">AI Deck Coach</h3>
            <p className="text-sm text-muted-foreground">Strategic analysis and improvement suggestions</p>
          </div>
        </div>

        {!coaching && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get personalized coaching on your deck's strategy, weaknesses, and how to improve it.
            </p>
            <Button 
              onClick={generateCoaching}
              className="w-full bg-gradient-cosmic hover:opacity-90"
              disabled={loading || deckCards.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {deckCards.length === 0 ? 'Add cards to deck first' : 'Get Coaching'}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Analyzing your deck...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {coaching && (
          <div className="space-y-4">
            <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">AI</span>
                </div>
                <span className="text-xs font-bold text-spacecraft">DECK COACHING</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{coaching}</ReactMarkdown>
              </div>
            </div>
            
            <Button 
              onClick={generateCoaching}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Target className="h-4 w-4 mr-2" />
              Refresh Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
