/**
 * The command zone, played out with a real Commander precon.
 *
 *   node --test --experimental-strip-types src/lib/game/commander.test.ts
 *
 * ## Why the deck is real
 *
 * Every test below is dealt from `scripts/data/precon-draconic-rage.json`: the
 * published *Draconic Rage* precon from Adventures in the Forgotten Realms,
 * 99 cards and Vrondiss, Rage of Ancients at {3}{R}{G}, frozen from the same
 * GitHub decklist `precon-api.ts` treats as canonical and joined to the
 * Scryfall bulk oracle export for keywords and current oracle text. See
 * `scripts/build-precon-deck.mjs`.
 *
 * A hand-built fixture proves the engine agrees with whoever wrote the test.
 * A precon proves it agrees with a deck somebody owns: a real mana base, a real
 * curve, and a commander whose cost was set by Wizards rather than chosen to
 * make an assertion convenient. It also means the numbers below — five mana,
 * then seven, then nine — are the numbers a player pays at a table.
 *
 * Nothing here reaches the network or the database. The decklist is committed.
 *
 * ## Where the tests start
 *
 * At the controls, not at the reducer. `reachability.test.ts` exists because a
 * suite can be green while nothing in the app ever builds the action under
 * test, so these ask `planCastFromHand` and `commanderZoneOffers` for what a
 * player could press, apply exactly the batch that comes back, and then read
 * the board.
 *
 * The measurement this file was written from, over 80 recorded harness games:
 * a commander left the command zone 78 times, commander tax was charged 0
 * times, 24 commanders died and 0 came back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAction, applyActions, getCard, getPlayer } from './rules.ts';
import { buildTable, type PlayDeck } from './setup.ts';
import { planCastFromHand } from './moves.ts';
import { nextBotMove } from './bot.ts';
import {
  commanderCost,
  commanderDamageDealt,
  commanderDamageRows,
  commanderRefOf,
  commanderZoneOfferFor,
  commanderZoneOffers,
  commandZoneCards,
  taxForCard,
} from './commander.ts';
import type { CardInstance, GameState, InstanceId, PlayerId } from './types.ts';

/* ------------------------------------------------------------------ *
 * The real deck
 * ------------------------------------------------------------------ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DECK_FILE = path.resolve(HERE, '..', '..', '..', 'scripts', 'data', 'precon-draconic-rage.json');

const PRECON: PlayDeck = JSON.parse(fs.readFileSync(DECK_FILE, 'utf8'));

test('the fixture really is a 100-card Commander precon', () => {
  assert.equal(PRECON.format, 'commander');
  assert.equal(PRECON.commanders.length, 1);
  assert.equal(PRECON.cards.length, 99);
  assert.equal(PRECON.commanders[0].name, 'Vrondiss, Rage of Ancients');
  assert.equal(PRECON.commanders[0].manaCost, '{3}{R}{G}');
  assert.ok(
    PRECON.cards.some(card => card.name === 'Mountain'),
    'a real precon has a real mana base'
  );
});

/** Two seats, both on the precon, dealt through the real setup path. */
function table(seed = 7): GameState {
  const built = buildTable({
    id: 'commander-test',
    seats: [
      { deck: PRECON, playerName: 'You' },
      { deck: PRECON, playerName: 'Bot', isBot: true },
    ],
    format: 'commander',
    seed,
    now: 0,
  });
  return { ...built.state, step: 'precombat_main' };
}

const commanderOf = (state: GameState, playerId: PlayerId): CardInstance => {
  const [card] = commandZoneCards(state, playerId);
  assert.ok(card, `${playerId} has no commander in the command zone`);
  return card;
};

const refIdOf = (state: GameState, playerId: PlayerId): string => {
  const player = getPlayer(state, playerId);
  assert.ok(player?.commanders[0], 'no commander ref');
  return player.commanders[0].id;
};

const messages = (state: GameState): string[] => state.log.map(entry => entry.message);
const said = (state: GameState, fragment: string): boolean =>
  messages(state).some(m => m.toLowerCase().includes(fragment.toLowerCase()));

