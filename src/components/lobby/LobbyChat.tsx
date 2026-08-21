import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { waitedFor, type LobbyPost } from '@/lib/lobby';

/**
 * The open discussion, the way a forum does it.
 *
 * Owner: "an open chat/discussion zone like on classic forums". So it reads
 * downwards, oldest at the top, every post carries a name and how long ago it
 * was, and there is nothing clever: no reactions, no threads, no typing
 * indicator, no unread badge.
 *
 * WHAT IT IS FOR is one sentence long, and the empty state says it, because a
 * blank box with a cursor in it does not tell a new player that this is where
 * you ask for a fourth.
 *
 * A post that names a table carries the way in. Somebody saying "room for one
 * more" and somebody else having to go and find which table that was is the
 * kind of small friction that stops a lobby working.
 *
 * Posts are kept for a day and then swept, which is said on screen rather than
 * being a surprise when yesterday's conversation is gone.
 */

export interface LobbyChatProps {
  posts: LobbyPost[];
  loading: boolean;
  sending: boolean;
  error?: string | null;
  /** Off while the entry rule is unmet or the account is signed out. */
  canPost: boolean;
  myUserId?: string | null;
  /** Attached to the next post, so "room for one more" carries a link. */
  attachedCode?: string | null;
  onSend: (body: string) => void;
  onDelete: (id: number) => void;
  onOpenCode: (code: string) => void;
}

export function LobbyChat({
  posts,
  loading,
  sending,
  error,
  canPost,
  myUserId,
  attachedCode,
  onSend,
  onDelete,
  onOpenCode,
}: LobbyChatProps) {
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);

  /*
   * Follow the conversation down as it grows.
   *
   * `block: 'nearest'` so the browser scrolls the message list and not the
   * whole page: a lobby that yanks the table list off screen every time
   * somebody says hello is worse than one that does not scroll at all.
   */
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [posts.length]);

  const submit = () => {
    const body = draft.trim();
    if (!body || sending) return;
    onSend(body);
    setDraft('');
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl bg-muted/30">
      <header className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-foreground">Lobby talk</h2>
        <p className="text-xs text-muted-foreground">
          Ask for a fourth, say what you feel like playing. Messages clear after a day.
        </p>
      </header>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
        {loading && posts.length === 0 && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Catching up
          </p>
        )}

        {!loading && posts.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">
            Nothing said yet. Start it off.
          </p>
        )}

        {posts.map(post => (
          <article key={post.id} className="rounded-lg bg-card/70 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">{post.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {waitedFor(post.createdAt)}
              </span>
              {post.userId === myUserId && (
                <button
                  type="button"
                  onClick={() => onDelete(post.id)}
                  className="ml-auto text-muted-foreground transition-opacity duration-150 hover:opacity-70"
                  aria-label="Delete this message"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
              {post.body}
            </p>

            {post.tableCode && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => onOpenCode(post.tableCode as string)}
              >
                Open table {post.tableCode}
              </Button>
            )}
          </article>
        ))}

        <div ref={bottom} />
      </div>

      <footer className="p-4">
        {error && <p className="mb-2 text-xs text-foreground">{error}</p>}

        {attachedCode && (
          <p className="mb-2 text-xs text-muted-foreground">
            Your table {attachedCode} will be attached so people can open it.
          </p>
        )}

        <Textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={canPost ? 'Say something' : 'Sign in with a deck to join in'}
          disabled={!canPost || sending}
          maxLength={500}
          rows={2}
          className={cn('resize-none bg-background/60')}
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Enter sends, Shift and Enter makes a new line
          </span>
          <Button size="sm" disabled={!canPost || sending || draft.trim().length === 0} onClick={submit}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="ml-2">Send</span>
          </Button>
        </div>
      </footer>
    </section>
  );
}
