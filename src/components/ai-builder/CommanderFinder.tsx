import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManaPip } from '@/components/ui/mana-cost';
import { Search, Users } from 'lucide-react';
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
 * The commander finder, as a right-hand slide-out.
 *
 * It used to be a bordered card wedged under the popular-commanders grid, and
 * it rendered its *own* five-across results grid inside itself — so the widest,
 * most visual thing on the page was trapped in a box about a third of the
 * screen. Design law item 3: a choice made without leaving the current context
 * is a right-hand panel. The filters live here; the commanders they find render
 * full width on the page behind it.
 *
 * Every filter from the original is here — six colour identities, twelve
 * playstyles, three mana-value bands, twenty-four creature types, the pairable
 * predicate and four sort orders. The query itself moved to
 * `./commander-query` so the page can run and paginate the search.
 */

export interface CommanderFinderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  sortOrder,
  onSortOrderChange,
  onSearch,
  onClear,
  searching = false,
  resultCount = null,
}: CommanderFinderProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const active = countActiveFilters(filters);

  const patch = (next: Partial<CommanderFilters>) =>
    onFiltersChange({ ...filters, ...next });

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-md"
      >
        {/* pr-12 clears the Sheet's own absolutely-placed close button. */}
        <div className="flex items-center gap-2 py-3 pl-4 pr-12">
          <SheetTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Commander finder
          </SheetTitle>
          {active > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {active}
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 px-4 pb-6">
            <Section
              label="Colour identity"
              hint="Commanders you could legally build inside these colours."
            >
              <div className="flex flex-wrap gap-1.5">
                {MANA_COLORS.map(({ color, name }) => (
                  <Chip
                    key={color}
                    active={filters.colors.includes(color)}
                    onClick={() => toggleColor(color)}
                    className="inline-flex items-center gap-1.5"
                  >
                    <ManaPip symbol={color} size="xs" />
                    {name}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section label="Playstyle" hint="Matched against the commander's own rules text.">
              <div className="grid grid-cols-3 gap-1.5">
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
            </Section>

            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAdvanced ? 'Hide advanced filters' : 'Show advanced filters'}
            </button>

            {showAdvanced && (
              <>
                <Section label="Commander mana value">
                  <div className="flex flex-wrap gap-1.5">
                    {CMC_RANGES.map(({ value, label, description }) => (
                      <Chip
                        key={value}
                        active={filters.cmcRange === value}
                        onClick={() =>
                          patch({ cmcRange: filters.cmcRange === value ? null : value })
                        }
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
              </>
            )}

            <Section label="Sort">
              <Select value={sortOrder} onValueChange={onSortOrderChange}>
                <SelectTrigger id="commander-sort" className="h-9 border-0 bg-background/60">
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
            </Section>

            {resultCount !== null && (
              <p className="px-1 text-xs text-muted-foreground">
                Last search matched {resultCount.toLocaleString()} commander
                {resultCount === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 bg-muted/40 p-3">
          <Button onClick={onSearch} disabled={searching} className="flex-1">
            <Search className="mr-2 h-4 w-4" />
            {searching ? 'Searching…' : 'Find commanders'}
          </Button>
          {active > 0 && (
            <Button variant="ghost" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CommanderFinder;
