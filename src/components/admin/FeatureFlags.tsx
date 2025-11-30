import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flag, Save, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { showSuccess } from '@/components/ui/toast-helpers';

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'experimental' | 'beta' | 'maintenance';
}

export function FeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([
    {
      id: 'ai_deck_coach',
      name: 'AI Deck Coach',
      description: 'Enhanced AI coaching with real-time deck suggestions',
      enabled: true,
      category: 'beta'
    },
    {
      id: 'advanced_analytics',
      name: 'Advanced Analytics',
      description: 'Detailed collection and deck performance analytics',
      enabled: true,
      category: 'beta'
    },
    {
      id: 'tcgplayer_sync',
      name: 'TCGPlayer Price Sync',
      description: 'Real-time price updates from TCGPlayer API',
      enabled: false,
      category: 'experimental'
    },
    {
      id: 'deck_simulation',
      name: 'Deck Simulation',
      description: 'Test play your decks with AI opponents',
      enabled: true,
      category: 'beta'
    },
    {
      id: 'marketplace_v2',
      name: 'Marketplace V2',
      description: 'Enhanced marketplace with better search and filters',
      enabled: false,
      category: 'experimental'
    },
    {
      id: 'social_features',
      name: 'Social Features',
      description: 'Follow users, like decks, and comment on builds',
      enabled: false,
      category: 'experimental'
    },
    {
      id: 'bulk_operations',
      name: 'Bulk Operations',
      description: 'Bulk edit cards, decks, and collection items',
      enabled: true,
      category: 'beta'
    },
    {
      id: 'maintenance_mode',
      name: 'Maintenance Mode',
      description: 'Show maintenance banner and restrict certain actions',
      enabled: false,
      category: 'maintenance'
    },
  ]);

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem('feature_flags');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setFlags(flags.map(flag => ({
          ...flag,
          enabled: parsed[flag.id] ?? flag.enabled
        })));
      } catch (e) {
        console.error('Failed to parse feature flags:', e);
      }
    }
  }, []);

  const toggleFlag = (flagId: string) => {
    setFlags(flags.map(flag =>
      flag.id === flagId ? { ...flag, enabled: !flag.enabled } : flag
    ));
    setHasChanges(true);
  };

  const saveFlags = () => {
    const flagsObject = flags.reduce((acc, flag) => {
      acc[flag.id] = flag.enabled;
      return acc;
    }, {} as Record<string, boolean>);
    
    localStorage.setItem('feature_flags', JSON.stringify(flagsObject));
    setHasChanges(false);
    showSuccess('Feature Flags Saved', 'Changes will take effect on next page load');
  };

  const resetFlags = () => {
    localStorage.removeItem('feature_flags');
    window.location.reload();
  };

  const getCategoryBadge = (category: FeatureFlag['category']) => {
    const config = {
      experimental: { color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', label: 'Experimental' },
      beta: { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Beta' },
      maintenance: { color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', label: 'Maintenance' },
    };
    return config[category];
  };

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
              Enable or disable experimental features and maintenance modes
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetFlags}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button 
              size="sm" 
              onClick={saveFlags}
              disabled={!hasChanges}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {flags.map((flag) => {
          const categoryBadge = getCategoryBadge(flag.category);
          return (
            <div
              key={flag.id}
              className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor={flag.id} className="font-medium cursor-pointer">
                    {flag.name}
                  </Label>
                  <Badge variant="outline" className={`text-xs ${categoryBadge.color}`}>
                    {categoryBadge.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{flag.description}</p>
              </div>
              <Switch
                id={flag.id}
                checked={flag.enabled}
                onCheckedChange={() => toggleFlag(flag.id)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
