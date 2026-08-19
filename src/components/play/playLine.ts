/**
 * What a seat just did, said in one sentence a player would recognise.
 *
 * Owner, about the playtest: *"cant see the users hand and how they are
 * casting"*. The hand is a rendering problem and `ViewerHand` already solves
 * it. "How they are casting" is this: a watcher needs to know **what** was
 * played, **from where**, and **what paid for it**, and not one of those three
 * is legible from a board that has merely changed.
 *
 * ## Why this reads the ACTION BATCH and not the board
 *
 * A cast is a batch: `TAP` every land the payment planner chose, then `PLAY`
 * (or `CAST_SPELL`) the card. `moves.ts` builds it, `bot.ts` returns it, the
 * driver applies it. The batch already contains the whole answer, in the
 * engine's own words.
 *
 * Rebuilding the same sentence from a state diff would be a guess, and worse, a
 * guess that is right on one surface and wrong on the other: the playtest
 * driver applies a batch in a single transition, so a diff would see the taps
 * and the cast together, while `/play` sends each action down the transport on
 * its own, so a diff would see them apart. One of the two would quietly
 * attribute the wrong lands to a spell. Project law: nothing fabricated. The
 * sentence is therefore built from the decision itself, which cannot be wrong
 * about its own contents.
 *
 * The `state` handed in is the state the batch is about to be applied to. The
 * cards are still in the zones they are leaving, which is the only reason
 * "from hand" and the names of the lands being tapped are readable at all.
 *
 * ## Person
 *
 * A seat the viewer is sitting in is called "You", so a third-person verb
 * pinned to it reads "You casts Grizzly Bears". That exact bug shipped once
 * already, in the cast spotlight ("You resolves onto the battlefield"), so the
 * verb agrees with the subject here by construction rather than by luck.
 *
 * Copy rules apply throughout: no jargon, no em-dashes.
 */

import {
  isLand,
  // Relative rather than the `@/` alias, for the reason `cardActions.ts` gives:
  // `node --test` has no bundler to resolve an alias with.
  type CardInstance,
  type GameAction,
  type GameState,
  type InstanceId,
  type PlayerId,
  type Zone,
} from '../../lib/game/index.ts';

/** The kind of thing a batch turned out to be. */
export type PlayLineKind = 'land' | 'cast' | 'attack' | 'block' | 'move';

export interface PlayLine {
  /** The seat that made the decision. */
  actorId: PlayerId;
  kind: PlayLineKind;
  /** The card at the centre of it, when there is one. */
  instanceId: InstanceId | null;
  /** Where that card was before the batch. */
  from: Zone | null;
  /** Names of the permanents this batch tapped to pay for it, in batch order. */
  paidWith: string[];
  /** The whole thing as one sentence, ready to render. */
  text: string;
}

export interface PlayLineOptions {
  /** The seat the reader is sitting in, so the sentence can say "You". */
  viewerPlayerId?: PlayerId;
}

/** "a, b and c" — a list a person reads, rather than "a, b, c". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const ZONE_PHRASE: Partial<Record<Zone, string>> = {
  hand: 'from hand',
  command: 'from the command zone',
  graveyard: 'from the graveyard',
  exile: 'from exile',
  library: 'from the library',
};

/**
 * Where a card was put, in the words a player uses for the place.
 *
 * The raw zone name is an engine identifier, not English: "moves Rumbling
 * Baloth to the command" and "to the library" both shipped in the watched feed
 * because the zone was interpolated straight into the sentence. Copy rules: no
 * jargon.
 */
const ZONE_DESTINATION: Record<Zone, string> = {
  library: 'the top of the library',
  hand: 'hand',
  battlefield: 'the battlefield',
  graveyard: 'the graveyard',
  exile: 'exile',
  command: 'the command zone',
  stack: 'the stack',
};

/**
 * The permanents a batch taps, in the order it taps them, named off the state
 * they are being tapped in.
 *
 * Only taps that come BEFORE the play count. Attacking taps the creature too,
 * and a tap after the fact is not what paid for anything, so reading the whole
 * batch would invent a cost.
 */
function paymentNames(state: GameState, actions: readonly GameAction[], upTo: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < upTo; i++) {
    const action = actions[i];
    if (action.type !== 'TAP') continue;
    const card = state.cards[action.instanceId];
    if (card) names.push(card.name);
  }
  return names;
}

