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

import { Section, SectionHeading } from '@/components/marketing/Section';
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

const COLUMNS: Array<{ key: 'points' | 'record' | 'omw' | 'gw' | 'ogw'; label: string; hint: string }> = [
  { key: 'points', label: 'Pts', hint: 'Match points' },
  { key: 'record', label: 'W–L–D', hint: 'Record' },
  { key: 'omw', label: 'OMW%', hint: "Opponents' match-win percentage" },
  { key: 'gw', label: 'GW%', hint: 'Game-win percentage' },
  { key: 'ogw', label: 'OGW%', hint: "Opponents' game-win percentage" },
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
        lead="Swiss or single elimination, with the maths a paper event uses: three points a win and one a draw, opponents' match-win percentage as the first tiebreaker, the DCI 33% floor applied, and pairings that will not repeat a match-up while a legal alternative exists. Results go in with one click and can be taken back."
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,620px)]">
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
                    <PairingPanel
                      key={match.id}
                      table={i + 1}
                      left={left}
                      right={right}
                      leftPoints={model.pointsOf.get(match.player1) ?? 0}
                      rightPoints={model.pointsOf.get(match.player2) ?? 0}
                      cardWidth={cardWidth}
                    />
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
                        className="whitespace-nowrap px-2 pb-1 text-right font-medium tabular-nums"
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
                        <td className="rounded-l-xl px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                              {i + 1}
                            </span>
                            {entrant ? (
                              <CardImage card={entrant.card} size="sm" width={30} />
                            ) : null}
                            <span className="min-w-0">
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
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.gameWinPct.toFixed(1)}
                        </td>
                        <td className="rounded-r-xl px-2 py-2.5 text-right tabular-nums text-muted-foreground">
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
            <div className="mt-6 rounded-xl bg-muted/30 p-4">
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
            A worked example: four real precon decks, two rounds played. Every figure in the table
            is returned by the app's own scoring module, and the round-three pairings by its own
            pairing function — computed in your browser as this page loaded.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
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
    </Section>
  );
}

export default HomeTournaments;
