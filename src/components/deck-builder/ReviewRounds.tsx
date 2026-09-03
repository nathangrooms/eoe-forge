import { useMemo } from 'react';
import { CardImage } from '@/components/cards';
import { cn } from '@/lib/utils';

/**
 * The deck's own review, drawn.
 *
 * The owner, on the generator: *"It doesn't seem like the system is even
 * reviewing the deck as it spurts all cards out at once, I'd expect multiple
 * rounds of optimisation before displaying."* The engine does review the deck
 * now — up to four rounds, each one scoring every card against the finished
 * list and swapping the weakest for the best card not yet in it — and it
 * writes each swap into the build log as a sentence. A sentence in a log tab
 * is not something a player sees. This is the same information as cards.
 *
 * Nothing here is computed on the client. Every line is parsed from what the
 * engine wrote, so the panel can only ever show a swap the engine made, with
 * the engine's own reason under it. If the log carries no review lines the
 * panel draws nothing rather than a stage with no play in it.
 */

interface Swap {
  round: number;
  out: string;
  outScore: number;
  grounds: string;
  in: string;
  inScore: number;
  reason: string;
}

const SWAP_LINE = /^round (\d+): (.+?) out \(([\d.]+), (.+?)\) for (.+?) \(([\d.]+)\): (.+)$/;
const SUMMARY_LINE = /^reviewed the finished deck in (\d+) rounds? and swapped (\d+) cards?/;
const NO_CHANGE_LINE = /^reviewed the finished deck: no card could be clearly improved on/;

export function parseReview(changelog: readonly unknown[] | undefined) {
  const swaps: Swap[] = [];
  let rounds = 0;
  let noChange = false;
  for (const entry of changelog ?? []) {
    if (typeof entry !== 'string') continue;
    const m = entry.match(SWAP_LINE);
    if (m) {
      swaps.push({
        round: Number(m[1]),
        out: m[2],
        outScore: Number(m[3]),
        grounds: m[4],
        in: m[5],
        inScore: Number(m[6]),
        reason: m[7],
      });
      continue;
    }
    const s = entry.match(SUMMARY_LINE);
    if (s) rounds = Number(s[1]);
    if (NO_CHANGE_LINE.test(entry)) noChange = true;
  }
  if (!rounds && swaps.length) rounds = Math.max(...swaps.map(x => x.round));
  return { swaps, rounds, noChange };
}

/** The first sentence of the engine's reason: the part that names the job. */
function leadReason(reason: string): string {
  const first = reason.split(/; /)[0] ?? reason;
  return first.length > 140 ? `${first.slice(0, 137)}…` : first;
}

export function ReviewRounds({
  changelog,
  cards,
  className,
}: {
  changelog?: readonly unknown[];
  /** The finished deck, so a card the review brought in can be drawn. */
  cards: readonly any[];
  className?: string;
}) {
  const { swaps, rounds, noChange } = useMemo(() => parseReview(changelog), [changelog]);
  const byName = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of cards) if (c?.name) map.set(String(c.name).toLowerCase(), c);
    return map;
  }, [cards]);

  if (swaps.length === 0 && !noChange) return null;

  const byRound = new Map<number, Swap[]>();
  for (const s of swaps) {
    const list = byRound.get(s.round);
    if (list) list.push(s);
    else byRound.set(s.round, [s]);
  }

  return (
    <section className={cn('rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          The deck reviewed itself
        </h3>
        <p className="text-sm text-muted-foreground">
          {noChange && swaps.length === 0
            ? 'Every card held its place.'
            : `${rounds} round${rounds === 1 ? '' : 's'}, ${swaps.length} card${swaps.length === 1 ? '' : 's'} swapped for ones that do more in this deck.`}
        </p>
      </div>

      {[...byRound.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([round, list]) => (
          <div key={round} className="mb-5 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Round {round}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(swap => {
                const incoming = byName.get(swap.in.toLowerCase());
                return (
                  <li
                    key={`${round}-${swap.out}-${swap.in}`}
                    className="flex gap-3 rounded-lg bg-muted/40 p-3"
                  >
                    <div className="shrink-0">
                      {incoming ? (
                        <CardImage card={incoming} size="sm" />
                      ) : (
                        <div className="flex h-[112px] w-[80px] items-center justify-center rounded-md bg-muted/60 p-2 text-center text-[0.65rem] text-muted-foreground">
                          {swap.in}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold leading-tight">{swap.in}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        in for <span className="line-through decoration-muted-foreground/60">{swap.out}</span>
                        {' '}
                        <span className="tabular-nums">
                          ({swap.grounds === 'hard to cast' ? 'hard to cast' : 'weaker here'}, {swap.outScore.toFixed(1)} → {swap.inScore.toFixed(1)})
                        </span>
                      </p>
                      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{leadReason(swap.reason)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </section>
  );
}
