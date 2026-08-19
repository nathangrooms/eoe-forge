import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * The drawn price line, split out from `CardPriceHistoryChart` so the charting
 * library is not part of the marketplace's first load.
 *
 * Same reason and same shape as `CardPriceChart` on the card page: recharts is
 * 377 kB raw / 104 kB gzipped, and the marketplace pulled all of it up front
 * for a 150px panel that most listings never draw, because a chart appears
 * only for a printing that already has stored snapshots.
 *
 * The panel reserves 150px either way, and the same 150px skeleton it already
 * showed stands in while this arrives, so nothing moves when it lands.
 *
 * The props are the finished series. All the reading stays in
 * `CardPriceHistoryChart`: this file draws, and nothing else.
 */

export interface CardPricePoint {
  date: string;
  price: number;
  displayDate: string;
}

export interface CardPriceLineProps {
  points: CardPricePoint[];
}

export function CardPriceLine({ points }: CardPriceLineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={value => `$${value}`}
          domain={['dataMin - 0.5', 'dataMax + 0.5']}
        />
        <Tooltip
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
          labelFormatter={label => label}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px hsl(0 0% 0% / 0.5)',
            fontSize: '12px',
          }}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default CardPriceLine;
