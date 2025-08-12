
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Sparkles, 
  Crown, 
  Target, 
  Zap, 
  Brain, 
  Filter,
  RefreshCw,
  Download,
  Eye,
  TrendingUp,
  Users,
  Scroll,
  Shield,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCardSearch } from '@/hooks/useCardSearch';
import { useDeckStore } from '@/stores/deckStore';
import { useMTGSets } from '@/hooks/useMTGSets';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';

interface AIBuilderProps {
  collection?: any[];
  onDeckBuilt?: (deck: any) => void;
}

const FORMATS = [
  { value: 'standard', label: 'Standard (60 cards)' },
  { value: 'commander', label: 'Commander (100 cards)' },
  { value: 'modern', label: 'Modern (60 cards)' },
  { value: 'legacy', label: 'Legacy (60 cards)' }
];

const THEMES = [
  'Tribal', 'Tokens', 'Aristocrats', 'Spellslinger', 'Voltron', 
  'Stax', 'Combo', 'Aggro', 'Control', 'Midrange', 'Ramp',
  'Artifacts', 'Enchantments', 'Graveyard', 'Lands'
];

const BUDGET_OPTIONS = [
  { value: 'budget', label: 'Budget ($0-50)' },
  { value: 'medium', label: 'Medium ($50-200)' },
  { value: 'high', label: 'High ($200+)' }
];

