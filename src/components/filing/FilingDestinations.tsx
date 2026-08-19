import { Package, Layers, FolderOpen, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/**
 * Where a card is going: your collection, a deck, a box.
 *
 * This exists because the same question is asked in four places and was answered
 * differently in each: scanning cards in, adding cards to a collection, filing an
 * order that has arrived, and moving a card between containers. The owner's
 * verdict on the scan version was that it "all just merges into the background",
 * and it did: three small switches, `text-white/50` icons, and 128px dropdowns on
 * `bg-white/10`, which is low-contrast decoration rather than a control you are
 * meant to operate while holding a stack of cards.
 *
 * So each destination is a real target you press, sized to be hit quickly and
 * unmistakable when it is on. The card is going somewhere; you should be able to
 * see where without reading.
 *
 * Deliberately NOT a switch plus a dropdown. Turning a destination on and saying
 * WHICH deck are the same decision, so they live in one control: pressing an
 * inactive destination turns it on, and its target picker only exists once it is
 * on and there is more than one option to choose between.
 */

export interface FilingTarget {
  id: string;
  name: string;
}

export interface FilingValue {
  collection: boolean;
  deck: boolean;
  deckId: string;
  storage: boolean;
  storageId: string;
}

const TILE =
  'group relative flex-1 rounded-xl p-3 text-left transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Tile({
  active, icon: Icon, label, hint, onToggle, children,
}: {
  active: boolean;
  icon: typeof Package;
  label: string;
  hint: string;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(TILE, active ? 'bg-foreground text-background' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2.5 text-left">
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
            active ? 'bg-background text-foreground' : 'bg-background/60'
          )}
        >
          {active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Icon className="h-3 w-3" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">{label}</span>
          <span className={cn('block text-xs leading-snug', active ? 'text-background/70' : 'text-muted-foreground/80')}>
            {hint}
          </span>
        </span>
      </button>
      {active && children}
    </div>
  );
}

/** The target picker, shown only once its destination is on. */
function TargetPicker({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilingTarget[];
  placeholder: string;
}) {
  /* One option is not a choice. Name it and move on, rather than making the
     user open a menu to pick the only thing in it. */
  if (options.length === 0) {
    return <p className="mt-2 text-xs text-background/70">Nothing to file into yet.</p>;
  }
  if (options.length === 1) {
    return <p className="mt-2 truncate text-xs font-medium text-background">{options[0].name}</p>;
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-2 h-8 w-full bg-background/90 text-xs text-foreground">
        <SelectValue placeholder={placeholder} />
        <ChevronDown className="h-3 w-3 opacity-60" />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilingDestinations({
  value, onChange, decks, containers, className,
}: {
  value: FilingValue;
  onChange: (next: FilingValue) => void;
  decks: FilingTarget[];
  containers: FilingTarget[];
  className?: string;
}) {
  const set = (patch: Partial<FilingValue>) => onChange({ ...value, ...patch });

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row', className)}>
      <Tile
        active={value.collection}
        icon={Package}
        label="Collection"
        hint="Counts towards what you own"
        onToggle={() => set({ collection: !value.collection })}
      />

      <Tile
        active={value.deck}
        icon={Layers}
        label="Deck"
        hint={value.deck ? 'Which deck' : 'Add straight to a decklist'}
        onToggle={() =>
          set({
            deck: !value.deck,
            /* Choosing the only deck for them saves a step; with several, the
               picker appears and stays empty until they choose. */
            deckId: !value.deck && decks.length === 1 ? decks[0].id : value.deckId,
          })
        }
      >
        <TargetPicker
          value={value.deckId}
          onChange={v => set({ deckId: v })}
          options={decks}
          placeholder="Choose a deck"
        />
      </Tile>

      <Tile
        active={value.storage}
        icon={FolderOpen}
        label="Box"
        hint={value.storage ? 'Which box' : 'Where it physically lives'}
        onToggle={() =>
          set({
            storage: !value.storage,
            storageId:
              !value.storage && containers.length === 1 ? containers[0].id : value.storageId,
          })
        }
      >
        <TargetPicker
          value={value.storageId}
          onChange={v => set({ storageId: v })}
          options={containers}
          placeholder="Choose a box"
        />
      </Tile>
    </div>
  );
}

export default FilingDestinations;
