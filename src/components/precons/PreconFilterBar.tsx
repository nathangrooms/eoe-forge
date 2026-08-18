import { Grid2x2, Grid3x3, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

/** Matches the field skin the shared card filters use — no borders, muted ground. */
const FIELD =
  'h-9 border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0';

export type PreconSort = 'newest' | 'oldest' | 'name' | 'set';

export const PRECON_SORTS: { value: PreconSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'set', label: 'By set' },
];

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/**
 * Tile density.
 *
 * At `large` the catalogue is two tiles across on a 1440px screen, so browsing
 * 184 precons is sixty-odd screens of dragging. `compact` puts four across —
 * the artwork is still whole and the commander's card is still a card, just
 * smaller — which is roughly a quarter of the scroll for the same content.
 */
export type PreconDensity = 'large' | 'compact';

export interface PreconFilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  colors: string[];
  /**
   * Toggles one colour. Deliberately not `onColorsChange(next: string[])`:
   * computing `next` here closes over the `colors` prop, so two pips clicked in
   * the same frame both compute from the pre-click value and the second one
   * silently discards the first.
   */
  onToggleColor: (color: string) => void;
  set: string;
  sets: Array<{ name: string; count: number }>;
  onSetChange: (set: string) => void;
  sort: PreconSort;
  onSortChange: (sort: PreconSort) => void;
  activeCount: number;
  onReset: () => void;
  density: PreconDensity;
  onDensityChange: (density: PreconDensity) => void;
}

export function PreconFilterBar({
  query,
  onQueryChange,
  colors,
  onToggleColor,
  set,
  sets,
  onSetChange,
  sort,
  onSortChange,
  activeCount,
  onReset,
  density,
  onDensityChange,
}: PreconFilterBarProps) {
  return (
    <div className="rounded-xl bg-card p-3 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search precons, commanders or sets…"
            aria-label="Search precons"
            className={cn(FIELD, 'pl-9')}
          />
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5"
          role="group"
          aria-label="Filter by commander colour identity"
        >
          {WUBRG.map(color => {
            const on = colors.includes(color);
            return (
              <button
                key={color}
                type="button"
                onClick={() => onToggleColor(color)}
                aria-pressed={on}
                aria-label={`Colour ${color}`}
                className={cn(
                  'rounded-full p-1 transition-all duration-150 motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on
                    ? 'bg-muted'
                    : 'opacity-40 hover:opacity-90 hover:bg-muted/50'
                )}
              >
                <ManaPip symbol={color} size="sm" />
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 gap-2">
          <Select value={set} onValueChange={onSetChange}>
            <SelectTrigger className={cn(FIELD, 'w-full min-w-[9rem] lg:w-44')} aria-label="Filter by set">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-0">
              <SelectItem value="all">All sets</SelectItem>
              {sets.map(s => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={value => onSortChange(value as PreconSort)}>
            <SelectTrigger className={cn(FIELD, 'w-full min-w-[8rem] lg:w-40')} aria-label="Sort precons">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-0">
              {PRECON_SORTS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Selected inverts — `secondary` sits one lightness step from
              `muted` and the pressed state was invisible against it. */}
          <div
            className="flex shrink-0 items-center rounded-md bg-muted p-0.5"
            role="group"
            aria-label="Tile density"
          >
            <Button
              variant={density === 'large' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              aria-pressed={density === 'large'}
              aria-label="Large tiles"
              title="Large tiles — two across"
              onClick={() => onDensityChange('large')}
            >
              <Grid2x2 className="h-4 w-4" />
            </Button>
            <Button
              variant={density === 'compact' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              aria-pressed={density === 'compact'}
              aria-label="Compact tiles"
              title="Compact tiles — four across"
              onClick={() => onDensityChange('compact')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="shrink-0 text-muted-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {colors.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing precons whose commander identity includes{' '}
          {colors.length === 1 ? 'this colour' : 'all of these colours'}.
        </p>
      )}
    </div>
  );
}

export default PreconFilterBar;
