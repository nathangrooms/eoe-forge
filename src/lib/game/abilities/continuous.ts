/**
 * DeckMatrix — the card-ability DSL: continuous effects (CR 613).
 *
 * ## The one rule that makes the whole architecture work
 *
 * **Continuous effects NEVER write to `GameState`.**
 *
 * `deriveState(state)` is a pure function producing a `DerivedState` — the
 * board as it currently reads, with every anthem, lord, type-change and
 * restriction applied. Combat, targeting and mana all consult the derived view;
 * the raw `CardInstance` stays exactly what the action log says it is.
 *
 * That is not tidiness, it is the scaling argument. If an anthem wrote +1/+1
 * into a card, then removing the anthem would have to remember to unwrite it,
 * and replaying the same action log twice could land on different states the
 * moment two effects overlapped. Because nothing is written, replay is
 * byte-identical by construction — which is what lets the engine run in the
 * player's browser and be re-validated on the server instead of *executed* on
 * the server.
 *
 * ## Layer order
 *
 * We apply CR 613 layers explicitly, in the order `LAYER_ORDER` declares:
 *
 *   2  control      → 4  type      → 5  colour   → 6  abilities (keywords)
 *   7b set P/T      → 7c modify    → 7d counters → 7e switch
 *
 * XMage got this right by putting an explicit `Layer` on every continuous
 * effect; Forge infers the layer from which parameters a script line happens to
 * set, which makes interactions surprising. We state the layer.
 *
 * Layer 7d (+1/+1 and -1/-1 counters) is not declarable and does not need to
 * be: it is read straight off `CardInstance.counters` between 7c and 7e, so no
 * card has to remember to say so.
 *
 * ## The dependency gap, stated out loud
 *
 * Within a layer, effects apply in timestamp order. CR 613.8 dependency
 * ordering is NOT implemented — gap reason `layer-dependency`. Conditions and
 * `affects` selectors are evaluated against the pre-layer (base) view, so a
 * static ability cannot see the result of another static ability applied in the
 * same pass. Correct for the overwhelming majority of real board states, wrong
 * for a small set of adversarial ones, and named here so nobody discovers it at
 * a table.
 */

import type {
  CardInstance,
  GameState,
  InstanceId,
  ManaColor,
  PlayerId,
  FloatingEffect,
} from '../types.ts';
import type {
  Modification,
  Selector,
  StaticAbility,
} from './dsl.ts';
import { LAYER_ORDER, assertNever } from './dsl.ts';
import type {
  AbilityContext,
  ActiveCostMod,
  ActiveRestriction,
  DerivedCard,
  DerivedState,
} from './query.ts';
import { evalCondition, evalValue, parseTypeLine, resolvePlayers, resolveSelector } from './query.ts';
import { abilitiesFor } from './registry.ts';
import { effectiveKeywords } from '../keywords.ts';

/* -------------------------------------------------------------------------- */
/* Base characteristics                                                       */
/* -------------------------------------------------------------------------- */

function baseNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function counterDelta(card: CardInstance): number {
  return (card.counters['+1/+1'] ?? 0) - (card.counters['-1/-1'] ?? 0);
}

/**
 * A card as printed, before any continuous effect.
 *
 * `powerOverride`/`toughncessOverride` — the player's own manual set — are
 * folded in here rather than at layer 7b, because a hand-set stat is the
 * player telling us what the card *is*, not an effect modifying it. Counters
 * are deliberately NOT applied yet: they belong at 7d, after anthems.
 */
function baseCard(card: CardInstance): DerivedCard {
  const { supertypes, types, subtypes } = parseTypeLine(card.typeLine);
  return {
    instanceId: card.instanceId,
    controllerId: card.controllerId,
    power: card.powerOverride ?? baseNumber(card.power),
    toughness: card.toughnessOverride ?? baseNumber(card.toughness),
    types,
    subtypes,
    supertypes,
    colors: [...(card.colorIdentity ?? [])],
    keywords: effectiveKeywords(card),
    manaValue: card.cmc ?? 0,
  };
}

function baseView(state: GameState): Record<InstanceId, DerivedCard> {
  const cards: Record<InstanceId, DerivedCard> = {};
  for (const id of Object.keys(state.cards)) {
    const card = state.cards[id];
    if (!card) continue;
    cards[id] = baseCard(card);
  }
  return cards;
}

