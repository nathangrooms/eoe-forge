import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Plus, 
  Settings, 
  Zap, 
  Activity,
  Globe,
  Rocket,
  Cpu,
  Sparkles,
  BarChart3,
  Filter,
  Grid3X3,
  List,
  Home
} from 'lucide-react';
import { SearchFilters } from '@/components/deck-builder/SearchFilters';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { AnalysisPanel } from '@/components/deck-builder/AnalysisPanel';
import { PowerSlider } from '@/components/deck-builder/PowerSlider';
import { CardPreview } from '@/components/deck-builder/CardPreview';
import { useCardSearch } from '@/hooks/useCardSearch';
import { useDeckStore } from '@/stores/deckStore';
import { Link } from 'react-router-dom';

const DeckBuilder = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState({
    sets: ['EOE', 'EOC', 'EOS'],
    types: [],
    colors: [],
    mechanics: []
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  const { cards, loading, error } = useCardSearch(searchQuery, selectedFilters);
  const deck = useDeckStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                <Home className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Home</span>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center space-x-3">
                <Rocket className="h-7 w-7 text-primary animate-pulse" />
                <h1 className="text-2xl font-bold bg-cosmic bg-clip-text text-transparent">
                  EOE Deck Builder
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

      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="search" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search" className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <span>Card Database</span>
            </TabsTrigger>
            <TabsTrigger value="deck" className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4" />
              <span>Your Deck ({deck.totalCards})</span>
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analysis</span>
            </TabsTrigger>
          </TabsList>

          {/* Card Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Search Controls */}
              <div className="col-span-12">
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Main Search */}
                      <div className="flex space-x-4">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search for cards by name, type, or ability..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 text-lg h-12"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setShowFilters(!showFilters)}
                          className="h-12"
                        >
                          <Filter className="h-4 w-4 mr-2" />
                          Filters
                        </Button>
                        <div className="flex border rounded-lg">
                          <Button
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('grid')}
                          >
                            <Grid3X3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                          >
                            <List className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* EOE Quick Filters */}
                      <div className="flex space-x-2">
                        <span className="text-sm font-medium text-muted-foreground flex items-center">
                          Quick filters:
                        </span>
                        {[
                          { name: 'Spacecraft', icon: Rocket, color: 'text-spacecraft' },
                          { name: 'Station', icon: Cpu, color: 'text-station' },
                          { name: 'Warp', icon: Zap, color: 'text-warp' },
                          { name: 'Void', icon: Activity, color: 'text-void' },
                          { name: 'Planet', icon: Globe, color: 'text-planet' }
                        ].map(({ name, icon: Icon, color }) => (
                          <Button
                            key={name}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const isSelected = selectedFilters.mechanics.includes(name);
                              setSelectedFilters(prev => ({
                                ...prev,
                                mechanics: isSelected 
                                  ? prev.mechanics.filter(m => m !== name)
                                  : [...prev.mechanics, name]
                              }));
                            }}
                            className={selectedFilters.mechanics.includes(name) ? 'bg-primary text-primary-foreground' : ''}
                          >
                            <Icon className={`h-4 w-4 mr-1 ${color}`} />
                            {name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Filters Sidebar */}
              {showFilters && (
                <div className="col-span-3">
                  <SearchFilters 
                    filters={selectedFilters}
                    onFiltersChange={setSelectedFilters}
                  />
                </div>
              )}

              {/* Search Results */}
              <div className={showFilters ? "col-span-9" : "col-span-12"}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        Search Results
                        {loading && <div className="ml-3 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
                      </CardTitle>
                      <span className="text-sm text-muted-foreground">
                        {cards.length} cards found
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {error && (
                      <div className="text-destructive text-sm mb-4 p-3 bg-destructive/10 rounded-lg">
                        {error}
                      </div>
                    )}
                    
                    {!loading && !error && cards.length === 0 && searchQuery && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <h3 className="text-lg font-medium mb-2">No cards found</h3>
                        <p>Try adjusting your search terms or filters</p>
                      </div>
                    )}

                    {!searchQuery && cards.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <h3 className="text-lg font-medium mb-2">Ready to build?</h3>
                        <p>Search for cards to start building your Edge of Eternities deck</p>
                      </div>
                    )}

                    {cards.length > 0 && (
                      <div className={viewMode === 'grid' 
                        ? "grid grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
                        : "space-y-2"
                      }>
                        {cards.map((card) => (
                          <CardPreview 
                            key={card.id} 
                            card={card} 
                            variant={viewMode}
                            showAddButton
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Deck Tab */}
          <TabsContent value="deck">
            <ModernDeckList />
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis">
            <AnalysisPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DeckBuilder;