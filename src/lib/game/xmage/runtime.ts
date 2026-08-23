/**
 * DeckMatrix — the XMage runtime API: scope, write buffer, decision protocol.
 *
 * Ported from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The clone is read in place, outside this repository; nothing is vendored.
 * XMage display strings are never copied: those carry Wizards of the Coast
 * rules text, which is not XMage's to license.
 *
 * ## What this is for
 *
 * 7,931 XMage card files declare their own Java class instead of composing
 * stock effects, and `scripts/xmage/api-surface-typed.mjs` measures what those
 * bodies actually call: 115,240 method calls, 2,216 distinct functions once the
 * receiver type is resolved, and 41 of them cover half of every call. You do not
 * port 7,931 cards. You implement the API they call and translate the bodies.
 *
 * This file is the bottom of that API. `objects.ts`, `filters.ts` and
 * `targets.ts` are the rest.
 *
 * ## The signature is XMage's. The body is ours.
 *
 * A faithful copy of XMage's `Game` would be a mutable object graph, and this
 * engine's reducer is pure and returns a new state. So the facades here READ
 * from a `GameState` and WRITE by appending `GameAction`s to a buffer. Nothing
 * a translated body calls ever mutates the state it was handed.
 *
 * Reads still see writes, because they have to: an XMage body routinely moves a
 * card and then asks where it is. Every emitted action is folded through the
 * engine's own `applyAction` into a WORKING copy, which later reads use. The
 * working copy is scratch and is thrown away; what leaves this file is the
 * action list, so two clients replaying the log land on the same board.
 *
 * ## Decisions go through the existing seam, not a new one
 *
 * `chooseUse`, `choose` and `chooseTarget` do not guess and do not return a
 * default. They raise the question as a `PendingChoice` — the same shape
 * `activate.ts` already produces and `bot.ts` already answers — and abort the
 * run. Nothing partial is committed: the caller gets the question, hands back an
 * answer, and the body runs again from the top and reaches further.
 *
 * Aborting rather than continuing with a guess is the point. A body that asks
 * "unless that player pays {1}" and is given a silent `false` resolves the card
 * backwards, and the log would show a card that resolved.
 *
 * The refs the answers are keyed on are stable because the bodies are
 * deterministic: no clock, no random source, and the same state reaches the same
 * call sites in the same order. `use0` is the first `chooseUse` in the body on
 * every replay.
 */

import type {
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  StackTarget,
} from '../types.ts';
import type { ContinuousEffect } from '../layers.ts';
import type { PendingChoice } from '../activate.ts';
import { applyAction } from '../rules.ts';

/* -------------------------------------------------------------------------- */
/* Answers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a caller hands back for one question.
 *
 * Deliberately the same vocabulary `bot.ts` and `cast-targets.ts` already
 * return from their `decide` callbacks — `StackTarget | InstanceId[] |
 * number[] | null` — so an existing decider works here unchanged. There is no
 * boolean: a yes/no is `[0]` for yes and `[1]` for no, which is the mode
 * convention, so a caller that can answer a modal spell can answer a "you may"
 * without learning anything new.
 */
export type XmageAnswer = StackTarget | InstanceId[] | number[] | null;

/** Answers so far, keyed by `PendingChoice.modeRef`. */
export type XmageAnswers = Record<string, XmageAnswer>;

/* -------------------------------------------------------------------------- */
/* Options and result                                                         */
/* -------------------------------------------------------------------------- */

export interface XmageRunOptions {
  /** Epoch ms carried in from the originating action. Nothing here reads a clock. */
  at?: number;
  /** Prefixed onto every log line: "Rhystic Study — resolves". */
  cause?: string;
  /**
   * Seed for derived ids. From state — a stack id, or `${version}:${n}`. Never a
   * uuid, or two clients mint different ids for the same token and replay
   * diverges on the next zone change.
   */
  idPrefix: string;
  /**
   * CR 613 timestamp for any continuous effect produced. Monotonic, from
   * `state.version`. Defaults to the working state's own version.
   */
  timestamp?: number;
  /** Answers to questions an earlier run raised. */
  answers?: XmageAnswers;
}

