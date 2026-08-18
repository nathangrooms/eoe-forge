/**
 * DeckMatrix — shared game-state core: manual intervention.
 *
 * The engine automates keyword abilities and a short list of mechanically
 * unambiguous triggers. Everything else in Magic — which is most of it — has to
 * be resolved by the player, and this module exists so that costs one or two
 * taps rather than a mental note and a house rule.
 *
 * Owner: *"are we able to get logic working or allow manual intervention like
 * marking cards which fly, have lifesteal, trample, also if they have +1
 * counters, need easy way to add these."*
 *
 * So: every builder here returns `GameAction[]` and nothing else. They go down
 * the same path as a cast or an attack — validated, logged, undoable,
 * broadcastable — because a hand-applied +1/+1 counter is as much part of the
 * game as a triggered one, and a manual life change that skipped the log would
 * make the feed a lie.
 *
 * `manualControlsFor` goes one step further and returns the *menu*: which
 * controls make sense for this particular permanent, already bound to their
 * actions. The UI renders labels and calls `dispatch(control.actions)`. Keeping
 * that decision here rather than in a component means the battlefield, the
 * inspector and any future long-press menu can never offer different sets.
 *
 * Pure: no clock (`at` is passed in), no randomness, no I/O.
 */

import type { CardInstance, GameAction, GameState, PlayerId, TokenSpec, Zone } from './types.ts';
import { ZONES } from './types.ts';
import { FLAGGABLE_KEYWORDS, hasKeyword, keywordSupport } from './keywords.ts';
import { powerOf, toughnessOf } from './combat.ts';

/* -------------------------------------------------------------------------- */
/* Counters                                                                   */
/* -------------------------------------------------------------------------- */

export interface CounterPreset {
  /** The key stored in `CardInstance.counters`. */
  key: string;
  label: string;
  /** True for the two counters that change power and toughness. */
  changesStats?: boolean;
}

/**
 * The counters worth a dedicated button. Anything else goes through
 * `cardCounter` with a typed-in key, so the list is a shortcut and never a
 * limit.
 */
export const COUNTER_PRESETS: readonly CounterPreset[] = [
  { key: '+1/+1', label: '+1/+1', changesStats: true },
  { key: '-1/-1', label: '−1/−1', changesStats: true },
  { key: 'loyalty', label: 'Loyalty' },
  { key: 'charge', label: 'Charge' },
  { key: 'stun', label: 'Stun' },
  { key: 'shield', label: 'Shield' },
  { key: 'oil', label: 'Oil' },
  { key: 'lore', label: 'Lore' },
  { key: 'quest', label: 'Quest' },
  { key: 'time', label: 'Time' },
  { key: 'counter', label: 'Counter' },
];

/** Player-level counters. Poison has its own action and is not repeated here. */
export const PLAYER_COUNTER_PRESETS: readonly CounterPreset[] = [
  { key: 'energy', label: 'Energy' },
  { key: 'experience', label: 'Experience' },
  { key: 'rad', label: 'Rad' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'counter', label: 'Counter' },
];

/** Add or remove counters on one permanent. */
export function cardCounter(
  instanceId: string,
  counter: string,
  delta: number,
  at = 0
): GameAction[] {
  if (!delta) return [];
  return [{ type: 'CARD_COUNTER', instanceId, counter, delta, at }];
}

/** Add or remove counters on a player. */
export function playerCounter(
  playerId: PlayerId,
  counter: string,
  delta: number,
  at = 0
): GameAction[] {
  if (!delta) return [];
  return [{ type: 'PLAYER_COUNTER', playerId, counter, delta, at }];
}

/**
 * Drive a counter to an exact number rather than nudging it. Emitted as one
 * delta so the log records a single, explicable change.
 */
export function setCardCounter(
  card: CardInstance,
  counter: string,
  value: number,
  at = 0
): GameAction[] {
  const current = card.counters[counter] ?? 0;
  return cardCounter(card.instanceId, counter, value - current, at);
}

