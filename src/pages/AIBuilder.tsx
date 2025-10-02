import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { useDeckStore } from '@/stores/deckStore';
import { AIGeneratedDeckList } from '@/components/deck-builder/AIGeneratedDeckList';
import { 
  Sparkles, 
  Crown, 
  ArrowRight,
  ArrowLeft,
  Wand2,
  Search,
  Star,
  TrendingUp,
  DollarSign,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';

const COMMANDER_ARCHETYPES = [
  { value: 'voltron', label: 'Voltron', description: 'Build one powerful creature', colors: ['W', 'R'] },
  { value: 'tribal', label: 'Tribal', description: 'Creature type synergies', colors: ['W', 'G'] },
  { value: 'combo', label: 'Combo', description: 'Infinite combinations', colors: ['U', 'B'] },
  { value: 'control', label: 'Control', description: 'Counter and removal', colors: ['U', 'W'] },
  { value: 'tokens', label: 'Tokens', description: 'Go wide strategy', colors: ['W', 'G'] },
  { value: 'aristocrats', label: 'Aristocrats', description: 'Sacrifice for value', colors: ['B', 'W'] },
  { value: 'spellslinger', label: 'Spellslinger', description: 'Instants and sorceries', colors: ['U', 'R'] },
  { value: 'reanimator', label: 'Reanimator', description: 'Graveyard recursion', colors: ['B', 'G'] },
  { value: 'counters', label: '+1/+1 Counters', description: 'Counter synergies', colors: ['G', 'W'] },
  { value: 'artifacts', label: 'Artifacts', description: 'Artifact combos', colors: ['U', 'R'] },
];

const POPULAR_COMMANDERS = [
  { name: 'Atraxa, Praetors\' Voice', colors: ['W', 'U', 'B', 'G'] },
  { name: 'Edgar Markov', colors: ['W', 'B', 'R'] },
  { name: 'The Ur-Dragon', colors: ['W', 'U', 'B', 'R', 'G'] },
  { name: 'Korvold, Fae-Cursed King', colors: ['B', 'R', 'G'] },
  { name: 'Muldrotha, the Gravetide', colors: ['B', 'G', 'U'] },
  { name: 'Yuriko, the Tiger\'s Shadow', colors: ['U', 'B'] },
];

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  W: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  U: { bg: 'bg-blue-100', text: 'text-blue-800' },
  B: { bg: 'bg-gray-800', text: 'text-white' },
  R: { bg: 'bg-red-100', text: 'text-red-800' },
  G: { bg: 'bg-green-100', text: 'text-green-800' },
};

