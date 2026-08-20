/**
 * DeckMatrix — shared game-state core: the command zone (CR 903).
 *
 * ## What was missing, measured before a line of this was written
 *
 * This app is built around Commander, and the harness had never once played
 * the format's own loop. Over 80 recorded games (seed 5000, 40 commander and
 * 40 sixty, replayed through the real reducer):
 *
 *   a commander left the command zone            78
 *     of those, commander tax was charged         0
 *   `CAST_COMMANDER` actions applied              0
 *   a commander died to a graveyard or exile     24
 *   a commander returned to the command zone      0
 *   a commander stranded in a graveyard or
 *     exile when the game ended                  25
 *
 * Those numbers are one fact, not five. CR 903.9a — a commander that would be
 * put into a graveyard or exile may be put into the command zone instead — had
 * no implementation and no control, so a commander that died was gone for the
 * rest of the game. Nothing came back, so nothing was ever cast a second time,
 * so `commanderTax` ran on every cast and returned zero every time. The tax
 * code was correct, tested, and had never charged a single generic mana in a
 * real game, because the only situation that produces tax could not occur.
 *
 * That is the shape `CLAUDE.md` describes: "the engine supports it" and "a
 * player can do it" are different claims. `cardActions.ts` did not even list
 * `command` among the zones a card can be moved to by hand, so there was no
 * back door either.
 *
 * ## The choice is offered, never taken for the player
 *
 * CR 903.9a says *may*. A commander in a graveyard is sometimes exactly where
 * its owner wants it — a reanimator deck, a "return from your graveyard"
 * payoff, or simply refusing to pay two more mana. So `commanderZoneOffers`
 * returns the offer and the sentence explaining it, and the caller decides.
 * `bot.ts` answers it the way a person almost always would; a human seat is
 * shown both choices and neither is pressed for them.
 *
 * The mechanism is deliberately NOT `replacement.ts`. CR 614 replacement
 * effects in this engine rewrite an action before it reduces, inside a pure
 * function with no way to stop and ask anybody anything; a "may" that the
 * reducer has to answer on the player's behalf is the reducer deciding. So the
 * commander goes where the game sent it and the offer stands afterwards, which
 * is a real difference from the printed rule and is worth naming: a card that
 * would trigger on "whenever a card is put into your graveyard" sees the
 * commander arrive here, and would not under a true replacement. Everything a
 * seat can observe about the commander's own fate is identical.
 *
 * ## Commander tax lives in exactly one place
 *
 * `CAST_COMMANDER` is now built by `moves.ts` as part of the cast batch, and it
 * is the only thing that counts a cast. The reducer used to bump the count as a
 * side effect of `PLAY` and `CAST_SPELL` whenever the card happened to be in the
 * command zone, which meant the count could not be read off the action log and
 * any free "put this onto the battlefield" effect would have charged tax for a
 * cast that never happened.
 *
 * Pure: no clock, no randomness, no I/O, no React.
 */

import type {
  CardInstance,
  CommanderId,
  CommanderRef,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  Zone,
} from './types.ts';
import {
  allCommanders,
  commanderDamageOn,
  commanderTax,
  findCommander,
  getCard,
  getPlayer,
} from './rules.ts';
import { castingCostOf, parseCost } from './mana.ts';

/* -------------------------------------------------------------------------- */
/* Finding a commander, from either end                                       */
/* -------------------------------------------------------------------------- */

/**
 * The `CommanderRef` a card is, or undefined when the card is not a commander.
 *
 * `CardInstance.isCommander` and `CommanderRef.instanceId` are two records of
 * the same fact, kept apart on purpose (the life counter has refs and no
 * cards). Everything here goes through this so the two can never be read as
 * disagreeing: a card flagged `isCommander` with no ref is not a commander for
 * tax or for CR 903.9a, because there is nothing to count against.
 */
export function commanderRefOf(
  state: GameState,
  card: CardInstance | null | undefined
): CommanderRef | undefined {
  if (!card || !card.isCommander) return undefined;
  return allCommanders(state).find(ref => ref.instanceId === card.instanceId);
}

/** The card a `CommanderRef` points at. Absent in life-counter mode. */
export function commanderCardOf(
  state: GameState,
  commanderId: CommanderId
): CardInstance | undefined {
  const ref = findCommander(state, commanderId);
  if (!ref?.instanceId) return undefined;
  return getCard(state, ref.instanceId);
}