/**
 * Put `count` untapped Mountains from this seat's own library onto the
 * battlefield.
 *
 * The lands are the precon's real Mountains rather than invented Forests, and
 * they arrive by `MOVE_ZONE`, which is the action the mat's own "To battlefield"
 * control builds. Nothing about the CAST being measured is faked.
 */
function withMountains(state: GameState, playerId: PlayerId, count: number): GameState {
  const player = getPlayer(state, playerId);
  assert.ok(player);
  const ids = player.zones.library.filter(id => {
    const card = state.cards[id];
    return card && (card.name === 'Mountain' || card.name === 'Forest');
  });
  assert.ok(ids.length >= count, `only ${ids.length} basics left in the library`);
  let next = state;
  for (let i = 0; i < count; i++) {
    next = applyAction(next, { type: 'MOVE_ZONE', instanceId: ids[i], to: 'battlefield' });
  }
  return next;
}

/** Cast the commander from the command zone exactly as the preview's button does. */
function castCommander(state: GameState, playerId: PlayerId) {
  const card = commanderOf(state, playerId);
  const plan = planCastFromHand(state, playerId, card.instanceId);
  return { card, plan, next: plan.ok ? applyActions(state, plan.actions) : state };
}

/** Send a card to a zone the way an effect would. */
function send(state: GameState, instanceId: InstanceId, to: 'graveyard' | 'exile'): GameState {
  return applyAction(state, { type: 'MOVE_ZONE', instanceId, to });
}

/* ------------------------------------------------------------------ *
 * It starts in the command zone and it is castable
 * ------------------------------------------------------------------ */

test('the precon deals its commander into the command zone, not the library', () => {
  const state = table();
  const card = commanderOf(state, 'p1');

  assert.equal(card.name, 'Vrondiss, Rage of Ancients');
  assert.equal(card.zone, 'command');
  assert.equal(card.isCommander, true);
  assert.ok(
    !getPlayer(state, 'p1')!.zones.library.includes(card.instanceId),
    'the commander must not also be in the library'
  );
  // The ref and the card are the same object from the first frame.
  assert.equal(commanderRefOf(state, card)?.name, 'Vrondiss, Rage of Ancients');
});

test('the first cast costs the printed cost and no more', () => {
  const state = withMountains(table(), 'p1', 5);
  const cost = commanderCost(state, refIdOf(state, 'p1'));

  assert.ok(cost);
  assert.equal(cost.printedCost, '{3}{R}{G}');
  assert.equal(cost.printedMana, 5);
  assert.equal(cost.casts, 0);
  assert.equal(cost.tax, 0);
  assert.equal(cost.totalMana, 5);
  assert.equal(cost.why, '', 'there is no reason to give when there is no tax');

  const { plan } = castCommander(state, 'p1');
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.tax, 0);
  assert.equal(plan.payment.required, 5);
  assert.equal(plan.payment.tapIds.length, 5);
});

test('casting the commander builds a CAST_COMMANDER a player can reach', () => {
  const state = withMountains(table(), 'p1', 5);
  const { plan, next } = castCommander(state, 'p1');

  const announcement = plan.actions.find(action => action.type === 'CAST_COMMANDER');
  assert.ok(announcement, `no announcement in ${plan.actions.map(a => a.type).join(', ')}`);
  assert.equal(
    plan.actions.indexOf(announcement),
    plan.actions.length - 2,
    'the announcement comes immediately before the play, while the card is still in the command zone'
  );

  const card = getCard(next, commanderOf(state, 'p1').instanceId);
  assert.equal(card?.zone, 'battlefield');
  assert.equal(card?.castCount, 1, 'the card counts its own casts');
  assert.equal(getPlayer(next, 'p1')!.commanders[0].castCount, 1, 'and so does the ref');
  assert.ok(said(next, 'cast from the command zone'));
});

/* ------------------------------------------------------------------ *
 * CR 903.9a — the choice
 * ------------------------------------------------------------------ */

test('a commander that dies goes to the graveyard and the engine does not move it', () => {
  let state = withMountains(table(), 'p1', 5);
  const id = commanderOf(state, 'p1').instanceId;
  state = castCommander(state, 'p1').next;
  state = send(state, id, 'graveyard');

  assert.equal(
    getCard(state, id)?.zone,
    'graveyard',
    'CR 903.9a is a may, so nothing happens until somebody chooses'
  );
  assert.equal(commandZoneCards(state, 'p1').length, 0);
});

