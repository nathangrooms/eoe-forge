import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check, ChevronRight, Crown, Heart, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';
import { showError } from '@/components/ui/toast-helpers';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CommanderHero } from '@/components/deck/CommanderHero';
import { PowerScore } from '@/components/deck/PowerScore';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { computeDeckPower, entriesFromStoreCards } from '@/lib/deck/power';

/**
 * Favourite decks, on the collection page.
 *
 * This used to be four cells across, each one a 54px thumbnail of the
 * commander beside a truncated name — a deck reduced to something smaller than
 * a postage stamp, on a page that is otherwise entirely about cards. The
 * commander is how a player recognises their own deck, so it is the hero here
 * now: the full card, uncropped, at size, through the shared `CommanderHero`,
 * with at most three decks to a row so there is room for it.
 *
 * Every figure beside the card is real. Card count, deck value, cards still
 * missing and collection progress come from `compute_deck_summary`; the power
 * score comes from the one canonical engine through the one `PowerScore`
 * component. A deck that lives only in the local builder store has never been
 * priced or matched against the collection, so it shows the counts it
 * genuinely has and omits the rest — a fabricated value or a "100% owned" for
 * a deck nobody has checked is worse than a gap.
 */

/** A summary plus where it came from — local decks have no economy data. */
interface FavoriteEntry {
  summary: DeckSummary;
  local: boolean;
}

/** Three across at most, so the commander card never shrinks to a thumbnail. */
const MAX_FAVORITES = 3;

