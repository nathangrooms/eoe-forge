import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Search, X } from 'lucide-react';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { useDeckManagementStore, type DeckCard } from '@/stores/deckManagementStore';
import { showSuccess } from '@/components/ui/toast-helpers';

interface CommanderSelectorProps {
  deckId: string;
  currentCommander?: DeckCard;
}

export function CommanderSelector({ deckId, currentCommander }: CommanderSelectorProps) {
  const { setCommander } = useDeckManagementStore();
  const [showDialog, setShowDialog] = useState(false);

  const handleCommanderSelect = (card: any) => {
    // Verify it's a legendary creature
    if (!card.type_line?.toLowerCase().includes('legendary') || 
        !card.type_line?.toLowerCase().includes('creature')) {
      return; // Could show an error toast here
    }

    const commanderCard: DeckCard = {
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.color_identity || card.colors || [],
      mana_cost: card.mana_cost,
      quantity: 1,
      category: 'creatures',
      mechanics: card.keywords || [],
      image_uris: card.image_uris,
      prices: card.prices
    };

    setCommander(deckId, commanderCard);
    setShowDialog(false);
    showSuccess('Commander Set', `${card.name} is now your commander`);
  };

  const handleRemoveCommander = () => {
    // You might want to add a removeCommander method to the store
    showSuccess('Commander Removed', 'Commander has been removed from your deck');
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      U: 'bg-blue-100 text-blue-800 border-blue-300',
      B: 'bg-gray-100 text-gray-800 border-gray-300',
      R: 'bg-red-100 text-red-800 border-red-300',
      G: 'bg-green-100 text-green-800 border-green-300'
    };
    
    return (
      <div className="flex gap-1">
        {colors.map(color => (
          <div 
            key={color}
            className={`w-4 h-4 rounded-full border ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Crown className="h-5 w-5 text-yellow-500" />
          Commander
        </h3>
        
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Search className="h-4 w-4 mr-2" />
              {currentCommander ? 'Change Commander' : 'Select Commander'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>Choose Your Commander</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Search for legendary creatures to use as your commander
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              <EnhancedUniversalCardSearch
                onCardAdd={handleCommanderSelect}
                onCardSelect={handleCommanderSelect}
                placeholder="Search for legendary creatures (t:legendary t:creature)..."
                showFilters={true}
                showAddButton={false}
                showWishlistButton={false}
                showViewModes={true}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {currentCommander ? (
        <Card className="relative overflow-hidden">
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveCommander}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {currentCommander.image_uris?.normal && (
                <div className="relative">
                  <img 
                    src={currentCommander.image_uris.normal} 
                    alt={currentCommander.name}
                    className="w-24 h-auto rounded-lg shadow-md"
                  />
                  <div className="absolute -top-2 -right-2">
                    <Crown className="h-6 w-6 text-yellow-500 drop-shadow-md" />
                  </div>
                </div>
              )}
              
              <div className="flex-1 space-y-2">
                <div>
                  <h4 className="font-bold text-lg">{currentCommander.name}</h4>
                  <p className="text-sm text-muted-foreground">{currentCommander.type_line}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  {currentCommander.mana_cost && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {currentCommander.mana_cost}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    CMC {currentCommander.cmc}
                  </Badge>
                  {currentCommander.colors.length > 0 && getColorIndicator(currentCommander.colors)}
                </div>
                
                {currentCommander.prices?.usd && (
                  <p className="text-sm text-muted-foreground">
                    Price: ${currentCommander.prices.usd}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-8 text-center border-dashed">
          <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            No commander selected for this deck.
          </p>
          <Button onClick={() => setShowDialog(true)}>
            <Crown className="h-4 w-4 mr-2" />
            Choose Commander
          </Button>
        </Card>
      )}
    </div>
  );
}