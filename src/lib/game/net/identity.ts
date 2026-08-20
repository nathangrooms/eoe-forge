/**
 * DeckMatrix — networked play: turning an anonymous slot into a card.
 *
 * `secrets.ts` explains why a shared `GameState` holds anonymous slots: a
 * seeded reducer reproduces every shuffle on every client, so the only way to
 * keep a library secret is never to put the cards in the state at all. That
 * leaves one question it does not answer, and this file is that answer.
 *
 * ---------------------------------------------------------------------------
 * The gap
 * ---------------------------------------------------------------------------
 * A slot has to become a real card at some point, or nobody can ever play it.
 * The reducer needs the mana cost to check a cast, the type line to know
 * whether the thing that resolved is a permanent, the power to work out combat.
 * A card called "Card" with no cost is not playable by anybody.
 *
 * So identity has to be *installed into the shared state*, and every client has
 * to install it at exactly the same point in the log, or the states diverge and
 * the whole convergence argument collapses.
 *
 * ---------------------------------------------------------------------------
 * The answer: identity rides on the batch that made it public
 * ---------------------------------------------------------------------------
 * `LogEntry.reveals` carries the identities a batch makes public, and they are
 * installed *before* that batch's actions are applied. The order inside one
 * entry is fixed and identical everywhere: reveal, then act.
 *
 * That lines the reveal up with the moment a real table would see the card:
 *
 *   you cast a spell        it goes on the stack face up, so everyone learns it
 *   you play a land         it hits the battlefield, so everyone learns it
 *   you discard             it hits the graveyard, so everyone learns it
 *   you draw                nothing is revealed to anyone but you
 *   you shuffle             everyone forgets what they knew about those slots
 *
 * A client's own hand is not in the shared state. It does not need to be: the
 * client holds it in the `Knowledge` overlay and the surface reads a
 * *projection* of state plus knowledge. The projection is for drawing and for
 * deciding what to do. It is never folded, never hashed and never sent.
 *
 * ---------------------------------------------------------------------------
 * The rule these functions enforce, in one line
 * ---------------------------------------------------------------------------
 * A card's identity goes on the wire only when it leaves a hidden zone for a
 * zone everybody can see. Not before, and not for anybody else's cards.
 */

import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  Zone,
} from '../types.ts';
import type { CardIdentity, Knowledge } from './protocol.ts';

/**
 * Zones whose contents are not on the wire.
 *
 * The same set `secrets.ts` uses. Declared once here and imported there, so a
 * zone cannot be secret to one file and public to the other.
 */
export const HIDDEN_ZONES: ReadonlySet<Zone> = new Set<Zone>(['library', 'hand']);

export function isHiddenZone(zone: Zone | undefined): boolean {
  return zone !== undefined && HIDDEN_ZONES.has(zone);
}

/* -------------------------------------------------------------------------- */
/* Installing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fill in what a set of instances actually are, returning a new state.
 *
 * Deliberately not an action and not a reducer case. It changes what a card
 * *is*, never where it is or whose turn it is, so it does not belong in the
 * rules and must not bump `version` — `version` is the logical clock the order
 * key is built from, and a client that bumped it for a reveal would sort its
 * next move differently from everybody else's.
 *
 * The identity of a card that is already known is not overwritten. A reveal is
 * a statement about a slot nobody could see; a second one for the same slot is
 * either a redelivery or a client trying to swap a card that is already on the
 * table in front of four people.
 */
export function installIdentities(
  state: GameState,
  reveals: Readonly<Record<InstanceId, CardIdentity>>
): GameState {
  const ids = Object.keys(reveals);
  if (ids.length === 0) return state;

  let cards: Record<InstanceId, CardInstance> | null = null;

  for (const instanceId of ids) {
    const held = state.cards[instanceId];
    const identity = reveals[instanceId];
    if (!held || !identity) continue;
    // Already named. Nothing to install, and nothing to be talked out of.
    if (held.cardId) continue;

    if (!cards) cards = { ...state.cards };
    cards[instanceId] = {
      ...held,
      cardId: identity.cardId,
      name: identity.name,
      manaCost: identity.manaCost,
      cmc: identity.cmc,
      typeLine: identity.typeLine,
      power: identity.power,
      toughness: identity.toughness,
      // `CardIdentity` states the wire shape in plain JSON types, so the colour
      // list arrives as strings. It is the same five letters either way.
      colorIdentity: identity.colorIdentity as CardInstance['colorIdentity'],
      imageUrl: identity.imageUrl,
      keywords: identity.keywords,
      oracleText: identity.oracleText,
      oracleId: identity.oracleId,
      // It has just been shown to the table. A face-down flag that survived
      // that would draw a card back on a board everyone can already read.
      faceDown: false,
    };
  }

  if (!cards) return state;
  return { ...state, cards };
}

