import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CommanderFace } from './CommanderFace';
import {
  aroundLine,
  inviteLine,
  isAround,
  playsLine,
  safeName,
  type Friend,
} from '@/lib/lobby';

/**
 * One person, on the friends list.
 *
 * ---------------------------------------------------------------------------
 * A FRIEND IS DRAWN AS THE CARD THEY PLAY
 * ---------------------------------------------------------------------------
 * The owner's rule is card art wherever a card is referenced, never a coloured
 * dot where art is available. To a Magic player "Dave" and "Dave, who plays
 * Atraxa" are different amounts of information, and the second one is the
 * reason you would ask him for a game. So the row leads with the commander of
 * the deck they touched last, through `CommanderFace`, which is the same
 * component the lobby already draws a seat with. No second card renderer.
 *
 * A friend who shares no decks gets the placeholder that component already
 * draws, and the line under the name says why it is empty. "Does not share
 * their decks" and "No decks yet" are different sentences, in `friendsView.ts`,
 * because they are different facts about a person.
 *
 * ---------------------------------------------------------------------------
 * THREE STATES, ONE ROW
 * ---------------------------------------------------------------------------
 * Somebody who asked YOU gets Accept and No, on the row, because that is the
 * only thing on this page that is waiting on the reader. Somebody you asked
 * gets nothing to press, and says so. A friend gets a way in to everything
 * else, which is the panel on the right.
 */

export interface FriendRowProps {
  friend: Friend;
  /** Answering a request, on the row. Absent for a friend. */
  onAccept?: (friend: Friend) => void;
  onRefuse?: (friend: Friend) => void;
  /** Opening the panel with their decks, their collection and the invite. */
  onOpen?: (friend: Friend) => void;
  /** Following an invitation they sent. Absent when there is not one. */
  onJoinTable?: (code: string) => void;
  onDeclineInvite?: (friend: Friend) => void;
  busy?: boolean;
  className?: string;
}

export function FriendRow({
  friend,
  onAccept,
  onRefuse,
  onOpen,
  onJoinTable,
  onDeclineInvite,
  busy,
  className,
}: FriendRowProps) {
  const around = isAround(friend);
  const invitation = inviteLine(friend);

  const commanders = friend.commanderName
    ? [
        {
          cardId: friend.userId,
          name: friend.commanderName,
          imageUrl: friend.commanderImage ?? undefined,
        },
      ]
    : [];

  return (
    <div
      className={cn(
        'flex h-full gap-3 rounded-xl bg-card p-3 shadow-sm shadow-black/20',
        className
      )}
    >
      <div className="shrink-0">
        {/* Three different empty cards, because they are three different facts.
            Somebody who has only asked is not withholding anything and does not
            have nothing: you simply have no business seeing it yet. */}
        <CommanderFace
          commanders={commanders}
          size="sm"
          emptyLabel={
            friend.state !== 'friend'
              ? 'Not yet'
              : friend.sharesDecks
                ? 'No deck'
                : 'Private'
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          {/* Lit means around now. Unlit means anything else, and the line
              underneath says which anything else it is, so the dot never has to
              carry a meaning on its own. */}
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              around ? 'bg-foreground' : 'bg-muted-foreground/30'
            )}
          />
          <span className="truncate text-sm font-semibold text-foreground">
            {safeName(friend.name)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {aroundLine(friend)}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{playsLine(friend)}</p>

        {invitation && (
          <div className="mt-2 rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-foreground">{invitation}</p>
            <div className="mt-1.5 flex gap-2">
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => friend.inviteCode && onJoinTable?.(friend.inviteCode)}
              >
                Go to the table
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onDeclineInvite?.(friend)}
              >
                No thanks
              </Button>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {friend.state === 'they_asked' ? (
            <>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => onAccept?.(friend)}
              >
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => onRefuse?.(friend)}
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                No thanks
              </Button>
            </>
          ) : friend.state === 'friend' ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-xs"
                onClick={() => onOpen?.(friend)}
              >
                Decks and collection
              </Button>
              {friend.tableCode && (
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onJoinTable?.(friend.tableCode as string)}
                >
                  Join their table
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
