/**
 * DeckMatrix — shared game-state core: type space.
 *
 * This module is the single description of "a game of Magic in progress" for
 * every surface that needs one:
 *
 *   - the phone-on-the-table life counter (mode: 'life-counter'), where nobody
 *     has registered a decklist and only life / poison / commander damage move;
 *   - the full networked play system (mode: 'full'), where every card is a
 *     tracked instance sitting in a zone.
 *
 * Hard constraints, deliberately enforced by shape:
 *   - Everything here is JSON-serialisable. No Date, no Map/Set, no class
 *     instances, no functions. A `GameState` can be posted over a wire,
 *     stored in a Supabase column, or handed to `structuredClone` unchanged.
 *   - No transport and no storage concerns live in this folder. Nothing here
 *     knows about Supabase, websockets, React, or localStorage.
 *   - Card instances live in one flat `GameState.cards` dictionary; zones hold
 *     ordered arrays of instance ids. That keeps moves O(1) to describe, keeps
 *     diffs small over a network, and stops the same card existing twice.
 *
 * Note on naming: `Format` here is the game-relevant *format code*. The deck
 * legality `Format` interface in `@/lib/magic/formats` is a different thing —
 * alias one of them if a file ever needs both.
 */

/*
 * The only import in this file, and deliberately `import type`: it erases at
 * compile time, so this module still pulls in no runtime code and a `GameState`
 * remains plain JSON. `TriggeredAbility` is itself a pure data shape.
 */
import type { TriggeredAbility } from '../cards/abilities/dsl.ts';

export type PlayerId = string;
export type InstanceId = string;
/**
 * Identifies one commander for damage-tracking purposes. In 'full' mode this
 * is the commander's `CardInstance.instanceId`; in 'life-counter' mode it is a
 * synthetic id, because a life counter has no cards.
 */
export type CommanderId = string;

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/* -------------------------------------------------------------------------- */
/* Zones                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * CR 400.1 — the seven zones we model. `stack` is a *shared* zone in the rules;
 * we still file a card on the stack under its owner's `Player.zones.stack` so
 * that the "a card is in exactly one zone array" invariant holds, and let
 * `GameState.stack` be authoritative for order.
 */
export type Zone =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'command'
  | 'stack';

export const ZONES: readonly Zone[] = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'command',
  'stack',
] as const;

/** Zones whose contents are hidden from opponents. Used by networked play to redact state. */
export const HIDDEN_ZONES: readonly Zone[] = ['library', 'hand'] as const;

/* -------------------------------------------------------------------------- */
/* Formats                                                                    */
/* -------------------------------------------------------------------------- */

export type Format =
  | 'commander'
  | 'brawl'
  | 'oathbreaker'
  | 'standard'
  | 'pioneer'
  | 'modern'
  | 'legacy'
  | 'vintage'
  | 'pauper'
  | 'historic'
  | 'alchemy'
  | 'explorer'
  | 'penny'
  | 'limited'
  | 'custom';

/**
 * The rules constants a game runs on. Resolved once at `createGame` and frozen
 * onto the state, so a game in progress never changes shape because a shared
 * table elsewhere was edited.
 */
export interface FormatRules {
  format: Format;
  label: string;
  /** 40 for Commander, 20 for most constructed formats. */
  startingLife: number;
  startingHandSize: number;
  /** Soft cap used by seating and lobby UI. */
  maxPlayers: number;
  /** Format uses the command zone (Commander, Brawl, Oathbreaker). */
  usesCommandZone: boolean;
  /** Commander damage is a loss condition. False for Oathbreaker. */
  usesCommanderDamage: boolean;
  /** Lethal commander damage from a *single* commander. 21 in Commander. */
  commanderDamageLethal: number;
  /** Lethal poison counters. 10 everywhere. */
  poisonLethal: number;
  singleton: boolean;
  /** Generic mana added to a commander's cost per previous cast from the command zone. */
  commanderTaxPerCast: number;
}

/* -------------------------------------------------------------------------- */
/* Turn structure                                                             */
/* -------------------------------------------------------------------------- */

export type Phase =
  | 'beginning'
  | 'precombat_main'
  | 'combat'
  | 'postcombat_main'
  | 'ending';

export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'precombat_main'
  | 'begin_combat'
  | 'declare_attackers'
  | 'declare_blockers'
  | 'combat_damage'
  | 'end_combat'
  | 'postcombat_main'
  | 'end'
  | 'cleanup';

/** The real turn structure, in order. `phaseOf()` maps a step to its phase. */
export const TURN_STEPS: readonly Step[] = [
  'untap',
  'upkeep',
  'draw',
  'precombat_main',
  'begin_combat',
  'declare_attackers',
  'declare_blockers',
  'combat_damage',
  'end_combat',
  'postcombat_main',
  'end',
  'cleanup',
] as const;

