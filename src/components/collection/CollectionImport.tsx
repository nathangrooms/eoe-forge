import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { scryfallAPI, ScryfallAPI } from '@/lib/api/scryfall';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Download,
  Plus
} from 'lucide-react';

interface ImportResult {
  successful: Array<{ name: string; quantity: number; card?: any }>;
  failed: Array<{ name: string; quantity: number; error: string }>;
  duplicates: Array<{ name: string; quantity: number; existing: number }>;
}

interface CollectionImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function CollectionImport({ isOpen, onClose, onImportComplete }: CollectionImportProps) {
  const { user } = useAuth();
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewCards, setPreviewCards] = useState<Array<{ name: string; quantity: number }>>([]);

  const parseImportText = () => {
    if (!importText.trim()) return;
    
    const parsed = ScryfallAPI.parseDeckList(importText);
    setPreviewCards(parsed);
  };

  const handleImport = async () => {
    if (!user || previewCards.length === 0) return;

    setImporting(true);
    setProgress(0);
    
    const result: ImportResult = {
      successful: [],
      failed: [],
      duplicates: []
    };

    try {
      for (let i = 0; i < previewCards.length; i++) {
        const cardEntry = previewCards[i];
        setProgress(((i + 1) / previewCards.length) * 100);

        try {
          // Try to find the card
          const cardData = await scryfallAPI.getCardByName(cardEntry.name);
          
          if (cardData) {
            // Check if card already exists in collection
            const { data: existingCard } = await supabase
              .from('user_collections')
              .select('quantity')
              .eq('user_id', user.id)
              .eq('card_id', cardData.id)
              .maybeSingle();

            if (existingCard) {
              // Update existing quantity
              const newQuantity = existingCard.quantity + cardEntry.quantity;
              await supabase
                .from('user_collections')
                .update({ 
                  quantity: newQuantity,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .eq('card_id', cardData.id);

              result.duplicates.push({
                ...cardEntry,
                existing: existingCard.quantity
              });
            } else {
              // Add new card to collection
              await supabase
                .from('user_collections')
                .insert({
                  user_id: user.id,
                  card_id: cardData.id,
                  card_name: cardData.name,
                  set_code: cardData.set,
                  quantity: cardEntry.quantity,
                  condition: 'near_mint',
                  foil: 0,
                  price_usd: parseFloat(cardData.prices?.usd || '0')
                });

              result.successful.push({
                ...cardEntry,
                card: cardData
              });
            }
          } else {
            result.failed.push({
              ...cardEntry,
              error: 'Card not found'
            });
          }
        } catch (error) {
          result.failed.push({
            ...cardEntry,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      setResult(result);
      
      if (result.successful.length > 0 || result.duplicates.length > 0) {
        showSuccess(
          'Import Complete', 
          `Successfully imported ${result.successful.length + result.duplicates.length} cards`
        );
        onImportComplete();
      }

    } catch (error) {
      showError('Import failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setImporting(false);
      setProgress(0);
    }
  };

  const handleExampleLoad = (example: string) => {
    const examples = {
      arena: `Deck
4 Lightning Bolt
4 Monastery Swiftspear
4 Lava Spike
4 Rift Bolt
20 Mountain

Sideboard
2 Destructive Revelry
2 Searing Blaze`,
      
      modo: `4x Lightning Bolt
4x Monastery Swiftspear  
4x Lava Spike
4x Rift Bolt
20x Mountain`,
      
      csv: `Card Name,Quantity,Set,Condition
Lightning Bolt,4,M11,Near Mint
Monastery Swiftspear,4,KTK,Near Mint
Lava Spike,4,CHK,Light Play`,
      
      simple: `4 Lightning Bolt
4 Monastery Swiftspear
4 Lava Spike
4 Rift Bolt
20 Mountain`
    };

    setImportText(examples[example as keyof typeof examples] || '');
  };

  const resetImport = () => {
    setImportText('');
    setPreviewCards([]);
    setResult(null);
    setProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Import Collection
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="text" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="text">Text Import</TabsTrigger>
            <TabsTrigger value="csv">CSV Import</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Data</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Paste your deck list or collection:</label>
                <Textarea
                  placeholder="4 Lightning Bolt&#10;3 Counterspell&#10;2 Force of Will&#10;..."
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={10}
                  className="mt-2"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">Examples:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExampleLoad('arena')}
                >
                  Arena Format
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExampleLoad('modo')}
                >
                  MODO Format
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExampleLoad('simple')}
                >
                  Simple List
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={parseImportText}
                  disabled={!importText.trim()}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Preview Import
                </Button>
                <Button
                  variant="outline"
                  onClick={resetImport}
                >
                  Clear
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">CSV Format</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Upload a CSV file with the following columns:
              </p>
              <code className="text-xs bg-background p-2 rounded block">
                Card Name,Quantity,Set,Condition,Foil
              </code>
            </div>
            
            <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">CSV import coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Bulk Data Import</h4>
              <p className="text-sm text-muted-foreground">
                Import large collections from popular collection management tools.
              </p>
            </div>
            
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <Download className="h-4 w-4 mr-2" />
                Import from Deckbox
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Download className="h-4 w-4 mr-2" />
                Import from MTG Collection Tracker
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Download className="h-4 w-4 mr-2" />
                Import from Delver Lens
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Preview */}
        {previewCards.length > 0 && !result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Preview ({previewCards.length} unique cards)</span>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? 'Importing...' : 'Import to Collection'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {previewCards.map((card, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <span>{card.name}</span>
                    <Badge variant="outline">{card.quantity}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {importing && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importing cards...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <div className="font-medium">{result.successful.length}</div>
                  <div className="text-sm text-muted-foreground">Added</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <Plus className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <div className="font-medium">{result.duplicates.length}</div>
                  <div className="text-sm text-muted-foreground">Updated</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <XCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                  <div className="font-medium">{result.failed.length}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </CardContent>
              </Card>
            </div>

            {result.failed.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-red-600">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Failed Imports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    {result.failed.map((card, index) => (
                      <div key={index} className="flex justify-between">
                        <span>{card.name} (x{card.quantity})</span>
                        <span className="text-red-600">{card.error}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              <Button onClick={onClose}>
                Close
              </Button>
              <Button variant="outline" onClick={resetImport}>
                Import More
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}