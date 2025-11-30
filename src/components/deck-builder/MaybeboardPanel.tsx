import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  HelpCircle, 
  Plus, 
  Trash2, 
  ArrowRight, 
  CheckCircle2,
  StickyNote
} from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface MaybeboardCard {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  notes?: string;
  created_at: string;
}

interface MaybeboardPanelProps {
  deckId: string;
  onAddToDeck?: (cardId: string, cardName: string, quantity: number) => void;
}

export function MaybeboardPanel({ deckId, onAddToDeck }: MaybeboardPanelProps) {
  const [cards, setCards] = useState<MaybeboardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCard, setEditingCard] = useState<MaybeboardCard | null>(null);

  const [formData, setFormData] = useState({
    cardName: '',
    cardId: '',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    loadMaybeboard();
  }, [deckId]);

  const loadMaybeboard = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deck_maybeboard')
        .select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCards(data || []);
    } catch (error) {
      console.error('Error loading maybeboard:', error);
      showError('Error', 'Failed to load maybeboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingCard) {
        // Update existing card
        const { error } = await supabase
          .from('deck_maybeboard')
          .update({
            quantity: formData.quantity,
            notes: formData.notes
          })
          .eq('id', editingCard.id);

        if (error) throw error;
        showSuccess('Card Updated', 'Maybeboard card updated');
      } else {
        // Add new card
        const { error } = await supabase
          .from('deck_maybeboard')
          .insert({
            deck_id: deckId,
            card_id: formData.cardId || formData.cardName.toLowerCase().replace(/\s+/g, '-'),
            card_name: formData.cardName,
            quantity: formData.quantity,
            notes: formData.notes
          });

        if (error) throw error;
        showSuccess('Card Added', `${formData.cardName} added to maybeboard`);
      }

      setShowAddDialog(false);
      setEditingCard(null);
      setFormData({ cardName: '', cardId: '', quantity: 1, notes: '' });
      loadMaybeboard();
    } catch (error) {
      console.error('Error saving card:', error);
      showError('Error', 'Failed to save card to maybeboard');
    }
  };

  const handleDelete = async (cardId: string) => {
    try {
      const { error } = await supabase
        .from('deck_maybeboard')
        .delete()
        .eq('id', cardId);

      if (error) throw error;
      showSuccess('Card Removed', 'Card removed from maybeboard');
      loadMaybeboard();
    } catch (error) {
      console.error('Error deleting card:', error);
      showError('Error', 'Failed to remove card');
    }
  };

  const handleAddToDeck = async (card: MaybeboardCard) => {
    if (onAddToDeck) {
      onAddToDeck(card.card_id, card.card_name, card.quantity);
      // Optionally remove from maybeboard after adding to deck
      await handleDelete(card.id);
    }
  };

  const handleEdit = (card: MaybeboardCard) => {
    setEditingCard(card);
    setFormData({
      cardName: card.card_name,
      cardId: card.card_id,
      quantity: card.quantity,
      notes: card.notes || ''
    });
    setShowAddDialog(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Maybeboard
            <Badge variant="secondary">{cards.length}</Badge>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCard ? 'Edit Card' : 'Add to Maybeboard'}</DialogTitle>
                <DialogDescription>
                  Track cards you're considering for this deck
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="cardName">Card Name</Label>
                  <Input
                    id="cardName"
                    value={formData.cardName}
                    onChange={(e) => setFormData({ ...formData, cardName: e.target.value })}
                    placeholder="e.g. Lightning Bolt"
                    required
                    disabled={!!editingCard}
                  />
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Why are you considering this card?"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    {editingCard ? 'Update' : 'Add'} Card
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddDialog(false);
                      setEditingCard(null);
                      setFormData({ cardName: '', cardId: '', quantity: 1, notes: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : cards.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No cards in maybeboard. Add cards you're considering!
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{card.card_name}</span>
                        <Badge variant="outline">x{card.quantity}</Badge>
                      </div>
                      {card.notes && (
                        <div className="flex items-start gap-2 mt-2">
                          <StickyNote className="h-3 w-3 mt-0.5 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">{card.notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAddToDeck(card)}
                        title="Add to deck"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(card)}
                      >
                        <StickyNote className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(card.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