export const PHASE_OF_STEP: Record<Step, Phase> = {
  untap: 'beginning',
  upkeep: 'beginning',
  draw: 'beginning',
  precombat_main: 'precombat_main',
  begin_combat: 'combat',
  declare_attackers: 'combat',
  declare_blockers: 'combat',
  combat_damage: 'combat',
  end_combat: 'combat',
  postcombat_main: 'postcombat_main',
  end: 'ending',
  cleanup: 'ending',
};

export const STEP_LABELS: Record<Step, string> = {
  untap: 'Untap',
  upkeep: 'Upkeep',
  draw: 'Draw',
  precombat_main: 'Main 1',
  begin_combat: 'Begin Combat',
  declare_attackers: 'Declare Attackers',
  declare_blockers: 'Declare Blockers',
  combat_damage: 'Combat Damage',
  end_combat: 'End of Combat',
  postcombat_main: 'Main 2',
  end: 'End Step',
  cleanup: 'Cleanup',
};

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One physical card in one game. Never shared between games and never
 * duplicated across zones — `zone` and the owning player's zone array are kept
 * in step by the reducer.
 */
export interface CardInstance {
  instanceId: InstanceId;
  /** Scryfall / `cards` table id. Stable across games; not unique within one. */
  cardId: string;
  name: string;
  ownerId: PlayerId;
  /** Diverges from `ownerId` under theft effects. */
  controllerId: PlayerId;
  zone: Zone;

  tapped: boolean;
  faceDown: boolean;
  flipped: boolean;
  summoningSick: boolean;
  /** Damage marked this turn. Cleared at cleanup. */
  damage: number;
  /**
   * CR 704.5h — set when a source with deathtouch has dealt this permanent any
   * damage. Deathtouch makes *any* nonzero amount lethal, so the amount alone
   * cannot say whether the permanent should be destroyed; this flag carries the
   * other half. Cleared with `damage` at cleanup and on every zone change.
   */
  damagedByDeathtouch?: boolean;
  /** '+1/+1', 'loyalty', 'charge', … Absent key means zero. */
  counters: Record<string, number>;
  /** Equipment / Auras: the instance this is attached to. */
  attachedTo?: InstanceId;
  /**
   * CR 400.7 — bumped every time this card changes zones.
   *
   * A card that leaves a zone and comes back is a *new object*: the same
   * `instanceId`, but not the thing anything was pointing at. Comparing zones
   * alone misses the case a player will actually hit — flicker a creature in
   * response to a removal spell and it returns to the battlefield, same zone,
   * different object. Targets snapshot this number on announcement so
   * `stack.ts` can tell those apart on resolution.
   */
  zoneChangeCounter?: number;

  isCommander: boolean;
  /** Times cast from the command zone. Drives commander tax. */
  castCount: number;

  /**
   * Raw cost string, e.g. "{2}{W}{U}". Stored for rendering only — it MUST be
   * passed to `ManaCost` from '@/components/ui/mana-cost', never printed.
   */
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  power?: string;
  toughness?: string;
  /**
   * Printed starting loyalty, exactly as Scryfall prints it. Planeswalkers only.
   *
   * It seeds the `loyalty` counter when the card enters the battlefield, and it
   * is also the gate on CR 704.5i: a planeswalker whose printed loyalty was
   * never loaded is never destroyed by that state-based action, because putting
   * a permanent into a graveyard on a number we do not have is exactly the
   * silent corruption this engine refuses to commit.
   */
  loyalty?: string;
  colorIdentity?: ManaColor[];
  imageUrl?: string;
  /**
   * Lower-cased oracle keywords — 'flying', 'vigilance', 'trample', 'haste',
   * 'defender', 'deathtouch', 'reach', 'first strike'. Copied from the card
   * record at setup. Read it through `effectiveKeywords`/`hasKeyword` in
   * `keywords.ts`, never directly, so hand-flagged keywords count too.
   */
  keywords?: string[];
  /**
   * Raw oracle text, faces joined with newlines. Feeds trigger detection in
   * `effects.ts` and the inspector's rules box.
   *
   * Absent means "we never loaded it", which is NOT the same as "this card has
   * no abilities" — `automationFor` reports that difference, because a card
   * that silently does nothing is the bug this field exists to fix.
   */
  oracleText?: string;
  /**
   * Scryfall `oracle_id` — stable across every printing of a card, where
   * `cardId` is per-printing. It is the key the ability compiler and any
   * hand-authored ability entry are filed under, so two printings of one card
   * resolve to the same abilities. Optional: absent, the compiler falls back to
   * the card's name.
   */
  oracleId?: string;

  /* --- manual intervention: the player's own overrides --- */

  /**
   * Hand-set base power/toughness. Replaces the printed value; +1/+1 and -1/-1
   * counters still apply on top, so "set to 4/4" and "add two +1/+1 counters"
   * compose the way a player expects.
   */
  powerOverride?: number;
  toughnessOverride?: number;
  /**
   * Keywords flagged on by hand (or by an effect the engine cannot read), on
   * top of the printed list. This is how "mark this one as flying" works.
   */
  grantedKeywords?: string[];
  /** Printed keywords the player has switched off. */
  suppressedKeywords?: string[];
  /**
   * Set when the player has confirmed they resolved this card's unimplemented
   * text by hand, so the "manual" marker can be dismissed. Cleared whenever the
   * card changes zone, because what arrives is a new object.
   */
  manualResolved?: boolean;

