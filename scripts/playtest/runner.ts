/**
 * DeckMatrix playtest harness — the game runner.
 *
 * One seed in, one complete game out, reproducible. Both seats are driven by
 * `nextBotMove`, so nothing here is a private simulator: every action that
 * reaches the reducer is one the bot built, through the same `moves.ts` helpers
 * a human's click goes through.
 *
 * TERMINATION IS THE HARD PART AND IT IS DONE FIRST
 * -------------------------------------------------
 * A harness that hangs is worse than no harness, and a harness that quietly
 * calls a hung game "finished" is worse than that. Games WILL hang: a bot with
 * no legal move, a step that will not advance, two seats passing forever. The
 * vigilance loop in `bot.ts`'s own comment is a real one that already happened
 * — Syr Vondam was an eligible attacker again the instant after it was declared
 * as one, so the bot re-declared it forever and locked the tab.
 *
 * So there are six independent ways this loop stops early, and every one of
 * them is recorded as a DEFECT with the full state, not as a clean finish:
 *
 *   no-progress  a bot's whole batch left the state fingerprint unchanged. This
 *                is the vigilance loop, caught on the second pass instead of
 *                after ten thousand actions.
 *   state-loop   a fingerprint seen before has come round again. A cycle that
 *                does change state each step but returns to where it started.
 *   step-stuck   hundreds of actions with `turn` and `step` both frozen.
 *   turn-cap     the game is legal and will not end. Still a defect: a bot pair
 *                that cannot close a game out is a finding about the bot.
 *   action-cap   a single turn spent its whole budget.
 *   time-cap     the wall clock backstop, for anything the five above miss.
 *
 * Plus `engine-error`, when `applyAction` throws. A throw is always top severity
 * and always carries the action that caused it.
 *
 * WHAT IS RECORDED
 * ----------------
 * Every action, the seat that made it, the bot's own note, whether the reducer
 * accepted it, the state hash afterwards, and the structured difference the
 * action made. That last field is the whole point: it is what lets an analysis
 * pass name a card that resolved and changed nothing without the engine ever
 * being asked to grade itself.
 *
 * No clock is read as game input. `at` is the action index, so a replay lands on
 * byte-identical state; the only clocks read are the wall-clock backstop and
 * the timing numbers in the report, neither of which reaches the reducer.
 */

import { applyAction, validateAction } from '../../src/lib/game/rules.ts';
import { buildTable, mulliganActions, type PlayDeck } from '../../src/lib/game/setup.ts';
import { nextBotMove, type BotMove } from '../../src/lib/game/bot.ts';
import { isLand } from '../../src/lib/game/mana.ts';
import type { GameAction, GameState, PlayerId } from '../../src/lib/game/types.ts';
import { buildDeck, type BuiltDeck, type DeckKind } from './deck.ts';
import {
  diffState,
  fingerprint,
  hashFingerprint,
  hashState,
  movedOnly,
  type StateDiff,
} from './fingerprint.ts';
import { loadPool, type CardPool } from './pool.ts';

/* -------------------------------------------------------------------------- */
/* Shape of a run                                                             */
/* -------------------------------------------------------------------------- */

export type EndKind =
  | 'win'
  | 'draw'
  | 'turn-cap'
  | 'action-cap'
  | 'step-stuck'
  | 'no-progress'
  | 'state-loop'
  | 'no-legal-move'
  | 'engine-error'
  | 'time-cap';

/** The six caps and both loop detectors. Every one is tunable from the CLI. */
export interface Limits {
  maxTurns: number;
  maxActionsPerTurn: number;
  maxActionsPerStep: number;
  maxActions: number;
  maxMillis: number;
  /** Consecutive bot batches that changed nothing before the game is called stalled. */
  noProgressLimit: number;
  /** Times one fingerprint may recur before the game is called a loop. */
  loopRepeatLimit: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxTurns: 80,
  maxActionsPerTurn: 400,
  maxActionsPerStep: 250,
  maxActions: 25000,
  maxMillis: 60_000,
  noProgressLimit: 3,
  loopRepeatLimit: 4,
};

