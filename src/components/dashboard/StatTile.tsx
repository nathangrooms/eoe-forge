import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  /** Every tile navigates — a tile that looks clickable has to be clickable. */
  to: string;
  className?: string;
}

export function StatTile({ label, value, hint, icon: Icon, to, className }: StatTileProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors',
        'hover:border-foreground/25 hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint ?? ' '}</p>
    </Link>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}