  isToken: boolean;
  /** Set when its owner leaves the game (CR 800.4a). Kept for replay/history. */
  removedFromGame: boolean;
}

/**
 * Everything needed to put a token onto the battlefield. A token has no
 * Scryfall row, so this is the whole card.
 */
export interface TokenSpec {
  name: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  colorIdentity?: ManaColor[];
  keywords?: string[];
  oracleText?: string;
  /** Usually absent — token art is not resolved. The UI draws a placeholder. */
  imageUrl?: string;
}

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A commander for damage-tracking. Separate from `CardInstance` on purpose:
 * the life counter needs commander damage without any decklist, and partner
 * pairs must be tracked independently because 21 is per *commander*, not per
 * opponent.
 */
export interface CommanderRef {
  id: CommanderId;
  playerId: PlayerId;
  name: string;
  /** Present in 'full' mode: the card this ref points at. */
  instanceId?: InstanceId;
  /** Casts from the command zone so far. Tax = casts * rules.commanderTaxPerCast. */
  castCount: number;
  colorIdentity?: ManaColor[];
  imageUrl?: string;
}

export type LossReason =
  | 'life'
  | 'poison'
  | 'commander_damage'
  | 'empty_library'
  | 'concede'
  | 'effect';

export interface Player {
  id: PlayerId;
  name: string;
  /** Index into the seating layout. Also the turn order. */
  seat: number;

  life: number;
  poison: number;
  /** Player-level counters: 'energy', 'experience', 'rad', 'ticket'. */
  counters: Record<string, number>;

  commanders: CommanderRef[];
  /**
   * Commander damage *received*, keyed by the `CommanderId` that dealt it.
   * Any single entry reaching `rules.commanderDamageLethal` is lethal —
   * never sum these.
   */
  commanderDamage: Record<CommanderId, number>;

  zones: Record<Zone, InstanceId[]>;

  landsPlayedThisTurn: number;
  /** Set when a draw is attempted on an empty library; loss is applied by SBAs. */
  drewFromEmptyLibrary: boolean;
  conceded: boolean;
  hasLost: boolean;
  lossReasons: LossReason[];

