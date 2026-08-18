import { useEffect, useState } from 'react';
import { Plus, Package, Layers, Archive, Box, Folder, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { StorageAPI } from '@/lib/api/storageAPI';
import { getTemplateById } from '@/lib/storageTemplates';
import { showError, showSuccess } from '@/components/ui/toast-helpers';

const CONTAINER_TYPES = [
  { id: 'box', name: 'Storage box', icon: Box, description: 'Bulk storage' },
  { id: 'binder', name: 'Binder', icon: Layers, description: 'Organised pages' },
  { id: 'deckbox', name: 'Deck box', icon: Package, description: 'A single deck' },
  { id: 'shelf', name: 'Shelf / display', icon: Folder, description: 'Display cases' },
  { id: 'other', name: 'Other', icon: Archive, description: 'Custom container' },
];

interface CreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: string;
  /** Preselects a type — the quick-create tiles used to discard the choice. */
  initialType?: string;
  onSuccess: () => void;
}

export function CreateContainerDialog({
  open,
  onOpenChange,
  templateId,
  initialType,
  onSuccess,
}: CreateContainerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('box');

  const template = templateId ? getTemplateById(templateId) : null;

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setType(template.type);
    } else {
      setName('');
      setType(initialType ?? 'box');
    }
  }, [open, template, initialType]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const container = await StorageAPI.createContainer({ name: name.trim(), type });

      if (template?.slots?.length) {
        await Promise.all(
          template.slots.map(slot =>
            StorageAPI.createSlot({
              container_id: container.id,
              name: slot.name,
              position: slot.position,
            })
          )
        );
      }

      showSuccess('Container created', `${container.name} is ready`);
      onSuccess();
    } catch (error) {
      showError('Error', error instanceof Error ? error.message : 'Failed to create container');
    } finally {
      setLoading(false);
    }
  };

  const selectedType = CONTAINER_TYPES.find(t => t.id === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template ? `Create ${template.name}` : 'Create storage container'}
          </DialogTitle>
          <DialogDescription>Record where your physical cards are kept</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="container-name">Container name</Label>
            <Input
              id="container-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Main binder, EDH box"
              className="h-11"
              required
            />
          </div>

          {!template && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Container type</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CONTAINER_TYPES.map(option => {
                  const isSelected = type === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setType(option.id)}
                      className={cn(
                        'relative rounded-lg border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-foreground bg-accent'
                          : 'border-border bg-card hover:bg-accent'
                      )}
                    >
                      {isSelected && (
                        <Check
                          className="absolute right-1.5 top-1.5 h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      )}
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="text-sm font-medium">{option.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {template?.slots?.length ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium">This template adds slots</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {template.slots.slice(0, 3).map(s => s.name).join(', ')}
                {template.slots.length > 3 && ` +${template.slots.length - 3} more`}
              </p>
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || loading} className="flex-1 gap-2">
              {loading ? (
                'Creating…'
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create {selectedType ? selectedType.name.toLowerCase() : 'container'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
