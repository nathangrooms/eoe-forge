/**
 * The furniture every step of the play flow shares.
 *
 * A step label and a big title, and then ONE bar carrying everything about
 * moving: back, the choices made so far, and the way on.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BAR IS AT THE TOP
 * ---------------------------------------------------------------------------
 * Owner, twice: *"start button top right"*, and then *"find table, choose a
 * deck and the main bottom bar, should be at the top not bottom"*. Two
 * statements a day apart is a settled preference rather than a note on one
 * screen, so this is where the controls live now and moving them back down is a
 * change that has to argue with the owner.
 *
 * It was also measured. Playing the flow on 22 Aug 2026 found step two's
 * controls at y=410 of an 800px window, step three's forward control at the top
 * and its back control at y=1470, four hundred pixels below the fold. So the
 * flow read downwards on two steps, upwards on the third, and needed a scroll
 * to go back. One bar, one place, every step.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BREADCRUMB IS IN THE BAR AND NOT ABOVE IT
 * ---------------------------------------------------------------------------
 * Back, "where am I" and forward are one question asked three ways. Two stacked
 * strips of navigation above the content is the second thing that pushes the
 * actual step down the page, and the trail is already a row of jump-back
 * controls, so the row of jump-back controls and the back button belong beside
 * each other.
 *
 * No borders anywhere in here. Steps are separated by surface and spacing, and
 * the bar is a raised panel rather than a ruled line.
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
  className,
}: {
  crumbs: Crumb[];
  current: PlayStepId;
  onJump: (step: PlayStepId) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Choices so far"
      className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}
    >
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

export interface StepBarProps {
  /** The choices so far. Drawn between back and forward. */
  crumbs?: Crumb[];
  current?: PlayStepId;
  onJump?: (step: PlayStepId) => void;

  backLabel?: string;
  onBack?: () => void;
  forwardLabel?: string;
  onForward?: () => void;
  forwardDisabled?: boolean;
  /**
   * The sentence that says why the forward control is refusing to move, or
   * what is not finished about this step. Sits UNDER the bar's controls rather
   * than between them, so it is read after the button it is about and does not
   * squeeze the trail.
   */
  note?: ReactNode;
  /** Anything the step wants beside the forward control. */
  extra?: ReactNode;
}

/**
 * Back on the left, where you came from in the middle, the way on at the right.
 * At the top of the step, on every step, in every mode.
 */
export function StepBar({
  crumbs,
  current,
  onJump,
  backLabel,
  onBack,
  forwardLabel,
  onForward,
  forwardDisabled,
  note,
  extra,
}: StepBarProps) {
  const hasTrail = Boolean(crumbs && crumbs.length > 0 && current && onJump);
  if (!hasTrail && !onBack && !onForward && !note && !extra) return null;

  return (
    <div className="w-full rounded-xl bg-card px-3 py-3 shadow-sm sm:px-4">
      <div className="flex w-full flex-wrap items-center gap-3">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="shrink-0">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {backLabel ?? 'Back'}
          </Button>
        )}

        {hasTrail && (
          <ChoiceTrail
            crumbs={crumbs as Crumb[]}
            current={current as PlayStepId}
            onJump={onJump as (step: PlayStepId) => void}
            className="flex-1"
          />
        )}

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3">
          {extra}
          {onForward && (
            <Button size="lg" onClick={onForward} disabled={forwardDisabled}>
              {forwardLabel ?? 'Next'}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {note && <p className="mt-2 w-full text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
