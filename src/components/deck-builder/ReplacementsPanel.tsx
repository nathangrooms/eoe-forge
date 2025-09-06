import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Trash2, 
  Search, 
  Star, 
  Heart, 
  ArrowUpDown,
  Package,
  Target
} from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { useToast } from '@/hooks/use-toast';

const PRIORITY_COLORS = {
  1: 'bg-red-500',
  2: 'bg-orange-500', 
  3: 'bg-yellow-500',
  4: 'bg-blue-500',
  5: 'bg-gray-500'
};

export function ReplacementsPanel() {
  const deck = useDeckStore();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [newReplacementCard, setNewReplacementCard] = useState<any>(null);
  const [priority, setPriority] = useState('3');
  const [notes, setNotes] = useState('');
  const [isAddingReplacement, setIsAddingReplacement] = useState(false);

  const searchForCards = async (query: string) => {
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name&unique=cards`
      );
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.data || []);
      }
    } catch (error) {
      console.error('Error searching cards:', error);
    }
  };

  const addReplacement = () => {
    if (!selectedCard || !newReplacementCard) return;

    deck.addReplacement(
      selectedCard.id,
      newReplacementCard,
      parseInt(priority),
      notes
    );

    toast({
      title: "Replacement Added",
      description: `${newReplacementCard.name} added as replacement for ${selectedCard.name}`,
    });

    // Reset form
    setNewReplacementCard(null);
    setNotes('');
    setPriority('3');
    setIsAddingReplacement(false);
  };

  const addToWishlist = (replacementId: string) => {
    deck.addReplacementToWishlist(replacementId);
    toast({
      title: "Added to Wishlist",
      description: "Replacement card added to your wishlist",
    });
  };

  const getCardReplacements = (cardId: string) => {
    return deck.getReplacementsForCard(cardId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Replacement Cards</h2>
          <Badge variant="outline" className="text-xs">
            {deck.replacements.length}
          </Badge>
        </div>
        
        <Dialog open={isAddingReplacement} onOpenChange={setIsAddingReplacement}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8">
              <Plus className="h-4 w-4 mr-1" />
              Add Replacement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Replacement Card</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Step 1: Select original card */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">1. Select Original Card</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {deck.cards.map((card) => (
                    <div 
                      key={card.id}
                      className={`p-3 rounded border cursor-pointer transition-colors ${
                        selectedCard?.id === card.id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedCard(card)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{card.name}</p>
                          <p className="text-xs text-muted-foreground">{card.type_line}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {getCardReplacements(card.id).length}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2: Search and select replacement */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">2. Search Replacement Card</h3>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for replacement cards..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchForCards(e.target.value);
                    }}
                    className="pl-9"
                  />
                </div>

                {newReplacementCard && (
                  <div className="p-3 border border-primary rounded bg-primary/5">
                    <div className="flex items-center space-x-3">
                      {newReplacementCard.image_uris?.small && (
                        <img 
                          src={newReplacementCard.image_uris.small} 
                          alt={newReplacementCard.name}
                          className="w-12 h-16 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm">{newReplacementCard.name}</p>
                        <p className="text-xs text-muted-foreground mb-1">{newReplacementCard.type_line}</p>
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className="text-xs">
                            CMC {newReplacementCard.cmc}
                          </Badge>
                          {newReplacementCard.prices?.usd && (
                            <span className="text-xs text-green-600">${newReplacementCard.prices.usd}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewReplacementCard(null)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.map((card) => (
                    <div 
                      key={card.id}
                      className="p-2 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setNewReplacementCard(card)}
                    >
                      <div className="flex items-center space-x-2">
                        {card.image_uris?.small && (
                          <img 
                            src={card.image_uris.small} 
                            alt={card.name}
                            className="w-8 h-10 object-cover rounded"
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{card.name}</p>
                          <p className="text-xs text-muted-foreground">{card.type_line}</p>
                        </div>
                        {card.prices?.usd && (
                          <span className="text-xs text-green-600">${card.prices.usd}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Configuration */}
            {selectedCard && newReplacementCard && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Priority</label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - Highest</SelectItem>
                        <SelectItem value="2">2 - High</SelectItem>
                        <SelectItem value="3">3 - Medium</SelectItem>
                        <SelectItem value="4">4 - Low</SelectItem>
                        <SelectItem value="5">5 - Lowest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <Textarea
                    placeholder="Why is this a good replacement?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsAddingReplacement(false)}>
                    Cancel
                  </Button>
                  <Button onClick={addReplacement}>
                    Add Replacement
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Replacements List */}
      <div className="space-y-3">
        {deck.cards.map((card) => {
          const replacements = getCardReplacements(card.id);
          if (replacements.length === 0) return null;

          return (
            <Card key={card.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="font-medium">{card.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {replacements.length} replacement{replacements.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {replacements.map((replacement) => (
                  <div key={replacement.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                    <div className="flex items-center space-x-3">
                      <div 
                        className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[replacement.priority as keyof typeof PRIORITY_COLORS]}`}
                        title={`Priority ${replacement.priority}`}
                      />
                      {replacement.card.image_uris?.small && (
                        <img 
                          src={replacement.card.image_uris.small} 
                          alt={replacement.card.name}
                          className="w-8 h-10 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm">{replacement.card.name}</p>
                        <p className="text-xs text-muted-foreground">{replacement.card.type_line}</p>
                        {replacement.notes && (
                          <p className="text-xs text-muted-foreground italic mt-1">{replacement.notes}</p>
                        )}
                      </div>
                      {replacement.card.prices?.usd && (
                        <span className="text-sm text-green-600">${replacement.card.prices.usd}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addToWishlist(replacement.id)}
                        title="Add to wishlist"
                      >
                        <Heart className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deck.removeReplacement(replacement.id)}
                        title="Remove replacement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {deck.replacements.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Replacement Cards</h3>
            <p className="text-sm mb-4">Add replacement options for cards you want to upgrade in the future.</p>
            <Button variant="outline" onClick={() => setIsAddingReplacement(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Replacement
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}