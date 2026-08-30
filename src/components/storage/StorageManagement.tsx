import { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, Layers, Box, Boxes, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StorageAPI } from '@/lib/api/storageAPI';
import type {
  StorageOverview as StorageOverviewType,
  StorageContainerSummary,
} from '@/types/storage';
import { CreateContainerPanel } from './CreateContainerPanel';
import { ContainerObject } from './ContainerObject';
import { containerCountLine } from './containerCount';
import { showError } from '@/components/ui/toast-helpers';
import { formatPrice, formatPriceCompact } from '@/components/collection/browser/types';
import { MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';

/**
 * The shelf.
 *
 * This page used to be a stat row and a grid of parcel glyphs with three
 * numbers under each — which is a report *about* storage, not a picture of it.
 * Knowing where a physical card is is the one thing this product does that the
 * deckbuilding sites do not, and the way to make that land is to draw the
 * shelf: binders with your cards in the pockets, deck boxes with a deck
 * standing in them, bulk boxes with a row of cards on edge. See
 * `ContainerObject` for how each form is built.
 *
 * Every card in every object is a real `storage_items` row and every number is
 * summed from the same fetch that drew them.
 */

interface StorageManagementProps {
  onContainerSelect: (container: StorageContainerSummary) => void;
  selectedContainerId?: string;
}

/**
 * The empty state's three offers, drawn as the objects they create.
 *
 * "Create your first container" over three 24px glyphs asks someone to pick a
 * data model. Three empty objects — nine bare pockets, an open deck box, an
 * empty bulk box — ask them to pick a thing off a shelf, which is the question
 * they can actually answer.
 */
const QUICK_TYPES = [
  { id: 'binder', label: 'Binder', hint: 'Pages of pockets, for the good ones' },
  { id: 'deckbox', label: 'Deck box', hint: 'One deck, ready to play' },
  { id: 'box', label: 'Bulk box', hint: 'Everything else, on edge' },
] as const;

/** Container type as it should read under a name. */
const TYPE_LABEL: Record<string, string> = {
  binder: 'Binder',
  deckbox: 'Deck box',
  box: 'Bulk box',
  shelf: 'Shelf',
  other: 'Container',
  'deck-linked': 'Deck box',
};

/** One shelf, as an `auto-fill` track so the objects use the full width. */
const SHELF_GRID = '[grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]';

export function StorageManagement({
  onContainerSelect,
  selectedContainerId,
}: StorageManagementProps) {
  const [overview, setOverview] = useState<StorageOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [initialType, setInitialType] = useState<string | undefined>();

  const loadOverview = async () => {
    try {
      const data = await StorageAPI.getOverview();
      setOverview(data);
    } catch (error) {
      console.error('Failed to load storage overview:', error);
      showError('Error', 'Failed to load storage overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const openCreate = (type?: string) => {
    setInitialType(type);
    setCreating(true);
  };

  const closeCreate = () => {
    setCreating(false);
    setInitialType(undefined);
  };

  const containers = useMemo(() => overview?.containers ?? [], [overview]);
  const totalCards = containers.reduce((sum, c) => sum + (c.itemCount ?? 0), 0);
  const totalValue = containers.reduce((sum, c) => sum + (c.valueUSD ?? 0), 0);
  const unassignedCount = overview?.unassigned.count ?? 0;
  const unassignedValue = overview?.unassigned.valueUSD ?? 0;
  /* Copies that figure could not price, so it never reads as the whole answer. */
  const unassignedUnpriced = overview?.unassigned.unpricedCopies ?? 0;

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="bg-card px-4 py-5 shadow-lg shadow-black/20 md:px-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className={cn('grid gap-5 px-4 py-6 md:px-6', SHELF_GRID)}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl bg-card p-4 shadow-lg shadow-black/25">
              <Skeleton className="aspect-[1/1.3] w-full rounded-lg" />
              <Skeleton className="mt-4 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      {/* Header. The title and the one action; the figures get their own row. */}
      <div className="bg-card px-4 py-5 shadow-lg shadow-black/20 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Storage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Where each physical card actually lives.
            </p>
          </div>

          <Button
            onClick={() => (creating ? closeCreate() : openCreate())}
            aria-expanded={creating}
            className="shrink-0 gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New container
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-6 px-4 py-6 md:px-6">
        {/*
          The same tiles as My Collection and My Decks.

          These three figures were a 14px run of text under the page title, for
          the same reason the collection's were and with the same result: the
          question this page answers is "how much of my collection is actually
          filed", and the answer was set smaller than the label above it. The
          fourth tile is the one the shelf could not say at all, and it is the
          reason to keep going.
        */}
        {(containers.length > 0 || unassignedCount > 0) && (
          <MetricRow
            columns={4}
            loading={loading}
            metrics={[
              {
                id: 'containers',
                label: 'Containers',
                value: containers.length.toLocaleString(),
                raw: containers.length,
                subtext: 'Binders, deck boxes and bulk',
              },
              {
                id: 'stored',
                label: 'Cards stored',
                value: totalCards.toLocaleString(),
                raw: totalCards,
                subtext: 'In a container you named',
              },
              {
                id: 'value',
                label: 'On the shelf',
                /* A dash, never $0.00. The smallest real price in the database
                   is 0.01, so a rendered zero is always something we failed to
                   price rather than something that is free. */
                value: totalCards > 0 ? formatPriceCompact(totalValue) : '—',
                raw: totalValue,
                title: totalCards > 0 ? formatPrice(totalValue) : undefined,
                subtext: totalCards > 0 ? 'Worth of filed cards' : 'Nothing filed yet',
              },
              {
                id: 'unassigned',
                label: 'Nowhere recorded',
                value: unassignedCount > 0 ? unassignedCount.toLocaleString() : '—',
                raw: unassignedCount,
                subtext:
                  unassignedCount > 0
                    ? `${formatPrice(unassignedValue)} with no container`
                    : 'Every card has a home',
              },
            ]}
          />
        )}

        {creating && (
          <CreateContainerPanel
            key={initialType ?? 'default'}
            initialType={initialType}
            onCancel={closeCreate}
            onSuccess={() => {
              closeCreate();
              loadOverview();
            }}
          />
        )}

        {containers.length === 0 ? (
          <EmptyShelf
            onPick={openCreate}
            unassignedCount={unassignedCount}
            unassignedValue={unassignedValue}
          />
        ) : (
          <>
            {/* Cards with nowhere recorded — the reason to keep going. It is
                also a tile above, and it stays here because the tile can only
                carry the count while this line carries what it is worth and how
                much of that we could not price. */}
            {unassignedCount > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-card px-4 py-3 shadow-lg shadow-black/20">
                <Boxes className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-foreground">
                  <span className="font-semibold tabular-nums">
                    {unassignedCount.toLocaleString()}
                  </span>{' '}
                  {unassignedCount === 1 ? 'card is' : 'cards are'} in your collection with no
                  container recorded
                  <span className="text-muted-foreground"> · {formatPrice(unassignedValue)}</span>
                  {unassignedUnpriced > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      ·{' '}
                      {unassignedUnpriced === 1
                        ? '1 with no price yet'
                        : `${unassignedUnpriced.toLocaleString()} with no price yet`}
                    </span>
                  )}
                </p>
              </div>
            )}

            <div className={cn('grid gap-5', SHELF_GRID)}>
              {containers.map((container, index) => (
                <ContainerTile
                  key={container.id}
                  container={container}
                  selected={selectedContainerId === container.id}
                  eager={index < 3}
                  onSelect={onContainerSelect}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- tile */

function ContainerTile({
  container,
  selected,
  eager,
  onSelect,
}: {
  container: StorageContainerSummary;
  selected: boolean;
  eager: boolean;
  onSelect: (container: StorageContainerSummary) => void;
}) {
  const shown = container.preview?.length ?? 0;
  /**
   * Nine pockets is a real property of a binder page. Everything else here has
   * no capacity anybody ever set, so the empty state describes the object
   * rather than claiming how much fits in it. It used to say "room for a deck"
   * about a bulk box and a shelf, because `containerCapacity` is a count of
   * preview slots and was being read as a card capacity.
   */
  const isBinder = container.type === 'binder';
  /**
   * How much is in here, said so the reader cannot work out a false answer.
   *
   * This used to be `uniqueCards - shown` printed as "more inside" directly
   * after `itemCount` printed as "cards", which are copies and distinct cards
   * respectively. `containerCountLine` decides which of the two facts can be
   * stated as a difference and which has to be stated on its own.
   */
  const countLine = containerCountLine(
    container.itemCount ?? 0,
    container.uniqueCards ?? 0,
    shown
  );
  const empty = (container.itemCount ?? 0) === 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(container)}
      aria-label={`${container.name}, ${TYPE_LABEL[container.type] ?? container.type}, ${
        container.itemCount ?? 0
      } cards`}
      className={cn(
        'group flex h-full flex-col rounded-2xl bg-card p-4 text-left',
        'shadow-lg shadow-black/25 transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        selected && 'bg-accent'
      )}
    >
      {/* The object, standing on the floor of the tile. */}
      <div className="flex flex-1 items-end justify-center pb-1">
        <ContainerObject
          type={container.type}
          cards={container.preview}
          eager={eager}
          className="transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
        />
      </div>

      <div className="mt-4 space-y-1">
        <h3 className="truncate text-base font-bold leading-tight tracking-tight text-card-foreground">
          {container.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {TYPE_LABEL[container.type] ?? container.type}
          {container.deck_id ? ' · linked to a deck' : ''}
        </p>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
        {empty ? (
          <span className="text-muted-foreground">
            {isBinder ? 'Empty · nine pockets a page, waiting' : 'Empty · nothing filed here yet'}
          </span>
        ) : (
          <span className="tabular-nums text-muted-foreground">{countLine}</span>
        )}
        {(container.valueUSD ?? 0) > 0 && (
          /* The figure, and what it is leaving out. Opening this container has
             always shown the gap; the tile did not, so the shelf and the box
             disagreed about the same box. A total that quietly drops the cards
             it could not price is the one thing a value must not do. */
          <span className="shrink-0 text-right">
            <span className="block font-semibold tabular-nums text-foreground">
              {formatPrice(container.valueUSD)}
            </span>
            {(container.unpricedCopies ?? 0) > 0 && (
              <span className="block text-[0.7rem] font-normal tabular-nums text-muted-foreground">
                {container.unpricedCopies === 1
                  ? '1 with no price yet'
                  : `${container.unpricedCopies.toLocaleString()} with no price yet`}
              </span>
            )}
          </span>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------- empty state */

/**
 * No containers yet.
 *
 * Drawn as three empty objects rather than described in a paragraph — the same
 * renderer the real shelf uses, with no cards in it, which is exactly what you
 * are about to own. Picking one carries the type straight into the create
 * panel, so the first click is the only decision.
 */
function EmptyShelf({
  onPick,
  unassignedCount,
  unassignedValue,
}: {
  onPick: (type: string) => void;
  unassignedCount: number;
  unassignedValue: number;
}) {
  const icons: Record<string, typeof Layers> = { binder: Layers, deckbox: Box, box: Archive };

  return (
    <section className="rounded-2xl bg-card px-4 py-8 shadow-lg shadow-black/20 md:px-8 md:py-10">
      <div className="mx-auto max-w-2xl text-center">
        <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          Your shelf is empty
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Every other site knows what you own. This one knows where it is. Tell it what you
          keep your cards in, starting with one.
        </p>
        {/* The user's own number, and the whole argument for the feature: these
            cards exist, and right now nothing records where they are. It used
            to live in the header, which meant it vanished in exactly the state
            that most needed to make the case. */}
        {unassignedCount > 0 && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-foreground">
            <span className="font-semibold tabular-nums">
              {unassignedCount.toLocaleString()}
            </span>{' '}
            {unassignedCount === 1 ? 'card' : 'cards'} in your collection, worth{' '}
            {formatPrice(unassignedValue)}, have nowhere recorded.
          </p>
        )}
      </div>

      <div className="mx-auto mt-8 grid max-w-4xl gap-5 sm:grid-cols-3">
        {QUICK_TYPES.map(type => {
          const Icon = icons[type.id];
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onPick(type.id)}
              className={cn(
                'group flex flex-col rounded-xl bg-muted/30 p-4 text-left',
                'transition-all duration-200 ease-out hover:-translate-y-1 hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'motion-reduce:transition-none motion-reduce:hover:translate-y-0'
              )}
            >
              <div className="flex flex-1 items-end justify-center pb-3">
                {/* No cards: the object is drawn hollow, which is the truth. */}
                <ContainerObject type={type.id} cards={[]} />
              </div>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-semibold text-card-foreground">{type.label}</span>
                <ArrowRight
                  className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{type.hint}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
