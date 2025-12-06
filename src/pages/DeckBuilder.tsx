import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { CompactCommanderSection } from '@/components/deck-builder/CompactCommanderSection';
import { EnhancedDeckList } from '@/components/deck-builder/EnhancedDeckList';
import { AIReplacementsPanel } from '@/components/deck-builder/AIReplacementsPanel';
import { AIDeckCoach } from '@/components/deck-builder/AIDeckCoach';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { QuickDeckTester } from '@/components/deck-builder/QuickDeckTester';
import { DeckPrimerGenerator } from '@/components/deck-builder/DeckPrimerGenerator';
import { DeckValidationPanel } from '@/components/deck-builder/DeckValidationPanel';
import { DeckCompatibilityChecker } from '@/components/deck-builder/DeckCompatibilityChecker';
import { PowerLevelConsistency } from '@/components/deck-builder/PowerLevelConsistency';
import { EnhancedMatchTracker } from '@/components/deck-builder/EnhancedMatchTracker';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { CardReplacementEngine } from '@/components/deck-builder/CardReplacementEngine';
import { DeckProxyGenerator } from '@/components/deck-builder/DeckProxyGenerator';
import { DeckNotesPanel } from '@/components/deck-builder/DeckNotesPanel';
import { MatchAnalytics } from '@/components/deck-builder/MatchAnalytics';
import { EnhancedDeckExport } from '@/components/deck-builder/EnhancedDeckExport';
import { DeckSocialFeatures } from '@/components/deck-builder/DeckSocialFeatures';
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { DeckBuilderTabs } from '@/components/deck-builder/DeckBuilderTabs';
import { VisualDeckView } from '@/components/deck-builder/VisualDeckView';
import { scryfallAPI } from '@/lib/api/scryfall';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus, ExternalLink, RefreshCw, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const navigate = useNavigate();
  
  // State for deck management
  const [allDecks, setAllDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('visual');
  const [edhPowerLevel, setEdhPowerLevel] = useState<number | null>(null);
  const [edhMetrics, setEdhMetrics] = useState<{
    tippingPoint: number | null;
    efficiency: number | null;
    impact: number | null;
    score: number | null;
    playability: number | null;
  } | null>(null);
  const [edhPowerUrl, setEdhPowerUrl] = useState<string | null>(null);
  const [loadingEdhPower, setLoadingEdhPower] = useState(false);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<'standard' | 'commander' | 'custom'>('commander');
  const [newDeckDescription, setNewDeckDescription] = useState('');

  // Get URL parameters for deck loading
  const [searchParams] = useSearchParams();
  
  // Clear any persisted deck when a specific deck is requested
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    if (deckParam && deck.currentDeckId && deck.currentDeckId !== deckParam) {
      deck.clearDeck();
      deck.setDeckName('');
      deck.setCurrentDeckId(undefined as any);
    }
  }, [searchParams]);
  
  // Load all decks
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
    
    (async () => {
      const res = await deck.loadDeck(deckParam);
      if (res.success) {
        deck.setCurrentDeckId(deckParam);
        setSelectedDeckId(deckParam);
        checkEdhPowerLevel(deckParam);
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
      mechanics: card.keywords || [],
      image_uris: card.image_uris,
      prices: card.prices
    };

    deck.addCard(deckCard);
    
    // Auto-save if this is a Supabase deck
    if (deck.currentDeckId) {
      clearTimeout((window as any).__autoSaveTimeout);
      (window as any).__autoSaveTimeout = setTimeout(() => {
        deck.updateDeck(deck.currentDeckId!).then((result) => {
          if (result.success) {
            console.log('Auto-saved deck changes');
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

      // Get deck cards and commander from summary
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

      // Call the edh-power-check edge function to get LIVE power from edhpowerlevel.com
      const { data: powerData, error: powerError } = await supabase.functions.invoke('edh-power-check', {
        body: { 
          cards: listCards.map(c => c.name),
          commander: listCommander?.name || null
        }
      });

      console.log('EDH Power Check Response:', powerData);
      
      if (!powerError && powerData?.success && powerData?.powerLevel !== null && powerData?.powerLevel !== undefined) {
        const liveLevel = typeof powerData.powerLevel === 'number' ? powerData.powerLevel : parseFloat(powerData.powerLevel);
        console.log('Parsed EDH Power Level:', liveLevel);
        
        if (!isNaN(liveLevel)) {
          setEdhPowerLevel(liveLevel);
          // Store all metrics
          const metrics = {
            tippingPoint: powerData.tippingPoint ?? null,
            efficiency: powerData.efficiency ?? null,
            impact: powerData.impact ?? null,
            score: powerData.score ?? null,
            playability: powerData.playability ?? null,
          };
          console.log('Setting EDH Metrics:', metrics);
          setEdhMetrics(metrics);
          showSuccess('Power Level', `EDH Power: ${liveLevel.toFixed(2)}/10 (from edhpowerlevel.com)`);
        }
      } else {
        console.warn('Could not fetch live EDH power level:', powerError || powerData);
        showError('EDH Power', 'Could not fetch power level. Click "View Details" to check manually.');
      }
    } catch (error) {
      console.error('Error checking EDH power level:', error);
    } finally {
      setLoadingEdhPower(false);
    }
  };

  const loadDeck = async (deckData: Deck) => {
    try {
      const result = await deck.loadDeck(deckData.id);
      
      if (result.success) {
        deck.setCurrentDeckId(deckData.id);
        setSelectedDeckId(deckData.id);
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
        
        if (newDeck) {
          await loadAllDecks();
          loadDeck({
            id: newDeck.id,
            name: newDeck.name,
            format: newDeck.format as any,
            powerLevel: newDeck.power_level,
            colors: newDeck.colors,
            cardCount: 0,
            lastModified: new Date(newDeck.updated_at)
          });
        }
      }
      
      setNewDeckName('');
      setNewDeckDescription('');
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Error creating deck:', error);
      showError("Error", "Failed to create deck");
    }
  };

  // Calculate deck stats
  const deckStats = useMemo(() => {
    const cards = deck.cards as any[];
    let creatures = 0, lands = 0, instants = 0, sorceries = 0, artifacts = 0, enchantments = 0, planeswalkers = 0;
    let totalCmc = 0, nonLandCount = 0, totalValue = 0;

    cards.forEach(card => {
      const qty = card.quantity || 1;
      const typeLine = (card.type_line || '').toLowerCase();
      
      if (typeLine.includes('creature')) creatures += qty;
      else if (typeLine.includes('land')) lands += qty;
      else if (typeLine.includes('instant')) instants += qty;
      else if (typeLine.includes('sorcery')) sorceries += qty;
      else if (typeLine.includes('artifact')) artifacts += qty;
      else if (typeLine.includes('enchantment')) enchantments += qty;
      else if (typeLine.includes('planeswalker')) planeswalkers += qty;
      
      if (!typeLine.includes('land')) {
        totalCmc += (card.cmc || 0) * qty;
        nonLandCount += qty;
      }

      const price = parseFloat(card.prices?.usd || '0') || 0;
      totalValue += price * qty;
    });

    return {
      totalCards: deck.totalCards,
      creatures,
      lands,
      instants,
      sorceries,
      artifacts,
      enchantments,
      planeswalkers,
      avgCmc: nonLandCount > 0 ? totalCmc / nonLandCount : 0,
      totalValue,
      powerLevel: deck.powerLevel,
      edhPowerLevel,
      edhMetrics,
      edhPowerUrl,
      loadingEdhPower,
      onCheckEdhPower: () => checkEdhPowerLevel(),
      format: deck.format || 'commander',
      commanderName: deck.commander?.name,
      colors: deck.colors || [],
      missingCards: 0,
      ownedPct: 100
    };
  }, [deck.cards, deck.totalCards, deck.format, deck.commander, deck.colors, deck.powerLevel, edhPowerLevel, edhMetrics, edhPowerUrl, loadingEdhPower]);

  return (
    <StandardPageLayout
      title="Deck Builder"
      description={deck.name ? `Editing: ${deck.name}` : "Build and optimize your Magic: The Gathering decks"}
      action={
        <div className="flex flex-col xs:flex-row gap-2 w-full xs:w-auto">
          <Select value={selectedDeckId || ''} onValueChange={(value) => {
            setSelectedDeckId(value);
            const selectedDeck = allDecks.find(d => d.id === value);
            if (selectedDeck) {
              loadDeck(selectedDeck);
            }
          }}>
            <SelectTrigger className="w-full xs:w-80 max-w-md">
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
              <Button className="w-full xs:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden xs:inline">New Deck</span>
                <span className="xs:hidden">New</span>
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
                      <SelectItem value="commander">Commander</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
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
      {deck.name ? (
        <div className="h-full flex flex-col">
          {/* Quick Stats */}
          <div className="px-4 md:px-6 py-4 border-b bg-muted/20">
            <DeckQuickStats {...deckStats} />
          </div>

          {/* EDH Power Level Banner - Commander only */}
          {deck.format === 'commander' && (
            <div className="px-4 md:px-6 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Target className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">EDH Power Level</p>
                    {loadingEdhPower ? (
                      <p className="text-xs text-muted-foreground">Calculating...</p>
                    ) : edhPowerLevel !== null ? (
                      <p className="text-xl font-bold">{edhPowerLevel}/10</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Click to calculate</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => checkEdhPowerLevel()}
                    disabled={loadingEdhPower}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", loadingEdhPower && "animate-spin")} />
                    Calculate
                  </Button>
                  {edhPowerUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={edhPowerUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Details
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabs Navigation */}
          <DeckBuilderTabs 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            totalCards={deck.totalCards}
            format={deck.format || 'commander'}
          />

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            {/* Visual View */}
            {activeTab === 'visual' && (
              <VisualDeckView
                cards={deck.cards as any}
                commander={deck.commander}
                format={deck.format || 'commander'}
                onAddCard={(cardId) => {
                  const card = deck.cards.find(c => c.id === cardId);
                  if (card) {
                    deck.updateCardQuantity(cardId, (card.quantity || 1) + 1);
                  }
                }}
                onRemoveCard={(cardId) => {
                  const card = deck.cards.find(c => c.id === cardId);
                  if (card && (card.quantity || 1) > 1) {
                    deck.updateCardQuantity(cardId, (card.quantity || 1) - 1);
                  } else {
                    deck.removeCard(cardId);
                  }
                }}
              />
            )}

            {/* List View */}
            {activeTab === 'list' && (
              <div className="space-y-6">
                {deck.format === 'commander' && (
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-3">Commander</h2>
                    <CompactCommanderSection currentCommander={deck.commander} />
                  </div>
                )}
                <EnhancedDeckList deckId={selectedDeckId || undefined} />
              </div>
            )}

            {/* Add Cards */}
            {activeTab === 'search' && (
              <>
                <Card className="p-4 mb-6 bg-muted/30">
                  <p className="text-sm font-medium">Adding cards to: {deck.name}</p>
                  <p className="text-xs text-muted-foreground">Format: {deck.format} • Cards: {deck.totalCards}</p>
                </Card>
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
            )}

            {/* Analysis */}
            {activeTab === 'analysis' && deck.cards.length > 0 && (
              <div className="space-y-6">
                {deck.format === 'commander' && deck.commander && (
                  <DeckCompatibilityChecker 
                    cards={deck.cards as any}
                    commander={deck.commander}
                    format={deck.format || 'standard'}
                    onRemoveCard={(cardId) => {
                      const card = deck.cards.find(c => c.id === cardId);
                      if (card) {
                        deck.removeCard(cardId);
                        showSuccess('Card Removed', `${card.name} removed due to color identity mismatch`);
                      }
                    }}
                  />
                )}
                <DeckValidationPanel 
                  cards={deck.cards as any}
                  format={deck.format || 'standard'}
                  commander={deck.commander}
                />
                {deck.format === 'commander' && (
                  <CommanderPowerDisplay
                    powerLevel={edhPowerLevel ?? deck.powerLevel}
                    metrics={{
                      overall: edhPowerLevel ?? deck.powerLevel,
                      speed: (edhPowerLevel ?? deck.powerLevel) * 0.9,
                      interaction: (edhPowerLevel ?? deck.powerLevel) * 1.1,
                      resilience: (edhPowerLevel ?? deck.powerLevel) * 0.8,
                      comboPotential: (edhPowerLevel ?? deck.powerLevel) * 1.2
                    }}
                  />
                )}
                <PowerLevelConsistency 
                  deckCards={deck.cards as any}
                  commander={deck.commander}
                  format={deck.format || 'standard'}
                />
                <ArchetypeDetection 
                  deckCards={deck.cards as any}
                  commander={deck.commander}
                  format={deck.format || 'standard'}
                />
                {deck.currentDeckId && (
                  <EnhancedMatchTracker 
                    deckId={deck.currentDeckId}
                    deckName={deck.name}
                  />
                )}
                <DeckBudgetTracker 
                  deckCards={deck.cards as any}
                  targetBudget={200}
                />
                {deck.currentDeckId && <DeckNotesPanel deckId={deck.currentDeckId} />}
                {deck.currentDeckId && (
                  <MatchAnalytics 
                    deckId={deck.currentDeckId}
                    deckName={deck.name}
                  />
                )}
                <EnhancedDeckAnalysisPanel 
                  deck={deck.cards as any}
                  format={deck.format || 'standard'}
                  commander={deck.commander}
                  deckId={selectedDeckId || deck.currentDeckId || undefined}
                  deckName={deck.name}
                />
              </div>
            )}

            {activeTab === 'analysis' && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to see analysis</p>
                <p className="text-sm">Get detailed stats, synergy insights, and recommendations</p>
              </div>
            )}

            {/* AI Coach */}
            {activeTab === 'ai' && deck.cards.length > 0 && (
              <div className="space-y-6">
                <AIDeckCoach
                  deckCards={deck.cards as any}
                  deckName={deck.name}
                  format={deck.format}
                  commander={deck.commander}
                  powerLevel={edhPowerLevel ?? deck.powerLevel}
                />
                <DeckPrimerGenerator 
                  deckName={deck.name}
                  commander={deck.commander?.name}
                  cardCount={deck.totalCards}
                />
                {deck.currentDeckId && (
                  <DeckSocialFeatures 
                    deckId={deck.currentDeckId}
                    deckName={deck.name}
                    isPublic={true}
                  />
                )}
              </div>
            )}

            {activeTab === 'ai' && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to get AI coaching</p>
              </div>
            )}

            {/* Replacements */}
            {activeTab === 'replacements' && deck.cards.length > 0 && (
              <div className="space-y-6">
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
                    power: { score: edhPowerLevel ?? deck.powerLevel }
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
                      setTimeout(() => deck.updateDeck(deck.currentDeckId!), 1000);
                    }
                  }}
                />
                <CardReplacementEngine 
                  deckCards={deck.cards as any}
                  onReplaceCard={(oldCardId, newCard) => {
                    deck.removeCard(oldCardId);
                    deck.addCard(newCard);
                  }}
                />
                <DeckProxyGenerator 
                  deckCards={deck.cards as any}
                  deckName={deck.name}
                />
              </div>
            )}

            {activeTab === 'replacements' && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to get replacement suggestions</p>
              </div>
            )}

            {/* Import/Export */}
            {activeTab === 'import-export' && (
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
                <EnhancedDeckExport 
                  deckName={deck.name}
                  deckCards={deck.cards as any}
                  commander={deck.commander}
                  format={deck.format}
                />
              </div>
            )}

            {/* Playtest */}
            {activeTab === 'test' && deck.cards.length > 0 && (
              <QuickDeckTester 
                deck={deck.cards.map(card => ({
                  id: card.id,
                  name: card.name,
                  cmc: card.cmc,
                  type_line: card.type_line,
                  mana_cost: card.mana_cost
                }))}
              />
            )}

            {activeTab === 'test' && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to test opening hands</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full py-16">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <Plus className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Deck Selected</h2>
            <p className="text-muted-foreground mb-6">
              Select an existing deck from the dropdown above, or create a new deck to get started.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Deck
            </Button>
          </div>
        </div>
      )}
    </StandardPageLayout>
  );
};

export default DeckBuilder;