function currency(value: number | null | undefined): string {
  return `$${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

/** One figure on its own muted panel. Surface tint for depth, never a border. */
function Stat({
  value,
  label,
  hint,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center" title={hint}>
      <span className="flex items-center justify-center gap-1 text-lg font-bold leading-none tabular-nums text-foreground">
        {value}
      </span>
      <span className="mt-1.5 block text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function FavoriteDecksPreview() {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadFavoriteDecks();
  }, []);

  const loadFavoriteDecks = async () => {
    try {
      // First get all local decks from the store
      const { useDeckManagementStore } = await import('@/stores/deckManagementStore');
      const localDecks = useDeckManagementStore.getState().decks;

      // Convert local decks to summary format and filter favorites
      const localSummaries: DeckSummary[] = localDecks
        .filter(deck => deck.favorite)
        .map(deck => ({
          id: deck.id,
          name: `${deck.name} (Local)`,
          format: deck.format,
          colors: deck.colors,
          identity: deck.colors,
          commander: deck.commander ? {
            name: deck.commander.name,
            image:
              deck.commander.image_uris?.large ||
              deck.commander.image_uris?.normal ||
              deck.commander.image_uris?.small ||
              ''
          } : undefined,
          counts: {
            total: deck.totalCards,
            unique: deck.cards.length,
            lands: deck.cards.filter(c => c.category === 'lands').reduce((sum, c) => sum + c.quantity, 0),
            creatures: deck.cards.filter(c => c.category === 'creatures').reduce((sum, c) => sum + c.quantity, 0),
            instants: deck.cards.filter(c => c.category === 'instants').reduce((sum, c) => sum + c.quantity, 0),
            sorceries: deck.cards.filter(c => c.category === 'sorceries').reduce((sum, c) => sum + c.quantity, 0),
            artifacts: deck.cards.filter(c => c.category === 'artifacts').reduce((sum, c) => sum + c.quantity, 0),
            enchantments: deck.cards.filter(c => c.category === 'enchantments').reduce((sum, c) => sum + c.quantity, 0),
            planeswalkers: deck.cards.filter(c => c.category === 'planeswalkers').reduce((sum, c) => sum + c.quantity, 0),
            battles: 0
          },
          curve: { bins: { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6-7': 0, '8-9': 0, '10+': 0 } },
          mana: { sources: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, untappedPctByTurn: { t1: 0, t2: 0, t3: 0 } },
          legality: { ok: true, issues: [] },
          // A local deck has no database row to store a score in, so it is
          // scored here from the list the store already holds — by the same
          // engine, so a local deck and a saved deck in this one list are
          // measured the same way rather than one being labelled 'mid'.
          power: computeDeckPower(entriesFromStoreCards(deck.cards as any), {
            format: deck.format,
          }),
          // Never priced and never matched against the collection. The tile
          // reads `local` and shows counts instead of these placeholders.
          economy: { priceUSD: 0, ownedPct: 100, missing: 0 },
          tags: [],
          updatedAt: deck.updatedAt instanceof Date ? deck.updatedAt.toISOString() : new Date().toISOString(),
          favorite: true
        }));

      let allFavorites: FavoriteEntry[] = localSummaries.map(summary => ({
        summary,
        local: true,
      }));

      // Then try to load database favorites if user is authenticated
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const dbSummaries = await DeckAPI.getDeckSummaries();
          allFavorites = [
            ...allFavorites,
            ...dbSummaries
              .filter(deck => deck.favorite)
              .map(summary => ({ summary, local: false })),
          ];
        }
      } catch (error) {
        console.error('Error loading database favorites:', error);
        // Continue with just local favorites
      }

      setFavorites(allFavorites.slice(0, MAX_FAVORITES));
    } catch (error) {
      console.error('Error loading favorite decks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeckClick = (entry: FavoriteEntry) => {
    try {
      // Navigate straight in rather than loading into the store first.
      navigate(
        entry.local
          ? `/builder?loadLocal=${entry.summary.id}`
          : `/builder?loadDeck=${entry.summary.id}`
      );
    } catch (error) {
      console.error('Error loading deck:', error);
      showError('Error', 'Failed to load deck');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Favourite decks</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Heart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-medium">No favourite decks yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Star a deck and it sits here with its commander, so you can see what your
          collection is feeding at a glance.
        </p>
        <Button variant="secondary" onClick={() => navigate('/decks')} className="mt-4">
          <Plus className="mr-2 h-4 w-4" />
          Browse decks
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Favourite decks</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/decks')}>
          View all
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {favorites.map(entry => {
          const deck = entry.summary;
          const counts = deck.counts;
          const identity = deck.identity?.length ? deck.identity : deck.colors;
          const missing = deck.economy?.missing ?? 0;
          const owned = Math.max(counts.total - missing, 0);
          const ownedPct = counts.total > 0 ? Math.round((owned / counts.total) * 100) : 0;
          const complete = missing === 0;
          const showPower = usesPowerLevel(deck.format);

          return (
            <Card
              key={deck.id}
              role="button"
              tabIndex={0}
              onClick={() => handleDeckClick(entry)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDeckClick(entry);
                }
              }}
              aria-label={`Open ${deck.name}`}
              className="cursor-pointer overflow-hidden transition-shadow duration-200 hover:shadow-2xl hover:shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <div className="flex gap-4 p-4">
                {/* The commander card is the deck. Percentage-first so it grows
                    with the tile, capped so it stays sane on a wide screen. */}
                <div className="w-[44%] min-w-0 max-w-[230px] shrink-0 self-start">
                  <CommanderHero
                    commander={deck.commander}
                    deckName={deck.name}
                    format={deck.format}
                    identity={identity}
                    cardCount={counts.total}
                    size="lg"
                    onClick={() => handleDeckClick(entry)}
                  />
                  {/* No badge over the art. Everything in this section is a
                      favourite, and the one place a marker could sit is
                      directly on top of the card's own name. */}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div>
                    <h4 className="line-clamp-2 text-base font-bold leading-tight tracking-tight">
                      {deck.name}
                    </h4>
                    {deck.commander?.name && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Crown className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{deck.commander.name}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {formatLabel(deck.format)}
                    </span>
                    <ColorIdentity colors={identity} size="sm" className="ml-auto gap-1" />
                  </div>

                  {/* `compact`, not `inline`: the card is 320px tall and the
                      column beside it was coming in 100px short, which left a
                      hole above the progress bar. The bracket is worth the
                      space anyway — it is the number players actually trade. */}
                  {showPower && <PowerScore power={deck.power} variant="compact" />}

                  {entry.local ? (
                    <div className="grid grid-cols-3 gap-2">
                      <Stat value={counts.total} label="Cards" />
                      <Stat value={counts.unique} label="Unique" />
                      <Stat value={counts.lands} label="Lands" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <Stat
                          value={counts.total}
                          label="Cards"
                          hint={`${counts.unique} unique cards`}
                        />
                        <Stat
                          value={currency(deck.economy?.priceUSD)}
                          label="Value"
                          hint="Sum of USD market prices for every card in the deck"
                        />
                        <Stat
                          value={complete ? <Check className="h-4 w-4" /> : missing}
                          label={complete ? 'Complete' : 'Missing'}
                          hint={
                            complete
                              ? 'You own every card in this deck'
                              : `${missing} cards you do not own yet`
                          }
                        />
                      </div>

                      <div className="mt-auto">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">From your collection</span>
                          <span className="font-semibold tabular-nums">
                            {ownedPct}%
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              {owned}/{counts.total}
                            </span>
                          </span>
                        </div>
                        <Progress
                          value={ownedPct}
                          className="h-2 bg-muted"
                          aria-label={`${ownedPct}% of this deck is in your collection`}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
