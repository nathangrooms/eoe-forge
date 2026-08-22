import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useOpenCard } from '@/components/cards';
import { OracleText } from '@/components/cards/OracleText';
import { PowerScore } from '@/components/deck/PowerScore';
import {
  computeDeckPower,
  entriesFromDeckRows,
  type DeckPower,
  type PowerDeckEntry,
} from '@/lib/deck/power';
import { DeckCardsPanel, type DeckCardView } from '@/components/deck/DeckCardsPanel';
import type { DeckCardEditing } from '@/components/deck/DeckCardEditing';
import { ReplaceCardPanel } from '@/components/deck/ReplaceCardPanel';
import { ImportDeckPanel } from '@/components/deck/ImportDeckPanel';
import { EdhPowerCheck } from '@/components/deck/EdhPowerCheck';
import { useDeckEditor } from '@/components/deck/useDeckEditor';
import { ManaSourcesPanel } from '@/components/deck/ManaSourcesPanel';
import { EmptyState, PageTabs } from '@/components/listing';
import { CommanderHero } from '@/components/deck/CommanderHero';
import { createPlayabilityEngine } from '@/lib/deck/playability';
import { rowsToPlayabilityInputs } from '@/lib/deck/playabilityView';
import { ColorIdentity, ManaCost } from '@/components/ui/mana-cost';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { DeckAPI } from '@/lib/api/deckAPI';
import { scryfallAPI } from '@/lib/api/scryfall';
import { cardImage, computeDeckStats, type DeckCardRow } from '@/lib/deck/deckCards';
import { categorizeCard } from '@/lib/deck/cardCategories';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { useIsFeatureEnabled } from '@/hooks/useFeatureAccess';
import type { Card as StoreCard } from '@/stores/deckStore';

