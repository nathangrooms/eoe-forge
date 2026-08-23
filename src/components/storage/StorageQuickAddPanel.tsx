import { useEffect, useState } from 'react';
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
import { Search, Layers, Check, ArrowRight, Library, Loader2 } from 'lucide-react';
import { StorageAPI, fileCardsIntoContainer } from '@/lib/api/storageAPI';
import { addCardsByName } from '@/lib/api/collectionBatch';
import { CollectionAPI } from '@/server/routes/collection';
import { useDeckManagementStore } from '@/stores/deckManagementStore';
import { useCollectionStore } from '@/features/collection/store';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { CardImage } from '@/components/cards';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import type { StorageSlot } from '@/types/storage';
import { orderSlots, slotLabel, subdivisionFor } from '@/lib/storage/subdivision';
import { withTimeout } from '@/lib/storage/withTimeout';

interface StorageQuickAddPanelProps {
  containerId: string;
  /** Decides what this container's sections are called. */
  containerType?: string;
  /** Pages, dividers or shelves to file straight into. Optional, always. */
  slots?: StorageSlot[];
  /** Preselected section, so opening a page and pressing add files it there. */
  defaultSlotId?: string | null;
  /** Fires after every successful add so the host can refresh its list. */
  onAdded?: () => void;
}

/**
 * The add-cards surface. Mounted in place at the top of a container, and also
 * on its own page at `/collection/storage/:containerId/add` for deep links.
 *
 * ## Why a click here adds instead of navigating
 *
 * Owner, about this exact panel: *"if i click add cards currently, its not good
 * UI, often also goes to card page instead of adding properly. not intuitive at
 * all."* He was right, and the cause was one missing prop. The "Search cards"
 * tab mounts `EnhancedUniversalCardSearch`, which follows the standing rule
 * that clicking a card opens `/cards/:id`. That rule is correct while BROWSING
 * and wrong while PICKING: halfway through filing a box, a click that leaves
 * the page throws the whole task away.
 *
 * So this passes `mode="pick"`. In that mode the card body adds the card and
 * the page does not move; the card's own page stays one click away through the
 * small eye control on each tile. Body picks, affordance opens. The "From
 * collection" tab below already behaved this way, which is why the owner only
 * hit the problem on the other tab.
 *
 * Do not drop `mode="pick"` to make this "consistent" with the rest of the app.
 * It is deliberately inconsistent, in the one place where consistency breaks
 * what the user is doing.
 */
