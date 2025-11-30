import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Download, Database, Calendar, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function DatabaseBackupManager() {
  const [exporting, setExporting] = useState(false);

  const exportTable = async (tableName: string) => {
    setExporting(true);
    
    try {
      // Query the table based on name
      let query;
      switch (tableName) {
        case 'user_collections':
          query = supabase.from('user_collections').select('*');
          break;
        case 'user_decks':
          query = supabase.from('user_decks').select('*');
          break;
        case 'deck_cards':
          query = supabase.from('deck_cards').select('*');
          break;
        case 'wishlist':
          query = supabase.from('wishlist').select('*');
          break;
        case 'storage_containers':
          query = supabase.from('storage_containers').select('*');
          break;
        case 'listings':
          query = supabase.from('listings').select('*');
          break;
        default:
          throw new Error('Invalid table name');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Convert to JSON and download
      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${tableName} data exported successfully`);
    } catch (error: any) {
      toast.error(`Failed to export ${tableName}: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const tables = [
    { name: 'user_collections', label: 'Collection Data', description: 'Your card collection' },
    { name: 'user_decks', label: 'Deck Data', description: 'Your deck lists' },
    { name: 'deck_cards', label: 'Deck Cards', description: 'Individual deck card entries' },
    { name: 'wishlist', label: 'Wishlist', description: 'Your wishlist items' },
    { name: 'storage_containers', label: 'Storage', description: 'Storage containers and items' },
    { name: 'listings', label: 'Marketplace', description: 'Your marketplace listings' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Backup & Export
        </CardTitle>
        <CardDescription>
          Export your data tables as JSON backups
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-sm">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            Regular backups are recommended. Exported data can be re-imported or archived for safekeeping.
          </p>
        </div>

        <div className="space-y-2">
          {tables.map((table) => (
            <div
              key={table.name}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{table.label}</h4>
                  <Badge variant="outline" className="text-xs">
                    {table.name}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {table.description}
                </p>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportTable(table.name)}
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 border-t">
          <Calendar className="h-3 w-3" />
          <span>Last backup: Never (manual only)</span>
        </div>
      </CardContent>
    </Card>
  );
}
