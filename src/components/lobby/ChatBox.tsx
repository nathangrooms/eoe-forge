/**
 * The chat box.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE OWNER ASKED FOR, ITEM BY ITEM
 * ---------------------------------------------------------------------------
 * *"conversation lobby should be more like chat box"*. So:
 *
 *   newest at the bottom     the column is oldest first and scrolled to the end
 *   one scrolling column     one list, no thread inside a thread
 *   type at the bottom       the composer is the last thing on the page
 *   enter sends              shift and enter is a new line, as everywhere else
 *   messages arrive live     pushed on the lobby channel, appended, no re-read
 *   no ceremony              saying one sentence takes no title and no dialog
 *
 * The topics did not die for it. They earn their place for the things a room
 * cannot do — a question somebody answers on Tuesday — and they sit beside this
 * as a second view rather than in front of it. The default is the room.
 *
 * ---------------------------------------------------------------------------
 * SOMEBODY ELSE'S WORDS, ON YOUR SCREEN
 * ---------------------------------------------------------------------------
 * Every message goes through `PostBody`, which turns a string into React
 * children and never into markup. There is no `dangerouslySetInnerHTML` in this
 * file, in `PostBody`, or anywhere in the path between them, and `richText.ts`
 * explains why that is kept by SHAPE rather than by care. This is the one
 * surface in the product where a stranger chooses the input.
 *
 * ---------------------------------------------------------------------------
 * THE SCROLL DOES NOT YANK
 * ---------------------------------------------------------------------------
 * A chat that always jumps to the bottom drags you off the message you are
 * reading every time somebody types. So it follows the end only while you are
 * ALREADY at the end, and otherwise leaves you where you are and says how many
 * you have not read, with one press to catch up.
 *
 * ---------------------------------------------------------------------------
 * THE RATE LIMIT IS NOT IN HERE
 * ---------------------------------------------------------------------------
 * It is in `forum_write_guard`, in the database. This file has no counter and
 * no disabled-until timer, because a disabled button is not a limit, it is a
 * hint to the one client that happens to be running our JavaScript. What this
 * file does is repeat the refusal in the words the database used.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, Lock, Plus, SendHorizontal, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  blockPoster,
  lobbyErrorMessage,
  postingVerdict,
  removePost as removePostCall,
  reportPost as reportPostCall,
  sayInRoom,
  waitedFor,
  type ChatRoom,
  type ForumPost,
} from '@/lib/lobby';
import { safeName, safeTitle } from '@/lib/lobby/richText';
import { ChannelMembers } from './ChannelMembers';
import { NewChannelPanel } from './NewChannelPanel';
import { PostBody } from './PostBody';
import { useChatRoom, useRooms } from './useChatRoom';

/** Two messages from one person inside this are drawn as one run. */
const RUN_MS = 4 * 60 * 1000;

/** How close to the end still counts as being at the end, in pixels. */
const AT_END = 48;

