import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Boxes, Crown, Plus, Sparkles, Star } from 'lucide-react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { DecksSummaryStats } from '@/components/deck-builder/DecksSummaryStats';
import { DeckSearchFilters } from '@/components/deck-builder/DeckSearchFilters';
import { FirstDeckOnboarding } from '@/components/deck-builder/FirstDeckOnboarding';
import { DeckTile, DECK_HERO_COLUMN } from '@/components/deck/DeckTile';
import {
  DeckViewControls,
  useDeckViewPrefs,
  type DeckSortKey,
} from '@/components/deck/DeckViewControls';
import { CardImageSkeleton } from '@/components/cards';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';
import { useDeckFilters } from '@/hooks/useDeckFilters';
import { useDeckPowerBackfill } from '@/hooks/useDeckPowerBackfill';
import type { DeckPower } from '@/lib/deck/power';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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

  const { prefs, update: updatePrefs } = useDeckViewPrefs();

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
      const result = compareDecks(a, b, prefs.sortKey);
      return prefs.sortDir === 'asc' ? result : -result;
    });
    return copy;
  }, [filteredDecks, prefs.sortKey, prefs.sortDir]);

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
      title="Deck Manager"
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
        <div className="space-y-6">
          {!loading && deckSummaries.length > 0 && <DecksSummaryStats decks={deckSummaries} />}

          <DeckSearchFilters
            filters={filters}
            onUpdateFilters={updateFilters}
            onResetFilters={resetFilters}
            onToggleFormat={toggleFormat}
            onToggleColor={toggleColor}
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
          />

          {!loading && deckSummaries.length > 0 && (
            <DeckViewControls
              prefs={prefs}
              onChange={updatePrefs}
              resultCount={sortedDecks.length}
            />
          )}

          {loading ? (
            <div className={DECK_GRID_CLASS} aria-busy="true">
              {[0, 1, 2, 3].map(i => (
                <DeckTileSkeleton key={i} />
              ))}
            </div>
          ) : sortedDecks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Crown className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold">No decks found</h3>
                  <p className="text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? 'No deck matches these filters.'
                      : 'Create your first deck to get started.'}
                  </p>
                </div>
                {hasActiveFilters ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => navigate('/decks/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    New deck
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className={prefs.mode === 'grid' ? DECK_GRID_CLASS : 'space-y-2'}>
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
                    variant={prefs.mode}
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
          )}
        </div>
      )}

          </StandardPageLayout>
  );
}
