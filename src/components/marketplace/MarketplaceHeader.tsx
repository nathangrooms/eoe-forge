import { Badge } from '@/components/ui/badge';
import { TrendingUp, Store, DollarSign, ShoppingCart, ExternalLink } from 'lucide-react';

interface MarketplaceHeaderProps {
  totalWatchlist?: number;
  totalSavings?: number;
}

export function MarketplaceHeader({ totalWatchlist = 0, totalSavings = 0 }: MarketplaceHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-6 mb-6">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
      
      <div className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
              <Store className="h-7 w-7 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-foreground">Price Comparison Hub</h1>
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Live Prices
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Compare prices across TCGPlayer, CardMarket, eBay & more. Find the best deals instantly.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/50 border border-border/50">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{totalWatchlist} Watching</span>
            </div>
            {totalSavings > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">${totalSavings.toFixed(2)} saved</span>
              </div>
            )}
          </div>
        </div>

        {/* Partner Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/50">
          <span className="text-xs text-muted-foreground mr-2">Supported Marketplaces:</span>
          <a 
            href="https://www.tcgplayer.com/?partner=DeckMatrix" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs font-medium hover:bg-blue-500/20 transition-colors"
          >
            TCGPlayer
            <ExternalLink className="h-3 w-3" />
          </a>
          <a 
            href="https://www.cardmarket.com/?utm_source=deckmatrix" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-500/10 text-orange-600 text-xs font-medium hover:bg-orange-500/20 transition-colors"
          >
            CardMarket
            <ExternalLink className="h-3 w-3" />
          </a>
          <a 
            href="https://www.cardkingdom.com/?partner=DeckMatrix" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-500/10 text-purple-600 text-xs font-medium hover:bg-purple-500/20 transition-colors"
          >
            Card Kingdom
            <ExternalLink className="h-3 w-3" />
          </a>
          <a 
            href="https://www.ebay.com/sch/i.html?_nkw=mtg" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/10 text-yellow-700 text-xs font-medium hover:bg-yellow-500/20 transition-colors"
          >
            eBay
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
