import { useState, useEffect } from 'react';
import { Search, Plus, Minus, Sparkles, Package, Loader2, Check, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { StorageAPI } from '@/lib/api/storageAPI';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AssignDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerId: string;
  containerName?: string;
  containerColor?: string;
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

export function AssignDrawer({ 
  open, 
  onOpenChange, 
  containerId, 
  containerName = 'Container',
  containerColor = '#6366F1',
  onSuccess 
}: AssignDrawerProps) {
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

  const availableCards = filteredCards.filter(card => {
    const availableNormal = card.quantity - card.assigned_normal;
    const availableFoil = card.foil - card.assigned_foil;
    return availableNormal > 0 || availableFoil > 0;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-card to-background">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div 
                className="p-2.5 rounded-xl shadow-md"
                style={{ backgroundColor: containerColor }}
              >
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <SheetTitle className="text-lg">Assign Cards</SheetTitle>
                <SheetDescription>
                  Add cards from your collection to {containerName}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-6 py-4 border-b bg-card/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search your collection..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11"
              />
              {searchQuery && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-2">
                {availableCards.length} cards available to assign
              </p>
            )}
          </div>

          {/* Cards List */}
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-3 py-4">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : availableCards.length === 0 ? (
                <Card className="border-dashed border-2 border-muted-foreground/20">
                  <CardContent className="py-12 px-6 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">
                      {searchQuery ? 'No matching cards' : 'All cards assigned'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {searchQuery 
                        ? 'Try a different search term'
                        : 'Add more cards to your collection to assign them'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                availableCards.map((card) => {
                  const availableNormal = card.quantity - card.assigned_normal;
                  const availableFoil = card.foil - card.assigned_foil;
                  const assignment = assignments[card.card_id] || { normal: 0, foil: 0 };
                  const hasAssignment = assignment.normal > 0 || assignment.foil > 0;

                  return (
                    <Card 
                      key={card.card_id}
                      className={cn(
                        "transition-all duration-200",
                        hasAssignment && "ring-2 ring-primary bg-primary/5"
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          <div className="w-14 h-14 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                            {card.card?.image_uris?.small && (
                              <img
                                src={card.card.image_uris.small}
                                alt={card.card_name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-semibold text-sm truncate">
                                  {card.card_name}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  {card.set_code.toUpperCase()} • {card.card?.rarity}
                                </p>
                              </div>
                              {hasAssignment && (
                                <Badge className="bg-primary">
                                  +{assignment.normal + assignment.foil}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Normal Cards */}
                            {availableNormal > 0 && (
                              <div className="flex items-center justify-between gap-2 mt-3 p-2 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {availableNormal} available
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => updateAssignment(card.card_id, 'normal', -1)}
                                    disabled={assignment.normal <= 0}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-10 text-center text-sm font-medium">
                                    {assignment.normal}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
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
                              <div className="flex items-center justify-between gap-2 mt-2 p-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20">
                                <div className="flex items-center gap-2">
                                  <Badge className="text-xs bg-gradient-to-r from-amber-500 to-yellow-500 border-0">
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    {availableFoil} foil
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => updateAssignment(card.card_id, 'foil', -1)}
                                    disabled={assignment.foil <= 0}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-10 text-center text-sm font-medium">
                                    {assignment.foil}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
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
          <div className="border-t p-4 bg-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {totalAssignments} cards selected
                </p>
                {totalAssignments > 0 && (
                  <button
                    onClick={() => setAssignments({})}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <Button
                onClick={handleAssignAll}
                disabled={totalAssignments === 0 || loading}
                size="lg"
                className="gap-2 bg-gradient-cosmic hover:opacity-90"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Assign {totalAssignments} Cards
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}