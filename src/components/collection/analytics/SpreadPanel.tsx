import { lazy, Suspense, useId, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPriceOrUnknown } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';
import type { Slice } from './spread.ts';
import type { SpreadKind } from './SpreadCharts.tsx';

/**
 * One chart, its title, the sentence that qualifies it, and the numbers behind
 * it.
 *
 * The charting library arrives through here and nowhere else. Recharts is
 * 104 kB gzipped and was deliberately kept out of the Collection route graph;
 * this keeps it out by fetching it only once a panel with something to draw is
 * on screen.
 *
 * ## The reserved box
 *
 * `PANEL_CHART_HEIGHT` is the same number three times: the skeleton, the
 * Suspense fallback and the drawn chart. That is the whole trick to a layout
 * shift of zero, and it is why the height is a constant rather than three
 * literals that could drift apart. The table view sits in the same box and
 * scrolls inside it, so switching to it does not move the page either.
 *
 * ## Why every panel has a table
 *
 * A value read only by hovering is a value some people cannot read at all, and
 * the colour spread in particular cannot rely on its hues (see the note in
 * `SpreadCharts.tsx`). The table is the same numbers as text, on a control that
 * takes one click, and it also answers "yes but what is it actually worth",
 * which the bars deliberately do not encode.
 */

const SpreadCharts = lazy(() => import('./SpreadCharts.tsx'));

/** The one height. Skeleton, fallback, chart and table all take exactly this. */
export const PANEL_CHART_HEIGHT = 236;

export interface SpreadPanelProps {
  title: string;
  /**
   * The sentence under the title. Says what the bars count and what they leave
   * out.
   *
   * It must be a CONSTANT string, with no figure from the collection in it. An
   * earlier version wrote the exact counts into it, so the caption was one line
   * while the collection loaded and two lines afterwards, and the chart under it
   * dropped 16px the moment the data arrived. Measured at 0.0004 of layout
   * shift, which is small and is still the page moving under someone's cursor.
   * The figures live in `tableNote` instead, which only ever renders in the
   * numbers view.
   */
  caption: string;
  kind: SpreadKind;
  slices: Slice[];
  /** Header of the first table column, e.g. "Colour" or "Mana value". */
  rowLabel: string;
  /** The qualifying figure, shown under the table. Free to change with the data. */
  tableNote?: string;
  /** Nothing to draw yet, so draw nothing and say why. */
  emptyNote?: string;
  className?: string;
}

export function SpreadPanel({
  title,
  caption,
  kind,
  slices,
  rowLabel,
  tableNote,
  emptyNote = 'Nothing here yet.',
  className,
}: SpreadPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  const hasData = slices.some(slice => slice.copies > 0);

  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex min-w-0 flex-col rounded-xl bg-card p-4 shadow-lg shadow-black/20 sm:p-5', className)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold text-foreground">
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{caption}</p>
        </div>
        {hasData && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setShowTable(v => !v)}
            aria-pressed={showTable}
          >
            {showTable ? (
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {showTable ? 'Chart' : 'Numbers'}
          </Button>
        )}
      </div>

      {/* min-w-0 and overflow-hidden are load bearing. ResponsiveContainer
          measures its parent and writes a pixel width onto itself, and a grid
          child defaults to min-width:auto, so without these the chart can
          measure wide once and ratchet the column outward for good. */}
      <div
        className="min-w-0 overflow-hidden"
        style={{ height: PANEL_CHART_HEIGHT }}
      >
        {!hasData ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyNote}
          </p>
        ) : showTable ? (
          <SpreadTable slices={slices} rowLabel={rowLabel} note={tableNote} />
        ) : (
          <Suspense fallback={<ChartSkeleton />}>
            <SpreadCharts kind={kind} slices={slices} height={PANEL_CHART_HEIGHT} />
          </Suspense>
        )}
      </div>
    </section>
  );
}

/** Exactly the reserved box, so the chart lands into the space it already had. */
function ChartSkeleton() {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
      style={{ height: PANEL_CHART_HEIGHT }}
      aria-hidden="true"
    />
  );
}

function SpreadTable({
  slices,
  rowLabel,
  note,
}: {
  slices: Slice[];
  rowLabel: string;
  note?: string;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1 text-left font-medium">
              {rowLabel}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Cards
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {slices.map(slice => (
            <tr key={slice.key}>
              <td className="py-1 pr-2 text-foreground">{slice.label}</td>
              <td className="py-1 text-right tabular-nums text-foreground">
                {slice.copies.toLocaleString()}
              </td>
              <td className="py-1 text-right tabular-nums text-muted-foreground">
                {formatPriceOrUnknown(slice.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="pt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
