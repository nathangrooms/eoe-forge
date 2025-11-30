import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Bell, BellOff, TrendingDown, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PriceAlert {
  id: string;
  card_id: string;
  card_name: string;
  target_price_usd: number;
  current_price_usd: number;
  alert_enabled: boolean;
  last_notified_at?: string;
}

interface PriceAlertManagerProps {
  cardId: string;
  cardName: string;
  currentPrice: number;
  onAlertCreated?: () => void;
}

export const PriceAlertManager = ({
  cardId,
  cardName,
  currentPrice,
  onAlertCreated
}: PriceAlertManagerProps) => {
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const createPriceAlert = async () => {
    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      toast.error('Please enter a valid target price');
      return;
    }

    const price = parseFloat(targetPrice);

    if (price >= currentPrice) {
      toast.error('Target price must be lower than current price');
      return;
    }

    setIsCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to create price alerts');
        return;
      }

      // Check if card is already on wishlist
      const { data: existingWishlist } = await supabase
        .from('wishlist')
        .select('id, alert_enabled, target_price_usd')
        .eq('card_id', cardId)
        .eq('user_id', user.id)
        .single();

      if (existingWishlist) {
        // Update existing wishlist item
        const { error } = await supabase
          .from('wishlist')
          .update({
            target_price_usd: price,
            alert_enabled: alertEnabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingWishlist.id);

        if (error) throw error;
        toast.success('Price alert updated successfully');
      } else {
        // Create new wishlist item with alert
        const { error } = await supabase
          .from('wishlist')
          .insert({
            user_id: user.id,
            card_id: cardId,
            card_name: cardName,
            target_price_usd: price,
            alert_enabled: alertEnabled,
            priority: 'medium',
            quantity: 1
          });

        if (error) throw error;
        toast.success('Price alert created successfully');
      }

      setTargetPrice('');
      onAlertCreated?.();
    } catch (error) {
      console.error('Error creating price alert:', error);
      toast.error('Failed to create price alert');
    } finally {
      setIsCreating(false);
    }
  };

  const savingsAmount = targetPrice
    ? (currentPrice - parseFloat(targetPrice)).toFixed(2)
    : '0.00';

  const savingsPercent = targetPrice && currentPrice > 0
    ? (((currentPrice - parseFloat(targetPrice)) / currentPrice) * 100).toFixed(1)
    : '0';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Price Alert
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-sm text-muted-foreground">Current Price</Label>
            <div className="flex items-center gap-1 font-medium">
              <DollarSign className="h-4 w-4" />
              {currentPrice.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target-price">Target Price (USD)</Label>
          <Input
            id="target-price"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
          />
        </div>

        {targetPrice && parseFloat(targetPrice) > 0 && (
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Potential Savings</span>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-green-500" />
                <span className="font-medium">${savingsAmount}</span>
                <Badge variant="secondary">{savingsPercent}%</Badge>
              </div>
            </div>
            {parseFloat(targetPrice) >= currentPrice && (
              <p className="text-xs text-destructive">
                Target price must be lower than current price
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="alert-enabled">Enable Notifications</Label>
            <p className="text-xs text-muted-foreground">
              Get notified when price drops
            </p>
          </div>
          <Switch
            id="alert-enabled"
            checked={alertEnabled}
            onCheckedChange={setAlertEnabled}
          />
        </div>

        <Button
          onClick={createPriceAlert}
          disabled={isCreating || !targetPrice || parseFloat(targetPrice) >= currentPrice}
          className="w-full"
        >
          {alertEnabled ? (
            <>
              <Bell className="h-4 w-4 mr-2" />
              Create Alert
            </>
          ) : (
            <>
              <BellOff className="h-4 w-4 mr-2" />
              Add Without Alert
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          You'll be notified by email when the price drops to your target
        </p>
      </CardContent>
    </Card>
  );
};
