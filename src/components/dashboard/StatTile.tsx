import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCountUp } from './Reveal';

interface StatTileProps {
  label: string;
  /** The raw number, so the tile can count it up. Formatting stays the caller's. */
  value: number;
  format?: (value: number) => string;
  hint?: string;
  icon: LucideIcon;
  /** Every tile navigates — a tile that looks clickable has to be clickable. */
  to: string;
  className?: string;
}

const defaultFormat = (value: number) => Math.round(value).toLocaleString();

export function StatTile({
  label,
  value,
  format = defaultFormat,
  hint,
  icon: Icon,
  to,
  className,
}: StatTileProps) {
  const shown = useCountUp(value);

  return (
    <Link
      to={to}
      className={cn(
        // No border. Depth is the raised surface plus the shadow underneath it.
        'group relative isolate flex h-full flex-col overflow-hidden rounded-xl bg-card p-4',
        'shadow-lg shadow-black/20 transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:bg-accent hover:shadow-xl hover:shadow-black/30',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >

      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="mt-3 truncate text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {format(shown)}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint ?? ' '}</p>
    </Link>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </div>
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}
