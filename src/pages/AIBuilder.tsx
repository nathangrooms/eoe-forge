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
          message: `Analyze this Magic: The Gathering commander and suggest 3-5 synergistic deck archetypes that work well with it: ${selectedCommander.name}. 

Commander details:
- Name: ${selectedCommander.name}
- Colors: ${selectedCommander.color_identity?.join(', ') || 'Colorless'}
- Type: ${selectedCommander.type_line}
- Text: ${selectedCommander.oracle_text || 'No oracle text available'}

For each archetype, provide:
1. Name of the archetype
2. Brief description (1-2 sentences)
3. Why it synergizes with this commander
4. Power level recommendation (1-10)

Respond in a structured format with clear archetype suggestions.`,
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
    // Parse AI response to extract archetype suggestions
    const archetypes = [];
    const lines = analysis.split('\n');
    
    let currentArchetype: any = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for archetype names (usually numbered or starting with special chars)
      if (trimmed.match(/^\d+\./) || trimmed.match(/^[\*\-]/) || trimmed.includes('Archetype:')) {
        if (currentArchetype) {
          archetypes.push(currentArchetype);
        }
        
        const name = trimmed.replace(/^\d+\./, '').replace(/^[\*\-]/, '').replace('Archetype:', '').trim();
        currentArchetype = {
          value: name.toLowerCase().replace(/\s+/g, '-'),
          label: name,
          description: '',
          synergy: '',
          powerLevel: 6
        };
      } else if (currentArchetype && trimmed) {
        // Add description/synergy info
        if (trimmed.toLowerCase().includes('synerg') || trimmed.toLowerCase().includes('work')) {
          currentArchetype.synergy = trimmed;
        } else if (!currentArchetype.description) {
          currentArchetype.description = trimmed;
        }
        
        // Extract power level if mentioned
        const powerMatch = trimmed.match(/power[\s\w]*(\d+)/i);
        if (powerMatch) {
          currentArchetype.powerLevel = parseInt(powerMatch[1]);
        }
      }
    }
    
    if (currentArchetype) {
      archetypes.push(currentArchetype);
    }
    
    // Fallback to generic archetypes if parsing failed
    if (archetypes.length === 0) {
      const colors = commander.color_identity || [];
      return ARCHETYPES.commander.filter(arch => 
        colors.length === 0 || // Colorless commanders can use any archetype
        arch.value === 'tribal' || // Tribal is always good
        arch.value === 'voltron' || // Voltron works with any commander
        arch.value === 'midrange' // Safe fallback
      );
    }
    
    return archetypes.slice(0, 5); // Limit to 5 suggestions
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

  const [buildProgress, setBuildProgress] = useState(0);

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
                      {/* Commander search results would be rendered here */}
                      <div className="text-center text-muted-foreground py-8">
                        Type a commander name to search...
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <h4 className="font-medium mb-3">Popular Commanders</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { name: 'Atraxa, Praetors\' Voice', colors: ['W', 'U', 'B', 'G'] },
                        { name: 'Edgar Markov', colors: ['W', 'B', 'R'] },
                        { name: 'Kaalia of the Vast', colors: ['W', 'B', 'R'] },
                        { name: 'Meren of Clan Nel Toth', colors: ['B', 'G'] },
                        { name: 'Prossh, Skyraider of Kher', colors: ['B', 'R', 'G'] },
                        { name: 'Zur the Enchanter', colors: ['W', 'U', 'B'] }
                      ].map((popularCommander) => (
                        <div
                          key={popularCommander.name}
                          className="p-3 rounded border hover:border-primary/50 cursor-pointer transition-all"
                          onClick={() => {
                            const mockCommander = {
                              name: popularCommander.name,
                              color_identity: popularCommander.colors,
                              type_line: 'Legendary Creature',
                              oracle_text: 'Mock commander for demo',
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