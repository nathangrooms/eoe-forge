/**
 * DeckMatrix — shared game-state core: state-based actions (CR 704).
 *
 * ## Provenance
 *
 * Ported from XMage (https://github.com/magefree/mage), MIT licensed —
 * specifically the shape of `mage.game.GameState#checkStateBasedActions` and
 * the `GameImpl` loop that re-runs it until nothing more applies. The MIT
 * notice is retained for the ported portion and XMage is credited in the
 * project's licences.
 *
 * ## What was translated rather than copied
 *
 * XMage checks state-based actions by walking live `Permanent` objects and
 * mutating them in place; `game.applyEffects()` then recomputes continuous
 * effects and the loop goes round again. That is the wrong mechanism here,
 * because DeckMatrix's product requirement is that *a game is its action log*:
 * pure functions, no clock, no unseeded randomness, no class instances in
 * state, everything `JSON.stringify`-able. So the model was kept and the
 * mechanism replaced:
 *
 *   - **detection is separated from application.** `stateBasedActions(state)`
 *     is a pure selector returning `SbaFinding[]` — plain records saying what
 *     applies and under which rule. It never touches state.
 *   - **application is injected.** `runStateBasedActions` takes the applier as
 *     a parameter, so this module needs nothing from `rules.ts` and there is no
 *     import cycle. `rules.ts` supplies an applier built from its own zone
 *     helpers.
 *   - **the loop is explicit and bounded.** CR 704.3 performs every applicable
 *     action simultaneously and then checks again; a check that runs once is the
 *     classic bug (a creature that dies, freeing an Aura, whose owner then hits
 *     zero life needs three passes). CR 704.4 says a genuinely unbreakable loop
 *     makes the game a draw; a playtest tool must not hang, so the loop is
 *     capped and `stable: false` is reported rather than spun on.
 *
 * ## The rules encoded here
 *
 * | Rule | What applies |
 * |---|---|
 * | 704.5a | a player at 0 or less life loses |
 * | 704.5b | a player who tried to draw from an empty library loses |
 * | 704.5c | a player with 10 or more poison counters loses |
 * | 704.5d | a token that has left the battlefield ceases to exist |
 * | 704.5f | a creature with toughness 0 or less is put into its graveyard |
 * | 704.5g | a creature with lethal damage marked is destroyed |
 * | 704.5h | a creature damaged by a deathtouch source is destroyed |
 * | 704.5i | a planeswalker with 0 loyalty is put into its graveyard |
 * | 704.5j | the legend rule |
 * | 704.5m | an Aura attached to an illegal object is put into its graveyard |
 * | 704.5n | an Equipment attached to an illegal permanent becomes unattached |
 * | 704.5q | +1/+1 and -1/-1 counters on the same permanent annihilate |
 * | 704.6b | 21 damage from a single commander |
 *
 * ## Precision over recall, stated out loud
 *
 * Three checks are deliberately gated on knowing a number, because putting a
 * permanent into a graveyard on a number we do not have is exactly the silent
 * corruption this engine refuses to commit:
 *
 *   - **704.5f** does not apply to a creature whose printed toughness is `*`,
 *     `1+*` or anything else non-numeric and which has no hand-set override.
 *     Without the gate every `*`/`*` creature would die the instant it landed.
 *   - **704.5i** does not apply to a planeswalker with no printed `loyalty`.
 *   - **704.5m** does not apply to an Aura whose "Enchant …" line names
 *     something that is not a permanent (an Aura enchanting a *player* has no
 *     `attachedTo` in this model, and must not read as unattached).
 *
 * Pure: no clock, no randomness, no I/O, no mutation of the input state.
 */