/* -------------------------------------------------------------------------- */
/* Projecting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The state as this client is entitled to see it: the shared state with this
 * client's private knowledge painted on.
 *
 * FOR DRAWING AND FOR DECIDING ONLY. Never fold it, never hash it, never send
 * it. It differs on every client by design, which is the exact property the
 * shared state exists not to have.
 *
 * Returns the input by reference when the overlay adds nothing, so a board with
 * no private information does not re-render for free.
 */
export function projectForViewer(state: GameState, knowledge: Knowledge): GameState {
  const known = Object.keys(knowledge);
  if (known.length === 0) return state;

  const reveals: Record<InstanceId, CardIdentity> = {};
  let any = false;
  for (const instanceId of known) {
    const held = state.cards[instanceId];
    if (!held || held.cardId) continue;
    reveals[instanceId] = knowledge[instanceId];
    any = true;
  }
  if (!any) return state;

  const projected = installIdentities(state, reveals);
  // A card the viewer knows because it is *theirs* is still face down to the
  // table. `installIdentities` clears the flag because a public reveal has
  // genuinely turned the card over; here it has not.
  const cards = { ...projected.cards };
  for (const instanceId of Object.keys(reveals)) {
    const card = cards[instanceId];
    if (card && isHiddenZone(card.zone)) cards[instanceId] = { ...card, faceDown: true };
  }
  return { ...projected, cards };
}

/* -------------------------------------------------------------------------- */
/* Deciding what a batch reveals                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where an action puts a card, when it moves one out of where it was.
 *
 * Only the actions that can take a card out of a hidden zone are listed. An
 * action that is not here reveals nothing by definition, which is why the
 * default is "no move" rather than "assume the worst".
 */
function destinationOf(action: GameAction): { instanceId: InstanceId; to: Zone } | null {
  switch (action.type) {
    case 'PLAY':
      return { instanceId: action.instanceId, to: action.to ?? 'battlefield' };
    case 'MOVE_ZONE':
      return { instanceId: action.instanceId, to: action.to };
    case 'CAST_SPELL':
      return { instanceId: action.instanceId, to: 'stack' };
    default:
      return null;
  }
}

/**
 * The identities a batch has to carry so that every client can apply it.
 *
 * Read as a sentence: for each card this batch moves, if this client knows what
 * it is, and it is hidden now, and where it is going is not hidden, then the
 * table is about to see it and the identity travels with the move.
 *
 * Each clause is doing work. Drop "this client knows what it is" and a seat
 * starts publishing guesses about somebody else's library. Drop "hidden now"
 * and every creature that ever moves re-broadcasts its own card for no reason.
 * Drop "where it is going is not hidden" and putting a card from your hand back
 * on top of your library announces it to the table.
 *
 * Runs against a *cursor* state that is advanced action by action, because a
 * batch can move a card twice and the second move has to be judged from where
 * the first one left it.
 */
export function revealsFor(
  state: GameState,
  knowledge: Knowledge,
  actions: readonly GameAction[],
  advance: (state: GameState, action: GameAction) => GameState
): Record<InstanceId, CardIdentity> {
  const reveals: Record<InstanceId, CardIdentity> = {};
  let cursor = state;

  for (const action of actions) {
    const move = destinationOf(action);
    if (move) {
      const identity = knowledge[move.instanceId];
      const held = cursor.cards[move.instanceId];
      if (
        identity &&
        held &&
        !held.cardId &&
        isHiddenZone(held.zone) &&
        !isHiddenZone(move.to)
      ) {
        reveals[move.instanceId] = identity;
        cursor = installIdentities(cursor, { [move.instanceId]: identity });
      }
    }
    cursor = advance(cursor, action);
  }

  return reveals;
}