export const AIBuilder = ({ collection = [], onDeckBuilt }: AIBuilderProps) => {
  const [buildMode, setBuildMode] = useState<'collection' | 'set'>('set');
  const [commander, setCommander] = useState<any>(null);
  const [format, setFormat] = useState('standard');
  const [powerLevel, setPowerLevel] = useState([6]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [budget, setBudget] = useState('medium');
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [builtDeck, setBuiltDeck] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [showCommanderPicker, setShowCommanderPicker] = useState(false);
  const [deckSaved, setDeckSaved] = useState(false);
  
  // Set-based building options
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  
  const { toast } = useToast();
  const deckStore = useDeckStore();
  const { sets, loading: setsLoading } = useMTGSets();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Set default set to a recent one
  useEffect(() => {
    if (sets.length > 0 && !selectedSet) {
      setSelectedSet(sets[0].code); // Set to the most recent set
    }
  }, [sets, selectedSet]);
  
  // Search for potential commanders
  const { cards: commanderCards, loading: searchingCommanders } = useCardSearch(
    commanderSearch && format === 'commander' ? `${commanderSearch} type:legendary type:creature` : '',
    buildMode === 'set' && selectedSet ? { sets: [selectedSet] } : { sets: [] }
  );

  const handleThemeToggle = (theme: string) => {
    setSelectedThemes(prev => 
      prev.includes(theme) 
        ? prev.filter(t => t !== theme)
        : [...prev, theme]
    );
  };

  const handleColorToggle = (color: string) => {
    setSelectedColors(prev => 
      prev.includes(color) 
        ? prev.filter(c => c !== color)
        : [...prev, color]
    );
  };

  const buildDeck = async () => {
    if (format === 'commander' && !commander) {
      toast({
        title: "Commander Required",
        description: "Please select a commander for your deck",
        variant: "destructive"
      });
      return;
    }

    if (buildMode === 'set' && !selectedSet) {
      toast({
        title: "Set Required",
        description: "Please select a set for deck building",
        variant: "destructive"
      });
      return;
    }

    setIsBuilding(true);
    setBuildProgress(10);
    setDeckSaved(false);

    try {
      let deckCollection = [];
      
      if (buildMode === 'collection') {
        // Use collection mode - only cards from user's collection
        deckCollection = collection.length > 0 ? collection : [];
        if (deckCollection.length === 0) {
          setBuildProgress(20);
          const { data: userCollection } = await supabase
            .from('user_collections')
            .select('*');
          deckCollection = userCollection || [];
        }
      } else {
        // Use set mode - get cards from selected set via Scryfall
        setBuildProgress(20);
        
        try {
          let allCards = [];
          let page = 1;
          let hasMore = true;
          
          // Fetch all cards from the set (Scryfall paginates results)
          while (hasMore && allCards.length < 500) { // Limit to prevent infinite loops
            const colorQuery = selectedColors.length > 0 ? 
              ` (${selectedColors.map(c => `color:${c}`).join(' OR ')})` : '';
            const searchQuery = `set:${selectedSet}${colorQuery}`;
            
            console.log(`Fetching page ${page} for set ${selectedSet}...`);
            
            const response = await fetch(
              `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchQuery)}&unique=cards&order=cmc&dir=asc&page=${page}`
            );
            
            if (!response.ok) {
              if (response.status === 404) {
                console.log('No more cards found or no cards match criteria');
                break;
              }
              throw new Error(`Scryfall API error: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.data && data.data.length > 0) {
              allCards.push(...data.data);
              hasMore = data.has_more;
              page++;
            } else {
              hasMore = false;
            }
          }
          
          deckCollection = allCards;
          console.log(`Fetched ${deckCollection.length} total cards from set ${selectedSet}`);
          
          if (deckCollection.length === 0) {
            throw new Error(`No cards found for set ${selectedSet}. Please try a different set or check the set code.`);
          }
          
        } catch (error) {
          console.error('Failed to fetch cards from Scryfall:', error);
          throw new Error(`Failed to fetch cards from set ${selectedSet}: ${error.message}`);
        }
      }

      setBuildProgress(40);

      console.log('Calling AI deck builder with:', {
        commander,
        collectionSize: deckCollection.length,
        format,
        powerLevel: powerLevel[0],
        themes: selectedThemes,
        budget,
        buildMode,
        selectedSet,
        selectedColors
      });

      // Call AI deck builder function
      const { data, error } = await supabase.functions.invoke('ai-deck-builder', {
        body: {
          commander,
          collection: deckCollection,
          format,
          powerLevel: powerLevel[0],
          themes: selectedThemes,
          budget,
          buildMode,
          selectedSet: buildMode === 'set' ? selectedSet : undefined,
          selectedColors: buildMode === 'set' ? selectedColors : undefined
        }
      });

      setBuildProgress(80);

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }

      if (data?.success) {
        setBuiltDeck(data);
        setBuildProgress(100);
        
        toast({
          title: "Deck Built Successfully!",
          description: `Created a ${data.metadata.powerLevel}/10 power level deck with ${data.deck.length} cards`,
        });

        // Save deck to database
        await saveDeckToDatabase(data, commander, format, powerLevel[0], selectedThemes);

      } else {
        console.error('AI deck builder failed:', data);
        throw new Error(data?.error || 'Failed to build deck');
      }

    } catch (error) {
      console.error('Deck building error:', error);
      toast({
        title: "Deck Building Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsBuilding(false);
      setBuildProgress(0);
    }
  };

  const saveDeckToDatabase = async (deckData: any, commander: any, format: string, powerLevel: number, themes: string[]) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to save your deck",
        variant: "destructive"
      });
      return;
    }

    try {
      const deckName = `AI Built - ${commander?.name || format} Deck`;
      const commanderColors = commander?.color_identity || commander?.colors || [];
      
      // Create deck record
      const { data: deck, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: deckName,
          format: format,
          colors: commanderColors,
          description: `AI-generated ${format} deck${commander ? ` with ${commander.name} as commander` : ''}. Themes: ${themes.join(', ')}. Built from ${buildMode === 'set' ? `set ${selectedSet}` : 'collection'}.`,
          power_level: powerLevel,
          is_public: false
        })
        .select()
        .single();

      if (deckError) {
        console.error('Error creating deck:', deckError);
        throw deckError;
      }

      console.log('Created deck:', deck);

      // Add commander if present
      if (commander && deck && format === 'commander') {
        const { error: commanderError } = await supabase
          .from('deck_cards')
          .insert({
            deck_id: deck.id,
            card_id: commander.id,
            card_name: commander.name,
            quantity: 1,
            is_commander: true,
            is_sideboard: false
          });
        
        if (commanderError) {
          console.error('Error adding commander:', commanderError);
        }
      }

      // Add deck cards in batches
      if (deck && deckData.deck.length > 0) {
        const cardInserts = deckData.deck.map((card: any) => ({
          deck_id: deck.id,
          card_id: card.id,
          card_name: card.name,
          quantity: 1,
          is_commander: false,
          is_sideboard: false
        }));

        const { error: cardsError } = await supabase
          .from('deck_cards')
          .insert(cardInserts);

        if (cardsError) {
          console.error('Error adding cards:', cardsError);
          throw cardsError;
        }
      }

      setDeckSaved(true);
      
      toast({
        title: "Deck Saved!",
        description: `"${deckName}" has been saved to your deck collection`,
      });

    } catch (error) {
      console.error('Error saving deck:', error);
      toast({
        title: "Save Failed",
        description: "Deck was built but couldn't be saved. Please try again.",
        variant: "destructive"
      });
    }
  };

  const viewSavedDecks = () => {
    navigate('/decks');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="cosmic-glow">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="h-6 w-6 text-primary" />
            <span className="bg-cosmic bg-clip-text text-transparent">AI Deck Builder</span>
            <Badge variant="secondary" className="ml-2">Beta</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={buildMode} onValueChange={(value) => setBuildMode(value as 'collection' | 'set')}>
            <TabsList className="w-full">
              <TabsTrigger value="collection" className="flex-1">
                <Users className="h-4 w-4 mr-2" />
                From Collection
              </TabsTrigger>
              <TabsTrigger value="set" className="flex-1">
                <Scroll className="h-4 w-4 mr-2" />
                From Set
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Format Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Target className="h-5 w-5 mr-2" />
                Deck Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATS.map(fmt => (
                        <SelectItem key={fmt.value} value={fmt.value}>
                          {fmt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Budget Range</Label>
                  <Select value={budget} onValueChange={setBudget}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Set Selection for Set Mode */}
              {buildMode === 'set' && (
                <div>
                  <Label>MTG Set</Label>
                  <Select value={selectedSet} onValueChange={setSelectedSet}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a set..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sets.slice(0, 50).map(set => (
                        <SelectItem key={set.code} value={set.code}>
                          {set.name} ({set.code.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Color Selection for Set Mode */}
              {buildMode === 'set' && (
                <div>
                  <Label>Colors (optional)</Label>
                  <div className="flex space-x-2 mt-2">
                    {['W', 'U', 'B', 'R', 'G'].map((color) => (
                      <Button
                        key={color}
                        variant={selectedColors.includes(color) ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleColorToggle(color)}
                        className="w-10 h-10 p-0"
                      >
                        {color}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty for all colors
                  </p>
                </div>
              )}

              {/* Power Level */}
              <div>
                <Label>Power Level: {powerLevel[0]}/10</Label>
                <div className="mt-2">
                  <Slider
                    value={powerLevel}
                    onValueChange={setPowerLevel}
                    max={10}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  1-3: Casual | 4-6: Focused | 7-8: High Power | 9-10: cEDH
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Commander Selection */}
          {format === 'commander' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Crown className="h-5 w-5 mr-2" />
                  Commander Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commander ? (
                  <div className="flex items-center space-x-4 p-4 bg-muted rounded-lg">
                    <div className="w-16 h-20">
                      {commander.image_uris?.normal ? (
                        <img 
                          src={commander.image_uris.normal} 
                          alt={commander.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded flex items-center justify-center">
                          <Crown className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{commander.name}</h3>
                      <p className="text-sm text-muted-foreground">{commander.type_line}</p>
                      {commander.colors && (
                        <div className="flex space-x-1 mt-2">
                          {commander.colors.map((color: string) => (
                            <Badge key={color} variant="outline" className="text-xs">
                              {color}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => setCommander(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Search for commanders..."
                        value={commanderSearch}
                        onChange={(e) => setCommanderSearch(e.target.value)}
                        className="flex-1"
                      />
                      <Dialog open={showCommanderPicker} onOpenChange={setShowCommanderPicker}>
                        <DialogTrigger asChild>
                          <Button variant="outline">
                            <Filter className="h-4 w-4 mr-2" />
                            Browse
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>Choose Commander</DialogTitle>
                          </DialogHeader>
                          <div className="grid grid-cols-3 gap-4">
                            {commanderCards.slice(0, 30).map((card) => (
                              <Card 
                                key={card.id} 
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => {
                                  setCommander(card);
                                  setShowCommanderPicker(false);
                                }}
                              >
                                <CardContent className="p-3">
                                  <div className="aspect-[5/7] mb-2">
                                    {card.image_uris?.normal ? (
                                      <img 
                                        src={card.image_uris.normal} 
                                        alt={card.name}
                                        className="w-full h-full object-cover rounded"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded flex items-center justify-center">
                                        <Crown className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="font-medium text-sm leading-tight">{card.name}</h4>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Theme Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Sparkles className="h-5 w-5 mr-2" />
                Deck Themes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((theme) => (
                  <div key={theme} className="flex items-center space-x-2">
                    <Checkbox
                      id={theme}
                      checked={selectedThemes.includes(theme)}
                      onCheckedChange={() => handleThemeToggle(theme)}
                    />
                    <Label htmlFor={theme} className="text-sm cursor-pointer">
                      {theme}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Build Button */}
          <Card>
            <CardContent className="p-6">
              <Button 
                onClick={buildDeck} 
                disabled={isBuilding || (format === 'commander' && !commander) || (buildMode === 'set' && !selectedSet)}
                className="w-full h-12 text-lg"
                size="lg"
              >
                {isBuilding ? (
                  <>
                    <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                    Building Deck...
                  </>
                ) : (
                  <>
                    <Brain className="h-5 w-5 mr-2" />
                    Build Deck with AI
                  </>
                )}
              </Button>
              
              {isBuilding && (
                <div className="mt-4">
                  <Progress value={buildProgress} className="w-full" />
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    {buildProgress < 20 ? 'Analyzing requirements...' :
                     buildProgress < 40 ? 'Loading collection...' :
                     buildProgress < 80 ? 'Building deck with AI...' :
                     'Finalizing deck...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {builtDeck ? (
            <>
              {/* Deck Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Deck Analysis
                    {deckSaved && <CheckCircle className="h-5 w-5 ml-2 text-green-500" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Power Level</span>
                    <Badge variant="default">{builtDeck.metadata.powerLevel}/10</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Total Cards</span>
                    <Badge variant="outline">{builtDeck.metadata.totalCards}</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Avg CMC</span>
                    <Badge variant="outline">{builtDeck.metadata.avgCMC}</Badge>
                  </div>

                  <div>
                    <Label className="text-sm">Color Identity</Label>
                    <div className="flex space-x-1 mt-1">
                      {builtDeck.metadata.colorIdentity.map((color: string) => (
                        <Badge key={color} variant="secondary" className="text-xs">
                          {color}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {deckSaved && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-800">Deck saved successfully!</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Deck Actions */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  {deckSaved && (
                    <Button onClick={viewSavedDecks} className="w-full">
                      <Eye className="h-4 w-4 mr-2" />
                      View in Deck Collection
                    </Button>
                  )}
                  
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Export Deck List
                  </Button>
                </CardContent>
              </Card>

              {/* Strategy Summary */}
              {builtDeck.strategy && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Strategy</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {builtDeck.strategy.primaryStrategy}
                  </CardContent>
                </Card>
              )}

              {/* Suggestions */}
              {builtDeck.analysis?.suggestions?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {builtDeck.analysis.suggestions.map((suggestion: string, index: number) => (
                      <p key={index} className="text-xs text-muted-foreground">
                        • {suggestion}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium mb-2">Ready to Build</h3>
                <p className="text-sm text-muted-foreground">
                  Configure your deck preferences and let AI create the perfect deck for you.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
