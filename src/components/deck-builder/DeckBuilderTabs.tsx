import { Eye, Search, Brain, Upload, Play, BarChart3, Printer } from 'lucide-react';
import { PageTabs } from '@/components/listing';

/**
 * The builder's section strip.
 *
 * ## What changed
 *
 * It drew `border-b border-border` around itself and a 2px `border-b-2` under
 * the selected tab. Design law 2 rules hairlines out outright, and these were
 * two of them on the busiest screen in the product. It was also a fifth tab
 * treatment: the deck page had an underline of its own, the collection a
 * `data-[state=active]:after:` strip, the marketplace a stretched grid, the
 * wishlist a `bg-muted p-1` group. One control, five ways.
 *
 * It is `PageTabs` now, the same strip the collection, the wishlist, the
 * marketplace, the deck page and card detail use, so its selected state is one
 * decision made once rather than five made separately.
 *
 * ## The one thing that moved rather than stayed
 *
 * The Cards tab carried `12/100`. `PageTabs` shows a count, not a ratio, and
 * the ratio has a better home forty pixels above it: `DeckQuickStats`' first
 * tile reads `12 / 100` at 24px with a bar under it showing how far along the
 * deck is. So the tab keeps the count, and the target is stated once, where it
 * is legible, instead of twice at two sizes.
 */

interface DeckBuilderTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  totalCards: number;
  format: string;
  /** Only a commander actually in the command zone counts toward 100. */
  hasCommander?: boolean;
  /** Tab ids to hide — e.g. the Optimizer when its feature flag is off. */
  hiddenTabs?: string[];
}

const TABS = [
  { id: 'cards', label: 'Cards', icon: Eye, shortLabel: 'Cards' },
  { id: 'search', label: 'Add Cards', icon: Search, shortLabel: 'Add' },
  { id: 'analysis', label: 'Analysis', icon: BarChart3, shortLabel: 'Stats' },
  { id: 'ai', label: 'Optimizer', icon: Brain, shortLabel: 'Optimize' },
  { id: 'import-export', label: 'Import/Export', icon: Upload, shortLabel: 'I/O' },
  { id: 'proxies', label: 'Proxies', icon: Printer, shortLabel: 'Print' },
  { id: 'test', label: 'Playtest', icon: Play, shortLabel: 'Test' },
];

export function DeckBuilderTabs({
  activeTab,
  onTabChange,
  totalCards,
  format,
  hasCommander = false,
  hiddenTabs = [],
}: DeckBuilderTabsProps) {
  const isCommander = format?.toLowerCase() === 'commander' || format?.toLowerCase() === 'edh';
  const displayCards = isCommander && hasCommander ? totalCards + 1 : totalCards;

  const tabs = TABS.filter(t => !hiddenTabs.includes(t.id)).map(tab =>
    tab.id === 'cards' ? { ...tab, count: displayCards } : tab
  );

  return (
    <div className="px-4 py-2 md:px-6">
      <PageTabs
        tabs={tabs}
        value={activeTab}
        onChange={onTabChange}
        label="Deck builder sections"
      />
    </div>
  );
}
