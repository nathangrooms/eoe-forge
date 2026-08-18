/* TEMPORARY screenshot harness for the tournament rebuild. Deleted after verification. */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';

import { AuthProvider } from '@/components/AuthProvider';
import { useCardArt } from '@/hooks/useCardArt';
import { buildPlayerViews } from '@/components/tournament/playerViews';
import { commanderNames } from '@/components/tournament/useEventDecks';
import { EventHeader } from '@/components/tournament/EventHeader';
import { EventRail } from '@/components/tournament/EventRail';
import { RoundBoard } from '@/components/tournament/RoundBoard';
import { StandingsRail, StandingsTable } from '@/components/tournament/StandingsTable';
import { PlayerRoster } from '@/components/tournament/PlayerRoster';
import { Podium } from '@/components/tournament/Podium';
import { BracketBoard } from '@/components/tournament/BracketBoard';
import {
  computeStandings,
  type Match,
  type MatchResult,
  type PlayerDeck,
  type Round,
  type Tournament,
} from '@/components/tournament/scoring';
import { makeTimer } from '@/components/tournament/storage';

const ENTRIES: Array<{ name: string; deck: PlayerDeck | null }> = [
  {
    name: 'Nathan Grooms',
    deck: { deckId: '1', deckName: 'Atraxa Superfriends', format: 'commander', commanderName: "Atraxa, Praetors' Voice", colors: ['W', 'U', 'B', 'G'] },
  },
  {
    name: 'Priya Raman',
    deck: { deckId: '2', deckName: 'Yuriko Ninjas', format: 'commander', commanderName: "Yuriko, the Tiger's Shadow", colors: ['U', 'B'] },
  },
  {
    name: 'Marcus Webb',
    deck: { deckId: '3', deckName: 'Krenko Goblins', format: 'commander', commanderName: 'Krenko, Mob Boss', colors: ['R'] },
  },
  {
    name: 'Ellie Fry',
    deck: { deckId: '4', deckName: 'Muldrotha Value', format: 'commander', commanderName: 'Muldrotha, the Gravetide', colors: ['B', 'G', 'U'] },
  },
  {
    name: 'Sam Okafor',
    deck: { deckId: '5', deckName: 'Edgar Vampires', format: 'commander', commanderName: 'Edgar Markov', colors: ['W', 'B', 'R'] },
  },
  {
    name: 'Jo Lindqvist',
    deck: { deckId: '6', deckName: 'Kaalia Reanimator', format: 'commander', commanderName: 'Kaalia of the Vast', colors: ['W', 'B', 'R'] },
  },
  {
    name: 'Dan Whitmore',
    deck: { deckId: '7', deckName: 'Meren Graveyard', format: 'commander', commanderName: 'Meren of Clan Nel Toth', colors: ['B', 'G'] },
  },
  { name: 'Ash Bell', deck: null },
  { name: 'Rae Torres', deck: null },
];

const PLAYERS = ENTRIES.map(e => e.name);
const DECKS: Record<string, PlayerDeck> = Object.fromEntries(
  ENTRIES.filter(e => e.deck).map(e => [e.name, e.deck as PlayerDeck])
);

function match(id: string, p1: string, p2: string, s1: number, s2: number, done: boolean): Match {
  return {
    id,
    player1: p1,
    player2: p2,
    player1Score: done ? s1 : 0,
    player2Score: done ? s2 : 0,
    result: done ? ((s1 > s2 ? 'p1' : s2 > s1 ? 'p2' : 'draw') as MatchResult) : undefined,
    winner: done ? (s1 > s2 ? p1 : s2 > s1 ? p2 : undefined) : undefined,
    status: done ? ('completed' as const) : ('pending' as const),
  };
}

const ROUND_1: Round = {
  number: 1,
  matches: [
    match('r1m0', PLAYERS[0], PLAYERS[1], 2, 1, true),
    match('r1m1', PLAYERS[2], PLAYERS[3], 0, 2, true),
    match('r1m2', PLAYERS[4], PLAYERS[5], 1, 1, true),
    match('r1m3', PLAYERS[6], PLAYERS[7], 2, 0, true),
    { ...match('r1bye', PLAYERS[8], 'BYE', 2, 0, true) },
  ],
  status: 'completed',
};

