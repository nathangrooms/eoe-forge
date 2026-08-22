import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Layers, Loader2, AlertCircle } from 'lucide-react';
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
    <Card>
      <CardContent className="p-6">
        {/*
          COPY AND TREATMENT, BOTH FIXED HERE.

          It read "AI Template Advisor / Personalized deck template
          recommendations", inside a `bg-gradient-cosmic` circle with a
          `shadow-cosmic-glow`. Three standing rules, all broken in one header:
          no AI vocabulary in user-facing copy (CLAUDE.md 10a bans "AI",
          "smart", "intelligent" outright, because Magic players dislike it),
          no jargon, and design law 6 forbids gradients and glows.

          A knowledgeable player is answering, so it says what it does.
        */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Which archetype suits your decks</h3>
          <p className="text-sm text-muted-foreground">
            Reads the decks you already have and suggests blueprints that fit them.
          </p>
        </div>

        {!recommendations && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Suggestions drawn from the decks on your account and the format you are
              looking at.
            </p>
            <Button onClick={generateRecommendations} className="w-full" disabled={loading}>
              <Sparkles className="h-4 w-4 mr-2" />
              Suggest archetypes
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
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {recommendations && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested archetypes
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{recommendations}</ReactMarkdown>
              </div>
            </div>
            
            {/* `secondary`, not `outline`. Outline is a border variant. */}
            <Button onClick={generateRecommendations} variant="secondary" size="sm" className="w-full">
              <Layers className="h-4 w-4 mr-2" />
              Suggest again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
