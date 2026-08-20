import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Slice } from './spread.ts';

/**
 * The four drawn spreads, and nothing else.
 *
 * Same split and same reason as `CardPriceChart` on the card page: recharts is
 * 377 kB raw / 104 kB gzipped, and it was deliberately kept out of the
 * Collection and Marketplace route graphs (commit 24c76ff took the entry chunk
 * from 267 kB to 160 kB). It stays out. This module is reached only through
 * `React.lazy`, and every panel that hosts it reserves the drawn height first,
 * so the skeleton and the chart occupy the same box and nothing moves when the
 * library lands.
 *
 * All four charts live in ONE module on purpose. Four lazy modules would be four
 * dynamic imports of the same chunk and four separate Suspense boundaries
 * resolving at four different moments, which is four chances for something to
 * move.
 *
 * The props are finished series. Every figure is worked out in `spread.ts`,
 * which is tested; this file draws, and nothing else.
 *
 * ## The marks
 *
 * Bars are capped at 18px so the band keeps its air, rounded 4px at the data end
 * and square at the baseline, and the grid is a solid hairline one step off the
 * surface. Never dashed: a dashed rule reads as a threshold or a projection when
 * it is only a grid.
 *
 * ## The colour
 *
 * Three different jobs, three different answers, and no chart mixes them.
 *
 * - **Colour spread** takes the mana tokens, because the bar for red must be
 *   red. That palette cannot be re-stepped to satisfy a contrast gate: white
 *   mana IS pale cream and colourless IS grey, and moving them would be lying
 *   about which colour a card is. Measured against the dark card surface on
 *   2026-08-20, the worst adjacent pair is green against red at ΔE 5.6 under
 *   simulated deuteranopia, which is inside the floor band. So hue does not
 *   carry identity here at all: every bar wears its own mana pip and its own
 *   name, and its count sits at the tip. The colour agrees with the label
 *   rather than replacing it.
 * - **Rarity** is ordered, so it takes the ordinal ramp (`--chart-step-*`),
 *   least scarce to most. The reader sees the order in the shading.
 * - **Mana value and sets** are one series each, so every bar is the same ink.
 *   Shading a bar darker because it is longer would spend the only free channel
 *   restating the length the bar already shows.
 */

export type SpreadKind = 'colour' | 'manaValue' | 'rarity' | 'set';

export interface SpreadChartsProps {
  kind: SpreadKind;
  slices: Slice[];
  /** Must match the height the host reserved for the skeleton, exactly. */
  height: number;
}

/** Mana pip fills, straight off the tokens, so a bar matches the pip beside it. */
const MANA_FILL: Record<string, string> = {
  W: 'hsl(var(--mana-white))',
  U: 'hsl(var(--mana-blue))',
  B: 'hsl(var(--mana-black))',
  R: 'hsl(var(--mana-red))',
  G: 'hsl(var(--mana-green))',
  C: 'hsl(var(--mana-colorless))',
};

/** Ink on a light pip, paper on a dark one. The one place text wears a fill. */
const MANA_PIP_TEXT: Record<string, string> = {
  W: 'hsl(0 0% 8%)',
  U: 'hsl(0 0% 100%)',
  B: 'hsl(0 0% 100%)',
  R: 'hsl(0 0% 100%)',
  G: 'hsl(0 0% 100%)',
  C: 'hsl(0 0% 8%)',
};

const INK = 'hsl(var(--foreground))';
const MUTED = 'hsl(var(--muted-foreground))';
const GRID = { stroke: MUTED, strokeOpacity: 0.15 };

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: 'none',
  borderRadius: '10px',
  boxShadow: '0 12px 32px -8px hsl(0 0% 0% / 0.6)',
  fontSize: '12px',
  color: 'hsl(var(--popover-foreground))',
};

const TICK = { fontSize: 11, fill: MUTED };

const usd = (n: number) =>
  n > 0
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: n >= 1000 ? 0 : 2,
      }).format(n)
    : null;

/**
 * What the hover says. Copies is the encoded measure; value rides along because
 * a collection is a thing people value, and a chart that made them hunt for the
 * money in a second panel would be the old page again.
 */
function tooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const slice: Slice = payload[0].payload;
  const money = usd(slice.value);
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-medium text-popover-foreground">{slice.label}</p>
      <p className="tabular-nums text-popover-foreground/80">
        {slice.copies.toLocaleString()} {slice.copies === 1 ? 'card' : 'cards'}
      </p>
      <p className="tabular-nums text-popover-foreground/70">
        {money ? `${money} of value` : 'No price for these yet'}
      </p>
    </div>
  );
}

