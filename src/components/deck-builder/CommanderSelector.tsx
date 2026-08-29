import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Crown, X } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ManaCost, ColorIdentity } from '@/components/ui/mana-cost';
import { CardGrid, CardGridSkeleton, CardImage, CardSizeSlider, useCardSize } from '@/components/cards';
import { ActiveFilterChips, CardFilterSheet, useCardFilterState } from '@/components/filters';
import { EmptyState, FilterBar, FilterButton, ListingSearch } from '@/components/listing';

interface CommanderSelectorProps {
  currentCommander?: any;
  /** Called after a commander is committed, so the host dialog can close. */
  onSelect?: (card: any) => void;
}

interface ScryfallCard {
  id: string;
  name: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  color_identity?: string[];
  colors?: string[];
  image_uris?: Record<string, string>;
  card_faces?: any[];
  layout?: string;
  prices?: { usd?: string };
  keywords?: string[];
  edhrec_rank?: number;
}

/**
 * The commander picker.
 *
 * A commander is chosen by looking at it — the art, the colour pips, the
 * silhouette — so this is a card grid at a size the user controls, not a list of
 * 64px thumbnails beside a name. The narrowing controls are the shared
 * `CardFilterPanel`, which matters more here than anywhere: "at most these
 * colours" is *the* question when picking a commander, and it is one click.
 *
 * ## It is a listing, so it uses the listing vocabulary
 *
 * This is the whole of `/deck/:id/commander`, and it had grown its own copies
 * of four things that exist once: the search field, the filter trigger and its
 * count badge, the row they sit in, and the panel drawn when nothing matches.
 * They are `ListingSearch`, `FilterButton`, `FilterBar` and `EmptyState` now.
 * Nothing was taken away by that and two things arrived for free, because the
 * shared field has them and the local copy did not: Enter commits without
 * waiting out the debounce, and Escape clears the box.
 *
 * What stays local is the part no other listing has: the commander-legal query
 * that is ANDed onto every search, and the EDHREC-ranked wall shown before you
 * have asked for anything.
 */
