import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Boxes, Crown, Plus, Sparkles, Star } from 'lucide-react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { DecksSummaryStats } from '@/components/deck-builder/DecksSummaryStats';
import { DeckSearchFilters } from '@/components/deck-builder/DeckSearchFilters';
import { FirstDeckOnboarding } from '@/components/deck-builder/FirstDeckOnboarding';
import { DeckTile, DECK_HERO_COLUMN } from '@/components/deck/DeckTile';
import {
  DECK_LISTING_MODES,
  DECK_SORT_OPTIONS,
  DECK_VIEW_SURFACE,
  type DeckSortKey,
} from '@/components/deck/DeckViewControls';
import {
  FilterBar,
  ListingFrame,
  ListingSearch,
  RemovableChip,
  SortControl,
  matchedLabel,
  resultSentence,
  useListingView,
  useSearchText,
} from '@/components/listing';
import { CardImageSkeleton } from '@/components/cards';
import { ManaPip } from '@/components/ui/mana-cost';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';
import { COLOR_MATCH_LABELS, useDeckFilters } from '@/hooks/useDeckFilters';
import { useDeckPowerBackfill } from '@/hooks/useDeckPowerBackfill';
import { formatLabel } from '@/lib/deck/formats';
import type { DeckPower } from '@/lib/deck/power';

/**
 * Two tiles per row on desktop, and never more.
 *
 * A hard ceiling rather than an `auto-fill` track: the commander card is the
 * hero of the tile, so the tile has to stay wide enough for the art to be big.
 * A third column at 1600px would shrink every commander back towards the
 * thumbnail this redesign exists to get rid of.
 *
 * The second column starts at `xl`, not `lg`. With the 280px rail, `lg` leaves
 * each tile ~350px wide — the commander would be back down to 130px and the
 * action buttons would not fit. Below `xl` a single full-width tile gives the
 * card ~340px instead.
 */
const DECK_GRID_CLASS = 'grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5';

/** Same footprint as a real tile, so the first paint does not jump. */
function DeckTileSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-5">
        <div className={DECK_HERO_COLUMN}>
          <CardImageSkeleton size="xl" fill />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-[86px] animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-[62px] animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none"
              />
            ))}
          </div>
          <div className="h-2 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Comparator for the deck sort control. */
function compareDecks(a: DeckSummary, b: DeckSummary, key: DeckSortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'power':
      return (a.power?.score ?? 0) - (b.power?.score ?? 0);
    case 'value':
      return (a.economy?.priceUSD ?? 0) - (b.economy?.priceUSD ?? 0);
    case 'cards':
      return (a.counts?.total ?? 0) - (b.counts?.total ?? 0);
    case 'completion': {
      const pct = (d: DeckSummary) =>
        d.counts?.total > 0 ? 1 - (d.economy?.missing ?? 0) / d.counts.total : 0;
      return pct(a) - pct(b);
    }
    case 'updated':
    default:
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  }
}