const ROUND_2: Round = {
  number: 2,
  matches: [
    match('r2m0', PLAYERS[0], PLAYERS[3], 2, 0, true),
    match('r2m1', PLAYERS[8], PLAYERS[6], 0, 0, false),
    match('r2m2', PLAYERS[1], PLAYERS[4], 2, 1, true),
    match('r2m3', PLAYERS[5], PLAYERS[2], 0, 0, false),
    { ...match('r2bye', PLAYERS[7], 'BYE', 2, 0, true) },
  ],
  status: 'in-progress',
};

function baseEvent(overrides: Partial<Tournament>): Tournament {
  return {
    id: 'e1',
    name: 'Friday Night Commander',
    format: 'swiss',
    gameFormat: 'Commander',
    status: 'in-progress',
    players: PLAYERS,
    decks: DECKS,
    dropped: [],
    rounds: [ROUND_1, ROUND_2],
    currentRound: 2,
    swissRounds: 4,
    roundLengthMinutes: 50,
    timer: makeTimer(50),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const LIVE = baseEvent({});
const SETUP = baseEvent({ id: 'e2', name: 'Sunday Modern RCQ', gameFormat: 'Modern', status: 'setup', rounds: [], currentRound: 0 });
const DONE = baseEvent({
  id: 'e3',
  name: 'Store Championship',
  status: 'completed',
  rounds: [ROUND_1, { ...ROUND_2, matches: ROUND_2.matches.map(m => ({ ...m, player1Score: 2, player2Score: 1, result: 'p1' as const, winner: m.player1, status: 'completed' as const })), status: 'completed' }],
  currentRound: 2,
  swissRounds: 2,
  players: PLAYERS.slice(0, 7),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section data-shot={title} className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Harness() {
  const [round, setRound] = useState(2);
  const art = useCardArt([...commanderNames(DECKS)]);

  const liveStandings = useMemo(() => computeStandings(LIVE.players, LIVE.rounds, LIVE.dropped), []);
  const doneStandings = useMemo(() => computeStandings(DONE.players, DONE.rounds, DONE.dropped), []);
  const liveViews = useMemo(() => buildPlayerViews(LIVE, liveStandings, art), [liveStandings, art]);
  const doneViews = useMemo(() => buildPlayerViews(DONE, doneStandings, art), [doneStandings, art]);
  const setupViews = useMemo(() => buildPlayerViews(SETUP, [], art), [art]);

  const noop = () => undefined;

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-[1180px] space-y-10">
        <Section title="Event rail">
          <EventRail tournaments={[LIVE, SETUP, DONE]} selectedId="e1" onSelect={noop} />
        </Section>

        <Section title="Event header — live">
          <EventHeader
            tournament={LIVE}
            standings={liveStandings}
            totalRounds={4}
            timerRemaining={17 * 60_000 + 42_000}
            onStartClock={noop}
            onPauseClock={noop}
            onResetClock={noop}
            onStart={noop}
            onAdvance={noop}
            onDelete={noop}
            roundComplete={false}
          />
        </Section>

        <Section title="Round board + standings rail">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              <RoundBoard
                tournament={LIVE}
                totalRounds={4}
                views={liveViews}
                selectedRound={round}
                onSelectRound={setRound}
                onRecord={noop}
                onClear={noop}
                onAdvance={noop}
              />
            </div>
            <aside>
              <StandingsRail standings={liveStandings} views={liveViews} onSeeAll={noop} />
            </aside>
          </div>
        </Section>

        <Section title="Standings">
          <StandingsTable standings={liveStandings} views={liveViews} />
        </Section>

        <Section title="Roster — setup">
          <div className="rounded-2xl bg-card p-5 shadow-sm">
            <PlayerRoster
              tournament={SETUP}
              views={setupViews}
              decks={[]}
              decksLoading={false}
              onRegisterDeck={noop}
              onToggleDrop={noop}
              onAddPlayers={noop}
              onRemovePlayer={noop}
            />
          </div>
        </Section>

        <Section title="Podium — finished">
          <Podium
            standings={doneStandings}
            views={doneViews}
            eventName={DONE.name}
            gameFormat={DONE.gameFormat}
            rounds={2}
          />
        </Section>

        <Section title="Bracket">
          <BracketBoard tournament={{ ...LIVE, format: 'single-elimination' }} views={liveViews} />
        </Section>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <Harness />
    </AuthProvider>
  </BrowserRouter>
);
