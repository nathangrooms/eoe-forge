import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { 
  Camera, 
  X, 
  Settings as SettingsIcon, 
  Plus, 
  Minus, 
  Search,
  Loader2,
  Check,
  Sparkles
} from 'lucide-react';
import { useScanStore, type ScannedCard } from './store';
import { smartCardSearch, scryfallFuzzySearch, type CardCandidate } from './cardRecognition';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { logActivity } from '@/features/dashboard/hooks';

interface SimpleScanDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCardAdded?: (card: any) => void;
}

export function SimpleScanDrawer({ isOpen, onClose, onCardAdded }: SimpleScanDrawerProps) {
  const { 
    settings, 
    updateSettings, 
    recentScans, 
    addRecentScan, 
    updateScanQuantity
  } = useScanStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState<CardCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CardCandidate | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search as user types
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.length < 2) {
      setCandidates([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await scryfallFuzzySearch(value);
        setCandidates(result.candidates);
        
        // Auto-select best match if high confidence
        if (result.best && result.best.score >= 0.95 && settings.autoAdd) {
          await addCardToCollection(result.best);
          setSearchQuery('');
          setCandidates([]);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [settings.autoAdd]);

  const addCardToCollection = async (candidate: CardCandidate, quantity = 1) => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        showError('Auth Error', 'Please log in to add cards');
        return;
      }

      // Check if card exists
      const { data: existingCard, error: checkError } = await supabase
        .from('user_collections')
        .select('id, quantity')
        .eq('card_id', candidate.cardId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (checkError) throw checkError;

      let result;
      if (existingCard) {
        result = await supabase
          .from('user_collections')
          .update({ 
            quantity: existingCard.quantity + quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCard.id);
      } else {
        result = await supabase
          .from('user_collections')
          .insert({
            card_id: candidate.cardId,
            card_name: candidate.name,
            set_code: candidate.setCode,
            quantity,
            user_id: session.user.id
          });
      }

      if (result.error) throw result.error;

      // Track scan
      const scannedCard: ScannedCard = {
        id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cardId: candidate.cardId,
        oracleId: candidate.oracleId,
        name: candidate.name,
        setCode: candidate.setCode,
        setName: candidate.setCode.toUpperCase(),
        imageUrl: candidate.imageUrl,
        priceUsd: candidate.priceUsd,
        quantity,
        scannedAt: new Date().toISOString(),
        confidence: candidate.score
      };

      addRecentScan(scannedCard);
      
      await logActivity('card_added', 'card', candidate.cardId, {
        name: candidate.name,
        source: 'scan',
        quantity
      });

      setSelectedCandidate(null);
      onCardAdded?.(candidate);

    } catch (error) {
      console.error('Add card error:', error);
      showError('Error', 'Failed to add card');
    }
  };

  const handleQuickAdd = async (candidate: CardCandidate) => {
    setSelectedCandidate(candidate);
    await addCardToCollection(candidate);
    setSearchQuery('');
    setCandidates([]);
    inputRef.current?.focus();
  };

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full max-h-full w-screen h-screen p-0 gap-0 overflow-hidden">
        <div className="flex flex-col h-full bg-background text-foreground"
             style={{ minHeight: '100svh' }}>
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold">Quick Add Cards</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Settings */}
          {showSettings && (
            <div className="p-4 border-b border-border bg-muted/50">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={settings.autoAdd}
                    onCheckedChange={(checked) => updateSettings({ autoAdd: checked })}
                  />
                  <Label className="text-sm">Auto-add exact matches</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Label className="text-sm">Prefer:</Label>
                  <select
                    value={settings.preferPrinting}
                    onChange={(e) => updateSettings({ preferPrinting: e.target.value as any })}
                    className="bg-background border border-border rounded px-2 py-1 text-sm"
                  >
                    <option value="newest">Newest printing</option>
                    <option value="cheapest">Cheapest</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Type card name (e.g., 'Sol Ring', 'Lightning Bolt')"
                className="pl-10 pr-10 text-base h-12"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Start typing to search - Scryfall's fuzzy matching handles typos automatically
            </p>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto p-4">
            {candidates.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {candidates.map((candidate) => (
                  <button
                    key={`${candidate.cardId}-${candidate.setCode}`}
                    onClick={() => handleQuickAdd(candidate)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left"
                  >
                    {candidate.imageUrl && (
                      <img 
                        src={candidate.imageUrl} 
                        alt={candidate.name}
                        className="w-12 h-16 object-cover rounded"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{candidate.name}</p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {candidate.setCode}
                        {candidate.priceUsd && ` • $${candidate.priceUsd.toFixed(2)}`}
                      </p>
                    </div>
                    <Plus className="h-5 w-5 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            ) : searchQuery.length >= 2 && !isSearching ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No cards found for "{searchQuery}"</p>
                <p className="text-sm mt-1">Try a different spelling or partial name</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start typing a card name above</p>
                <p className="text-sm mt-1">Works great with partial names!</p>
              </div>
            )}
          </div>

          {/* Recent Scans */}
          {recentScans.length > 0 && (
            <div className="border-t border-border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-3">Recently Added ({recentScans.length})</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {recentScans.slice(0, 10).map((scan) => (
                  <div 
                    key={scan.id}
                    className="shrink-0 relative group"
                  >
                    {scan.imageUrl ? (
                      <img 
                        src={scan.imageUrl} 
                        alt={scan.name}
                        className="w-14 h-20 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="w-14 h-20 bg-muted rounded border border-border flex items-center justify-center">
                        <span className="text-xs text-center p-1">{scan.name.substring(0, 10)}</span>
                      </div>
                    )}
                    <Badge 
                      variant="secondary" 
                      className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs"
                    >
                      {scan.quantity}
                    </Badge>
                    
                    {/* Quantity controls on hover/focus */}
                    <div className="absolute inset-0 bg-black/70 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (scan.quantity > 1) {
                            updateScanQuantity(scan.id, scan.quantity - 1);
                          }
                        }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateScanQuantity(scan.id, scan.quantity + 1);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
