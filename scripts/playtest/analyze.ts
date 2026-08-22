/**
 * DeckMatrix playtest harness — the analysis pass.
 *
 * HOW IT SEES THE GAME
 * --------------------
 * It replays a recorded game through the real reducer and watches from outside,
 * one action at a time, holding the state before and the state after. That is
 * the same trick the runner uses and it is used here for the same reason: the
 * engine is never asked whether it worked.
 *
 * Replay rather than a fresh run, for two reasons. The record is proven
 * reproducible — `--verify` checked every state hash — so the replay lands on
 * byte-identical states, and this pass re-checks every hash as it goes and
 * refuses to report anything from a game that diverged. And it means the
 * analysis can be re-run and re-tuned over the same games without playing them
 * again, so a change to the silent-card rules is a two second experiment rather
 * than a two minute one.
 *
 * WHAT IT PRODUCES
 * ----------------
 *   Silent cards, ranked by how often a player actually meets them.
 *   Event coverage, and more importantly the events that never fired.
 *   Invariant violations, with the seed and the action index to reproduce.
 *   Action reachability: which of the engine's actions a real game ever builds.
 *
 * Every number in the output comes from a game that ran to completion. There is
 * no estimate anywhere in this file and no number is carried forward from one
 * run to the next.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAction, applyActionTraced } from '../../src/lib/game/rules.ts';
import { buildTable } from '../../src/lib/game/setup.ts';
import type {
  GameActionType,
  GameEvent,
  GameState,
  CardInstance,
} from '../../src/lib/game/types.ts';

import { HARNESS_ROOT, loadPool, type CardPool } from './pool.ts';
import { buildDeck, type BuiltDeck } from './deck.ts';
import { deckHash, type GameRecord } from './runner.ts';
import { diffState, hashState } from './fingerprint.ts';
import {
  CATALOG,
  CATALOG_BY_ID,
  checkInvariants,
  checkManaPaid,
  detectEvents,
  detectMulligans,
  detectOpportunities,
  OPPORTUNITY_OF,
  type EventHit,
  type Frame,
  type InvariantHit,
  type ManaCheck,
} from './observe.ts';
import {
  advisoryKeywordsOn,
  hasActivatedAbility,
  judgeResolution,
  type CardVerdict,
  type Severity,
  type Verdict,
} from './silent.ts';

/* -------------------------------------------------------------------------- */
/* Per game                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The cards that RESOLVED in this frame, and where each was being sent.
 *
 * Everything else that moved during the same reducer call is a consequence, not
 * a resolution, and must not be judged as though a player had cast it. A
 * creature that died to lethal damage moved to a graveyard and did not resolve
 * there; nor did a discard; nor, and this is the one that needs saying, did a
 * spell that was COUNTERED.
 *
 * Built from `frame.applied` rather than from the proposed action because a
 * spell cast through the stack is announced in one action and resolves in a
 * later one, buried inside the `PASS_PRIORITY` that finished the round. Two
 * shapes count:
 *
 *   - a `PLAY`, which is a land drop, an immediate cast on a surface that runs
 *     no priority round, or CR 608.3 putting a resolving permanent into play;
 *   - a `MOVE_ZONE` off the stack, which is CR 608.2m finishing an instant or a
 *     sorcery after its effects have run.
 *
 * A `CAST_SPELL` is deliberately NOT one of them. It is an announcement: the
 * card is on the stack, nothing it says has happened yet, and judging it there
 * would file every spell in the game as silent.
 */
function resolutionSubjects(frame: Frame): Map<string, { playedTo: string | undefined }> {
  const subjects = new Map<string, { playedTo: string | undefined }>();

  /* Countering first, so a countered card can never be picked up below. It left
     the stack for a graveyard without resolving, which is CR 701.5, and the
     card did nothing because it was answered rather than because it is
     unimplemented. */
  const countered = new Set<string>();
  for (const applied of frame.applied) {
    if (applied.type !== 'COUNTER_SPELL') continue;
    const object = (frame.before.stack ?? []).find(o => o.stackId === applied.stackId);
    if (object?.cardInstanceId) countered.add(object.cardInstanceId);
  }

  for (const applied of frame.applied) {
    if (applied.type === 'PLAY') {
      if (countered.has(applied.instanceId)) continue;
      subjects.set(applied.instanceId, { playedTo: applied.to ?? 'battlefield' });
    } else if (applied.type === 'MOVE_ZONE') {
      if (countered.has(applied.instanceId)) continue;
      // Only off the stack. Every other `MOVE_ZONE` in the engine is a card
      // being put somewhere by something else: a state-based action, a discard,
      // a tutor, the CR 903.9a commander offer.
      const object = (frame.before.stack ?? []).find(o => o.cardInstanceId === applied.instanceId);
      if (!object) continue;
      subjects.set(applied.instanceId, { playedTo: applied.to });
    }
  }

  return subjects;
}


export interface CardSighting {
  name: string;
  /** Times this card resolved across the run. The ranking key. */
  resolutions: number;
  /** Times it resolved and did nothing it was supposed to do. */
  silent: number;
  verdicts: Record<string, number>;
  /** The worst verdict seen, which is what the row is filed under. */
  worst: Verdict;
  /** The worst severity seen. `high` means the card plays stronger than printed. */
  severity: Severity;
  /** Drawback buckets on this card that nothing in the engine applies. */
  drawbacks: string[];
  /** Printed power/toughness, for the "stronger than printed" table. */
  printedBody?: string;
  why: string;
  mechanic: string;
  engineLevel: string;
  dueText: string[];
  confidence: 'certain' | 'likely';
  /** First seed and action index where it happened, so it can be reproduced. */
  firstSeed: number;
  firstAt: number;
  firstKind: string;
  firstPlayers: number;
  moment: string;
}