  /** Optional identity metadata. Inert here — no lookup, no I/O. */
  profileId?: string | null;
  deckId?: string | null;
  avatarUrl?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Combat                                                                     */
/* -------------------------------------------------------------------------- */

/** Attacks are declared against a player or a planeswalker/battle. */
export interface AttackDeclaration {
  attackerId: InstanceId;
  defenderPlayerId?: PlayerId;
  defenderInstanceId?: InstanceId;
  blockedBy: InstanceId[];
}

export interface CombatState {
  attackers: AttackDeclaration[];
}

/* -------------------------------------------------------------------------- */
/* The stack (CR 405, 601, 608)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ported from XMage's `mage.game.stack` / `mage.abilities` *model*, not its
 * mechanism. XMage puts live Java objects on a `SpellStack` and calls
 * `resolve(game)` on them; that is an object graph with behaviour attached, and
 * it is neither serialisable nor replayable. Here a stack object is a plain
 * record and its behaviour is a list of declarative `StackEffect` values that
 * `stack.ts` compiles into ordinary `GameAction`s at resolution time. Same
 * model, and the game stays "a seed plus an action log".
 *
 * XMage is MIT licensed (https://github.com/magefree/mage). The MIT notice is
 * retained for the ported portions and XMage is credited in the project's
 * licences.
 */
export type StackObjectId = string;

/**
 * One thing a spell or ability points at. Chosen on announcement (CR 601.2c)
 * and checked again on resolution (CR 608.2b) — which is why `zone` is part of
 * the reference: a card that has changed zones is a new object (CR 400.7) and
 * therefore no longer the thing that was targeted.
 */
export interface StackTarget {
  kind: 'player' | 'card' | 'stack';
  playerId?: PlayerId;
  instanceId?: InstanceId;
  stackId?: StackObjectId;
  /** Zone the card was in when it was targeted. */
  zone?: Zone;
  /** `CardInstance.zoneChangeCounter` at announcement. Catches flicker (CR 400.7). */
  zoneChangeCounter?: number;
}

/**
 * Where an effect gets its recipients. `target` indexes into the stack
 * object's own `targets`, so a fizzled target silently drops that effect
 * rather than hitting the wrong permanent.
 */
export type StackTargetSelector =
  | { from: 'target'; index: number }
  | { from: 'controller' }
  | { from: 'source' }
  | { from: 'each-opponent' }
  | { from: 'each-player' }
  | { from: 'ref'; ref: StackTarget };

/**
 * What a stack object does when it resolves, as data. This is the ability DSL
 * the oracle-text compiler emits into; nothing here is a function, so a stack
 * object survives `JSON.stringify` and a client can replay it exactly.
 */
export type StackEffect =
  | { op: 'damage'; amount: number; to?: StackTargetSelector; infect?: boolean }
  | { op: 'life'; amount: number; to?: StackTargetSelector }
  | { op: 'poison'; amount: number; to?: StackTargetSelector }
  | { op: 'draw'; count: number; to?: StackTargetSelector }
  | { op: 'counters'; counter: string; delta: number; to?: StackTargetSelector }
  | { op: 'tap'; to?: StackTargetSelector }
  | { op: 'untap'; to?: StackTargetSelector }
  | { op: 'move'; zone: Zone; to?: StackTargetSelector }
  | { op: 'counter-spell'; to?: StackTargetSelector }
  | { op: 'token'; token: TokenSpec; count?: number; tapped?: boolean; to?: StackTargetSelector }
  /** The honest escape hatch: say it out loud instead of silently doing nothing. */
  | { op: 'note'; message: string };

export type StackObjectKind = 'spell' | 'triggered' | 'activated';

export interface StackObject {
  stackId: StackObjectId;
  kind: StackObjectKind;
  name: string;
  controllerId: PlayerId;
  /** The card that *is* this spell. Absent for abilities — an ability is not a card. */
  cardInstanceId?: InstanceId;
  /** The permanent whose ability this is. */
  sourceInstanceId?: InstanceId;
  /** Chosen on announcement. Empty means "no targets", and an object with no targets never fizzles. */
  targets: StackTarget[];
  effects: StackEffect[];
  /** Where the card goes once it resolves: battlefield for permanents, graveyard for instants and sorceries. */
  resolvesTo?: Zone;
  /** CR 702.61 — nothing but mana abilities may be played while this is on the stack. */
  splitSecond?: boolean;
  /** CR 701.5b. Does NOT stop it fizzling: CR 608.2b is not countering. */
  cantBeCountered?: boolean;
  /** Turn it was announced on. Log/replay only. */
  turn: number;
}

/* -------------------------------------------------------------------------- */
/* Replacement effects (CR 614)                                               */
/* -------------------------------------------------------------------------- */

export type ReplacementId = string;

/** The event kinds this engine lets a replacement effect intercept. */
export type ReplaceableEventKind =
  | 'draw'
  | 'damage'
  | 'enters'
  | 'counters'
  | 'life-gain'
  | 'life-loss';

/** Narrowing conditions. Every field is AND-ed; an absent field matches everything. */
export interface ReplacementMatch {
  /** The affected player — the one drawing, taking the damage, gaining the life. */
  playerId?: PlayerId;
  /** The affected permanent. `'self'` means "the effect's own source", for self-replacement. */
  instanceId?: InstanceId | 'self';
  /** Controller of the affected permanent. */
  controllerId?: PlayerId;
  /** Lower-cased substring of the affected permanent's type line, e.g. `'land'`. */
  typeLine?: string;
  /** Only damage from this source. */
  sourceInstanceId?: InstanceId;
  /** `true` = combat damage only, `false` = non-combat only. */
  combat?: boolean;
  /** Only events of at least this size. */
  minAmount?: number;
  /** Counter kind, for `counters` and `enters` events. */
  counter?: string;
}

/** How the event is modified. Data, so it round-trips through the action log. */
export type ReplacementApply =
  | { op: 'enters-tapped' }
  | { op: 'enters-with-counters'; counter: string; count: number }
  | { op: 'scale-counters'; multiply?: number; plus?: number }
  | { op: 'prevent-damage'; amount?: number }
  | { op: 'scale-damage'; multiply?: number; plus?: number; min?: number }
  | { op: 'redirect-damage'; toPlayerId: PlayerId }
  | { op: 'damage-as-poison' }
  | { op: 'scale-draw'; multiply?: number; plus?: number }
  | { op: 'scale-life'; multiply?: number; plus?: number }
  /** The event simply does not happen. */
  | { op: 'skip' }
  /** "...instead, <these actions>". */
  | { op: 'instead'; actions: GameAction[] };

export interface ReplacementEffect {
  /** Stable and caller-supplied. Doubles as the once-only key (CR 614.5). */
  id: ReplacementId;
  /** Prose for the log: "Blood Moon", "Doubling Season". */
  name: string;
  event: ReplaceableEventKind;
  match?: ReplacementMatch;
  apply: ReplacementApply;
  /** The permanent generating it. Absent for emblems and player-level effects. */
  sourceInstanceId?: InstanceId;
  /** Who controls it. Used only for prose today. */
  controllerId?: PlayerId;
  /**
   * CR 614.13 — a self-replacement effect (one the object itself generates
   * about its own arrival, "this enters tapped") applies before any other
   * effect that would modify the same event.
   */
  selfReplacement?: boolean;
  /**
   * Defaults to `true` when `sourceInstanceId` is set and the effect is not a
   * self-replacement: the effect stops applying the moment its source leaves
   * the battlefield, without anyone having to remember to deregister it.
   */
  requiresBattlefield?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Triggered abilities                                                        */
/* -------------------------------------------------------------------------- */

/**
 * When an ability triggers. Read off oracle text by `effects.ts`; matched
 * against real game events by `triggers.ts`.
 *
 * Deliberately a closed set. A timing that is not in this list is not detected,
 * which lands the ability in `manualNotes` — the honest answer.
 */
export type TriggerTiming =
  | 'etb'
  | 'attack'
  | 'blocks'
  | 'deals-damage'
  | 'upkeep'
  | 'death'
  | 'end-step'
  | 'cast'
  | 'draw';

/** The effect kinds `effects.ts` can turn into real `GameAction`s. */
export type EffectKind =
  | 'gain-life'
  | 'lose-life'
  | 'each-opponent-loses-life'
  | 'draw'
  | 'create-token'
  | 'counter-on-self'
  | 'damage-each-opponent';

export interface DetectedEffect {
  kind: EffectKind;
  /** Always a concrete number — a variable amount is never emitted as an effect. */
  amount: number;
  /** The fragment of oracle text this came from, for the log line. */
  text: string;
  token?: TokenSpec;
  /** Token creation only: "create a tapped … token". */
  tapped?: boolean;
}

/**
 * CR 603.4 — the "if" clause between a trigger's event and its effect.
 *
 * An intervening "if" is checked twice: once when the ability would go on the
 * stack, and again as it resolves. Only a small, closed set of conditions can
 * be evaluated from our state; anything else is `unknown`, which stops the
 * trigger being automated at all rather than guessing at it.
 */
export type InterveningCondition =
  /** "if you control a creature" / "if you control three or more artifacts" */
  | { kind: 'controls'; typeWord: string; atLeast: number }
  /** "if you have 25 or more life" */
  | { kind: 'life-at-least'; amount: number }
  /** "if you have 5 or less life" */
  | { kind: 'life-at-most'; amount: number }
  /** "if it's your turn" */
  | { kind: 'your-turn' }
  /** Anything the engine will not evaluate. Carries the text so a human can. */
  | { kind: 'unknown'; text: string };

export interface DetectedTrigger {
  timing: TriggerTiming;
  /** The trigger's own text, normalised. Shown when the player must resolve it. */
  clause: string;
  effects: DetectedEffect[];
  /** True when at least one effect will be applied by the engine. */
  automated: boolean;
  /**
   * Text inside an otherwise-automated trigger that the engine did not handle.
   * Surfaced as a manual note so a half-resolved trigger never passes for a
   * whole one.
   */
  residual?: string;
  /** CR 603.4, when the clause opened with an "if" the engine could classify. */
  intervening?: InterveningCondition;
}

/** What actually happened in the game, as triggered abilities see it. */
export type TriggerEventKind =
  | 'enters'
  | 'dies'
  | 'attacks'
  | 'blocks'
  | 'deals-damage'
  | 'upkeep'
  | 'end-step'
  | 'cast'
  | 'draw';

/**
 * One game event, derived by diffing the state before and after an action.
 *
 * Deriving events from a diff rather than from the action alone is what lets a
 * death caused by a state-based action trigger a "dies" ability: nothing in the
 * action says a creature died, but the two states differ.
 */
export interface TriggerEvent {
  kind: TriggerEventKind;
  /** The permanent the event happened to, or that acted. */
  instanceId?: InstanceId;
  /** The player the event concerns: whose upkeep, who drew, who attacked. */
  playerId?: PlayerId;
  /** 'deals-damage': what was damaged. */
  targetInstanceId?: InstanceId;
  targetPlayerId?: PlayerId;
  amount?: number;
  fromZone?: Zone;
  toZone?: Zone;
  combat?: boolean;
}

/**
 * A triggered ability waiting on the stack.
 *
 * Serialisable in full — the ability itself is embedded rather than recomputed,
 * so a client that replays the log resolves exactly the ability that was put on
 * the stack, even if the source has since changed zone.
 */
export interface PendingTrigger {
  /** Deterministic within the batch that produced it. Stable across clients. */
  id: string;
  sourceInstanceId: InstanceId;
  /** Copied so the log reads correctly after a token source ceases to exist. */
  sourceName: string;
  controllerId: PlayerId;
  event: TriggerEvent;
  ability: DetectedTrigger;
  /**
   * The compiled ability, when the ability engine owns this card's triggers.
   *
   * Present exactly when `abilityEngineOwns(source)` was true at the moment the
   * trigger was detected, and its presence is what routes resolution through
   * `to-actions.ts` instead of the older `effects.ts` path. The two are never
   * both used for one trigger — see `trigger-bridge.ts`.
   *
   * Embedded rather than recompiled for the reason the whole interface is:
   * a client replaying the log resolves exactly the ability that was put on the
   * stack. It is plain JSON — no closures, no class instances — so it
   * round-trips through `JSON.stringify` like everything else in the state.
   *
   * `ability` above stays populated alongside it, describing the same clause in
   * the old vocabulary, so labels and any consumer that has not been taught
   * about the ability engine keep working.
   */
  dsl?: TriggeredAbility;
}

/* -------------------------------------------------------------------------- */
/* Game state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 'life-counter' — no decklists. Card, zone and draw actions are rejected and
 *   nobody can deck out. This is the phone-on-the-table mode.
 * 'full' — every card is tracked; all rules apply.
 */
export type GameMode = 'life-counter' | 'full';

export type GameStatus = 'setup' | 'playing' | 'complete';

/** Seeded PRNG state, so shuffles replay identically on every client. */
export interface RngState {
  seed: number;
}

export interface GameEvent {
  /** Monotonic within a game. Also the log array index. */
  seq: number;
  /** Epoch ms supplied by the caller. 0 when unclocked — this core never reads a clock. */
  at: number;
  turn: number;
  round: number;
  step: Step;
  type:
    | GameActionType
    | 'PLAYER_LOST'
    | 'GAME_OVER'
    /** A CR 704 state-based action applied. Carries which rule, in the message. */
    | 'STATE_BASED_ACTION'
    /** A triggered ability was put on the stack or resolved. */
    | 'TRIGGER';
  actorId?: PlayerId;
  /** Plain prose for the game log. Never contains raw mana-cost strings. */
  message: string;
}

export interface GameState {
  id: string;
  mode: GameMode;
  format: Format;
  rules: FormatRules;
  status: GameStatus;

