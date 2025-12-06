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

// Build phases for progress tracking
const BUILD_PHASES = [
  { id: 'analyzing', label: 'Analyzing Commander', description: 'Understanding commander synergies' },
  { id: 'generating', label: 'Generating Deck', description: 'AI selecting optimal cards' },
  { id: 'validating-colors', label: 'Validating Colors', description: 'Checking color identity compliance' },
  { id: 'checking-edh', label: 'EDH Analysis', description: 'Fetching power level from edhpowerlevel.com' },
  { id: 'budget-check', label: 'Budget Check', description: 'Ensuring deck meets price target' },
  { id: 'optimizing', label: 'Optimizing', description: 'Final adjustments for playability' },
  { id: 'complete', label: 'Complete', description: 'Your deck is ready!' }
];

const POPULAR_COMMANDERS = [
  { 
    name: 'Atraxa, Praetors\' Voice',
    colors: ['W', 'U', 'B', 'G'],
    color_identity: ['W', 'U', 'B', 'G'],
    type_line: 'Legendary Creature — Phyrexian Angel Horror',
    cmc: 4,
    oracle_text: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg' }
  },
  { 
    name: 'Edgar Markov', 
    colors: ['W', 'B', 'R'],
    color_identity: ['W', 'B', 'R'],
    type_line: 'Legendary Creature — Vampire Knight',
    cmc: 6,
    oracle_text: 'Eminence — Whenever you cast a Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/8/d/8d94b8ec-ecda-43c8-a60e-1ba33e6a54a4.jpg' }
  },
  { 
    name: 'Korvold, Fae-Cursed King', 
    colors: ['B', 'R', 'G'],
    color_identity: ['B', 'R', 'G'],
    type_line: 'Legendary Creature — Dragon Noble',
    cmc: 5,
    oracle_text: 'Flying\nWhenever Korvold attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/9/2/92ea1575-eb64-43b5-b604-c6e23054f228.jpg' }
  },
  { 
    name: 'Yuriko, the Tiger\'s Shadow', 
    colors: ['U', 'B'],
    color_identity: ['U', 'B'],
    type_line: 'Legendary Creature — Human Ninja',
    cmc: 2,
    oracle_text: 'Commander ninjutsu {U}{B}\nWhenever a Ninja you control deals combat damage to a player, reveal the top card of your library.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/3/b/3bd81ae6-e628-447a-a36b-597e63ede295.jpg' }
  },
  { 
    name: 'The Ur-Dragon', 
    colors: ['W', 'U', 'B', 'R', 'G'],
    color_identity: ['W', 'U', 'B', 'R', 'G'],
    type_line: 'Legendary Creature — Dragon Avatar',
    cmc: 9,
    oracle_text: 'Eminence — Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/7/e/7e78b70b-0c67-4f14-8ad7-c9f8e3f59743.jpg' }
  },
  { 
    name: 'Meren of Clan Nel Toth', 
    colors: ['B', 'G'],
    color_identity: ['B', 'G'],
    type_line: 'Legendary Creature — Human Shaman',
    cmc: 4,
    oracle_text: 'Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, return target creature from graveyard.',
    image_uris: { normal: 'https://cards.scryfall.io/normal/front/1/7/17d6703c-ad79-457b-a1b5-c2284e363085.jpg' }
  }
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
  const [buildData, setBuildData] = useState({
    archetype: '',
    powerLevel: 6,
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

  // Search commanders from Scryfall
  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setCommanderSearchResults([]);
      return;
    }

    setSearchingCommanders(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' type:legendary type:creature')}&unique=cards&order=edhrec`
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
          powerLevel: buildData.powerLevel,
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
      if (edhPowerLevel && edhPowerLevel < buildData.powerLevel - 1) {
        setValidationErrors(prev => [...prev, `EDH power ${edhPowerLevel} is below target ${buildData.powerLevel}`]);
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
        power: data.result?.analysis?.power || data.power || buildData.powerLevel,
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
          power_level: Math.round(buildResult.power || 6),
          is_public: false
        })
        .select()
        .single();

      if (deckError) throw deckError;

      // Add commander
      if (commander && deckRecord) {
        await supabase.from('deck_cards').insert({
          deck_id: deckRecord.id,
          card_id: commander.id,
          card_name: commander.name,
          quantity: 1,
          is_commander: true,
          is_sideboard: false
        });
      }

      // Add deck cards
      if (deckRecord && buildResult.cards.length > 0) {
        const cardInserts = buildResult.cards.map((card: any) => ({
          deck_id: deckRecord.id,
          card_id: card.id,
          card_name: card.name,
          quantity: card.quantity || 1,
          is_commander: false,
          is_sideboard: false
        }));

        await supabase.from('deck_cards').insert(cardInserts);
      }

      navigate('/decks');
    } catch (error) {
      console.error('Error saving deck:', error);
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
      powerLevel: 6,
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

  const getPowerLevelLabel = (level: number) => {
    if (level <= 3) return { label: 'Casual', color: 'text-green-500' };
    if (level <= 5) return { label: 'Focused', color: 'text-blue-500' };
    if (level <= 7) return { label: 'Optimized', color: 'text-yellow-500' };
    if (level <= 9) return { label: 'High Power', color: 'text-orange-500' };
    return { label: 'cEDH', color: 'text-red-500' };
  };

  const getBudgetLabel = (budget: number) => {
    if (budget <= 150) return 'Budget';
    if (budget <= 500) return 'Mid-Range';
    if (budget <= 1500) return 'High-End';
    return 'Premium';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-accent">
                <Sparkles className="h-8 w-8 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  AI Deck Builder
                </h1>
                <p className="text-muted-foreground text-sm md:text-base">
                  Build the perfect Commander deck with intelligent AI assistance
                </p>
              </div>
            </div>
            
            {/* Progress indicator */}
            {step < 4 && !building && (
              <div className="hidden md:flex items-center gap-3">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium transition-all ${
                      s < step ? 'bg-primary text-primary-foreground' : 
                      s === step ? 'bg-primary/20 text-primary border-2 border-primary' : 
                      'bg-muted text-muted-foreground'
                    }`}>
                      {s < step ? <CheckCircle2 className="h-5 w-5" /> : s}
                    </div>
                    {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
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
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <img 
                        src={commander.image_uris?.normal || commander.image_uris?.art_crop || '/placeholder.svg'} 
                        alt={commander.name}
                        className="w-24 h-auto rounded-lg shadow-lg"
                      />
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{commander.name}</h3>
                        <p className="text-sm text-muted-foreground">{commander.type_line}</p>
                        <div className="flex gap-1 mt-2">
                          {(commander.color_identity || []).map((color: string) => (
                            <div
                              key={color}
                              className="w-5 h-5 rounded-full border-2 border-white shadow"
                              style={{
                                backgroundColor: {
                                  W: '#F9FAF4', U: '#0E68AB', B: '#150B00', R: '#D3202A', G: '#00733E'
                                }[color] || '#888'
                              }}
                            />
                          ))}
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
                          placeholder="Search for a legendary creature..."
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
                                <div className="relative rounded-xl overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-xl group-hover:shadow-primary/20 transition-all transform group-hover:scale-105">
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
                              <TrendingUp className="h-5 w-5 text-primary" />
                              Popular Commanders
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                              {POPULAR_COMMANDERS.map((cmdr) => (
                                <div
                                  key={cmdr.name}
                                  className="group cursor-pointer transition-all duration-300"
                                  onClick={() => selectCommander(cmdr)}
                                >
                                  <div className="relative rounded-xl overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-xl group-hover:shadow-primary/20 transition-all transform group-hover:scale-105">
                                    <img 
                                      src={cmdr.image_uris?.normal || '/placeholder.svg'} 
                                      alt={cmdr.name}
                                      className="w-full h-auto"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                      <p className="text-white text-sm font-bold truncate">{cmdr.name}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
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
              <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
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
                          powerLevel: archetype.powerLevel || prev.powerLevel 
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
                      <span className={`font-bold ${getPowerLevelLabel(buildData.powerLevel).color}`}>
                        {buildData.powerLevel}/10 - {getPowerLevelLabel(buildData.powerLevel).label}
                      </span>
                    </div>
                    <Slider
                      value={[buildData.powerLevel]}
                      onValueChange={(value) => setBuildData(prev => ({ ...prev, powerLevel: value[0] }))}
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
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
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
                        <p className="font-bold">{buildData.powerLevel}/10</p>
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
                      className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground px-8"
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
              <Card className="border-primary/30 bg-gradient-to-br from-card via-primary/5 to-accent/5">
                <CardContent className="py-12">
                  <div className="max-w-2xl mx-auto text-center space-y-8">
                    <div className="relative">
                      <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
                      <Sparkles className="h-20 w-20 mx-auto text-primary relative animate-pulse" />
                    </div>
                    
                    <div>
                      <h2 className="text-2xl font-bold mb-2">Building Your Perfect Deck</h2>
                      <p className="text-muted-foreground">
                        This may take a moment while we validate everything...
                      </p>
                    </div>
                    
                    {/* Phase Progress */}
                    <div className="space-y-4">
                      {BUILD_PHASES.map((phase, index) => (
                        <div 
                          key={phase.id}
                          className={`flex items-center gap-4 p-3 rounded-lg transition-all ${
                            index < buildPhase ? 'bg-green-500/10' :
                            index === buildPhase ? 'bg-primary/10 animate-pulse' :
                            'opacity-50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            index < buildPhase ? 'bg-green-500 text-white' :
                            index === buildPhase ? 'bg-primary text-primary-foreground' :
                            'bg-muted text-muted-foreground'
                          }`}>
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
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-yellow-600">Validation Warnings</h4>
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
                changelog={buildResult.changelog}
                onSaveDeck={saveDeckToDatabase}
                onApplyToDeckBuilder={() => navigate('/decks')}
                onStartOver={resetBuilder}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
