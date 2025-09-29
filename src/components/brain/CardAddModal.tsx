import { useState, useEffect } from 'react';
import { Plus, Package, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';

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

interface CardAddModalProps {
  card: CardData;
  compact?: boolean;
}

export function CardAddModal({ card, compact = false }: CardAddModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Destination toggles
  const [addToCollection, setAddToCollection] = useState(true);
  const [addToDeck, setAddToDeck] = useState(false);
  const [addToBox, setAddToBox] = useState(false);
  const [addToWishlist, setAddToWishlist] = useState(false);
  
  // Selected targets
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [selectedBox, setSelectedBox] = useState<string>('');
  
  // Data
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [storageContainers, setStorageContainers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadDecks();
      loadStorageContainers();
    }
  }, [isOpen]);

  const loadDecks = async () => {
    try {
      const deckList = await DeckAPI.getDeckSummaries();
      setDecks(deckList);
    } catch (error) {
      console.error('Error loading decks:', error);
    }
  };

  const loadStorageContainers = async () => {
    try {
      const { data: containers, error } = await supabase
        .from('storage_containers')
        .select('id, name, type')
        .order('name');
      
      if (error) throw error;
      setStorageContainers(containers || []);
    } catch (error) {
      console.error('Error loading storage containers:', error);
    }
  };

  const handleAddCard = async () => {
    if (!addToCollection && !addToDeck && !addToBox && !addToWishlist) {
      toast.error('Please select at least one destination');
      return;
    }

    if (addToDeck && !selectedDeck) {
      toast.error('Please select a deck');
      return;
    }

    if (addToBox && !selectedBox) {
      toast.error('Please select a storage box');
      return;
    }

    setIsLoading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to add cards');
        return;
      }

      const promises = [];

      // Add to collection
      if (addToCollection) {
        promises.push(
          supabase.from('user_collections').insert({
            card_id: (card as any).id || card.name,
            card_name: card.name,
            set_code: (card as any).set || 'UNK',
            quantity: 1,
            foil: 0,
            user_id: user.id
          })
        );
      }

      // Add to deck
      if (addToDeck && selectedDeck) {
        promises.push(
          supabase.from('deck_cards').insert({
            deck_id: selectedDeck,
            card_id: card.name, // Using card name as card_id for now
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
            card_id: (card as any).id || card.name,
            card_name: card.name,
            quantity: 1,
            priority: 'medium',
            note: `Added from DeckMatrix AI analysis`,
            user_id: user.id
          })
        );
      }

      // Add to storage box
      if (addToBox && selectedBox) {
        promises.push(
          supabase.from('storage_items').insert({
            container_id: selectedBox,
            card_id: card.name, // Using card name as card_id for now
            qty: 1,
            foil: false
          })
        );
      }

      await Promise.all(promises);

      const destinations = [];
      if (addToCollection) destinations.push('Collection');
      if (addToDeck) destinations.push('Deck');
      if (addToBox) destinations.push('Storage Box');
      if (addToWishlist) destinations.push('Wishlist');

      toast.success(`Added ${card.name} to ${destinations.join(', ')}`);
      setIsOpen(false);
    } catch (error) {
      console.error('Error adding card:', error);
      toast.error('Failed to add card. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getActiveDestinations = () => {
    const destinations = [];
    if (addToCollection) destinations.push('Collection');
    if (addToDeck) destinations.push('Deck');
    if (addToBox) destinations.push('Box');
    if (addToWishlist) destinations.push('Wishlist');
    return destinations;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Add card">
            <Plus className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-3 w-3 mr-1" />
            Add Card
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Add {card.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Card Preview */}
          <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
            {card.image_uri && (
              <img
                src={card.image_uri}
                alt={card.name}
                className="w-16 h-auto rounded aspect-[5/7] object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{card.name}</div>
              <div className="text-xs text-muted-foreground">{card.mana_cost} • {card.type_line}</div>
            </div>
          </div>

          {/* Destinations */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Add to:</Label>
            
            {/* Collection */}
            <div className="flex items-center justify-between">
              <Label htmlFor="collection-toggle" className="text-sm">Collection</Label>
              <Switch
                id="collection-toggle"
                checked={addToCollection}
                onCheckedChange={setAddToCollection}
              />
            </div>

            {/* Deck */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="deck-toggle" className="text-sm">Deck</Label>
                <Switch
                  id="deck-toggle"
                  checked={addToDeck}
                  onCheckedChange={setAddToDeck}
                />
              </div>
              {addToDeck && (
                <Select value={selectedDeck} onValueChange={setSelectedDeck}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select deck..." />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-32">
                      {decks.map((deck) => (
                        <SelectItem key={deck.id} value={deck.id}>
                          {deck.name} ({deck.format})
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Storage Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="box-toggle" className="text-sm">Storage Box</Label>
                <Switch
                  id="box-toggle"
                  checked={addToBox}
                  onCheckedChange={setAddToBox}
                />
              </div>
              {addToBox && (
                <Select value={selectedBox} onValueChange={setSelectedBox}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select storage box..." />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-32">
                      {storageContainers.map((container) => (
                        <SelectItem key={container.id} value={container.id}>
                          {container.name} ({container.type})
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Wishlist */}
            <div className="flex items-center justify-between">
              <Label htmlFor="wishlist-toggle" className="text-sm">Wishlist</Label>
              <Switch
                id="wishlist-toggle"
                checked={addToWishlist}
                onCheckedChange={setAddToWishlist}
              />
            </div>
          </div>

          {/* Summary */}
          {getActiveDestinations().length > 0 && (
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground mb-2">Adding to:</div>
              <div className="flex flex-wrap gap-1">
                {getActiveDestinations().map((dest) => (
                  <Badge key={dest} variant="secondary" className="text-xs">
                    {dest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddCard}
              disabled={isLoading || getActiveDestinations().length === 0}
              className="flex-1"
            >
              {isLoading ? 'Adding...' : 'Add Card'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}