import { useState } from 'react';
import { Check, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CommanderFace } from '@/components/lobby/CommanderFace';
import { FindPlayers } from '@/components/lobby/FindPlayers';
import { useFriends } from '@/components/lobby/useFriends';
import {
  answerFriendRequest,
  aroundLine,
  emptyFriendsLine,
  groupFriends,
  lobbyErrorMessage,
  playsLine,
  safeName,
  type Friend,
} from '@/lib/lobby';

/**
 * Who is around, on the first screen of the play section.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS HERE
 * ---------------------------------------------------------------------------
 * Owner: *"dont see any friends list in the play a game section"*. This is that
 * screen. It is not the whole friends list, because four full bleed mode doors
 * are what somebody came to this page to press and a management panel above
 * them would bury the thing the page is for.
 *
 * So it is the two facts that change what you do next: somebody is waiting for
 * an answer from you, and somebody you know is on right now. Both are
 * actionable here, on this strip, without going anywhere. Everything else about
 * friends lives in the lobby, one press away, and it is the same components.
 *
 * ---------------------------------------------------------------------------
 * THE SAME ONE QUERY
 * ---------------------------------------------------------------------------
 * `useFriends` shares its React Query key and its Realtime channel with the
 * lobby's panel, so walking from here to there re-reads nothing and holds one
 * connection either way.
 *
 * ---------------------------------------------------------------------------
 * A FRIEND IS THE CARD THEY PLAY
 * ---------------------------------------------------------------------------
 * Drawn through `CommanderFace`, which is the same component the lobby draws a
 * seat with, so there is no second way to put a commander on screen.
 */

export interface FriendsRailProps {
  userId: string | null | undefined;
  signedIn: boolean;
  /** Going to the lobby, where the whole friends list and the chat live. */
  onOpenLobby: () => void;
  onOpenTable: (code: string) => void;
  className?: string;
}

export function FriendsRail({
  userId,
  signedIn,
  onOpenLobby,
  onOpenTable,
  className,
}: FriendsRailProps) {
  const feed = useFriends(userId);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = groupFriends(feed.friends);
  const invitations = feed.friends.filter(friend => friend.inviteId !== null);

  const answer = async (friend: Friend, accept: boolean) => {
    setBusy(friend.userId);
    setError(null);
    try {
      await answerFriendRequest(friend.userId, accept);
      feed.refresh();
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={cn('w-full rounded-xl bg-muted/30 p-4 sm:p-5', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Friends</h2>
          {signedIn && groups.around.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {groups.around.length === 1
                ? '1 around now'
                : `${groups.around.length} around now`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {signedIn && (
            <Button variant="ghost" size="sm" onClick={() => setFinding(true)}>
              <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Find somebody
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onOpenLobby}>
            Friends and chat
          </Button>
        </div>
      </header>

      {!signedIn && (
        <p className="mt-3 text-sm text-muted-foreground">{emptyFriendsLine(false)}</p>
      )}

      {signedIn && error && <p className="mt-3 text-sm text-foreground">{error}</p>}

      {/* Waiting on you. The only thing on this page that is. */}
      {groups.waiting.map(friend => (
        <div
          key={friend.userId}
          className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-card p-3"
        >
          <span className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-medium">{safeName(friend.name)}</span> wants to be friends.
          </span>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy === friend.userId}
            onClick={() => void answer(friend, true)}
          >
            <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy === friend.userId}
            onClick={() => void answer(friend, false)}
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            No thanks
          </Button>
        </div>
      ))}

      {/* A table somebody asked you to. The way in is the lobby's own code. */}
      {invitations.map(friend => (
        <div
          key={`invite-${friend.userId}`}
          className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-card p-3"
        >
          <span className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-medium">{safeName(friend.name)}</span> asked you to join
            table {friend.inviteCode}.
          </span>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => friend.inviteCode && onOpenTable(friend.inviteCode)}
          >
            Go to the table
          </Button>
        </div>
      ))}

      {signedIn && groups.around.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {groups.around.map(friend => (
            <li
              key={friend.userId}
              className="flex min-w-0 max-w-xs flex-1 items-center gap-3 rounded-lg bg-card p-2"
            >
              <CommanderFace
                commanders={
                  friend.commanderName
                    ? [
                        {
                          cardId: friend.userId,
                          name: friend.commanderName,
                          imageUrl: friend.commanderImage ?? undefined,
                        },
                      ]
                    : []
                }
                size="xs"
                emptyLabel=""
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {safeName(friend.name)}
                </p>
                <p className="truncate text-xs text-muted-foreground">{aroundLine(friend)}</p>
                <p className="truncate text-xs text-muted-foreground">{playsLine(friend)}</p>
              </div>
              {friend.tableCode && (
                <Button
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => onOpenTable(friend.tableCode as string)}
                >
                  Join
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {signedIn &&
        !feed.loading &&
        feed.friends.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">{emptyFriendsLine(true)}</p>
        )}

      {signedIn &&
        !feed.loading &&
        feed.friends.length > 0 &&
        groups.around.length === 0 &&
        groups.waiting.length === 0 &&
        invitations.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Nobody is around right now. Open a table anyway and send them the link.
          </p>
        )}

      <FindPlayers open={finding} onOpenChange={setFinding} onChanged={feed.refresh} />
    </section>
  );
}
