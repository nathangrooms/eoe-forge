import { Loader2, Lock, MessageSquare, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { emptyBoardLine, lastWordLine, replyLine, type ForumTopic } from '@/lib/lobby';
import { safeTitle } from '@/lib/lobby/richText';

/**
 * The board: every conversation, newest at the top.
 *
 * Classic forum shape, because that is what was asked for and because it is the
 * shape that works when you arrive late. A title you can scan, who started it,
 * how many people answered, and when somebody last spoke. Nothing here
 * disappears while you are reading it.
 *
 * Full width. A conversation list squeezed into a sidebar is a chat window, and
 * a chat window is the thing this replaced.
 *
 * The row is a button rather than a link because the board and the thread are
 * the same page at two states, and the state lives in the URL as `?topic=`, so
 * back and forward already work without a second route to keep in step.
 */

export interface TopicListProps {
  topics: ForumTopic[];
  loading: boolean;
  signedIn: boolean;
  onOpen: (topic: ForumTopic) => void;
}

export function TopicList({ topics, loading, signedIn, onOpen }: TopicListProps) {
  if (loading && topics.length === 0) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Reading the board
      </p>
    );
  }

  if (topics.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyBoardLine(signedIn)}</p>;
  }

  return (
    <ul className="w-full space-y-2">
      {topics.map(topic => (
        <li key={topic.id}>
          <button
            type="button"
            onClick={() => onOpen(topic)}
            className={cn(
              'w-full rounded-xl bg-card/70 p-4 text-left',
              'transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-base font-medium text-foreground">
                  {topic.pinned && (
                    <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" />
                  )}
                  {topic.locked && (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Closed" />
                  )}
                  <span className="truncate">{safeTitle(topic.title)}</span>
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {lastWordLine(topic)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                {topic.tableCode && (
                  <span className="rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground">
                    {topic.tableCode}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  {replyLine(topic)}
                </span>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
