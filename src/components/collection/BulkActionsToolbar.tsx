import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { X, ChevronDown, Package, Trash2, ShoppingCart, Plus, Minus } from 'lucide-react';
import { StorageContainer } from '@/types/storage';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkUpdateQuantity: (delta: number) => void;
  onBulkAssignStorage: (containerId: string) => void;
  onBulkMarkForSale: () => void;
  onBulkDelete: () => void;
  storageContainers?: StorageContainer[];
}

export function BulkActionsToolbar({
  selectedCount,
  onClearSelection,
  onBulkUpdateQuantity,
  onBulkAssignStorage,
  onBulkMarkForSale,
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
    const delta = parseInt(quantityDelta) || 0;
    if (delta > 0) {
      onBulkUpdateQuantity(quantityAction === 'add' ? delta : -delta);
    }
    setShowQuantityDialog(false);
    setQuantityDelta('1');
  };

  return (
    <>
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg rounded-lg mx-2 mt-2 animate-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
            {selectedCount} selected
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/20"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quantity Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                Quantity
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleQuantityAction('add')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Quantity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleQuantityAction('subtract')}>
                <Minus className="h-4 w-4 mr-2" />
                Subtract Quantity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Storage Assignment */}
          {storageContainers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Package className="h-4 w-4 mr-1" />
                  Assign Storage
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {storageContainers.map((container) => (
                  <DropdownMenuItem
                    key={container.id}
                    onClick={() => onBulkAssignStorage(container.id)}
                  >
                    {container.icon && <span className="mr-2">{container.icon}</span>}
                    {container.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mark for Sale */}
          <Button variant="secondary" size="sm" onClick={onBulkMarkForSale}>
            <ShoppingCart className="h-4 w-4 mr-1" />
            Mark for Sale
          </Button>

          <DropdownMenuSeparator />

          {/* Delete */}
          <Button variant="destructive" size="sm" onClick={onBulkDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Quantity Dialog */}
      <Dialog open={showQuantityDialog} onOpenChange={setShowQuantityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quantityAction === 'add' ? 'Add' : 'Subtract'} Quantity
            </DialogTitle>
            <DialogDescription>
              {quantityAction === 'add'
                ? `Add quantity to ${selectedCount} selected card(s)`
                : `Subtract quantity from ${selectedCount} selected card(s)`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantityDelta}
              onChange={(e) => setQuantityDelta(e.target.value)}
              placeholder="Enter quantity"
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
