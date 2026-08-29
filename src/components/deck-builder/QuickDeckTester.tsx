import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CardImage } from '@/components/cards/CardImage';
import { getBestCardImage } from '@/lib/scryfall/card-utils';
import { MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';
import {
  fanned,
  handKey as key,
  handVerdict,
  isLand,
  shuffled,
  statsFor,
  type DeckCard,
} from './openingHand';

export type { DeckCard } from './openingHand';

export interface PastHand {
  /** 1 for the first hand of the session, counting up. */
  ordinal: number;
  /** How many mulligans had been taken when this one was dealt. */
  mulligans: number;
  cards: DeckCard[];
  /** Cards sent to the bottom, kept so the row shows what was turned down. */
  bottomed: DeckCard[];
}

export interface OpeningHand {
  /** The cards on the table, already fanned. Empty before the first draw. */
  hand: DeckCard[];
  /** Marked to go to the bottom. Only ever non-empty mid-mulligan. */
  bottoming: Set<string>;
  /** How many still have to be chosen before the hand can be kept. */
  toBottom: number;
  mulligans: number;
  /** True once the seven are settled, so the figures mean something. */
  settled: boolean;
  drawn: boolean;
  /** Every hand before this one, newest first. */
  history: PastHand[];
  draw: () => void;
  mulligan: () => void;
  toggleBottom: (key: string) => void;
  keep: () => void;
}

/**
 * Opening hands, the London mulligan, and the figures that follow from them.
 *
 * The state lives here rather than inside the panel so `/deck/:id/testhand`
 * can put Draw and Mulligan in the page's own action row, beside "Play a whole
 * game". They used to sit inside the panel, which meant the page carried its
 * controls in two places and a second heading to hang them off.
 *
 * ## The mulligan is the London mulligan
 *
 * It drew six cards, then five, then four. That is the Paris mulligan and it
 * was retired from every format in 2019. Under the London mulligan you always
 * draw a fresh seven and put N cards on the bottom of your library, which is a
 * different decision and usually a much better hand, so a tester that models
 * the old rule gives advice about a game nobody is playing.
 *
 * So: mulligan deals seven again and asks which N go to the bottom. Until they
 * are chosen the hand is not settled and no verdict is offered, because a
 * verdict on eight-minus-N cards would be a verdict on a hand that cannot
 * exist.
 */
export function useOpeningHand(library: DeckCard[]): OpeningHand {
  const [hand, setHand] = useState<DeckCard[]>([]);
  const [bottoming, setBottoming] = useState<Set<string>>(new Set());
  const [mulligans, setMulligans] = useState(0);
  const [drawn, setDrawn] = useState(false);
  /*
    Every hand dealt this session, newest first.

    The page's own description says "draw an opening hand, mulligan, and see
    what the seven looked like", and until now the previous seven was thrown
    away the instant you mulliganed, so the one thing the sentence promised was
    the one thing the page could not do. Comparing the hands you turned down is
    also the actual job: you are testing whether the deck opens well, and that
    is a question about several hands, not one.

    Session only, in memory. Nothing is written anywhere.
  */
  const [history, setHistory] = useState<PastHand[]>([]);
  const [dealt, setDealt] = useState(0);

  const deal = useCallback(
    (count: number) => {
      const seven = shuffled(library).slice(0, Math.min(7, library.length));

      /* File the hand being replaced before it goes.

         This reads `hand` out of the closure rather than from inside a
         `setHand` updater. The first version called `setHistory` from within
         that updater, which is a side effect in a function React requires to
         be pure and may call more than once; the filing was dropped every time
         and "Earlier hands" never appeared. */
      if (hand.length > 0) {
        setHistory(h =>
          [
            {
              ordinal: dealt,
              mulligans,
              cards: hand.filter((c, i) => !bottoming.has(key(c, i))),
              bottomed: hand.filter((c, i) => bottoming.has(key(c, i))),
            },
            ...h,
          ].slice(0, 8)
        );
      }

      setHand(fanned(seven));
      setBottoming(new Set());
      setMulligans(count);
      setDrawn(true);
      setDealt(n => n + 1);
    },
    [library, hand, bottoming, mulligans, dealt]
  );

  const draw = useCallback(() => deal(0), [deal]);
  const mulligan = useCallback(() => deal(mulligans + 1), [deal, mulligans]);

  const toggleBottom = useCallback((k: string) => {
    setBottoming(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  /* A mulligan to seven cannot ask for more cards on the bottom than there are
     cards in hand — a two-card library mulliganed twice would otherwise want
     to bottom more than it holds. */
  const owed = Math.min(mulligans, hand.length);
  const toBottom = Math.max(0, owed - bottoming.size);

  const keep = useCallback(() => {
    setHand(prev => fanned(prev.filter((c, i) => !bottoming.has(key(c, i)))));
    setBottoming(new Set());
  }, [bottoming]);

  return {
    hand,
    bottoming,
    toBottom,
    mulligans,
    settled: drawn && owed === 0,
    drawn,
    history,
    draw,
    mulligan,
    toggleBottom,
    keep,
  };
}

interface QuickDeckTesterProps {
  state: OpeningHand;
}

/**
 * The seven cards, at the size the page can afford, above everything else.
 *
 * The cards used to be the last thing on the page and the smallest, sitting
 * under a hand-quality box, a four-figure strip and the curve chart. The seven
 * cards are the reason the page exists, so they come first and they are the
 * biggest thing on it. The figures read as a caption underneath, which is the
 * order you actually use them in: look at the hand, then check the count.
 */
export function QuickDeckTester({ state }: QuickDeckTesterProps) {
  const { hand, bottoming, toBottom, mulligans, settled, history, toggleBottom, keep } = state;

  const choosing = toBottom > 0 || bottoming.size > 0;
  const keeping = useMemo(
    () => hand.filter((c, i) => !bottoming.has(key(c, i))),
    [hand, bottoming]
  );
  const stats = useMemo(() => statsFor(keeping), [keeping]);
  const verdict = handVerdict(stats, keeping.length);

  return (
    <div className="space-y-4">
      {/*
        Seven across from `md` up, because seven across is what a hand looks
        like. The cards take whatever width the column gives them rather than a
        fixed size, so the hand grows with the window instead of stranding the
        page's widest element at 170px in a 1656px column.
      */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-7">
        {hand.map((card, index) => {
          const k = key(card, index);
          const marked = bottoming.has(k);
          const hasArt = Boolean(getBestCardImage(card));
          const card_ = (
            <CardImage
              card={card}
              size="md"
              fill
              interactive={choosing}
              title={card.name}
            >
              {!hasArt && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-wrap items-center justify-center gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {card.cmc}
                  </Badge>
                  {isLand(card) && (
                    <Badge variant="secondary" className="text-[10px]">
                      Land
                    </Badge>
                  )}
                </div>
              )}
            </CardImage>
          );

          /* Not choosing: the card is a picture, not a control. */
          if (!choosing) return <div key={k}>{card_}</div>;

          return (
            <button
              type="button"
              key={k}
              onClick={() => toggleBottom(k)}
              aria-pressed={marked}
              aria-label={`${card.name}${marked ? ', going to the bottom' : ', staying in hand'}`}
              className={cn(
                'group relative block w-full rounded-xl text-left transition-opacity',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                /* Marked cards fade. Never `grayscale`: desaturating a Scryfall
                   image is a licence problem and this project has taken it out
                   of five other components already. */
                marked ? 'opacity-35 hover:opacity-55' : 'opacity-100'
              )}
            >
              {card_}
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-0 rounded-xl ring-2 transition-colors',
                  marked ? 'ring-primary' : 'ring-transparent group-hover:ring-muted-foreground/40'
                )}
              />
            </button>
          );
        })}
      </div>

      {choosing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
          <div>
            <p className="font-semibold">
              {toBottom > 0
                ? `Put ${toBottom} ${toBottom === 1 ? 'card' : 'cards'} on the bottom`
                : 'Ready to keep'}
            </p>
            <p className="text-sm text-muted-foreground">
              You drew a fresh seven. Pick the ones you do not want and they go under the library.
            </p>
          </div>
          <button
            type="button"
            onClick={keep}
            disabled={toBottom > 0}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              toBottom > 0
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            Keep these {keeping.length}
          </button>
        </div>
      ) : (
        settled && (
          <div className={cn('rounded-lg p-3', verdict.tone)}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Hand quality</span>
              <Badge variant={verdict.badge}>{verdict.verdict}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {verdict.message}
              {mulligans > 0 &&
                ` After ${mulligans} ${mulligans === 1 ? 'mulligan' : 'mulligans'}.`}
            </p>
          </div>
        )
      )}

      {/*
        What is actually in the seven. `MetricRow` so a figure here is the same
        tile as the one on the deck page and on My Decks, and `on="card"`
        because this sits in a raised panel.
      */}
      <MetricRow
        on="card"
        columns={4}
        metrics={[
          { id: 'lands', label: 'Lands', value: String(stats.lands), raw: stats.lands },
          {
            id: 'creatures',
            label: 'Creatures',
            value: String(stats.creatures),
            raw: stats.creatures,
          },
          { id: 'spells', label: 'Spells', value: String(stats.spells), raw: stats.spells },
          {
            id: 'cmc',
            label: 'Avg mana value',
            value: stats.avgCmc.toFixed(1),
            raw: stats.avgCmc,
          },
        ]}
      />

      {/*
        The hands you already turned down.

        Half the point of testing an opening hand is comparing it with the last
        one, and this is also what fills the page: without it the body ended
        420px down a 1000px window and the rest was flat charcoal, which is the
        dead space the design law rules out. It is real data, not a filler
        panel, and it appears only once there is a second hand to compare.

        Cards that went to the bottom stay in the row at reduced opacity, so a
        mulligan reads as "these seven, minus those two" rather than a shorter
        row with no explanation.
      */}
      {history.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium text-muted-foreground">Earlier hands</p>
          {history.map(past => {
            /* The same reading the current hand gets, on the hand you turned
               down. Without it the row trailed off into empty charcoal at the
               right, and the comparison the list exists for — was that one
               actually better? — had to be made by eye. */
            const pastStats = statsFor(past.cards);
            const pastVerdict = handVerdict(pastStats, past.cards.length);
            return (
              <div key={past.ordinal} className="flex items-start gap-4">
                <div className="w-24 shrink-0 pt-1">
                  <p className="text-sm font-medium">Hand {past.ordinal}</p>
                  <p className="text-xs text-muted-foreground">
                    {past.mulligans === 0
                      ? 'On the draw'
                      : `${past.mulligans} ${past.mulligans === 1 ? 'mulligan' : 'mulligans'}`}
                  </p>
                </div>
                <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11">
                  {[...past.cards, ...past.bottomed].map((card, i) => (
                    <div
                      key={`${past.ordinal}-${card.id}-${i}`}
                      className={cn(i >= past.cards.length && 'opacity-35')}
                      title={
                        i >= past.cards.length ? `${card.name}, put on the bottom` : card.name
                      }
                    >
                      <CardImage card={card} size="sm" fill hideFlip title={card.name} />
                    </div>
                  ))}
                </div>
                <div className="hidden w-40 shrink-0 pt-1 text-right sm:block">
                  <Badge variant={pastVerdict.badge}>{pastVerdict.verdict}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pastStats.lands} {pastStats.lands === 1 ? 'land' : 'lands'}, curve{' '}
                    {pastStats.avgCmc.toFixed(1)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
