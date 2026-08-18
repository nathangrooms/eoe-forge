import { useEffect, useState } from 'react';
import {
  Activity,
  Camera,
  CheckCircle2,
  Eye,
  Heart,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getRecentActivity } from '@/lib/activityLogger';
import { formatTimeAgo } from '@/features/dashboard/value';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  at: string;
}

// Explicit map keyed by the activity types activityLogger actually writes.
// The previous `import * as Icons` lookup pulled the whole lucide set into the
// bundle and defeated tree-shaking.
const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  deck_created: Plus,
  deck_updated: Pencil,
  deck_deleted: Trash2,
  deck_favorited: Star,
  deck_opened: Eye,
  card_added: Plus,
  collection_import: Upload,
  wishlist_added: Heart,
  listing_created: Tag,
  sale_completed: CheckCircle2,
  ai_build_run: Sparkles,
  scan_completed: Camera,
};

export function RecentActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getRecentActivity(8);
        if (!cancelled) setActivities(data);
      } catch (error) {
        console.error('Error loading activities:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="h-full">
      <CardHeader className="space-y-0">
        <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <ul className="divide-y divide-border border-t border-border">
            {[0, 1, 2, 3].map(i => (
              <li key={i} className="flex items-start gap-3 py-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : activities.length === 0 ? (
          <div className="border-t border-border py-10 text-center">
            <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Opening a deck, scanning cards or importing a collection shows up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {activities.map(activity => {
              const Icon = ACTIVITY_ICONS[activity.type] ?? Activity;
              return (
                <li key={activity.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{activity.title}</p>
                    {activity.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{activity.subtitle}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatTimeAgo(activity.at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
