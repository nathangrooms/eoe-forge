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
import {
  generateCSV,
  generateJSON,
  generateMoxfield,
  type ExportRow,
} from '@/components/collection/exportFormats';

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

      const rows = collection as unknown as ExportRow[];

      let exportData: string;
      let filename: string;
      let mimeType: string;

      switch (format) {
        case 'csv':
          exportData = generateCSV(rows, includeFields);
          filename = 'mtg-collection.csv';
          mimeType = 'text/csv';
          break;
        case 'json':
          exportData = generateJSON(rows, includeFields);
          filename = 'mtg-collection.json';
          mimeType = 'application/json';
          break;
        case 'moxfield':
          exportData = generateMoxfield(rows);
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
