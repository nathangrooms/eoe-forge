import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  SHARING_CHOICES,
  listBlocked,
  lobbyErrorMessage,
  safeName,
  sharingSummary,
  unblockPlayer,
  type BlockedPlayer,
  type Sharing,
} from '@/lib/lobby';

/**
 * What a friend can see, decided by the person it is about.
 *
 * ---------------------------------------------------------------------------
 * THE COLLECTION STARTS OFF, AND THE SCREEN SAYS WHY
 * ---------------------------------------------------------------------------
 * Decks default to shared. A deck is a thing somebody built to show people, and
 * a game is better when you can see what the other side plays.
 *
 * A collection does not. It is a list of what somebody owns and roughly what it
 * is worth, which is closer to a statement of assets than to a deck list, and
 * turning that on for everybody who is ever accepted as a friend is a decision
 * that should be taken on purpose rather than inherited. It is one switch away
 * and the switch says exactly what it does.
 *
 * Being around defaults to shared, because a friends list where nobody is ever
 * shown as around is a list of grey dots, which is the feature not working.
 * Turning it off shows you as "does not share", never as "away", because those
 * are different facts and one of them would be a lie.
 *
 * ---------------------------------------------------------------------------
 * THE SWITCH IS THE RULE, NOT A HINT TO THE INTERFACE
 * ---------------------------------------------------------------------------
 * `may_see_friend()` in the database reads these, and `friend_decks` and
 * `friend_collection` refuse before they read a row. Turning the collection off
 * does not hide a tab, it makes the answer to the question stop existing.
 *
 * ---------------------------------------------------------------------------
 * BLOCKING LIVES HERE TOO
 * ---------------------------------------------------------------------------
 * Blocking somebody is done on their row, where you are already looking at
 * them. Taking it back has to live somewhere, and it cannot be their row,
 * because a blocked person is not on your list any more. So it is here, with
 * the rest of the decisions about who gets to see you.
 */

export interface SharingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sharing: Sharing;
  saving: boolean;
  error: string | null;
  onChange: (next: Sharing) => void;
  /** Something changed, so the list behind this should be re-read. */
  onChanged: () => void;
}

export function SharingPanel({
  open,
  onOpenChange,
  sharing,
  saving,
  error,
  onChange,
  onChanged,
}: SharingPanelProps) {
  const [blocked, setBlocked] = useState<BlockedPlayer[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  /* Read only when the panel is opened, and once. A list of people somebody
     blocked is almost always empty, and asking for it on every page visit is a
     query for everybody to answer a question about almost nobody. */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingBlocked(true);
    listBlocked()
      .then(found => {
        if (alive) setBlocked(found);
      })
      .catch(caught => {
        if (alive) setBlockError(lobbyErrorMessage(caught));
      })
      .finally(() => {
        if (alive) setLoadingBlocked(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const unblock = async (player: BlockedPlayer) => {
    setBlockError(null);
    try {
      await unblockPlayer(player.userId);
      setBlocked(current => current.filter(row => row.userId !== player.userId));
      onChanged();
    } catch (caught) {
      setBlockError(lobbyErrorMessage(caught));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="sr-only">What friends can see</SheetTitle>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">What friends can see</h2>
            <p className="text-sm text-muted-foreground">{sharingSummary(sharing)}</p>
          </div>

          <div className="space-y-3">
            {SHARING_CHOICES.map(choice => (
              <div key={choice.key} className="flex gap-3 rounded-lg bg-muted/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{choice.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{choice.detail}</p>
                </div>
                <Switch
                  checked={sharing[choice.key]}
                  disabled={saving}
                  aria-label={choice.title}
                  onCheckedChange={next => onChange({ ...sharing, [choice.key]: next })}
                />
              </div>
            ))}
          </div>

          {saving && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving
            </p>
          )}
          {error && <p className="text-sm text-foreground">{error}</p>}

          <div>
            <h3 className="text-sm font-semibold text-foreground">People you blocked</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              They cannot ask you again and they are not told. Letting somebody back in is
              done here.
            </p>

            {loadingBlocked && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Reading
              </p>
            )}

            {!loadingBlocked && blocked.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">Nobody.</p>
            )}

            <ul className="mt-3 space-y-2">
              {blocked.map(player => (
                <li
                  key={player.userId}
                  className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {safeName(player.name)}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void unblock(player)}>
                    Let them back
                  </Button>
                </li>
              ))}
            </ul>

            {blockError && <p className="mt-2 text-sm text-foreground">{blockError}</p>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
