import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  TABLE_TALK_BLURB,
  lobbyErrorMessage,
  postingVerdict,
  removePost as removePostCall,
  sayAtTable,
  type ForumPost,
} from '@/lib/lobby';
import { DiscussionThread } from './DiscussionThread';
import { useThread } from './useDiscussion';

/**
 * The talk at one table.
 *
 * ---------------------------------------------------------------------------
 * THE SAME THING AS THE BOARD, SCOPED DIFFERENTLY
 * ---------------------------------------------------------------------------
 * The same rows, the same read, the same `DiscussionThread`, the same renderer
 * that makes a stranger's words safe. This file is a wrapper that says which
 * conversation and who may see it, and nothing else. That is deliberate: a
 * second chat implementation is how a fix to one of them stops reaching the
 * other, and this project has already paid for that pattern elsewhere.
 *
 * The three real differences all live outside the surface:
 *
 *   who can read   `at_game_table()` in the policy, so only the people sitting
 *                  here, and nobody else, ever.
 *   where it lands the table's own Realtime topic, `game:<id>`, shared with the
 *                  seats so the page holds one connection and not two.
 *   how long       it goes when the table goes, by cascade. A conversation
 *                  about a game is not worth keeping once the game is not.
 *
 * ---------------------------------------------------------------------------
 * NOT UNTIL YOU HAVE SAT DOWN
 * ---------------------------------------------------------------------------
 * Both the read and the channel are membership checks, so asking before there
 * is a seat is a refusal rather than an empty answer. The screen says what to
 * do about it instead of showing an empty box.
 */

export interface TableTalkProps {
  tableId: string | null;
  /** True once this account holds a seat here. Everything is off until then. */
  seated: boolean;
  signedIn: boolean;
  myUserId?: string | null;
  myName: string;
  isModerator?: boolean;
}

export function TableTalk({
  tableId,
  seated,
  signedIn,
  myUserId,
  myName,
  isModerator = false,
}: TableTalkProps) {
  const enabled = Boolean(tableId) && seated;
  const thread = useThread({ tableId }, enabled);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const verdict = postingVerdict({ signedIn, blocked, atTable: true, seated });

  const complain = useCallback((caught: unknown) => {
    const message = lobbyErrorMessage(caught);
    if (message.includes('cannot post in the discussion')) setBlocked(true);
    setError(message);
  }, []);

  const onSend = async (body: string) => {
    if (!tableId) return;
    setSending(true);
    setError(null);
    try {
      const post = await sayAtTable(tableId, body, myName);
      thread.remember(post);
    } catch (caught) {
      complain(caught);
    } finally {
      setSending(false);
    }
  };

  const onRemove = async (post: ForumPost) => {
    thread.forget(post.id);
    try {
      await removePostCall(post.id);
    } catch (caught) {
      complain(caught);
      thread.refresh();
    }
  };

  return (
    <section
      className={cn(
        'flex w-full flex-col rounded-xl bg-muted/30 p-4',
        /* Only a conversation needs the height. An explanation is one line and
           a tall empty box beside it reads as something failing to load. */
        enabled && 'h-full min-h-[22rem]'
      )}
    >
      <header className="shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Talk to the table</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{TABLE_TALK_BLURB}</p>
      </header>

      {/* Not seated means the read was never made, so there is nothing to say
          about what is in here. "Nothing said yet" would be a claim this screen
          cannot support, and it would be wrong most of the time. */}
      {!enabled ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {verdict.reason ?? 'This table has no talk in it yet.'}
        </p>
      ) : (
      <div className="mt-3 min-h-0 flex-1">
        <DiscussionThread
          posts={thread.posts}
          loading={thread.loading}
          sending={sending}
          error={error}
          canPost={verdict.canPost}
          whyNotPost={verdict.reason}
          myUserId={myUserId}
          isModerator={isModerator}
          placeholder="Say something to the table"
          emptyLine="Nothing said yet. Say hello."
          dense
          stickToBottom
          onSend={body => void onSend(body)}
          onRemove={post => void onRemove(post)}
        />
      </div>
      )}
    </section>
  );
}
