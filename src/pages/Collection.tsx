import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Search, 
  Filter,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Star,
  Grid3X3,
  List,
  BarChart3,
  Wand2,
  Download,
  Upload,
  Home,
  Eye
} from 'lucide-react';
import { useCollectionStore } from '@/stores/collectionStore';
import { useDeckStore } from '@/stores/deckStore';
import { SynergyEngine, DeckRequirements } from '@/lib/synergyEngine';
import { useCardSearch } from '@/hooks/useCardSearch';
import { Link } from 'react-router-dom';

export default function Collection() {
  const collection = useCollectionStore();
  const deckStore = useDeckStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddCard, setShowAddCard] = useState(false);
  const [showDeckBuilder, setShowDeckBuilder] = useState(false);
  
  // Auto deck builder state
  const [deckRequirements, setDeckRequirements] = useState<DeckRequirements>({
    colors: [],
    format: 'standard',
    powerLevel: 6,
    archetype: '',
    themes: []
  });
  
  const [generatingDeck, setGeneratingDeck] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { cards: searchResults, loading } = useCardSearch(searchQuery, {
    sets: ['EOE', 'EOC', 'EOS'],
    types: [],
    colors: [],
    mechanics: []
  });

  // Get active tab from URL params  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'collection';

  const setActiveTab = (tab: string) => {
    if (tab === 'collection') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  // Filter collection based on search and filters
  const filteredCards = collection.cards.filter(card => {
    if (collection.searchQuery && !card.name.toLowerCase().includes(collection.searchQuery.toLowerCase())) {
      return false;
    }
    if (collection.selectedSets.length > 0 && !collection.selectedSets.includes(card.setCode)) {
      return false;
    }
    if (collection.selectedColors.length > 0 && !card.colors.some(color => collection.selectedColors.includes(color))) {
      return false;
    }
    if (collection.selectedRarities.length > 0 && !collection.selectedRarities.includes(card.rarity)) {
      return false;
    }
    return true;
  });

  // Generate deck automatically
  const generateDeck = async () => {
    setGeneratingDeck(true);
    try {
      const engine = new SynergyEngine(collection.cards);
      const generatedDeck = await engine.generateDeck(deckRequirements);
      
      // Clear current deck and add generated cards
      deckStore.clearDeck();
      generatedDeck.mainboard.forEach(card => {
        deckStore.addCard({
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
        });
      });
      
      deckStore.setPowerLevel(generatedDeck.powerLevel);
      setShowDeckBuilder(false);
      
      // Show success message or navigate to deck builder
      alert(`Generated deck with synergy score: ${generatedDeck.synergyScore.toFixed(2)}`);
      
    } catch (error) {
      console.error('Error generating deck:', error);
      alert('Error generating deck. Please try again.');
    } finally {
      setGeneratingDeck(false);
    }
  };

  const addCardToCollection = (card: any) => {
    collection.addCard({
      id: card.id,
      name: card.name,
      setCode: card.set.toUpperCase(),
      collectorNumber: card.collector_number,
      quantity: 1,
      foil: 0,
      condition: 'near_mint',
      language: 'en',
      tags: [],
      cmc: card.cmc,
      type_line: card.type_line,
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      oracle_text: card.oracle_text,
      power: card.power,
      toughness: card.toughness,
      keywords: card.keywords || [],
      mechanics: card.mechanics || [],
      rarity: card.rarity,
      priceUsd: parseFloat(card.prices?.usd || '0'),
      priceFoilUsd: parseFloat(card.prices?.usd_foil || '0'),
      synergyScore: 0.5,
      synergyTags: [],
      archetype: []
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-cosmic bg-clip-text text-transparent">
            Collection Manager
          </h1>
          <p className="text-muted-foreground">
            Manage your Magic: The Gathering collection with AI-powered insights
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total Value</div>
            <div className="text-lg font-bold text-green-600">
              ${collection.totalValue.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total Cards</div>
            <div className="text-lg font-bold">{collection.totalCards.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="collection">Collection</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="add-cards">Add Cards</TabsTrigger>
        </TabsList>

        {/* Collection Tab */}
        <TabsContent value="collection" className="space-y-6">
          {/* Search and Filters */}
          <Card>
            <CardContent className="p-6">
              <div className="flex space-x-4 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search your collection..."
                    value={collection.searchQuery}
                    onChange={(e) => collection.setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select onValueChange={(value) => collection.setSelectedSets(value === "all" ? [] : [value])}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sets</SelectItem>
                    <SelectItem value="EOE">Edge of Eternities</SelectItem>
                    <SelectItem value="EOC">EOE Commander</SelectItem>
                    <SelectItem value="EOS">Stellar Sights</SelectItem>
                  </SelectContent>
                </Select>

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
            </CardContent>
          </Card>

          {/* Collection Grid/List */}
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-4"
            : "space-y-2"
          }>
            {filteredCards.map((card) => (
              <Card key={card.id} className="group hover:shadow-lg transition-all duration-200">
                <CardContent className="p-3">
                  {viewMode === 'grid' ? (
                    <div>
                      <div className="aspect-[5/7] bg-muted rounded mb-2 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">IMG</span>
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate">{card.name}</div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">{card.quantity}x</span>
                          <span className="text-xs font-medium">
                            ${((card.priceUsd || 0) * card.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-16 bg-muted rounded flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{card.name}</div>
                        <div className="text-sm text-muted-foreground">{card.type_line}</div>
                        <div className="flex space-x-2 mt-1">
                          {card.mechanics.slice(0, 2).map(mechanic => (
                            <Badge key={mechanic} variant="secondary" className="text-xs">
                              {mechanic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-center">
                          <div className="text-sm text-muted-foreground">Qty</div>
                          <div className="flex items-center space-x-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0"
                              onClick={() => collection.updateCardQuantity(card.id, Math.max(0, card.quantity - 1), card.foil)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{card.quantity}</span>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0"
                              onClick={() => collection.updateCardQuantity(card.id, card.quantity + 1, card.foil)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Value</div>
                          <div className="font-medium">
                            ${((card.priceUsd || 0) * card.quantity).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredCards.length === 0 && (
            <Card className="p-12 text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-medium mb-2">No Cards Found</h3>
              <p className="text-muted-foreground mb-4">
                {collection.cards.length === 0 
                  ? "Start building your collection by adding cards!"
                  : "Try adjusting your search or filters."
                }
              </p>
              <Button onClick={() => setActiveTab('add-cards')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Cards
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Collection Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${collection.totalValue.toLocaleString()}
                </div>
                <div className="flex items-center text-sm text-muted-foreground mt-1">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  +12% this month
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Cards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{collection.totalCards}</div>
                <div className="text-sm text-muted-foreground">
                  {collection.cards.length} unique cards
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Archetype</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">Spacecraft Control</div>
                <div className="text-sm text-muted-foreground">
                  {collection.getCardsByArchetype('Spacecraft').length} cards
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Completion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">73%</div>
                <Progress value={73} className="mt-2" />
                <div className="text-sm text-muted-foreground mt-1">
                  EOE Set Complete
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Value Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Highest Value Cards</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {collection.getTopValueCards(5).map((card, index) => (
                  <div key={card.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="text-lg font-bold text-muted-foreground">#{index + 1}</div>
                      <div>
                        <div className="font-medium">{card.name}</div>
                        <div className="text-sm text-muted-foreground">{card.setCode} • {card.quantity}x</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">
                        ${((card.priceUsd || 0) * card.quantity).toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ${(card.priceUsd || 0).toFixed(2)} each
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Deck Builder Tab */}
        <TabsContent value="ai-builder" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wand2 className="h-5 w-5 mr-2" />
                AI Deck Builder
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Format</label>
                    <Select value={deckRequirements.format} onValueChange={(value: any) => 
                      setDeckRequirements(prev => ({ ...prev, format: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="commander">Commander</SelectItem>
                        <SelectItem value="modern">Modern</SelectItem>
                        <SelectItem value="legacy">Legacy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Colors</label>
                    <div className="flex space-x-2 mt-2">
                      {['W', 'U', 'B', 'R', 'G'].map(color => (
                        <Button
                          key={color}
                          variant={deckRequirements.colors.includes(color) ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => {
                            const newColors = deckRequirements.colors.includes(color)
                              ? deckRequirements.colors.filter(c => c !== color)
                              : [...deckRequirements.colors, color];
                            setDeckRequirements(prev => ({ ...prev, colors: newColors }));
                          }}
                        >
                          {color}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Archetype</label>
                    <Select value={deckRequirements.archetype || "any"} onValueChange={(value) => 
                      setDeckRequirements(prev => ({ ...prev, archetype: value === "any" ? "" : value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select archetype" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="Aggro">Aggro</SelectItem>
                        <SelectItem value="Control">Control</SelectItem>
                        <SelectItem value="Midrange">Midrange</SelectItem>
                        <SelectItem value="Combo">Combo</SelectItem>
                        <SelectItem value="Spacecraft">Spacecraft</SelectItem>
                        <SelectItem value="Station">Station</SelectItem>
                        <SelectItem value="Warp">Warp</SelectItem>
                        <SelectItem value="Void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Power Level: {deckRequirements.powerLevel}</label>
                    <div className="mt-2">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={deckRequirements.powerLevel}
                        onChange={(e) => setDeckRequirements(prev => ({ 
                          ...prev, 
                          powerLevel: parseInt(e.target.value) 
                        }))}
                        className="w-full"
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Casual</span>
                      <span>Competitive</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Themes</label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['Warp', 'Void', 'Station', 'Spacecraft', 'Planet'].map(theme => (
                        <Button
                          key={theme}
                          variant={deckRequirements.themes?.includes(theme) ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => {
                            const newThemes = deckRequirements.themes?.includes(theme)
                              ? deckRequirements.themes.filter(t => t !== theme)
                              : [...(deckRequirements.themes || []), theme];
                            setDeckRequirements(prev => ({ ...prev, themes: newThemes }));
                          }}
                        >
                          {theme}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex justify-center">
                <Button 
                  size="lg" 
                  onClick={generateDeck}
                  disabled={generatingDeck || collection.cards.length === 0}
                  className="px-8"
                >
                  {generatingDeck ? (
                    <div className="flex items-center">
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                      Generating Deck...
                    </div>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generate Deck from Collection
                    </>
                  )}
                </Button>
              </div>

              {collection.cards.length === 0 && (
                <div className="text-center text-muted-foreground">
                  <p>Add cards to your collection first to generate decks!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Add Cards Tab */}
        <TabsContent value="add-cards" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Cards to Collection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for cards to add..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {loading && (
                  <div className="text-center py-8">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                    <p>Searching...</p>
                  </div>
                )}

                <div className="grid grid-cols-4 xl:grid-cols-6 gap-4">
                  {searchResults.map((card) => (
                    <Card key={card.id} className="group hover:shadow-lg transition-all duration-200">
                      <CardContent className="p-3">
                        <div className="aspect-[5/7] bg-muted rounded mb-2 flex items-center justify-center">
                          {card.image_uris?.small ? (
                            <img 
                              src={card.image_uris.small} 
                              alt={card.name}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">No Image</span>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="font-medium text-sm truncate">{card.name}</div>
                          <div className="text-xs text-muted-foreground">{card.type_line}</div>
                          {card.prices?.usd && (
                            <div className="text-xs font-medium">${card.prices.usd}</div>
                          )}
                          <Button 
                            size="sm" 
                            className="w-full"
                            onClick={() => addCardToCollection(card)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}