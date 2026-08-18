import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, CircleDashed,
  ClipboardList, Loader2, Pause, RefreshCw, Rocket, ScrollText, Search, XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ types */
/* The dev_* tables are intentionally absent from the generated Supabase
   types (they are admin-only tooling), so they are typed locally here. */

type DevStatus = 'planned' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled';
type DevPriority = 'p0' | 'p1' | 'p2' | 'p3';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

interface Workstream {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: DevStatus;
  priority: DevPriority;
  sort_order: number;
}

interface DevTask {
  id: string;
  workstream_id: string | null;
  title: string;
  detail: string | null;
  status: DevStatus;
  priority: DevPriority;
  area: string | null;
  files: string[];
  sort_order: number;
  completed_at: string | null;
}

interface Finding {
  id: string;
  area: string;
  title: string;
  file: string | null;
  severity: Severity | null;
  category: string | null;
  detail: string | null;
  recommendation: string | null;
  status: DevStatus;
}

interface DevLog {
  id: string;
  level: LogLevel;
  event: string;
  detail: string | null;
  created_at: string;
}

/* The dev_* tables are not in the generated Database type. */
const db = supabase as any;

/* ----------------------------------------------------------- presentation */

const STATUS_META: Record<DevStatus, { label: string; icon: React.ElementType; className: string }> = {
  planned: { label: 'Planned', icon: CircleDashed, className: 'text-muted-foreground' },
  in_progress: { label: 'In progress', icon: Loader2, className: 'text-primary' },
  blocked: { label: 'Blocked', icon: Pause, className: 'text-destructive' },
  review: { label: 'In review', icon: Search, className: 'text-primary' },
  done: { label: 'Done', icon: CheckCircle2, className: 'text-primary' },
  cancelled: { label: 'Cancelled', icon: XCircle, className: 'text-muted-foreground' },
};

const PRIORITY_META: Record<DevPriority, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  p0: { label: 'P0', variant: 'destructive' },
  p1: { label: 'P1', variant: 'default' },
  p2: { label: 'P2', variant: 'secondary' },
  p3: { label: 'P3', variant: 'outline' },
};

const SEVERITY_META: Record<Severity, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  critical: { label: 'Critical', variant: 'destructive' },
  high: { label: 'High', variant: 'default' },
  medium: { label: 'Medium', variant: 'secondary' },
  low: { label: 'Low', variant: 'outline' },
};

const LOG_META: Record<LogLevel, { icon: React.ElementType; className: string }> = {
  debug: { icon: CircleDashed, className: 'text-muted-foreground' },
  info: { icon: Activity, className: 'text-muted-foreground' },
  success: { icon: CheckCircle2, className: 'text-primary' },
  warn: { icon: AlertTriangle, className: 'text-primary' },
  error: { icon: XCircle, className: 'text-destructive' },
};

