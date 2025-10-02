import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, Search, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface AIScanHelperProps {
  recentScans?: Array<{
    name: string;
    setCode: string;
    quantity: number;
    priceUsd?: number;
  }>;
}

export function AIScanHelper({ recentScans = [] }: AIScanHelperProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string>('');
  const [error, setError] = useState<string>('');

  const generateSuggestions = async () => {
    setLoading(true);
    setError('');
    
    try {
      const scanSummary = recentScans.slice(0, 20).map(s => 
        `${s.name} (${s.setCode.toUpperCase()}) x${s.quantity}${s.priceUsd ? ` - $${s.priceUsd}` : ''}`
      ).join('\n');

      const totalCards = recentScans.reduce((sum, s) => sum + s.quantity, 0);
      const totalValue = recentScans.reduce((sum, s) => sum + ((s.priceUsd || 0) * s.quantity), 0);

      const prompt = `Analyze these recently scanned Magic: The Gathering cards and provide insights:

**Recent Scans (${recentScans.length} unique cards, ${totalCards} total):**
${scanSummary || 'No recent scans'}

**Total Scanned Value:** $${totalValue.toFixed(2)}

Provide:
1. Notable cards in the scanned batch (rarity, value, playability)
2. Potential deck archetypes these cards support
3. Cards that synergize well together
4. Recommendations for what to scan/acquire next
5. Value highlights and hidden gems

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
        setSuggestions(data.text);
      } else {
        throw new Error('No suggestions generated');
      }
    } catch (err) {
      console.error('AI scan helper error:', err);
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
            <h3 className="font-bold text-lg">AI Scan Insights</h3>
            <p className="text-sm text-muted-foreground">Analyze your scanned cards and get recommendations</p>
          </div>
        </div>

        {!suggestions && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get AI-powered insights on your recently scanned cards, synergies, and what to look for next.
            </p>
            <Button 
              onClick={generateSuggestions}
              className="w-full bg-gradient-cosmic hover:opacity-90"
              disabled={loading || recentScans.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {recentScans.length === 0 ? 'Scan some cards first' : 'Analyze Scans'}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Analyzing scanned cards...</span>
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
                <span className="text-xs font-bold text-spacecraft">SCAN INSIGHTS</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{suggestions}</ReactMarkdown>
              </div>
            </div>
            
            <Button 
              onClick={generateSuggestions}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Search className="h-4 w-4 mr-2" />
              Refresh Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
