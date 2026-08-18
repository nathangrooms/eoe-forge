import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { DeckCardGrid } from '@/components/deck/DeckCardGrid';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { toast } from 'sonner';
import { ChevronRight, Crown, Layers, Loader2, Package, Save, Search } from 'lucide-react';
import {
  cardImage,
  computeDeckStats,
  fetchCardsByIds,
  scryfallImageUrl,
  type DeckCardRow,
} from '@/lib/deck/deckCards';
import { averageManaValue } from '@/lib/deck/curve';

/**
 * Precon browser.
 *
 * Previously this page fired `supabase.functions.invoke('fetch-precons')` and
 * discarded the result, then immediately re-fetched the same function with
 * `fetch()` against a hardcoded project URL — a wasted round trip on every
 * load. It also rendered a 100-card decklist as two plain text columns with no
 * card imagery for a product line that is chosen almost entirely on commander
 * art and colour identity.
 */

const FUNCTIONS_BASE = `${
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
}/functions/v1`;

interface PreconListItem {
  id: string;
  name: string;
  set: string;
  filename: string;
}

interface PreconCard {
  quantity: number;
  card_name: string;
  scryfall_id: string;
  is_commander: boolean;
}

interface PreconDeck {
  name: string;
  set: string;
  format: string;
  cards: PreconCard[];
  totalCards: number;
}

