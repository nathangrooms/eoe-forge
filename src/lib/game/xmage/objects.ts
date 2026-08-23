/**
 * DeckMatrix — the XMage runtime API: Game, Player and the objects on the board.
 *
 * Ported from **XMage**, MIT licensed, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. Read in place; nothing vendored. XMage's
 * display strings are not copied — those carry Wizards of the Coast rules text.
 * Log wording here is ours.
 *
 * ## The work order this file follows
 *
 * From `scripts/xmage/api-surface-typed.mjs`, run over all 7,931 XMage card
 * files that declare their own class. The top of the ranked list, keyed by
 * resolved receiver type:
 *
 *     6,445  Controllable#getControllerId
 *     6,386  Game#getPlayer
 *     3,635  MageItem#getId
 *     3,043  Game#getPermanent
 *     2,601  Ability#getSourceId
 *     1,852  Player#moveCards
 *     1,331  Game#getCard
 *     1,320  Game#getBattlefield
 *
 * `getControllerId` and `getId` are first because EVERYTHING has them, which is
 * why they are on every facade below rather than on one class.
 *
 * ## Reads are layered, not printed
 *
 * `isCreature`, `getPower`, `hasSubtype` and the rest go through
 * `characteristics.ts`, so a permanent that is a creature only because of a
 * type changing effect answers yes. Reading `CardInstance.typeLine` would give
 * the printed answer and disagree with the board on screen.
 *
 * ## Writes never mutate
 *
 * Every write appends a `GameAction` and folds it into `runtime.ts`'s working
 * copy. `permanent.destroy()` does not destroy anything; it records the
 * `MOVE_ZONE` a player could have pressed, and the reducer does the rest.
 */

import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  Zone,
} from '../types.ts';
import type { ContinuousEffect } from '../layers.ts';
import {
  colorsIn,
  isCreatureIn,
  keywordsIn,
  powerIn,
  subtypesIn,
  supertypesIn,
  toughnessIn,
  typesIn,
} from '../characteristics.ts';
import type { PredicateContext, XFilter } from './filters.ts';
import {
  askForCards,
  askFromList,
  askYesNo,
  deferHere,
  emit,
  type XmageScope,
} from './runtime.ts';

/* -------------------------------------------------------------------------- */
/* MageInt — XMage boxes power and toughness                                  */
/* -------------------------------------------------------------------------- */

/**
 * `MageInt#getValue` is rank 39 with 549 calls, because XMage bodies say
 * `permanent.getPower().getValue()` rather than `getPower()`. `null` is kept as
 * null and not flattened to 0: `characteristics.ts` returns null for an
 * unevaluated `*`, and answering 0 for Tarmogoyf is a wrong number rather than
 * a missing one.
 */
export interface XMageInt {
  getValue(): number;
  /** True when the real answer is an unevaluated `*`. Not XMage's; ours, and it is why. */
  isUnknown(): boolean;
}

function mageInt(value: number | null): XMageInt {
  return {
    getValue: () => value ?? 0,
    isUnknown: () => value === null,
  };
}

/* -------------------------------------------------------------------------- */
/* Counters                                                                   */
/* -------------------------------------------------------------------------- */

/** XMage's `CounterType.P1P1.createInstance(2)` — rank 25, 835 calls. Pure data. */
export interface XCounter {
  name: string;
  count: number;
}

export const CounterType = {
  /** `CounterType.P1P1` etc. resolve to the counter NAME this engine stores. */
  of(name: string) {
    return {
      name,
      createInstance(count = 1): XCounter {
        return { name, count };
      },
    };
  },
  P1P1: { name: '+1/+1', createInstance: (count = 1): XCounter => ({ name: '+1/+1', count }) },
  M1M1: { name: '-1/-1', createInstance: (count = 1): XCounter => ({ name: '-1/-1', count }) },
  LOYALTY: { name: 'loyalty', createInstance: (count = 1): XCounter => ({ name: 'loyalty', count }) },
  CHARGE: { name: 'charge', createInstance: (count = 1): XCounter => ({ name: 'charge', count }) },
};

/** XMage's `Counters#getCount` — rank 111, 218 calls. */
export interface XCounters {
  getCount(counter: string | { name: string }): number;
  /** Every counter on the object, name to number. */
  entries(): Array<{ name: string; count: number }>;
}

function countersOf(card: CardInstance | undefined): XCounters {
  const map = card?.counters ?? {};
  return {
    getCount: counter => map[typeof counter === 'string' ? counter : counter.name] ?? 0,
    entries: () => Object.entries(map).map(([name, count]) => ({ name, count })),
  };
}

/* -------------------------------------------------------------------------- */
/* MageObject / Card / Permanent                                              */
/* -------------------------------------------------------------------------- */

