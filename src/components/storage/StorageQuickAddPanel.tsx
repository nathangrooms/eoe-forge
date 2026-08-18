import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Layers,
  Check,
  ArrowRight,
  Library,
  Loader2,
} from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { CollectionAPI } from '@/server/routes/collection';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { useCollectionStore } from '@/features/collection/store';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { CardImage } from '@/components/cards';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';

interface StorageQuickAddPanelProps {
  containerId: string;
  /** Fires after every successful assignment so the host can count/refresh. */
  onAdded?: () => void;
}

/**
 * Was `StorageQuickActions`: a full card-search surface nested inside a dialog,
 * which is why it needed `max-w-4xl` and its own scroll container. It is a page
 * now (`/collection/storage/:containerId/add`) and this is just its body.
 */
export function StorageQuickAddPanel({ containerId, onAdded }: StorageQuickAddPanelProps) {
  const [activeTab, setActiveTab] = useState('individual');
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { decks } = useDeckManagementStore();
  const { snapshot } = useCollectionStore();

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
        foil: false,
      });

      showSuccess('Card added', `${card.name} added to this container`);
      onAdded?.();
    } catch (error) {
      console.error('Error adding card:', error);
      showError('Error', 'Failed to add card to container');
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

      for (const card of deck.cards) {
        try {
          await CollectionAPI.addCardByName(
            card.name,
            card.image_uris?.normal || '',
            card.quantity || 1
          );

          await StorageAPI.assignCard({
            container_id: containerId,
            card_id: card.id,
            qty: card.quantity || 1,
            foil: false,
          });

          successCount++;
        } catch (error) {
          console.error(`Failed to add ${card.name}:`, error);
          errorCount++;
        }
      }

      showSuccess(
        'Deck processed',
        `${successCount} cards added${errorCount > 0 ? `, ${errorCount} failed` : ''}`
      );
      onAdded?.();
    } catch (error) {
      console.error('Error adding deck:', error);
      showError('Error', 'Failed to add deck to container');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddFromCollection = async () => {
    if (selectedCards.length === 0 || processing) return;

    try {
      setProcessing(true);
      let successCount = 0;

      for (const cardId of selectedCards) {
        try {
          await new Promise(resolve => setTimeout(resolve, 50));
          await StorageAPI.assignCard({
            container_id: containerId,
            card_id: cardId,
            qty: quantity,
            foil: false,
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to assign card ${cardId}:`, error);
        }
      }

      showSuccess('Cards added', `${successCount} cards added to this container`);
      setSelectedCards([]);
      onAdded?.();
    } catch (error) {
      console.error('Error adding from collection:', error);
      showError('Error', 'Failed to add cards from collection');
    } finally {
      setProcessing(false);
    }
  };

  const collectionCards = snapshot?.items || [];
  const filteredCollectionCards = collectionCards.filter(card =>
    card.card_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabConfig = [
    { id: 'individual', label: 'Search cards', icon: Search },
    { id: 'deck', label: 'From a deck', icon: Layers },
    { id: 'collection', label: 'From collection', icon: Library },
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/40 p-1">
        {tabConfig.map(tab => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="flex flex-col items-center gap-1 py-2.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium sm:text-sm">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Search any card */}
      <TabsContent value="individual" className="m-0 space-y-4">
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Search any Magic card</p>
            <p className="text-xs text-muted-foreground">
              Cards are added to your collection and assigned to this container
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="qty" className="text-sm">
              Qty
            </Label>
            <Input
              id="qty"
              type="number"
              min="1"
              max="99"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 1)}
              className="h-9 w-16 border-0 bg-background/60"
            />
          </div>
        </div>

        <EnhancedUniversalCardSearch
          onCardAdd={handleAddCard}
          onCardSelect={() => {}}
          placeholder="Search for cards to add to this container..."
          showFilters={true}
          showAddButton={true}
          showWishlistButton={false}
          showViewModes={false}
        />
      </TabsContent>

      {/* Whole deck */}
      <TabsContent value="deck" className="m-0 space-y-4">
        {decks.length === 0 ? (
          <div className="rounded-lg bg-muted/40 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background/60">
              <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="mb-1 font-semibold">No decks yet</h3>
            <p className="text-sm text-muted-foreground">
              Create a deck first to add its cards to this container
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select a deck</Label>
              <Select value={selectedDeck} onValueChange={setSelectedDeck}>
                <SelectTrigger className="h-11 border-0 bg-muted/40">
                  <SelectValue placeholder="Choose a deck to add all cards from..." />
                </SelectTrigger>
                <SelectContent>
                  {decks.map(deck => (
                    <SelectItem key={deck.id} value={deck.id}>
                      <div className="flex items-center gap-3">
                        <ColorIdentity colors={deck.colors ?? []} size="xs" />
                        <span className="font-medium">{deck.name}</span>
                        <Badge variant="secondary" className="ml-auto">
                          {deck.cards.length} cards
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDeck && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-md shadow-black/20">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold">
                      {decks.find(d => d.id === selectedDeck)?.name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {decks.find(d => d.id === selectedDeck)?.cards.length} cards will be added
                      to your collection and this container
                    </p>
                  </div>
                </div>
                <Button onClick={handleAddDeck} disabled={processing} size="lg" className="gap-2">
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      Add entire deck
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      {/* From the collection */}
      <TabsContent value="collection" className="m-0 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Filter your collection..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-11 border-0 bg-muted/40 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="qty-coll" className="whitespace-nowrap text-sm">
              Qty each
            </Label>
            <Input
              id="qty-coll"
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 1)}
              className="h-11 w-16 border-0 bg-muted/40"
            />
          </div>
          <Button
            onClick={handleAddFromCollection}
            disabled={selectedCards.length === 0 || processing}
            className="gap-2"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Add selected ({selectedCards.length})
          </Button>
        </div>

        {collectionCards.length === 0 ? (
          <div className="rounded-lg bg-muted/40 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background/60">
              <Library className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="mb-1 font-semibold">Collection empty</h3>
            <p className="text-sm text-muted-foreground">
              Add cards to your collection first using the &ldquo;Search cards&rdquo; tab
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCollectionCards.map(item => {
              const isSelected = selectedCards.includes(item.card_id);
              return (
                <Card
                  key={item.id}
                  className={cn(
                    'cursor-pointer border-0 shadow-md shadow-black/20 transition-colors',
                    isSelected ? 'bg-accent' : 'bg-card hover:bg-accent/50'
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
                      {/* The whole card. This was a 40 x 40 square with
                          `object-cover`, i.e. a 1:1 crop through the middle of
                          a 0.718 card — the name, the cost and the type line
                          all cut away, on the one control whose job is to let
                          you recognise which printing you are filing. It is a
                          real card at the card's own ratio now. */}
                      <CardImage
                        card={item.card ?? { name: item.card_name }}
                        width={56}
                        hideFlip
                        interactive={false}
                        title={item.card_name}
                      >
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-primary/80">
                            <Check
                              className="h-5 w-5 text-primary-foreground"
                              aria-hidden="true"
                            />
                          </div>
                        )}
                      </CardImage>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium">{item.card_name}</h4>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
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
        )}
      </TabsContent>
    </Tabs>
  );
}
