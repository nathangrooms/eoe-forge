import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import {
  CardSearchState,
  ColorOption,
  Rarity,
  Format,
  LegalState,
  COLOR_SYMBOLS,
  COLOR_ORDER,
  IDENTITY_ORDER,
  RARITY_INFO,
  buildScryfallQuery,
} from '@/lib/scryfall/query-builder';
import { Check, Copy, X } from 'lucide-react';

interface AdvancedFilterPanelProps {
  searchState: CardSearchState;
  onStateChange: (state: CardSearchState) => void;
  className?: string;
}

const CARD_TYPES = [
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment',
  'planeswalker', 'land', 'battle', 'kindred',
];

const SUPERTYPES = ['legendary', 'basic', 'snow', 'world'];

const FORMATS: Format[] = [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage',
  'commander', 'oathbreaker', 'pauper', 'brawl', 'historic', 'timeless', 'alchemy',
];

const GAMES: ('paper' | 'mtgo' | 'arena')[] = ['paper', 'mtgo', 'arena'];

const EXTRAS: { key: keyof NonNullable<CardSearchState['extras']>; label: string }[] = [
  { key: 'foil', label: 'Foil available' },
  { key: 'nonfoil', label: 'Non-foil available' },
  { key: 'showcase', label: 'Showcase frame' },
  { key: 'reprint', label: 'Reprints' },
  { key: 'reserved', label: 'Reserved list' },
  { key: 'promo', label: 'Promotional' },
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

/** Legal → Banned → Restricted → off. Scryfall's own four states. */
const LEGAL_CYCLE: (LegalState | null)[] = ['legal', 'banned', 'restricted', null];

const LEGAL_LABEL: Record<LegalState, string> = {
  legal: 'legal',
  banned: 'banned',
  restricted: 'restricted',
};

interface ScryfallSet {
  code: string;
  name: string;
  released_at?: string;
}

/** Scryfall's set catalog, fetched once and shared by every mounted panel. */
let setCatalogCache: ScryfallSet[] | null = null;

function useSetCatalog() {
  const [sets, setSets] = useState<ScryfallSet[]>(setCatalogCache ?? []);

  useEffect(() => {
    if (setCatalogCache) return;
    let cancelled = false;
    fetch('https://api.scryfall.com/sets')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.data) return;
        const list: ScryfallSet[] = data.data
          .filter((s: any) => !s.digital && s.card_count > 0)
          .map((s: any) => ({ code: s.code, name: s.name, released_at: s.released_at }));
        setCatalogCache = list;
        setSets(list);
      })
      .catch(() => {
        /* the set picker degrades to "unavailable"; the rest of the panel works */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return sets;
}

/** A flat, monochrome selectable chip. Selection reads as filled ink. */
function Chip({
  selected,
  onClick,
  children,
  className,
  title,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
        // Selection is a filled surface, not an outlined one — a wall of
        // outlined chips is a wall of hairlines.
        selected
          ? 'bg-primary text-primary-foreground shadow-sm shadow-black/20'
          : 'bg-muted/60 text-foreground hover:bg-muted',
        className
      )}
    >
      {children}
    </button>
  );
}

/** Optional numeric bound. Empty means "no bound", so a range can be unset. */
function NumberBound({
  id,
  label,
  value,
  onChange,
  min = 0,
}: {
  id: string;
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  min?: number;
}) {
  return (
    <div className="flex-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        inputMode="numeric"
        value={value ?? ''}
        placeholder="any"
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="mt-1 h-9"
      />
    </div>
  );
}

