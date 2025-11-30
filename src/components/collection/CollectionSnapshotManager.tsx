import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Camera, History, Download, Trash2, Calendar } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface CollectionSnapshot {
  id: string;
  name: string;
  description?: string;
  total_cards: number;
  total_value: number;
  created_at: string;
  snapshot_data: any;
}

interface CollectionSnapshotManagerProps {
  currentCollection: any[];
}

export function CollectionSnapshotManager({ currentCollection }: CollectionSnapshotManagerProps) {
  const [snapshots, setSnapshots] = useState<CollectionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');

  useEffect(() => {
    // Note: We'd need to create a snapshots table in the database
    // For now, this is a UI component showing how it would work
    loadSnapshots();
  }, []);

  const loadSnapshots = async () => {
    try {
      setLoading(true);
      // This would load from a collection_snapshots table
      // For demo purposes, using localStorage
      const stored = localStorage.getItem('collection_snapshots');
      if (stored) {
        setSnapshots(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading snapshots:', error);
    } finally {
      setLoading(false);
    }
  };

  const createSnapshot = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const totalValue = currentCollection.reduce((sum, card) => {
        const price = card.card?.prices?.usd ? parseFloat(card.card.prices.usd) : 0;
        return sum + (price * card.quantity);
      }, 0);

      const snapshot: CollectionSnapshot = {
        id: `snap_${Date.now()}`,
        name: snapshotName || `Snapshot ${new Date().toLocaleDateString()}`,
        description: snapshotDescription,
        total_cards: currentCollection.reduce((sum, card) => sum + card.quantity, 0),
        total_value: totalValue,
        created_at: new Date().toISOString(),
        snapshot_data: currentCollection
      };

      const existing = snapshots;
      existing.unshift(snapshot);
      localStorage.setItem('collection_snapshots', JSON.stringify(existing));
      
      setSnapshots(existing);
      showSuccess('Snapshot Created', `"${snapshot.name}" saved successfully`);
      setShowCreateDialog(false);
      setSnapshotName('');
      setSnapshotDescription('');
    } catch (error) {
      console.error('Error creating snapshot:', error);
      showError('Error', 'Failed to create snapshot');
    }
  };

  const deleteSnapshot = (snapshotId: string) => {
    const updated = snapshots.filter(s => s.id !== snapshotId);
    localStorage.setItem('collection_snapshots', JSON.stringify(updated));
    setSnapshots(updated);
    showSuccess('Snapshot Deleted', 'Snapshot removed');
  };

  const exportSnapshot = (snapshot: CollectionSnapshot) => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.name.replace(/\s+/g, '-')}-${snapshot.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('Snapshot Exported', 'Snapshot downloaded');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Collection Snapshots
            <Badge variant="secondary">{snapshots.length}</Badge>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Camera className="h-4 w-4 mr-2" />
                Take Snapshot
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Collection Snapshot</DialogTitle>
                <DialogDescription>
                  Save the current state of your collection ({currentCollection.length} unique cards)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Snapshot Name</Label>
                  <Input
                    id="name"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    placeholder={`Snapshot ${new Date().toLocaleDateString()}`}
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    value={snapshotDescription}
                    onChange={(e) => setSnapshotDescription(e.target.value)}
                    placeholder="e.g., Before trading away Reserved List cards"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createSnapshot} className="flex-1">
                    Create Snapshot
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No snapshots yet</p>
            <p className="text-xs">Create snapshots to track your collection over time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{snapshot.name}</p>
                    {snapshot.description && (
                      <p className="text-sm text-muted-foreground">{snapshot.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(snapshot.created_at).toLocaleDateString()}
                      </div>
                      <span>{snapshot.total_cards} cards</span>
                      <span>${snapshot.total_value.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => exportSnapshot(snapshot)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteSnapshot(snapshot.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
