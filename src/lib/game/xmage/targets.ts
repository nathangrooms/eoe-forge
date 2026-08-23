/**
 * DeckMatrix — the XMage runtime API: Ability, Target, TargetPointer, GameEvent
 * and the effect-composition plumbing.
 *
 * Ported from **XMage**, MIT licensed, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. Read in place; nothing vendored. XMage's
 * display strings are not copied.
 *
 * ## What is in here and why it ranks where it does
 *
 * From `scripts/xmage/api-surface-typed.mjs`:
 *
 *     2,601  Ability#getSourceId                      rank 5
 *     2,467  GameEvent#getType                        rank 6
 *     1,549  GameEvent#getTargetId                    rank 10
 *     1,291  TargetPointer#getFirst                   rank 13
 *     1,152  Target#getFirstTarget                    rank 17
 *       912  Ability#getFirstTarget                   rank 20
 *       694  Effect#apply                             rank 28
 *       680  Effect#setTargetPointer                  rank 29
 *
 * `getFirstTarget` is the clearest case for keying the ranking by receiver
 * type. By bare name it is rank 9 with 2,346 calls, which reads like one
 * function. It is two: `Ability#getFirstTarget` reaches through the ability's
 * whole target list, `Target#getFirstTarget` reads one target object. Writing
 * one of them and calling the row done would leave half the calls unserved with
 * nothing to show it.
 */

import type { InstanceId, PlayerId, StackTarget } from '../types.ts';
import type { XmageScope } from './runtime.ts';
import { askForCards, askFromList } from './runtime.ts';
import type { XFilter, PredicateContext } from './filters.ts';
import type { XGame, XMageObject, XPermanent } from './objects.ts';

/* -------------------------------------------------------------------------- */
/* TargetPointer                                                              */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `TargetPointer` — "the thing this effect is about", which is not
 * always the ability's target. `FixedTarget` pins one object; `FirstTargetPointer`
 * reads the ability's first target at resolution.
 */
export interface XTargetPointer {
  /** `TargetPointer#getFirst` — rank 13, 1,291 calls. */
  getFirst(): InstanceId | undefined;
  getFirstPlayer(): PlayerId | undefined;
  getTargets(): InstanceId[];
}

/** XMage's `FixedTarget`. */
export function fixedTarget(instanceId: InstanceId | undefined): XTargetPointer {
  return {
    getFirst: () => instanceId,
    getFirstPlayer: () => undefined,
    getTargets: () => (instanceId ? [instanceId] : []),
  };
}

export function fixedPlayerTarget(playerId: PlayerId | undefined): XTargetPointer {
  return {
    getFirst: () => undefined,
    getFirstPlayer: () => playerId,
    getTargets: () => [],
  };
}

function pointerOverTargets(targets: readonly StackTarget[]): XTargetPointer {
  return {
    getFirst: () => targets.find(t => t.kind === 'card')?.instanceId,
    getFirstPlayer: () => targets.find(t => t.kind === 'player')?.playerId,
    getTargets: () => targets.filter(t => t.kind === 'card').map(t => t.instanceId),
  };
}

/* -------------------------------------------------------------------------- */
/* Target                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `Target` — one target slot, with the filter that says what is legal.
 *
 * A translated body builds one and then either reads what was already chosen or
 * asks. Asking goes through `runtime.ts`, which raises a `PendingChoice` and
 * aborts, so a target is never picked on the player's behalf.
 */
export interface XTarget {
  /** `Target#getFirstTarget` — rank 17, 1,152 calls. */
  getFirstTarget(): InstanceId | undefined;
  /** `Target#getTargets` — rank 36, 591 calls. */
  getTargets(): InstanceId[];
  size(): number;
  isChosen(): boolean;
  /** `Target#withNotTarget` — rank 47, 476 calls. "Choose", not "target". */
  withNotTarget(notTarget?: boolean): XTarget;
  isNotTarget(): boolean;
  /** `Target#canChoose` — rank 97. True when a legal choice exists. */
  canChoose(game: XGame, controllerId?: PlayerId): boolean;
  /** The legal set right now. */
  possibleTargets(game: XGame, controllerId?: PlayerId): InstanceId[];
  /** Ask the player. Raises a `PendingChoice` when unanswered. */
  choose(game: XGame, prompt: string, controllerId?: PlayerId): InstanceId[];
  getFilter(): XFilter | undefined;
  getMinNumberOfTargets(): number;
  getMaxNumberOfTargets(): number;
}

export interface XTargetOptions {
  filter?: XFilter;
  min?: number;
  max?: number;
  /** Search this zone rather than the battlefield. */
  zone?: 'battlefield' | 'hand' | 'graveyard' | 'library' | 'exile';
  /** Already-chosen ids, from the ability's announcement. */
  chosen?: InstanceId[];
  sourceId?: InstanceId;
}

