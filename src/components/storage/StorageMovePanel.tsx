import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, Minus, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CardImage } from '@/components/cards';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import { StorageAPI } from '@/lib/api/storageAPI';
import type {
  StorageContainerSummary,
  StorageItemWithCard,
  StorageSlot,
} from '@/types/storage';
import {
  BINDER_POCKETS,
  describeCount,
  orderSlots,
  slotLabel,
  subdivisionFor,
} from '@/lib/storage/subdivision';
import { ContainerObject } from './ContainerObject';

/**
 * Moving cards, as a right-hand slide-out.
 *
 * There was no way to move a card between containers at all. The nearest thing
 * was removing it from one and adding it to the other, which is two writes and
 * a gap: a failure in the gap loses the card, and the re-add re-derives the
 * printing rather than carrying the one you actually own. So every move on this
 * panel goes through `storage_move_cards`, which is one database statement.
 * Three copies in a box, move one, two stay. A selection goes through
 * `StorageAPI.moveCardsBatch`, which runs each move through that same statement
 * inside one request rather than one request per picked row.
 *
 * Design law item 3: this is an action taken WITHOUT leaving the container you
 * are looking at, so it is a right-hand panel and the container stays on screen
 * behind it, at the same scroll position.
 *
 * It handles all three of the ways a person needs to move cards:
 *   - one card, from its own row
 *   - a selection of many, moved together, because filing is bulk work
 *   - between pages and dividers of the container it is already in
 */

export interface StorageMovePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rows being moved. One from a card row; many from a selection. */
  items: StorageItemWithCard[];
  /** Id of the container they are in now, so it can offer refiling in place. */
  fromContainerId: string;
  /** Preselected destination, when a pocket or page was clicked to open this. */
  initialSlotId?: string | null;
  initialPocket?: number | null;
  onMoved: () => void;
}

