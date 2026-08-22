import { useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFriends } from './useFriends';
import {
  aroundLine,
  inviteFriendToTable,
  isAround,
  lobbyErrorMessage,
  safeName,
  type Friend,
} from '@/lib/lobby';

/**
 * Asking a friend to the table you are sitting at.
 *
 * ---------------------------------------------------------------------------
 * AN INVITATION IS A SHORTCUT TO THE LINK, NOT A SECOND WAY IN
 * ---------------------------------------------------------------------------
 * The table is one of the lobby's own `game_tables`, and what an invitation
 * carries is its existing six character code. The friend presses one button and
 * lands on `/play/t/<code>`, which is the same address the share link points at
 * and the same screen that decides whether anybody may sit down. There is no
 * second joining rule to keep in step with the first.
 *
 * So this sits directly under `ShareLink`, and it is the same offer twice: the
 * link for somebody who is not on DeckMatrix, this for somebody who is.
 *
 * ---------------------------------------------------------------------------
 * WHO IS AROUND COMES FIRST
 * ---------------------------------------------------------------------------
 * A friend who is on right now can actually turn up, so they are at the top.
 * The list is the SAME one query and the SAME subscription everything else on
 * the page uses, through `useFriends`, so this costs nothing to show.
 *
 * The database refuses an invitation to a table you are not at, to a game that
 * has already started, and to anybody who is not a friend. This screen only has
 * to draw the answer.
 */

export interface InviteFriendsProps {
  userId: string | null | undefined;
  tableId: string;
  tableCode: string;
  /** False once the game is running. An invitation to a started game is noise. */
  waiting: boolean;
}

export function InviteFriends({ userId, tableId, tableCode, waiting }: InviteFriendsProps) {
  const feed = useFriends(userId);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const friends = feed.friends.filter(friend => friend.state === 'friend');
  const ordered = [...friends].sort((a, b) => Number(isAround(b)) - Number(isAround(a)));

  const ask = async (friend: Friend) => {
    setSending(friend.userId);
    setError(null);
    try {
      await inviteFriendToTable(friend.userId, tableId);
      setSent(current => new Set(current).add(friend.userId));
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setSending(null);
    }
  };

  if (!userId) return null;

  return (
    <section className="w-full rounded-xl bg-muted/40 p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Ask a friend to this table
      </h2>

      {feed.loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Reading your friends
        </p>
      )}

      {!feed.loading && ordered.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          You have not added anybody yet. The link above works for everybody.
        </p>
      )}

      {!waiting && ordered.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          This game has started, so there is nobody to invite to it now.
        </p>
      )}

      {waiting && ordered.length > 0 && (
        <ul className="mt-2 space-y-2">
          {ordered.map(friend => {
            const already = sent.has(friend.userId) || friend.inviteCode === tableCode;
            return (
              <li
                key={friend.userId}
                className="flex items-center gap-3 rounded-lg bg-background/60 p-2.5"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isAround(friend) ? 'bg-foreground' : 'bg-muted-foreground/30'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{safeName(friend.name)}</p>
                  <p className="truncate text-xs text-muted-foreground">{aroundLine(friend)}</p>
                </div>
                <Button
                  size="sm"
                  variant={already ? 'ghost' : 'secondary'}
                  disabled={already || sending === friend.userId}
                  onClick={() => void ask(friend)}
                >
                  {sending === friend.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : already ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Asked
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Invite
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-foreground">{error}</p>}
    </section>
  );
}
