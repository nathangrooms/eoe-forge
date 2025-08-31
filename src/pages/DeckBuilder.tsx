import { useState } from 'react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { AnalysisPanel } from '@/components/deck-builder/AnalysisPanel';
import { AIBuilder } from '@/components/deck-builder/AIBuilder';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { EnhancedDeckCanvas } from '@/components/deck-builder/EnhancedDeckCanvas';
import { LandEnhancer } from '@/components/deck-builder/LandEnhancer';
import { showSuccess } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search,
  Sparkles,
  Activity,
  BarChart3,
  Download,
  Play,
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
    <StandardPageLayout
      title="AI Deck Builder"
      description="Build and optimize your Magic: The Gathering decks with advanced AI assistance"
      action={
        <div className="flex items-center space-x-4">
          <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
            {deck.format || 'Standard'} • {deck.totalCards} cards
          </Badge>
          {deck.format === 'commander' && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
              <Crown className="h-3 w-3 mr-1" />
              Commander
            </Badge>
          )}
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
      }
    >
        <Tabs defaultValue="deck" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="deck" className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4" />
              <span>Deck ({deck.totalCards})</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <span>Card Search</span>
            </TabsTrigger>
            <TabsTrigger value="ai-builder" className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>AI Builder</span>
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="lands" className="flex items-center space-x-2">
              <Crown className="h-4 w-4" />
              <span>Lands</span>
            </TabsTrigger>
          </TabsList>

          {/* Deck Canvas Tab */}
          <TabsContent value="deck">
            <EnhancedDeckCanvas format={deck.format || 'standard'} />
          </TabsContent>

          {/* Card Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <EnhancedUniversalCardSearch
              onCardAdd={addCardToDeck}
              onCardSelect={(card) => console.log('Selected:', card)}
              placeholder="Search cards for your deck..."
              showFilters={true}
              showAddButton={true}
              showWishlistButton={false}
              showViewModes={true}
            />
          </TabsContent>

          {/* AI Builder Tab */}
          <TabsContent value="ai-builder">
            <AIBuilder />
          </TabsContent>

          
          {/* Analysis Tab */}
          <TabsContent value="analysis">
            <EnhancedDeckAnalysisPanel deck={deck.cards} format={deck.format || 'standard'} />
          </TabsContent>

          {/* Land Enhancer Tab */}
          <TabsContent value="lands">
            <LandEnhancer 
              deck={deck.cards}
              format={deck.format || 'standard'}
              onAddLand={(landName) => {
                // Create a basic land card object
                const landCard = {
                  id: Math.random().toString(),
                  name: landName,
                  type_line: 'Land',
                  cmc: 0,
                  colors: [],
                  quantity: 1,
                  category: 'lands',
                  mechanics: []
                };
                deck.addCard(landCard);
                showSuccess("Land Added", `Added ${landName} to deck`);
              }}
            />
          </TabsContent>
        </Tabs>
    </StandardPageLayout>
  );
};

export default DeckBuilder;