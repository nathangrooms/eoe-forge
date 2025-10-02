// Manual Card Replacement Modal
// Allows users to search for and select a replacement card

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ArrowRight, Check, Bookmark, Loader2 } from 'lucide-react';
import { scryfallAPI } from '@/lib/api/scryfall';
import { toast } from 'sonner';

interface ManualReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCard: {
    name: string;
    image?: string;
  };
  onReplace: (newCardName: string) => void;
  onMarkFuture: (newCardName: string) => void;
}

export function ManualReplacementModal({
  isOpen,
  onClose,
  currentCard,
  onReplace,
  onMarkFuture
}: ManualReplacementModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      const results = await scryfallAPI.searchCards(searchQuery);
      setSearchResults(results.data || []);
      
      if (results.data.length === 0) {
        toast.error('No cards found');
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReplaceNow = () => {
    if (!selectedCard) return;
    onReplace(selectedCard.name);
    handleClose();
    toast.success(`Replaced ${currentCard.name} with ${selectedCard.name}`);
  };

  const handleMarkFuture = () => {
    if (!selectedCard) return;
    onMarkFuture(selectedCard.name);
    handleClose();
    toast.success(`Marked ${selectedCard.name} as future replacement for ${currentCard.name}`);
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCard(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Find Replacement for {currentCard.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Card Display */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-4">
              {currentCard.image && (
                <img
                  src={currentCard.image}
                  alt={currentCard.name}
                  className="w-24 h-auto rounded border"
                />
              )}
              <div>
                <p className="text-sm text-muted-foreground">Replacing:</p>
                <p className="font-semibold">{currentCard.name}</p>
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search for replacement card..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <ScrollArea className="h-[300px] border rounded-lg p-2">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {searchResults.map((card) => (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className={`cursor-pointer rounded-lg border-2 transition-all hover:scale-105 ${
                      selectedCard?.id === card.id
                        ? 'border-spacecraft ring-2 ring-spacecraft/50'
                        : 'border-transparent hover:border-spacecraft/30'
                    }`}
                  >
                    <img
                      src={card.image_uris?.normal || card.image_uris?.large || '/placeholder.svg'}
                      alt={card.name}
                      className="w-full rounded-lg"
                    />
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{card.name}</p>
                      {card.prices?.usd && (
                        <p className="text-xs text-muted-foreground">${card.prices.usd}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Selected Card Preview */}
          {selectedCard && (
            <div className="p-4 border rounded-lg bg-spacecraft/5 border-spacecraft/30">
              <div className="flex items-center gap-4">
                <ArrowRight className="h-6 w-6 text-spacecraft" />
                <img
                  src={selectedCard.image_uris?.normal || selectedCard.image_uris?.large}
                  alt={selectedCard.name}
                  className="w-24 h-auto rounded border-2 border-spacecraft"
                />
                <div>
                  <p className="text-sm text-muted-foreground">New card:</p>
                  <p className="font-semibold">{selectedCard.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedCard.type_line}</p>
                  {selectedCard.prices?.usd && (
                    <Badge variant="outline" className="mt-1">
                      ${selectedCard.prices.usd}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleMarkFuture}
            disabled={!selectedCard}
            className="gap-2"
          >
            <Bookmark className="h-4 w-4" />
            Mark as Future
          </Button>
          <Button
            onClick={handleReplaceNow}
            disabled={!selectedCard}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Replace Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
