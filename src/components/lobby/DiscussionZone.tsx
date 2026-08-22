import { useCallback, useState } from 'react';
import { ArrowLeft, Loader2, Lock, MessageSquarePlus, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BOARD_BLURB,
  lobbyErrorMessage,
  postingVerdict,
  removePost as removePostCall,
  removeTopic as removeTopicCall,
  replyLine,
  replyToTopic,
  reportPost as reportPostCall,
  setTopicFlags,
  startTopic,
  blockPoster,
  waitedFor,
  type ForumPost,
  type ForumTopic,
} from '@/lib/lobby';
import { safeName, safeTitle } from '@/lib/lobby/richText';
import { ChatBox } from './ChatBox';
import { DiscussionThread } from './DiscussionThread';
import { NewTopicPanel } from './NewTopicPanel';
import { TopicList } from './TopicList';
import { useBoard, useThread } from './useDiscussion';

/**
 * The discussion zone.
 *
 * ---------------------------------------------------------------------------
 * A ROOM FIRST, AND THE TOPICS UNDER IT
 * ---------------------------------------------------------------------------
 * Owner, first: "an open chat/discussion zone like on classic forums", which
 * this was built as. Owner, having then looked at it: "conversation lobby
 * should be more like chat box".
 *
 * Both are true and they are not the same thing, so the zone is both, in that
 * order. The ROOM is the default and the top of the zone: newest at the bottom,
 * one scrolling column, type at the bottom, enter sends, messages arriving
 * without a refresh. It is where somebody says one sentence.
 *
 * The TOPICS sit under it, quieter, for the thing a room genuinely cannot do:
 * a question somebody answers on Tuesday, still there on Friday. They are not
 * deleted for the chat box and the chat box is not a tab you have to find.
 *
 * There is no second messages table underneath any of this. A room is a
 * `forum_topics` row with `kind = 'room'` and its messages are ordinary
 * `forum_posts`, so removal, blocking, reporting, the read policies and the
 * push channel are all the code that was already here.
 *
 * ---------------------------------------------------------------------------
 * ONE PAGE, TWO STATES, ONE URL
 * ---------------------------------------------------------------------------
 * The list and a conversation are the same zone at two states, and the state is
 * `?topic=` in the address bar. So back and forward work, a conversation can be
 * linked to somebody, and there is no second route to keep in step with this
 * one. The owner's rule is that back and forward work universally, and a state
 * kept in a variable breaks it silently.
 *
 * ---------------------------------------------------------------------------
 * MODERATION IS HERE, NOT IN A CONSOLE
 * ---------------------------------------------------------------------------
 * Removing a post and stopping a poster are on the post, where the person who
 * needs them is already looking. Anybody can report. An admin sees how many
 * reports a post has collected, without a second query, because the count is
 * kept on the row.
 */

export interface DiscussionZoneProps {
  signedIn: boolean;
  myUserId?: string | null;
  myName: string;
  isModerator: boolean;
  /** The table you are sitting at, offered when you start a conversation. */
  myTableCode?: string | null;
  /** Which conversation is open, from the URL. Null is the list. */
  openTopicId: number | null;
  onOpenTopic: (topicId: number | null) => void;
  /** Which chat room is open, from the URL, so a room can be linked to. */
  roomSlug: string | null;
  onOpenRoom: (slug: string) => void;
}