/* -------------------------------------------------------------------------- */
/* Power and toughness                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Set a permanent's base power/toughness by hand.
 *
 * This overrides the printed value; +1/+1 and -1/-1 counters still apply on
 * top, so "set to 4/4" then "add a +1/+1 counter" reads 5/5, which is what a
 * player expects and what `powerOf` implements.
 */
export function setStats(
  instanceId: string,
  power: number | null | undefined,
  toughness: number | null | undefined,
  at = 0
): GameAction[] {
  return [{ type: 'SET_CARD_STAT', instanceId, power, toughness, mode: 'set', at }];
}

/** Nudge base power/toughness up or down. */
export function adjustStats(
  instanceId: string,
  power: number,
  toughness: number,
  at = 0
): GameAction[] {
  if (!power && !toughness) return [];
  return [{ type: 'SET_CARD_STAT', instanceId, power, toughness, mode: 'adjust', at }];
}

/** Drop the hand-set stats and go back to what the card prints. */
export function clearStats(instanceId: string, at = 0): GameAction[] {
  return [{ type: 'SET_CARD_STAT', instanceId, power: null, toughness: null, mode: 'set', at }];
}

/* -------------------------------------------------------------------------- */
/* Keywords                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Flag a keyword on or off. `keywordSupport` in `keywords.ts` says whether the
 * engine will act on it; the UI is expected to show that difference, because a
 * badge that looks enforced and is not is the same silent lie as a trigger that
 * never fires.
 */
export function flagKeyword(
  instanceId: string,
  keyword: string,
  on: boolean,
  at = 0
): GameAction[] {
  return [{ type: 'SET_KEYWORD', instanceId, keyword, on, at }];
}

/* -------------------------------------------------------------------------- */
/* Life                                                                       */
/* -------------------------------------------------------------------------- */

export function adjustLife(playerId: PlayerId, delta: number, at = 0): GameAction[] {
  if (!delta) return [];
  return [{ type: 'LIFE_CHANGE', playerId, delta, at }];
}

