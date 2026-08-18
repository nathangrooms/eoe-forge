import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Crown, Heart, Plus, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';
import { useDeckStore } from '@/stores/deckStore';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards';
import { PowerScoreBadge } from '@/components/deck/PowerScore';
import { computeDeckPower, entriesFromStoreCards } from '@/lib/deck/power';

interface FavoriteDeck {
  deck_id: string;
  user_decks: {
    id: string;
    name: string;
    format: string;
    colors: string[];
    power_level: number;
    updated_at: string;
  };
}

export function FavoriteDecksPreview() {
  const [favoriteDecks, setFavoriteDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const deck = useDeckStore();

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
          economy: { priceUSD: 0, ownedPct: 100, missing: 0 },
          tags: [],
          updatedAt: deck.updatedAt instanceof Date ? deck.updatedAt.toISOString() : new Date().toISOString(),
          favorite: true
        }));

      let allFavorites: DeckSummary[] = [...localSummaries];

      // Then try to load database favorites if user is authenticated
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const dbSummaries = await DeckAPI.getDeckSummaries();
          const dbFavorites = dbSummaries.filter(deck => deck.favorite);
          allFavorites = [...allFavorites, ...dbFavorites];
        }
      } catch (error) {
        console.error('Error loading database favorites:', error);
        // Continue with just local favorites
      }

      setFavoriteDecks(allFavorites.slice(0, 4));
    } catch (error) {
      console.error('Error loading favorite decks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getColorIndicator = (colors: string[]) => (
    <ColorIdentity colors={colors} size="xs" />
  );

  const handleDeckClick = async (deckSummary: DeckSummary) => {
    try {
      if (deckSummary.name.includes('(Local)')) {
        // Handle local deck loading - navigate directly without loading into store
        navigate(`/builder?loadLocal=${deckSummary.id}`);
      } else {
        // Handle database deck loading - navigate directly without loading into store
        navigate(`/builder?loadDeck=${deckSummary.id}`);
      }
    } catch (error) {
      console.error('Error loading deck:', error);
      showError("Error", "Failed to load deck");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Favorite Decks</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (favoriteDecks.length === 0) {
    return (
      <Card className="">
        <CardContent className="p-6 text-center">
          <Heart className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="font-medium mb-2">No Favorite Decks</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add some decks to your favorites to see them here
          </p>
          <Button variant="secondary" onClick={() => navigate('/decks')}>
            <Plus className="h-4 w-4 mr-2" />
            Browse Decks
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Favorite Decks</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/decks')}>
          View All
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {favoriteDecks.map((deck) => {
          return (
            <Card
              key={deck.id}
              className="cursor-pointer transition-all hover:shadow-xl hover:shadow-black/30"
              onClick={() => handleDeckClick(deck)}
            >
              <CardContent className="flex gap-3 p-3">
                {/* A deck is recognised by its commander long before its name. */}
                <CardImage
                  card={{
                    name: deck.commander?.name ?? deck.name,
                    image_uris: deck.commander?.image
                      ? { large: deck.commander.image }
                      : undefined,
                  }}
                  width={54}
                  hideFlip
                  interactive={false}
                />

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">{deck.name}</h4>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {deck.format}
                        </Badge>
                        {deck.format === 'commander' && (
                          <Crown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        )}
                      </div>
                    </div>
                    <Heart
                      className="h-4 w-4 shrink-0 fill-current text-foreground"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    {(deck.colors?.length ?? 0) > 0 && getColorIndicator(deck.colors)}
                    {/* One renderer, so a favourite shows the same figure here
                        as it does on its own tile. A deck that has never been
                        scored simply says so rather than borrowing a band. */}
                    {deck.power && <PowerScoreBadge power={deck.power} />}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}