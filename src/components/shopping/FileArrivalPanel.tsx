import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CardImage } from '@/components/cards';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';
import {
  FINISH_LABEL,
  loadFilingDestinations,
  loadPrintings,
  useCardLists,
  type CardListItem,
  type Finish,
  type FilingDestinations,
} from '@/lib/shopping';

/**
 * Putting an arrived card away.
 *
 * The person doing this has just opened a parcel of twenty cards, so speed is
 * the whole design. Three things make it quick:
 *
 *  - the destinations are remembered between cards for the session, because a
 *    parcel almost always goes into one box, so the twentieth card is one click
 *    rather than three;
 *  - the deck that needed the card is pre-selected where the list knows it;
 *  - the different-printing case is folded away and only unfolds when the card
 *    in hand is not the one that was ordered, which is the uncommon case.
 *
 * A right-hand slide-out, not a dialog: the arrivals list stays visible behind
 * it so the player can see how many are left.
 */

/* Remembered across cards for the session. Not persisted: a box you used last
   week is not evidence about the parcel in front of you today. */
let lastContainerId: string | null = null;
let lastToCollection = true;

export interface FileArrivalPanelProps {
  item: CardListItem | null;
  onOpenChange: (open: boolean) => void;
}

export function FileArrivalPanel({ item, onOpenChange }: FileArrivalPanelProps) {
  const { user } = useAuth();
  const file = useCardLists(state => state.file);
  const markArrived = useCardLists(state => state.markArrived);

  const [destinations, setDestinations] = useState<FilingDestinations>({ containers: [], decks: [] });
  const [toCollection, setToCollection] = useState(lastToCollection);
  const [containerId, setContainerId] = useState<string | null>(lastContainerId);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [swapOpen, setSwapOpen] = useState(false);
  const [printings, setPrintings] = useState<any[]>([]);
  const [arrivedCardId, setArrivedCardId] = useState<string | null>(null);
  const [arrivedFinish, setArrivedFinish] = useState<Finish | null>(null);

  useEffect(() => {
    if (!user || !item) return;
    loadFilingDestinations(user.id)
      .then(setDestinations)
      .catch(error => console.error('Could not load where to file this:', error));
  }, [user, item]);

  useEffect(() => {
    if (!item) return;
    setToCollection(lastToCollection);
    setContainerId(lastContainerId);
    // The deck that wanted the card is the obvious destination, so it is
    // offered rather than made the player hunt for it.
    setDeckId(item.source_deck_id ?? item.filed_deck_id ?? null);
    setSwapOpen(false);
    setArrivedCardId(item.arrived_card_id);
    setArrivedFinish(item.arrived_finish);
  }, [item]);

  const openSwap = useCallback(async () => {
    setSwapOpen(true);
    if (printings.length > 0 || !item) return;
    try {
      setPrintings(await loadPrintings(item.oracle_id, item.card_name));
    } catch (error) {
      console.error('Could not load the other versions:', error);
    }
  }, [item, printings.length]);

  const submit = async () => {
    if (!item) return;
    setSaving(true);
    try {
      // A different printing is recorded on the row before anything is filed,
      // so the collection gets the card that is actually in the player's hand.
      if (
        (arrivedCardId && arrivedCardId !== item.card_id) ||
        (arrivedFinish && arrivedFinish !== item.finish)
      ) {
        await markArrived(item.id, { cardId: arrivedCardId, finish: arrivedFinish });
      }

      await file({
        itemId: item.id,
        toCollection,
        containerId,
        deckId,
      });

      lastContainerId = containerId;
      lastToCollection = toCollection;

      const where = [
        toCollection ? 'your collection' : null,
        containerId ? destinations.containers.find(c => c.id === containerId)?.name ?? 'a box' : null,
        deckId ? destinations.decks.find(d => d.id === deckId)?.name ?? 'a deck' : null,
      ].filter(Boolean);

      showSuccess(
        'Filed away',
        where.length > 0 ? `${item.card_name} went into ${where.join(', ')}.` : `${item.card_name} is done.`
      );
      onOpenChange(false);
    } catch (error: any) {
      showError('Could not file that', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const chosenPrinting = printings.find(p => p.id === (arrivedCardId ?? item?.card_id));

  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle className="sr-only">File this card away</SheetTitle>
        {item && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <CardImage card={chosenPrinting ?? item.card ?? { name: item.card_name }} width={84} hideFlip />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{item.card_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {item.quantity} {item.quantity === 1 ? 'copy' : 'copies'},{' '}
                  {FINISH_LABEL[(arrivedFinish ?? item.finish) as Finish].toLowerCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor="to-collection" className="text-sm font-medium">
                  Add to my collection
                </Label>
                <p className="text-xs text-muted-foreground">
                  Counts these copies as owned.
                </p>
              </div>
              <Switch id="to-collection" checked={toCollection} onCheckedChange={setToCollection} />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Which box
              </Label>
              {destinations.containers.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  You have not made any storage boxes yet, so there is nowhere to put it. That is
                  fine, it can still go into your collection.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip active={containerId === null} onClick={() => setContainerId(null)}>
                    Not in a box
                  </Chip>
                  {destinations.containers.map(container => (
                    <Chip
                      key={container.id}
                      active={containerId === container.id}
                      onClick={() => setContainerId(container.id)}
                    >
                      {container.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Into a deck
              </Label>
              {destinations.decks.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">No decks yet.</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip active={deckId === null} onClick={() => setDeckId(null)}>
                    No deck
                  </Chip>
                  {destinations.decks.slice(0, 12).map(deck => (
                    <Chip key={deck.id} active={deckId === deck.id} onClick={() => setDeckId(deck.id)}>
                      {deck.name}
                    </Chip>
                  ))}
                </div>
              )}
              {item.source_deck_id && deckId === item.source_deck_id && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  This is the deck that asked for the card.
                </p>
              )}
            </div>

            {!swapOpen ? (
              <button
                type="button"
                onClick={openSwap}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                It came as a different version
              </button>
            ) : (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">Which version turned up</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sellers substitute printings. Pick the one in your hand so your collection is
                  right and the value is the value of what you own.
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(['nonfoil', 'foil', 'etched'] as Finish[]).map(finish => (
                    <Chip
                      key={finish}
                      active={(arrivedFinish ?? item.finish) === finish}
                      onClick={() => setArrivedFinish(finish)}
                    >
                      {FINISH_LABEL[finish]}
                    </Chip>
                  ))}
                </div>

                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {printings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Looking for other versions.</p>
                  ) : (
                    printings.map(printing => (
                      <button
                        key={printing.id}
                        type="button"
                        onClick={() => setArrivedCardId(printing.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                          (arrivedCardId ?? item.card_id) === printing.id
                            ? 'bg-foreground text-background'
                            : 'hover:bg-muted/60'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {printing.set_name ?? printing.set_code}
                        </span>
                        <span className="shrink-0 text-xs opacity-70">
                          {printing.collector_number}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                File it away
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'max-w-[14rem] truncate rounded-full px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