export function setLife(playerId: PlayerId, life: number, at = 0): GameAction[] {
  return [{ type: 'SET_LIFE', playerId, life, at }];
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The tokens people actually make. Everything else goes through `createToken`
 * with a hand-built spec.
 *
 * No `imageUrl`: token art is not in our `cards` table and this core does no
 * I/O, so the UI draws a placeholder from the name, type line and stats. Said
 * plainly here rather than discovered as a missing image.
 */
export const TOKEN_PRESETS: readonly TokenSpec[] = [
  { name: 'Treasure', typeLine: 'Token Artifact — Treasure', oracleText: '{T}, Sacrifice this token: Add one mana of any color.' },
  { name: 'Clue', typeLine: 'Token Artifact — Clue', oracleText: '{2}, Sacrifice this token: Draw a card.' },
  { name: 'Food', typeLine: 'Token Artifact — Food', oracleText: '{2}, {T}, Sacrifice this token: You gain 3 life.' },
  { name: 'Soldier', typeLine: 'Token Creature — Soldier', power: '1', toughness: '1', colorIdentity: ['W'] },
  { name: 'Spirit', typeLine: 'Token Creature — Spirit', power: '1', toughness: '1', colorIdentity: ['W'], keywords: ['flying'] },
  { name: 'Zombie', typeLine: 'Token Creature — Zombie', power: '2', toughness: '2', colorIdentity: ['B'] },
  { name: 'Goblin', typeLine: 'Token Creature — Goblin', power: '1', toughness: '1', colorIdentity: ['R'] },
  { name: 'Saproling', typeLine: 'Token Creature — Saproling', power: '1', toughness: '1', colorIdentity: ['G'] },
  { name: 'Beast', typeLine: 'Token Creature — Beast', power: '3', toughness: '3', colorIdentity: ['G'] },
  { name: 'Thopter', typeLine: 'Token Artifact Creature — Thopter', power: '1', toughness: '1', keywords: ['flying'] },
  { name: 'Insect', typeLine: 'Token Creature — Insect', power: '1', toughness: '1', colorIdentity: ['G'] },
];

export function createToken(
  playerId: PlayerId,
  token: TokenSpec,
  count = 1,
  options: { tapped?: boolean; at?: number } = {}
): GameAction[] {
  return [
    {
      type: 'CREATE_TOKEN',
      playerId,
      token,
      count: Math.max(1, count),
      tapped: options.tapped,
      at: options.at ?? 0,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Zones and tapping                                                          */
/* -------------------------------------------------------------------------- */

export const ZONE_LABELS: Record<Zone, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command zone',
  /* Present for exhaustiveness; the stack is never a manual move target. */
  stack: 'Stack',
};

/**
 * Zones a player may drop a card into by hand — everything except the stack.
 *
 * The stack is a real zone in the type union, but `stack.ts` owns it: objects
 * arrive by being cast or activated and leave by resolving or being countered,
 * and each of those maintains bookkeeping (targets, controller, resolution
 * order) that a bare `MOVE_ZONE` does not. Offering "move to stack" here would
 * strand a card in a zone nothing knows how to take it out of — the same class
 * of silent-nothing bug this module exists to prevent.
 */
export const MANUAL_ZONES: readonly Zone[] = ZONES.filter(zone => zone !== 'stack');

/**
 * Move any card to any zone. No legality is asked: this is the "put it where it
 * actually is" escape hatch for every effect the engine does not implement, and
 * refusing it would defeat the point.
 */
export function moveTo(
  instanceId: string,
  to: Zone,
  options: { position?: 'top' | 'bottom' | number; at?: number } = {}
): GameAction[] {
  return [{ type: 'MOVE_ZONE', instanceId, to, position: options.position, at: options.at ?? 0 }];
}

/** Tap or untap directly, which is what a player does five times a turn. */
export function toggleTap(card: CardInstance, at = 0): GameAction[] {
  return [{ type: card.tapped ? 'UNTAP' : 'TAP', instanceId: card.instanceId, at }];
}

/** Dismiss (or restore) the "resolve this by hand" marker on a permanent. */
export function markManualResolved(instanceId: string, resolved = true, at = 0): GameAction[] {
  return [{ type: 'MARK_MANUAL_RESOLVED', instanceId, resolved, at }];
}

/** Leave a line in the game log. For house rules and "I resolved this myself". */
export function note(message: string, instanceId?: string, at = 0): GameAction[] {
  if (!message.trim()) return [];
  return [{ type: 'NOTE', message: message.trim(), instanceId, at }];
}

/* -------------------------------------------------------------------------- */
/* The menu                                                                   */
/* -------------------------------------------------------------------------- */

export type ManualGroup = 'tap' | 'counters' | 'stats' | 'keywords' | 'zones' | 'marker';

export interface ManualControl {
  /** Stable within one card, so React can key on it. */
  id: string;
  label: string;
  group: ManualGroup;
  /** Dispatch these. Never empty. */
  actions: GameAction[];
  /** Set for toggles: whether the thing is currently on. */
  active?: boolean;
  /**
   * For keyword toggles: 'engine' when flagging it changes what the rules do,
   * 'advisory' when it is only a badge. The UI must show the difference.
   */
  support?: 'engine' | 'advisory';
  /** Current value, for counter rows that want to show a badge. */
  count?: number;
}

/**
 * Every manual control that makes sense for this permanent, already bound.
 *
 * Ordered the way a player reaches for them: tap first (the thing done most),
 * then counters, then stats, then keywords, then zones. A planeswalker leads
 * with loyalty; a creature leads with +1/+1.
 */
export function manualControlsFor(
  state: GameState,
  card: CardInstance,
  at = 0
): ManualControl[] {
  const controls: ManualControl[] = [];
  const line = (card.typeLine ?? '').toLowerCase();
  const isPlaneswalker = line.includes('planeswalker');
  const isCreatureCard = line.includes('creature');
  const onBattlefield = card.zone === 'battlefield';

  if (onBattlefield) {
    controls.push({
      id: 'tap',
      label: card.tapped ? 'Untap' : 'Tap',
      group: 'tap',
      actions: toggleTap(card, at),
      active: card.tapped,
    });
  }

  // Counters. The relevant ones first, then the rest of the presets.
  const preferred = isPlaneswalker
    ? ['loyalty', '+1/+1', '-1/-1']
    : isCreatureCard
      ? ['+1/+1', '-1/-1', 'stun', 'shield']
      : ['charge', 'counter', '+1/+1', 'lore'];

  const ordered = [
    ...preferred,
    ...COUNTER_PRESETS.map(preset => preset.key).filter(key => !preferred.includes(key)),
  ];

  for (const key of ordered) {
    const preset = COUNTER_PRESETS.find(p => p.key === key);
    if (!preset) continue;
    const current = card.counters[preset.key] ?? 0;
    controls.push({
      id: `counter+:${preset.key}`,
      label: `${preset.label} +1`,
      group: 'counters',
      actions: cardCounter(card.instanceId, preset.key, 1, at),
      count: current,
    });
    if (current > 0) {
      controls.push({
        id: `counter-:${preset.key}`,
        label: `${preset.label} −1`,
        group: 'counters',
        actions: cardCounter(card.instanceId, preset.key, -1, at),
        count: current,
      });
    }
  }

  // Stats. Nudges are the one- and two-tap case; an exact set goes through
  // `setStats` from a number input the UI owns.
  if (isCreatureCard || card.powerOverride !== undefined || card.toughnessOverride !== undefined) {
    controls.push(
      {
        id: 'stat:p+',
        label: 'Power +1',
        group: 'stats',
        actions: adjustStats(card.instanceId, 1, 0, at),
        count: powerOf(card),
      },
      {
        id: 'stat:p-',
        label: 'Power −1',
        group: 'stats',
        actions: adjustStats(card.instanceId, -1, 0, at),
        count: powerOf(card),
      },
      {
        id: 'stat:t+',
        label: 'Toughness +1',
        group: 'stats',
        actions: adjustStats(card.instanceId, 0, 1, at),
        count: toughnessOf(card),
      },
      {
        id: 'stat:t-',
        label: 'Toughness −1',
        group: 'stats',
        actions: adjustStats(card.instanceId, 0, -1, at),
        count: toughnessOf(card),
      }
    );
    if (card.powerOverride !== undefined || card.toughnessOverride !== undefined) {
      controls.push({
        id: 'stat:clear',
        label: 'Reset printed stats',
        group: 'stats',
        actions: clearStats(card.instanceId, at),
      });
    }
  }

  // Keywords. Engine-backed ones first so the useful half is reachable without
  // scrolling past thirty reminders.
  for (const keyword of FLAGGABLE_KEYWORDS) {
    const on = hasKeyword(card, keyword);
    controls.push({
      id: `kw:${keyword}`,
      label: keyword,
      group: 'keywords',
      actions: flagKeyword(card.instanceId, keyword, !on, at),
      active: on,
      support: keywordSupport(keyword),
    });
  }

  for (const zone of MANUAL_ZONES) {
    if (zone === card.zone) continue;
    controls.push({
      id: `zone:${zone}`,
      label: `Move to ${ZONE_LABELS[zone].toLowerCase()}`,
      group: 'zones',
      actions: moveTo(card.instanceId, zone, { at }),
    });
  }

  if (card.manualResolved) {
    controls.push({
      id: 'marker:restore',
      label: 'Show manual marker again',
      group: 'marker',
      actions: markManualResolved(card.instanceId, false, at),
      active: false,
    });
  } else {
    controls.push({
      id: 'marker:resolved',
      label: 'I resolved this by hand',
      group: 'marker',
      actions: markManualResolved(card.instanceId, true, at),
      active: true,
    });
  }

  // `state` is taken so the signature can grow into legality-aware controls
  // (attach, give control to another player) without every caller changing.
  void state;
  return controls;
}