export function AdvancedFilterPanel({
  searchState,
  onStateChange,
  className = '',
}: AdvancedFilterPanelProps) {
  const [activeTab, setActiveTab] = useState('colors');
  const [copied, setCopied] = useState(false);
  const sets = useSetCatalog();

  const update = <K extends keyof CardSearchState>(key: K, value: CardSearchState[K]) =>
    onStateChange({ ...searchState, [key]: value });

  const toggleArrayItem = <T,>(array: T[] | undefined, item: T, key: keyof CardSearchState) => {
    const current = array || [];
    const next = current.includes(item) ? current.filter(i => i !== item) : [...current, item];
    update(key, (next.length ? next : undefined) as any);
  };

  const { q } = useMemo(() => buildScryfallQuery(searchState), [searchState]);

  const copyQuery = async () => {
    try {
      await navigator.clipboard.writeText(q);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the query is visible above anyway */
    }
  };

  const toggleColor = (color: ColorOption) => {
    const current = searchState.colors ?? { mode: 'any' as const, value: [] };
    const value = current.value.includes(color)
      ? current.value.filter(c => c !== color)
      : [...current.value, color];
    update('colors', value.length ? { ...current, value } : undefined);
  };

  const cycleFormat = (format: Format) => {
    const current = searchState.legal ?? [];
    const existing = current.find(l => l.format === format);
    const nextState = LEGAL_CYCLE[
      (LEGAL_CYCLE.indexOf(existing?.state ?? null) + 1) % LEGAL_CYCLE.length
    ];
    const without = current.filter(l => l.format !== format);
    const next = nextState ? [...without, { format, state: nextState }] : without;
    update('legal', next.length ? next : undefined);
  };

  const selectedSets = searchState.sets ?? [];

  return (
    <Card className={className}>
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Scryfall query
            </Label>
            <code className="mt-1 block truncate rounded bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
              {q}
            </code>
          </div>
          <Button variant="outline" size="sm" onClick={copyQuery} className="mt-5 shrink-0 gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
            <TabsTrigger value="colors" className="px-2 py-1.5 text-xs">Colors</TabsTrigger>
            <TabsTrigger value="types" className="px-2 py-1.5 text-xs">Types</TabsTrigger>
            <TabsTrigger value="stats" className="px-2 py-1.5 text-xs">Stats</TabsTrigger>
            <TabsTrigger value="formats" className="px-2 py-1.5 text-xs">Formats</TabsTrigger>
            <TabsTrigger value="sets" className="px-2 py-1.5 text-xs">Sets</TabsTrigger>
            <TabsTrigger value="extras" className="px-2 py-1.5 text-xs">Extras</TabsTrigger>
          </TabsList>

          {/* --------------------------- Colors --------------------------- */}
          <TabsContent value="colors" className="mt-4 space-y-6">
            {/* Commander is the dominant format, so identity comes first. */}
            <div>
              <Label className="mb-1 block text-sm font-medium">Color identity</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                <code className="font-mono">id:</code> is what a Commander deck may contain.
              </p>
              <div className="flex flex-wrap gap-2">
                {IDENTITY_ORDER.map(color => (
                  <Chip
                    key={`id-${color}`}
                    selected={searchState.identity?.includes(color)}
                    onClick={() => toggleArrayItem(searchState.identity, color, 'identity')}
                  >
                    <ManaPip symbol={color === 'C' ? 'C' : color} size="xs" />
                    {COLOR_SYMBOLS[color].name}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-sm font-medium">Colors</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                <code className="font-mono">c:</code> is the colors printed on the card itself.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {COLOR_ORDER.map(color => (
                  <Chip
                    key={color}
                    selected={searchState.colors?.value.includes(color)}
                    onClick={() => toggleColor(color)}
                  >
                    {color === 'M' ? (
                      <span className="font-mono text-xs">M</span>
                    ) : (
                      <ManaPip symbol={color} size="xs" />
                    )}
                    {COLOR_SYMBOLS[color].name}
                  </Chip>
                ))}
              </div>

              <Label htmlFor="color-mode" className="text-xs text-muted-foreground">
                Match mode
              </Label>
              <Select
                value={searchState.colors?.mode || 'any'}
                onValueChange={(mode: 'any' | 'exact' | 'atleast') =>
                  update('colors', { mode, value: searchState.colors?.value ?? [] })
                }
              >
                <SelectTrigger id="color-mode" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Includes any of these (c:)</SelectItem>
                  <SelectItem value="exact">Exactly these colors (c=)</SelectItem>
                  <SelectItem value="atleast">At least these colors (c&gt;=)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* --------------------------- Types ---------------------------- */}
          <TabsContent value="types" className="mt-4 space-y-6">
            <div>
              <Label className="mb-2 block text-sm font-medium">Card types</Label>
              <div className="flex flex-wrap gap-2">
                {CARD_TYPES.map(type => (
                  <Chip
                    key={type}
                    selected={searchState.types?.includes(type)}
                    onClick={() => toggleArrayItem(searchState.types, type, 'types')}
                    className="capitalize"
                  >
                    {type}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Supertypes</Label>
              <div className="flex flex-wrap gap-2">
                {SUPERTYPES.map(type => (
                  <Chip
                    key={type}
                    selected={searchState.supertypes?.includes(type)}
                    onClick={() => toggleArrayItem(searchState.supertypes, type, 'supertypes')}
                    className="capitalize"
                  >
                    {type}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Rarity</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RARITY_INFO) as Rarity[]).map(rarity => (
                  <Chip
                    key={rarity}
                    selected={searchState.rarities?.includes(rarity)}
                    onClick={() => toggleArrayItem(searchState.rarities, rarity, 'rarities')}
                  >
                    <span className="font-mono text-xs">{RARITY_INFO[rarity].code}</span>
                    {RARITY_INFO[rarity].name}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="oracle-text" className="mb-1 block text-sm font-medium">
                Oracle text contains
              </Label>
              <Input
                id="oracle-text"
                value={searchState.oracle || ''}
                onChange={e => update('oracle', e.target.value || undefined)}
                placeholder="e.g. draw a card"
              />
            </div>
          </TabsContent>

          {/* --------------------------- Stats ---------------------------- */}
          <TabsContent value="stats" className="mt-4 space-y-5">
            <div>
              <Label className="mb-2 block text-sm font-medium">Mana value</Label>
              <div className="flex gap-3">
                <NumberBound
                  id="mv-min"
                  label="Min"
                  value={searchState.mv?.min}
                  onChange={v => update('mv', { ...searchState.mv, min: v })}
                />
                <NumberBound
                  id="mv-max"
                  label="Max"
                  value={searchState.mv?.max}
                  onChange={v => update('mv', { ...searchState.mv, max: v })}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Power</Label>
              <div className="flex gap-3">
                <NumberBound
                  id="pow-min"
                  label="Min"
                  value={searchState.pow?.min}
                  onChange={v => update('pow', { ...searchState.pow, min: v })}
                />
                <NumberBound
                  id="pow-max"
                  label="Max"
                  value={searchState.pow?.max}
                  onChange={v => update('pow', { ...searchState.pow, max: v })}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Toughness</Label>
              <div className="flex gap-3">
                <NumberBound
                  id="tou-min"
                  label="Min"
                  value={searchState.tou?.min}
                  onChange={v => update('tou', { ...searchState.tou, min: v })}
                />
                <NumberBound
                  id="tou-max"
                  label="Max"
                  value={searchState.tou?.max}
                  onChange={v => update('tou', { ...searchState.tou, max: v })}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Price (USD)</Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="price-min" className="text-xs text-muted-foreground">Min</Label>
                  <Input
                    id="price-min"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="any"
                    value={searchState.price?.usdMin ?? ''}
                    onChange={e =>
                      update('price', {
                        ...searchState.price,
                        usdMin: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="price-max" className="text-xs text-muted-foreground">Max</Label>
                  <Input
                    id="price-max"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="any"
                    value={searchState.price?.usdMax ?? ''}
                    onChange={e =>
                      update('price', {
                        ...searchState.price,
                        usdMax: e.target.value === '' ? undefined : parseFloat(e.target.value),
                      })
                    }
                    className="mt-1 h-9"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* -------------------------- Formats --------------------------- */}
          <TabsContent value="formats" className="mt-4 space-y-6">
            <div>
              <Label className="mb-1 block text-sm font-medium">Format status</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Click a format to cycle legal → banned → restricted → off.
              </p>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(format => {
                  const entry = searchState.legal?.find(l => l.format === format);
                  return (
                    <Chip
                      key={format}
                      selected={Boolean(entry)}
                      onClick={() => cycleFormat(format)}
                      className="capitalize"
                    >
                      {format}
                      {entry && (
                        <span className="font-mono text-[10px] uppercase opacity-80">
                          {LEGAL_LABEL[entry.state]}
                        </span>
                      )}
                    </Chip>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">Available on</Label>
              <div className="flex flex-wrap gap-2">
                {GAMES.map(game => (
                  <Chip
                    key={game}
                    selected={searchState.game?.includes(game)}
                    onClick={() => toggleArrayItem(searchState.game, game, 'game')}
                    className="uppercase"
                  >
                    {game}
                  </Chip>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ---------------------------- Sets ---------------------------- */}
          <TabsContent value="sets" className="mt-4 space-y-3">
            <Label className="block text-sm font-medium">Sets</Label>

            {selectedSets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedSets.map(code => {
                  const meta = sets.find(s => s.code === code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() =>
                        update(
                          'sets',
                          selectedSets.filter(c => c !== code).length
                            ? selectedSets.filter(c => c !== code)
                            : undefined
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
                    >
                      <span className="font-mono uppercase">{code}</span>
                      {meta && <span className="max-w-[160px] truncate">{meta.name}</span>}
                      <X className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            )}

            {sets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Set list unavailable. Scryfall’s set catalog could not be loaded.
              </p>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    Add a set…
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[320px] p-0">
                  <Command>
                    <CommandInput placeholder="Search sets…" />
                    <CommandList>
                      <CommandEmpty>No sets found.</CommandEmpty>
                      <CommandGroup>
                        {sets.map(set => (
                          <CommandItem
                            key={set.code}
                            value={`${set.name} ${set.code}`}
                            onSelect={() => {
                              if (selectedSets.includes(set.code)) return;
                              update('sets', [...selectedSets, set.code]);
                            }}
                          >
                            <span className="mr-2 w-12 shrink-0 font-mono text-xs uppercase text-muted-foreground">
                              {set.code}
                            </span>
                            <span className="truncate">{set.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </TabsContent>

          {/* --------------------------- Extras --------------------------- */}
          <TabsContent value="extras" className="mt-4 space-y-5">
            <div className="grid grid-cols-2 gap-2">
              {EXTRAS.map(({ key, label }) => (
                <Chip
                  key={key}
                  selected={Boolean(searchState.extras?.[key])}
                  onClick={() => {
                    const next = { ...searchState.extras, [key]: !searchState.extras?.[key] };
                    const anySet = Object.values(next).some(Boolean);
                    update('extras', anySet ? next : undefined);
                  }}
                  className="justify-center"
                >
                  {label}
                </Chip>
              ))}
            </div>

            <div>
              <Label htmlFor="artist" className="mb-1 block text-sm font-medium">Artist</Label>
              <Input
                id="artist"
                value={searchState.artist || ''}
                onChange={e => update('artist', e.target.value || undefined)}
                placeholder="e.g. Seb McKinnon"
              />
            </div>

            <div>
              <Label htmlFor="language" className="mb-1 block text-sm font-medium">Language</Label>
              <Select
                value={searchState.language || 'any'}
                onValueChange={value => update('language', value === 'any' ? undefined : value)}
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