/**
 * A mana pip as a y-axis tick.
 *
 * A `<circle>` plus the colour's letter, which is the same thing `ManaSymbol`
 * draws in the rest of the app. It is the secondary encoding the colour chart is
 * required to carry, so it is not decoration and it does not get dropped to save
 * width.
 */
function ManaTick({ x, y, payload }: any) {
  const key = String(payload?.value ?? 'C');
  return (
    <g transform={`translate(${x - 16},${y})`}>
      <circle cx={0} cy={0} r={9} fill={MANA_FILL[key] ?? MANA_FILL.C} />
      <text
        x={0}
        y={0}
        dy={3.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill={MANA_PIP_TEXT[key] ?? MANA_PIP_TEXT.C}
      >
        {key}
      </text>
    </g>
  );
}

/* A horizontal bar chart: long or named categories down the side, count across.
   Horizontal because "Uncommon" and "13 more" do not fit under a column. */
function HorizontalSpread({
  slices,
  height,
  axisWidth,
  fillFor,
  tick,
}: {
  slices: Slice[];
  height: number;
  axisWidth: number;
  fillFor: (slice: Slice, index: number) => string;
  tick?: any;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={slices}
        layout="vertical"
        margin={{ top: 4, right: 44, bottom: 0, left: 0 }}
        barCategoryGap="22%"
      >
        <CartesianGrid horizontal={false} {...GRID} />
        <XAxis
          type="number"
          tick={TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="key"
          width={axisWidth}
          tick={tick ?? TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(key: string) =>
            slices.find(s => s.key === key)?.label ?? key
          }
        />
        <Tooltip
          content={tooltipContent}
          cursor={{ fill: MUTED, fillOpacity: 0.08 }}
        />
        <Bar dataKey="copies" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {slices.map((slice, i) => (
            <Cell key={slice.key} fill={fillFor(slice, i)} />
          ))}
          {/* The count at the tip of every bar. On a six-row chart that is a
              label per row and it stays readable, and it is what lets the
              colour chart carry meaning without its hues. */}
          <LabelList
            dataKey="copies"
            position="right"
            offset={8}
            fill={MUTED}
            fontSize={11}
            className="tabular-nums"
            formatter={(v: number) => v.toLocaleString()}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpreadCharts({ kind, slices, height }: SpreadChartsProps) {
  if (kind === 'colour') {
    return (
      <HorizontalSpread
        slices={slices}
        height={height}
        axisWidth={30}
        tick={<ManaTick />}
        fillFor={slice => MANA_FILL[slice.key] ?? MANA_FILL.C}
      />
    );
  }

  if (kind === 'rarity') {
    return (
      <HorizontalSpread
        slices={slices}
        height={height}
        axisWidth={76}
        /* Step by position in the scarcity order, not by bar length: the ramp
           is showing that mythic is scarcer than common, which is a fact about
           the category and not about how many are owned. */
        fillFor={(_slice, i) => `hsl(var(--chart-step-${Math.min(i + 1, 6)}))`}
      />
    );
  }

  if (kind === 'set') {
    return (
      <HorizontalSpread
        slices={slices}
        height={height}
        axisWidth={78}
        fillFor={() => INK}
      />
    );
  }

  /* Mana value: a curve, so it reads as columns left to right. */
  const peak = slices.reduce((best, s) => (s.copies > best ? s.copies : best), 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={slices}
        margin={{ top: 18, right: 4, bottom: 0, left: -18 }}
        barCategoryGap="18%"
      >
        <CartesianGrid vertical={false} {...GRID} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip content={tooltipContent} cursor={{ fill: MUTED, fillOpacity: 0.08 }} />
        <Bar dataKey="copies" barSize={22} radius={[4, 4, 0, 0]} fill={INK} isAnimationActive={false}>
          {/* Only the peak is labelled. A number on every column is the thing
              nobody reads; the axis and the hover carry the rest. */}
          <LabelList
            dataKey="copies"
            position="top"
            offset={6}
            fill={MUTED}
            fontSize={11}
            className="tabular-nums"
            formatter={(v: number) => (v === peak && v > 0 ? v.toLocaleString() : '')}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default SpreadCharts;
