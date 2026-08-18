import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ownedValueUSD } from '@/features/collection/value';
import {
  Layers,
  Library,
  Package,
  Sparkles,
  Heart,
  Activity,
  Crown,
  TrendingUp
} from 'lucide-react';

interface UserStats {
  collectionCards: number;
  collectionValue: number;
  uniqueCards: number;
  storageContainers: number;
  totalDecks: number;
  publicDecks: number;
  commanderDecks: number;
  aiBuildsCount: number;
  wishlistItems: number;
  activityCount: number;
  favoriteDecks: number;
  subscriptionTier: string;
}

interface UserDetailsProps {
  userId: string;
}

/**
 * One user's record for admins. Admins link these to each other, so it lives at
 * /admin/users/:userId rather than inside a dialog that has no URL.
 */
export function UserDetails({ userId }: UserDetailsProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const loadUserStats = async () => {
      setLoading(true);
      try {
        const [
          collectionResult,
          storageResult,
          decksResult,
          buildLogsResult,
          wishlistResult,
          activityResult,
          favoritesResult,
          subscriptionResult
        ] = await Promise.all([
          // Live card prices, not the stale denormalised `price_usd` snapshot —
          // see `ownedValueUSD`. Reading that column here reported the same
          // collection 31.5% below what /collection showed for it.
          supabase.from('user_collections').select('quantity, foil, cards(prices)').eq('user_id', userId),
          supabase.from('storage_containers').select('id').eq('user_id', userId),
          supabase.from('user_decks').select('id, is_public, format').eq('user_id', userId),
          supabase.from('build_logs').select('id').eq('user_id', userId),
          supabase.from('wishlist').select('id').eq('user_id', userId),
          supabase.from('activity_log').select('id').eq('user_id', userId),
          supabase.from('favorite_decks').select('deck_id').eq('user_id', userId),
          supabase
            .from('user_subscriptions')
            .select('tier')
            .eq('user_id', userId)
            .eq('is_active', true)
            .maybeSingle()
        ]);

        if (cancelled) return;

        const collectionData = (collectionResult.data || []) as Array<{
          quantity: number | null;
          foil: number | null;
          cards: { prices: unknown } | null;
        }>;
        const decksData = decksResult.data || [];

        setStats({
          collectionCards: collectionData.reduce(
            (sum, item) => sum + (item.quantity || 0) + (item.foil || 0),
            0
          ),
          collectionValue: collectionData.reduce(
            (sum, item) => sum + ownedValueUSD(item.cards?.prices, item.quantity || 0, item.foil || 0),
            0
          ),
          uniqueCards: collectionData.length,
          storageContainers: storageResult.data?.length || 0,
          totalDecks: decksData.length,
          publicDecks: decksData.filter(d => d.is_public).length,
          commanderDecks: decksData.filter(d => d.format === 'commander').length,
          aiBuildsCount: buildLogsResult.data?.length || 0,
          wishlistItems: wishlistResult.data?.length || 0,
          activityCount: activityResult.data?.length || 0,
          favoriteDecks: favoritesResult.data?.length || 0,
          subscriptionTier: subscriptionResult.data?.tier || 'free'
        });
      } catch (error) {
        console.error('Failed to load user stats:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadUserStats();
    return () => { cancelled = true; };
  }, [userId]);

  const StatCard = ({ icon: Icon, label, value, subValue }: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    subValue?: string;
  }) => (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
      <div className="rounded-md bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
        {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return <p className="py-8 text-center text-muted-foreground">Failed to load user stats</p>;
  }

  return (
    <div className="space-y-4">
      <Badge
        variant={
          stats.subscriptionTier === 'unlimited'
            ? 'default'
            : stats.subscriptionTier === 'pro'
              ? 'secondary'
              : 'secondary'
        }
      >
        {stats.subscriptionTier.charAt(0).toUpperCase() + stats.subscriptionTier.slice(1)}
      </Badge>

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Library className="h-4 w-4" />
          Collection
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={Layers}
            label="Total Cards"
            value={stats.collectionCards.toLocaleString()}
            subValue={`${stats.uniqueCards.toLocaleString()} unique`}
          />
          <StatCard
            icon={TrendingUp}
            label="Collection Value"
            value={`$${stats.collectionValue.toFixed(2)}`}
          />
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Crown className="h-4 w-4" />
          Decks
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={Library}
            label="Total Decks"
            value={stats.totalDecks}
            subValue={`${stats.publicDecks} public`}
          />
          <StatCard icon={Crown} label="Commander Decks" value={stats.commanderDecks} />
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          AI &amp; Features
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard icon={Sparkles} label="AI Decks Built" value={stats.aiBuildsCount} />
          <StatCard icon={Heart} label="Favorite Decks" value={stats.favoriteDecks} />
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Package className="h-4 w-4" />
          Storage &amp; Activity
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard icon={Package} label="Storage Containers" value={stats.storageContainers} />
          <StatCard icon={Heart} label="Wishlist Items" value={stats.wishlistItems} />
          <StatCard
            icon={Activity}
            label="Activity Events"
            value={stats.activityCount.toLocaleString()}
          />
        </div>
      </div>

      <p className="pt-2 text-xs text-muted-foreground">
        User ID: <code className="rounded bg-muted px-1">{userId}</code>
      </p>
    </div>
  );
}
