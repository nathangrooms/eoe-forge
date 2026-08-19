/**
 * Homepage — the tournament manager.
 *
 * `/tournament` runs Swiss or single elimination with real DCI maths and the
 * homepage did not mention it. What is drawn here is a worked example — four
 * real Commander precon decks, two rounds played — and every number in the
 * standings table is produced by calling the product's own `computeStandings`,
 * and the round-three pairings by calling its own `generatePairings`. Change the
 * results at the top of this file and the table changes with them, because
 * nothing below is typed out by hand.
 *
 * That is the honest way to show a scoring engine: run it, in the browser, on
 * data the reader can see, rather than printing a screenshot of numbers.
 *
 * The entrants come from `PRECON_INDEX` — real products with real commander
 * printing ids — and each one is drawn as a WHOLE commander card. A deck is
 * represented by its commander, and a commander is never cropped.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CardImage } from '@/components/cards/CardImage';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { PRECON_INDEX } from '@/data/precon-index';
import {
  computeStandings,
  generatePairings,
  previousOpponents,
  type Match,
  type Round,
} from '@/components/tournament/scoring';

import { MobileReveal, Section, SectionHeading } from '@/components/marketing/Section';
import { AppScreenshot } from '@/components/marketing/AppScreenshot';
import {
  loadCardsById,
  useCompact,
  useDeferred,
  useNearViewport,
  type MarketingCard,
} from '@/components/marketing/sectionData';

/* -------------------------------------------------------------------------- */
/* Entrants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Candidate decks, spread evenly across the whole precon index.
 *
 * Evenly rather than "the newest": card sync is behind on the most recent sets,
 * so a slice off the top would resolve to rows that are not in the table yet.
 * Twenty-four candidates for four slots is enough headroom that the section
 * fills even with several misses.
 */
const CANDIDATES = (() => {
  const single = PRECON_INDEX.filter(
    p => p.commanders.length === 1 && p.commanders[0]?.scryfallId
  );
  const step = Math.max(1, Math.floor(single.length / 24));
  return single.filter((_, i) => i % step === 0).slice(0, 24);
})();

const CANDIDATE_IDS = CANDIDATES.map(p => p.commanders[0].scryfallId);

const loadCommanders = () => loadCardsById('tournament-entrants', CANDIDATE_IDS);

interface Entrant {
  /** The precon's real product name — this is the "player" in the standings. */
  name: string;
  set: string;
  ci: string[];
  card: MarketingCard;
}

/** Four entrants, preferring four different colour identities. */
function pickEntrants(cards: Map<string, MarketingCard>): Entrant[] {
  const seenCi = new Set<string>();
  const seenName = new Set<string>();
  const primary: Entrant[] = [];
  const spare: Entrant[] = [];

  for (const precon of CANDIDATES) {
    const card = cards.get(precon.commanders[0].scryfallId);
    if (!card || seenName.has(precon.name)) continue;
    seenName.add(precon.name);

    const entrant: Entrant = { name: precon.name, set: precon.set, ci: precon.ci, card };
    const key = precon.ci.join('');
    if (seenCi.has(key)) spare.push(entrant);
    else {
      seenCi.add(key);
      primary.push(entrant);
    }
  }

  return [...primary, ...spare].slice(0, 4);
}

/* -------------------------------------------------------------------------- */
/* The worked example                                                         */
/* -------------------------------------------------------------------------- */

/** `[winner index, loser index, winner games, loser games]`, or a draw at 1-1. */
const PLAYED: Array<{ round: number; a: number; b: number; ga: number; gb: number }> = [
  { round: 1, a: 0, b: 1, ga: 2, gb: 0 },
  { round: 1, a: 2, b: 3, ga: 2, gb: 1 },
  { round: 2, a: 0, b: 2, ga: 2, gb: 1 },
  { round: 2, a: 1, b: 3, ga: 1, gb: 1 },
];

function buildRounds(entrants: Entrant[]): Round[] {
  const rounds: Round[] = [1, 2].map(number => ({ number, matches: [], status: 'completed' }));

  PLAYED.forEach((result, index) => {
    const round = rounds[result.round - 1];
    const player1 = entrants[result.a].name;
    const player2 = entrants[result.b].name;
    const drawn = result.ga === result.gb;

    const match: Match = {
      id: `example-${index}`,
      player1,
      player2,
      player1Score: result.ga,
      player2Score: result.gb,
      result: drawn ? 'draw' : 'p1',
      winner: drawn ? undefined : player1,
      status: 'completed',
    };
    round.matches.push(match);
  });

  return rounds;
}

/**
 * The standings columns.
 *
 * `phone` is false for the two second-order tiebreakers. Six columns of tabular
 * numbers plus a deck name and a commander thumbnail want ~464px, and a 390px
 * phone gives this panel 318: measured, this table was the one figure on the
 * homepage a reader had to scroll sideways inside. The first tiebreaker,
 * opponents' match-win percentage, is the one the copy above names, so it
 * stays. Game-win and opponents' game-win only ever separate two decks that
 * have already tied on both of the columns above them.
 */
