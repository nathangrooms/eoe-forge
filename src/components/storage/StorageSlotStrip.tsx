import { useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { StorageItemWithCard, StorageSlot } from '@/types/storage';
import {
  countBySlot,
  nextSlotName,
  orderSlots,
  slotLabel,
  subdivisionFor,
} from '@/lib/storage/subdivision';

/**
 * The pages, dividers or shelves of a container, and which one you are looking
 * at.
 *
 * `storage_slots` had six real rows in it and no screen in the product said the
 * word. This is the selector that makes them mean something: it names them the
 * way the physical object does (see `lib/storage/subdivision.ts` for why a
 * binder gets pages and a box gets dividers), counts what is behind each one,
 * and always offers the unfiled cards as a place of their own.
 *
 * Two rules it exists to keep:
 *
 * - **Nobody is made to file anything.** "All" is the default view and the
 *   unfiled group is always there, named, with its count. A user who never
 *   touches a divider sees a normal container.
 * - **The counts are counts.** Cards behind a divider, not a percentage of a
 *   capacity nobody set. A binder page is the single exception in this product
 *   because nine pockets is a real, physical number, and that fraction is
 *   produced by `describeFill`, not invented here.
 */

/** Which group the contents list is showing. */
export type SlotSelection = 'all' | 'loose' | string;

interface StorageSlotStripProps {
  containerType: string;
  slots: StorageSlot[];
  items: StorageItemWithCard[];
  selected: SlotSelection;
  onSelect: (selection: SlotSelection) => void;
  onAddSlot: (name: string) => Promise<void>;
  onRenameSlot: (slotId: string, name: string) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
}

export function StorageSlotStrip({
  containerType,
  slots,
  items,
  selected,
  onSelect,
  onAddSlot,
  onRenameSlot,
  onDeleteSlot,
}: StorageSlotStripProps) {
  const sub = subdivisionFor(containerType);
  const ordered = useMemo(() => orderSlots(slots), [slots]);
  const { bySlot, loose } = useMemo(() => countBySlot(items), [items]);

  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const total = items.reduce((sum, item) => sum + item.qty, 0);

  const startAdd = () => {
    setDraftName(nextSlotName(sub, ordered.length));
    setAdding(true);
  };

  const submitAdd = async () => {
    const name = draftName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onAddSlot(name);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await onRenameSlot(editingId, name);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      await onDeleteSlot(editingId);
      if (selected === editingId) onSelect('all');
      setEditingId(null);
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const editingIndex = ordered.findIndex(s => s.id === editingId);

  return (
    <section aria-label={sub.groupLabel} className="rounded-xl bg-card p-3 shadow-lg shadow-black/20">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {sub.groupLabel}
        </h3>
        {ordered.length === 0 && (
          <p className="text-xs text-muted-foreground">{sub.why}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          label="All"
          count={total}
          active={selected === 'all'}
          onClick={() => onSelect('all')}
        />

        {ordered.map((slot, index) => (
          <Chip
            key={slot.id}
            label={slotLabel(sub, slot, index)}
            count={bySlot.get(slot.id) ?? 0}
            active={selected === slot.id}
            onClick={() => onSelect(slot.id)}
          />
        ))}

        {/* The unfiled cards. Last, because it is where things start rather
            than where they end up, but never hidden and never nameless. */}
        {(loose > 0 || ordered.length > 0) && (
          <Chip
            label={sub.looseLabel}
            count={loose}
            active={selected === 'loose'}
            onClick={() => onSelect('loose')}
            muted
          />
        )}

        {adding ? (
          <span className="flex items-center gap-1.5">
            <Input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitAdd();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setAdding(false);
                }
              }}
              aria-label={`Name for the new ${sub.noun}`}
              autoFocus
              disabled={busy}
              className="h-8 w-36 border-0 bg-muted/50 text-sm"
            />
            <Button size="sm" onClick={submitAdd} disabled={busy || !draftName.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Add'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {sub.addLabel}
          </Button>
        )}

        {/* Renaming and removing the one you are looking at, in place. */}
        {selected !== 'all' && selected !== 'loose' && editingId !== selected && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={`Rename this ${sub.noun}`}
            onClick={() => {
              const slot = ordered.find(s => s.id === selected);
              setEditName(slot?.name ?? '');
              setEditingId(selected);
              setConfirmingDelete(false);
            }}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {editingId && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditingId(null);
              }
            }}
            aria-label={`Name of ${slotLabel(sub, ordered[editingIndex] ?? null, editingIndex)}`}
            autoFocus
            disabled={busy}
            className="h-8 w-40 border-0 bg-background/60 text-sm"
          />
          <Button size="sm" onClick={submitRename} disabled={busy}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="ml-1">Save</span>
          </Button>
          {confirmingDelete ? (
            <>
              <span className="text-xs text-muted-foreground">
                Cards behind it stay in the container.
              </span>
              <Button size="sm" variant="destructive" onClick={submitDelete} disabled={busy}>
                Remove it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto h-8 w-8"
            aria-label="Stop editing"
            onClick={() => setEditingId(null)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  );
}

/** One selectable group, with the number of cards actually behind it. */
function Chip({
  label,
  count,
  active,
  onClick,
  muted,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-accent text-accent-foreground shadow-md shadow-black/20'
          : muted
            ? 'bg-muted/30 text-muted-foreground hover:bg-accent/50'
            : 'bg-muted/50 hover:bg-accent/60'
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-xs opacity-70">{count}</span>
    </button>
  );
}
