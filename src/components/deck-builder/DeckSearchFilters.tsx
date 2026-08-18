import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaPip } from '@/components/ui/mana-cost';
import { DECK_FORMATS } from '@/lib/deck/formats';
import {
  COLOR_MATCH_LABELS,
  type ColorMatchMode,
  type DeckFilters,
} from '@/hooks/useDeckFilters';

interface DeckSearchFiltersProps {
  filters: DeckFilters;
  onUpdateFilters: (filters: Partial<DeckFilters>) => void;
  onResetFilters: () => void;
  onToggleFormat: (format: string) => void;
  onToggleColor: (color: string) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

/** W/U/B/R/G plus colourless, drawn as real mana pips. */
const COLOR_OPTIONS = [
  { value: 'W', label: 'White' },
  { value: 'U', label: 'Blue' },
  { value: 'B', label: 'Black' },
  { value: 'R', label: 'Red' },
  { value: 'G', label: 'Green' },
  { value: 'C', label: 'Colourless' },
];

export const DeckSearchFilters = ({
  filters,
  onUpdateFilters,
  onResetFilters,
  onToggleFormat,
  onToggleColor,
  hasActiveFilters,
  activeFilterCount,
}: DeckSearchFiltersProps) => {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {/* Borderless, muted ground — the field skin every other card surface
            uses (`PreconFilterBar`, the commander wall). The shared `Input`
            default carries `border-input`, which at rgb(41,42,46) on a
            rgb(9,10,11) page is a plainly visible hairline: the one thing the
            owner has ruled out outright. */}
        <Input
          placeholder="Search decks…"
          value={filters.searchQuery}
          onChange={e => onUpdateFilters({ searchQuery: e.target.value })}
          className="border-0 bg-muted/50 pl-10 shadow-none focus-visible:ring-1 focus-visible:ring-offset-0"
          aria-label="Search decks by name"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          {/* `outline` is literally a border variant. */}
          <Button variant="secondary" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 tabular-nums">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 border-0 shadow-xl shadow-black/40" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Filters</h4>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={onResetFilters} className="h-8 px-2">
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <div className="flex flex-wrap gap-1.5">
                {DECK_FORMATS.map(format => (
                  <Badge
                    key={format.value}
                    variant={filters.format.includes(format.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    role="checkbox"
                    aria-checked={filters.format.includes(format.value)}
                    tabIndex={0}
                    onClick={() => onToggleFormat(format.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleFormat(format.value);
                      }
                    }}
                  >
                    {format.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Colour identity</Label>
              </div>
              <Select
                value={filters.colorMode}
                onValueChange={value => onUpdateFilters({ colorMode: value as ColorMatchMode })}
              >
                <SelectTrigger className="h-8" aria-label="Colour match mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COLOR_MATCH_LABELS) as ColorMatchMode[]).map(mode => (
                    <SelectItem key={mode} value={mode}>
                      {COLOR_MATCH_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map(color => {
                  const selected = filters.colors.includes(color.value);
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => onToggleColor(color.value)}
                      aria-pressed={selected}
                      aria-label={color.label}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors',
                        selected
                          ? 'border-foreground bg-secondary text-secondary-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <ManaPip symbol={color.value} size="xs" />
                      {color.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Power level</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {filters.minPower} – {filters.maxPower}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Decks without a computed power score are always shown.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Min: {filters.minPower}</Label>
                  <Slider
                    value={[filters.minPower]}
                    onValueChange={([value]) =>
                      onUpdateFilters({ minPower: Math.min(value, filters.maxPower) })
                    }
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max: {filters.maxPower}</Label>
                  <Slider
                    value={[filters.maxPower]}
                    onValueChange={([value]) =>
                      onUpdateFilters({ maxPower: Math.max(value, filters.minPower) })
                    }
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
