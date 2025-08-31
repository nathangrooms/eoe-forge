import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, ShoppingCart, Users } from 'lucide-react';

interface CollectionItem {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  set_code: string;
  quantity: number;
  foil: number;
  condition: string;
  created_at: string;
  updated_at: string;
  price_usd?: number;
  card?: any;
}

interface CollectionCardDisplayProps {
  items: CollectionItem[];
  onCardClick: (item: CollectionItem) => void;
  onMarkForSale: (item: CollectionItem) => void;
  onAddToDeck: (item: CollectionItem) => void;
  viewMode: 'grid' | 'list' | 'compact';
}

export function CollectionCardDisplay({
  items,
  onCardClick,
  onMarkForSale,
  onAddToDeck,
  viewMode
}: CollectionCardDisplayProps) {
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

  const handleMarkForSale = (item: CollectionItem) => {
    const quantity = getQuantity(item.id);
    const modifiedItem = { ...item, tempQuantity: quantity };
    onMarkForSale(modifiedItem);
  };

  const handleAddToDeck = (item: CollectionItem) => {
    const quantity = getQuantity(item.id);
    const modifiedItem = { ...item, tempQuantity: quantity };
    onAddToDeck(modifiedItem);
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
                      {item.set_code?.toUpperCase() || 'UNK'}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getRarityColor(item.card?.rarity || 'common')}`}>
                      {item.card?.rarity || 'common'}
                    </Badge>
                    <span className="text-muted-foreground">
                      Owned: {item.quantity + item.foil}
                    </span>
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
                    disabled={getQuantity(item.id) >= Math.min(99, item.quantity + item.foil)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarkForSale(item)}
                    className="whitespace-nowrap"
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    Mark for Sale
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleAddToDeck(item)}
                    className="whitespace-nowrap"
                  >
                    <Users className="h-3 w-3 mr-1" />
                    Add to Deck
                  </Button>
                </div>
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

            {/* Owned quantity badge */}
            <Badge className="absolute top-2 right-2">
              Owned: {item.quantity + item.foil}
            </Badge>
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
                disabled={getQuantity(item.id) >= Math.min(99, item.quantity + item.foil)}
                className="h-8 w-8 p-0"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button 
                size="sm"
                variant="outline"
                onClick={() => handleMarkForSale(item)}
                className="w-full"
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                Mark for Sale
              </Button>
              <Button 
                size="sm"
                onClick={() => handleAddToDeck(item)}
                className="w-full"
              >
                <Users className="h-3 w-3 mr-1" />
                Add to Deck
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}