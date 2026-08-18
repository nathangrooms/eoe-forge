import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, Package, Trash2, Plus, Minus, Check } from 'lucide-react';
import { StorageContainer } from '@/types/storage';
import { formatPrice } from '@/components/collection/browser/types';

interface BulkActionsToolbarProps {
  selectedCount: number;
  /** Market value of the selection, so destructive actions state what is at stake. */
  selectedValue?: number;
  /** Physical copies in the selection — an entry can hold several. */
  selectedCopies?: number;
  onClearSelection: () => void;
  onBulkUpdateQuantity: (delta: number) => void;
  onBulkAssignStorage: (containerId: string) => void;
  /** Called once the in-place confirmation has been accepted. */
  onBulkDelete: () => void;
  storageContainers?: StorageContainer[];
}

/**
 * Every control here performs a real mutation, and none of them opens an
 * overlay: setting a quantity expands a field inside the bar, and deleting
 * swaps the Delete button in place into a confirm/cancel pair. The selection
 * the action applies to stays visible underneath the whole time.
 */
export function BulkActionsToolbar({
  selectedCount,
  selectedValue,
  selectedCopies,
  onClearSelection,
  onBulkUpdateQuantity,
  onBulkAssignStorage,
  onBulkDelete,
  storageContainers = [],
}: BulkActionsToolbarProps) {
  const [quantityAction, setQuantityAction] = useState<'add' | 'subtract' | null>(null);
  const [quantityDelta, setQuantityDelta] = useState<string>('1');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const openQuantity = (action: 'add' | 'subtract') => {
    setConfirmingDelete(false);
    setQuantityAction(action);
    setQuantityDelta('1');
  };

  const applyQuantity = () => {
    const delta = parseInt(quantityDelta, 10) || 0;
    if (delta > 0) {
      onBulkUpdateQuantity(quantityAction === 'add' ? delta : -delta);
    }
    setQuantityAction(null);
    setQuantityDelta('1');
  };

  const entryWord = `entr${selectedCount === 1 ? 'y' : 'ies'}`;

  return (
    <div className="sticky top-0 z-30 space-y-3 rounded-lg bg-secondary px-4 py-3 text-secondary-foreground shadow-lg shadow-black/20">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="px-2 py-1 text-sm font-semibold">
            {selectedCount} selected
          </Badge>
          {typeof selectedValue === 'number' && selectedValue > 0 && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatPrice(selectedValue)}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="gap-1">
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                Quantity
                <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openQuantity('add')}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Add quantity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openQuantity('subtract')}>
                <Minus className="mr-2 h-4 w-4" aria-hidden="true" />
                Subtract quantity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {storageContainers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Package className="mr-1 h-4 w-4" aria-hidden="true" />
                  Assign storage
                  <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {storageContainers.map(container => (
                  <DropdownMenuItem
                    key={container.id}
                    onClick={() => onBulkAssignStorage(container.id)}
                  >
                    {container.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* The destructive control swaps in place — no overlay, no focus trap. */}
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-2 py-1.5">
              <span className="text-sm font-medium">
                Delete {selectedCount} {entryWord}?
              </span>
              <Button variant="destructive" size="sm" onClick={onBulkDelete}>
                Confirm
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setQuantityAction(null);
                setConfirmingDelete(true);
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <p className="text-sm text-muted-foreground">
          This removes{' '}
          {typeof selectedCopies === 'number'
            ? `${selectedCopies} card${selectedCopies === 1 ? '' : 's'}`
            : `${selectedCount} ${entryWord}`}
          {typeof selectedValue === 'number' && selectedValue > 0
            ? ` worth ${formatPrice(selectedValue)}`
            : ''}{' '}
          from your collection. This cannot be undone.
        </p>
      )}

      {/* Setting one integer never needed a dialog: the field opens in the bar. */}
      {quantityAction && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-background/60 px-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="bulk-quantity" className="text-xs text-muted-foreground">
              {quantityAction === 'add' ? 'Copies to add' : 'Copies to subtract'}
            </Label>
            <Input
              id="bulk-quantity"
              type="number"
              min="1"
              value={quantityDelta}
              onChange={e => setQuantityDelta(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyQuantity();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setQuantityAction(null);
                }
              }}
              autoFocus
              className="h-9 w-24 border-0 bg-muted/50"
            />
          </div>
          <Button size="sm" onClick={applyQuantity} className="gap-1">
            <Check className="h-4 w-4" aria-hidden="true" />
            Apply to {selectedCount} {entryWord}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setQuantityAction(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
