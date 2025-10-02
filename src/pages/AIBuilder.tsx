import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { AIGeneratedDeckList } from '@/components/deck-builder/AIGeneratedDeckList';
import { CardRecommendationDisplay, CardData } from '@/components/shared/CardRecommendationDisplay';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { 
  Sparkles, 
  Crown, 
  ArrowRight,
  ArrowLeft,
  Save,
  CheckCircle2,
  Search,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';

// Commander Archetypes with color associations
const COMMANDER_ARCHETYPES = [
  { value: 'voltron', label: 'Voltron', description: 'Build one powerful threat', colors: ['W', 'U', 'R'] },
  { value: 'tribal', label: 'Tribal', description: 'Creature type synergies', colors: ['W', 'G'] },
  { value: 'combo', label: 'Combo', description: 'Infinite combos', colors: ['U', 'B', 'R'] },
  { value: 'control', label: 'Control', description: 'Counter everything', colors: ['U', 'W', 'B'] },
  { value: 'tokens', label: 'Tokens', description: 'Go wide with creatures', colors: ['W', 'G'] },
  { value: 'artifacts', label: 'Artifacts', description: 'Artifact synergies', colors: ['U', 'R'] },
  { value: 'aristocrats', label: 'Aristocrats', description: 'Sacrifice for value', colors: ['B', 'W'] },
  { value: 'reanimator', label: 'Reanimator', description: 'Graveyard recursion', colors: ['B', 'G'] },
  { value: 'landfall', label: 'Landfall', description: 'Lands matter', colors: ['G', 'R', 'W'] },
  { value: 'spellslinger', label: 'Spellslinger', description: 'Cast lots of spells', colors: ['U', 'R'] },
  { value: 'stax', label: 'Stax', description: 'Resource denial', colors: ['W', 'B'] },
  { value: 'group-hug', label: 'Group Hug', description: 'Help everyone', colors: ['G', 'U'] }
];

const COLOR_MAP: Record<string, string> = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green'
};

const ColorDot = ({ color }: { color: string }) => {
  const colorClasses: Record<string, string> = {
    W: 'bg-yellow-200 border-yellow-400',
    U: 'bg-blue-400 border-blue-600',
    B: 'bg-gray-800 border-gray-900',
    R: 'bg-red-500 border-red-700',
    G: 'bg-green-500 border-green-700'
  };
  
  return (
    <div 
      className={`w-4 h-4 rounded-full border-2 ${colorClasses[color] || 'bg-gray-400 border-gray-600'}`}
      title={COLOR_MAP[color]}
    />
  );
};