test('the offer is there, it names the rule, and it prices the next cast', () => {
  let state = withMountains(table(), 'p1', 5);
  const id = commanderOf(state, 'p1').instanceId;
  state = castCommander(state, 'p1').next;
  state = send(state, id, 'graveyard');

  const [offer] = commanderZoneOffers(state, 'p1');
  assert.ok(offer, 'no offer for a commander sitting in a graveyard');
  assert.equal(offer.instanceId, id);
  assert.equal(offer.from, 'graveyard');
  assert.match(offer.reason, /903\.9a/);
  assert.match(offer.reason, /your choice/i);
  // Printed 5, plus 2 for the cast that already happened.
  assert.equal(offer.nextCastTax, 2);
  assert.equal(offer.nextCastMana, 7);
});

test('taking the offer puts it in the command zone and the log says which choice was made', () => {
  let state = withMountains(table(), 'p1', 5);
  const id = commanderOf(state, 'p1').instanceId;
  state = castCommander(state, 'p1').next;
  state = send(state, id, 'graveyard');

  const [offer] = commanderZoneOffers(state, 'p1');
  state = applyActions(state, offer.actions);

  assert.equal(getCard(state, id)?.zone, 'command');
  assert.ok(!getPlayer(state, 'p1')!.zones.graveyard.includes(id));
  assert.ok(said(state, '903.9a'));
  assert.ok(said(state, 'instead of staying there'));
  assert.deepEqual(commanderZoneOffers(state, 'p1'), [], 'the offer is spent');
});

test('exile is covered as well as a graveyard', () => {
  let state = withMountains(table(), 'p1', 5);
  const id = commanderOf(state, 'p1').instanceId;
  state = castCommander(state, 'p1').next;
  state = send(state, id, 'exile');

  const [offer] = commanderZoneOffers(state, 'p1');
  assert.ok(offer, 'CR 903.9a covers exile, not only a graveyard');
  assert.equal(offer.from, 'exile');
});

test('nothing is offered while the commander is somewhere the rule does not reach', () => {
  const state = table();
  const id = commanderOf(state, 'p1').instanceId;

  // In the command zone already.
  assert.deepEqual(commanderZoneOffers(state, 'p1'), []);

  // On the battlefield.
  const played = applyActions(withMountains(state, 'p1', 5), castCommander(withMountains(state, 'p1', 5), 'p1').plan.actions);
  assert.deepEqual(commanderZoneOffers(played, 'p1'), []);

  // In hand, which the 2020 rules change took out of CR 903.9a.
  const inHand = applyAction(state, { type: 'MOVE_ZONE', instanceId: id, to: 'hand' });
  assert.deepEqual(commanderZoneOffers(inHand, 'p1'), []);

  // In the library.
  const inLibrary = applyAction(state, { type: 'MOVE_ZONE', instanceId: id, to: 'library' });
  assert.deepEqual(commanderZoneOffers(inLibrary, 'p1'), []);
});

test('the offer is only ever your own commander', () => {
  let state = withMountains(table(), 'p2', 5);
  const id = commanderOf(state, 'p2').instanceId;
  state = castCommander(state, 'p2').next;
  state = send(state, id, 'graveyard');

  assert.deepEqual(commanderZoneOffers(state, 'p1'), [], 'p1 cannot move p2 commander');
  assert.equal(commanderZoneOffers(state, 'p2').length, 1);
});

test('a card that has left the game is not offered back', () => {
  let state = withMountains(table(), 'p1', 5);
  const id = commanderOf(state, 'p1').instanceId;
  state = castCommander(state, 'p1').next;
  state = send(state, id, 'exile');
  state = {
    ...state,
    cards: { ...state.cards, [id]: { ...state.cards[id], removedFromGame: true } },
  };

  assert.deepEqual(commanderZoneOffers(state, 'p1'), []);
});

/* ------------------------------------------------------------------ *
 * CR 903.8 — the tax, charged in real mana
 * ------------------------------------------------------------------ */

