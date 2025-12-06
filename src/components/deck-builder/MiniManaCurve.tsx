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
    <div className={cn("flex items-end gap-1.5", className)}>
      {normalizedData.map(({ cmc, count }) => {
        const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const isHighest = count === maxCount && count > 0;
        
        return (
          <div key={cmc} className="flex-1 flex flex-col items-center group relative min-w-0">
            {/* Count label above bar */}
            {count > 0 && (
              <span className="text-[9px] font-medium text-muted-foreground mb-0.5">{count}</span>
            )}
            <div className="flex-1 w-full flex items-end" style={{ minHeight: '40px' }}>
              <div
                className={cn(
                  "w-full rounded-sm transition-all duration-300",
                  isHighest ? "bg-primary" : "bg-primary/50",
                  "group-hover:bg-primary"
                )}
                style={{ height: `${Math.max(height, count > 0 ? 15 : 5)}%`, minHeight: count > 0 ? '8px' : '3px' }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground mt-1 font-medium">{cmc}</span>
          </div>
        );
      })}
    </div>
  );
}