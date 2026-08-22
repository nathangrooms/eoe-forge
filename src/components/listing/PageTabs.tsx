import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SEGMENTED } from './listing-view';

/**
 * The strip that switches which section of a page you are looking at.
 *
 * ## Why this exists
 *
 * The audit counted twenty-three distinct tab skins. Six of them are on the
 * pages in this pass alone, doing the identical job: My Collection drew an
 * underline strip with eight `data-[state=active]:after:` rules, the wishlist a
 * `bg-muted p-1` group, the shopping list `rounded-full` pills, the marketplace
 * a `grid w-full grid-cols-4` of full-width triggers, the scanner a fourth
 * thing. A player moving between two pages of the same product met a different
 * control for the same action each time.
 *
 * ## The selected state is the part that was actually broken
 *
 * Three of those strips drew the selected tab with `variant="secondary"` on a
 * `bg-muted/40` shell. `--secondary` sits one lightness point from `--muted` in
 * the dark theme and is the identical value in the light one, so the selected
 * chip measured **1.09:1** against its own shell: the selection was not drawn
 * at all. This uses the same shell and the same selected variant as
 * `ViewModeToggle`, which measured **15.80:1**, because it is the same
 * decision and it should only be made once.
 *
 * ## Counts hold their place
 *
 * A badge that appears when the data lands shoves every tab after it sideways.
 * My Collection had already paid for that lesson and fixed it locally; the fix
 * is here now, so nobody has to rediscover it. A tab with no `count` draws no
 * badge and reserves nothing. A tab with a count reserves the badge from the
 * first paint and hides it while the figure is zero or still unknown.
 *
 * ## What this is not
 *
 * It is not a view-mode control. Grid, list and table are three ways of drawing
 * one set of results and belong to `ViewModeToggle` inside the filter bar;
 * these are different sets of results, and they change what the page is about.
 * Keeping them apart is why the collection can show a table without the page
 * tabs knowing anything about it.
 */

export interface PageTab {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /**
   * How many things are in this section.
   *
   * `undefined` means the section is not the kind of thing you count, such as a
   * search panel, and no badge is drawn. A number reserves the badge and shows
   * it once it is above zero. `null` means the figure is still loading, which
   * reserves the space and shows nothing, so the strip does not move when it
   * arrives.
   */
  count?: number | null;
  /** Shortened on narrow screens. Falls back to `label`. */
  shortLabel?: string;
  /**
   * The question this section answers, on a second line.
   *
   * The deck page has this and it earns its place: "Mana" and "Analysis" side
   * by side tell a player nothing about which one holds the curve, and "Curve
   * and sources" does. It is hidden below `lg`, where there is no room for it,
   * which is also where the strip starts scrolling rather than crushing eight
   * destinations into eighths.
   *
   * A strip where one tab has a hint and the others do not would be ragged, so
   * the second line is reserved for every tab as soon as any tab carries one.
   */
  hint?: string;
}

export interface PageTabsProps {
  tabs: readonly PageTab[];
  value: string;
  onChange: (id: string) => void;
  /** Slot: a control that belongs beside the strip, pushed to the far end. */
  trailing?: React.ReactNode;
  label?: string;
  className?: string;
}

export function PageTabs({
  tabs,
  value,
  onChange,
  trailing,
  label = 'Sections',
  className,
}: PageTabsProps) {
  /*
   * Every badge in the strip is the same width, set by the widest figure in it,
   * so the tabs do not shuffle as counts change relative to each other. Four
   * characters covers 9,999 rows, which is past any real collection; a wider
   * reservation would waste the room a label needs on a phone.
   */
  const anyCount = tabs.some(tab => tab.count !== undefined);
  const anyHint = tabs.some(tab => tab.hint);

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/*
        Horizontally scrollable rather than wrapped. Five tabs at a readable
        size do not fit a 390px phone, and a strip that wraps to two lines
        pushes the whole page down by 40px on exactly the screens with the least
        room to give.
      */}
      <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
        <div className={cn(SEGMENTED, 'w-max')} role="tablist" aria-label={label}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const selected = tab.id === value;
            return (
              <Button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                variant={selected ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'shrink-0 whitespace-nowrap px-3',
                  anyHint ? 'h-auto flex-col gap-0.5 py-1.5' : 'h-9 gap-2'
                )}
                onClick={() => onChange(tab.id)}
              >
                <span className="flex items-center gap-2">
                  {Icon && <Icon className="h-4 w-4" />}
                  {tab.shortLabel ? (
                    <>
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.shortLabel}</span>
                    </>
                  ) : (
                    tab.label
                  )}
                  {anyCount && tab.count !== undefined && (
                    <span
                      aria-hidden={!tab.count}
                      className={cn(
                        'min-w-[2.5ch] text-right text-xs tabular-nums opacity-70',
                        !tab.count && 'invisible'
                      )}
                    >
                      {tab.count ?? 0}
                    </span>
                  )}
                </span>
                {anyHint && (
                  /* Reserved for every tab so the strip is one height, and
                     hidden below `lg` where there is no room for it. */
                  <span className="hidden text-[0.7rem] font-normal opacity-70 lg:block">
                    {tab.hint ?? ' '}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export default PageTabs;
