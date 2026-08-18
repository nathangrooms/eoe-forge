import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Copy,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { BORDERLESS_SLIDER } from '@/components/cards/CardSizeSlider';

import {
  buildScryfallQuery,
  countActiveFilters,
  COLOR_SYMBOLS,
  COLOR_ORDER,
  IDENTITY_ORDER,
  RARITY_INFO,
  SORT_OPTIONS,
  type CardSearchState,
  type ColorMatchMode,
  type ColorOption,
  type Format,
  type LegalState,
  type Rarity,
} from '@/lib/scryfall/query-builder';
import {
  FILTER_PARAM_KEYS,
  parseFilterParams,
  pruneState,
  serializeFilterState,
} from '@/lib/scryfall/filter-url';

/**
 * The card filter.
 *
 * There is one of these in the product and every surface with card search uses
 * it — search, collection, deck builder, wishlist. It is built entirely on the
 * existing `CardSearchState` / `buildScryfallQuery` pair in
 * `src/lib/scryfall/query-builder.ts`; nothing here composes a query string by
 * hand, so a facet added to the builder shows up everywhere at once.
 *
 * The state lives in the URL (`useSearchParams`), which is what makes a
 * filtered view survive a reload and be pasteable to another player.
 */

/* ================================================================== *
 * Vocabulary
 * ================================================================== */

const CARD_TYPES = [
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment',
  'planeswalker', 'land', 'battle', 'kindred',
];

const SUPERTYPES = ['legendary', 'basic', 'snow', 'world'];

const FORMATS: { value: Format; label: string }[] = [
  { value: 'commander', label: 'Commander' },
  { value: 'standard', label: 'Standard' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'pauper', label: 'Pauper' },
  { value: 'brawl', label: 'Brawl' },
  { value: 'oathbreaker', label: 'Oathbreaker' },
  { value: 'historic', label: 'Historic' },
  { value: 'timeless', label: 'Timeless' },
  { value: 'alchemy', label: 'Alchemy' },
];

const EXTRAS: { key: keyof NonNullable<CardSearchState['extras']>; label: string }[] = [
  { key: 'foil', label: 'Foil available' },
  { key: 'nonfoil', label: 'Non-foil available' },
  { key: 'showcase', label: 'Showcase frame' },
  { key: 'reprint', label: 'Reprint' },
  { key: 'reserved', label: 'Reserved list' },
  { key: 'promo', label: 'Promo' },
];

const IDENTITY_MODES: { value: ColorMatchMode; label: string; hint: string }[] = [
  { value: 'atmost', label: 'At most', hint: 'id<= — everything a deck of these colors may run' },
  { value: 'exact', label: 'Exactly', hint: 'id= — this identity and no other' },
  { value: 'atleast', label: 'Including', hint: 'id>= — has these colors, may have more' },
];

const COLOR_MODES: { value: ColorMatchMode; label: string; hint: string }[] = [
  { value: 'any', label: 'Any of', hint: 'c: — at least one of these colors' },
  { value: 'exact', label: 'Exactly', hint: 'c= — precisely these colors' },
  { value: 'atleast', label: 'Including', hint: 'c>= — these colors and maybe more' },
  { value: 'atmost', label: 'At most', hint: 'c<= — no colors outside these' },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'any', label: 'Any language' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ru', label: 'Russian' },
  { value: 'zhs', label: 'Chinese Simplified' },
];

/** Scryfall's own four states, cycled by tapping a format chip. */
const LEGAL_CYCLE: (LegalState | null)[] = ['legal', 'banned', 'restricted', null];

const MV_MAX = 16;
const PT_MAX = 15;
const PRICE_MAX = 100;

/* ================================================================== *
 * Set catalog — fetched once per page load, shared by every panel.
 * ================================================================== */

export interface ScryfallSetSummary {
  code: string;
  name: string;
  released_at?: string;
}

let setCatalog: ScryfallSetSummary[] | null = null;
let setCatalogPromise: Promise<ScryfallSetSummary[]> | null = null;

