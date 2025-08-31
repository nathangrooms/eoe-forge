import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { AnalysisPanel } from '@/components/deck-builder/AnalysisPanel';
import { AIBuilder } from '@/components/deck-builder/AIBuilder';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { EnhancedDeckCanvas } from '@/components/deck-builder/EnhancedDeckCanvas';
import { LandEnhancer } from '@/components/deck-builder/LandEnhancer';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { ArchetypeLibrary } from '@/components/deck-builder/ArchetypeLibrary';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { DeckSelector } from '@/components/deck-builder/DeckSelector';
import { CommanderSelector } from '@/components/deck-builder/CommanderSelector';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';

import { 
  Search,
  Sparkles,
  Activity,
  BarChart3,
  Download,
  Play,
  Crown,
  Plus,
  Edit,
  Wand2,
  Settings,
  Target,
  Zap
} from 'lucide-react';

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

const DeckBuilder = () => {
  const deck = useDeckStore();
  const { decks: localDecks, addCardToDeck, createDeck, setActiveDeck } = useDeckManagementStore();
  const { user } = useAuth();
  
  // State for deck management
  const [allDecks, setAllDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<'standard' | 'commander' | 'custom'>('standard');
  const [newDeckDescription, setNewDeckDescription] = useState('');

  
  // Load all decks (Supabase + Local)
  useEffect(() => {
    loadAllDecks();
  }, [user, localDecks]);

  const loadAllDecks = async () => {
    try {
      let supabaseDecks: Deck[] = [];
      
      if (user) {
        const { data: userDecks, error } = await supabase
          .from('user_decks')
          .select(`
            id,
            name,
            format,
            power_level,
            colors,
            description,
            created_at,
            updated_at,
            deck_cards(count)
          `)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (!error && userDecks) {
          supabaseDecks = userDecks.map(dbDeck => ({
            id: dbDeck.id,
            name: dbDeck.name,
            format: dbDeck.format as any,
            powerLevel: dbDeck.power_level,
            colors: dbDeck.colors,
            cardCount: dbDeck.deck_cards?.[0]?.count || 0,
            lastModified: new Date(dbDeck.updated_at),
            description: dbDeck.description || ''
          }));
        }
      }

      const localDecksFormatted: Deck[] = localDecks.map(localDeck => ({
        id: localDeck.id,
        name: `${localDeck.name} (Local)`,
        format: localDeck.format as any,
        powerLevel: localDeck.powerLevel,
        colors: localDeck.colors,
        cardCount: localDeck.totalCards,
        lastModified: new Date(localDeck.updatedAt),
        description: localDeck.description || ''
      }));

      setAllDecks([...supabaseDecks, ...localDecksFormatted]);
    } catch (error) {
      console.error('Error loading decks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCardToDeck = (card: any) => {
    if (!deck.name) {
      showSuccess("No Active Deck", "Please select a deck first");
      return;
    }

    const deckCard = {
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.colors || [],
      mana_cost: card.mana_cost,
      quantity: 1,
      category: card.type_line?.toLowerCase().includes('creature') ? 'creatures' as const : 
               card.type_line?.toLowerCase().includes('land') ? 'lands' as const :
               card.type_line?.toLowerCase().includes('instant') ? 'instants' as const :
               card.type_line?.toLowerCase().includes('sorcery') ? 'sorceries' as const : 'other' as const,
      mechanics: card.keywords || []
    };

    deck.addCard(deckCard);
    showSuccess("Card Added", `Added ${card.name} to ${deck.name}`);
  };

  const loadDeck = async (deckData: Deck) => {
    try {
      const isLocalDeck = deckData.name.includes('(Local)');
      
      if (isLocalDeck) {
        const originalId = deckData.id;
        const localDeck = localDecks.find(d => d.id === originalId);
        
        if (localDeck) {
          deck.setDeckName(localDeck.name);
          deck.setFormat(localDeck.format as any);
          deck.setPowerLevel(localDeck.powerLevel);
          deck.clearDeck();
          
          localDeck.cards.forEach(card => {
            deck.addCard(card);
          });
          
          if (localDeck.commander) {
            deck.setCommander(localDeck.commander);
          }
          
          setActiveDeck(originalId);
        }
      } else {
        deck.setDeckName(deckData.name);
        deck.setFormat(deckData.format);
        deck.setPowerLevel(deckData.powerLevel);
        
        const { data: deckCards, error } = await supabase
          .from('deck_cards')
          .select('*')
          .eq('deck_id', deckData.id);

        if (error) {
          console.error('Error loading deck cards:', error);
          toast({
            title: "Error",
            description: "Failed to load deck cards",
            variant: "destructive"
          });
          return;
        }

        deck.clearDeck();
        
        if (deckCards) {
          for (const dbCard of deckCards) {
            deck.addCard({
              id: dbCard.card_id,
              name: dbCard.card_name,
              quantity: dbCard.quantity,
              cmc: 0,
              type_line: '',
              colors: [],
              category: dbCard.is_commander ? 'commanders' as const : 'creatures' as const,
              mechanics: []
            });
          }
        }
      }

      setSelectedDeckId(deckData.id);
      
      toast({
        title: "Deck Loaded",
        description: `"${deckData.name.replace(' (Local)', '')}" is ready for editing`,
      });
    } catch (error) {
      console.error('Error loading deck:', error);
      toast({
        title: "Error",
        description: "Failed to load deck",
        variant: "destructive"
      });
    }
  };

  const createNewDeck = async () => {
    if (!newDeckName.trim()) return;
    
    try {
      if (user) {
        // Create in Supabase
        const { data: newDeck, error } = await supabase
          .from('user_decks')
          .insert({
            user_id: user.id,
            name: newDeckName,
            format: newDeckFormat,
            power_level: 5,
            colors: [],
            description: newDeckDescription
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating deck:', error);
          return;
        }

        await loadAllDecks();
        
        // Load the new deck
        const newDeckData: Deck = {
          id: newDeck.id,
          name: newDeck.name,
          format: newDeck.format as any,
          powerLevel: newDeck.power_level,
          colors: newDeck.colors,
          cardCount: 0,
          lastModified: new Date(newDeck.updated_at),
          description: newDeck.description || ''
        };
        
        await loadDeck(newDeckData);
      } else {
        // Create local deck
        const newDeck = createDeck(newDeckName, newDeckFormat, newDeckDescription);
        setActiveDeck(newDeck.id);
        
        deck.setDeckName(newDeck.name);
        deck.setFormat(newDeck.format as any);
        deck.setPowerLevel(newDeck.powerLevel);
        deck.clearDeck();
        
        setSelectedDeckId(newDeck.id);
      }
      
      setNewDeckName('');
      setNewDeckDescription('');
      setShowCreateDialog(false);
      showSuccess("Deck Created", `"${newDeckName}" has been created successfully`);
    } catch (error) {
      console.error('Error creating deck:', error);
      showError("Error", "Failed to create deck");
    }
  };
  return (
    <StandardPageLayout
      title="Deck Builder"
      description="Build and optimize your Magic: The Gathering decks with advanced AI assistance"
      action={
        <div className="flex items-center space-x-4">
          <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
            {deck.format || 'No Deck'} • {deck.totalCards} cards
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
      <Tabs defaultValue="select-deck" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="select-deck" className="flex items-center space-x-2">
            <Crown className="h-4 w-4" />
            <span>Select Deck</span>
          </TabsTrigger>
          <TabsTrigger value="deck" className="flex items-center space-x-2">
            <Sparkles className="h-4 w-4" />
            <span>Deck ({deck.totalCards || 0})</span>
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
          <TabsTrigger value="power-tuning" className="flex items-center space-x-2">
            <Target className="h-4 w-4" />
            <span>Power Tuning</span>
          </TabsTrigger>
          <TabsTrigger value="manabase" className="flex items-center space-x-2">
            <Zap className="h-4 w-4" />
            <span>Manabase</span>
          </TabsTrigger>
          <TabsTrigger value="import-export" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Import/Export</span>
          </TabsTrigger>
        </TabsList>

        {/* Deck Selection Tab */}
        <TabsContent value="select-deck" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Select or Create Deck</h3>
            
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
                  <div>
                    <Label htmlFor="deck-description">Description (Optional)</Label>
                    <Input
                      id="deck-description"
                      value={newDeckDescription}
                      onChange={(e) => setNewDeckDescription(e.target.value)}
                      placeholder="Describe your deck strategy..."
                    />
                  </div>
                  <Button onClick={createNewDeck} className="w-full" disabled={!newDeckName.trim()}>
                    Create Deck
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <Card className="p-12 text-center">
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span>Loading decks...</span>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allDecks.map(deckData => (
                <Card 
                  key={deckData.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedDeckId === deckData.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => loadDeck(deckData)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {deckData.name}
                          {deckData.format === 'commander' && (
                            <Crown className="h-4 w-4 text-yellow-500" />
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {deckData.format}
                          </Badge>
                          {deckData.colors.length > 0 && (
                            <div className="flex gap-1">
                              {deckData.colors.map(color => (
                                <div
                                  key={color}
                                  className="w-3 h-3 rounded-full text-xs font-bold flex items-center justify-center"
                                  style={{
                                    backgroundColor: {
                                      W: '#FFFBD5',
                                      U: '#0E68AB', 
                                      B: '#150B00',
                                      R: '#D3202A',
                                      G: '#00733E'
                                    }[color],
                                    color: color === 'W' ? '#000' : '#fff'
                                  }}
                                >
                                  {color}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{deckData.cardCount} cards</span>
                      <span>Power: {deckData.powerLevel}/10</span>
                    </div>
                    
                    {deckData.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {deckData.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {deck.format === 'commander' && deck.name && (
            <CommanderSelector 
              deckId={selectedDeckId || ''}
              currentCommander={deck.commander ? {
                ...deck.commander,
                colors: deck.commander.colors || [],
                category: 'creatures' as const
              } : undefined}
            />
          )}
        </TabsContent>

        {/* Deck Canvas Tab */}
        <TabsContent value="deck">
          {deck.name ? (
            <EnhancedDeckCanvas format={deck.format || 'standard'} />
          ) : (
            <div className="text-center p-8">
              <p className="text-muted-foreground mb-4">No deck selected</p>
              <p className="text-sm text-muted-foreground mb-4">Select a deck from the first tab to start building</p>
            </div>
          )}
        </TabsContent>

        {/* Card Search Tab */}
        <TabsContent value="search" className="space-y-6">
          {deck.name ? (
            <>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm font-medium">Adding cards to: {deck.name}</p>
                <p className="text-xs text-muted-foreground">Format: {deck.format} • Cards: {deck.totalCards}</p>
              </div>
              <EnhancedUniversalCardSearch
                onCardAdd={handleAddCardToDeck}
                onCardSelect={(card) => console.log('Selected:', card)}
                placeholder={`Search cards for your ${deck.format} deck...`}
                showFilters={true}
                showAddButton={true}
                showWishlistButton={false}
                showViewModes={true}
              />
            </>
          ) : (
            <div className="text-center p-8">
              <p className="text-muted-foreground mb-4">Select a deck first to add cards</p>
            </div>
          )}
        </TabsContent>

        {/* AI Builder Tab */}
        <TabsContent value="ai-builder">
          <AIBuilder />
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis">
          <EnhancedDeckAnalysisPanel deck={deck.cards} format={deck.format || 'standard'} />
        </TabsContent>

        {/* Power Tuning Tab */}
        <TabsContent value="power-tuning" className="space-y-6">
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
            </div>
          </div>
        </TabsContent>

        {/* Manabase Tab */}
        <TabsContent value="manabase" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ModernDeckList />
            </div>
            <div className="space-y-6">
              <LandEnhancerUX />
              <LandEnhancer 
                deck={deck.cards}
                format={deck.format || 'standard'}
                onAddLand={(landName) => {
                  const landCard = {
                    id: Math.random().toString(),
                    name: landName,
                    type_line: 'Land',
                    cmc: 0,
                    colors: [],
                    quantity: 1,
                    category: 'lands' as const,
                    mechanics: []
                  };
                  deck.addCard(landCard);
                  showSuccess("Land Added", `Added ${landName} to deck`);
                }}
              />
            </div>
          </div>
        </TabsContent>

        {/* Templates & Import/Export Tab */}
        <TabsContent value="import-export" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ArchetypeLibrary 
              currentFormat={deck.format || 'standard'}
              currentDeck={deck.cards}
              onApplyTemplate={(template) => {
                console.log('Apply template:', template);
                showSuccess("Template Applied", `Applied ${template.name} template`);
              }}
            />
            <DeckImportExport 
              currentDeck={deck.cards}
              onImportDeck={(cards) => {
                deck.clearDeck();
                cards.forEach(card => deck.addCard(card));
                showSuccess("Deck Imported", `Imported ${cards.length} cards`);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </StandardPageLayout>
  );
};

export default DeckBuilder;