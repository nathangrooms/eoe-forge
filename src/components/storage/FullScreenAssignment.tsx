import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Scan, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { StorageAPI } from '@/lib/api/storageAPI';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface FullScreenAssignmentProps {
  containerId?: string;
  containerName?: string;
  onClose: () => void;
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
    image_uris?: any;
    prices?: any;
    rarity?: string;
    type_line?: string;
  };
}

export function FullScreenAssignment({ 
  containerId, 
  containerName, 
  onClose, 
  onSuccess 
}: FullScreenAssignmentProps) {
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
  const [filteredCards, setFilteredCards] = useState<OwnedCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, { normal: number; foil: number }>>({});
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    loadOwnedCards();
  }, []);

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
    if (!containerId) {
      toast({
        title: "No container selected",
        description: "Please select a container to assign cards to",
        variant: "destructive"
      });
      return;
    }

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
        description: `Assigned ${assignmentEntries.length} card types to ${containerName || 'container'}`
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

  const openScanFeature = () => {
    // Navigate to scan feature
    window.location.href = '/scan';
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">
              {containerId ? `Assign Cards to ${containerName}` : 'Assign Cards to Storage'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Select cards from your collection to assign to storage
            </p>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your collection..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {isMobile && (
            <Button
              variant="outline"
              onClick={openScanFeature}
              className="sm:w-auto"
            >
              <Scan className="h-4 w-4 mr-2" />
              Fast Scan
            </Button>
          )}
        </div>
      </div>

      {/* Cards List */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 bg-muted rounded"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No cards found</p>
              {isMobile && (
                <Button onClick={openScanFeature}>
                  <Scan className="h-4 w-4 mr-2" />
                  Try Fast Scan
                </Button>
              )}
            </div>
          ) : (
            filteredCards.map((card) => {
              const availableNormal = card.quantity - card.assigned_normal;
              const availableFoil = card.foil - card.assigned_foil;
              const assignment = assignments[card.card_id] || { normal: 0, foil: 0 };

              if (availableNormal <= 0 && availableFoil <= 0) return null;

              return (
                <Card key={card.card_id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                        {card.card?.image_uris?.small && (
                          <img
                            src={card.card.image_uris.small}
                            alt={card.card_name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-3">
                        <div>
                          <h4 className="font-semibold truncate">{card.card_name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {card.set_code.toUpperCase()} • {card.card?.rarity}
                          </p>
                        </div>
                        
                        {/* Normal Cards */}
                        {availableNormal > 0 && (
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary">
                              {availableNormal} available
                            </Badge>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAssignment(card.card_id, 'normal', -1)}
                                disabled={assignment.normal <= 0}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-12 text-center font-medium">
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
                          <div className="flex items-center justify-between">
                            <Badge variant="default">
                              {availableFoil} foil available
                            </Badge>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAssignment(card.card_id, 'foil', -1)}
                                disabled={assignment.foil <= 0}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-12 text-center font-medium">
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
      <div className="border-t p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {totalAssignments} cards selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignAll}
              disabled={totalAssignments === 0 || loading}
            >
              {loading ? "Assigning..." : `Assign ${totalAssignments} Cards`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}