import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ManaSourcesIndicatorProps {
  sources: Record<string, number>;
  className?: string;
}

const colorConfig: Record<string, { bg: string; text: string; label: string }> = {
  W: { bg: 'bg-amber-100', text: 'text-amber-900', label: 'White' },
  U: { bg: 'bg-blue-500', text: 'text-white', label: 'Blue' },
  B: { bg: 'bg-gray-900', text: 'text-white', label: 'Black' },
  R: { bg: 'bg-red-500', text: 'text-white', label: 'Red' },
  G: { bg: 'bg-green-600', text: 'text-white', label: 'Green' },
  C: { bg: 'bg-gray-400', text: 'text-gray-900', label: 'Colorless' }
};

export function ManaSourcesIndicator({ sources, className }: ManaSourcesIndicatorProps) {
  const entries = Object.entries(sources).filter(([_, count]) => Number(count) > 0);
  const total = entries.reduce((sum, [_, count]) => sum + Number(count), 0);

  if (entries.length === 0) {
    return (
      <div className={cn("flex gap-1", className)}>
        <span className="text-xs text-muted-foreground">No mana sources</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex gap-1", className)}>
        {entries.map(([color, count]) => {
          const config = colorConfig[color] || colorConfig.C;
          const percentage = total > 0 ? Math.round((Number(count) / total) * 100) : 0;
          
          return (
            <Tooltip key={color}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold cursor-default",
                    config.bg,
                    config.text
                  )}
                >
                  {count}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{config.label}: {count} sources ({percentage}%)</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}