export function makeTarget(scope: XmageScope, options: XTargetOptions = {}): XTarget {
  const chosen = [...(options.chosen ?? [])];
  let notTarget = false;
  const min = options.min ?? 1;
  const max = options.max ?? 1;

  const legalSet = (controllerId?: PlayerId): InstanceId[] => {
    const ctx: PredicateContext = { controllerId, sourceId: options.sourceId };
    const zone = options.zone ?? 'battlefield';
    return Object.values(scope.working.cards)
      .filter(card => card.zone === zone)
      .filter(card => (options.filter ? options.filter.match(scope.working, card, ctx) : true))
      .map(card => card.instanceId);
  };

  const target: XTarget = {
    getFirstTarget: () => chosen[0],
    getTargets: () => [...chosen],
    size: () => chosen.length,
    isChosen: () => chosen.length >= min,
    withNotTarget(value = true) {
      notTarget = value;
      return target;
    },
    isNotTarget: () => notTarget,
    canChoose: (game, controllerId) => legalSet(controllerId).length >= min,
    possibleTargets: (game, controllerId) => legalSet(controllerId),
    choose(game, prompt, controllerId) {
      if (chosen.length >= min) return [...chosen];
      const legal = legalSet(controllerId);
      const picked = askForCards(scope, prompt, legal, Math.min(min, legal.length), max);
      chosen.length = 0;
      chosen.push(...picked);
      return [...chosen];
    },
    getFilter: () => options.filter,
    getMinNumberOfTargets: () => min,
    getMaxNumberOfTargets: () => max,
  };
  return target;
}

/** XMage's `Targets` — the list of a single ability's target slots. */
export interface XTargets {
  /** `Targets#get` — rank 119. */
  get(index: number): XTarget | undefined;
  size(): number;
  getFirstTarget(): InstanceId | undefined;
}

function makeTargets(list: XTarget[]): XTargets {
  return {
    get: index => list[index],
    size: () => list.length,
    getFirstTarget: () => list[0]?.getFirstTarget(),
  };
}

/* -------------------------------------------------------------------------- */
/* Ability                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `Ability`, as the translated body sees it: who controls it, what it
 * came from, and what it is pointed at.
 */
export interface XAbility {
  getId(): string;
  /** `Ability#getSourceId` — rank 5, 2,601 calls across 1,605 card files. */
  getSourceId(): InstanceId;
  /** `Controllable#getControllerId`, which is rank 1 overall. */
  getControllerId(): PlayerId;
  /** `Ability#getFirstTarget` — rank 20, 912 calls. Reaches through every slot. */
  getFirstTarget(): InstanceId | undefined;
  getFirstTargetPlayer(): PlayerId | undefined;
  /** `Ability#getTargets` — rank 71. */
  getTargets(): XTargets;
  /** Every chosen target, as this engine's own shape. */
  getStackTargets(): readonly StackTarget[];
  /** `Ability#getSourceObject` — rank 100. */
  getSourceObject(game: XGame): XMageObject | null;
  /** `Ability#getSourcePermanentIfItStillExists` — rank 63, 389 calls. */
  getSourcePermanentIfItStillExists(game: XGame): XPermanent | null;
  getTargetPointer(): XTargetPointer;
  setTargetPointer(pointer: XTargetPointer): XAbility;
  /** The X the player announced. */
  getX(): number;
}

export interface XAbilityOptions {
  abilityId?: string;
  sourceId: InstanceId;
  controllerId: PlayerId;
  targets?: readonly StackTarget[];
  targetSlots?: XTarget[];
  x?: number;
}

export function makeAbility(scope: XmageScope, options: XAbilityOptions): XAbility {
  const targets = options.targets ?? [];
  const slots = options.targetSlots ?? [];
  let pointer: XTargetPointer = pointerOverTargets(targets);

  const ability: XAbility = {
    getId: () => options.abilityId ?? 'a0',
    getSourceId: () => options.sourceId,
    getControllerId: () => options.controllerId,
    getFirstTarget: () => targets.find(t => t.kind === 'card')?.instanceId,
    getFirstTargetPlayer: () => targets.find(t => t.kind === 'player')?.playerId,
    getTargets: () => makeTargets(slots),
    getStackTargets: () => targets,
    getSourceObject: game => game.getObject(options.sourceId),
    getSourcePermanentIfItStillExists: game => game.getPermanent(options.sourceId),
    getTargetPointer: () => pointer,
    setTargetPointer(next) {
      pointer = next;
      return ability;
    },
    getX: () => options.x ?? 0,
  };
  return ability;
}

