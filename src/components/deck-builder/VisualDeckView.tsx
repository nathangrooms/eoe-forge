import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Minus,
  Search,
  ChevronDown,
  ChevronRight,
  Crown,
  Sparkles,
  X,
  RefreshCw,
  Trash2,
  LayoutList,
  Grid3X3,
  Type as TypeIcon,
  ArrowUp,
  ArrowDown,
  Edit,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost, ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { OracleText } from '@/components/cards/OracleText';
import { useOpenCard } from '@/components/cards';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import {
  categorizeCard,
  CATEGORY_CONFIG,
  CATEGORY_ORDER,
  maxCopiesFor,
  type CardCategory,
} from './deck-categories';
import {
  DECK_BUILD_MODES,
  DECK_BUILD_SORTS,
  DECK_BUILD_VIEW_SURFACE,
  DEFAULT_DECK_CARD_SIZE,
  GROUP_LABELS,
  useDeckGroupBy,
  type DeckGroupBy,
  type DeckSortKey,
} from './deck-view-prefs';
import {
  EmptyState,
  FIELD,
  FilterBar,
  ListingSearch,
  SURFACE,
  SortControl,
  matchedLabel,
  resultSentence,
  useListingView,
} from '@/components/listing';

interface DeckCard {
  id: string;
  name: string;
  quantity: number;
  cmc: number;
  type_line: string;
  colors?: string[];
  color_identity?: string[];
  mana_cost?: string;
  rarity?: string;
  set?: string;
  set_name?: string;
  image_uris?: { normal?: string; small?: string; large?: string };
  prices?: { usd?: string };
  oracle_text?: string;
}

interface VisualDeckViewProps {
  cards: DeckCard[];
  commander?: any;
  format: string;
  onAddCard?: (cardId: string) => void;
  onRemoveCard?: (cardId: string) => void;
  onDeleteCard?: (cardId: string) => void;
  onUpdateQuantity?: (cardId: string, quantity: number) => void;
  onReplaceCard?: (cardId: string) => void;
  /**
   * Draw the commander block above the grid. The Deck Generator turns this off:
   * it already shows the commander at full size in its own result header, and
   * this block's "Change" control routes to `/deck-builder/commander`, which is
   * the wrong destination for a deck that has not been saved yet.
   */
  showCommander?: boolean;
}

interface CardGroup {
  key: string;
  label: string;
  category?: CardCategory;
  cards: DeckCard[];
}

const COLOR_GROUP_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

function priceOf(card: DeckCard): number {
  return parseFloat(card.prices?.usd || '0') || 0;
}

function colorGroupOf(card: DeckCard): string {
  const identity = card.color_identity?.length ? card.color_identity : card.colors ?? [];
  if (identity.length === 0) return 'Colourless';
  if (identity.length > 1) return 'Multicolour';
  return COLOR_GROUP_NAMES[identity[0]] ?? 'Colourless';
}

function cmcGroupOf(card: DeckCard): string {
  const cmc = Number.isFinite(card.cmc) ? Number(card.cmc) : 0;
  return cmc >= 7 ? 'MV 7+' : `MV ${Math.round(cmc)}`;
}

