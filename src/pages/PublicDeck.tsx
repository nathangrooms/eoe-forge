import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { getPublicDeck, trackShareEvent, type PublicDeckData } from '@/lib/api/shareAPI';
import { ComprehensiveAnalytics } from '@/components/deck-builder/ComprehensiveAnalytics';
import { PowerScoreBadge } from '@/components/deck/PowerScore';
import { computeDeckPower, entriesFromDeckRows, type DeckPower } from '@/lib/deck/power';
import { DeckCardGrid } from '@/components/deck/DeckCardGrid';
import { DeckCardTable } from '@/components/deck/DeckCardTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MetricRow, PageTabs, type Metric } from '@/components/listing';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Copy, Download, ExternalLink, Eye, LayoutGrid, Loader2, Rows3 } from 'lucide-react';
import { toast } from 'sonner';
import { useOpenCard } from '@/components/cards';
import {
  computeDeckStats,
  fetchCardsByIds,
  type DeckCardDetail,
  type DeckCardRow,
} from '@/lib/deck/deckCards';
import { serializeDeck } from '@/lib/deck/deckSerialize';
import { categorizeCard } from '@/lib/deck/cardCategories';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { averageManaValue } from '@/lib/deck/curve';
import type { Card as StoreCard } from '@/stores/deckStore';

/**
 * Public, read-only deck page.
 *
 * The shared-deck RPC nests card metadata under `card_data`, but this page
 * read flat `card.type_line` / `card.price_usd` / `card.image` fields that do
 * not exist — so the gallery grouped nothing, the deck value was always $0 and
 * every card was an empty frame. Rows are now normalised through the same
 * `DeckCardRow` shape the rest of the deck surfaces use, and the printings are
 * topped up from the public `cards` table for art and mana costs.
 */

function normalizeRpcCards(rpcCards: any[]): DeckCardRow[] {
  return (rpcCards ?? []).map((card, index) => {
    const data = card.card_data ?? {};
    const detail: DeckCardDetail | null = data.type_line
      ? {
          name: card.card_name ?? '',
          type_line: data.type_line ?? '',
          mana_cost: data.mana_cost ?? null,
          cmc: Number(data.cmc ?? 0),
          colors: data.colors ?? [],
          color_identity: data.color_identity ?? [],
          image_uris: null,
          prices: data.prices ?? null,
          oracle_text: null,
          power: null,
          toughness: null,
          rarity: data.rarity ?? null,
          set_code: null,
          legalities: null,
          is_legendary: false,
          keywords: [],
          // The shared-deck RPC does not carry role tags; the top-up pass from
          // the public `cards` table below fills them in where it can.
          tags: data.tags ?? [],
        }
      : null;

    return {
      id: `${card.card_id ?? 'card'}-${index}`,
      card_id: card.card_id ?? '',
      card_name: card.card_name ?? '',
      quantity: Number(card.quantity ?? 1),
      is_commander: Boolean(card.is_commander),
      is_sideboard: Boolean(card.is_sideboard),
      card: detail,
    };
  });
}