/**
 * One decision, as a sentence. Null when the batch is turn structure rather
 * than a play, which is most batches and none of what a watcher is here for.
 */
export function describePlay(
  state: GameState,
  actorId: PlayerId,
  actions: readonly GameAction[],
  options: PlayLineOptions = {}
): PlayLine | null {
  const mine = options.viewerPlayerId === actorId;
  const who = mine ? 'You' : state.players.find(p => p.id === actorId)?.name ?? 'A player';
  /** Third person needs the s; second person must not have it. */
  const verb = (base: string) => (mine ? base : `${base}s`);

  /* ---------------------------------------------------------------------- */
  /* Combat                                                                 */
  /* ---------------------------------------------------------------------- */

  const attack = actions.find(action => action.type === 'ATTACK');
  if (attack && attack.type === 'ATTACK' && attack.attackers.length > 0) {
    const names = attack.attackers
      .map(entry => state.cards[entry.attackerId]?.name)
      .filter((name): name is string => !!name);
    const first = attack.attackers[0];
    const target = first.defenderPlayerId
      ? state.players.find(player => player.id === first.defenderPlayerId)?.name
      : first.defenderInstanceId
        ? state.cards[first.defenderInstanceId]?.name
        : null;
    if (names.length === 0) return null;
    return {
      actorId,
      kind: 'attack',
      instanceId: first.attackerId,
      from: 'battlefield',
      paidWith: [],
      text: `${who} ${verb('attack')}${target ? ` ${target}` : ''} with ${joinNames(names)}.`,
    };
  }

  const block = actions.find(action => action.type === 'BLOCK');
  if (block && block.type === 'BLOCK' && block.blocks.length > 0) {
    const pairs = block.blocks
      .map(entry => {
        const blocker = state.cards[entry.blockerId]?.name;
        const attacker = state.cards[entry.attackerId]?.name;
        return blocker && attacker ? `${blocker} blocks ${attacker}` : null;
      })
      .filter((pair): pair is string => !!pair);
    if (pairs.length === 0) return null;
    return {
      actorId,
      kind: 'block',
      instanceId: block.blocks[0].blockerId,
      from: 'battlefield',
      paidWith: [],
      text: `${who}: ${joinNames(pairs)}.`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Playing a card                                                         */
  /* ---------------------------------------------------------------------- */

  const playIndex = actions.findIndex(
    action => action.type === 'PLAY' || action.type === 'CAST_SPELL'
  );
  if (playIndex !== -1) {
    const play = actions[playIndex] as Extract<GameAction, { type: 'PLAY' | 'CAST_SPELL' }>;
    const card: CardInstance | undefined = state.cards[play.instanceId];
    if (!card) return null;

    const from = card.zone;
    const where = ZONE_PHRASE[from] ?? '';
    const paidWith = paymentNames(state, actions, playIndex);

    if (isLand(card)) {
      return {
        actorId,
        kind: 'land',
        instanceId: card.instanceId,
        from,
        paidWith,
        text: `${who} ${verb('play')} ${card.name}${where ? ` ${where}` : ''}.`,
      };
    }

    const payment = paidWith.length > 0 ? `, tapping ${joinNames(paidWith)}` : '';
    /* Said out loud because it is the commonest confusion in a watched game: a
       spell nothing was tapped for looks identical to one that was paid for,
       and not being able to tell is exactly what was reported. */
    const free = paidWith.length === 0 && !!card.manaCost && card.manaCost.trim().length > 0;

    return {
      actorId,
      kind: 'cast',
      instanceId: card.instanceId,
      from,
      paidWith,
      text:
        `${who} ${verb('cast')} ${card.name}${where ? ` ${where}` : ''}${payment}` +
        `${free ? ', paying nothing' : ''}.`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Everything else worth a line                                           */
  /* ---------------------------------------------------------------------- */

  const move = actions.find(action => action.type === 'MOVE_ZONE');
  if (move && move.type === 'MOVE_ZONE') {
    const card = state.cards[move.instanceId];
    if (!card) return null;
    return {
      actorId,
      kind: 'move',
      instanceId: card.instanceId,
      from: card.zone,
      paidWith: [],
      text: `${who} ${verb('move')} ${card.name} to ${ZONE_DESTINATION[move.to]}.`,
    };
  }

  return null;
}