export interface XmageRun {
  /**
   * True when the body ran to the end. False means it stopped on a question and
   * `actions` is EMPTY — nothing half-done is ever returned.
   */
  ok: boolean;
  actions: GameAction[];
  /** Things the engine declined to do and said so. One `NOTE` per entry. */
  deferred: string[];
  /** Continuous effects produced, already also present as `ADD_CONTINUOUS`. */
  continuous: ContinuousEffect[];
  /** The outstanding question, when `ok` is false. At most one: the body stops at the first. */
  pending: PendingChoice[];
}

/* -------------------------------------------------------------------------- */
/* The abort signal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Thrown by a facade when it reaches a decision with no answer. Caught by
 * `runXmage`, never by a translated body.
 *
 * An exception rather than a return value on purpose: an XMage body does not
 * check whether `chooseUse` was answerable, it checks what it returned, so a
 * sentinel return value would be read as "the player said no" by every card in
 * the corpus.
 */
export class XmageDecisionNeeded extends Error {
  readonly choice: PendingChoice;

  constructor(choice: PendingChoice) {
    super(`needs a decision: ${choice.prompt}`);
    this.name = 'XmageDecisionNeeded';
    this.choice = choice;
  }
}

/* -------------------------------------------------------------------------- */
/* Scope                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The one mutable thing in this folder, and it lives for exactly one
 * resolution. Facades close over it; nothing outside sees it.
 */
export interface XmageScope {
  /** Reads see writes. Scratch — never returned, never persisted. */
  working: GameState;
  /** The state the run started from. `getLKI`-style reads use it. */
  origin: GameState;
  actions: GameAction[];
  deferred: string[];
  continuous: ContinuousEffect[];
  options: XmageRunOptions;
  answers: XmageAnswers;
  /** Per-kind counters behind the stable decision refs. */
  seq: Record<string, number>;
  /** Ordinal behind derived ids. Monotonic within one run. */
  ordinal: number;
  /** `GameState#setValue` / `getValue`, run-local. See `objects.ts`. */
  values: Map<string, unknown>;
}

export function makeScope(state: GameState, options: XmageRunOptions): XmageScope {
  return {
    working: state,
    origin: state,
    actions: [],
    deferred: [],
    continuous: [],
    options,
    answers: options.answers ?? {},
    seq: {},
    ordinal: 0,
    values: new Map(),
  };
}

/** Log metadata every emitted action carries. */
export function metaOf(scope: XmageScope): { at: number; cause?: string } {
  const at = scope.options.at ?? 0;
  return scope.options.cause ? { at, cause: scope.options.cause } : { at };
}

/**
 * Record an action and fold it into the working state.
 *
 * The fold is what makes `player.moveCards(...)` visible to the next
 * `player.getGraveyard()` in the same body. `applyAction` is the engine's own
 * reducer and is pure, so the working copy is a real board and not an
 * approximation of one.
 */
export function emit(scope: XmageScope, action: GameAction): void {
  const full = { ...metaOf(scope), ...action } as GameAction;
  scope.actions.push(full);
  scope.working = applyAction(scope.working, full);
}

/** Say out loud that something was not done. Never silent. */
export function deferHere(scope: XmageScope, message: string): void {
  if (!scope.deferred.includes(message)) scope.deferred.push(message);
}

/** A deterministic id for anything this run mints. Never a uuid or a clock. */
export function derivedId(scope: XmageScope, kind: string): string {
  return `${scope.options.idPrefix}-${kind}${scope.ordinal++}`;
}

/* -------------------------------------------------------------------------- */
/* Asking                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The stable name of the next question of this kind. `use0`, `use1`, `choose0`.
 *
 * Stability comes from determinism, not from bookkeeping: the body has no clock
 * and no random source, so re-running it against the same state reaches the same
 * call sites in the same order and asks `use0` again.
 */
function nextRef(scope: XmageScope, kind: string): string {
  const n = scope.seq[kind] ?? 0;
  scope.seq[kind] = n + 1;
  return `${kind}${n}`;
}

/**
 * Ask, or read back the answer. Never guesses, never defaults.
 *
 * `question` is built without a ref; this fills it in. When there is no answer
 * the run aborts through `XmageDecisionNeeded` and the caller gets the question
 * with nothing applied.
 */