import type {
  CardInstance,
  GameState,
  InstanceId,
  LossReason,
  Player,
  PlayerId,
} from './types.ts';
import { isCreature } from './mana.ts';
import { hasKeyword } from './keywords.ts';
import { toughnessOf } from './printed.ts';
import { characteristicsOf } from './characteristics.ts';

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type SbaKind =
  /** 704.5a/b/c and 704.6b — this player is out of the game. */
  | 'player-loses'
  /** 704.5d — a token that is no longer on the battlefield. */
  | 'token-ceases'
  /** 704.5f — toughness 0 or less. Indestructible does not save it. */
  | 'creature-zero-toughness'
  /** 704.5g / 704.5h — lethal damage, or any damage from a deathtouch source. */
  | 'creature-destroyed'
  /** 704.5i — no loyalty left. */
  | 'planeswalker-dies'
  /** 704.5j — two legendary permanents with the same name, same controller. */
  | 'legend-rule'
  /** 704.5m — an Aura attached to something it cannot legally enchant. */
  | 'aura-illegal'
  /** 704.5n — an Equipment attached to an illegal permanent. */
  | 'equipment-unattached'
  /** 704.5q — +1/+1 and -1/-1 counters cancelling out. */
  | 'counters-annihilate';

/**
 * One state-based action that applies right now.
 *
 * A plain record with no prose: the log line is composed by whoever applies it,
 * so `rules.ts` can name players and cards the way the rest of its log does.
 */
export interface SbaFinding {
  kind: SbaKind;
  /** The Comprehensive Rules paragraph, e.g. `'704.5g'`. Goes in the log line. */
  rule: string;
  /** Short factual reason — 'lethal damage', 'toughness 0 or less'. */
  detail: string;
  /** 'player-loses': who. */
  playerId?: PlayerId;
  /** The permanent the action is about. */
  instanceId?: InstanceId;
  /** 'legend-rule': the copy that stays on the battlefield. */
  keptInstanceId?: InstanceId;
  /** 'player-loses': why, for `Player.lossReasons`. */
  lossReason?: LossReason;
  /** 'counters-annihilate': how many pairs cancel. */
  amount?: number;
}

/** How many times the loop may run before it gives up. CR 704.4 is a draw; we stop. */
export const MAX_SBA_ITERATIONS = 100;

export interface SbaRunResult {
  state: GameState;
  /** Every finding applied, in the order it was applied. */
  findings: SbaFinding[];
  /** Passes taken. `1` means "something applied, and then nothing did". */
  iterations: number;
  /** False when the cap was hit — the game state may still have SBAs pending. */
  stable: boolean;
}

/* -------------------------------------------------------------------------- */
/* Reading numbers we are allowed to act on                                   */
/* -------------------------------------------------------------------------- */

/**
 * A printed characteristic as an integer, or null when it is not a plain
 * number. `'*'`, `'1+*'`, `'X'` and `''` are all null — deliberately, because
 * every caller here treats null as "do not apply the rule".
 */
export function printedInteger(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}

/**
 * Current toughness, or null when the engine has no number it may act on.
 *
 * `combat.ts` reads a variable toughness as 0 so a damage calculation has
 * something to work with. That is the right answer there and the wrong one
 * here: 0 toughness is lethal, so reusing it would kill every variable-toughness
 * creature the moment it entered.
 *
 * Takes `state` because toughness is a layered question. A creature is not only
 * killed by -1/-1 counters — "creatures your opponents control get -2/-2" kills
 * it too, and that lives in layer 7c where a `CardInstance` cannot see it. Before
 * this was wired, such a creature sat on the battlefield at a displayed 0
 * toughness and never died.
 */
export function knownToughness(
  state: GameState,
  card: CardInstance | null | undefined
): number | null {
  if (!card) return null;

  // On the battlefield the layer engine is the authority, including its `null`
  // for an unevaluated `*` — which must stay null rather than becoming lethal 0.
  const layered = characteristicsOf(state, card);
  if (layered) return layered.toughness;

  if (card.toughnessOverride === undefined && printedInteger(card.toughness) === null) return null;
  return toughnessOf(card);
}

/** Loyalty counters on a permanent. An absent key is zero, per `CardInstance.counters`. */
export function loyaltyOf(card: CardInstance | null | undefined): number {
  return card?.counters?.loyalty ?? 0;
}

function typeLineOf(card: CardInstance): string {
  return (card.typeLine ?? '').toLowerCase();
}

function isPlaneswalker(card: CardInstance): boolean {
  return typeLineOf(card).includes('planeswalker');
}

