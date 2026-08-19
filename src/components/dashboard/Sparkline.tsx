import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A line, drawn from the points it was given and no others.
 *
 * Deliberately not a charting library. Recharts is already in the bundle, but
 * this draws one polyline in a box with no axes, no grid, no tooltip and no
 * legend, and reaching for a chart engine to do that costs a mount, a resize
 * observer and a re-render on every hover for nothing visible.
 *
 * It is also flat and monochrome on purpose. The palette is charcoal and colour
 * is reserved for MTG meaning, so an up line and a down line are the same
 * colour; the number beside the chart says which way it went.
 *
 * Fewer than two points draws nothing at all. A single point rendered as a flat
 * line reads as "no change", which is a different claim from "we only have one
 * day".
 */
export function Sparkline({
  values,
  className,
  label,
}: {
  values: number[];
  className?: string;
  /** Announced to screen readers. The numbers themselves are printed beside it. */
  label: string;
}) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  /* A flat line sits in the middle of the box rather than on its floor, which is
     where dividing by a zero range would otherwise put it. */
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn('h-7 w-full text-foreground', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
