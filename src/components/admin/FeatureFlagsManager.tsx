import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Flag, FlaskConical, Crown, Zap, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { useFeatureFlags, useUpdateFeatureFlag, SubscriptionTier } from '@/hooks/useFeatureAccess';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

export function FeatureFlagsManager() {
  const { data: flags, isLoading, refetch } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();

  const handleToggle = async (flagId: string, enabled: boolean) => {
    try {
      await updateFlag.mutateAsync({ id: flagId, updates: { enabled } });
      showSuccess('Feature Updated', `Feature has been ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      showError('Update Failed', 'Could not update feature flag');
    }
  };

  const handleTierChange = async (flagId: string, tier: SubscriptionTier) => {
    try {
      await updateFlag.mutateAsync({ id: flagId, updates: { requires_tier: tier } });
      showSuccess('Tier Updated', `Feature now requires ${tier} tier`);
    } catch (error) {
      showError('Update Failed', 'Could not update tier requirement');
    }
  };

  const handleExperimentalToggle = async (flagId: string, isExperimental: boolean) => {
    try {
      await updateFlag.mutateAsync({ id: flagId, updates: { is_experimental: isExperimental } });
      showSuccess('Updated', `Experimental status changed`);
    } catch (error) {
      showError('Update Failed', 'Could not update experimental status');
    }
  };

  const getTierBadge = (tier: SubscriptionTier) => {
    const config = {
      free: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', icon: Sparkles },
      pro: { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: Zap },
      unlimited: { color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', icon: Crown },
    };
    const { color, icon: Icon } = config[tier];
    return (
      <Badge variant="outline" className={`text-xs ${color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Feature Flags
            </CardTitle>
            <CardDescription>
              Control feature availability across the entire application
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {flags?.map((flag) => (
          <div
            key={flag.id}
            className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Label htmlFor={flag.id} className="font-medium cursor-pointer">
                  {flag.name}
                </Label>
                {getTierBadge(flag.requires_tier)}
                {flag.is_experimental && (
                  <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 flex items-center gap-1">
                    <FlaskConical className="h-3 w-3" />
                    Experimental
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">{flag.description}</p>
              
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Required Tier:</Label>
                  <Select
                    value={flag.requires_tier}
                    onValueChange={(value) => handleTierChange(flag.id, value as SubscriptionTier)}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="unlimited">Unlimited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Experimental:</Label>
                  <Switch
                    checked={flag.is_experimental}
                    onCheckedChange={(checked) => handleExperimentalToggle(flag.id, checked)}
                    className="scale-75"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
              <Switch
                id={flag.id}
                checked={flag.enabled}
                onCheckedChange={(checked) => handleToggle(flag.id, checked)}
              />
              <span className={`text-xs ${flag.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {flag.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
