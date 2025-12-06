import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ShoppingCart, 
  Plus,
  Trash2, 
  ExternalLink,
  DollarSign,
  Check,
  Package
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';

interface ShoppingListItem {
  id: string;
  name: string;
  set_code?: string;
  image_uri?: string;
  estimatedPrice: number;
  quantity: number;
  purchased: boolean;
  purchaseUrl?: string;
  notes?: string;
}

interface ShoppingListProps {
  items?: ShoppingListItem[];
  onUpdate?: (items: ShoppingListItem[]) => void;
}

export function ShoppingList({ items: externalItems, onUpdate }: ShoppingListProps) {
  const [items, setItems] = useState<ShoppingListItem[]>(externalItems || []);
  const [newItemName, setNewItemName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (externalItems) {
      setItems(externalItems);
    } else {
      // Load from localStorage
      const saved = localStorage.getItem('shopping_list');
      if (saved) {
        try {
          setItems(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse shopping list:', e);
        }
      }
    }
  }, [externalItems]);

  const saveItems = (updated: ShoppingListItem[]) => {
    setItems(updated);
    if (onUpdate) {
      onUpdate(updated);
    } else {
      localStorage.setItem('shopping_list', JSON.stringify(updated));
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    
    setLoading(true);
    try {
      // Try to fetch card data from Scryfall
      const response = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(newItemName)}`
      );
      
      let newItem: ShoppingListItem;
      
      if (response.ok) {
        const card = await response.json();
        newItem = {
          id: crypto.randomUUID(),
          name: card.name,
          set_code: card.set,
          image_uri: card.image_uris?.small,
          estimatedPrice: parseFloat(card.prices?.usd || '0'),
          quantity: 1,
          purchased: false,
          purchaseUrl: card.purchase_uris?.tcgplayer
        };
      } else {
        // Add as manual entry if card not found
        newItem = {
          id: crypto.randomUUID(),
          name: newItemName,
          estimatedPrice: 0,
          quantity: 1,
          purchased: false
        };
      }
      
      saveItems([...items, newItem]);
      setNewItemName('');
      showSuccess('Added', `${newItem.name} added to shopping list`);
    } catch (error) {
      console.error('Error adding item:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePurchased = (id: string) => {
    const updated = items.map(item => 
      item.id === id ? { ...item, purchased: !item.purchased } : item
    );
    saveItems(updated);
  };

  const handleRemove = (id: string) => {
    const updated = items.filter(item => item.id !== id);
    saveItems(updated);
    showSuccess('Removed', 'Item removed from shopping list');
  };

  const handleQuantityChange = (id: string, quantity: number) => {
    if (quantity < 1) return;
    const updated = items.map(item => 
      item.id === id ? { ...item, quantity } : item
    );
    saveItems(updated);
  };

  const unpurchasedItems = items.filter(i => !i.purchased);
  const purchasedItems = items.filter(i => i.purchased);
  const totalEstimate = unpurchasedItems.reduce(
    (sum, item) => sum + (item.estimatedPrice * item.quantity), 
    0
  );

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Shopping List
            {items.length > 0 && (
              <Badge variant="secondary">{unpurchasedItems.length}</Badge>
            )}
          </CardTitle>
          {totalEstimate > 0 && (
            <Badge variant="outline" className="text-green-600 border-green-500/30">
              <DollarSign className="h-3 w-3 mr-0.5" />
              ~${totalEstimate.toFixed(2)}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Add Item Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a card to your shopping list..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            className="flex-1"
          />
          <Button 
            onClick={handleAddItem} 
            disabled={loading || !newItemName.trim()}
            size="icon"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-1">Shopping list empty</h3>
            <p className="text-sm text-muted-foreground">
              Add cards you want to buy
            </p>
          </div>
        ) : (
          <>
            {/* Unpurchased Items */}
            {unpurchasedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  To Buy ({unpurchasedItems.length})
                </p>
                {unpurchasedItems.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={item.purchased}
                      onCheckedChange={() => handleTogglePurchased(item.id)}
                    />
                    
                    {item.image_uri ? (
                      <img 
                        src={item.image_uri} 
                        alt={item.name}
                        className="h-10 w-auto rounded shadow-sm"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-10 w-7 bg-muted rounded flex items-center justify-center">
                        <Package className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.set_code && (
                          <span>{item.set_code.toUpperCase()}</span>
                        )}
                        {item.estimatedPrice > 0 && (
                          <span>~${item.estimatedPrice.toFixed(2)} each</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        -
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                      >
                        +
                      </Button>
                    </div>

                    {item.purchaseUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        asChild
                      >
                        <a 
                          href={item.purchaseUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          title="Buy now"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Purchased Items */}
            {purchasedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Purchased ({purchasedItems.length})
                </p>
                {purchasedItems.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/30 opacity-60"
                  >
                    <Checkbox
                      checked={item.purchased}
                      onCheckedChange={() => handleTogglePurchased(item.id)}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate line-through">{item.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-green-500" />
                        <span>x{item.quantity}</span>
                      </div>
                    </div>
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
