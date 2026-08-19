import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartData } from './AIVisualDisplay';

/**
 * The drawn chart, split out from `AIVisualDisplay` so the charting library is
 * not part of the first load of every page that can show one.
 *
 * Same reason and same shape as `CardPriceChart` on the card page: recharts is
 * 377 kB raw / 104 kB gzipped. `AIVisualDisplay` is reached from Tutor, the
 * deck analysis panel and the generated deck list, and a chart is drawn only
 * when an answer actually comes back carrying one, which is now the exception
 * rather than the reflex it used to be. So the library was being paid for on
 * pages that would usually never draw a single chart.
 *
 * The parent reserves the box (192px compact, 256px otherwise) before this
 * arrives, so nothing moves when it lands.
 *
 * The props are the finished chart description. All the branching on shape
 * stays here; the panel, its heading and its tables stay in `AIVisualDisplay`.
 */

const DEFAULT_COLORS = [
  'hsl(var(--spacecraft))',
  'hsl(var(--celestial))',
  'hsl(var(--cosmic))',
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
} as const;

export interface AIVisualChartProps {
  chart: ChartData;
  compact?: boolean;
}

export function AIVisualChart({ chart, compact = false }: AIVisualChartProps) {
  if (chart.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart.data}>
          <XAxis
            dataKey={chart.xKey || 'name'}
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
          />
          <YAxis tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar
            dataKey={chart.yKey || 'value'}
            fill={chart.colors?.[0] || DEFAULT_COLORS[0]}
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chart.data}
            dataKey={chart.yKey || 'value'}
            nameKey={chart.nameKey || 'name'}
            cx="50%"
            cy="50%"
            outerRadius={compact ? 60 : 80}
            label
          >
            {chart.data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={chart.colors?.[index] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart.data}>
          <XAxis
            dataKey={chart.xKey || 'name'}
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
          />
          <YAxis tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line
            type="monotone"
            dataKey={chart.yKey || 'value'}
            stroke={chart.colors?.[0] || DEFAULT_COLORS[0]}
            strokeWidth={2}
            dot={{ fill: chart.colors?.[0] || DEFAULT_COLORS[0] }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

export default AIVisualChart;
