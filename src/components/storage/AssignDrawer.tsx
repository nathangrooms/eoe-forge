import { useState, useEffect } from 'react';
import { Search, Plus, Minus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { StorageAPI } from '@/lib/api/storageAPI';
import { useToast } from '@/hooks/use-toast';

interface AssignDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerId: string;
  onSuccess: () => void;
}

interface OwnedCard {
  card_id: string;
  card_name: string;
  set_code: string;
  quantity: number;
  foil: number;
  assigned_normal: number;
  assigned_foil: number;
  card?: {
    image_uris?: { small?: string };
    prices?: { usd?: string };
    rarity?: string;
    type_line?: string;
  };
}

export function AssignDrawer({ open, onOpenChange, containerId, onSuccess }: AssignDrawerProps) {
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
  const [filteredCards, setFilteredCards] = useState<OwnedCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, { normal: number; foil: number }>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadOwnedCards();
    }
  }, [open]);

  useEffect(() => {
    const filtered = ownedCards.filter(card =>
      card.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.set_code.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredCards(filtered);
  }, [ownedCards, searchQuery]);

  const loadOwnedCards = async () => {
    setLoading(true);
    try {
      // Get collection with card data
      const { data: collection, error: collectionError } = await supabase
        .from('user_collections')
        .select(`
          card_id,
          card_name,
          set_code,
          quantity,
          foil,
          card:cards(image_uris, prices, rarity, type_line)
        `)
        .order('card_name');

      if (collectionError) throw collectionError;

      // Get assigned quantities for all cards
      const { data: assigned, error: assignedError } = await supabase
        .from('storage_items')
        .select('card_id, qty, foil');

      if (assignedError) throw assignedError;

      // Calculate assigned quantities by card
      const assignedMap = new Map<string, { normal: number; foil: number }>();
      assigned?.forEach(item => {
        const key = item.card_id;
        const current = assignedMap.get(key) || { normal: 0, foil: 0 };
        if (item.foil) {
          current.foil += item.qty;
        } else {
          current.normal += item.qty;
        }
        assignedMap.set(key, current);
      });

      // Combine data
      const enrichedCards: OwnedCard[] = collection?.map(item => {
        const assigned = assignedMap.get(item.card_id) || { normal: 0, foil: 0 };
        return {
          ...item,
          assigned_normal: assigned.normal,
          assigned_foil: assigned.foil,
          card: item.card ? {
            image_uris: item.card.image_uris as any,
            prices: item.card.prices as any,
            rarity: item.card.rarity,
            type_line: item.card.type_line
          } : undefined
        };
      }) || [];

      setOwnedCards(enrichedCards);
    } catch (error) {
      console.error('Failed to load owned cards:', error);
      toast({
        title: "Error",
        description: "Failed to load your collection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateAssignment = (cardId: string, type: 'normal' | 'foil', delta: number) => {
    setAssignments(prev => {
      const current = prev[cardId] || { normal: 0, foil: 0 };
      const newValue = Math.max(0, current[type] + delta);
      
      // Check against available quantity
      const card = ownedCards.find(c => c.card_id === cardId);
      if (!card) return prev;
      
      const maxAvailable = type === 'foil' 
        ? card.foil - card.assigned_foil
        : card.quantity - card.assigned_normal;
      
      if (newValue > maxAvailable) return prev;

      return {
        ...prev,
        [cardId]: {
          ...current,
          [type]: newValue
        }
      };
    });
  };

  const handleAssignAll = async () => {
    const assignmentEntries = Object.entries(assignments).filter(
      ([_, counts]) => counts.normal > 0 || counts.foil > 0
    );

    if (assignmentEntries.length === 0) {
      toast({
        title: "No assignments",
        description: "Please select cards to assign first",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      for (const [cardId, counts] of assignmentEntries) {
        if (counts.normal > 0) {
          await StorageAPI.assignCard({
            container_id: containerId,
            card_id: cardId,
            qty: counts.normal,
            foil: false
          });
        }
        if (counts.foil > 0) {
          await StorageAPI.assignCard({
            container_id: containerId,
            card_id: cardId,
            qty: counts.foil,
            foil: true
          });
        }
      }

      toast({
        title: "Success",
        description: `Assigned ${assignmentEntries.length} card types to container`
      });

      setAssignments({});
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to assign cards",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const totalAssignments = Object.values(assignments).reduce(
    (sum, counts) => sum + counts.normal + counts.foil, 0
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Assign Cards to Container</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-full">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your collection..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Cards List */}
          <ScrollArea className="flex-1">
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <div className="w-12 h-12 bg-muted rounded"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4"></div>
                          <div className="h-3 bg-muted rounded w-1/2"></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : filteredCards.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No cards found</p>
                </div>
              ) : (
                filteredCards.map((card) => {
                  const availableNormal = card.quantity - card.assigned_normal;
                  const availableFoil = card.foil - card.assigned_foil;
                  const assignment = assignments[card.card_id] || { normal: 0, foil: 0 };

                  if (availableNormal <= 0 && availableFoil <= 0) return null;

                  return (
                    <Card key={card.card_id}>
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          <div className="w-12 h-12 bg-muted rounded overflow-hidden flex-shrink-0">
                            {card.card?.image_uris?.small && (
                              <img
                                src={card.card.image_uris.small}
                                alt={card.card_name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate">
                              {card.card_name}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {card.set_code.toUpperCase()} • {card.card?.rarity}
                            </p>
                            
                            {/* Normal Cards */}
                            {availableNormal > 0 && (
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="text-xs">
                                  {availableNormal} available
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateAssignment(card.card_id, 'normal', -1)}
                                    disabled={assignment.normal <= 0}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm">
                                    {assignment.normal}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateAssignment(card.card_id, 'normal', 1)}
                                    disabled={assignment.normal >= availableNormal}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Foil Cards */}
                            {availableFoil > 0 && (
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="default" className="text-xs">
                                  {availableFoil} foil available
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateAssignment(card.card_id, 'foil', -1)}
                                    disabled={assignment.foil <= 0}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm">
                                    {assignment.foil}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateAssignment(card.card_id, 'foil', 1)}
                                    disabled={assignment.foil >= availableFoil}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {totalAssignments} cards selected
              </span>
              <Button
                onClick={handleAssignAll}
                disabled={totalAssignments === 0 || loading}
              >
                {loading ? "Assigning..." : `Assign ${totalAssignments} Cards`}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}