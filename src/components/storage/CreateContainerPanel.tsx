import { useState } from 'react';
import { Plus, Package, Layers, Archive, Box, Folder, Check, X } from 'lucide-react';
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

interface CreateContainerPanelProps {
  templateId?: string;
  /** Preselects a type — the quick-create tiles used to discard the choice. */
  initialType?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

/**
 * Was a dialog. Choosing a container type is a decision made *relative to what
 * you already own*, so the list it sits above has to stay visible: this expands
 * in place at the top of the container list instead of covering it.
 *
 * State is initialised at mount — the host gives the panel a `key`, so opening
 * it again is a fresh mount rather than a reset effect.
 */
export function CreateContainerPanel({
  templateId,
  initialType,
  onCancel,
  onSuccess,
}: CreateContainerPanelProps) {
  const template = templateId ? getTemplateById(templateId) : null;

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(template ? template.name : '');
  const [type, setType] = useState(template ? template.type : (initialType ?? 'box'));

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
    <section
      aria-label="Add a container"
      className="mb-6 rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-card-foreground">
            {template ? `Create ${template.name}` : 'Add a container'}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record where your physical cards are kept
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Close"
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="container-name">Container name</Label>
          <Input
            id="container-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Main binder, EDH box"
            className="h-11 border-0 bg-muted/40"
            autoFocus
            required
          />
        </div>

        {!template && (
          <fieldset className="space-y-3">
            <legend className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Container type
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
                      'relative rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'bg-accent text-accent-foreground shadow-md shadow-black/20'
                        : 'bg-muted/40 hover:bg-accent/60'
                    )}
                  >
                    {isSelected && (
                      <Check
                        className="absolute right-1.5 top-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-background/60">
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
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-sm font-medium">This template adds slots</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {template.slots.slice(0, 3).map(s => s.name).join(', ')}
              {template.slots.length > 3 && ` +${template.slots.length - 3} more`}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!name.trim() || loading} className="gap-2">
            {loading ? (
              'Creating…'
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create {selectedType ? selectedType.name.toLowerCase() : 'container'}
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
