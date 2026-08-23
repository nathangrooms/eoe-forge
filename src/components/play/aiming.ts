/**
 * THE QUESTION "WHAT IS THIS AIMED AT", PUBLISHED FOR THE BOARD TO ANSWER.
 *
 * ## What was wrong
 *
 * Every targeted spell and every targeted trigger asked its question as a row
 * of NAMES. Measured on a real two seat board on 23 Aug 2026: 30 chips, of
 * which 14 could not be told apart from another chip (Mountain x10, Forest x2,
 * Norin the Wary x2), and the card each chip stood for was drawn 212 to 1201px
 * away from it, median 574. A chip was 2,380px^2 against a 15,362px^2 card, so
 * the player was pressing the smaller, ambiguous copy of a thing that was
 * already on screen. In a card game you point at the card.
 *
 * ## Why a published channel and not a prop or a context
 *
 * The asker and the answerer are SIBLINGS. `SpellTargetPanel` and
 * `AbilityPanel` live inside `CenterPreview`; `TriggerTargetBar` is mounted by
 * the page; the cards are inside `PlayTable` -> `SeatMat`. There is no shared
 * ancestor below `/play` for a context to sit on, and threading a prop would
 * mean four new props on three components that all have to agree.
 *
 * `liveSession.ts` already solved this exact shape for combat and states the
 * trade in full. This is the same mechanism with the same guard: a publication
 * carries the table id and the seat it belongs to, and `aimFor` refuses to hand
 * it to a board that is not that table and that seat. So `/simulate`'s watched
 * game, and an opponent's quadrant, get nothing.
 *
 * A document holds at most one live table and a table asks at most one question
 * at a time: `chooseTargetsFor` returns `pending[0]` and every caller answers
 * that one before it is handed the next. So one slot is the right size.
 *
 * ## No React in this file
 *
 * `npm test` is `node --test` over `src/**\/*.test.ts`, which cannot import a
 * `.tsx` and should not have to import React to check an id filter. The store
 * and the two filters below are plain functions with a test beside them;
 * `useAiming.ts` is the twenty lines of React that sit on top.
 */

import type { GameState, InstanceId, PlayerId } from '../../lib/game/index.ts';

/**
 * One question, offered to the table.
 *
 * The answer callbacks take an id rather than a `StackTarget` on purpose. CR
 * 400.7's zone snapshot has to be taken at the moment of the press, by the code
 * that owns the choice, and a board that built its own target reference would
 * be a second place that had to remember the zone change counter. The board
 * says WHICH; the asker says what that means.
 */
export interface AimRequest {
  /** `GameState.id`. A publication cannot drive a different table. */
  tableId: string;
  /** The seat being asked. A board drawn for another seat ignores this. */
  seatId: PlayerId;
  /**
   * Identity of this question. Changing it republishes; not changing it leaves
   * the live publication alone, which is what stops a render loop.
   */
  signature: string;
  /** The engine's own sentence for what is wanted. Never a paraphrase. */
  prompt: string;
  /** What is asking. "Flametongue Kavu". */
  sourceName: string;
  /** The asking card, so its art can be shown beside its clause. */
  sourceInstanceId?: InstanceId;
  /** The card's own words, verbatim, kept on screen while the player chooses. */
  clause?: string;
  /** Every legal card. Some are on a battlefield and some are not. */
  instanceIds: readonly InstanceId[];
  /** Every legal player. */
  playerIds: readonly PlayerId[];
  answerCard: (instanceId: InstanceId) => void;
  answerPlayer: (playerId: PlayerId) => void;
  /**
   * Abandon the WHOLE announcement, not the last press of it. Escape calls
   * this, and a half answered two target spell has to come back with both
   * answers cleared or the next press means something the player did not ask
   * for.
   */
  cancel: () => void;
  /** What cancelling gets you back to, in the player's words. */
  cancelLabel: string;
}

let current: AimRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Offer a question to the table, or withdraw whatever is there with `null`. */
export function publishAim(request: AimRequest | null): void {
  if (current === request) return;
  current = request;
  emit();
}

/**
 * Withdraw one specific publication.
 *
 * Identity checked for the reason `liveSession.ts` gives: during a remount the
 * outgoing asker's cleanup runs after the incoming one has published, and
 * "clear whatever is there" would leave the board inert with a live question
 * still waiting on it.
 */
export function withdrawAim(request: AimRequest): void {
  if (current !== request) return;
  current = null;
  emit();
}

export function subscribeAim(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function aimSnapshot(): AimRequest | null {
  return current;
}

/**
 * The live question for this table and this seat, or `null`.
 *
 * Pass what you expect. A caller that does not check is a caller that will one
 * day let a watched game answer a question nobody at that screen was asked.
 */
export function aimFor(
  request: AimRequest | null,
  tableId: string | null | undefined,
  seatId: PlayerId | null | undefined
): AimRequest | null {
  if (!request) return null;
  if (!tableId || request.tableId !== tableId) return null;
  if (!seatId || request.seatId !== seatId) return null;
  return request;
}

/**
 * The legal targets a player can point at by pressing the card itself.
 *
 * A permanent is drawn on a mat and can be pressed. A card in a graveyard, an
 * exile or a hand is inside a pile that is drawn as one tile, so there is no
 * card on screen to press and it needs a control of its own. That split is the
 * whole reason `AimLayer` still carries chips: it carries exactly the ones the
 * board cannot serve, and nothing else.
 */
export function boardTargets(
  state: GameState,
  instanceIds: readonly InstanceId[]
): Set<InstanceId> {
  const found = new Set<InstanceId>();
  for (const id of instanceIds) {
    if (state.cards[id]?.zone === 'battlefield') found.add(id);
  }
  return found;
}

/** The legal cards that are NOT drawn as cards on a mat. Chips, in order. */
export function offBoardTargets(
  state: GameState,
  instanceIds: readonly InstanceId[]
): InstanceId[] {
  return instanceIds.filter(id => state.cards[id]?.zone !== 'battlefield');
}

/**
 * Identity of a question, as a string.
 *
 * Every field the board draws from is in it, so a publication that is still
 * current is genuinely still the same question, and a board that has changed
 * under a half answered spell republishes with the new candidate list.
 */
export function aimSignature(parts: {
  source: string;
  kind: string;
  ref: number;
  prompt: string;
  instanceIds: readonly InstanceId[];
  playerIds: readonly PlayerId[];
}): string {
  return [
    parts.source,
    parts.kind,
    String(parts.ref),
    parts.prompt,
    parts.instanceIds.join(','),
    parts.playerIds.join(','),
  ].join('|');
}