/* -------------------------------------------------------------------------- */
/* Collecting what is active                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One continuous modification waiting to be applied, with everything needed to
 * place it in layer and timestamp order.
 */
interface PendingModification {
  layer: Modification['layer'];
  modification: Modification;
  affects: Selector;
  sourceInstanceId: InstanceId;
  sourceName: string;
  abilityId: string;
  controllerId: PlayerId;
  /** Position in a deterministic scan of the board. Our timestamp. */
  timestamp: number;
}

/**
 * Every static ability currently applying, in a stable order.
 *
 * The scan is players in seat order, then each player's battlefield array in
 * its own order, then floating effects in the order they were created. Two
 * clients holding the same state therefore assign the same timestamps, which is
 * what stops "the last anthem wins" meaning different things on different
 * screens.
 */
function collectModifications(state: GameState, base: Record<InstanceId, DerivedCard>): PendingModification[] {
  const out: PendingModification[] = [];
  let timestamp = 0;

  const baseCtx = (sourceId: InstanceId, controllerId: PlayerId): AbilityContext => ({
    state,
    derived: { cards: base, restrictions: [], costMods: [] },
    sourceId,
    controllerId,
    targets: [],
    x: 0,
  });

  for (const player of state.players) {
    for (const instanceId of player.zones.battlefield ?? []) {
      const card = state.cards[instanceId];
      if (!card || card.removedFromGame) continue;

      const record = abilitiesFor(card);
      for (const ability of record.abilities) {
        if (ability.kind !== 'static') continue;
        const zones = ability.activeZones ?? ['battlefield'];
        if (!zones.includes('battlefield')) continue;

        const ctx = baseCtx(instanceId, card.controllerId);
        if (ability.condition && !evalCondition(ability.condition, ctx)) continue;

        for (const modification of ability.modifications) {
          out.push({
            layer: modification.layer,
            modification,
            affects: ability.affects,
            sourceInstanceId: instanceId,
            sourceName: card.name,
            abilityId: ability.id,
            controllerId: card.controllerId,
            timestamp: timestamp++,
          });
        }
      }
    }
  }

  // Floating effects — pumps and control theft with a duration. They are plain
  // data on the state, never a timer and never a closure, so they replay.
  for (const floating of state.floating ?? []) {
    const source = state.cards[floating.sourceInstanceId];
    for (const modification of floating.modifications) {
      out.push({
        layer: modification.layer,
        modification,
        affects: floating.affects,
        sourceInstanceId: floating.sourceInstanceId,
        sourceName: source?.name ?? floating.name,
        abilityId: floating.id,
        controllerId: floating.controllerId,
        timestamp: timestamp++,
      });
    }
  }

  const layerIndex = (layer: Modification['layer']) => {
    const index = LAYER_ORDER.indexOf(layer);
    // An unknown layer sorts last rather than first: it can then only ever be
    // overridden, never silently override something correct.
    return index === -1 ? LAYER_ORDER.length : index;
  };

  return out.sort((a, b) => {
    const byLayer = layerIndex(a.layer) - layerIndex(b.layer);
    return byLayer !== 0 ? byLayer : a.timestamp - b.timestamp;
  });
}

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

