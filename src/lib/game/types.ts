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

export type Zone =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'command';

export const ZONES: readonly Zone[] = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'command',
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
  /** '+1/+1', 'loyalty', 'charge', … Absent key means zero. */
  counters: Record<string, number>;
  /** Equipment / Auras: the instance this is attached to. */
  attachedTo?: InstanceId;

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
  type: GameActionType | 'PLAYER_LOST' | 'GAME_OVER';
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

    /* --- counters --- */
    | { type: 'PLAYER_COUNTER'; playerId: PlayerId; counter: string; delta: number }
    | { type: 'CARD_COUNTER'; instanceId: InstanceId; counter: string; delta: number }

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
      }
    | {
        type: 'MOVE_ZONE';
        instanceId: InstanceId;
        to: Zone;
        /** Library insertion point. Number is a 0-based index from the top. */
        position?: 'top' | 'bottom' | number;
        controllerId?: PlayerId;
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
    | { type: 'END_COMBAT' }

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
