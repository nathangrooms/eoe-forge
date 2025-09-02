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
import { CompactCommanderSection } from '@/components/deck-builder/CompactCommanderSection';
import { EnhancedDeckList } from '@/components/deck-builder/EnhancedDeckList';
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
  const { decks: localDecks, addCardToDeck, createDeck, setActiveDeck, activeDeck } = useDeckManagementStore();
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

  // Get URL parameters for deck loading
  const [searchParams] = useSearchParams();
  
  // Load all decks (Supabase + Local)
  useEffect(() => {
    loadAllDecks();
  }, [user, localDecks]);

  // Handle URL parameters for deck loading
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    if (deckParam && allDecks.length > 0) {
      const deckToLoad = allDecks.find(d => d.id === deckParam);
      if (deckToLoad) {
        loadDeck(deckToLoad);
        setSelectedDeckId(deckParam);
      }
    }
  }, [searchParams, allDecks]);

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

      const localDecksFormatted: Deck[] = [];
      // No longer including local decks since we only want Supabase decks

      setAllDecks([...supabaseDecks]);
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
    
    // Auto-save if this is a Supabase deck (debounced to prevent rapid saves)
    if (deck.currentDeckId) {
      clearTimeout((window as any).__autoSaveTimeout);
      (window as any).__autoSaveTimeout = setTimeout(() => {
        deck.updateDeck(deck.currentDeckId!).then((result) => {
          if (result.success) {
            console.log('Auto-saved deck changes');
          } else {
            console.error('Failed to auto-save:', result.error);
          }
        });
      }, 1000);
    }
    
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
        // Use the store's loadDeck function for Supabase decks
        const result = await deck.loadDeck(deckData.id);
        
        if (result.success) {
          // Set the current deck ID for auto-saving
          deck.setCurrentDeckId(deckData.id);
          setSelectedDeckId(deckData.id);
          
          toast({
            title: "Deck Loaded",
            description: `"${deckData.name}" is ready for editing`,
          });
        } else {
          toast({
            title: "Error",
            description: result.error || "Failed to load deck",
            variant: "destructive"
          });
        }
      }
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

        if (error) throw error;
        
        showSuccess("Deck Created", `"${newDeckName}" has been created successfully`);
      } else {
        // Create locally
        const localDeck = createDeck(newDeckName, newDeckFormat, newDeckDescription);
        showSuccess("Deck Created", `"${newDeckName}" has been created locally`);
      }
      
      setNewDeckName('');
      setNewDeckDescription('');
      setShowCreateDialog(false);
      await loadAllDecks();
    } catch (error) {
      console.error('Error creating deck:', error);
      showError("Error", "Failed to create deck");
    }
  };

  return (
    <StandardPageLayout
      title="Deck Builder"
      description="Build and optimize your Magic: The Gathering decks"
      action={
        <div className="flex gap-2">
          <Select value={selectedDeckId || ''} onValueChange={(value) => {
            setSelectedDeckId(value);
            const selectedDeck = allDecks.find(d => d.id === value);
            if (selectedDeck) {
              loadDeck(selectedDeck);
            }
          }}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a deck..." />
            </SelectTrigger>
            <SelectContent>
              {allDecks.map((deck) => (
                <SelectItem key={deck.id} value={deck.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{deck.name}</span>
                    <Badge variant="outline" className="ml-2">
                      {deck.format}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
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
                    placeholder="Enter deck description..."
                  />
                </div>
                <Button onClick={createNewDeck} className="w-full">
                  Create Deck
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Tabs defaultValue="deck" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="deck" className="flex items-center space-x-2">
            <Sparkles className="h-4 w-4" />
            <span>Deck ({deck.totalCards || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center space-x-2">
            <Search className="h-4 w-4" />
            <span>Card Search</span>
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

        {/* Deck Canvas Tab */}
        <TabsContent value="deck">
          {deck.name ? (
            <div className="space-y-6">
              {/* Commander Section - Only for Commander format */}
              {deck.format === 'commander' && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-3">Commander</h2>
                  <CompactCommanderSection 
                    currentCommander={deck.commander}
                  />
                </div>
              )}
              
              {/* Enhanced Deck List */}
              <EnhancedDeckList deckId={selectedDeckId || undefined} />
            </div>
          ) : (
            <div className="text-center p-8">
              <p className="text-muted-foreground mb-4">No deck selected</p>
              <p className="text-sm text-muted-foreground mb-4">Select a deck from the dropdown above to start building</p>
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
              onImportDeck={async (cards) => {
                try {
                  // Import all cards directly to the store without triggering auto-saves
                  deck.importDeck(cards);
                  
                  // If we have a current deck, save it once to the database
                  if (deck.currentDeckId) {
                    await deck.updateDeck(deck.currentDeckId);
                  }
                  
                  showSuccess("Deck Imported", `Imported ${cards.length} cards`);
                } catch (error) {
                  console.error('Import error:', error);
                  showError("Import Failed", "Failed to import deck");
                }
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </StandardPageLayout>
  );
};

export default DeckBuilder;