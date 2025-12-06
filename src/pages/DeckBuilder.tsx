import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { CompactCommanderSection } from '@/components/deck-builder/CompactCommanderSection';
import { EnhancedDeckList } from '@/components/deck-builder/EnhancedDeckList';
import { AIOptimizerPanel } from '@/components/deck-builder/AIOptimizerPanel';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { QuickDeckTester } from '@/components/deck-builder/QuickDeckTester';
import { DeckPrimerGenerator } from '@/components/deck-builder/DeckPrimerGenerator';
import { DeckValidationPanel } from '@/components/deck-builder/DeckValidationPanel';
import { DeckCompatibilityChecker } from '@/components/deck-builder/DeckCompatibilityChecker';
import { PowerLevelConsistency } from '@/components/deck-builder/PowerLevelConsistency';
import { EnhancedMatchTracker } from '@/components/deck-builder/EnhancedMatchTracker';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { DeckProxyGenerator } from '@/components/deck-builder/DeckProxyGenerator';
import { DeckNotesPanel } from '@/components/deck-builder/DeckNotesPanel';
import { MatchAnalytics } from '@/components/deck-builder/MatchAnalytics';
import { EnhancedDeckExport } from '@/components/deck-builder/EnhancedDeckExport';
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { DeckBuilderTabs } from '@/components/deck-builder/DeckBuilderTabs';
import { EdhAnalysisPanel, EdhAnalysisData, BracketData, CardAnalysis, LandAnalysis } from '@/components/deck-builder/EdhAnalysisPanel';
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
import { Plus, ExternalLink, RefreshCw, Target, Pencil, ArrowLeft } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('cards');
  const [cardToReplace, setCardToReplace] = useState<string | null>(null);
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
  const [edhAnalysisData, setEdhAnalysisData] = useState<EdhAnalysisData | null>(null);
  const [edhCardsHash, setEdhCardsHash] = useState<string>('');
  const [edhNeedsRefresh, setEdhNeedsRefresh] = useState(false);
  
  // Dialog states
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameDeckName, setRenameDeckName] = useState('');

  // Get URL parameters for deck loading
  const [searchParams] = useSearchParams();
  
  // Clear any persisted deck when a specific deck is requested
  // This happens BEFORE the new deck loads, so we clear the currentDeckId first
  // to prevent auto-save race conditions
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    if (deckParam && deck.currentDeckId && deck.currentDeckId !== deckParam) {
      // Important: Clear currentDeckId FIRST to prevent auto-save from syncing empty state
      deck.setCurrentDeckId(undefined as any);
      deck.clearDeck();
      deck.setDeckName('');
    }
  }, [searchParams]);
  
  // Generate a hash of card names to detect changes
  const generateCardsHash = (cards: any[]): string => {
    const names = cards.map(c => c.name || c.card_name).sort().join('|');
    let hash = 0;
    for (let i = 0; i < names.length; i++) {
      const char = names.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  };

  // Load all decks
  useEffect(() => {
    loadAllDecks();
  }, [user, localDecks]);

  // Debounced auto-save when cards change
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedCardsRef = useRef<string>('');
  const pendingSaveRef = useRef<boolean>(false);
  
  // Save immediately function for critical moments
  const saveImmediately = useCallback(() => {
    const currentState = useDeckStore.getState();
    if (currentState.cards.length > 0 && currentState.currentDeckId && pendingSaveRef.current) {
      console.log('Immediate save triggered with', currentState.cards.length, 'cards');
      currentState.updateDeck(currentState.currentDeckId);
      pendingSaveRef.current = false;
      lastSavedCardsRef.current = JSON.stringify(currentState.cards.map(c => ({ id: c.id, qty: c.quantity })));
    }
  }, []);
  
  // Save on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveImmediately();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveImmediately]);
  
  useEffect(() => {
    if (!deck.currentDeckId || deck.cards.length === 0) return;
    
    // Create a hash of current cards to compare
    const currentCardsHash = JSON.stringify(deck.cards.map(c => ({ id: c.id, qty: c.quantity })));
    
    // Skip if nothing changed
    if (currentCardsHash === lastSavedCardsRef.current) return;
    
    // Mark that we have pending changes
    pendingSaveRef.current = true;
    
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save by 1 second (reduced from 2)
    saveTimeoutRef.current = setTimeout(() => {
      const currentState = useDeckStore.getState();
      if (currentState.cards.length > 0 && currentState.currentDeckId) {
        console.log('Auto-saving deck with', currentState.cards.length, 'cards');
        currentState.updateDeck(currentState.currentDeckId);
        lastSavedCardsRef.current = currentCardsHash;
        pendingSaveRef.current = false;
      }
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [deck.cards, deck.currentDeckId]);

  // Check if cards changed and EDH needs refresh
  useEffect(() => {
    if (deck.cards.length > 0 && deck.format === 'commander') {
      const currentHash = generateCardsHash(deck.cards);
      if (edhCardsHash && currentHash !== edhCardsHash) {
        setEdhNeedsRefresh(true);
      }
    }
  }, [deck.cards]);

  // Handle URL parameters for deck loading - redirect if no deck specified
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    
    // If no deck param, redirect to decks page
    if (!deckParam && !loading) {
      navigate('/decks');
      return;
    }
    
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
  }, [searchParams, allDecks, loading]);

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

  const checkEdhPowerLevel = async (deckId?: string, forceRefresh: boolean = false) => {
    setLoadingEdhPower(true);
    setEdhNeedsRefresh(false);
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

      // Calculate current cards hash
      const currentHash = generateCardsHash(listCards);
      setEdhCardsHash(currentHash);

      // Check for cached analysis if not forcing refresh
      if (!forceRefresh && targetDeckId) {
        const { data: deckData } = await supabase
          .from('user_decks')
          .select('edh_analysis, edh_cards_hash, edh_analysis_updated_at')
          .eq('id', targetDeckId)
          .single();
        
        if (deckData?.edh_analysis && deckData?.edh_cards_hash === currentHash) {
          console.log('Using cached EDH analysis');
          const cached = deckData.edh_analysis as any;
          setEdhPowerLevel(cached.metrics?.powerLevel ?? null);
          setEdhMetrics({
            tippingPoint: cached.metrics?.tippingPoint ?? null,
            efficiency: cached.metrics?.efficiency ?? null,
            impact: cached.metrics?.impact ?? null,
            score: cached.metrics?.score ?? null,
            playability: cached.metrics?.playability ?? null,
          });
          setEdhAnalysisData(cached as EdhAnalysisData);
          setEdhPowerUrl(cached.url || null);
          setLoadingEdhPower(false);
          return;
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
          url: fallbackUrl,
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
          const metrics = {
            tippingPoint: powerData.tippingPoint ?? null,
            efficiency: powerData.efficiency ?? null,
            impact: powerData.impact ?? null,
            score: powerData.score ?? null,
            playability: powerData.playability ?? null,
          };
          console.log('Setting EDH Metrics:', metrics);
          setEdhMetrics(metrics);
          
          // Store full analysis data
          const fullAnalysis: EdhAnalysisData = {
            metrics: {
              powerLevel: liveLevel,
              ...metrics,
            },
            bracket: powerData.bracket || null,
            cardAnalysis: powerData.cardAnalysis || [],
            landAnalysis: powerData.landAnalysis || null,
            url: powerData.url || fallbackUrl,
          };
          setEdhAnalysisData(fullAnalysis);
          
          // Save to database for caching
          if (targetDeckId) {
            await supabase
              .from('user_decks')
              .update({
                edh_analysis: fullAnalysis as any,
                edh_cards_hash: currentHash,
                edh_analysis_updated_at: new Date().toISOString()
              })
              .eq('id', targetDeckId);
            console.log('Saved EDH analysis to database');
          }
          
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

  const renameDeck = async () => {
    if (!renameDeckName.trim() || !deck.currentDeckId) return;
    
    try {
      const { error } = await supabase
        .from('user_decks')
        .update({ name: renameDeckName, updated_at: new Date().toISOString() })
        .eq('id', deck.currentDeckId);

      if (error) throw error;
      
      deck.setDeckName(renameDeckName);
      await loadAllDecks();
      setShowRenameDialog(false);
      showSuccess("Deck Renamed", `Deck renamed to "${renameDeckName}"`);
    } catch (error) {
      console.error('Error renaming deck:', error);
      showError("Error", "Failed to rename deck");
    }
  };

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

  // If loading or no deck loaded yet, show loading state
  if (loading || !deck.name) {
    return (
      <StandardPageLayout
        title="Deck Builder"
        description="Loading deck..."
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading deck...</p>
          </div>
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title={
        <div className="flex items-center gap-2">
          <span className="text-2xl md:text-3xl font-bold">{deck.name}</span>
          <Dialog open={showRenameDialog} onOpenChange={(open) => {
            setShowRenameDialog(open);
            if (open) setRenameDeckName(deck.name);
          }}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Pencil className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename Deck</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="rename-deck">New Name</Label>
                  <Input
                    id="rename-deck"
                    value={renameDeckName}
                    onChange={(e) => setRenameDeckName(e.target.value)}
                    placeholder="Enter new deck name..."
                    onKeyDown={(e) => e.key === 'Enter' && renameDeck()}
                  />
                </div>
                <Button onClick={renameDeck} className="w-full" disabled={!renameDeckName.trim()}>
                  Rename Deck
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      }
      description={`${deck.format} • ${deck.totalCards} cards`}
      action={
        <Button variant="outline" onClick={() => navigate('/decks')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span className="hidden xs:inline">Back to Decks</span>
          <span className="xs:hidden">Back</span>
        </Button>
      }
    >
      <div className="h-full flex flex-col">
          {/* Quick Stats */}
          <div className="px-4 md:px-6 py-4 border-b bg-muted/20">
            <DeckQuickStats {...deckStats} />
          </div>

          {/* EDH Power Level Banner - Commander only */}
          {deck.format === 'commander' && (
            <div className={cn(
              "px-4 md:px-6 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent",
              edhNeedsRefresh && "from-orange-500/10 to-transparent"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Target className={cn("h-5 w-5", edhNeedsRefresh ? "text-orange-500" : "text-primary")} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">EDH Power Level</p>
                      {edhNeedsRefresh && (
                        <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500 border-orange-500/30">
                          Cards Changed
                        </Badge>
                      )}
                    </div>
                    {loadingEdhPower ? (
                      <p className="text-xs text-muted-foreground">Calculating...</p>
                    ) : edhPowerLevel !== null ? (
                      <p className="text-xl font-bold">{edhPowerLevel.toFixed(2)}/10</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Click to calculate</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant={edhNeedsRefresh ? "default" : "outline"}
                    size="sm"
                    onClick={() => checkEdhPowerLevel(undefined, true)}
                    disabled={loadingEdhPower}
                    className={edhNeedsRefresh ? "bg-orange-500 hover:bg-orange-600" : ""}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", loadingEdhPower && "animate-spin")} />
                    {edhNeedsRefresh ? 'Refresh' : 'Calculate'}
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
            {/* Cards View (Visual with List toggle) */}
            {activeTab === 'cards' && (
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
                onDeleteCard={(cardId) => {
                  // Delete all copies of the card
                  const card = deck.cards.find(c => c.id === cardId);
                  if (card) {
                    deck.updateCardQuantity(cardId, 0);
                  }
                }}
                onReplaceCard={(cardId) => {
                  setCardToReplace(cardId);
                  setActiveTab('search');
                }}
              />
            )}

            {/* Add Cards */}
            {activeTab === 'search' && (
              <>
                {cardToReplace ? (
                  <Card className="p-4 mb-6 bg-orange-500/10 border-orange-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-orange-500">Replacing card</p>
                        <p className="font-bold">{deck.cards.find(c => c.id === cardToReplace)?.name}</p>
                        <p className="text-xs text-muted-foreground">Select a card below to replace it</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setCardToReplace(null)}>
                        Cancel
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-4 mb-6 bg-muted/30">
                    <p className="text-sm font-medium">Adding cards to: {deck.name}</p>
                    <p className="text-xs text-muted-foreground">Format: {deck.format} • Cards: {deck.totalCards}</p>
                  </Card>
                )}
                <EnhancedUniversalCardSearch
                  onCardAdd={(card) => {
                    if (cardToReplace) {
                      // Replace the old card with the new one
                      const oldCard = deck.cards.find(c => c.id === cardToReplace);
                      if (oldCard) {
                        deck.removeCard(cardToReplace);
                        handleAddCardToDeck(card);
                        showSuccess('Card Replaced', `Replaced ${oldCard.name} with ${card.name}`);
                        setCardToReplace(null);
                        setActiveTab('cards');
                      }
                    } else {
                      handleAddCardToDeck(card);
                    }
                  }}
                  onCardSelect={(card) => console.log('Selected:', card)}
                  placeholder={cardToReplace ? `Search for a replacement card...` : `Search cards for your ${deck.format} deck...`}
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
                {/* EDH Power Level Analysis Panel - At Top */}
                {deck.format === 'commander' && (
                  <EdhAnalysisPanel 
                    data={edhAnalysisData}
                    isLoading={loadingEdhPower}
                    onRefresh={() => checkEdhPowerLevel(selectedDeckId || deck.currentDeckId, true)}
                  />
                )}

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

            {/* AI Optimizer */}
            {activeTab === 'ai' && deck.cards.length > 0 && (
              <div className="space-y-6">
                <AIOptimizerPanel
                  deckId={selectedDeckId || deck.currentDeckId || ''}
                  deckCards={deck.cards as any}
                  deckName={deck.name}
                  format={deck.format || 'commander'}
                  commander={deck.commander}
                  powerLevel={edhPowerLevel ?? deck.powerLevel}
                  edhAnalysis={edhAnalysisData}
                  onApplyReplacements={async (replacements) => {
                    for (const { remove, add } of replacements) {
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
                    }
                    if (deck.currentDeckId) {
                      setTimeout(() => deck.updateDeck(deck.currentDeckId!), 500);
                    }
                  }}
                />
                <DeckPrimerGenerator
                  deckName={deck.name}
                  commander={deck.commander?.name}
                  cardCount={deck.totalCards}
                />
              </div>
            )}

            {activeTab === 'ai' && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to get AI optimization</p>
              </div>
            )}

            {/* Proxies */}
            {activeTab === 'proxies' && (
              <DeckProxyGenerator 
                deckCards={deck.cards as any}
                deckName={deck.name}
              />
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
    </StandardPageLayout>
  );
};

export default DeckBuilder;