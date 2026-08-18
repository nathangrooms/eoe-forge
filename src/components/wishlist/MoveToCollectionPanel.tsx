import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
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

interface MoveToCollectionPanelProps {
  cardName?: string;
  defaultQuantity: number;
  onCancel: () => void;
  onConfirm: (values: MoveToCollectionValues) => void;
  busy?: boolean;
}

/**
 * Buying is the moment the user knows what they actually got, so the move asks
 * for foil and condition instead of silently recording every purchase as a
 * non-foil near-mint copy.
 *
 * It expands in the wishlist layout rather than opening over it: the list you
 * are working through stays on screen, and Escape closes it without a focus
 * trap having to be unwound.
 */
export function MoveToCollectionPanel({
  cardName,
  defaultQuantity,
  onCancel,
  onConfirm,
  busy = false,
}: MoveToCollectionPanelProps) {
  const [quantity, setQuantity] = useState(defaultQuantity || 1);
  const [foil, setFoil] = useState(false);
  const [condition, setCondition] = useState<ConditionGrade>('NM');
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <section
      ref={ref}
      aria-label={`Move ${cardName ?? 'card'} to collection`}
      className="rounded-xl bg-card p-4 shadow-lg shadow-black/20"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-card-foreground">Move to collection</h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{cardName}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="move-quantity">Copies</Label>
          <Input
            id="move-quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="border-0 bg-muted/40"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="move-condition">Condition</Label>
          <Select value={condition} onValueChange={value => setCondition(value as ConditionGrade)}>
            <SelectTrigger id="move-condition" className="border-0 bg-muted/40">
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

        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:mt-6">
          <Label htmlFor="move-foil">Foil</Label>
          <Switch id="move-foil" checked={foil} onCheckedChange={setFoil} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onConfirm({ quantity, foil, condition })} disabled={busy}>
          {busy ? 'Moving...' : 'Move to collection'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