export interface RunGameOptions {
  seed: number;
  kind?: DeckKind;
  players?: number;
  pool?: CardPool;
  limits?: Partial<Limits>;
  /** Mulligan a hand with no mana or nothing but mana. On by default. */
  mulligan?: boolean;
  aggression?: 'timid' | 'normal' | 'aggressive';
  /**
   * Announce spells onto the stack and hold a priority round, the way `/play`
   * does.
   *
   * ADDED BY AN ADVERSARIAL REVIEW, because its absence made this harness
   * measure a configuration nothing ships. `Play.tsx` passes `useStack: true`
   * in both places it builds `BotOptions`; this file passed nothing, so every
   * reported game ran the bot with the stack OFF. `planCastFromHand` then takes
   * its non-stack branch, which is a bare `PLAY` straight to the resolution
   * zone, and a spell's own text never runs. Measured: the same Divination cast
   * with the flag off draws 0 cards and with it on draws 2.
   *
   * That is not a small reporting error. It means the harness could not see the
   * spell-resolution path at all, and a run of it was being read as evidence
   * about a game a player never plays.
   *
   * Off by default so every figure this harness printed before today still
   * reproduces. `--stack` turns it on.
   */
  useStack?: boolean;
  /** Keep the per-action state difference in the log. On by default; it is the signal. */
  keepDeltas?: boolean;
  /**
   * Where moves come from. Defaults to the real `nextBotMove`, and every
   * reported game uses the default.
   *
   * It is a parameter so `selftest.ts` can prove the stall detectors fire, by
   * handing the runner a bot that loops, a bot that cycles, and a bot that
   * throws. Detectors that have never fired are not detectors, and a harness
   * whose safety net is untested is the thing this project keeps being burned
   * by: green tests that no code path reaches.
   */
  decide?: (
    state: GameState,
    playerId: PlayerId,
    options: { at: number; aggression?: 'timid' | 'normal' | 'aggressive'; useStack?: boolean }
  ) => BotMove | null;
  /** The reducer. Same reason as `decide`: the engine-error path needs proving too. */
  apply?: (state: GameState, action: GameAction) => GameState;
}

export interface LoggedAction {
  /** Index in this game. Also the `at` stamp the action carried. */
  i: number;
  turn: number;
  step: string;
  /** Seat that proposed it. */
  seat: PlayerId;
  /** The bot's own words for the batch this action came from. */
  note: string;
  action: GameAction;
  /**
   * False when `applyAction` returned the same state reference — the reducer
   * refused it. A bot that builds a refused action is itself a finding.
   */
  accepted: boolean;
  hash: string;
  /**
   * Why the reducer refused it, taken from the engine's own `validateAction`.
   * Only present on a refusal, and it is the engine's words rather than a guess.
   */
  refusedBecause?: string;
  /** How many fields changed. Zero on an accepted action is a silent no-op. */
  changed: number;
  delta?: StateDiff;
  /** Set when this action moved cards and changed nothing else. */
  moveOnly?: boolean;
}

export interface SeatReport {
  playerId: PlayerId;
  deckName: string;
  commander: string | null;
  identity: string[];
  life: number;
  hasLost: boolean;
  lossReasons: string[];
  /** Bucket coverage the deck builder achieved, for the run summary. */
  buckets: Record<string, number>;
  unfilledBuckets: string[];
}

export interface StallReport {
  kind: EndKind;
  /** Prose, aimed at somebody reading the summary and nothing else. */
  why: string;
  turn: number;
  round: number;
  step: string;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId;
  /** What each living seat wanted to do at the moment it stopped. */
  botIntent: Array<{ seat: PlayerId; note: string | null; actionTypes: string[] }>;
  /** The last actions before it stopped, newest last. */
  recentActions: LoggedAction[];
  /** The whole state. A hang is top severity and must be inspectable. */
  state: GameState;
  error?: { message: string; stack?: string };
}