export default function PublicDeck() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicDeckData | null>(null);
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState(false);
  /* Which rendering of the decklist is showing. Local state rather than the
     URL: a shared deck link is a link to the deck, and adding a view parameter
     to it would mean the same deck arrives at two addresses. */
  const [listView, setListView] = useState<'visual' | 'list'>('visual');

  /* Clicking a card goes to `/cards/:id`, the same as everywhere else in the
     product. The card page is public, so a visitor following a shared decklist
     lands on a real card page rather than a pane docked beside the list. */
  const openCard = useOpenCard();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const loadDeck = async () => {
      try {
        const result = await getPublicDeck(slug);
        if (cancelled) return;
        setData(result);

        if (result) {
          const base = normalizeRpcCards((result.deck as any).cards ?? []);

          // Enrich with art, mana costs and oracle text from the public card
          // table. If that lookup fails the page still renders the list.
          try {
            const details = await fetchCardsByIds(base.map(row => row.card_id));
            if (!cancelled) {
              setRows(
                base.map(row => {
                  const full = details.get(row.card_id);
                  return full ? { ...row, card: { ...(row.card ?? full), ...full } } : row;
                })
              );
            }
          } catch (enrichError) {
            console.error('Card metadata lookup failed:', enrichError);
            if (!cancelled) setRows(base);
          }

          if (!tracked) {
            await trackShareEvent(slug, 'view');
            if (!cancelled) setTracked(true);
          }
        }
      } catch (err) {
        console.error('Failed to load public deck:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDeck();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const stats = useMemo(() => computeDeckStats(rows), [rows]);

  const analyticsDeck = useMemo<StoreCard[]>(
    () =>
      rows
        .filter(row => !row.is_sideboard)
        .map(row => ({
          id: row.card_id,
          name: row.card?.name || row.card_name,
          cmc: row.card?.cmc ?? 0,
          type_line: row.card?.type_line || '',
          colors: row.card?.colors ?? [],
          color_identity: row.card?.color_identity ?? [],
          oracle_text: row.card?.oracle_text ?? '',
          mana_cost: row.card?.mana_cost ?? undefined,
          quantity: row.quantity,
          category: categorizeCard(row.card?.type_line, {
            isCommander: row.is_commander,
          }) as StoreCard['category'],
          mechanics: row.card?.keywords ?? [],
        })),
    [rows]
  );

  const analyticsCommander = useMemo(
    () => analyticsDeck.find(card => card.category === 'commanders'),
    [analyticsDeck]
  );

  /**
   * Scored from the shared decklist, not from the summary's stored number. A
   * public page has no write access, so it can never refresh a stale stored
   * score — computing it here is the only way the visitor sees the same figure
   * the owner sees.
   */
  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(entriesFromDeckRows(rows), { format: data?.deck?.format ?? 'commander' }),
    [rows, data?.deck?.format]
  );

  const handleCopyList = async () => {
    if (rows.length === 0) return;
    try {
      await navigator.clipboard.writeText(serializeDeck(rows, 'text', data?.deck.name ?? 'deck'));
      toast.success('Decklist copied to clipboard');
      if (slug) await trackShareEvent(slug, 'copy');
    } catch {
      toast.error('Failed to copy decklist');
    }
  };

  const handleExport = () => {
    if (!data || rows.length === 0) return;
    const text = serializeDeck(rows, 'text', data.deck.name);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${data.deck.name.replace(/[^\w\-. ]+/g, '_')}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Decklist exported');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">Loading deck…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <h1 className="mb-3 text-2xl font-bold">Deck not found</h1>
          <p className="mb-6 text-muted-foreground">
            This deck is no longer publicly available.
          </p>
          <Button asChild>
            <a href="/">Go to homepage</a>
          </Button>
        </div>
      </div>
    );
  }

  const { deck, viewCount } = data;
  const commanderRow = rows.find(row => row.is_commander) ?? null;
  const ogImage = deck.commander?.image;
  const pageTitle = `${deck.name} — DeckMatrix`;
  const pageDescription = `${formatLabel(deck.format)} deck${
    deck.commander ? ` featuring ${deck.commander.name}` : ''
  } — ${deck.counts.total} cards. View and export this decklist.`;
  const pageUrl = `${window.location.origin}/p/${slug}`;
  const identity = commanderRow?.card?.color_identity?.length
    ? commanderRow.card.color_identity
    : deck.identity?.length
      ? deck.identity
      : deck.colors;
  const avgMv = averageManaValue(deck.curve?.bins, deck.counts?.lands ?? 0);

  const publicDeckMetrics: Metric[] = [
    { id: 'cards', label: 'Cards', value: stats.totalCards.toLocaleString(), raw: stats.totalCards },
    {
      id: 'mv',
      label: 'Avg mana value',
      value: stats.totalCards > 0 ? avgMv.toFixed(2) : '—',
      raw: avgMv,
    },
    {
      id: 'value',
      label: 'Value',
      /* A dash, never $0. The smallest real price in the database is 0.01, so
         a rendered zero is always invented. */
      value: stats.totalValueUSD > 0 ? `$${stats.totalValueUSD.toFixed(0)}` : '—',
      raw: stats.totalValueUSD,
    },
  ];

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
        <link rel="canonical" href={pageUrl} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-card shadow-lg shadow-black/25">
          <div className="w-full max-w-full px-3 py-3 md:px-6 md:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="truncate text-xl font-bold text-foreground md:text-2xl">
                    {deck.name}
                  </h1>
                  {/* `secondary`, not `outline`. Outline is a border variant,
                      and design law 2 rules hairlines out. */}
                  <Badge variant="secondary" className="gap-1">
                    <Eye className="h-3 w-3" />
                    Read-only
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{formatLabel(deck.format)}</span>
                  {usesPowerLevel(deck.format) && (
                    <>
                      <span aria-hidden>·</span>
                      <PowerScoreBadge power={power} />
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span>{deck.counts.total} cards</span>
                  <span aria-hidden>·</span>
                  <span>${stats.totalValueUSD.toFixed(2)}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {viewCount} view{viewCount === 1 ? '' : 's'}
                  </span>
                  {identity?.length > 0 && <ColorIdentity colors={identity} size="xs" />}
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleCopyList}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy list
                </Button>
                <Button variant="secondary" size="sm" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button asChild size="sm">
                  <a href="/register">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Build your own
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="w-full max-w-full px-3 py-4 md:px-6 md:py-6">
          {rows.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="font-medium">This deck has no cards</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing has been added to it yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
              <aside className="space-y-4">
                {/* The same tiles as every other figure in the product.

                    This was three 18px numbers with their labels underneath in
                    11px, inside one card, which is a fourth answer to "how big
                    is a metric". A shared deck is the first thing a lot of
                    people ever see of DeckMatrix, so it is the last place the
                    numbers should be smaller than they are everywhere else. */}
                <MetricRow metrics={publicDeckMetrics} columns={3} />

                {/* Read-only: the visitor is not the owner, so nothing is
                    persisted from this page. */}
                <ComprehensiveAnalytics
                  deck={analyticsDeck}
                  format={deck.format}
                  commander={analyticsCommander}
                  deckId={deck.id}
                  persist={false}
                />
              </aside>

              <div className="space-y-4">
                {/* `PageTabs`, the same strip as the deck page and the
                    collection. This was `grid w-full grid-cols-2`, which is one
                    of the twenty-three tab skins the audit counted. */}
                <PageTabs
                  tabs={[
                    { id: 'visual', label: 'Visual', icon: LayoutGrid },
                    { id: 'list', label: 'List', icon: Rows3 },
                  ]}
                  value={listView}
                  onChange={id => setListView(id as 'visual' | 'list')}
                  label="Decklist view"
                />
                {listView === 'visual' ? (
                  <DeckCardGrid rows={rows} collapsedByDefault={['lands']} onCardClick={openCard} />
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <DeckCardTable rows={rows} onCardClick={openCard} />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
