import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SEGMENTED } from './listing-view';
import type { ListingMode } from './useListingView';

/**
 * The grid / list / table control.
 *
 * Ten hand-rolled versions of this existed, with four different shells and two
 * different selected variants, and the choice of variant was not cosmetic. On
 * three surfaces the selected chip measured **1.09:1** against its own shell,
 * which is to say the selected state was not drawn at all: `--secondary` sits
 * one lightness point from `--muted` in the dark theme and is the identical
 * value in the light one. My Decks had already been fixed to `variant="default"`
 * and measured 15.80:1. This is that fix, in the only place the decision is now
 * made.
 *
 * The modes come from the surface. Card search offers a text list, the
 * collection offers a table, and those are different jobs rather than the same
 * control with a flag: a collection table has condition, quantity and value
 * columns that a Scryfall result has no values for, and a text list is for
 * copying a decklist out. So this component knows how many modes there are and
 * nothing about what any of them shows.
 */

export interface ViewModeToggleProps {
  modes: readonly ListingMode[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}

export function ViewModeToggle({
  modes,
  value,
  onChange,
  label = 'View mode',
  className,
}: ViewModeToggleProps) {
  // One way to look at something is not a choice worth drawing.
  if (modes.length < 2) return null;

  return (
    <div className={cn(SEGMENTED, className)} role="group" aria-label={label}>
      {modes.map(mode => {
        const Icon = mode.icon;
        const selected = mode.id === value;
        return (
          <Button
            key={mode.id}
            type="button"
            variant={selected ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            aria-pressed={selected}
            aria-label={mode.label}
            title={mode.label}
            onClick={() => onChange(mode.id)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}

export default ViewModeToggle;
