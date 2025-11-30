import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { scryfallAPI } from '@/lib/api/scryfall';

interface CollectionBulkImportProps {
  onImportComplete?: () => void;
}

export function CollectionBulkImport({ onImportComplete }: CollectionBulkImportProps) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'arena' | 'csv' | 'txt'>('arena');

  const parseImportText = (text: string, format: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const cards: Array<{ quantity: number; name: string; set?: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toLowerCase().startsWith('deck') || trimmed.toLowerCase().startsWith('sideboard')) {
        continue;
      }

      let quantity = 1;
      let cardName = trimmed;
      let setCode = undefined;

      if (format === 'arena' || format === 'txt') {
        // Format: "4 Lightning Bolt" or "1x Lightning Bolt"
        const match = trimmed.match(/^(\d+)x?\s+(.+?)(\s+\(([A-Z0-9]+)\))?$/i);
        if (match) {
          quantity = parseInt(match[1]);
          cardName = match[2].trim();
          setCode = match[4];
        }
      } else if (format === 'csv') {
        // Format: "Card Name,Quantity,Set"
        const parts = trimmed.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          cardName = parts[0];
          quantity = parseInt(parts[1]) || 1;
          setCode = parts[2];
        }
      }

      if (cardName) {
        cards.push({ quantity, name: cardName, set: setCode });
      }
    }

    return cards;
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      showError('Empty Import', 'Please paste some cards to import');
      return;
    }

    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError('Authentication Required', 'Please log in to import cards');
        return;
      }

      const parsedCards = parseImportText(importText, importFormat);
      if (parsedCards.length === 0) {
        showError('No Cards Found', 'Could not parse any cards from the input');
        return;
      }

      let addedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const { quantity, name, set } of parsedCards) {
        try {
          // Search for card on Scryfall
          const searchQuery = set ? `!"${name}" set:${set}` : `!"${name}"`;
          const results = await scryfallAPI.searchCards(searchQuery, 1);
          
          if (!results.cards || results.cards.length === 0) {
            failedCount++;
            errors.push(`Card not found: ${name}`);
            continue;
          }

          const card = results.cards[0];

          // Check if card already exists in collection
          const { data: existing } = await supabase
            .from('user_collections')
            .select('id, quantity')
            .eq('user_id', user.id)
            .eq('card_id', card.id)
            .maybeSingle();

          if (existing) {
            // Update quantity
            await supabase
              .from('user_collections')
              .update({ 
                quantity: existing.quantity + quantity,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);
          } else {
            // Insert new card
            await supabase
              .from('user_collections')
              .insert({
                user_id: user.id,
                card_id: card.id,
                card_name: card.name,
                set_code: card.set,
                quantity: quantity,
                foil: 0,
                condition: 'near_mint',
                price_usd: parseFloat(card.prices?.usd || '0')
              });
          }

          addedCount++;
        } catch (error) {
          console.error(`Error importing card ${name}:`, error);
          failedCount++;
          errors.push(`Failed to import: ${name}`);
        }
      }

      // Show results
      if (addedCount > 0) {
        showSuccess(
          'Import Complete',
          `Added ${addedCount} card${addedCount !== 1 ? 's' : ''} to your collection` +
          (failedCount > 0 ? `. ${failedCount} failed.` : '')
        );
      }

      if (errors.length > 0 && errors.length <= 5) {
        console.error('Import errors:', errors);
      }

      setImportText('');
      setOpen(false);
      onImportComplete?.();

    } catch (error) {
      console.error('Import error:', error);
      showError('Import Failed', 'An error occurred while importing cards');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Cards</DialogTitle>
          <DialogDescription>
            Paste your card list below. Supports Arena, CSV, and plain text formats.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Format</Label>
            <Select value={importFormat} onValueChange={(value: any) => setImportFormat(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="arena">Arena/MTGO (4 Lightning Bolt)</SelectItem>
                <SelectItem value="txt">Plain Text (4x Lightning Bolt)</SelectItem>
                <SelectItem value="csv">CSV (Card Name, Quantity, Set)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Card List</Label>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                importFormat === 'arena' ? '4 Lightning Bolt\n1 Black Lotus\n2 Counterspell (MH2)' :
                importFormat === 'csv' ? 'Lightning Bolt, 4, M11\nBlack Lotus, 1\nCounterspell, 2, MH2' :
                '4x Lightning Bolt\n1x Black Lotus\n2x Counterspell (MH2)'
              }
              className="min-h-[300px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {importFormat === 'arena' && 'Format: Quantity CardName or Quantity CardName (SET)'}
              {importFormat === 'csv' && 'Format: CardName, Quantity, Set (optional)'}
              {importFormat === 'txt' && 'Format: QuantityX CardName or Quantity CardName (SET)'}
            </p>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              <FileText className="h-4 w-4 inline mr-2" />
              {importText.split('\n').filter(l => l.trim()).length} lines
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importing || !importText.trim()}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Cards
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
