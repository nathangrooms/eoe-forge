import { useState, useEffect, useMemo } from 'react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
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
  RotateCcw,
  Save,
  Brain
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';

const FORMATS = [
  { value: 'standard', label: 'Standard', description: '60-card competitive format' },
  { value: 'commander', label: 'Commander', description: '100-card singleton with commander' },
  { value: 'modern', label: 'Modern', description: 'Non-rotating competitive format' },
  { value: 'pioneer', label: 'Pioneer', description: 'Return to Ravnica onwards' },
  { value: 'legacy', label: 'Legacy', description: 'All cards except banned' },
  { value: 'vintage', label: 'Vintage', description: 'All cards, some restricted' }
];

const ARCHETYPES = {
  standard: [
    { value: 'aggro', label: 'Aggro', description: 'Fast, aggressive strategy' },
    { value: 'midrange', label: 'Midrange', description: 'Balanced creatures and spells' },
    { value: 'control', label: 'Control', description: 'Counter and removal heavy' },
    { value: 'combo', label: 'Combo', description: 'Synergistic interactions' }
  ],
  commander: [
    { value: 'voltron', label: 'Voltron', description: 'Enhance one creature' },
    { value: 'tribal', label: 'Tribal', description: 'Creature type synergies' },
    { value: 'combo', label: 'Combo', description: 'Infinite or near-infinite combos' },
    { value: 'control', label: 'Control', description: 'Counter and board wipes' },
    { value: 'group-hug', label: 'Group Hug', description: 'Help all players' },
    { value: 'stax', label: 'Stax', description: 'Resource denial' },
    { value: 'tokens', label: 'Tokens', description: 'Create many small creatures' },
    { value: 'artifacts', label: 'Artifacts', description: 'Artifact synergies' }
  ],
  modern: [
    { value: 'burn', label: 'Burn', description: 'Direct damage to opponent' },
    { value: 'infect', label: 'Infect', description: 'Poison counters strategy' },
    { value: 'tron', label: 'Tron', description: 'Big mana strategy' },
    { value: 'affinity', label: 'Affinity', description: 'Artifact cost reduction' }
  ]
};

const COLOR_COMBINATIONS = [
  { value: '', label: 'Colorless', colors: [] },
  { value: 'W', label: 'White', colors: ['W'] },
  { value: 'U', label: 'Blue', colors: ['U'] },
  { value: 'B', label: 'Black', colors: ['B'] },
  { value: 'R', label: 'Red', colors: ['R'] },
  { value: 'G', label: 'Green', colors: ['G'] },
  { value: 'WU', label: 'Azorius', colors: ['W', 'U'] },
  { value: 'UB', label: 'Dimir', colors: ['U', 'B'] },
  { value: 'BR', label: 'Rakdos', colors: ['B', 'R'] },
  { value: 'RG', label: 'Gruul', colors: ['R', 'G'] },
  { value: 'GW', label: 'Selesnya', colors: ['G', 'W'] },
  { value: 'WB', label: 'Orzhov', colors: ['W', 'B'] },
  { value: 'UR', label: 'Izzet', colors: ['U', 'R'] },
  { value: 'BG', label: 'Golgari', colors: ['B', 'G'] },
  { value: 'RW', label: 'Boros', colors: ['R', 'W'] },
  { value: 'GU', label: 'Simic', colors: ['G', 'U'] },
  { value: 'WUB', label: 'Esper', colors: ['W', 'U', 'B'] },
  { value: 'UBR', label: 'Grixis', colors: ['U', 'B', 'R'] },
  { value: 'BRG', label: 'Jund', colors: ['B', 'R', 'G'] },
  { value: 'RGW', label: 'Naya', colors: ['R', 'G', 'W'] },
  { value: 'GWU', label: 'Bant', colors: ['G', 'W', 'U'] },
  { value: 'WUBR', label: 'Chaos', colors: ['W', 'U', 'B', 'R'] },
  { value: 'UBRG', label: 'Glint', colors: ['U', 'B', 'R', 'G'] },
  { value: 'BRGW', label: 'Dune', colors: ['B', 'R', 'G', 'W'] },
  { value: 'RGWU', label: 'Ink', colors: ['R', 'G', 'W', 'U'] },
  { value: 'GWUB', label: 'Witch', colors: ['G', 'W', 'U', 'B'] },
  { value: 'WUBRG', label: 'WUBRG', colors: ['W', 'U', 'B', 'R', 'G'] }
];