/** One full loop: cast it, kill it, take it back. */
function recycle(state: GameState, playerId: PlayerId): GameState {
  const card = commanderOf(state, playerId);
  const plan = planCastFromHand(state, playerId, card.instanceId);
  assert.equal(plan.ok, true, `could not cast: ${plan.reason}`);
  let next = applyActions(state, plan.actions);
  next = send(next, card.instanceId, 'graveyard');
  const [offer] = commanderZoneOffers(next, playerId);
  assert.ok(offer);
  return applyActions(next, offer.actions);
}

test('the second cast costs two more mana, and the third costs four more', () => {
  // 21 lands, because the three casts together want 5 + 7 + 9.
  let state = withMountains(table(), 'p1', 21);
  const refId = refIdOf(state, 'p1');

  state = recycle(state, 'p1');
  const second = commanderCost(state, refId);
  assert.equal(second?.casts, 1);
  assert.equal(second?.tax, 2);
  assert.equal(second?.totalMana, 7);
  assert.match(second!.why, /once already/i);
  assert.match(second!.why, /2 more mana/);

  state = recycle(state, 'p1');
  const third = commanderCost(state, refId);
  assert.equal(third?.casts, 2);
  assert.equal(third?.tax, 4);
  assert.equal(third?.totalMana, 9);
  assert.match(third!.why, /twice already/i);
});

test('the tax is real mana: six lands is not enough for the second cast, seven is', () => {
  let state = withMountains(table(), 'p1', 5);
  state = recycle(state, 'p1');

  const card = commanderOf(state, 'p1');
  assert.equal(taxForCard(state, card), 2);

  // Five lands were tapped paying for the first cast, so nothing is untapped.
  const short = planCastFromHand(state, 'p1', card.instanceId);
  assert.equal(short.ok, false);
  assert.equal(short.tax, 2, 'a refusal still knows what the tax was');

  const withSix = withMountains(state, 'p1', 6);
  const stillShort = planCastFromHand(withSix, 'p1', card.instanceId);
  assert.equal(stillShort.ok, false, 'six mana does not pay a seven mana commander');
  assert.match(stillShort.reason, /\b7\b/, `the refusal names the shortfall: ${stillShort.reason}`);

  const withSeven = withMountains(state, 'p1', 7);
  const paid = planCastFromHand(withSeven, 'p1', card.instanceId);
  assert.equal(paid.ok, true, paid.reason);
  assert.equal(paid.payment.required, 7);
  assert.equal(paid.payment.tapIds.length, 7, 'seven lands tapped, not five');
});

test('the log says how much of the cost was tax', () => {
  let state = withMountains(table(), 'p1', 12);
  state = recycle(state, 'p1');
  const { next } = castCommander(state, 'p1');
  assert.ok(
    said(next, '2 more mana for the previous cast'),
    `log was: ${messages(next).slice(-4).join(' | ')}`
  );
});

test('putting the commander into play WITHOUT casting it charges no tax', () => {
  const state = withMountains(table(), 'p1', 5);
  const card = commanderOf(state, 'p1');

  // The mat's own "To battlefield" control, which is not a cast.
  const moved = applyAction(state, { type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'battlefield' });
  assert.equal(getCard(moved, card.instanceId)?.zone, 'battlefield');
  assert.equal(
    getPlayer(moved, 'p1')!.commanders[0].castCount,
    0,
    'CR 903.8 counts casts, and this was not one'
  );

  // Straight back to the command zone: the next real cast is still the first.
  const back = applyAction(moved, { type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'command' });
  assert.equal(commanderCost(back, refIdOf(back, 'p1'))?.tax, 0);
});

test('a commander cast from hand pays no commander tax', () => {
  let state = withMountains(table(), 'p1', 12);
  state = recycle(state, 'p1');
  const card = commanderOf(state, 'p1');
  assert.equal(taxForCard(state, card), 2);

  // Bounced to hand rather than to the command zone. CR 903.8 taxes casts FROM
  // the command zone, so this one is the printed cost.
  const inHand = applyAction(state, { type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'hand' });
  assert.equal(taxForCard(inHand, getCard(inHand, card.instanceId)), 0);

  const plan = planCastFromHand(inHand, 'p1', card.instanceId);
  assert.equal(plan.tax, 0);
  assert.equal(plan.payment.required, 5);
  assert.ok(
    !plan.actions.some(action => action.type === 'CAST_COMMANDER'),
    'a cast from hand is not a cast from the command zone'
  );
});

