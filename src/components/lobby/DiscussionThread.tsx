import { useEffect, useRef, useState } from 'react';
import { Flag, Loader2, Send, ShieldOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { waitedFor, type ForumPost } from '@/lib/lobby';
import { safeName } from '@/lib/lobby/richText';
import { PostBody } from './PostBody';

/**
 * A conversation, and the box you say something in.
 *
 * ---------------------------------------------------------------------------
 * ONE OF THESE, USED IN BOTH PLACES
 * ---------------------------------------------------------------------------
 * The open board and a table's own talk are the same thing at two scopes, so
 * they are the same component. A fix to how a post reads, how removal looks or
 * how the composer behaves lands in both without being carried across.
 *
 * The two of them differ in exactly two ways and both are props:
 *
 *   `dense`         a table's talk sits in a column beside the seats, so it is
 *                   drawn tighter. The board has the width of the page.
 *   `emptyLine`     "nothing said yet" is not the same sentence in a room you
 *                   just sat down in as it is on a board nobody has posted to.
 *
 * Everything else, including who may remove what, is the same in both.
 *
 * ---------------------------------------------------------------------------
 * REMOVED POSTS KEEP THEIR PLACE
 * ---------------------------------------------------------------------------
 * A post that has been taken down leaves a line saying so. The words are gone
 * from the database, not hidden, but the row stays because the reply written
 * underneath it still refers to it, and a conversation with holes cut out of it
 * reads as broken rather than moderated.
 *
 * ---------------------------------------------------------------------------
 * READING IS OPEN, POSTING IS NOT
 * ---------------------------------------------------------------------------
 * Somebody with no account gets the whole conversation and a line telling them
 * what signing in would let them do. The composer is not hidden from them,
 * because a box that is not there does not explain itself.
 */

export interface DiscussionThreadProps {
  posts: ForumPost[];
  loading: boolean;
  sending: boolean;
  error?: string | null;

  /** Off while signed out, blocked, deckless, or the conversation is closed. */
  canPost: boolean;
  /** Said under the box when `canPost` is false. Always says what would fix it. */
  whyNotPost?: string | null;

  myUserId?: string | null;
  /** Turns on Remove on anybody's post and the control that stops a poster. */
  isModerator?: boolean;

  placeholder?: string;
  emptyLine?: string;
  /** Tighter spacing for the column beside a table's seats. */
  dense?: boolean;
  /** Follow the conversation down as it grows. On for a chat, off for a thread. */
  stickToBottom?: boolean;

  onSend: (body: string) => void;
  onRemove: (post: ForumPost) => void;
  onReport?: (post: ForumPost) => void;
  onBlock?: (post: ForumPost) => void;
}

/** The database refuses anything longer. Said here so the box agrees with it. */
const MAX_BODY = 2000;

export function DiscussionThread({
  posts,
  loading,
  sending,
  error,
  canPost,
  whyNotPost,
  myUserId,
  isModerator = false,
  placeholder = 'Say something',
  emptyLine = 'Nothing said yet. Start it off.',
  dense = false,
  stickToBottom = false,
  onSend,
  onRemove,
  onReport,
  onBlock,
}: DiscussionThreadProps) {
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  /*
   * `block: 'nearest'` so the browser scrolls the message list and not the
   * whole page. A lobby that yanks the table list off screen every time
   * somebody says hello is worse than one that does not scroll at all.
   */
  useEffect(() => {
    if (stickToBottom) bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [posts.length, stickToBottom]);

  const submit = () => {
    const body = draft.trim();
    if (!body || sending || !canPost) return;
    onSend(body);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          dense ? 'space-y-2 pr-1' : 'space-y-3'
        )}
      >
        {loading && posts.length === 0 && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Catching up
          </p>
        )}

        {!loading && posts.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">{emptyLine}</p>
        )}

        {posts.map(post => {
          const mine = Boolean(myUserId) && post.userId === myUserId;
          const canRemove = !post.removed && (mine || isModerator);
          const canReport = Boolean(onReport) && !post.removed && !mine && Boolean(myUserId);
          const canBlock = Boolean(onBlock) && isModerator && !mine && Boolean(post.userId);

          return (
            <article
              key={post.id}
              className={cn('rounded-lg bg-card/70', dense ? 'p-2.5' : 'p-4')}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-foreground">
                  {safeName(post.name)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {waitedFor(post.createdAt)}
                </span>

                {isModerator && post.reportCount > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {post.reportCount === 1 ? '1 report' : `${post.reportCount} reports`}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-1">
                  {canReport && (
                    <button
                      type="button"
                      onClick={() => onReport?.(post)}
                      className="rounded p-1 text-muted-foreground transition-opacity duration-150 hover:opacity-70"
                      aria-label={`Report the message from ${safeName(post.name)}`}
                      title="Report this"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {canBlock && (
                    <button
                      type="button"
                      onClick={() => onBlock?.(post)}
                      className="rounded p-1 text-muted-foreground transition-opacity duration-150 hover:opacity-70"
                      aria-label={`Stop ${safeName(post.name)} posting`}
                      title="Stop this person posting"
                    >
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {/* Confirmation happens in place. The control swaps to Remove
                      and Keep rather than opening a dialog over the page. */}
                  {canRemove &&
                    (confirming === post.id ? (
                      <span className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setConfirming(null);
                            onRemove(post);
                          }}
                        >
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(post.id)}
                        className="rounded p-1 text-muted-foreground transition-opacity duration-150 hover:opacity-70"
                        aria-label={mine ? 'Remove your message' : `Remove the message from ${safeName(post.name)}`}
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ))}
                </div>
              </div>

              <div className="mt-1.5">
                <PostBody body={post.removed ? null : post.body} />
              </div>
            </article>
          );
        })}

        <div ref={bottom} />
      </div>

      <div className={cn('shrink-0', dense ? 'pt-2' : 'pt-4')}>
        {error && <p className="mb-2 text-xs text-foreground">{error}</p>}

        <Textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={canPost ? placeholder : 'Reading is open to everybody, posting needs an account'}
          disabled={!canPost || sending}
          maxLength={MAX_BODY}
          rows={dense ? 2 : 3}
          className="resize-none bg-background/60"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {canPost
              ? 'Enter sends, Shift and Enter makes a new line'
              : (whyNotPost ?? 'Sign in to join in')}
          </span>

          <Button
            size="sm"
            disabled={!canPost || sending || draft.trim().length === 0}
            onClick={submit}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="ml-2">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