/** Every commander of `playerId` that is sitting in the command zone right now. */
export function commandZoneCards(state: GameState, playerId: PlayerId): CardInstance[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return (player.zones.command ?? []).map(id => state.cards[id]).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* CR 903.8 — the tax, and why it went up                                     */
/* -------------------------------------------------------------------------- */

/**
 * What this commander costs from the command zone, and the reason it costs
 * that.
 *
 * The `why` sentence is the point. A player who sees a commander cost nine mana
 * and has no way to find out that four of it is tax from two previous casts is
 * being asked to trust a number, and this project's rule is that the engine
 * never asks to be trusted.
 */
export interface CommanderCost {
  commanderId: CommanderId;
  instanceId?: InstanceId;
  name: string;
  /** The printed cost string, for `ManaCost`. Never printed as text. */
  printedCost: string;
  /** Mana value of the printed cost alone. */
  printedMana: number;
  /** Casts from the command zone so far. */
  casts: number;
  /** Generic mana each previous cast adds. 2 in Commander. */
  perCast: number;
  /** `casts * perCast`. Zero on the first cast, which is the common case. */
  tax: number;
  /** Printed mana plus tax: what a payment has to find. */
  totalMana: number;
  /** One sentence a player can read. Empty when there is no tax yet. */
  why: string;
}

/** Plural without a lookup table, and without "1 times". */
function times(count: number): string {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  return `${count} times`;
}

export function commanderCost(state: GameState, commanderId: CommanderId): CommanderCost | null {
  const ref = findCommander(state, commanderId);
  if (!ref) return null;

  const card = ref.instanceId ? getCard(state, ref.instanceId) : undefined;
  const printedCost = card ? castingCostOf(card) : '';
  const printedMana = parseCost(printedCost).total;
  const perCast = state.rules.commanderTaxPerCast;
  const tax = commanderTax(state, commanderId);

  return {
    commanderId,
    instanceId: ref.instanceId,
    name: ref.name,
    printedCost,
    printedMana,
    casts: ref.castCount,
    perCast,
    tax,
    totalMana: printedMana + tax,
    /* Plain words, and no `{2}` anywhere in it. A cost string belongs in
       `ManaCost`, never printed as text, which is the rule the whole app
       keeps and which this sentence broke on its first run. */
    why:
      tax > 0
        ? `Cast from the command zone ${times(ref.castCount)} already. ` +
          `Each of those adds ${perCast} mana, so this cast costs ${tax} more mana.`
        : '',
  };
}

/**
 * The tax on a card, found through its ref. Zero for anything that is not a
 * commander sitting in the command zone, which is the rule `moves.ts` charges
 * by: tax is paid to cast a commander FROM the command zone (CR 903.8) and not
 * to cast the same card off the top of a library.
 */
export function taxForCard(state: GameState, card: CardInstance | null | undefined): number {
  if (!card || card.zone !== 'command') return 0;
  const ref = commanderRefOf(state, card);
  return ref ? commanderTax(state, ref.id) : 0;
}

/**
 * The announcement action for casting a commander from the command zone.
 *
 * Returned as a list so a caller can splice it into a batch without a null
 * check, and empty for any card that is not a commander leaving the command
 * zone — which is what makes it safe to call unconditionally from the one cast
 * path in `moves.ts`.
 */
export function announceCommanderCast(
  state: GameState,
  card: CardInstance | null | undefined,
  at = 0
): GameAction[] {
  if (!card || card.zone !== 'command') return [];
  const ref = commanderRefOf(state, card);
  if (!ref) return [];
  return [{ type: 'CAST_COMMANDER', commanderId: ref.id, instanceId: card.instanceId, at }];
}

/* -------------------------------------------------------------------------- */
/* CR 903.9a — the choice a player makes when a commander dies                */
/* -------------------------------------------------------------------------- */

/** The zones CR 903.9a covers. Hand and library were removed from the rule. */
const RECOVERABLE: readonly Zone[] = ['graveyard', 'exile'];

export interface CommanderZoneOffer {
  commanderId: CommanderId;
  instanceId: InstanceId;
  name: string;
  /** Where it is now. */
  from: Zone;
  /** What pressing the offer does. Feed to `applyActions`. */
  actions: GameAction[];
  /** The rule, in one sentence, for the control that offers it. */
  reason: string;
  /** What the NEXT cast will cost if this is taken. Reads ahead, changes nothing. */
  nextCastMana: number;
  /** Generic mana the next cast adds over the printed cost. */
  nextCastTax: number;
}

/**
 * Every commander of `playerId` that CR 903.9a lets them put into the command
 * zone right now, with the cost of getting it back onto the battlefield.
 *
 * The cost is included because it is half the decision. "Put it back" and "put
 * it back and it now costs nine" are different offers, and a control that shows
 * only the first is hiding the part the player would want.
 */
export function commanderZoneOffers(state: GameState, playerId: PlayerId): CommanderZoneOffer[] {
  const player = getPlayer(state, playerId);
  if (!player || !state.rules.usesCommandZone) return [];

  const offers: CommanderZoneOffer[] = [];
  for (const ref of player.commanders) {
    if (!ref.instanceId) continue;
    const card = getCard(state, ref.instanceId);
    if (!card || card.removedFromGame) continue;
    if (!RECOVERABLE.includes(card.zone)) continue;
    // A commander is put into ITS OWNER's command zone. A card that somehow
    // belongs to somebody else is not this player's to move.
    if (card.ownerId !== playerId) continue;

    const cost = commanderCost(state, ref.id);
    /* `castCount` already counts the cast that put this commander on the
       battlefield, so the tax on the NEXT cast is `castCount * perCast`. It was
       written `(castCount + 1) * perCast` first, which quoted 4 instead of 2 on
       a commander that had been cast once, and the test caught it. */
    const nextTax = commanderTax(state, ref.id);

    offers.push({
      commanderId: ref.id,
      instanceId: ref.instanceId,
      name: ref.name,
      from: card.zone,
      actions: [{ type: 'MOVE_ZONE', instanceId: ref.instanceId, to: 'command' }],
      reason:
        `${ref.name} is in your ${card.zone}. A commander that would go to a graveyard or ` +
        `exile may go to the command zone instead (CR 903.9a). It is your choice, so nothing ` +
        `happens until you pick one.`,
      nextCastMana: (cost?.printedMana ?? 0) + nextTax,
      nextCastTax: nextTax,
    });
  }
  return offers;
}

/**
 * The offer for one specific card, or null.
 *
 * The card-shaped question, for a surface that is already looking at a card
 * rather than at a seat. It is the same list filtered, deliberately, so the two
 * can never disagree about what is offered.
 */
export function commanderZoneOfferFor(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance | null | undefined
): CommanderZoneOffer | null {
  if (!card) return null;
  return commanderZoneOffers(state, playerId).find(o => o.instanceId === card.instanceId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* CR 903.10 — the number that ends the game                                  */
/* -------------------------------------------------------------------------- */

export interface CommanderDamageRow {
  commanderId: CommanderId;
  /** The commander dealing it. */
  name: string;
  /** Whose commander it is. */
  fromPlayerId: PlayerId;
  fromPlayerName: string;
  amount: number;
  lethal: number;
  /** How much more from THIS commander would end it. Never a sum. */
  remaining: number;
  /** True once this one tally is lethal on its own. */
  fatal: boolean;
}

/**
 * Commander damage standing against `playerId`, one row per commander that has
 * dealt any, worst first.
 *
 * Per commander and never summed. 21 from one commander is lethal and 20 from
 * each of two is not, and a readout that adds them up teaches a player the
 * wrong rule at the exact moment it matters most.
 *
 * `includeZero` draws the commanders that have not connected yet as well, which
 * is what a seat wants while deciding whether to block: the row that matters is
 * often the one at 18, and the one at 0 is the reason a board looks safe.
 */
export function commanderDamageRows(
  state: GameState,
  playerId: PlayerId,
  options: { includeZero?: boolean } = {}
): CommanderDamageRow[] {
  const player = getPlayer(state, playerId);
  if (!player || !state.rules.usesCommanderDamage) return [];
  const lethal = state.rules.commanderDamageLethal;

  const rows: CommanderDamageRow[] = [];
  for (const owner of state.players) {
    if (owner.id === playerId) continue;
    for (const ref of owner.commanders) {
      const amount = commanderDamageOn(player, ref.id);
      if (amount <= 0 && !options.includeZero) continue;
      rows.push({
        commanderId: ref.id,
        name: ref.name,
        fromPlayerId: owner.id,
        fromPlayerName: owner.name,
        amount,
        lethal,
        remaining: Math.max(0, lethal - amount),
        fatal: amount >= lethal,
      });
    }
  }

  // Worst first, then a stable tiebreak so two clients agree on the order.
  return rows.sort((a, b) => b.amount - a.amount || (a.commanderId < b.commanderId ? -1 : 1));
}

/**
 * One row of `commanderDamageDealt`: the same tally read from the other end,
 * so it also names the seat TAKING it.
 */
export interface CommanderDamageDealtRow extends CommanderDamageRow {
  toPlayerId: PlayerId;
  toPlayerName: string;
}

/**
 * Damage this commander has dealt, seat by seat. The other end of the same
 * telescope: `commanderDamageRows` answers "what is going to kill me",
 * this answers "who am I close to killing".
 */
export function commanderDamageDealt(
  state: GameState,
  commanderId: CommanderId
): CommanderDamageDealtRow[] {
  const ref = findCommander(state, commanderId);
  if (!ref || !state.rules.usesCommanderDamage) return [];
  const lethal = state.rules.commanderDamageLethal;
  const owner = getPlayer(state, ref.playerId);

  return state.players
    .filter(player => player.id !== ref.playerId)
    .map(player => {
      const amount = commanderDamageOn(player, commanderId);
      return {
        commanderId,
        name: ref.name,
        fromPlayerId: ref.playerId,
        fromPlayerName: owner?.name ?? ref.playerId,
        amount,
        lethal,
        remaining: Math.max(0, lethal - amount),
        fatal: amount >= lethal,
        toPlayerId: player.id,
        toPlayerName: player.name,
      };
    })
    .sort((a, b) => b.amount - a.amount || (a.toPlayerId < b.toPlayerId ? -1 : 1));
}