function addUnique(list: string[], values: string[] | undefined): string[] {
  if (!values || values.length === 0) return list;
  const out = list.slice();
  for (const raw of values) {
    const value = raw.toLowerCase();
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function removeAll(list: string[], values: string[] | undefined): string[] {
  if (!values || values.length === 0) return list;
  const drop = new Set(values.map(value => value.toLowerCase()));
  return list.filter(value => !drop.has(value));
}

/**
 * Build the derived board.
 *
 * Memoised on the state object's identity: `applyAction` returns a new object
 * on every change, so the cache is exact and never stale. It is a cache and not
 * state — dropping it changes nothing but speed, which is the only kind of
 * memoisation a pure engine may have.
 */
const DERIVED_CACHE = new WeakMap<GameState, DerivedState>();

export function deriveState(state: GameState): DerivedState {
  const cached = DERIVED_CACHE.get(state);
  if (cached) return cached;
  const derived = computeDerivedState(state);
  DERIVED_CACHE.set(state, derived);
  return derived;
}

function computeDerivedState(state: GameState): DerivedState {
  const base = baseView(state);
  const pending = collectModifications(state, base);

  // Work on a copy so `base` stays the pre-layer view every condition and
  // selector is evaluated against. That is the `layer-dependency` gap, made
  // structural rather than accidental.
  const cards: Record<InstanceId, DerivedCard> = {};
  for (const id of Object.keys(base)) cards[id] = { ...base[id], colors: [...base[id].colors] };

  const restrictions: ActiveRestriction[] = [];
  const costMods: ActiveCostMod[] = [];

  const contextFor = (sourceInstanceId: InstanceId, controllerId: PlayerId): AbilityContext => ({
    state,
    derived: { cards: base, restrictions: [], costMods: [] },
    sourceId: sourceInstanceId,
    controllerId,
    targets: [],
    x: 0,
  });

  let countersApplied = false;
  const applyCounters = () => {
    if (countersApplied) return;
    countersApplied = true;
    for (const id of Object.keys(cards)) {
      const card = state.cards[id];
      if (!card) continue;
      const delta = counterDelta(card);
      if (delta === 0) continue;
      cards[id].power += delta;
      cards[id].toughness += delta;
    }
  };

  for (const item of pending) {
    // CR 613 layer 7d sits between 7c (modify) and 7e (switch).
    if (item.layer === 'pt-switch') applyCounters();

    const ctx = contextFor(item.sourceInstanceId, item.controllerId);
    const affected = resolveSelector(item.affects, ctx);
    const modification = item.modification;

    switch (modification.layer) {
      case 'control': {
        const [newController] = resolvePlayers(modification.newController, ctx);
        if (!newController) break;
        for (const id of affected) {
          if (cards[id]) cards[id].controllerId = newController;
        }
        break;
      }

      case 'type':
        for (const id of affected) {
          const view = cards[id];
          if (!view) continue;
          view.types = removeAll(addUnique(view.types, modification.addTypes), modification.removeTypes);
          view.subtypes = addUnique(view.subtypes, modification.addSubtypes);
        }
        break;

      case 'color':
        for (const id of affected) {
          const view = cards[id];
          if (!view) continue;
          view.colors = [...modification.setColors] as ManaColor[];
        }
        break;

      case 'ability':
        for (const id of affected) {
          const view = cards[id];
          if (!view) continue;
          view.keywords = removeAll(addUnique(view.keywords, modification.grant), modification.remove);
        }
        break;

      case 'pt-set': {
        const power = evalValue(modification.power, ctx);
        const toughness = evalValue(modification.toughness, ctx);
        for (const id of affected) {
          const view = cards[id];
          if (!view) continue;
          view.power = power;
          view.toughness = toughness;
        }
        break;
      }

      case 'pt-modify': {
        const power = evalValue(modification.power, ctx);
        const toughness = evalValue(modification.toughness, ctx);
        for (const id of affected) {
          const view = cards[id];
          if (!view) continue;
          view.power += power;
          view.toughness += toughness;
        }
        break;
      }

      case 'pt-switch':
        for (const id of affected) {
          const view = cards[id];
          if (!view) continue;
          const power = view.power;
          view.power = view.toughness;
          view.toughness = power;
        }
        break;

      case 'cost-modify':
        costMods.push({
          sourceInstanceId: item.sourceInstanceId,
          sourceName: item.sourceName,
          abilityId: item.abilityId,
          mod: modification,
          delta: evalValue(modification.delta, ctx),
        });
        break;

      case 'restriction':
        restrictions.push({
          sourceInstanceId: item.sourceInstanceId,
          sourceName: item.sourceName,
          abilityId: item.abilityId,
          rule: modification.rule,
          affected: restrictionSubjects(modification.rule, ctx),
        });
        break;

      default:
        return assertNever(modification, 'deriveState');
    }
  }

  // Nothing declared a switch, so counters have not been folded in yet.
  applyCounters();

  // CR 613 does not let toughness or power go below zero for the purposes of
  // reading a stat line; damage and lethality are combat's business, not ours.
  for (const id of Object.keys(cards)) {
    if (cards[id].power < 0) cards[id].power = 0;
  }

  return { cards, restrictions, costMods };
}

function restrictionSubjects(rule: import('./dsl.ts').Restriction, ctx: AbilityContext): InstanceId[] {
  switch (rule.rule) {
    case 'cant-attack':
    case 'cant-block':
    case 'must-attack':
    case 'cant-untap':
      return resolveSelector(rule.who, ctx);
    case 'cant-be-blocked-except-by':
    case 'cant-be-targeted':
      return resolveSelector(rule.who, ctx);
    case 'damage-prevention':
      return resolveSelector(rule.to, ctx);
    case 'cant-cast':
    case 'max-lands-per-turn':
      return [];
    default:
      return assertNever(rule, 'restrictionSubjects');
  }
}

/* -------------------------------------------------------------------------- */
/* Reading the derived board                                                  */
/* -------------------------------------------------------------------------- */

export function derivedCard(state: GameState, instanceId: InstanceId): DerivedCard | undefined {
  return deriveState(state).cards[instanceId];
}

/** Power after every continuous effect. Use this, not `card.power`. */
export function derivedPower(state: GameState, instanceId: InstanceId): number {
  return derivedCard(state, instanceId)?.power ?? 0;
}

/** Toughness after every continuous effect. */
export function derivedToughness(state: GameState, instanceId: InstanceId): number {
  return derivedCard(state, instanceId)?.toughness ?? 0;
}

/** Keywords after every continuous effect, including those granted by a lord. */
export function derivedKeywords(state: GameState, instanceId: InstanceId): string[] {
  return derivedCard(state, instanceId)?.keywords ?? [];
}

/** Controller after every continuous effect, so theft is visible to callers. */
export function derivedController(state: GameState, instanceId: InstanceId): PlayerId | undefined {
  return derivedCard(state, instanceId)?.controllerId;
}

/**
 * Is there a live restriction of this kind on this permanent?
 *
 * `unless` is evaluated here rather than baked in when the view was built,
 * because "can't attack unless you pay {2}" has to be asked at the moment of
 * attacking, not at the moment the enchantment resolved.
 */
export function hasRestriction(
  state: GameState,
  instanceId: InstanceId,
  rule: 'cant-attack' | 'cant-block' | 'must-attack' | 'cant-untap'
): boolean {
  const derived = deriveState(state);
  return derived.restrictions.some(active => {
    if (active.rule.rule !== rule) return false;
    if (!active.affected.includes(instanceId)) return false;
    if (!('unless' in active.rule) || !active.rule.unless) return true;
    const card = state.cards[active.sourceInstanceId];
    const ctx: AbilityContext = {
      state,
      derived,
      sourceId: active.sourceInstanceId,
      controllerId: card?.controllerId ?? state.activePlayerId,
      targets: [],
      x: 0,
    };
    // The restriction bites only while the escape clause is unmet.
    return !evalCondition(active.rule.unless, ctx);
  });
}

/**
 * Total generic-mana adjustment for casting this card, from every live cost
 * modifier. Negative reduces. Callers hand this to `mana.ts`, which stays the
 * one and only implementation of paying for anything.
 */
export function costAdjustmentFor(
  state: GameState,
  instanceId: InstanceId,
  casterId: PlayerId
): number {
  const derived = deriveState(state);
  let delta = 0;

  for (const active of derived.costMods) {
    const source = state.cards[active.sourceInstanceId];
    const ctx: AbilityContext = {
      state,
      derived,
      sourceId: active.sourceInstanceId,
      controllerId: source?.controllerId ?? casterId,
      targets: [],
      x: 0,
    };
    const forWhom = resolvePlayers(active.mod.forWhom, ctx);
    if (!forWhom.includes(casterId)) continue;
    if (!resolveSelector(active.mod.applies, ctx).includes(instanceId)) continue;
    delta += active.delta;
  }

  return delta;
}

/* -------------------------------------------------------------------------- */
/* The combat adapter                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A `GameState` whose cards carry their DERIVED power, toughness and keywords,
 * for handing to `combat.ts`.
 *
 * `combat.ts` reads `powerOf(card)`, which consults `powerOverride` and
 * `counters`. Rather than reach into a module this one does not own, we hand it
 * a view in which the derived numbers are already in the fields it reads. The
 * view is transient: it is used to COMPUTE the combat outcome (a list of
 * ordinary actions) and then thrown away. Nothing derived is ever stored, so
 * the action log stays the only authority and replay stays byte-identical.
 *
 * Counters are cleared on the view because they have already been folded into
 * the derived power and toughness at layer 7d; leaving them would count twice.
 */
export function withDerivedCharacteristics(state: GameState): GameState {
  const derived = deriveState(state);
  let changed = false;
  const cards: Record<InstanceId, CardInstance> = {};

  for (const id of Object.keys(state.cards)) {
    const card = state.cards[id];
    const view = derived.cards[id];
    if (!card || !view) {
      cards[id] = card;
      continue;
    }

    const keywordsMatch =
      view.keywords.length === (card.keywords ?? []).length &&
      view.keywords.every(keyword => (card.keywords ?? []).includes(keyword));

    const needsPatch =
      card.powerOverride !== view.power ||
      card.toughnessOverride !== view.toughness ||
      card.controllerId !== view.controllerId ||
      !keywordsMatch ||
      Object.keys(card.counters).length > 0;

    if (!needsPatch) {
      cards[id] = card;
      continue;
    }

    changed = true;
    cards[id] = {
      ...card,
      controllerId: view.controllerId,
      powerOverride: view.power,
      toughnessOverride: view.toughness,
      keywords: view.keywords,
      grantedKeywords: undefined,
      suppressedKeywords: undefined,
      // Already folded in at 7d. Keeping them would apply them twice.
      counters: stripPtCounters(card.counters),
    };
  }

  return changed ? { ...state, cards } : state;
}

function stripPtCounters(counters: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(counters)) {
    if (key === '+1/+1' || key === '-1/-1') continue;
    out[key] = counters[key];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Floating effects                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which floating effects have run out, given the state at cleanup.
 *
 * Called by the reducer at the cleanup step and whenever a permanent leaves the
 * battlefield. Expiry is computed from state, never from a timer, so a client
 * replaying the log expires exactly the same effects at exactly the same point.
 */
export function expiredFloatingIds(state: GameState): string[] {
  const out: string[] = [];

  for (const floating of state.floating ?? []) {
    switch (floating.duration) {
      case 'permanent':
        break;

      case 'end-of-turn':
        // Created this turn or earlier; cleanup of any turn at or after the one
        // it was made on ends it. (A "until end of turn" effect made during a
        // turn always ends at that turn's cleanup.)
        if (state.turn >= floating.createdTurn) out.push(floating.id);
        break;

      case 'your-next-turn':
        // Ends at the cleanup of its controller's next turn, so it has to
        // survive at least one cleanup that is not theirs.
        if (state.turn > floating.createdTurn && state.activePlayerId === floating.controllerId) {
          out.push(floating.id);
        }
        break;

      case 'while-source-on-battlefield': {
        const source = state.cards[floating.sourceInstanceId];
        if (!source || source.zone !== 'battlefield' || source.removedFromGame) {
          out.push(floating.id);
        }
        break;
      }

      default:
        return assertNever(floating.duration, 'expiredFloatingIds');
    }
  }

  return out;
}

/**
 * Floating effects whose source has left the battlefield, checked after every
 * action rather than only at cleanup — a pump that says "for as long as this
 * remains on the battlefield" has to stop the instant the source dies, not at
 * end of turn.
 */
export function orphanedFloatingIds(state: GameState): string[] {
  return (state.floating ?? [])
    .filter(floating => {
      if (floating.duration !== 'while-source-on-battlefield') return false;
      const source = state.cards[floating.sourceInstanceId];
      return !source || source.zone !== 'battlefield' || source.removedFromGame;
    })
    .map(floating => floating.id);
}

/** Build a floating effect record. Ids are derived from state, never random. */
export function floatingEffect(options: {
  id: string;
  sourceInstanceId: InstanceId;
  controllerId: PlayerId;
  name: string;
  affects: Selector;
  modifications: Modification[];
  duration: FloatingEffect['duration'];
  createdTurn: number;
}): FloatingEffect {
  return {
    id: options.id,
    sourceInstanceId: options.sourceInstanceId,
    controllerId: options.controllerId,
    name: options.name,
    affects: options.affects,
    modifications: options.modifications,
    duration: options.duration,
    createdTurn: options.createdTurn,
  };
}

/** Every static ability a card record carries. Exported for the coverage report. */
export function staticAbilitiesOf(card: CardInstance): StaticAbility[] {
  return abilitiesFor(card).abilities.filter(
    (ability): ability is StaticAbility => ability.kind === 'static'
  );
}
