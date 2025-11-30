import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileJson, FileText, Table } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';

interface CollectionExportProps {
  userId: string;
}

export function CollectionExport({ userId }: CollectionExportProps) {
  const [format, setFormat] = useState<'csv' | 'json' | 'moxfield'>('csv');
  const [includeFields, setIncludeFields] = useState({
    quantity: true,
    foil: true,
    condition: true,
    price: true,
    setCode: true,
  });
  const [exporting, setExporting] = useState(false);

  const exportCollection = async () => {
    try {
      setExporting(true);

      // Fetch collection data with card details
      const { data: collection, error } = await supabase
        .from('user_collections')
        .select(`
          *,
          cards (
            name,
            set_code,
            collector_number,
            type_line,
            mana_cost,
            rarity,
            prices
          )
        `)
        .eq('user_id', userId)
        .order('card_name');

      if (error) throw error;
      if (!collection || collection.length === 0) {
        showError('No Cards', 'Your collection is empty');
        return;
      }

      let exportData: string;
      let filename: string;
      let mimeType: string;

      switch (format) {
        case 'csv':
          exportData = generateCSV(collection);
          filename = 'mtg-collection.csv';
          mimeType = 'text/csv';
          break;
        case 'json':
          exportData = generateJSON(collection);
          filename = 'mtg-collection.json';
          mimeType = 'application/json';
          break;
        case 'moxfield':
          exportData = generateMoxfield(collection);
          filename = 'mtg-collection-moxfield.csv';
          mimeType = 'text/csv';
          break;
        default:
          throw new Error('Invalid format');
      }

      // Create and download file
      const blob = new Blob([exportData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess('Export Complete', `Downloaded ${collection.length} cards as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Error exporting collection:', error);
      showError('Export Failed', 'Failed to export collection');
    } finally {
      setExporting(false);
    }
  };

  const generateCSV = (collection: any[]) => {
    const headers = ['Card Name'];
    if (includeFields.quantity) headers.push('Quantity');
    if (includeFields.foil) headers.push('Foil');
    if (includeFields.condition) headers.push('Condition');
    if (includeFields.setCode) headers.push('Set Code');
    if (includeFields.price) headers.push('Price (USD)');

    const rows = collection.map((item) => {
      const row = [item.card_name];
      if (includeFields.quantity) row.push(item.quantity.toString());
      if (includeFields.foil) row.push(item.foil > 0 ? 'Yes' : 'No');
      if (includeFields.condition) row.push(item.condition);
      if (includeFields.setCode) row.push(item.set_code);
      if (includeFields.price) row.push(item.price_usd?.toString() || '0');
      return row.map(field => `"${field}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  };

  const generateJSON = (collection: any[]) => {
    const exportData = collection.map((item) => {
      const obj: any = { name: item.card_name };
      if (includeFields.quantity) obj.quantity = item.quantity;
      if (includeFields.foil) obj.foil = item.foil;
      if (includeFields.condition) obj.condition = item.condition;
      if (includeFields.setCode) obj.set_code = item.set_code;
      if (includeFields.price) obj.price_usd = item.price_usd;
      if (item.cards) {
        obj.card_details = {
          type_line: item.cards.type_line,
          mana_cost: item.cards.mana_cost,
          rarity: item.cards.rarity,
        };
      }
      return obj;
    });

    return JSON.stringify(exportData, null, 2);
  };

  const generateMoxfield = (collection: any[]) => {
    // Moxfield format: Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price
    const headers = 'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price';
    
    const rows = collection.map((item) => {
      const count = item.quantity;
      const tradelistCount = 0;
      const name = item.card_name;
      const edition = item.set_code?.toUpperCase() || '';
      const condition = item.condition === 'near_mint' ? 'Near Mint' :
                       item.condition === 'lightly_played' ? 'Lightly Played' :
                       item.condition === 'moderately_played' ? 'Moderately Played' :
                       item.condition === 'heavily_played' ? 'Heavily Played' : 'Near Mint';
      const language = 'English';
      const foil = item.foil > 0 ? 'foil' : '';
      const tags = '';
      const lastModified = new Date(item.updated_at).toISOString();
      const collectorNumber = item.cards?.collector_number || '';
      const alter = '';
      const proxy = '';
      const purchasePrice = item.price_usd || '';

      return [
        count,
        tradelistCount,
        `"${name}"`,
        edition,
        condition,
        language,
        foil,
        tags,
        lastModified,
        collectorNumber,
        alter,
        proxy,
        purchasePrice
      ].join(',');
    });

    return [headers, ...rows].join('\n');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Collection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="export-format">Export Format</Label>
          <Select value={format} onValueChange={(value: any) => setFormat(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">
                <div className="flex items-center gap-2">
                  <Table className="h-4 w-4" />
                  CSV (Excel)
                </div>
              </SelectItem>
              <SelectItem value="json">
                <div className="flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  JSON
                </div>
              </SelectItem>
              <SelectItem value="moxfield">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Moxfield Format
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-3 block">Include Fields</Label>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="quantity"
                checked={includeFields.quantity}
                onCheckedChange={(checked) =>
                  setIncludeFields({ ...includeFields, quantity: checked as boolean })
                }
              />
              <Label htmlFor="quantity" className="font-normal cursor-pointer">
                Quantity
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="foil"
                checked={includeFields.foil}
                onCheckedChange={(checked) =>
                  setIncludeFields({ ...includeFields, foil: checked as boolean })
                }
              />
              <Label htmlFor="foil" className="font-normal cursor-pointer">
                Foil Status
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="condition"
                checked={includeFields.condition}
                onCheckedChange={(checked) =>
                  setIncludeFields({ ...includeFields, condition: checked as boolean })
                }
              />
              <Label htmlFor="condition" className="font-normal cursor-pointer">
                Condition
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="setCode"
                checked={includeFields.setCode}
                onCheckedChange={(checked) =>
                  setIncludeFields({ ...includeFields, setCode: checked as boolean })
                }
              />
              <Label htmlFor="setCode" className="font-normal cursor-pointer">
                Set Code
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="price"
                checked={includeFields.price}
                onCheckedChange={(checked) =>
                  setIncludeFields({ ...includeFields, price: checked as boolean })
                }
              />
              <Label htmlFor="price" className="font-normal cursor-pointer">
                Price (USD)
              </Label>
            </div>
          </div>
        </div>

        <Button
          onClick={exportCollection}
          disabled={exporting}
          className="w-full"
        >
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export Collection'}
        </Button>
      </CardContent>
    </Card>
  );
}
