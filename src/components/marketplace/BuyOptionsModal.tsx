import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ExternalLink, 
  ShoppingCart, 
  Plus,
  Sparkles,
  DollarSign
} from 'lucide-react';
import { CardPriceData } from './PriceSearchPanel';
import { showSuccess } from '@/components/ui/toast-helpers';

interface BuyOptionsModalProps {
  card: CardPriceData | null;
  isOpen: boolean;
  onClose: () => void;
  showFoil?: boolean;
  onAddToShoppingList?: (card: CardPriceData) => void;
}

interface PlatformPrice {
  name: string;
  price: number | null;
  currency: string;
  url: string;
  color: string;
  bgColor: string;
  description: string;
}

export function BuyOptionsModal({ 
  card, 
  isOpen, 
  onClose, 
  showFoil = false,
  onAddToShoppingList 
}: BuyOptionsModalProps) {
  if (!card) return null;

  const scryfallPrices = card.scryfallData?.prices || {};
  const purchaseUris = card.scryfallData?.purchase_uris || {};

  // Build all available prices from Scryfall
  const platforms: PlatformPrice[] = [];

  // TCGPlayer USD
  const tcgPrice = showFoil 
    ? parseFloat(scryfallPrices.usd_foil || '0') 
    : parseFloat(scryfallPrices.usd || '0');
  if (purchaseUris.tcgplayer) {
    platforms.push({
      name: 'TCGPlayer',
      price: tcgPrice || null,
      currency: 'USD',
      url: purchaseUris.tcgplayer,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20',
      description: 'Best for US buyers'
    });
  }

  // CardMarket EUR
  const cmPrice = showFoil 
    ? parseFloat(scryfallPrices.eur_foil || '0') 
    : parseFloat(scryfallPrices.eur || '0');
  if (purchaseUris.cardmarket) {
    platforms.push({
      name: 'CardMarket',
      price: cmPrice || null,
      currency: 'EUR',
      url: purchaseUris.cardmarket,
      color: 'text-orange-600',
      bgColor: 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20',
      description: 'Best for EU buyers'
    });
  }

  // Cardhoarder (MTGO Tix)
  const tixPrice = parseFloat(scryfallPrices.tix || '0');
  if (purchaseUris.cardhoarder && tixPrice > 0) {
    platforms.push({
      name: 'Cardhoarder',
      price: tixPrice,
      currency: 'TIX',
      url: purchaseUris.cardhoarder,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20',
      description: 'MTGO digital cards'
    });
  }

  // Card Kingdom
  if (purchaseUris.cardkingdom) {
    platforms.push({
      name: 'Card Kingdom',
      price: null,
      currency: 'USD',
      url: purchaseUris.cardkingdom,
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20',
      description: 'Reliable US seller'
    });
  }

  // eBay
  platforms.push({
    name: 'eBay',
    price: null,
    currency: 'USD',
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(card.name + ' mtg ' + card.set_name)}`,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20',
    description: 'Auctions & Buy It Now'
  });

  // USD Etched price if available
  const etchedPrice = parseFloat(scryfallPrices.usd_etched || '0');

  const handleAddToList = () => {
    onAddToShoppingList?.(card);
    showSuccess('Added to Shopping List', `${card.name} added to your shopping list`);
    onClose();
  };

  const formatPrice = (price: number | null, currency: string) => {
    if (!price || price === 0) return 'Check price';
    const symbol = currency === 'EUR' ? '€' : currency === 'TIX' ? '' : '$';
    const suffix = currency === 'TIX' ? ' tix' : '';
    return `${symbol}${price.toFixed(2)}${suffix}`;
  };

  // Find lowest price
  const lowestPrice = platforms
    .filter(p => p.price && p.price > 0 && p.currency === 'USD')
    .sort((a, b) => (a.price || 0) - (b.price || 0))[0];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Buy Options
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card Info */}
          <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
            {card.image_uri && (
              <img 
                src={card.image_uri} 
                alt={card.name}
                className="w-16 h-auto rounded shadow"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{card.name}</h3>
              <p className="text-sm text-muted-foreground truncate">{card.set_name}</p>
              {showFoil && (
                <Badge variant="outline" className="mt-1 text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Foil
                </Badge>
              )}
            </div>
          </div>

          {/* Price Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">TCG (USD)</p>
              <p className="font-bold text-green-600">
                {tcgPrice > 0 ? `$${tcgPrice.toFixed(2)}` : '-'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">CM (EUR)</p>
              <p className="font-bold text-green-600">
                {cmPrice > 0 ? `€${cmPrice.toFixed(2)}` : '-'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">MTGO (Tix)</p>
              <p className="font-bold text-green-600">
                {tixPrice > 0 ? `${tixPrice.toFixed(2)}` : '-'}
              </p>
            </div>
          </div>

          {etchedPrice > 0 && (
            <div className="p-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 text-center">
              <p className="text-xs text-muted-foreground">Etched Foil Price</p>
              <p className="font-bold text-purple-600">${etchedPrice.toFixed(2)}</p>
            </div>
          )}

          <Separator />

          {/* Platform Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Choose where to buy:</p>
            {platforms.map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${platform.bgColor}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${platform.color} bg-background border`}>
                    {platform.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{platform.name}</p>
                    <p className="text-xs text-muted-foreground">{platform.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${platform.price ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {formatPrice(platform.price, platform.currency)}
                  </span>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              </a>
            ))}
          </div>

          <Separator />

          {/* Add to Shopping List */}
          <Button 
            onClick={handleAddToList}
            variant="outline"
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add to Shopping List
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
