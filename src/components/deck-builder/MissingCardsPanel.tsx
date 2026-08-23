import { useCallback, useMemo, useState } from 'react';
import { Grid3X3, Package, Plus, Printer, ShoppingCart, Loader2, Heart } from 'lucide-react';
import {
  EmptyState,
  FacetChip,
  FilterBar,
  ListingFrame,
  ListingSearch,
  matchedLabel,
  resultSentence,
  type ListingMode,
} from '@/components/listing';
/* `useListingView` from its own module rather than through the folder's
   barrel, and this is not style. `@/components/listing/index.ts` re-exports the
   hook, the hook imports `@/components/cards`, and `CardDetail` in there imports
   the listing barrel back: two barrels in a cycle. Rollup reports it as
   "will end up in different chunks ... will likely lead to broken execution
   order", and this file is a lazily loaded chunk, which is exactly the case it
   is warning about. Everything else still comes from the barrel. */
import { useListingView } from '@/components/listing/useListingView';
import { Button } from '@/components/ui/button';
import { AddToListButton } from '@/components/shopping';
import { showListItemCount, useCardLists, type ListKind } from '@/lib/shopping';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckValueLine } from '@/lib/deck/deckValue';
import { DeckCardTile, TileBadge } from '@/components/deck/DeckCardTile';

/**
 * The cards this deck is short of, and every way to close the gap.
 *
 * ## TWO THINGS CHANGED AND BOTH WERE COUNTED BY THE CENSUS
 *
 * **It stopped querying.** This panel ran its own
 * `deck_cards` read and its own `user_collections` read when the Value tab
 * opened, while `useCollectionOwnership` had already loaded the same collection
 * on page load and `useDeckEditor` had already loaded the same deck rows. Three
 * reads of one table on one page, none of them a loop, none of them shared.
 * It now takes the shortfall as `lines` — `deckValueLines` does the arithmetic
 * once, off data the page already holds — so opening this tab costs **zero**
 * further requests.
 *
 * The knock-on is that the figures cannot disagree any more. This panel priced
 * the shortfall from its own `fetchCardsByIds` call while the tile at the top of
 * the page priced the deck from the rows `useDeckEditor` loaded, which is two
 * reads of the catalogue for one deck and two chances to differ.
 *
 * **The cards are cards.** They were drawn in a 16-pixel-wide box beside a row
 * of text. This is a shopping list a player works through card by card, and it
 * was the smallest card art anywhere in the product. `ListingFrame` at the size
 * slider's width, the same shell the decklist uses.
 *
 * Every control that was here is still here: search, the three price bands, per
 * card shopping list, proxy list, wishlist and Mark as Owned, and the two bulk
 * actions.
 */

const MISSING_MODES: ListingMode[] = [
  { id: 'grid', label: 'Cards', icon: Grid3X3, layout: 'grid' },
];

const DEFAULT_CARD_SIZE = 200;

type Band = 'all' | 'high' | 'medium' | 'low';

const BAND_LABEL: Record<Band, string> = {
  all: 'All',
  high: '$10+',
  medium: '$2 – $10',
  low: 'Under $2',
};

interface MissingCardsPanelProps {
  /**
   * Every line of the deck, priced and with ownership already applied.
   * The ones with `needed > 0` are what this panel is about.
   */
  lines: DeckValueLine[];
  deckId: string;
  deckName: string;
  onCardClick?: (row: DeckCardRow) => void;
  /**
   * Called after Mark as Owned writes, so the page can re-read ownership. The
   * panel does not hold its own copy of the collection any more, so it cannot
   * quietly drop a row and pretend the deck changed.
   */
  onOwnershipChanged?: () => void;
}

