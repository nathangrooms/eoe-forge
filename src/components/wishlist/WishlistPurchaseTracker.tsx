import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ShoppingCart, DollarSign, Calendar, Package, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { showSuccess } from '@/components/ui/toast-helpers';

interface Purchase {
  id: string;
  cardName: string;
  price: number;
  quantity: number;
  date: Date;
  vendor: string;
}

interface WishlistPurchaseTrackerProps {
  cardId: string;
  cardName: string;
  onPurchaseComplete?: () => void;
}

export function WishlistPurchaseTracker({ 
  cardId, 
  cardName, 
  onPurchaseComplete 
}: WishlistPurchaseTrackerProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    price: '',
    quantity: '1',
    vendor: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newPurchase: Purchase = {
      id: Date.now().toString(),
      cardName,
      price: parseFloat(formData.price),
      quantity: parseInt(formData.quantity),
      date: new Date(formData.date),
      vendor: formData.vendor
    };

    setPurchases([...purchases, newPurchase]);
    
    // Save to localStorage
    const storageKey = `purchases_${cardId}`;
    const existing = localStorage.getItem(storageKey);
    const allPurchases = existing ? JSON.parse(existing) : [];
    localStorage.setItem(storageKey, JSON.stringify([...allPurchases, newPurchase]));

    showSuccess('Purchase Tracked', `Recorded ${formData.quantity}x ${cardName} for $${formData.price}`);
    
    setIsOpen(false);
    setFormData({
      price: '',
      quantity: '1',
      vendor: '',
      date: new Date().toISOString().split('T')[0]
    });
    
    onPurchaseComplete?.();
  };

  const totalSpent = purchases.reduce((sum, p) => sum + (p.price * p.quantity), 0);
  const avgPrice = purchases.length > 0 ? totalSpent / purchases.reduce((sum, p) => sum + p.quantity, 0) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Purchase History
          </CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Package className="h-4 w-4 mr-2" />
                Record Purchase
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Purchase - {cardName}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Price (USD)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      required
                      className="pl-9"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input
                    required
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    placeholder="TCGPlayer, Card Kingdom, etc."
                  />
                </div>
                <div>
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Record Purchase
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {purchases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No purchases tracked yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-lg font-bold text-green-600">${totalSpent.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Avg Price</p>
                <p className="text-lg font-bold">${avgPrice.toFixed(2)}</p>
              </div>
            </div>

            {/* Purchase List */}
            <div className="space-y-2">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{purchase.quantity}x @ ${purchase.price.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{purchase.vendor}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">
                      ${(purchase.price * purchase.quantity).toFixed(2)}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(purchase.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
