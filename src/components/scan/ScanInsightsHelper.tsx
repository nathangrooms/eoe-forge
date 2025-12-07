import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb, Sparkles, Search, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

interface ScanInsightsHelperProps {
  recentScans?: Array<{
    name: string;
    setCode: string;
    quantity: number;
    priceUsd?: number;
  }>;
}

export function ScanInsightsHelper({ recentScans = [] }: ScanInsightsHelperProps) {
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
      console.error('Scan helper error:', err);
      setError('Failed to generate suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-3 md:mb-4">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Lightbulb className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base md:text-lg">Scan Insights</h3>
            <p className="text-xs md:text-sm text-muted-foreground">Analyze your scanned cards</p>
          </div>
        </div>

        {!suggestions && !loading && (
          <div className="space-y-3">
            <p className="text-xs md:text-sm text-muted-foreground">
              Get insights on your recently scanned cards, synergies, and recommendations.
            </p>
            <Button 
              onClick={generateSuggestions}
              className="w-full"
              disabled={loading || recentScans.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {recentScans.length === 0 ? 'Scan some cards first' : 'Analyze Scans'}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6 md:py-8">
            <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground text-sm">Analyzing...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 md:p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-destructive flex-shrink-0" />
            <span className="text-xs md:text-sm text-destructive">{error}</span>
          </div>
        )}

        {suggestions && (
          <div className="space-y-3 md:space-y-4">
            <div className="border-l-4 border-primary/50 pl-3 md:pl-4 bg-primary/5 rounded-r-lg p-3 md:p-4">
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-primary">INSIGHTS</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
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
              Refresh
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
