import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Grip, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DeckCard {
  id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  image_uris?: { small?: string; normal?: string };
  cmc: number;
}

interface DragDropDeckBuilderProps {
  availableCards: DeckCard[];
  deckCards: DeckCard[];
  onAddCard: (card: DeckCard) => void;
  onRemoveCard: (cardId: string) => void;
  onReorderDeck: (cards: DeckCard[]) => void;
}

export function DragDropDeckBuilder({
  availableCards,
  deckCards,
  onAddCard,
  onRemoveCard,
  onReorderDeck,
}: DragDropDeckBuilderProps) {
  const [draggedCard, setDraggedCard] = useState<DeckCard | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropZone, setDropZone] = useState<'deck' | 'remove' | null>(null);

  const handleDragStart = (card: DeckCard, index?: number) => {
    setDraggedCard(card);
    if (index !== undefined) {
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDraggedIndex(null);
    setDropZone(null);
  };

  const handleDragOver = (e: React.DragEvent, zone: 'deck' | 'remove') => {
    e.preventDefault();
    setDropZone(zone);
  };

  const handleDragLeave = () => {
    setDropZone(null);
  };

  const handleDrop = (e: React.DragEvent, zone: 'deck' | 'remove') => {
    e.preventDefault();
    
    if (!draggedCard) return;

    if (zone === 'deck' && draggedIndex === null) {
      // Adding from available cards
      onAddCard(draggedCard);
      toast.success(`Added ${draggedCard.name} to deck`);
    } else if (zone === 'remove' && draggedIndex !== null) {
      // Removing from deck
      onRemoveCard(draggedCard.id);
      toast.success(`Removed ${draggedCard.name} from deck`);
    }

    handleDragEnd();
  };

  const handleReorder = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newDeck = [...deckCards];
    const [removed] = newDeck.splice(draggedIndex, 1);
    newDeck.splice(targetIndex, 0, removed);
    
    onReorderDeck(newDeck);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Available Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Available Cards</h3>
        <div className="grid grid-cols-2 gap-2 max-h-[600px] overflow-y-auto p-2">
          {availableCards.slice(0, 50).map((card) => (
            <Card
              key={card.id}
              draggable
              onDragStart={() => handleDragStart(card)}
              onDragEnd={handleDragEnd}
              className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2">
                <Grip className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {card.cmc}
                    </Badge>
                    <p className="text-xs text-muted-foreground truncate">
                      {card.type_line.split('—')[0].trim()}
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    onAddCard(card);
                    toast.success(`Added ${card.name}`);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Deck Zone */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Deck ({deckCards.length})</h3>
          <Badge variant="secondary">{deckCards.length}/100</Badge>
        </div>
        
        <div
          className={`border-2 border-dashed rounded-lg p-4 min-h-[500px] transition-colors ${
            dropZone === 'deck' 
              ? 'border-primary bg-primary/5' 
              : 'border-border'
          }`}
          onDragOver={(e) => handleDragOver(e, 'deck')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'deck')}
        >
          {deckCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">Drag cards here to build your deck</p>
              <p className="text-sm">or click the + button on cards</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deckCards.map((card, index) => (
                <Card
                  key={`${card.id}-${index}`}
                  draggable
                  onDragStart={() => handleDragStart(card, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleReorder(e, index)}
                  className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-2">
                    <Grip className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{card.name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {card.cmc}
                        </Badge>
                        <p className="text-xs text-muted-foreground truncate">
                          {card.type_line.split('—')[0].trim()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        onRemoveCard(card.id);
                        toast.success(`Removed ${card.name}`);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Remove Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            dropZone === 'remove' 
              ? 'border-destructive bg-destructive/5' 
              : 'border-border'
          }`}
          onDragOver={(e) => handleDragOver(e, 'remove')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'remove')}
        >
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Trash2 className="h-4 w-4" />
            <p className="text-sm">Drop here to remove from deck</p>
          </div>
        </div>
      </div>
    </div>
  );
}
