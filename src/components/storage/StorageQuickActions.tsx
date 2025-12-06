import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Search, 
  Package, 
  Layers,
  Zap,
  Check,
  ArrowRight,
  Sparkles,
  Library,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { CollectionAPI } from '@/server/routes/collection';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { useCollectionStore } from '@/features/collection/store';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');
  
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
    if (processing) return; // Prevent race condition from rapid clicks
    
    try {
      setProcessing(true);
      
      // First add to collection if not already there
      const collectionResult = await CollectionAPI.addCardByName(card.name, card.set, quantity);
      if (collectionResult.error) {
        throw new Error(collectionResult.error);
      }

      // Then assign to storage with delay to prevent race condition
      await new Promise(resolve => setTimeout(resolve, 100));
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
    if (selectedCards.length === 0 || processing) return; // Prevent race condition

    try {
      setProcessing(true);
      let successCount = 0;

      for (const cardId of selectedCards) {
        try {
          // Add small delay between assignments to prevent race conditions
          await new Promise(resolve => setTimeout(resolve, 50));
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
  const filteredCollectionCards = collectionCards.filter(card =>
    card.card_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabConfig = [
    { id: 'individual', label: 'Search Cards', icon: Search, description: 'Find and add any card' },
    { id: 'deck', label: 'From Deck', icon: Layers, description: 'Add entire deck' },
    { id: 'collection', label: 'From Collection', icon: Library, description: 'Cards you own' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-card to-background">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-cosmic shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl">Quick Add to Container</DialogTitle>
                <DialogDescription>
                  Search for cards, add from a deck, or pick from your collection
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          {/* Enhanced Tab List */}
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
              {tabConfig.map((tab) => (
                <TabsTrigger 
                  key={tab.id}
                  value={tab.id} 
                  className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Individual Cards Tab */}
          <TabsContent value="individual" className="flex-1 overflow-auto px-6 py-4 space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Search any Magic card</p>
                <p className="text-xs text-muted-foreground">Cards will be added to your collection and assigned to this container</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="qty" className="text-sm">Qty:</Label>
                <Input
                  id="qty"
                  type="number"
                  min="1"
                  max="99"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-16 h-9"
                />
              </div>
            </div>
            
            <EnhancedUniversalCardSearch
              onCardAdd={handleAddCard}
              onCardSelect={() => {}}
              placeholder="Search for cards to add to container..."
              showFilters={true}
              showAddButton={true}
              showWishlistButton={false}
              showViewModes={false}
            />
          </TabsContent>

          {/* Entire Deck Tab */}
          <TabsContent value="deck" className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {decks.length === 0 ? (
              <Card className="border-dashed border-2 border-muted-foreground/20">
                <CardContent className="py-12 px-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Layers className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-2">No Decks Found</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a deck first to add its cards to this container
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Select a Deck</Label>
                  <Select value={selectedDeck} onValueChange={setSelectedDeck}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Choose a deck to add all cards from..." />
                    </SelectTrigger>
                    <SelectContent>
                      {decks.map((deck) => (
                        <SelectItem key={deck.id} value={deck.id}>
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-1">
                              {deck.colors?.slice(0, 3).map((color, i) => (
                                <div 
                                  key={i}
                                  className="w-4 h-4 rounded-full border border-background"
                                  style={{ backgroundColor: color === 'W' ? '#F9FAF4' : color === 'U' ? '#0E68AB' : color === 'B' ? '#150B00' : color === 'R' ? '#D3202A' : color === 'G' ? '#00733E' : '#888' }}
                                />
                              ))}
                            </div>
                            <span className="font-medium">{deck.name}</span>
                            <Badge variant="outline" className="ml-auto">{deck.cards.length} cards</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedDeck && (
                  <Card className="bg-gradient-to-r from-card to-primary/5 border-primary/20">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-primary/10">
                            <Layers className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg">
                              {decks.find(d => d.id === selectedDeck)?.name}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {decks.find(d => d.id === selectedDeck)?.cards.length} cards will be added to collection & container
                            </p>
                          </div>
                        </div>
                        <Button 
                          onClick={handleAddDeck}
                          disabled={processing}
                          size="lg"
                          className="gap-2 bg-gradient-cosmic hover:opacity-90"
                        >
                          {processing ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Processing...
                            </>
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
            )}
          </TabsContent>

          {/* From Collection Tab */}
          <TabsContent value="collection" className="flex-1 overflow-hidden px-6 py-4 flex flex-col gap-4">
            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter your collection..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-11"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="qty-coll" className="text-sm whitespace-nowrap">Qty each:</Label>
                <Input
                  id="qty-coll"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-16 h-11"
                />
              </div>
              <Button 
                onClick={handleAddFromCollection}
                disabled={selectedCards.length === 0 || processing}
                className="gap-2 bg-gradient-cosmic hover:opacity-90"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Add Selected ({selectedCards.length})
              </Button>
            </div>

            {/* Collection Cards Grid */}
            {collectionCards.length === 0 ? (
              <Card className="border-dashed border-2 border-muted-foreground/20 flex-1">
                <CardContent className="py-12 px-6 text-center h-full flex flex-col items-center justify-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Library className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-2">Collection Empty</h3>
                  <p className="text-sm text-muted-foreground">
                    Add cards to your collection first using the "Search Cards" tab
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="flex-1 -mx-2 px-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredCollectionCards.map((item) => {
                    const isSelected = selectedCards.includes(item.card_id);
                    return (
                      <Card 
                        key={item.id}
                        className={cn(
                          "cursor-pointer transition-all duration-200",
                          isSelected 
                            ? "ring-2 ring-primary bg-primary/5 border-primary/50" 
                            : "hover:bg-accent/50 hover:border-primary/30"
                        )}
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
                            <div className="relative w-10 h-10 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                              {item.card?.image_uris?.small && (
                                <img
                                  src={item.card.image_uris.small}
                                  alt={item.card_name}
                                  className="w-full h-full object-cover"
                                />
                              )}
                              {isSelected && (
                                <div className="absolute inset-0 bg-primary/80 flex items-center justify-center">
                                  <Check className="h-5 w-5 text-white" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm truncate">{item.card_name}</h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs">
                                  {item.quantity} owned
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {item.set_code.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}