export interface GameRecord {
  harnessVersion: number;
  seed: number;
  kind: DeckKind;
  format: string;
  players: number;
  limits: Limits;
  poolVersion: number;
  /** Rebuild check: a replay that produces a different deck hash is not a replay. */
  deckHashes: string[];
  seats: SeatReport[];
  decks: Array<{ playerId: PlayerId; name: string; commanders: string[]; cards: string[] }>;
  /** Mulligans, applied before the first bot move. Part of the replay. */
  setupActions: GameAction[];
  actions: LoggedAction[];
  /** Hash after setup, before the first bot move. The replay anchor. */
  openingHash: string;
  finalHash: string;
  end: EndKind;
  ended: boolean;
  turns: number;
  rounds: number;
  winnerIds: PlayerId[];
  winnerNames: string[];
  /** Reducer refusals, which should be zero. */
  rejected: number;
  /** Accepted actions that changed nothing at all. */
  silentActions: number;
  /**
   * Cards that resolved and moved and changed nothing else. The primary signal:
   * a card whose text promises something and whose resolution did not touch the
   * game. Judging which of them SHOULD have done something needs the oracle
   * text and is an analysis pass, not the runner's call — the runner only
   * reports how many there were and leaves every one of them in `actions`.
   */
  moveOnlyPlays: number;
  /** The engine's own event log, for context next to the action list. */
  gameLog: Array<{ seq: number; turn: number; step: string; type: string; message: string }>;
  stall?: StallReport;
  ms: number;
}

export const HARNESS_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Seat order                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Who is asked for a move first.
 *
 * Normally the active player. At `declare_blockers` the DEFENDERS are asked
 * first, and this is not a detail: `nextBotMove` returns "waits for blocks" for
 * the active seat at that step, so asking in seat order would let the attacker
 * advance straight past the block window and no bot would ever block. Blocking
 * is half of combat, and combat is where most of the engine runs.
 */
function seatOrder(state: GameState): PlayerId[] {
  const living = state.players.filter(p => !p.hasLost && !p.conceded).map(p => p.id);
  if (state.step === 'declare_blockers') {
    return [
      ...living.filter(id => id !== state.activePlayerId),
      ...living.filter(id => id === state.activePlayerId),
    ];
  }
  return [state.activePlayerId, ...living.filter(id => id !== state.activePlayerId)];
}

/* -------------------------------------------------------------------------- */
/* Opening hands                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mulligan a hand that cannot function.
 *
 * Not for the bot's benefit: a seat that keeps a no-land hand does nothing for
 * six turns and those are six turns of harness time that observed no cards. Two
 * mulligans maximum, then the hand is kept whatever it is, exactly as a player
 * eventually has to.
 *
 * This also drags `mulliganActions` onto a code path that runs, which CLAUDE.md
 * lists among the things the engine implemented and nothing ever reached.
 */
function mulliganPlan(state: GameState, playerId: PlayerId, at: number): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];
  const hand = player.zones.hand.map(id => state.cards[id]).filter(Boolean);
  if (hand.length === 0) return [];
  const lands = hand.filter(card => isLand(card)).length;
  if (lands >= 2 && lands <= hand.length - 2) return [];
  return mulliganActions(state, playerId, at);
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                 */
/* -------------------------------------------------------------------------- */