export default function AIBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const deck = useDeckStore();
  
  // UI State
  const [step, setStep] = useState(0); // 0: Choose workflow, 1: Archetype/Commander, 2: Commander/Archetype, 3: Configure, 4: Results
  const [workflow, setWorkflow] = useState<'archetype-first' | 'commander-first' | null>(null);
  const [selectedArchetype, setSelectedArchetype] = useState<typeof COMMANDER_ARCHETYPES[0] | null>(null);
  const [selectedCommander, setSelectedCommander] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [popularCommanders, setPopularCommanders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildResult, setBuildResult] = useState<any>(null);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  
  // Build Config
  const [powerLevel, setPowerLevel] = useState(6);
  const [budget, setBudget] = useState(100);

  // Search commanders
  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' type:legendary type:creature')}&unique=cards&order=edhrec`
      );
      
      if (!response.ok) {
        setSearchResults([]);
        return;
      }
      
      const data = await response.json();
      setSearchResults(data.data?.slice(0, 12) || []);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Load popular commanders for archetype
  const loadPopularCommanders = async (archetype: typeof COMMANDER_ARCHETYPES[0]) => {
    setLoading(true);
    try {
      const colorQuery = archetype.colors.length > 0 
        ? ` color<=${archetype.colors.join('')}` 
        : '';
      
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=type:legendary type:creature${colorQuery}&unique=cards&order=edhrec`
      );
      
      if (!response.ok) {
        setPopularCommanders([]);
        return;
      }
      
      const data = await response.json();
      setPopularCommanders(data.data?.slice(0, 20) || []);
    } catch (error) {
      console.error('Popular commanders error:', error);
      setPopularCommanders([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle archetype selection
  const handleArchetypeSelect = (archetype: typeof COMMANDER_ARCHETYPES[0]) => {
    setSelectedArchetype(archetype);
    loadPopularCommanders(archetype);
    setStep(workflow === 'archetype-first' ? 2 : 3);
  };

  // Handle workflow selection
  const handleWorkflowSelect = (selectedWorkflow: 'archetype-first' | 'commander-first') => {
    setWorkflow(selectedWorkflow);
    setStep(1);
  };

  // Handle commander selection
  const handleCommanderSelect = (commander: any) => {
    setSelectedCommander(commander);
    
    // If commander-first workflow and no archetype selected, show archetype options
    if (workflow === 'commander-first' && !selectedArchetype) {
      setStep(2);
    } else {
      setStep(3);
    }
  };

  // Build deck
  const handleBuild = async () => {
    if (!selectedCommander || !selectedArchetype) return;
    
    setBuilding(true);
    setBuildProgress(10);
    
    try {
      setBuildProgress(30);
      
      const { data, error } = await supabase.functions.invoke('ai-deck-builder-v2', {
        body: {
          commander: {
            id: selectedCommander.id,
            name: selectedCommander.name,
            colors: selectedCommander.color_identity || [],
            type: selectedCommander.type_line,
            text: selectedCommander.oracle_text
          },
          preferences: {
            archetype: selectedArchetype.value,
            powerLevel,
            budget,
            format: 'commander'
          }
        }
      });

      setBuildProgress(90);

      if (error) throw error;

      setBuildResult(data);
      setStep(4);
      setBuildProgress(100);
      showSuccess('Deck Built!', `${data.cards?.length || 0} cards added`);
      
    } catch (error: any) {
      console.error('Build error:', error);
      showError('Build Failed', error.message || 'Could not build deck');
    } finally {
      setBuilding(false);
      setBuildProgress(0);
    }
  };

  // Save deck
  const handleSaveDeck = async () => {
    if (!user) {
      showError('Authentication Required', 'Please log in to save decks');
      navigate('/auth');
      return;
    }

    if (!buildResult || !selectedCommander) return;

    try {
      const deckData = {
        name: `${selectedCommander.name} - ${selectedArchetype?.label || 'Commander'}`,
        format: 'commander',
        colors: selectedCommander.color_identity || [],
        power_level: powerLevel,
        user_id: user.id,
        description: `AI-built ${selectedArchetype?.label || 'Commander'} deck`
      };

      const { data: newDeck, error: deckError } = await supabase
        .from('user_decks')
        .insert(deckData)
        .select()
        .single();

      if (deckError) throw deckError;

      const deckCards = [
        {
          deck_id: newDeck.id,
          card_id: selectedCommander.id,
          card_name: selectedCommander.name,
          quantity: 1,
          is_commander: true,
          is_sideboard: false
        },
        ...(buildResult.cards || []).map((card: any) => ({
          deck_id: newDeck.id,
          card_id: card.id,
          card_name: card.name,
          quantity: card.quantity || 1,
          is_commander: false,
          is_sideboard: false
        }))
      ];

      const { error: cardsError } = await supabase
        .from('deck_cards')
        .insert(deckCards);

      if (cardsError) throw cardsError;

      showSuccess('Deck Saved!', 'Navigate to your decks to view it');
      navigate('/decks');
      
    } catch (error: any) {
      console.error('Save error:', error);
      showError('Save Failed', error.message || 'Could not save deck');
    }
  };

  // Handle card click
  const handleCardClick = (card: CardData) => {
    setSelectedCard(card);
    setShowCardModal(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">AI Deck Builder</h1>
          </div>
          {step === 4 && (
            <Button onClick={handleSaveDeck} size="lg">
              <Save className="mr-2 h-4 w-4" />
              Save Deck
            </Button>
          )}
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            {[
              { num: 0, label: 'Workflow' },
              { num: 1, label: workflow === 'archetype-first' ? 'Archetype' : 'Commander' },
              { num: 2, label: workflow === 'archetype-first' ? 'Commander' : 'Archetype' },
              { num: 3, label: 'Configure' },
              { num: 4, label: 'Results' }
            ].map(({ num, label }, idx) => (
              <div key={num} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    step >= num ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {step > num ? <CheckCircle2 className="h-5 w-5" /> : num + 1}
                  </div>
                  <span className={`text-sm font-medium ${step >= num ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </div>
                {idx < 4 && (
                  <ArrowRight className={`mx-3 h-4 w-4 ${step > num ? 'text-primary' : 'text-muted-foreground'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 container mx-auto px-6 py-8">
        {/* Step 0: Choose Workflow */}
        {step === 0 && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">How would you like to build?</h2>
              <p className="text-muted-foreground">Choose your preferred workflow</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card
                className="cursor-pointer hover:border-primary hover:shadow-xl transition-all p-8"
                onClick={() => handleWorkflowSelect('archetype-first')}
              >
                <CardContent className="space-y-4 p-0">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold">Start with Archetype</h3>
                    <p className="text-muted-foreground">
                      Choose a deck strategy first, then find the perfect commander for it
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Badge variant="secondary">Combo</Badge>
                    <Badge variant="secondary">Voltron</Badge>
                    <Badge variant="secondary">Tokens</Badge>
                    <Badge variant="secondary">Control</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:border-primary hover:shadow-xl transition-all p-8"
                onClick={() => handleWorkflowSelect('commander-first')}
              >
                <CardContent className="space-y-4 p-0">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Crown className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold">Start with Commander</h3>
                    <p className="text-muted-foreground">
                      Find your commander first, then we'll suggest optimal strategies
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Badge variant="secondary">Popular</Badge>
                    <Badge variant="secondary">Search</Badge>
                    <Badge variant="secondary">Browse</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 1: Select Archetype (archetype-first) OR Commander (commander-first) */}
        {step === 1 && workflow === 'archetype-first' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Choose Your Archetype</h2>
              <p className="text-muted-foreground">Select a deck strategy to get started</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {COMMANDER_ARCHETYPES.map((archetype) => (
                <Card
                  key={archetype.value}
                  className="cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                  onClick={() => handleArchetypeSelect(archetype)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {archetype.label}
                      <div className="flex gap-1">
                        {archetype.colors.map(color => (
                          <ColorDot key={color} color={color} />
                        ))}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{archetype.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Commander Selection (commander-first workflow) */}
        {step === 1 && workflow === 'commander-first' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Choose Your Commander</h2>
                <p className="text-muted-foreground">Search or browse popular commanders</p>
              </div>
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search for a commander..."
                className="pl-10 h-12 text-lg"
                value={commanderSearch}
                onChange={(e) => {
                  setCommanderSearch(e.target.value);
                  searchCommanders(e.target.value);
                }}
              />
            </div>

            {/* Results */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {searchResults.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold mb-4">Search Results</h3>
                <CardRecommendationDisplay
                  cards={searchResults.map(c => ({
                    name: c.name,
                    image_uri: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
                    mana_cost: c.mana_cost,
                    type_line: c.type_line,
                    oracle_text: c.oracle_text,
                    power: c.power,
                    toughness: c.toughness,
                    cmc: c.cmc,
                    colors: c.colors,
                    rarity: c.rarity
                  }))}
                  onCardClick={(card) => {
                    const fullCard = searchResults.find(c => c.name === card.name);
                    if (fullCard) handleCommanderSelect(fullCard);
                  }}
                />
              </div>
            ) : commanderSearch === '' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Popular Commanders</h3>
                <p className="text-sm text-muted-foreground mb-4">Start typing to search, or browse popular commanders</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Commander Selection (archetype-first) OR Archetype Selection (commander-first) */}
        {step === 2 && workflow === 'archetype-first' && selectedArchetype && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Choose Your Commander</h2>
                <p className="text-muted-foreground">
                  Building a <Badge variant="secondary">{selectedArchetype.label}</Badge> deck
                </p>
              </div>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search for a commander..."
                className="pl-10 h-12 text-lg"
                value={commanderSearch}
                onChange={(e) => {
                  setCommanderSearch(e.target.value);
                  searchCommanders(e.target.value);
                }}
              />
            </div>

            {/* Results */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {searchResults.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold mb-4">Search Results</h3>
                <CardRecommendationDisplay
                  cards={searchResults.map(c => ({
                    name: c.name,
                    image_uri: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
                    mana_cost: c.mana_cost,
                    type_line: c.type_line,
                    oracle_text: c.oracle_text,
                    power: c.power,
                    toughness: c.toughness,
                    cmc: c.cmc,
                    colors: c.colors,
                    rarity: c.rarity
                  }))}
                  onCardClick={(card) => {
                    const fullCard = searchResults.find(c => c.name === card.name);
                    if (fullCard) handleCommanderSelect(fullCard);
                  }}
                />
              </div>
            ) : popularCommanders.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Popular {selectedArchetype.label} Commanders</h3>
                <CardRecommendationDisplay
                  cards={popularCommanders.map(c => ({
                    name: c.name,
                    image_uri: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
                    mana_cost: c.mana_cost,
                    type_line: c.type_line,
                    oracle_text: c.oracle_text,
                    power: c.power,
                    toughness: c.toughness,
                    cmc: c.cmc,
                    colors: c.colors,
                    rarity: c.rarity
                  }))}
                  onCardClick={(card) => {
                    const fullCard = popularCommanders.find(c => c.name === card.name);
                    if (fullCard) handleCommanderSelect(fullCard);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 2: Archetype Selection (commander-first workflow) */}
        {step === 2 && workflow === 'commander-first' && selectedCommander && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Choose Your Strategy</h2>
                <p className="text-muted-foreground">
                  Commander: <Badge variant="secondary">{selectedCommander.name}</Badge>
                </p>
              </div>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>

            {/* Commander Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-600" />
                  Your Commander
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <img
                    src={selectedCommander.image_uris?.normal || selectedCommander.card_faces?.[0]?.image_uris?.normal}
                    alt={selectedCommander.name}
                    className="w-48 rounded-lg shadow-lg"
                  />
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">{selectedCommander.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedCommander.type_line}</p>
                    <p className="text-sm">{selectedCommander.oracle_text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Archetype Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Select a Strategy</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {COMMANDER_ARCHETYPES.map((archetype) => (
                  <Card
                    key={archetype.value}
                    className="cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                    onClick={() => handleArchetypeSelect(archetype)}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {archetype.label}
                        <div className="flex gap-1">
                          {archetype.colors.map(color => (
                            <ColorDot key={color} color={color} />
                          ))}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{archetype.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Configure Build */}
        {step === 3 && selectedCommander && selectedArchetype && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Configure Your Build</h2>
                <p className="text-muted-foreground">
                  Commander: <Badge variant="secondary">{selectedCommander.name}</Badge>
                </p>
              </div>
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>

            {/* Commander Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-600" />
                  Your Commander
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <img
                    src={selectedCommander.image_uris?.normal || selectedCommander.card_faces?.[0]?.image_uris?.normal}
                    alt={selectedCommander.name}
                    className="w-48 rounded-lg shadow-lg cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => handleCardClick({
                      name: selectedCommander.name,
                      image_uri: selectedCommander.image_uris?.normal || selectedCommander.card_faces?.[0]?.image_uris?.normal,
                      mana_cost: selectedCommander.mana_cost,
                      type_line: selectedCommander.type_line,
                      oracle_text: selectedCommander.oracle_text,
                      power: selectedCommander.power,
                      toughness: selectedCommander.toughness,
                      cmc: selectedCommander.cmc,
                      colors: selectedCommander.colors,
                      rarity: selectedCommander.rarity
                    })}
                  />
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">{selectedCommander.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedCommander.type_line}</p>
                    <p className="text-sm">{selectedCommander.oracle_text}</p>
                    <div className="flex items-center gap-2">
                      <Badge>CMC {selectedCommander.cmc}</Badge>
                      {selectedCommander.color_identity?.length > 0 && (
                        <div className="flex gap-1">
                          {selectedCommander.color_identity.map((color: string) => (
                            <ColorDot key={color} color={color} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Build Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Power Level: {powerLevel}/10
                  </label>
                  <Slider
                    value={[powerLevel]}
                    onValueChange={([val]) => setPowerLevel(val)}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {powerLevel <= 3 && 'Casual - Fun, relaxed gameplay'}
                    {powerLevel > 3 && powerLevel <= 6 && 'Mid - Balanced competitive'}
                    {powerLevel > 6 && powerLevel <= 8 && 'High - Optimized strategies'}
                    {powerLevel > 8 && 'cEDH - Competitive tournament level'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Max Card Price: ${budget}
                  </label>
                  <Slider
                    value={[budget]}
                    onValueChange={([val]) => setBudget(val)}
                    min={1}
                    max={500}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Individual card budget limit
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleBuild}
              disabled={building}
              size="lg"
              className="w-full h-14 text-lg"
            >
              {building ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Building Deck... {buildProgress}%
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Build Deck with AI
                </>
              )}
            </Button>

            {building && buildProgress > 0 && (
              <Progress value={buildProgress} className="w-full" />
            )}
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && buildResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold">Your Deck is Ready!</h2>
              <Button variant="outline" onClick={() => {
                setStep(0);
                setWorkflow(null);
                setBuildResult(null);
                setSelectedCommander(null);
                setSelectedArchetype(null);
              }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Start Over
              </Button>
            </div>

            <AIGeneratedDeckList
              deckName={`${selectedCommander.name} - ${selectedArchetype?.label}`}
              cards={buildResult.cards || []}
              commander={selectedCommander}
              power={powerLevel}
              totalValue={buildResult.totalValue || 0}
              analysis={buildResult.analysis}
              changelog={buildResult.changelog}
              onSaveDeck={handleSaveDeck}
              onStartOver={() => {
                setStep(0);
                setWorkflow(null);
                setBuildResult(null);
                setSelectedCommander(null);
                setSelectedArchetype(null);
              }}
            />
          </div>
        )}
      </div>

      {/* Card Modal */}
      <UniversalCardModal
        card={selectedCard}
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
      />
    </div>
  );
}