  /** Ordered by `seat`. Index === seat. */
  players: Player[];
  cards: Record<InstanceId, CardInstance>;

  /** Increments on every turn taken by any player. */
  turn: number;
  /** Increments when the turn returns to the starting seat. "Turn 4" to a player. */
  round: number;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId;
  startingPlayerId: PlayerId;
  step: Step;

  combat: CombatState;

  /**
   * CR 405.2 — the stack, bottom first. The **last** element is the top and is
   * the next thing to resolve. Optional so a state persisted before the stack
   * existed still loads; read it through `stackOf()` in `stack.ts`, never
   * directly.
   */
  stack?: StackObject[];
  /**
   * CR 117.4 — players who have passed priority in succession since the stack
   * last changed. When every living player is in here, the top of the stack
   * resolves (or, on an empty stack, the step ends).
   */
  passedPriority?: PlayerId[];
  /** Source of deterministic stack object ids. Never a random or a clock. */
  nextStackId?: number;
  /** CR 614 — registered replacement effects. See `replacement.ts`. */
  replacements?: ReplacementEffect[];
  /**
   * CR 603.3 — abilities that have triggered and are waiting for the next time
   * a player would receive priority, **bottom of the stack first**.
   *
   * This is the waiting list, not the stack: a trigger sits here from the
   * moment its event happens until it is put on the stack in APNAP order. It is
   * drained inside `applyAction`, so it is normally empty between actions; it
   * lives in state anyway so the batch is inspectable, serialisable and
   * identical on every client replaying the log. Read it through
   * `pendingTriggersOf()` in `triggers.ts`, never directly.
   */
  pendingTriggers?: PendingTrigger[];

