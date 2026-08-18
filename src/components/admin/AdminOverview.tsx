import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Database,
  Heart,
  Layers,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * The admin Overview.
 *
 * Two things were wrong here and both were about trust rather than taste.
 *
 * 1. **Scope.** `Decks` and `Collection Items` were counted straight from
 *    `user_decks` / `user_collections` in the browser, which RLS scopes to the
 *    signed-in admin. The tile row therefore read "Users 13" (global) beside
 *    "Decks 9" (one person's) as if both described the platform. They now come
 *    from `admin_platform_stats()`, a SECURITY DEFINER function that refuses
 *    anyone whose `profiles.is_admin` is false. When that function is missing
 *    or refuses, the tiles say so instead of quietly showing a personal number.
 * 2. **Colour.** The four tiles used `bg-blue-500/10 text-blue-500`,
 *    `bg-purple-500/10` and `bg-amber-500/10`. Hue in this product means one
 *    thing — Magic semantics — and none of these are that.
 *
 * It also no longer repeats the whole Card Sync Dashboard; the Sync tab owns
 * that. Overview carries a one-line sync health summary and hands off.
 */

interface PlatformStats {
  cards: number;
  users: number;
  decks: number;
  deck_cards: number;
  collection_items: number;
  collection_cards: number;
  wishlist_items: number;
}

interface SyncSnapshot {
  status: string;
  recordsProcessed: number;
  totalRecords: number;
  lastSync: string | null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-3 truncate text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </div>
      )}
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function AdminOverview({ onOpenSync }: { onOpenSync: () => void }) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [sync, setSync] = useState<SyncSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setStatsError(null);

    const [statsResult, syncResult] = await Promise.all([
      supabase.rpc('admin_platform_stats'),
      supabase
        .from('sync_status')
        .select('status, records_processed, total_records, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle(),
    ]);

    if (statsResult.error || !statsResult.data) {
      console.error('admin_platform_stats failed:', statsResult.error);
      setStats(null);
      setStatsError(
        statsResult.error?.message ?? 'Platform statistics are unavailable right now.'
      );
    } else {
      const raw = statsResult.data as Record<string, unknown>;
      setStats({
        cards: num(raw.cards),
        users: num(raw.users),
        decks: num(raw.decks),
        deck_cards: num(raw.deck_cards),
        collection_items: num(raw.collection_items),
        collection_cards: num(raw.collection_cards),
        wishlist_items: num(raw.wishlist_items),
      });
    }

    const row = syncResult.data;
    setSync(
      row
        ? {
            status: String(row.status ?? 'unknown'),
            recordsProcessed: num(row.records_processed),
            totalRecords: num(row.total_records),
            lastSync: row.last_sync ?? null,
          }
        : null
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const count = (value: number) => value.toLocaleString();
  const percent =
    sync && sync.totalRecords > 0
      ? Math.min(100, Math.round((sync.recordsProcessed / sync.totalRecords) * 100))
      : null;

  /**
   * "Stuck" is the same rule the sync dashboard applies: still marked running an
   * hour after its last heartbeat.
   */
  const stuck =
    sync?.status === 'running' &&
    sync.lastSync != null &&
    Date.now() - new Date(sync.lastSync).getTime() > 3_600_000;

  return (
    <div className="space-y-4">
      {statsError && (
        // No `<Alert>`: that primitive carries a border in its base class and
        // the destructive variant adds a hard red one. Tint plus text instead.
        <div role="alert" className="rounded-lg bg-destructive/15 px-4 py-3 text-sm text-destructive">
          Platform statistics could not be read ({statsError}). The tiles below are blank rather
          than showing your own rows as if they were platform totals.
        </div>
      )}

      {/* Five across only once there is room for five. At 1024, with the rail
          taking 256px, each tile was ~150px wide and every hint truncated to
          "Rows in the card…" / "Across every acc…". */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Cards"
          value={stats ? count(stats.cards) : '—'}
          hint="Rows in the card database"
          icon={Database}
          loading={loading}
        />
        <StatTile
          label="Users"
          value={stats ? count(stats.users) : '—'}
          hint="Registered profiles"
          icon={Users}
          loading={loading}
        />
        <StatTile
          label="Decks"
          value={stats ? count(stats.decks) : '—'}
          hint={stats ? `${count(stats.deck_cards)} deck cards` : 'Across every account'}
          icon={Layers}
          loading={loading}
        />
        <StatTile
          label="Collection rows"
          value={stats ? count(stats.collection_items) : '—'}
          hint={stats ? `${count(stats.collection_cards)} cards owned` : 'Across every account'}
          icon={ClipboardList}
          loading={loading}
        />
        <StatTile
          label="Wishlist rows"
          value={stats ? count(stats.wishlist_items) : '—'}
          hint="Across every account"
          icon={Heart}
          loading={loading}
        />
      </div>

      <div>
        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Card sync
            </span>
            <Activity className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>

          {loading ? (
            <Skeleton className="mt-3 h-8 w-40" />
          ) : sync ? (
            <>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={cn(
                    'text-2xl font-semibold uppercase tracking-tight',
                    stuck ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {sync.status}
                </span>
                {percent !== null && (
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {percent}% &middot; {count(sync.recordsProcessed)} /{' '}
                    {count(sync.totalRecords)}
                  </span>
                )}
              </div>

              {percent !== null && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', stuck ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}

              <p className="mt-2 text-xs text-muted-foreground">
                {stuck ? (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Running for over an hour without progress.
                  </span>
                ) : sync.lastSync ? (
                  `Last heartbeat ${new Date(sync.lastSync).toLocaleString()}`
                ) : (
                  'Never run'
                )}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No sync has been recorded yet.</p>
          )}

          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenSync}>
              Open sync dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
