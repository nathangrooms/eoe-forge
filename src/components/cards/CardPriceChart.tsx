import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * The drawn price line, split out from `CardPriceHistory` so the charting
 * library is not part of a card page's first load.
 *
 * Recharts is the single heaviest thing a card page used to pull: measured at
 * 377 kB raw, 104 kB gzipped, which was about a third of everything the page
 * downloaded. It was paid on every card page even though the chart usually
 * never appears. Price history exists for 3,528 of the 34,088 catalogue rows,
 * so for most cards the panel renders one line of text saying there is nothing
 * to draw yet, and the reader had still waited for a charting library.
 *
 * Now the library is fetched only when there are at least two days of prices to
 * draw, and it is fetched while the price query is still in flight, under the
 * same 180px skeleton the panel already showed. Nothing moves when it arrives.
 *
 * The props are the finished series. All the reading, gap filling and averaging
 * stays in `CardPriceHistory`: this file draws, and nothing else.
 */

export interface PricePoint {
  date: string;
  label: string;
  usd: number | null;
  eur: number | null;
  /** True when we read this price on this date. False when it is carried. */
  observed: boolean;
  /** The date the carried value was actually read on. */
  observedOn: string;
}

export interface CardPriceChartProps {
  points: PricePoint[];
  hasEur: boolean;
}

export function CardPriceChart({ points, hasEur }: CardPriceChartProps) {
  return (
    /* min-w-0 and overflow-hidden are LOAD BEARING here.

      recharts' ResponsiveContainer measures its parent and writes an
      explicit pixel width onto itself. A grid or flex child defaults to
      min-width:auto, so once the chart has measured wide it can never
      shrink back, and the whole column ratchets outward. That is the
      classic recharts overflow, and it is why the card page hung past
      its container. */
    <div className="h-[180px] w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="dm-price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.18} />
              <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.15}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            /*
             * THE FLOOR IS ZERO. A card cannot cost minus a dollar.
             *
             * With `['auto', 'auto']` recharts pads the domain around the data,
             * and when the series is short or flat that padding runs below the
             * lowest value. Measured on a public card page with a single
             * observation: the axis read $-1.00 / $0.00 / $1.00 / $2.00 /
             * $3.00, so the first thing a sceptical visitor saw on the price
             * panel was a negative price.
             *
             * A function low bound keeps the useful behaviour, which is that a
             * line wobbling between $17 and $19 is not squashed against a
             * zero baseline. It just never crosses zero.
             */
            domain={[
              (dataMin: number) => Math.max(0, dataMin - Math.max(0.05, Math.abs(dataMin) * 0.08)),
              'auto',
            ]}
            allowDataOverflow={false}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.3 }}
            formatter={(value: number, key: string, item: any) => {
              const money = key === 'eur' ? `€${value.toFixed(2)}` : `$${value.toFixed(2)}`;
              const label = key === 'eur' ? 'EUR' : 'USD';
              // Say so when the value is held over from an earlier day,
              // rather than letting a flat line imply a fresh reading.
              return item?.payload?.observed
                ? [money, label]
                : [
                    `${money} (unchanged since ${item?.payload?.observedOn ?? 'earlier'})`,
                    label,
                  ];
            }}
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: 'none',
              borderRadius: '10px',
              boxShadow: '0 12px 32px -8px hsl(0 0% 0% / 0.6)',
              fontSize: '12px',
              color: 'hsl(var(--popover-foreground))',
            }}
          />
          <Area
            type="monotone"
            dataKey="usd"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            fill="url(#dm-price-fill)"
            /* A dot marks a day we actually read a price. The line
               between dots is the last read price held steady, which is
               what a missing row means. It is not a guess and it is not
               a fall to zero, and the reader can see which is which. */
            dot={(props: any) =>
              props?.payload?.observed ? (
                <circle
                  key={props.payload.date}
                  cx={props.cx}
                  cy={props.cy}
                  r={2}
                  fill="hsl(var(--foreground))"
                />
              ) : (
                <g key={props?.payload?.date} />
              )
            }
            activeDot={{ r: 3, fill: 'hsl(var(--foreground))' }}
            connectNulls
            name="usd"
          />
          {hasEur && (
            <Line
              type="monotone"
              dataKey="eur"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              name="eur"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default CardPriceChart;
