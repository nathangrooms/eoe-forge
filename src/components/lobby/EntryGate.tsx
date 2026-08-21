import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { EntryVerdict } from '@/lib/lobby';

/**
 * The entry rule, said before anybody picks a table.
 *
 * Owner: signed in, and at least one deck loaded in. The instruction that came
 * with it matters as much as the rule: say it plainly rather than failing at
 * the table.
 *
 * So this is not an error. It is the first thing on the page when it applies,
 * it says what is missing in one sentence, and it carries the button that fixes
 * it. Somebody with no deck gets a way to build one, not a locked door.
 *
 * The same rule is enforced by a trigger on `game_participants`, so the
 * guarantee does not depend on this component being rendered. This half exists
 * for the sentence and the button.
 */
export function EntryGate({ verdict }: { verdict: EntryVerdict }) {
  if (verdict.ok) return null;

  return (
    <section className="rounded-xl bg-muted/40 p-6">
      <h2 className="text-lg font-semibold text-foreground">{verdict.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{verdict.body}</p>
      <Button asChild className="mt-4">
        <Link to={verdict.actionHref}>{verdict.actionLabel}</Link>
      </Button>
    </section>
  );
}