export default function Decks() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [deckSummaries, setDeckSummaries] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboardingFlow, setShowOnboardingFlow] = useState(false);
  const [creatingFirstDeck, setCreatingFirstDeck] = useState(false);


  /**
   * Analysis, missing cards, share and export used to be four overlays launched
   * off this one list — two dialogs and two drawers, each with its own open
   * flag and its own copy of the deck's id and name. They are routes now, so
   * the tile just navigates and this page keeps no state for them at all.
   */

  /* The surface name is the key `useDeckViewPrefs` has always written, so
     nobody's grid-or-list choice resets. Card size and page size derive from it
     too and are unused here: this page has neither control, by the reasoning in
     `DeckViewControls`. */
  const view = useListingView({
    surface: DECK_VIEW_SURFACE,
    modes: DECK_LISTING_MODES,
    defaultMode: 'grid',
    defaultSortKey: 'updated',
    defaultSortDir: 'desc',
  });
  const sortKey = view.sortKey as DeckSortKey;

  const {
    filters,
    filteredDecks,
    updateFilters,
    resetFilters,
    toggleFormat,
    toggleColor,
    hasActiveFilters,
    activeFilterCount,
  } = useDeckFilters(deckSummaries);

  /*
   * The search text lives in the URL now.
   *
   * It did not, and the audit named the consequence: a narrowed deck list was
   * not something you could send anybody and the back button did not undo a
   * search. `useSearchText` exists for exactly this case, a surface with no
   * shared filter controller of its own, and it writes with `replace` so typing
   * does not deposit a history entry per word.
   *
   * The box also has the shared 250ms debounce. This page had none, so it
   * re-filtered the whole library on every keystroke.
   */
  const [searchText, commitSearchText] = useSearchText('q');
  useEffect(() => {
    updateFilters({ searchQuery: searchText });
  }, [searchText, updateFilters]);

  const loadDeckSummaries = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) {
        setDeckSummaries([]);
        return;
      }
      const summaries = await DeckAPI.getDeckSummaries();
      setDeckSummaries(summaries);
    } catch (error) {
      console.error('Error loading decks:', error);
      showError('Error', 'Failed to load your decks');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDeckSummaries();
  }, [loadDeckSummaries]);

  /**
   * Any deck whose stored score is missing or no longer matches its decklist is
   * rescored in the background, so the number on the tile is the same number
   * the deck page and the builder will show.
   */
  const applyScore = useCallback((deckId: string, power: DeckPower) => {
    setDeckSummaries(prev => prev.map(deck => (deck.id === deckId ? { ...deck, power } : deck)));
  }, []);

  const { scoring, rescore } = useDeckPowerBackfill(deckSummaries, applyScore);

  const sortedDecks = useMemo(() => {
    const copy = [...filteredDecks];
    copy.sort((a, b) => {
      const result = compareDecks(a, b, sortKey);
      return view.sortDir === 'asc' ? result : -result;
    });
    return copy;
  }, [filteredDecks, sortKey, view.sortDir]);

  /**
   * Clear everything the bar can see, the favourites toggle included.
   *
   * The toggle sits in the page's action row rather than in the bar, because it
   * is how somebody arrives at their favourites rather than a facet they go
   * looking for. It is still a filter, so it is still counted, still shown as a
   * removable chip, and still cleared here. The collection paid for the lesson
   * that "Clear all" clearing half of what is on leaves a narrowed list with
   * nothing on screen saying why.
   */
  const clearEverything = useCallback(() => {
    resetFilters();
    commitSearchText(undefined);
  }, [resetFilters, commitSearchText]);

  const powerNarrowed = filters.minPower !== 1 || filters.maxPower !== 10;

  const summary = resultSentence([matchedLabel(sortedDecks.length, deckSummaries.length, 'deck')]);

  const handleCreateFirstDeck = async (
    name: string,
    format: 'commander' | 'standard' | 'custom',
    commanderId?: string
  ) => {
    if (!user) return;

    setCreatingFirstDeck(true);
    try {
      const { data: newDeck, error } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name,
          format,
          // power_level is a mirror of the canonical EDH score, written only by
          // `persistDeckPower`. Seeding it with a literal 5 is what made every
          // hand-built deck read "Power 5/10" forever.
          colors: [],
          description: '',
        })
        .select()
        .single();

      if (error) throw error;

      if (commanderId && newDeck) {
        try {
          const response = await fetch(`https://api.scryfall.com/cards/${commanderId}`);
          if (response.ok) {
            const commanderCard = await response.json();

            await supabase.from('deck_cards').insert({
              deck_id: newDeck.id,
              card_id: commanderId,
              card_name: commanderCard.name,
              quantity: 1,
              is_commander: true,
              is_sideboard: false,
            });

            if (commanderCard.color_identity?.length > 0) {
              await supabase
                .from('user_decks')
                .update({ colors: commanderCard.color_identity })
                .eq('id', newDeck.id);
            }
          }
        } catch (commanderError) {
          console.error('Error adding commander:', commanderError);
        }
      }

      showSuccess('Deck created', `"${name}" is ready`);
      if (newDeck) navigate(`/deck-builder?deck=${newDeck.id}`);
    } catch (error) {
      console.error('Error creating deck:', error);
      showError('Error', 'Failed to create deck');
    } finally {
      setCreatingFirstDeck(false);
    }
  };

  /**
   * The tile's menu already confirmed in place — design law 3 keeps a
   * confirmation inside the control that started it — so by the time this runs
   * the answer is yes and there is nothing left to dim the page for.
   */
  const deleteDeck = async (deckSummary: DeckSummary) => {
    try {
      const { error } = await supabase.from('user_decks').delete().eq('id', deckSummary.id);
      if (error) throw error;

      showSuccess('Deck deleted', `"${deckSummary.name}" has been deleted`);
      await loadDeckSummaries();
    } catch (error) {
      console.error('Error deleting deck:', error);
      showError('Delete failed', 'Failed to delete deck. Please try again.');
    }
  };

  const duplicateDeck = async (deckSummary: DeckSummary) => {
    try {
      await DeckAPI.duplicateDeck(deckSummary.id);
      showSuccess('Deck duplicated', `Created a copy of "${deckSummary.name}"`);
      await loadDeckSummaries();
    } catch (error) {
      console.error('Error duplicating deck:', error);
      showError('Error', 'Failed to duplicate deck');
    }
  };

  const showOnboarding = !loading && (deckSummaries.length === 0 || showOnboardingFlow);

  return (
    <StandardPageLayout
      /* "My Decks", the same words as the left nav and the same words the
         owner uses for it. It said "Deck Manager", so one place had two names
         depending on whether you were reading the rail or the page. */
      title="My Decks"
      description="Create, analyse and optimise your Magic: The Gathering decks"
      action={
        showOnboarding ? null : (
          <div className="flex items-center gap-2">
            {/* Favourites live here now, as a way of narrowing your decks,
                rather than as a block on the collection page. */}
            <Button
              variant={filters.favoritesOnly ? 'default' : 'secondary'}
              onClick={() => updateFilters({ favoritesOnly: !filters.favoritesOnly })}
              aria-pressed={filters.favoritesOnly}
              title={filters.favoritesOnly ? 'Showing favourites only' : 'Show favourites only'}
            >
              <Star
                className={cn('mr-2 h-4 w-4', filters.favoritesOnly && 'fill-current')}
              />
              <span className="hidden sm:inline">Favourites</span>
            </Button>
            {/* Archetypes made way for the two things people actually come here
                to start a deck with. Owner: "remove archetypes and add the Deck
                Generator", then "replace archetypes with precons maybe". Both,
                since they are the two routes into a new deck that are not
                building it by hand. */}
            <Button variant="secondary" onClick={() => navigate('/smart-builder')}>
              <Sparkles className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Deck Generator</span>
            </Button>
            <Button variant="secondary" onClick={() => navigate('/precons')}>
              <Boxes className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Precons</span>
            </Button>
            {/* Goes to the new deck page, the same place the left menu and the
                top bar go. It used to open an onboarding wizard, so the same
                words in three places did two different things. Owner: "new deck
                button goes to a wizard - this is wrong, it should go to the new
                deck page in left menu". */}
            <Button onClick={() => navigate('/decks/new')}>
              <Plus className="mr-2 h-4 w-4" />
              New deck
            </Button>
          </div>
        )
      }
    >
      {showOnboarding ? (
        <FirstDeckOnboarding
          onCreateDeck={async (name, format, commanderId) => {
            await handleCreateFirstDeck(name, format, commanderId);
            setShowOnboardingFlow(false);
          }}
          loading={creatingFirstDeck}
        />
      ) : (
        <div className="space-y-4">
          {/* The row holds its 95px from the first paint rather than appearing
              when the decks land and shoving the grid down. */}
          <DecksSummaryStats decks={deckSummaries} loading={loading} />

          <FilterBar
            view={view}
            activeCount={activeFilterCount}
            onClear={clearEverything}
            search={
              <ListingSearch
                value={searchText}
                onCommit={commitSearchText}
                placeholder="Search your decks by name"
                label="Search decks"
              />
            }
            filters={
              <DeckSearchFilters
                filters={filters}
                onUpdateFilters={updateFilters}
                onResetFilters={clearEverything}
                onToggleFormat={toggleFormat}
                onToggleColor={toggleColor}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
              />
            }
            sort={
              <SortControl
                options={DECK_SORT_OPTIONS}
                value={sortKey}
                onValueChange={view.setSortKey}
                dir={view.sortDir}
                onToggleDir={view.toggleSortDir}
                label="Sort decks by"
              />
            }
            chips={
              /* Chips are new here. The popover this replaces showed what was on
                 only while it was open, so a reader who set a power range and
                 closed it was looking at a short list with a badge for an
                 explanation. */
              activeFilterCount > 0 ? (
                <>
                  {filters.favoritesOnly && (
                    <RemovableChip onRemove={() => updateFilters({ favoritesOnly: false })}>
                      Favourites only
                    </RemovableChip>
                  )}
                  {filters.format.map(format => (
                    <RemovableChip key={format} onRemove={() => toggleFormat(format)}>
                      {formatLabel(format)}
                    </RemovableChip>
                  ))}
                  {filters.colors.map(color => (
                    <RemovableChip key={color} onRemove={() => toggleColor(color)}>
                      <span className="flex items-center gap-1.5">
                        <ManaPip symbol={color} size="xs" />
                        {COLOR_MATCH_LABELS[filters.colorMode]}
                      </span>
                    </RemovableChip>
                  ))}
                  {powerNarrowed && (
                    <RemovableChip
                      onRemove={() => updateFilters({ minPower: 1, maxPower: 10 })}
                    >
                      Power {filters.minPower} to {filters.maxPower}
                    </RemovableChip>
                  )}
                </>
              ) : null
            }
          />

          <ListingFrame
            view={view}
            count={sortedDecks.length}
            loading={loading}
            /* Handed over unconditionally: the frame holds the line's box
               while the decks are in flight and stays quiet when there is
               nothing to count, so the grid below does not move when the data
               lands. */
            summary={summary}
            /* Deck tiles, not card placeholders: the real tile is 340px tall
               and a grid of 12 card-shaped bars would jump when it landed. */
            skeleton={
              <div className={DECK_GRID_CLASS} aria-busy="true">
                {[0, 1, 2, 3].map(i => (
                  <DeckTileSkeleton key={i} />
                ))}
              </div>
            }
            empty={{
              title: hasActiveFilters ? 'No deck matches these filters' : 'No decks yet',
              description: hasActiveFilters
                ? 'Widen a filter, or clear them all and start again.'
                : 'Create your first deck to get started.',
              icon: Crown,
              onClearFilters: hasActiveFilters ? clearEverything : undefined,
              action: hasActiveFilters
                ? undefined
                : { label: 'New deck', onClick: () => navigate('/decks/new') },
            }}
          >
            {/* Both modes are `rows`, so the frame hands the body straight
                through and the two-column cap on the grid is kept here where it
                is documented. */}
            <div className={view.mode === 'grid' ? DECK_GRID_CLASS : 'space-y-2'}>
              {sortedDecks.map((deckSummary, index) => (
                // The wrapper carries the entrance stagger and `h-full`, so the
                // two tiles in a row keep equal height whatever their content.
                <div
                  key={deckSummary.id}
                  className="h-full animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-fill-mode:both] motion-reduce:animate-none"
                  style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
                >
                  <DeckTile
                    deckSummary={deckSummary}
                    variant={view.mode as 'grid' | 'list'}
                    priority={index < 2}
                    className="h-full"
                    // The backfill hook was computed and then never handed to
                    // the tile, so the "Score deck" control on an unscored deck
                    // did not exist and its spinner never span.
                    rescoring={scoring.has(deckSummary.id)}
                    onRescore={() => rescore(deckSummary.id, deckSummary.format)}
                    onOpen={() => navigate(`/deck/${deckSummary.id}`)}
                    onEdit={() => navigate(`/deck-builder?deck=${deckSummary.id}`)}
                    onDuplicate={() => duplicateDeck(deckSummary)}
                    onDelete={() => deleteDeck(deckSummary)}
                    onAnalysis={() => navigate(`/deck/${deckSummary.id}/analysis`)}
                    onMissingCards={() => navigate(`/deck/${deckSummary.id}/missing`)}
                    onShare={() => navigate(`/deck/${deckSummary.id}/share`)}
                    onExport={() => navigate(`/deck/${deckSummary.id}/export`)}
                    onFavoriteChange={loadDeckSummaries}
                  />
                </div>
              ))}
            </div>
          </ListingFrame>
        </div>
      )}
    </StandardPageLayout>
  );
}