export function CommanderSelector({ currentCommander, onSelect }: CommanderSelectorProps) {
  const { setCommander } = useDeckStore();

  const filters = useCardFilterState({ urlSync: false });
  const [cardWidth, setCardWidth] = useCardSize('commander-picker', 150);

  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [topCommanders, setTopCommanders] = useState<ScryfallCard[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topError, setTopError] = useState(false);

  // Most-played commanders, ordered by Scryfall's edhrec_rank. This replaces a
  // hardcoded list whose "popularity" percentages were invented.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          'https://api.scryfall.com/cards/search?q=' +
            encodeURIComponent('is:commander legal:commander') +
            '&order=edhrec&unique=cards'
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setTopCommanders((data.data || []).slice(0, 12));
      } catch {
        if (!cancelled) setTopError(true);
      } finally {
        if (!cancelled) setTopLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * `is:commander legal:commander` is non-negotiable and is ANDed onto whatever
   * the filter produces — it covers legendary creatures, Backgrounds and the
   * planeswalkers that say "can be your commander", all of which the old
   * `t:legendary t:creature` query missed.
   */
  const query = useMemo(() => {
    const built = filters.query;
    const base = 'is:commander legal:commander';
    return built === '*' ? base : `${base} ${built}`;
  }, [filters.query]);

  const hasCriteria = filters.activeCount > 0;

  useEffect(() => {
    if (!hasCriteria) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`
        );
        const data = response.ok ? await response.json() : null;
        if (!cancelled) setSearchResults(data?.data ?? []);
      } catch (error) {
        console.error('Error searching commanders:', error);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, hasCriteria]);

  const handleCommanderSelect = async (card: ScryfallCard) => {
    const commanderCard = {
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.color_identity || card.colors || [],
      color_identity: card.color_identity || card.colors || [],
      mana_cost: card.mana_cost,
      quantity: 1,
      category: 'commanders' as const,
      mechanics: card.keywords || [],
      image_uris: card.image_uris,
      prices: card.prices,
    };

    setCommander(commanderCard as any);

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const urlParams = new URLSearchParams(window.location.search);
        const deckId = urlParams.get('deck');

        if (deckId) {
          await supabase.from('deck_cards').delete().eq('deck_id', deckId).eq('is_commander', true);

          const { error } = await supabase.from('deck_cards').insert({
            deck_id: deckId,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            is_commander: true,
            is_sideboard: false,
          });

          if (error) {
            showError('Commander not saved', error.message);
            return;
          }
        }
      }
    } catch (error) {
      showError('Commander not saved', error instanceof Error ? error.message : 'Unknown error');
      return;
    }

    filters.reset();
    setSearchResults([]);
    showSuccess('Commander set', `${card.name} now leads this deck`);
    onSelect?.(commanderCard);
  };

  const commitText = useCallback(
    (next: string | undefined) => filters.patch({ text: next }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.patch]
  );

  const renderResult = (card: ScryfallCard, rank?: number) => (
    <div key={card.id} className="flex flex-col gap-1.5">
      <CardImage
        card={card}
        width={cardWidth}
        fill
        onClick={() => handleCommanderSelect(card)}
        title={`Choose ${card.name} as commander`}
      >
        {/*
          Bottom-right, not top-left.

          At top-left this pill sat exactly on the card's printed title bar, so
          on every tile in the wall the first part of the commander's name was
          hidden behind its own rank — "#3 …n, Nimble Pilferer" instead of
          "Ragavan, Nimble Pilferer". At the 157px this grid renders at, the name
          under the card is the only other place it appears, and it truncates.
          The bottom-right corner carries the collector/artist line, which is
          the one region of a card face nothing needs to read here. Price
          already owns bottom-left. See .shots/audit/deck-builder-commander-1680.png.
        */}
        {rank !== undefined && (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
            #{rank}
          </span>
        )}
        {card.prices?.usd && (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
            ${card.prices.usd}
          </span>
        )}
      </CardImage>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="truncate text-xs font-medium text-foreground" title={card.name}>
          {card.name}
        </p>
        <div className="flex items-center gap-1.5">
          <ManaCost cost={card.mana_cost} size="xs" />
          <ColorIdentity colors={card.color_identity} size="xs" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Current commander */}
      {currentCommander && (
        <div className="rounded-lg bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex items-start gap-4">
            <CardImage
              card={currentCommander}
              width={110}
              interactive={false}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Crown className="h-3.5 w-3.5 text-type-commander" aria-hidden="true" />
                Current commander
              </div>
              <h3 className="text-lg font-semibold text-foreground">{currentCommander.name}</h3>
              <p className="text-sm text-muted-foreground">{currentCommander.type_line}</p>
              <div className="flex flex-wrap items-center gap-2">
                <ManaCost cost={currentCommander.mana_cost} size="sm" />
                <span className="rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-foreground">
                  MV {currentCommander.cmc ?? 0}
                </span>
                <ColorIdentity
                  colors={currentCommander.color_identity || currentCommander.colors}
                  size="sm"
                />
                {currentCommander.prices?.usd && (
                  <span className="text-sm tabular-nums text-muted-foreground">
                    ${currentCommander.prices.usd}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCommander(undefined as any)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="Remove commander"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/*
        Search + the shared filter, as one band.

        Four separate pieces of the shared listing vocabulary were written out
        again here: the search box (a 250ms debounce, a magnifier inset left and
        a clear button, which is `ListingSearch` line for line, minus its
        Enter-to-commit and its Escape-to-clear), the filter trigger and its
        count badge (`FilterButton`, and this copy drew the badge at a different
        size), the loose row they sat in (`FilterBar`), and the empty panel
        below (`EmptyState`). This is the only surface `/deck/:id/commander`
        has, so all four of them were the sub page the owner was looking at.
      */}
      <FilterBar
        search={
          <ListingSearch
            value={filters.state.text ?? ''}
            onCommit={commitText}
            placeholder="Search commanders, backgrounds and partners…"
            label="Search commanders"
          />
        }
        filters={
          <CardFilterSheet
            controller={filters}
            showSort={false}
            showChips={false}
            trigger={<FilterButton count={filters.activeCount} />}
          />
        }
        trailing={
          <CardSizeSlider
            storageKey="commander-picker"
            value={cardWidth}
            onValueChange={setCardWidth}
            showValue={false}
            className="hidden sm:flex"
          />
        }
        chips={
          filters.activeCount > 0 ? (
            <ActiveFilterChips controller={filters} showClear={false} />
          ) : undefined
        }
        activeCount={filters.activeCount}
        onClear={filters.reset}
      />

      {loading && <CardGridSkeleton width={cardWidth} count={8} />}

      {!loading && hasCriteria && searchResults.length === 0 && (
        <EmptyState
          title="No commander matches"
          description="Nothing legal to lead a deck came back for this search and these filters."
          onClearFilters={filters.activeCount > 0 ? filters.reset : undefined}
        />
      )}

      {/*
        The grid scrolls with the page, not inside a 448px window.

        `max-h-[28rem] overflow-y-auto` was correct when this was the body of a
        `max-h-[90vh]` dialog and something had to give. It is a route now, and
        the cap meant sixty commanders were being read three rows at a time
        through an inner scrollbar while the page behind them did not move — on
        the one screen in the product whose entire job is looking at card art.
      */}
      {!loading && searchResults.length > 0 && (
        <CardGrid width={cardWidth}>
          {searchResults.slice(0, 60).map(card => renderResult(card))}
        </CardGrid>
      )}

      {/* Most played — real EDHREC ordering from Scryfall, not invented percentages */}
      {!hasCriteria && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">
            Most played commanders
            <span className="ml-2 font-normal text-muted-foreground">by EDHREC rank</span>
          </h4>
          {topLoading ? (
            <CardGridSkeleton width={cardWidth} count={8} />
          ) : topError || topCommanders.length === 0 ? (
            <EmptyState
              title="Could not reach Scryfall"
              description="The most-played list comes from Scryfall and it did not answer. Searching by name above still works."
            />
          ) : (
            <CardGrid width={cardWidth}>
              {topCommanders.map((c, i) => renderResult(c, i + 1))}
            </CardGrid>
          )}
        </div>
      )}
    </div>
  );
}
