import { Badge } from '@/components/ui/badge';
import { Eye, Search, Brain, Upload, Play, BarChart3, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const tabs = [
  { id: 'cards', label: 'Cards', icon: Eye, mobileLabel: 'Cards' },
  { id: 'search', label: 'Add Cards', icon: Search, mobileLabel: 'Add' },
  { id: 'analysis', label: 'Analysis', icon: BarChart3, mobileLabel: 'Stats' },
  { id: 'ai', label: 'Optimizer', icon: Brain, mobileLabel: 'Optimize' },
  { id: 'import-export', label: 'Import/Export', icon: Upload, mobileLabel: 'I/O' },
  { id: 'proxies', label: 'Proxies', icon: Printer, mobileLabel: 'Print' },
  { id: 'test', label: 'Playtest', icon: Play, mobileLabel: 'Test' },
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
  const targetCards = isCommander ? 100 : 60;
  const displayCards = isCommander && hasCommander ? totalCards + 1 : totalCards;
  const visibleTabs = tabs.filter(t => !hiddenTabs.includes(t.id));

  return (
    <div className="border-b border-border bg-muted/30 overflow-x-auto scrollbar-none">
      <div className="px-4 md:px-6">
        <div className="flex w-max items-center gap-2 py-1 md:w-auto md:gap-4" role="tablist">
          {visibleTabs.map(({ id, label, icon: Icon, mobileLabel }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => onTabChange(id)}
              className={cn(
                '-mb-[1px] flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                activeTab === id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden md:inline">{label}</span>
              <span className="md:hidden">{mobileLabel}</span>
              {id === 'cards' && (
                <Badge
                  variant={displayCards >= targetCards ? 'default' : 'secondary'}
                  className="px-1.5 py-0 text-[10px] tabular-nums"
                >
                  {displayCards}/{targetCards}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
