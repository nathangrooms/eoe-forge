/**
 * The one button, and the two things it has to say.
 *
 * The owner's ask was "an auto optimise button that swaps both cards and lands,
 * no need to manually select". The button is the easy half. The hard half is
 * that a control which silently rewrites fifteen cards of somebody's deck is
 * frightening, and a player who cannot see what it did has no way to decide
 * whether to keep it. So this renders in four states and two of them are made
 * entirely of words:
 *
 *   idle     one control, with the counted headline of what it would do
 *   preview  every card it will move, named, in the order it will move them,
 *            plus everything it is deliberately leaving alone and why
 *   running  which step is happening now
 *   done     what the DECKLIST actually did, and undo
 *
 * WHY THE RECEIPT IS NOT THE PLAN
 * -------------------------------
 * The plan is what was asked for. The receipt is a diff of the decklist read
 * before and after, which is a different thing, and the difference is real: the
 * deck page refuses a card outside the commander's colour identity and refuses
 * one over its copy limit, both silently, because the handler returns a boolean
 * the optimiser never sees. Restating the plan as the result would report adds
 * that never landed. Anything the plan named that the decklist did not move is
 * listed on its own, under its own heading.
 *
 * WHY THERE IS A REAL UNDO
 * ------------------------
 * Because it was available. Every move the pass makes is invertible with the
 * same three handlers that made it: a card that arrived is removed, a card that
 * left is added back, and a trade is both. Undo runs off the measured diff
 * rather than the plan, so it puts back what actually moved. The receipt stays
 * on screen after undo is used or not used, which means the change is also
 * reversible by reading, and that matters because undo restores cards by NAME:
 * a specific printing that was in the deck comes back as the default printing.
 *
 * THE MANUAL PATH IS UNTOUCHED
 * ----------------------------
 * Every tab still ticks and applies exactly as it did. This is the default
 * route through the optimiser, not the only one, and the copy says so.
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight, Check, Loader2, Undo2, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  diffSummary,
  planSummary,
  plural,
  type AutoPlan,
  type DeckDiff,
} from '@/lib/deckbuilder/optimizer-autopilot';

/** What the pass did, once it has been carried out and measured. */
export interface AutoReceipt {
  /** The plan that ran. Kept so the two can be compared on screen. */
  plan: AutoPlan;
  /** The decklist before against the decklist after. Measured, not asserted. */
  diff: DeckDiff;
  /** Cards the plan named that the decklist never moved. */
  missed: string[];
  /**
   * What is STILL different from before the pass, once undo has run. Null until
   * then.
   *
   * Undo gets measured the same way the pass does. An empty residual is the
   * only thing that earns the words "the deck is exactly as it was"; anything
   * left in it is named, because an undo that half worked and said "put back"
   * would be the worst outcome this screen can produce.
   */
  residual: DeckDiff | null;
}

interface AutoOptimiseSectionProps {
  plan: AutoPlan;
  /** Which step is running, or null when nothing is. */
  runningPhase: string | null;
  receipt: AutoReceipt | null;
  onRun: () => void;
  onUndo: () => void;
  /**
   * Put the receipt away and bring the button back.
   *
   * Offered only once the pass has been undone, or once it turns out to have
   * changed nothing. While a pass stands, the receipt IS the undo, and a close
   * button beside it would be a way to throw that away by accident. Getting the
   * button back from there is "Run again" at the top of the panel, which is the
   * right action anyway: the deck has moved, so the suggestions the old pass
   * was built from are describing a deck that no longer exists.
   */
  onDismiss: () => void;
  busy: boolean;
  /** True while the deck is being written. Undo is refused mid write. */
  saving: boolean;
}

