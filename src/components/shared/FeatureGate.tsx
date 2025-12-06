import { ReactNode } from 'react';
import { useIsFeatureEnabled } from '@/hooks/useFeatureAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown, Zap, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FeatureGateProps {
  featureKey: string;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
  softLimit?: boolean; // Show warning instead of blocking
}

export function FeatureGate({ 
  featureKey, 
  children, 
  fallback,
  showUpgradePrompt = true,
  softLimit = false,
}: FeatureGateProps) {
  const { isEnabled, isLoading, access } = useIsFeatureEnabled(featureKey);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Admin bypass or feature is enabled
  if (isEnabled || access?.is_admin) {
    // Check if approaching limit for soft limits
    if (softLimit && access?.remaining !== undefined && access.remaining > 0 && access.remaining <= 3 && access.limit !== -1) {
      return (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              You have <span className="font-semibold">{access.remaining}</span> uses remaining this period. 
              <Button variant="link" className="text-amber-600 p-0 h-auto ml-1" onClick={() => navigate('/settings')}>
                Upgrade for more
              </Button>
            </p>
          </div>
          {children}
        </div>
      );
    }
    return <>{children}</>;
  }

  // Feature is disabled or user doesn't have access
  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  const getTierInfo = () => {
    const requiredTier = access?.required_tier || 'pro';
    const config = {
      free: { icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Free' },
      pro: { icon: Zap, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Pro' },
      unlimited: { icon: Crown, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Unlimited' },
    };
    return config[requiredTier as keyof typeof config] || config.pro;
  };

  const tierInfo = getTierInfo();
  const TierIcon = tierInfo.icon;

  // Check if it's a limit issue vs tier issue
  const isLimitReached = access?.reason !== 'tier_required' && access?.remaining === 0;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className={`p-4 rounded-full ${tierInfo.bg} mb-4`}>
          {isLimitReached ? (
            <Lock className={`h-8 w-8 ${tierInfo.color}`} />
          ) : (
            <TierIcon className={`h-8 w-8 ${tierInfo.color}`} />
          )}
        </div>
        
        <h3 className="font-semibold text-lg mb-2">
          {isLimitReached ? 'Usage Limit Reached' : 'Feature Locked'}
        </h3>
        
        <p className="text-muted-foreground mb-4 max-w-sm">
          {isLimitReached ? (
            <>
              You've used all <span className="font-medium">{access?.limit}</span> of your {access?.limit_type || 'monthly'} allowance.
            </>
          ) : (
            <>
              This feature requires a <Badge variant="outline" className={tierInfo.color}>{tierInfo.label}</Badge> subscription or higher.
            </>
          )}
        </p>

        {access?.tier && (
          <p className="text-xs text-muted-foreground mb-4">
            Current plan: <span className="capitalize font-medium">{access.tier}</span>
            {access.used !== undefined && access.limit !== undefined && access.limit !== -1 && (
              <> • Used: {access.used}/{access.limit}</>
            )}
          </p>
        )}

        <Button onClick={() => navigate('/settings')} className="gap-2">
          <Crown className="h-4 w-4" />
          Upgrade Now
        </Button>
      </CardContent>
    </Card>
  );
}

// Simple hook-based component for conditional rendering
interface FeatureEnabledProps {
  featureKey: string;
  children: ReactNode;
}

export function IfFeatureEnabled({ featureKey, children }: FeatureEnabledProps) {
  const { isEnabled, access } = useIsFeatureEnabled(featureKey);
  
  if (!isEnabled && !access?.is_admin) {
    return null;
  }
  
  return <>{children}</>;
}