const COLUMNS: Array<{
  key: 'points' | 'record' | 'omw' | 'gw' | 'ogw';
  label: string;
  hint: string;
  phone: boolean;
}> = [
  { key: 'points', label: 'Pts', hint: 'Match points', phone: true },
  { key: 'record', label: 'W–L–D', hint: 'Record', phone: true },
  { key: 'omw', label: 'OMW%', hint: "Opponents' match-win percentage", phone: true },
  { key: 'gw', label: 'GW%', hint: 'Game-win percentage', phone: false },
  { key: 'ogw', label: 'OGW%', hint: "Opponents' game-win percentage", phone: false },
];

const CAPABILITIES = [
  'Swiss or single elimination',
  'Pairings that avoid rematches',
  'Byes handled properly',
  'Round timer',
  'Drops mid-event',
  'Decklists registered per player',
];

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Side({
  entrant,
  points,
  width,
}: {
  entrant: Entrant;
  points: number;
  width: number;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      {/* A deck is its commander, whole. */}
      <CardImage card={entrant.card} size="md" width={width} title={entrant.card.name} />
      <p className="mt-3 w-full truncate text-sm font-medium leading-tight">{entrant.name}</p>
      <p className="mt-1 w-full truncate text-[11px] text-muted-foreground">{entrant.card.name}</p>
      <div className="mt-2 flex items-center gap-2">
        <ColorIdentity colors={entrant.ci} size="xs" />
        <span className="text-[11px] tabular-nums text-muted-foreground">{points} pts</span>
      </div>
    </div>
  );
}