async function callPreconFunction(path: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const response = await fetch(`${FUNCTIONS_BASE}/fetch-precons${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) throw new Error(`fetch-precons failed: ${response.status}`);
  return response.json();
}

export default function Precons() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [precons, setPrecons] = useState<PreconListItem[]>([]);
  const [bySet, setBySet] = useState<Record<string, PreconListItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSet, setExpandedSet] = useState<string | null>(null);
  const [selectedPrecon, setSelectedPrecon] = useState<PreconListItem | null>(null);
  const [preconDetails, setPreconDetails] = useState<PreconDeck | null>(null);
  const [preconRows, setPreconRows] = useState<DeckCardRow[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchPreconList = async () => {
      setLoading(true);
      setListError(null);
      try {
        const result = await callPreconFunction('?action=list');
        if (cancelled) return;
        setPrecons(result.precons ?? []);
        setBySet(result.bySet ?? {});
      } catch (error) {
        console.error('Error fetching precons:', error);
        if (!cancelled) setListError('Could not load the precon catalogue.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreconList();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPreconDetails = async (precon: PreconListItem) => {
    setLoadingDetails(true);
    setSelectedPrecon(precon);
    setPreconDetails(null);
    setPreconRows([]);

    try {
      const result: PreconDeck = await callPreconFunction(
        `?action=get&deck=${encodeURIComponent(precon.id)}`
      );
      setPreconDetails(result);

      const base: DeckCardRow[] = (result.cards ?? []).map((card, index) => ({
        id: `${card.scryfall_id || card.card_name}-${index}`,
        card_id: card.scryfall_id,
        card_name: card.card_name,
        quantity: card.quantity,
        is_commander: card.is_commander,
        is_sideboard: false,
        card: null,
      }));

      try {
        const details = await fetchCardsByIds(base.map(row => row.card_id));
        setPreconRows(
          base.map(row => ({ ...row, card: details.get(row.card_id) ?? null }))
        );
      } catch (lookupError) {
        console.error('Precon card lookup failed:', lookupError);
        setPreconRows(base);
      }
    } catch (error) {
      console.error('Error fetching precon details:', error);
      toast.error('Failed to load deck details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const savePreconToDeck = async () => {
    if (!preconDetails || !user) return;

    setSavingDeck(true);
    try {
      const identity = Array.from(
        new Set(
          preconRows
            .filter(row => row.is_commander)
            .flatMap(row => row.card?.color_identity ?? [])
        )
      );

      const { data: deck, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: `${preconDetails.name} (Precon)`,
          format: 'commander',
          colors: identity,
          power_level: 5,
          description: `Official precon deck from ${preconDetails.set}`,
        })
        .select()
        .single();

      if (deckError) throw deckError;

      const cardNames = preconDetails.cards.map(c => c.card_name);
      const { data: foundCards, error: lookupError } = await supabase
        .from('cards')
        .select('id, name')
        .in('name', cardNames);

      if (lookupError) console.error('Error looking up cards:', lookupError);

      const cardIdMap: Record<string, string> = {};
      for (const card of foundCards ?? []) {
        cardIdMap[card.name.toLowerCase()] = card.id;
      }

      const cardInserts: Array<{
        deck_id: string;
        card_id: string;
        card_name: string;
        quantity: number;
        is_commander: boolean;
        is_sideboard: boolean;
      }> = [];
      const notFound: string[] = [];

      for (const card of preconDetails.cards) {
        const cardId = cardIdMap[card.card_name.toLowerCase()];
        if (cardId) {
          cardInserts.push({
            deck_id: deck.id,
            card_id: cardId,
            card_name: card.card_name,
            quantity: card.quantity,
            is_commander: card.is_commander,
            is_sideboard: false,
          });
        } else {
          notFound.push(card.card_name);
        }
      }

      if (cardInserts.length > 0) {
        const { error: cardsError } = await supabase.from('deck_cards').insert(cardInserts);
        if (cardsError) {
          console.error('Error inserting cards:', cardsError);
          toast.error('Failed to save some cards to deck');
        }
      }

      if (notFound.length > 0) {
        toast.warning(
          `${notFound.length} cards are not in the local card database. Run a card sync from the admin panel.`
        );
      }

      if (cardInserts.length > 0) {
        toast.success(`Saved "${preconDetails.name}" with ${cardInserts.length} cards`);
        navigate(`/deck-builder?deck=${deck.id}`);
      } else {
        toast.error('No cards could be added. Sync cards from the admin panel first.');
      }
    } catch (error) {
      console.error('Error saving precon:', error);
      toast.error('Failed to save deck');
    } finally {
      setSavingDeck(false);
    }
  };

  const filteredSets = useMemo(() => {
    if (!searchQuery) return bySet;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, PreconListItem[]> = {};

    for (const [set, decks] of Object.entries(bySet)) {
      const matching = decks.filter(
        d => d.name.toLowerCase().includes(query) || d.set.toLowerCase().includes(query)
      );
      if (matching.length > 0) filtered[set] = matching;
    }

    return filtered;
  }, [bySet, searchQuery]);

  const sortedSets = useMemo(
    () =>
      Object.keys(filteredSets).sort((a, b) => {
        const yearA = a.match(/\d{4}/)?.[0] || '0';
        const yearB = b.match(/\d{4}/)?.[0] || '0';
        return yearB.localeCompare(yearA) || a.localeCompare(b);
      }),
    [filteredSets]
  );

  const commanderRow = preconRows.find(row => row.is_commander) ?? null;
  const commanderArt = commanderRow
    ? cardImage(commanderRow, 'art_crop') ?? scryfallImageUrl(commanderRow.card_id, 'art_crop')
    : null;
  const identity = Array.from(
    new Set(preconRows.filter(r => r.is_commander).flatMap(r => r.card?.color_identity ?? []))
  );
  const detailStats = computeDeckStats(preconRows);
  const curveBins = preconRows.reduce<Record<string, number>>((bins, row) => {
    const mv = row.card?.cmc ?? 0;
    const key =
      mv <= 1 ? '0-1' : mv <= 5 ? String(mv) : mv <= 7 ? '6-7' : mv <= 9 ? '8-9' : '10+';
    bins[key] = (bins[key] ?? 0) + row.quantity;
    return bins;
  }, {});
  const landCount = preconRows.reduce(
    (sum, row) =>
      (row.card?.type_line || '').toLowerCase().includes('land') ? sum + row.quantity : sum,
    0
  );

  return (
    <StandardPageLayout
      title="Precon Decks"
      description="Browse and save official Commander preconstructed decks"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Layers className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold tabular-nums">{precons.length}</p>
                <p className="text-xs text-muted-foreground">Precons</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold tabular-nums">{Object.keys(bySet).length}</p>
                <p className="text-xs text-muted-foreground">Sets</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search precon decks…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search precon decks"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <Card className="flex max-h-[70vh] flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Available precons</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              {loading ? (
                <div className="space-y-3 p-4">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : listError ? (
                <p className="p-6 text-center text-sm text-destructive">{listError}</p>
              ) : sortedSets.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No precon decks match “{searchQuery}”.
                </p>
              ) : (
                <ScrollArea className="h-full">
                  <div className="space-y-2 p-3">
                    {sortedSets.map(setName => (
                      <div key={setName} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setExpandedSet(expandedSet === setName ? null : setName)}
                          aria-expanded={expandedSet === setName}
                          className="flex w-full items-center justify-between rounded-md p-2 text-left transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className="font-normal tabular-nums">
                              {filteredSets[setName].length}
                            </Badge>
                            <span className="text-sm font-medium">{setName}</span>
                          </span>
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              expandedSet === setName ? 'rotate-90' : ''
                            }`}
                          />
                        </button>

                        {expandedSet === setName && (
                          <ul className="ml-3 space-y-1">
                            {filteredSets[setName].map(precon => (
                              <li key={precon.id}>
                                <button
                                  type="button"
                                  onClick={() => fetchPreconDetails(precon)}
                                  aria-current={selectedPrecon?.id === precon.id}
                                  className={`flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors ${
                                    selectedPrecon?.id === precon.id
                                      ? 'bg-secondary text-secondary-foreground'
                                      : 'hover:bg-muted'
                                  }`}
                                >
                                  <Crown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                  <span className="truncate text-sm">{precon.name}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {loadingDetails ? (
              <Card>
                <CardContent className="space-y-3 p-6">
                  <Skeleton className="h-8 w-3/5" />
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-40 w-full" />
                </CardContent>
              </Card>
            ) : preconDetails ? (
              <>
                <Card className="overflow-hidden">
                  <div className="relative">
                    {commanderArt && (
                      <img
                        src={commanderArt}
                        alt=""
                        className="h-36 w-full object-cover md:h-44"
                        loading="lazy"
                      />
                    )}
                    <div
                      className={
                        commanderArt
                          ? 'absolute inset-0 flex flex-col justify-end bg-black/55 p-4'
                          : 'flex flex-col justify-end bg-muted p-4'
                      }
                    >
                      <h2
                        className={`text-lg font-bold md:text-xl ${
                          commanderArt ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {preconDetails.name}
                      </h2>
                      <p
                        className={`text-sm ${
                          commanderArt ? 'text-white/80' : 'text-muted-foreground'
                        }`}
                      >
                        {preconDetails.set}
                        {commanderRow ? ` · ${commanderRow.card_name}` : ''}
                      </p>
                    </div>
                  </div>

                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="secondary" className="tabular-nums">
                        {preconDetails.totalCards} cards
                      </Badge>
                      {identity.length > 0 && <ColorIdentity colors={identity} size="sm" />}
                      <span className="text-sm text-muted-foreground tabular-nums">
                        Avg MV {averageManaValue(curveBins, landCount).toFixed(2)}
                      </span>
                      {detailStats.totalValueUSD > 0 && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          ${detailStats.totalValueUSD.toFixed(2)}
                        </span>
                      )}
                    </div>

                    {detailStats.missingMetadata > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {detailStats.missingMetadata} card
                        {detailStats.missingMetadata === 1 ? ' is' : 's are'} not in the local card
                        database yet, so their price is excluded.
                      </p>
                    )}

                    <Button
                      onClick={savePreconToDeck}
                      disabled={savingDeck || !user}
                      className="w-full"
                    >
                      {savingDeck ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save to my decks
                    </Button>
                    {!user && (
                      <p className="text-center text-xs text-muted-foreground">
                        Sign in to save this deck.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <DeckCardGrid rows={preconRows} collapsedByDefault={['lands']} />
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <Package className="mb-4 h-10 w-10 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Select a precon deck to see its commander, colour identity and full list.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </StandardPageLayout>
  );
}
