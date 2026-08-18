import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StorageAPI } from '@/lib/api/storageAPI';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import type { StorageContainer } from '@/types/storage';

interface EditContainerDialogProps {
  container: StorageContainer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (container: StorageContainer) => void;
}

/**
 * The "Edit Container" menu item used to be an enabled item with no onClick, so
 * a container's name could never be changed after creation.
 */
export function EditContainerDialog({
  container,
  open,
  onOpenChange,
  onSaved,
}: EditContainerDialogProps) {
  const [name, setName] = useState(container.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(container.name);
  }, [open, container.name]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const updated = await StorageAPI.updateContainer(container.id, { name: trimmed });
      showSuccess('Saved', `Container renamed to ${updated.name}`);
      onSaved(updated);
      onOpenChange(false);
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Failed to update container');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit container</DialogTitle>
          <DialogDescription>
            Rename this {container.type}. Its contents are unaffected.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="container-name">Name</Label>
            <Input
              id="container-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || name.trim() === container.name}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