function loadSetCatalog(): Promise<ScryfallSetSummary[]> {
  if (setCatalog) return Promise.resolve(setCatalog);
  if (setCatalogPromise) return setCatalogPromise;

  setCatalogPromise = fetch('https://api.scryfall.com/sets')
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const list: ScryfallSetSummary[] = (data?.data ?? [])
        .filter((s: any) => s?.card_count > 0)
        .map((s: any) => ({ code: s.code, name: s.name, released_at: s.released_at }))
        .sort((a: ScryfallSetSummary, b: ScryfallSetSummary) =>
          (b.released_at ?? '').localeCompare(a.released_at ?? '')
        );
      setCatalog = list;
      return list;
    })
    .catch(() => {
      // The set picker degrades to "unavailable"; every other facet still works.
      setCatalogPromise = null;
      return [];
    });

  return setCatalogPromise;
}

export function useSetCatalog() {
  const [sets, setSets] = useState<ScryfallSetSummary[]>(setCatalog ?? []);

  useEffect(() => {
    let cancelled = false;
    loadSetCatalog().then(list => {
      if (!cancelled) setSets(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return sets;
}

/* ================================================================== *
 * State controller
 * ================================================================== */

export interface CardFilterController {
  state: CardSearchState;
  setState: (next: CardSearchState) => void;
  patch: (partial: Partial<CardSearchState>) => void;
  reset: () => void;
  /** The Scryfall query string this state produces. */
  query: string;
  /** `unique` / `order` / `dir`, ready to append to a Scryfall request. */
  params: Record<string, string>;
  activeCount: number;
}

export interface UseCardFilterStateOptions {
  /**
   * Mirror the filter into the query string. On by default — that is the point.
   * Turn it off for a filter inside a modal, where the page URL means something
   * else (a deck-builder card picker, for instance).
   */
  urlSync?: boolean;
  /** Applied once on mount, and only when the URL carries no filter at all. */
  initialState?: CardSearchState;
}

/**
 * The single source of truth for a filtered card view.
 *
 * ```tsx
 * const filters = useCardFilterState();
 * const { data } = useQuery({ queryKey: ['cards', filters.query], … });
 * <CardFilterSheet controller={filters} />
 * ```
 *
 * Must be rendered inside the router (it reads `useSearchParams`).
 */
export function useCardFilterState(
  options: UseCardFilterStateOptions = {}
): CardFilterController {
  const { urlSync = true, initialState } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const [localState, setLocalState] = useState<CardSearchState>(
    () => pruneState(initialState ?? {})
  );

  const urlState = useMemo(() => parseFilterParams(searchParams), [searchParams]);
  const state = urlSync ? urlState : localState;

  // Seed defaults exactly once, and only into an untouched URL, so "clear all"
  // genuinely clears instead of snapping back to the preset.
  const seeded = useRef(false);
  useEffect(() => {
    if (!urlSync || seeded.current) return;
    seeded.current = true;
    if (!initialState) return;
    const alreadyFiltered = FILTER_PARAM_KEYS.some(k => searchParams.has(k));
    if (alreadyFiltered) return;
    setSearchParams(prev => serializeFilterState(pruneState(initialState), prev), {
      replace: true,
    });
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSync]);

  // `setState` and `patch` must keep a stable identity: the free-text boxes
  // debounce inside an effect keyed on their commit callback, and a callback
  // that changed on every render would reset the timer before it ever fired.
  const latest = useRef({ state, urlSync, setSearchParams });
  latest.current = { state, urlSync, setSearchParams };

  const setState = useCallback((next: CardSearchState) => {
    const clean = pruneState(next);
    if (latest.current.urlSync) {
      latest.current.setSearchParams(prev => serializeFilterState(clean, prev), {
        replace: true,
      });
    } else {
      setLocalState(clean);
    }
  }, []);

  const patch = useCallback(
    (partial: Partial<CardSearchState>) =>
      setState({ ...latest.current.state, ...partial }),
    [setState]
  );

  const reset = useCallback(() => setState({}), [setState]);

  const { q, params } = useMemo(() => buildScryfallQuery(state), [state]);
  const activeCount = useMemo(
    () => countActiveFilters(state) + (state.text?.trim() ? 1 : 0),
    [state]
  );

  return { state, setState, patch, reset, query: q, params, activeCount };
}

/* ================================================================== *
 * Small building blocks — all borderless, all token-only.
 * ================================================================== */

const FIELD = 'h-9 border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0';

function Chip({
  selected,
  onClick,
  children,
  className,
  title,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg bg-muted/20">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
          {!!count && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-bold leading-none text-primary-foreground">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      {/* Radix Collapsible exposes `--radix-collapsible-content-height`, not the
          accordion variable the Tailwind height keyframes are written against,
          so this fades and slides rather than animating height. */}
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none">
        <div className="space-y-4 px-3 pb-4 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-foreground">{children}</span>
      {hint && <code className="font-mono text-[0.65rem] text-muted-foreground">{hint}</code>}
    </div>
  );
}

type NumberRange = { min?: number; max?: number };

/**
 * Two-thumb range. The top of the track means "no upper bound", which is what
 * lets one control express both `mv<=4` and "any mana value".
 */
function RangeControl({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  format = (n: number) => String(n),
}: {
  label: string;
  hint?: string;
  value?: NumberRange;
  onChange: (next: NumberRange | undefined) => void;
  min?: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
}) {
  const lo = value?.min ?? min;
  const hi = value?.max ?? max;
  const unbounded = hi >= max;

  const handle = (next: number[]) => {
    const [nextLo, nextHi] = next;
    const result: NumberRange = {};
    if (nextLo > min) result.min = nextLo;
    if (nextHi < max) result.max = nextHi;
    onChange(result.min === undefined && result.max === undefined ? undefined : result);
  };

  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <Slider
          value={[lo, hi]}
          min={min}
          max={max}
          step={step}
          onValueChange={handle}
          aria-label={label}
          className={cn('flex-1', BORDERLESS_SLIDER)}
        />
        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {format(lo)} – {format(hi)}
          {unbounded ? '+' : ''}
        </span>
      </div>
    </div>
  );
}

/** Colourless and multicolour render through `ManaPip` too, so nothing is a raw glyph. */
function ColorChip({
  color,
  selected,
  onClick,
}: {
  color: ColorOption;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <Chip selected={selected} onClick={onClick} title={COLOR_SYMBOLS[color].name}>
      <ManaPip symbol={color} size="xs" />
      <span className="hidden sm:inline">{COLOR_SYMBOLS[color].name}</span>
    </Chip>
  );
}

/* ================================================================== *
 * Active filter chips
 * ================================================================== */

interface ActiveChip {
  id: string;
  label: ReactNode;
  remove: () => void;
}

function useActiveChips(
  state: CardSearchState,
  patch: (partial: Partial<CardSearchState>) => void,
  sets: ScryfallSetSummary[]
): ActiveChip[] {
  return useMemo(() => {
    const chips: ActiveChip[] = [];
    const setName = (code: string) =>
      sets.find(s => s.code === code)?.name ?? code.toUpperCase();

    const dropFrom = <T,>(list: T[] | undefined, item: T) => {
      const next = (list ?? []).filter(x => x !== item);
      return next.length ? next : undefined;
    };

    if (state.text?.trim()) {
      chips.push({
        id: 'text',
        label: <span className="truncate font-mono">{state.text.trim()}</span>,
        remove: () => patch({ text: undefined }),
      });
    }

    if (state.oracle?.trim()) {
      chips.push({
        id: 'oracle',
        label: <>Text: “{state.oracle.trim()}”</>,
        remove: () => patch({ oracle: undefined }),
      });
    }

    state.types?.forEach(t =>
      chips.push({
        id: `type-${t}`,
        label: <span className="capitalize">{t}</span>,
        remove: () => patch({ types: dropFrom(state.types, t) }),
      })
    );

    state.supertypes?.forEach(t =>
      chips.push({
        id: `super-${t}`,
        label: <span className="capitalize">{t}</span>,
        remove: () => patch({ supertypes: dropFrom(state.supertypes, t) }),
      })
    );

    state.subtypes?.forEach(t =>
      chips.push({
        id: `sub-${t}`,
        label: <>Type: {t}</>,
        remove: () => patch({ subtypes: dropFrom(state.subtypes, t) }),
      })
    );

    if (state.identity?.length) {
      const mode = IDENTITY_MODES.find(m => m.value === (state.identityMode ?? 'any'));
      chips.push({
        id: 'identity',
        label: (
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">ID {mode?.label.toLowerCase() ?? ''}</span>
            {state.identity.map(c => (
              <ManaPip key={c} symbol={c} size="xs" />
            ))}
          </span>
        ),
        remove: () => patch({ identity: undefined, identityMode: undefined }),
      });
    }

    if (state.colors?.value.length) {
      const mode = COLOR_MODES.find(m => m.value === state.colors?.mode);
      chips.push({
        id: 'colors',
        label: (
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">{mode?.label ?? 'Any of'}</span>
            {state.colors.value.map(c => (
              <ManaPip key={c} symbol={c} size="xs" />
            ))}
          </span>
        ),
        remove: () => patch({ colors: undefined }),
      });
    }

    const rangeChip = (
      id: string,
      prefix: string,
      range: NumberRange | undefined,
      clear: () => void,
      fmt: (n: number) => string = String
    ) => {
      if (!range || (range.min === undefined && range.max === undefined)) return;
      const text =
        range.min !== undefined && range.max !== undefined
          ? `${fmt(range.min)}–${fmt(range.max)}`
          : range.min !== undefined
            ? `≥ ${fmt(range.min)}`
            : `≤ ${fmt(range.max as number)}`;
      chips.push({ id, label: <>{prefix} {text}</>, remove: clear });
    };

    rangeChip('mv', 'MV', state.mv, () => patch({ mv: undefined }));
    rangeChip('pow', 'Power', state.pow, () => patch({ pow: undefined }));
    rangeChip('tou', 'Toughness', state.tou, () => patch({ tou: undefined }));
    rangeChip('loy', 'Loyalty', state.loy, () => patch({ loy: undefined }));
    rangeChip(
      'price',
      'Price',
      state.price ? { min: state.price.usdMin, max: state.price.usdMax } : undefined,
      () => patch({ price: undefined }),
      n => `$${n}`
    );

    state.rarities?.forEach(r =>
      chips.push({
        id: `rarity-${r}`,
        label: <>{RARITY_INFO[r].name}</>,
        remove: () => patch({ rarities: dropFrom(state.rarities, r) }),
      })
    );

    state.sets?.forEach(code =>
      chips.push({
        id: `set-${code}`,
        label: <>{setName(code)}</>,
        remove: () => patch({ sets: dropFrom(state.sets, code) }),
      })
    );

    state.legal?.forEach(l =>
      chips.push({
        id: `legal-${l.format}`,
        label: (
          <span className="capitalize">
            {l.format} · {l.state}
          </span>
        ),
        remove: () =>
          patch({
            legal: (state.legal ?? []).filter(x => x.format !== l.format).length
              ? (state.legal ?? []).filter(x => x.format !== l.format)
              : undefined,
          }),
      })
    );

    EXTRAS.forEach(({ key, label }) => {
      if (!state.extras?.[key]) return;
      chips.push({
        id: `extra-${key}`,
        label: <>{label}</>,
        remove: () => {
          const next = { ...state.extras };
          delete next[key];
          patch({ extras: Object.keys(next).length ? next : undefined });
        },
      });
    });

    state.game?.forEach(g =>
      chips.push({
        id: `game-${g}`,
        label: <span className="capitalize">{g}</span>,
        remove: () => patch({ game: dropFrom(state.game, g) }),
      })
    );

    if (state.language) {
      chips.push({
        id: 'language',
        label: <>{LANGUAGES.find(l => l.value === state.language)?.label ?? state.language}</>,
        remove: () => patch({ language: undefined }),
      });
    }

    if (state.artist?.trim()) {
      chips.push({
        id: 'artist',
        label: <>Artist: {state.artist.trim()}</>,
        remove: () => patch({ artist: undefined }),
      });
    }

    return chips;
  }, [state, patch, sets]);
}

export function ActiveFilterChips({
  controller,
  className,
}: {
  controller: CardFilterController;
  className?: string;
}) {
  const sets = useSetCatalog();
  const chips = useActiveChips(controller.state, controller.patch, sets);

  if (chips.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map(chip => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.remove}
          className={cn(
            'group inline-flex max-w-[16rem] items-center gap-1.5 rounded-full bg-muted/60 py-1 pl-2.5 pr-1.5 text-xs text-foreground',
            'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          title="Remove filter"
        >
          <span className="truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      ))}
      <button
        type="button"
        onClick={controller.reset}
        className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear all
      </button>
    </div>
  );
}

/* ================================================================== *
 * Debounced free-text box
 * ================================================================== */

function SearchField({
  value,
  onCommit,
  placeholder,
  autoFocus,
}: {
  value: string;
  onCommit: (next: string | undefined) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  // Adopt external changes (chip removal, clear all, a shared link) without
  // stomping on what the user is mid-way through typing.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return;
    const id = window.setTimeout(() => {
      committed.current = draft;
      onCommit(draft.trim() ? draft : undefined);
    }, 300);
    return () => window.clearTimeout(id);
  }, [draft, onCommit]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        autoFocus={autoFocus}
        onChange={e => setDraft(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cn(FIELD, 'h-11 pl-9 pr-9 font-mono text-sm')}
      />
      {draft && (
        <button
          type="button"
          onClick={() => setDraft('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ================================================================== *
 * The panel
 * ================================================================== */

export interface CardFilterPanelProps {
  controller: CardFilterController;
  /** Hide the raw-Scryfall readout on very cramped surfaces. */
  showQuery?: boolean;
  /** Hide sort controls where the caller sorts results itself. */
  showSort?: boolean;
  autoFocusSearch?: boolean;
  className?: string;
}

export function CardFilterPanel({
  controller,
  showQuery = true,
  showSort = true,
  autoFocusSearch = false,
  className,
}: CardFilterPanelProps) {
  const { state, patch, query } = controller;
  const sets = useSetCatalog();
  const [copied, setCopied] = useState(false);
  const [setSearchOpen, setSetSearchOpen] = useState(false);
  const [setQuery, setSetQuery] = useState('');

  /** Selected sets always stay visible so they can be un-picked. */
  const visibleSets = useMemo(() => {
    const needle = setQuery.trim().toLowerCase();
    const selected = new Set(state.sets ?? []);
    const matches = needle
      ? sets.filter(
          s => s.name.toLowerCase().includes(needle) || s.code.includes(needle)
        )
      : sets;
    const pinned = sets.filter(s => selected.has(s.code) && !matches.includes(s));
    return [...pinned, ...matches].slice(0, 80);
  }, [sets, setQuery, state.sets]);

  const toggleIn = useCallback(<T,>(list: T[] | undefined, item: T): T[] | undefined => {
    const current = list ?? [];
    const next = current.includes(item)
      ? current.filter(x => x !== item)
      : [...current, item];
    return next.length ? next : undefined;
  }, []);

  const toggleIdentity = (color: ColorOption) => {
    const value = toggleIn(state.identity, color);
    patch({
      identity: value,
      identityMode: value ? (state.identityMode ?? 'atmost') : undefined,
    });
  };

  const toggleColor = (color: ColorOption) => {
    const value = toggleIn(state.colors?.value, color);
    patch({ colors: value ? { mode: state.colors?.mode ?? 'any', value } : undefined });
  };

  const cycleFormat = (format: Format) => {
    const current = state.legal ?? [];
    const existing = current.find(l => l.format === format);
    const nextState =
      LEGAL_CYCLE[(LEGAL_CYCLE.indexOf(existing?.state ?? null) + 1) % LEGAL_CYCLE.length];
    const without = current.filter(l => l.format !== format);
    const next = nextState ? [...without, { format, state: nextState }] : without;
    patch({ legal: next.length ? next : undefined });
  };

  const toggleExtra = (key: keyof NonNullable<CardSearchState['extras']>) => {
    const next = { ...(state.extras ?? {}) };
    if (next[key]) delete next[key];
    else next[key] = true;
    patch({ extras: Object.keys(next).length ? next : undefined });
  };

  const toggleSet = (code: string) => patch({ sets: toggleIn(state.sets, code.toLowerCase()) });

  const copyQuery = async () => {
    try {
      await navigator.clipboard.writeText(query);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the query is on screen anyway */
    }
  };

  const commitText = useCallback(
    (next: string | undefined) => patch({ text: next }),
    [patch]
  );
  const commitOracle = useCallback(
    (next: string | undefined) => patch({ oracle: next }),
    [patch]
  );

  const colorCount = (state.identity?.length ?? 0) + (state.colors?.value.length ?? 0);
  const typeCount =
    (state.types?.length ?? 0) +
    (state.supertypes?.length ?? 0) +
    (state.subtypes?.length ?? 0) +
    (state.rarities?.length ?? 0) +
    (state.oracle ? 1 : 0);
  const statCount = [state.mv, state.pow, state.tou, state.loy, state.price].filter(
    r => r && Object.keys(r).length
  ).length;
  const extrasCount =
    Object.values(state.extras ?? {}).filter(Boolean).length +
    (state.language ? 1 : 0) +
    (state.artist ? 1 : 0) +
    (state.game?.length ?? 0);

  return (
    <div className={cn('space-y-3', className)}>
      {/* ------------------------------ Search ----------------------------- */}
      <div className="space-y-2">
        <SearchField
          value={state.text ?? ''}
          onCommit={commitText}
          autoFocus={autoFocusSearch}
          placeholder='Card name, or Scryfall syntax — t:creature mv<=3 o:"draw a card"'
        />
        <p className="px-1 text-[0.7rem] leading-relaxed text-muted-foreground">
          Anything you type here is passed to Scryfall verbatim, so the full query
          language works alongside the controls below.
        </p>
      </div>

      {showQuery && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {query}
          </code>
          <button
            type="button"
            onClick={copyQuery}
            aria-label="Copy Scryfall query"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {/* ------------------------------- Sort ------------------------------ */}
      {showSort && (
        <div className="flex items-center gap-2">
          <Select
            value={state.order ?? 'name'}
            onValueChange={(v: string) => patch({ order: v as CardSearchState['order'] })}
          >
            <SelectTrigger className={cn(FIELD, 'flex-1')} aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-0">
              {SORT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={state.dir ?? 'asc'}
            onValueChange={(v: string) => patch({ dir: v as CardSearchState['dir'] })}
          >
            <SelectTrigger className={cn(FIELD, 'w-32')} aria-label="Sort direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-0">
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <ActiveFilterChips controller={controller} className="px-0.5" />

      {/* ------------------------------ Colors ----------------------------- */}
      <Section title="Colors" count={colorCount} defaultOpen>
        <div>
          <FieldLabel hint="id:">Color identity</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {IDENTITY_ORDER.map(color => (
              <ColorChip
                key={`id-${color}`}
                color={color}
                selected={state.identity?.includes(color)}
                onClick={() => toggleIdentity(color)}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDENTITY_MODES.map(mode => (
              <Chip
                key={mode.value}
                title={mode.hint}
                selected={(state.identityMode ?? 'atmost') === mode.value}
                onClick={() => patch({ identityMode: mode.value })}
                className="text-xs"
              >
                {mode.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel hint="c:">Card colors</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_ORDER.map(color => (
              <ColorChip
                key={`c-${color}`}
                color={color}
                selected={state.colors?.value.includes(color)}
                onClick={() => toggleColor(color)}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COLOR_MODES.map(mode => (
              <Chip
                key={mode.value}
                title={mode.hint}
                selected={(state.colors?.mode ?? 'any') === mode.value}
                onClick={() =>
                  patch({ colors: { mode: mode.value, value: state.colors?.value ?? [] } })
                }
                className="text-xs"
              >
                {mode.label}
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      {/* -------------------------- Types & rarity ------------------------- */}
      <Section title="Type & rarity" count={typeCount} defaultOpen>
        <div>
          <FieldLabel hint="t:">Card type</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {CARD_TYPES.map(type => (
              <Chip
                key={type}
                selected={state.types?.includes(type)}
                onClick={() => patch({ types: toggleIn(state.types, type) })}
                className="capitalize"
              >
                {type}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Supertype</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {SUPERTYPES.map(type => (
              <Chip
                key={type}
                selected={state.supertypes?.includes(type)}
                onClick={() => patch({ supertypes: toggleIn(state.supertypes, type) })}
                className="capitalize"
              >
                {type}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel hint="r:">Rarity</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RARITY_INFO) as Rarity[]).map(rarity => (
              <Chip
                key={rarity}
                selected={state.rarities?.includes(rarity)}
                onClick={() => patch({ rarities: toggleIn(state.rarities, rarity) })}
              >
                <span className="font-mono text-[0.7rem]">{RARITY_INFO[rarity].code}</span>
                {RARITY_INFO[rarity].name}
              </Chip>
            ))}
          </div>
        </div>

        <SubtypeField
          value={state.subtypes}
          onChange={next => patch({ subtypes: next })}
        />

        <div>
          <FieldLabel hint="o:">Rules text contains</FieldLabel>
          <SearchField
            value={state.oracle ?? ''}
            onCommit={commitOracle}
            placeholder="e.g. draw a card"
          />
        </div>
      </Section>

      {/* ------------------------------ Stats ------------------------------ */}
      <Section title="Mana, stats & price" count={statCount}>
        <RangeControl
          label="Mana value"
          hint="mv"
          value={state.mv}
          onChange={next => patch({ mv: next })}
          max={MV_MAX}
        />
        <RangeControl
          label="Power"
          hint="pow"
          value={state.pow}
          onChange={next => patch({ pow: next })}
          max={PT_MAX}
        />
        <RangeControl
          label="Toughness"
          hint="tou"
          value={state.tou}
          onChange={next => patch({ tou: next })}
          max={PT_MAX}
        />
        <RangeControl
          label="Price"
          hint="usd"
          value={state.price ? { min: state.price.usdMin, max: state.price.usdMax } : undefined}
          onChange={next =>
            patch({
              price: next ? { usdMin: next.min, usdMax: next.max } : undefined,
            })
          }
          max={PRICE_MAX}
          format={n => `$${n}`}
        />
      </Section>

      {/* ---------------------------- Legality ----------------------------- */}
      <Section title="Format legality" count={state.legal?.length}>
        <p className="text-[0.7rem] text-muted-foreground">
          Tap to cycle: legal → banned → restricted → off.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map(({ value, label }) => {
            const entry = state.legal?.find(l => l.format === value);
            return (
              <Chip
                key={value}
                selected={Boolean(entry)}
                onClick={() => cycleFormat(value)}
                title={entry ? `${label}: ${entry.state}` : `Filter by ${label} legality`}
              >
                {label}
                {entry && (
                  <span className="text-[0.6rem] uppercase tracking-wide opacity-70">
                    {entry.state}
                  </span>
                )}
              </Chip>
            );
          })}
        </div>
      </Section>

      {/* ------------------------------- Sets ------------------------------ */}
      <Section title="Sets" count={state.sets?.length}>
        <Popover open={setSearchOpen} onOpenChange={setSetSearchOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground',
                'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              {state.sets?.length
                ? `${state.sets.length} set${state.sets.length === 1 ? '' : 's'} selected`
                : sets.length
                  ? 'Search sets…'
                  : 'Loading sets…'}
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] border-0 p-0"
            align="start"
          >
            {/* Filtering is done here rather than by cmdk so only the visible
                slice of ~900 sets is ever mounted. */}
            <Command shouldFilter={false} className="bg-popover">
              <CommandInput
                placeholder="Search sets…"
                value={setQuery}
                onValueChange={setSetQuery}
              />
              <CommandList>
                <CommandEmpty>{sets.length ? 'No sets found.' : 'Loading sets…'}</CommandEmpty>
                <CommandGroup>
                  {visibleSets.map(s => {
                    const selected = state.sets?.includes(s.code);
                    return (
                      <CommandItem
                        key={s.code}
                        value={s.code}
                        onSelect={() => toggleSet(s.code)}
                        className="gap-2"
                      >
                        <Check
                          className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                        />
                        <span className="truncate">{s.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-[0.65rem] uppercase text-muted-foreground">
                          {s.code}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Section>

      {/* ------------------------------ Extras ----------------------------- */}
      <Section title="Printing & extras" count={extrasCount}>
        <div className="flex flex-wrap gap-1.5">
          {EXTRAS.map(({ key, label }) => (
            <Chip
              key={key}
              selected={Boolean(state.extras?.[key])}
              onClick={() => toggleExtra(key)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div>
          <FieldLabel hint="game:">Available on</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {(['paper', 'mtgo', 'arena'] as const).map(g => (
              <Chip
                key={g}
                selected={state.game?.includes(g)}
                onClick={() => patch({ game: toggleIn(state.game, g) })}
                className="capitalize"
              >
                {g}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel hint="lang:">Language</FieldLabel>
            <Select
              value={state.language ?? 'any'}
              onValueChange={(v: string) => patch({ language: v === 'any' ? undefined : v })}
            >
              <SelectTrigger className={FIELD}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-0">
                {LANGUAGES.map(l => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel hint="unique:">Show</FieldLabel>
            <Select
              value={state.unique ?? 'cards'}
              onValueChange={(v: string) => patch({ unique: v as CardSearchState['unique'] })}
            >
              <SelectTrigger className={FIELD}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-0">
                <SelectItem value="cards">One per card</SelectItem>
                <SelectItem value="prints">Every printing</SelectItem>
                <SelectItem value="art">Every artwork</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel hint="artist:">Artist</FieldLabel>
          <Input
            value={state.artist ?? ''}
            onChange={e => patch({ artist: e.target.value || undefined })}
            placeholder="e.g. Rebecca Guay"
            className={FIELD}
          />
        </div>
      </Section>
    </div>
  );
}

/** Free-text subtype entry — `t:` matches anywhere in the type line. */
function SubtypeField({
  value,
  onChange,
}: {
  value?: string[];
  onChange: (next: string[] | undefined) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const token = draft.trim().toLowerCase();
    if (!token) return;
    const next = Array.from(new Set([...(value ?? []), token]));
    onChange(next);
    setDraft('');
  };

  return (
    <div>
      <FieldLabel hint="t:">Type line contains</FieldLabel>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. elf, equipment, saga"
          className={FIELD}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={!draft.trim()}
          className="h-9 shrink-0"
        >
          Add
        </Button>
      </div>
      {!!value?.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map(t => (
            <Chip
              key={t}
              selected
              onClick={() => {
                const next = value.filter(x => x !== t);
                onChange(next.length ? next : undefined);
              }}
            >
              {t}
              <X className="h-3 w-3" />
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * Mobile / drawer presentation
 * ================================================================== */

export interface CardFilterSheetProps extends CardFilterPanelProps {
  /** Rendered in place of the default "Filters" button. */
  trigger?: ReactNode;
  side?: 'left' | 'right';
  triggerClassName?: string;
}

/**
 * The same panel in a Sheet. This is the mobile presentation, and the sensible
 * desktop one for surfaces where the results deserve the full width.
 */
export function CardFilterSheet({
  controller,
  trigger,
  side = 'right',
  triggerClassName,
  ...panelProps
}: CardFilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" className={cn('gap-2', triggerClassName)}>
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {controller.activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold leading-none text-primary-foreground">
                {controller.activeCount}
              </span>
            )}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side={side}
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-md"
      >
        {/* pr-12 clears the Sheet's own close button, which is absolutely placed. */}
        <div className="flex items-center justify-between py-3 pl-4 pr-12">
          <SheetTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filters
          </SheetTitle>
          {controller.activeCount > 0 && (
            <button
              type="button"
              onClick={controller.reset}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <CardFilterPanel controller={controller} {...panelProps} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CardFilterPanel;