/* -------------------------------------------------------------------------- */
/* GameEvent                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `GameEvent`, as a triggered ability's body reads it. Rank 6, 10, 22,
 * 23 and 64 between them: 6,154 calls, which is 5.3% of everything.
 *
 * The event TYPE is XMage's own enum name — `ENTERS_THE_BATTLEFIELD`,
 * `SPELL_CAST`, `DAMAGED_PLAYER`. That is a symbol, not display text, so it is
 * carried verbatim; a translated `checksEventType` compares against the same
 * symbol it did in Java.
 */
export interface XGameEvent {
  /** `GameEvent#getType` — rank 6, 2,467 calls. */
  getType(): string;
  /** `GameEvent#getTargetId` — rank 10, 1,549 calls. What the event happened TO. */
  getTargetId(): InstanceId | undefined;
  /** `GameEvent#getSourceId` — rank 22. */
  getSourceId(): InstanceId | undefined;
  /** `GameEvent#getPlayerId` — rank 23. */
  getPlayerId(): PlayerId | undefined;
  /** `GameEvent#getAmount` — rank 64. */
  getAmount(): number;
  getData(): string | undefined;
  getFlag(): boolean;
}

export interface XEventData {
  type: string;
  targetId?: InstanceId;
  sourceId?: InstanceId;
  playerId?: PlayerId;
  amount?: number;
  data?: string;
  flag?: boolean;
}

export function makeEvent(event: XEventData): XGameEvent {
  return {
    getType: () => event.type,
    getTargetId: () => event.targetId,
    getSourceId: () => event.sourceId,
    getPlayerId: () => event.playerId,
    getAmount: () => event.amount ?? 0,
    getData: () => event.data,
    getFlag: () => !!event.flag,
  };
}

/* -------------------------------------------------------------------------- */
/* Effect composition                                                         */
/* -------------------------------------------------------------------------- */

/**
 * XMage's `Effect`. A translated body IS one of these, so composing them is how
 * one card calls another's behaviour — `new DestroyTargetEffect().apply(game,
 * source)`, which is `Effect#apply` at rank 28 with 694 calls.
 */
export interface XEffect {
  /** `Effect#apply` — rank 28. Returns XMage's own "did anything happen". */
  apply(game: XGame, source: XAbility): boolean;
  /** `Effect#setTargetPointer` — rank 29, 680 calls. Returns itself, so it chains. */
  setTargetPointer(pointer: XTargetPointer): XEffect;
  getTargetPointer(): XTargetPointer | undefined;
}

/** Wrap a translated body as an `Effect`. */
export function makeEffect(
  body: (game: XGame, source: XAbility, pointer: XTargetPointer | undefined) => boolean
): XEffect {
  let pointer: XTargetPointer | undefined;
  const effect: XEffect = {
    apply: (game, source) => body(game, source, pointer),
    setTargetPointer(next) {
      pointer = next;
      return effect;
    },
    getTargetPointer: () => pointer,
  };
  return effect;
}

/**
 * XMage's `DynamicValue#calculate` — rank 104, 229 calls. A number the board
 * decides: "equal to the number of creatures you control".
 */
export interface XDynamicValue {
  calculate(game: XGame, source: XAbility): number;
}

export function dynamicValue(fn: (game: XGame, source: XAbility) => number): XDynamicValue {
  return { calculate: fn };
}

/** A fixed number, XMage's `StaticValue`. */
export function staticValue(value: number): XDynamicValue {
  return { calculate: () => value };
}

/* -------------------------------------------------------------------------- */
/* CardUtil                                                                   */
/* -------------------------------------------------------------------------- */

export const CardUtil = {
  /**
   * `CardUtil#getExileZoneId` — rank 82, 308 calls. XMage derives a stable id so
   * one card's exiled pile can be found again. Derived from the source and the
   * zone change counter, never from a uuid or a clock, so two clients replaying
   * one log name the same pile.
   */
  getExileZoneId(sourceId: InstanceId, zoneChangeCounter = 0): string {
    return `exile:${sourceId}:${zoneChangeCounter}`;
  },
  /** `CardUtil#getSourceCostsTag` — rank 129. The key a cost tag is stored under. */
  getSourceCostsTag(sourceId: InstanceId, tag: string): string {
    return `cost:${sourceId}:${tag}`;
  },
  /** Clamp, which XMage spells out in several bodies. */
  overflowInc(value: number, delta: number): number {
    return value + delta;
  },
};

/**
 * XMage's `Choice#getChoice` — a named pick from a list of strings, such as a
 * colour or a creature type. Rank 141. It is a player decision, so it asks
 * through the same `PendingChoice` seam everything else here uses.
 */
export function chooseFromList(
  scope: XmageScope,
  prompt: string,
  choices: readonly string[]
): string | null {
  return askFromList(scope, prompt, choices);
}