/* Everything the builder could do arrives here as the same components it
   mounted, against the same decklist, with the writes routed through
   `useDeckEditor`. Nothing was taken off either page to do it. */
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { AIOptimizerPanel } from '@/components/deck-builder/AIOptimizerPanel';
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
import { useCollectionOwnership } from '@/components/deck-builder/useCollectionOwnership';
import type { EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import {
  categorizeCard as categorizeForStats,
  type CardCategory,
} from '@/components/deck-builder/deck-categories';

import {
  AlertTriangle,
  BarChart3,
  Check,
  Copy,
  Crown,
  Download,
  Droplets,
  Gavel,
  Hand,
  Heart,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Printer,
  ScrollText,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';

/**
 * ONE DECK PAGE.
 *
 * ## What this replaced
 *
 * `/deck/:id` read a deck and `/deck-builder?deck=` edited the same deck. Two
 * headers, two metric treatments, two sets of tabs, and — established by
 * reading both files — thirty-two overlapping features, three of which
 * computed the same figure differently. Average mana value was two different
 * numbers one click apart, because the builder added the commander into the
 * average and this page did not. Deck value was four implementations, one of
 * which never multiplied by quantity. The legality check on this page could not
 * report a banned card, because its input never carried `legalities`.
 *
 * The owner: *"we want both systems to be consistent with each other, rather
 * than being two entirely different ones. All edit functionality like replace,
 * edit etc should just be available by default - you shouldnt have to press
 * edit."* And: *"overall I really like the deck view page it looks great."*
 *
 * So this is that page's shape, unchanged in rhythm — breadcrumb, title line,
 * commander drawn whole, one metric strip, one tab strip — with the builder's
 * capability inside it.
 *
 * ## There is no edit mode
 *
 * Nothing is behind a button that says Edit. Quantity, replace, remove, add and
 * the commander are simply present. A deck you own is a deck you can change;
 * asking permission first was a mode that existed for no reason.
 *
 * The one thing genuinely guarded is ownership, and only because the database
 * would refuse the write anyway: `canEdit` is false for a deck that is not
 * yours, and then this is exactly the read-only page it used to be.
 *
 * ## Where everything from the builder went
 *
 * | Was | Is |
 * |---|---|
 * | Cards tab (`VisualDeckView`) | Cards tab — the same controls, the better shell |
 * | Add Cards tab | Add tab |
 * | Analysis tab (ten stacked panels) | Mana, EDH, Analysis, Legality, Value, Record |
 * | Optimizer tab | Optimiser tab, same feature flag |
 * | Import/Export tab | Import is a slide-over; export is `/deck/:id/export` |
 * | Proxies tab | `/deck/:id/proxies` |
 * | Playtest tab | `/deck/:id/testhand` |
 * | Inline rename | The pencil on the title, unchanged |
 * | Commander "Change" | The commander block, and `/deck/:id/commander` |
 * | edhpowerlevel.com strip | The EDH tab, with its Calculate and Refresh |
 * | "All decks" action | The breadcrumb the layout already draws |
 * | Autosave | Every edit writes its own row. See `useDeckEditor`. |
 *
 * Duplicate and Delete lived only on the deck tile's menu, on neither deck
 * page. They are in the More menu here, which is where a deck's own actions
 * belong.
 */

interface TabDef {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  hint: string;
}

/**
 * The tabs, named for the question a player is asking rather than for the
 * component that answers it.
 *
 *   Cards      what is in this deck?     the list, filtered, editable
 *   Add        what should go in it?     card search, in pick mode
 *   Mana       can I cast it?            curve, sources, land fixer
 *   EDH        how strong is it?         score, coaching, the scrape
 *   Analysis   how does it play?         archetype, deck analysis, the Brain
 *   Legality   is it legal?              validation, colour identity
 *   Optimiser  what should I change?     the five-step pass
 *   Value      what does it cost?        budget, and what I am missing
 *   Record     what do I know about it?  primer, matches, notes
 *
 * Nine. Primer and Matches were two tabs and are one, because they are the same
 * kind of thing — notes a human writes about a deck — and folding them is what
 * keeps the strip on one line.
 *
 * EDH is conditional: a Standard deck has no bracket, no commander and no
 * colour-identity legality, so offering the tab would be offering an empty
 * room. Optimiser is conditional on its feature flag, hidden rather than
 * disabled. Add is conditional on the deck being yours.
 */
const TAB_DEFS: TabDef[] = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid, hint: 'The decklist' },
  { id: 'add', label: 'Add', icon: Plus, hint: 'Search and add' },
  { id: 'mana', label: 'Mana', icon: Droplets, hint: 'Curve and sources' },
  { id: 'edh', label: 'EDH', icon: Crown, hint: 'Commander power' },
  { id: 'analysis', label: 'Analysis', icon: BarChart3, hint: 'How it plays' },
  { id: 'legality', label: 'Legality', icon: Gavel, hint: 'Format rules' },
  { id: 'optimiser', label: 'Optimiser', icon: Sparkles, hint: 'What to change' },
  { id: 'value', label: 'Value', icon: Wallet, hint: 'Cost and gaps' },
  { id: 'record', label: 'Record', icon: ScrollText, hint: 'Primer and matches' },
];

/**
 * Links written before this merge, and links written before the restructure
 * before it, still land where they used to.
 *
 * `?tab=visual` and `?tab=list` were two renderings of the same card list; both
 * land on Cards, `list` selecting the table. `?tab=primer` and `?tab=matches`
 * were the two tabs that are now Record. `ai`, `search` and `import-export`
 * were the builder's own names, and the builder's tabs were never in the URL —
 * they are here so a hand-written link cannot 404 into the default tab
 * silently.
 */
const LEGACY_TABS: Record<string, { tab: string; view?: DeckCardView }> = {
  visual: { tab: 'cards', view: 'visual' },
  list: { tab: 'cards', view: 'table' },
  primer: { tab: 'record' },
  matches: { tab: 'record' },
  ai: { tab: 'optimiser' },
  search: { tab: 'add' },
  'import-export': { tab: 'cards' },
};

