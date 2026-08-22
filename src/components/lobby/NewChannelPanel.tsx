import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  CHANNEL_NAME_MAX,
  channelReach,
  createRoom,
  lobbyErrorMessage,
  whyNotChannel,
  type ChatRoom,
} from '@/lib/lobby';

/**
 * Making a channel.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS, AND THE SCREEN SAYS WHAT EACH ONE MEANS
 * ---------------------------------------------------------------------------
 * Open: anybody can read it, signed out included, and an account can post. That
 * is the same rule the three community rooms carry, because a community channel
 * that needs a sign-up to read is not a community.
 *
 * Private: only people you add can read a word of it, post in it, or see that
 * it is there. You add friends, and only friends, so a private channel cannot
 * be used to put words in front of somebody who never agreed to hear them.
 *
 * The second sentence of the private case is the uncomfortable one and it is on
 * screen on purpose. A report about a private channel cannot be judged without
 * reading it, so either the site owner can read it or reports about it cannot
 * be acted on. This product picked the first and says so, rather than letting
 * the word private mean something it does not. The sentences live in
 * `friendsView.ts` and are asserted whole by its test.
 *
 * ---------------------------------------------------------------------------
 * THE NAME IS THE ADDRESS
 * ---------------------------------------------------------------------------
 * "Deck help" becomes `deck-help`, which is what goes in the URL, so a channel
 * can be sent to somebody. The database refuses a name already taken and caps
 * it at five new channels a day per account, because that limit belongs in the
 * database and not on this button.
 */

export interface NewChannelPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new channel, so the chat box can open on it straight away. */
  onMade: (room: ChatRoom) => void;
}

export function NewChannelPanel({ open, onOpenChange, onMade }: NewChannelPanelProps) {
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setIsPrivate(false);
    setError(null);
  }, [open]);

  const whyNot = whyNotChannel(title);

  const make = async () => {
    if (whyNot) return;
    setMaking(true);
    setError(null);
    try {
      const room = await createRoom(title.trim(), isPrivate);
      onMade(room);
      onOpenChange(false);
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setMaking(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="sr-only">Make a channel</SheetTitle>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Make a channel</h2>
            <p className="text-sm text-muted-foreground">
              A place to talk about one thing. Cube night, your pod, a format nobody else
              plays.
            </p>
          </div>

          <div>
            <label
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              htmlFor="channel-name"
            >
              What to call it
            </label>
            <Input
              id="channel-name"
              autoFocus
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={CHANNEL_NAME_MAX}
              placeholder="Thursday cube"
              className="mt-1 bg-muted/40"
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void make();
                }
              }}
            />
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Who can read it
            </p>
            <div className="mt-2 space-y-2">
              <ReachChoice
                selected={!isPrivate}
                title="Anybody"
                blurb={channelReach(false)}
                onSelect={() => setIsPrivate(false)}
              />
              <ReachChoice
                selected={isPrivate}
                title="Only people I add"
                blurb={channelReach(true)}
                onSelect={() => setIsPrivate(true)}
              />
            </div>
          </div>

          {title.trim().length > 0 && whyNot && (
            <p className="text-sm text-muted-foreground">{whyNot}</p>
          )}
          {error && <p className="text-sm text-foreground">{error}</p>}

          <Button className="w-full" disabled={Boolean(whyNot) || making} onClick={() => void make()}>
            {making ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Making it
              </>
            ) : (
              'Make the channel'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReachChoice({
  selected,
  title,
  blurb,
  onSelect,
}: {
  selected: boolean;
  title: string;
  blurb: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg p-3 text-left transition-transform duration-150',
        'motion-safe:active:scale-[0.99]',
        selected ? 'bg-foreground/10' : 'bg-muted/40'
      )}
    >
      <p
        className={cn(
          'text-sm font-medium',
          selected ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
    </button>
  );
}