export function AutoOptimiseSection({
  plan,
  runningPhase,
  receipt,
  onRun,
  onUndo,
  onDismiss,
  busy,
  saving,
}: AutoOptimiseSectionProps) {
  const [showPreview, setShowPreview] = useState(false);
  /*
   * Bring the plan to the reader, at its top.
   *
   * `ConfirmBar` centres itself, which is right for a short question sitting
   * under a list you have already read. This is the list, and it is the thing
   * that has to be read, so it lands at the top of the view rather than in the
   * middle of it. Scrolling to the middle of a plan is how a reader misses the
   * first two steps of it.
   */
  const previewRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showPreview) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showPreview]);

  if (receipt) {
    return (
      <Receipt
        receipt={receipt}
        onUndo={onUndo}
        onDismiss={onDismiss}
        busy={busy}
        saving={saving}
      />
    );
  }

  if (runningPhase !== null) {
    return (
      <Card className="shadow-lg">
        <CardContent className="flex items-center gap-4 p-5 sm:p-6">
          <Loader2 className="h-6 w-6 shrink-0 animate-spin" />
          <div className="min-w-0">
            <h3 className="text-lg font-bold">Applying the whole pass</h3>
            <p className="mt-1 text-base text-muted-foreground">{runningPhase}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (plan.moves === 0) return null;

  return (
    <Card className="shadow-lg">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold">Apply the whole pass</h3>
            {/* The counted headline. Every number in it is the plan's own. */}
            <p className="mt-1.5 text-base leading-relaxed">{planSummary(plan)}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Lands and cards together, in that order, with nothing to tick. You can still work
              through the tabs one at a time instead.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => setShowPreview(v => !v)} disabled={busy}>
              <Wand2 className="mr-2 h-4 w-4" />
              {showPreview ? 'Close' : 'Auto optimise'}
            </Button>
          </div>
        </div>

        {showPreview && (
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5"
          >
            <div className="rounded-2xl bg-muted p-5">
              <h4 className="text-base font-bold">
                What this does, in order, before it does it
              </h4>

              <ol className="mt-4 space-y-5">
                {plan.phases.map((phase, i) => (
                  <li key={phase.kind}>
                    <div className="flex items-baseline gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/85 text-[0.7rem] font-semibold tabular-nums text-background">
                        {i + 1}
                      </span>
                      <span className="text-base font-semibold">{phase.heading}</span>
                    </div>
                    {phase.because && (
                      <p className="ml-8 mt-1 text-sm leading-relaxed text-muted-foreground">
                        {phase.because}
                      </p>
                    )}
                    <ul className="ml-8 mt-2.5 space-y-1.5">
                      {phase.items.map(item => (
                        <li
                          key={`${item.out ?? ''}>${item.in ?? ''}`}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                        >
                          {item.out && (
                            <span className={cn(item.in && 'text-muted-foreground line-through')}>
                              {item.out}
                            </span>
                          )}
                          {item.out && item.in && (
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          {item.in && <span className="font-medium">{item.in}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>

              {plan.heldBack.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-base font-bold">What it leaves alone</h4>
                  <ul className="mt-2 space-y-1.5">
                    {plan.heldBack.map(line => (
                      <li key={line} className="text-sm leading-relaxed text-muted-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => {
                    // Closed on the way in, so a second analysis does not
                    // reopen a plan the reader has already dealt with.
                    setShowPreview(false);
                    onRun();
                  }}
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Applying…
                    </>
                  ) : (
                    `Apply all ${plural(plan.moves, 'change')}`
                  )}
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setShowPreview(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                You will see exactly what changed, and you can put it back.
              </p>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What happened, read off the deck rather than off the plan.
 *
 * Stays on screen after undo has been used, and after it has not, because the
 * list of names is the part that makes the change reversible by hand if the
 * undo button is not enough. It is the receipt, not a toast.
 */
function Receipt({
  receipt,
  onUndo,
  onDismiss,
  busy,
  saving,
}: {
  receipt: AutoReceipt;
  onUndo: () => void;
  onDismiss: () => void;
  busy: boolean;
  saving: boolean;
}) {
  const { diff, missed, residual } = receipt;
  /*
   * The result comes to the reader as well.
   *
   * The pass can run for a while and the reader may well have scrolled off
   * somewhere else while it did. A result that appears above the fold, in a
   * place nobody is looking, is the same defect the swap confirmation had.
   */
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [residual]);

  const nothingHappened = diff.added === 0 && diff.removed === 0;
  const undone = residual !== null;
  const fullyBack = residual !== null && residual.added === 0 && residual.removed === 0;

  const heading = !undone
    ? nothingHappened
      ? 'Nothing changed'
      : 'Done'
    : fullyBack
    ? 'Put back'
    : 'Partly put back';

  const line = !undone
    ? diffSummary(diff)
    : fullyBack
    ? 'The deck is exactly as it was before the pass ran.'
    : `${diffSummary(residual)} That is what is still different from before the pass.`;

  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="shadow-lg">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2.5 text-xl font-bold">
                {(fullyBack || (!undone && !nothingHappened)) && (
                  <Check className="h-5 w-5 shrink-0" />
                )}
                {heading}
              </h3>
              {/* Counted from the decklist itself, before and after. */}
              <p className="mt-1.5 text-base leading-relaxed">{line}</p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {!undone && !nothingHappened ? (
                <Button size="lg" variant="outline" onClick={onUndo} disabled={busy || saving}>
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Putting it back…
                    </>
                  ) : (
                    <>
                      <Undo2 className="mr-2 h-4 w-4" />
                      Undo all of it
                    </>
                  )}
                </Button>
              ) : (
                <Button size="lg" variant="ghost" onClick={onDismiss} disabled={busy}>
                  Close
                </Button>
              )}
            </div>
          </div>

          {/* Always the pass's own diff, even after undo. This is the list that
              makes the change reversible by hand, so it does not disappear the
              moment the undo button is pressed. */}
          {!nothingHappened && (
            <div className="mt-5 rounded-2xl bg-muted p-5">
              {undone && (
                <p className="mb-4 text-sm text-muted-foreground">
                  What the pass had done:
                </p>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <ChangeList
                  heading={`Out of the deck (${diff.removed})`}
                  changes={diff.lost}
                  muted
                />
                <ChangeList heading={`Into the deck (${diff.added})`} changes={diff.gained} />
              </div>
            </div>
          )}

          {undone && !fullyBack && (
            <div className="mt-5 rounded-2xl bg-muted p-5">
              <h4 className="flex items-center gap-2.5 text-base font-bold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Still not back where it was
              </h4>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <ChangeList
                  heading={`Missing (${residual!.removed})`}
                  changes={residual!.lost}
                  muted
                />
                <ChangeList heading={`Still there (${residual!.added})`} changes={residual!.gained} />
              </div>
            </div>
          )}

          {missed.length > 0 && (
            <div className="mt-5 rounded-2xl bg-muted p-5">
              <h4 className="flex items-center gap-2.5 text-base font-bold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {plural(missed.length, 'card')} did not move
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                The pass asked for {missed.length === 1 ? 'this' : 'these'} and the deck did not
                take {missed.length === 1 ? 'it' : 'them'}. A card outside your commander&rsquo;s
                colours, or one already at its copy limit, is refused as it goes in.
              </p>
              <p className="mt-2.5 text-sm">{missed.join(', ')}</p>
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            {fullyBack
              ? 'Cards come back by name, so a card you had as a particular printing returns as the default printing of it.'
              : undone
              ? 'The rest is listed above and can be put back by hand from the tabs.'
              : 'This list stays here so you can put anything back by hand. Undo does the lot in one go.'}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ChangeList({
  heading,
  changes,
  muted = false,
}: {
  heading: string;
  changes: ReadonlyArray<{ name: string; delta: number }>;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h4>
      {changes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {changes.map(change => (
            <li
              key={change.name}
              className={cn('text-sm', muted && 'text-muted-foreground line-through')}
            >
              {change.name}
              {Math.abs(change.delta) > 1 && (
                <span className="ml-1.5 tabular-nums no-underline">
                  ×{Math.abs(change.delta)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
