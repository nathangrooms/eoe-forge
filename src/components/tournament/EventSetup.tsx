/**
 * DeckMatrix — creating an event.
 *
 * The old form was a name, two selects and a textarea of names, which is a
 * *record* of an event rather than the setting up of one. This builds the real
 * thing: the format being played, the structure and how many rounds it runs,
 * and a roster where each player registers the deck they are actually piloting
 * — commander art and all — before a single pairing is cut.
 *
 * It keeps a live `Tournament` draft in state rather than a bag of fields, so
 * the roster component here is literally the same one the event runs on and the
 * two can never drift apart.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Layers, ListOrdered, Swords, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useCardArt } from '@/hooks/useCardArt';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';

import {
  GAME_FORMATS,
  recommendedSwissRounds,
  type GameFormat,
  type PlayerDeck,
  type Structure,
  type Tournament,
} from './scoring';
import { loadTournaments, makeTimer, saveTournaments } from './storage';
import { buildPlayerViews } from './playerViews';
import { PlayerRoster } from './PlayerRoster';
import { commanderNames, useMyDecks } from './useEventDecks';

const STRUCTURES: Array<{
  value: Structure;
  label: string;
  icon: typeof Swords;
  blurb: string;
}> = [
  {
    value: 'swiss',
    label: 'Swiss rounds',
    icon: ListOrdered,
    blurb:
      'Everybody plays every round. Pairings follow record, rematches are avoided, and the winner is decided on match points and tiebreakers.',
  },
  {
    value: 'single-elimination',
    label: 'Single elimination',
    icon: Trophy,
    blurb:
      'Win or go home. The field is seeded at random and padded to a power of two with byes. No draws.',
  },
];

const ROUND_LENGTH_PRESETS = [25, 40, 50, 60];

function emptyDraft(): Tournament {
  return {
    id: Date.now().toString(),
    name: '',
    format: 'swiss',
    gameFormat: 'Commander',
    status: 'setup',
    players: [],
    decks: {},
    dropped: [],
    rounds: [],
    currentRound: 0,
    // Seeded at a sane default; tracks the DCI recommendation as players arrive.
    swissRounds: 3,
    roundLengthMinutes: 50,
    timer: makeTimer(50),
    createdAt: new Date().toISOString(),
  };
}

export function EventSetup() {
  const navigate = useNavigate();
  const { decks, loading: decksLoading } = useMyDecks();

  const [draft, setDraft] = useState<Tournament>(emptyDraft);
  /** Once the TO sets a round count by hand, changing the field stops overwriting it. */
  const [roundsTouched, setRoundsTouched] = useState(false);

  const recommended = recommendedSwissRounds(Math.max(2, draft.players.length));
  const scheduledRounds = draft.format === 'swiss' ? draft.swissRounds : bracketRounds(draft.players.length);

  const art = useCardArt(commanderNames(draft.decks));
  const views = useMemo(() => buildPlayerViews(draft, [], art), [draft, art]);

  const update = (mutate: (t: Tournament) => Tournament) => setDraft(current => mutate(current));

  const addPlayers = (names: string[]) =>
    update(t => {
      const players = [...t.players, ...names.filter(n => !t.players.includes(n))];
      return {
        ...t,
        players,
        swissRounds: roundsTouched ? t.swissRounds : recommendedSwissRounds(Math.max(2, players.length)),
      };
    });

  const removePlayer = (name: string) =>
    update(t => {
      const players = t.players.filter(p => p !== name);
      const nextDecks = { ...t.decks };
      delete nextDecks[name];
      return {
        ...t,
        players,
        decks: nextDecks,
        swissRounds: roundsTouched ? t.swissRounds : recommendedSwissRounds(Math.max(2, players.length)),
      };
    });

  const registerDeck = (player: string, deck: PlayerDeck | null) =>
    update(t => {
      const nextDecks = { ...t.decks };
      if (deck) nextDecks[player] = deck;
      else delete nextDecks[player];
      return { ...t, decks: nextDecks };
    });

  const create = () => {
    if (!draft.name.trim()) {
      showError('Name your event', 'Every event needs something to be called.');
      return;
    }
    if (draft.players.length < 2) {
      showError('Not enough players', 'At least two players are needed to cut a pairing.');
      return;
    }

    const tournament: Tournament = {
      ...draft,
      name: draft.name.trim(),
      timer: makeTimer(draft.roundLengthMinutes),
      createdAt: new Date().toISOString(),
    };

    if (!saveTournaments([tournament, ...loadTournaments()])) {
      showError('Could not save', 'This browser refused to store the event.');
      return;
    }

    showSuccess('Event created', tournament.name);
    // replace: backing out of the manager should not land on a submitted form.
    navigate(`/tournament?event=${tournament.id}`, { replace: true });
  };

  const registeredDecks = draft.players.filter(p => draft.decks[p]).length;
  const oddField = draft.players.length % 2 === 1;

  return (
    <StandardPageLayout
      title="New event"
      description="Set the format, the structure and who is playing what. Events are stored in this browser."
      action={
        <Button variant="ghost" onClick={() => navigate('/tournament')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Tournaments
        </Button>
      }
    >
      <div className="max-w-4xl space-y-4 pb-10">
        {/* Identity */}
        <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm sm:p-5">
          <div className="space-y-1.5">
            <label
              htmlFor="event-name"
              className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
            >
              Event name
            </label>
            <Input
              id="event-name"
              value={draft.name}
              onChange={e => update(t => ({ ...t, name: e.target.value }))}
              placeholder="Friday Night Commander"
              autoFocus
              className="h-11 border-0 bg-muted/40 text-base"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Format played
            </p>
            <div className="flex flex-wrap gap-1.5">
              {GAME_FORMATS.map(format => (
                <button
                  key={format}
                  type="button"
                  onClick={() => update(t => ({ ...t, gameFormat: format as GameFormat }))}
                  aria-pressed={draft.gameFormat === format}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none',
                    draft.gameFormat === format
                      ? 'bg-foreground text-background'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Structure */}
        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm sm:p-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Structure
          </p>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {STRUCTURES.map(option => {
              const Icon = option.icon;
              const selected = draft.format === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update(t => ({ ...t, format: option.value }))}
                  aria-pressed={selected}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-xl p-3.5 text-left transition-colors motion-reduce:transition-none',
                    selected ? 'bg-muted' : 'bg-muted/30 hover:bg-muted/60'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{option.label}</span>
                    {selected && (
                      <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {option.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {draft.format === 'swiss' ? (
              <NumberField
                label="Rounds"
                value={draft.swissRounds}
                min={1}
                max={12}
                onChange={value => {
                  setRoundsTouched(true);
                  update(t => ({ ...t, swissRounds: value }));
                }}
                hint={
                  draft.players.length < 2
                    ? 'Follows the DCI recommendation as players are added'
                    : draft.swissRounds === recommended
                      ? `DCI recommendation for ${draft.players.length} players`
                      : `DCI recommends ${recommended} for ${draft.players.length} players`
                }
                action={
                  draft.players.length >= 2 && draft.swissRounds !== recommended
                    ? {
                        label: 'Use recommended',
                        onClick: () => {
                          setRoundsTouched(false);
                          update(t => ({ ...t, swissRounds: recommended }));
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Rounds
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {draft.players.length < 2 ? '—' : bracketRounds(draft.players.length)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Fixed by the bracket — the field halves each round.
                </p>
              </div>
            )}

            <NumberField
              label="Round length"
              value={draft.roundLengthMinutes}
              min={5}
              max={180}
              step={5}
              suffix="min"
              onChange={value =>
                update(t => ({ ...t, roundLengthMinutes: value, timer: makeTimer(value) }))
              }
              presets={ROUND_LENGTH_PRESETS}
            />
          </div>
        </section>

        {/* Roster */}
        <section className="rounded-2xl bg-card p-4 shadow-sm sm:p-5">
          <PlayerRoster
            tournament={draft}
            views={views}
            decks={decks}
            decksLoading={decksLoading}
            onRegisterDeck={registerDeck}
            onToggleDrop={() => undefined}
            onAddPlayers={addPlayers}
            onRemovePlayer={removePlayer}
          />
        </section>

        {/* Summary + create */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <SummaryFact icon={Swords} label={`${draft.players.length} players`} />
            <SummaryFact
              icon={ListOrdered}
              label={
                draft.players.length < 2
                  ? 'Rounds set once players are in'
                  : `${scheduledRounds} round${scheduledRounds === 1 ? '' : 's'}`
              }
            />
            <SummaryFact icon={Layers} label={`${registeredDecks} decks registered`} />
            {oddField && draft.format === 'swiss' && (
              <span className="text-xs text-muted-foreground">
                Odd field — one bye is awarded each round.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/tournament')}>
              Cancel
            </Button>
            <Button onClick={create} className="gap-2">
              <Trophy className="h-4 w-4" />
              Create event
            </Button>
          </div>
        </section>
      </div>
    </StandardPageLayout>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function bracketRounds(playerCount: number): number {
  return Math.ceil(Math.log2(Math.max(2, playerCount)));
}

function SummaryFact({ icon: Icon, label }: { icon: typeof Swords; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="text-foreground">{label}</span>
    </span>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  presets,
  action,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  presets?: number[];
  action?: { label: string; onClick: () => void };
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          aria-label={`Decrease ${label}`}
          className="h-8 w-8 rounded-lg bg-background text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
        >
          −
        </button>
        <span className="min-w-[3.5rem] text-center text-2xl font-semibold tabular-nums text-foreground">
          {value}
          {suffix && <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          aria-label={`Increase ${label}`}
          className="h-8 w-8 rounded-lg bg-background text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
        >
          +
        </button>

        {presets && (
          <span className="ml-auto flex flex-wrap gap-1">
            {presets.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange(preset)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs transition-colors motion-reduce:transition-none',
                  value === preset
                    ? 'bg-foreground text-background'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                )}
              >
                {preset}
              </button>
            ))}
          </span>
        )}
      </div>

      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 text-xs text-foreground underline-offset-4 hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