export function MissingCardsPanel({
  lines,
  deckId,
  deckName,
  onCardClick,
  onOwnershipChanged,
}: MissingCardsPanelProps) {
  const [search, setSearch] = useState('');
  const [band, setBand] = useState<Band>('all');
  const [addingAll, setAddingAll] = useState<ListKind | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const addMany = useCardLists(state => state.addMany);

  const view = useListingView({
    surface: 'deckmatrix.deck.missing.view',
    modes: MISSING_MODES,
    defaultSize: DEFAULT_CARD_SIZE,
  });

  const missing = useMemo(
    () =>
      lines
        .filter(line => line.needed > 0)
        // Unpriced cards sort last rather than pretending to be the cheapest.
        .sort((a, b) => (b.neededCost ?? -1) - (a.neededCost ?? -1)),
    [lines]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return missing.filter(line => {
      if (needle && !line.name.toLowerCase().includes(needle)) return false;
      if (band === 'all') return true;
      /* An unpriced card belongs in no price band. It used to land in "under
         $2", which is a guess dressed up as a filter result. */
      const price = line.neededCost;
      if (price == null) return false;
      if (band === 'high') return price >= 10;
      if (band === 'medium') return price >= 2 && price < 10;
      return price < 2;
    });
  }, [missing, search, band]);

  const totalCost = missing.reduce((sum, line) => sum + (line.neededCost ?? 0), 0);
  const unpriced = missing.filter(line => line.neededCost == null).length;

  const activeCount = (search.trim() ? 1 : 0) + (band === 'all' ? 0 : 1);
  const clearEverything = useCallback(() => {
    setSearch('');
    setBand('all');
  }, []);
  const commitSearch = useCallback((next: string | undefined) => setSearch(next ?? ''), []);

  /**
   * Every missing card onto one of the lists in one press, and in one request.
   *
   * This is the surface where a bulk action earns its place: somebody looking
   * at twenty cards their deck is short of does not want to press twenty
   * buttons. The quantity is the shortfall, so a deck needing two copies asks
   * for two, and the database raises the quantity of anything already on the
   * list rather than writing a second row for it.
   *
   * It used to be a `for` loop of one `card_list_add` per card, which made a
   * fifty-card shortfall fifty round trips. That is the shape that has taken
   * this project down twice, so it goes through `card_list_add_many`: one
   * statement whatever the size of the deck.
   */
  const addAll = async (kind: ListKind) => {
    if (missing.length === 0) return;
    setAddingAll(kind);
    try {
      await addMany({
        kind,
        source: 'deck',
        // Kept so that when the parcel arrives weeks later, filing already
        // knows which deck was waiting on it.
        sourceDeckId: deckId,
        items: missing.map(line => ({
          card_id: line.row.card_id,
          card_name: line.name,
          quantity: line.needed,
        })),
      });
      showSuccess(
        kind === 'proxy' ? 'On your proxy list' : 'On your shopping list',
        `${showListItemCount(missing.length)} from “${deckName}”.`
      );
    } catch (error) {
      showError('Could not add them all', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setAddingAll(null);
    }
  };

  const addToWishlist = async (line: DeckValueLine) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from('wishlist').upsert(
        {
          user_id: session.user.id,
          card_id: line.row.card_id,
          card_name: line.name,
          quantity: line.needed,
          priority: 'medium',
        },
        { onConflict: 'user_id,card_id' }
      );
      if (error) throw error;
      showSuccess('On your wishlist', line.name);
    } catch (error) {
      showError('Could not add to your wishlist', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const markAsOwned = async (line: DeckValueLine) => {
    setMarking(line.row.card_id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from('user_collections').upsert(
        {
          user_id: session.user.id,
          card_id: line.row.card_id,
          card_name: line.name,
          quantity: line.copies,
          set_code: line.row.card?.set_code ?? 'unknown',
          condition: 'near_mint',
        },
        { onConflict: 'user_id,card_id' }
      );
      if (error) throw error;

      showSuccess('In your collection', line.name);
      /* The page re-reads ownership and this list shortens because the deck's
         shortfall genuinely changed. It used to splice the row out of its own
         local copy, which made the list agree with nothing else on the page. */
      onOwnershipChanged?.();
    } catch (error) {
      showError('Could not add to your collection', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setMarking(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">
            {missing.length === 0
              ? 'You own every card in this deck'
              : `${missing.length} ${missing.length === 1 ? 'card' : 'cards'} to find`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Measured against your collection by card name, so any printing counts.
            {missing.length > 0 && (
              <>
                {' '}
                ${totalCost.toFixed(2)} to finish.
                {unpriced > 0 &&
                  ` ${unpriced} of them ${
                    unpriced === 1 ? 'has' : 'have'
                  } no price on record, so the real cost is higher.`}
              </>
            )}
          </p>
        </div>

        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Proxy the whole shortfall, because playing the deck before
                paying for it is why a player is looking at this list at all. */}
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => addAll('proxy')}
              disabled={addingAll !== null}
            >
              {addingAll === 'proxy' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Proxy them all
            </Button>
            <Button className="gap-2" onClick={() => addAll('shopping')} disabled={addingAll !== null}>
              {addingAll === 'shopping' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              Add them all to my shopping list
            </Button>
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <FilterBar
          view={view}
          activeCount={activeCount}
          onClear={clearEverything}
          search={
            <ListingSearch
              value={search}
              onCommit={commitSearch}
              placeholder="Name"
              label="Search the cards you are missing"
            />
          }
          facets={(['all', 'high', 'medium', 'low'] as const).map(option => (
            <FacetChip key={option} selected={band === option} onClick={() => setBand(option)}>
              {BAND_LABEL[option]}
            </FacetChip>
          ))}
        />
      )}

      <ListingFrame
        view={view}
        count={filtered.length}
        summary={
          missing.length === 0
            ? undefined
            : resultSentence([
                matchedLabel(filtered.length, missing.length, 'card'),
                { value: `$${totalCost.toFixed(2)}`, label: 'to finish' },
              ])
        }
        empty={
          missing.length === 0
            ? {
                icon: Package,
                title: 'You own every card in this deck',
                description: 'Nothing here is missing from your collection.',
              }
            : {
                title: 'Nothing matches',
                description: 'No card you are missing matches this search and this price band.',
                onClearFilters: clearEverything,
              }
        }
      >
        {filtered.map(line => (
          <DeckCardTile
            key={line.row.id}
            card={{
              ...(line.row.card ?? {}),
              id: line.row.card_id,
              name: line.name,
              image_uris: line.row.card?.image_uris ?? null,
              mana_cost: line.row.card?.mana_cost ?? null,
            }}
            width={view.size}
            onClick={onCardClick ? () => onCardClick(line.row) : undefined}
            badge={line.needed > 1 ? <TileBadge>need {line.needed}</TileBadge> : undefined}
            caption={
              <span className="tabular-nums">
                {line.neededCost == null
                  ? 'No price on record'
                  : `$${line.neededCost.toFixed(2)} for ${line.needed} ${
                      line.needed === 1 ? 'copy' : 'copies'
                    }`}
                {line.owned > 0 && ` · you own ${line.owned}`}
              </span>
            }
            detail={
              line.reserved
                ? 'Reserved list, so it will not be reprinted cheaper.'
                : line.cheapestUnit !== null &&
                    line.unit !== null &&
                    line.cheapestUnit < line.unit * 0.75
                  ? `Cheapest printing $${line.cheapestUnit.toFixed(2)}, of ${line.printings}.`
                  : undefined
            }
            actions={
              <>
                <AddToListButton
                  card={{ id: line.row.card_id, name: line.name }}
                  kind="shopping"
                  quantity={line.needed}
                  source="deck"
                  deckId={deckId}
                />
                <AddToListButton
                  card={{ id: line.row.card_id, name: line.name }}
                  kind="proxy"
                  quantity={line.needed}
                  source="deck"
                  deckId={deckId}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => addToWishlist(line)}
                >
                  <Heart className="mr-1 h-3 w-3" />
                  Wishlist
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={marking === line.row.card_id}
                  onClick={() => markAsOwned(line)}
                >
                  {marking === line.row.card_id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="mr-1 h-3 w-3" />
                  )}
                  Own it
                </Button>
              </>
            }
          />
        ))}
      </ListingFrame>
    </div>
  );
}

export default MissingCardsPanel;
