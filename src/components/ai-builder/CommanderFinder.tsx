import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManaPip } from '@/components/ui/mana-cost';
import { ChevronDown, Search, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CMC_RANGES,
  MANA_COLORS,
  PLAYSTYLES,
  SORT_OPTIONS,
  TRIBAL_TYPES,
  countActiveFilters,
  type CommanderFilters,
} from './commander-query';

/**
 * The commander finder, on the page.
 *
 * It has lived in three places. First as a bordered card wedged under the
 * popular-commanders grid, rendering its *own* five-across results grid inside
 * itself — so the widest, most visual thing on the screen was trapped in a box
 * a third of the width. Then as a right-hand slide-out, which fixed the width
 * but hid the filters behind a button and left the first step of the flow
 * looking like an undifferentiated wall of cards.
 *
 * The owner's verdict on that second move: *"worked better when commander
 * finder was actually on the screen not a right menu."* So it is a rail beside
 * the results now — visible without a click, on the one screen whose entire
 * job is choosing a commander. Design law 3 reserves the slide-out for actions
 * taken *without leaving the current context*; picking the commander is not an
 * aside here, it is the step.
 *
 * Every filter is still here — six colour identities, twelve playstyles, three
 * mana-value bands, twenty-four creature types, the pairable predicate and four
 * sort orders. The query itself lives in `./commander-query`, so the page runs
 * and paginates the search and the results render full width beside this.
 */

export interface CommanderFinderProps {
  filters: CommanderFilters;
  onFiltersChange: (filters: CommanderFilters) => void;
  sortOrder: string;
  onSortOrderChange: (order: string) => void;
  /** Runs the search against the current filters. */
  onSearch: () => void;
  onClear: () => void;
  searching?: boolean;
  /** Result count from the last run, so the panel can report what it found. */
  resultCount?: number | null;
  className?: string;
}

/** One filter block: a label and its controls, separated by space not a rule. */
function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <Label className="mb-0.5 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      {hint && <p className="mb-2.5 text-xs text-muted-foreground/80">{hint}</p>}
      <div className={hint ? '' : 'mt-2.5'}>{children}</div>
    </div>
  );
}

/** Borderless toggle chip — surface tint carries the state, never a hairline. */
function Chip({
  active,
  onClick,
  className,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-foreground text-background'
          : 'bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

export function CommanderFinder({
  filters,
  onFiltersChange,
  sortOrder,
  onSortOrderChange,
  onSearch,
  onClear,
  searching = false,
  resultCount = null,
  className,
}: CommanderFinderProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const active = countActiveFilters(filters);

  const patch = (next: Partial<CommanderFilters>) => onFiltersChange({ ...filters, ...next });

  const toggleColor = (color: string) =>
    patch({
      colors: filters.colors.includes(color)
        ? filters.colors.filter(c => c !== color)
        : [...filters.colors, color],
    });

  const togglePlaystyle = (value: string) =>
    patch({
      playstyles: filters.playstyles.includes(value)
        ? filters.playstyles.filter(p => p !== value)
        : [...filters.playstyles, value],
    });

  return (
    /* ONE ROW, NOT A PANEL.

       As a sidebar this was 19rem of chips beside two visible commanders. Moved
       to the top unchanged it was worse: twelve playstyle chips across the full
       width push the cards below the fold, which is the opposite of the point.
       Owner: "Takes up way too much space, especially playstyle", then "sort and
       find take up so much space as well, should be right top option maybe?"

       So the colours are pips, because they are six things you scan rather than
       read; playstyle sits behind a control that says how many are on; and sort
       and the search sit at the right end of the same row. The wall of
       commanders is what this page is for. Narrowing it should cost one row. */
    <section
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl bg-card p-2.5 shadow-lg shadow-black/20',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        {MANA_COLORS.map(({ color, name }) => (
          <Chip
            key={color}
            active={filters.colors.includes(color)}
            onClick={() => toggleColor(color)}
            title={name + '. Commanders you could legally build inside these colours.'}
            className="inline-flex h-9 items-center px-2.5"
          >
            <ManaPip symbol={color} size="xs" />
          </Chip>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" className="h-9 gap-1.5">
            Playstyle
            {filters.playstyles.length > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {filters.playstyles.length}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="mb-2 text-xs text-muted-foreground">
            Matched against the commander&rsquo;s own rules text.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {PLAYSTYLES.map(({ value, label, description }) => (
              <Chip
                key={value}
                active={filters.playstyles.includes(value)}
                onClick={() => togglePlaystyle(value)}
                title={description}
                className="text-center"
              >
                {label}
              </Chip>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {showAdvanced ? 'Fewer filters' : 'More filters'}
      </button>

      {showAdvanced && (
        <div className="flex w-full flex-wrap gap-2">
          <Section label="Commander mana value">
            <div className="flex flex-wrap gap-1.5">
              {CMC_RANGES.map(({ value, label, description }) => (
                <Chip
                  key={value}
                  active={filters.cmcRange === value}
                  onClick={() => patch({ cmcRange: filters.cmcRange === value ? null : value })}
                  title={description}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section label="Creature type">
            <div className="flex flex-wrap gap-1.5">
              {TRIBAL_TYPES.map(tribe => (
                <Chip
                  key={tribe}
                  active={filters.tribal === tribe}
                  onClick={() => patch({ tribal: filters.tribal === tribe ? null : tribe })}
                >
                  {tribe}
                </Chip>
              ))}
            </div>
          </Section>

          <Section
            label="Pairings"
            hint="Partner, Friends forever, Doctor's companion and Backgrounds."
          >
            <Chip
              active={filters.pairable}
              onClick={() => patch({ pairable: !filters.pairable })}
              className="inline-flex items-center gap-1.5"
            >
              <Users className="h-3.5 w-3.5" />
              Pairable commanders only
            </Chip>
          </Section>
        </div>
      )}

      {/* Sort and the search itself, at the right end of the same row. */}
      <div className="ml-auto flex items-center gap-2">
        {resultCount !== null && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {resultCount.toLocaleString()} matched
          </span>
        )}
        <Select value={sortOrder} onValueChange={onSortOrderChange}>
          <SelectTrigger id="commander-sort" className="h-9 w-[10.5rem] border-0 bg-background/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active > 0 && (
          <Button variant="ghost" className="h-9" onClick={onClear}>
            Clear
          </Button>
        )}
        <Button className="h-9" onClick={onSearch} disabled={searching}>
          <Search className="mr-2 h-4 w-4" />
          {searching ? 'Searching' : 'Find'}
        </Button>
      </div>
    </section>
  );
}

export default CommanderFinder;