export function StorageQuickAddPanel({
  containerId,
  containerType,
  slots = [],
  defaultSlotId = null,
  onAdded,
}: StorageQuickAddPanelProps) {
  const [activeTab, setActiveTab] = useState('individual');
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [slotId, setSlotId] = useState<string | null>(defaultSlotId);

  const { decks } = useDeckManagementStore();
  const { snapshot } = useCollectionStore();

  const sub = subdivisionFor(containerType);
  const ordered = orderSlots(slots);

  useEffect(() => {
    setSlotId(defaultSlotId);
  }, [defaultSlotId]);

  const describeSlot = () => {
    const index = ordered.findIndex(s => s.id === slotId);
    return index === -1 ? '' : slotLabel(sub, ordered[index], index);
  };

  const handleAddCard = async (card: any) => {
    if (processing) return; // Two quick taps must not file the card twice.

    try {
      setProcessing(true);

      /*
       * Into the collection first: storage records where a card you own is.
       *
       * Every call in here is wrapped in `withTimeout`, because none of them
       * has one of its own. When the API gateway stopped answering during a
       * verification run, this press produced nothing at all: no card, no
       * error, no toast, and `processing` never cleared, so every later press
       * was swallowed too. Silence is the one thing an add must never do.
       */
      const collectionResult = await withTimeout(
        CollectionAPI.addCardByName(card.name, card.set, quantity)
      );
      if (collectionResult.error || !collectionResult.data) {
        throw new Error(collectionResult.error || 'That card is not in our catalogue yet');
      }

      /*
       * File the printing the COLLECTION actually took, not the one the search
       * result happened to be.
       *
       * This used to assign `card.id`, straight off the Scryfall result. Our
       * `cards` table does not hold every printing Scryfall returns, and
       * `addCardByName` resolves a name through `cards_unique` to whichever
       * printing we DO hold, so the two ids routinely disagreed. When they did,
       * the assign hit the `storage_items.card_id` foreign key and the card
       * landed in the collection but never in the container — which is the
       * other half of "not adding properly". The `card_id` on the collection
       * row is the id that is guaranteed to exist.
       *
       * The 100ms sleep that used to sit here as a "delay to prevent race
       * condition" is gone with it. These are sequential awaits against one
       * client; the write is committed before the next read is issued.
       */
      await withTimeout(
        StorageAPI.assignCard({
          container_id: containerId,
          slot_id: slotId,
          card_id: collectionResult.data.card_id,
          qty: quantity,
          foil: false,
        })
      );

      const where = slotId ? `, ${describeSlot()}` : '';
      showSuccess('Added', `${card.name} is in this container${where}`);
      onAdded?.();
    } catch (error) {
      console.error('Error adding card:', error);
      showError(
        'Could not add that card',
        error instanceof Error ? error.message : 'Something went wrong'
      );
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

      /*
       * THE WHOLE DECK IN A HANDFUL OF REQUESTS, not eleven per card.
       *
       * This was a loop over `deck.cards` calling `CollectionAPI.addCardByName`
       * and then `StorageAPI.assignCard`. Nothing in it looks like a query —
       * `deck.cards` reads like the local array it is — but neither helper is
       * one request. Measured at 1,100 requests for one press of this button on
       * a 100 card Commander deck, exactly 11 per card, 300 of them round trips
       * to the auth server for a user id the client already held.
       *
       * `addCardsByName` resolves every name in one query and writes the
       * collection in two. `fileCardsIntoContainer` reads what is owned and
       * what is already filed, then writes the container. Both chunk their
       * `.in()` lists, because ten thousand ids in one URL is its own outage.
       *
       * This also used to pass `card.image_uris?.normal` as the SET CODE, so
       * every lookup carried a URL where a three-letter code belongs and
       * matched nothing. Resolving by name alone gets the printing we hold.
       */
      const added = await withTimeout(
        addCardsByName(deck.cards.map(card => ({ name: card.name, quantity: card.quantity || 1 })))
      );

      for (const row of added) {
        if (row.error) console.error(`Failed to add ${row.name}:`, row.error);
      }

      const intoCollection = added.filter(row => !row.error && row.cardId);
      const filed = await withTimeout(
        fileCardsIntoContainer(
          containerId,
          intoCollection.map(row => ({
            card_id: row.cardId as string,
            qty: row.quantity,
            foil: false,
          })),
          slotId
        )
      );

      /* A card counts as added when it reached the CONTAINER, which is what
         this button says it does. Both legs still count as a failure: a name
         that resolved to nothing and a card that could not be filed are each
         one that "could not be". */
      const refused = new Set(filed.failed.map(failure => failure.card_id));
      const successCount = intoCollection.filter(
        row => !refused.has(row.cardId as string)
      ).length;
      const errorCount = deck.cards.length - successCount;

      /* "Deck filed, 0 cards added" was still a success message. If nothing
         landed, nothing was filed, and the screen has to say so. */
      if (successCount > 0) {
        showSuccess(
          'Deck filed',
          `${successCount} cards added${errorCount > 0 ? `, ${errorCount} could not be` : ''}`
        );
        onAdded?.();
      } else {
        showError('Nothing was added', 'None of those cards could go into this container');
      }
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

      /* One batch, not one assign per picked card. `StorageAPI.assignCard` is
         five requests each, so picking 100 rows was 500. */
      const filed = await withTimeout(
        fileCardsIntoContainer(
          containerId,
          selectedCards.map(cardId => ({ card_id: cardId, qty: quantity, foil: false })),
          slotId
        )
      );

      for (const failure of filed.failed) {
        console.error(`Failed to assign card ${failure.card_id}:`, failure.reason);
      }

      const failed = filed.failed.length;
      const successCount = selectedCards.length - failed;
      const firstReason = filed.failed[0]?.reason ?? '';

      /* Say what actually happened. This reported "N cards are in this
         container" from the success count alone, so a run where every single
         card was refused announced "0 cards are in this container" as a
         success, with the reason only in the console. */
      if (successCount > 0) {
        showSuccess(
          'Added',
          `${successCount} ${successCount === 1 ? 'card is' : 'cards are'} in this container` +
            (failed > 0 ? `, ${failed} could not be` : '')
        );
        setSelectedCards([]);
        onAdded?.();
      } else {
        showError(
          failed === 1 ? 'That card could not be added' : 'None of those could be added',
          firstReason || 'Something went wrong'
        );
      }
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
    <div className="flex flex-col gap-4">
      {/* Where in the container it lands. Always optional: "straight in" comes
          first and is the default, so nobody is made to choose a page. */}
      {ordered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 p-2.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            File into
          </span>
          <Button
            size="sm"
            variant={slotId === null ? 'default' : 'secondary'}
            onClick={() => setSlotId(null)}
          >
            Straight in
          </Button>
          {ordered.map((slot, index) => (
            <Button
              key={slot.id}
              size="sm"
              variant={slotId === slot.id ? 'default' : 'secondary'}
              onClick={() => setSlotId(slot.id)}
            >
              {slotLabel(sub, slot, index)}
            </Button>
          ))}
        </div>
      )}

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
                Tap a card to put it in this container. It goes into your collection too.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="qty" className="text-sm">
                Copies
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

          {/* mode="pick": a click on a card ADDS it and stays here. See the
              header comment above for why this one surface is different. */}
          <EnhancedUniversalCardSearch
            mode="pick"
            onCardAdd={handleAddCard}
            placeholder="Search for cards to add to this container"
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
                Build a deck first and you can file the whole thing in one go
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select a deck</Label>
                <Select value={selectedDeck} onValueChange={setSelectedDeck}>
                  <SelectTrigger className="h-11 border-0 bg-muted/40">
                    <SelectValue placeholder="Choose a deck to add all cards from" />
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
                        {decks.find(d => d.id === selectedDeck)?.cards.length} cards go into your
                        collection and this container
                      </p>
                    </div>
                  </div>
                  <Button onClick={handleAddDeck} disabled={processing} size="lg" className="gap-2">
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Working…
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        Add the whole deck
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
                placeholder="Filter your collection"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-11 border-0 bg-muted/40 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="qty-coll" className="whitespace-nowrap text-sm">
                Copies each
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
              Add picked ({selectedCards.length})
            </Button>
          </div>

          {collectionCards.length === 0 ? (
            <div className="rounded-lg bg-muted/40 px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background/60">
                <Library className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="mb-1 font-semibold">Nothing in your collection yet</h3>
              <p className="text-sm text-muted-foreground">
                Use the Search cards tab and a card goes into both at once
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
                    /* A click PICKS the card, and `CardImage` carries
                       interactive={false} so the art cannot navigate either.
                       This tab was always right. The search tab is the one that
                       had to be brought into line with it. */
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
    </div>
  );
}
