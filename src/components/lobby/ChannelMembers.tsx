import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useFriends } from './useFriends';
import {
  addToRoom,
  channelReach,
  lobbyErrorMessage,
  removeFromRoom,
  roomMembers,
  safeName,
  safeTitle,
  type ChatRoom,
  type ChatRoomMember,
} from '@/lib/lobby';

/**
 * Who is in a channel, and who gets added.
 *
 * ---------------------------------------------------------------------------
 * ONLY FRIENDS GET ADDED
 * ---------------------------------------------------------------------------
 * The list of people you can add is your friends list, because the database
 * refuses anybody else. A private channel that could be filled with strangers
 * is a way to put words in front of somebody who never agreed to hear them, and
 * a friend request is the agreement.
 *
 * The friends list here is the SAME one query and the SAME subscription the
 * rest of the page uses, through `useFriends`, so opening this costs nothing.
 *
 * ---------------------------------------------------------------------------
 * MODERATION, WITHOUT A CONSOLE
 * ---------------------------------------------------------------------------
 * Whoever made the channel can take somebody out of it, and can remove any
 * message in it from the message itself. Both are where the person who needs
 * them is already looking. The person who made the channel cannot be removed
 * from it, and the database says so rather than this screen hiding the button.
 */

export interface ChannelMembersProps {
  room: ChatRoom | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myUserId?: string | null;
  isModerator: boolean;
  /** Somebody left, so the channel list may need re-reading. */
  onChanged: () => void;
}

export function ChannelMembers({
  room,
  open,
  onOpenChange,
  myUserId,
  isModerator,
  onChanged,
}: ChannelMembersProps) {
  const [members, setMembers] = useState<ChatRoomMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const friends = useFriends(open ? myUserId : null);
  const topicId = room?.id ?? null;
  const iRunIt = Boolean(room && (room.authorId === myUserId || isModerator));

  const read = useCallback(() => {
    if (!topicId) return;
    setLoading(true);
    roomMembers(topicId)
      .then(setMembers)
      .catch(caught => setError(lobbyErrorMessage(caught)))
      .finally(() => setLoading(false));
  }, [topicId]);

  useEffect(() => {
    if (!open || !topicId) return;
    setError(null);
    read();
  }, [open, topicId, read]);

  const add = async (userId: string) => {
    if (!topicId) return;
    setBusy(userId);
    setError(null);
    try {
      await addToRoom(topicId, userId);
      read();
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const drop = async (userId: string) => {
    if (!topicId) return;
    setBusy(userId);
    setError(null);
    try {
      await removeFromRoom(topicId, userId);
      read();
      onChanged();
      if (userId === myUserId) onOpenChange(false);
    } catch (caught) {
      setError(lobbyErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const inChannel = new Set(members.map(member => member.userId));
  const addable = friends.friends.filter(
    friend => friend.state === 'friend' && !inChannel.has(friend.userId)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="sr-only">Who is in this channel</SheetTitle>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {room ? safeTitle(room.title) : 'Channel'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {channelReach(room?.private ?? false)}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              In the channel
            </h3>

            {loading && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Reading
              </p>
            )}

            <ul className="mt-2 space-y-2">
              {members.map(member => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {safeName(member.name)}
                    {member.isOwner && (
                      <span className="ml-2 text-xs text-muted-foreground">made it</span>
                    )}
                  </span>
                  {!member.isOwner && (iRunIt || member.userId === myUserId) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === member.userId}
                      onClick={() => void drop(member.userId)}
                    >
                      {member.userId === myUserId ? 'Leave' : 'Take out'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {iRunIt && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Add a friend
              </h3>

              {addable.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {friends.friends.length === 0
                    ? 'You can only add friends, and you have not added anybody yet.'
                    : 'Everybody you know is already in here.'}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {addable.map(friend => (
                    <li
                      key={friend.userId}
                      className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {safeName(friend.name)}
                      </span>
                      <Button
                        size="sm"
                        disabled={busy === friend.userId}
                        onClick={() => void add(friend.userId)}
                      >
                        <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-sm text-foreground">{error}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