export default function AIBuilder() {
  const deck = useDeckStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [commander, setCommander] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [suggestedArchetypes, setSuggestedArchetypes] = useState<any[]>([]);
  const [analyzingCommander, setAnalyzingCommander] = useState(false);
  const [buildData, setBuildData] = useState({
    format: 'commander',
    colorIdentity: '',
    archetype: '',
    powerLevel: 6,
    budget: 100,
    maxBudget: 500,
    customPrompt: '',
    includeLands: true,
    prioritizeSynergy: true,
    includeBasics: true
  });
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<any>(null);
  const [commanderSearchResults, setCommanderSearchResults] = useState<any[]>([]);
  const [searchingCommanders, setSearchingCommanders] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  
  // Commander finder state
  const [finderColors, setFinderColors] = useState<string[]>([]);
  const [finderArchetype, setFinderArchetype] = useState('');
  const [finderResults, setFinderResults] = useState<any[]>([]);
  const [searchingFinder, setSearchingFinder] = useState(false);

  
  // Search for commanders
  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setCommanderSearchResults([]);
      return;
    }

    setSearchingCommanders(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' type:legendary type:creature')}&unique=cards&order=name`
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
    }, 500);
    
    return () => clearTimeout(timer);
  }, [commanderSearch]);

  // Commander finder search
  const searchCommandersByFilters = async () => {
    if (finderColors.length === 0 && !finderArchetype) return;
    
    setSearchingFinder(true);
    try {
      let query = 't:legendary t:creature';
      
      // Add color identity filter
      if (finderColors.length > 0) {
        const colorString = finderColors.sort().join('');
        query += ` id:${colorString}`;
      }
      
      // Add archetype-based oracle text filters
      if (finderArchetype) {
        const archetypeKeywords: Record<string, string> = {
          'aggro': '(o:haste OR o:"first strike" OR o:"double strike")',
          'voltron': '(o:equipment OR o:aura OR o:attach)',
          'tribal': '(o:choose OR o:"creature type")',
          'control': '(o:counter OR o:destroy OR o:exile)',
          'combo': '(o:whenever OR o:sacrifice)',
          'tokens': '(o:token)',
          'artifacts': '(o:artifact)',
          'spellslinger': '(o:instant OR o:sorcery OR o:spell)',
          'lifegain': '(o:"gain life" OR o:lifelink)',
          'graveyard': '(o:graveyard OR o:"return from")',
          'ramp': '(o:"search your library for" OR o:"put a land")',
          'draw': '(o:"draw card" OR o:"draw a card")'
        };
        
        const keyword = archetypeKeywords[finderArchetype];
        if (keyword) {
          query += ` ${keyword}`;
        }
      }
      
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=edhrec`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setFinderResults([]);
          return;
        }
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      setFinderResults((data.data || []).slice(0, 12));
    } catch (error) {
      console.error('Commander finder search error:', error);
      setFinderResults([]);
      showError('Search Failed', 'Could not find commanders with those filters');
    } finally {
      setSearchingFinder(false);
    }
  };

  const toggleFinderColor = (color: string) => {
    setFinderColors(prev => 
      prev.includes(color) 
        ? prev.filter(c => c !== color)
        : [...prev, color]
    );
  };

  const currentArchetypes = useMemo(() => {
    return suggestedArchetypes.length > 0 ? suggestedArchetypes : (ARCHETYPES[buildData.format as keyof typeof ARCHETYPES] || ARCHETYPES.standard);
  }, [buildData.format, suggestedArchetypes]);

  const handleNext = () => {
    if (step === 1 && commander) {
      analyzeCommander(commander);
    }
    if (step < 5) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const analyzeCommander = async (selectedCommander: any) => {
    if (!selectedCommander) return;
    
    setAnalyzingCommander(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: `You are an expert Magic: The Gathering strategist and deck builder. Analyze the given commander and suggest 4-5 specific, synergistic deck archetypes that would work optimally with this commander's abilities, color identity, and strategic potential.

Commander: ${selectedCommander.name}
Color Identity: ${selectedCommander.color_identity?.join('') || 'Colorless'}
Type: ${selectedCommander.type_line}
Abilities: ${selectedCommander.oracle_text || 'No abilities specified'}

Consider these factors in your analysis:
1. **Mechanical Synergies**: How do the commander's abilities create synergistic opportunities?
2. **Color Identity**: What strategies are strongest in these colors?
3. **Mana Cost**: How does the casting cost affect viable strategies?
4. **Keywords**: How do inherent keywords (flying, trample, etc.) inform strategy?
5. **Power Level**: What competitive levels work best for this commander?

Suggest archetypes from the full spectrum of Magic strategies:
- **Creature-based**: Aggro, Tribal, Voltron, Aristocrats, Tokens, +1/+1 Counters, Reanimator
- **Spell-based**: Spellslinger, Control, Combo, Stax
- **Synergy-based**: Artifacts, Enchantments, Graveyard, Lands Matter, Blink
- **Resource-based**: Ramp, Group Hug, Lifegain

Provide EXACTLY 4-5 archetypes in this format:

1. **[Archetype Name]**
   Description: [2-3 sentence description of the strategy]
   Synergy: [Specific explanation of how this works with the commander]
   Power: [1-10 competitive rating]

Focus on archetypes that specifically leverage this commander's unique abilities and create genuine strategic advantages.`,
          cards: []
        }
      });

      if (error) throw error;

      const analysis = data?.message || '';
      const archetypes = parseArchetypeSuggestions(analysis, selectedCommander);
      setSuggestedArchetypes(archetypes);
      
      // Auto-advance to archetype selection if we got suggestions
      if (archetypes.length > 0) {
        setStep(3);
        showSuccess('Commander Analyzed', `Found ${archetypes.length} synergistic archetypes for ${selectedCommander.name}`);
      }
      
    } catch (error) {
      console.error('Commander analysis failed:', error);
      showError('Analysis Failed', 'Could not analyze commander. Using default archetypes.');
    } finally {
      setAnalyzingCommander(false);
    }
  };

  const parseArchetypeSuggestions = (analysis: string, commander: any) => {
    console.log('Parsing archetype suggestions from:', analysis);
    
    const archetypes = [];
    const lines = analysis.split('\n');
    
    let currentArchetype: any = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for numbered archetypes: "1. **Archetype Name**" or "1. Archetype Name"
      const numberedMatch = trimmed.match(/^\d+\.\s*\*\*([^*]+)\*\*|^\d+\.\s*([^:\n]+)/);
      if (numberedMatch) {
        // Save previous archetype
        if (currentArchetype) {
          archetypes.push(currentArchetype);
        }
        
        const name = (numberedMatch[1] || numberedMatch[2]).trim();
        currentArchetype = {
          value: name.toLowerCase().replace(/[\s\-]/g, '-').replace(/[^a-z0-9\-]/g, ''),
          label: name,
          description: '',
          synergy: '',
          powerLevel: 6
        };
        console.log('Found archetype:', name);
        continue;
      }
      
      // Look for description line
      if (currentArchetype && trimmed.startsWith('Description:')) {
        currentArchetype.description = trimmed.replace('Description:', '').trim();
        continue;
      }
      
      // Look for synergy line  
      if (currentArchetype && trimmed.startsWith('Synergy:')) {
        currentArchetype.synergy = trimmed.replace('Synergy:', '').trim();
        continue;
      }
      
      // Look for power level
      if (currentArchetype && trimmed.startsWith('Power:')) {
        const powerMatch = trimmed.match(/(\d+)/);
        if (powerMatch) {
          currentArchetype.powerLevel = parseInt(powerMatch[1]);
        }
        continue;
      }
      
      // Fallback: if we have an archetype and this line has content, add to description
      if (currentArchetype && trimmed && !trimmed.startsWith('**') && trimmed.length > 10) {
        if (!currentArchetype.description) {
          currentArchetype.description = trimmed;
        } else if (!currentArchetype.synergy) {
          currentArchetype.synergy = trimmed;
        }
      }
    }
    
    // Save the last archetype
    if (currentArchetype) {
      archetypes.push(currentArchetype);
    }
    
    console.log('Parsed archetypes:', archetypes);
    
    // Fallback: if parsing failed, provide strategic archetypes based on commander analysis
    if (archetypes.length === 0) {
      console.log('Parsing failed, using fallback archetypes for', commander.name);
      
      const colors = commander.color_identity || [];
      const abilities = commander.oracle_text?.toLowerCase() || '';
      const type = commander.type_line?.toLowerCase() || '';
      
      // Analyze commander characteristics to suggest appropriate archetypes
      const suggestedArchetypes = [];
      
      // Check for specific ability patterns
      if (abilities.includes('dies') || abilities.includes('sacrifice')) {
        suggestedArchetypes.push({
          value: 'aristocrats',
          label: 'Aristocrats',
          description: 'Sacrifice creatures for value and build engine synergies.',
          synergy: 'Commander benefits from creature deaths, creating value loops.',
          powerLevel: 7
        });
      }
      
      if (abilities.includes('exile') || abilities.includes('flicker') || abilities.includes('blink')) {
        suggestedArchetypes.push({
          value: 'blink',
          label: 'Blink & Flicker',
          description: 'Exile and return creatures for repeatable ETB value.',
          synergy: 'Commander triggers on exile effects while providing ETB value.',
          powerLevel: 6
        });
      }
      
      if (abilities.includes('token') || abilities.includes('create')) {
        suggestedArchetypes.push({
          value: 'tokens',
          label: 'Token Strategy',
          description: 'Generate creature tokens for wide board presence.',
          synergy: 'Tokens provide expendable resources for commander triggers.',
          powerLevel: 6
        });
      }
      
      if (abilities.includes('+1/+1') || abilities.includes('counter')) {
        suggestedArchetypes.push({
          value: 'counters',
          label: '+1/+1 Counters',
          description: 'Build +1/+1 counter synergies and grow threats.',
          synergy: 'Commander naturally accumulates counters for scaling threats.',
          powerLevel: 6
        });
      }
      
      if (abilities.includes('equipment') || abilities.includes('aura') || type.includes('knight') || type.includes('warrior')) {
        suggestedArchetypes.push({
          value: 'voltron',
          label: 'Voltron',
          description: 'Focus on commander damage with equipment and auras.',
          synergy: 'Commander becomes a major threat with protective gear.',
          powerLevel: 5
        });
      }
      
      // Color-based suggestions
      if (colors.includes('W') && colors.includes('B')) {
        suggestedArchetypes.push({
          value: 'lifegain',
          label: 'Lifegain Synergy',
          description: 'Orzhov lifegain value engine with payoffs.',
          synergy: 'White/Black provides excellent lifegain support and payoffs.',
          powerLevel: 5
        });
      }
      
      if (colors.includes('U')) {
        suggestedArchetypes.push({
          value: 'control',
          label: 'Control',
          description: 'Counter threats and control the game state.',
          synergy: 'Blue provides card draw and counterspells for protection.',
          powerLevel: 7
        });
      }
      
      if (colors.includes('R')) {
        suggestedArchetypes.push({
          value: 'aggro',
          label: 'Aggressive',
          description: 'Fast pressure with efficient threats.',
          synergy: 'Red provides haste and burn for quick victories.',
          powerLevel: 6
        });
      }
      
      if (colors.includes('G')) {
        suggestedArchetypes.push({
          value: 'ramp',
          label: 'Big Mana',
          description: 'Ramp into large threats and powerful spells.',
          synergy: 'Green ramp enables expensive commander-supporting spells.',
          powerLevel: 6
        });
      }
      
      // Default fallbacks if no specific patterns match
      if (suggestedArchetypes.length === 0) {
        suggestedArchetypes.push(
          {
            value: 'midrange',
            label: 'Midrange Value',
            description: 'Balanced approach with efficient threats and answers.',
            synergy: 'Commander provides consistent value in fair games.',
            powerLevel: 6
          },
          {
            value: 'tribal',
            label: 'Tribal Synergy',
            description: 'Focus on creature type synergies and lords.',
            synergy: 'Commander supports tribal strategies with its creature type.',
            powerLevel: 5
          }
        );
      }
      
      return suggestedArchetypes.slice(0, 5);
    }
    
    return archetypes.slice(0, 5);
  };

  const handleBuild = async () => {
    if (!commander) {
      showError('Commander Required', 'Please select a commander first');
      return;
    }
    
    setBuilding(true);
    setBuildProgress(10);
    
    try {
      setBuildProgress(20);
      
      // Use new AI-powered deck builder with MTG Brain integration
      console.log('Starting AI deck build with MTG Brain planning...');
      
      const buildCall = supabase.functions.invoke('ai-deck-builder-v2', {
        body: {
          commander: {
            id: commander.id,
            name: commander.name,
            oracle_text: commander.oracle_text || '',
            type_line: commander.type_line || '',
            color_identity: commander.color_identity || [],
            colors: commander.colors || []
          },
          archetype: buildData.archetype,
          powerLevel: buildData.powerLevel,
          useAIPlanning: buildData.prioritizeSynergy // Use AI planning for better quality
        }
      });

      setBuildProgress(40);
      
      // Give it more time for quality builds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Build timed out - try a simpler archetype')), 90000)
      );
      
      const { data, error } = await Promise.race([buildCall, timeoutPromise]) as any;

      setBuildProgress(60);

      if (error) throw error;

      // Check if we got a background task response
      if (data?.status === 'building' && data?.usePolling) {
        console.log('Build started in background, polling for completion...');
        showSuccess('Building Deck', 'Creating high-quality deck with AI guidance. This may take 30-60 seconds...');
        
        // Poll for completion (simplified - in production you'd check a status endpoint)
        await new Promise(resolve => setTimeout(resolve, 45000));
        setBuildProgress(90);
        
        showError('Build Timeout', 'Deck build is taking longer than expected. Please try again with a simpler configuration.');
        throw new Error('Background build not fully implemented yet - please use simpler configuration');
      }

      setBuildProgress(85);

      if (data?.result) {
        const result = data.result;
        
        setBuildResult({
          deckName: `${commander.name} - ${buildData.archetype}`,
          cards: result.deck || [],
          analysis: {
            power: result.analysis?.power || buildData.powerLevel,
            band: result.analysis?.power <= 3 ? 'casual' : 
                  result.analysis?.power <= 6 ? 'mid' : 
                  result.analysis?.power <= 8 ? 'high' : 'cEDH',
            subscores: result.analysis?.subscores || {},
            playability: {},
            drivers: [],
            drags: [],
            recommendations: result.changeLog || [],
            iterations: 1,
            text: data.plan?.strategy || `AI-built ${buildData.archetype} deck using MTG Brain guidance`
          },
          changelog: result.changeLog || [],
          power: result.analysis?.power || buildData.powerLevel,
          totalValue: result.deck?.reduce((sum: number, card: any) => 
            sum + (parseFloat(card.prices?.usd || '0')), 0
          ) || 0,
          cardCount: result.deck?.length || 0
        });
        
        setBuildProgress(100);
        setStep(6);
        
        const planMessage = data.plan ? 'with AI strategic planning' : 'using algorithmic optimization';
        showSuccess('Deck Built!', `Created ${buildData.archetype} deck ${planMessage}`);
      } else {
        throw new Error('Invalid response from deck builder');
      }
      
    } catch (error) {
      console.error('Deck building error:', error);
      showError('Build Failed', error instanceof Error ? error.message : 'Failed to generate deck. Please try again.');
    } finally {
      setBuilding(false);
      setBuildProgress(0);
    }
  };

  const saveDeckToDatabase = async () => {
    if (!buildResult || !commander || !user) {
      showError('Error', 'Please ensure you are logged in and have generated a deck.');
      return;
    }

    try {
      const deckName = buildResult.deckName || `AI Built - ${commander?.name || 'Commander'} Deck`;
      const commanderColors = commander?.color_identity || commander?.colors || [];
      
      // Create deck record
      const { data: deck, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: deckName,
          format: 'commander',
          colors: commanderColors,
          description: `AI-generated commander deck with ${commander.name} as commander.`,
          power_level: Math.round(buildResult.power || 6),
          is_public: false
        })
        .select()
        .single();

      if (deckError) {
        console.error('Error creating deck:', deckError);
        throw deckError;
      }

      // Add commander
      if (commander && deck) {
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
      if (deck && buildResult.cards.length > 0) {
        const cardInserts = buildResult.cards.map((card: any) => ({
          deck_id: deck.id,
          card_id: card.id,
          card_name: card.name,
          quantity: card.quantity || 1,
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

      showSuccess('Deck Saved!', `${deckName} has been saved to your collection.`);
      navigate('/decks');
    } catch (error) {
      console.error('Error saving deck:', error);
      showError('Save Failed', 'Could not save deck to database. Please try again.');
    }
  };

  const applyToDeckBuilder = async () => {
    if (!buildResult || !commander || !user) {
      showError('Error', 'Please ensure you are logged in and have generated a deck.');
      return;
    }
    
    try {
      // Clear current deck and add commander
      deck.clearDeck();
      deck.setCommander({
        id: commander.id || `commander-${Date.now()}`,
        name: commander.name,
        cmc: commander.cmc || 0,
        type_line: commander.type_line || 'Legendary Creature',
        colors: commander.colors || commander.color_identity || [],
        color_identity: commander.color_identity || [],
        oracle_text: commander.oracle_text || '',
        image_uris: commander.image_uris || {},
        prices: commander.prices || {},
        rarity: commander.rarity || 'rare',
        quantity: 1,
        category: 'commanders',
        mechanics: []
      });

      // Add all generated cards to deck
      buildResult.cards.forEach((card: any) => {
        const deckCard = {
          id: card.id || `card-${Date.now()}-${Math.random()}`,
          name: card.name,
          cmc: card.cmc || 0,
          type_line: card.type_line || '',
          colors: card.colors || [],
          color_identity: card.color_identity || [],
          oracle_text: card.oracle_text || '',
          image_uris: card.image_uris || {},
          prices: card.prices || {},
          rarity: card.rarity || 'common',
          quantity: card.quantity || 1,
          category: determineCategory(card.type_line || ''),
          mechanics: card.keywords || []
        };
        
        for (let i = 0; i < (card.quantity || 1); i++) {
          deck.addCard(deckCard);
        }
      });

      // Set deck properties
      deck.setDeckName(buildResult.deckName);
      deck.setFormat('commander');
      deck.setPowerLevel(buildResult.power || 6);

      showSuccess('Deck Applied', 'AI-generated deck has been applied to your deck builder!');
      navigate('/deck-builder');
    } catch (error) {
      console.error('Error applying deck:', error);
      showError('Apply Failed', 'Could not apply deck to builder. Please try again.');
    }
  };

  const determineCategory = (typeLine: string): any => {
    const type = typeLine.toLowerCase();
    if (type.includes('creature')) return 'creatures';
    if (type.includes('land')) return 'lands';
    if (type.includes('instant')) return 'instants';
    if (type.includes('sorcery')) return 'sorceries';
    if (type.includes('artifact')) return 'artifacts';
    if (type.includes('enchantment')) return 'enchantments';
    if (type.includes('planeswalker')) return 'planeswalkers';
    if (type.includes('battle')) return 'battles';
    return 'other';
  };

  const resetBuilder = () => {
    setStep(1);
    setBuildResult(null);
    setCommander(null);
    setCommanderSearch('');
    setSuggestedArchetypes([]);
    setBuildData({
      format: 'commander',
      colorIdentity: '',
      archetype: '',
      powerLevel: 6,
      budget: 100,
      maxBudget: 500,
      customPrompt: '',
      includeLands: true,
      prioritizeSynergy: true,
      includeBasics: true
    });
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Crown className="h-5 w-5 mr-2" />
                Choose Your Commander
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {commander ? (
                <div className="flex items-center space-x-4 p-4 bg-primary/5 rounded-lg">
                  <img 
                    src={commander.image_uris?.normal || commander.image_uris?.large || '/placeholder.svg'} 
                    alt={commander.name}
                    className="w-16 h-16 rounded object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="font-medium">{commander.name}</h3>
                    <p className="text-sm text-muted-foreground">{commander.type_line}</p>
                    <div className="flex space-x-1 mt-1">
                      {(commander.color_identity || []).map((color: string) => (
                        <div
                          key={color}
                          className="w-4 h-4 rounded-full border"
                          style={{
                            backgroundColor: {
                              W: '#fffbd5',
                              U: '#0e68ab', 
                              B: '#150b00',
                              R: '#d3202a',
                              G: '#00733e'
                            }[color] || '#ccc'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setCommander(null);
                      setSuggestedArchetypes([]);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Search for a legendary creature..."
                      value={commanderSearch}
                      onChange={(e) => setCommanderSearch(e.target.value)}
                    />
                    <Button variant="outline" disabled>
                      <Target className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {commanderSearch && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto overflow-x-hidden p-1">
                      {searchingCommanders ? (
                        <div className="col-span-full text-center text-muted-foreground py-8">
                          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                          Searching for commanders...
                        </div>
                      ) : commanderSearchResults.length > 0 ? (
                        commanderSearchResults.slice(0, 12).map((card: any) => (
                          <div
                            key={card.id}
                            className="group cursor-pointer transition-all duration-300"
                            onClick={() => {
                              setCommander(card);
                              setCommanderSearch('');
                              analyzeCommander(card);
                            }}
                          >
                            <div className="relative rounded-lg overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-xl group-hover:shadow-primary/30 transition-all transform group-hover:scale-[1.03]">
                              <img 
                                src={card.image_uris?.normal || card.image_uris?.large || '/placeholder.svg'} 
                                alt={card.name}
                                className="w-full h-auto"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                <p className="text-white text-xs font-bold truncate">{card.name}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full text-center text-muted-foreground py-8">
                          No commanders found matching "{commanderSearch}"
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div>
                    <h4 className="font-medium mb-4 text-lg flex items-center gap-2">
                      <Crown className="w-5 h-5 text-primary" />
                      Popular Commanders
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {[
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
                          oracle_text: 'Eminence — Whenever you cast a Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar Markov attacks, put a +1/+1 counter on each Vampire you control.',
                          image_uris: { normal: 'https://cards.scryfall.io/normal/front/8/d/8d94b8ec-ecda-43c8-a60e-1ba33e6a54a4.jpg' }
                        },
                        { 
                          name: 'Meren of Clan Nel Toth', 
                          colors: ['B', 'G'],
                          color_identity: ['B', 'G'],
                          type_line: 'Legendary Creature — Human Shaman',
                          cmc: 4,
                          oracle_text: 'Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card\'s converted mana cost is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.',
                          image_uris: { normal: 'https://cards.scryfall.io/normal/front/1/7/17d6703c-ad79-457b-a1b5-c2284e363085.jpg' }
                        },
                        { 
                          name: 'Karador, Ghost Chieftain', 
                          colors: ['W', 'B', 'G'],
                          color_identity: ['W', 'B', 'G'],
                          type_line: 'Legendary Creature — Centaur Spirit',
                          cmc: 8,
                          oracle_text: 'This spell costs {1} less to cast for each creature card in your graveyard.\nVigilance, trample\nOnce during each of your turns, you may cast a creature spell from your graveyard.',
                          image_uris: { normal: 'https://cards.scryfall.io/normal/front/c/7/c7eb0144-34f8-43e1-95fe-f2ca62d88e5d.jpg' }
                        },
                        { 
                          name: 'Animar, Soul of Elements', 
                          colors: ['U', 'R', 'G'],
                          color_identity: ['U', 'R', 'G'],
                          type_line: 'Legendary Creature — Elemental',
                          cmc: 3,
                          oracle_text: 'Protection from white and from black\nWhenever you cast a creature spell, put a +1/+1 counter on Animar, Soul of Elements.\nCreature spells you cast cost {1} less to cast for each +1/+1 counter on Animar.',
                          image_uris: { normal: 'https://cards.scryfall.io/normal/front/1/d/1df98d4a-0f11-4064-a113-54ab14b9b3eb.jpg' }
                        },
                         { 
                           name: 'Rhys the Redeemed', 
                           colors: ['G', 'W'],
                           color_identity: ['G', 'W'],
                           type_line: 'Legendary Creature — Elf Warrior',
                           cmc: 1,
                           oracle_text: '{2}{G/W}, {T}: Create a 1/1 green and white Elf Warrior creature token.\n{4}{G/W}{G/W}, {T}: For each creature token you control, create a token that\'s a copy of that creature.',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/5/9/59327a58-cd41-479c-81c7-31c9d3b29508.jpg' }
                         },
                         { 
                           name: 'Ezuri, Claw of Progress', 
                           colors: ['G', 'U'],
                           color_identity: ['G', 'U'],
                           type_line: 'Legendary Creature — Elf Warrior',
                           cmc: 4,
                           oracle_text: 'Whenever a creature with power 2 or less enters the battlefield under your control, you get an experience counter.\nAt the beginning of combat on your turn, put X +1/+1 counters on another target creature you control, where X is the number of experience counters you have.',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/e/f/ef1b62ff-dbb3-4500-9d64-a3047ce193ec.jpg' }
                         },
                         { 
                           name: 'The Ur-Dragon', 
                           colors: ['W', 'U', 'B', 'R', 'G'],
                           color_identity: ['W', 'U', 'B', 'R', 'G'],
                           type_line: 'Legendary Creature — Dragon Avatar',
                           cmc: 9,
                           oracle_text: 'Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/7/e/7e78b70b-0c67-4f14-8ad7-c9f8e3f59743.jpg' }
                         },
                         { 
                           name: 'Yuriko, the Tiger\'s Shadow', 
                           colors: ['U', 'B'],
                           color_identity: ['U', 'B'],
                           type_line: 'Legendary Creature — Human Ninja',
                           cmc: 2,
                           oracle_text: 'Commander ninjutsu {U}{B}\nWhenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card\'s mana value.',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/3/b/3bd81ae6-e628-447a-a36b-597e63ede295.jpg' }
                         },
                         { 
                           name: 'Nekusar, the Mindrazer', 
                           colors: ['U', 'B', 'R'],
                           color_identity: ['U', 'B', 'R'],
                           type_line: 'Legendary Creature — Zombie Wizard',
                           cmc: 5,
                           oracle_text: 'At the beginning of each player\'s draw step, that player draws an additional card.\nWhenever an opponent draws a card, Nekusar, the Mindrazer deals 1 damage to that player.',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/3/f/3f7f2417-12de-4e57-9714-d878880a1208.jpg' }
                         },
                         { 
                           name: 'Korvold, Fae-Cursed King', 
                           colors: ['B', 'R', 'G'],
                           color_identity: ['B', 'R', 'G'],
                           type_line: 'Legendary Creature — Dragon Noble',
                           cmc: 5,
                           oracle_text: 'Flying\nWhenever Korvold, Fae-Cursed King enters the battlefield or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/9/2/92ea1575-eb64-43b5-b604-c6e23054f228.jpg' }
                         },
                         { 
                           name: 'Thrasios, Triton Hero', 
                           colors: ['G', 'U'],
                           color_identity: ['G', 'U'],
                           type_line: 'Legendary Creature — Merfolk Wizard',
                           cmc: 2,
                           oracle_text: '{4}: Scry 1, then reveal the top card of your library. If it\'s a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner',
                           image_uris: { normal: 'https://cards.scryfall.io/normal/front/2/1/21a1620f-2d24-44dd-91da-6ca8f31e2c3c.jpg' }
                         }
                        ].map((popularCommander) => (
                          <div
                            key={popularCommander.name}
                            className="group cursor-pointer transition-all duration-300 hover:scale-105"
                            onClick={async () => {
                              try {
                                const response = await fetch(
                                  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(popularCommander.name)}`
                                );
                                if (response.ok) {
                                  const card = await response.json();
                                  setCommander(card);
                                  analyzeCommander(card);
                                } else {
                                  const commanderWithId = {
                                    ...popularCommander,
                                    id: popularCommander.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
                                  };
                                  setCommander(commanderWithId);
                                  analyzeCommander(commanderWithId);
                                }
                              } catch (error) {
                                console.error('Error fetching commander:', error);
                                const commanderWithId = {
                                  ...popularCommander,
                                  id: popularCommander.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
                                };
                                setCommander(commanderWithId);
                                analyzeCommander(commanderWithId);
                              }
                            }}
                          >
                            <div className="relative rounded-lg overflow-hidden border-2 border-border group-hover:border-primary group-hover:shadow-lg group-hover:shadow-primary/30 transition-all">
                              <img 
                                src={popularCommander.image_uris?.normal || '/placeholder.svg'} 
                                alt={popularCommander.name}
                                className="w-full h-auto"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                <p className="text-white text-xs font-bold truncate">{popularCommander.name}</p>
                              </div>
                            </div>
                          </div>
                       ))}
                    </div>
                  </div>

                  {/* Commander Finder Section */}
                  <div className="mt-8 p-6 border-2 border-dashed border-primary/30 rounded-xl bg-gradient-to-br from-accent/5 to-primary/5">
                    <h4 className="font-medium mb-4 text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-accent" />
                      Don't know what commander to pick?
                    </h4>
                    <p className="text-sm text-muted-foreground mb-6">
                      Filter commanders by colors and playstyle to find your perfect match
                    </p>

                    <div className="space-y-4">
                      {/* Color Selector */}
                      <div>
                        <Label className="text-sm font-medium mb-3 block">Color Identity</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { color: 'W', name: 'White', bg: 'hsl(var(--mana-white))', text: '#000' },
                            { color: 'U', name: 'Blue', bg: 'hsl(var(--mana-blue))', text: '#fff' },
                            { color: 'B', name: 'Black', bg: 'hsl(var(--mana-black))', text: '#fff' },
                            { color: 'R', name: 'Red', bg: 'hsl(var(--mana-red))', text: '#fff' },
                            { color: 'G', name: 'Green', bg: 'hsl(var(--mana-green))', text: '#fff' }
                          ].map(({ color, name, bg, text }) => (
                            <Button
                              key={color}
                              variant={finderColors.includes(color) ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => toggleFinderColor(color)}
                              className={finderColors.includes(color) ? '' : 'hover:scale-105'}
                              style={finderColors.includes(color) ? {
                                backgroundColor: bg,
                                color: text,
                                borderColor: bg
                              } : {}}
                            >
                              {name}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Archetype Selector */}
                      <div>
                        <Label className="text-sm font-medium mb-3 block">Playstyle</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { value: 'aggro', label: 'Aggro' },
                            { value: 'voltron', label: 'Voltron' },
                            { value: 'tribal', label: 'Tribal' },
                            { value: 'control', label: 'Control' },
                            { value: 'combo', label: 'Combo' },
                            { value: 'tokens', label: 'Tokens' },
                            { value: 'artifacts', label: 'Artifacts' },
                            { value: 'spellslinger', label: 'Spellslinger' },
                            { value: 'lifegain', label: 'Lifegain' },
                            { value: 'graveyard', label: 'Graveyard' },
                            { value: 'ramp', label: 'Ramp' },
                            { value: 'draw', label: 'Card Draw' }
                          ].map((archetype) => (
                            <Button
                              key={archetype.value}
                              variant={finderArchetype === archetype.value ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setFinderArchetype(archetype.value === finderArchetype ? '' : archetype.value)}
                              className="hover:scale-105 transition-transform"
                            >
                              {archetype.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Search Button */}
                      <Button
                        onClick={searchCommandersByFilters}
                        disabled={finderColors.length === 0 && !finderArchetype}
                        className="w-full bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90"
                      >
                        {searchingFinder ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                            Searching...
                          </>
                        ) : (
                          <>
                            <Target className="w-4 h-4 mr-2" />
                            Find Commanders
                          </>
                        )}
                      </Button>

                      {/* Results */}
                      {finderResults.length > 0 && (
                        <div className="mt-6">
                          <h5 className="font-medium mb-3 text-sm">Found {finderResults.length} Commanders</h5>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {finderResults.map((card) => (
                              <div
                                key={card.id}
                                className="group cursor-pointer transition-all duration-300 hover:scale-105"
                                onClick={async () => {
                                  setCommander(card);
                                  analyzeCommander(card);
                                  // Reset finder
                                  setFinderResults([]);
                                  setFinderColors([]);
                                  setFinderArchetype('');
                                }}
                              >
                                <div className="relative rounded-lg overflow-hidden border-2 border-border group-hover:border-accent group-hover:shadow-lg group-hover:shadow-accent/30 transition-all">
                                  <img 
                                    src={card.image_uris?.normal || card.image_uris?.large || '/placeholder.svg'} 
                                    alt={card.name}
                                    className="w-full h-auto"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                    <p className="text-white text-xs font-bold truncate">{card.name}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="h-5 w-5 mr-2" />
                {analyzingCommander ? 'Analyzing Commander...' : 'Commander Analysis'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analyzingCommander ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-muted-foreground">AI is analyzing {commander?.name} to find optimal archetypes...</p>
                </div>
              ) : commander ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-2">Commander Analysis Complete</h4>
                    <p className="text-sm text-muted-foreground">
                      {commander.name} has been analyzed. Based on its abilities and color identity, 
                      the AI has identified synergistic deck archetypes that work well with this commander.
                    </p>
                  </div>
                  
                  <Button 
                    onClick={() => analyzeCommander(commander)} 
                    variant="outline" 
                    className="w-full"
                    disabled={analyzingCommander}
                  >
                    <Brain className="h-4 w-4 mr-2" />
                    Re-analyze Commander
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Select a commander first to see analysis</p>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="h-5 w-5 mr-2" />
                {suggestedArchetypes.length > 0 ? 'AI-Recommended Archetypes' : 'Choose Archetype'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestedArchetypes.length > 0 && (
                <div className="p-3 bg-primary/5 rounded-lg mb-4">
                  <p className="text-sm text-primary">
                    ✨ These archetypes were specifically recommended by AI for {commander?.name}
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-1 gap-4">
                {currentArchetypes.map((archetype) => (
                  <div
                    key={archetype.value}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      buildData.archetype === archetype.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => {
                      setBuildData(prev => ({ ...prev, archetype: archetype.value }));
                      if (archetype.powerLevel) {
                        setBuildData(prev => ({ ...prev, powerLevel: archetype.powerLevel }));
                      }
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium">{archetype.label}</h3>
                      {archetype.powerLevel && (
                        <Badge variant="secondary">{archetype.powerLevel}/10</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{archetype.description}</p>
                    {archetype.synergy && (
                      <p className="text-xs text-primary/70 italic">
                        Synergy: {archetype.synergy}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Power Level & Budget
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Power Level: {buildData.powerLevel}/10</Label>
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
                  <span>Competitive</span>
                  <span>cEDH</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Per-Card Budget: ${buildData.budget}</Label>
                  <Badge variant={buildData.budget < 50 ? 'secondary' : buildData.budget < 200 ? 'default' : 'destructive'}>
                    {buildData.budget < 50 ? 'Budget ($3 max/card)' : buildData.budget < 200 ? 'Mid-Range ($15 max/card)' : 'High-End ($100 max/card)'}
                  </Badge>
                </div>
                <Slider
                  value={[buildData.budget]}
                  onValueChange={(value) => setBuildData(prev => ({ ...prev, budget: value[0] }))}
                  min={25}
                  max={2000}
                  step={25}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$25</span>
                  <span>$500</span>
                  <span>$2000+</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Filters individual card prices to stay within your total budget.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Total Deck Budget: ${buildData.maxBudget}</Label>
                  <Badge variant={buildData.maxBudget < 300 ? 'secondary' : buildData.maxBudget < 1000 ? 'default' : 'destructive'}>
                    {buildData.maxBudget < 300 ? 'Budget' : buildData.maxBudget < 1000 ? 'Mid-Range' : 'High-End'}
                  </Badge>
                </div>
                <Slider
                  value={[buildData.maxBudget]}
                  onValueChange={(value) => setBuildData(prev => ({ ...prev, maxBudget: value[0] }))}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$100</span>
                  <span>$1000</span>
                  <span>$5000+</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum total price for the entire 100-card deck. AI will replace expensive cards with budget alternatives while maintaining power.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="synergy"
                    checked={buildData.prioritizeSynergy}
                    onCheckedChange={(checked) => setBuildData(prev => ({ ...prev, prioritizeSynergy: !!checked }))}
                  />
                  <Label htmlFor="synergy">Prioritize synergy over power</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lands"
                    checked={buildData.includeLands}
                    onCheckedChange={(checked) => setBuildData(prev => ({ ...prev, includeLands: !!checked }))}
                  />
                  <Label htmlFor="lands">Include manabase</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="basics"
                    checked={buildData.includeBasics}
                    onCheckedChange={(checked) => setBuildData(prev => ({ ...prev, includeBasics: !!checked }))}
                  />
                  <Label htmlFor="basics">Include basic lands</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 5:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wand2 className="h-5 w-5 mr-2" />
                Final Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Additional Instructions (Optional)</Label>
                <Textarea
                  placeholder="e.g., Include more counterspells, avoid creatures over 4 CMC, focus on specific combos..."
                  value={buildData.customPrompt}
                  onChange={(e) => setBuildData(prev => ({ ...prev, customPrompt: e.target.value }))}
                  rows={3}
                />
              </div>
              
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Build Summary</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>Commander:</strong> {commander?.name}</p>
                  <p><strong>Colors:</strong> {commander?.color_identity?.join(', ') || 'None'}</p>
                  <p><strong>Archetype:</strong> {currentArchetypes.find(a => a.value === buildData.archetype)?.label}</p>
                  <p><strong>Power Level:</strong> {buildData.powerLevel}/10</p>
                  <p><strong>Per-Card Budget:</strong> ${buildData.budget}</p>
                  <p><strong>Total Budget:</strong> ${buildData.maxBudget}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 6:
        return buildResult && (
          <div className="space-y-6">
            <AIGeneratedDeckList
              deckName={buildResult.deckName}
              cards={buildResult.cards || []}
              commander={commander}
              power={buildResult.power}
              totalValue={buildResult.totalValue}
              analysis={buildResult.analysis}
              changelog={buildResult.changelog}
              onSaveDeck={saveDeckToDatabase}
              onApplyToDeckBuilder={applyToDeckBuilder}
              onStartOver={resetBuilder}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <StandardPageLayout
      title="AI Deck Builder"
      description="Let AI create the perfect deck for your playstyle and budget"
      action={
        step < 6 && (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`w-2 h-2 rounded-full ${
                    s <= step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              Step {step} of 5
            </span>
          </div>
        )
      }
    >
      <div className="max-w-4xl mx-auto">
        {renderStep()}

        {/* Navigation */}
        {step < 6 && (
          <div className="flex justify-between mt-6">
            <Button 
              variant="outline" 
              onClick={handlePrev}
              disabled={step === 1}
            >
              Previous
            </Button>
            
            {step === 5 ? (
              <Button 
                onClick={handleBuild}
                disabled={building || !buildData.format || !buildData.archetype}
              >
                {building ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                    Building Deck...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Build Deck
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handleNext}
                disabled={
                  (step === 1 && !buildData.format) ||
                  (step === 2 && !buildData.colorIdentity) ||
                  (step === 3 && !buildData.archetype)
                }
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        )}

        {/* Building Progress */}
        {building && (
          <Card className="mt-6">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <Sparkles className="h-12 w-12 mx-auto text-primary animate-pulse" />
                <h3 className="text-lg font-medium">Building Your Deck</h3>
                <p className="text-muted-foreground">
                  AI is analyzing thousands of cards to create the perfect deck for your specifications...
                </p>
                <Progress value={66} className="w-full" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </StandardPageLayout>
  );
}