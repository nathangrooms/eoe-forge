import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * The deck page's tab strip.
 *
 * Pulled out of `DeckInterface` so the strip can be looked at on its own — and
 * because the page is long enough without eighty lines of chrome in the middle
 * of it.
 *
 * Each destination carries its label *and* the question it answers. "Mana" and
 * "Analysis" side by side tell a player nothing about which one holds the
 * curve; "Curve and sources" does. The hint is hidden below `lg` where there is
 * no room for it, which is also where the strip starts scrolling rather than
 * crushing eight destinations into eighths.
 */

export interface DeckTab {
  id: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

interface DeckTabStripProps {
  tabs: readonly DeckTab[];
  activeTab: string;
  onChange: (id: string) => void;
  /** Optional count badge, keyed by tab id. */
  badges?: Record<string, number | undefined>;
  className?: string;
}

export function DeckTabStrip({
  tabs,
  activeTab,
  onChange,
  badges,
  className,
}: DeckTabStripProps) {
  return (
    <div className={cn('overflow-x-auto scrollbar-none', className)} role="tablist">
      {/* Surface tint, no outline — design law 2. */}
      <div className="flex w-max items-stretch gap-1 rounded-xl bg-muted/40 p-1.5 md:w-full">
        {tabs.map(({ id, label, icon: Icon, hint }) => {
          const selected = activeTab === id;
          const badge = badges?.[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-4 py-2.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Icon className="h-4 w-4" />
                {label}
                {badge !== undefined && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-xs tabular-nums">
                    {badge}
                  </Badge>
                )}
              </span>
              <span className="hidden text-xs font-normal opacity-70 lg:block">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DeckTabStrip;
