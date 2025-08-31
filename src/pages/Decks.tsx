import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Download, 
  Upload, 
  Wand2, 
  BarChart3, 
  Crown, 
  Users, 
  Sparkles,
  Eye,
  Play,
  Settings
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { useCollectionStore } from '@/stores/collectionStore';
import { StandardDeckTile } from '@/components/ui/standardized-components';
import { EnhancedDeckTile } from '@/components/deck-builder/EnhancedDeckTile';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { EnhancedAnalysisPanel } from '@/components/deck-builder/EnhancedAnalysisPanel';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import { ArchetypeLibrary } from '@/components/deck-builder/ArchetypeLibrary';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { buildDeck, getTemplatesForFormat, getFormatRules } from '@/lib/deckbuilder';

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

export default function Decks() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<'standard' | 'commander' | 'custom'>('standard');
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [buildingDeck, setBuildingDeck] = useState(false);
  
  // AI Deck Builder state
  const [aiFormat, setAiFormat] = useState('standard');
  const [aiArchetype, setAiArchetype] = useState('');
  const [aiPowerLevel, setAiPowerLevel] = useState(6);
  const [aiColors, setAiColors] = useState<string[]>([]);
  
  // Available templates for selected format
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  
  // Real decks data from Supabase + Local store
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Get local decks from store
  const { decks: localDecks } = useDeckManagementStore();

  const deck = useDeckStore();
  const collection = useCollectionStore();
  const { user } = useAuth();
  
  // Load decks from database AND local store
  useEffect(() => {
    loadDecks();
  }, [user, localDecks]);
  
  // Load available templates when format changes
  useEffect(() => {
    const templates = getTemplatesForFormat(aiFormat);
    setAvailableTemplates(templates);
    if (templates.length > 0 && !aiArchetype) {
      setAiArchetype(templates[0].id);
    }
  }, [aiFormat]);

  const loadDecks = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
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

      if (error) {
        console.error('Error loading decks:', error);
      }

      // Convert Supabase decks to our format
      const supabaseDecks: Deck[] = userDecks?.map(dbDeck => ({
        id: dbDeck.id,
        name: dbDeck.name,
        format: dbDeck.format as any,
        powerLevel: dbDeck.power_level,
        colors: dbDeck.colors,
        cardCount: dbDeck.deck_cards?.[0]?.count || 0,
        lastModified: new Date(dbDeck.updated_at),
        description: dbDeck.description || ''
      })) || [];

      // Convert local decks to our format  
      const localDecksFormatted: Deck[] = localDecks.map(localDeck => ({
        id: localDeck.id,
        name: `${localDeck.name} (Local)`,
        format: localDeck.format as any,
        powerLevel: localDeck.powerLevel,
        colors: localDeck.colors,
        cardCount: localDeck.totalCards,
        lastModified: new Date(localDeck.updatedAt),
        description: localDeck.description || ''
      }));

      // Combine both sources
      setDecks([...supabaseDecks, ...localDecksFormatted]);
    } catch (error) {
      console.error('Error loading decks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get active tab from URL params  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'my-decks';

  const setActiveTab = (tab: string) => {
    if (tab === 'my-decks') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  // Filter decks based on search
  const filteredDecks = decks.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.format.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.colors.some(color => color.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const createDeck = async () => {
    if (!newDeckName.trim() || !user) return;
    
    try {
      const { data: newDeck, error } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: newDeckName,
          format: newDeckFormat,
          power_level: 5,
          colors: [],
          description: ''
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating deck:', error);
        return;
      }

      // Refresh deck list
      await loadDecks();
      setNewDeckName('');
      setShowCreateDialog(false);
      showSuccess("Deck Created", `"${newDeckName}" has been created successfully`);
    } catch (error) {
      console.error('Error creating deck:', error);
    }
  };

  const deleteDeck = async (deckId: string) => {
    try {
      const { error } = await supabase
        .from('user_decks')
        .delete()
        .eq('id', deckId);

      if (error) {
        console.error('Error deleting deck:', error);
        return;
      }

      // Refresh deck list
      await loadDecks();
    } catch (error) {
      console.error('Error deleting deck:', error);
    }
  };

  const duplicateDeck = (originalDeck: Deck) => {
    const duplicatedDeck: Deck = {
      ...originalDeck,
      id: Date.now().toString(),
      name: `${originalDeck.name} (Copy)`,
      lastModified: new Date()
    };
    setDecks(prev => [duplicatedDeck, ...prev]);
  };

  const loadDeck = async (deckData: Deck) => {
    try {
      // Check if this is a local deck (has "(Local)" in name)
      const isLocalDeck = deckData.name.includes('(Local)');
      
      if (isLocalDeck) {
        // Load from local store
        const originalId = deckData.id;
        const localDeck = localDecks.find(d => d.id === originalId);
        
        if (localDeck) {
          deck.setDeckName(localDeck.name);
          deck.setFormat(localDeck.format as any);
          deck.setPowerLevel(localDeck.powerLevel);
          deck.clearDeck();
          
          // Add cards from local deck
          localDeck.cards.forEach(card => {
            deck.addCard(card);
          });
          
          if (localDeck.commander) {
            deck.setCommander(localDeck.commander);
          }
        }
      } else {
        // Load from database
        deck.setDeckName(deckData.name);
        deck.setFormat(deckData.format);
        deck.setPowerLevel(deckData.powerLevel);
        
        // Load deck cards from database without join
        const { data: deckCards, error } = await supabase
          .from('deck_cards')
          .select('*')
          .eq('deck_id', deckData.id);

        if (error) {
          console.error('Error loading deck cards:', error);
          toast({
            title: "Error",
            description: "Failed to load deck cards",
            variant: "destructive"
          });
          return;
        }

        // Clear current deck and add loaded cards
        deck.clearDeck();
        
        if (deckCards) {
          for (const dbCard of deckCards) {
            deck.addCard({
              id: dbCard.card_id,
              name: dbCard.card_name,
              quantity: dbCard.quantity,
              cmc: 0,
              type_line: '',
              colors: [],
              category: dbCard.is_commander ? 'commanders' : 'creatures',
              mechanics: []
            });
          }
        }
      }

      setSelectedDeck(deckData.id);
      setActiveTab('deck-editor');
      
      toast({
        title: "Deck Loaded",
        description: `"${deckData.name.replace(' (Local)', '')}" is ready for editing`,
      });
    } catch (error) {
      console.error('Error loading deck:', error);
      toast({
        title: "Error",
        description: "Failed to load deck",
        variant: "destructive"
      });
    }
  };

  const generateAIDeck = async () => {
    if (!aiArchetype) {
      toast({
        title: "Error",
        description: "Please select an archetype",
        variant: "destructive"
      });
      return;
    }

    setBuildingDeck(true);
    
    try {
      // Convert collection cards to deck builder format
      const cardPool = collection.cards.map(collectionCard => ({
        id: collectionCard.id,
        oracle_id: collectionCard.id,
        name: collectionCard.name,
        mana_cost: '',
        cmc: collectionCard.cmc,
        type_line: collectionCard.type_line,
        oracle_text: collectionCard.oracle_text,
        colors: collectionCard.colors,
        color_identity: collectionCard.color_identity,
        power: collectionCard.power,
        toughness: collectionCard.toughness,
        keywords: collectionCard.keywords,
        legalities: { [aiFormat]: 'legal' } as any,
        image_uris: undefined,
        prices: { usd: collectionCard.priceUsd?.toString() },
        set: collectionCard.setCode,
        set_name: collectionCard.setCode,
        collector_number: collectionCard.collectorNumber || '1',
        rarity: collectionCard.rarity as any,
        layout: 'normal',
        is_legendary: collectionCard.type_line.includes('Legendary'),
        tags: new Set<string>(),
        derived: {
          mv: collectionCard.cmc,
          colorPips: {},
          producesMana: collectionCard.type_line.includes('Land'),
          etbTapped: false
        }
      }));

      const result = buildDeck(cardPool, aiFormat, aiArchetype, aiPowerLevel, aiColors.length > 0 ? aiColors : undefined);
      
      // Clear current deck and load the generated one
      deck.clearDeck();
      deck.setDeckName(`AI Generated - ${availableTemplates.find(t => t.id === aiArchetype)?.name || 'Deck'}`);
      deck.setFormat(aiFormat as any);
      deck.setPowerLevel(aiPowerLevel);
      
      // Add cards to deck
      result.deck.forEach(card => {
        deck.addCard({
          id: card.id,
          name: card.name,
          cmc: card.cmc,
          type_line: card.type_line,
          colors: card.colors,
          quantity: 1,
          category: card.type_line.toLowerCase().includes('creature') ? 'creatures' : 
                   card.type_line.toLowerCase().includes('land') ? 'lands' :
                   card.type_line.toLowerCase().includes('instant') ? 'instants' :
                   card.type_line.toLowerCase().includes('sorcery') ? 'sorceries' :
                   card.type_line.toLowerCase().includes('enchantment') ? 'enchantments' :
                   card.type_line.toLowerCase().includes('artifact') ? 'artifacts' :
                   card.type_line.toLowerCase().includes('planeswalker') ? 'planeswalkers' : 'other',
          mechanics: Array.from(card.tags)
        });
      });

      toast({
        title: "Deck Generated!",
        description: `Created ${result.deck.length}-card deck with power level ${result.analysis.power.toFixed(1)}`,
      });
      
      setShowAIDialog(false);
      setActiveTab('deck-editor');
      
    } catch (error) {
      console.error('Error generating deck:', error);
      toast({
        title: "Generation Failed",
        description: "Could not generate deck. Try adjusting your requirements.",
        variant: "destructive"
      });
    } finally {
      setBuildingDeck(false);
    }
  };

  const getFormatBadgeColor = (format: string) => {
    switch (format) {
      case 'standard': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'commander': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'custom': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getColorIcons = (colors: string[]) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      W: { bg: '#FFFBD5', text: '#000' },
      U: { bg: '#0E68AB', text: '#fff' },
      B: { bg: '#150B00', text: '#fff' },
      R: { bg: '#D3202A', text: '#fff' },
      G: { bg: '#00733E', text: '#fff' }
    };
    
    return colors.map(color => (
      <div
        key={color}
        className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
        style={{ backgroundColor: colorMap[color]?.bg, color: colorMap[color]?.text }}
      >
        {color}
      </div>
    ));
  };

  return (
    <StandardPageLayout
      title="Deck Manager"
      description="Create, analyze, and optimize your Magic: The Gathering decks"
      action={
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Deck
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Deck</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="deck-name">Deck Name</Label>
                <Input
                  id="deck-name"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Enter deck name..."
                />
              </div>
              <div>
                <Label htmlFor="deck-format">Format</Label>
                <Select value={newDeckFormat} onValueChange={(value: any) => setNewDeckFormat(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="commander">Commander</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createDeck} className="w-full">
                Create Deck
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search decks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Deck Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <EnhancedDeckTile
                key={i}
                id=""
                name=""
                format=""
                colors={[]}
                cardCount={0}
                powerLevel={0}
                isLoading={true}
              />
            ))}
          </div>
        ) : filteredDecks.length === 0 ? (
          <Card className="p-8 text-center">
            <CardContent>
              <div className="flex flex-col items-center space-y-3">
                <div className="rounded-full bg-muted p-3">
                  <Crown className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">No decks found</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'Try adjusting your search terms' : 'Create your first deck to get started'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredDecks.map((deck) => (
              <EnhancedDeckTile
                key={deck.id}
                id={deck.id}
                name={deck.name}
                format={deck.format}
                colors={deck.colors}
                cardCount={deck.cardCount}
                powerLevel={deck.powerLevel}
                lastModified={deck.lastModified}
                description={deck.description}
                onEdit={() => {
                  // Navigate to deck builder with this deck loaded
                  window.location.href = `/deckbuilder?deck=${deck.id}`;
                }}
                onView={() => loadDeck(deck)}
                onDuplicate={() => duplicateDeck(deck)}
                onDelete={() => deleteDeck(deck.id)}
              />
            ))}
          </div>
        )}
      </div>
    </StandardPageLayout>
  );
}