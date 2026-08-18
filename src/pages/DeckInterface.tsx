import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useOpenCard } from '@/components/cards';
import { OracleText } from '@/components/cards/OracleText';
import { PowerScore } from '@/components/deck/PowerScore';
import {
  computeDeckPower,
  entriesFromDeckRows,
  persistDeckPower,
  type DeckPower,
  type PowerDeckEntry,
} from '@/lib/deck/power';
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
  type DeckCardRow,
} from '@/lib/deck/deckCards';
import { categorizeCard } from '@/lib/deck/cardCategories';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import type { Card as StoreCard } from '@/stores/deckStore';

/* Everything below already existed in the builder. The detail page rendered a
   commander, four stat tiles and one analytics tab, so a deck you had just
   built looked emptier than the screen you built it on. These are the same
   components, mounted read-only against the saved decklist — the builder keeps
   every one of them. */
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { ManaCurve } from '@/components/deck-builder/ManaCurve';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { PowerSliderCoaching } from '@/components/deck-builder/PowerSliderCoaching';
import { LandEnhancerUX } from '@/components/deck-builder/LandEnhancerUX';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { BrainAnalysis } from '@/components/deck-builder/BrainAnalysis';
import { DeckValidationPanel } from '@/components/deck-builder/DeckValidationPanel';
import { DeckCompatibilityChecker } from '@/components/deck-builder/DeckCompatibilityChecker';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { MissingCardsPanel } from '@/components/deck-builder/MissingCardsPanel';
import { DeckPrimerGenerator } from '@/components/deck-builder/DeckPrimerGenerator';
import { EnhancedMatchTracker } from '@/components/deck-builder/EnhancedMatchTracker';
import { MatchAnalytics } from '@/components/deck-builder/MatchAnalytics';
import { DeckNotesPanel } from '@/components/deck-builder/DeckNotesPanel';
import { EdhAnalysisPanel, type EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import { useCollectionOwnership } from '@/components/deck-builder/useCollectionOwnership';
import {
  categorizeCard as categorizeForStats,
  type CardCategory,
} from '@/components/deck-builder/deck-categories';

import {
  AlertTriangle,
  BarChart3,
  Crown,
  Download,
  Edit,
  Eye,
  FileText,
  Gavel,
  Heart,
  ScrollText,
  Swords,
  Wallet,
} from 'lucide-react';

interface DeckRecord {
  id: string;
  name: string;
  format: string;
  colors: string[];
  description?: string | null;
}

/**
 * The tabs this page offers.
 *
 * The owner's complaint was that the detail page felt empty next to the
 * builder — "feels like so much is missing, it is included in edit mode
 * though". It was: the curve, the category breakdown, collection ownership,
 * legality, archetype, budget, missing cards, the primer and the match record
 * all existed and were reachable only by opening the deck for *editing*.
 * Reading a deck should not require entering edit mode, so every one of them
 * is mounted here read-only. Nothing was taken off the builder to do it.
 */
const TABS = [
  { id: 'visual', label: 'Visual', icon: Eye },
  { id: 'list', label: 'List', icon: FileText },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'legality', label: 'Legality', icon: Gavel },
  { id: 'value', label: 'Value', icon: Wallet },
  { id: 'primer', label: 'Primer', icon: ScrollText },
  { id: 'matches', label: 'Matches', icon: Swords },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function DeckInterface() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  /* Clicking a card in the decklist goes to `/cards/:id`, the same as every
     other card in the product. The pane that used to dock to the right of the
     list is gone — the owner asked for the card, not a preview of it. */
  const openCard = useOpenCard();

  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [cards, setCards] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  /** The edhpowerlevel.com read the builder last cached for this deck. */
  const [edhAnalysis, setEdhAnalysis] = useState<EdhAnalysisData | null>(null);

  const loadDeck = useCallback(async () => {
    if (!id || !user) return;

    setLoading(true);
    setNotFound(false);
    try {
      const { data: deckData, error: deckError } = await supabase
        .from('user_decks')
        .select('id, name, format, colors, description, edh_analysis')
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

      setDeck(deckData as unknown as DeckRecord);
      setCards(rows);
      // Read only. Running the scrape is the builder's job; this page shows the
      // last one rather than pretending there is no second opinion.
      setEdhAnalysis(((deckData as any).edh_analysis as EdhAnalysisData) ?? null);

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

  /* The open tab lives in the URL alongside the open card, so Back steps out of
     a tab and a deck link can carry the tab it was read on. */
  const tabParam = searchParams.get('tab');
  const activeTab: TabId = TABS.some(t => t.id === tabParam) ? (tabParam as TabId) : 'visual';

  const setActiveTab = useCallback(
    (next: string) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        if (next === 'visual') params.delete('tab');
        else params.set('tab', next);
        return params;
      });
    },
    [setSearchParams]
  );

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
        .map(
          row =>
            ({
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
              // Budget and value panels read `prices.usd` off the card. Without
              // it every card on this page was worth $0 to them.
              prices: row.card?.prices ?? undefined,
              image_uris: row.card?.image_uris ?? undefined,
              quantity: row.quantity,
              category: categorizeCard(row.card?.type_line, {
                isCommander: row.is_commander,
              }) as StoreCard['category'],
              mechanics: row.card?.keywords ?? [],
              // Archetype detection counts role tags and nothing else.
              tags: row.card?.tags ?? [],
            }) as unknown as StoreCard
        ),
    [cards]
  );

  const analyticsCommander = useMemo<StoreCard | undefined>(
    () => analyticsDeck.find(c => c.category === 'commanders'),
    [analyticsDeck]
  );

  /** The ninety-nine — what every panel below treats as the deck proper. */
  const mainboard = useMemo(
    () => analyticsDeck.filter(c => c.category !== 'commanders'),
    [analyticsDeck]
  );

  /**
   * The deck's power, computed from the decklist on this page rather than read
   * off `user_decks.power_level`. The stat tile used to print that column — an
   * integer that was 5 for every hand-built deck — while the Analysis tab one
   * click away recomputed and printed 6.6. One tab click changed the deck's
   * power level; now both read this.
   */
  const powerEntries = useMemo<PowerDeckEntry[]>(() => entriesFromDeckRows(cards), [cards]);
  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(powerEntries, { format: deck?.format ?? 'commander' }),
    [powerEntries, deck?.format]
  );

  /* Write the score back so the tiles, dashboard and builder converge on it.
     This used to be done by the analytics component nested inside the Analysis
     tab, so it only ever landed if you clicked that tab. */
  useEffect(() => {
    if (power && deck?.id) void persistDeckPower(deck.id, power);
  }, [power, deck?.id]);

  /* The builder's stat strip, computed from the rows this page already loaded:
     same numbers, same categories, same ownership readout. */
  const ownershipCards = useMemo(
    () =>
      cards
        .filter(row => !row.is_sideboard)
        .map(row => ({ name: row.card?.name || row.card_name, quantity: row.quantity })),
    [cards]
  );
  const { ownership, loading: ownershipLoading } = useCollectionOwnership(
    ownershipCards,
    user?.id
  );

  /**
   * Category counts and average mana value, over the ninety-nine and through
   * the same categoriser `ManaCurve` uses.
   *
   * The curve excludes the commander; `computeDeckStats` does not. Feeding the
   * tile one and the plot the other put "2.13" beside a curve captioned "avg
   * 2.10" — the exact class of disagreement design law calls out. One pass,
   * one answer.
   */
  const { typeCounts, avgManaValue } = useMemo(() => {
    const counts: Partial<Record<CardCategory, number>> = {};
    let nonlandCopies = 0;
    let manaValueTotal = 0;

    for (const card of mainboard) {
      const category = categorizeForStats(card as any);
      const qty = card.quantity ?? 1;
      counts[category] = (counts[category] ?? 0) + qty;
      if (category === 'lands') continue;
      nonlandCopies += qty;
      manaValueTotal += (card.cmc ?? 0) * qty;
    }

    return {
      typeCounts: counts,
      avgManaValue: nonlandCopies > 0 ? manaValueTotal / nonlandCopies : 0,
    };
  }, [mainboard]);

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
  const isCommanderFormat =
    deck.format?.toLowerCase() === 'commander' || deck.format?.toLowerCase() === 'edh';
  const hasCards = mainboard.length > 0;

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

  const editHref = `/deck-builder?deck=${deck.id}`;

  /** Shared body for the tabs that need a decklist before they can say anything. */
  const needsCards = (what: string) => (
    <Card>
      <CardContent className="p-10 text-center text-muted-foreground">
        <p className="font-medium text-foreground">Add cards to see {what}</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(editHref)}>
          <Edit className="mr-2 h-4 w-4" />
          Open the builder
        </Button>
      </CardContent>
    </Card>
  );

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
          <Button size="sm" onClick={() => navigate(editHref)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit deck
          </Button>
        </div>
      }
    >
      {/* The deck header: the commander drawn whole, the text that describes
          it, the canonical score, and the curve — across the full width. The
          right third of this row used to be blank. */}
      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-col gap-5 p-4 sm:flex-row sm:gap-6 sm:p-6">
          <div className="mx-auto w-[62%] min-w-0 max-w-[260px] shrink-0 sm:mx-0 sm:w-[26%] sm:max-w-[280px] sm:self-start">
            <CommanderHero
              commander={heroCommander}
              deckName={deck.name}
              format={deck.format}
              identity={identity}
              cardCount={stats.totalCards}
              size="xl"
              eager
              onClick={commander ? () => openCard(commander) : () => navigate(editHref)}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row xl:gap-6">
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
            </div>

            {/* The curve, in the header. It was two clicks deep inside a nested
                tab on the one page whose whole job is to describe a deck. */}
            {hasCards && (
              <div className="min-w-0 rounded-lg bg-muted/30 p-3 xl:w-[22rem] xl:shrink-0 xl:self-start">
                <ManaCurve cards={mainboard} height={116} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* The builder's stat strip — cards against target, value, average mana
          value, colour identity, the category breakdown, and how much of it you
          actually own. All of it real, none of it new. */}
      {hasCards && (
        <div className="mb-4">
          <DeckQuickStats
            totalCards={mainboard.reduce((sum, c) => sum + (c.quantity || 1), 0)}
            typeCounts={typeCounts}
            avgCmc={avgManaValue}
            totalValue={stats.totalValueUSD}
            format={deck.format}
            commanderName={commander?.card?.name || commander?.card_name}
            colors={identity}
            ownedPct={ownership ? ownership.ownedPct : null}
            missingCards={ownership ? ownership.missingCopies : null}
            ownershipLoading={ownershipLoading}
          />
        </div>
      )}

      {/* Say so honestly when the local card table is missing printings.
          Surface tint, no hairline — design law 2. */}
      {stats.missingMetadata > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-muted p-4 shadow-sm">
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

      {/* Seven destinations, so this scrolls on a narrow screen rather than
          crushing them into sevenths. */}
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex w-max items-center gap-1 rounded-lg bg-muted/40 p-1 md:w-full">
          {TABS.map(({ id: tabId, label, icon: Icon }) => {
            const selected = activeTab === tabId;
            return (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tabId)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {tabId === 'visual' && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {stats.totalCards}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === 'visual' && (
          <DeckCardGrid rows={cards} onCardClick={openCard} collapsedByDefault={['lands']} />
        )}

        {activeTab === 'list' && (
          <Card>
            <CardContent className="p-0">
              <DeckCardTable rows={cards} onCardClick={openCard} />
            </CardContent>
          </Card>
        )}

        {activeTab === 'analysis' &&
          (hasCards && power ? (
            <div className="space-y-6">
              {/* The canonical score, explained — the same component, engine
                  and nine subscores the builder renders. */}
              {showPower && <PowerScore power={power} variant="expanded" />}

              {showPower && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <CommanderPowerDisplay
                    power={power}
                    commanderName={commander?.card?.name || commander?.card_name}
                  />
                  <PowerSliderCoaching
                    power={power}
                    entries={powerEntries}
                    format={deck.format}
                  />
                </div>
              )}

              <LandEnhancerUX entries={powerEntries} power={power} identity={identity} />

              {/* The labelled second opinion, read from the last scrape the
                  builder cached. Never presented as the canonical score, and
                  never invented when there is nothing cached. */}
              {isCommanderFormat && edhAnalysis && (
                <EdhAnalysisPanel
                  data={edhAnalysis}
                  isLoading={false}
                  onRefresh={() => navigate(editHref)}
                />
              )}

              <ArchetypeDetection
                deckCards={mainboard}
                commander={analyticsCommander}
                format={deck.format}
              />

              <EnhancedDeckAnalysisPanel
                deck={mainboard}
                format={deck.format}
                commander={analyticsCommander}
                deckId={deck.id}
                deckName={deck.name}
              />

              <BrainAnalysis
                deck={mainboard}
                commander={analyticsCommander}
                powerScore={power}
                deckId={deck.id}
                format={deck.format}
              />
            </div>
          ) : (
            needsCards('this deck analysed')
          ))}

        {activeTab === 'legality' &&
          (hasCards ? (
            <div className="space-y-6">
              <DeckValidationPanel
                cards={mainboard as any}
                format={deck.format}
                commander={analyticsCommander as any}
              />
              {isCommanderFormat && analyticsCommander && (
                <DeckCompatibilityChecker
                  cards={mainboard as any}
                  commander={analyticsCommander as any}
                  format={deck.format}
                />
              )}
            </div>
          ) : (
            needsCards('legality checks')
          ))}

        {activeTab === 'value' &&
          (hasCards ? (
            <div className="space-y-6">
              <DeckBudgetTracker deckCards={mainboard} targetBudget={200} />
              <MissingCardsPanel deckId={deck.id} deckName={deck.name} />
            </div>
          ) : (
            needsCards('what this deck is worth')
          ))}

        {activeTab === 'primer' && (
          <DeckPrimerGenerator
            deckName={deck.name}
            commander={commander?.card?.name || commander?.card_name}
            cardCount={stats.totalCards}
          />
        )}

        {activeTab === 'matches' && (
          <div className="space-y-6">
            <EnhancedMatchTracker deckId={deck.id} deckName={deck.name} />
            {/* The tracker records games; this reads them back. Same rows,
                two different jobs. */}
            <MatchAnalytics deckId={deck.id} deckName={deck.name} />
            <DeckNotesPanel deckId={deck.id} />
          </div>
        )}
      </div>
    </StandardPageLayout>
  );
}
