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

import type {
  CardInstance,
  GameAction,
  GameState,
  PlayerId,
  TokenSpec,
  TriggerTiming,
  Step,
  Zone,
} from './types.ts';
import { ZONES } from './types.ts';
import { FLAGGABLE_KEYWORDS, hasKeyword, keywordSupport } from './keywords.ts';
import {
  DIE_LABEL,
  markKey,
  markLabel,
  playerMarksOn,
  type PlayerMark,
} from './marks.ts';
// Layered, so the number beside the nudge button is the number on the card.
import { combatPowerIn, combatToughnessIn } from './characteristics.ts';
import { automationFor } from './effects.ts';

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
/* Marks a player put there: free markers and dice                            */
/* -------------------------------------------------------------------------- */

/**
 * Put an arbitrary marked value on a permanent, or change one already there.
 *
 * Owner: *"everything like tokens ... dice markers etc."* At a table you reach
 * for whatever is nearest when the rules run out, and this app had nothing: a
 * counter of a kind the engine has never heard of, a die showing the number an
 * effect chose, a note saying *sac at end*, none of them existed.
 *
 * Emitted as a `CARD_COUNTER`, for the reason `marks.ts` argues in full: CR
 * 122.1 lets a permanent carry a counter of any kind, so this is the right
 * model rather than a way round writing a new action, and it means a mark is
 * validated, logged, undoable and broadcast exactly as an engine-placed counter
 * is. `markKey` fences it so nothing can mistake a die for a rules counter.
 */
export function setPlayerMark(
  card: CardInstance,
  label: string,
  value: number,
  at = 0
): GameAction[] {
  const key = markKey(label);
  if (!markLabel(key)) return [];
  const current = card.counters[key] ?? 0;
  return cardCounter(card.instanceId, key, value - current, at);
}

/** Nudge a mark up or down by hand. */
export function adjustPlayerMark(
  instanceId: string,
  label: string,
  delta: number,
  at = 0
): GameAction[] {
  return cardCounter(instanceId, markKey(label), delta, at);
}

/** Take a mark off entirely. */
export function clearPlayerMark(card: CardInstance, label: string, at = 0): GameAction[] {
  return setPlayerMark(card, label, 0, at);
}

/**
 * Leave a rolled die on a permanent.
 *
 * THE ROLL DOES NOT HAPPEN HERE. This module is pure by contract — no clock, no
 * randomness, no I/O — and the caller passes the face that came up. That is not
 * only a purity nicety: the ACTION carries the number, so every seat at a
 * networked table receives the same face, the log records it, and undo takes it
 * back. A reducer that rolled its own die would have to consume `state.rng`,
 * which exists so shuffles replay identically and would then advance differently
 * depending on how many times somebody fiddled with a d20.
 *
 * Rolling again replaces the face rather than adding to it, because that is
 * what happens when you pick a die up and roll it.
 */
export function rollDieOnCard(
  card: CardInstance,
  sides: number,
  face: number,
  at = 0
): GameAction[] {
  return setPlayerMark(card, DIE_LABEL(sides), face, at);
}

