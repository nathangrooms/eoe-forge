import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import {
  CARD_TYPES,
  CMC_MAX,
  COLOR_LABEL,
  COLOR_MODE_LABEL,
  CONDITIONS,
  FORMATS,
  RARITIES,
  TYPE_TOKEN,
  WUBRG,
  type CollectionFilterState,
  type ColorMatchMode,
  type ManaColor,
} from './types';

interface CollectionFilterPanelProps {
  filters: CollectionFilterState;
  onChange: (next: CollectionFilterState) => void;
  onClear: () => void;
  /** Set codes present in the current data, so the set filter is never empty. */
  availableSets: string[];
  /** Storage containers have no condition data — hide those controls. */
  showOwnershipFilters?: boolean;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

export function CollectionFilterPanel({
  filters,
  onChange,
  onClear,
  availableSets,
  showOwnershipFilters = true,
}: CollectionFilterPanelProps) {
  const set = (patch: Partial<CollectionFilterState>) => onChange({ ...filters, ...patch });

  const colorModes: ColorMatchMode[] = ['any', 'all', 'exactly', 'identity'];

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-card-foreground">Filters</h3>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear all
        </Button>
      </div>

      <Section title="Colour">
        <div className="flex flex-wrap items-center gap-1.5">
          {WUBRG.map((c: ManaColor) => {
            const active = filters.colors.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                aria-label={COLOR_LABEL[c]}
                onClick={() => set({ colors: toggle(filters.colors, c) })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-foreground bg-accent text-accent-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <ManaPip symbol={c} size="xs" />
                {COLOR_LABEL[c]}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={filters.colorless}
            onClick={() => set({ colorless: !filters.colorless })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
              filters.colorless
                ? 'border-foreground bg-accent text-accent-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <ManaPip symbol="C" size="xs" />
            Colourless
          </button>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {colorModes.map(mode => (
            <Button
              key={mode}
              size="sm"
              variant={filters.colorMode === mode ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => set({ colorMode: mode })}
            >
              {COLOR_MODE_LABEL[mode]}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Card type">
        <div className="flex flex-wrap gap-1.5">
          {CARD_TYPES.map(t => {
            const active = filters.types.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => set({ types: toggle(filters.types, t) })}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-foreground bg-accent text-accent-foreground'
                    : 'border-border bg-background hover:bg-accent hover:text-accent-foreground',
                  !active && TYPE_TOKEN[t]
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Rarity">
        <div className="flex flex-wrap gap-1.5">
          {RARITIES.map(r => {
            const active = filters.rarities.includes(r);
            return (
              <button
                key={r}
                type="button"
                aria-pressed={active}
                onClick={() => set({ rarities: toggle(filters.rarities, r) })}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs capitalize transition-colors',
                  active
                    ? 'border-foreground bg-accent text-accent-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Format legality">
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map(f => {
            const active = filters.formats.includes(f.value);
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => set({ formats: toggle(filters.formats, f.value) })}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-foreground bg-accent text-accent-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={`Mana value — ${filters.cmc[0]} to ${filters.cmc[1] >= CMC_MAX ? `${CMC_MAX}+` : filters.cmc[1]}`}>
        <Slider
          value={[filters.cmc[0], filters.cmc[1]]}
          min={0}
          max={CMC_MAX}
          step={1}
          onValueChange={v => set({ cmc: [v[0], v[1]] as [number, number] })}
          aria-label="Mana value range"
        />
      </Section>

      <Section title="Price (USD)">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Min"
            value={filters.priceMin ?? ''}
            onChange={e =>
              set({ priceMin: e.target.value === '' ? null : Number(e.target.value) })
            }
            className="h-8"
            aria-label="Minimum price"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Max"
            value={filters.priceMax ?? ''}
            onChange={e =>
              set({ priceMax: e.target.value === '' ? null : Number(e.target.value) })
            }
            className="h-8"
            aria-label="Maximum price"
          />
        </div>
      </Section>

      {availableSets.length > 1 && (
        <Section title="Set">
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {availableSets.map(s => {
              const active = filters.sets.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ sets: toggle(filters.sets, s) })}
                  className={cn(
                    'rounded-md border px-2 py-1 font-mono text-xs uppercase transition-colors',
                    active
                      ? 'border-foreground bg-accent text-accent-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {showOwnershipFilters && (
        <>
          <Section title="Condition">
            <div className="flex flex-wrap gap-1.5">
              {CONDITIONS.map(c => {
                const active = filters.conditions.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={active}
                    title={c.label}
                    onClick={() => set({ conditions: toggle(filters.conditions, c.value) })}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      active
                        ? 'border-foreground bg-accent text-accent-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    {c.value}
                  </button>
                );
              })}
            </div>
          </Section>

          <div className="flex items-center justify-between">
            <Label htmlFor="foil-only" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Foils only
            </Label>
            <Switch
              id="foil-only"
              checked={filters.foilOnly}
              onCheckedChange={v => set({ foilOnly: v })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Compact summary of what is currently filtered, used above the results. */
export function ActiveFilterChips({
  filters,
  onChange,
}: {
  filters: CollectionFilterState;
  onChange: (next: CollectionFilterState) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  const set = (patch: Partial<CollectionFilterState>) => onChange({ ...filters, ...patch });

  if (filters.colors.length || filters.colorless) {
    const label = [
      ...filters.colors.map(c => COLOR_LABEL[c]),
      ...(filters.colorless ? ['Colourless'] : []),
    ].join(', ');
    chips.push({
      label: `${COLOR_MODE_LABEL[filters.colorMode]}: ${label}`,
      clear: () => set({ colors: [], colorless: false }),
    });
  }
  filters.types.forEach(t => chips.push({ label: t, clear: () => set({ types: filters.types.filter(x => x !== t) }) }));
  filters.rarities.forEach(r => chips.push({ label: r, clear: () => set({ rarities: filters.rarities.filter(x => x !== r) }) }));
  filters.formats.forEach(f =>
    chips.push({
      label: FORMATS.find(x => x.value === f)?.label ?? f,
      clear: () => set({ formats: filters.formats.filter(x => x !== f) }),
    })
  );
  filters.sets.forEach(s => chips.push({ label: s.toUpperCase(), clear: () => set({ sets: filters.sets.filter(x => x !== s) }) }));
  filters.conditions.forEach(c => chips.push({ label: c, clear: () => set({ conditions: filters.conditions.filter(x => x !== c) }) }));
  if (filters.foilOnly) chips.push({ label: 'Foils only', clear: () => set({ foilOnly: false }) });
  if (filters.cmc[0] > 0 || filters.cmc[1] < CMC_MAX) {
    chips.push({
      label: `MV ${filters.cmc[0]}–${filters.cmc[1]}`,
      clear: () => set({ cmc: [0, CMC_MAX] }),
    });
  }
  if (filters.priceMin != null || filters.priceMax != null) {
    chips.push({
      label: `Price ${filters.priceMin ?? 0}–${filters.priceMax ?? '∞'}`,
      clear: () => set({ priceMin: null, priceMax: null }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(chip => (
        <Badge
          key={chip.label}
          variant="secondary"
          className="cursor-pointer gap-1 font-normal"
          onClick={chip.clear}
          role="button"
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label}
          <span aria-hidden="true">×</span>
        </Badge>
      ))}
    </div>
  );
}