function StatTile({
  label, value, sub, icon: Icon, tone = 'default',
}: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ElementType; tone?: 'default' | 'alert';
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg shrink-0', tone === 'alert' ? 'bg-destructive/10' : 'bg-primary/10')}>
            <Icon className={cn('h-4 w-4', tone === 'alert' ? 'text-destructive' : 'text-primary')} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/80 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: DevStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', meta.className)}>
      <Icon className={cn('h-3.5 w-3.5', status === 'in_progress' && 'animate-spin')} />
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------- workstreams */

function WorkstreamRow({ ws, tasks }: { ws: Workstream; tasks: DevTask[] }) {
  const [open, setOpen] = useState(false);
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger className="w-full text-left p-4 hover:bg-muted/50 transition-colors rounded-lg">
          <div className="flex items-start gap-3">
            <ChevronRight className={cn('h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={PRIORITY_META[ws.priority].variant}>{PRIORITY_META[ws.priority].label}</Badge>
                <span className="font-medium">{ws.title}</span>
                <StatusPill status={ws.status} />
              </div>
              {ws.description && (
                <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{ws.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <Progress value={pct} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {done}/{tasks.length}
                </span>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div className="p-4 pt-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No tasks yet — this workstream is scoped but not broken down.
              </p>
            ) : (
              <ul className="space-y-2">
                {tasks.map(t => (
                  <li key={t.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5"><StatusPill status={t.status} /></span>
                    <div className="min-w-0">
                      <span className={cn(t.status === 'done' && 'line-through text-muted-foreground')}>
                        {t.title}
                      </span>
                      {t.detail && <p className="text-xs text-muted-foreground mt-0.5">{t.detail}</p>}
                      {t.files?.length > 0 && (
                        <p className="text-xs font-mono text-muted-foreground/80 mt-1 break-all">
                          {t.files.join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------- main */

export function DevConsole() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [logs, setLogs] = useState<DevLog[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, t, f, l] = await Promise.all([
        db.from('dev_workstreams').select('*').order('sort_order'),
        db.from('dev_tasks').select('*').order('sort_order'),
        db.from('dev_findings').select('*').order('created_at', { ascending: false }),
        db.from('dev_logs').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      const firstError = w.error || t.error || f.error || l.error;
      if (firstError) throw firstError;
      setWorkstreams(w.data ?? []);
      setTasks(t.data ?? []);
      setFindings(f.data ?? []);
      setLogs(l.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load dev console data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tasksByWorkstream = useMemo(() => {
    const map = new Map<string, DevTask[]>();
    for (const t of tasks) {
      if (!t.workstream_id) continue;
      const arr = map.get(t.workstream_id) ?? [];
      arr.push(t);
      map.set(t.workstream_id, arr);
    }
    return map;
  }, [tasks]);

  const stats = useMemo(() => {
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const openFindings = findings.filter(f => f.status !== 'done' && f.status !== 'cancelled').length;
    const criticalFindings = findings.filter(
      f => (f.severity === 'critical' || f.severity === 'high') && f.status !== 'done' && f.status !== 'cancelled'
    ).length;
    const activeWs = workstreams.filter(w => w.status === 'in_progress').length;
    return {
      overallPct: tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0,
      doneTasks, totalTasks: tasks.length, openFindings, criticalFindings,
      activeWs, totalWs: workstreams.length,
    };
  }, [tasks, findings, workstreams]);

  const findingsBySeverity = useMemo(() => {
    const order: Severity[] = ['critical', 'high', 'medium', 'low'];
    return [...findings].sort(
      (a, b) => order.indexOf(a.severity ?? 'low') - order.indexOf(b.severity ?? 'low')
    );
  }, [findings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading dev console…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Dev console unavailable
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Overhaul Dev Console
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Persistent plan, progress and logs for the DeckMatrix rebuild. Admin only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={Rocket}
          label="Overall progress"
          value={`${stats.overallPct}%`}
          sub={`${stats.doneTasks}/${stats.totalTasks} tasks complete`}
        />
        <StatTile
          icon={ClipboardList}
          label="Workstreams"
          value={stats.totalWs}
          sub={`${stats.activeWs} in progress`}
        />
        <StatTile
          icon={Search}
          label="Open findings"
          value={stats.openFindings}
          sub={`${findings.length} total logged`}
        />
        <StatTile
          icon={AlertTriangle}
          tone={stats.criticalFindings > 0 ? 'alert' : 'default'}
          label="Critical / high"
          value={stats.criticalFindings}
          sub="unresolved"
        />
      </div>

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Plan
          </TabsTrigger>
          <TabsTrigger value="findings" className="gap-2">
            <Search className="h-4 w-4" /> Findings
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ScrollText className="h-4 w-4" /> Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="mt-4 space-y-3">
          {workstreams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workstreams defined yet.</p>
          ) : (
            workstreams.map(ws => (
              <WorkstreamRow key={ws.id} ws={ws} tasks={tasksByWorkstream.get(ws.id) ?? []} />
            ))
          )}
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No findings logged yet. The audit populates this table.
            </p>
          ) : (
            <div className="space-y-3">
              {findingsBySeverity.map(f => (
                <Card key={f.id}>
                  <CardContent className="pt-5">
                    <div className="flex flex-wrap items-center gap-2">
                      {f.severity && (
                        <Badge variant={SEVERITY_META[f.severity].variant}>
                          {SEVERITY_META[f.severity].label}
                        </Badge>
                      )}
                      <Badge variant="outline">{f.area}</Badge>
                      {f.category && (
                        <span className="text-xs text-muted-foreground">{f.category}</span>
                      )}
                      <span className="ml-auto"><StatusPill status={f.status} /></span>
                    </div>
                    <p className="font-medium mt-2">{f.title}</p>
                    {f.file && (
                      <p className="text-xs font-mono text-muted-foreground mt-1 break-all">{f.file}</p>
                    )}
                    {f.detail && <p className="text-sm text-muted-foreground mt-2">{f.detail}</p>}
                    {f.recommendation && (
                      <div className="mt-3 rounded-md bg-muted/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                        <p className="text-sm">{f.recommendation}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px]">
                <ul className="divide-y">
                  {logs.length === 0 && (
                    <li className="p-4 text-sm text-muted-foreground">No log entries yet.</li>
                  )}
                  {logs.map(l => {
                    const meta = LOG_META[l.level] ?? LOG_META.info;
                    const Icon = meta.icon;
                    return (
                      <li key={l.id} className="flex items-start gap-3 p-4">
                        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', meta.className)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium text-sm">{l.event}</span>
                            <time className="text-xs text-muted-foreground tabular-nums">
                              {new Date(l.created_at).toLocaleString()}
                            </time>
                          </div>
                          {l.detail && (
                            <p className="text-sm text-muted-foreground mt-1">{l.detail}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DevConsole;
