import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Crown, Zap, Sparkles, Users, TrendingUp, Infinity, RefreshCw, Loader2 } from 'lucide-react';
import { useSubscriptionLimits, SubscriptionTier } from '@/hooks/useFeatureAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionStats {
  tier: SubscriptionTier;
  count: number;
}

export function SubscriptionManager() {
  const { data: limits, isLoading: limitsLoading, refetch, error: limitsError } = useSubscriptionLimits();
  
  // Get subscription statistics - this may fail for non-admins, handle gracefully
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['subscription-stats'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('tier')
          .eq('is_active', true);
        
        if (error) {
          console.warn('Could not fetch subscription stats:', error.message);
          return null;
        }
        
        const counts: Record<SubscriptionTier, number> = { free: 0, pro: 0, unlimited: 0 };
        data?.forEach(sub => {
          counts[sub.tier as SubscriptionTier]++;
        });
        
        return [
          { tier: 'free' as SubscriptionTier, count: counts.free },
          { tier: 'pro' as SubscriptionTier, count: counts.pro },
          { tier: 'unlimited' as SubscriptionTier, count: counts.unlimited },
        ];
      } catch (e) {
        console.warn('Subscription stats error:', e);
        return null;
      }
    },
  });

  // Default stats if query fails
  const displayStats = stats || [
    { tier: 'free' as SubscriptionTier, count: 0 },
    { tier: 'pro' as SubscriptionTier, count: 0 },
    { tier: 'unlimited' as SubscriptionTier, count: 0 },
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

  if (limitsLoading || statsLoading) {
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

  const getTierColor = (tier: SubscriptionTier) => {
    const colors = {
      free: 'from-emerald-500 to-emerald-600',
      pro: 'from-blue-500 to-blue-600',
      unlimited: 'from-purple-500 to-purple-600',
    };
    return colors[tier];
  };

  const formatLimit = (value: number) => {
    if (value === -1) return <Infinity className="h-4 w-4 text-muted-foreground" />;
    return value.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Subscription Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {displayStats.map(({ tier, count }) => {
          const Icon = getTierIcon(tier);
          return (
            <Card key={tier} className="relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${getTierColor(tier)} opacity-5`} />
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{tier} Users</p>
                    <p className="text-3xl font-bold">{count}</p>
                  </div>
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${getTierColor(tier)}`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                    Free
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Zap className="h-4 w-4 text-blue-500" />
                    Pro
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Crown className="h-4 w-4 text-purple-500" />
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

      {/* Pricing Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Subscription Tiers
          </CardTitle>
          <CardDescription>
            Estimated pricing for each subscription tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Free Tier */}
            <div className="p-6 border rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-emerald-500" />
                  <h3 className="font-semibold">Free</h3>
                </div>
                <p className="text-3xl font-bold mb-1">$0</p>
                <p className="text-sm text-muted-foreground mb-4">Forever free</p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• 5 AI deck builds/month</li>
                  <li>• 50 card scans/month</li>
                  <li>• 10 decks maximum</li>
                  <li>• 1,000 collection cards</li>
                </ul>
              </div>
            </div>

            {/* Pro Tier */}
            <div className="p-6 border rounded-lg relative overflow-hidden border-blue-500/30">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-600/5" />
              <Badge className="absolute top-2 right-2 bg-blue-500">Popular</Badge>
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-5 w-5 text-blue-500" />
                  <h3 className="font-semibold">Pro</h3>
                </div>
                <p className="text-3xl font-bold mb-1">$9.99<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm text-muted-foreground mb-4">For serious players</p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• 50 AI deck builds/month</li>
                  <li>• 500 card scans/month</li>
                  <li>• 100 decks</li>
                  <li>• 50,000 collection cards</li>
                  <li>• Advanced analytics</li>
                  <li>• Deck simulation</li>
                </ul>
              </div>
            </div>

            {/* Unlimited Tier */}
            <div className="p-6 border rounded-lg relative overflow-hidden border-purple-500/30">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-600/5" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-5 w-5 text-purple-500" />
                  <h3 className="font-semibold">Unlimited</h3>
                </div>
                <p className="text-3xl font-bold mb-1">$24.99<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm text-muted-foreground mb-4">No limits, ever</p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Unlimited AI features</li>
                  <li>• Unlimited card scans</li>
                  <li>• Unlimited decks</li>
                  <li>• Unlimited collection</li>
                  <li>• API access</li>
                  <li>• TCGPlayer sync</li>
                  <li>• Priority support</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
