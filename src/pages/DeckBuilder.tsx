import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { AIOptimizerPanel } from '@/components/deck-builder/AIOptimizerPanel';
import { QuickDeckTester } from '@/components/deck-builder/QuickDeckTester';
import { DeckPrimerGenerator } from '@/components/deck-builder/DeckPrimerGenerator';
import { DeckValidationPanel } from '@/components/deck-builder/DeckValidationPanel';
import { DeckCompatibilityChecker } from '@/components/deck-builder/DeckCompatibilityChecker';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import { MatchAnalytics } from '@/components/deck-builder/MatchAnalytics';
import { PowerScore } from '@/components/deck/PowerScore';
import { comparePower, logDivergence } from '@/lib/deck/powerCalibration';
import { EnhancedMatchTracker } from '@/components/deck-builder/EnhancedMatchTracker';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { DeckProxyGenerator } from '@/components/deck-builder/DeckProxyGenerator';
import { DeckNotesPanel } from '@/components/deck-builder/DeckNotesPanel';
import { EnhancedDeckExport } from '@/components/deck-builder/EnhancedDeckExport';
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { DeckBuilderTabs } from '@/components/deck-builder/DeckBuilderTabs';
import { EdhAnalysisPanel, EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import { VisualDeckView } from '@/components/deck-builder/VisualDeckView';
import { categorizeCard, maxCopiesFor, type CardCategory } from '@/components/deck-builder/deck-categories';
import { useCollectionOwnership } from '@/components/deck-builder/useCollectionOwnership';
import { useIsFeatureEnabled } from '@/hooks/useFeatureAccess';

import { scryfallAPI } from '@/lib/api/scryfall';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { formatLabel } from '@/lib/deck/formats';
import { Check, ExternalLink, RefreshCw, Pencil, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { deriveCardTags } from '@/lib/cards/tagger';
import {
  computeDeckPower,
  entriesFromStoreCards,
  persistDeckPower,
  type DeckPower,
} from '@/lib/deck/power';

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
  const { decks: localDecks } = useDeckManagementStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Check Optimizer feature flag
  const { isEnabled: isAiOptimizerEnabled, isLoading: aiOptimizerLoading } = useIsFeatureEnabled('ai_deck_optimizer');

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
  
  // True once this page has actually loaded a deck, so an empty `cards` array
  // means "the user deleted everything" rather than "nothing has loaded yet".
  const hasLoadedRef = useRef(false);
  const loadedForDeckRef = useRef<string | null>(null);

  // Save immediately function for critical moments
  const saveImmediately = useCallback(() => {
    const currentState = useDeckStore.getState();
    if (hasLoadedRef.current && currentState.currentDeckId && pendingSaveRef.current) {
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
    if (!deck.currentDeckId) return;

    // A different deck arriving in the store resets the "loaded" latch, so we
    // never write an empty list over a deck that simply has not loaded yet.
    if (loadedForDeckRef.current !== deck.currentDeckId) {
      if (deck.cards.length === 0) return;
      loadedForDeckRef.current = deck.currentDeckId;
      lastSavedCardsRef.current = JSON.stringify(deck.cards.map(c => ({ id: c.id, qty: c.quantity })));
      hasLoadedRef.current = true;
      return;
    }

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

    // The single debounced save path for the page. `handleAddCardToDeck` used
    // to run a second timer on a window global; this effect covers it because
    // adding a card changes `deck.cards`. Deleting the last card is a real
    // change too, so an empty list is persisted rather than silently skipped.
    saveTimeoutRef.current = setTimeout(() => {
      const currentState = useDeckStore.getState();
      if (currentState.currentDeckId) {
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
    if (deck.cards.length > 0 && deck.format === 'commander' && edhCardsHash) {
      const currentHash = generateCardsHash(deck.cards);
      if (currentHash !== edhCardsHash) {
        setEdhNeedsRefresh(true);
      }
    }
  }, [deck.cards, edhCardsHash]);
  
  // Load cached EDH analysis when deck cards are loaded
  const hasFetchedEdhRef = useRef<string | null>(null);
  useEffect(() => {
    const deckId = selectedDeckId || deck.currentDeckId;
    if (deck.cards.length > 0 && deck.format === 'commander' && deckId && hasFetchedEdhRef.current !== deckId) {
      hasFetchedEdhRef.current = deckId;
      loadCachedEdhAnalysis(deckId);
    }
  }, [deck.cards.length, deck.format, selectedDeckId, deck.currentDeckId]);

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
        // EDH analysis will be loaded by the useEffect when cards are ready
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

  /**
   * Adds a card, enforcing the two rules the builder previously ignored:
   * the format's copy limit, and the commander's colour identity.
   * Returns false when the add was refused.
   */
  const handleAddCardToDeck = (card: any): boolean => {
    if (!deck.name) {
      showError('No active deck', 'Open a deck from the deck list first.');
      return false;
    }

    const format = deck.format || 'commander';

    // Colour identity: a Commander deck may only contain cards inside the
    // commander's identity. Refuse at add time instead of surfacing it two
    // tabs away in the Analysis panel.
    const commanderIdentity: string[] =
      (deck.commander as any)?.color_identity || (deck.commander as any)?.colors || [];
    if (format === 'commander' && deck.commander && commanderIdentity.length >= 0) {
      const cardIdentity: string[] = card.color_identity || card.colors || [];
      const offending = cardIdentity.filter((c: string) => !commanderIdentity.includes(c));
      if (offending.length > 0) {
        showError(
          'Outside colour identity',
          `${card.name} is ${offending.join('')}, which ${deck.commander.name} cannot support.`
        );
        return false;
      }
    }

    const existing = deck.cards.find(c => c.id === card.id);
    const limit = maxCopiesFor(format, card);
    if (existing && (existing.quantity || 1) + 1 > limit) {
      showError(
        'Copy limit',
        `${card.name} is capped at ${limit} cop${limit === 1 ? 'y' : 'ies'} in ${format}.`
      );
      return false;
    }

    deck.addCard({
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.colors || [],
      color_identity: card.color_identity || card.colors || [],
      oracle_text: card.oracle_text,
      rarity: card.rarity,
      set: card.set,
      set_name: card.set_name,
      mana_cost: card.mana_cost,
      quantity: 1,
      category: categorizeCard(card),
      mechanics: card.keywords || [],
      // Search rows carry `tags`; a Scryfall-shaped card does not, and the
      // tagger derives the identical set from the oracle text.
      tags: card.tags?.length ? card.tags : deriveCardTags(card),
      image_uris: card.image_uris,
      prices: card.prices,
    });

    // Persisting is handled by the single debounced auto-save effect above.
    showSuccess('Card added', `${card.name} → ${deck.name}`);
    return true;
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
          setEdhMetrics(metrics);
          // Logged whether or not they agree: a calibration check nobody
          // records says nothing about whether the two models track each other.
          logDivergence(
            listCommander?.name ?? 'deck',
            comparePower(power?.score ?? 0, liveLevel)
          );
          
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

  // Load cached EDH analysis from database (no API call)
  const loadCachedEdhAnalysis = async (deckId: string) => {
    try {
      const { data: deckData } = await supabase
        .from('user_decks')
        .select('edh_analysis, edh_cards_hash, edh_analysis_updated_at')
        .eq('id', deckId)
        .single();
      
      if (deckData?.edh_analysis) {
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
        setEdhCardsHash(deckData.edh_cards_hash || '');
        
        // Check if current deck cards hash differs from cached - needs refresh
        const currentHash = generateCardsHash(deck.cards);
        if (deckData.edh_cards_hash && currentHash !== deckData.edh_cards_hash) {
          setEdhNeedsRefresh(true);
        } else {
          setEdhNeedsRefresh(false);
        }
      } else {
        // No cached analysis - needs initial fetch
        setEdhNeedsRefresh(true);
      }
    } catch (error) {
      console.error('Error loading cached EDH analysis:', error);
    }
  };

  const loadDeck = async (deckData: Deck) => {
    try {
      const result = await deck.loadDeck(deckData.id);
      
      if (result.success) {
        deck.setCurrentDeckId(deckData.id);
        setSelectedDeckId(deckData.id);
        // EDH analysis will be loaded by the useEffect when cards are ready
        
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

  // Owned/missing measured against the real collection rather than the
  // hardcoded `ownedPct: 100` this page used to report for every deck.
  const { ownership, loading: ownershipLoading } = useCollectionOwnership(
    deck.cards as any[],
    user?.id
  );

  /**
   * The canonical EDH power score for the open deck.
   *
   * This is the number the tile, the deck page, the dashboard and the analysis
   * view all show. The edhpowerlevel.com figure below is kept, but as a clearly
   * labelled second opinion — it is a screen-scrape through a third-party
   * renderer that can fail, and it was never a field the rest of the app could
   * agree with.
   */
  const powerEntries = useMemo(
    () => entriesFromStoreCards(deck.cards as any[], deck.commander as any),
    [deck.cards, deck.commander]
  );

  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(powerEntries, { format: deck.format || 'commander' }),
    [powerEntries, deck.format]
  );

  // Persisted on a delay so a burst of card adds writes once, not once per card.
  const powerPersistRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const deckId = selectedDeckId || deck.currentDeckId;
    if (!power || !deckId) return;
    if (powerPersistRef.current) clearTimeout(powerPersistRef.current);
    powerPersistRef.current = setTimeout(() => {
      void persistDeckPower(deckId, power);
    }, 1500);
    return () => {
      if (powerPersistRef.current) clearTimeout(powerPersistRef.current);
    };
  }, [power, selectedDeckId, deck.currentDeckId]);

  const deckStats = useMemo(() => {
    /*
     * The commander counts. It is held in its own store field, so this used to
     * average and price the ninety-nine only — the deck page, which reads every
     * non-sideboard row, therefore printed a different "Avg MV" and a different
     * "Est. value" for the same deck one click away.
     */
    const cards = [
      ...(deck.cards as any[]),
      ...(deck.commander
        ? [{ ...(deck.commander as any), quantity: 1, is_commander: true }]
        : []),
    ];
    const typeCounts: Partial<Record<CardCategory, number>> = {};
    let totalCmc = 0;
    let nonLandCount = 0;
    let totalValue = 0;

    cards.forEach(card => {
      const qty = card.quantity || 1;
      const category = categorizeCard(card);
      typeCounts[category] = (typeCounts[category] ?? 0) + qty;

      if (category !== 'lands') {
        totalCmc += (card.cmc || 0) * qty;
        nonLandCount += qty;
      }

      const price = parseFloat(card.prices?.usd || '0') || 0;
      totalValue += price * qty;
    });

    return {
      totalCards: deck.totalCards,
      typeCounts,
      avgCmc: nonLandCount > 0 ? totalCmc / nonLandCount : 0,
      totalValue,
      format: deck.format || 'commander',
      commanderName: deck.commander?.name,
      colors: (deck.commander as any)?.color_identity || deck.colors || [],
      ownedPct: ownership ? ownership.ownedPct : null,
      missingCards: ownership ? ownership.missingCopies : null,
      ownershipLoading,
    };
  }, [deck.cards, deck.totalCards, deck.format, deck.commander, deck.colors, ownership, ownershipLoading]);

  /**
   * The count every readout on this page uses.
   *
   * `deck.totalCards` counts the ninety-nine — the commander is held in its own
   * store field — so the page header printed "99 cards" directly above a stat
   * tile reading "100 / 100".
   */
  const displayedCardCount =
    deck.format === 'commander' && deck.commander ? deck.totalCards + 1 : deck.totalCards;

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
        /* Renaming happens in place. Design law 3 rules out the centred dialog
           that used to dim the whole builder to edit one text field. */
        showRenameDialog ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="rename-deck" className="sr-only">
              Deck name
            </Label>
            <Input
              id="rename-deck"
              autoFocus
              value={renameDeckName}
              onChange={(e) => setRenameDeckName(e.target.value)}
              placeholder="Deck name…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') renameDeck();
                if (e.key === 'Escape') setShowRenameDialog(false);
              }}
              className="h-11 max-w-md border-0 bg-muted/50 text-xl font-bold shadow-none focus-visible:ring-1 focus-visible:ring-offset-0 md:text-2xl"
            />
            <Button size="sm" onClick={renameDeck} disabled={!renameDeckName.trim()}>
              <Check className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Save</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-2xl md:text-3xl font-bold">{deck.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Rename deck"
              onClick={() => {
                setRenameDeckName(deck.name);
                setShowRenameDialog(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )
      }
      // The same count the strip below prints. This read `deck.totalCards`,
      // which excludes the commander, so the header said "99 cards" forty
      // pixels above a tile reading "100 / 100".
      description={`${formatLabel(deck.format)} • ${displayedCardCount} cards`}
      action={
        /* Named destination, not a direction: back and forward belong to the
           top nav only, so nothing on a page is labelled "Back". */
        <Button variant="outline" onClick={() => navigate('/decks')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span className="hidden xs:inline">All decks</span>
          <span className="xs:hidden">Decks</span>
        </Button>
      }
    >
      <div className="h-full flex flex-col">
          {/* The deck's power score, first. It is the owner's primary number,
              recomputed from the list as it is edited, and it now sits above
              the stat strip rather than below a scraped third-party figure. */}
          {deck.format === 'commander' && (
            <div className="px-4 md:px-6 pt-4">
              <PowerScore power={power} variant="compact" />
            </div>
          )}

          {/* Quick Stats. Surface tint separates it, not a rule — `border-b`
              drew exactly the hairline design law 2 rules out. */}
          <div className="px-4 md:px-6 py-4">
            <DeckQuickStats {...deckStats} />
          </div>

          {/* edhpowerlevel.com — a labelled second opinion, never the same
              field as the score above, and never in the power colour. Its
              sub-metrics belong to it and are read on its own scales. */}
          {deck.format === 'commander' && (
            <div className="px-4 md:px-6 pb-3">
              <div className="rounded-lg bg-muted/30 p-3 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-medium whitespace-nowrap">edhpowerlevel.com says</p>
                    {loadingEdhPower ? (
                      <p className="text-lg font-semibold text-muted-foreground">…</p>
                    ) : edhPowerLevel !== null ? (
                      <p className="text-lg font-semibold tabular-nums">{edhPowerLevel.toFixed(1)}/10</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not checked</p>
                    )}
                    {edhNeedsRefresh && (
                      <Badge variant="secondary" className="text-[10px]">
                        Cards changed since this check
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant={edhNeedsRefresh ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => checkEdhPowerLevel(undefined, true)}
                      disabled={loadingEdhPower}
                    >
                      <RefreshCw className={cn('h-4 w-4 mr-1', loadingEdhPower && 'animate-spin')} />
                      <span className="hidden xs:inline">{edhNeedsRefresh ? 'Refresh' : 'Calculate'}</span>
                    </Button>
                    {edhPowerUrl && (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={edhPowerUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          <span className="hidden xs:inline ml-1">Details</span>
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {/* The calibration reading. Ours is computed from your actual
                    decklist and mana base; theirs is parsed out of their
                    rendered page. When they disagree by enough to act on, say
                    so, and say which way. Never quietly replace ours. */}
                {(() => {
                  if (!power || edhPowerLevel === null) return null;
                  const comparison = comparePower(power.score, edhPowerLevel);
                  if (!comparison.worthShowing || !comparison.note) return null;
                  return (
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">
                      {comparison.note}
                    </p>
                  );
                })()}

                {edhMetrics && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
                    {(
                      [
                        ['Tipping point', edhMetrics.tippingPoint, (v: number) => String(v)],
                        ['Efficiency', edhMetrics.efficiency, (v: number) => `${v.toFixed(1)}/10`],
                        ['Impact', edhMetrics.impact, (v: number) => v.toFixed(0)],
                        ['Score', edhMetrics.score, (v: number) => `${v}/1000`],
                        ['Playability', edhMetrics.playability, (v: number) => `${v}%`],
                      ] as Array<[string, number | null, (v: number) => string]>
                    ).map(([label, value, fmt]) => (
                      <div key={label}>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="text-sm font-semibold tabular-nums">
                          {value !== null && value !== undefined ? fmt(value) : '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          )}

          {/* Tabs Navigation */}
          <DeckBuilderTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            totalCards={deck.totalCards}
            format={deck.format || 'commander'}
            hasCommander={!!deck.commander}
            hiddenTabs={aiOptimizerLoading || !isAiOptimizerEnabled ? ['ai'] : []}
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
                onUpdateQuantity={(cardId, quantity) => {
                  deck.updateCardQuantity(cardId, Math.max(0, quantity));
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
                  <Card className="p-4 mb-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Replacing
                        </p>
                        <p className="font-semibold">{deck.cards.find(c => c.id === cardToReplace)?.name}</p>
                        <p className="text-xs text-muted-foreground">Pick a card below to swap it in.</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setCardToReplace(null)}>
                        Cancel
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-4 mb-6">
                    <p className="text-sm font-medium">Adding cards to {deck.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {deck.format} • {deck.totalCards} cards
                      {deck.commander ? ` • colour identity of ${deck.commander.name}` : ''}
                    </p>
                  </Card>
                )}
                {/*
                  PICKING, not browsing. You are here to put cards in a deck,
                  and when `cardToReplace` is set you are halfway through
                  swapping one out. A click that navigated to the card page
                  would abandon that swap with the old card still in the deck.
                  So the card body adds the card and the page stays put; the eye
                  on each card opens its page. Same rule as the storage picker,
                  written the same way on purpose. Do not "fix" it back.
                */}
                <EnhancedUniversalCardSearch
                  mode="pick"
                  onCardAdd={(card) => {
                    if (cardToReplace) {
                      const oldCard = deck.cards.find(c => c.id === cardToReplace);
                      if (oldCard) {
                        // Only drop the old card once the new one is accepted —
                        // a colour-identity or copy-limit refusal must not
                        // silently delete the card being replaced.
                        if (handleAddCardToDeck(card)) {
                          deck.removeCard(cardToReplace);
                          showSuccess('Card replaced', `${oldCard.name} → ${card.name}`);
                          setCardToReplace(null);
                          setActiveTab('cards');
                        }
                      }
                    } else {
                      handleAddCardToDeck(card);
                    }
                  }}
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
                {/* The canonical score first, with its explanation. Everything
                    below is either a different question (legality, budget) or a
                    clearly labelled second opinion. */}
                {deck.format === 'commander' && (
                  <PowerScore power={power} variant="expanded" />
                )}

                {deck.format === 'commander' && power && (
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <CommanderPowerDisplay
                      power={power}
                      commanderName={deck.commander?.name}
                    />
                    <PowerSliderCoaching
                      power={power}
                      entries={powerEntries}
                      format={deck.format || 'commander'}
                    />
                  </div>
                )}

                <LandEnhancerUX
                  entries={powerEntries}
                  power={power}
                  identity={(deck.commander as any)?.color_identity ?? deck.colors}
                />

                {/* Second opinion, kept and labelled as such. */}
                {deck.format === 'commander' && (
                  <EdhAnalysisPanel 
                    data={edhAnalysisData}
                    isLoading={loadingEdhPower}
                    needsRefresh={edhNeedsRefresh}
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
                <ArchetypeDetection 
                  deckCards={deck.cards as any}
                  commander={deck.commander}
                  format={deck.format || 'standard'}
                />
                <DeckBudgetTracker
                  deckCards={deck.cards as any}
                  targetBudget={200}
                />
                <EnhancedDeckAnalysisPanel
                  deck={deck.cards as any}
                  format={deck.format || 'standard'}
                  commander={deck.commander}
                  deckId={selectedDeckId || deck.currentDeckId || undefined}
                  deckName={deck.name}
                />

                {/* Match history and notes are records, not analysis.
                    Separated by space, not a rule — design law 2. */}
                {deck.currentDeckId && (
                  <div className="space-y-6 pt-4">
                    <EnhancedMatchTracker deckId={deck.currentDeckId} deckName={deck.name} />
                    {/* The tracker records games; this reads them back. Same
                        rows, two different jobs. */}
                    <MatchAnalytics deckId={deck.currentDeckId} deckName={deck.name} />
                    <DeckNotesPanel deckId={deck.currentDeckId} />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analysis' && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to see analysis</p>
                <p className="text-sm">Curve, colour identity, legality and budget all read from the decklist.</p>
              </div>
            )}

            {/* Optimizer — the tab is hidden entirely when its flag is off, so
                there is no "check back soon" panel to land on. */}
            {activeTab === 'ai' && isAiOptimizerEnabled && deck.cards.length > 0 && (
              <div className="space-y-6">
                <AIOptimizerPanel
                  deckId={selectedDeckId || deck.currentDeckId || ''}
                  deckCards={deck.cards as any}
                  deckName={deck.name}
                  format={deck.format || 'commander'}
                  commander={deck.commander}
                  power={power}
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
                  onAddCard={async (cardName) => {
                    try {
                      const newCard = await scryfallAPI.getCardByName(cardName);
                      handleAddCardToDeck(newCard);
                      if (deck.currentDeckId) {
                        setTimeout(() => deck.updateDeck(deck.currentDeckId!), 500);
                      }
                    } catch (error) {
                      console.error(`Failed to add ${cardName}:`, error);
                      showError(`Failed to add ${cardName}`);
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

            {activeTab === 'ai' && isAiOptimizerEnabled && deck.cards.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">Add cards to get optimization suggestions</p>
              </div>
            )}

            {/* Proxies */}
            {activeTab === 'proxies' && (
              <DeckProxyGenerator 
                deckCards={deck.cards as any}
                deckName={deck.name}
                commander={deck.commander}
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

            {/* Playtest. `deck.cards` goes through whole rather than being
                remapped to five scalar fields — the old mapping dropped
                `image_uris`, so every card in the test hand rendered as a grey
                name box and the tester never received any art to show. */}
            {activeTab === 'test' && deck.cards.length > 0 && (
              <QuickDeckTester deck={deck.cards} />
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