function PairingPanel({
  table,
  left,
  right,
  leftPoints,
  rightPoints,
  cardWidth,
}: {
  table: number;
  left: Entrant;
  right: Entrant;
  leftPoints: number;
  rightPoints: number;
  cardWidth: number;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Table {table}
        </span>
        <span className="rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
          Awaiting result
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <Side entrant={left} points={leftPoints} width={cardWidth} />
        <span className="mt-16 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          vs
        </span>
        <Side entrant={right} points={rightPoints} width={cardWidth} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

export function HomeTournaments() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const cards = useDeferred(near, loadCommanders);
  const cardWidth = useCompact() ? 104 : 146;

  const model = useMemo(() => {
    if (!cards) return null;
    const entrants = pickEntrants(cards);
    if (entrants.length < 4) return null;

    const names = entrants.map(e => e.name);
    const rounds = buildRounds(entrants);

    /* The real functions, on the results above. Nothing here is transcribed. */
    const standings = computeStandings(names, rounds, []);
    const pairings = generatePairings(standings, previousOpponents(rounds), 3);

    const byName = new Map(entrants.map(e => [e.name, e]));
    const pointsOf = new Map(standings.map(s => [s.player, s.points]));

    return { entrants, standings, pairings, byName, pointsOf };
  }, [cards]);

  return (
    <Section tint>
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        eyebrow="Tournaments"
        title="Run the pod, not a spreadsheet"
        lead={
          <>
            Swiss or knockout, scored the way a paper event scores it. Three points for a win and one
            for a draw, with your opponents&rsquo; win rate breaking the ties.{' '}
            {/* Two more sentences from `sm` up. At 390px this lead ran to nine
                lines before the section had shown anything at all. */}
            <span className="hidden sm:inline">
              Nobody gets paired with the same person twice while somebody else is free. Results go
              in with one click, and you can take them back.
            </span>
          </>
        }
      />

      {/* ------------------------------------------------------ the real screen
          The worked example below is the honest way to show a scoring engine:
          it RUNS, in the reader's browser, and the standings under it are what
          `computeStandings` returned. What it cannot do is show the product, so
          it is now introduced by a photograph of the actual tournament manager,
          taken by `scripts/app-shots.mjs`. Picture first, proof underneath. */}
      <div className="mt-9 sm:mt-14">
        <AppScreenshot
          scene="tournament"
          alt="The DeckMatrix tournament manager running a Swiss Commander event: a round clock, the current round's pairings with each seat's commander card, and live standings down the right"
          caption="A Swiss event in progress: the round clock, the pairings for round three with the deck each seat registered, and the standings as they stand."
        />
      </div>

      {/* The worked example, behind a control on a phone.

          The photograph above is the product. What follows is the PROOF: four
          real precon decks, two rounds played, and every figure produced by
          calling the app's own `computeStandings` and `generatePairings` in the
          reader's browser. Side by side on a desktop that is a picture and its
          working. Stacked at 390px it is a second set of pairings under a
          photograph of pairings, then a standings table, then the results that
          table came from: about 980px of checking, under a picture that has
          already made the point.

          So on a phone it is a tap, and it is the whole thing when opened, still
          computed live. Nothing changes at `sm` and above. */}
      <MobileReveal label="See it score a real event">
      <div className="mt-9 grid gap-5 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,620px)]">
        {/* ------------------------------------------------------- pairings */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {[1, 2, 3].map(n => (
              <span
                key={n}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs',
                  n === 3
                    ? 'bg-foreground font-medium text-background'
                    : 'bg-muted/40 text-muted-foreground'
                )}
              >
                Round {n}
                {n < 3 ? ' · played' : ''}
              </span>
            ))}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              4 decks · Commander
            </span>
          </div>

          <div className="space-y-4">
            {model === null
              ? Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full rounded-2xl" />
                ))
              : model.pairings.map((match, i) => {
                  const left = model.byName.get(match.player1);
                  const right = model.byName.get(match.player2);
                  if (!left || !right) return null;
                  return (
                    /* One table on a phone. The two panels are the same exhibit
                       twice, and each is two commander cards plus four lines of
                       label, so the second costs ~290px to repeat the first. */
                    <div key={match.id} className={cn(i >= 1 && 'hidden sm:block')}>
                      <PairingPanel
                        table={i + 1}
                        left={left}
                        right={right}
                        leftPoints={model.pointsOf.get(match.player1) ?? 0}
                        rightPoints={model.pointsOf.get(match.player2) ?? 0}
                        cardWidth={cardWidth}
                      />
                    </div>
                  );
                })}
          </div>
        </div>

        {/* ------------------------------------------------------ standings */}
        <div className="min-w-0 rounded-2xl bg-card p-5 shadow-2xl shadow-black/40 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Standings after round 2
            </p>
          </div>

          {model === null ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 pb-1 text-left font-medium">Deck</th>
                    {COLUMNS.map(c => (
                      <th
                        key={c.key}
                        title={c.hint}
                        className={cn(
                          'whitespace-nowrap px-2 pb-1 text-right font-medium tabular-nums',
                          !c.phone && 'max-sm:hidden'
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.standings.map((row, i) => {
                    const entrant = model.byName.get(row.player);
                    return (
                      <tr key={row.player} className="bg-muted/30">
                        {/* `max-w-0` is what makes this the cell that yields.
                            Without it the deck name sets the column width and
                            the truncation below never fires. */}
                        <td className="w-full rounded-l-xl px-3 py-2.5 max-sm:max-w-0">
                          <div className="flex items-center gap-3">
                            <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                              {i + 1}
                            </span>
                            {entrant ? (
                              <CardImage card={entrant.card} size="sm" width={30} />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium leading-tight">
                                {row.player}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {entrant?.card.name}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-medium tabular-nums">
                          {row.points}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.wins}–{row.losses}–{row.draws}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.opponentMatchWinPct.toFixed(1)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground max-sm:hidden">
                          {row.gameWinPct.toFixed(1)}
                        </td>
                        <td className="rounded-r-xl px-2 py-2.5 text-right tabular-nums text-muted-foreground max-sm:hidden">
                          {row.opponentGameWinPct.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* The input to the maths, directly under its output — a reader can
              check every figure in the table above against these four results. */}
          {model && (
            /* The four results the table is computed FROM, so a reader can
               check every figure in it against them. That is a desk exercise
               and a phone reader is not doing it, and the sentence under the
               table already says the numbers were worked out by the app's own
               code. */
            <div className="mt-6 rounded-xl bg-muted/30 p-4 max-sm:hidden">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                The results those come from
              </p>
              <ul className="mt-3 space-y-1.5">
                {PLAYED.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                      R{r.round}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{model.entrants[r.a].name}</span>
                    <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 font-medium tabular-nums">
                      {r.ga}–{r.gb}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
                      {model.entrants[r.b].name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            A worked example: four real precon decks, two rounds played. Every number in this table was
            worked out by the same code the app itself uses, including the round-three pairings, and
            it all ran in your browser as this page loaded.
          </p>

          {/* Hidden on a phone because the same six chips are drawn below the
              control, outside it, where a phone reader gets them without
              opening anything. Opening this panel must not print them twice. */}
          <div className="mt-6 flex flex-wrap gap-2 max-sm:hidden">
            {CAPABILITIES.map(c => (
              <span
                key={c}
                className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="mt-6">
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link to="/tournament">
                Open the tournament manager
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
      </MobileReveal>

      {/* WHAT THE THING DOES, ON A PHONE.

          The same six chips are drawn inside the panel above, which is behind
          the control on a phone, so without this a phone reader got the
          heading, two sentences and a photograph and never learned that it
          runs single elimination, times rounds, handles byes or lets someone
          drop. That is the section's feature list, and it is not a working.
          Phone only, so the desktop layout is untouched: there the list sits
          under the standings where it always has. */}
      <div className="mt-8 flex flex-wrap justify-center gap-2 sm:hidden">
        {CAPABILITIES.map(c => (
          <span
            key={c}
            className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            {c}
          </span>
        ))}
      </div>

      {/* The way in, on a phone. The one inside the panel above is behind the
          control, and a section with no way through to the thing it describes is
          not a shorter section, it is a broken one. */}
      <div className="mt-8 text-center sm:hidden">
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/tournament">
            Open the tournament manager
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeTournaments;
