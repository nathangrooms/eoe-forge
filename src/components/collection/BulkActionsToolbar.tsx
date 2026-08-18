import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, Package, Trash2, Plus, Minus } from 'lucide-react';
import { StorageContainer } from '@/types/storage';
import { formatPrice } from '@/components/collection/browser/types';

interface BulkActionsToolbarProps {
  selectedCount: number;
  /** Market value of the selection, so destructive actions state what is at stake. */
  selectedValue?: number;
  onClearSelection: () => void;
  onBulkUpdateQuantity: (delta: number) => void;
  onBulkAssignStorage: (containerId: string) => void;
  onBulkDelete: () => void;
  storageContainers?: StorageContainer[];
}

/**
 * Every control here performs a real mutation. The previous version also
 * rendered a "Mark for Sale" button whose only effect was a success toast, and
 * a stray DropdownMenuSeparator floating in the middle of the flex row.
 */
export function BulkActionsToolbar({
  selectedCount,
  selectedValue,
  onClearSelection,
  onBulkUpdateQuantity,
  onBulkAssignStorage,
  onBulkDelete,
  storageContainers = [],
}: BulkActionsToolbarProps) {
  const [showQuantityDialog, setShowQuantityDialog] = useState(false);
  const [quantityDelta, setQuantityDelta] = useState<string>('1');
  const [quantityAction, setQuantityAction] = useState<'add' | 'subtract'>('add');

  const handleQuantityAction = (action: 'add' | 'subtract') => {
    setQuantityAction(action);
    setShowQuantityDialog(true);
  };

  const handleQuantitySubmit = () => {
    const delta = parseInt(quantityDelta, 10) || 0;
    if (delta > 0) {
      onBulkUpdateQuantity(quantityAction === 'add' ? delta : -delta);
    }
    setShowQuantityDialog(false);
    setQuantityDelta('1');
  };

  return (
    <>
      <div className="sticky top-0 z-30 flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-secondary px-4 py-3 text-secondary-foreground sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-2 py-1 text-sm font-semibold">
            {selectedCount} selected
          </Badge>
          {typeof selectedValue === 'number' && selectedValue > 0 && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatPrice(selectedValue)}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Quantity
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleQuantityAction('add')}>
                <Plus className="mr-2 h-4 w-4" />
                Add quantity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleQuantityAction('subtract')}>
                <Minus className="mr-2 h-4 w-4" />
                Subtract quantity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {storageContainers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Package className="mr-1 h-4 w-4" />
                  Assign storage
                  <ChevronDown className="ml-1 h-4 w-4" />
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

          <Button variant="destructive" size="sm" onClick={onBulkDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={showQuantityDialog} onOpenChange={setShowQuantityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quantityAction === 'add' ? 'Add' : 'Subtract'} quantity
            </DialogTitle>
            <DialogDescription>
              {quantityAction === 'add'
                ? `Add copies to ${selectedCount} selected entr${selectedCount === 1 ? 'y' : 'ies'}`
                : `Subtract copies from ${selectedCount} selected entr${selectedCount === 1 ? 'y' : 'ies'}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-quantity">Quantity</Label>
            <Input
              id="bulk-quantity"
              type="number"
              min="1"
              value={quantityDelta}
              onChange={e => setQuantityDelta(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuantityDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuantitySubmit}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
