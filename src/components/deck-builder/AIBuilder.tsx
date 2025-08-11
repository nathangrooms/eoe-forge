import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Sparkles, 
  Crown, 
  Target, 
  Zap, 
  Brain, 
  Filter,
  RefreshCw,
  Download,
  Eye,
  TrendingUp,
  Users,
  Scroll,
  Shield
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCardSearch } from '@/hooks/useCardSearch';
import { useDeckStore } from '@/stores/deckStore';

interface AIBuilderProps {
  collection?: any[];
  onDeckBuilt?: (deck: any) => void;
}

const FORMATS = [
  { value: 'commander', label: 'Commander (EDH)' },
  { value: 'standard', label: 'Standard' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' }
];

const THEMES = [
  'Tribal', 'Tokens', 'Aristocrats', 'Spellslinger', 'Voltron', 
  'Stax', 'Combo', 'Aggro', 'Control', 'Midrange', 'Ramp',
  'Artifacts', 'Enchantments', 'Graveyard', 'Lands'
];

const BUDGET_OPTIONS = [
  { value: 'budget', label: 'Budget ($0-50)' },
  { value: 'medium', label: 'Medium ($50-200)' },
  { value: 'high', label: 'High ($200+)' }
];

export const AIBuilder = ({ collection = [], onDeckBuilt }: AIBuilderProps) => {
  const [commander, setCommander] = useState<any>(null);
  const [format, setFormat] = useState('commander');
  const [powerLevel, setPowerLevel] = useState([6]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [budget, setBudget] = useState('medium');
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [builtDeck, setBuiltDeck] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [showCommanderPicker, setShowCommanderPicker] = useState(false);
  
  const { toast } = useToast();
  const deckStore = useDeckStore();
  
  // Search for potential commanders
  const { cards: commanderCards, loading: searchingCommanders } = useCardSearch(
    commanderSearch ? `${commanderSearch} type:legendary type:creature` : '',
    { sets: ['EOE', 'EOC', 'EOS'] }
  );

  const handleThemeToggle = (theme: string) => {
    setSelectedThemes(prev => 
      prev.includes(theme) 
        ? prev.filter(t => t !== theme)
        : [...prev, theme]
    );
  };

  const buildDeck = async () => {
    if (!commander && format === 'commander') {
      toast({
        title: "Commander Required",
        description: "Please select a commander for your deck",
        variant: "destructive"
      });
      return;
    }

    setIsBuilding(true);
    setBuildProgress(10);

    try {
      // Get user's collection if not provided
      let deckCollection = collection;
      if (collection.length === 0) {
        setBuildProgress(20);
        const { data: userCollection } = await supabase
          .from('user_collections')
          .select('*');
        deckCollection = userCollection || [];
      }

      setBuildProgress(40);

      // Call AI deck builder function
      const { data, error } = await supabase.functions.invoke('ai-deck-builder', {
        body: {
          commander,
          collection: deckCollection,
          format,
          powerLevel: powerLevel[0],
          themes: selectedThemes,
          budget,
          deckSize: format === 'commander' ? 100 : 60
        }
      });

      setBuildProgress(80);

      if (error) throw error;

      if (data?.success) {
        setBuiltDeck(data);
        setBuildProgress(100);
        
        toast({
          title: "Deck Built Successfully!",
          description: `Created a ${data.metadata.powerLevel}/10 power level deck with ${data.deck.length} cards`,
        });

        // Add deck to store
        if (onDeckBuilt) {
          onDeckBuilt(data);
        }
      } else {
        throw new Error(data?.error || 'Failed to build deck');
      }

    } catch (error) {
      console.error('Deck building error:', error);
      toast({
        title: "Deck Building Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsBuilding(false);
      setBuildProgress(0);
    }
  };

  const importDeckToBuilder = () => {
    if (!builtDeck) return;

    // Clear current deck
    deckStore.clearDeck();

    // Set commander if applicable
    if (commander && format === 'commander') {
      deckStore.setCommander(commander);
    }

    // Add all cards to deck
    builtDeck.deck.forEach((card: any) => {
      deckStore.addCard({
        id: card.id,
        name: card.name,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        oracle_text: card.oracle_text,
        power: card.power,
        toughness: card.toughness,
        image_uris: card.image_uris,
        prices: card.prices,
        set: card.set || '',
        set_name: card.set_name || '',
        collector_number: card.collector_number || '',
        rarity: card.rarity || 'common',
        keywords: card.keywords || [],
        legalities: card.legalities || {},
        layout: card.layout || 'normal',
        mana_cost: card.mana_cost,
        quantity: 1,
        category: card.type_line?.toLowerCase().includes('creature') ? 'creatures' : 
                 card.type_line?.toLowerCase().includes('land') ? 'lands' :
                 card.type_line?.toLowerCase().includes('instant') ? 'instants' :
                 card.type_line?.toLowerCase().includes('sorcery') ? 'sorceries' :
                 card.type_line?.toLowerCase().includes('enchantment') ? 'enchantments' :
                 card.type_line?.toLowerCase().includes('artifact') ? 'artifacts' :
                 card.type_line?.toLowerCase().includes('planeswalker') ? 'planeswalkers' : 'other',
        mechanics: card.mechanics || []
      });
    });

    // Update deck metadata
    deckStore.setFormat(format as any);
    deckStore.setPowerLevel(powerLevel[0]);
    deckStore.setDeckName(`AI Built - ${commander?.name || 'Deck'}`);

    toast({
      title: "Deck Imported!",
      description: "The AI-built deck has been imported to the deck builder",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="cosmic-glow">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="h-6 w-6 text-primary" />
            <span className="bg-cosmic bg-clip-text text-transparent">AI Deck Builder</span>
            <Badge variant="secondary" className="ml-2">Beta</Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Format Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Target className="h-5 w-5 mr-2" />
                Deck Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATS.map(fmt => (
                        <SelectItem key={fmt.value} value={fmt.value}>
                          {fmt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Budget Range</Label>
                  <Select value={budget} onValueChange={setBudget}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Power Level */}
              <div>
                <Label>Power Level: {powerLevel[0]}/10</Label>
                <div className="mt-2">
                  <Slider
                    value={powerLevel}
                    onValueChange={setPowerLevel}
                    max={10}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  1-3: Casual | 4-6: Focused | 7-8: High Power | 9-10: cEDH
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Commander Selection */}
          {format === 'commander' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Crown className="h-5 w-5 mr-2" />
                  Commander Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commander ? (
                  <div className="flex items-center space-x-4 p-4 bg-muted rounded-lg">
                    <div className="w-16 h-20">
                      {commander.image_uris?.normal ? (
                        <img 
                          src={commander.image_uris.normal} 
                          alt={commander.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded flex items-center justify-center">
                          <Crown className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{commander.name}</h3>
                      <p className="text-sm text-muted-foreground">{commander.type_line}</p>
                      {commander.colors && (
                        <div className="flex space-x-1 mt-2">
                          {commander.colors.map((color: string) => (
                            <Badge key={color} variant="outline" className="text-xs">
                              {color}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => setCommander(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Search for commanders..."
                        value={commanderSearch}
                        onChange={(e) => setCommanderSearch(e.target.value)}
                        className="flex-1"
                      />
                      <Dialog open={showCommanderPicker} onOpenChange={setShowCommanderPicker}>
                        <DialogTrigger asChild>
                          <Button variant="outline">
                            <Filter className="h-4 w-4 mr-2" />
                            Browse
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>Choose Commander</DialogTitle>
                          </DialogHeader>
                          <div className="grid grid-cols-3 gap-4">
                            {commanderCards.slice(0, 30).map((card) => (
                              <Card 
                                key={card.id} 
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => {
                                  setCommander(card);
                                  setShowCommanderPicker(false);
                                }}
                              >
                                <CardContent className="p-3">
                                  <div className="aspect-[5/7] mb-2">
                                    {card.image_uris?.normal ? (
                                      <img 
                                        src={card.image_uris.normal} 
                                        alt={card.name}
                                        className="w-full h-full object-cover rounded"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded flex items-center justify-center">
                                        <Crown className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="font-medium text-sm leading-tight">{card.name}</h4>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Theme Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Sparkles className="h-5 w-5 mr-2" />
                Deck Themes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((theme) => (
                  <div key={theme} className="flex items-center space-x-2">
                    <Checkbox
                      id={theme}
                      checked={selectedThemes.includes(theme)}
                      onCheckedChange={() => handleThemeToggle(theme)}
                    />
                    <Label htmlFor={theme} className="text-sm cursor-pointer">
                      {theme}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Build Button */}
          <Card>
            <CardContent className="p-6">
              <Button 
                onClick={buildDeck} 
                disabled={isBuilding || (format === 'commander' && !commander)}
                className="w-full h-12 text-lg"
                size="lg"
              >
                {isBuilding ? (
                  <>
                    <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                    Building Deck...
                  </>
                ) : (
                  <>
                    <Brain className="h-5 w-5 mr-2" />
                    Build Deck with AI
                  </>
                )}
              </Button>
              
              {isBuilding && (
                <div className="mt-4">
                  <Progress value={buildProgress} className="w-full" />
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    {buildProgress < 20 ? 'Analyzing requirements...' :
                     buildProgress < 40 ? 'Loading collection...' :
                     buildProgress < 80 ? 'Building deck with AI...' :
                     'Finalizing deck...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {builtDeck ? (
            <>
              {/* Deck Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Deck Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Power Level</span>
                    <Badge variant="default">{builtDeck.metadata.powerLevel}/10</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Total Cards</span>
                    <Badge variant="outline">{builtDeck.metadata.totalCards}</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Avg CMC</span>
                    <Badge variant="outline">{builtDeck.metadata.avgCMC}</Badge>
                  </div>

                  <div>
                    <Label className="text-sm">Color Identity</Label>
                    <div className="flex space-x-1 mt-1">
                      {builtDeck.metadata.colorIdentity.map((color: string) => (
                        <Badge key={color} variant="secondary" className="text-xs">
                          {color}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Deck Actions */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <Button onClick={importDeckToBuilder} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Import to Deck Builder
                  </Button>
                  
                  <Button variant="outline" className="w-full">
                    <Eye className="h-4 w-4 mr-2" />
                    View Full Deck
                  </Button>
                </CardContent>
              </Card>

              {/* Strategy Summary */}
              {builtDeck.strategy && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Strategy</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {builtDeck.strategy.primaryStrategy}
                  </CardContent>
                </Card>
              )}

              {/* Suggestions */}
              {builtDeck.analysis?.suggestions?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {builtDeck.analysis.suggestions.map((suggestion: string, index: number) => (
                      <p key={index} className="text-xs text-muted-foreground">
                        • {suggestion}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium mb-2">Ready to Build</h3>
                <p className="text-sm text-muted-foreground">
                  Configure your deck preferences and let AI create the perfect deck for you.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};