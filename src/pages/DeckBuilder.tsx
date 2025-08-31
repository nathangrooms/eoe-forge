import { useState } from 'react';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { UniversalCardSearch } from '@/components/universal/UniversalCardSearch';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { AnalysisPanel } from '@/components/deck-builder/AnalysisPanel';
import { AIBuilder } from '@/components/deck-builder/AIBuilder';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { showSuccess } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search,
  Plus,
  BarChart3,
  Sparkles,
  Activity,
  Download,
  Play,
  Settings,
  Rocket,
  Crown
} from 'lucide-react';

const DeckBuilder = () => {
  const deck = useDeckStore();

  const addCardToDeck = (card: any) => {
    deck.addCard({
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.colors || [],
      quantity: 1,
      category: card.type_line?.toLowerCase().includes('creature') ? 'creatures' : 
               card.type_line?.toLowerCase().includes('land') ? 'lands' :
               card.type_line?.toLowerCase().includes('instant') ? 'instants' :
               card.type_line?.toLowerCase().includes('sorcery') ? 'sorceries' : 'other',
      mechanics: card.keywords || []
    });
    showSuccess("Card Added", `Added ${card.name} to deck`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <Rocket className="h-7 w-7 text-primary animate-pulse" />
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  AI Deck Builder
                </h1>
              </div>
              <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                {deck.format || 'Standard'} • {deck.totalCards} cards
              </Badge>
              {deck.format === 'commander' && (
                <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                  <Crown className="h-3 w-3 mr-1" />
                  Commander
                </Badge>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <Badge variant="outline">
                Power: {deck.powerLevel.toFixed(1)}
              </Badge>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm">
                <Play className="h-4 w-4 mr-2" />
                Playtest
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="search" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search" className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <span>Card Database</span>
            </TabsTrigger>
            <TabsTrigger value="deck" className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4" />
              <span>Your Deck ({deck.totalCards})</span>
            </TabsTrigger>
            <TabsTrigger value="ai-builder" className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>AI Builder</span>
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analysis</span>
            </TabsTrigger>
          </TabsList>

          {/* Card Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <UniversalCardSearch
              onCardAdd={addCardToDeck}
              onCardSelect={(card) => console.log('Selected:', card)}
              placeholder="Search cards for your deck..."
              showFilters={true}
              showAddButton={true}
              showWishlistButton={false}
              showViewModes={true}
            />
          </TabsContent>

          {/* Deck Tab */}
          <TabsContent value="deck">
            <ModernDeckList />
          </TabsContent>

          {/* AI Builder Tab */}
          <TabsContent value="ai-builder">
            <AIBuilder />
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis">
            <EnhancedDeckAnalysisPanel deck={deck.cards} format={deck.format || 'standard'} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DeckBuilder;