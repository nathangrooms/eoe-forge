import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { CardDetailPane, CardDetailSplit } from '@/components/cards/CardDetailPane';
import { OracleText } from '@/components/cards/OracleText';
import { ComprehensiveAnalytics } from '@/components/deck-builder/ComprehensiveAnalytics';
import { PowerScore } from '@/components/deck/PowerScore';
import { computeDeckPower, entriesFromDeckRows, type DeckPower } from '@/lib/deck/power';
import { DeckCardGrid } from '@/components/deck/DeckCardGrid';
import { DeckCardTable } from '@/components/deck/DeckCardTable';
import { CommanderHero } from '@/components/deck/CommanderHero';
import { ColorIdentity, ManaCost } from '@/components/ui/mana-cost';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import {
  cardImage,
  computeDeckStats,
  fetchDeckCards,
  toCardObject,
  type DeckCardRow,
} from '@/lib/deck/deckCards';
import { categorizeCard } from '@/lib/deck/cardCategories';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import type { Card as StoreCard } from '@/stores/deckStore';
import {
  AlertTriangle,
  BarChart3,
  Crown,
  Download,
  Edit,
  Eye,
  FileText,
  Heart,
} from 'lucide-react';

interface DeckRecord {
  id: string;
  name: string;
  format: string;
  colors: string[];
  description?: string | null;
}