export interface XMageObject {
  /** `MageItem#getId` — rank 3, 3,635 calls. */
  getId(): InstanceId;
  /** `Controllable#getControllerId` — rank 1, 6,445 calls. */
  getControllerId(): PlayerId;
  getOwnerId(): PlayerId;
  isControlledBy(playerId: PlayerId): boolean;
  getName(): string;
  /** For a log line. OUR format, not XMage's. */
  getLogName(): string;
  getIdName(): string;
  getPower(): XMageInt;
  getToughness(): XMageInt;
  getManaValue(): number;
  getColor(): string[];
  getCardType(): string[];
  getSubtype(): string[];
  hasSubtype(subtype: string): boolean;
  hasAbility(keyword: string): boolean;
  isCreature(): boolean;
  isLand(): boolean;
  isArtifact(): boolean;
  isEnchantment(): boolean;
  isPlaneswalker(): boolean;
  isInstantOrSorcery(): boolean;
  getZoneChangeCounter(): number;
  getCounters(): XCounters;
  /** The underlying record. An escape hatch for a translated body that needs one field. */
  raw(): CardInstance | undefined;
}

export interface XCard extends XMageObject {
  /** `Card#addCounters` — rank 55, 435 calls. */
  addCounters(counter: XCounter | string, count?: number): boolean;
  removeCounters(counter: XCounter | string, count?: number): boolean;
  moveToZone(zone: Zone, position?: 'top' | 'bottom' | number): boolean;
  moveToExile(): boolean;
  getZone(): Zone;
}

export interface XPermanent extends XCard {
  isTapped(): boolean;
  tap(): boolean;
  untap(): boolean;
  /** `Permanent#destroy` — rank 96. Indestructible is honoured and said out loud. */
  destroy(noRegen?: boolean): boolean;
  /** `Permanent#sacrifice` — rank 90. */
  sacrifice(): boolean;
  /** `Permanent#damage` — rank 88. */
  damage(amount: number, sourceId?: InstanceId, deathtouch?: boolean): number;
  /** `Permanent#getAttachedTo` — rank 70, 368 calls. */
  getAttachedTo(): InstanceId | undefined;
  attachTo(instanceId: InstanceId | null): boolean;
  isAttacking(): boolean;
  isBlocked(): boolean;
  addAbility(keyword: string): boolean;
}

