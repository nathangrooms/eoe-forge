import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Sparkles, Layers, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { AIErrorBoundary } from '@/components/ai/AIErrorBoundary';

interface AIDeckRecommendationsProps {
  userDecks: Array<{
    id: string;
    name: string;
    format: string;
    colors: string[];
    power_level?: number;
  }>;
  collectionStats?: {
    totalCards: number;
    byColor: Record<string, number>;
  };
}

export function AIDeckRecommendations({ userDecks, collectionStats }: AIDeckRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateRecommendations = async () => {
    setLoading(true);
    setError('');
    
    try {
      const deckSummary = userDecks.map(d => 
        `${d.name} (${d.format}) - ${d.colors.join('')} - Power ${d.power_level || 'Unknown'}`
      ).join('\n');

      const colorDistribution = collectionStats?.byColor 
        ? Object.entries(collectionStats.byColor)
            .sort((a, b) => b[1] - a[1])
            .map(([c, n]) => `${c}: ${n}`)
            .join(', ')
        : 'Unknown';

      const prompt = `Analyze this player's MTG profile and provide strategic deck recommendations:

**Current Decks (${userDecks.length}):**
${deckSummary}

**Collection Stats:**
- Total Cards: ${collectionStats?.totalCards || 'Unknown'}
- Color Distribution: ${colorDistribution}

Provide:
1. Analysis of current deck portfolio (gaps, overlaps, power spread)
2. 3-5 new deck archetypes they should build based on their collection
3. Ways to diversify their playstyle and color identity
4. Commanders that synergize well with their existing collection
5. Strategic improvements for existing decks

Keep it actionable and specific. End with: Referenced Cards: [commanders and key cards mentioned]`;

      const { data, error: fnError } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: prompt,
          conversationHistory: [],
          responseStyle: 'detailed'
        }
      });

      if (fnError) throw fnError;
      
      if (data?.text) {
        setRecommendations(data.text);
      } else {
        throw new Error('No recommendations generated');
      }
    } catch (err) {
      console.error('AI recommendations error:', err);
      setError('Failed to generate recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AIErrorBoundary featureName="AI Deck Recommendations">
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-lg">AI Deck Strategist</h3>
              <p className="text-sm text-muted-foreground">Personalized deck building recommendations</p>
            </div>
          </div>

          {!recommendations && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Get AI-powered insights on what decks to build next based on your collection and playstyle.
              </p>
              <Button 
                onClick={generateRecommendations}
                className="w-full bg-gradient-cosmic hover:opacity-90"
                disabled={loading || userDecks.length === 0}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {userDecks.length === 0 ? 'Build a deck first' : 'Get Recommendations'}
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Analyzing your profile...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {recommendations && (
            <div className="space-y-4">
              <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">AI</span>
                  </div>
                  <span className="text-xs font-bold text-spacecraft">STRATEGIC RECOMMENDATIONS</span>
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{recommendations}</ReactMarkdown>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={generateRecommendations}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button 
                  asChild
                  variant="default"
                  size="sm"
                  className="flex-1 bg-gradient-cosmic"
                >
                  <Link to="/ai-builder">
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Builder
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AIErrorBoundary>
  );
}
