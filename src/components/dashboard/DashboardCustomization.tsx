import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings, Eye, EyeOff } from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';

interface WidgetConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface DashboardCustomizationProps {
  onSave?: (widgets: WidgetConfig[]) => void;
}

export function DashboardCustomization({ onSave }: DashboardCustomizationProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([
    { id: 'stats', name: 'Collection Stats', description: 'Total cards, value, and unique count', enabled: true },
    { id: 'recent-activity', name: 'Recent Activity', description: 'Your latest actions and updates', enabled: true },
    { id: 'deck-recommendations', name: 'Deck Recommendations', description: 'Smart deck suggestions based on your collection', enabled: true },
    { id: 'favorite-decks', name: 'Favorite Decks', description: 'Quick access to your starred decks', enabled: true },
    { id: 'price-alerts', name: 'Price Alerts', description: 'Cards that hit target prices', enabled: true },
    { id: 'missing-cards', name: 'Missing Cards', description: 'Cards needed for your decks', enabled: false },
    { id: 'top-value', name: 'Top Value Cards', description: 'Your most valuable cards', enabled: true },
    { id: 'wishlist-preview', name: 'Wishlist Preview', description: 'Your most wanted cards', enabled: true },
    { id: 'badges', name: 'Achievements', description: 'Your earned badges and milestones', enabled: true },
  ]);

  const toggleWidget = (widgetId: string) => {
    setWidgets(prev => prev.map(w => 
      w.id === widgetId ? { ...w, enabled: !w.enabled } : w
    ));
  };

  const handleSave = () => {
    // Save to localStorage or user preferences
    localStorage.setItem('dashboard_widgets', JSON.stringify(widgets));
    onSave?.(widgets);
    showSuccess('Settings Saved', 'Dashboard customization updated');
    setShowDialog(false);
  };

  const resetToDefault = () => {
    setWidgets(prev => prev.map(w => ({ ...w, enabled: true })));
    showSuccess('Reset Complete', 'Dashboard widgets restored to defaults');
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Customize Dashboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription>
            Choose which widgets to display on your dashboard
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3">
            {widgets.map((widget) => (
              <Card key={widget.id} className={!widget.enabled ? 'opacity-60' : ''}>
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {widget.enabled ? (
                          <Eye className="h-4 w-4 text-green-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        {widget.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {widget.description}
                      </p>
                    </div>
                    <Switch
                      checked={widget.enabled}
                      onCheckedChange={() => toggleWidget(widget.id)}
                    />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={resetToDefault}>
              Reset to Default
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getDashboardWidgets(): WidgetConfig[] {
  const stored = localStorage.getItem('dashboard_widgets');
  if (stored) {
    return JSON.parse(stored);
  }
  
  // Default configuration
  return [
    { id: 'stats', name: 'Collection Stats', description: 'Total cards, value, and unique count', enabled: true },
    { id: 'recent-activity', name: 'Recent Activity', description: 'Your latest actions and updates', enabled: true },
    { id: 'deck-recommendations', name: 'Deck Recommendations', description: 'Smart deck suggestions based on your collection', enabled: true },
    { id: 'favorite-decks', name: 'Favorite Decks', description: 'Quick access to your starred decks', enabled: true },
    { id: 'price-alerts', name: 'Price Alerts', description: 'Cards that hit target prices', enabled: true },
    { id: 'missing-cards', name: 'Missing Cards', description: 'Cards needed for your decks', enabled: false },
    { id: 'top-value', name: 'Top Value Cards', description: 'Your most valuable cards', enabled: true },
    { id: 'wishlist-preview', name: 'Wishlist Preview', description: 'Your most wanted cards', enabled: true },
    { id: 'badges', name: 'Achievements', description: 'Your earned badges and milestones', enabled: true },
  ];
}
