import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crown, Package, Plus, Check } from 'lucide-react';
import { useDeckManagementStore } from '@/stores/deckManagementStore';

interface DeckAdditionPanelProps {
  selectedDeckId?: string;
  addToCollection?: boolean;
  addToDeck?: boolean;
  onSelectionChange?: (config: {
    selectedDeckId: string;
    addToCollection: boolean;
    addToDeck: boolean;
  }) => void;
}

export function DeckAdditionPanel({ 
  selectedDeckId: initialDeckId = '', 
  addToCollection: initialAddToCollection = true,
  addToDeck: initialAddToDeck = false,
  onSelectionChange 
}: DeckAdditionPanelProps) {
  const { decks } = useDeckManagementStore();
  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId);
  const [addToCollection, setAddToCollection] = useState(initialAddToCollection);
  const [addToDeck, setAddToDeck] = useState(initialAddToDeck);

  // Notify parent of changes
  const handleSelectionChange = (updates: Partial<{
    selectedDeckId: string;
    addToCollection: boolean;
    addToDeck: boolean;
  }>) => {
    const newConfig = {
      selectedDeckId: updates.selectedDeckId ?? selectedDeckId,
      addToCollection: updates.addToCollection ?? addToCollection,
      addToDeck: updates.addToDeck ?? addToDeck,
    };
    
    if (updates.selectedDeckId !== undefined) setSelectedDeckId(updates.selectedDeckId);
    if (updates.addToCollection !== undefined) setAddToCollection(updates.addToCollection);
    if (updates.addToDeck !== undefined) setAddToDeck(updates.addToDeck);
    
    onSelectionChange?.(newConfig);
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
            className={`w-3 h-3 rounded-full border ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add Cards To
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Single row with both options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Add to Collection Toggle */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">My Collection</p>
                <p className="text-xs text-muted-foreground">Track owned cards</p>
              </div>
            </div>
            <Button
              variant={addToCollection ? "default" : "outline"}
              size="sm"
              onClick={() => handleSelectionChange({ addToCollection: !addToCollection })}
            >
              {addToCollection && <Check className="h-4 w-4 mr-1" />}
              {addToCollection ? 'Adding' : 'Add'}
            </Button>
          </div>

          {/* Add to Deck Section */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 text-purple-500" />
              <div>
                <p className="font-medium">Add to Deck</p>
                <p className="text-xs text-muted-foreground">Build simultaneously</p>
              </div>
            </div>
            <Button
              variant={addToDeck ? "default" : "outline"}
              size="sm"
              onClick={() => handleSelectionChange({ addToDeck: !addToDeck })}
            >
              {addToDeck && <Check className="h-4 w-4 mr-1" />}
              {addToDeck ? 'Enabled' : 'Enable'}
            </Button>
          </div>
        </div>

        {/* Deck Selection - Only show when deck adding is enabled */}
        {addToDeck && (
          <div className="space-y-3">
            <Select value={selectedDeckId} onValueChange={(value) => handleSelectionChange({ selectedDeckId: value })}>
              <SelectTrigger className="bg-background border z-50">
                <SelectValue placeholder="Choose a deck..." />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                {decks.map(deck => (
                  <SelectItem key={deck.id} value={deck.id}>
                    <div className="flex items-center gap-2">
                      <span>{deck.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {deck.format}
                      </Badge>
                      {deck.colors.length > 0 && getColorIndicator(deck.colors)}
                      <span className="text-xs text-muted-foreground">
                        ({deck.totalCards} cards)
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedDeckId && (
              <div className="bg-muted/50 p-3 rounded-lg">
                {(() => {
                  const selectedDeck = decks.find(d => d.id === selectedDeckId);
                  return selectedDeck ? (
                    <div className="flex items-center gap-3">
                      {selectedDeck.commander && (
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <span className="text-sm">{selectedDeck.commander.name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {selectedDeck.format}
                        </Badge>
                        {selectedDeck.colors.length > 0 && getColorIndicator(selectedDeck.colors)}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
          <p className="text-sm font-medium text-primary">
            Cards will be added to: {' '}
            {[
              addToCollection && 'Collection',
              addToDeck && selectedDeckId && decks.find(d => d.id === selectedDeckId)?.name
            ].filter(Boolean).join(' + ') || 'Nothing selected'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}