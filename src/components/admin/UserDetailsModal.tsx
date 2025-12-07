import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Layers, 
  Library, 
  Package, 
  Sparkles, 
  Heart, 
  Activity,
  Calendar,
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

interface UserDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string | null;
}

export function UserDetailsModal({ open, onOpenChange, userId, username }: UserDetailsModalProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && userId) {
      loadUserStats();
    }
  }, [open, userId]);

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
        // Collection stats
        supabase
          .from('user_collections')
          .select('quantity, price_usd')
          .eq('user_id', userId),
        // Storage containers
        supabase
          .from('storage_containers')
          .select('id')
          .eq('user_id', userId),
        // Decks
        supabase
          .from('user_decks')
          .select('id, is_public, format')
          .eq('user_id', userId),
        // AI Build logs
        supabase
          .from('build_logs')
          .select('id')
          .eq('user_id', userId),
        // Wishlist
        supabase
          .from('wishlist')
          .select('id')
          .eq('user_id', userId),
        // Activity
        supabase
          .from('activity_log')
          .select('id')
          .eq('user_id', userId),
        // Favorites
        supabase
          .from('favorite_decks')
          .select('deck_id')
          .eq('user_id', userId),
        // Subscription
        supabase
          .from('user_subscriptions')
          .select('tier')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle()
      ]);

      const collectionData = collectionResult.data || [];
      const decksData = decksResult.data || [];

      setStats({
        collectionCards: collectionData.reduce((sum, item) => sum + (item.quantity || 0), 0),
        collectionValue: collectionData.reduce((sum, item) => sum + ((item.price_usd || 0) * (item.quantity || 1)), 0),
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
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, label, value, subValue }: { 
    icon: React.ElementType; 
    label: string; 
    value: string | number;
    subValue?: string;
  }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className="p-2 rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
        {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {username || 'Unknown User'}
            {stats && (
              <Badge variant={stats.subscriptionTier === 'unlimited' ? 'default' : stats.subscriptionTier === 'pro' ? 'secondary' : 'outline'}>
                {stats.subscriptionTier.charAt(0).toUpperCase() + stats.subscriptionTier.slice(1)}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Library className="h-4 w-4" />
                Collection
              </h4>
              <div className="grid grid-cols-2 gap-3">
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
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Crown className="h-4 w-4" />
                Decks
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Library}
                  label="Total Decks"
                  value={stats.totalDecks}
                  subValue={`${stats.publicDecks} public`}
                />
                <StatCard
                  icon={Crown}
                  label="Commander Decks"
                  value={stats.commanderDecks}
                />
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI & Features
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Sparkles}
                  label="AI Decks Built"
                  value={stats.aiBuildsCount}
                />
                <StatCard
                  icon={Heart}
                  label="Favorite Decks"
                  value={stats.favoriteDecks}
                />
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Storage & Activity
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Package}
                  label="Storage Containers"
                  value={stats.storageContainers}
                />
                <StatCard
                  icon={Heart}
                  label="Wishlist Items"
                  value={stats.wishlistItems}
                />
                <StatCard
                  icon={Activity}
                  label="Activity Events"
                  value={stats.activityCount.toLocaleString()}
                />
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-muted-foreground text-center">
                User ID: <code className="bg-muted px-1 rounded">{userId}</code>
              </p>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Failed to load user stats</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
