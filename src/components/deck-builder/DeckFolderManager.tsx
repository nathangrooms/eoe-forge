import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Folder, Plus, Edit, Trash2, FolderOpen } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Badge } from '@/components/ui/badge';

export interface DeckFolder {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  position: number;
  deck_count?: number;
}

interface DeckFolderManagerProps {
  onFolderSelect?: (folderId: string | null) => void;
  selectedFolderId?: string | null;
}

export function DeckFolderManager({ onFolderSelect, selectedFolderId }: DeckFolderManagerProps) {
  const [folders, setFolders] = useState<DeckFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DeckFolder | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    icon: 'folder'
  });

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get folders with deck counts
      const { data: foldersData, error } = await supabase
        .from('deck_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true });

      if (error) throw error;

      // Count decks in each folder
      const foldersWithCounts = await Promise.all(
        (foldersData || []).map(async (folder) => {
          const { count } = await supabase
            .from('user_decks')
            .select('*', { count: 'exact', head: true })
            .eq('folder_id', folder.id);
          
          return { ...folder, deck_count: count || 0 };
        })
      );

      setFolders(foldersWithCounts);
    } catch (error) {
      console.error('Error loading folders:', error);
      showError('Error', 'Failed to load deck folders');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (editingFolder) {
        // Update existing folder
        const { error } = await supabase
          .from('deck_folders')
          .update({
            name: formData.name,
            description: formData.description,
            color: formData.color,
            icon: formData.icon
          })
          .eq('id', editingFolder.id);

        if (error) throw error;
        showSuccess('Folder Updated', `${formData.name} has been updated`);
      } else {
        // Create new folder
        const { error } = await supabase
          .from('deck_folders')
          .insert({
            user_id: user.id,
            name: formData.name,
            description: formData.description,
            color: formData.color,
            icon: formData.icon,
            position: folders.length
          });

        if (error) throw error;
        showSuccess('Folder Created', `${formData.name} has been created`);
      }

      setShowCreateDialog(false);
      setEditingFolder(null);
      setFormData({ name: '', description: '', color: '#6366f1', icon: 'folder' });
      loadFolders();
    } catch (error) {
      console.error('Error saving folder:', error);
      showError('Error', 'Failed to save folder');
    }
  };

  const handleDelete = async (folderId: string) => {
    if (!confirm('Delete this folder? Decks will not be deleted.')) return;

    try {
      const { error } = await supabase
        .from('deck_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
      showSuccess('Folder Deleted', 'Folder has been removed');
      loadFolders();
    } catch (error) {
      console.error('Error deleting folder:', error);
      showError('Error', 'Failed to delete folder');
    }
  };

  const handleEdit = (folder: DeckFolder) => {
    setEditingFolder(folder);
    setFormData({
      name: folder.name,
      description: folder.description || '',
      color: folder.color,
      icon: folder.icon
    });
    setShowCreateDialog(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Folder className="h-5 w-5" />
          Deck Folders
        </h3>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingFolder ? 'Edit Folder' : 'Create Folder'}</DialogTitle>
              <DialogDescription>
                Organize your decks into folders for better management
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Folder Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Commander, Modern, Brewing"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add a description..."
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <Select value={formData.color} onValueChange={(value) => setFormData({ ...formData, color: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="#6366f1">Indigo</SelectItem>
                    <SelectItem value="#ef4444">Red</SelectItem>
                    <SelectItem value="#10b981">Green</SelectItem>
                    <SelectItem value="#3b82f6">Blue</SelectItem>
                    <SelectItem value="#f59e0b">Orange</SelectItem>
                    <SelectItem value="#8b5cf6">Purple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {editingFolder ? 'Update' : 'Create'} Folder
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setEditingFolder(null);
                    setFormData({ name: '', description: '', color: '#6366f1', icon: 'folder' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading folders...</div>
      ) : folders.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          No folders yet. Create one to organize your decks!
        </div>
      ) : (
        <div className="grid gap-2">
          <Button
            variant={selectedFolderId === null ? 'default' : 'ghost'}
            className="justify-start"
            onClick={() => onFolderSelect?.(null)}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            All Decks
          </Button>
          {folders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-2">
              <Button
                variant={selectedFolderId === folder.id ? 'default' : 'ghost'}
                className="flex-1 justify-start"
                onClick={() => onFolderSelect?.(folder.id)}
                style={{ borderLeftColor: folder.color, borderLeftWidth: '4px' }}
              >
                <Folder className="h-4 w-4 mr-2" />
                {folder.name}
                <Badge variant="secondary" className="ml-auto">
                  {folder.deck_count}
                </Badge>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEdit(folder)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(folder.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
