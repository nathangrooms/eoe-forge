// AI Visual Display Component
// Renders charts, tables, and graphs from structured AI data

import { lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, Table2 } from 'lucide-react';

export interface ChartData {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: any[];
  xKey?: string;
  yKey?: string;
  nameKey?: string;
  colors?: string[];
}

export interface TableData {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface VisualData {
  charts?: ChartData[];
  tables?: TableData[];
}

interface AIVisualDisplayProps {
  data: VisualData;
  compact?: boolean;
}

/**
 * The charting library is fetched only when an answer actually carries a chart.
 *
 * Recharts is 377 kB raw / 104 kB gzipped and it used to be part of the first
 * load of every page that can reach this panel: Tutor, the deck analysis panel
 * and the generated deck list. A chart is now drawn only when the question is
 * about the thing the chart shows, so most answers draw none at all and the
 * reader was waiting on a library that never rendered. The box below is
 * reserved at its final height before this arrives, so nothing moves when it
 * lands.
 */
const AIVisualChart = lazy(() => import('./AIVisualChart'));

export function AIVisualDisplay({ data, compact = false }: AIVisualDisplayProps) {
  if (!data.charts && !data.tables) return null;

  return (
    <div className="space-y-4 mt-4">
      {/* Charts */}
      {data.charts?.map((chart, idx) => (
        <Card key={`chart-${idx}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {chart.type === 'bar' && <BarChart3 className="h-4 w-4 text-spacecraft" />}
              {chart.type === 'pie' && <PieChartIcon className="h-4 w-4 text-celestial" />}
              {chart.type === 'line' && <LineChartIcon className="h-4 w-4 text-cosmic" />}
              {chart.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={compact ? 'h-48' : 'h-64'}>
              <Suspense
                fallback={<Skeleton className={compact ? 'h-48 w-full' : 'h-64 w-full'} />}
              >
                <AIVisualChart chart={chart} compact={compact} />
              </Suspense>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Tables */}
      {data.tables?.map((table, idx) => (
        <Card key={`table-${idx}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Table2 className="h-4 w-4 text-spacecraft" />
              {table.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {table.headers.map((header, hIdx) => (
                      <TableHead key={hIdx} className="font-semibold text-spacecraft">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row, rIdx) => (
                    <TableRow key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <TableCell key={cIdx} className="text-sm">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
