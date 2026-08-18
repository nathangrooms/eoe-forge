import { Crown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CommanderSelector } from './CommanderSelector';

/**
 * The commander picker dialog, in one place.
 *
 * VisualDeckView used to inline this block three times (mobile, desktop and
 * the empty state) and none of the copies could close itself, so the modal
 * stayed open over the deck after you chose a commander.
 */
export function CommanderDialog({
  open,
  onOpenChange,
  currentCommander,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCommander?: any;
  /** The trigger element. */
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-type-commander" />
            Choose your commander
          </DialogTitle>
        </DialogHeader>
        <CommanderSelector currentCommander={currentCommander} onSelect={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