function isLegendary(card: CardInstance): boolean {
  return typeLineOf(card).includes('legendary');
}

export function isAura(card: CardInstance): boolean {
  return typeLineOf(card).includes('aura');
}

export function isEquipment(card: CardInstance): boolean {
  return typeLineOf(card).includes('equipment');
}

/**
 * Every permanent on the battlefield, in a deterministic order: seat order,
 * then the order the ids sit in that player's battlefield array — which is
 * arrival order, and therefore the tiebreak the legend rule uses.
 */
export function battlefieldPermanents(state: GameState): CardInstance[] {
  const out: CardInstance[] = [];
  for (const player of state.players) {
    for (const id of player.zones.battlefield) {
      const card = state.cards[id];
      if (card && !card.removedFromGame) out.push(card);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 704.5a/b/c, 704.6b — losing the game                                        */
/* -------------------------------------------------------------------------- */

/**
 * Why this player has lost, or an empty list. Order matters only in that the
 * first entry is the one the log line names.
 *
 * Concession is checked first because a player who conceded at 0 life conceded
 * (CR 104.3a); poison and commander damage are checked before life so that a
 * lethal poison kill is not reported as "ran out of life".
 */
export function lossReasonsFor(state: GameState, player: Player): LossReason[] {
  const reasons: LossReason[] = [];
  if (player.conceded) reasons.push('concede');
  if (player.poison >= state.rules.poisonLethal) reasons.push('poison');
  if (state.rules.usesCommanderDamage) {
    // CR 903.10a — 21 from a *single* commander. Never summed across commanders,
    // which is why `commanderDamage` is keyed by commander and not by player.
    const lethal = Object.values(player.commanderDamage).some(
      damage => damage >= state.rules.commanderDamageLethal
    );
    if (lethal) reasons.push('commander_damage');
  }
  if (player.life <= 0) reasons.push('life');
  // CR 104.3c — only a game that tracks a library can deck someone out.
  if (state.mode === 'full' && player.drewFromEmptyLibrary) reasons.push('empty_library');
  return reasons;
}

/** The CR paragraph a loss reason comes from, for the log line. */
function ruleForLoss(reason: LossReason): string {
  switch (reason) {
    case 'life':
      return '704.5a';
    case 'empty_library':
      return '704.5b';
    case 'poison':
      return '704.5c';
    case 'commander_damage':
      return '704.6b';
    case 'concede':
      return '104.3a';
    default:
      return '104.3';
  }
}

/* -------------------------------------------------------------------------- */
/* 704.5m — Auras                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What an Aura's "Enchant …" line says it can be attached to, lower-cased, or
 * null when the card has no such line.
 */
export function enchantSubject(card: CardInstance): string | null {
  const text = (card.oracleText ?? '').toLowerCase();
  const match = /(?:^|\n)\s*enchant ([a-z][a-z' -]*)/.exec(text);
  return match ? match[1].trim() : null;
}

/**
 * Whether CR 704.5m can be judged for this Aura at all.
 *
 * An Aura enchanting a player or an opponent has no `attachedTo` in this model
 * — only permanents have instance ids — so "not attached to anything" would be
 * a false positive that binned the card. Same for an Aura with no Enchant line
 * we could read. Both cases return false and the Aura is left alone.
 */
function auraIsCheckable(card: CardInstance): boolean {
  const subject = enchantSubject(card);
  if (!subject) return false;
  if (subject.includes('player') || subject.includes('opponent')) return false;
  return true;
}

/** The reason this Aura is illegally attached, or null when it is fine. */
export function illegalAuraReason(state: GameState, card: CardInstance): string | null {
  if (!isAura(card) || card.zone !== 'battlefield') return null;
  if (!auraIsCheckable(card)) return null;

  const subject = enchantSubject(card) ?? '';
  if (!card.attachedTo) return 'attached to nothing';

  const host = state.cards[card.attachedTo];
  if (!host || host.removedFromGame) return 'the permanent it enchanted has left the game';
  if (host.zone !== 'battlefield') return 'the permanent it enchanted is no longer on the battlefield';

  // Only the type words we can read off a type line are checked. An Aura whose
  // subject is "creature an opponent controls" is checked for creature-ness and
  // no further — a partial check that can only be right is better than a full
  // one that guesses.
  const hostLine = (host.typeLine ?? '').toLowerCase();
  for (const word of ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'] as const) {
    if (subject.includes(word) && !hostLine.includes(word)) {
      return `it enchants ${word}s and is attached to something else`;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* 704.5n — Equipment                                                          */
/* -------------------------------------------------------------------------- */

/** The reason this Equipment must come unattached, or null. */
export function illegalEquipmentReason(state: GameState, card: CardInstance): string | null {
  if (!isEquipment(card) || card.zone !== 'battlefield') return null;
  if (!card.attachedTo) return null;

  const host = state.cards[card.attachedTo];
  if (!host || host.removedFromGame) return 'the creature it equipped has left the game';
  if (host.zone !== 'battlefield') return 'the creature it equipped is no longer on the battlefield';
  if (!isCreature(host)) return 'it is attached to something that is not a creature';
  // CR 301.5c — an Equipment equips a creature *you* control. A control-change
  // effect the engine cannot see could make this read early; it only ever
  // unattaches, which is cheap to undo, and it is logged.
  if (host.controllerId !== card.controllerId) {
    return 'it is attached to a creature its controller does not control';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every state-based action that applies to this state right now, in CR order.
 *
 * Pure and total: called twice on the same state it returns the same list, and
 * an empty list is the definition of a stable state. Nothing here is applied —
 * see `runStateBasedActions`.
 */
export function stateBasedActions(state: GameState): SbaFinding[] {
  const out: SbaFinding[] = [];
  if (state.status !== 'playing') return out;

  /* --- 704.5a / 704.5b / 704.5c / 704.6b — players --- */
  for (const player of state.players) {
    if (player.hasLost) continue;
    const reasons = lossReasonsFor(state, player);
    if (reasons.length === 0) continue;
    out.push({
      kind: 'player-loses',
      rule: ruleForLoss(reasons[0]),
      detail: reasons.join(', '),
      playerId: player.id,
      lossReason: reasons[0],
    });
  }

  /* --- 704.5d — tokens that are no longer on the battlefield --- */
  // Iterated over the card dictionary rather than a zone array precisely because
  // the token being hunted is one that is *not* in a battlefield array. Sorted,
  // so the order never depends on object key insertion.
  for (const id of Object.keys(state.cards).sort()) {
    const card = state.cards[id];
    if (!card.isToken || card.removedFromGame) continue;
    if (card.zone === 'battlefield') continue;
    out.push({
      kind: 'token-ceases',
      rule: '704.5d',
      detail: 'a token that left the battlefield',
      instanceId: id,
    });
  }

  const permanents = battlefieldPermanents(state);

  /* --- 704.5f / 704.5g / 704.5h — creatures --- */
  for (const card of permanents) {
    if (!isCreature(card)) continue;

    const toughness = knownToughness(state, card);
    if (toughness !== null && toughness <= 0) {
      // CR 704.5f is not destruction, so indestructible does not save it.
      out.push({
        kind: 'creature-zero-toughness',
        rule: '704.5f',
        detail: 'toughness 0 or less',
        instanceId: card.instanceId,
      });
      continue;
    }

    if (hasKeyword(card, 'indestructible')) continue;

    if (card.damagedByDeathtouch && card.damage > 0) {
      out.push({
        kind: 'creature-destroyed',
        rule: '704.5h',
        detail: 'damage from a source with deathtouch',
        instanceId: card.instanceId,
      });
      continue;
    }

    if (toughness !== null && toughness > 0 && card.damage >= toughness) {
      out.push({
        kind: 'creature-destroyed',
        rule: '704.5g',
        detail: `lethal damage (${card.damage} marked, toughness ${toughness})`,
        instanceId: card.instanceId,
      });
    }
  }

  /* --- 704.5i — planeswalkers --- */
  for (const card of permanents) {
    if (!isPlaneswalker(card)) continue;
    // Gated on a printed loyalty: see the module note. `moveCard` seeds the
    // counter from this value on entry, so a planeswalker in a well-formed game
    // always has one until an effect removes the last of it.
    if (printedInteger(card.loyalty) === null) continue;
    if (loyaltyOf(card) > 0) continue;
    out.push({
      kind: 'planeswalker-dies',
      rule: '704.5i',
      detail: 'no loyalty counters left',
      instanceId: card.instanceId,
    });
  }

  /* --- 704.5j — the legend rule --- */
  //
  // The rule says the controller chooses which copy to keep. A choice cannot be
  // made inside a pure reducer, so the tiebreak is fixed and documented: the
  // copy that has been on the battlefield longest stays. That preserves the
  // most game state — the older copy is the one carrying Auras, Equipment and
  // counters — and it is deterministic, which is the hard requirement. The
  // finding names the survivor so the log says which was kept and a player can
  // reverse it by hand in two taps.
  for (const player of state.players) {
    const byName = new Map<string, CardInstance[]>();
    for (const id of player.zones.battlefield) {
      const card = state.cards[id];
      if (!card || card.removedFromGame) continue;
      if (card.controllerId !== player.id) continue;
      if (!isLegendary(card)) continue;
      const key = card.name.toLowerCase();
      const group = byName.get(key);
      if (group) group.push(card);
      else byName.set(key, [card]);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const kept = group[0];
      for (const card of group.slice(1)) {
        out.push({
          kind: 'legend-rule',
          rule: '704.5j',
          detail: `a second legendary ${card.name}`,
          instanceId: card.instanceId,
          keptInstanceId: kept.instanceId,
        });
      }
    }
  }

  /* --- 704.5m — Auras --- */
  for (const card of permanents) {
    const reason = illegalAuraReason(state, card);
    if (!reason) continue;
    out.push({
      kind: 'aura-illegal',
      rule: '704.5m',
      detail: reason,
      instanceId: card.instanceId,
    });
  }

  /* --- 704.5n — Equipment --- */
  for (const card of permanents) {
    const reason = illegalEquipmentReason(state, card);
    if (!reason) continue;
    out.push({
      kind: 'equipment-unattached',
      rule: '704.5n',
      detail: reason,
      instanceId: card.instanceId,
    });
  }

  /* --- 704.5q — counters that cancel --- */
  for (const card of permanents) {
    const plus = card.counters['+1/+1'] ?? 0;
    const minus = card.counters['-1/-1'] ?? 0;
    const pairs = Math.min(plus, minus);
    if (pairs <= 0) continue;
    out.push({
      kind: 'counters-annihilate',
      rule: '704.5q',
      detail: `${pairs} +1/+1 and ${pairs} -1/-1 counters cancel`,
      instanceId: card.instanceId,
      amount: pairs,
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* The loop                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Apply state-based actions until none apply — CR 704.3.
 *
 * The loop is the whole point. Checking once is the classic bug: a creature
 * dying frees an Aura, the Aura going to the graveyard can drop a player's life
 * total, and the player leaving takes their permanents with them, which can
 * free more Auras. One pass catches the first of those and quietly leaves the
 * rest of the game wrong.
 *
 * Every finding from a single pass is applied before the next pass runs, which
 * is CR 704.3's "all applicable state-based actions are performed
 * simultaneously as a single event".
 *
 * `apply` is injected so this module depends on nothing that depends on it —
 * `rules.ts` owns zone movement and the log, and passing its applier in keeps
 * the dependency pointing one way.
 */
export function runStateBasedActions(
  state: GameState,
  apply: (state: GameState, finding: SbaFinding) => GameState,
  maxIterations = MAX_SBA_ITERATIONS
): SbaRunResult {
  let next = state;
  const applied: SbaFinding[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const findings = stateBasedActions(next);
    if (findings.length === 0) {
      return { state: next, findings: applied, iterations: iteration, stable: true };
    }
    for (const finding of findings) {
      next = apply(next, finding);
      applied.push(finding);
    }
  }

  // CR 704.4 makes this a draw. A playtest tool must not hang, so it stops and
  // says so; the caller logs it rather than letting the game look healthy.
  return { state: next, findings: applied, iterations: maxIterations, stable: false };
}
