/**
 * What just moved, and what is worth showing move.
 *
 * Spec amendment, first animation principle: *"Animate what actually happened.
 * A card moving zones should travel from where it was to where it is going —
 * hand to battlefield, battlefield to graveyard. The movement IS the feedback;
 * a card that teleports leaves the player unsure whether their click
 * registered."*
 *
 * `GameState` is a snapshot and says nothing about motion: it says a card is on
 * the battlefield, not that it arrived from a hand a moment ago. This is the
 * diff that turns one into the other. It is pure, it holds no clock and it
 * touches no DOM — `ZoneTravelLayer.tsx` does the measuring and the drawing —
 * which is what lets `node --test` cover the part that decides what a player
 * sees move.
 *
 * ## What is deliberately NOT animated
 *
 * A travelling card is a claim about where a card was, so it may only be made
 * about cards whose position the player could see. Three cases are therefore
 * refused outright rather than faked:
 *
 *   - anything out of a **library**, which is a face-down stack. A card flying
 *     out of a deck it was shuffled into is an invented position;
 *   - anything into a **library**, for the same reason in reverse;
 *   - an opponent's **hand**, which is card backs. Their draw is not ours to
 *     narrate.
 *
 * ## Why there is a cap
 *
 * Principle five: *"Nothing that fires every frame or every render. This board
 * can hold 120 permanents."* A board wipe moves forty cards at once; forty
 * simultaneous tweens is a stutter, not a story. The batch is capped and the
 * cards nearest the player's own decision are the ones kept.
 */

import type { GameState, InstanceId, PlayerId, Zone } from '@/lib/game';

/** Zone of every card in a state. The thing the next state is compared against. */
export type ZoneSnapshot = Record<InstanceId, Zone>;

export function zoneSnapshot(state: GameState): ZoneSnapshot {
  const snapshot: ZoneSnapshot = {};
  for (const id of Object.keys(state.cards)) snapshot[id] = state.cards[id].zone;
  return snapshot;
}

export interface ZoneMove {
  instanceId: InstanceId;
  from: Zone;
  to: Zone;
  controllerId: PlayerId;
  /** Higher travels first when the batch is capped. */
  weight: number;
}

/** Most travels a single state change may draw. See the header. */
export const MAX_TRAVELS = 6;

/**
 * Zones whose contents are hidden, so a card's position in them is not
 * something the player ever saw.
 */
function hidden(zone: Zone, cardControllerId: PlayerId, viewerPlayerId: PlayerId): boolean {
  if (zone === 'library') return true;
  if (zone === 'hand') return cardControllerId !== viewerPlayerId;
  return false;
}

/**
 * How much a given move matters, so a capped batch keeps the interesting half.
 *
 * A creature dying and a spell resolving are the two the player is watching
 * for; a card being put back in a hand is bookkeeping.
 */
function weigh(from: Zone, to: Zone, mine: boolean): number {
  let weight = mine ? 2 : 0;
  if (from === 'hand' && to === 'battlefield') weight += 6;
  else if (from === 'command' && to === 'battlefield') weight += 6;
  else if (from === 'battlefield' && to === 'graveyard') weight += 5;
  else if (from === 'battlefield' && to === 'exile') weight += 5;
  else if (from === 'hand' && to === 'graveyard') weight += 4;
  else if (to === 'battlefield') weight += 3;
  else weight += 1;
  return weight;
}

/**
 * Every move between two states that is worth drawing, best first.
 *
 * Returns at most `MAX_TRAVELS`. An empty array is the overwhelmingly common
 * answer — most actions move nothing — and it is the cheap path.
 */
export function zoneMovesBetween(
  before: ZoneSnapshot | null,
  state: GameState,
  viewerPlayerId: PlayerId
): ZoneMove[] {
  if (!before) return [];

  const moves: ZoneMove[] = [];
  for (const id of Object.keys(state.cards)) {
    const was = before[id];
    if (was === undefined) continue;
    const card = state.cards[id];
    if (was === card.zone) continue;

    if (hidden(was, card.controllerId, viewerPlayerId)) continue;
    if (hidden(card.zone, card.controllerId, viewerPlayerId)) continue;
    // The stack is not drawn as a place on the table, so nothing travels to it.
    if (was === 'stack' || card.zone === 'stack') continue;

    moves.push({
      instanceId: id,
      from: was,
      to: card.zone,
      controllerId: card.controllerId,
      weight: weigh(was, card.zone, card.controllerId === viewerPlayerId),
    });
  }

  if (moves.length <= MAX_TRAVELS) return moves.sort((a, b) => b.weight - a.weight);
  return moves.sort((a, b) => b.weight - a.weight).slice(0, MAX_TRAVELS);
}

/**
 * How long a travel takes, in seconds.
 *
 * Distance-aware, because a card crossing the table and a card sliding into the
 * graveyard beside it should not take the same time — and clamped at both ends,
 * because a tween nobody can see is not feedback and a slow one is in the way.
 * Principle three still holds regardless: the reducer has already committed and
 * nothing waits on this.
 */
export function travelDuration(distance: number): number {
  return Math.min(0.5, Math.max(0.22, distance / 2600));
}
