import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, TrendingUp, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface CardReplacement {
  original: {
    id: string;
    name: string;
    price: number;
    power_score: number;
  };
  suggestion: {
    id: string;
    name: string;
    price: number;
    power_score: number;
    image_uri: string;
  };
  reason: string;
  improvement: number; // Power level improvement
  cost_change: number; // Price difference
}

interface AICardReplacementsProps {
  deckId: string;
  currentPower: number;
  targetPower?: number;
  onReplace?: (originalCardId: string, newCardId: string) => void;
}

export function AICardReplacements({ 
  deckId, 
  currentPower, 
  targetPower,
  onReplace 
}: AICardReplacementsProps) {
  const [suggestions, setSuggestions] = useState<CardReplacement[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const analyzeDeckForReplacements = async () => {
    try {
      setAnalyzing(true);
      
      // Call AI service to analyze deck
      const { data, error } = await supabase.functions.invoke('ai-card-replacements', {
        body: {
          deck_id: deckId,
          current_power: currentPower,
          target_power: targetPower || currentPower + 1,
          budget_constraint: 'moderate', // Could be configurable
          max_suggestions: 5
        }
      });

      if (error) throw error;

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        showSuccess('Analysis Complete', `Found ${data.suggestions.length} card replacement suggestions`);
      }

    } catch (err) {
      console.error('Failed to analyze deck:', err);
      showError('Analysis Failed', 'Could not generate card suggestions');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReplace = async (original: string, suggestion: string, suggestionName: string) => {
    try {
      setLoading(true);
      
      if (onReplace) {
        onReplace(original, suggestion);
      }

      showSuccess('Card Replaced', `Swapped to ${suggestionName}`);
      
      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => s.original.id !== original));

    } catch (err) {
      console.error('Replace failed:', err);
      showError('Replace Failed', 'Could not replace card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-spacecraft" />
          AI Card Replacements
        </CardTitle>
        <CardDescription>
          Get intelligent suggestions to optimize your deck
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Click below to analyze your deck and get AI-powered card replacement suggestions
            </p>
            <Button 
              onClick={analyzeDeckForReplacements}
              disabled={analyzing}
              className="bg-gradient-cosmic"
            >
              {analyzing ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze Deck
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, idx) => (
              <Card key={idx} className="border-spacecraft/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Original Card */}
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">{suggestion.original.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>${suggestion.original.price.toFixed(2)}</span>
                        <span>•</span>
                        <span>Power: {suggestion.original.power_score}</span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="h-5 w-5 text-spacecraft shrink-0 mt-1" />

                    {/* Suggested Card */}
                    <div className="flex-1">
                      <div className="flex items-start gap-2">
                        <img 
                          src={suggestion.suggestion.image_uri}
                          alt={suggestion.suggestion.name}
                          className="w-12 h-16 rounded object-cover"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-1">{suggestion.suggestion.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <span>${suggestion.suggestion.price.toFixed(2)}</span>
                            <span>•</span>
                            <span>Power: {suggestion.suggestion.power_score}</span>
                          </div>
                          <div className="flex gap-1">
                            {suggestion.improvement > 0 && (
                              <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                +{suggestion.improvement.toFixed(1)} power
                              </Badge>
                            )}
                            {suggestion.cost_change !== 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <DollarSign className="h-3 w-3 mr-1" />
                                {suggestion.cost_change > 0 ? '+' : ''}{suggestion.cost_change.toFixed(2)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <Button
                      size="sm"
                      onClick={() => handleReplace(
                        suggestion.original.id,
                        suggestion.suggestion.id,
                        suggestion.suggestion.name
                      )}
                      disabled={loading}
                      className="shrink-0"
                    >
                      Replace
                    </Button>
                  </div>

                  {/* Reason */}
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                    {suggestion.reason}
                  </p>
                </CardContent>
              </Card>
            ))}

            <Button 
              variant="outline" 
              onClick={analyzeDeckForReplacements}
              disabled={analyzing}
              className="w-full"
            >
              {analyzing ? 'Analyzing...' : 'Get More Suggestions'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
