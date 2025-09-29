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
      
      const { data, error } = await supabase.functions.invoke('ai-deck-builder', {
        body: {
          format: 'commander',
          commander: commander,
          colors: commander.color_identity || [],
          identity: commander.color_identity || [],
          themeId: buildData.archetype,
          powerTarget: buildData.powerLevel,
          budget: buildData.budget < 50 ? 'low' : buildData.budget < 200 ? 'med' : 'high',
          customInstructions: buildData.customPrompt,
          seed: Math.floor(Math.random() * 10000)
        }
      });

      setBuildProgress(80);

      if (error) throw error;

      if (data?.success) {
        setBuildResult({
          deckName: `${commander.name} ${buildData.archetype} Deck`,
          cards: data.deck || [],
          analysis: data.analysis || {},
          changelog: data.changelog || []
        });
        setStep(6);
        showSuccess('Deck Generated', `AI has created your optimized ${commander.name} deck!`);
      } else {
        throw new Error(data?.error || 'Failed to build deck');
      }
      
    } catch (error) {
      console.error('Deck building error:', error);
      showError('Build Failed', error instanceof Error ? error.message : 'Failed to generate deck. Please try again.');
    } finally {
      setBuilding(false);
      setBuildProgress(0);
    }
  };

  const applyToDeck = () => {
    if (!buildResult) return;
    
    // Clear current deck
    deck.cards.forEach(card => deck.removeCard(card.id));
    
    // Add generated cards
    buildResult.cards.forEach((card: any) => {
      for (let i = 0; i < card.quantity; i++) {
        deck.addCard({
          id: Math.random().toString(),
          name: card.name,
          cmc: 1, // Mock value
          type_line: 'Instant', // Mock value
          colors: ['R'], // Mock value
          quantity: 1,
          category: 'instants',
          mechanics: []
        });
      }
    });
    
    deck.setFormat(buildData.format as any);
    showSuccess('Deck Applied', 'Generated deck has been applied to your deck builder!');
  };

  const restart = () => {
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                      {searchingCommanders ? (
                        <div className="col-span-full text-center text-muted-foreground py-8">
                          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                          Searching for commanders...
                        </div>
                      ) : commanderSearchResults.length > 0 ? (
                        commanderSearchResults.slice(0, 12).map((card: any) => (
                          <div
                            key={card.id}
                            className="p-3 rounded border hover:border-primary/50 cursor-pointer transition-all flex items-center space-x-3"
                            onClick={() => {
                              setCommander(card);
                              setCommanderSearch('');
                              analyzeCommander(card);
                            }}
                          >
                            <img 
                              src={card.image_uris?.small || card.image_uris?.normal || '/placeholder.svg'} 
                              alt={card.name}
                              className="w-12 h-12 rounded object-cover"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{card.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                              <div className="flex space-x-1 mt-1">
                                {(card.color_identity || []).map((color: string) => (
                                  <div
                                    key={color}
                                    className="w-3 h-3 rounded-full border"
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
                    <h4 className="font-medium mb-3">Popular Commanders</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { 
                          name: 'Syr Vondam, Sunstar Exemplar', 
                          colors: ['W', 'B'],
                          oracle_text: 'Vigilance, menace\nWhenever another creature you control dies or is put into exile, put a +1/+1 counter on Syr Vondam and you gain 1 life.\nWhen Syr Vondam dies or is put into exile while its power is 4 or greater, destroy up to one target nonland permanent.'
                        },
                        { 
                          name: 'Atraxa, Praetors\' Voice', 
                          colors: ['W', 'U', 'B', 'G'],
                          oracle_text: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.'
                        },
                        { 
                          name: 'Edgar Markov', 
                          colors: ['W', 'B', 'R'],
                          oracle_text: 'Eminence — Whenever you cast a Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nFirst strike, haste\nWhenever Edgar Markov attacks, put a +1/+1 counter on each Vampire you control.'
                        },
                        { 
                          name: 'Meren of Clan Nel Toth', 
                          colors: ['B', 'G'],
                          oracle_text: 'Whenever another creature you control dies, you get an experience counter.\nAt the beginning of your end step, choose target creature card in your graveyard. If that card\'s converted mana cost is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.'
                        },
                        { 
                          name: 'Rhys the Redeemed', 
                          colors: ['G', 'W'],
                          oracle_text: '{2}{G/W}, {T}: Create a 1/1 green and white Elf Warrior creature token.\n{4}{G/W}{G/W}, {T}: For each creature token you control, create a token that\'s a copy of that creature.'
                        },
                        { 
                          name: 'Ezuri, Claw of Progress', 
                          colors: ['G', 'U'],
                          oracle_text: 'Whenever a creature with power 2 or less enters the battlefield under your control, you get an experience counter.\nAt the beginning of combat on your turn, put X +1/+1 counters on another target creature you control, where X is the number of experience counters you have.'
                        }
                      ].map((popularCommander) => (
                        <div
                          key={popularCommander.name}
                          className="p-3 rounded border hover:border-primary/50 cursor-pointer transition-all"
                          onClick={() => {
                            const mockCommander = {
                              name: popularCommander.name,
                              color_identity: popularCommander.colors,
                              type_line: 'Legendary Creature',
                              oracle_text: popularCommander.oracle_text || 'Mock commander for demo',
                              image_uris: { normal: '/placeholder.svg' }
                            };
                            setCommander(mockCommander);
                            analyzeCommander(mockCommander);
                          }}
                        >
                          <div className="flex items-center space-x-2">
                            <div className="flex space-x-1">
                              {popularCommander.colors.map(color => (
                                <div
                                  key={color}
                                  className="w-3 h-3 rounded-full border"
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
                            <span className="text-sm font-medium">{popularCommander.name}</span>
                          </div>
                        </div>
                      ))}
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
                <Label>Budget: ${buildData.budget}</Label>
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
                  <p><strong>Budget:</strong> ${buildData.budget}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 6:
        return buildResult && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Sparkles className="h-5 w-5 mr-2" />
                  {buildResult.deckName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{buildResult.analysis.powerScore}/10</div>
                    <div className="text-sm text-muted-foreground">Power Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">${buildResult.analysis.estimatedPrice}</div>
                    <div className="text-sm text-muted-foreground">Est. Price</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{buildResult.cards.length}</div>
                    <div className="text-sm text-muted-foreground">Unique Cards</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="cards" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cards">Cards</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="changelog">Changelog</TabsTrigger>
              </TabsList>

              <TabsContent value="cards" className="space-y-3">
                {buildResult.cards.map((card: any, index: number) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{card.quantity}x {card.name}</h4>
                          <p className="text-sm text-muted-foreground">{card.reason}</p>
                        </div>
                        <Badge variant="outline">{card.quantity}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Strengths</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {buildResult.analysis.strengths.map((strength: string, index: number) => (
                        <li key={index} className="text-sm">• {strength}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Weaknesses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {buildResult.analysis.weaknesses.map((weakness: string, index: number) => (
                        <li key={index} className="text-sm">• {weakness}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {buildResult.analysis.suggestions.map((suggestion: string, index: number) => (
                        <li key={index} className="text-sm">• {suggestion}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="changelog" className="space-y-2">
                {buildResult.changelog.map((change: string, index: number) => (
                  <div key={index} className="p-2 bg-muted/50 rounded text-sm font-mono">
                    {change}
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            <div className="flex gap-2">
              <Button onClick={applyToDeck} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Apply to Deck Builder
              </Button>
              <Button variant="outline" onClick={restart}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Build Another
              </Button>
            </div>
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