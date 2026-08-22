import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { BODY_MAX, TITLE_MAX, whyNotStartTopic } from '@/lib/lobby';

/**
 * Starting a conversation, without leaving the board.
 *
 * A right-hand slide-over, which is the owner's approved pattern for an action
 * taken in context: the board stays on screen behind it and keeps its scroll
 * position. Never a centred dialog.
 *
 * Two fields and one tick box, because a form is how a board ends up with
 * nothing on it. The tick box attaches the table you are already sitting at, so
 * "room for one more" carries the way in instead of asking somebody to go and
 * find which table that was.
 *
 * The draft is checked here before it costs a round trip, in the same words the
 * database would have used, so the two never contradict each other.
 */

export interface NewTopicPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posting: boolean;
  error?: string | null;
  /** The table you are sitting at, if any, offered as something to attach. */
  myTableCode?: string | null;
  onStart: (value: { title: string; body: string; tableCode: string | null }) => void;
}

export function NewTopicPanel({
  open,
  onOpenChange,
  posting,
  error,
  myTableCode,
  onStart,
}: NewTopicPanelProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(true);

  /* A cancelled draft does not come back on the next open. Somebody who closed
     the panel had changed their mind, and half a sentence from ten minutes ago
     is a thing to delete rather than a thing to continue. */
  useEffect(() => {
    if (!open) {
      setTitle('');
      setBody('');
      setAttach(true);
    }
  }, [open]);

  const problem = whyNotStartTopic(title, body);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Start a conversation</SheetTitle>

        <div className="space-y-6 pt-2">
          <header>
            <h2 className="text-lg font-semibold text-foreground">Start a conversation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Anybody can read this, including people who are not signed in.
            </p>
          </header>

          <div className="space-y-2">
            <label
              htmlFor="topic-title"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              What is it about
            </label>
            <Input
              id="topic-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Anyone up for a four player game tonight"
              disabled={posting}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="topic-body"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Say more
            </label>
            <Textarea
              id="topic-body"
              value={body}
              onChange={event => setBody(event.target.value)}
              maxLength={BODY_MAX}
              rows={8}
              placeholder="Around after 8. Playing something silly, nothing cutthroat."
              disabled={posting}
              className="resize-none"
            />
          </div>

          {myTableCode && (
            <label className="flex items-start gap-3 rounded-lg bg-muted/30 p-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={attach}
                onChange={event => setAttach(event.target.checked)}
                disabled={posting}
                className="mt-0.5"
              />
              <span>
                Attach your table {myTableCode}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  People reading this get a way straight in.
                </span>
              </span>
            </label>
          )}

          {(error || problem) && (
            <p className="text-sm text-foreground">{error ?? problem}</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={posting || problem !== null}
              onClick={() =>
                onStart({
                  title: title.trim(),
                  body: body.trim(),
                  tableCode: attach ? (myTableCode ?? null) : null,
                })
              }
            >
              {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Post it
            </Button>

            <Button variant="ghost" size="lg" disabled={posting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
