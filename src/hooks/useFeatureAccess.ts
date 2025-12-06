import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

export type SubscriptionTier = 'free' | 'pro' | 'unlimited';

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  requires_tier: SubscriptionTier | null;
  is_experimental: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionLimit {
  id: string;
  tier: SubscriptionTier;
  feature_key: string;
  limit_value: number;
  limit_type: 'monthly' | 'daily' | 'total';
  description: string | null;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  started_at: string;
  expires_at: string | null;
  is_active: boolean;
  stripe_subscription_id: string | null;
}

export interface FeatureAccessResult {
  allowed: boolean;
  is_admin?: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
  tier?: string;
  reason?: string;
  required_tier?: string;
  limit_type?: string;
}

// Hook to get all feature flags
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as FeatureFlag[];
    },
  });
}

// Hook to get subscription limits
export function useSubscriptionLimits() {
  return useQuery({
    queryKey: ['subscription-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_limits')
        .select('*')
        .order('tier', { ascending: true });
      
      if (error) throw error;
      return data as SubscriptionLimit[];
    },
  });
}

// Hook to get current user's subscription
export function useUserSubscription() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-subscription', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data as UserSubscription | null;
    },
    enabled: !!user?.id,
  });
}

// Hook to check feature access
export function useFeatureAccess(featureKey: string) {
  const { user, isAdmin } = useAuth();
  
  return useQuery({
    queryKey: ['feature-access', user?.id, featureKey],
    queryFn: async (): Promise<FeatureAccessResult> => {
      // Admins always have access
      if (isAdmin) {
        return { allowed: true, is_admin: true, limit: -1, used: 0, remaining: -1 };
      }
      
      if (!user?.id) {
        return { allowed: false, reason: 'not_authenticated' };
      }
      
      const { data, error } = await supabase
        .rpc('check_feature_access', {
          _user_id: user.id,
          _feature_key: featureKey,
        });
      
      if (error) throw error;
      return data as unknown as FeatureAccessResult;
    },
    enabled: !!user?.id || isAdmin,
    staleTime: 30000, // Cache for 30 seconds
  });
}

// Hook to increment feature usage
export function useIncrementUsage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ featureKey, amount = 1 }: { featureKey: string; amount?: number }) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .rpc('increment_feature_usage', {
          _user_id: user.id,
          _feature_key: featureKey,
          _amount: amount,
        });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { featureKey }) => {
      // Invalidate the feature access query
      queryClient.invalidateQueries({ queryKey: ['feature-access', user?.id, featureKey] });
    },
  });
}

// Hook to update feature flag (admin only)
export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FeatureFlag> }) => {
      const { data, error } = await supabase
        .from('feature_flags')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });
}

// Hook to get all limits by tier for comparison
export function useTierComparison() {
  const { data: limits } = useSubscriptionLimits();
  
  if (!limits) return null;
  
  const tiers: SubscriptionTier[] = ['free', 'pro', 'unlimited'];
  const features = [...new Set(limits.map(l => l.feature_key))];
  
  return {
    tiers,
    features,
    getLimitForTier: (featureKey: string, tier: SubscriptionTier) => {
      const limit = limits.find(l => l.feature_key === featureKey && l.tier === tier);
      return limit?.limit_value ?? 0;
    },
    getDescriptionForFeature: (featureKey: string) => {
      const limit = limits.find(l => l.feature_key === featureKey);
      return limit?.description ?? featureKey;
    },
  };
}

// Simple hook to check if a feature is enabled
export function useIsFeatureEnabled(featureKey: string) {
  const { data: access, isLoading } = useFeatureAccess(featureKey);
  return { 
    isEnabled: access?.allowed ?? false, 
    isLoading,
    access,
  };
}
