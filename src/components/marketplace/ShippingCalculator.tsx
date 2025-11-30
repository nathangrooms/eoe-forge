import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Package, DollarSign } from 'lucide-react';

interface ShippingRate {
  method: string;
  price: number;
  estimatedDays: string;
}

export const ShippingCalculator = () => {
  const [quantity, setQuantity] = useState(1);
  const [destination, setDestination] = useState('domestic');
  const [packaging, setPackaging] = useState('envelope');
  const [rates, setRates] = useState<ShippingRate[]>([]);

  const calculateShipping = () => {
    const baseRates: Record<string, ShippingRate[]> = {
      domestic: [
        { method: 'PWE (Plain White Envelope)', price: 0.73, estimatedDays: '3-5' },
        { method: 'First Class (tracked)', price: 3.50, estimatedDays: '2-5' },
        { method: 'Priority Mail', price: 8.50, estimatedDays: '1-3' }
      ],
      international: [
        { method: 'First Class International', price: 15.50, estimatedDays: '7-21' },
        { method: 'Priority Mail International', price: 35.00, estimatedDays: '6-10' }
      ]
    };

    let selectedRates = baseRates[destination] || baseRates.domestic;
    
    // Adjust for quantity
    if (quantity > 20 && packaging === 'envelope') {
      selectedRates = selectedRates.filter(r => r.method !== 'PWE (Plain White Envelope)');
    }
    
    setRates(selectedRates);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Shipping Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination">Destination</Label>
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger id="destination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">Domestic (USA)</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="packaging">Packaging</Label>
            <Select value={packaging} onValueChange={setPackaging}>
              <SelectTrigger id="packaging">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="envelope">Envelope</SelectItem>
                <SelectItem value="box">Box/Padded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={calculateShipping} className="w-full">
          Calculate Shipping
        </Button>

        {rates.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="font-semibold">Available Shipping Options:</h4>
            {rates.map((rate, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="font-medium">{rate.method}</div>
                  <div className="text-sm text-muted-foreground">
                    Est. {rate.estimatedDays} business days
                  </div>
                </div>
                <div className="flex items-center gap-1 text-lg font-semibold">
                  <DollarSign className="h-4 w-4" />
                  {rate.price.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