export default function AIBuilder() {
  const deckStore = useDeckStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [workflow, setWorkflow] = useState<'commander-first' | 'archetype-first'>('commander-first');
  const [step, setStep] = useState(1);
  const [commander, setCommander] = useState<any>(null);
  const [selectedArchetype, setSelectedArchetype] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [commanderResults, setCommanderResults] = useState<any[]>([]);
  const [searchingCommanders, setSearchingCommanders] = useState(false);
  const [powerLevel, setPowerLevel] = useState(6);
  const [budget, setBudget] = useState(100);
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildResult, setBuildResult] = useState<any>(null);

  // Search commanders
  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setCommanderResults([]);
      return;
    }

    setSearchingCommanders(true);
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' type:legendary type:creature')}&order=edhrec`
      );
      
      if (response.ok) {
        const data = await response.json();
        setCommanderResults(data.data || []);
      } else {
        setCommanderResults([]);
      }
    } catch (error) {
      console.error('Commander search error:', error);
      setCommanderResults([]);
    } finally {
      setSearchingCommanders(false);
    }
  };

  // Find commanders for archetype
  const findCommandersForArchetype = async (archetype: string, colors: string[]) => {
    setSearchingCommanders(true);
    try {
      const colorQuery = colors.length > 0 ? `id<=${colors.join('')}` : '';
      const query = `t:legendary t:creature ${colorQuery}`;
      
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`
      );
      
      if (response.ok) {
        const data = await response.json();
        setCommanderResults(data.data?.slice(0, 12) || []);
      }
    } catch (error) {
      console.error('Error finding commanders:', error);
    } finally {
      setSearchingCommanders(false);
    }
  };

  // Load popular commander
  const loadPopularCommander = async (name: string) => {
    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
      );
      
      if (response.ok) {
        const card = await response.json();
        selectCommander(card);
      }
    } catch (error) {
      console.error('Error loading popular commander:', error);
    }
  };

  const selectCommander = (card: any) => {
    setCommander(card);
    if (workflow === 'archetype-first') {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (commanderSearch) {
        searchCommanders(commanderSearch);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [commanderSearch]);

  // Build deck
  const handleBuild = async () => {
    if (!commander) {
      showError('Commander Required', 'Please select a commander');
      return;
    }
    
    setBuilding(true);
    setBuildProgress(10);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-deck-builder-v2', {
        body: {
          commander: {
            id: commander.id,
            name: commander.name,
            color_identity: commander.color_identity,
            oracle_text: commander.oracle_text,
            type_line: commander.type_line
          },
          archetype: selectedArchetype,
          powerLevel,
          budget,
          colors: selectedColors.length > 0 ? selectedColors : commander.color_identity
        }
      });

      setBuildProgress(100);

      if (error) throw error;
      if (!data) throw new Error('No data returned from builder');

      setBuildResult(data);
      setStep(4);
      showSuccess('Deck Built!', 'Your AI-powered deck is ready');

    } catch (error) {
      console.error('Build error:', error);
      showError('Build Failed', 'Could not build deck. Please try again.');
    } finally {
      setBuilding(false);
      setBuildProgress(0);
    }
  };

  const saveDeckToDatabase = async () => {
    if (!buildResult || !user) return;

    try {
      const { data: deckData, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: buildResult.name || `${commander.name} ${selectedArchetype}`,
          format: 'commander',
          colors: buildResult.deck?.[0]?.colors || [],
          power_level: powerLevel,
          archetype: selectedArchetype
        })
        .select()
        .single();

      if (deckError) throw deckError;

      const cards = buildResult.deck.map((card: any) => ({
        deck_id: deckData.id,
        card_id: card.id,
        card_name: card.name,
        quantity: card.quantity || 1,
        is_commander: card.id === commander.id,
        is_sideboard: false
      }));

      const { error: cardsError } = await supabase
        .from('deck_cards')
        .insert(cards);

      if (cardsError) throw cardsError;

      showSuccess('Deck Saved!', 'Your deck has been saved to your collection');
      navigate('/deck-builder?deck=' + deckData.id);
    } catch (error) {
      console.error('Save error:', error);
      showError('Save Failed', 'Could not save deck');
    }
  };

  const ColorDot = ({ color }: { color: string }) => (
    <div className={`w-6 h-6 rounded-full ${COLOR_MAP[color]?.bg || 'bg-gray-200'}`} />
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wand2 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">AI Deck Builder</h1>
                <p className="text-sm text-muted-foreground">Let AI create your perfect Commander deck</p>
              </div>
            </div>
            
            {buildResult && (
              <Button onClick={saveDeckToDatabase} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                Save Deck
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-6 py-8">
        {/* Step 1: Choose Workflow */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">How would you like to start?</h2>
              <p className="text-muted-foreground">Choose your preferred deck building approach</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <Card 
                className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
                onClick={() => {
                  setWorkflow('commander-first');
                  setStep(2);
                }}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-6 w-6 text-primary" />
                    Commander First
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Start with a commander and let AI suggest optimal archetypes and strategies
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Perfect for:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• You have a commander in mind</li>
                      <li>• Exploring what works with a specific card</li>
                      <li>• Building around commander abilities</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
                onClick={() => {
                  setWorkflow('archetype-first');
                  setStep(2);
                }}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-6 w-6 text-primary" />
                    Archetype First
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Pick your favorite strategy and discover the best commanders for it
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Perfect for:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• You know what strategy you want</li>
                      <li>• Finding commanders for your playstyle</li>
                      <li>• Exploring archetype options</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 2: Commander or Archetype Selection */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Badge variant="outline">Step {workflow === 'commander-first' ? '1' : '1'} of 3</Badge>
            </div>

            {workflow === 'commander-first' ? (
              // Commander Selection
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-3xl font-bold mb-2">Choose Your Commander</h2>
                  <p className="text-muted-foreground">Search or pick from popular commanders</p>
                </div>

                {/* Search */}
                <div className="max-w-2xl mx-auto">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      placeholder="Search for legendary creatures..."
                      value={commanderSearch}
                      onChange={(e) => setCommanderSearch(e.target.value)}
                      className="pl-10 h-12 text-lg"
                    />
                  </div>
                </div>

                {/* Search Results */}
                {commanderResults.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                    {commanderResults.slice(0, 12).map((card) => (
                      <Card 
                        key={card.id}
                        className="cursor-pointer hover:border-primary transition-all"
                        onClick={() => selectCommander(card)}
                      >
                        <CardContent className="p-4">
                          <div className="flex gap-3">
                            {card.image_uris?.small && (
                              <img 
                                src={card.image_uris.small} 
                                alt={card.name}
                                className="w-20 h-auto rounded"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold truncate">{card.name}</h3>
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                {card.type_line}
                              </p>
                              <div className="flex gap-1">
                                {card.color_identity?.map((c: string) => (
                                  <ColorDot key={c} color={c} />
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Popular Commanders */}
                {commanderResults.length === 0 && (
                  <div className="max-w-4xl mx-auto">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <h3 className="text-xl font-bold">Popular Commanders</h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {POPULAR_COMMANDERS.map((cmd, idx) => (
                        <Card 
                          key={cmd.name}
                          className="cursor-pointer hover:border-primary transition-all"
                          onClick={() => loadPopularCommander(cmd.name)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                  <Star className="h-4 w-4 text-orange-500" />
                                  <span className="font-medium">#{idx + 1}</span>
                                </div>
                                <div>
                                  <p className="font-medium">{cmd.name}</p>
                                  <div className="flex gap-1 mt-1">
                                    {cmd.colors.map((c) => (
                                      <ColorDot key={c} color={c} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Archetype Selection
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-3xl font-bold mb-2">Choose Your Strategy</h2>
                  <p className="text-muted-foreground">Select an archetype to find matching commanders</p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                  {COMMANDER_ARCHETYPES.map((arch) => (
                    <Card 
                      key={arch.value}
                      className={`cursor-pointer hover:border-primary transition-all ${
                        selectedArchetype === arch.value ? 'border-primary shadow-lg' : ''
                      }`}
                      onClick={() => {
                        setSelectedArchetype(arch.value);
                        findCommandersForArchetype(arch.value, arch.colors);
                        setStep(2.5);
                      }}
                    >
                      <CardContent className="p-6">
                        <h3 className="font-bold text-lg mb-2">{arch.label}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{arch.description}</p>
                        <div className="flex gap-1">
                          {arch.colors.map((c) => (
                            <ColorDot key={c} color={c} />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2.5: Commander selection for archetype-first */}
        {step === 2.5 && workflow === 'archetype-first' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Badge variant="outline">Step 2 of 3</Badge>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold mb-2">
                Best Commanders for {COMMANDER_ARCHETYPES.find(a => a.value === selectedArchetype)?.label}
              </h2>
              <p className="text-muted-foreground">Select your commander to continue</p>
            </div>

            {searchingCommanders ? (
              <div className="text-center py-12">
                <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-muted-foreground">Finding commanders...</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                {commanderResults.map((card) => (
                  <Card 
                    key={card.id}
                    className="cursor-pointer hover:border-primary transition-all"
                    onClick={() => selectCommander(card)}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        {card.image_uris?.small && (
                          <img 
                            src={card.image_uris.small} 
                            alt={card.name}
                            className="w-20 h-auto rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate">{card.name}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {card.type_line}
                          </p>
                          <div className="flex gap-1">
                            {card.color_identity?.map((c: string) => (
                              <ColorDot key={c} color={c} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Configure Build */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" onClick={() => setStep(workflow === 'archetype-first' ? 2.5 : 2)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Badge variant="outline">Final Step</Badge>
            </div>

            <div className="max-w-4xl mx-auto space-y-8">
              {/* Commander Summary */}
              <Card className="border-primary/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-6">
                    {commander?.image_uris?.normal && (
                      <img 
                        src={commander.image_uris.normal} 
                        alt={commander.name}
                        className="w-48 h-auto rounded-lg"
                      />
                    )}
                    <div>
                      <h2 className="text-3xl font-bold mb-2">{commander?.name}</h2>
                      <p className="text-lg text-muted-foreground mb-4">{commander?.type_line}</p>
                      <div className="flex items-center gap-3">
                        <Badge>{selectedArchetype || 'Custom'}</Badge>
                        <div className="flex gap-1">
                          {commander?.color_identity?.map((c: string) => (
                            <ColorDot key={c} color={c} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Configuration */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Power Level</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Slider
                      value={[powerLevel]}
                      onValueChange={(v) => setPowerLevel(v[0])}
                      min={1}
                      max={10}
                      step={1}
                    />
                    <div className="flex justify-between text-sm">
                      <span>Casual</span>
                      <span className="font-bold">{powerLevel}/10</span>
                      <span>cEDH</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Budget</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Slider
                      value={[budget]}
                      onValueChange={(v) => setBudget(v[0])}
                      min={25}
                      max={500}
                      step={25}
                    />
                    <div className="flex justify-between text-sm">
                      <span>Budget</span>
                      <span className="font-bold flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {budget}
                      </span>
                      <span>Premium</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Build Button */}
              <Card className="bg-primary/5 border-primary">
                <CardContent className="p-8 text-center">
                  <Button 
                    onClick={handleBuild}
                    disabled={building}
                    size="lg"
                    className="w-full max-w-md h-14 text-lg"
                  >
                    {building ? (
                      <>
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Building Deck...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-5 w-5 mr-2" />
                        Build My Deck with AI
                      </>
                    )}
                  </Button>
                  
                  {building && (
                    <div className="mt-6">
                      <Progress value={buildProgress} className="h-2" />
                      <p className="text-sm text-muted-foreground mt-2">
                        AI is analyzing cards and building your deck...
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && buildResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Rebuild
              </Button>
              <Button onClick={saveDeckToDatabase} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                Save to Collection
              </Button>
            </div>

            <AIGeneratedDeckList 
              deckName={buildResult.name || `${commander.name} Deck`}
              cards={buildResult.deck || []}
              commander={commander}
              power={powerLevel}
              totalValue={buildResult.totalValue}
              analysis={buildResult.analysis}
              changelog={buildResult.changeLog}
              onSaveDeck={saveDeckToDatabase}
              onApplyToDeckBuilder={saveDeckToDatabase}
              onStartOver={() => setStep(1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
