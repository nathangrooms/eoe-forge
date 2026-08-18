import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { useDeckStore } from '@/stores/deckStore';
import { AIGeneratedDeckList } from '@/components/deck-builder/AIGeneratedDeckList';
import { bandForScore, bandLabel, powerTextClass, scoreDeckById } from '@/lib/deck/power';
import { 
  Sparkles, 
  Crown, 
  Zap, 
  Target, 
  DollarSign,
  Wand2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Shield,
  TrendingUp,
  Coins,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { CommanderIntelligence } from '@/lib/deckbuilder/commander-intelligence';
import { motion, AnimatePresence } from 'framer-motion';
import { CommanderFinder } from '@/components/ai-builder/CommanderFinder';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

// Build phases for progress tracking - more detailed iterative process
const BUILD_PHASES = [
  { id: 'analyzing', label: 'Analyzing Commander', description: 'Understanding commander synergies and strategy' },
  { id: 'planning', label: 'AI Planning', description: 'Generating optimal card recommendations' },
  { id: 'generating', label: 'Building Deck', description: 'Selecting cards by role and synergy' },
  { id: 'validating-colors', label: 'Validating Colors', description: 'Enforcing color identity rules' },
  { id: 'checking-edh', label: 'EDH Analysis', description: 'Fetching power level from edhpowerlevel.com' },
  { id: 'budget-check', label: 'Budget Optimization', description: 'Finding cheaper alternatives if needed' },
  { id: 'refining', label: 'Iterative Refinement', description: 'Replacing weak cards with better options' },
  { id: 'final-check', label: 'Final Validation', description: 'Ensuring 100 cards and all rules met' },
  { id: 'complete', label: 'Complete', description: 'Deck list ready to review' }
];


export default function AIBuilder() {
  const deck = useDeckStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Step management
  const [step, setStep] = useState(1);
  
  // Commander state
  const [commander, setCommander] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [commanderSearchResults, setCommanderSearchResults] = useState<any[]>([]);
  const [searchingCommanders, setSearchingCommanders] = useState(false);
  
  // Archetype state
  const [suggestedArchetypes, setSuggestedArchetypes] = useState<any[]>([]);
  const [analyzingCommander, setAnalyzingCommander] = useState(false);
  
  // Build configuration
  /**
   * `targetPower` is what the player is *aiming for*, not a measurement of
   * anything. It used to be called `powerLevel`, the same identifier the app
   * used for three other things, and the slider's value was written straight
   * into `user_decks.power_level` — so a build target ended up displayed as the
   * finished deck's power level.
   */
  const [buildData, setBuildData] = useState({
    archetype: '',
    targetPower: 6,
    maxBudget: 500,
    customPrompt: '',
    includeLands: true,
    prioritizeSynergy: true,
    includeBasics: true
  });
  
  // Build state
  const [building, setBuilding] = useState(false);
  const [buildPhase, setBuildPhase] = useState(0);
  const [buildResult, setBuildResult] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loadingEdhAnalysis, setLoadingEdhAnalysis] = useState(false);

  // Popular commanders, read live from Scryfall in EDHREC order. These used to
  // be six hardcoded entries carrying paraphrased, incomplete oracle text.
  const [popularCommanders, setPopularCommanders] = useState<any[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          'https://api.scryfall.com/cards/search?q=' +
            encodeURIComponent('is:commander legal:commander') +
            '&order=edhrec&unique=cards'
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setPopularCommanders((data.data || []).slice(0, 12));
      } catch {
        if (!cancelled) setPopularCommanders([]);
      } finally {
        if (!cancelled) setPopularLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Search commanders from Scryfall
  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setCommanderSearchResults([]);
      return;
    }

    setSearchingCommanders(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' is:commander legal:commander')}&unique=cards&order=edhrec`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setCommanderSearchResults([]);
          return;
        }
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      setCommanderSearchResults(data.data || []);
    } catch (error) {
      console.error('Commander search error:', error);
      setCommanderSearchResults([]);
    } finally {
      setSearchingCommanders(false);
    }
  };

  // Debounce commander search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCommanders(commanderSearch);
    }, 400);
    return () => clearTimeout(timer);
  }, [commanderSearch]);

  // Analyze commander for archetypes using Commander Intelligence + AI
  const analyzeCommander = async (selectedCommander: any) => {
    if (!selectedCommander) return;
    
    setAnalyzingCommander(true);
    try {
      // First, use local Commander Intelligence for quick analysis
      const localAnalysis = CommanderIntelligence.detectArchetype({
        name: selectedCommander.name,
        oracle_text: selectedCommander.oracle_text || '',
        type_line: selectedCommander.type_line || '',
        color_identity: selectedCommander.color_identity || [],
        colors: selectedCommander.colors || []
      } as any);
      
      // Then enhance with AI analysis
      const { data, error } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: `Analyze commander "${selectedCommander.name}" for deck building. 
          Color Identity: ${selectedCommander.color_identity?.join('') || 'Colorless'}
          Abilities: ${selectedCommander.oracle_text || 'None'}
          
          Suggest exactly 4 specific archetypes that synergize with this commander.
          For each archetype, provide:
          1. Name
          2. Brief description (1 sentence)
          3. Why it synergizes with this commander
          4. Recommended power level (1-10)
          
          Format as JSON array: [{"name": "", "description": "", "synergy": "", "powerLevel": 6}]`,
          cards: []
        }
      });

      if (!error && data?.message) {
        try {
          const jsonMatch = data.message.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const archetypes = parsed.map((a: any) => ({
              value: a.name.toLowerCase().replace(/\s+/g, '-'),
              label: a.name,
              description: a.description,
              synergy: a.synergy,
              powerLevel: a.powerLevel || 6
            }));
            setSuggestedArchetypes(archetypes);
            setStep(2);
            return;
          }
        } catch (e) {
          console.log('Failed to parse AI archetypes, using local analysis');
        }
      }
      
      // Fallback to local analysis based archetypes
      const fallbackArchetypes = generateLocalArchetypes(selectedCommander, localAnalysis);
      setSuggestedArchetypes(fallbackArchetypes);
      setStep(2);
      
    } catch (error) {
      console.error('Commander analysis failed:', error);
      // Use local fallback
      const localAnalysis = CommanderIntelligence.detectArchetype({
        name: selectedCommander.name,
        oracle_text: selectedCommander.oracle_text || '',
        type_line: selectedCommander.type_line || '',
        color_identity: selectedCommander.color_identity || [],
        colors: selectedCommander.colors || []
      } as any);
      setSuggestedArchetypes(generateLocalArchetypes(selectedCommander, localAnalysis));
      setStep(2);
    } finally {
      setAnalyzingCommander(false);
    }
  };

  const generateLocalArchetypes = (cmdr: any, analysis: any) => {
    const text = (cmdr.oracle_text || '').toLowerCase();
    const archetypes = [];
    
    if (text.includes('token') || text.includes('create')) {
      archetypes.push({ value: 'tokens', label: 'Token Strategy', description: 'Generate creature tokens for wide board presence', synergy: 'Commander creates or benefits from tokens', powerLevel: 6 });
    }
    if (text.includes('sacrifice') || text.includes('dies')) {
      archetypes.push({ value: 'aristocrats', label: 'Aristocrats', description: 'Sacrifice creatures for value and damage', synergy: 'Commander rewards sacrifice effects', powerLevel: 7 });
    }
    if (text.includes('+1/+1') || text.includes('counter')) {
      archetypes.push({ value: 'counters', label: '+1/+1 Counters', description: 'Build and distribute counters for growing threats', synergy: 'Commander interacts with counters', powerLevel: 6 });
    }
    if (text.includes('draw') || text.includes('card')) {
      archetypes.push({ value: 'value', label: 'Value Engine', description: 'Generate card advantage through commander', synergy: 'Commander provides card draw', powerLevel: 7 });
    }
    
    // Add defaults if needed
    if (archetypes.length < 4) {
      archetypes.push({ value: 'midrange', label: 'Midrange', description: 'Balanced approach with efficient threats', synergy: 'Versatile strategy for any commander', powerLevel: 6 });
      archetypes.push({ value: 'control', label: 'Control', description: 'Counter threats and control the game', synergy: 'Protect your commander while disrupting opponents', powerLevel: 7 });
      archetypes.push({ value: 'aggro', label: 'Aggro', description: 'Fast, aggressive creature strategy', synergy: 'Pressure opponents early', powerLevel: 5 });
      archetypes.push({ value: 'combo', label: 'Combo', description: 'Build towards game-winning combinations', synergy: 'Commander enables or protects combos', powerLevel: 8 });
    }
    
    return archetypes.slice(0, 4);
  };

  // Main deck building function with full validation
  const handleBuild = async () => {
    if (!commander || !buildData.archetype) return;

    setBuilding(true);
    setBuildPhase(0);
    setValidationErrors([]);

    try {
      // Phase 1: Analyzing
      setBuildPhase(0);
      await new Promise(r => setTimeout(r, 800));
      
      // Phase 2: Generating
      setBuildPhase(1);
      
      const { data, error } = await supabase.functions.invoke('ai-deck-builder-v2', {
        body: {
          commander: {
            id: commander.id,
            name: commander.name,
            oracle_text: commander.oracle_text,
            type_line: commander.type_line,
            color_identity: commander.color_identity || [],
            colors: commander.colors || []
          },
          archetype: buildData.archetype,
          powerLevel: buildData.targetPower,
          budget: buildData.maxBudget,
          customPrompt: buildData.customPrompt,
          useAIPlanning: true,
          prioritizeSynergy: buildData.prioritizeSynergy,
          includeLands: buildData.includeLands
        }
      });

      if (error) throw error;
      if (!data) throw new Error('No data returned from builder');

      const deckCards = data.result?.deck || data.cards || [];
      
      // Phase 3: Validate color identity
      setBuildPhase(2);
      await new Promise(r => setTimeout(r, 600));
      
      const commanderColors = new Set(commander.color_identity || []);
      const colorViolations = deckCards.filter((card: any) => {
        const cardColors = card.color_identity || [];
        return cardColors.some((c: string) => !commanderColors.has(c));
      });
      
      if (colorViolations.length > 0) {
        setValidationErrors(prev => [...prev, `${colorViolations.length} cards violate color identity`]);
      }
      
      // Phase 4: EDH Power Check
      setBuildPhase(3);
      
      const { data: powerCheckData } = await supabase.functions.invoke('edh-power-check', {
        body: {
          decklist: {
            commander: commander,
            cards: deckCards
          }
        }
      });
      
      const edhPowerLevel = powerCheckData?.powerLevel;
      
      // Check if power level meets requirements (can be higher but not significantly lower)
      if (edhPowerLevel && edhPowerLevel < buildData.targetPower - 1) {
        setValidationErrors(prev => [...prev, `EDH power ${edhPowerLevel} is below target ${buildData.targetPower}`]);
      }
      
      // Phase 5: Budget check
      setBuildPhase(4);
      await new Promise(r => setTimeout(r, 600));
      
      const totalValue = deckCards.reduce((sum: number, card: any) => {
        const price = parseFloat(card.prices?.usd || '0');
        return sum + (price * (card.quantity || 1));
      }, 0);
      
      if (totalValue > buildData.maxBudget * 1.1) { // 10% tolerance
        setValidationErrors(prev => [...prev, `Deck cost $${totalValue.toFixed(0)} exceeds budget $${buildData.maxBudget}`]);
      }
      
      // Phase 6: Optimizing
      setBuildPhase(5);
      await new Promise(r => setTimeout(r, 500));
      
      // Phase 7: Complete
      setBuildPhase(6);
      
      // Build fallback EDH URL
      const fallbackEdhUrl = (() => {
        try {
          let decklistParam = '';
          if (commander) decklistParam += `1x+${encodeURIComponent(commander.name)}~`;
          deckCards.forEach((card: any) => {
            const qty = card.quantity || 1;
            decklistParam += `${qty}x+${encodeURIComponent(card.name)}~`;
          });
          if (decklistParam.endsWith('~')) decklistParam = decklistParam.slice(0, -1);
          return `https://edhpowerlevel.com/?d=${decklistParam}`;
        } catch {
          return null;
        }
      })();

      const result = {
        deckName: `${commander?.name || 'New'} ${buildData.archetype} Deck`,
        cards: deckCards,
        deckId: data.deckId,
        power: data.result?.analysis?.power || data.power || buildData.targetPower,
        edhPowerLevel: edhPowerLevel ?? null,
        edhPowerUrl: powerCheckData?.url || fallbackEdhUrl,
        totalValue: totalValue,
        analysis: data.result?.analysis || data.analysis || {},
        changelog: data.result?.changeLog || data.changelog || [],
        aiFeedback: data.result?.aiFeedback,
        validationPassed: validationErrors.length === 0
      };

      setBuildResult(result);
      setStep(4);
      
    } catch (error) {
      console.error('Build error:', error);
      setValidationErrors(['Build failed. Please try again.']);
    } finally {
      setBuilding(false);
    }
  };

  const saveDeckToDatabase = async () => {
    if (!buildResult || !commander || !user) return;

    try {
      const deckName = buildResult.deckName;
      const commanderColors = commander?.color_identity || commander?.colors || [];
      
      const { data: deckRecord, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: deckName,
          format: 'commander',
          colors: commanderColors,
          description: `AI-generated ${buildData.archetype} deck with ${commander.name}.`,
          // power_level is not written here. It used to receive
          // `Math.round(buildResult.power || 6)`, which was the server's own
          // edhpowerlevel.com scrape or — when that failed — the user's target
          // slider, saved as if it were a measurement. The real score is
          // computed from the saved list below.
          is_public: false
        })
        .select()
        .single();

      if (deckError) throw deckError;

      // Add commander - need to get proper card ID from database if not present
      let commanderId: string | undefined;
      
      if (commander && deckRecord) {
        commanderId = commander.id;
        
        // If commander doesn't have an ID (e.g., from popular commanders list), fetch it
        if (!commanderId) {
          const { data: cardData } = await supabase
            .from('cards')
            .select('id')
            .eq('name', commander.name)
            .limit(1)
            .maybeSingle();
          
          commanderId = cardData?.id;
        }
        
        if (commanderId) {
          await supabase.from('deck_cards').insert({
            deck_id: deckRecord.id,
            card_id: commanderId,
            card_name: commander.name,
            quantity: 1,
            is_commander: true,
            is_sideboard: false
          });
        } else {
          console.warn('Could not find commander ID for:', commander.name);
        }
      }

      // Add deck cards - handle duplicates manually
      if (deckRecord && buildResult.cards.length > 0) {
        // Deduplicate cards by card_id, summing quantities
        const cardMap = new Map<string, { id: string; name: string; quantity: number }>();
        
        for (const card of buildResult.cards) {
          // Skip cards without valid IDs or cards that are the commander
          if (!card.id || card.id.startsWith('missing-basic-') || card.id.startsWith('pad-')) {
            console.warn('Skipping card with invalid ID:', card.name);
            continue;
          }
          
          // Skip if this is the commander (already added)
          if (commanderId && card.id === commanderId) {
            continue;
          }
          
          const existing = cardMap.get(card.id);
          if (existing) {
            existing.quantity += card.quantity || 1;
          } else {
            cardMap.set(card.id, {
              id: card.id,
              name: card.name,
              quantity: card.quantity || 1
            });
          }
        }

        const cardInserts = Array.from(cardMap.values()).map(card => ({
          deck_id: deckRecord.id,
          card_id: card.id,
          card_name: card.name,
          quantity: card.quantity,
          is_commander: false,
          is_sideboard: false
        }));

        if (cardInserts.length > 0) {
          // Use regular insert, not upsert (no unique constraint on deck_id,card_id)
          const { error: cardsError } = await supabase
            .from('deck_cards')
            .insert(cardInserts);
          
          if (cardsError) {
            console.error('Error saving deck cards:', cardsError);
            throw cardsError;
          }
        }
      }

      /*
       * Score the deck the moment it exists, from the rows that were just
       * written. The AI builder used to display 6.28 and save 6 — the /decks
       * tile then showed a third number. All three are now this one.
       */
      if (deckRecord) {
        await scoreDeckById(deckRecord.id, 'commander');
      }

      navigate('/decks');
    } catch (error) {
      console.error('Error saving deck:', error);
    }
  };

  // Refresh EDH analysis for the generated deck
  const refreshEdhAnalysis = async () => {
    if (!buildResult || !commander) return;
    
    setLoadingEdhAnalysis(true);
    try {
      // Build decklist for EDH power check
      const deckCards = buildResult.cards || [];
      
      const { data: powerCheckData } = await supabase.functions.invoke('edh-power-check', {
        body: {
          decklist: {
            commander: commander,
            cards: deckCards
          }
        }
      });
      
      if (powerCheckData) {
        // Update build result with new EDH analysis data
        setBuildResult((prev: any) => ({
          ...prev,
          edhPowerLevel: powerCheckData.powerLevel ?? prev.edhPowerLevel,
          edhPowerUrl: powerCheckData.url || prev.edhPowerUrl,
          analysis: {
            ...prev.analysis,
            edhMetrics: powerCheckData.metrics || prev.analysis?.edhMetrics,
            bracket: powerCheckData.bracket || prev.analysis?.bracket,
            cardAnalysis: powerCheckData.cardAnalysis || prev.analysis?.cardAnalysis,
            landAnalysis: powerCheckData.landAnalysis || prev.analysis?.landAnalysis
          }
        }));
      }
    } catch (error) {
      console.error('Failed to refresh EDH analysis:', error);
    } finally {
      setLoadingEdhAnalysis(false);
    }
  };

  const resetBuilder = () => {
    setStep(1);
    setBuildResult(null);
    setCommander(null);
    setCommanderSearch('');
    setSuggestedArchetypes([]);
    setValidationErrors([]);
    setBuildData({
      archetype: '',
      targetPower: 6,
      maxBudget: 500,
      customPrompt: '',
      includeLands: true,
      prioritizeSynergy: true,
      includeBasics: true
    });
  };

  const selectCommander = async (cmdr: any) => {
    // If it's a popular commander (no ID), fetch from Scryfall
    if (!cmdr.id) {
      try {
        const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmdr.name)}`);
        if (response.ok) {
          const card = await response.json();
          setCommander(card);
          analyzeCommander(card);
          return;
        }
      } catch (e) {
        console.error('Failed to fetch commander:', e);
      }
    }
    setCommander(cmdr);
    analyzeCommander(cmdr);
  };

  /** The one band table, so the slider speaks the same language as the score. */
  const getPowerLevelLabel = (level: number) => {
    const band = bandForScore(level);
    return { label: bandLabel(band), color: powerTextClass(band) };
  };

  const getBudgetLabel = (budget: number) => {
    if (budget <= 150) return 'Budget';
    if (budget <= 500) return 'Mid-Range';
    if (budget <= 1500) return 'High-End';
    return 'Premium';
  };

  /*
   * The rail is derived from the real state machine. `setStep` is only ever
   * called with 1, 2 and 4 — the old `[1, 2, 3].map(...)` rail rendered a third
   * dot that could never light up. The three stages below are the three screens
   * the user actually passes through.
   */
  const STAGES = ['Commander', 'Configure', 'Build'] as const;
  const currentStage = building || step === 4 ? 3 : step;

  return (
    <StandardPageLayout
      title="Smart Deck Builder"
      description="Pick a commander, set your constraints, and generate a 100-card list you can edit."
      action={
        <div className="hidden items-center gap-2 md:flex">
          {STAGES.map((label, i) => {
            const n = i + 1;
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                    n < currentStage
                      ? 'bg-primary text-primary-foreground'
                      : n === currentStage
                        ? 'ring-2 ring-foreground text-foreground'
                        : 'bg-muted text-muted-foreground'
                  )}
                  aria-current={n === currentStage ? 'step' : undefined}
                >
                  {n < currentStage ? <CheckCircle2 className="h-4 w-4" /> : n}
                </span>
                <span
                  className={cn(
                    'text-xs',
                    n === currentStage ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
                {n < STAGES.length && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            );
          })}
        </div>
      }
    >
      <div className="py-2">
        <AnimatePresence mode="wait">
          {/* Step 1: Commander Selection */}
          {step === 1 && !building && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Search Section */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Crown className="h-6 w-6 text-primary" />
                    Choose Your Commander
                  </CardTitle>
                  <CardDescription>
                    Search for a legendary creature or select from popular commanders below
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Selected Commander Display */}
                  {commander && (
                    <div className="flex items-center gap-4 rounded-lg border border-border p-4">
                      <img
                        src={commander.image_uris?.normal || commander.image_uris?.art_crop || '/placeholder.svg'}
                        alt={commander.name}
                        className="w-24 h-auto rounded-lg border border-border"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{commander.name}</h3>
                        <p className="text-sm text-muted-foreground">{commander.type_line}</p>
                        <div className="mt-2">
                          <ColorIdentity colors={commander.color_identity} size="md" />
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => { setCommander(null); setSuggestedArchetypes([]); }}>
                        Change
                      </Button>
                    </div>
                  )}
                  
                  {/* Search Input */}
                  {!commander && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          placeholder="Search commanders, backgrounds and partners…"
                          value={commanderSearch}
                          onChange={(e) => setCommanderSearch(e.target.value)}
                          className="pl-10 h-12 text-lg"
                        />
                      </div>
                      
                      {/* Search Results */}
                      {commanderSearch && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                          {searchingCommanders ? (
                            <div className="col-span-full flex items-center justify-center py-12">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                          ) : commanderSearchResults.length > 0 ? (
                            commanderSearchResults.slice(0, 12).map((card: any) => (
                              <div
                                key={card.id}
                                className="group cursor-pointer transition-all duration-300"
                                onClick={() => selectCommander(card)}
                              >
                                <div className="relative rounded-lg overflow-hidden border border-border transition-colors group-hover:border-foreground">
                                  <img 
                                    src={card.image_uris?.normal || card.image_uris?.large || '/placeholder.svg'} 
                                    alt={card.name}
                                    className="w-full h-auto"
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                              No commanders found matching "{commanderSearch}"
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Popular Commanders */}
                      {!commanderSearch && (
                        <>
                          <div>
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                              <TrendingUp className="h-5 w-5 text-muted-foreground" />
                              Most played commanders
                              <span className="text-xs font-normal text-muted-foreground">by EDHREC rank</span>
                            </h3>
                            {popularLoading ? (
                              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading from Scryfall…
                              </div>
                            ) : popularCommanders.length === 0 ? (
                              <p className="py-8 text-sm text-muted-foreground">
                                Could not reach Scryfall. Search by name above instead.
                              </p>
                            ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                              {popularCommanders.map((cmdr) => (
                                <div
                                  key={cmdr.name}
                                  className="group cursor-pointer transition-all duration-300"
                                  onClick={() => selectCommander(cmdr)}
                                >
                                  <div className="relative rounded-lg overflow-hidden border border-border transition-colors group-hover:border-foreground">
                                    <img 
                                      src={cmdr.image_uris?.normal || '/placeholder.svg'} 
                                      alt={cmdr.name}
                                      className="w-full h-auto"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                      <p className="text-white text-xs font-medium truncate">{cmdr.name}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            )}
                          </div>

                          {/* Commander Finder Section */}
                          <CommanderFinder onSelectCommander={selectCommander} />
                        </>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              
              {/* Analyzing indicator */}
              {analyzingCommander && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-8 text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <h3 className="font-semibold text-lg">Analyzing {commander?.name}...</h3>
                    <p className="text-muted-foreground">Finding optimal archetypes and strategies</p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* Step 2: Archetype Selection */}
          {step === 2 && !building && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Commander summary */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <img 
                      src={commander?.image_uris?.art_crop || commander?.image_uris?.normal || '/placeholder.svg'} 
                      alt={commander?.name}
                      className="w-16 h-16 rounded-lg object-cover shadow-lg"
                    />
                    <div>
                      <h3 className="font-bold text-lg">{commander?.name}</h3>
                      <p className="text-sm text-muted-foreground">{commander?.type_line}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="ml-auto">
                      <ArrowLeft className="h-4 w-4 mr-1" /> Change Commander
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Archetype Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Target className="h-6 w-6 text-primary" />
                    Select Strategy
                  </CardTitle>
                  <CardDescription>
                    These archetypes were recommended based on {commander?.name}'s abilities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {suggestedArchetypes.map((archetype) => (
                      <div
                        key={archetype.value}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          buildData.archetype === archetype.value
                            ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }`}
                        onClick={() => setBuildData(prev => ({ 
                          ...prev, 
                          archetype: archetype.value,
                          targetPower: archetype.powerLevel || prev.targetPower 
                        }))}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-bold text-lg">{archetype.label}</h3>
                          <Badge variant="secondary">Power {archetype.powerLevel}/10</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{archetype.description}</p>
                        {archetype.synergy && (
                          <p className="text-xs text-primary/80 italic">
                            <Zap className="h-3 w-3 inline mr-1" />
                            {archetype.synergy}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Zap className="h-6 w-6 text-primary" />
                    Power & Budget
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Power Level */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Power Level</Label>
                      <span className={`font-bold ${getPowerLevelLabel(buildData.targetPower).color}`}>
                        {buildData.targetPower}/10 - {getPowerLevelLabel(buildData.targetPower).label}
                      </span>
                    </div>
                    <Slider
                      value={[buildData.targetPower]}
                      onValueChange={(value) => setBuildData(prev => ({ ...prev, targetPower: value[0] }))}
                      min={1}
                      max={10}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Casual</span>
                      <span>Focused</span>
                      <span>Optimized</span>
                      <span>cEDH</span>
                    </div>
                  </div>

                  {/* Budget */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Total Budget</Label>
                      <span className="font-bold text-primary">
                        ${buildData.maxBudget} - {getBudgetLabel(buildData.maxBudget)}
                      </span>
                    </div>
                    <Slider
                      value={[buildData.maxBudget]}
                      onValueChange={(value) => setBuildData(prev => ({ ...prev, maxBudget: value[0] }))}
                      min={50}
                      max={5000}
                      step={50}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>$50</span>
                      <span>$500</span>
                      <span>$1500</span>
                      <span>$5000</span>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="synergy"
                        checked={buildData.prioritizeSynergy}
                        onCheckedChange={(checked) => setBuildData(prev => ({ ...prev, prioritizeSynergy: !!checked }))}
                      />
                      <Label htmlFor="synergy" className="cursor-pointer">Prioritize synergy</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="lands"
                        checked={buildData.includeLands}
                        onCheckedChange={(checked) => setBuildData(prev => ({ ...prev, includeLands: !!checked }))}
                      />
                      <Label htmlFor="lands" className="cursor-pointer">Include manabase</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="basics"
                        checked={buildData.includeBasics}
                        onCheckedChange={(checked) => setBuildData(prev => ({ ...prev, includeBasics: !!checked }))}
                      />
                      <Label htmlFor="basics" className="cursor-pointer">Include basic lands</Label>
                    </div>
                  </div>

                  {/* Custom instructions */}
                  <div className="space-y-2">
                    <Label>Additional Instructions (Optional)</Label>
                    <Textarea
                      placeholder="e.g., Include more counterspells, avoid creatures over 4 CMC..."
                      value={buildData.customPrompt}
                      onChange={(e) => setBuildData(prev => ({ ...prev, customPrompt: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Build Summary & Action */}
              <Card>
                <CardContent className="py-6">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground uppercase">Commander</p>
                        <p className="font-bold">{commander?.name}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground uppercase">Strategy</p>
                        <p className="font-bold">{suggestedArchetypes.find(a => a.value === buildData.archetype)?.label || '-'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground uppercase">Power</p>
                        <p className="font-bold">{buildData.targetPower}/10</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground uppercase">Budget</p>
                        <p className="font-bold">${buildData.maxBudget}</p>
                      </div>
                    </div>
                    <Button 
                      size="lg"
                      onClick={handleBuild}
                      disabled={!buildData.archetype}
                      className="px-8"
                    >
                      <Wand2 className="h-5 w-5 mr-2" />
                      Build Deck
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Building Progress */}
          {building && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card>
                <CardContent className="py-12">
                  <div className="max-w-2xl mx-auto text-center space-y-8">
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-muted-foreground" />

                    <div>
                      <h2 className="text-xl font-semibold mb-2">
                        Building {commander?.name ? `a deck for ${commander.name}` : 'your deck'}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        Target {buildData.targetPower}/10 power, under ${buildData.maxBudget}.
                      </p>
                    </div>

                    {/* Phase Progress */}
                    <div className="space-y-2">
                      {BUILD_PHASES.map((phase, index) => (
                        <div
                          key={phase.id}
                          className={cn(
                            'flex items-center gap-4 p-3 rounded-lg transition-colors',
                            index < buildPhase ? 'bg-muted/50' :
                            index === buildPhase ? 'bg-accent' :
                            'opacity-50'
                          )}
                        >
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-medium',
                            index <= buildPhase ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}>
                            {index < buildPhase ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : index === buildPhase ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              index + 1
                            )}
                          </div>
                          <div className="text-left">
                            <p className="font-medium">{phase.label}</p>
                            <p className="text-xs text-muted-foreground">{phase.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <Progress value={(buildPhase / BUILD_PHASES.length) * 100} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 4: Results */}
          {step === 4 && buildResult && !building && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Validation Status */}
              {validationErrors.length > 0 && (
                <Card className="border-destructive/40">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-destructive">Validation warnings</h4>
                        <ul className="text-sm text-muted-foreground mt-1">
                          {validationErrors.map((err, i) => (
                            <li key={i}>• {err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <AIGeneratedDeckList
                deckName={buildResult.deckName}
                cards={buildResult.cards || []}
                commander={commander}
                power={buildResult.power}
                edhPowerLevel={buildResult.edhPowerLevel}
                edhPowerUrl={buildResult.edhPowerUrl}
                totalValue={buildResult.totalValue}
                analysis={buildResult.analysis}
                edhAnalysisData={buildResult.analysis?.edhMetrics ? {
                  metrics: buildResult.analysis.edhMetrics,
                  bracket: buildResult.analysis.bracket || null,
                  cardAnalysis: buildResult.analysis.cardAnalysis || [],
                  landAnalysis: buildResult.analysis.landAnalysis || null,
                  url: buildResult.edhPowerUrl
                } : null}
                changelog={buildResult.changelog}
                onSaveDeck={saveDeckToDatabase}
                onStartOver={resetBuilder}
                onRefreshEdhAnalysis={refreshEdhAnalysis}
                isLoadingEdhAnalysis={loadingEdhAnalysis}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StandardPageLayout>
  );
}
