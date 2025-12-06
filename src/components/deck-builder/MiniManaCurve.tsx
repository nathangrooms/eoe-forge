import { cn } from '@/lib/utils';

interface MiniManaCurveProps {
  curveData: Record<string, number>;
  className?: string;
}

export function MiniManaCurve({ curveData, className }: MiniManaCurveProps) {
  const entries = Object.entries(curveData);
  const maxCount = Math.max(...entries.map(([_, count]) => Number(count)), 1);
  
  // Ensure we have all standard curve bins
  const standardBins = ['0-1', '2', '3', '4', '5', '6-7', '8-9', '10+'];
  const normalizedData = standardBins.map(bin => ({
    cmc: bin,
    count: Number(curveData[bin] || 0)
  }));

  if (entries.length === 0 || maxCount === 0) {
    return (
      <div className={cn("flex items-end gap-1 h-12", className)}>
        {standardBins.map((bin) => (
          <div key={bin} className="flex-1 flex flex-col items-center">
            <div className="w-full bg-muted/30 rounded-t h-8" />
            <span className="text-[8px] text-muted-foreground mt-1">{bin}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-1", className)}>
      {normalizedData.map(({ cmc, count }) => {
        const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const isHighest = count === maxCount && count > 0;
        
        return (
          <div key={cmc} className="flex-1 flex flex-col items-center group relative">
            <div
              className={cn(
                "w-full rounded-t transition-all duration-300",
                isHighest ? "bg-primary" : "bg-primary/60",
                "group-hover:bg-primary"
              )}
              style={{ height: `${Math.max(height, count > 0 ? 10 : 4)}%`, minHeight: count > 0 ? '4px' : '2px' }}
            />
            <span className="text-[8px] text-muted-foreground mt-1">{cmc}</span>
            
            {/* Tooltip on hover */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
              {count} cards
            </div>
          </div>
        );
      })}
    </div>
  );
}