function objectFacade(scope: XmageScope, instanceId: InstanceId): XPermanent {
  const read = (): CardInstance | undefined => scope.working.cards[instanceId];
  const lowerAll = (list: string[]): string[] => list.map(v => String(v).toLowerCase());

  const facade: XPermanent = {
    getId: () => instanceId,
    getControllerId: () => read()?.controllerId,
    getOwnerId: () => read()?.ownerId,
    isControlledBy: playerId => read()?.controllerId === playerId,
    getName: () => read()?.name ?? '',
    getLogName: () => read()?.name ?? 'a card',
    getIdName: () => `${read()?.name ?? 'a card'} [${instanceId.slice(-4)}]`,
    getPower: () => mageInt(powerIn(scope.working, instanceId)),
    getToughness: () => mageInt(toughnessIn(scope.working, instanceId)),
    getManaValue: () => read()?.cmc ?? 0,
    getColor: () => colorsIn(scope.working, instanceId),
    getCardType: () => typesIn(scope.working, instanceId),
    getSubtype: () => subtypesIn(scope.working, instanceId),
    hasSubtype: subtype =>
      lowerAll(subtypesIn(scope.working, instanceId)).includes(String(subtype).toLowerCase()),
    hasAbility: keyword =>
      lowerAll(keywordsIn(scope.working, instanceId)).includes(String(keyword).toLowerCase()),
    isCreature: () => isCreatureIn(scope.working, instanceId),
    isLand: () => lowerAll(typesIn(scope.working, instanceId)).includes('land'),
    isArtifact: () => lowerAll(typesIn(scope.working, instanceId)).includes('artifact'),
    isEnchantment: () => lowerAll(typesIn(scope.working, instanceId)).includes('enchantment'),
    isPlaneswalker: () => lowerAll(typesIn(scope.working, instanceId)).includes('planeswalker'),
    isInstantOrSorcery: () => {
      const types = lowerAll(typesIn(scope.working, instanceId));
      return types.includes('instant') || types.includes('sorcery');
    },
    getZoneChangeCounter: () => read()?.zoneChangeCounter ?? 0,
    getCounters: () => countersOf(read()),
    raw: read,

    getZone: () => read()?.zone,

    addCounters(counter, count) {
      const name = typeof counter === 'string' ? counter : counter.name;
      const delta = typeof counter === 'string' ? (count ?? 1) : (count ?? counter.count ?? 1);
      if (!read() || delta === 0) return false;
      emit(scope, { type: 'CARD_COUNTER', instanceId, counter: name, delta });
      return true;
    },
    removeCounters(counter, count) {
      const name = typeof counter === 'string' ? counter : counter.name;
      const delta = typeof counter === 'string' ? (count ?? 1) : (count ?? counter.count ?? 1);
      if (!read() || delta === 0) return false;
      emit(scope, { type: 'CARD_COUNTER', instanceId, counter: name, delta: -delta });
      return true;
    },
    moveToZone(zone, position) {
      if (!read()) return false;
      emit(scope, position === undefined
        ? { type: 'MOVE_ZONE', instanceId, to: zone }
        : { type: 'MOVE_ZONE', instanceId, to: zone, position });
      return true;
    },
    moveToExile() {
      return facade.moveToZone('exile');
    },

    isTapped: () => !!read()?.tapped,
    tap() {
      const card = read();
      if (!card || card.tapped) return false;
      emit(scope, { type: 'TAP', instanceId });
      return true;
    },
    untap() {
      const card = read();
      if (!card || !card.tapped) return false;
      emit(scope, { type: 'UNTAP', instanceId });
      return true;
    },
    destroy(noRegen = false) {
      const card = read();
      if (!card) return false;
      // CR 702.12b. `to-actions.ts` refuses the same way and for the same
      // reason: a card that says it destroyed an indestructible creature is
      // worse than one that says it could not.
      if (!noRegen && keywordsIn(scope.working, instanceId).map(k => k.toLowerCase()).includes('indestructible')) {
        emit(scope, {
          type: 'NOTE',
          instanceId,
          message: `${card.name} is indestructible and was not destroyed.`,
        });
        return false;
      }
      emit(scope, { type: 'MOVE_ZONE', instanceId, to: 'graveyard' });
      return true;
    },
    sacrifice() {
      if (!read()) return false;
      emit(scope, { type: 'MOVE_ZONE', instanceId, to: 'graveyard' });
      return true;
    },
    damage(amount, sourceId, deathtouch) {
      if (!read() || amount <= 0) return 0;
      emit(scope, {
        type: 'DAMAGE_CARD',
        instanceId,
        amount,
        ...(sourceId ? { sourceInstanceId: sourceId } : {}),
        ...(deathtouch ? { deathtouch: true } : {}),
      });
      return amount;
    },
    getAttachedTo: () => read()?.attachedTo,
    attachTo(target) {
      if (!read()) return false;
      emit(scope, { type: 'ATTACH', instanceId, toInstanceId: target });
      return true;
    },
    isAttacking: () =>
      (scope.working.combat?.attackers ?? []).some(a => a.attackerId === instanceId),
    isBlocked: () =>
      (scope.working.combat?.attackers ?? []).some(
        a => a.attackerId === instanceId && a.blockedBy.length > 0
      ),
    addAbility(keyword) {
      if (!read()) return false;
      emit(scope, { type: 'SET_KEYWORD', instanceId, keyword, on: true });
      return true;
    },
  };
  return facade;
}

/* -------------------------------------------------------------------------- */
/* Cards — XMage's card collection                                            */
/* -------------------------------------------------------------------------- */

/**
 * `Cards#getCards` is rank 33 with 651 calls, and `isEmpty`, `add`, `size`,
 * `count`, `get` and `retainZone` add 1,549 more between them.
 */
export interface XCards {
  getCards(): XCard[];
  /** The ids, which is what most bodies actually want. */
  ids(): InstanceId[];
  size(): number;
  count(): number;
  isEmpty(): boolean;
  contains(instanceId: InstanceId): boolean;
  get(index: number): XCard | undefined;
  getRandom(): XCard | undefined;
  add(card: XCard | InstanceId): XCards;
  addAll(cards: Array<XCard | InstanceId>): XCards;
  clear(): XCards;
  /** XMage's `Cards#retainZone`. Keeps only the cards currently in `zone`. */
  retainZone(zone: Zone): XCards;
  /** Keep only what the filter matches. */
  retain(filter: XFilter, ctx?: PredicateContext): XCards;
}

export function makeCards(scope: XmageScope, ids: InstanceId[] = []): XCards {
  let list = [...ids];
  const cards: XCards = {
    getCards: () => list.map(id => objectFacade(scope, id)),
    ids: () => [...list],
    size: () => list.length,
    count: () => list.length,
    isEmpty: () => list.length === 0,
    contains: instanceId => list.includes(instanceId),
    get: index => (list[index] ? objectFacade(scope, list[index]) : undefined),
    getRandom: () => (list.length ? objectFacade(scope, list[0]) : undefined),
    add(card) {
      const id = typeof card === 'string' ? card : card.getId();
      if (id && !list.includes(id)) list.push(id);
      return cards;
    },
    addAll(more) {
      for (const card of more) cards.add(card);
      return cards;
    },
    clear() {
      list = [];
      return cards;
    },
    retainZone(zone) {
      list = list.filter(id => scope.working.cards[id]?.zone === zone);
      return cards;
    },
    retain(filter, ctx = {}) {
      list = list.filter(id => {
        const card = scope.working.cards[id];
        return !!card && filter.match(scope.working, card, ctx);
      });
      return cards;
    },
  };
  return cards;
}

