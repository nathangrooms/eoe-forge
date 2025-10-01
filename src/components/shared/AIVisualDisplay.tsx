// AI Visual Display Component
// Renders charts, tables, and graphs from structured AI data

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Tooltip, Legend } from 'recharts';
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

const DEFAULT_COLORS = [
  'hsl(var(--spacecraft))',
  'hsl(var(--celestial))',
  'hsl(var(--cosmic))',
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
];

export function AIVisualDisplay({ data, compact = false }: AIVisualDisplayProps) {
  if (!data.charts && !data.tables) return null;

  return (
    <div className="space-y-4 mt-4">
      {/* Charts */}
      {data.charts?.map((chart, idx) => (
        <Card key={`chart-${idx}`} className="border-spacecraft/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {chart.type === 'bar' && <BarChart3 className="h-4 w-4 text-spacecraft" />}
              {chart.type === 'pie' && <PieChartIcon className="h-4 w-4 text-celestial" />}
              {chart.type === 'line' && <LineChartIcon className="h-4 w-4 text-cosmic" />}
              {chart.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={compact ? "h-48" : "h-64"}>
              {chart.type === 'bar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data}>
                    <XAxis 
                      dataKey={chart.xKey || 'name'} 
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar 
                      dataKey={chart.yKey || 'value'} 
                      fill={chart.colors?.[0] || DEFAULT_COLORS[0]}
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {chart.type === 'pie' && (
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
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {chart.type === 'line' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.data}>
                    <XAxis 
                      dataKey={chart.xKey || 'name'} 
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey={chart.yKey || 'value'} 
                      stroke={chart.colors?.[0] || DEFAULT_COLORS[0]}
                      strokeWidth={2}
                      dot={{ fill: chart.colors?.[0] || DEFAULT_COLORS[0] }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Tables */}
      {data.tables?.map((table, idx) => (
        <Card key={`table-${idx}`} className="border-spacecraft/20">
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