export interface GameAnalysis {
  seed: number;
  kind: string;
  players: number;
  ended: boolean;
  turns: number;
  replayOk: boolean;
  replayNote: string;
  events: EventHit[];
  invariants: InvariantHit[];
  mana: ManaCheck[];
  verdicts: Array<CardVerdict & { seed: number; at: number }>;
  /** Action types the bot built, and action types that reached the log by any route. */
  actionsBuilt: Record<string, number>;
  actionsLogged: Record<string, number>;
  /** Cards that entered the battlefield holding an activated ability. */
  activatedAbilityEntries: string[];
  advisoryKeywordSightings: Record<string, number>;
}

/**
 * Replay one recorded game and observe every action.
 *
 * Refuses to report from a divergent replay. A finding taken from a state the
 * game was never actually in is a fabricated finding, and one of those poisons
 * the whole document.
 */
export async function analyzeRecord(record: GameRecord, pool: CardPool): Promise<GameAnalysis> {
  const out: GameAnalysis = {
    seed: record.seed,
    kind: record.kind,
    players: record.players,
    ended: record.ended,
    turns: record.turns,
    replayOk: true,
    replayNote: '',
    events: [],
    invariants: [],
    mana: [],
    verdicts: [],
    actionsBuilt: {},
    actionsLogged: {},
    activatedAbilityEntries: [],
    advisoryKeywordSightings: {},
  };

  const built: BuiltDeck[] = [];
  for (let i = 0; i < record.players; i++) {
    built.push(
      await buildDeck({
        seed: record.seed,
        kind: record.kind,
        label: `deck:${record.kind}:seat${i}`,
        pool,
      })
    );
  }
  for (let i = 0; i < built.length; i++) {
    if (deckHash(built[i].deck) !== record.deckHashes[i]) {
      out.replayOk = false;
      out.replayNote =
        `Seat ${i} rebuilt to a different decklist, so this game cannot be replayed and nothing ` +
        `is reported from it.`;
      return out;
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

  let state: GameState = table.state;
  for (const action of record.setupActions) state = applyAction(state, action);

  if (hashState(state) !== record.openingHash) {
    out.replayOk = false;
    out.replayNote = 'The opening state did not reproduce, so nothing is reported from this game.';
    return out;
  }

  out.events.push(...detectMulligans(record.setupActions, record.seed));

  const manaFrames: Array<{ action: GameRecord['actions'][number]['action']; before: GameState; at: number }> = [];
  const seenActivated = new Set<string>();

  for (const entry of record.actions) {
    const before = state;
    /* Traced, so the detectors can see what the ENGINE ran and not only what a
       bot proposed. A spell cast through the stack resolves inside a
       `PASS_PRIORITY`, so every action that carries the resolution is derived and
       never appears in `record.actions`: the `PLAY` that lands a permanent, the
       `MOVE_ZONE` that bins an instant, the `COUNTER_SPELL`. */
    const { state: after, applied } = applyActionTraced(before, entry.action);
    const refused = after === before;

    if (hashState(after) !== entry.hash) {
      out.replayOk = false;
      out.replayNote =
        `The replay diverged at action ${entry.i} (${entry.action.type}). Everything after it ` +
        `would be a state the game was never in, so this game is dropped from the report.`;
      return out;
    }

    out.actionsBuilt[entry.action.type] = (out.actionsBuilt[entry.action.type] ?? 0) + 1;

    const logAdded: GameEvent[] = after.log.slice(before.log.length);
    for (const event of logAdded) {
      out.actionsLogged[event.type] = (out.actionsLogged[event.type] ?? 0) + 1;
    }

    const frame: Frame = {
      seed: record.seed,
      kind: record.kind,
      players: record.players,
      at: entry.i,
      action: entry.action,
      before,
      after,
      logAdded,
      applied,
      refused,
    };

    manaFrames.push({ action: entry.action, before, at: entry.i });

    if (!refused) {
      out.events.push(...detectEvents(frame));
      out.events.push(...detectOpportunities(frame));
      out.invariants.push(...checkInvariants(frame));

      /* --- the silent-card pass --- */
      const diff = diffState(before, after);

      /*
       * Only the card this frame was ABOUT is judged.
       *
       * One `applyAction` can move several cards: the creature that resolved,
       * plus anything state-based actions put into a graveyard on the way out.
       * Judging every mover would put a creature that died to lethal damage on
       * the silent list for "resolving" into a graveyard, which it did not do —
       * it was killed.
       *
       * THIS USED TO ASK THE PROPOSED ACTION and that stopped working the day
       * the bot started casting through the stack. A card cast that way moves
       * hand -> stack under a `CAST_SPELL`, which is an announcement and not a
       * resolution, and reaches the battlefield or the graveyard several
       * actions later inside whichever `PASS_PRIORITY` completed the round.
       * `subjectOf(PASS_PRIORITY)` is null, so every card cast through the
       * stack would have gone unjudged and the whole "what the cards did"
       * section would have quietly emptied while reading as if it had been
       * measured.
       *
       * So the subjects come from what the engine RAN. `resolutionSubjects`
       * builds them and says in one place which action means "this card
       * resolved" and which does not, countering above all.
       */
      const subjects = resolutionSubjects(frame);

      for (const move of diff.zoneMoves) {
        const subject = subjects.get(move.instanceId);
        if (!subject) continue;
        const landed = after.cards[move.instanceId];
        if (!landed) continue;
        // Entering play is always a resolution. Landing in a graveyard only is
        // when the card RESOLVED there, which is how this engine finishes an
        // instant or a sorcery; a discard also moves hand to graveyard and is
        // not a card resolving.
        const resolvedNow =
          (move.to === 'battlefield' && move.from !== 'battlefield') ||
          (move.to === 'graveyard' && (move.from === 'hand' || move.from === 'stack'));
        if (!resolvedNow) continue;
        // The card as it was when it resolved, so `automationFor` sees the text
        // and not a post-resolution copy that may have been cleaned up.
        const asResolved: CardInstance = before.cards[move.instanceId] ?? landed;
        const verdict = judgeResolution({
          card: { ...asResolved, controllerId: landed.controllerId },
          before,
          after,
          diff,
          logAdded,
          applied,
          landedIn: move.to,
          playedTo: subject.playedTo,
        });
        out.verdicts.push({ ...verdict, seed: record.seed, at: entry.i });

        if (move.to === 'battlefield') {
          if (hasActivatedAbility(landed) && !seenActivated.has(landed.name)) {
            seenActivated.add(landed.name);
            out.activatedAbilityEntries.push(landed.name);
          }
          for (const keyword of advisoryKeywordsOn(landed)) {
            out.advisoryKeywordSightings[keyword] =
              (out.advisoryKeywordSightings[keyword] ?? 0) + 1;
          }
        }
      }
    }

    state = after;
  }

  out.mana = checkManaPaid(manaFrames, record.seed);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Across a run                                                               */
/* -------------------------------------------------------------------------- */

export interface RunAnalysis {
  runId: string;
  gamesRead: number;
  gamesAnalysed: number;
  gamesDropped: Array<{ seed: number; kind: string; why: string }>;
  totalActions: number;
  totalTurns: number;
  eventCounts: Record<string, number>;
  eventExamples: Record<string, string>;
  neverFired: string[];
  invariants: InvariantHit[];
  mana: ManaCheck[];
  cards: CardSighting[];
  verdictTotals: Record<string, number>;
  /** Resolutions by severity, so a report can lead with what costs the most. */
  severityTotals: Record<string, number>;
  /** Split by what was being judged: a permanent arriving, or a spell resolving. */
  momentTotals: Record<string, Record<string, number>>;
  mechanicTotals: Record<string, { silent: number; cards: number }>;
  actionsBuilt: Record<string, number>;
  actionsLogged: Record<string, number>;
  unreachableActions: string[];
  engineOnlyActions: string[];
  activatedAbilityCards: number;
  advisoryKeywords: Record<string, number>;
  distinctCardsResolved: number;
}

/**
 * Which verdict a card is filed under when it produced several.
 *
 * `silent-drawback` sits above everything, including `dead-on-arrival`. A card
 * that died on arrival is visibly broken and costs its controller a card; a
 * card playing without its drawback is invisibly broken and costs the OTHER
 * seat the game. Ranking them the other way round is what buried a one-mana
 * 13/13 under a list of creatures that did not draw a card.
 */
const VERDICT_RANK: Record<Verdict, number> = {
  'silent-drawback': 8,
  'dead-on-arrival': 7,
  'text-not-loaded': 6,
  'silent-untold': 5,
  'silent-marked': 4,
  'silent-noted': 3,
  'correctly-quiet-conditional': 2,
  'correctly-quiet': 1,
  acted: 0,
};

const ALL_ACTION_TYPES: readonly GameActionType[] = [
  'LIFE_CHANGE', 'SET_LIFE', 'DAMAGE', 'COMMANDER_DAMAGE', 'POISON', 'CONCEDE',
  'DAMAGE_CARD', 'PLAYER_COUNTER', 'CARD_COUNTER', 'ATTACH', 'SET_CARD_STAT',
  'SET_KEYWORD', 'CREATE_TOKEN', 'MARK_MANUAL_RESOLVED', 'NOTE', 'DRAW', 'PLAY',
  'MOVE_ZONE', 'TAP', 'UNTAP', 'UNTAP_ALL', 'SHUFFLE', 'CAST_COMMANDER',
  'ATTACK', 'BLOCK', 'UNBLOCK', 'END_COMBAT', 'CAST_SPELL',
  'PUT_ABILITY_ON_STACK', 'PASS_PRIORITY', 'RESOLVE_STACK', 'COUNTER_SPELL',
  'ADD_REPLACEMENT', 'REMOVE_REPLACEMENT', 'PHASE_CHANGE', 'ADVANCE_STEP',
  'PASS_TURN', 'SET_MONARCH', 'SET_INITIATIVE', 'SET_PLAYER_NAME', 'RESET',
];

export function foldAnalyses(runId: string, games: readonly GameAnalysis[]): RunAnalysis {
  const run: RunAnalysis = {
    runId,
    gamesRead: games.length,
    gamesAnalysed: 0,
    gamesDropped: [],
    totalActions: 0,
    totalTurns: 0,
    eventCounts: {},
    eventExamples: {},
    neverFired: [],
    invariants: [],
    mana: [],
    cards: [],
    verdictTotals: {},
    severityTotals: {},
    momentTotals: {},
    mechanicTotals: {},
    actionsBuilt: {},
    actionsLogged: {},
    unreachableActions: [],
    engineOnlyActions: [],
    activatedAbilityCards: 0,
    advisoryKeywords: {},
    distinctCardsResolved: 0,
  };

  const cards = new Map<string, CardSighting>();
  const activated = new Set<string>();

  for (const game of games) {
    if (!game.replayOk) {
      run.gamesDropped.push({ seed: game.seed, kind: game.kind, why: game.replayNote });
      continue;
    }
    run.gamesAnalysed += 1;
    run.totalTurns += game.turns;

    for (const [type, count] of Object.entries(game.actionsBuilt)) {
      run.actionsBuilt[type] = (run.actionsBuilt[type] ?? 0) + count;
      run.totalActions += count;
    }
    for (const [type, count] of Object.entries(game.actionsLogged)) {
      run.actionsLogged[type] = (run.actionsLogged[type] ?? 0) + count;
    }

    for (const hit of game.events) {
      run.eventCounts[hit.event] = (run.eventCounts[hit.event] ?? 0) + 1;
      if (!run.eventExamples[hit.event]) {
        run.eventExamples[hit.event] = `${hit.detail} (seed ${hit.seed}, action ${hit.at})`;
      }
    }

    run.invariants.push(...game.invariants);
    run.mana.push(...game.mana);
    for (const name of game.activatedAbilityEntries) activated.add(name);
    for (const [keyword, count] of Object.entries(game.advisoryKeywordSightings)) {
      run.advisoryKeywords[keyword] = (run.advisoryKeywords[keyword] ?? 0) + count;
    }

    for (const verdict of game.verdicts) {
      run.verdictTotals[verdict.verdict] = (run.verdictTotals[verdict.verdict] ?? 0) + 1;
      run.severityTotals[verdict.severity] = (run.severityTotals[verdict.severity] ?? 0) + 1;
      const moment = (run.momentTotals[verdict.moment] ??= {});
      moment[verdict.verdict] = (moment[verdict.verdict] ?? 0) + 1;

      let sighting = cards.get(verdict.cardName);
      if (!sighting) {
        sighting = {
          name: verdict.cardName,
          resolutions: 0,
          silent: 0,
          verdicts: {},
          worst: verdict.verdict,
          severity: verdict.severity,
          drawbacks: [...new Set(verdict.drawbacks.map(d => d.label))],
          printedBody: verdict.printedBody,
          why: verdict.why,
          mechanic: verdict.mechanic,
          engineLevel: verdict.engineLevel,
          dueText: verdict.dueText,
          confidence: verdict.confidence,
          firstSeed: verdict.seed,
          firstAt: verdict.at,
          firstKind: game.kind,
          firstPlayers: game.players,
          moment: verdict.moment,
        };
        cards.set(verdict.cardName, sighting);
      }
      sighting.resolutions += 1;
      sighting.verdicts[verdict.verdict] = (sighting.verdicts[verdict.verdict] ?? 0) + 1;
      if (VERDICT_RANK[verdict.verdict] >= 3) sighting.silent += 1;
      if (VERDICT_RANK[verdict.verdict] > VERDICT_RANK[sighting.worst]) {
        sighting.worst = verdict.verdict;
        sighting.severity = verdict.severity;
        sighting.drawbacks = [...new Set(verdict.drawbacks.map(d => d.label))];
        sighting.printedBody = verdict.printedBody;
        sighting.why = verdict.why;
        sighting.mechanic = verdict.mechanic;
        sighting.engineLevel = verdict.engineLevel;
        sighting.dueText = verdict.dueText;
        sighting.confidence = verdict.confidence;
        sighting.firstSeed = verdict.seed;
        sighting.firstAt = verdict.at;
        sighting.firstKind = game.kind;
        sighting.firstPlayers = game.players;
        sighting.moment = verdict.moment;
      }
    }
  }

  run.distinctCardsResolved = cards.size;
  run.activatedAbilityCards = activated.size;

  // High severity leads, then how often a player meets it. Sorting on
  // frequency alone is what put a one-mana 13/13 below a creature that failed
  // to scry: a card seen twice that cannot be answered outranks a card seen
  // eight times that wasted its controller's turn.
  const severityRank: Record<string, number> = { high: 2, normal: 1, none: 0 };
  run.cards = [...cards.values()]
    .filter(card => card.silent > 0)
    .sort(
      (a, b) =>
        (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) ||
        b.silent - a.silent ||
        a.name.localeCompare(b.name)
    );

  for (const card of run.cards) {
    const bucket = run.mechanicTotals[card.mechanic] ?? { silent: 0, cards: 0 };
    bucket.silent += card.silent;
    bucket.cards += 1;
    run.mechanicTotals[card.mechanic] = bucket;
  }

  run.neverFired = CATALOG.filter(entry => (run.eventCounts[entry.id] ?? 0) === 0).map(e => e.id);

  for (const type of ALL_ACTION_TYPES) {
    const built = run.actionsBuilt[type] ?? 0;
    const logged = run.actionsLogged[type] ?? 0;
    if (built === 0 && logged === 0) run.unreachableActions.push(type);
    else if (built === 0 && logged > 0) run.engineOnlyActions.push(type);
  }

  return run;
}

/* -------------------------------------------------------------------------- */
/* The report                                                                 */
/* -------------------------------------------------------------------------- */

function pct(part: number, whole: number): string {
  if (whole === 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function repro(seed: number, kind: string, players: number): string {
  return (
    `node --experimental-strip-types scripts/playtest/run.ts --seed ${seed} --games 1 ` +
    `--kind ${kind} --players ${players} --verify`
  );
}

export function writeReport(run: RunAnalysis, games: readonly GameAnalysis[]): string {
  const lines: string[] = [];
  const w = (line = ''): void => {
    lines.push(line);
  };

  const kinds = [...new Set(games.map(g => g.kind))].join(' and ');
  const seatCounts = [...new Set(games.map(g => g.players))].join(', ');
  const finished = games.filter(g => g.ended).length;

  w(`# What the game does not do`);
  w();
  w(
    `Measured by replaying ${run.gamesAnalysed} complete games through the real reducer and ` +
      `watching from outside it. ${finished} of ${run.gamesRead} reached a winner. ` +
      `${run.totalActions.toLocaleString()} actions, ${run.totalTurns.toLocaleString()} turns, ` +
      `${kinds} decks, ${seatCounts} seats. Every state hash was re-checked during the replay, ` +
      `so nothing below comes from a position the game was not actually in.`
  );
  w();
  if (run.gamesDropped.length > 0) {
    w(`${run.gamesDropped.length} game(s) were dropped because the replay diverged:`);
    for (const dropped of run.gamesDropped) w(`- seed ${dropped.seed} ${dropped.kind}: ${dropped.why}`);
    w();
  }

  /* ---- the headline ---- */

  const asked = CATALOG.filter(entry => entry.asked);
  const askedZero = asked.filter(entry => (run.eventCounts[entry.id] ?? 0) === 0);

  w(`## The short answer`);
  w();
  if (askedZero.length === 0) {
    w(`Every mechanic the owner named fired at least once across these games.`);
  } else {
    w(
      `${askedZero.length} of the ${asked.length} things the owner asked about never happened ` +
        `once in ${run.gamesAnalysed} games:`
    );
    w();
    for (const entry of askedZero) {
      const chances = run.eventCounts[`opp:${entry.id}`] ?? 0;
      w(`### ${entry.label} — 0 times`);
      w();
      w(entry.whyZeroMatters);
      w();
      if (OPPORTUNITY_OF[entry.id]) {
        if (chances > 0) {
          w(
            `The game was in a position for it ${chances.toLocaleString()} times ` +
              `(${OPPORTUNITY_OF[entry.id]}) and it did not happen on any of them. The zero is ` +
              `not an untested row.`
          );
        } else {
          w(
            `**No opportunity arose.** ${OPPORTUNITY_OF[entry.id]} never happened in these games, ` +
              `so this zero says the run did not test it, not that it is broken. It needs a run ` +
              `that produces the setup before it can be called a finding.`
          );
        }
        w();
      }
    }
  }

  const untold = run.verdictTotals['silent-untold'] ?? 0;
  const marked = run.verdictTotals['silent-marked'] ?? 0;
  const noted = run.verdictTotals['silent-noted'] ?? 0;
  const acted = run.verdictTotals['acted'] ?? 0;
  const quiet = (run.verdictTotals['correctly-quiet'] ?? 0) +
    (run.verdictTotals['correctly-quiet-conditional'] ?? 0);
  const deadOnArrival = run.verdictTotals['dead-on-arrival'] ?? 0;
  const notLoaded = run.verdictTotals['text-not-loaded'] ?? 0;
  const drawback = run.verdictTotals['silent-drawback'] ?? 0;
  const resolutions =
    untold + marked + noted + acted + quiet + deadOnArrival + notLoaded + drawback;
  const didNothing = untold + marked + noted + deadOnArrival + notLoaded + drawback;

  /* Cards playing stronger than they are printed, first, because they are the
     only rows on this page that cost the OTHER seat the game. */
  const overpowered = run.cards.filter(card => card.severity === 'high');
  if (overpowered.length > 0) {
    w(`### Cards playing STRONGER than they are printed`);
    w();
    w(
      `${drawback.toLocaleString()} resolutions across ` +
        `${overpowered.length} distinct card${overpowered.length === 1 ? '' : 's'} carried a ` +
        `drawback that nothing in the engine can apply. These are not cards that did nothing. ` +
        `They are cards whose printed body was priced around a penalty that never arrived, so ` +
        `the card on the table is stronger than the card that was printed, and the other seat ` +
        `has no answer to it.`
    );
    w();
    w(`| card | printed | resolutions | drawback nothing applies | evidence |`);
    w(`|---|---|---|---|---|`);
    for (const card of overpowered.slice(0, 25)) {
      w(
        `| ${card.name} | ${card.printedBody ?? ''} | ${card.silent} | ` +
          `${card.drawbacks.join(', ')} | ${card.confidence === 'certain' ? 'compiler refused the clause' : 'resolve-by-hand marker'} |`
      );
    }
    w();
    for (const card of overpowered.slice(0, 5)) {
      w(`**${card.name}** — ${card.why}`);
      w();
      for (const text of card.dueText.slice(0, 3)) w(`> ${text}`);
      w();
    }
  }

  w(`### And the cards themselves`);
  w();
  w(
    `${resolutions.toLocaleString()} cards were played across these games. ` +
      `${didNothing.toLocaleString()} of them (${pct(didNothing, resolutions)}) did nothing they ` +
      `were supposed to do at the moment they resolved. Split by what the player would have seen:`
  );
  w();
  w(
    `- **${deadOnArrival.toLocaleString()}** never made it onto the battlefield at all. The card ` +
      `was played and was in a graveyard by the time the action finished.`
  );
  w(
    `- **${noted.toLocaleString()}** did nothing, and the game log said so. That is the app being ` +
      `honest about a rule it has not implemented.`
  );
  w(
    `- **${marked.toLocaleString()}** did nothing and wrote no log line. The permanent carries a ` +
      `"resolve by hand" marker, so it is visible on the card and invisible in the feed.`
  );
  w(`- **${untold.toLocaleString()}** did nothing, wrote no log line and carried no marker.`);
  if (notLoaded > 0) {
    w(`- **${notLoaded.toLocaleString()}** arrived with no oracle text loaded at all.`);
  }
  w();
  w(
    `Against that, ${acted.toLocaleString()} resolutions changed the game and ` +
      `${quiet.toLocaleString()} were correctly quiet: a vanilla creature, a static ability, an ` +
      `activated ability nobody activated, a trigger for another moment, an optional cost nobody ` +
      `paid, or a spell with no legal target. Those are working, and nothing below counts them.`
  );
  w();

  /* ---- silent cards ---- */

  w(`## 1. Silent cards, ranked by how often a player meets them`);
  w();
  w(
    `A card is on this list only if its text was DUE at the moment it resolved and the game state ` +
      `did not move. Vanilla cards, keyword-only cards, static abilities that \`layers.ts\` ` +
      `computes on read, activated abilities that were not activated, triggers for a different ` +
      `moment, spells with no legal target, and triggers whose intervening "if" was false are all ` +
      `excluded, because every one of those is correct behaviour.`
  );
  w();
  w(`| verdict | resolutions |`);
  w(`|---|---|`);
  for (const [verdict, count] of Object.entries(run.verdictTotals).sort((a, b) => b[1] - a[1])) {
    w(`| ${verdict} | ${count.toLocaleString()} |`);
  }
  w();
  w(`Read that table as:`);
  w();
  w(`- \`acted\` — the card resolved and changed the game. Working.`);
  w(`- \`correctly-quiet\` — nothing was due. Working.`);
  w(`- \`correctly-quiet-conditional\` — no legal target, or a false condition. Working.`);
  w(`- \`silent-noted\` — did nothing, and the log said so. Not implemented, honestly.`);
  w(
    `- \`silent-marked\` — did nothing, and the permanent carries a "resolve by hand" marker. ` +
      `\`src/components/play/GameCardView.tsx\` draws that marker from \`automationFor(card).needsManual\`, ` +
      `so a player looking at the card can see it. Nothing is written to the game log, and a ` +
      `player watching the log rather than the card sees nothing at all.`
  );
  w(`- \`silent-untold\` — did nothing and said nothing. This is the bug.`);
  w(
    `- \`silent-drawback\` — the card carries a PENALTY nothing in the engine applies, so it ` +
      `plays stronger than it is printed. This is the worst row on the page, and it is not the ` +
      `same kind of thing as the ones above it: those cost their controller a card, this one ` +
      `costs the other seat the game.`
  );
  w(`- \`text-not-loaded\` — the app never had the card's rules text at all.`);
  w(`- \`dead-on-arrival\` — a permanent was played and was not on the battlefield afterwards.`);
  w();

  w(`### Split by what was being judged`);
  w();
  w(
    `A permanent arriving and a spell resolving are different situations, and the difference ` +
      `decides whether anything can carry a warning. A permanent stays on the table and can hold ` +
      `a marker; an instant or a sorcery goes to the graveyard, so if the log says nothing then ` +
      `nothing anywhere says anything.`
  );
  w();
  const momentKeys = Object.keys(run.momentTotals).sort();
  const verdictKeys = [...new Set(momentKeys.flatMap(k => Object.keys(run.momentTotals[k])))].sort();
  w(`| verdict | ${momentKeys.join(' | ')} |`);
  w(`|---|${momentKeys.map(() => '---').join('|')}|`);
  for (const verdict of verdictKeys) {
    w(
      `| ${verdict} | ` +
        momentKeys.map(k => (run.momentTotals[k][verdict] ?? 0).toLocaleString()).join(' | ') +
        ` |`
    );
  }
  w();

  const top = run.cards.slice(0, 40);
  if (top.length === 0) {
    w(`No card resolved silently in this run.`);
    w();
  } else {
    w(`### The worklist`);
    w();
    w(`${run.cards.length} distinct cards resolved silently at least once. The top ${top.length}:`);
    w();
    w(`| # | card | severity | silent | of | verdict | mechanic | engine's own claim | confidence |`);
    w(`|---|---|---|---|---|---|---|---|---|`);
    top.forEach((card, i) => {
      w(
        `| ${i + 1} | ${card.name} | ${card.severity} | ${card.silent} | ${card.resolutions} | ` +
          `${card.worst} | ${card.mechanic} | ${card.engineLevel} | ${card.confidence} |`
      );
    });
    w();
    w(`### The first ten, with the reproduction`);
    w();
    for (const card of run.cards.slice(0, 10)) {
      w(`**${card.name}** — ${card.worst}, ${card.silent} of ${card.resolutions} resolutions`);
      w();
      w(card.why);
      w();
      if (card.dueText.length > 0) {
        w(`Text that was due and produced nothing:`);
        for (const text of card.dueText) w(`> ${text}`);
        w();
      }
      w('```');
      w(repro(card.firstSeed, card.firstKind, card.firstPlayers));
      w(`# then look at action ${card.firstAt} in the written game log`);
      w('```');
      w();
    }
  }

  const mechanics = Object.entries(run.mechanicTotals).sort((a, b) => b[1].silent - a[1].silent);
  if (mechanics.length > 0) {
    w(`### Grouped by what the text was trying to do`);
    w();
    w(`This is the more useful shape: it says which mechanics are missing, not which cards.`);
    w();
    w(`| mechanic | silent resolutions | distinct cards |`);
    w(`|---|---|---|`);
    for (const [mechanic, totals] of mechanics) {
      w(`| ${mechanic} | ${totals.silent} | ${totals.cards} |`);
    }
    w();
  }

  /* ---- event coverage ---- */

  w(`## 2. Event coverage`);
  w();
  w(
    `Almost every row is detected from the state difference across an action rather than from the ` +
      `action type, so an effect the engine cascaded internally is still counted. The exceptions ` +
      `are the rows where an action IS the event and no shape on the board can stand in for it. ` +
      `Countering is the clearest one, because a countered card and a discarded card sit in the ` +
      `same graveyard. Those rows are read off the actions the engine actually ran, which is a ` +
      `longer list than the actions a bot proposed: a spell cast through the stack resolves ` +
      `inside a priority pass, and nobody ever proposes a COUNTER_SPELL.`
  );
  w();

  const fired = CATALOG.filter(entry => (run.eventCounts[entry.id] ?? 0) > 0);
  const never = CATALOG.filter(entry => (run.eventCounts[entry.id] ?? 0) === 0);

  w(`### Never fired, not once`);
  w();
  if (never.length === 0) {
    w(`Everything in the catalogue fired.`);
    w();
  } else {
    w(`| event | category | asked for | why zero matters |`);
    w(`|---|---|---|---|`);
    for (const entry of never) {
      w(
        `| ${entry.label} | ${entry.category} | ${entry.asked ? 'yes' : ''} | ` +
          `${entry.whyZeroMatters.replace(/\n/g, ' ')} |`
      );
    }
    w();
  }

  w(`### Fired`);
  w();
  w(`| event | times | first example |`);
  w(`|---|---|---|`);
  for (const entry of fired.sort(
    (a, b) => (run.eventCounts[b.id] ?? 0) - (run.eventCounts[a.id] ?? 0)
  )) {
    w(
      `| ${entry.label} | ${(run.eventCounts[entry.id] ?? 0).toLocaleString()} | ` +
        `${run.eventExamples[entry.id] ?? ''} |`
    );
  }
  w();

  /* ---- action reachability ---- */

  w(`### Chances against outcomes`);
  w();
  w(
    `A zero is only a finding when the game was in a position for the thing to happen. This table ` +
      `is the denominator, counted the same way as everything else, from the state.`
  );
  w();
  w(
    `Read the partial rows too. A row where the two numbers differ is a rule that works most of ` +
      `the time and not all of the time, and the gap is the finding. Those are harder to notice ` +
      `than a zero and they are the ones a player hits without knowing why.`
  );
  w();
  w(`| event | chances | times it happened | the chance being counted |`);
  w(`|---|---|---|---|`);
  for (const [id, description] of Object.entries(OPPORTUNITY_OF)) {
    const chances = run.eventCounts[`opp:${id}`] ?? 0;
    const happened = run.eventCounts[id] ?? 0;
    w(`| ${CATALOG_BY_ID.get(id)?.label ?? id} | ${chances.toLocaleString()} | ${happened.toLocaleString()} | ${description} |`);
  }
  w();

  w(`### Which of the engine's actions a real game ever builds`);
  w();
  w(
    `\`built\` is an action a bot constructed, which is the same path a player's click goes down. ` +
      `\`logged\` counts every route including the ones the reducer cascades internally. An action ` +
      `with zero in both columns has no producer anywhere in a real game.`
  );
  w();
  w(`| action | built by a player path | reached the log |`);
  w(`|---|---|---|`);
  for (const type of ALL_ACTION_TYPES) {
    const built = run.actionsBuilt[type] ?? 0;
    const logged = run.actionsLogged[type] ?? 0;
    const flag = built === 0 && logged === 0 ? ' **never**' : '';
    w(`| ${type}${flag} | ${built.toLocaleString()} | ${logged.toLocaleString()} |`);
  }
  w();
  if (run.unreachableActions.length > 0) {
    w(
      `**${run.unreachableActions.length} action types never happened at all:** ` +
        `${run.unreachableActions.join(', ')}.`
    );
    w();
  }
  if (run.engineOnlyActions.length > 0) {
    w(
      `**${run.engineOnlyActions.length} action types only ever came from inside the reducer,** ` +
        `never from a bot and therefore never from a player click: ` +
        `${run.engineOnlyActions.join(', ')}.`
    );
    w();
  }

  /* ---- invariants ---- */

  w(`## 3. Illegal state`);
  w();
  w(
    `Checked after every applied action. State-based actions run inside \`applyAction\`, so any ` +
      `position below is one a player could have been looking at.`
  );
  w();
  if (run.invariants.length === 0) {
    w(`No invariant was violated in ${run.totalActions.toLocaleString()} actions.`);
    w();
  } else {
    const grouped = new Map<string, InvariantHit[]>();
    for (const hit of run.invariants) {
      const list = grouped.get(hit.invariant) ?? [];
      list.push(hit);
      grouped.set(hit.invariant, list);
    }
    w(`| invariant | violations | games |`);
    w(`|---|---|---|`);
    for (const [name, hits] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
      w(`| ${name} | ${hits.length} | ${new Set(hits.map(h => h.seed)).size} |`);
    }
    w();
    for (const [name, hits] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
      const first = hits[0];
      w(`### ${name} — ${hits.length} time(s)`);
      w();
      w(first.message);
      w();
      w(
        `First at turn ${first.turn}, step "${first.step}", after a ${first.actionType}, ` +
          `action index ${first.at}.`
      );
      w();
      w('```');
      w(repro(first.seed, first.kind, first.players));
      w('```');
      w();
    }
  }

  if (run.mana.length > 0) {
    w(`### Cards that reached the battlefield without enough sources tapped`);
    w();
    w(
      `This engine has no mana pool, so the only external check is that the batch which played a ` +
        `card tapped at least as many sources as the card's mana value. It cannot see a colour ` +
        `being wrong. A shortfall means the card was played for less than it costs.`
    );
    w();
    w(`| card | costs | tapped | seed | action |`);
    w(`|---|---|---|---|---|`);
    for (const check of run.mana.slice(0, 30)) {
      w(`| ${check.card} | ${check.cmc} | ${check.tapped} | ${check.seed} | ${check.at} |`);
    }
    w();
    w(`${run.mana.length} in total.`);
    w();
  } else {
    w(`Every card played had at least its mana value in sources tapped in the same batch.`);
    w();
  }

  /* ---- coverage context ---- */

  w(`## 4. Context for the numbers above`);
  w();
  w(
    `${run.distinctCardsResolved.toLocaleString()} distinct cards resolved across these games, ` +
      `and ${run.cards.length.toLocaleString()} of them were silent at least once.`
  );
  w();
  w(
    `${run.activatedAbilityCards.toLocaleString()} distinct cards with an activated ability ` +
      `reached the battlefield. An activated ability is correct to do nothing when its card ` +
      `enters, so none of them are on the silent list for that. Whether any of them could ever be ` +
      `activated is the "activated ability used" row in the coverage table.`
  );
  w();
  const advisory = Object.entries(run.advisoryKeywords).sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (advisory.length > 0) {
    w(
      `Keywords that appeared on permanents and which the engine badges but does not enforce, ` +
        `by how often a player would see one:`
    );
    w();
    w(`| keyword | times seen on a permanent that entered |`);
    w(`|---|---|`);
    for (const [keyword, count] of advisory) w(`| ${keyword} | ${count.toLocaleString()} |`);
    w();
  }

  w(`## 5. Not measured: what the source says about the zeroes`);
  w();
  w(
    `Everything above this line was measured by watching games. This section is not. It is the ` +
      `result of reading the code afterwards to find out WHY a row is zero, and it is separated ` +
      `out so the two are never confused. Check it against the files named; do not treat it as ` +
      `evidence of the same kind.`
  );
  w();
  /*
   * GATED ON THE MEASUREMENT, because this section used to be neither.
   *
   * Both paragraphs below were printed unconditionally, as fixed prose, in
   * every report this file has ever produced. One of them read "Nothing ever
   * reaches the stack" in a run that put 3 spells and 657 abilities on it. It
   * was true the day it was written and the file had no way to notice it had
   * stopped being true, which is the same failure as a false zero and arguably
   * worse: a zero is a number a reader can go and check, and a sentence is not.
   *
   * So each one now prints only while the rows it explains are actually zero,
   * and prints the count instead when they are not.
   */
  const spellsOnStack = run.eventCounts['spell-on-stack'] ?? 0;
  const abilitiesOnStack = run.eventCounts['ability-on-stack'] ?? 0;
  const stackResolutions = run.eventCounts['stack-resolved'] ?? 0;

  if (spellsOnStack === 0 && abilitiesOnStack === 0) {
    w(`**Nothing ever reaches the stack, and the reason is a closed loop.**`);
    w();
    w(
      `\`moves.ts\` \`planCastFromHand\` builds a \`CAST_SPELL\` only when it is called with ` +
        `\`viaStack: true\`, and a plain \`PLAY\` otherwise. A caller that leaves \`viaStack\` ` +
        `off sends every spell straight to its destination without it ever being an object ` +
        `anybody could respond to. The one place that passes \`viaStack: true\` on its own is the ` +
        `counterspell branch in \`priorityMove\`, and that branch only runs when there is already ` +
        `something on the stack to counter. Nothing can put the first object there, so nothing ` +
        `ever is. That single fact accounts for every stack row above reading zero: no spell on ` +
        `the stack, no ability on the stack, no priority passed, no spell countered, no fizzle, ` +
        `no resolution.`
    );
  } else {
    w(`**The stack is in use.**`);
    w();
    w(
      `${spellsOnStack.toLocaleString()} spells and ${abilitiesOnStack.toLocaleString()} ` +
        `abilities were announced onto it in this run, and ${stackResolutions.toLocaleString()} ` +
        `objects resolved off it. \`bot.ts\` \`chooseSpell\` casts with \`viaStack\` on unless a ` +
        `caller turns it off, so a bot's spell is an object the rest of the table gets a priority ` +
        `round to answer. This paragraph replaces a fixed one that said the opposite; it printed ` +
        `unconditionally and outlived the thing it described.`
    );
  }
  w();

  const instantsOrSorceries =
    (run.momentTotals['spell-resolves'] &&
      Object.values(run.momentTotals['spell-resolves']).reduce((a, b) => a + b, 0)) ??
    0;

  w(`**Instants and sorceries.**`);
  w();
  if (instantsOrSorceries === 0) {
    w(
      `\`bot.ts\` \`chooseSpell\` filters its candidates with \`isPermanent(card)\`, so an ` +
        `instant or a sorcery in hand is never even considered, and no spell resolved to a ` +
        `graveyard in this run. **This run did not test instants and sorceries.** Any zero that ` +
        `depends on one is untested rather than broken, and the report says so rather than ` +
        `claiming a result it did not earn.`
    );
  } else {
    w(
      `${instantsOrSorceries.toLocaleString()} resolutions in this run finished in a graveyard ` +
        `rather than on the battlefield, which is what an instant or a sorcery does under CR ` +
        `608.2m. That number also counts a double-faced card misrouted there, so read it beside ` +
        `the \`permanent-card-resolved-into-the-graveyard\` invariant rather than on its own. ` +
        `\`chooseSpell\` still filters its candidates with \`isPermanent(card)\`, so a bot does ` +
        `not choose to cast one; anything counted here reached a graveyard by another route.`
    );
  }
  w();

  w(`## 6. How to reproduce anything here`);
  w();
  w(
    `Every game in this run was played from a seed and replayed with every state hash checked. ` +
      `To play one game again:`
  );
  w();
  w('```');
  w(`node --experimental-strip-types scripts/playtest/run.ts --seed <seed> --games 1 --kind <kind> --verify`);
  w('```');
  w();
  w(`To re-run this analysis over the games already on disk:`);
  w();
  w('```');
  w(`node --experimental-strip-types scripts/playtest/analyze.ts --run ${run.runId}`);
  w('```');
  w();

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

const RUNS_DIR = path.join(HARNESS_ROOT, 'scratch', 'playtest', 'runs');
const REPORT_DIR = path.join(HARNESS_ROOT, 'scratch', 'playtest', 'reports');

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runs: string[] = [];
  let name = 'report';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run') runs.push(argv[++i]);
    else if (argv[i] === '--name') name = argv[++i];
  }
  if (runs.length === 0) {
    console.error('Usage: analyze.ts --run <run folder> [--run <another>] [--name <report name>]');
    process.exit(1);
  }

  const pool = await loadPool();
  const files: string[] = [];
  for (const run of runs) {
    const dir = path.isAbsolute(run) ? run : path.join(RUNS_DIR, run);
    if (!fs.existsSync(dir)) throw new Error(`No run folder at ${dir}`);
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('game-') && file.endsWith('.json')) files.push(path.join(dir, file));
    }
  }
  files.sort();

  console.log(`Analysing ${files.length} recorded games from ${runs.length} run folder(s).`);

  const analyses: GameAnalysis[] = [];
  let done = 0;
  for (const file of files) {
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as GameRecord;
    analyses.push(await analyzeRecord(record, pool));
    done += 1;
    if (done % 10 === 0) process.stdout.write(`\r  ${done}/${files.length}   `);
  }
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  const run = foldAnalyses(runs.join('+'), analyses);
  const report = writeReport(run, analyses);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const mdPath = path.join(REPORT_DIR, `${name}.md`);
  const jsonPath = path.join(REPORT_DIR, `${name}.json`);
  fs.writeFileSync(mdPath, report);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        ...run,
        // The full per-game verdict list is large and is the audit trail.
        games: analyses.map(a => ({
          seed: a.seed,
          kind: a.kind,
          replayOk: a.replayOk,
          turns: a.turns,
          invariants: a.invariants.length,
          silentUntold: a.verdicts.filter(v => v.verdict === 'silent-untold').length,
        })),
      },
      null,
      2
    )
  );

  console.log(`${run.gamesAnalysed} games analysed, ${run.gamesDropped.length} dropped.`);
  console.log(`${run.cards.length} distinct cards resolved silently.`);
  console.log(`${run.invariants.length} invariant violations.`);
  console.log(`${run.neverFired.length} catalogue events never fired.`);
  console.log(`Report: ${path.relative(HARNESS_ROOT, mdPath)}`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
