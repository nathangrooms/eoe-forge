import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Plus, Trash2, Edit } from 'lucide-react';
import { useDeckManagementStore, type Deck } from '@/stores/deckManagementStore';
import { showSuccess } from '@/components/ui/toast-helpers';

interface DeckSelectorProps {
  onDeckSelect?: (deck: Deck) => void;
  selectedDeckId?: string;
  format?: string;
}

export function DeckSelector({ onDeckSelect, selectedDeckId, format }: DeckSelectorProps) {
  const { 
    decks, 
    activeDeck, 
    createDeck, 
    deleteDeck, 
    setActiveDeck, 
    getDecksByFormat 
  } = useDeckManagementStore();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState(format || 'standard');
  const [newDeckDescription, setNewDeckDescription] = useState('');

  const filteredDecks = format ? getDecksByFormat(format) : decks;

  const handleCreateDeck = () => {
    if (!newDeckName.trim()) return;
    
    const deck = createDeck(newDeckName, newDeckFormat, newDeckDescription);
    setActiveDeck(deck.id);
    onDeckSelect?.(deck);
    showSuccess('Deck Created', `Created ${newDeckName} deck`);
    
    // Reset form
    setNewDeckName('');
    setNewDeckDescription('');
    setShowCreateDialog(false);
  };

  const handleDeckSelect = (deckId: string) => {
    setActiveDeck(deckId);
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      onDeckSelect?.(deck);
    }
  };

  const handleDeleteDeck = (deckId: string, deckName: string) => {
    if (confirm(`Are you sure you want to delete "${deckName}"?`)) {
      deleteDeck(deckId);
      showSuccess('Deck Deleted', `Deleted ${deckName}`);
    }
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 text-yellow-800',
      U: 'bg-blue-100 text-blue-800',
      B: 'bg-gray-100 text-gray-800',
      R: 'bg-red-100 text-red-800',
      G: 'bg-green-100 text-green-800'
    };
    
    return (
      <div className="flex gap-1">
        {colors.map(color => (
          <div 
            key={color}
            className={`w-3 h-3 rounded-full ${colorMap[color] || 'bg-gray-200'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Select Deck</h3>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Deck
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Deck</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="deck-name">Deck Name</Label>
                <Input
                  id="deck-name"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Enter deck name..."
                />
              </div>
              
              <div>
                <Label htmlFor="deck-format">Format</Label>
                <Select value={newDeckFormat} onValueChange={setNewDeckFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="commander">Commander</SelectItem>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="pioneer">Pioneer</SelectItem>
                    <SelectItem value="legacy">Legacy</SelectItem>
                    <SelectItem value="vintage">Vintage</SelectItem>
                    <SelectItem value="pauper">Pauper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="deck-description">Description (Optional)</Label>
                <Textarea
                  id="deck-description"
                  value={newDeckDescription}
                  onChange={(e) => setNewDeckDescription(e.target.value)}
                  placeholder="Describe your deck strategy..."
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateDeck} disabled={!newDeckName.trim()}>
                  Create Deck
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDecks.map(deck => (
          <Card 
            key={deck.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedDeckId === deck.id || activeDeck?.id === deck.id 
                ? 'ring-2 ring-primary' 
                : ''
            }`}
            onClick={() => handleDeckSelect(deck.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {deck.name}
                    {deck.format === 'commander' && (
                      <Crown className="h-4 w-4 text-yellow-500" />
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {deck.format}
                    </Badge>
                    {deck.colors.length > 0 && getColorIndicator(deck.colors)}
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDeck(deck.id, deck.name);
                  }}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              {deck.commander && (
                <div className="mb-2 p-2 bg-muted/50 rounded-md">
                  <p className="text-sm font-medium">Commander:</p>
                  <p className="text-sm text-muted-foreground">{deck.commander.name}</p>
                </div>
              )}
              
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{deck.totalCards} cards</span>
                <span>Power: {deck.powerLevel}/10</span>
              </div>
              
              {deck.description && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {deck.description}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      {filteredDecks.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">
            No decks found for {format || 'this format'}.
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Deck
          </Button>
        </Card>
      )}
    </div>
  );
}