/* ------------------------------------------------------------------ *
 * CR 903.10 — twenty-one from one commander
 * ------------------------------------------------------------------ */

/**
 * A three-seat pod, because "20 from each of two commanders is not lethal"
 * cannot be asked of a table that only holds one opposing commander.
 */
function pod(seed = 11): GameState {
  const built = buildTable({
    seats: [
      { deck: PRECON, playerName: 'You' },
      { deck: PRECON, playerName: 'Left', isBot: true },
      { deck: PRECON, playerName: 'Right', isBot: true },
    ],
    format: 'commander',
    seed,
    now: 0,
  });
  return { ...built.state, step: 'precombat_main' };
}

test('commander damage is tracked per commander and is never summed', () => {
  const state = pod();
  const left = refIdOf(state, 'p2');
  const right = refIdOf(state, 'p3');

  /*
   * Twenty from each of two commanders, and the life put back.
   *
   * Commander damage is combat damage as well as a tally (CR 903.10a), so 40 of
   * it also empties a 40 life total, and a player who died of that would prove
   * nothing about this rule. Gaining the life back is an ordinary thing that
   * happens in a game, and it isolates the only question being asked: is 20
   * plus 20 from two different commanders lethal. It must not be.
   */
  let split = applyActions(state, [
    { type: 'COMMANDER_DAMAGE', targetPlayerId: 'p1', commanderId: left, amount: 20 },
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: 20 },
    { type: 'COMMANDER_DAMAGE', targetPlayerId: 'p1', commanderId: right, amount: 20 },
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: 20 },
  ]);

  assert.equal(getPlayer(split, 'p1')!.life, 40);
  const rows = commanderDamageRows(split, 'p1');
  assert.equal(rows.length, 2, 'one row per commander, never one total');
  assert.ok(rows.every(row => row.amount === 20 && row.remaining === 1 && !row.fatal));
  assert.equal(
    getPlayer(split, 'p1')!.hasLost,
    false,
    '40 commander damage spread over two commanders is not lethal'
  );

  // One more from either of them is.
  split = applyActions(split, [
    { type: 'COMMANDER_DAMAGE', targetPlayerId: 'p1', commanderId: left, amount: 1 },
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: 1 },
  ]);
  const after = commanderDamageRows(split, 'p1');
  assert.equal(after[0].amount, 21);
  assert.equal(after[0].remaining, 0);
  assert.equal(after[0].fatal, true);
  assert.equal(getPlayer(split, 'p1')!.life, 40, 'the life total is untouched, so this is the rule');
  assert.equal(getPlayer(split, 'p1')!.hasLost, true);
  assert.ok(getPlayer(split, 'p1')!.lossReasons.includes('commander_damage'));
});

test('a commander does not tally damage against its own controller', () => {
  const state = table();
  const mine = refIdOf(state, 'p1');
  const hit = applyActions(state, [
    { type: 'COMMANDER_DAMAGE', targetPlayerId: 'p1', commanderId: mine, amount: 20 },
    { type: 'LIFE_CHANGE', playerId: 'p1', delta: 20 },
  ]);
  assert.deepEqual(
    commanderDamageRows(hit, 'p1'),
    [],
    'your own commander is not a thing you can lose to'
  );
});

test('a row names the commander and the seat it came from', () => {
  const state = table();
  const theirs = refIdOf(state, 'p2');
  const hit = applyAction(state, {
    type: 'COMMANDER_DAMAGE',
    targetPlayerId: 'p1',
    commanderId: theirs,
    amount: 5,
  });

  const [row] = commanderDamageRows(hit, 'p1');
  assert.equal(row.name, 'Vrondiss, Rage of Ancients');
  assert.equal(row.fromPlayerName, 'Bot');
  assert.equal(row.lethal, 21);
  assert.equal(row.remaining, 16);

  // The other direction: who is this commander close to killing.
  const dealt = commanderDamageDealt(hit, theirs);
  assert.equal(dealt.length, 1);
  assert.equal(dealt[0].amount, 5);
  assert.equal(dealt[0].remaining, 16);
});

