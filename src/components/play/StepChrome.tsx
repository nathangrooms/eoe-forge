/**
 * The furniture every step of the play flow shares.
 *
 * A step label and a big title, the choices made so far, and back bottom left
 * with the next step bottom right. Four modes look like one product because
 * they walk the same three screens wearing the same three pieces, not because
 * anybody remembered to copy a header.
 *
 * No borders anywhere in here. Steps are separated by surface and spacing, and
 * the trail is a row of raised chips rather than a ruled line.
 */

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UNCHOSEN, type Crumb, type PlayStepId } from './playFlow';

/**
 * The page title for a step.
 *
 * Handed to `StandardPageLayout`'s `title`, which takes a node, so the start
 * control still sits in that layout's own action slot beside it. That placement
 * was fixed once already and this must not walk it back.
 */
export function StepTitle({ label, title }: { label: string; title: string }) {
  return (
    <span className="block">
      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block text-2xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
        {title}
      </span>
    </span>
  );
}

/**
 * The choices so far.
 *
 * All three crumbs are always drawn, including the ones not made yet, so the
 * row does not jump about as the reader walks forward. A crumb whose step has
 * been passed is a button back to it.
 */
export function ChoiceTrail({
  crumbs,
  current,
  onJump,
}: {
  crumbs: Crumb[];
  current: PlayStepId;
  onJump: (step: PlayStepId) => void;
}) {
  return (
    <nav aria-label="Choices so far" className="flex w-full flex-wrap items-center gap-2">
      {crumbs.map(crumb => {
        const active = crumb.step === current;
        const reachable = crumb.value !== null && !active;

        const body = (
          <>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {crumb.label}
            </span>
            <span
              className={cn(
                'truncate text-sm',
                crumb.value ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {crumb.value ?? UNCHOSEN}
            </span>
          </>
        );

        const shell = cn(
          'flex min-w-0 max-w-[18rem] items-center gap-2 rounded-lg px-3 py-1.5 transition-colors',
          active ? 'bg-muted' : 'bg-muted/30'
        );

        return reachable ? (
          <button
            key={crumb.label}
            type="button"
            onClick={() => onJump(crumb.step)}
            className={cn(shell, 'hover:bg-muted/60')}
          >
            {body}
          </button>
        ) : (
          <span key={crumb.label} className={shell} aria-current={active ? 'step' : undefined}>
            {body}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Back bottom left, forward bottom right, exactly as the reference has it.
 *
 * `note` is the sentence between them, which is where a step says why the
 * forward control is refusing to move.
 */
export function StepFooter({
  backLabel,
  onBack,
  forwardLabel,
  onForward,
  forwardDisabled,
  note,
  extra,
}: {
  backLabel?: string;
  onBack?: () => void;
  forwardLabel?: string;
  onForward?: () => void;
  forwardDisabled?: boolean;
  note?: ReactNode;
  /** Anything the step wants beside the forward control. */
  extra?: ReactNode;
}) {
  if (!onBack && !onForward && !note && !extra) return null;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {backLabel ?? 'Back'}
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
        {note && <p className="min-w-0 text-xs text-muted-foreground">{note}</p>}
        {extra}
        {onForward && (
          <Button size="lg" onClick={onForward} disabled={forwardDisabled}>
            {forwardLabel ?? 'Next'}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
