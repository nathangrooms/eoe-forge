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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CONDITIONS, type ConditionGrade } from '@/components/collection/browser/types';

export interface MoveToCollectionValues {
  quantity: number;
  foil: boolean;
  condition: ConditionGrade;
}

interface MoveToCollectionDialogProps {
  cardName?: string;
  defaultQuantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: MoveToCollectionValues) => void;
  busy?: boolean;
}

/**
 * Buying is the moment the user knows what they actually got, so the move asks
 * for foil and condition instead of silently recording every purchase as a
 * non-foil near-mint copy.
 */
export function MoveToCollectionDialog({
  cardName,
  defaultQuantity,
  open,
  onOpenChange,
  onConfirm,
  busy = false,
}: MoveToCollectionDialogProps) {
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [foil, setFoil] = useState(false);
  const [condition, setCondition] = useState<ConditionGrade>('NM');

  useEffect(() => {
    if (open) {
      setQuantity(defaultQuantity || 1);
      setFoil(false);
      setCondition('NM');
    }
  }, [open, defaultQuantity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to collection</DialogTitle>
          <DialogDescription>{cardName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="move-quantity">Copies</Label>
            <Input
              id="move-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="move-condition">Condition</Label>
            <Select
              value={condition}
              onValueChange={value => setCondition(value as ConditionGrade)}
            >
              <SelectTrigger id="move-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label} ({c.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="move-foil">Foil</Label>
            <Switch id="move-foil" checked={foil} onCheckedChange={setFoil} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm({ quantity, foil, condition })} disabled={busy}>
            {busy ? 'Moving…' : 'Move to collection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
