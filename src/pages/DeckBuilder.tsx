import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { 
  Search, 
  Plus, 
  Minus, 
  Settings, 
  Zap, 
  Activity,
  Globe,
  Rocket,
  Cpu,
  Sparkles
} from 'lucide-react';
import { SearchFilters } from '@/components/deck-builder/SearchFilters';
import { DeckList } from '@/components/deck-builder/DeckList';
import { AnalysisPanel } from '@/components/deck-builder/AnalysisPanel';
import { PowerSlider } from '@/components/deck-builder/PowerSlider';
import { useCardSearch } from '@/hooks/useCardSearch';
import { useDeckStore } from '@/stores/deckStore';

const DeckBuilder = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState({
    sets: ['EOE', 'EOC', 'EOS'],
    types: [],
    colors: [],
    mechanics: []
  });

  const { cards, loading, error } = useCardSearch(searchQuery, selectedFilters);
  const deck = useDeckStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Rocket className="h-6 w-6 text-primary animate-pulse" />
                <h1 className="text-2xl font-bold bg-cosmic bg-clip-text text-transparent">
                  Edge of Eternities
                </h1>
              </div>
              <Badge variant="secondary" className="bg-spacecraft/20 text-spacecraft border-spacecraft/30">
                {deck.format || 'Standard'}
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <PowerSlider />
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Search & Filters */}
          <div className="col-span-3">
            <div className="space-y-6">
              {/* Quick Search */}
              <Card className="cosmic-glow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <Search className="h-5 w-5 mr-2 text-primary" />
                    Card Search
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <Input
                      placeholder="Search cards..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10"
                    />
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Filters */}
              <SearchFilters 
                filters={selectedFilters}
                onFiltersChange={setSelectedFilters}
              />

              {/* EOE Mechanics Quick Filters */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">EOE Mechanics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Rocket className="h-4 w-4 mr-2 text-spacecraft" />
                    Spacecraft
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Cpu className="h-4 w-4 mr-2 text-station" />
                    Station
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Zap className="h-4 w-4 mr-2 text-warp" />
                    Warp
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Activity className="h-4 w-4 mr-2 text-void" />
                    Void
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <Globe className="h-4 w-4 mr-2 text-planet" />
                    Planet
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Card Search Results & Deck Builder */}
          <div className="col-span-6 space-y-6">
            {/* Search Results */}
            <Card className="cosmic-glow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center">
                  <Search className="h-5 w-5 mr-2 text-primary" />
                  Search Results
                  {loading && <div className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}
                {!loading && !error && cards.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Search for cards to start building your deck</p>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      className="group border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => deck.addCard({
                        id: card.id,
                        name: card.name,
                        cmc: card.cmc,
                        type_line: card.type_line,
                        colors: card.colors,
                        quantity: 1,
                        category: card.type_line.toLowerCase().includes('creature') ? 'creatures' : 
                                 card.type_line.toLowerCase().includes('land') ? 'lands' :
                                 card.type_line.toLowerCase().includes('instant') ? 'instants' :
                                 card.type_line.toLowerCase().includes('sorcery') ? 'sorceries' :
                                 card.type_line.toLowerCase().includes('enchantment') ? 'enchantments' :
                                 card.type_line.toLowerCase().includes('artifact') ? 'artifacts' :
                                 card.type_line.toLowerCase().includes('planeswalker') ? 'planeswalkers' : 'other',
                        mechanics: card.mechanics || []
                      })}
                    >
                      {card.image_uris?.small && (
                        <img 
                          src={card.image_uris.small} 
                          alt={card.name}
                          className="w-full rounded mb-2"
                        />
                      )}
                      <div className="text-sm font-medium">{card.name}</div>
                      <div className="text-xs text-muted-foreground">{card.type_line}</div>
                      <div className="text-xs text-muted-foreground">CMC: {card.cmc}</div>
                      {card.mechanics && card.mechanics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {card.mechanics.slice(0, 2).map((mechanic) => (
                            <Badge key={mechanic} variant="secondary" className="text-xs px-1 py-0">
                              {mechanic}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Deck List */}
            <Card className="cosmic-glow">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Sparkles className="h-5 w-5 mr-2 text-primary" />
                    Your Deck
                  </CardTitle>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <span>Cards: {deck.totalCards}</span>
                    <span>•</span>
                    <span>Power: {deck.powerLevel}/10</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DeckList />
              </CardContent>
            </Card>
          </div>

          {/* Analysis Panel */}
          <div className="col-span-3">
            <AnalysisPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeckBuilder;