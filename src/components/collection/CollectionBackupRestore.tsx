import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Database, 
  Download, 
  Upload, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  HardDrive
} from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface CollectionBackup {
  id: string;
  timestamp: Date;
  cardCount: number;
  totalValue: number;
  fileSize: string;
}

interface CollectionBackupRestoreProps {
  userId: string;
}

export function CollectionBackupRestore({ userId }: CollectionBackupRestoreProps) {
  const [backups, setBackups] = useState<CollectionBackup[]>([
    {
      id: '1',
      timestamp: new Date(Date.now() - 86400000 * 7),
      cardCount: 1234,
      totalValue: 45678.90,
      fileSize: '2.3 MB'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 86400000 * 14),
      cardCount: 1180,
      totalValue: 42300.50,
      fileSize: '2.1 MB'
    }
  ]);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);

  const createBackup = async () => {
    try {
      setCreating(true);
      setProgress(0);

      // Fetch full collection
      const { data: collection, error } = await supabase
        .from('user_collections')
        .select(`
          *,
          cards (*)
        `)
        .eq('user_id', userId);

      if (error) throw error;

      setProgress(30);

      // Create backup data structure
      const backupData = {
        version: '1.0',
        created_at: new Date().toISOString(),
        collection,
        metadata: {
          cardCount: collection?.length || 0,
          totalValue: collection?.reduce((sum, item) => sum + (item.price_usd || 0), 0) || 0
        }
      };

      setProgress(60);

      // Create downloadable file
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mtg-collection-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);

      // Add to local backup list
      const newBackup: CollectionBackup = {
        id: Date.now().toString(),
        timestamp: new Date(),
        cardCount: backupData.metadata.cardCount,
        totalValue: backupData.metadata.totalValue,
        fileSize: `${(blob.size / 1024 / 1024).toFixed(1)} MB`
      };
      setBackups(prev => [newBackup, ...prev]);

      showSuccess('Backup Created', 'Collection backup downloaded successfully');
    } catch (error) {
      console.error('Error creating backup:', error);
      showError('Backup Failed', 'Failed to create collection backup');
    } finally {
      setCreating(false);
      setProgress(0);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setRestoring(true);
      setProgress(0);

      // Read file
      const text = await file.text();
      const backupData = JSON.parse(text);

      setProgress(20);

      // Validate backup
      if (!backupData.version || !backupData.collection) {
        throw new Error('Invalid backup file format');
      }

      setProgress(40);

      // Confirm with user
      if (!confirm(`This will restore ${backupData.metadata.cardCount} cards. Continue?`)) {
        setRestoring(false);
        return;
      }

      setProgress(60);

      // Clear current collection
      await supabase
        .from('user_collections')
        .delete()
        .eq('user_id', userId);

      setProgress(70);

      // Restore collection in batches
      const batchSize = 100;
      for (let i = 0; i < backupData.collection.length; i += batchSize) {
        const batch = backupData.collection.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('user_collections')
          .insert(
            batch.map((item: any) => ({
              user_id: userId,
              card_id: item.card_id,
              card_name: item.card_name,
              set_code: item.set_code,
              quantity: item.quantity,
              foil: item.foil,
              condition: item.condition,
              price_usd: item.price_usd
            }))
          );

        if (error) throw error;
        
        setProgress(70 + ((i / backupData.collection.length) * 30));
      }

      setProgress(100);
      showSuccess('Restore Complete', `Restored ${backupData.metadata.cardCount} cards`);
      
      // Refresh page
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Error restoring backup:', error);
      showError('Restore Failed', 'Failed to restore collection backup');
    } finally {
      setRestoring(false);
      setProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Backup & Restore
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {(creating || restoring) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {creating ? 'Creating backup...' : 'Restoring collection...'}
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={createBackup}
            disabled={creating || restoring}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            {creating ? 'Creating...' : 'Create Backup'}
          </Button>
          
          <Button
            variant="outline"
            disabled={creating || restoring}
            asChild
          >
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              {restoring ? 'Restoring...' : 'Restore Backup'}
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleRestore}
                disabled={creating || restoring}
              />
            </label>
          </Button>
        </div>

        {/* Info */}
        <div className="p-3 rounded-lg border bg-muted/50 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div>
              <p className="font-medium">What's included:</p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                <li>• All cards with quantities and conditions</li>
                <li>• Pricing data and set information</li>
                <li>• Foil status and custom notes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-medium text-yellow-600 dark:text-yellow-400">
                Important Notes
              </p>
              <ul className="text-muted-foreground space-y-1">
                <li>• Restoring a backup will replace your current collection</li>
                <li>• Keep backup files in a safe location</li>
                <li>• Regular backups recommended before major changes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recent Backups */}
        {backups.length > 0 && (
          <div>
            <Label className="mb-3 block">Recent Backups</Label>
            <ScrollArea className="h-[150px]">
              <div className="space-y-2">
                {backups.map((backup) => (
                  <div
                    key={backup.id}
                    className="p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">
                            {backup.cardCount} cards
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {backup.fileSize}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(backup.timestamp, { addSuffix: true })}
                          </span>
                          <span>${backup.totalValue.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