/*
 * `getRandom` returns the FIRST card rather than a random one, and says so
 * here rather than reaching for a random source. Nothing in this folder may
 * read `Math.random`: two clients replaying one action log would pick different
 * cards and the boards would diverge. A body that genuinely needs a random pick
 * has to go through `state.rng` at the reducer, which is a different seam.
 */

/* -------------------------------------------------------------------------- */
/* Battlefield                                                                */
/* -------------------------------------------------------------------------- */

export interface XBattlefield {
  /** `Battlefield#getActivePermanents` — rank 35, 596 calls. */
  getActivePermanents(
    filter?: XFilter,
    controllerId?: PlayerId,
    sourceId?: InstanceId
  ): XPermanent[];
  getAllActivePermanents(filter?: XFilter, controllerId?: PlayerId): XPermanent[];
  count(filter?: XFilter, controllerId?: PlayerId, sourceId?: InstanceId): number;
  countAll(filter?: XFilter, controllerId?: PlayerId): number;
  contains(instanceId: InstanceId): boolean;
}

function battlefieldFacade(scope: XmageScope, defaultControllerId?: PlayerId): XBattlefield {
  const all = (): CardInstance[] =>
    Object.values(scope.working.cards).filter(card => card.zone === 'battlefield');

  /**
   * XMage draws a line here that costs a card its meaning if it is missed.
   *
   * `getActivePermanents(filter, sourcePlayerId, …)` and `count(…)` treat that
   * player id as a RANGE anchor: the permanents visible to that player. In
   * Commander the range is everyone, so the id changes nothing but the
   * predicate context.
   *
   * `getAllActivePermanents(filter, controllerId, …)` and `countAll(…)` treat
   * it as OWNERSHIP: only permanents that player controls. Reading it as
   * context alone made Elspeth Tirel gain life for the opponent's creatures
   * too, because `StaticFilters.creature()` carries no controller predicate for
   * the context to bind to. Found by running a translated body on a real board.
   */
  const select = (
    filter?: XFilter,
    playerId?: PlayerId,
    sourceId?: InstanceId,
    restrictToController = false
  ): XPermanent[] => {
    const ctx: PredicateContext = {
      controllerId: playerId ?? defaultControllerId,
      sourceId,
    };
    return all()
      .filter(card => (restrictToController && playerId ? card.controllerId === playerId : true))
      .filter(card => (filter ? filter.match(scope.working, card, ctx) : true))
      .map(card => objectFacade(scope, card.instanceId));
  };

  return {
    getActivePermanents: (filter, controllerId, sourceId) => select(filter, controllerId, sourceId),
    getAllActivePermanents: (filter, controllerId) => select(filter, controllerId, undefined, true),
    count: (filter, controllerId, sourceId) => select(filter, controllerId, sourceId).length,
    countAll: (filter, controllerId) => select(filter, controllerId, undefined, true).length,
    contains: instanceId => scope.working.cards[instanceId]?.zone === 'battlefield',
  };
}

/* -------------------------------------------------------------------------- */
/* Player                                                                     */
/* -------------------------------------------------------------------------- */

export interface XPlayer {
  getId(): PlayerId;
  /** A player controls itself. XMage's `Controllable` is implemented here too. */
  getControllerId(): PlayerId;
  getName(): string;
  getLogName(): string;
  getLife(): number;
  isInGame(): boolean;
  hasLost(): boolean;

  getLibrary(): XCards;
  getHand(): XCards;
  getGraveyard(): XCards;
  getBattlefieldIds(): InstanceId[];

  /** `Player#moveCards` — rank 8, 1,852 calls across 1,543 card files. */
  moveCards(cards: XCardsInput, toZone: Zone): boolean;
  moveCardsToExile(cards: XCardsInput): boolean;
  putCardsOnBottomOfLibrary(cards: XCardsInput): boolean;
  putCardsOnTopOfLibrary(cards: XCardsInput): boolean;

  drawCards(count: number): number;
  damage(amount: number, sourceId?: InstanceId, infect?: boolean): number;
  gainLife(amount: number): number;
  loseLife(amount: number): number;
  shuffleLibrary(): boolean;
  revealCards(name: string, cards: XCardsInput): boolean;

  /* Decisions. These raise a question rather than guessing. */
  /** `Player#chooseUse` — rank 24, 845 calls. The "you may" and the "unless pays". */
  chooseUse(message: string): boolean;
  /** `Player#choose` — rank 15, 1,198 calls. */
  choose(prompt: string, from: XCardsInput, min?: number, max?: number): InstanceId[];
  chooseTarget(prompt: string, from: XCardsInput, min?: number, max?: number): InstanceId[];
  discard(count: number): InstanceId[];
  searchLibrary(prompt: string, filter?: XFilter, max?: number): InstanceId[];
}

