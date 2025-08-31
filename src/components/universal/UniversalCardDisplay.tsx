import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ManaSymbols } from '@/components/ui/mana-symbols';
import { 
  Eye, 
  Plus, 
  Heart, 
  Star, 
  TrendingUp,
  DollarSign,
  Zap,
  Shield
} from 'lucide-react';

interface UniversalCardDisplayProps {
  cards: any[];
  viewMode: 'grid' | 'list' | 'compact';
  onCardClick: (card: any) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showWishlistButton?: boolean;
  compact?: boolean;
}

export function UniversalCardDisplay({
  cards,
  viewMode,
  onCardClick,
  onCardAdd,
  onCardWishlist,
  showWishlistButton = false,
  compact = false
}: UniversalCardDisplayProps) {
  const getGridClasses = () => {
    if (compact) return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3";
    
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
      case 'mythic': return 'text-orange-500';
      case 'rare': return 'text-yellow-500';
      case 'uncommon': return 'text-gray-400';
      case 'common': return 'text-gray-600';
      default: return 'text-gray-500';
    }
  };

  const getColorIndicator = (colors: string[]) => {
    if (!colors || colors.length === 0) return <div className="w-3 h-3 rounded-full bg-gray-400" />;
    
    return (
      <div className="flex -space-x-1">
        {colors.slice(0, 3).map((color, index) => {
          const colorMap: Record<string, string> = {
            W: 'bg-yellow-100 border-yellow-400',
            U: 'bg-blue-500 border-blue-600',
            B: 'bg-gray-800 border-gray-900',
            R: 'bg-red-500 border-red-600',
            G: 'bg-green-500 border-green-600'
          };
          
          return (
            <div
              key={index}
              className={`w-3 h-3 rounded-full border ${colorMap[color] || 'bg-gray-400'}`}
            />
          );
        })}
        {colors.length > 3 && (
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-500 via-blue-500 to-green-500" />
        )}
      </div>
    );
  };

  if (viewMode === 'list') {
    return (
      <div className={getGridClasses()}>
        {cards.map((card) => (
          <Card 
            key={card.id} 
            className="cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] group"
            onClick={() => onCardClick(card)}
          >
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                {/* Card Image */}
                <div className="w-16 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                  {card.image_uris?.small && (
                    <img 
                      src={card.image_uris.small}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* Card Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{card.name}</h3>
                    <div className="flex items-center gap-1">
                      {getColorIndicator(card.colors)}
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground truncate">
                    {card.type_line}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {card.set?.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getRarityColor(card.rarity)}`}>
                      {card.rarity}
                    </Badge>
                    <span className="text-muted-foreground">CMC {card.cmc}</span>
                  </div>
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                  <div className="font-medium">
                    {card.prices?.usd ? `$${card.prices.usd}` : 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {card.power && card.toughness ? `${card.power}/${card.toughness}` : ''}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCardClick(card);
                    }}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  
                  {onCardAdd && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCardAdd(card);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                  
                  {showWishlistButton && onCardWishlist && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCardWishlist(card);
                      }}
                    >
                      <Heart className="h-3 w-3" />
                    </Button>
                  )}
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
      {cards.map((card) => (
        <div key={card.id} className="relative group">
          <Card 
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-105 overflow-hidden"
            onClick={() => onCardClick(card)}
          >
            <div className={compact ? "aspect-[5/7]" : "aspect-[5/7]"}>
              {card.image_uris?.normal ? (
                <img 
                  src={compact ? card.image_uris.small : card.image_uris.normal}
                  alt={card.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                  <div className="text-center p-2">
                    <p className="text-xs font-medium truncate">{card.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.type_line}</p>
                  </div>
                </div>
              )}
            </div>

            {!compact && (
              <CardContent className="p-3">
                <div className="space-y-2">
                  <h3 className="font-medium text-sm truncate">{card.name}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {getColorIndicator(card.colors)}
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {card.cmc}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs capitalize">
                      {card.rarity}
                    </Badge>
                    <span className="text-xs font-medium">
                      {card.prices?.usd ? `$${card.prices.usd}` : 'N/A'}
                    </span>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Action Overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onCardClick(card);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            
            {onCardAdd && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCardAdd(card);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            
            {showWishlistButton && onCardWishlist && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onCardWishlist(card);
                }}
              >
                <Heart className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}