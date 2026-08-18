import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { CardDetailPane, CardDetailSplit } from '@/components/cards/CardDetailPane';
import { ComprehensiveAnalytics } from '@/components/deck-builder/ComprehensiveAnalytics';
import { DeckCardGrid } from '@/components/deck/DeckCardGrid';
import { DeckCardTable } from '@/components/deck/DeckCardTable';
import { DeckExportDialog } from '@/components/deck/DeckExportDialog';
import { ColorIdentity } from '@/components/ui/mana-cost';
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
  power_level: number;
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
  const [showExport, setShowExport] = useState(false);

  const loadDeck = useCallback(async () => {
    if (!id || !user) return;

    setLoading(true);
    setNotFound(false);
    try {
      const { data: deckData, error: deckError } = await supabase
        .from('user_decks')
        .select('id, name, format, colors, power_level, description')
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
  const heroArt = commander ? cardImage(commander, 'art_crop') : null;

  const statTiles = [
    { label: 'Cards', value: stats.totalCards.toString(), hint: undefined as string | undefined },
    { label: 'Avg MV', value: stats.avgManaValue.toFixed(2), hint: 'Lands excluded' },
    { label: 'Est. value', value: `$${stats.totalValueUSD.toFixed(2)}`, hint: undefined },
    showPower
      ? { label: 'Power level', value: `${deck.power_level ?? 0}/10`, hint: undefined }
      : { label: 'Unique cards', value: stats.uniqueCards.toString(), hint: undefined },
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
          <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
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
      {/* Commander banner */}
      {commander && (
        <Card className="mb-6 overflow-hidden">
          <div className="relative">
            {heroArt && (
              <img
                src={heroArt}
                alt=""
                className="h-40 w-full object-cover object-center md:h-52"
                loading="lazy"
              />
            )}
            <div
              className={
                heroArt
                  ? 'absolute inset-0 flex items-end bg-black/55 p-5'
                  : 'flex items-end bg-muted p-5'
              }
            >
              <div>
                <p
                  className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${
                    heroArt ? 'text-white/80' : 'text-muted-foreground'
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  Commander
                </p>
                <h2
                  className={`mt-1 text-xl font-bold md:text-2xl ${
                    heroArt ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {commander.card?.name || commander.card_name}
                </h2>
                {commander.card?.type_line && (
                  <p className={`text-sm ${heroArt ? 'text-white/80' : 'text-muted-foreground'}`}>
                    {commander.card.type_line}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Say so honestly when the local card table is missing printings */}
      {stats.missingMetadata > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-border bg-muted p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">
              {stats.missingMetadata} card{stats.missingMetadata === 1 ? '' : 's'} have no local
              data
            </p>
            <p className="text-muted-foreground">
              Their mana value and price are excluded from the totals below. Run a card sync from
              the admin panel to fill them in.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statTiles.map(tile => (
          <Card key={tile.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
              {tile.hint && <p className="text-[10px] text-muted-foreground">{tile.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {identity.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Colour identity</span>
          <ColorIdentity colors={identity} size="md" />
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

      <DeckExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        deckId={deck.id}
        deckName={deck.name}
      />
    </StandardPageLayout>
  );
}