test('a seat with nothing against it has no rows, and asking for zeroes gives the board', () => {
  const state = table();
  assert.deepEqual(commanderDamageRows(state, 'p1'), []);
  const all = commanderDamageRows(state, 'p1', { includeZero: true });
  assert.equal(all.length, 1);
  assert.equal(all[0].amount, 0);
  assert.equal(all[0].remaining, 21);
});

/* ------------------------------------------------------------------ *
 * The bot plays the format
 * ------------------------------------------------------------------ */

test('the bot takes the CR 903.9a offer and can then recast', () => {
  let state = withMountains(table(), 'p2', 12);
  state = { ...state, activePlayerId: 'p2', priorityPlayerId: 'p2', step: 'precombat_main' };
  const id = commanderOf(state, 'p2').instanceId;

  state = applyActions(state, planCastFromHand(state, 'p2', id).actions);
  state = send(state, id, 'graveyard');

  const move = nextBotMove(state, 'p2', { at: 1 });
  assert.ok(move, 'the bot had no move with its commander in the graveyard');
  assert.ok(
    move.actions.some(action => action.type === 'MOVE_ZONE' && action.to === 'command'),
    `the bot did not take the offer: ${move.note}`
  );
  assert.match(move.note, /command zone/i);

  const back = applyActions(state, move.actions);
  assert.equal(getCard(back, id)?.zone, 'command');
  assert.equal(commanderCost(back, refIdOf(back, 'p2'))?.tax, 2);
});

test('the bot casts its commander from the command zone, and pays the tax when there is one', () => {
  let state = withMountains(table(), 'p2', 21);
  state = { ...state, activePlayerId: 'p2', priorityPlayerId: 'p2', step: 'precombat_main' };
  state = recycle(state, 'p2');

  // The land drop is taken first on a precombat main, so this asks on a
  // postcombat main where the only thing left to do is cast.
  const move = nextBotMove({ ...state, step: 'postcombat_main' }, 'p2', { at: 1 });
  assert.ok(move);
  const announcement = move.actions.find(action => action.type === 'CAST_COMMANDER');
  assert.ok(announcement, `the bot cast something else: ${move.note}`);

  const after = applyActions(state, move.actions);
  assert.equal(getPlayer(after, 'p2')!.commanders[0].castCount, 2);
  assert.equal(getCard(after, commanderOf(state, 'p2').instanceId)?.zone, 'battlefield');
});

/* ------------------------------------------------------------------ *
 * Formats without a command zone
 * ------------------------------------------------------------------ */

test('a format with no command zone offers none of this', () => {
  const sixty: PlayDeck = { ...PRECON, format: 'standard', commanders: [] };
  const built = buildTable({
    seats: [
      { deck: sixty, playerName: 'You' },
      { deck: sixty, playerName: 'Bot', isBot: true },
    ],
    format: 'standard',
    seed: 3,
  });

  assert.equal(built.state.rules.usesCommandZone, false);
  assert.deepEqual(commanderZoneOffers(built.state, 'p1'), []);
  assert.deepEqual(commanderDamageRows(built.state, 'p1', { includeZero: true }), []);
  assert.equal(commandZoneCards(built.state, 'p1').length, 0);
});

/* ------------------------------------------------------------------ *
 * The card-shaped question the preview asks
 * ------------------------------------------------------------------ */

test('the card-shaped offer and the seat-shaped offer never disagree', () => {
  let state = withMountains(table(), 'p1', 5);
  const card = commanderOf(state, 'p1');
  state = castCommander(state, 'p1').next;

  assert.equal(commanderZoneOfferFor(state, 'p1', getCard(state, card.instanceId)), null);

  state = send(state, card.instanceId, 'graveyard');
  const one = commanderZoneOfferFor(state, 'p1', getCard(state, card.instanceId));
  const [many] = commanderZoneOffers(state, 'p1');
  assert.deepEqual(one, many);

  // Any other card of yours is not a commander and gets nothing.
  const other = getPlayer(state, 'p1')!.zones.hand[0];
  assert.equal(commanderZoneOfferFor(state, 'p1', getCard(state, other)), null);
});
