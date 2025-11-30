import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { CardGallery } from '@/components/deck-builder/CardGallery';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { CompactCommanderSection } from '@/components/deck-builder/CompactCommanderSection';
import { EnhancedDeckList } from '@/components/deck-builder/EnhancedDeckList';
import { AIReplacementsPanel } from '@/components/deck-builder/AIReplacementsPanel';
import { AIDeckCoach } from '@/components/deck-builder/AIDeckCoach';
import { DeckCardDisplay } from '@/components/deck-builder/DeckCardDisplay';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { QuickDeckTester } from '@/components/deck-builder/QuickDeckTester';
import { scryfallAPI } from '@/lib/api/scryfall';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

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
  const [edhPowerLevel, setEdhPowerLevel] = useState<number | null>(null);
  const [edhPowerUrl, setEdhPowerUrl] = useState<string | null>(null);
  const [loadingEdhPower, setLoadingEdhPower] = useState(false);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<'standard' | 'commander' | 'custom'>('standard');
  const [newDeckDescription, setNewDeckDescription] = useState('');

  // Get URL parameters for deck loading
  const [searchParams] = useSearchParams();
  
  // Clear any persisted deck when a specific deck is requested to avoid "random" deck showing first
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    if (deckParam && deck.currentDeckId && deck.currentDeckId !== deckParam) {
      // Only clear if we're switching to a different deck
      deck.clearDeck();
      deck.setDeckName('');
      deck.setCurrentDeckId(undefined as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  
  // Load all decks (Supabase + Local)
  useEffect(() => {
    loadAllDecks();
  }, [user, localDecks]);

  // Handle URL parameters for deck loading
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    if (!deckParam) return;

    if (allDecks.length > 0) {
      const deckToLoad = allDecks.find(d => d.id === deckParam);
      if (deckToLoad) {
        loadDeck(deckToLoad);
        setSelectedDeckId(deckParam);
        return;
      }
    }
    // Fallback: attempt direct load by id if not found in list yet
    (async () => {
      const res = await deck.loadDeck(deckParam);
      if (res.success) {
        deck.setCurrentDeckId(deckParam);
        setSelectedDeckId(deckParam);
      }
    })();
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

  const checkEdhPowerLevel = async (deckId?: string) => {
    setLoadingEdhPower(true);
    try {
      const targetDeckId = deckId || selectedDeckId || deck.currentDeckId;
      
      if (!targetDeckId) {
        showError('No Deck Selected', 'Please select or load a deck first.');
        return;
      }

      // Build fallback EDH Power Level URL
      let listCommander: { name: string } | null = deck.commander ? { name: (deck.commander as any).name } : null;
      let listCards: { name: string; quantity: number }[] = (deck.cards as any[]).map((c: any) => ({ name: c.name, quantity: c.quantity || 1 }));

      if (targetDeckId) {
        const { data: summaryData, error: summaryError } = await supabase.rpc('compute_deck_summary', {
          deck_id: targetDeckId
        });
        if (!summaryError && summaryData) {
          const summary = summaryData as any;
          listCards = (summary.cards || []).map((c: any) => ({ name: c.card_name, quantity: c.quantity }));
          listCommander = summary.commander ? { name: summary.commander.name } : listCommander;
        }
      }

      const cleanName = (name: string) => name.replace(/\s*\(commander\)\s*$/i, '').trim();
      const encodeName = (name: string) => encodeURIComponent(cleanName(name)).replace(/%20/g, '+');

      const parts: string[] = [];
      const seen = new Map<string, { name: string; qty: number }>();
      const commanderNameRaw = listCommander?.name ? cleanName(listCommander.name) : null;

      for (const c of listCards) {
        if (!c?.name) continue;
        const cleaned = cleanName(c.name);
        if (commanderNameRaw && cleaned.toLowerCase() === commanderNameRaw.toLowerCase()) continue;
        const key = cleaned.toLowerCase();
        const qty = c.quantity || 1;
        if (!seen.has(key)) seen.set(key, { name: cleaned, qty });
        else seen.get(key)!.qty += qty;
      }

      let header = '';
      if (listCommander?.name) {
        header = `1x+${encodeName(listCommander.name)}~~`;
      }

      for (const { name, qty } of seen.values()) {
        parts.push(`${qty}x+${encodeName(name)}`);
      }

      const MAX_ITEMS = 100;
      let limitedParts = parts.slice(0, MAX_ITEMS);
      const MAX_LEN = 7000;
      const sentinel = '~Z~';
      let body = limitedParts.join('~');
      let decklistParam = header + body + sentinel;
      while ((header.length + body.length + sentinel.length) > MAX_LEN && limitedParts.length > 0) {
        limitedParts.pop();
        body = limitedParts.join('~');
        decklistParam = header + body + sentinel;
      }

      const fallbackUrl = `https://edhpowerlevel.com/?d=${decklistParam}`;
      setEdhPowerUrl(fallbackUrl);

      // Call the new calculate-deck-power edge function
      const { data: powerData, error: powerError } = await supabase.functions.invoke('calculate-deck-power', {
        body: { deck_id: targetDeckId }
      });

      if (powerError) {
        console.error('EDH power calculation error:', powerError);
        showError('Power Calculation Failed', 'Could not calculate deck power. Using fallback URL.');
        setEdhPowerLevel(null);
      } else if (powerData && typeof powerData.power === 'number') {
        setEdhPowerLevel(powerData.power);
        showSuccess('Power Calculated', `Deck power: ${powerData.power}/10 (${powerData.band})`);
      } else {
        setEdhPowerLevel(null);
      }
    } catch (error) {
      console.error('Error checking EDH power level:', error);
      showError('EDH Power Level', 'Request failed. You can open the EDH link instead.');
    } finally {
      setLoadingEdhPower(false);
    }
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
          
          // Check EDH power level
          checkEdhPowerLevel(deckData.id);
          
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
            <SelectTrigger className="w-80 max-w-md">
              <SelectValue placeholder="Select a deck..." />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50 max-w-md">
              {allDecks.map((deckItem) => (
                <SelectItem key={deckItem.id} value={deckItem.id}>
                  <div className="flex items-center justify-between gap-2 max-w-full">
                    <span className="truncate flex-1 text-left">{deckItem.name}</span>
                    <Badge variant="outline" className="ml-2 shrink-0">
                      {deckItem.format}
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
      <Tabs defaultValue="deck" className="h-full flex flex-col">
        {/* Tabs */}
        <div className="border-b px-6">
          <TabsList className="flex w-full justify-start bg-transparent p-0 h-12 gap-6">
            <TabsTrigger 
              value="deck" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              Deck ({deck.totalCards || 0})
            </TabsTrigger>
            <TabsTrigger 
              value="search"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              Card Search
            </TabsTrigger>
            <TabsTrigger 
              value="analysis"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              AI Analysis
            </TabsTrigger>
            <TabsTrigger 
              value="replacements"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              AI Replacements
            </TabsTrigger>
            <TabsTrigger 
              value="import-export"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              Import/Export
            </TabsTrigger>
            <TabsTrigger 
              value="deck-tester"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              Deck Tester
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* Deck Canvas Tab */}
          <TabsContent value="deck" className="h-full overflow-auto px-6 py-4 m-0">
            {deck.name ? (
              <div className="space-y-6">
                {/* EDH Power Level Display */}
                {deck.format === 'commander' && (
                  <div className="bg-muted/50 p-4 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">EDH Power Level (edhpowerlevel.com)</p>
                        {loadingEdhPower ? (
                          <p className="text-sm text-muted-foreground mt-1">Calculating...</p>
                        ) : edhPowerLevel !== null ? (
                          <p className="text-2xl font-bold mt-1">{edhPowerLevel.toFixed(2)} / 10</p>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-1">Click button to check</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => checkEdhPowerLevel(selectedDeckId || deck.currentDeckId)}
                          disabled={loadingEdhPower}
                        >
                          {loadingEdhPower ? 'Checking...' : 'Get EDH Power Level'}
                        </Button>
                        {edhPowerUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={edhPowerUrl} target="_blank" rel="noopener noreferrer">
                              View Details
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
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
          <TabsContent value="search" className="h-full overflow-auto px-6 py-4 m-0">
            {deck.name ? (
              <>
                <div className="bg-muted/50 p-4 rounded-lg mb-6">
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
          <TabsContent value="analysis" className="h-full overflow-auto px-6 py-4 m-0">
            {deck.name && deck.cards.length > 0 ? (
              <div className="space-y-6">
                {/* Commander Power Display */}
                {deck.format === 'commander' && (
                  <CommanderPowerDisplay
                    powerLevel={deck.powerLevel}
                    metrics={{
                      overall: deck.powerLevel,
                      speed: deck.powerLevel * 0.9,
                      interaction: deck.powerLevel * 1.1,
                      resilience: deck.powerLevel * 0.8,
                      comboPotential: deck.powerLevel * 1.2
                    }}
                  />
                )}
                
                <AIDeckCoach 
                  deckCards={deck.cards as any}
                  deckName={deck.name}
                  format={deck.format}
                  commander={deck.commander}
                  powerLevel={deck.powerLevel}
                />
                <EnhancedDeckAnalysisPanel 
                  deck={deck.cards as any}
                  format={deck.format || 'standard'}
                  commander={deck.commander}
                  deckId={selectedDeckId || deck.currentDeckId || undefined}
                  deckName={deck.name}
                />
              </div>
            ) : (
              <div className="text-center p-8">
                <p className="text-muted-foreground mb-4">Add cards to your deck to see AI-powered analysis</p>
                <p className="text-sm text-muted-foreground">Get detailed stats, synergy insights, and recommendations</p>
              </div>
            )}
          </TabsContent>

          {/* AI Replacements Tab */}
          <TabsContent value="replacements" className="h-full overflow-auto px-6 py-4 m-0">
            {deck.name && deck.cards.length > 0 ? (
              <AIReplacementsPanel
                deckId={selectedDeckId || deck.currentDeckId || ''}
                deckName={deck.name}
                deckSummary={{
                  format: deck.format,
                  commander: deck.commander,
                  cards: deck.cards.map(card => ({
                    card_name: card.name,
                    quantity: card.quantity,
                    card_data: {
                      mana_cost: card.mana_cost,
                      cmc: card.cmc,
                      type_line: card.type_line,
                      colors: card.colors,
                      prices: card.prices
                    }
                  })),
                  power: { score: deck.powerLevel }
                }}
                onApplyReplacements={(replacements) => {
                  replacements.forEach(async ({ remove, add }) => {
                    const cardToRemove = deck.cards.find(c => c.name === remove);
                    if (cardToRemove) {
                      deck.removeCard(cardToRemove.id);
                    }
                    
                    try {
                      const newCard = await scryfallAPI.getCardByName(add);
                      handleAddCardToDeck(newCard);
                    } catch (error) {
                      console.error(`Failed to add ${add}:`, error);
                    }
                  });
                  
                  if (deck.currentDeckId) {
                    setTimeout(() => {
                      deck.updateDeck(deck.currentDeckId!);
                    }, 1000);
                  }
                }}
              />
            ) : (
              <div className="text-center p-8">
                <p className="text-muted-foreground mb-4">Add cards to your deck to get AI replacement suggestions</p>
              </div>
            )}
          </TabsContent>

          {/* Import/Export Tab */}
          <TabsContent value="import-export" className="h-full overflow-auto px-6 py-4 m-0">
            <div className="space-y-6">
              <DeckImportExport 
                currentDeck={[
                  ...deck.cards,
                  ...(deck.commander ? [{ ...(deck.commander as any), quantity: deck.commander.quantity ?? 1, category: 'commanders', is_commander: true }] : [])
                ]}
                onImportDeck={async (cards) => {
                  try {
                    deck.importDeck(cards);
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

          {/* Deck Tester Tab */}
          <TabsContent value="deck-tester" className="h-full overflow-auto px-6 py-4 m-0">
            {deck.cards.length > 0 ? (
              <QuickDeckTester 
                deck={deck.cards.map(card => ({
                  id: card.id,
                  name: card.name,
                  cmc: card.cmc,
                  type_line: card.type_line,
                  mana_cost: card.mana_cost
                }))}
              />
            ) : (
              <div className="text-center p-8">
                <p className="text-muted-foreground mb-4">Add cards to your deck to test opening hands</p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </StandardPageLayout>
  );
};

export default DeckBuilder;