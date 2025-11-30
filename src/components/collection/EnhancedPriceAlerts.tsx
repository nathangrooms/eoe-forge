import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Bell, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';

interface PriceAlert {
  id: string;
  card_id: string;
  card_name: string;
  target_price: number;
  alert_type: 'below' | 'above';
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export function EnhancedPriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    cardName: '',
    targetPrice: '',
    alertType: 'below' as 'below' | 'above',
  });

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('price_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts((data || []) as PriceAlert[]);
    } catch (error: any) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const createAlert = async () => {
    if (!newAlert.cardName.trim() || !newAlert.targetPrice) {
      showError('Invalid input', 'Please fill in all fields');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Search for the card
      const { data: cards, error: searchError } = await supabase
        .from('cards')
        .select('id, name')
        .ilike('name', `%${newAlert.cardName}%`)
        .limit(1);

      if (searchError) throw searchError;
      if (!cards || cards.length === 0) {
        showError('Card not found', 'Please check the card name');
        return;
      }

      const { error } = await supabase
        .from('price_alerts')
        .insert({
          user_id: user.id,
          card_id: cards[0].id,
          card_name: cards[0].name,
          target_price: parseFloat(newAlert.targetPrice),
          alert_type: newAlert.alertType,
        });

      if (error) throw error;

      showSuccess('Alert created', `You'll be notified when ${cards[0].name} goes ${newAlert.alertType} $${newAlert.targetPrice}`);
      setDialogOpen(false);
      setNewAlert({ cardName: '', targetPrice: '', alertType: 'below' });
      loadAlerts();
    } catch (error: any) {
      showError('Failed to create alert', error.message);
    }
  };

  const toggleAlert = async (alertId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('price_alerts')
        .update({ is_active: !currentStatus })
        .eq('id', alertId);

      if (error) throw error;

      showSuccess(
        !currentStatus ? 'Alert enabled' : 'Alert disabled',
        !currentStatus ? 'You will receive notifications' : 'Notifications paused'
      );
      loadAlerts();
    } catch (error: any) {
      showError('Failed to update alert', error.message);
    }
  };

  const deleteAlert = async (alertId: string) => {
    if (!confirm('Delete this price alert?')) return;

    try {
      const { error } = await supabase
        .from('price_alerts')
        .delete()
        .eq('id', alertId);

      if (error) throw error;

      showSuccess('Alert deleted', 'Price alert removed');
      loadAlerts();
    } catch (error: any) {
      showError('Failed to delete alert', error.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Price Alerts
            <Badge variant="secondary">{alerts.filter(a => a.is_active).length} active</Badge>
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Alert
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Price Alert</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Card Name</label>
                  <Input
                    placeholder="e.g., Black Lotus"
                    value={newAlert.cardName}
                    onChange={(e) => setNewAlert({ ...newAlert, cardName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alert Type</label>
                  <Select
                    value={newAlert.alertType}
                    onValueChange={(value: any) => setNewAlert({ ...newAlert, alertType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="below">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-green-500" />
                          <span>Alert when price drops below</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="above">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-blue-500" />
                          <span>Alert when price rises above</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Price (USD)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    value={newAlert.targetPrice}
                    onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createAlert}>
                    Create Alert
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No price alerts set</p>
            <p className="text-sm">Get notified when cards hit your target price</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${alert.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{alert.card_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {alert.alert_type === 'below' ? (
                        <TrendingDown className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        Alert when {alert.alert_type} ${alert.target_price.toFixed(2)}
                      </span>
                    </div>
                    {alert.last_triggered_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Last triggered: {new Date(alert.last_triggered_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={alert.is_active}
                      onCheckedChange={() => toggleAlert(alert.id, alert.is_active)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAlert(alert.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