export default function DeckInterface() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  /* Clicking a card in the decklist goes to `/cards/:id`, the same as every
     other card in the product. The Add tab is the documented exception: there
     a click on the body adds the card, because you are picking. */
  const openCard = useOpenCard();

  const editor = useDeckEditor(id);
  const { deck, rows, commander, loading, notFound, saveState } = editor;

  const { isEnabled: optimiserEnabled, isLoading: optimiserFlagLoading } =
    useIsFeatureEnabled('ai_deck_optimizer');

  const [isFavorited, setIsFavorited] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [replacing, setReplacing] = useState<DeckCardRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canEdit = Boolean(deck && user && deck.user_id === user.id);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    void supabase
      .from('favorite_decks')
      .select('deck_id')
      .eq('user_id', user.id)
      .eq('deck_id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsFavorited(Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  /* ------------------------------------------------------------ the figures */

  const stats = useMemo(() => computeDeckStats(rows), [rows]);

  const isCommanderFormat =
    deck?.format?.toLowerCase() === 'commander' || deck?.format?.toLowerCase() === 'edh';
  const showPower = usesPowerLevel(deck?.format);

  const identity = useMemo(() => {
    if (commander?.card?.color_identity?.length) return commander.card.color_identity;
    const set = new Set<string>();
    rows.forEach(row => row.card?.color_identity?.forEach(c => set.add(c)));
    if (set.size > 0) return Array.from(set);
    return deck?.colors ?? [];
  }, [rows, commander, deck]);

  /**
   * The deck shaped for the shared analytics engine.
   *
   * `legalities` is in here now, and that is a bug fix rather than a tidy.
   * `DeckLegalityChecker` reads `card.legalities` at six places; this mapping
   * did not carry the field at all, so the validation panel on this page could
   * never report a banned card while the builder's copy of the same panel
   * could. That was the one figure where the builder's input was the better
   * one, and it is the reason the merge read both rather than assuming.
   */
  const analyticsDeck = useMemo<StoreCard[]>(
    () =>
      rows
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
              set: row.card?.set_code ?? undefined,
              set_name: row.card?.set_code ?? undefined,
              // The legality check reads this and nothing else. Without it the
              // panel reported no banned cards for every deck, including one
              // holding a banned card.
              legalities: row.card?.legalities ?? undefined,
              keywords: row.card?.keywords ?? [],
              // Budget and value panels read `prices.usd` off the card.
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
    [rows]
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

  /** What the decklist lists: everything except the commander drawn above it. */
  const listRows = useMemo(() => rows.filter(row => !row.is_commander), [rows]);

  /**
   * Castability, from the local engine rather than the edhpowerlevel.com
   * scrape. The engine memoises on mana cost, so a hundred rows across the
   * grid, the table, the facet counts and the roll-up is one solve per distinct
   * cost.
   */
  const playabilityEngine = useMemo(
    () => createPlayabilityEngine(rowsToPlayabilityInputs(rows)),
    [rows]
  );
  const playability = useMemo(() => playabilityEngine.deck(), [playabilityEngine]);

  /**
   * The deck's power, computed from the decklist on screen rather than read off
   * `user_decks.power_level`.
   */
  const powerEntries = useMemo<PowerDeckEntry[]>(() => entriesFromDeckRows(rows), [rows]);
  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(powerEntries, { format: deck?.format ?? 'commander' }),
    [powerEntries, deck?.format]
  );

  /*
   * Cache the score, and touch the deck, in one debounced write.
   *
   * The read-only page fired `persistDeckPower` the instant the score changed,
   * which was fine on a page that could not change the deck. On a page that
   * can, typing in a quantity box moves the score on every keystroke, and
   * `persistDeckPower` is a read followed by a write. `persistRecord` merges
   * `edh_analysis` from the copy this page already loaded, and writes once.
   */
  const { persistRecord } = editor;
  useEffect(() => {
    if (power && deck?.id) persistRecord(power);
  }, [power, deck?.id, persistRecord]);

  const ownershipCards = useMemo(
    () =>
      rows
        .filter(row => !row.is_sideboard)
        .map(row => ({ name: row.card?.name || row.card_name, quantity: row.quantity })),
    [rows]
  );
  const { ownership, loading: ownershipLoading } = useCollectionOwnership(
    ownershipCards,
    user?.id
  );

  /**
   * Category counts and average mana value, over the ninety-nine and through
   * the same categoriser `ManaCurve` uses.
   *
   * The builder computed this over the ninety-nine **plus the commander**, so
   * the same deck showed two different average mana values one click apart.
   * This is the correct one: `ManaCurve` excludes both lands and the commander,
   * and feeding the tile one denominator and the plot the other is what
   * produced "2.13" beside a curve captioned "avg 2.10".
   */
  const { typeCounts, avgManaValue } = useMemo(() => {
    const counts: Partial<Record<CardCategory, number>> = {};
    let nonlandCopies = 0;
    let manaValueTotal = 0;

    for (const card of mainboard) {
      const category = categorizeForStats(card as never);
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

  /* ---------------------------------------------------------------- routing */

  const tabs = useMemo(
    () =>
      TAB_DEFS.filter(tab => {
        if (tab.id === 'edh') return isCommanderFormat || showPower;
        if (tab.id === 'optimiser') return optimiserEnabled && !optimiserFlagLoading;
        if (tab.id === 'add') return canEdit;
        return true;
      }),
    [isCommanderFormat, showPower, optimiserEnabled, optimiserFlagLoading, canEdit]
  );

  /* The open tab lives in the URL, so Back steps out of a tab and a deck link
     can carry the tab it was read on. The builder's tabs were React state, so a
     reload landed you back on Cards and there was no link to the optimiser. */
  const tabParam = searchParams.get('tab');
  const legacy = tabParam ? LEGACY_TABS[tabParam] : undefined;
  const resolvedTab = legacy?.tab ?? tabParam;
  const activeTab = tabs.some(t => t.id === resolvedTab) ? (resolvedTab as string) : 'cards';

  const viewParam = searchParams.get('view');
  const cardView: DeckCardView =
    viewParam === 'table' || viewParam === 'visual' || viewParam === 'text'
      ? viewParam
      : (legacy?.view ?? 'visual');

  const setActiveTab = useCallback(
    (next: string) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        if (next === 'cards') params.delete('tab');
        else params.set('tab', next);
        return params;
      });
    },
    [setSearchParams]
  );

  const setCardView = useCallback(
    (next: DeckCardView) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        if (next === 'visual') params.delete('view');
        else params.set('view', next);
        return params;
      });
    },
    [setSearchParams]
  );

  /* ---------------------------------------------------------------- actions */

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

  const duplicateDeck = async () => {
    if (!deck) return;
    try {
      const newId = await DeckAPI.duplicateDeck(deck.id);
      showSuccess('Deck duplicated', `A copy of "${deck.name}" is ready`);
      navigate(`/deck/${newId}`);
    } catch (error) {
      console.error('Error duplicating deck:', error);
      showError('Could not duplicate this deck');
    }
  };

  const deleteDeck = async () => {
    if (!deck) return;
    try {
      const { error } = await supabase.from('user_decks').delete().eq('id', deck.id);
      if (error) throw error;
      showSuccess('Deck deleted', `"${deck.name}" has been deleted`);
      navigate('/decks');
    } catch (error) {
      console.error('Error deleting deck:', error);
      showError('Delete failed', 'Please try again.');
    }
  };

  /** The controls the decklist draws on every card. */
  const editing = useMemo<DeckCardEditing | undefined>(
    () =>
      canEdit
        ? {
            onSetQuantity: (row, quantity) => void editor.setQuantity(row, quantity),
            onRemoveOne: row => void editor.removeOne(row),
            onDeleteAll: row => void editor.deleteAll(row),
            onReplace: row => setReplacing(row),
            limitFor: editor.copyLimitFor,
          }
        : undefined,
    [canEdit, editor]
  );

  /* -------------------------------------------------------------- rendering */

  if (loading) {
    return (
      <StandardPageLayout title="Loading deck…" description="Fetching decklist and card data">
        <div className="space-y-4" aria-busy="true">
          {[0, 1, 2].map(i => (
            <Card key={i}>
              <CardContent className="space-y-3 p-4">
                {/* `motion-reduce:animate-none` like every other placeholder in
                    the product: a reader who asked for less motion should not
                    get a pulsing bar because this one panel forgot. */}
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
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

  const hasCards = mainboard.length > 0;

  /**
   * The commander shaped for the shared `CommanderHero`, which draws the whole
   * card through `CardImage`. This page used to draw `art_crop` into a
   * 1136×208 letterbox — the one card that represents the deck, cropped to a
   * strip, from a hand-rolled `<img>`. Both are ruled out.
   */
  const heroCommander = commander
    ? {
        name: commander.card?.name || commander.card_name,
        image: cardImage(commander, 'large') ?? undefined,
        image_uris: commander.card?.image_uris ?? undefined,
      }
    : null;

  const commanderRoute = `/deck/${deck.id}/commander`;

  /** Shared body for a tab that needs a decklist before it can say anything. */
  const needsCards = (what: string) => (
    <EmptyState
      title={`Add cards to see ${what}`}
      description="Search on the Add tab and the deck fills in here."
      icon={Sparkles}
      action={
        canEdit ? { label: 'Add cards', onClick: () => setActiveTab('add') } : undefined
      }
    />
  );

  return (
    <StandardPageLayout
      title={
        /* Renaming happens in place, on the title itself. Design law 3 rules
           out the centred dialog that used to dim the whole builder to edit one
           text field, and this is the builder's own control, kept whole. */
        renaming ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="deck-name" className="sr-only">
              Deck name
            </Label>
            <Input
              id="deck-name"
              autoFocus
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              placeholder="Deck name…"
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  void editor.rename(draftName);
                  setRenaming(false);
                }
                if (event.key === 'Escape') setRenaming(false);
              }}
              className="h-11 max-w-md border-0 bg-muted/50 text-xl font-bold shadow-none focus-visible:ring-1 focus-visible:ring-offset-0 md:text-2xl"
            />
            <Button
              size="sm"
              onClick={() => {
                void editor.rename(draftName);
                setRenaming(false);
              }}
              disabled={!draftName.trim()}
            >
              <Check className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Save</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <span className="flex items-center gap-2">
            {deck.name}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Rename deck"
                onClick={() => {
                  setDraftName(deck.name);
                  setRenaming(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </span>
        )
      }
      description={`${formatLabel(deck.format)} · ${stats.totalCards} cards`}
      action={
        <div className="flex items-center gap-2">
          {/* WHERE THE VISIBLE SAVE WENT.
              The optimiser carried the only visible save in the product,
              because it was the only surface whose writes went through a silent
              timer. Every edit on this page writes its own row and reports it,
              so the state belongs to the page rather than to one panel of it,
              and it now covers renaming, quantity, replace and import as well
              as an optimiser pass. */}
          {canEdit && saveState !== 'idle' && (
            <span
              className="hidden text-xs text-muted-foreground sm:inline"
              role="status"
              aria-live="polite"
            >
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'error'
                  ? 'That did not save'
                  : 'All changes saved'}
            </span>
          )}
          {/* `secondary`, not `outline`. Outline is a border variant, and these
              were the only hairlines left in this page's header. */}
          <Button variant="secondary" size="sm" onClick={toggleFavorite}>
            <Heart className={`mr-2 h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">{isFavorited ? 'Favorited' : 'Favorite'}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/deck/${deck.id}/share`)}>
            <Share2 className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/deck/${deck.id}/export`)}>
            <Download className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {/* Everything a deck can have done to it that is not a tab. Duplicate
              and Delete were on the deck tile's menu and on neither deck page,
              so the page showing you a deck could not copy or delete it. */}
          <DropdownMenu onOpenChange={() => setConfirmingDelete(false)}>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="More deck actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-0 shadow-xl shadow-black/40">
              {canEdit && (
                <DropdownMenuItem onClick={() => setImporting(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Import a decklist
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate(`/deck/${deck.id}/testhand`)}>
                <Hand className="mr-2 h-4 w-4" /> Test hand
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/play?mode=playtest&deck=${deck.id}`)}>
                <Play className="mr-2 h-4 w-4" /> Playtest
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/deck/${deck.id}/proxies`)}>
                <Printer className="mr-2 h-4 w-4" /> Print proxies
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={duplicateDeck}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              {canEdit &&
                (confirmingDelete ? (
                  <>
                    {/* The confirmation stays inside the control that started
                        it — design law 3, and the same shape the deck tile
                        already uses. */}
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Delete “{deck.name}”? This cannot be undone.
                    </div>
                    <DropdownMenuItem
                      onClick={deleteDeck}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Confirm delete
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={event => {
                        event.preventDefault();
                        setConfirmingDelete(false);
                      }}
                    >
                      <X className="mr-2 h-4 w-4" /> Cancel
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onSelect={event => {
                      event.preventDefault();
                      setConfirmingDelete(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete deck
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {/* The deck header: the commander drawn whole, the text that describes
          it, the canonical score, and the castability read — across the full
          width. */}
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
              onClick={commander ? () => openCard(commander) : () => navigate(commanderRoute)}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row xl:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <Crown className="h-3.5 w-3.5" />
                    {commander ? 'Commander' : 'No commander'}
                  </p>
                  {/* The builder's Change control, on the block that draws the
                      commander whole rather than on the one that drew it as a
                      thumbnail. */}
                  {canEdit && isCommanderFormat && (
                    <Button variant="secondary" size="sm" onClick={() => navigate(commanderRoute)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {commander ? 'Change' : 'Choose commander'}
                    </Button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-xl font-bold md:text-2xl">
                    {commander
                      ? commander.card?.name || commander.card_name
                      : 'Choose one to lead this deck'}
                  </h2>
                  {commander?.card?.mana_cost ? (
                    <ManaCost cost={commander.card.mana_cost} size="sm" />
                  ) : null}
                  {/* The power/toughness badge, from the builder's commander
                      block. Small, and the only thing that block had which this
                      one did not. */}
                  {commander?.card?.power && commander?.card?.toughness && (
                    <Badge variant="secondary" className="tabular-nums">
                      {commander.card.power}/{commander.card.toughness}
                    </Badge>
                  )}
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

                {/* THE DECK DESCRIPTION IS EDITABLE.
                    This page has rendered it under the commander for as long as
                    it has existed and nothing in the product could write it,
                    while the builder's autosave replaced it with "commander
                    deck with 99 cards" on every save and this page presented
                    that as the owner's own words. That write is gone, and this
                    is the field that replaces it. */}
                {editingDescription ? (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="deck-description" className="sr-only">
                      What this deck does
                    </Label>
                    <Textarea
                      id="deck-description"
                      autoFocus
                      value={draftDescription}
                      onChange={event => setDraftDescription(event.target.value)}
                      placeholder="What does this deck do?"
                      className="min-h-[5rem] max-w-prose border-0 bg-muted/50 text-sm shadow-none focus-visible:ring-1"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          void editor.setDescription(draftDescription);
                          setEditingDescription(false);
                        }}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingDescription(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : deck.description ? (
                  <p className="group mt-2 flex max-w-prose items-start gap-2 text-sm text-muted-foreground">
                    <span>{deck.description}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftDescription(deck.description ?? '');
                          setEditingDescription(true);
                        }}
                        className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                        aria-label="Edit the deck description"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </p>
                ) : canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDescription('');
                      setEditingDescription(true);
                    }}
                    className="mt-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Say what this deck does
                  </button>
                ) : null}

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

            {/* The curve used to sit here. Owner: "Mana curve not needs on main
                cards page" — it is on the Mana tab now, beside the source
                analysis that explains it. What takes its place is the other
                number they called "one of the most important things": the
                deck's castability, summarised, linking to the tab that derives
                it. Both figures come from the decklist on screen. */}
            {hasCards && playability.averagePct !== null && (
              <button
                type="button"
                onClick={() => setActiveTab('mana')}
                className="min-w-0 rounded-lg bg-muted/30 p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none xl:w-[20rem] xl:shrink-0 xl:self-start"
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Average playability
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {playability.averagePct.toFixed(1)}%
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  across {playability.scoredCount}{' '}
                  {playability.scoredCount === 1 ? 'spell' : 'spells'} ·{' '}
                  {playability.belowThresholdCount} under {playability.threshold}%
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {playability.profile.sources.length} mana sources in a{' '}
                  {playability.profile.librarySize}-card library. See Mana →
                </p>
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* ONE metric strip. The builder drew this same component with different
          inputs — its average mana value included the commander and its
          ownership check excluded it, so the same deck read differently on the
          two pages. These are the inputs that agree with `ManaCurve` and with
          `computeDeckStats`. */}
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

      <PageTabs
        tabs={tabs.map(tab => (tab.id === 'cards' ? { ...tab, count: stats.totalCards } : tab))}
        value={activeTab}
        onChange={setActiveTab}
        label="Deck sections"
      />

      <div className="mt-5">
        {activeTab === 'cards' && (
          <DeckCardsPanel
            rows={listRows}
            commanderRow={commander}
            deckName={deck.name}
            onCardClick={openCard}
            engine={playabilityEngine}
            view={cardView}
            onViewChange={setCardView}
            editing={editing}
          />
        )}

        {/*
          PICKING, not browsing. You are here to put cards in a deck. A click
          that navigated to the card page would throw that on the floor. So the
          card body adds the card and the page stays put; the eye on each card
          opens its page. Same rule as the storage picker, written the same way
          on purpose. Do not "fix" it back.
        */}
        {activeTab === 'add' && canEdit && (
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-sm font-medium">Adding cards to {deck.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatLabel(deck.format)} · {stats.totalCards} cards
                {commander
                  ? ` · colour identity of ${commander.card?.name || commander.card_name}`
                  : ''}
              </p>
            </Card>
            <EnhancedUniversalCardSearch
              mode="pick"
              onCardAdd={card => void editor.addCard(card)}
              placeholder={`Search cards for ${deck.name}`}
              showFilters
              showAddButton
              showWishlistButton={false}
              showViewModes
              /* The bucket the builder's mount has always written its card size
                 under, so nobody's chosen size resets. */
              sizeKey="dm.card-size.deck-builder"
            />
          </div>
        )}

        {/* Everything about producing mana, in one place. */}
        {activeTab === 'mana' &&
          (hasCards ? (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-5 md:p-6">
                  <ManaCurve cards={mainboard} height={200} />
                </CardContent>
              </Card>

              <ManaSourcesPanel profile={playabilityEngine.profile} result={playability} />

              <LandEnhancerUX entries={powerEntries} power={power} identity={identity} />
            </div>
          ) : (
            needsCards('this deck’s mana analysed')
          ))}

        {/* EDH: the canonical score and its nine subscores, the commander read,
            the coaching, and the edhpowerlevel.com second opinion — which can
            be run from here now. The read-only copy of that panel had a Refresh
            button that navigated to the builder, which is the exact fork this
            merge exists to remove. */}
        {activeTab === 'edh' &&
          (hasCards && power ? (
            <div className="space-y-6">
              {showPower && <PowerScore power={power} variant="expanded" />}

              {showPower && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <CommanderPowerDisplay
                    power={power}
                    commanderName={commander?.card?.name || commander?.card_name}
                  />
                  <PowerSliderCoaching power={power} entries={powerEntries} format={deck.format} />
                </div>
              )}

              {/* `DeckCompatibilityChecker` deliberately stays on Legality
                  rather than being mirrored here. A colour-identity violation
                  is a legality question, and rendering the same panel under two
                  tabs is the duplication this exists to remove. */}

              {isCommanderFormat && (
                <EdhPowerCheck
                  deckId={deck.id}
                  rows={rows}
                  commanderName={commander?.card?.name || commander?.card_name}
                  power={power}
                  cached={(deck.edh_analysis as unknown as EdhAnalysisData) ?? null}
                  cachedHash={deck.edh_cards_hash}
                  onCached={editor.setEdhAnalysis}
                />
              )}
            </div>
          ) : (
            needsCards('this deck’s Commander power')
          ))}

        {/* What is on Analysis is the format-agnostic half: what kind of deck
            this is and how it behaves. */}
        {activeTab === 'analysis' &&
          (hasCards && power ? (
            <div className="space-y-6">
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
                cards={mainboard as never}
                format={deck.format}
                commander={analyticsCommander as never}
              />
              {isCommanderFormat && analyticsCommander && (
                <DeckCompatibilityChecker
                  cards={mainboard as never}
                  commander={analyticsCommander as never}
                  format={deck.format}
                  /* NAMING A PROBLEM AND BEING ABLE TO FIX IT.
                     The read-only page mounted this without a remove handler,
                     so it could tell you a card broke your commander's colour
                     identity and then leave you to go somewhere else to take it
                     out. That is the whole argument for this merge in one
                     component. */
                  onRemoveCard={
                    canEdit
                      ? cardId => {
                          const row = rows.find(r => r.card_id === cardId);
                          if (row) void editor.deleteAll(row);
                        }
                      : undefined
                  }
                />
              )}
            </div>
          ) : (
            needsCards('legality checks')
          ))}

        {activeTab === 'optimiser' &&
          (hasCards ? (
            <AIOptimizerPanel
              deckId={deck.id}
              deckCards={mainboard as never}
              deckName={deck.name}
              format={deck.format}
              commander={analyticsCommander as never}
              power={power}
              edhAnalysis={(deck.edh_analysis as unknown as EdhAnalysisData) ?? null}
              /* NO `onSaveDeck`.
                 It existed because applying a pass wrote the deck through a
                 silent 500ms timer, and a save nobody can see is worse than no
                 autosave. Every edit on this page writes its own row and
                 reports it, and the state sits in the page header where it
                 covers every edit rather than only this panel's. A button whose
                 only possible outcome is "already saved" is not a save button;
                 the thing it was there to provide — knowing the work is
                 written — is still on screen, one band higher. */
              onApplyReplacements={async replacements => {
                /* THIS LOOP ONCE LOST 14 CARDS OUT OF A REAL DECK, and the
                   three rules that stopped it are kept exactly:

                   A replacement with an empty `add` is the removal sentinel.
                   Asking Scryfall for the empty string produced fifteen HTTP
                   400s and spent the request budget for the real lookups.

                   Scryfall asks for 50 to 100ms between requests, and a
                   rate-limited reply carries no access-control header, so the
                   browser reports CORS and the card is simply never added.

                   And a card is never removed before its replacement is in
                   hand. A failed lookup leaves the deck alone and says so. */
                const failed: string[] = [];

                for (const [index, { remove, add }] of replacements.entries()) {
                  const wanted = (add ?? '').trim();
                  const outgoing = rows.find(
                    r => (r.card?.name || r.card_name) === remove && !r.is_commander
                  );

                  if (!wanted) {
                    if (outgoing) await editor.deleteAll(outgoing);
                    continue;
                  }

                  if (index > 0) await new Promise(resolve => setTimeout(resolve, 120));

                  let incoming: unknown = null;
                  try {
                    incoming = await scryfallAPI.getCardByName(wanted);
                  } catch (error) {
                    console.error(`Failed to add ${wanted}:`, error);
                  }

                  if (!incoming) {
                    failed.push(wanted);
                    continue;
                  }

                  if (outgoing) await editor.replaceCard(outgoing, incoming as never);
                  else await editor.addCard(incoming as never, { quiet: true });
                }

                if (failed.length > 0) {
                  showError(
                    `${failed.length} card${failed.length === 1 ? '' : 's'} could not be looked up`,
                    `${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ' and others' : ''} stayed as they were.`
                  );
                }
              }}
              onAddCard={async cardName => {
                try {
                  const card = await scryfallAPI.getCardByName(cardName);
                  await editor.addCard(card as never, { quiet: true });
                } catch (error) {
                  console.error(`Failed to add ${cardName}:`, error);
                  showError(`Failed to add ${cardName}`);
                }
              }}
              onRemoveCard={async cardName => {
                const row = rows.find(
                  r => (r.card?.name || r.card_name) === cardName && !r.is_commander
                );
                if (row) await editor.deleteAll(row);
              }}
            />
          ) : (
            needsCards('optimisation suggestions')
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

        {/* Record: the things a human writes about a deck. Primer and Matches
            were two tabs on the read-only page and the bottom of a very long
            Analysis tab on the builder. Same components, one home. On the
            builder the primer lived inside the Optimizer tab, so turning off
            the feature flag took the primer with it. That was an accident. */}
        {activeTab === 'record' && (
          <div className="space-y-6">
            <DeckPrimerGenerator
              deckName={deck.name}
              commander={commander?.card?.name || commander?.card_name}
              cardCount={stats.totalCards}
            />
            <EnhancedMatchTracker deckId={deck.id} deckName={deck.name} />
            {/* The tracker records games; this reads them back. Same rows, two
                different jobs. */}
            <MatchAnalytics deckId={deck.id} deckName={deck.name} />
            <DeckNotesPanel deckId={deck.id} />
          </div>
        )}
      </div>

      {/* Right-hand slide-overs, never centred dialogs. Both keep the deck on
          screen behind them, because the deck is what you are comparing
          against. */}
      <ReplaceCardPanel
        row={replacing}
        onOpenChange={open => !open && setReplacing(null)}
        onReplace={(row, card) => editor.replaceCard(row, card as never)}
        commanderName={commander?.card?.name || commander?.card_name}
      />

      <ImportDeckPanel
        open={importing}
        onOpenChange={setImporting}
        deckName={deck.name}
        onImport={editor.importCards}
        onCommander={editor.chooseCommander}
      />
    </StandardPageLayout>
  );
}