/**
 * Whatever a body has in hand, as instance ids.
 *
 * An array of CARDS used to fall through the `Array.isArray` branch and be
 * filtered down to nothing, so `player.moveCards(creatures, 'graveyard')` moved
 * zero cards and reported success. XMage passes `Set<Permanent>` here
 * constantly — `battlefield.getActivePermanents(filter, id, game)` returns
 * exactly that — so the array branch has to read an id off each element rather
 * than keep only the ones that were already strings. A silent no-op is the
 * failure mode this project has been bitten by most.
 */
function idsFrom(
  input: XCards | XCard | ReadonlyArray<XCard | InstanceId> | InstanceId | undefined
): InstanceId[] {
  if (!input) return [];
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) {
    const out: InstanceId[] = [];
    for (const item of input as ReadonlyArray<XCard | InstanceId>) {
      if (typeof item === 'string') out.push(item);
      else if (item && typeof item.getId === 'function') out.push(item.getId());
    }
    return out;
  }
  if (typeof (input as XCards).ids === 'function') return (input as XCards).ids();
  if (typeof (input as XCard).getId === 'function') return [(input as XCard).getId()];
  return [];
}

/** What every card-moving method on `Player` accepts. */
export type XCardsInput = XCards | XCard | ReadonlyArray<XCard | InstanceId> | InstanceId;

