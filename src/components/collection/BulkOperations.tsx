import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Upload, 
  Download, 
  FileText, 
  Camera, 
  Plus, 
  Trash2, 
  Edit,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BulkOperationsProps {
  onCollectionUpdate?: () => void;
}

export const BulkOperations = ({ onCollectionUpdate }: BulkOperationsProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<any>(null);
  const [decklistText, setDecklistText] = useState('');
  const [importFormat, setImportFormat] = useState('decklist');
  const [showResults, setShowResults] = useState(false);
  
  const { toast } = useToast();

  const handleBulkImport = async () => {
    if (!decklistText.trim()) {
      toast({
        title: "No Input",
        description: "Please enter a decklist or CSV data to import",
        variant: "destructive"
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(10);

    try {
      const lines = decklistText.trim().split('\n').filter(line => line.trim());
      const results = {
        total: lines.length,
        added: 0,
        updated: 0,
        errors: [] as string[]
      };

      setImportProgress(25);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('//') || line.startsWith('#')) continue;

        try {
          await processImportLine(line, importFormat, results);
        } catch (error) {
          results.errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        setImportProgress(25 + (i / lines.length) * 65);
      }

      setImportProgress(100);
      setImportResults(results);
      setShowResults(true);

      if (onCollectionUpdate) {
        onCollectionUpdate();
      }

      toast({
        title: "Import Complete",
        description: `Added ${results.added} cards, updated ${results.updated} cards. ${results.errors.length} errors.`,
      });

    } catch (error) {
      console.error('Bulk import error:', error);
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const processImportLine = async (line: string, format: string, results: any) => {
    let quantity = 1;
    let cardName = line;
    let setCode = '';
    let foil = 0;
    let condition = 'near_mint';

    if (format === 'decklist') {
      // Parse format like "4x Lightning Bolt" or "4 Lightning Bolt"
      const decklistMatch = line.match(/^(\d+)x?\s+(.+)$/);
      if (decklistMatch) {
        quantity = parseInt(decklistMatch[1]);
        cardName = decklistMatch[2].trim();
      }
    } else if (format === 'csv') {
      // Parse CSV format: "Card Name,Quantity,Set,Foil,Condition"
      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      if (parts.length >= 2) {
        cardName = parts[0];
        quantity = parseInt(parts[1]) || 1;
        setCode = parts[2] || '';
        foil = parts[3]?.toLowerCase() === 'foil' ? 1 : 0;
        condition = parts[4] || 'near_mint';
      }
    }

    // Search for the card using Scryfall API
    const searchQuery = encodeURIComponent(cardName + (setCode ? ` set:${setCode}` : ''));
    const response = await fetch(`https://api.scryfall.com/cards/named?exact=${searchQuery}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Card not found: ${cardName}`);
      }
      throw new Error(`API error: ${response.statusText}`);
    }

    const cardData = await response.json();

    // Check if card already exists in collection
    const { data: existingCard } = await supabase
      .from('user_collections')
      .select('*')
      .eq('card_id', cardData.id)
      .single();

    if (existingCard) {
      // Update existing card quantity
      const { error } = await supabase
        .from('user_collections')
        .update({ 
          quantity: existingCard.quantity + quantity,
          foil: Math.max(existingCard.foil, foil)
        })
        .eq('id', existingCard.id);

      if (error) throw error;
      results.updated++;
    } else {
      // Add new card to collection
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('user_collections')
        .insert({
          user_id: user.id,
          card_id: cardData.id,
          card_name: cardData.name,
          set_code: cardData.set,
          quantity,
          foil,
          condition,
          price_usd: parseFloat(cardData.prices?.usd || '0')
        });

      if (error) throw error;
      results.added++;
    }
  };

  const exportCollection = async (format: 'decklist' | 'csv') => {
    try {
      const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*')
        .order('card_name');

      if (error) throw error;

      let exportText = '';

      if (format === 'decklist') {
        exportText = collection
          ?.map(card => `${card.quantity}x ${card.card_name}`)
          .join('\n') || '';
      } else if (format === 'csv') {
        exportText = 'Card Name,Quantity,Set,Foil,Condition,Price\n' +
          (collection
            ?.map(card => 
              `"${card.card_name}",${card.quantity},"${card.set_code}","${card.foil ? 'Foil' : 'Normal'}","${card.condition}","${card.price_usd || '0'}"`
            )
            .join('\n') || '');
      }

      // Download the file
      const blob = new Blob([exportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `collection.${format === 'csv' ? 'csv' : 'txt'}`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Collection exported as ${format.toUpperCase()}`,
      });

    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Upload className="h-5 w-5 mr-2" />
          Bulk Operations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Import Format</label>
                <Select value={importFormat} onValueChange={setImportFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decklist">Decklist (4x Card Name)</SelectItem>
                    <SelectItem value="csv">CSV (Name,Qty,Set,Foil,Condition)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Paste Your Data</label>
                <Textarea
                  placeholder={
                    importFormat === 'decklist' 
                      ? "4x Lightning Bolt\n1x Black Lotus\n2x Counterspell"
                      : "Lightning Bolt,4,LEA,Normal,near_mint\nBlack Lotus,1,LEA,Foil,lightly_played"
                  }
                  value={decklistText}
                  onChange={(e) => setDecklistText(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              <Button 
                onClick={handleBulkImport} 
                disabled={isImporting || !decklistText.trim()}
                className="w-full"
              >
                {isImporting ? (
                  <>
                    <Upload className="h-4 w-4 mr-2 animate-pulse" />
                    Importing... {Math.round(importProgress)}%
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Import to Collection
                  </>
                )}
              </Button>

              {isImporting && (
                <Progress value={importProgress} className="w-full" />
              )}
            </div>

            {/* Import Results Dialog */}
            <Dialog open={showResults} onOpenChange={setShowResults}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Results</DialogTitle>
                </DialogHeader>
                {importResults && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-sm">Added: {importResults.added}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Edit className="h-5 w-5 text-blue-500" />
                        <span className="text-sm">Updated: {importResults.updated}</span>
                      </div>
                    </div>

                    {importResults.errors.length > 0 && (
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <AlertCircle className="h-5 w-5 text-red-500" />
                          <span className="text-sm font-medium">Errors ({importResults.errors.length}):</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                          {importResults.errors.map((error, index) => (
                            <p key={index} className="text-red-600">{error}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="export" className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                onClick={() => exportCollection('decklist')}
                className="h-12"
              >
                <FileText className="h-4 w-4 mr-2" />
                Export as Decklist
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => exportCollection('csv')}
                className="h-12"
              >
                <Download className="h-4 w-4 mr-2" />
                Export as CSV
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              <p><strong>Decklist:</strong> Simple format with quantities (4x Card Name)</p>
              <p><strong>CSV:</strong> Spreadsheet format with all collection data</p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};