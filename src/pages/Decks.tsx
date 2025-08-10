import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Download, 
  Upload, 
  Wand2, 
  BarChart3, 
  Crown, 
  Users, 
  Sparkles,
  Eye,
  Play,
  Settings
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useCollectionStore } from '@/stores/collectionStore';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { EnhancedAnalysisPanel } from '@/components/deck-builder/EnhancedAnalysisPanel';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import { ArchetypeLibrary } from '@/components/deck-builder/ArchetypeLibrary';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { buildDeck, getTemplatesForFormat, getFormatRules } from '@/lib/deckbuilder';

interface Deck {
  id: string;
  name: string;
  format: 'standard' | 'commander' | 'custom';
  powerLevel: number;
  colors: string[];
  cardCount: number;
  lastModified: Date;
  description?: string;
}

export default function Decks() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<'standard' | 'commander' | 'custom'>('standard');
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [buildingDeck, setBuildingDeck] = useState(false);
  
  // AI Deck Builder state
  const [aiFormat, setAiFormat] = useState('standard');
  const [aiArchetype, setAiArchetype] = useState('');
  const [aiPowerLevel, setAiPowerLevel] = useState(6);
  const [aiColors, setAiColors] = useState<string[]>([]);
  
  // Available templates for selected format
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  
  // Mock decks data - in a real app this would come from a store or API
  const [decks, setDecks] = useState<Deck[]>([
    {
      id: '1',
      name: 'Spacecraft Control',
      format: 'standard',
      powerLevel: 7,
      colors: ['U', 'W'],
      cardCount: 60,
      lastModified: new Date('2024-01-15'),
      description: 'Control deck focused on spacecraft synergies'
    },
    {
      id: '2', 
      name: 'Void Aggro',
      format: 'standard',
      powerLevel: 6,
      colors: ['B', 'R'],
      cardCount: 60,
      lastModified: new Date('2024-01-14'),
      description: 'Fast aggressive deck with void mechanics'
    },
    {
      id: '3',
      name: 'Station Commander',
      format: 'commander',
      powerLevel: 8,
      colors: ['U', 'G', 'W'],
      cardCount: 100,
      lastModified: new Date('2024-01-13'),
      description: 'Commander deck built around station mechanics'
    }
  ]);

  const deck = useDeckStore();
  const collection = useCollectionStore();
  
  // Load available templates when format changes
  useEffect(() => {
    const templates = getTemplatesForFormat(aiFormat);
    setAvailableTemplates(templates);
    if (templates.length > 0 && !aiArchetype) {
      setAiArchetype(templates[0].id);
    }
  }, [aiFormat]);

  // Get active tab from URL params  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'my-decks';

  const setActiveTab = (tab: string) => {
    if (tab === 'my-decks') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  // Filter decks based on search
  const filteredDecks = decks.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.format.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.colors.some(color => color.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const createDeck = () => {
    if (!newDeckName.trim()) return;
    
    const newDeck: Deck = {
      id: Date.now().toString(),
      name: newDeckName,
      format: newDeckFormat,
      powerLevel: 5,
      colors: [],
      cardCount: 0,
      lastModified: new Date(),
      description: ''
    };
    
    setDecks(prev => [newDeck, ...prev]);
    setNewDeckName('');
    setShowCreateDialog(false);
  };

  const deleteDeck = (deckId: string) => {
    setDecks(prev => prev.filter(d => d.id !== deckId));
  };

  const duplicateDeck = (originalDeck: Deck) => {
    const duplicatedDeck: Deck = {
      ...originalDeck,
      id: Date.now().toString(),
      name: `${originalDeck.name} (Copy)`,
      lastModified: new Date()
    };
    setDecks(prev => [duplicatedDeck, ...prev]);
  };

  const loadDeck = (deckData: Deck) => {
    // Load deck into the deck store for editing
    deck.setDeckName(deckData.name);
    deck.setFormat(deckData.format);
    deck.setPowerLevel(deckData.powerLevel);
    setSelectedDeck(deckData.id);
    setActiveTab('deck-editor');
  };

  const generateAIDeck = async () => {
    if (!aiArchetype) {
      toast({
        title: "Error",
        description: "Please select an archetype",
        variant: "destructive"
      });
      return;
    }

    setBuildingDeck(true);
    
    try {
      // Convert collection cards to deck builder format
      const cardPool = collection.cards.map(collectionCard => ({
        id: collectionCard.id,
        oracle_id: collectionCard.id,
        name: collectionCard.name,
        mana_cost: '',
        cmc: collectionCard.cmc,
        type_line: collectionCard.type_line,
        oracle_text: collectionCard.oracle_text,
        colors: collectionCard.colors,
        color_identity: collectionCard.color_identity,
        power: collectionCard.power,
        toughness: collectionCard.toughness,
        keywords: collectionCard.keywords,
        legalities: { [aiFormat]: 'legal' } as any,
        image_uris: undefined,
        prices: { usd: collectionCard.priceUsd?.toString() },
        set: collectionCard.setCode,
        set_name: collectionCard.setCode,
        collector_number: collectionCard.collectorNumber || '1',
        rarity: collectionCard.rarity as any,
        layout: 'normal',
        is_legendary: collectionCard.type_line.includes('Legendary'),
        tags: new Set<string>(),
        derived: {
          mv: collectionCard.cmc,
          colorPips: {},
          producesMana: collectionCard.type_line.includes('Land'),
          etbTapped: false
        }
      }));

      const result = buildDeck(cardPool, aiFormat, aiArchetype, aiPowerLevel, aiColors.length > 0 ? aiColors : undefined);
      
      // Clear current deck and load the generated one
      deck.clearDeck();
      deck.setDeckName(`AI Generated - ${availableTemplates.find(t => t.id === aiArchetype)?.name || 'Deck'}`);
      deck.setFormat(aiFormat as any);
      deck.setPowerLevel(aiPowerLevel);
      
      // Add cards to deck
      result.deck.forEach(card => {
        deck.addCard({
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
          mechanics: Array.from(card.tags)
        });
      });

      toast({
        title: "Deck Generated!",
        description: `Created ${result.deck.length}-card deck with power level ${result.analysis.power.toFixed(1)}`,
      });
      
      setShowAIDialog(false);
      setActiveTab('deck-editor');
      
    } catch (error) {
      console.error('Error generating deck:', error);
      toast({
        title: "Generation Failed",
        description: "Could not generate deck. Try adjusting your requirements.",
        variant: "destructive"
      });
    } finally {
      setBuildingDeck(false);
    }
  };

  const getFormatBadgeColor = (format: string) => {
    switch (format) {
      case 'standard': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'commander': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'custom': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
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
            Deck Manager
          </h1>
          <p className="text-muted-foreground">
            Create, analyze, and optimize your Magic: The Gathering decks
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Deck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Deck</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="deck-name">Deck Name</Label>
                  <Input
                    id="deck-name"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Enter deck name..."
                  />
                </div>
                <div>
                  <Label htmlFor="deck-format">Format</Label>
                  <Select value={newDeckFormat} onValueChange={(value: any) => setNewDeckFormat(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="commander">Commander</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createDeck} className="w-full">
                  Create Deck
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="my-decks">My Decks</TabsTrigger>
          <TabsTrigger value="deck-editor">Editor</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="import-export">Import/Export</TabsTrigger>
          <TabsTrigger value="ai-builder">AI Builder</TabsTrigger>
        </TabsList>

        {/* My Decks Tab */}
        <TabsContent value="my-decks" className="space-y-6">
          {/* Search */}
          <Card>
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search decks by name, format, or colors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Decks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDecks.map((deckData) => (
              <Card key={deckData.id} className="group hover:shadow-lg transition-all duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{deckData.name}</CardTitle>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge className={getFormatBadgeColor(deckData.format)}>
                          {deckData.format}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {deckData.cardCount} cards
                        </span>
                      </div>
                    </div>
                    {deckData.format === 'commander' && (
                      <Crown className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">Power Level:</span>
                      <Badge variant="outline">{deckData.powerLevel}/10</Badge>
                    </div>
                    <div className="flex space-x-1">
                      {getColorIcons(deckData.colors)}
                    </div>
                  </div>

                  {deckData.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {deckData.description}
                    </p>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Modified {deckData.lastModified.toLocaleDateString()}
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={() => loadDeck(deckData)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => duplicateDeck(deckData)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => deleteDeck(deckData.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredDecks.length === 0 && (
            <Card className="p-12 text-center">
              <Sparkles className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-medium mb-2">No Decks Found</h3>
              <p className="text-muted-foreground mb-4">
                {decks.length === 0 
                  ? "Create your first deck to get started!"
                  : "Try adjusting your search terms."
                }
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Deck
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Deck Editor Tab */}
        <TabsContent value="deck-editor" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ModernDeckList />
            </div>
            <div className="space-y-6">
              <PowerSliderCoaching
                currentPower={deck.powerLevel}
                onPowerChange={(power) => deck.setPowerLevel(power)}
                onApplyChanges={(power) => {
                  deck.setPowerLevel(power);
                  toast({
                    title: "Power Level Updated",
                    description: `Deck power level set to ${power.toFixed(1)}`,
                  });
                }}
              />
              <LandEnhancerUX />
            </div>
          </div>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-6">
          <EnhancedAnalysisPanel />
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <ArchetypeLibrary
            currentFormat={deck.format || 'standard'}
            currentDeck={deck.cards}
            onApplyTemplate={(template) => {
              toast({
                title: "Template Applied",
                description: `Applied ${template.name} archetype template`,
              });
            }}
          />
        </TabsContent>

        {/* Import/Export Tab */}
        <TabsContent value="import-export" className="space-y-6">
          <DeckImportExport
            currentDeck={deck.cards}
            onImportDeck={(cards) => {
              deck.clearDeck();
              cards.forEach(card => deck.addCard(card));
              toast({
                title: "Deck Imported",
                description: `Imported ${cards.length} cards`,
              });
            }}
          />
        </TabsContent>

        {/* AI Builder Tab */}
        <TabsContent value="ai-builder" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wand2 className="h-5 w-5 mr-2" />
                AI Deck Builder
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="ai-format">Format</Label>
                    <Select value={aiFormat} onValueChange={setAiFormat}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="pioneer">Pioneer</SelectItem>
                        <SelectItem value="modern">Modern</SelectItem>
                        <SelectItem value="legacy">Legacy</SelectItem>
                        <SelectItem value="commander">Commander</SelectItem>
                        <SelectItem value="pauper">Pauper</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="ai-archetype">Archetype</Label>
                    <Select value={aiArchetype} onValueChange={setAiArchetype}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select archetype..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="ai-power">Power Level: {aiPowerLevel}</Label>
                    <input
                      id="ai-power"
                      type="range"
                      min="1"
                      max="10"
                      value={aiPowerLevel}
                      onChange={(e) => setAiPowerLevel(Number(e.target.value))}
                      className="w-full mt-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Casual</span>
                      <span>Competitive</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Colors (Optional)</Label>
                    <div className="flex space-x-2 mt-2">
                      {[
                        { symbol: 'W', name: 'White', color: '#FFFBD5' },
                        { symbol: 'U', name: 'Blue', color: '#0E68AB' },
                        { symbol: 'B', name: 'Black', color: '#150B00' },
                        { symbol: 'R', name: 'Red', color: '#D3202A' },
                        { symbol: 'G', name: 'Green', color: '#00733E' }
                      ].map(color => (
                        <button
                          key={color.symbol}
                          onClick={() => {
                            if (aiColors.includes(color.symbol)) {
                              setAiColors(aiColors.filter(c => c !== color.symbol));
                            } else {
                              setAiColors([...aiColors, color.symbol]);
                            }
                          }}
                          className={`
                            w-8 h-8 rounded-full border-2 text-xs font-bold
                            ${aiColors.includes(color.symbol)
                              ? 'border-primary ring-2 ring-primary/50' 
                              : 'border-border hover:border-primary/50'
                            }
                          `}
                          style={{ 
                            backgroundColor: color.color,
                            color: color.symbol === 'W' ? '#000' : '#fff'
                          }}
                        >
                          {color.symbol}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Collection Stats</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Total Cards: {collection.totalCards}</div>
                      <div>Unique Cards: {collection.cards.length}</div>
                      <div>Collection Value: ${collection.totalValue.toFixed(2)}</div>
                      <div>Average Power: 6.5</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-4">
                <Button 
                  onClick={generateAIDeck}
                  disabled={buildingDeck || !aiArchetype}
                  className="flex-1"
                >
                  {buildingDeck ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Deck
                    </>
                  )}
                </Button>
                <Button variant="outline" disabled={buildingDeck}>
                  <Settings className="h-4 w-4 mr-2" />
                  Advanced
                </Button>
              </div>

              {availableTemplates.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Wand2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No archetypes available for {aiFormat}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}