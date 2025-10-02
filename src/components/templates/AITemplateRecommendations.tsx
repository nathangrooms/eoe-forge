import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, Layers, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AITemplateRecommendationsProps {
  selectedFormat?: string;
  userDecks?: Array<{
    name: string;
    format: string;
    colors: string[];
  }>;
}

export function AITemplateRecommendations({ selectedFormat, userDecks = [] }: AITemplateRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateRecommendations = async () => {
    setLoading(true);
    setError('');
    
    try {
      const deckSummary = userDecks.map(d => 
        `${d.name} (${d.format}) - ${d.colors.join('')}`
      ).join('\n');

      const prompt = `Recommend deck templates for a Magic: The Gathering player:

${selectedFormat ? `**Preferred Format:** ${selectedFormat}` : '**Format:** Any'}

**Current Decks (${userDecks.length}):**
${deckSummary || 'No decks yet'}

Provide:
1. 5-7 specific deck template recommendations
2. Why each template fits their playstyle/collection
3. Power level range for each archetype
4. Key cards that define each template
5. Learning curve and complexity for each

Focus on variety and strategic diversity. End with: Referenced Cards: [list commanders and key cards mentioned]`;

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
      console.error('AI template recommendations error:', err);
      setError('Failed to generate recommendations. Please try again.');
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
            <h3 className="font-bold text-lg">AI Template Advisor</h3>
            <p className="text-sm text-muted-foreground">Personalized deck template recommendations</p>
          </div>
        </div>

        {!recommendations && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get AI-powered recommendations for deck templates based on your playstyle and format.
            </p>
            <Button 
              onClick={generateRecommendations}
              className="w-full bg-gradient-cosmic hover:opacity-90"
              disabled={loading}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Get Recommendations
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Finding best templates...</span>
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
                <span className="text-xs font-bold text-spacecraft">TEMPLATE RECOMMENDATIONS</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{recommendations}</ReactMarkdown>
              </div>
            </div>
            
            <Button 
              onClick={generateRecommendations}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Layers className="h-4 w-4 mr-2" />
              Refresh Recommendations
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
