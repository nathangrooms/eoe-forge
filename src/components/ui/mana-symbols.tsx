import { cn } from "@/lib/utils";

interface ManaSymbolProps {
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const colorMap: Record<string, { bg: string; text: string; name: string }> = {
  W: { bg: 'hsl(var(--mana-white))', text: 'hsl(var(--mana-black))', name: 'White' },
  U: { bg: 'hsl(var(--mana-blue))', text: 'white', name: 'Blue' },
  B: { bg: 'hsl(var(--mana-black))', text: 'white', name: 'Black' },
  R: { bg: 'hsl(var(--mana-red))', text: 'white', name: 'Red' },
  G: { bg: 'hsl(var(--mana-green))', text: 'white', name: 'Green' },
  C: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', name: 'Colorless' }
};

const sizeMap = {
  sm: 'w-3 h-3 text-[10px]',
  md: 'w-4 h-4 text-xs',
  lg: 'w-6 h-6 text-sm'
};

export function ManaSymbol({ color, size = 'md', className }: ManaSymbolProps) {
  const colorInfo = colorMap[color] || colorMap.C;
  
  return (
    <div
      className={cn(
        "rounded-full font-bold flex items-center justify-center border border-border/20",
        sizeMap[size],
        className
      )}
      style={{
        backgroundColor: colorInfo.bg,
        color: colorInfo.text
      }}
      title={colorInfo.name}
    >
      {color}
    </div>
  );
}

interface ManaSymbolsProps {
  colors: string[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ManaSymbols({ colors, size = 'md', className }: ManaSymbolsProps) {
  if (!colors.length) return null;
  
  return (
    <div className={cn("flex space-x-1", className)}>
      {colors.map((color, index) => (
        <ManaSymbol key={`${color}-${index}`} color={color} size={size} />
      ))}
    </div>
  );
}

interface PowerLevelBadgeProps {
  level: number;
  className?: string;
}

export function PowerLevelBadge({ level, className }: PowerLevelBadgeProps) {
  const getColorFromLevel = (level: number) => {
    if (level <= 3) return 'hsl(var(--power-1))';
    if (level <= 6) return 'hsl(var(--power-4))';
    if (level <= 8) return 'hsl(var(--power-7))';
    return 'hsl(var(--power-10))';
  };

  return (
    <div
      className={cn(
        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-primary-foreground",
        className
      )}
      style={{ backgroundColor: getColorFromLevel(level) }}
    >
      Power: {level.toFixed(1)}
    </div>
  );
}