function clockOf(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface ChatBoxProps {
  signedIn: boolean;
  myUserId?: string | null;
  myName: string;
  isModerator: boolean;
  /** The table you are sitting at. A message can carry the way in to it. */
  myTableCode?: string | null;
  /** Which room is open, from the URL, so a room can be linked to somebody. */
  slug: string | null;
  onOpenRoom: (slug: string) => void;
}

export function ChatBox({
  signedIn,
  myUserId,
  myName,
  isModerator,
  myTableCode,
  slug,
  onOpenRoom,
}: ChatBoxProps) {
  const { rooms, loading: loadingRooms, refresh: refreshRooms } = useRooms(true);

  /* The room in the URL, or the first one there is. `rooms[0]` is `general`,
     which is the room the database made first. */
  const openSlug = slug ?? rooms[0]?.slug ?? null;
  const feed = useChatRoom(openSlug, signedIn);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [making, setMaking] = useState(false);
  const [showingMembers, setShowingMembers] = useState(false);

  /* Who is in here is worth a control only where membership is a real thing:
     a private channel, or one you made and can take somebody out of. An open
     channel has no membership to look at, so the button is not drawn. */
  const membershipMatters = Boolean(
    feed.room && (feed.room.private || feed.room.authorId === myUserId || isModerator)
  );

  const verdict = postingVerdict({
    signedIn,
    blocked,
    locked: feed.room?.locked ?? false,
  });

  /* ---------------------------------------------------------------------- */
  /* Following the end                                                      */
  /* ---------------------------------------------------------------------- */

  const columnRef = useRef<HTMLDivElement | null>(null);
  const [following, setFollowing] = useState(true);
  const [unread, setUnread] = useState(0);
  const drawn = useRef(0);

  const toEnd = useCallback((smooth: boolean) => {
    const column = columnRef.current;
    if (!column) return;
    column.scrollTo({ top: column.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = useCallback(() => {
    const column = columnRef.current;
    if (!column) return;
    const atEnd = column.scrollHeight - column.scrollTop - column.clientHeight <= AT_END;
    setFollowing(atEnd);
    if (atEnd) setUnread(0);
  }, []);

  /* Layout effect rather than effect: the jump happens in the same frame the
     message is painted, so the column never shows itself scrolled to the wrong
     place first. This does not animate anything and moves no layout. */
  useLayoutEffect(() => {
    const arrived = feed.posts.length - drawn.current;
    drawn.current = feed.posts.length;
    if (arrived <= 0) return;
    if (following) toEnd(drawn.current > arrived);
    else setUnread(count => count + arrived);
  }, [feed.posts.length, following, toEnd]);

  /* A new room starts at its end, always. */
  useEffect(() => {
    drawn.current = 0;
    setFollowing(true);
    setUnread(0);
  }, [openSlug]);

  /* ---------------------------------------------------------------------- */
  /* Saying something                                                       */
  /* ---------------------------------------------------------------------- */

  const complain = useCallback((caught: unknown) => {
    const message = lobbyErrorMessage(caught);
    if (message.includes('cannot post in the discussion')) setBlocked(true);
    setError(message);
  }, []);

  const send = async () => {
    const body = draft.trim();
    if (!body || !openSlug || sending) return;
    setSending(true);
    setError(null);
    try {
      const post = await sayInRoom(openSlug, body, myName, myTableCode ?? null);
      setDraft('');
      /* On screen now. The echo comes back over the channel and is dropped as a
         duplicate. Waiting for it is what makes sending feel slow. */
      setFollowing(true);
      feed.remember(post);
    } catch (caught) {
      complain(caught);
    } finally {
      setSending(false);
    }
  };

  const onRemove = async (post: ForumPost) => {
    feed.forget(post.id);
    try {
      await removePostCall(post.id);
    } catch (caught) {
      complain(caught);
      feed.refresh();
    }
  };

  const onReport = async (post: ForumPost) => {
    try {
      await reportPostCall(post.id);
      setError('Thanks. That has been flagged for the owner.');
    } catch (caught) {
      complain(caught);
    }
  };

  /*
   * Removing a POSTER, not just a post.
   *
   * The owner needs to be able to do both and neither needs a console. Removing
   * one message is on the message; stopping the account is next to it, because
   * a room is where somebody is actually being a problem and sending the
   * moderator to another screen to deal with it means it does not get dealt
   * with. It clears what they wrote on the board at the same time, and reports
   * how many, so the person doing it is told what happened rather than having
   * to go and look.
   */
  const onBlock = async (post: ForumPost) => {
    if (!post.userId) return;
    try {
      const wiped = await blockPoster(post.userId, 'blocked from the discussion', true);
      setError(
        wiped === 1
          ? `${safeName(post.name)} can no longer post, and 1 message was cleared.`
          : `${safeName(post.name)} can no longer post, and ${wiped} messages were cleared.`
      );
      feed.refresh();
    } catch (caught) {
      complain(caught);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Drawing it                                                             */
  /* ---------------------------------------------------------------------- */

  return (
    <section className="flex w-full flex-col overflow-hidden rounded-xl bg-muted/30">
      {/* The channels. A row of chips, so the list of places is one glance and
          not a menu you have to open. */}
      <header className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
        {loadingRooms && rooms.length === 0 ? (
          <span className="text-sm text-muted-foreground">Finding the rooms</span>
        ) : (
          rooms.map(room => {
            const active = room.slug === openSlug;
            return (
              <button
                key={room.slug}
                type="button"
                onClick={() => onOpenRoom(room.slug)}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-foreground font-medium text-background'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {/* A lock on the chip, so nobody has to remember which of their
                    channels the whole world can read. */}
                {room.private && <Lock className="h-3 w-3" aria-label="Private" />}
                {safeTitle(room.title)}
              </button>
            );
          })
        )}

        {signedIn && !blocked && (
          <button
            type="button"
            onClick={() => setMaking(true)}
            className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New channel
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {signedIn && membershipMatters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowingMembers(true)}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Who is in here
            </Button>
          )}

          <span className="text-xs text-muted-foreground">
            {!signedIn
              ? 'Sign in to see it update as it happens'
              : feed.live === 'live'
                ? 'Updating as it happens'
                : feed.live === 'connecting'
                  ? 'Connecting'
                  : 'Reconnecting'}
          </span>
        </div>
      </header>

      {/* The column. Oldest at the top, newest at the bottom, and this is the
          only thing on the page that scrolls on its own. */}
      <div className="relative mt-3 min-h-0 flex-1">
        <div
          ref={columnRef}
          onScroll={onScroll}
          className="h-[26rem] overflow-y-auto px-4 pb-2 sm:px-5 lg:h-[32rem]"
        >
          {feed.hasEarlier && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={feed.loadEarlier}
                disabled={feed.loadingEarlier}
              >
                {feed.loadingEarlier ? 'Reading' : 'Earlier messages'}
              </Button>
            </div>
          )}

          {feed.loading && feed.posts.length === 0 && (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Reading the room
            </p>
          )}

          {!feed.loading && feed.posts.length === 0 && (
            <div className="py-10">
              <p className="text-sm text-foreground">Nothing said in here yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {signedIn
                  ? 'Say hello, or ask if anybody wants a game.'
                  : 'Sign in to be the first to say something.'}
              </p>
            </div>
          )}

          <ol className="space-y-1">
            {feed.posts.map((post, index) => {
              const before = feed.posts[index - 1];
              const sameRun =
                before !== undefined &&
                before.userId === post.userId &&
                before.name === post.name &&
                new Date(post.createdAt).getTime() - new Date(before.createdAt).getTime() < RUN_MS;

              const mine = Boolean(myUserId) && post.userId === myUserId;

              return (
                <li key={post.id} className={cn('group px-1', sameRun ? 'pt-0.5' : 'pt-3')}>
                  {!sameRun && (
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          mine ? 'text-foreground' : 'text-foreground/90'
                        )}
                      >
                        {safeName(post.name)}
                      </span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {clockOf(post.createdAt)}
                      </span>
                      <span className="text-[0.7rem] text-muted-foreground/70">
                        {waitedFor(post.createdAt)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <PostBody body={post.body} />
                    </div>

                    {/* Moderation on the message, where the person who needs it
                        is already looking. Quiet until the row is hovered, so a
                        conversation is not a row of buttons. */}
                    {signedIn && !post.removed && (
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                        {(mine || isModerator) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[0.7rem]"
                            onClick={() => void onRemove(post)}
                          >
                            Remove
                          </Button>
                        )}
                        {!mine && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[0.7rem]"
                            onClick={() => void onReport(post)}
                          >
                            Report
                          </Button>
                        )}
                        {!mine && isModerator && post.userId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[0.7rem]"
                            onClick={() => void onBlock(post)}
                          >
                            Stop them posting
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Scrolled up and things arrived. Said, rather than silently applied. */}
        {unread > 0 && (
          <button
            type="button"
            onClick={() => {
              setFollowing(true);
              setUnread(0);
              toEnd(true);
            }}
            className="motion-press absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg shadow-black/30"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {unread === 1 ? '1 new message' : `${unread} new messages`}
          </button>
        )}
      </div>

      {/* Type at the bottom. */}
      <div className="px-4 pb-4 pt-2 sm:px-5">
        {error && <p className="mb-2 text-sm text-foreground">{error}</p>}

        {verdict.canPost ? (
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={
                feed.room ? `Message ${safeTitle(feed.room.title)}` : 'Say something'
              }
              aria-label={
                feed.room ? `Message ${safeTitle(feed.room.title)}` : 'Say something'
              }
              className="max-h-32 min-h-[2.75rem] resize-none bg-card"
            />
            <Button
              size="lg"
              onClick={() => void send()}
              disabled={sending || draft.trim().length === 0}
              aria-label="Send"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{verdict.reason}</p>
        )}

        {verdict.canPost && (
          <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
            Enter sends. Shift and enter starts a new line.
            {feed.room?.private ? ' Only people in this channel can read it.' : ''}
          </p>
        )}
      </div>

      <NewChannelPanel
        open={making}
        onOpenChange={setMaking}
        onMade={room => {
          refreshRooms();
          onOpenRoom(room.slug);
        }}
      />

      <ChannelMembers
        room={feed.room}
        open={showingMembers}
        onOpenChange={setShowingMembers}
        myUserId={myUserId}
        isModerator={isModerator}
        onChanged={refreshRooms}
      />
    </section>
  );
}
