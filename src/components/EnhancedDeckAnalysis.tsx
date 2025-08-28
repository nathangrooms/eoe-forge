import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useDeckStore } from '@/stores/deckStore';
import { PowerScorePanel as PowerScoringPanel } from '@/components/deck-builder/PowerScorePanel';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  Shield, 
  Search, 
  Trophy,
  Droplets,
  Repeat,
  Link
} from 'lucide-react';

interface LandSuggestion {
  adds: { name: string; qty: number }[];
  removes: { name: string; qty: number }[];
  delta: { t1: number; t2: number; t3: number };
}

export function LandOptimizer() {
  const { cards, format, addCard, removeCard } = useDeckStore();
  
  // Calculate current mana base statistics
  const calculateManaStats = () => {
    const lands = cards.filter(card => card.type_line?.includes('Land'));
    const colorRequirements = {
      W: 0, U: 0, B: 0, R: 0, G: 0
    };
    
    // Count color requirements from non-land spells
    cards.filter(card => !card.type_line?.includes('Land')).forEach(card => {
      if (card.mana_cost) {
        const cost = card.mana_cost;
        colorRequirements.W += (cost.match(/W/g) || []).length;
        colorRequirements.U += (cost.match(/U/g) || []).length;
        colorRequirements.B += (cost.match(/B/g) || []).length;
        colorRequirements.R += (cost.match(/R/g) || []).length;
        colorRequirements.G += (cost.match(/G/g) || []).length;
      }
    });

    const totalLands = lands.length;
    const basics = lands.filter(land => 
      ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(land.name)
    ).length;
    
    const nonBasics = totalLands - basics;
    
    // Mock hit percentages (would use hypergeometric distribution in real implementation)
    const hitPercentages = {
      t1: Math.min(90, (totalLands / cards.length) * 100 * 7), // Turn 1
      t2: Math.min(95, (totalLands / cards.length) * 100 * 14), // Turn 2
      t3: Math.min(99, (totalLands / cards.length) * 100 * 21), // Turn 3
    };

    return {
      totalLands,
      basics,
      nonBasics,
      colorRequirements,
      hitPercentages,
      landRatio: totalLands / cards.length
    };
  };

  const manaStats = calculateManaStats();

  // Generate land suggestions
  const generateSuggestions = (): LandSuggestion[] => {
    const suggestions: LandSuggestion[] = [];
    
    // Suggestion 1: Add dual lands if playing multiple colors
    const activeColors = Object.entries(manaStats.colorRequirements)
      .filter(([_, count]) => count > 0)
      .map(([color]) => color);
    
    if (activeColors.length >= 2 && manaStats.basics > 6) {
      suggestions.push({
        adds: [{ name: 'Command Tower', qty: 1 }],
        removes: [{ name: 'Plains', qty: 1 }],
        delta: { t1: 2, t2: 3, t3: 2 }
      });
    }

    // Suggestion 2: Add utility lands if color requirements are stable
    if (manaStats.landRatio > 0.35 && manaStats.nonBasics < 10) {
      suggestions.push({
        adds: [{ name: 'Reliquary Tower', qty: 1 }],
        removes: [{ name: 'Island', qty: 1 }],
        delta: { t1: 0, t2: 1, t3: 2 }
      });
    }

    // Suggestion 3: Optimize land count
    if (manaStats.landRatio < 0.33) {
      suggestions.push({
        adds: [{ name: 'Evolving Wilds', qty: 1 }],
        removes: [],
        delta: { t1: 5, t2: 8, t3: 10 }
      });
    }

    return suggestions;
  };

  const suggestions = generateSuggestions();

  const applySuggestion = (suggestion: LandSuggestion) => {
    // Apply the suggestion to the deck
    suggestion.removes.forEach(remove => {
      const cardToRemove = cards.find(card => card.name === remove.name);
      if (cardToRemove) {
        removeCard(cardToRemove.id);
      }
    });

    // Note: In a real implementation, you'd add the suggested cards
    // This would require having the card data available
    console.log('Applied suggestion:', suggestion);
  };

  return (
    <div className="space-y-6">
      {/* Current Mana Statistics */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Manabase Analysis</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total Lands:</span>
              <span>{manaStats.totalLands}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Land Ratio:</span>
              <span>{(manaStats.landRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Basic Lands:</span>
              <span>{manaStats.basics}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Non-basics:</span>
              <span>{manaStats.nonBasics}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Hit Percentages</h4>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Turn 1:</span>
                <span>{manaStats.hitPercentages.t1.toFixed(1)}%</span>
              </div>
              <Progress value={manaStats.hitPercentages.t1} className="h-1" />
              
              <div className="flex justify-between text-xs">
                <span>Turn 2:</span>
                <span>{manaStats.hitPercentages.t2.toFixed(1)}%</span>
              </div>
              <Progress value={manaStats.hitPercentages.t2} className="h-1" />
              
              <div className="flex justify-between text-xs">
                <span>Turn 3:</span>
                <span>{manaStats.hitPercentages.t3.toFixed(1)}%</span>
              </div>
              <Progress value={manaStats.hitPercentages.t3} className="h-1" />
            </div>
          </div>
        </div>

        {/* Color Requirements */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Color Requirements</h4>
          <div className="flex space-x-2">
            {Object.entries(manaStats.colorRequirements).map(([color, count]) => (
              count > 0 && (
                <Badge key={color} variant="outline" className="text-xs">
                  {color}: {count}
                </Badge>
              )
            ))}
          </div>
        </div>
      </Card>

      {/* Optimization Suggestions */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Optimization Suggestions</h3>
        
        {suggestions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Your manabase looks well optimized! No immediate suggestions.
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="border rounded-lg p-3">
                <div className="space-y-2">
                  {suggestion.adds.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-sm">
                        Add: {suggestion.adds.map(add => `${add.qty}x ${add.name}`).join(', ')}
                      </span>
                    </div>
                  )}
                  
                  {suggestion.removes.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-sm">
                        Remove: {suggestion.removes.map(remove => `${remove.qty}x ${remove.name}`).join(', ')}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span>Impact: T1 +{suggestion.delta.t1}%, T2 +{suggestion.delta.t2}%, T3 +{suggestion.delta.t3}%</span>
                  </div>
                  
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => applySuggestion(suggestion)}
                    className="w-full"
                  >
                    Apply Suggestion
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function EnhancedDeckAnalysis() {
  const { cards, format } = useDeckStore();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="power" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="power">Power Score</TabsTrigger>
          <TabsTrigger value="mana">Land Optimizer</TabsTrigger>
          <TabsTrigger value="synergy">Synergy Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="power" className="space-y-4">
          <PowerScoringPanel />
        </TabsContent>
        
        <TabsContent value="mana" className="space-y-4">
          <LandOptimizer />
        </TabsContent>
        
        <TabsContent value="synergy" className="space-y-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Synergy Analysis</h3>
            <p className="text-muted-foreground text-sm">
              Detailed synergy analysis coming soon. This will show tribal synergies, 
              combo pieces, and thematic coherence.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}