  monarchId?: PlayerId | null;
  initiativeId?: PlayerId | null;

  winnerIds: PlayerId[];
  log: GameEvent[];
  rng: RngState;

  startedAt: number;
  updatedAt: number;
  /** Bumped on every applied action. Optimistic-concurrency token for networked play. */
  version: number;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Common envelope. Every action is serialisable and replayable: given the same
 * starting state and the same action list, every client lands on byte-identical
 * state. That is what makes this core usable as a networked log.
 */
export interface ActionMeta {
  /** Caller-supplied id for dedupe/idempotency across a network. */
  id?: string;
  /** Who pressed the button. Not necessarily the affected player. */
  actorId?: PlayerId;
  /** Epoch ms supplied by the caller. This core never reads a clock itself. */
  at?: number;
  /**
   * Why this action happened, when it was not a button press — "Ajani's
   * Pridemate enters". Set by `effects.ts` on every triggered action and
   * prefixed onto the log line, so the feed shows the cause and not just the
   * consequence.
   */
  cause?: string;
  /**
   * CR 614.5 — replacement effect ids that have already applied to this event.
   * An effect gets exactly one opportunity to modify an event *and any events
   * resulting from it*, so this list is inherited by whatever the replacement
   * produces. Keeping it on the action (rather than in a mutable per-event set,
   * the way XMage does it) is what makes the once-only rule replay-safe: the
   * log carries the whole history of the event.
   */
  replacedBy?: ReplacementId[];
  /**
   * CR 616.1 — when several replacement effects would apply at once, the
   * affected player chooses which applies next. That choice is a player
   * decision, so it travels in the action rather than being guessed at.
   * Anything not named here falls back to a deterministic order, so a client
   * that never asks still never diverges.
   */
  replacementOrder?: ReplacementId[];
  /**
   * CR 603.3b — when several of one player's abilities trigger at once, that
   * player chooses the order they go on the stack. Like `replacementOrder`,
   * the choice travels with the action instead of pausing the reducer for a
   * prompt: a client calls `previewTriggers` to see the batch this action will
   * cause, and hands the ids back here in the order it wants them stacked. The
   * last id listed is the top of the stack and therefore resolves first.
   *
   * Ids that are unknown, repeated, or belong to another player are ignored,
   * and anything left out keeps its default position — so a malformed choice
   * degrades to the deterministic default rather than desynchronising clients.
   */
  triggerOrder?: string[];
}

export type GameAction = ActionMeta &
  (
    /* --- life, damage and loss conditions --- */
    | { type: 'LIFE_CHANGE'; playerId: PlayerId; delta: number }
    | { type: 'SET_LIFE'; playerId: PlayerId; life: number }
    | {
        type: 'DAMAGE';
        targetPlayerId: PlayerId;
        amount: number;
        sourcePlayerId?: PlayerId;
        sourceInstanceId?: InstanceId;
        /** Set to also tally commander damage from this commander. */
        commanderId?: CommanderId;
        /** Infect/toxic: poison counters instead of life loss. */
        infect?: boolean;
        combat?: boolean;
      }
    | {
        type: 'COMMANDER_DAMAGE';
        targetPlayerId: PlayerId;
        commanderId: CommanderId;
        /** Negative corrects a misclick: refunds life and lowers the tally. */
        amount: number;
      }
    | { type: 'POISON'; playerId: PlayerId; delta: number }
    | { type: 'CONCEDE'; playerId: PlayerId }

    /**
     * Mark damage on a permanent. CR 119.3 — marked damage sits there until
     * cleanup; whether it is lethal is a *state-based action*, not part of
     * dealing it, which is why this action never destroys anything itself.
     *
     * `deathtouch` records that the source had it. CR 702.2b makes any nonzero
     * amount from such a source lethal, and the amount alone cannot say that,
     * so the flag rides along to `CardInstance.damagedByDeathtouch`.
     */
    | {
        type: 'DAMAGE_CARD';
        instanceId: InstanceId;
        amount: number;
        sourceInstanceId?: InstanceId;
        sourcePlayerId?: PlayerId;
        deathtouch?: boolean;
        combat?: boolean;
      }

    /* --- counters --- */
    | { type: 'PLAYER_COUNTER'; playerId: PlayerId; counter: string; delta: number }
    | { type: 'CARD_COUNTER'; instanceId: InstanceId; counter: string; delta: number }

    /**
     * CR 301.5 / 303.4 — attach an Equipment or Aura to a permanent, or pass
     * `null` to unattach it. State-based actions unattach an Equipment whose
     * host has become illegal (CR 704.5n) through this action, so the change is
     * an ordinary logged, replayable step.
     */
    | { type: 'ATTACH'; instanceId: InstanceId; toInstanceId?: InstanceId | null }

    /* --- manual intervention ('full' mode; see manual.ts for builders) --- */
    /**
     * Hand-set or nudge a permanent's base power/toughness. `mode: 'adjust'`
     * adds to the current value; omitting a side leaves it alone; `null`
     * clears the override and restores the printed value.
     */
    | {
        type: 'SET_CARD_STAT';
        instanceId: InstanceId;
        power?: number | null;
        toughness?: number | null;
        mode?: 'set' | 'adjust';
      }
    /** Flag a keyword on or off by hand. `keywords.ts` says which ones the engine acts on. */
    | { type: 'SET_KEYWORD'; instanceId: InstanceId; keyword: string; on: boolean }
    /** Put tokens onto the battlefield. Instance ids are derived deterministically. */
    | {
        type: 'CREATE_TOKEN';
        playerId: PlayerId;
        token: TokenSpec;
        count?: number;
        tapped?: boolean;
        /** Override the derived id. Only for tests and replays. */
        instanceId?: InstanceId;
      }
    /** Dismiss (or restore) the "resolve this by hand" marker on one permanent. */
    | { type: 'MARK_MANUAL_RESOLVED'; instanceId: InstanceId; resolved?: boolean }
    /**
     * Changes nothing, says something. This is how the engine admits it did not
     * implement a card's text instead of silently doing nothing, and how a
     * player leaves a note in the log for the table.
     */
    | { type: 'NOTE'; message: string; instanceId?: InstanceId }

    /* --- cards and zones ('full' mode only) --- */
    | { type: 'DRAW'; playerId: PlayerId; count?: number }
    | {
        type: 'PLAY';
        instanceId: InstanceId;
        /** Defaults to 'battlefield'. Use 'graveyard' for a resolved instant/sorcery. */
        to?: Zone;
        tapped?: boolean;
        controllerId?: PlayerId;
        /**
         * CR 614.1c — counters the permanent *enters with*. Set by replacement
         * effects, so the permanent never exists on the battlefield without
         * them and an ETB trigger sees the right number.
         */
        counters?: Record<string, number>;
      }
    | {
        type: 'MOVE_ZONE';
        instanceId: InstanceId;
        to: Zone;
        /** Library insertion point. Number is a 0-based index from the top. */
        position?: 'top' | 'bottom' | number;
        controllerId?: PlayerId;
        /** As `PLAY.counters`. Only meaningful when `to` is 'battlefield'. */
        counters?: Record<string, number>;
        /** CR 614.1c — enters tapped. Only meaningful when `to` is 'battlefield'. */
        tapped?: boolean;
      }
    | { type: 'TAP'; instanceId: InstanceId }
    | { type: 'UNTAP'; instanceId: InstanceId }
    | { type: 'UNTAP_ALL'; playerId: PlayerId }
    | { type: 'SHUFFLE'; playerId: PlayerId; seed?: number }
    | { type: 'CAST_COMMANDER'; commanderId: CommanderId }

    /* --- combat --- */
    | {
        type: 'ATTACK';
        attackers: Array<{
          attackerId: InstanceId;
          defenderPlayerId?: PlayerId;
          defenderInstanceId?: InstanceId;
          /** Attacking taps the creature unless it has vigilance. Default true. */
          tap?: boolean;
        }>;
      }
    | { type: 'BLOCK'; blocks: Array<{ blockerId: InstanceId; attackerId: InstanceId }> }
    /**
     * Take a blocker back out of the block it was assigned to.
     *
     * `BLOCK` appends, which is right for a rules engine — blockers are
     * declared once and simultaneously — and wrong for the several seconds a
     * human spends assembling that declaration. Without a way back, a misclick
     * during declare blockers was permanent, so a board that let you assign
     * blocks on the cards had to stage them locally and hide them until they
     * were confirmed: two sources of truth, and `CardInspector` (which
     * dispatches `BLOCK` immediately) disagreed with the mat.
     *
     * With this, `state.combat` stays the single source of truth for the whole
     * step — click to assign, click again to take it back — and the inspector
     * and the board cannot drift apart.
     *
     * `attackerId` narrows the removal to one lane. Omitted, the blocker comes
     * out of every lane it is in.
     */
    | { type: 'UNBLOCK'; blockerId: InstanceId; attackerId?: InstanceId }
    | { type: 'END_COMBAT' }

    /* --- the stack and priority (see stack.ts) --- */
    /**
     * CR 601 — announce a spell: it leaves hand or the command zone, goes on
     * the stack, targets are locked in, and its controller keeps priority.
     * Paying for it is `moves.ts`'s job; this is the announcement.
     */
    | {
        type: 'CAST_SPELL';
        instanceId: InstanceId;
        controllerId?: PlayerId;
        targets?: StackTarget[];
        effects?: StackEffect[];
        /** Defaults to graveyard for instants and sorceries, battlefield otherwise. */
        resolvesTo?: Zone;
        splitSecond?: boolean;
        cantBeCountered?: boolean;
        /** Override the derived id. Only for tests and replays. */
        stackId?: StackObjectId;
      }
    /** CR 603 / 602 — put a triggered or activated ability on the stack. */
    | {
        type: 'PUT_ABILITY_ON_STACK';
        controllerId: PlayerId;
        name: string;
        kind?: 'triggered' | 'activated';
        sourceInstanceId?: InstanceId;
        targets?: StackTarget[];
        effects?: StackEffect[];
        stackId?: StackObjectId;
      }
    /** CR 117.3d. Defaults to whoever currently holds priority. */
    | { type: 'PASS_PRIORITY'; playerId?: PlayerId }
    /** CR 608 — resolve the top object. Normally derived from a full round of passes. */
    | { type: 'RESOLVE_STACK' }
    /** CR 701.5 — remove an object from the stack without resolving it. */
    | { type: 'COUNTER_SPELL'; stackId: StackObjectId; reason?: string }

    /* --- replacement effects (see replacement.ts) --- */
    | { type: 'ADD_REPLACEMENT'; effect: ReplacementEffect }
    | { type: 'REMOVE_REPLACEMENT'; replacementId: ReplacementId }

    /* --- turn structure --- */
    | { type: 'PHASE_CHANGE'; step: Step }
    | { type: 'ADVANCE_STEP' }
    | { type: 'PASS_TURN'; toPlayerId?: PlayerId }

    /* --- table state --- */
    | { type: 'SET_MONARCH'; playerId: PlayerId | null }
    | { type: 'SET_INITIATIVE'; playerId: PlayerId | null }
    | { type: 'SET_PLAYER_NAME'; playerId: PlayerId; name: string }

    /* --- housekeeping --- */
    | { type: 'RESET' }
  );

export type GameActionType = GameAction['type'];

/** Narrow a `GameAction` to one variant, e.g. `ActionOf<'DAMAGE'>`. */
export type ActionOf<T extends GameActionType> = Extract<GameAction, { type: T }>;

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}
