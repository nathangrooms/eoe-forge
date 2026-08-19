import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPrice } from '@/components/collection/browser/types';

/**
 * The drawn value line, split out from `PriceHistoryChart` so the charting
 * library is not part of the collection page's first load.
 *
 * Same reason and same shape as `CardPriceChart` on the card page: recharts is
 * 377 kB raw / 104 kB gzipped, and the collection page pulled all of it before
 * it knew whether there was anything to draw. Most people have fewer than two
 * snapshots recorded, so the panel renders its empty state and the reader had
 * still waited for a charting library. Worse, `/collection` is one of the four
 * pages App.tsx warms up on idle, so every signed-in visit was fetching
 * recharts in the background whatever page they were actually on.
 *
 * The panel already reserves a 300px box and shows a 300px skeleton while the
 * history query runs. The same skeleton stands in while this arrives, so
 * nothing moves when it lands.
 *
 * The props are the finished series. All the reading and the change arithmetic
 * stay in `PriceHistoryChart`: this file draws, and nothing else.
 */

export interface ValueHistoryPoint {
  date: string;
  value: number;
}

export interface ValueHistoryLineProps {
  points: ValueHistoryPoint[];
}

export function ValueHistoryLine({ points }: ValueHistoryLineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          interval="preserveStartEnd"
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={value => `$${Number(value).toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px hsl(0 0% 0% / 0.5)',
          }}
          formatter={(value: number) => [formatPrice(value), 'Value']}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--foreground))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default ValueHistoryLine;
