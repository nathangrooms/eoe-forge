import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Crown, Zap, Sparkles, TrendingUp, Infinity, RefreshCw, Loader2 } from 'lucide-react';
import { useSubscriptionLimits, SubscriptionTier } from '@/hooks/useFeatureAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TierCount {
  tier: SubscriptionTier;
  count: number | null;
}

export function SubscriptionManager() {
  const { data: limits, isLoading: limitsLoading, refetch, error: limitsError } = useSubscriptionLimits();

  /**
   * Head-count per tier.
   *
   * Counting `user_subscriptions` rows alone undercounts free: a row is only
   * written when somebody is *given* a tier, and `Settings` treats an account
   * with no row as free — so a platform with 13 accounts and 1 paid row
   * reported "Free 0, Pro 1" and lost twelve people. Free is therefore
   * everyone who is not currently on a paid tier, which needs the platform head
   * count from `admin_platform_stats()` (SECURITY DEFINER, admin-gated) rather
   * than a `profiles` read that RLS would scope to the admin's own row.
   */
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['subscription-tier-counts'],
    queryFn: async (): Promise<{ counts: TierCount[]; partial: boolean }> => {
      const [subsResult, platformResult] = await Promise.all([
        supabase.from('user_subscriptions').select('tier').eq('is_active', true),
        supabase.rpc('admin_platform_stats'),
      ]);

      if (subsResult.error) {
        console.warn('Could not read subscriptions:', subsResult.error.message);
        return {
          counts: [
            { tier: 'free', count: null },
            { tier: 'pro', count: null },
            { tier: 'unlimited', count: null },
          ],
          partial: true,
        };
      }

      const paid = { pro: 0, unlimited: 0 };
      let explicitFree = 0;
      for (const row of subsResult.data ?? []) {
        if (row.tier === 'pro') paid.pro += 1;
        else if (row.tier === 'unlimited') paid.unlimited += 1;
        else explicitFree += 1;
      }

      const platform = platformResult.error
        ? null
        : (platformResult.data as Record<string, unknown> | null);
      const totalUsers = platform ? Number(platform.users) : NaN;

      // With no reliable head count, show the rows we can prove rather than a
      // derived free number that would be wrong.
      const free = Number.isFinite(totalUsers)
        ? Math.max(0, totalUsers - paid.pro - paid.unlimited)
        : null;

      return {
        counts: [
          { tier: 'free', count: free ?? explicitFree },
          { tier: 'pro', count: paid.pro },
          { tier: 'unlimited', count: paid.unlimited },
        ],
        partial: free === null,
      };
    },
  });

  const displayStats: TierCount[] = stats?.counts ?? [
    { tier: 'free', count: null },
    { tier: 'pro', count: null },
    { tier: 'unlimited', count: null },
  ];

  // Build tier comparison from limits data
  const tiers: SubscriptionTier[] = ['free', 'pro', 'unlimited'];
  const features = limits ? [...new Set(limits.map(l => l.feature_key))] : [];
  
  const getLimitForTier = (featureKey: string, tier: SubscriptionTier) => {
    const limit = limits?.find(l => l.feature_key === featureKey && l.tier === tier);
    return limit?.limit_value ?? 0;
  };
  
  const getDescriptionForFeature = (featureKey: string) => {
    const limit = limits?.find(l => l.feature_key === featureKey);
    return limit?.description ?? featureKey;
  };

  // Never block on loading - show content with fallback data
  const isFullyLoading = limitsLoading && statsLoading && !limits && !stats;
  
  if (isFullyLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (limitsError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Could not load subscription data</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getTierIcon = (tier: SubscriptionTier) => {
    const icons = {
      free: Sparkles,
      pro: Zap,
      unlimited: Crown,
    };
    return icons[tier];
  };

  /**
   * Tiers escalate in surface weight, not in hue. Emerald/blue/purple gradients
   * carried no meaning a reader could decode and broke the monochrome rule; the
   * ladder from muted to solid foreground reads as a ladder on its own.
   */
  const getTierSurface = (tier: SubscriptionTier) => {
    const surfaces = {
      free: 'bg-muted text-muted-foreground',
      pro: 'bg-foreground/15 text-foreground',
      unlimited: 'bg-foreground text-background',
    };
    return surfaces[tier];
  };

  const formatLimit = (value: number) => {
    if (value === -1) return <Infinity className="h-4 w-4 text-muted-foreground" />;
    return value.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Subscription Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {displayStats.map(({ tier, count }) => {
          const Icon = getTierIcon(tier);
          return (
            <Card key={tier} className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm capitalize text-muted-foreground">{tier} accounts</p>
                    {statsLoading ? (
                      <Skeleton className="mt-2 h-8 w-16" />
                    ) : (
                      <p className="text-3xl font-semibold tabular-nums">
                        {count === null ? '—' : count.toLocaleString()}
                      </p>
                    )}
                    {tier === 'free' && !statsLoading && count !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Everyone not on a paid tier
                      </p>
                    )}
                  </div>
                  <div className={`shrink-0 rounded-lg p-3 ${getTierSurface(tier)}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {stats?.partial && (
        <div role="alert" className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          The platform head count could not be read, so &ldquo;Free&rdquo; counts only accounts
          with an explicit free subscription row rather than everyone without a paid tier.
        </div>
      )}

      {/* Tier Comparison Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Subscription Limits
              </CardTitle>
              <CardDescription>
                Compare feature limits across subscription tiers
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    Free
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    Pro
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Crown className="h-4 w-4 text-foreground" />
                    Unlimited
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No subscription limits configured
                  </TableCell>
                </TableRow>
              ) : features.map((featureKey) => (
                <TableRow key={featureKey}>
                  <TableCell className="font-medium">
                    {getDescriptionForFeature(featureKey)}
                  </TableCell>
                  {tiers.map((tier) => (
                    <TableCell key={tier} className="text-center">
                      <Badge variant="outline" className="min-w-16 justify-center">
                        {formatLimit(getLimitForTier(featureKey, tier))}
                      </Badge>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* The "Subscription Tiers" pricing panel that used to sit here was three
          hand-written cards: $0 / $9.99 / $24.99 and a bulleted feature list per
          tier. No price is stored anywhere in this product, and the bullets were
          a second, hardcoded copy of the limits table directly above — already
          drifted from it, and unable to follow an edit to `subscription_limits`.
          The live table is the only version of that information now. */}
    </div>
  );
}
