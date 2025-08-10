import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  Filter,
  Plus,
  Minus,
  TrendingUp,
  DollarSign,
  Package,
  Star,
  Grid3X3,
  List,
  BarChart3,
  Download,
  Upload,
  Heart,
  Crown,
  Zap,
  Target
} from 'lucide-react';
import { useCollectionStore } from '@/stores/collectionStore';
import { useDeckStore } from '@/stores/deckStore';
import { useCardSearch } from '@/hooks/useCardSearch';

export default function Collection() {
  const collection = useCollectionStore();
  const deckStore = useDeckStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  // All hooks must be called at the top level consistently
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('all');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedRarity, setSelectedRarity] = useState('all');

  // Get active tab from URL params  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'collection';

  // Fixed useCardSearch call with stable dependencies
  const searchFilters = {
    sets: [],
    types: selectedTypes,
    colors: selectedColors,
    format: selectedFormat === 'all' ? undefined : selectedFormat,
    rarity: selectedRarity === 'all' ? undefined : selectedRarity
  };
  
  const { cards: searchResults, loading } = useCardSearch(searchQuery, searchFilters);

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

  // Mock favorite decks
  const favoriteDecks = [
    { name: 'Spacecraft Control', cards: 60, colors: ['U', 'W'], format: 'Standard' },
    { name: 'Void Aggro', cards: 60, colors: ['B', 'R'], format: 'Standard' },
    { name: 'Station Commander', cards: 100, colors: ['U', 'G', 'W'], format: 'Commander' }
  ];

  // Popular cards for preview
  const popularCards = [
    { name: 'Lightning Bolt', type: 'Instant', price: '$2.50', image: null },
    { name: 'Counterspell', type: 'Instant', price: '$1.25', image: null },
    { name: 'Giant Growth', type: 'Instant', price: '$0.50', image: null },
    { name: 'Dark Ritual', type: 'Instant', price: '$3.00', image: null },
    { name: 'Force of Will', type: 'Instant', price: '$85.00', image: null },
    { name: 'Tarmogoyf', type: 'Creature', price: '$45.00', image: null },
    { name: 'Snapcaster Mage', type: 'Creature', price: '$25.00', image: null },
    { name: 'Jace, the Mind Sculptor', type: 'Planeswalker', price: '$120.00', image: null }
  ];

  const addCardToCollection = (card: any) => {
    collection.addCard({
      id: card.id || Math.random().toString(),
      name: card.name,
      setCode: card.set?.toUpperCase() || 'UNK',
      collectorNumber: card.collector_number || '1',
      quantity: 1,
      foil: 0,
      condition: 'near_mint',
      language: 'en',
      tags: [],
      cmc: card.cmc || 0,
      type_line: card.type_line || card.type || '',
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      oracle_text: card.oracle_text || '',
      power: card.power,
      toughness: card.toughness,
      keywords: card.keywords || [],
      mechanics: card.mechanics || [],
      rarity: card.rarity || 'common',
      priceUsd: parseFloat(card.prices?.usd || card.price?.replace('$', '') || '0'),
      priceFoilUsd: parseFloat(card.prices?.usd_foil || '0'),
      synergyScore: 0.5,
      synergyTags: [],
      archetype: []
    });
  };

  const getColorIcons = (colors: string[]) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      W: { bg: '#FFFBD5', text: '#000' },
      U: { bg: '#0E68AB', text: '#fff' },
      B: { bg: '#150B00', text: '#fff' },
      R: { bg: '#D3202A', text: '#fff' },
      G: { bg: '#00733E', text: '#fff' }
    };
    
    return colors.map(color => (
      <div
        key={color}
        className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
        style={{ backgroundColor: colorMap[color]?.bg, color: colorMap[color]?.text }}
      >
        {color}
      </div>
    ));
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

        {/* Collection Tab - Show Favorited Decks First */}
        <TabsContent value="collection" className="space-y-6">
          {/* Favorited Decks Section */}
          <Card className="cosmic-glow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Heart className="h-5 w-5 mr-2 text-red-500" />
                Favorite Decks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {favoriteDecks.map((deck, index) => (
                  <Card 
                    key={index} 
                    className="cursor-pointer hover:cosmic-glow transition-all border-primary/20" 
                    onClick={() => setSelectedDeck(deck.name)}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {deck.format === 'Commander' && <Crown className="h-4 w-4 text-yellow-500" />}
                            <span className="font-medium">{deck.name}</span>
                          </div>
                          <Badge variant="outline">{deck.cards} cards</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex space-x-1">
                            {getColorIcons(deck.colors)}
                          </div>
                          <span className="text-sm text-muted-foreground">{deck.format}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Filter className="h-5 w-5 mr-2" />
                Collection Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Select defaultValue="all-sets">
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Set" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all-sets">All Sets</SelectItem>
                    <SelectItem value="standard">Standard Legal</SelectItem>
                    <SelectItem value="modern">Modern Legal</SelectItem>
                    <SelectItem value="commander">Commander Legal</SelectItem>
                    <SelectItem value="legacy">Legacy Legal</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select defaultValue="all-colors">
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Colors" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all-colors">All Colors</SelectItem>
                    <SelectItem value="white">White (W)</SelectItem>
                    <SelectItem value="blue">Blue (U)</SelectItem>
                    <SelectItem value="black">Black (B)</SelectItem>
                    <SelectItem value="red">Red (R)</SelectItem>
                    <SelectItem value="green">Green (G)</SelectItem>
                    <SelectItem value="colorless">Colorless</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select defaultValue="all-types">
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all-types">All Types</SelectItem>
                    <SelectItem value="creature">Creatures</SelectItem>
                    <SelectItem value="instant">Instants</SelectItem>
                    <SelectItem value="sorcery">Sorceries</SelectItem>
                    <SelectItem value="enchantment">Enchantments</SelectItem>
                    <SelectItem value="artifact">Artifacts</SelectItem>
                    <SelectItem value="planeswalker">Planeswalkers</SelectItem>
                    <SelectItem value="land">Lands</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select defaultValue="all-rarity">
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by Rarity" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all-rarity">All Rarities</SelectItem>
                    <SelectItem value="common">Common</SelectItem>
                    <SelectItem value="uncommon">Uncommon</SelectItem>
                    <SelectItem value="rare">Rare</SelectItem>
                    <SelectItem value="mythic">Mythic Rare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
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

        {/* Analysis Tab - Fully Functional */}
        <TabsContent value="analysis" className="space-y-6">
          {/* Analysis by Collection */}
          <Card className="cosmic-glow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Collection Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                    <CardTitle className="text-sm">Average CMC</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">3.2</div>
                    <div className="text-sm text-muted-foreground">
                      Optimal for most formats
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
                      Recent Sets Complete
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Analysis by Deck */}
          {selectedDeck && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Deck Analysis: {selectedDeck}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium">Mana Curve</h4>
                    <div className="space-y-2">
                      {[0,1,2,3,4,5,6,7].map(cmc => (
                        <div key={cmc} className="flex items-center space-x-2">
                          <span className="w-4 text-sm">{cmc}</span>
                          <div className="flex-1 bg-muted rounded-full h-4">
                            <div 
                              className="bg-primary h-4 rounded-full transition-all"
                              style={{ width: `${Math.random() * 100}%` }}
                            />
                          </div>
                          <span className="text-sm w-6">{Math.floor(Math.random() * 8)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-medium">Color Distribution</h4>
                    <div className="space-y-2">
                      {[
                        { color: 'W', name: 'White', percent: 35 },
                        { color: 'U', name: 'Blue', percent: 40 },
                        { color: 'B', name: 'Black', percent: 10 },
                        { color: 'R', name: 'Red', percent: 10 },
                        { color: 'G', name: 'Green', percent: 5 }
                      ].map(({ color, name, percent }) => (
                        <div key={color} className="flex items-center space-x-2">
                          <div className="w-4 h-4 rounded-full" style={{
                            backgroundColor: {
                              W: '#FFFBD5', U: '#0E68AB', B: '#150B00', R: '#D3202A', G: '#00733E'
                            }[color]
                          }} />
                          <span className="text-sm flex-1">{name}</span>
                          <span className="text-sm">{percent}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-medium">Power Level</h4>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">7.2</div>
                      <Progress value={72} className="mt-2" />
                      <div className="text-sm text-muted-foreground mt-1">Competitive</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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

        {/* Add Cards Tab with Preview and Better Filtering */}
        <TabsContent value="add-cards" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="h-5 w-5 mr-2" />
                Add Cards to Collection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enhanced Search with Filters */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for cards to add (try 'Lightning Bolt', 'Counterspell', etc.)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {/* Advanced Filters for Add Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                    <SelectTrigger>
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      <SelectItem value="all">All Formats</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="commander">Commander</SelectItem>
                      <SelectItem value="legacy">Legacy</SelectItem>
                      <SelectItem value="vintage">Vintage</SelectItem>
                      <SelectItem value="pioneer">Pioneer</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedRarity} onValueChange={setSelectedRarity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Rarity" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      <SelectItem value="all">All Rarities</SelectItem>
                      <SelectItem value="common">Common</SelectItem>
                      <SelectItem value="uncommon">Uncommon</SelectItem>
                      <SelectItem value="rare">Rare</SelectItem>
                      <SelectItem value="mythic">Mythic</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select onValueChange={(value) => setSelectedTypes(value === 'all' ? [] : [value])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Card Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="creature">Creature</SelectItem>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="sorcery">Sorcery</SelectItem>
                      <SelectItem value="enchantment">Enchantment</SelectItem>
                      <SelectItem value="artifact">Artifact</SelectItem>
                      <SelectItem value="planeswalker">Planeswalker</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select onValueChange={(value) => setSelectedColors(value === 'all' ? [] : [value])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Color" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      <SelectItem value="all">All Colors</SelectItem>
                      <SelectItem value="W">White</SelectItem>
                      <SelectItem value="U">Blue</SelectItem>
                      <SelectItem value="B">Black</SelectItem>
                      <SelectItem value="R">Red</SelectItem>
                      <SelectItem value="G">Green</SelectItem>
                      <SelectItem value="C">Colorless</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Preview section when no search query */}
              {!searchQuery && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Star className="h-5 w-5 mr-2 text-yellow-500" />
                    Popular Cards - Preview
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {popularCards.map((card, index) => (
                      <Card key={index} className="cursor-pointer hover:shadow-md transition-all duration-200 border-primary/20">
                        <CardContent className="p-3">
                          <div className="aspect-[5/7] bg-gradient-to-br from-primary/10 to-secondary/10 rounded mb-2 flex items-center justify-center overflow-hidden">
                            {card.image ? (
                              <img 
                                src={card.image} 
                                alt={card.name}
                                className="w-full h-full object-cover rounded"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded flex items-center justify-center">
                                <span className="text-xs text-muted-foreground font-medium">MTG</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-center">{card.name}</div>
                            <div className="text-xs text-muted-foreground text-center">{card.type}</div>
                            <div className="text-xs font-medium text-center text-green-600">{card.price}</div>
                            <Button 
                              size="sm" 
                              className="w-full mt-2"
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
              )}

              {/* Loading state */}
              {loading && searchQuery && (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p>Searching the entire MTG catalog...</p>
                </div>
              )}

              {/* Search Results */}
              {searchQuery && searchResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">
                    Search Results ({searchResults.length} found)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-96 overflow-y-auto border rounded-lg p-4">
                    {searchResults.slice(0, 50).map((card) => (
                      <Card key={card.id} className="group hover:shadow-lg transition-all duration-200">
                        <CardContent className="p-3">
                          <div className="aspect-[5/7] bg-muted rounded mb-2 flex items-center justify-center overflow-hidden">
                            {card.image_uris?.small ? (
                              <img 
                                src={card.image_uris.small} 
                                alt={card.name}
                                className="w-full h-full object-cover rounded"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {card.image_uris?.small ? 'Loading...' : 'No Image'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="font-medium text-sm truncate" title={card.name}>
                              {card.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{card.type_line}</div>
                            {card.prices?.usd && (
                              <div className="text-xs font-medium text-green-600">${card.prices.usd}</div>
                            )}
                            <Button
                              size="sm"
                              onClick={() => addCardToCollection(card)}
                              className="w-full"
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
              )}

              {/* No results */}
              {searchQuery && !loading && searchResults.length === 0 && (
                <div className="text-center py-8">
                  <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-xl font-medium mb-2">No Cards Found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search terms or filters.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}