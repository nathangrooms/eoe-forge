import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  Settings,
  Star,
  StarOff,
  TrendingUp,
  DollarSign,
  Target,
  Package
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { useCollectionStore } from '@/stores/collectionStore';
import { RefreshedDeckTile } from '@/components/deck-builder/RefreshedDeckTile';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ModernDeckList } from '@/components/deck-builder/ModernDeckList';
import { EnhancedAnalysisPanel } from '@/components/deck-builder/EnhancedAnalysisPanel';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import { ArchetypeLibrary } from '@/components/deck-builder/ArchetypeLibrary';
import { DeckImportExport } from '@/components/deck-builder/DeckImportExport';
import { DeckAnalysisModal } from '@/components/deck-builder/DeckAnalysisModal';
import { MissingCardsDrawer } from '@/components/deck-builder/MissingCardsDrawer';
import { buildDeck, getTemplatesForFormat, getFormatRules } from '@/lib/deckbuilder';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState<'standard' | 'commander' | 'custom'>('standard');
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [buildingDeck, setBuildingDeck] = useState(false);
  
  // Analysis modal state
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [selectedDeckSummary, setSelectedDeckSummary] = useState<DeckSummary | null>(null);
  
  // Missing cards drawer state
  const [showMissingDrawer, setShowMissingDrawer] = useState(false);
  const [missingDeckId, setMissingDeckId] = useState<string>('');
  const [missingDeckName, setMissingDeckName] = useState<string>('');
  
  // AI Deck Builder state
  const [aiFormat, setAiFormat] = useState('standard');
  const [aiArchetype, setAiArchetype] = useState('');
  const [aiPowerLevel, setAiPowerLevel] = useState(6);
  const [aiColors, setAiColors] = useState<string[]>([]);
  
  // Available templates for selected format
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  
  // Real decks data from Supabase + Local store
  const [deckSummaries, setDeckSummaries] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Get local decks from store
  const { decks: localDecks } = useDeckManagementStore();

  const deck = useDeckStore();
  const collection = useCollectionStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Load decks from database and get summaries
  useEffect(() => {
    loadDeckSummaries();
  }, [user, localDecks]);
  
  // Load available templates when format changes
  useEffect(() => {
    const templates = getTemplatesForFormat(aiFormat);
    setAvailableTemplates(templates);
    if (templates.length > 0 && !aiArchetype) {
      setAiArchetype(templates[0].id);
    }
  }, [aiFormat]);

  const loadDeckSummaries = async () => {
    if (!user) {
      console.log('No user found, skipping deck summary load');
      setLoading(false);
      return;
    }

    try {
      console.log('Loading deck summaries for user:', user.id);
      // Load deck summaries from new API
      const summaries = await DeckAPI.getDeckSummaries();
      console.log('Loaded deck summaries:', summaries);
      setDeckSummaries(summaries);
    } catch (error) {
      console.error('Error loading deck summaries:', error);
      showError('Error', 'Failed to load deck summaries');
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

  // Filter deck summaries based on search
  const filteredDecks = deckSummaries.filter(d => 
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

      // Refresh deck summaries
      await loadDeckSummaries();
      setNewDeckName('');
      setShowCreateDialog(false);
      showSuccess("Deck Created", `"${newDeckName}" has been created successfully`);
    } catch (error) {
      console.error('Error creating deck:', error);
    }
  };

  const handleDeleteRequest = (deckSummary: DeckSummary) => {
    // Convert DeckSummary to Deck for compatibility
    const deck: Deck = {
      id: deckSummary.id,
      name: deckSummary.name,
      format: deckSummary.format as any,
      powerLevel: deckSummary.power.score,
      colors: deckSummary.colors,
      cardCount: deckSummary.counts.total,
      lastModified: new Date(deckSummary.updatedAt),
      description: ''
    };
    setDeckToDelete(deck);
    setShowDeleteDialog(true);
  };

  const confirmDeleteDeck = async () => {
    if (!deckToDelete) return;

    try {
      const isLocalDeck = deckToDelete.name.includes('(Local)');
      
      if (isLocalDeck) {
        // Handle local deck deletion
        const deckManagementStore = useDeckManagementStore.getState();
        deckManagementStore.deleteDeck(deckToDelete.id);
        showSuccess("Deck Deleted", `"${deckToDelete.name}" has been deleted successfully`);
      } else {
        // Handle Supabase deck deletion
        const { error } = await supabase
          .from('user_decks')
          .delete()
          .eq('id', deckToDelete.id);

        if (error) {
          console.error('Error deleting deck:', error);
          showError("Delete Failed", "Failed to delete deck. Please try again.");
          return;
        }

        showSuccess("Deck Deleted", `"${deckToDelete.name}" has been deleted successfully`);
      }

      // Refresh deck summaries
      await loadDeckSummaries();
    } catch (error) {
      console.error('Error deleting deck:', error);
      showError("Delete Failed", "Failed to delete deck. Please try again.");
    } finally {
      setShowDeleteDialog(false);
      setDeckToDelete(null);
    }
  };

  const duplicateDeck = async (deckSummary: DeckSummary) => {
    try {
      const newDeckId = await DeckAPI.duplicateDeck(deckSummary.id);
      showSuccess('Deck Duplicated', `Created copy of "${deckSummary.name}"`);
      // Refresh deck summaries to show the new deck
      await loadDeckSummaries();
    } catch (error) {
      console.error('Error duplicating deck:', error);
      showError('Error', 'Failed to duplicate deck');
    }
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
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 space-y-2">
                      <div className="h-6 bg-muted rounded w-1/3" />
                      <div className="h-4 bg-muted rounded w-1/2" />
                    </div>
                    <div className="h-8 bg-muted rounded w-16" />
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="h-20 bg-muted rounded" />
                    <div className="h-20 bg-muted rounded" />
                    <div className="h-20 bg-muted rounded" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-16 bg-muted rounded" />
                    <div className="h-16 bg-muted rounded" />
                    <div className="h-16 bg-muted rounded" />
                  </div>
                </CardContent>
              </Card>
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
          <div className="space-y-4">
            {filteredDecks.map((deckSummary) => (
              <RefreshedDeckTile
                key={deckSummary.id}
                deckSummary={deckSummary}
                onEdit={() => navigate(`/deck-builder?deck=${deckSummary.id}`)}
                onDuplicate={() => duplicateDeck(deckSummary)}
                onDelete={() => handleDeleteRequest(deckSummary)}
                onAnalysis={() => {
                  setSelectedDeckSummary(deckSummary);
                  setShowAnalysisModal(true);
                }}
                onMissingCards={() => {
                  setMissingDeckId(deckSummary.id);
                  setMissingDeckName(deckSummary.name);
                  setShowMissingDrawer(true);
                }}
                onExport={() => {
                  // TODO: Implement export with download
                  console.log('Export deck:', deckSummary.id);
                }}
                onDeckbox={() => {
                  // TODO: Open storage drawer
                  console.log('Open deckbox for:', deckSummary.id);
                }}
                onFavoriteChange={() => {
                  // Refresh summaries to update favorite status
                  loadDeckSummaries();
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deckToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteDeck}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Deck
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Analysis Modal */}
      {selectedDeckSummary && (
        <DeckAnalysisModal
          isOpen={showAnalysisModal}
          onClose={() => {
            setShowAnalysisModal(false);
            setSelectedDeckSummary(null);
          }}
          deckSummary={selectedDeckSummary}
          onOpenBuilder={() => {
            setShowAnalysisModal(false);
            navigate(`/deck-builder?deck=${selectedDeckSummary.id}`);
          }}
        />
      )}

      {/* Missing Cards Drawer */}
      <MissingCardsDrawer
        isOpen={showMissingDrawer}
        onClose={() => setShowMissingDrawer(false)}
        deckId={missingDeckId}
        deckName={missingDeckName}
      />
    </StandardPageLayout>
  );
}