import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface DeckStatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subValue?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'premium';
  onClick?: () => void;
  className?: string;
}

const variantStyles = {
  default: 'bg-muted/50 border-border',
  success: 'bg-green-500/10 border-green-500/30',
  warning: 'bg-yellow-500/10 border-yellow-500/30',
  danger: 'bg-red-500/10 border-red-500/30',
  info: 'bg-blue-500/10 border-blue-500/30',
  premium: 'bg-purple-500/10 border-purple-500/30'
};

const iconVariantStyles = {
  default: 'text-muted-foreground',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  danger: 'text-red-500',
  info: 'text-blue-500',
  premium: 'text-purple-500'
};

export function DeckStatsCard({
  icon: Icon,
  label,
  value,
  subValue,
  variant = 'default',
  onClick,
  className
}: DeckStatsCardProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-all',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02] hover:shadow-md',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', iconVariantStyles[variant])} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
      {subValue && (
        <div className="text-xs text-muted-foreground mt-0.5">{subValue}</div>
      )}
    </div>
  );
}