export function DiscussionZone({
  signedIn,
  myUserId,
  myName,
  isModerator,
  myTableCode,
  openTopicId,
  onOpenTopic,
  roomSlug,
  onOpenRoom,
}: DiscussionZoneProps) {
  /* Everybody reads. Only an account listens: the `lobby` Realtime topic is
     granted to `authenticated`, so a signed-out join is a refused connection
     per visitor for nothing. */
  const board = useBoard(true, signedIn);
  const thread = useThread({ topicId: openTopicId }, openTopicId !== null, signedIn);

  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Learned from a refusal rather than asked for up front. A pre-flight read of
   * `forum_bans` would be a query on every visit by everybody, to answer a
   * question about almost nobody.
   */
  const [blocked, setBlocked] = useState(false);

  const verdict = postingVerdict({
    signedIn,
    blocked,
    locked: thread.topic?.locked ?? false,
  });

  const complain = useCallback((caught: unknown) => {
    const message = lobbyErrorMessage(caught);
    if (message.includes('cannot post in the discussion')) setBlocked(true);
    setError(message);
  }, []);

  const onSend = async (body: string) => {
    if (openTopicId === null) return;
    setSending(true);
    setError(null);
    try {
      const post = await replyToTopic(openTopicId, body, myName, myTableCode ?? null);
      /* On screen now. The echo comes back over the channel too and is dropped
         as a duplicate. Waiting for it is what makes sending feel slow. */
      thread.remember(post);
      board.refresh();
    } catch (caught) {
      complain(caught);
    } finally {
      setSending(false);
    }
  };

  const onStart = async (value: { title: string; body: string; tableCode: string | null }) => {
    setStarting(true);
    setError(null);
    try {
      const started = await startTopic(value.title, value.body, myName, value.tableCode);
      setWriting(false);
      board.refresh();
      onOpenTopic(started.topic.id);
    } catch (caught) {
      complain(caught);
    } finally {
      setStarting(false);
    }
  };

  const onRemove = async (post: ForumPost) => {
    thread.forget(post.id);
    try {
      await removePostCall(post.id);
      board.refresh();
    } catch (caught) {
      complain(caught);
      thread.refresh();
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

  const onBlock = async (post: ForumPost) => {
    if (!post.userId) return;
    try {
      const wiped = await blockPoster(post.userId, 'blocked from the discussion', true);
      setError(
        wiped === 1
          ? `${safeName(post.name)} can no longer post, and 1 post was cleared.`
          : `${safeName(post.name)} can no longer post, and ${wiped} posts were cleared.`
      );
      thread.refresh();
      board.refresh();
    } catch (caught) {
      complain(caught);
    }
  };

  const onCloseTopic = async (topic: ForumTopic) => {
    try {
      await setTopicFlags(topic.id, { locked: !topic.locked });
      thread.refresh();
      board.refresh();
    } catch (caught) {
      complain(caught);
    }
  };

  const onPinTopic = async (topic: ForumTopic) => {
    try {
      await setTopicFlags(topic.id, { pinned: !topic.pinned });
      thread.refresh();
      board.refresh();
    } catch (caught) {
      complain(caught);
    }
  };

  const onRemoveTopic = async (topic: ForumTopic) => {
    try {
      await removeTopicCall(topic.id);
      board.refresh();
      onOpenTopic(null);
    } catch (caught) {
      complain(caught);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* A conversation                                                         */
  /* ---------------------------------------------------------------------- */

  if (openTopicId !== null) {
    const topic = thread.topic;

    return (
      <section className="w-full rounded-xl bg-muted/30 p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onOpenTopic(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          All conversations
        </Button>

        {thread.loading && !topic && (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading it
          </p>
        )}

        {thread.missing && (
          <div className="py-8">
            <h2 className="text-lg font-semibold text-foreground">That one has gone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have been taken down. The rest of the board is still there.
            </p>
          </div>
        )}

        {topic && (
          <>
            <header className="mt-4">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                {topic.pinned && <Pin className="h-4 w-4 text-muted-foreground" aria-label="Pinned" />}
                {topic.locked && <Lock className="h-4 w-4 text-muted-foreground" aria-label="Closed" />}
                {safeTitle(topic.title)}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {safeName(topic.authorName)} started this {waitedFor(topic.createdAt)} ago.{' '}
                {replyLine(topic)}.
              </p>

              {(isModerator || topic.authorId === myUserId) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {isModerator && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => void onPinTopic(topic)}>
                        {topic.pinned ? 'Unpin' : 'Pin to the top'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void onCloseTopic(topic)}>
                        {topic.locked ? 'Open it again' : 'Close it'}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void onRemoveTopic(topic)}>
                    Remove the whole thing
                  </Button>
                </div>
              )}
            </header>

            <div className="mt-4">
              <DiscussionThread
                posts={thread.posts}
                loading={thread.loading}
                sending={sending}
                error={error}
                canPost={verdict.canPost}
                whyNotPost={verdict.reason}
                myUserId={myUserId}
                isModerator={isModerator}
                placeholder="Reply"
                emptyLine="Nothing here yet."
                onSend={body => void onSend(body)}
                onRemove={post => void onRemove(post)}
                onReport={post => void onReport(post)}
                onBlock={post => void onBlock(post)}
              />
            </div>
          </>
        )}
      </section>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* The board                                                              */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="w-full space-y-4">
      {/* The room. First, because it is where people talk. */}
      <ChatBox
        signedIn={signedIn}
        myUserId={myUserId}
        myName={myName}
        isModerator={isModerator}
        myTableCode={myTableCode}
        slug={roomSlug}
        onOpenRoom={onOpenRoom}
      />

      {/* The topics. Under it, and quieter, for the thing a room cannot do. */}
      <section className="w-full rounded-xl bg-muted/30 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              Conversations that stay
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{BOARD_BLURB}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* The channel's real state, said plainly. A board that has stopped
                hearing about replies looks exactly like a quiet one. */}
            <span className="text-xs text-muted-foreground">
              {!signedIn
                ? 'Sign in to see it update as it happens'
                : board.live === 'live'
                  ? 'Updating as it happens'
                  : board.live === 'connecting'
                    ? 'Connecting'
                    : 'Reconnecting'}
            </span>

            <Button onClick={() => setWriting(true)} disabled={!signedIn || blocked}>
              <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Start a conversation
            </Button>
          </div>
        </header>

        {/* Only the fact the blurb does not already carry. The blurb says
            anybody can read this, so repeating "an account is only needed to
            post" under it is the same sentence twice. Being blocked is a
            different fact and somebody needs to be told it. */}
        {blocked && verdict.reason && (
          <p className="mt-3 text-sm text-foreground">{verdict.reason}</p>
        )}

        {error && <p className="mt-3 text-sm text-foreground">{error}</p>}

        <div className="mt-4">
          <TopicList
            topics={board.topics}
            loading={board.loading}
            signedIn={signedIn}
            onOpen={topic => onOpenTopic(topic.id)}
          />
        </div>

        <NewTopicPanel
          open={writing}
          onOpenChange={setWriting}
          posting={starting}
          error={error}
          myTableCode={myTableCode}
          onStart={value => void onStart(value)}
        />
      </section>
    </div>
  );
}