/** Every mark a player has put on this permanent. Re-exported for callers. */
export function marksOn(card: CardInstance): PlayerMark[] {
  return playerMarksOn(card.counters);
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
 * with a hand-built spec, so this list is a shortcut and never a limit.
 *
 * No `imageUrl`: token art is not in our `cards` table and this core does no
 * I/O, so the UI draws a placeholder from the name, type line and stats. Said
 * plainly here rather than discovered as a missing image.
 *
 * Ordered by how often a Commander player reaches for one. The four artifacts
 * lead because they are made by cards of every colour and are the ones spent
 * rather than attacked with; the creatures follow smallest-first, which is also
 * roughly most-printed-first.
 */
export const TOKEN_PRESETS: readonly TokenSpec[] = [
  { name: 'Treasure', typeLine: 'Token Artifact — Treasure', oracleText: '{T}, Sacrifice this token: Add one mana of any color.' },
  { name: 'Clue', typeLine: 'Token Artifact — Clue', oracleText: '{2}, Sacrifice this token: Draw a card.' },
  { name: 'Food', typeLine: 'Token Artifact — Food', oracleText: '{2}, {T}, Sacrifice this token: You gain 3 life.' },
  { name: 'Blood', typeLine: 'Token Artifact — Blood', oracleText: '{1}, {T}, Discard a card, Sacrifice this token: Draw a card.' },
  { name: 'Soldier', typeLine: 'Token Creature — Soldier', power: '1', toughness: '1', colorIdentity: ['W'] },
  { name: 'Spirit', typeLine: 'Token Creature — Spirit', power: '1', toughness: '1', colorIdentity: ['W'], keywords: ['flying'] },
  { name: 'Cat', typeLine: 'Token Creature — Cat', power: '1', toughness: '1', colorIdentity: ['W'] },
  { name: 'Zombie', typeLine: 'Token Creature — Zombie', power: '2', toughness: '2', colorIdentity: ['B'] },
  { name: 'Goblin', typeLine: 'Token Creature — Goblin', power: '1', toughness: '1', colorIdentity: ['R'] },
  { name: 'Elemental', typeLine: 'Token Creature — Elemental', power: '1', toughness: '1', colorIdentity: ['R'] },
  { name: 'Saproling', typeLine: 'Token Creature — Saproling', power: '1', toughness: '1', colorIdentity: ['G'] },
  { name: 'Insect', typeLine: 'Token Creature — Insect', power: '1', toughness: '1', colorIdentity: ['G'] },
  { name: 'Plant', typeLine: 'Token Creature — Plant', power: '0', toughness: '1', colorIdentity: ['G'] },
  { name: 'Wolf', typeLine: 'Token Creature — Wolf', power: '2', toughness: '2', colorIdentity: ['G'] },
  { name: 'Beast', typeLine: 'Token Creature — Beast', power: '3', toughness: '3', colorIdentity: ['G'] },
  { name: 'Servo', typeLine: 'Token Artifact Creature — Servo', power: '1', toughness: '1' },
  { name: 'Thopter', typeLine: 'Token Artifact Creature — Thopter', power: '1', toughness: '1', keywords: ['flying'] },
  { name: 'Angel', typeLine: 'Token Creature — Angel', power: '4', toughness: '4', colorIdentity: ['W'], keywords: ['flying'] },
  { name: 'Dragon', typeLine: 'Token Creature — Dragon', power: '5', toughness: '5', colorIdentity: ['R'], keywords: ['flying'] },
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

/**
 * The tokens THIS card talks about, in the order it names them.
 *
 * The point is to POINT AT the ability rather than reprint it. A player looking
 * at Anointed Procession is already reading "create a 1/1 white Soldier"; what
 * they need is the button, next to the card, that makes that exact one. So the
 * oracle text is read for the token it names and the matching preset is
 * offered first, ahead of the twenty generic ones.
 *
 * Deliberately conservative. It matches a preset by name and reports nothing
 * when it cannot, because a wrong token put onto the battlefield is worse than
 * no shortcut: the player would have to notice it, work out that it is wrong,
 * and remove it. `TOKEN_PRESETS` stays reachable underneath either way, so a
 * miss costs one extra tap and never costs correctness.
 *
 * It reads `oracleText` only. Nothing here consults the compiled abilities:
 * this is the path for the 97% of the catalogue the engine does NOT run, and
 * asking the compiler about a card it could not compile would return nothing.
 */
export function tokensNamedBy(card: CardInstance): TokenSpec[] {
  const text = card.oracleText ?? '';
  if (!text) return [];
  // "create", "creates" and "created" all appear; "put ... token" does not
  // survive on modern templating but older wordings still say it.
  if (!/\b(create|put)\w*\b/i.test(text)) return [];

  const found: TokenSpec[] = [];
  for (const preset of TOKEN_PRESETS) {
    /* Word-bounded so "Elemental" does not match inside "Elementals" only by
       accident of a substring, and so "Cat" cannot fire on "Catapult". */
    const named = new RegExp(String.raw`\b${preset.name}s?\b`, 'i').test(text);
    if (!named) continue;
    // The word has to be near the token-making verb rather than anywhere on
    // the card, or every Dragon tribal lord would offer a 5/5 Dragon token.
    if (!/\btoken/i.test(text)) continue;
    found.push(preset);
  }
  return found;
}

/**
 * Copy a permanent as a token. CR 111.1a, and the other half of making tokens
 * by hand: "create a token that's a copy of target creature" is as common at a
 * Commander table as making a Treasure, and this app could do neither.
 *
 * CR 707.2 decides what is copied, and it is narrower than it looks: the
 * COPIABLE values are what the card was printed with, plus any copy effects
 * already applied. Counters are NOT copied. Damage is not copied. A +1/+1
 * counter, an Aura, an anthem and a hand-set power override are all changes to
 * the object rather than to its copiable values, so a copy of a 2/2 Bear
 * carrying four +1/+1 counters is a 2/2, not a 6/6.
 *
 * That is why this reads `card.power` and not `combatPowerIn(state, card)`.
 * The layered value is the right number to DISPLAY and the wrong number to
 * copy, and the two are one character apart, so the reason is written here.
 *
 * The art comes with it, because a copy of Serra Angel looks like Serra Angel.
 * That is the one case where a token has real card art, and it is the whole
 * unmodified Scryfall image rather than a crop.
 */
export function copyAsToken(
  card: CardInstance,
  controllerId: PlayerId,
  count = 1,
  options: { tapped?: boolean; at?: number } = {}
): GameAction[] {
  /* Copying a token is legal and does happen, so the prefix is normalised
     rather than blindly prepended: a copy of a Treasure is a Treasure, not a
     "Token Token Artifact". */
  const printedLine = (card.typeLine ?? '').replace(/^token\s+/i, '').trim();

  const spec: TokenSpec = {
    name: card.name,
    // A copy is not printed with the word "Token" in its type line, but every
    // other token here carries it and the board reads it to tell them apart.
    typeLine: printedLine ? `Token ${printedLine}` : `Token — ${card.name}`,
    power: card.power,
    toughness: card.toughness,
    colorIdentity: card.colorIdentity,
    keywords: card.keywords,
    oracleText: card.oracleText,
    imageUrl: card.imageUrl,
  };
  return createToken(controllerId, spec, count, options);
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

export type ManualGroup =
  | 'tap'
  | 'counters'
  | 'stats'
  | 'keywords'
  | 'zones'
  | 'marker'
  /** Making a token by hand, and copying a permanent as one. */
  | 'tokens'
  /** Free markers and dice a player put on the permanent themselves. */
  | 'marks';

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
        count: combatPowerIn(state, card),
      },
      {
        id: 'stat:p-',
        label: 'Power −1',
        group: 'stats',
        actions: adjustStats(card.instanceId, -1, 0, at),
        count: combatPowerIn(state, card),
      },
      {
        id: 'stat:t+',
        label: 'Toughness +1',
        group: 'stats',
        actions: adjustStats(card.instanceId, 0, 1, at),
        count: combatToughnessIn(state, card),
      },
      {
        id: 'stat:t-',
        label: 'Toughness −1',
        group: 'stats',
        actions: adjustStats(card.instanceId, 0, -1, at),
        count: combatToughnessIn(state, card),
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

  /*
   * Tokens.
   *
   * `CREATE_TOKEN` has been in the engine, validated, reduced, triggering ETB
   * and cleaned up under CR 704.5d, with no producer outside ability
   * resolution: no player could make a Treasure. That is the same shape as
   * `ATTACH`, which this codebase has already been caught by once, and it is
   * the most common thing a Commander player does by hand.
   *
   * The controls hang off a CARD rather than off the player because that is
   * how it happens at a table: a card told you to make the token, so the
   * button is on that card. `tokensNamedBy` puts the token THIS card talks
   * about first, and the twenty generic ones stay underneath it.
   *
   * They are offered for a card the player controls in any zone, not only on
   * the battlefield: "when this dies, create two 1/1 Spirits" is answered from
   * the graveyard, and an instant that makes tokens is read on the stack.
   */
  const controller = card.controllerId;
  for (const preset of tokensNamedBy(card)) {
    controls.push({
      id: `token-named:${preset.name}`,
      label: preset.name,
      group: 'tokens',
      actions: createToken(controller, preset, 1, { at }),
    });
  }

  if (card.zone === 'battlefield') {
    controls.push({
      id: 'token:copy',
      label: `Copy ${card.name}`,
      group: 'tokens',
      actions: copyAsToken(card, controller, 1, { at }),
    });
  }

  /*
   * Marks the player has already put on this permanent.
   *
   * MAKING one is not here, and that is the same split the tokens above take:
   * a control in this menu is bound to the actions it produces, and neither a
   * label somebody is about to type nor a die face nobody has rolled yet can be
   * bound in advance. The UI owns those two and calls `setPlayerMark` and
   * `rollDieOnCard`. What IS here is everything that can be bound: nudging a
   * mark, and taking it off — which is the half that has to be reachable from
   * every surface, because a mark you cannot remove is worse than no mark.
   */
  for (const mark of marksOn(card)) {
    controls.push({
      id: `mark+:${mark.label}`,
      label: `${mark.label} +1`,
      group: 'marks',
      actions: adjustPlayerMark(card.instanceId, mark.label, 1, at),
      count: mark.value,
    });
    controls.push({
      id: `mark-:${mark.label}`,
      label: `${mark.label} −1`,
      group: 'marks',
      actions: adjustPlayerMark(card.instanceId, mark.label, -1, at),
      count: mark.value,
    });
    controls.push({
      id: `mark:clear:${mark.label}`,
      label: `Take off ${mark.label}`,
      group: 'marks',
      actions: clearPlayerMark(card, mark.label, at),
      count: mark.value,
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

/* -------------------------------------------------------------------------- */
/* What the player owes the table right now                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which trigger timings belong to which step.
 *
 * Only the two timings that arrive on a clock are listed. An enters-the-
 * battlefield or a dies trigger announces itself the moment it happens, and the
 * feed already carries that line; an upkeep trigger has no such moment, which
 * is precisely why it gets missed.
 */
const TIMING_FOR_STEP: Partial<Record<Step, TriggerTiming>> = {
  upkeep: 'upkeep',
  end: 'end-step',
};

/** One thing the player has to do themselves, right now, on one permanent. */
export interface ManualDuty {
  card: CardInstance;
  timing: TriggerTiming;
  /** The card's own words for what has to happen. */
  clause: string;
}

/**
 * Put the card's name back where the compiler left a tilde.
 *
 * `normalize.ts` rewrites a card's own name to `~` so that one pattern matches
 * every printing. That is right for matching and wrong the moment a person
 * reads the clause. Measured by playing on 2026-08-19, the upkeep strip said
 * *"you may put a charge counter on ~"* — a parser's working notation, on the
 * table, in the one sentence whose whole job is to tell a player what to do.
 *
 * Exported because `activate.ts` prints the same compiled clauses next to the
 * button that activates them, and a second copy of this would be a second place
 * for a tilde to leak onto the table.
 */
export function readableClause(clause: string, card: CardInstance): string {
  return clause.replace(/~/g, card.name);
}

/**
 * The abilities that are going off THIS step and that the engine will not run.
 *
 * Owner: *"I also have an artifact in play, which says at beginning of my
 * upkeep I can place a charge counter (Aether Vial) — no way to do this."*
 *
 * The engine already knew. `automationFor` reads that upkeep trigger out of the
 * oracle text, marks it as one the engine does not resolve, and nothing ever
 * asked. From the player's seat an ability the app can see and will not run,
 * and never mentions, is indistinguishable from a broken engine.
 *
 * So this is the question a board should ask itself at the top of every upkeep:
 * *what is my job this step*. It returns only the permanents this player
 * controls, only for the step the game is actually in, and only the clauses the
 * engine declined. An empty list is the normal answer and must draw nothing.
 *
 * Deliberately not filtered by `manualResolved`: that flag dismisses the
 * standing marker on a card, which is a statement about the card in general.
 * An upkeep trigger happens again every turn, and silently skipping it because
 * the player once ticked the card off is the same silence this fixes.
 */
export function manualDutiesFor(state: GameState, playerId: PlayerId): ManualDuty[] {
  const timing = TIMING_FOR_STEP[state.step];
  if (!timing) return [];
  // The upkeep and end step belong to the active player. Another seat's upkeep
  // is not this seat's job.
  if (state.activePlayerId !== playerId) return [];

  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const duties: ManualDuty[] = [];
  for (const instanceId of player.zones.battlefield) {
    const card = state.cards[instanceId];
    if (!card) continue;
    for (const trigger of automationFor(card).triggers) {
      if (trigger.timing !== timing) continue;
      if (trigger.automated && !trigger.residual) continue;
      duties.push({
        card,
        timing,
        clause: readableClause(trigger.residual ?? trigger.clause, card),
      });
    }
  }
  return duties;
}
