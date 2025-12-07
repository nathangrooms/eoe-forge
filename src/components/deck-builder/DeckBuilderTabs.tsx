import { Badge } from '@/components/ui/badge';
import { 
  Eye, 
  Search, 
  Brain, 
  Upload, 
  Play,
  BarChart3,
  Printer
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeckBuilderTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  totalCards: number;
  format: string;
}

const tabs = [
  { id: 'cards', label: 'Cards', icon: Eye, mobileLabel: 'Cards' },
  { id: 'search', label: 'Add Cards', icon: Search, mobileLabel: 'Add' },
  { id: 'analysis', label: 'Analysis', icon: BarChart3, mobileLabel: 'Stats' },
  { id: 'ai', label: 'Optimizer', icon: Brain, mobileLabel: 'Opt' },
  { id: 'import-export', label: 'Import/Export', icon: Upload, mobileLabel: 'I/O' },
  { id: 'proxies', label: 'Proxies', icon: Printer, mobileLabel: 'Print' },
  { id: 'test', label: 'Playtest', icon: Play, mobileLabel: 'Test' },
];

export function DeckBuilderTabs({ activeTab, onTabChange, totalCards, format }: DeckBuilderTabsProps) {
  const targetCards = format === 'commander' ? 100 : 60;

  return (
    <div className="border-b border-border bg-muted/30 overflow-x-auto scrollbar-none">
      <div className="px-4 md:px-6">
        <div className="flex items-center gap-2 md:gap-4 w-max md:w-auto py-1">
          {tabs.map(({ id, label, icon: Icon, mobileLabel }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "flex items-center gap-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-[1px]",
                activeTab === id 
                  ? "text-primary border-primary" 
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden md:inline">{label}</span>
              <span className="md:hidden">{mobileLabel}</span>
              {id === 'cards' && (
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    totalCards >= targetCards ? "bg-green-500/20 text-green-500" : "bg-muted"
                  )}
                >
                  {totalCards}/{targetCards}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
