import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { rarityClass, rarityCode } from '@/lib/scryfall/card-utils';
import { Filter, X } from 'lucide-react';

/**
 * Client-side filter state for card lists that are already in memory
 * (a collection, a storage container, a deck list).
 *
 * Colours are uppercase WUBRG — the same vocabulary Scryfall and the database
 * use. They were previously lowercase here and compared with `includes()`
 * against uppercase card data, so selecting any colour matched nothing at all.
 */
export interface LocalCardFilters {
  colors: string[];
  types: string[];
  formats: string[];
  rarities: string[];
  cmc: [number, number];
  power: [number, number];
  toughness: [number, number];
  priceMin: number;
  priceMax: number;
}

export const EMPTY_LOCAL_FILTERS: LocalCardFilters = {
  colors: [],
  types: [],
  formats: [],
  rarities: [],
  cmc: [0, 20],
  power: [0, 20],
  toughness: [0, 20],
  priceMin: 0,
  priceMax: 0,
};

interface UniversalFilterPanelProps {
  filters: LocalCardFilters;
  onFiltersChange: (filters: LocalCardFilters) => void;
  onClearFilters: () => void;
  className?: string;
}

/** 'C' is the colorless predicate (`colors.length === 0`), not a real colour. */
const COLORS: { value: string; label: string }[] = [
  { value: 'W', label: 'White' },
  { value: 'U', label: 'Blue' },
  { value: 'B', label: 'Black' },
  { value: 'R', label: 'Red' },
  { value: 'G', label: 'Green' },
  { value: 'C', label: 'Colorless' },
];

const TYPES = [
  'creature', 'instant', 'sorcery', 'artifact',
  'enchantment', 'planeswalker', 'land', 'battle',
];

const FORMATS = [
  'standard', 'pioneer', 'modern', 'legacy',
  'vintage', 'commander', 'pauper', 'historic',
];

const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];

function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-foreground bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-accent',
        className
      )}
    >
      {children}
    </button>
  );
}

export function UniversalFilterPanel({
  filters,
  onFiltersChange,
  onClearFilters,
  className = '',
}: UniversalFilterPanelProps) {
  const update = <K extends keyof LocalCardFilters>(key: K, value: LocalCardFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const toggle = (key: 'colors' | 'types' | 'formats' | 'rarities', value: string) => {
    const current = filters[key];
    update(
      key,
      current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    );
  };

  const activeCount =
    filters.colors.length +
    filters.types.length +
    filters.formats.length +
    filters.rarities.length +
    (filters.cmc[0] > 0 || filters.cmc[1] < 20 ? 1 : 0) +
    (filters.power[0] > 0 || filters.power[1] < 20 ? 1 : 0) +
    (filters.toughness[0] > 0 || filters.toughness[1] < 20 ? 1 : 0) +
    (filters.priceMin > 0 ? 1 : 0) +
    (filters.priceMax > 0 ? 1 : 0);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">Filters</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeCount}
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Colors
          </Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(color => (
              <Chip
                key={color.value}
                selected={filters.colors.includes(color.value)}
                onClick={() => toggle('colors', color.value)}
              >
                <ManaPip symbol={color.value} size="xs" />
                {color.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Card types
          </Label>
          <div className="flex flex-wrap gap-2">
            {TYPES.map(type => (
              <Chip
                key={type}
                selected={filters.types.includes(type)}
                onClick={() => toggle('types', type)}
                className="capitalize"
              >
                {type}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Rarity
          </Label>
          <div className="flex flex-wrap gap-2">
            {RARITIES.map(rarity => (
              <Chip
                key={rarity}
                selected={filters.rarities.includes(rarity)}
                onClick={() => toggle('rarities', rarity)}
                className="capitalize"
              >
                <span
                  className={cn(
                    'font-mono text-[10px]',
                    filters.rarities.includes(rarity) ? '' : rarityClass(rarity)
                  )}
                >
                  {rarityCode(rarity)}
                </span>
                {rarity}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Legal in
          </Label>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map(format => (
              <Chip
                key={format}
                selected={filters.formats.includes(format)}
                onClick={() => toggle('formats', format)}
                className="capitalize"
              >
                {format}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Mana value: {filters.cmc[0]}–{filters.cmc[1]}
            </Label>
            <Slider
              value={filters.cmc}
              onValueChange={v => update('cmc', v as [number, number])}
              max={20}
              step={1}
            />
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Power: {filters.power[0]}–{filters.power[1]}
            </Label>
            <Slider
              value={filters.power}
              onValueChange={v => update('power', v as [number, number])}
              max={20}
              step={1}
            />
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Toughness: {filters.toughness[0]}–{filters.toughness[1]}
            </Label>
            <Slider
              value={filters.toughness}
              onValueChange={v => update('toughness', v as [number, number])}
              max={20}
              step={1}
            />
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Price (USD)
          </Label>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="local-price-min" className="text-xs text-muted-foreground">
                Min
              </Label>
              <Input
                id="local-price-min"
                type="number"
                min="0"
                step="0.01"
                placeholder="any"
                value={filters.priceMin || ''}
                onChange={e => update('priceMin', e.target.value ? parseFloat(e.target.value) : 0)}
                className="mt-1 h-9"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="local-price-max" className="text-xs text-muted-foreground">
                Max
              </Label>
              <Input
                id="local-price-max"
                type="number"
                min="0"
                step="0.01"
                placeholder="any"
                value={filters.priceMax || ''}
                onChange={e => update('priceMax', e.target.value ? parseFloat(e.target.value) : 0)}
                className="mt-1 h-9"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
