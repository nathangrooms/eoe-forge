import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowDown, ArrowUp, LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeckViewMode = 'grid' | 'list';
export type DeckSortKey = 'updated' | 'name' | 'power' | 'value' | 'cards' | 'completion';
export type SortDirection = 'asc' | 'desc';

export interface DeckViewPrefs {
  mode: DeckViewMode;
  sortKey: DeckSortKey;
  sortDir: SortDirection;
}

const STORAGE_KEY = 'deckmatrix.decks.view';

const DEFAULTS: DeckViewPrefs = { mode: 'grid', sortKey: 'updated', sortDir: 'desc' };

function readPrefs(): DeckViewPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<DeckViewPrefs>;
    return {
      mode: parsed.mode === 'list' ? 'list' : 'grid',
      sortKey: (parsed.sortKey as DeckSortKey) || DEFAULTS.sortKey,
      sortDir: parsed.sortDir === 'asc' ? 'asc' : 'desc',
    };
  } catch {
    return DEFAULTS;
  }
}

/** View mode + sort, persisted so the choice survives a reload. */
export function useDeckViewPrefs() {
  const [prefs, setPrefs] = useState<DeckViewPrefs>(readPrefs);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences simply do not persist */
    }
  }, [prefs]);

  const update = useCallback((next: Partial<DeckViewPrefs>) => {
    setPrefs(prev => ({ ...prev, ...next }));
  }, []);

  return { prefs, update };
}

const SORT_LABELS: Array<{ value: DeckSortKey; label: string }> = [
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name' },
  { value: 'cards', label: 'Card count' },
  { value: 'value', label: 'Deck value' },
  { value: 'completion', label: 'Collection %' },
  { value: 'power', label: 'Power level' },
];

interface DeckViewControlsProps {
  prefs: DeckViewPrefs;
  onChange: (next: Partial<DeckViewPrefs>) => void;
  resultCount: number;
  className?: string;
}

export function DeckViewControls({
  prefs,
  onChange,
  resultCount,
  className,
}: DeckViewControlsProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{resultCount}</span>{' '}
        {resultCount === 1 ? 'deck' : 'decks'}
      </p>

      <div className="flex items-center gap-2">
        <Select
          value={prefs.sortKey}
          onValueChange={value => onChange({ sortKey: value as DeckSortKey })}
        >
          {/* Borderless: the muted surface separates it from the page, not a hairline. */}
          <SelectTrigger
            className="h-9 w-[168px] border-0 bg-muted text-foreground"
            aria-label="Sort decks by"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-0 shadow-xl shadow-black/40">
            {SORT_LABELS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="secondary"
          size="icon"
          className="h-9 w-9"
          aria-label={prefs.sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          onClick={() => onChange({ sortDir: prefs.sortDir === 'asc' ? 'desc' : 'asc' })}
        >
          {prefs.sortDir === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>

        <div className="flex items-center rounded-md bg-muted p-0.5" role="group" aria-label="View mode">
          {/* `secondary` sits one lightness step from `muted`, so the selected
              state was invisible. Selected now inverts. */}
          <Button
            variant={prefs.mode === 'grid' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            aria-pressed={prefs.mode === 'grid'}
            aria-label="Grid view"
            onClick={() => onChange({ mode: 'grid' })}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={prefs.mode === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            aria-pressed={prefs.mode === 'list'}
            aria-label="List view"
            onClick={() => onChange({ mode: 'list' })}
          >
            <Rows3 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
