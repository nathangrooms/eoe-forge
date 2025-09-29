import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Crown, Package, Plus, Check, Box, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageContainer } from '@/types/storage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CardData {
  name: string;
  image_uri?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  cmc?: number;
  colors?: string[];
  rarity?: string;
}

interface CardAdditionPanelProps {
  card: CardData;
  defaultExpanded?: boolean;
}

export function CardAdditionPanel({ card, defaultExpanded = false }: CardAdditionPanelProps) {
  const { decks } = useDeckManagementStore();
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [addToCollection, setAddToCollection] = useState(true);
  const [addToDeck, setAddToDeck] = useState(false);
  const [addToBox, setAddToBox] = useState(false);
  const [addToWishlist, setAddToWishlist] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [storageContainers, setStorageContainers] = useState<StorageContainer[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load storage containers
  useEffect(() => {
    const loadContainers = async () => {
      try {
        const overview = await StorageAPI.getOverview();
        setStorageContainers(overview.containers.map(c => ({
          id: c.id,
          user_id: c.user_id,
          name: c.name,
          type: c.type,
          color: c.color,
          icon: c.icon,
          is_default: c.is_default,
          deck_id: c.deck_id,
          created_at: c.created_at,
          updated_at: c.updated_at
        })));
      } catch (error) {
        console.error('Failed to load storage containers:', error);
      }
    };
    loadContainers();
  }, []);

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      U: 'bg-blue-100 text-blue-800 border-blue-300', 
      B: 'bg-gray-100 text-gray-800 border-gray-300',
      R: 'bg-red-100 text-red-800 border-red-300',
      G: 'bg-green-100 text-green-800 border-green-300'
    };
    
    return (
      <div className="flex gap-1">
        {colors.map(color => (
          <div 
            key={color}
            className={`w-3 h-3 rounded-full border ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  const getActiveSummary = () => {
    const targets = [
      addToCollection && 'Collection',
      addToDeck && selectedDeckId && decks.find(d => d.id === selectedDeckId)?.name,
      addToBox && selectedBoxId && storageContainers.find(c => c.id === selectedBoxId)?.name,
      addToWishlist && 'Wishlist'
    ].filter(Boolean);
    
    return targets.length > 0 ? targets.join(' + ') : 'Select destinations';
  };

  const handleAddCard = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const cardId = card.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const promises = [];

      // Add to collection
      if (addToCollection) {
        promises.push(
          supabase.from('user_collections').insert({
            user_id: user.id,
            card_id: cardId,
            card_name: card.name,
            set_code: 'unknown',
            quantity: 1,
            foil: 0,
            condition: 'near_mint'
          })
        );
      }

      // Add to deck
      if (addToDeck && selectedDeckId) {
        promises.push(
          supabase.from('deck_cards').insert({
            deck_id: selectedDeckId,
            card_id: cardId,
            card_name: card.name,
            quantity: 1,
            is_commander: false,
            is_sideboard: false
          })
        );
      }

      // Add to wishlist
      if (addToWishlist) {
        promises.push(
          supabase.from('wishlist').insert({
            user_id: user.id,
            card_id: cardId,
            card_name: card.name,
            quantity: 1,
            priority: 'medium'
          })
        );
      }

      // Execute all operations
      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');
      
      if (failures.length === 0) {
        toast.success(`Added ${card.name} to ${getActiveSummary()}`);
      } else {
        toast.error(`Some operations failed when adding ${card.name}`);
      }
    } catch (error) {
      console.error('Error adding card:', error);
      toast.error('Failed to add card');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg bg-background/50">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">Add to Collection</span>
            </div>
            <div className="flex items-center gap-2">
              {!isExpanded && (
                <Badge variant="secondary" className="text-xs">
                  {getActiveSummary()}
                </Badge>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="p-3 pt-0 space-y-4">
            {/* Toggle Options */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium">Collection</span>
                </div>
                <Button
                  variant={addToCollection ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setAddToCollection(!addToCollection)}
                >
                  {addToCollection && <Check className="h-3 w-3 mr-1" />}
                  {addToCollection ? 'On' : 'Off'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-pink-500" />
                  <span className="text-xs font-medium">Wishlist</span>
                </div>
                <Button
                  variant={addToWishlist ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setAddToWishlist(!addToWishlist)}
                >
                  {addToWishlist && <Check className="h-3 w-3 mr-1" />}
                  {addToWishlist ? 'On' : 'Off'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium">Deck</span>
                </div>
                <Button
                  variant={addToDeck ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setAddToDeck(!addToDeck)}
                >
                  {addToDeck && <Check className="h-3 w-3 mr-1" />}
                  {addToDeck ? 'On' : 'Off'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-orange-500" />
                  <span className="text-xs font-medium">Box</span>
                </div>
                <Button
                  variant={addToBox ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setAddToBox(!addToBox)}
                >
                  {addToBox && <Check className="h-3 w-3 mr-1" />}
                  {addToBox ? 'On' : 'Off'}
                </Button>
              </div>
            </div>

            {/* Selection Dropdowns */}
            {(addToDeck || addToBox) && (
              <div className="space-y-3">
                {addToDeck && (
                  <div className="space-y-2">
                    <Label className="text-xs">Select Deck</Label>
                    <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose deck..." />
                      </SelectTrigger>
                      <SelectContent>
                        {decks.map(deck => (
                          <SelectItem key={deck.id} value={deck.id}>
                            <div className="flex items-center gap-2">
                              <span className="truncate">{deck.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {deck.format}
                              </Badge>
                              {deck.colors.length > 0 && getColorIndicator(deck.colors)}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {addToBox && (
                  <div className="space-y-2">
                    <Label className="text-xs">Select Box</Label>
                    <Select value={selectedBoxId} onValueChange={setSelectedBoxId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose box..." />
                      </SelectTrigger>
                      <SelectContent>
                        {storageContainers.map(container => (
                          <SelectItem key={container.id} value={container.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full border" 
                                style={{ backgroundColor: container.color || '#64748b' }}
                              />
                              <span className="truncate">{container.name}</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {container.type}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Add Button */}
            <Button 
              onClick={handleAddCard}
              disabled={isProcessing || (!addToCollection && !addToWishlist && !addToDeck && !addToBox)}
              className="w-full h-8 text-xs"
            >
              {isProcessing ? 'Adding...' : `Add ${card.name}`}
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}