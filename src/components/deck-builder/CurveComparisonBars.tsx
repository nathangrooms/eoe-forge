import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

/**
 * The drawn curve bars, split out from `EnhancedDeckAnalysis` so the charting
 * library is not part of the deck builder's first load.
 *
 * Same reason and same shape as `CardPriceChart` on the card page: recharts is
 * 377 kB raw / 104 kB gzipped. `EnhancedDeckAnalysis` is reached from the deck
 * builder, the deck page and the generated deck list, and it drew exactly one
 * chart out of the twenty-odd recharts symbols it used to import — the radar,
 * pie and line imports were never rendered at all.
 *
 * The panel reserves a 256px box, and a 256px skeleton stands in while this
 * arrives, so nothing moves when it lands.
 *
 * The props are the finished curve. All the analysis stays in
 * `EnhancedDeckAnalysis`: this file draws, and nothing else.
 */

export interface CurveBar {
  cmc: number | string;
  percentage: number;
}

export interface CurveComparisonBarsProps {
  curve: CurveBar[];
  fill: string;
}

export function CurveComparisonBars({ curve, fill }: CurveComparisonBarsProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={curve}>
        <XAxis dataKey="cmc" />
        <YAxis />
        <Bar dataKey="percentage" fill={fill} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default CurveComparisonBars;
