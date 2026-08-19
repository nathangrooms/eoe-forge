import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { uniqueCards } from '@/lib/cards/cardQuery';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Bell, Plus, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';

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
  /** The composer expands at the top of the list - no overlay. */
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
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
      // An alert is about a card, not a printing. Searching the printings and
      // taking the first row would pin the alert to an arbitrary reprint whose
      // price has nothing to do with the one the user is watching.
      const { data: cards, error: searchError } = await uniqueCards()
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
      setComposerOpen(false);
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
    try {
      const { error } = await supabase
        .from('price_alerts')
        .delete()
        .eq('id', alertId);

      if (error) throw error;

      showSuccess('Alert deleted', 'Price alert removed');
      setConfirmingDelete(null);
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
          <Button
            size="sm"
            onClick={() => setComposerOpen(open => !open)}
            aria-expanded={composerOpen}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New alert
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {composerOpen && (
          <div className="space-y-4 rounded-lg bg-muted/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-medium">New price alert</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Close"
                onClick={() => setComposerOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="alert-card">
                  Card name
                </label>
                <Input
                  id="alert-card"
                  placeholder="e.g., Black Lotus"
                  value={newAlert.cardName}
                  onChange={(e) => setNewAlert({ ...newAlert, cardName: e.target.value })}
                  className="border-0 bg-background/60"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Alert type</label>
                <Select
                  value={newAlert.alertType}
                  onValueChange={(value: any) => setNewAlert({ ...newAlert, alertType: value })}
                >
                  <SelectTrigger className="border-0 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="below">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span>Drops below</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="above">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span>Rises above</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="alert-price">
                  Target price (USD)
                </label>
                <Input
                  id="alert-price"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={newAlert.targetPrice}
                  onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                  className="border-0 bg-background/60"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={createAlert}>Create alert</Button>
              <Button variant="ghost" onClick={() => setComposerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

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
                className={`rounded-lg p-3 ${alert.is_active ? 'bg-card shadow-lg shadow-black/20' : 'bg-muted/40 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{alert.card_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {alert.alert_type === 'below' ? (
                        <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
                    {confirmingDelete === alert.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteAlert(alert.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingDelete(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete alert for ${alert.card_name}`}
                        onClick={() => setConfirmingDelete(alert.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    )}
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
