import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Save, RotateCcw, Clock, Plus } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { formatDistanceToNow } from 'date-fns';

interface DeckVersion {
  id: string;
  deck_id: string;
  version_number: number;
  name: string;
  description: string | null;
  cards: any;
  metadata: any;
  created_at: string;
  created_by: string;
}

interface DeckVersionHistoryProps {
  deckId: string;
  currentCards: any[];
  onRestoreVersion: (cards: any[]) => void;
}

export function DeckVersionHistory({ deckId, currentCards, onRestoreVersion }: DeckVersionHistoryProps) {
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [versionDescription, setVersionDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVersions();
  }, [deckId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deck_versions')
        .select('*')
        .eq('deck_id', deckId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      console.error('Error loading versions:', error);
      showError('Error', 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const saveVersion = async () => {
    if (!versionName.trim()) {
      showError('Name Required', 'Please provide a name for this version');
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get next version number
      const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version_number)) + 1 : 1;

      const { error } = await supabase
        .from('deck_versions')
        .insert({
          deck_id: deckId,
          version_number: nextVersion,
          name: versionName,
          description: versionDescription || null,
          cards: currentCards,
          metadata: {
            card_count: currentCards.length,
            saved_at: new Date().toISOString()
          },
          created_by: user.id
        });

      if (error) throw error;

      showSuccess('Version Saved', `Version "${versionName}" has been saved`);
      setShowSaveDialog(false);
      setVersionName('');
      setVersionDescription('');
      loadVersions();
    } catch (error) {
      console.error('Error saving version:', error);
      showError('Save Failed', 'Failed to save deck version');
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (version: DeckVersion) => {
    if (!confirm(`Restore to version "${version.name}"? This will replace your current deck.`)) {
      return;
    }

    try {
      onRestoreVersion(version.cards);
      showSuccess('Version Restored', `Restored to version "${version.name}"`);
    } catch (error) {
      console.error('Error restoring version:', error);
      showError('Restore Failed', 'Failed to restore deck version');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Version
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No saved versions yet</p>
              <p className="text-xs mt-1">Save snapshots of your deck to track changes</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono">
                            v{version.version_number}
                          </Badge>
                          <h4 className="font-medium">{version.name}</h4>
                        </div>
                        {version.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {version.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                          </span>
                          <span>{Array.isArray(version.cards) ? version.cards.length : 0} cards</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restoreVersion(version)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Deck Version</DialogTitle>
            <DialogDescription>
              Create a snapshot of your deck to track changes over time
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="version-name">Version Name</Label>
              <Input
                id="version-name"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., Pre-Tournament Build, Budget Version"
              />
            </div>
            <div>
              <Label htmlFor="version-description">Description (Optional)</Label>
              <Textarea
                id="version-description"
                value={versionDescription}
                onChange={(e) => setVersionDescription(e.target.value)}
                placeholder="What changes did you make?"
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Saving {currentCards.length} cards</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={saveVersion}
                disabled={saving}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Version'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSaveDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