export async function runGame(options: RunGameOptions): Promise<GameRecord> {
  const started = Date.now();
  const limits: Limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const kind: DeckKind = options.kind ?? 'commander';
  const seats = options.players ?? 2;
  const keepDeltas = options.keepDeltas !== false;
  const decide = options.decide ?? nextBotMove;
  const apply = options.apply ?? applyAction;
  const pool = options.pool ?? (await loadPool());

  const built: BuiltDeck[] = [];
  for (let i = 0; i < seats; i++) {
    built.push(await buildDeck({ seed: options.seed, kind, label: `deck:${kind}:seat${i}`, pool }));
  }

  const table = buildTable({
    id: `harness-${options.seed}`,
    seats: built.map((entry, index) => ({
      deck: entry.deck,
      playerName: `Bot ${index + 1}`,
      isBot: true,
    })),
    format: built[0].deck.format,
    seed: options.seed,
    now: 0,
  });

  let state = table.state;
  const botIds = table.botPlayerIds;

  const actions: LoggedAction[] = [];
  const setupActions: GameAction[] = [];
  let index = 0;

  if (options.mulligan !== false) {
    for (const id of botIds) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const plan = mulliganPlan(state, id, index);
        if (plan.length === 0) break;
        for (const action of plan) {
          const next = applyAction(state, { ...action, at: index });
          setupActions.push({ ...action, at: index });
          index += 1;
          state = next;
        }
      }
    }
  }

  let currentPrint = fingerprint(state);
  const openingHash = hashFingerprint(currentPrint);

  let end: EndKind = 'win';
  let stall: StallReport | undefined;
  let rejected = 0;
  let silentActions = 0;
  let moveOnlyPlays = 0;

  let lastTurn = state.turn;
  let lastStep = state.step;
  let actionsThisTurn = 0;
  let actionsThisStep = 0;
  let noProgress = 0;
  const seen = new Map<string, number>();

  const snapshotIntent = (current: GameState): StallReport['botIntent'] =>
    seatOrder(current).map(seat => {
      let move: BotMove | null = null;
      try {
        move = decide(current, seat, {
          at: index,
          aggression: options.aggression,
          useStack: options.useStack,
        });
      } catch {
        move = null;
      }
      return {
        seat,
        note: move ? move.note : null,
        actionTypes: move ? move.actions.map(a => a.type) : [],
      };
    });

  const stop = (kindOut: EndKind, why: string, error?: StallReport['error']): void => {
    end = kindOut;
    stall = {
      kind: kindOut,
      why,
      turn: state.turn,
      round: state.round,
      step: state.step,
      activePlayerId: state.activePlayerId,
      priorityPlayerId: state.priorityPlayerId,
      botIntent: snapshotIntent(state),
      recentActions: actions.slice(-30),
      state,
      error,
    };
  };

  /* ---------------------------------------------------------------------- */

  running: while (true) {
    if (state.status !== 'playing') {
      end = state.winnerIds.length === 1 ? 'win' : 'draw';
      break;
    }

    if (state.turn > limits.maxTurns) {
      stop(
        'turn-cap',
        `Still playing at turn ${state.turn}, past the ${limits.maxTurns} turn cap. ` +
          `The game is legal and will not end, which is a finding about the bot or about ` +
          `a win condition nothing can reach.`
      );
      break;
    }

    if (actions.length >= limits.maxActions) {
      stop('action-cap', `Spent the whole ${limits.maxActions} action budget without finishing.`);
      break;
    }

    if (Date.now() - started > limits.maxMillis) {
      stop(
        'time-cap',
        `Ran past ${limits.maxMillis} ms of wall clock. The other detectors did not fire, ` +
          `so whatever is slow or looping here is not one of the shapes they know about.`
      );
      break;
    }

    if (actionsThisTurn > limits.maxActionsPerTurn) {
      stop(
        'action-cap',
        `Turn ${state.turn} used ${actionsThisTurn} actions, past the ${limits.maxActionsPerTurn} ` +
          `per-turn cap, without the turn ending.`
      );
      break;
    }

    if (actionsThisStep > limits.maxActionsPerStep) {
      stop(
        'step-stuck',
        `Step "${state.step}" on turn ${state.turn} took ${actionsThisStep} actions and did not ` +
          `advance. The step itself is stuck, not the game.`
      );
      break;
    }

    /* Which seat moves, and what it wants to do. */
    let seat: PlayerId | null = null;
    let move: BotMove | null = null;
    for (const candidate of seatOrder(state)) {
      if (botIds.indexOf(candidate) === -1) continue;
      let proposed: BotMove | null;
      try {
        proposed = decide(state, candidate, {
          at: index,
          aggression: options.aggression,
          useStack: options.useStack,
        });
      } catch (error) {
        stop('engine-error', `nextBotMove threw for seat ${candidate}.`, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        break running;
      }
      if (proposed && proposed.actions.length > 0) {
        seat = candidate;
        move = proposed;
        break;
      }
    }

    if (!seat || !move) {
      stop(
        'no-legal-move',
        `No seat has a move at step "${state.step}" on turn ${state.turn}. Every bot returned ` +
          `null, and there is no human here to hand control to, so the game cannot advance.`
      );
      break;
    }

    /* Apply the batch, one action at a time, watching each one. */
    const before = currentPrint;

    for (const action of move.actions) {
      const stamped: GameAction = { ...action, at: index };
      const previous = state;
      let next: GameState;
      try {
        next = apply(previous, stamped);
      } catch (error) {
        stop('engine-error', `applyAction threw on a ${stamped.type} from seat ${seat}.`, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        actions.push({
          i: index,
          turn: previous.turn,
          step: previous.step,
          seat,
          note: move.note,
          action: stamped,
          accepted: false,
          hash: hashState(previous),
          changed: 0,
        });
        break running;
      }

      const accepted = next !== previous;
      if (!accepted) rejected += 1;

      /*
       * Why it was refused, in the engine's own words. `validateAction` is
       * already exported and pure, so asking it costs nothing and adds no hook:
       * a refusal that only says "refused" is not actionable, and a guess at
       * the reason would be the harness inventing a finding.
       */
      const refusedBecause = accepted
        ? undefined
        : validateAction(previous, stamped).reason ?? 'refused without a reason';

      const delta = accepted ? diffState(previous, next) : null;
      const changed = delta ? delta.changes.length + delta.added.length + delta.removed.length : 0;
      if (accepted && changed === 0) silentActions += 1;

      // One fingerprint per state, reused for the hash and for the batch
      // comparison below. Hashing was the slowest thing in the loop when it
      // was done three times over.
      if (accepted) currentPrint = fingerprint(next);

      const entry: LoggedAction = {
        i: index,
        turn: previous.turn,
        step: previous.step,
        seat,
        note: move.note,
        action: stamped,
        accepted,
        hash: hashFingerprint(currentPrint),
        changed,
      };
      if (refusedBecause) entry.refusedBecause = refusedBecause;
      if (delta) {
        // The primary signal is counted whether or not the full difference is
        // kept. `--slim` shrinks the log; it must never shrink the measurement,
        // which is how a harness starts quietly understating what it found.
        entry.moveOnly = movedOnly(delta);
        if (entry.moveOnly && stamped.type === 'PLAY') moveOnlyPlays += 1;
        if (keepDeltas) entry.delta = delta;
      }
      actions.push(entry);

      index += 1;
      actionsThisTurn += 1;
      actionsThisStep += 1;
      state = next;

      if (state.status !== 'playing') break;
    }

    if (state.status !== 'playing') {
      end = state.winnerIds.length === 1 ? 'win' : 'draw';
      break;
    }

    /* Did anything actually happen? */
    const after = currentPrint;
    if (after === before) {
      noProgress += 1;
      if (noProgress >= limits.noProgressLimit) {
        stop(
          'no-progress',
          `Seat ${seat} proposed "${move.note}" ${noProgress} times in a row and the game state ` +
            `is identical after every one. The bot has a move it believes in and the reducer ` +
            `changes nothing, which is a hot loop: a real player would see a frozen table.`
        );
        break;
      }
    } else {
      noProgress = 0;
    }

    const hash = hashFingerprint(currentPrint);
    const repeats = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, repeats);
    if (repeats >= limits.loopRepeatLimit) {
      stop(
        'state-loop',
        `The game has returned to a state it was in ${repeats} times before, at turn ` +
          `${state.turn} step "${state.step}". Each pass changes something and then puts it back, ` +
          `so the caps would eventually catch this, but it is a cycle and it will never end.`
      );
      break;
    }

    if (state.turn !== lastTurn) {
      lastTurn = state.turn;
      actionsThisTurn = 0;
    }
    if (state.step !== lastStep) {
      lastStep = state.step;
      actionsThisStep = 0;
    }
  }

  /* ---------------------------------------------------------------------- */

  const seatReports: SeatReport[] = state.players.map((player, i) => ({
    playerId: player.id,
    deckName: built[i]?.deck.name ?? player.name,
    commander: built[i]?.deck.commanders[0]?.name ?? null,
    identity: built[i]?.identity ?? [],
    life: player.life,
    hasLost: player.hasLost,
    lossReasons: player.lossReasons.slice(),
    buckets: built[i]?.buckets ?? {},
    unfilledBuckets: built[i]?.unfilled ?? [],
  }));

  return {
    harnessVersion: HARNESS_VERSION,
    seed: options.seed,
    kind,
    format: state.format,
    players: seats,
    limits,
    poolVersion: pool.version,
    deckHashes: built.map(entry => deckHash(entry.deck)),
    seats: seatReports,
    decks: built.map((entry, i) => ({
      playerId: state.players[i].id,
      name: entry.deck.name,
      commanders: entry.deck.commanders.map(c => c.name),
      cards: entry.names,
    })),
    setupActions,
    actions,
    openingHash,
    finalHash: hashState(state),
    end,
    ended: end === 'win' || end === 'draw',
    turns: state.turn,
    rounds: state.round,
    winnerIds: state.winnerIds.slice(),
    winnerNames: state.winnerIds
      .map(id => state.players.find(p => p.id === id)?.name ?? id)
      .slice(),
    rejected,
    silentActions,
    moveOnlyPlays,
    gameLog: state.log.map(event => ({
      seq: event.seq,
      turn: event.turn,
      step: event.step,
      type: event.type,
      message: event.message,
    })),
    stall,
    ms: Date.now() - started,
  };
}