export function ask(
  scope: XmageScope,
  kind: string,
  question: Omit<PendingChoice, 'ref' | 'modeRef'>
): XmageAnswer {
  const ref = nextRef(scope, kind);
  if (Object.prototype.hasOwnProperty.call(scope.answers, ref)) return scope.answers[ref];

  const numericRef = Number(ref.replace(/^\D+/, '')) || 0;
  throw new XmageDecisionNeeded({ ...question, ref: numericRef, modeRef: ref });
}

/**
 * The yes/no shape. `[0]` is yes, anything else is no, which is the same
 * convention `RunOptions.modes` uses for a two-mode node.
 */
export function askYesNo(
  scope: XmageScope,
  prompt: string,
  instanceIds: InstanceId[] = []
): boolean {
  const answer = ask(scope, 'use', {
    kind: 'mode',
    prompt,
    instanceIds,
    playerIds: [],
    modes: [
      { index: 0, text: 'Yes' },
      { index: 1, text: 'No' },
    ],
    min: 1,
    max: 1,
  });
  return Array.isArray(answer) && (answer as number[])[0] === 0;
}

/** Pick cards. Returns the ids the caller chose, already narrowed to the legal set. */
export function askForCards(
  scope: XmageScope,
  prompt: string,
  legal: InstanceId[],
  min: number,
  max: number
): InstanceId[] {
  const answer = ask(scope, 'cards', {
    kind: 'target',
    prompt,
    instanceIds: legal,
    playerIds: [],
    min,
    max,
  });
  if (!Array.isArray(answer)) return [];
  const allowed = new Set(legal);
  const picked: InstanceId[] = [];
  for (const id of answer as InstanceId[]) {
    if (typeof id === 'string' && allowed.has(id) && !picked.includes(id)) picked.push(id);
  }
  // An answer outside the legal set is not repaired into a legal one; the
  // offending entries are dropped and the count check below refuses the rest.
  return picked.length >= min ? picked.slice(0, max) : [];
}

/**
 * Pick one of an enumerated list of names — a colour, a creature type.
 *
 * Goes through the MODE branch of `PendingChoice`, because that is exactly what
 * it is: one of a list, with an index selecting it. No new question shape.
 */
export function askFromList(
  scope: XmageScope,
  prompt: string,
  choices: readonly string[]
): string | null {
  if (!choices.length) return null;
  const answer = ask(scope, 'pick', {
    kind: 'mode',
    prompt,
    instanceIds: [],
    playerIds: [],
    modes: choices.map((text, index) => ({ index, text })),
    min: 1,
    max: 1,
  });
  if (!Array.isArray(answer)) return null;
  const index = (answer as number[])[0];
  return Number.isInteger(index) && index >= 0 && index < choices.length ? choices[index] : null;
}

/** Pick a target: a player, a permanent or an object on the stack. */
export function askForTarget(
  scope: XmageScope,
  prompt: string,
  instanceIds: InstanceId[],
  playerIds: PlayerId[]
): StackTarget | null {
  const answer = ask(scope, 'target', {
    kind: 'target',
    prompt,
    instanceIds,
    playerIds,
    min: 1,
    max: 1,
  });
  if (!answer || Array.isArray(answer)) return null;
  return answer as StackTarget;
}

/* -------------------------------------------------------------------------- */
/* Running a body                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Run one translated XMage body and collect what it did.
 *
 * `body` returns the boolean XMage's `Effect.apply` returns. A `false` from the
 * body is not an error: XMage uses it for "this effect did nothing", and the
 * actions emitted before it still stand.
 */
export function runBody(
  scope: XmageScope,
  body: () => boolean
): XmageRun {
  try {
    body();
  } catch (error) {
    if (error instanceof XmageDecisionNeeded) {
      // Nothing partial. The caller answers and the body runs again from the top.
      return { ok: false, actions: [], deferred: scope.deferred, continuous: [], pending: [error.choice] };
    }
    throw error;
  }
  return {
    ok: true,
    actions: scope.actions,
    deferred: scope.deferred,
    continuous: scope.continuous,
    pending: [],
  };
}
