import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Crown, Package, Plus, Check, Box, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { StorageAPI } from '@/lib/api/storageAPI';
import { StorageContainer } from '@/types/storage';
import { supabase } from '@/integrations/supabase/client';

interface DeckOption {
  id: string;
  name: string;
  format: string;
  colors: string[];
}

interface DeckAdditionPanelProps {
  selectedDeckId?: string;
  selectedBoxId?: string;
  addToCollection?: boolean;
  addToDeck?: boolean;
  addToBox?: boolean;
  collapsed?: boolean;
  onSelectionChange?: (config: {
    selectedDeckId: string;
    selectedBoxId: string;
    addToCollection: boolean;
    addToDeck: boolean;
    addToBox: boolean;
  }) => void;
}

export function DeckAdditionPanel({ 
  selectedDeckId: initialDeckId = '', 
  selectedBoxId: initialBoxId = '',
  addToCollection: initialAddToCollection = true,
  addToDeck: initialAddToDeck = false,
  addToBox: initialAddToBox = false,
  collapsed: initialCollapsed = false,
  onSelectionChange 
}: DeckAdditionPanelProps) {
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId);
  const [selectedBoxId, setSelectedBoxId] = useState<string>(initialBoxId);
  const [addToCollection, setAddToCollection] = useState(initialAddToCollection);
  const [addToDeck, setAddToDeck] = useState(initialAddToDeck);
  const [addToBox, setAddToBox] = useState(initialAddToBox);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [storageContainers, setStorageContainers] = useState<StorageContainer[]>([]);

  // Load decks from Supabase
  useEffect(() => {
    const loadDecks = async () => {
      try {
        setLoadingDecks(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase
          .from('user_decks')
          .select('id, name, format, colors')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        setDecks(data || []);
      } catch (error) {
        console.error('Failed to load decks:', error);
      } finally {
        setLoadingDecks(false);
      }
    };
    loadDecks();
  }, []);

  // Load storage containers
  useEffect(() => {
    const loadContainers = async () => {
      try {
        const overview = await StorageAPI.getOverview();
        setStorageContainers(overview.containers.map(c => ({
          id: c.id,
          user_id: c.user_id,
          name: c.name,
          type: c.type,
          color: c.color,
          icon: c.icon,
          is_default: c.is_default,
          deck_id: c.deck_id,
          created_at: c.created_at,
          updated_at: c.updated_at
        })));
      } catch (error) {
        console.error('Failed to load storage containers:', error);
      }
    };
    loadContainers();
  }, []);

  // Notify parent of changes
  const handleSelectionChange = (updates: Partial<{
    selectedDeckId: string;
    selectedBoxId: string;
    addToCollection: boolean;
    addToDeck: boolean;
    addToBox: boolean;
  }>) => {
    const newConfig = {
      selectedDeckId: updates.selectedDeckId ?? selectedDeckId,
      selectedBoxId: updates.selectedBoxId ?? selectedBoxId,
      addToCollection: updates.addToCollection ?? addToCollection,
      addToDeck: updates.addToDeck ?? addToDeck,
      addToBox: updates.addToBox ?? addToBox,
    };
    
    if (updates.selectedDeckId !== undefined) setSelectedDeckId(updates.selectedDeckId);
    if (updates.selectedBoxId !== undefined) setSelectedBoxId(updates.selectedBoxId);
    if (updates.addToCollection !== undefined) setAddToCollection(updates.addToCollection);
    if (updates.addToDeck !== undefined) setAddToDeck(updates.addToDeck);
    if (updates.addToBox !== undefined) setAddToBox(updates.addToBox);
    
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

  const getActiveSummary = () => {
    const targets = [
      addToCollection && 'Collection',
      addToDeck && selectedDeckId && decks.find(d => d.id === selectedDeckId)?.name,
      addToBox && selectedBoxId && storageContainers.find(c => c.id === selectedBoxId)?.name
    ].filter(Boolean);
    
    return targets.length > 0 ? targets.join(' + ') : 'Nothing selected';
  };

  return (
    <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
      <Card className="mb-6">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                <CardTitle>Add Cards To</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {isCollapsed && (
                  <Badge variant="secondary" className="text-xs">
                    {getActiveSummary()}
                  </Badge>
                )}
                <Button variant="ghost" size="sm">
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
        {/* Three columns for collection, deck, and box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Add to Box Section */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Box className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-medium">Add to Box</p>
                <p className="text-xs text-muted-foreground">Organize storage</p>
              </div>
            </div>
            <Button
              variant={addToBox ? "default" : "outline"}
              size="sm"
              onClick={() => handleSelectionChange({ addToBox: !addToBox })}
            >
              {addToBox && <Check className="h-4 w-4 mr-1" />}
              {addToBox ? 'Enabled' : 'Enable'}
            </Button>
          </div>
        </div>

        {/* Selection Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Deck Selection - Only show when deck adding is enabled */}
          {addToDeck && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Deck</Label>
              <Select value={selectedDeckId} onValueChange={(value) => handleSelectionChange({ selectedDeckId: value })}>
                <SelectTrigger className="bg-background border">
                  <SelectValue placeholder="Choose a deck..." />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  {decks.map(deck => (
                    <SelectItem key={deck.id} value={deck.id}>
                      <div className="flex items-center gap-2">
                        <span className="max-w-32 truncate">{deck.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {deck.format}
                        </Badge>
                        {deck.colors.length > 0 && getColorIndicator(deck.colors)}
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

          {/* Box Selection - Only show when box adding is enabled */}
          {addToBox && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Box</Label>
              <Select value={selectedBoxId} onValueChange={(value) => handleSelectionChange({ selectedBoxId: value })}>
                <SelectTrigger className="bg-background border">
                  <SelectValue placeholder="Choose a box..." />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  {storageContainers.map(container => (
                    <SelectItem key={container.id} value={container.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full border" 
                          style={{ backgroundColor: container.color || '#64748b' }}
                        />
                        <span className="max-w-32 truncate">{container.name}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {container.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedBoxId && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  {(() => {
                    const selectedBox = storageContainers.find(c => c.id === selectedBoxId);
                    return selectedBox ? (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4 text-orange-500" />
                          <span className="text-sm truncate">{selectedBox.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {selectedBox.type}
                        </Badge>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
          <p className="text-sm font-medium text-primary">
            Cards will be added to: {' '}
            {[
              addToCollection && 'Collection',
              addToDeck && selectedDeckId && decks.find(d => d.id === selectedDeckId)?.name,
              addToBox && selectedBoxId && storageContainers.find(c => c.id === selectedBoxId)?.name
            ].filter(Boolean).join(' + ') || 'Nothing selected'}
          </p>
        </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}