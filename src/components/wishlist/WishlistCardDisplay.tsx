import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, ShoppingCart } from 'lucide-react';

interface WishlistItem {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  priority: string;
  note?: string;
  created_at: string;
  card?: any;
}

interface WishlistCardDisplayProps {
  items: WishlistItem[];
  onCardClick: (item: WishlistItem) => void;
  onAddToCollection: (item: WishlistItem) => void;
  viewMode: 'grid' | 'list' | 'compact';
}

export function WishlistCardDisplay({
  items,
  onCardClick,
  onAddToCollection,
  viewMode
}: WishlistCardDisplayProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const getGridClasses = () => {
    switch (viewMode) {
      case 'grid':
        return "grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6";
      case 'compact':
        return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3";
      case 'list':
      default:
        return "space-y-3";
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'mythic': return 'text-orange-500 border-orange-500';
      case 'rare': return 'text-yellow-500 border-yellow-500';
      case 'uncommon': return 'text-gray-400 border-gray-400';
      case 'common': return 'text-gray-600 border-gray-600';
      default: return 'text-gray-500 border-gray-500';
    }
  };

  const getQuantity = (itemId: string) => quantities[itemId] || 1;

  const updateQuantity = (itemId: string, newQuantity: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(1, Math.min(99, newQuantity))
    }));
  };

  const handleAddToCollection = (item: WishlistItem) => {
    const quantity = getQuantity(item.id);
    const modifiedItem = { ...item, quantity };
    onAddToCollection(modifiedItem);
  };

  if (viewMode === 'list') {
    return (
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Card Image */}
                <div className="w-16 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                  {item.card?.image_uris?.small ? (
                    <img 
                      src={item.card.image_uris.small}
                      alt={item.card_name}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => onCardClick(item)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground cursor-pointer"
                         onClick={() => onCardClick(item)}>
                      No Image
                    </div>
                  )}
                </div>

                {/* Card Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-medium truncate cursor-pointer" onClick={() => onCardClick(item)}>
                    {item.card_name}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {item.card?.type_line || 'Unknown Type'}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {item.card?.set_code?.toUpperCase() || 'UNK'}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getRarityColor(item.card?.rarity || 'common')}`}>
                      {item.card?.rarity || 'common'}
                    </Badge>
                  </div>
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                  <div className="font-medium text-green-600">
                    {item.card?.prices?.usd ? `$${item.card.prices.usd}` : 'N/A'}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(item.id, getQuantity(item.id) - 1)}
                    disabled={getQuantity(item.id) <= 1}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{getQuantity(item.id)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(item.id, getQuantity(item.id) + 1)}
                    disabled={getQuantity(item.id) >= 99}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Add to Collection Button */}
                <Button 
                  size="sm"
                  onClick={() => handleAddToCollection(item)}
                  className="whitespace-nowrap"
                >
                  <ShoppingCart className="h-3 w-3 mr-1" />
                  Add to Collection
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Grid and Compact modes
  return (
    <div className={getGridClasses()}>
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
          <div className="aspect-[5/7] relative">
            {item.card?.image_uris?.normal ? (
              <img 
                src={item.card.image_uris.normal}
                alt={item.card_name}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => onCardClick(item)}
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground cursor-pointer"
                   onClick={() => onCardClick(item)}>
                No Image
              </div>
            )}
          </div>
          
          <CardContent className="p-3 space-y-3">
            {/* Card Name and Info */}
            <div>
              <h3 className="font-medium text-sm truncate cursor-pointer" onClick={() => onCardClick(item)}>
                {item.card_name}
              </h3>
              <div className="flex items-center gap-1 mt-1">
                <Badge variant="outline" className="text-xs">
                  {item.card?.rarity || 'common'}
                </Badge>
                {item.card?.prices?.usd && (
                  <span className="text-xs text-green-600 font-medium">${item.card.prices.usd}</span>
                )}
              </div>
            </div>

            {/* Quantity Controls */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQuantity(item.id, getQuantity(item.id) - 1)}
                disabled={getQuantity(item.id) <= 1}
                className="h-8 w-8 p-0"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-sm font-medium">{getQuantity(item.id)}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQuantity(item.id, getQuantity(item.id) + 1)}
                disabled={getQuantity(item.id) >= 99}
                className="h-8 w-8 p-0"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Add to Collection Button */}
            <Button 
              size="sm"
              onClick={() => handleAddToCollection(item)}
              className="w-full"
            >
              <ShoppingCart className="h-3 w-3 mr-1" />
              Add to Collection
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}