/**
 * A deck's identity as a short string.
 *
 * Recorded so a replay can prove it rebuilt the same 100 cards. If the card
 * snapshot on disk is replaced, the same seed produces a different deck and the
 * replay must say so rather than quietly report a different game.
 */
export function deckHash(deck: PlayDeck): string {
  const parts = [
    ...deck.commanders.map(c => `C:${c.name}`),
    ...deck.cards.map(c => c.name),
  ];
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/* -------------------------------------------------------------------------- */
/* Replay                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReplayResult {
  ok: boolean;
  /** Where it first diverged, or null when every hash matched. */
  divergedAt: number | null;
  reason: string;
  checked: number;
}

/**
 * Replay a recorded game and check every hash.
 *
 * This is what makes "here is the seed" a real claim rather than a hope. The
 * decks are rebuilt from the seed and checked against the recorded deck hashes,
 * the table is dealt again, and then the recorded action list is fed back
 * through the reducer one action at a time. Any hash that does not match names
 * the exact action where the two runs parted.
 */
export async function replayGame(record: GameRecord, pool?: CardPool): Promise<ReplayResult> {
  const cards = pool ?? (await loadPool());

  const built: BuiltDeck[] = [];
  for (let i = 0; i < record.players; i++) {
    built.push(
      await buildDeck({
        seed: record.seed,
        kind: record.kind,
        label: `deck:${record.kind}:seat${i}`,
        pool: cards,
      })
    );
  }

  for (let i = 0; i < built.length; i++) {
    if (deckHash(built[i].deck) !== record.deckHashes[i]) {
      return {
        ok: false,
        divergedAt: null,
        checked: 0,
        reason:
          `Seat ${i}'s deck rebuilt to a different list. The card snapshot on disk is not the ` +
          `one this game was recorded against, so this seed no longer reproduces it.`,
      };
    }
  }

  const table = buildTable({
    id: `harness-${record.seed}`,
    seats: built.map((entry, index) => ({
      deck: entry.deck,
      playerName: `Bot ${index + 1}`,
      isBot: true,
    })),
    format: built[0].deck.format,
    seed: record.seed,
    now: 0,
  });

  let state = table.state;
  for (const action of record.setupActions) state = applyAction(state, action);

  if (hashState(state) !== record.openingHash) {
    return {
      ok: false,
      divergedAt: null,
      checked: 0,
      reason: 'The opening state after mulligans did not match. Setup itself is not reproducible.',
    };
  }

  let checked = 0;
  for (const entry of record.actions) {
    state = applyAction(state, entry.action);
    checked += 1;
    if (hashState(state) !== entry.hash) {
      return {
        ok: false,
        divergedAt: entry.i,
        checked,
        reason: `Diverged at action ${entry.i} (${entry.action.type} from ${entry.seat}).`,
      };
    }
  }

  return { ok: true, divergedAt: null, checked, reason: '' };
}