export function StorageMovePanel({
  open,
  onOpenChange,
  items,
  fromContainerId,
  initialSlotId = null,
  initialPocket = null,
  onMoved,
}: StorageMovePanelProps) {
  const [containers, setContainers] = useState<StorageContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [slots, setSlots] = useState<StorageSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(initialSlotId);
  const [pocket, setPocket] = useState<number | null>(initialPocket);
  const [qty, setQty] = useState(1);
  const [moving, setMoving] = useState(false);

  const single = items.length === 1 ? items[0] : null;
  const maxQty = single?.qty ?? 1;
  const totalCopies = items.reduce((sum, item) => sum + item.qty, 0);

  /* Fresh state per opening. The panel is given a `key` by its host so this is
     a mount rather than a reset, but the destination still has to start from
     whatever was clicked. */
  useEffect(() => {
    if (!open) return;
    setTargetId(initialSlotId ? fromContainerId : null);
    setSlotId(initialSlotId);
    setPocket(initialPocket);
    // One copy by default. Moving your whole stack is the bigger decision of
    // the two, so it is the one you have to ask for.
    setQty(1);
  }, [open, initialSlotId, initialPocket, fromContainerId, maxQty]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    StorageAPI.getOverview()
      .then(overview => {
        if (!cancelled) setContainers(overview.containers);
      })
      .catch(error => {
        console.error('Failed to load containers:', error);
        if (!cancelled) setContainers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /* The destination's own pages and dividers. Loaded when a destination is
     chosen rather than all at once, because most moves never look at them. */
  useEffect(() => {
    if (!targetId) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    StorageAPI.getContainerSlots(targetId)
      .then(rows => {
        if (!cancelled) setSlots(rows);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const target = containers.find(c => c.id === targetId) ?? null;
  const sub = subdivisionFor(target?.type);
  const orderedSlots = useMemo(() => orderSlots(slots), [slots]);

  /* A pocket holds one card, so the pocket picker only appears when exactly one
     copy is on the move. Anything else and the database would refuse anyway. */
  const canPickPocket = sub.kind === 'page' && slotId != null && items.length === 1 && qty === 1;

  useEffect(() => {
    if (!canPickPocket && pocket != null) setPocket(null);
  }, [canPickPocket, pocket]);

  const handleMove = async () => {
    if (!targetId) return;
    setMoving(true);
    let moved = 0;
    const failures: string[] = [];

    /* One request for the whole selection, not one per picked row. Each move
       still runs through `storage_move_cards` on the server, inside its own
       exception block, so one card that cannot go where it was asked leaves the
       rest moved and comes back with its own reason. */
    const asked = items.map(item => ({
      item,
      copies: single ? qty : item.qty,
    }));

    try {
      const outcomes = await StorageAPI.moveCardsBatch(
        asked.map(({ item, copies }) => ({
          item_id: item.id,
          qty: copies,
          to_container_id: targetId,
          to_slot_id: slotId,
          to_pocket: pocket,
        }))
      );

      outcomes.forEach((outcome, index) => {
        const { item, copies } = asked[index];
        if (outcome.error) {
          failures.push(`${item.card?.name ?? 'A card'}: ${outcome.error}`);
        } else {
          moved += copies;
        }
      });
    } catch (error) {
      for (const { item } of asked) {
        failures.push(
          `${item.card?.name ?? 'A card'}: ${
            error instanceof Error ? error.message : 'could not be moved'
          }`
        );
      }
    }

    setMoving(false);

    if (moved > 0) {
      const where = slotId
        ? `${target?.name}, ${slotLabel(sub, orderedSlots.find(s => s.id === slotId) ?? null, orderedSlots.findIndex(s => s.id === slotId))}`
        : (target?.name ?? 'the container');
      showSuccess(
        'Moved',
        `${moved} ${moved === 1 ? 'card' : 'cards'} moved to ${where}${
          pocket ? `, pocket ${pocket}` : ''
        }`
      );
      onMoved();
      if (failures.length === 0) onOpenChange(false);
    }

    if (failures.length > 0) {
      showError(failures.length === items.length ? 'Nothing moved' : 'Some cards stayed put', failures[0]);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-md"
      >
        {/* pr-12 clears the Sheet's own close button. */}
        <div className="py-3 pl-4 pr-12">
          {/* Says what will actually happen, not what is in the stack. It read
              "Move 3 cards" while the stepper below said 1, which is the panel
              contradicting itself in its own title. */}
          <SheetTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {single
              ? `Move ${qty} ${qty === 1 ? 'copy' : 'copies'}`
              : `Move ${totalCopies} cards`}
          </SheetTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          {/* What is moving. Art, always, never a name on its own. */}
          <div className="flex flex-wrap gap-2">
            {items.slice(0, 6).map(item => (
              <div key={item.id} className="relative">
                <CardImage
                  card={item.card ?? { name: 'Card' }}
                  width={64}
                  hideFlip
                  interactive={false}
                  title={item.card?.name}
                />
                {item.qty > 1 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground shadow-md shadow-black/40">
                    {item.qty}
                  </span>
                )}
              </div>
            ))}
            {items.length > 6 && (
              <div className="flex h-[89px] w-16 items-center justify-center rounded-lg bg-muted/40 text-xs text-muted-foreground">
                +{items.length - 6}
              </div>
            )}
          </div>

          {/* How many, when it is one stack and there is a choice to make. */}
          {single && maxQty > 1 && (
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">How many copies</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {maxQty} here. The rest stay where they are.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  aria-label="One fewer copy"
                  disabled={qty <= 1}
                  onClick={() => setQty(n => Math.max(1, n - 1))}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="w-8 text-center text-base font-semibold tabular-nums text-foreground">
                  {qty}
                </span>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  aria-label="One more copy"
                  disabled={qty >= maxQty}
                  onClick={() => setQty(n => Math.min(maxQty, n + 1))}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setQty(maxQty)}
                  disabled={qty === maxQty}
                >
                  All {maxQty}
                </Button>
              </div>
            </div>
          )}

          {/* Where to. */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Move to
            </p>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : containers.length <= 1 ? (
              <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
                There is nowhere else to put these yet. Make another container first and this
                card can move into it.
              </p>
            ) : (
              <div className="space-y-1.5">
                {containers.map(container => {
                  const isTarget = container.id === targetId;
                  const isHere = container.id === fromContainerId;
                  return (
                    <button
                      key={container.id}
                      type="button"
                      aria-pressed={isTarget}
                      onClick={() => {
                        setTargetId(container.id);
                        setSlotId(null);
                        setPocket(null);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isTarget ? 'bg-accent text-accent-foreground' : 'bg-muted/40 hover:bg-accent/60'
                      )}
                    >
                      <div className="w-14 shrink-0">
                        <ContainerObject type={container.type} cards={container.preview} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{container.name}</span>
                          {isHere && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              Here now
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {describeCount(container.itemCount, 'Empty')}
                        </span>
                      </div>
                      {isTarget && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Which page or divider, once a destination is chosen. Always
              optional: "not filed" is a real place and is offered first. */}
          {target && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {sub.groupLabel} in {target.name}
              </p>
              {slotsLoading ? (
                <Skeleton className="h-9 w-full rounded-lg" />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant={slotId === null ? 'default' : 'secondary'}
                    onClick={() => {
                      setSlotId(null);
                      setPocket(null);
                    }}
                  >
                    {sub.looseLabel}
                  </Button>
                  {orderedSlots.map((slot, index) => (
                    <Button
                      key={slot.id}
                      size="sm"
                      variant={slotId === slot.id ? 'default' : 'secondary'}
                      onClick={() => {
                        setSlotId(slot.id);
                        setPocket(null);
                      }}
                    >
                      {slotLabel(sub, slot, index)}
                    </Button>
                  ))}
                </div>
              )}
              {!slotsLoading && orderedSlots.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {target.name} has no {sub.nounPlural} yet. Cards go straight in, which is fine.
                </p>
              )}
            </div>
          )}

          {/* Which pocket, for a binder page and a single card. */}
          {canPickPocket && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Pocket
              </p>
              <p className="text-xs text-muted-foreground">
                Optional. Leave it and the card sits on the page without a set pocket.
              </p>
              <div className="grid w-40 grid-cols-3 gap-1.5">
                {Array.from({ length: BINDER_POCKETS }, (_, i) => i + 1).map(n => (
                  <Button
                    key={n}
                    size="sm"
                    variant={pocket === n ? 'default' : 'secondary'}
                    className="h-10 tabular-nums"
                    onClick={() => setPocket(p => (p === n ? null : n))}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 pb-4 pt-2">
          <Button
            className="flex-1 gap-2"
            disabled={!targetId || moving}
            onClick={handleMove}
          >
            {moving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
            {moving ? 'Moving…' : 'Move'}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={moving}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