function playerFacade(scope: XmageScope, playerId: PlayerId): XPlayer {
  const read = () => scope.working.players.find(p => p.id === playerId);
  const zone = (name: Zone): InstanceId[] => read()?.zones?.[name] ?? [];

  const move = (input: XCardsInput, to: Zone, position?: 'top' | 'bottom'): boolean => {
    const ids = idsFrom(input);
    let moved = false;
    for (const id of ids) {
      if (!scope.working.cards[id]) continue;
      emit(scope, position === undefined
        ? { type: 'MOVE_ZONE', instanceId: id, to }
        : { type: 'MOVE_ZONE', instanceId: id, to, position });
      moved = true;
    }
    return moved;
  };

  const player: XPlayer = {
    getId: () => playerId,
    getControllerId: () => playerId,
    getName: () => read()?.name ?? '',
    getLogName: () => read()?.name ?? 'a player',
    getLife: () => read()?.life ?? 0,
    isInGame: () => {
      const p = read();
      return !!p && !p.hasLost && !p.conceded;
    },
    hasLost: () => !!read()?.hasLost,

    getLibrary: () => makeCards(scope, zone('library')),
    getHand: () => makeCards(scope, zone('hand')),
    getGraveyard: () => makeCards(scope, zone('graveyard')),
    getBattlefieldIds: () =>
      Object.values(scope.working.cards)
        .filter(card => card.zone === 'battlefield' && card.controllerId === playerId)
        .map(card => card.instanceId),

    moveCards: (cards, toZone) => move(cards, toZone),
    moveCardsToExile: cards => move(cards, 'exile'),
    putCardsOnBottomOfLibrary: cards => move(cards, 'library', 'bottom'),
    putCardsOnTopOfLibrary: cards => move(cards, 'library', 'top'),

    drawCards(count) {
      if (count <= 0) return 0;
      emit(scope, { type: 'DRAW', playerId, count });
      return count;
    },
    damage(amount, sourceId, infect) {
      if (amount <= 0) return 0;
      emit(scope, {
        type: 'DAMAGE',
        targetPlayerId: playerId,
        amount,
        ...(sourceId ? { sourceInstanceId: sourceId } : {}),
        ...(infect ? { infect: true } : {}),
      });
      return amount;
    },
    gainLife(amount) {
      if (amount <= 0) return 0;
      emit(scope, { type: 'LIFE_CHANGE', playerId, delta: amount });
      return amount;
    },
    loseLife(amount) {
      if (amount <= 0) return 0;
      emit(scope, { type: 'LIFE_CHANGE', playerId, delta: -amount });
      return amount;
    },
    shuffleLibrary() {
      emit(scope, { type: 'SHUFFLE', playerId });
      return true;
    },
    revealCards(name, cards) {
      const ids = idsFrom(cards);
      if (!ids.length) return false;
      // There is no REVEAL action, and inventing one that changes nothing would
      // be a second way of saying NOTE. The log line is the reveal.
      const names = ids.map(id => scope.working.cards[id]?.name ?? 'a card').join(', ');
      emit(scope, {
        type: 'NOTE',
        message: `${read()?.name ?? 'A player'} reveals ${names}${name ? ` (${name})` : ''}.`,
      });
      return true;
    },

    chooseUse(message) {
      return askYesNo(scope, message);
    },
    choose(prompt, from, min = 1, max = 1) {
      return askForCards(scope, prompt, idsFrom(from), min, max);
    },
    chooseTarget(prompt, from, min = 1, max = 1) {
      return askForCards(scope, prompt, idsFrom(from), min, max);
    },
    discard(count) {
      const hand = zone('hand');
      if (!hand.length || count <= 0) return [];
      const picked = askForCards(
        scope,
        `Discard ${count} card${count === 1 ? '' : 's'}`,
        hand,
        Math.min(count, hand.length),
        Math.min(count, hand.length)
      );
      for (const id of picked) emit(scope, { type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' });
      return picked;
    },
    searchLibrary(prompt, filter, max = 1) {
      const library = zone('library');
      const legal = filter
        ? library.filter(id => {
            const card = scope.working.cards[id];
            return !!card && filter.match(scope.working, card, { controllerId: playerId });
          })
        : library;
      if (!legal.length) return [];
      return askForCards(scope, prompt, legal, 0, max);
    },
  };
  return player;
}

/* -------------------------------------------------------------------------- */
/* GameState                                                                  */
/* -------------------------------------------------------------------------- */

export interface XGameState {
  /** `GameState#getWatcher` — rank 41, 527 calls. Always null, and it says why. */
  getWatcher(name: string): null;
  /** `GameState#getPlayersInRange` — rank 46. Living players, turn order from `playerId`. */
  getPlayersInRange(playerId?: PlayerId): PlayerId[];
  /** `GameState#getZone` — rank 75. */
  getZone(instanceId: InstanceId): Zone | undefined;
  /** `GameState#setValue` / `getValue` — run-local. See the note on the body. */
  setValue(key: string, value: unknown): void;
  getValue(key: string): unknown;
  getTurnNum(): number;
}

function gameStateFacade(scope: XmageScope): XGameState {
  return {
    getWatcher(name) {
      // A watcher this engine does not fold answers 0 for every question, and 0
      // is a WRONG answer rather than a neutral one — "draw a card for each
      // creature that died this turn" would draw nothing and look like a card
      // that did not do much. XMage bodies all guard with `if (watcher != null)`,
      // so null makes the card a visible no-op instead. `watch.ts` is the seam
      // that will make this return something.
      deferHere(scope, `needs the "${name}" watcher, which this engine does not fold yet — anything computed from it would be 0 and 0 is not the real number`);
      return null;
    },
    getPlayersInRange(playerId) {
      const players = [...scope.working.players].sort((a, b) => a.seat - b.seat);
      const living = players.filter(p => !p.hasLost && !p.conceded);
      const from = playerId ?? scope.working.activePlayerId;
      const start = living.findIndex(p => p.id === from);
      if (start < 0) return living.map(p => p.id);
      return [...living.slice(start), ...living.slice(0, start)].map(p => p.id);
    },
    getZone: instanceId => scope.working.cards[instanceId]?.zone,
    setValue(key, value) {
      scope.values.set(key, value);
    },
    getValue(key) {
      if (scope.values.has(key)) return scope.values.get(key);
      // XMage keeps this bag on the game and reads it across resolutions. This
      // engine has no such bag, and adding a mutable one to `GameState` would be
      // an escape hatch every future card reached for. A key written by an
      // EARLIER resolution is therefore genuinely not available, and saying so
      // is the only honest answer.
      deferHere(scope, `needs a value stored under "${key}" by an earlier resolution, which this engine does not keep`);
      return null;
    },
    getTurnNum: () => scope.working.turn,
  };
}

/* -------------------------------------------------------------------------- */
/* Stack and combat                                                           */
/* -------------------------------------------------------------------------- */

/** One object on the stack, as a translated body reads it. */
export interface XStackObject {
  getId(): string;
  getName(): string;
  getControllerId(): PlayerId;
  getSourceId(): InstanceId | undefined;
  isSpell(): boolean;
  /** The card this spell IS. Absent for an ability, which is not a card. */
  getCard(): XCard | null;
}

/** XMage's `SpellStack`. `getSpell` is rank 102; `Game#getStack` is rank 45. */
export interface XSpellStack {
  size(): number;
  isEmpty(): boolean;
  /** `SpellStack#getSpell` — by id, or `undefined`. */
  getSpell(stackId: string): XStackObject | undefined;
  /** Top of the stack, which is the next thing to resolve. */
  getFirst(): XStackObject | undefined;
  getAll(): XStackObject[];
}

function stackObjectFacade(scope: XmageScope, index: number): XStackObject | undefined {
  const object = (scope.working.stack ?? [])[index];
  if (!object) return undefined;
  return {
    getId: () => object.stackId,
    getName: () => object.name,
    getControllerId: () => object.controllerId,
    getSourceId: () => object.sourceInstanceId ?? object.cardInstanceId,
    isSpell: () => object.kind === 'spell',
    getCard: () =>
      object.cardInstanceId && scope.working.cards[object.cardInstanceId]
        ? objectFacade(scope, object.cardInstanceId)
        : null,
  };
}

function spellStackFacade(scope: XmageScope): XSpellStack {
  const list = () => scope.working.stack ?? [];
  return {
    size: () => list().length,
    isEmpty: () => list().length === 0,
    getSpell(stackId) {
      const index = list().findIndex(o => o.stackId === stackId);
      return index < 0 ? undefined : stackObjectFacade(scope, index);
    },
    // CR 405.2 — the LAST element is the top and resolves next.
    getFirst: () => stackObjectFacade(scope, list().length - 1),
    getAll: () => list().map((_, index) => stackObjectFacade(scope, index)),
  };
}

/** XMage's `Combat` — rank 87, 291 calls. */
export interface XCombat {
  getAttackers(): InstanceId[];
  getBlockers(): InstanceId[];
  getDefenderId(attackerId: InstanceId): PlayerId | InstanceId | undefined;
  getBlockersOf(attackerId: InstanceId): InstanceId[];
  noCombat(): boolean;
}

function combatFacade(scope: XmageScope): XCombat {
  const attacks = () => scope.working.combat?.attackers ?? [];
  return {
    getAttackers: () => attacks().map(a => a.attackerId),
    getBlockers: () => attacks().flatMap(a => a.blockedBy),
    getDefenderId: attackerId => {
      const attack = attacks().find(a => a.attackerId === attackerId);
      return attack?.defenderPlayerId ?? attack?.defenderInstanceId;
    },
    getBlockersOf: attackerId =>
      attacks().find(a => a.attackerId === attackerId)?.blockedBy ?? [],
    noCombat: () => attacks().length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Token                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `Token`. `putOntoBattlefield` is rank 73 with 350 calls, and it is
 * always the token object's own method rather than something on `Game`, so it
 * is spelled the same way here.
 */
export interface XToken {
  getName(): string;
  putOntoBattlefield(count: number, controllerId: PlayerId, tapped?: boolean): void;
}

export interface XTokenSpec {
  name: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
}

export function makeToken(scope: XmageScope, spec: XTokenSpec): XToken {
  return {
    getName: () => spec.name,
    putOntoBattlefield(count, controllerId, tapped = false) {
      if (count <= 0) return;
      emit(scope, {
        type: 'CREATE_TOKEN',
        playerId: controllerId,
        token: spec,
        count,
        ...(tapped ? { tapped: true } : {}),
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Choice                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `Choice` — rank 141. A pick from an enumerated list of names: a
 * colour, a creature type. A player decision, so it asks rather than picking.
 */
export interface XChoice {
  getChoice(prompt: string): string | null;
  getChoices(): readonly string[];
}

export function makeChoice(scope: XmageScope, choices: readonly string[]): XChoice {
  return {
    getChoice: prompt => askFromList(scope, prompt, choices),
    getChoices: () => choices,
  };
}

/** The colours, for `ChoiceColor`. Letters, which is what `ColoredManaSymbol` holds. */
export const COLOR_CHOICES: readonly string[] = ['W', 'U', 'B', 'R', 'G'];

/* -------------------------------------------------------------------------- */
/* Game                                                                       */
/* -------------------------------------------------------------------------- */

export interface XGame {
  /** `Game#getPlayer` — rank 2, 6,386 calls across 4,758 card files. */
  getPlayer(playerId: PlayerId | undefined): XPlayer | null;
  /** `Game#getPermanent` — rank 4, 3,043 calls. Battlefield only, like XMage. */
  getPermanent(instanceId: InstanceId | undefined): XPermanent | null;
  /** `Game#getPermanentOrLKIBattlefield` — rank 52. Falls back to the state the run started from. */
  getPermanentOrLKIBattlefield(instanceId: InstanceId | undefined): XPermanent | null;
  /** `Game#getCard` — rank 11. Any zone. */
  getCard(instanceId: InstanceId | undefined): XCard | null;
  /** `Game#getObject` — rank 42. */
  getObject(instanceId: InstanceId | undefined): XMageObject | null;
  /** `Game#getBattlefield` — rank 12. */
  getBattlefield(): XBattlefield;
  /** `Game#getState` — rank 7, 2,127 calls. */
  getState(): XGameState;
  /** `Game#getOpponents` — rank 37. */
  getOpponents(playerId: PlayerId): PlayerId[];
  getActivePlayerId(): PlayerId;
  /** `Game#addEffect` — rank 16, 1,184 calls. Takes OUR `ContinuousEffect`. */
  addEffect(effect: ContinuousEffect): void;
  /** `Game#informPlayers` — rank 44. */
  informPlayers(message: string): void;
  /** `Game#processAction` — rank 105. A no-op here, and correct: see the body. */
  processAction(): void;
  /** `Game#addDelayedTriggeredAbility` — rank 84. Deferred, loudly. */
  addDelayedTriggeredAbility(description: string): void;
  /** `Game#getExile`. Every card in exile. */
  getExile(): XCards;
  /** `Game#getStack` — rank 45, 484 calls. */
  getStack(): XSpellStack;
  /** `Game#getCombat` — rank 87. */
  getCombat(): XCombat;
  /** A token, ready for `putOntoBattlefield`. XMage's own spelling. */
  token(spec: XTokenSpec): XToken;
  /** Put a token onto the battlefield directly, when a body has no `Token` object. */
  createToken(controllerId: PlayerId, token: XTokenSpec, count?: number, tapped?: boolean): void;
  /** Every action this run has emitted so far. For tests and the bridge. */
  emittedActions(): readonly GameAction[];
  /** The working board. An escape hatch for a body that needs a real read. */
  rawState(): GameState;
  /**
   * The run's scope, so a translated body can build a `Target`, a `Cards` or a
   * `Choice`.
   *
   * XMage has no such method: its constructors reach the game through a static
   * context this engine deliberately does not have, and every one of those
   * objects needs the scope to read the board or raise a question. The name is
   * one XMage never uses, which is what keeps it out of the coverage join in
   * `runtime-coverage.mjs`. It is plumbing for the translator, not an
   * implementation of an XMage function, and counting it as one would overstate
   * the port.
   */
  xmageScope(): XmageScope;
}

export function makeGame(scope: XmageScope, defaultControllerId?: PlayerId): XGame {
  return {
    getPlayer(playerId) {
      if (!playerId) return null;
      return scope.working.players.some(p => p.id === playerId)
        ? playerFacade(scope, playerId)
        : null;
    },
    getPermanent(instanceId) {
      if (!instanceId) return null;
      const card = scope.working.cards[instanceId];
      return card && card.zone === 'battlefield' ? objectFacade(scope, instanceId) : null;
    },
    getPermanentOrLKIBattlefield(instanceId) {
      if (!instanceId) return null;
      const live = scope.working.cards[instanceId];
      if (live && live.zone === 'battlefield') return objectFacade(scope, instanceId);
      // Last known information: the board this run started from. It is a real
      // snapshot rather than a remembered copy, so "what was it before it died"
      // is answered from state and not from a cache that could be stale.
      const known = scope.origin.cards[instanceId];
      if (!known || known.zone !== 'battlefield') return null;
      return objectFacade({ ...scope, working: scope.origin }, instanceId);
    },
    getCard(instanceId) {
      if (!instanceId) return null;
      return scope.working.cards[instanceId] ? objectFacade(scope, instanceId) : null;
    },
    getObject(instanceId) {
      if (!instanceId) return null;
      return scope.working.cards[instanceId] ? objectFacade(scope, instanceId) : null;
    },
    getBattlefield: () => battlefieldFacade(scope, defaultControllerId),
    getState: () => gameStateFacade(scope),
    getOpponents(playerId) {
      return scope.working.players
        .filter(p => p.id !== playerId && !p.hasLost && !p.conceded)
        .sort((a, b) => a.seat - b.seat)
        .map(p => p.id);
    },
    getActivePlayerId: () => scope.working.activePlayerId,
    addEffect(effect) {
      scope.continuous.push(effect);
      emit(scope, { type: 'ADD_CONTINUOUS', effect });
    },
    informPlayers(message) {
      emit(scope, { type: 'NOTE', message });
    },
    processAction() {
      // XMage calls this to flush state-based actions and the trigger queue in
      // the middle of a resolution. This engine's reducer runs state-based
      // actions after every applied action already, and `emit` folds each action
      // through that reducer, so the flush has happened by the time a body could
      // observe it. Nothing to do, and a no-op is the correct port rather than a
      // gap: there is no ordering a body could see that this does not give it.
    },
    addDelayedTriggeredAbility(description) {
      // CR 603.7. There is no store for a delayed trigger in `GameState`, so a
      // silent success here would be a card that appeared to set something up
      // and never fired it.
      deferHere(scope, `sets up a delayed trigger this engine cannot store yet: ${description}`);
    },
    getExile: () =>
      makeCards(
        scope,
        Object.values(scope.working.cards)
          .filter(card => card.zone === 'exile')
          .map(card => card.instanceId)
      ),
    getStack: () => spellStackFacade(scope),
    getCombat: () => combatFacade(scope),
    token: spec => makeToken(scope, spec),
    createToken(controllerId, token, count = 1, tapped = false) {
      makeToken(scope, token).putOntoBattlefield(count, controllerId, tapped);
    },
    emittedActions: () => scope.actions,
    rawState: () => scope.working,
    xmageScope: () => scope,
  };
}

/* Exported so `index.ts` can build one without reaching inside. */
export { objectFacade as makePermanent, playerFacade as makePlayer };