export default function DeckInterface() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [cards, setCards] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  const loadDeck = useCallback(async () => {
    if (!id || !user) return;

    setLoading(true);
    setNotFound(false);
    try {
      const { data: deckData, error: deckError } = await supabase
        .from('user_decks')
        .select('id, name, format, colors, description')
        .eq('id', id)
        .maybeSingle();

      if (deckError) throw deckError;
      if (!deckData) {
        setNotFound(true);
        return;
      }

      // Cards are loaded with their joined `cards` metadata. Without the join
      // every card except the commander was invisible on this page, average
      // mana value was always 0.0 and deck value was always $0.
      const rows = await fetchDeckCards(id);

      setDeck(deckData as DeckRecord);
      setCards(rows);

      const { data: favoriteData } = await supabase
        .from('favorite_decks')
        .select('deck_id')
        .eq('user_id', user.id)
        .eq('deck_id', id)
        .maybeSingle();

      setIsFavorited(Boolean(favoriteData));
    } catch (error) {
      console.error('Error loading deck:', error);
      showError('Failed to load deck');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  const commander = useMemo(() => cards.find(c => c.is_commander) ?? null, [cards]);

  const selectedCardId = searchParams.get('card');
  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    const row = cards.find(c => c.card_id === selectedCardId);
    return row ? toCardObject(row) : null;
  }, [cards, selectedCardId]);

  const identity = useMemo(() => {
    if (commander?.card?.color_identity?.length) return commander.card.color_identity;
    const set = new Set<string>();
    cards.forEach(row => row.card?.color_identity?.forEach(c => set.add(c)));
    if (set.size > 0) return Array.from(set);
    return deck?.colors ?? [];
  }, [cards, commander, deck]);

  /** Deck shaped for the shared analytics engine. */
  const analyticsDeck = useMemo<StoreCard[]>(
    () =>
      cards
        .filter(row => !row.is_sideboard)
        .map(row => ({
          id: row.card_id,
          name: row.card?.name || row.card_name,
          cmc: row.card?.cmc ?? 0,
          type_line: row.card?.type_line || '',
          colors: row.card?.colors ?? [],
          color_identity: row.card?.color_identity ?? [],
          oracle_text: row.card?.oracle_text ?? '',
          power: row.card?.power ?? undefined,
          toughness: row.card?.toughness ?? undefined,
          rarity: row.card?.rarity ?? undefined,
          mana_cost: row.card?.mana_cost ?? undefined,
          quantity: row.quantity,
          category: categorizeCard(row.card?.type_line, {
            isCommander: row.is_commander,
          }) as StoreCard['category'],
          mechanics: row.card?.keywords ?? [],
        })),
    [cards]
  );

  const analyticsCommander = useMemo<StoreCard | undefined>(
    () => analyticsDeck.find(c => c.category === 'commanders'),
    [analyticsDeck]
  );

  /**
   * The deck's power, computed from the decklist on this page rather than read
   * off `user_decks.power_level`. The stat tile used to print that column — an
   * integer that was 5 for every hand-built deck — while the Analysis tab one
   * click away recomputed and printed 6.6. One tab click changed the deck's
   * power level; now both read this.
   */
  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(entriesFromDeckRows(cards), { format: deck?.format ?? 'commander' }),
    [cards, deck?.format]
  );

  const toggleFavorite = async () => {
    if (!user || !deck) return;

    try {
      if (isFavorited) {
        await supabase
          .from('favorite_decks')
          .delete()
          .eq('user_id', user.id)
          .eq('deck_id', deck.id);
        setIsFavorited(false);
        showSuccess('Removed from favorites');
      } else {
        await supabase.from('favorite_decks').insert({ user_id: user.id, deck_id: deck.id });
        setIsFavorited(true);
        showSuccess('Added to favorites');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showError('Failed to update favorites');
    }
  };

  /* The open card lives in the URL rather than in component state, so browser
     Back closes the detail pane and a deck link can carry a card with it. */
  const openCard = (row: DeckCardRow) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('card', row.card_id);
      return next;
    });
  };

  const closeCard = useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('card');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  if (loading) {
    return (
      <StandardPageLayout title="Loading deck…" description="Fetching decklist and card data">
        <div className="space-y-4" aria-busy="true">
          {[0, 1, 2].map(i => (
            <Card key={i}>
              <CardContent className="space-y-3 p-4">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </StandardPageLayout>
    );
  }

  if (notFound || !deck) {
    return (
      <StandardPageLayout title="Deck not found" description="This deck could not be loaded">
        <Card>
          <CardContent className="p-10 text-center">
            <p className="mb-4 text-muted-foreground">
              It may have been deleted, or you may not have permission to view it.
            </p>
            <Button onClick={() => navigate('/decks')}>Back to decks</Button>
          </CardContent>
        </Card>
      </StandardPageLayout>
    );
  }

  const showPower = usesPowerLevel(deck.format);

  /**
   * The commander shaped for the shared `CommanderHero`, which draws the whole
   * card through `CardImage`. This page used to draw `art_crop` into a 1136×208
   * letterbox — the one card that represents the deck, cropped to a strip, from
   * a hand-rolled `<img>`. Both are ruled out.
   */
  const heroCommander = commander
    ? {
        name: commander.card?.name || commander.card_name,
        image: cardImage(commander, 'large') ?? undefined,
        image_uris: commander.card?.image_uris ?? undefined,
      }
    : null;

  const statTiles = [
    { label: 'Cards', value: stats.totalCards.toString(), hint: undefined as string | undefined },
    { label: 'Avg MV', value: stats.avgManaValue.toFixed(2), hint: 'Lands excluded' },
    { label: 'Est. value', value: `$${stats.totalValueUSD.toFixed(2)}`, hint: undefined },
    { label: 'Unique cards', value: stats.uniqueCards.toString(), hint: undefined },
  ];

  return (
    <StandardPageLayout
      title={deck.name}
      description={`${formatLabel(deck.format)} · ${stats.totalCards} cards`}
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleFavorite}>
            <Heart className={`mr-2 h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
            {isFavorited ? 'Favorited' : 'Favorite'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/deck/${deck.id}/export`)}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={() => navigate(`/deck-builder?deck=${deck.id}`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit deck
          </Button>
        </div>
      }
    >
      {/* The deck header: the commander drawn whole beside the numbers that
          describe the deck. One row, full width, no cropped art and no
          hand-rolled <img>. */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-4 sm:flex-row sm:gap-6 sm:p-6">
          <div className="mx-auto w-[62%] min-w-0 max-w-[270px] shrink-0 sm:mx-0 sm:w-[30%] sm:max-w-[300px] sm:self-start">
            <CommanderHero
              commander={heroCommander}
              deckName={deck.name}
              format={deck.format}
              identity={identity}
              cardCount={stats.totalCards}
              size="xl"
              eager
              onClick={
                commander ? () => openCard(commander) : () => navigate(`/deck-builder?deck=${deck.id}`)
              }
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <Crown className="h-3.5 w-3.5" />
                {commander ? 'Commander' : 'No commander'}
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-bold md:text-2xl">
                  {commander
                    ? commander.card?.name || commander.card_name
                    : 'Choose one in the builder'}
                </h2>
                {commander?.card?.mana_cost ? (
                  <ManaCost cost={commander.card.mana_cost} size="sm" />
                ) : null}
              </div>
              {commander?.card?.type_line && (
                <p className="text-sm text-muted-foreground">{commander.card.type_line}</p>
              )}
              {commander?.card?.oracle_text && (
                <OracleText
                  text={commander.card.oracle_text}
                  size="xs"
                  className="mt-2 max-w-prose text-xs leading-relaxed"
                />
              )}
              {deck.description && (
                <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                  {deck.description}
                </p>
              )}
              {identity.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Colour identity
                  </span>
                  <ColorIdentity colors={identity} size="md" />
                </div>
              )}
            </div>

            {/* The owner's primary number, in the header rather than below it. */}
            {showPower && <PowerScore power={power} variant="compact" />}

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {statTiles.map(tile => (
                <div key={tile.label} className="rounded-lg bg-muted/40 p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
                  <p className="text-sm text-muted-foreground">{tile.label}</p>
                  {tile.hint && <p className="text-[10px] text-muted-foreground">{tile.hint}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Say so honestly when the local card table is missing printings.
          Surface tint, no hairline — design law 2. */}
      {stats.missingMetadata > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-muted p-4 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">
              {stats.missingMetadata} card{stats.missingMetadata === 1 ? '' : 's'} have no local
              data
            </p>
            <p className="text-muted-foreground">
              Their mana value and price are excluded from the totals above. Run a card sync from
              the admin panel to fill them in.
            </p>
          </div>
        </div>
      )}

      <CardDetailSplit
        pane={
          selectedCard ? <CardDetailPane card={selectedCard} onClose={closeCard} /> : null
        }
      >
        <Tabs defaultValue="visual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="visual">
              <Eye className="mr-2 h-4 w-4" />
              Visual
            </TabsTrigger>
            <TabsTrigger value="list">
              <FileText className="mr-2 h-4 w-4" />
              List
            </TabsTrigger>
            <TabsTrigger value="analysis">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="mt-4">
            <DeckCardGrid rows={cards} onCardClick={openCard} collapsedByDefault={['lands']} />
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <DeckCardTable rows={cards} onCardClick={openCard} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="mt-4">
            {analyticsDeck.length > 0 ? (
              <ComprehensiveAnalytics
                deck={analyticsDeck}
                format={deck.format}
                commander={analyticsCommander}
                deckId={deck.id}
              />
            ) : (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Add cards to this deck to see its analysis.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </CardDetailSplit>
    </StandardPageLayout>
  );
}