export function VisualDeckView({
  cards,
  commander,
  format,
  onAddCard,
  onRemoveCard,
  onDeleteCard,
  onUpdateQuantity,
  onReplaceCard,
  showCommander = true,
}: VisualDeckViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /* Clicking a card goes to the card page — the same everywhere in the app.
     The builder's own controls (quantity, remove, group) stay in place. */
  const openCard = useOpenCard();
  /* Mode, sort axis, direction and card width, under the key this surface has
     always written, so nobody's choice resets. Grouping stays its own control
     because no other listing in the product has an axis worth cutting on. */
  const view = useListingView({
    surface: DECK_BUILD_VIEW_SURFACE,
    modes: DECK_BUILD_MODES,
    defaultMode: 'grid',
    defaultSortKey: 'cmc',
    defaultSortDir: 'asc',
    defaultSize: DEFAULT_DECK_CARD_SIZE,
  });
  const [groupBy, setGroupBy] = useDeckGroupBy();
  const prefs = {
    mode: view.mode as 'grid' | 'table' | 'text',
    sortKey: view.sortKey as DeckSortKey,
    sortDir: view.sortDir,
    cardSize: view.size,
    groupBy,
  };
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * The commander picker is a route now, not an overlay.
   *
   * `CommanderDialog` covered the deck you were choosing a commander for, which
   * is the one thing you need to see while choosing. `from` carries the exact
   * surface we left so the picker's back control returns here.
   */
  const openCommanderPicker = () =>
    navigate('/deck-builder/commander', {
      state: { from: `${location.pathname}${location.search}` },
    });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.type_line || '').toLowerCase().includes(q) ||
        (c.oracle_text || '').toLowerCase().includes(q)
    );
  }, [cards, searchTerm]);

  const sorted = useMemo(() => {
    const dir = prefs.sortDir === 'asc' ? 1 : -1;
    const compare = (a: DeckCard, b: DeckCard): number => {
      switch (prefs.sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'quantity':
          return ((a.quantity || 1) - (b.quantity || 1)) * dir || a.name.localeCompare(b.name);
        case 'price':
          return (priceOf(a) - priceOf(b)) * dir || a.name.localeCompare(b.name);
        case 'type':
          return (a.type_line || '').localeCompare(b.type_line || '') * dir || a.name.localeCompare(b.name);
        case 'cmc':
        default:
          return ((a.cmc || 0) - (b.cmc || 0)) * dir || a.name.localeCompare(b.name);
      }
    };
    return [...filtered].sort(compare);
  }, [filtered, prefs.sortKey, prefs.sortDir]);

  const groups = useMemo<CardGroup[]>(() => {
    if (prefs.groupBy === 'none') {
      return [{ key: 'all', label: 'All cards', cards: sorted }];
    }

    if (prefs.groupBy === 'type') {
      const byCategory = new Map<CardCategory, DeckCard[]>();
      for (const card of sorted) {
        const cat = categorizeCard(card);
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(card);
      }
      /* The commander is drawn at full size directly above this grid, so a
         Commanders group underneath repeats it as a thumbnail and pushes the
         actual deck down a row. Owner: "dont need to show the commander row -
         start with creatures - we already show commander at the top". When the
         block above is turned off, as the deck generator does, the group comes
         back, because then it is the only place the commander appears. */
      const shown = CATEGORY_ORDER.filter(
        c => byCategory.has(c) && !(showCommander && c === 'commanders')
      );
      return shown.map(c => ({
        key: c,
        label: CATEGORY_CONFIG[c].label,
        category: c,
        cards: byCategory.get(c)!,
      }));
    }

    const keyFn = prefs.groupBy === 'color' ? colorGroupOf : cmcGroupOf;
    const order =
      prefs.groupBy === 'color'
        ? ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolour', 'Colourless']
        : ['MV 0', 'MV 1', 'MV 2', 'MV 3', 'MV 4', 'MV 5', 'MV 6', 'MV 7+'];

    const map = new Map<string, DeckCard[]>();
    for (const card of sorted) {
      const k = keyFn(card);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(card);
    }
    return order.filter(k => map.has(k)).map(k => ({ key: k, label: k, cards: map.get(k)! }));
  }, [sorted, prefs.groupBy, showCommander]);

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /*
   * The two local image-URL builders that used to live here — one for grid
   * cards, one for the commander — both hardcoded Scryfall's `normal` (488px)
   * asset regardless of how large the card was drawn, which is exactly the
   * softness `CardImage` exists to fix. Both call sites now use `CardImage`,
   * which resolves the asset from the rendered width and handles the back face
   * of a double-faced card.
   */

  const limitFor = (card: DeckCard) => maxCopiesFor(format, card);

  const handleQuantityInput = (card: DeckCard, raw: string) => {
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) return;
    const next = Math.max(0, parsed);
    const limit = limitFor(card);
    if (next > limit) {
      showError(
        'Copy limit',
        `${card.name} is capped at ${limit} cop${limit === 1 ? 'y' : 'ies'} in ${format}.`
      );
      onUpdateQuantity?.(card.id, limit);
      return;
    }
    onUpdateQuantity?.(card.id, next);
  };

  const handleIncrement = (card: DeckCard) => {
    const limit = limitFor(card);
    if ((card.quantity || 1) + 1 > limit) {
      showError(
        'Copy limit',
        `${card.name} is capped at ${limit} cop${limit === 1 ? 'y' : 'ies'} in ${format}.`
      );
      return;
    }
    onAddCard?.(card.id);
  };

  const decklistText = useMemo(() => {
    const lines: string[] = [];
    if (commander?.name) lines.push(`1 ${commander.name}`, '');
    for (const group of groups) {
      if (prefs.groupBy !== 'none') lines.push(`// ${group.label}`);
      for (const card of group.cards) lines.push(`${card.quantity || 1} ${card.name}`);
      if (prefs.groupBy !== 'none') lines.push('');
    }
    return lines.join('\n').trim();
  }, [groups, commander, prefs.groupBy]);

  const totalShown = filtered.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const totalCopies = cards.reduce((sum, c) => sum + (c.quantity || 1), 0);
  /* `84 of 100 cards`, and only `100 cards` when nothing is narrowing it. The
     same sentence the deck page, the collection and card search all print. */
  const countLine = resultSentence([matchedLabel(totalShown, totalCopies, 'card')]);

  const copyDecklist = () => {
    navigator.clipboard
      ?.writeText(decklistText)
      .then(() => showSuccess('Copied', 'Decklist copied to the clipboard'))
      .catch(() => showError('Copy failed', 'Your browser blocked clipboard access'));
  };

  /* ----------------------------------------------------------------- */

  const renderGroupHeader = (group: CardGroup) => {
    const count = group.cards.reduce((sum, c) => sum + (c.quantity || 1), 0);
    const Icon = group.category ? CATEGORY_CONFIG[group.category].icon : null;
    const isCollapsed = collapsed.has(group.key);
    return (
      <button
        onClick={() => toggleGroup(group.key)}
        aria-expanded={!isCollapsed}
        className="mb-3 flex w-full items-center gap-2 rounded-lg bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        {Icon && group.category && (
          <Icon className={cn('h-4 w-4 shrink-0', CATEGORY_CONFIG[group.category].color)} />
        )}
        <span className="text-sm font-semibold">{group.label}</span>
        <Badge variant="secondary" className="ml-auto tabular-nums">
          {count}
        </Badge>
      </button>
    );
  };

  const renderGrid = (group: CardGroup) => (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${prefs.cardSize}px, 1fr))` }}
    >
      {group.cards.map(card => (
        <div key={card.id} className="group relative">
          {/* `CardImage` rather than a hand-rolled `<img>`: it picks the
              Scryfall resolution that matches the size the slider is asking
              for, flips double-faced cards, and carries no border. */}
          <CardImage
            card={card}
            width={prefs.cardSize}
            fill
            onClick={() => openCard(card)}
            // The hover overlay below is the affordance here; the lift would
            // slide the card out from under its own controls.
            interactive={false}
            title={`Open ${card.name}`}
          >
            {(card.quantity || 1) > 1 && (
              /* Sits on card art, so light-on-dark is the correct ground here. */
              <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
                ×{card.quantity}
              </span>
            )}
          </CardImage>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/75 p-2 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <div className="flex items-center gap-1">
              {onRemoveCard && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  onClick={() => onRemoveCard(card.id)}
                  title="Remove one copy"
                >
                  <Minus className="h-4 w-4" />
                </Button>
              )}
              {onUpdateQuantity ? (
                <Input
                  type="number"
                  min={0}
                  value={card.quantity ?? 1}
                  onChange={e => handleQuantityInput(card, e.target.value)}
                  /* One of these sits on every card in the deck. Measured on
                     the built bundle, a hundred-card deck rendered 99 visible
                     hairlines on the busiest screen in the product, all of them
                     from `Input`'s default border. */
                  className={cn(FIELD, 'h-8 w-14 text-center tabular-nums')}
                  aria-label={`Copies of ${card.name}`}
                />
              ) : (
                <span className="w-10 text-center text-sm font-semibold tabular-nums text-white">
                  {card.quantity ?? 1}
                </span>
              )}
              {onAddCard && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  onClick={() => handleIncrement(card)}
                  title="Add one copy"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {onReplaceCard && (
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onReplaceCard(card.id)}>
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Replace
                </Button>
              )}
              {onDeleteCard && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => onDeleteCard(card.id)}
                  title="Remove all copies"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderTable = (group: CardGroup) => (
    <div className="overflow-x-auto rounded-lg bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-16 px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="w-28 px-3 py-2 font-medium">Cost</th>
            <th className="w-14 px-3 py-2 text-right font-medium">MV</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Type</th>
            <th className="hidden w-20 px-3 py-2 font-medium lg:table-cell">Set</th>
            <th className="w-20 px-3 py-2 text-right font-medium">Price</th>
            <th className="w-24 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {group.cards.map(card => (
            <tr key={card.id} className="group hover:bg-accent/60">
              <td className="px-3 py-1.5">
                {onUpdateQuantity ? (
                  <Input
                    type="number"
                    min={0}
                    value={card.quantity ?? 1}
                    onChange={e => handleQuantityInput(card, e.target.value)}
                    className={cn(FIELD, 'h-7 w-12 px-1 text-center tabular-nums')}
                    aria-label={`Copies of ${card.name}`}
                  />
                ) : (
                  <span className="tabular-nums">{card.quantity ?? 1}</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => openCard(card)}
                  className="truncate text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {card.name}
                </button>
              </td>
              <td className="px-3 py-1.5">
                <ManaCost cost={card.mana_cost} size="xs" />
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{card.cmc ?? 0}</td>
              <td className="hidden max-w-[220px] truncate px-3 py-1.5 text-muted-foreground md:table-cell">
                {card.type_line}
              </td>
              <td className="hidden px-3 py-1.5 uppercase text-muted-foreground lg:table-cell">{card.set || '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {priceOf(card) > 0 ? `$${priceOf(card).toFixed(2)}` : '—'}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {onReplaceCard && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onReplaceCard(card.id)}
                      title="Replace"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDeleteCard && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteCard(card.id)}
                      title="Remove all copies"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Commander */}
      {format === 'commander' && showCommander && (
        <Card className="p-4">
          {commander ? (
            <div className="flex flex-col gap-4 md:flex-row">
              <CardImage
                card={commander}
                size="lg"
                eager
                className="mx-auto md:mx-0"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Crown className="h-4 w-4 text-type-commander" />
                    Commander
                  </span>
                  <Button variant="secondary" size="sm" onClick={openCommanderPicker}>
                    <Edit className="mr-2 h-4 w-4" />
                    Change
                  </Button>
                </div>
                <h3 className="text-xl font-semibold">{commander.name}</h3>
                <p className="mb-3 text-sm text-muted-foreground">{commander.type_line}</p>
                {commander.oracle_text && (
                  <div className="max-h-36 overflow-y-auto pr-2">
                    <OracleText text={commander.oracle_text} size="sm" className="text-sm" />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 pt-3">
                  <ManaCost cost={commander.mana_cost} size="sm" />
                  <ColorIdentity colors={commander.color_identity || commander.colors} size="sm" />
                  {commander.power && commander.toughness && (
                    <Badge variant="secondary" className="tabular-nums">
                      {commander.power}/{commander.toughness}
                    </Badge>
                  )}
                  {commander.loyalty && <Badge variant="secondary">Loyalty {commander.loyalty}</Badge>}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Crown className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="mb-1 text-base font-semibold">No commander selected</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                A Commander deck needs a legal commander in the command zone.
              </p>
              <Button onClick={openCommanderPicker}>
                <Crown className="mr-2 h-4 w-4" />
                Select commander
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* THE MANA CURVE IS NOT HERE. It lives on the Analysis tab.

          It used to sit permanently on the build surface, above the cards, on
          the argument that you want it while building. In practice it pushed
          the deck itself down the page on every visit, and this tab is for
          reading and editing the list. Owner: "we probably dont want the mana
          curve on the main cards page, should be saved for analysis page". */}

      {/* FILTERS ARE CLOSED BY DEFAULT.

          Six controls sat above the deck on every visit, and almost every visit
          is "look at my deck" rather than "narrow my deck". Owner: "dont need
          all those filters by default". One line opens them, and it says how
          many are doing something so a narrowed list is never a mystery.

          The row itself is one tinted surface with no outlines, matching every
          other filter row in the app: inputs and selects carry a border by
          default, so each turns it off explicitly. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className="rounded-md bg-foreground/[0.06] px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.12] hover:text-foreground"
        >
          {showFilters ? 'Hide filters' : 'Filter and sort'}
        </button>
        {!showFilters && searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear &ldquo;{searchTerm}&rdquo;
          </button>
        )}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{countLine}</span>
      </div>

      {showFilters && (
        /* One bar, the same one every listing in the product uses.

           This was six controls hand-drawn here: a search box with no debounce,
           a group select, a sort select welded to an `outline` direction button
           with `border-l-0`, a bespoke card-size `Slider`, and a segmented
           control wrapped in `border border-border`. That last one is a literal
           hairline, which design law 2 rules out, and the sort button next to
           it was a second. Every control survived; none of them is drawn here
           any more. */
        <FilterBar
          view={view}
          activeCount={searchTerm.trim() ? 1 : 0}
          onClear={() => setSearchTerm('')}
          search={
            <ListingSearch
              value={searchTerm}
              onCommit={next => setSearchTerm(next ?? '')}
              placeholder="Filter cards in this deck"
              label="Filter cards in this deck"
            />
          }
          presets={
            /* Grouping is this surface's own control and no other listing has
               one, so it is passed in rather than built into the bar. */
            <Select value={prefs.groupBy} onValueChange={v => setGroupBy(v as DeckGroupBy)}>
              <SelectTrigger className={cn(FIELD, 'h-9 w-[150px]')} aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={SURFACE}>
                {(Object.keys(GROUP_LABELS) as DeckGroupBy[]).map(k => (
                  <SelectItem key={k} value={k}>
                    {GROUP_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          sort={
            <SortControl
              options={DECK_BUILD_SORTS}
              value={prefs.sortKey}
              onValueChange={view.setSortKey}
              dir={prefs.sortDir}
              onToggleDir={view.toggleSortDir}
              label="Sort cards by"
            />
          }
        />
      )}

      {/* Body — full width. The detail pane that used to dock to the right of
          this grid is gone; a card click leaves for `/cards/:id`. */}
      <div>
        {cards.length === 0 ? (
          /* The shared panel, not a bare centred stack. There were seven of
             those and they differed on padding and on whether the icon sat in
             a 16px circle or a 20px one. */
          <EmptyState
            title="No cards in this deck yet"
            description="Use the Add Cards tab to search for cards."
            icon={Sparkles}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No cards match that filter"
            description="Widen the search, or clear it and see the whole list."
            icon={Search}
            onClearFilters={() => setSearchTerm('')}
          />
        ) : prefs.mode === 'text' ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={copyDecklist}>
                <Copy className="mr-2 h-4 w-4" />
                Copy decklist
              </Button>
            </div>
            <Textarea
              readOnly
              value={decklistText}
              className="min-h-[420px] font-mono text-xs"
              aria-label="Plain-text decklist"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.key}>
                {prefs.groupBy !== 'none' && renderGroupHeader(group)}
                {!collapsed.has(group.key) && (prefs.mode === 'grid' ? renderGrid(group) : renderTable(group))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
