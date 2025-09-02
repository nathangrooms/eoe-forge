import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Search, 
  Package, 
  Users, 
  Layers,
  Zap,
  Check,
  ArrowRight
} from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { CollectionAPI } from '@/server/routes/collection';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { useCollectionStore } from '@/features/collection/store';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { useToast } from '@/hooks/use-toast';

interface StorageQuickActionsProps {
  isOpen: boolean;
  onClose: () => void;
  containerId: string;
  onSuccess: () => void;
}

export function StorageQuickActions({ 
  isOpen, 
  onClose, 
  containerId, 
  onSuccess 
}: StorageQuickActionsProps) {
  const [activeTab, setActiveTab] = useState('individual');
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  
  const { decks } = useDeckManagementStore();
  const { snapshot } = useCollectionStore();
  const { toast } = useToast();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedDeck('');
      setSelectedCards([]);
      setQuantity(1);
      setProcessing(false);
    }
  }, [isOpen]);

  const handleAddCard = async (card: any) => {
    try {
      setProcessing(true);
      
      // First add to collection if not already there
      const collectionResult = await CollectionAPI.addCardByName(card.name, card.set, quantity);
      if (collectionResult.error) {
        throw new Error(collectionResult.error);
      }

      // Then assign to storage
      await StorageAPI.assignCard({
        container_id: containerId,
        card_id: card.id,
        qty: quantity,
        foil: false
      });

      toast({
        title: "Card Added",
        description: `${card.name} added to container`
      });

      onSuccess();
    } catch (error) {
      console.error('Error adding card:', error);
      toast({
        title: "Error",
        description: "Failed to add card to container",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleAddDeck = async () => {
    if (!selectedDeck) return;

    try {
      setProcessing(true);
      const deck = decks.find(d => d.id === selectedDeck);
      if (!deck) throw new Error('Deck not found');

      let successCount = 0;
      let errorCount = 0;

      // Process each card in the deck
      for (const card of deck.cards) {
        try {
          // Add to collection first
          await CollectionAPI.addCardByName(card.name, card.image_uris?.normal || '', card.quantity || 1);
          
          // Then assign to storage
          await StorageAPI.assignCard({
            container_id: containerId,
            card_id: card.id,
            qty: card.quantity || 1,
            foil: false
          });
          
          successCount++;
        } catch (error) {
          console.error(`Failed to add ${card.name}:`, error);
          errorCount++;
        }
      }

      toast({
        title: "Deck Processing Complete",
        description: `${successCount} cards added${errorCount > 0 ? `, ${errorCount} failed` : ''}`
      });

      onSuccess();
    } catch (error) {
      console.error('Error adding deck:', error);
      toast({
        title: "Error",
        description: "Failed to add deck to container",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleAddFromCollection = async () => {
    if (selectedCards.length === 0) return;

    try {
      setProcessing(true);
      let successCount = 0;

      for (const cardId of selectedCards) {
        try {
          await StorageAPI.assignCard({
            container_id: containerId,
            card_id: cardId,
            qty: quantity,
            foil: false
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to assign card ${cardId}:`, error);
        }
      }

      toast({
        title: "Cards Added",
        description: `${successCount} cards added to container`
      });

      onSuccess();
    } catch (error) {
      console.error('Error adding from collection:', error);
      toast({
        title: "Error",
        description: "Failed to add cards from collection",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const collectionCards = snapshot?.items || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Quick Add to Container
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="individual" className="gap-2">
              <Plus className="h-4 w-4" />
              Individual Cards
            </TabsTrigger>
            <TabsTrigger value="deck" className="gap-2">
              <Layers className="h-4 w-4" />
              Entire Deck
            </TabsTrigger>
            <TabsTrigger value="collection" className="gap-2">
              <Package className="h-4 w-4" />
              From Collection
            </TabsTrigger>
          </TabsList>

          {/* Individual Cards Tab */}
          <TabsContent value="individual" className="flex-1 overflow-auto space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-3">
                <Label>Search and Add Cards</Label>
                <EnhancedUniversalCardSearch
                  onCardAdd={handleAddCard}
                  onCardSelect={() => {}}
                  placeholder="Search for cards to add to container..."
                  showFilters={true}
                  showAddButton={true}
                  showWishlistButton={false}
                  showViewModes={false}
                />
              </div>
            </div>
          </TabsContent>

          {/* Entire Deck Tab */}
          <TabsContent value="deck" className="flex-1 overflow-auto space-y-4">
            <div className="space-y-4">
              <div>
                <Label>Select Deck</Label>
                <Select value={selectedDeck} onValueChange={setSelectedDeck}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a deck to add..." />
                  </SelectTrigger>
                  <SelectContent>
                    {decks.map((deck) => (
                      <SelectItem key={deck.id} value={deck.id}>
                        <div className="flex items-center gap-2">
                          <span>{deck.name}</span>
                          <Badge variant="outline">{deck.cards.length} cards</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDeck && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {decks.find(d => d.id === selectedDeck)?.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {decks.find(d => d.id === selectedDeck)?.cards.length} cards will be added
                        </p>
                      </div>
                      <Button 
                        onClick={handleAddDeck}
                        disabled={processing}
                        className="gap-2"
                      >
                        {processing ? (
                          <>Processing...</>
                        ) : (
                          <>
                            <ArrowRight className="h-4 w-4" />
                            Add Entire Deck
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* From Collection Tab */}
          <TabsContent value="collection" className="flex-1 overflow-auto space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qty">Quantity per card</Label>
                  <Input
                    id="qty"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleAddFromCollection}
                    disabled={selectedCards.length === 0 || processing}
                    className="w-full gap-2"
                  >
                    <Check className="h-4 w-4" />
                    Add Selected ({selectedCards.length})
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Select Cards from Collection</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-auto">
                  {collectionCards.map((item) => (
                    <Card 
                      key={item.id}
                      className={`cursor-pointer transition-all ${
                        selectedCards.includes(item.card_id) 
                          ? 'ring-2 ring-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        setSelectedCards(prev => 
                          prev.includes(item.card_id)
                            ? prev.filter(id => id !== item.card_id)
                            : [...prev, item.card_id]
                        );
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-muted rounded overflow-hidden flex-shrink-0">
                            {item.card?.image_uris?.small && (
                              <img
                                src={item.card.image_uris.small}
                                alt={item.card_name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate">{item.card_name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} available • {item.set_code.toUpperCase()}
                            </p>
                          </div>
                          {selectedCards.includes(item.card_id) && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}