/**
 * DeckMatrix playtest harness — the external observer.
 *
 * WHAT THIS IS
 * ------------
 * The runner produces games. This produces findings. It watches a game from
 * outside the engine, one action at a time, and answers two questions the test
 * suite structurally cannot:
 *
 *   Did the thing happen at all, ever, in any game?   (event coverage)
 *   Is the game in a position the rules forbid?       (invariants)
 *
 * Everything here is computed from two plain values, the state before an action
 * and the state after it. Nothing asks the engine whether it succeeded. That is
 * the whole point: an engine that reports its own success can report success it
 * did not have, and this project has already been burned by exactly that.
 *
 * WHY EVENTS ARE READ FROM STATE AND NOT FROM ACTIONS
 * ---------------------------------------------------
 * `applyAction` cascades. A PLAY of a creature with an enters trigger drains
 * the pending trigger queue inside the same call, so the token that trigger
 * created never appears as an action in the log — it appears only as a card
 * that exists after and did not exist before. Reading events from the action
 * type would miss every one of those, and they are the interesting half.
 *
 * So a detector's input is the state difference, and an action type is used
 * only where an action IS the event (a spell being countered, a mulligan).
 *
 * THE ZEROES ARE THE FINDING
 * --------------------------
 * Every event in the catalogue below carries `whyZeroMatters`. An event that
 * never fires in a hundred games is either impossible in the engine or
 * unreachable from any code a player can touch, and the report has to say which
 * one it thinks it is rather than leaving a blank row. That is what CLAUDE.md
 * means by "the engine supports it" and "a player can do it" being different
 * claims.
 */

import type {
  CardInstance,
  GameAction,
  GameEvent,
  GameState,
  InstanceId,
  PlayerId,
  StackObject,
} from '../../src/lib/game/types.ts';
import { combatPowerIn, hasKeywordIn } from '../../src/lib/game/characteristics.ts';
import { enchantSubject, knownToughness } from '../../src/lib/game/sba.ts';
import { ZONES } from '../../src/lib/game/types.ts';

/* -------------------------------------------------------------------------- */
/* One observation                                                            */
/* -------------------------------------------------------------------------- */

/** Everything a detector is allowed to look at. Two states and the action between them. */
export interface Frame {
  /** Which game, so a finding can be reproduced. */
  seed: number;
  kind: string;
  players: number;
  /** Index of the action inside that game. */
  at: number;
  action: GameAction;
  before: GameState;
  after: GameState;
  /** Log lines this one action appended. The engine's own words, used as evidence, never as proof. */
  logAdded: GameEvent[];
  /** True when the reducer refused the action outright. */
  refused: boolean;
}

export interface EventHit {
  event: string;
  /** Free detail for the report: which card, which keyword, how much. */
  detail: string;
  seed: number;
  at: number;
  turn: number;
}

export interface InvariantHit {
  invariant: string;
  /** Prose. A reader who sees only this line must know what is wrong. */
  message: string;
  seed: number;
  kind: string;
  players: number;
  at: number;
  turn: number;
  step: string;
  actionType: string;
  instanceId?: InstanceId;
}

/* -------------------------------------------------------------------------- */
/* The catalogue                                                              */
/* -------------------------------------------------------------------------- */

export type EventCategory =
  | 'combat'
  | 'keyword'
  | 'counters'
  | 'permanents'
  | 'stack'
  | 'commander'
  | 'zones'
  | 'honesty';

export interface CatalogEntry {
  id: string;
  label: string;
  category: EventCategory;
  /** Read out loud when the count is zero. Written before any game ran. */
  whyZeroMatters: string;
  /**
   * Set when the owner named this one directly. Those rows are printed even at
   * zero and near the top, because a zero on a named row is the answer to the
   * question that was actually asked.
   */
  asked?: boolean;
}

export const CATALOG: readonly CatalogEntry[] = [
  /* --- the owner's list --- */
  {
    id: 'equipment-attached',
    label: 'An Equipment became attached to a creature',
    category: 'permanents',
    asked: true,
    whyZeroMatters:
      'Equipment on the battlefield does nothing until it is attached. Zero here means every ' +
      'Equipment a player draws is a dead card for the whole game.',
  },
  {
    id: 'aura-attached',
    label: 'An Aura became attached to something',
    category: 'permanents',
    asked: true,
    whyZeroMatters:
      'An Aura that enters unattached is illegal and is put into the graveyard by a state-based ' +
      'action. Zero attachments means every Aura in every deck is a card that cannot be played.',
  },
  {
    id: 'counter-plus1',
    label: 'A +1/+1 counter was put on a creature',
    category: 'counters',
    asked: true,
    whyZeroMatters:
      '+1/+1 counters are the single most common way a creature changes size. Zero means every ' +
      'counter mechanic in every deck is inert.',
  },
  {
    id: 'counter-other',
    label: 'Any other counter went on a permanent',
    category: 'counters',
    whyZeroMatters:
      'Loyalty, charge, lore and the rest. Zero means planeswalkers and sagas do not function.',
  },
  {
    id: 'token-created',
    label: 'A token entered the battlefield',
    category: 'permanents',
    asked: true,
    whyZeroMatters:
      'Token making is one of the most common effects printed. Zero means every token card is blank.',
  },
  {
    id: 'flyer-attacks',
    label: 'A creature with flying attacked',
    category: 'combat',
    asked: true,
    whyZeroMatters:
      'Flying is the commonest evasion keyword in the game. Zero means either no flyer was ever ' +
      'able to attack or the attack path does not read keywords at all.',
  },
  {
    id: 'flyer-blocked-legally',
    label: 'A flyer was blocked by a creature with flying or reach',
    category: 'combat',
    asked: true,
    whyZeroMatters:
      'This is the other half of flying. Zero, with flyer attacks above zero, means flying is ' +
      'unblockable in practice and combat maths is wrong for every deck with a flyer in it.',
  },
  {
    id: 'trample-damage',
    label: 'A blocked trampler still damaged the defending player',
    category: 'keyword',
    asked: true,
    whyZeroMatters:
      'Trample is the reason a big creature is worth playing into chump blockers. Zero means the ' +
      'keyword is a badge with no rules behind it.',
  },
  {
    id: 'lifelink-gain',
    label: 'Damage from a lifelink source gained its controller life',
    category: 'keyword',
    asked: true,
    whyZeroMatters:
      'Lifelink is a life total change nobody would miss if it worked. Zero means the badge lies.',
  },
  {
    id: 'deathtouch-marked',
    label: 'Deathtouch damage was recorded on a permanent',
    category: 'keyword',
    asked: true,
    whyZeroMatters:
      'Deathtouch makes any nonzero damage lethal. Zero means a deathtouch creature trades like a ' +
      'vanilla one and a player loses creatures they should have kept.',
  },
  {
    id: 'spell-countered',
    label: 'A spell was countered',
    category: 'stack',
    asked: true,
    whyZeroMatters:
      'Counterspells are a whole colour of Magic. Zero means every counterspell in every blue deck ' +
      'is a card that cannot be used.',
  },
  {
    id: 'ability-on-stack',
    label: 'A triggered or activated ability sat on the stack',
    category: 'stack',
    asked: true,
    whyZeroMatters:
      'Abilities use the stack so they can be responded to. Zero means nothing can ever be ' +
      'responded to, and every instant in the game loses its reason to exist.',
  },
  {
    id: 'mulligan',
    label: 'A player mulliganed',
    category: 'zones',
    asked: true,
    whyZeroMatters:
      'A player who cannot mulligan is stuck with a hand of seven lands. It is the first thing ' +
      'that happens in a real game.',
  },
  {
    id: 'commander-cast',
    label: 'A commander was cast from the command zone',
    category: 'commander',
    asked: true,
    whyZeroMatters:
      'Commander is the format this app is built around and the commander is the deck. Zero means ' +
      'the command zone is a display case.',
  },
  {
    id: 'commander-damage',
    label: 'Commander damage was tallied against a player',
    category: 'commander',
    asked: true,
    whyZeroMatters:
      'Twenty-one commander damage is a win condition players build entire decks around.',
  },

  /* --- the rest, which the owner did not name but a game needs --- */
  {
    id: 'spell-on-stack',
    label: 'A spell was announced onto the stack',
    category: 'stack',
    whyZeroMatters:
      'A spell that never touches the stack cannot be responded to, cannot be countered and ' +
      'cannot have its targets checked. Everything else on the stack depends on this one.',
  },
  {
    id: 'priority-passed',
    label: 'A player passed priority',
    category: 'stack',
    whyZeroMatters: 'Without priority nobody ever gets a window to act on another player turn.',
  },
  {
    id: 'stack-resolved',
    label: 'An object resolved off the stack',
    category: 'stack',
    whyZeroMatters: 'Follows from spell-on-stack. Zero here with zero there is one finding, not two.',
  },
  {
    id: 'spell-fizzled',
    label: 'A spell fizzled because its targets were gone',
    category: 'stack',
    whyZeroMatters: 'Depends on targeting existing at all.',
  },
  {
    id: 'activated-ability-used',
    label: 'A permanent activated ability was used',
    category: 'stack',
    whyZeroMatters:
      'Every card that reads "T: do something" is inert without this, which is most of the ' +
      'artifacts and half the creatures printed.',
  },
  {
    id: 'enters-tapped-applied',
    label: 'A permanent whose text says it enters tapped actually entered tapped',
    category: 'permanents',
    whyZeroMatters:
      'Half a real mana base says "this land enters tapped". If that is ignored, every deck ' +
      'plays a turn faster than it should, every mana calculation is wrong, and the tempo cost ' +
      'the card was priced around does not exist.',
  },
  {
    id: 'planeswalker-entered',
    label: 'A planeswalker entered the battlefield',
    category: 'permanents',
    whyZeroMatters: 'A planeswalker with no loyalty counter is destroyed immediately by CR 704.5i.',
  },
  {
    id: 'loyalty-ability-used',
    label: 'A loyalty ability changed a planeswalker loyalty',
    category: 'permanents',
    whyZeroMatters: 'A planeswalker whose abilities cannot be used is a four mana blank.',
  },
  {
    id: 'first-strike-damage',
    label: 'A first strike or double strike creature dealt combat damage',
    category: 'keyword',
    whyZeroMatters: 'First strike decides which creature dies in a trade.',
  },
  {
    id: 'vigilance-attack',
    label: 'A vigilance creature attacked and stayed untapped',
    category: 'keyword',
    whyZeroMatters: 'Vigilance is a keyword whose whole effect is one boolean at attack time.',
  },
  {
    id: 'menace-multi-block',
    label: 'A menace creature was blocked by two or more creatures',
    category: 'keyword',
    whyZeroMatters: 'Menace either forbids the single block or it does nothing.',
  },
  {
    id: 'creature-died',
    label: 'A creature went from the battlefield to a graveyard',
    category: 'zones',
    whyZeroMatters: 'Nothing about combat or removal works if creatures never die.',
  },
  {
    id: 'sba-applied',
    label: 'A state-based action was applied',
    category: 'zones',
    whyZeroMatters: 'Lethal damage, zero toughness and player loss all run through state-based actions.',
  },
  {
    id: 'draw-step-draw',
    label: 'A player drew a card for the turn',
    category: 'zones',
    whyZeroMatters:
      'The draw step is the engine of the game. Zero means every player runs out of cards and ' +
      'the game is decided by the opening hand.',
  },
  {
    id: 'land-played',
    label: 'A land was played from hand',
    category: 'zones',
    whyZeroMatters: 'No lands means no mana means no game.',
  },
  {
    id: 'card-discarded',
    label: 'A card went from hand to graveyard',
    category: 'zones',
    whyZeroMatters:
      'Cleanup enforces the seven card hand size. Zero means a player can hoard twenty cards.',
  },
  {
    id: 'permanent-exiled',
    label: 'A card was exiled',
    category: 'zones',
    whyZeroMatters: 'Exile is the answer to anything with a graveyard recursion plan.',
  },
  {
    id: 'card-tapped-for-mana',
    label: 'A permanent was tapped to pay for something',
    category: 'permanents',
    whyZeroMatters: 'Zero means spells are free, which is not a game.',
  },
  {
    id: 'untap-step',
    label: 'Permanents untapped at the start of a turn',
    category: 'permanents',
    whyZeroMatters: 'Everything taps once and stays tapped forever.',
  },
  {
    id: 'life-gained',
    label: 'A player gained life',
    category: 'zones',
    whyZeroMatters: 'Lifegain is the commonest automated effect in `effects.ts`.',
  },
  {
    id: 'player-lost',
    label: 'A player lost the game',
    category: 'zones',
    whyZeroMatters: 'A game nobody can lose never ends.',
  },
  {
    id: 'monarch-or-initiative',
    label: 'The monarch or the initiative changed hands',
    category: 'permanents',
    whyZeroMatters: 'Two whole state fields with no producer.',
  },
  {
    id: 'replacement-registered',
    label: 'A replacement effect was registered',
    category: 'permanents',
    whyZeroMatters:
      'Replacement effects are how a permanent enters tapped, enters with counters, or has damage ' +
      'prevented. A whole module with no producer is the shape of finding this harness exists for.',
  },
  {
    id: 'poison-counter',
    label: 'A poison counter was given to a player',
    category: 'counters',
    whyZeroMatters: 'Infect and toxic are a second win condition.',
  },
  {
    id: 'commander-to-command-zone',
    label: 'A commander was put back into the command zone',
    category: 'commander',
    whyZeroMatters:
      'A commander that dies and stays in the graveyard is gone for good, which is not how the ' +
      'format works.',
  },
  {
    id: 'commander-tax-paid',
    label: 'Commander tax was charged on a cast',
    category: 'commander',
    whyZeroMatters:
      'CR 903.8 is the cost of losing a commander and the reason a Commander game does not just ' +
      'loop the same threat forever. It read zero over 80 games while the tax code was correct ' +
      'and tested, because nothing could put a dead commander back and so nothing was ever cast ' +
      'from the command zone twice. A number here that never moves means the row above it is a ' +
      'display case too.',
  },

  /* --- the honesty rows: what the app told the player --- */
  {
    id: 'note-emitted',
    label: 'The engine said out loud that it did not resolve something',
    category: 'honesty',
    whyZeroMatters:
      'Zero here is not good news on its own. Paired with unresolved card text it means the app ' +
      'went quiet instead of admitting it, which is the exact complaint this harness answers.',
  },
  {
    id: 'trigger-logged',
    label: 'A triggered ability was logged as triggering',
    category: 'honesty',
    whyZeroMatters: 'The player never sees why anything happened.',
  },
];

export const CATALOG_BY_ID = new Map(CATALOG.map(entry => [entry.id, entry]));

/* -------------------------------------------------------------------------- */
/* Small readers over a card                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Does this permanent have this keyword right now?
 *
 * Layer aware, and it has to be. Winged Sliver's whole text is "All Sliver
 * creatures have flying", so its own `keywords` array is EMPTY and it has
 * flying. Reading the printed list would report a legal block as a rules
 * violation and, worse, would undercount every flying, trample and lifelink
 * event in the coverage table by exactly the cards that are most interesting.
 */
function kw(state: GameState, card: CardInstance | undefined, keyword: string): boolean {
  if (!card) return false;
  if (card.zone !== 'battlefield') {
    return (card.keywords ?? []).map(k => k.toLowerCase()).indexOf(keyword) !== -1;
  }
  return hasKeywordIn(state, card, keyword);
}

/**
 * Can CR 704.5m be judged for this Aura at all?
 *
 * Deliberately the same rule `sba.ts` applies to itself, and restated here for
 * the same reason `pool.ts` restates the land colour rule: an Aura that
 * enchants a PLAYER has no `attachedTo` in this model, because only permanents
 * have instance ids. Curse of Stalked Prey reads "Enchant player" and sits on
 * the battlefield attached to nothing, entirely correctly.
 *
 * Without this check the invariant fired 425 times across three games on one
 * Curse, and every one of them would have been a lie about a rule the engine
 * gets right. That is exactly the failure mode a harness must not have, so the
 * count is written down here as a reminder of what a loose invariant costs.
 */
function auraCanBeJudged(card: CardInstance): boolean {
  const subject = enchantSubject(card);
  if (!subject) return false;
  if (subject.includes('player') || subject.includes('opponent')) return false;
  return true;
}

function typeLine(card: CardInstance | undefined): string {
  return (card?.typeLine ?? '').toLowerCase();
}

function isCreatureCard(card: CardInstance | undefined): boolean {
  return typeLine(card).includes('creature');
}

/* -------------------------------------------------------------------------- */
/* Event detection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Everything that happened in one action, as catalogue ids.
 *
 * The detectors are deliberately independent of each other and of the action
 * type wherever the state can answer the question. A detector that reads the
 * action type is one that would miss anything the engine cascaded internally,
 * and the cascades are where the triggers live.
 */
export function detectEvents(frame: Frame): EventHit[] {
  const hits: EventHit[] = [];
  const { before, after, action, seed, at } = frame;
  const turn = after.turn;

  const push = (event: string, detail: string): void => {
    hits.push({ event, detail, seed, at, turn });
  };

  if (frame.refused) return hits;

  /*
   * CR 903.8 — commander tax, read off the ANNOUNCEMENT rather than off the
   * zone change.
   *
   * `commander-cast` below watches the card leave the command zone, which is
   * applied by `PLAY` or by `CAST_SPELL` and by then the count has already gone
   * up. The tax being PAID is a fact about the state before `CAST_COMMANDER`
   * reduces, so it is read here and nowhere else.
   */
  if (action.type === 'CAST_COMMANDER') {
    const ref = before.players
      .flatMap(player => player.commanders)
      .find(commander => commander.id === action.commanderId);
    const paid = (ref?.castCount ?? 0) * before.rules.commanderTaxPerCast;
    if (paid > 0) {
      push(
        'commander-tax-paid',
        `${ref?.name ?? 'A commander'} cost ${paid} more, for ${ref?.castCount} previous cast(s)`
      );
    }
  }

  /* ---- cards that appeared, moved or changed ---- */

  for (const id of Object.keys(after.cards)) {
    const now = after.cards[id];
    const was = before.cards[id];

    if (!was) {
      // A card that did not exist before. Tokens, and nothing else in this engine.
      if (now.isToken) push('token-created', `${now.name} (${now.typeLine ?? 'token'})`);
      continue;
    }

    /* counters */
    for (const [counter, value] of Object.entries(now.counters ?? {})) {
      const previous = was.counters?.[counter] ?? 0;
      if (value <= previous) continue;
      if (counter === '+1/+1') {
        push('counter-plus1', `${now.name} +${value - previous}`);
      } else if (counter === 'loyalty') {
        push('counter-other', `${now.name} loyalty +${value - previous}`);
      } else {
        push('counter-other', `${now.name} ${counter} +${value - previous}`);
      }
    }
    if (typeLine(now).includes('planeswalker')) {
      const nowLoyalty = now.counters?.loyalty ?? 0;
      const wasLoyalty = was.counters?.loyalty ?? 0;
      // Entering with loyalty is not an ability being used; a later change is.
      if (was.zone === 'battlefield' && now.zone === 'battlefield' && nowLoyalty !== wasLoyalty) {
        push('loyalty-ability-used', `${now.name} ${wasLoyalty} to ${nowLoyalty}`);
      }
    }

    /* attachments */
    if (!was.attachedTo && now.attachedTo) {
      const host = after.cards[now.attachedTo];
      const line = typeLine(now);
      const detail = `${now.name} to ${host?.name ?? now.attachedTo}`;
      if (line.includes('equipment')) push('equipment-attached', detail);
      else if (line.includes('aura')) push('aura-attached', detail);
      else push('equipment-attached', `${detail} (type line: ${now.typeLine ?? 'unknown'})`);
    }

    /* deathtouch */
    if (!was.damagedByDeathtouch && now.damagedByDeathtouch) {
      push('deathtouch-marked', `${now.name} was dealt deathtouch damage`);
    }

    /* zone moves */
    if (was.zone !== now.zone) {
      const move = `${was.zone} to ${now.zone}`;
      if (was.zone === 'battlefield' && now.zone === 'graveyard' && isCreatureCard(now)) {
        push('creature-died', `${now.name}`);
      }
      if (now.zone === 'exile') push('permanent-exiled', `${now.name} from ${was.zone}`);
      if (was.zone === 'hand' && now.zone === 'graveyard') push('card-discarded', now.name);
      /*
       * A draw is a card going from library to hand, and nothing more.
       *
       * An earlier version of this required `before.step === 'draw'` and
       * reported zero draws in a hundred and ten games, which would have been a
       * fabricated headline finding. Players draw perfectly well; the draw is
       * performed by the ADVANCE_STEP that LEAVES the upkeep, so the step
       * recorded before the action is "upkeep". The step is worth naming and is
       * carried in the detail rather than used as a gate.
       */
      if (was.zone === 'library' && now.zone === 'hand') {
        push('draw-step-draw', `${now.name} (during the ${before.step} step)`);
      }
      if (was.zone === 'hand' && now.zone === 'battlefield' && typeLine(now).includes('land')) {
        push('land-played', now.name);
      }
      if (now.zone === 'battlefield' && typeLine(now).includes('planeswalker')) {
        push('planeswalker-entered', now.name);
      }
      if (now.zone === 'battlefield' && was.zone !== 'battlefield' && now.tapped) {
        if (saysItEntersTapped(now)) push('enters-tapped-applied', now.name);
      }
      if (now.isCommander && was.zone === 'command' && now.zone !== 'command') {
        // Worth the detail: the commander DOES leave the command zone, and it
        // does so through whichever action was applied, which is not
        // necessarily CAST_COMMANDER. The action reachability table below says
        // which, and the two rows have to be read together or the reader will
        // conclude the opposite of the truth in either direction.
        push('commander-cast', `${now.name} left the command zone for ${now.zone} via ${action.type}`);
      }
      if (now.isCommander && now.zone === 'command' && was.zone !== 'command') {
        push('commander-to-command-zone', `${now.name} returned from ${was.zone}`);
      }
      void move;
    }

    /* untapping in bulk is the untap step; one card untapping is not */
    if (was.tapped && !now.tapped && after.step === 'untap') {
      push('untap-step', now.name);
    }
    if (!was.tapped && now.tapped && action.type === 'TAP') {
      push('card-tapped-for-mana', now.name);
    }
  }

  /* ---- players ---- */

  for (const nowPlayer of after.players) {
    const wasPlayer = before.players.find(p => p.id === nowPlayer.id);
    if (!wasPlayer) continue;

    if (nowPlayer.life > wasPlayer.life) {
      push('life-gained', `${nowPlayer.id} +${nowPlayer.life - wasPlayer.life}`);
    }
    if (nowPlayer.poison > wasPlayer.poison) {
      push('poison-counter', `${nowPlayer.id} +${nowPlayer.poison - wasPlayer.poison}`);
    }
    if (!wasPlayer.hasLost && nowPlayer.hasLost) {
      push('player-lost', `${nowPlayer.id}: ${nowPlayer.lossReasons.join(', ') || 'no reason given'}`);
    }
    for (const [commanderId, value] of Object.entries(nowPlayer.commanderDamage ?? {})) {
      const previous = wasPlayer.commanderDamage?.[commanderId] ?? 0;
      if (value > previous) {
        push('commander-damage', `${nowPlayer.id} took ${value - previous} (total ${value})`);
      }
    }
  }

  if (before.monarchId !== after.monarchId || before.initiativeId !== after.initiativeId) {
    push('monarch-or-initiative', `${after.monarchId ?? 'none'} / ${after.initiativeId ?? 'none'}`);
  }

  if ((before.replacements?.length ?? 0) < (after.replacements?.length ?? 0)) {
    push('replacement-registered', `${after.replacements?.length ?? 0} registered`);
  }

  /* ---- the stack ---- */

  const stackBefore: readonly StackObject[] = before.stack ?? [];
  const stackAfter: readonly StackObject[] = after.stack ?? [];
  const idsBefore = new Set(stackBefore.map(o => o.stackId));
  for (const object of stackAfter) {
    if (idsBefore.has(object.stackId)) continue;
    if (object.kind === 'spell') push('spell-on-stack', `${object.name}`);
    else push('ability-on-stack', `${object.name} (${object.kind})`);
    if (object.kind === 'activated') push('activated-ability-used', object.name);
  }
  if (stackAfter.length < stackBefore.length) {
    push('stack-resolved', `${stackBefore.length} to ${stackAfter.length}`);
  }
  if (action.type === 'COUNTER_SPELL') push('spell-countered', `stack ${action.stackId}`);
  if (action.type === 'PASS_PRIORITY') push('priority-passed', String(action.playerId ?? ''));

  /* ---- combat ---- */

  const attackersBefore = new Set(before.combat.attackers.map(a => a.attackerId));
  for (const declaration of after.combat.attackers) {
    const card = after.cards[declaration.attackerId];
    if (!attackersBefore.has(declaration.attackerId)) {
      if (kw(after, card, 'flying')) push('flyer-attacks', card?.name ?? declaration.attackerId);
      if (kw(after, card, 'vigilance') && !card?.tapped) {
        push('vigilance-attack', card?.name ?? declaration.attackerId);
      }
    }

    const wasBlocked = before.combat.attackers.find(a => a.attackerId === declaration.attackerId);
    const newBlockers = declaration.blockedBy.filter(
      id => !(wasBlocked?.blockedBy ?? []).includes(id)
    );
    for (const blockerId of newBlockers) {
      const blocker = after.cards[blockerId];
      if (kw(after, card, 'flying')) {
        if (kw(after, blocker, 'flying') || kw(after, blocker, 'reach')) {
          push(
            'flyer-blocked-legally',
            `${blocker?.name ?? blockerId} blocked ${card?.name ?? ''}`
          );
        }
      }
    }
    if (
      kw(after, card, 'menace') &&
      declaration.blockedBy.length >= 2 &&
      (wasBlocked?.blockedBy.length ?? 0) < 2
    ) {
      push('menace-multi-block', `${card?.name} blocked by ${declaration.blockedBy.length}`);
    }
  }

  if (action.type === 'DAMAGE' && action.sourceInstanceId) {
    const source = after.cards[action.sourceInstanceId] ?? before.cards[action.sourceInstanceId];
    const declaration = before.combat.attackers.find(
      a => a.attackerId === action.sourceInstanceId
    );
    if (kw(before, source, 'trample') && declaration && declaration.blockedBy.length > 0) {
      push('trample-damage', `${source?.name} dealt ${action.amount} through blockers`);
    }
    if (kw(before, source, 'first strike') || kw(before, source, 'double strike')) {
      push('first-strike-damage', `${source?.name}`);
    }
    if (kw(before, source, 'lifelink')) {
      const controller = source?.controllerId;
      const wasLife = before.players.find(p => p.id === controller)?.life ?? 0;
      const nowLife = after.players.find(p => p.id === controller)?.life ?? 0;
      if (nowLife > wasLife) push('lifelink-gain', `${source?.name} gained ${nowLife - wasLife}`);
    }
  }
  if (action.type === 'DAMAGE_CARD' && action.sourceInstanceId) {
    const source = after.cards[action.sourceInstanceId] ?? before.cards[action.sourceInstanceId];
    if (kw(before, source, 'first strike') || kw(before, source, 'double strike')) {
      push('first-strike-damage', `${source?.name}`);
    }
    if (kw(before, source, 'lifelink')) {
      const controller = source?.controllerId;
      const wasLife = before.players.find(p => p.id === controller)?.life ?? 0;
      const nowLife = after.players.find(p => p.id === controller)?.life ?? 0;
      if (nowLife > wasLife) push('lifelink-gain', `${source?.name} gained ${nowLife - wasLife}`);
    }
  }

  /* ---- what the engine said, which is evidence about the player, not about the rules ---- */

  for (const entry of frame.logAdded) {
    if (entry.type === 'NOTE') push('note-emitted', entry.message.slice(0, 120));
    if (entry.type === 'TRIGGER') push('trigger-logged', entry.message.slice(0, 120));
    if (entry.type === 'STATE_BASED_ACTION') push('sba-applied', entry.message.slice(0, 120));
  }

  return hits;
}

/* -------------------------------------------------------------------------- */
/* Opportunities                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How often the game was in a position where an event COULD have fired.
 *
 * A bare zero is not evidence on its own. "Lifelink never gained anybody life"
 * means one thing if a lifelink creature connected forty times and something
 * completely different if no lifelink creature ever dealt damage — the first is
 * a broken keyword, the second is a run that never tested it. Without the
 * denominator the harness would be reporting the absence of a test as the
 * presence of a bug, which is the fabrication this whole project forbids.
 *
 * So each of these counts the setup, and the report prints them side by side:
 * N chances, M times it happened.
 */
export const OPPORTUNITY_OF: Readonly<Record<string, string>> = {
  'lifelink-gain': 'a source with lifelink dealt damage',
  'deathtouch-marked': 'a creature with deathtouch was dealing combat damage',
  'trample-damage': 'an attacker with trample was blocked',
  'equipment-attached': 'an Equipment entered the battlefield',
  'aura-attached': 'an Aura was played',
  'counter-plus1': 'a card whose text puts a +1/+1 counter resolved',
  'activated-ability-used': 'a permanent with an activated ability entered the battlefield',
  'spell-countered': 'a card that counters a spell was drawn or played',
  'flyer-blocked-legally': 'a flyer attacked into a defender holding an untapped flyer or reach',
  'loyalty-ability-used': 'a planeswalker was on the battlefield with loyalty on it',
  'enters-tapped-applied': 'a permanent whose text says it enters tapped, with no condition, was played',
};

/**
 * 'This land enters tapped.' with no escape clause.
 *
 * 'Enters tapped unless you control a Plains' is deliberately excluded: the
 * condition may well have been true, and an untapped Castle Ardenvale is then
 * correct. Only the unconditional wording can prove a zero.
 */
const ENTERS_TAPPED_LINE =
  /^(?:this (?:land|artifact|creature|permanent|enchantment|vehicle)|~)\s+enters (?:the battlefield )?tapped\b/i;

/**
 * True only when this card's own text says, without any condition, that it
 * enters tapped.
 *
 * Every exclusion below was a real false positive in a run, and each one would
 * have turned a working rule into a reported defect:
 *
 *   "If you control two or more other lands, this land enters tapped."
 *      Hall of Storm Giants. With one other land it correctly enters untapped.
 *   "As this land enters, you may pay 2 life. If you don't, it enters tapped."
 *      Every shock land. Paying is a choice and untapped is a legal outcome.
 *   "Whenever a land you control enters tapped, …"
 *      Tiller Engine. That is a trigger about somebody else's land.
 *   A double-faced card.
 *      The oracle text of both faces is joined into one string with no marker
 *      between them, so "enters tapped" on the land back of a spell cannot be
 *      told apart from text on the face that was actually played. Rather than
 *      guess at the split, those cards are left out of this measurement
 *      entirely and the count says so.
 */
function saysItEntersTapped(card: CardInstance): boolean {
  if ((card.typeLine ?? '').includes('//')) return false;
  return (card.oracleText ?? '')
    .split('\n')
    .some(line => ENTERS_TAPPED_LINE.test(line.trim()) && !/\bunless\b/i.test(line));
}

export function detectOpportunities(frame: Frame): EventHit[] {
  const hits: EventHit[] = [];
  const { before, after, action, seed, at } = frame;
  if (frame.refused) return hits;

  const push = (event: string, detail: string): void => {
    hits.push({ event: `opp:${event}`, detail, seed, at, turn: after.turn });
  };

  /* damage-shaped chances, read off the action that dealt it */
  if (action.type === 'DAMAGE' || action.type === 'DAMAGE_CARD') {
    const source = before.cards[action.sourceInstanceId ?? ''] ?? undefined;
    if (kw(before, source, 'lifelink')) push('lifelink-gain', source?.name ?? '');
    if (kw(before, source, 'deathtouch')) push('deathtouch-marked', source?.name ?? '');
    if (action.type === 'DAMAGE' && kw(before, source, 'trample')) {
      const declaration = before.combat.attackers.find(a => a.attackerId === action.sourceInstanceId);
      if (declaration && declaration.blockedBy.length > 0) push('trample-damage', source?.name ?? '');
    }
  }

  /* combat-shaped chances, read off the board */
  for (const declaration of before.combat.attackers) {
    for (const blockerId of declaration.blockedBy) {
      const blocker = before.cards[blockerId];
      if (kw(before, blocker, 'deathtouch')) push('deathtouch-marked', blocker?.name ?? '');
    }
  }

  /* cards arriving that bring a chance with them */
  for (const id of Object.keys(after.cards)) {
    const now = after.cards[id];
    const was = before.cards[id];
    if (!was || was.zone === now.zone) continue;

    const line = typeLine(now);
    const text = (now.oracleText ?? '').toLowerCase();

    if (now.zone === 'battlefield') {
      if (line.includes('equipment')) push('equipment-attached', now.name);
      if (line.includes('planeswalker')) push('loyalty-ability-used', now.name);
      if (/^[^:\n]{1,60}:\s/m.test(now.oracleText ?? '') && !/:\s*add\b/i.test(text)) {
        push('activated-ability-used', now.name);
      }
    }
    if (line.includes('aura') && was.zone === 'hand') push('aura-attached', now.name);
    if (now.zone === 'battlefield' && was.zone !== 'battlefield' && saysItEntersTapped(now)) {
      push('enters-tapped-applied', now.name);
    }
    if (/\+1\/\+1 counter/.test(text) && was.zone === 'hand') push('counter-plus1', now.name);
    if (/counter target .{0,30}spell/.test(text) && now.zone === 'hand') {
      push('spell-countered', now.name);
    }
  }

  /* a flyer attacking into somebody who could have blocked it */
  const attackersBefore = new Set(before.combat.attackers.map(a => a.attackerId));
  for (const declaration of after.combat.attackers) {
    if (attackersBefore.has(declaration.attackerId)) continue;
    const attacker = after.cards[declaration.attackerId];
    if (!kw(after, attacker, 'flying')) continue;
    const defender = declaration.defenderPlayerId;
    if (!defender) continue;
    const canBlock = Object.values(after.cards).some(
      card =>
        card.zone === 'battlefield' &&
        card.controllerId === defender &&
        !card.tapped &&
        typeLine(card).includes('creature') &&
        (kw(after, card, 'flying') || kw(after, card, 'reach'))
    );
    if (canBlock) push('flyer-blocked-legally', attacker?.name ?? '');
  }

  return hits;
}

/** Mulligans happen before the first action, so they are counted from the record. */
export function detectMulligans(setupActions: readonly GameAction[], seed: number): EventHit[] {
  const shuffles = setupActions.filter(a => a.type === 'SHUFFLE').length;
  if (shuffles === 0) return [];
  return [
    {
      event: 'mulligan',
      detail: `${shuffles} hands were shuffled back and redrawn before turn one`,
      seed,
      at: -1,
      turn: 0,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Invariants                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Positions the rules forbid, checked after every single action.
 *
 * These are cheap and absolute. Each one is a statement that would be true of
 * any legal game of Magic at any moment a player could be looking at the board,
 * so a violation is a bug regardless of what the engine intended.
 *
 * A note on where they are checked: state-based actions run inside
 * `applyAction`, so by the time this sees a state, every SBA that was going to
 * fire has fired. A creature with zero toughness still standing here is not a
 * timing artefact, it is a creature that survived the check.
 */
export function checkInvariants(frame: Frame): InvariantHit[] {
  const hits: InvariantHit[] = [];
  const state = frame.after;

  const base = {
    seed: frame.seed,
    kind: frame.kind,
    players: frame.players,
    at: frame.at,
    turn: state.turn,
    step: state.step,
    actionType: frame.action.type,
  };
  const fail = (invariant: string, message: string, instanceId?: InstanceId): void => {
    hits.push({ ...base, invariant, message, instanceId });
  };

  /* --- a permanent card that was sent straight to the graveyard --- */

  /*
   * CR 608.3 — a resolving permanent spell becomes a permanent on the
   * battlefield. It does not go to the graveyard.
   *
   * This fires on every double-faced and Adventure card whose back face is an
   * instant or a sorcery. `resolvesToGraveyard` in `mana.ts` asks whether the
   * type line contains "instant" or "sorcery", and a double-faced type line
   * carries BOTH faces — "Creature — Human Wizard // Instant" — so the front
   * face being a creature is never seen. The player casts a creature and
   * watches it land in the graveyard.
   *
   * Reading the front face here is not a second guess at the rule; it is the
   * only reading that can be right, because the front face is the one being
   * cast.
   */
  if (frame.action.type === 'PLAY' && frame.action.to === 'graveyard') {
    const card = frame.before.cards[frame.action.instanceId];
    const line = (card?.typeLine ?? '');
    const front = line.split('//')[0].toLowerCase();
    const isPermanentFront =
      front.includes('creature') ||
      front.includes('artifact') ||
      front.includes('enchantment') ||
      front.includes('planeswalker') ||
      front.includes('land') ||
      front.includes('battle');
    if (card && line.includes('//') && isPermanentFront) {
      fail(
        'permanent-card-resolved-into-the-graveyard',
        `${card.name} has a permanent front face ("${line.split('//')[0].trim()}") and was put ` +
          `into the graveyard on resolution instead of onto the battlefield. Its type line names ` +
          `both faces, so a check for the words "instant" or "sorcery" anywhere in it reads the ` +
          `back face and routes the whole card to the graveyard. Every modal double-faced and ` +
          `Adventure card with a spell on the back is unplayable this way.`,
        card.instanceId
      );
    }
  }

  /* --- zone bookkeeping --- */

  /** Every zone list, flattened, so an id in two of them is visible. */
  const seenIn = new Map<InstanceId, string[]>();
  for (const player of state.players) {
    for (const zone of ZONES) {
      const list = player.zones[zone];
      if (!Array.isArray(list)) continue;
      const counts = new Map<InstanceId, number>();
      for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, count] of counts) {
        if (count > 1) {
          fail(
            'duplicate-in-zone-list',
            `${state.cards[id]?.name ?? id} appears ${count} times in ${player.id}'s ${zone}. ` +
              `One card cannot be in one zone twice.`,
            id
          );
        }
        const where = seenIn.get(id) ?? [];
        where.push(`${player.id}.${zone}`);
        seenIn.set(id, where);
      }
      if (list.length < 0) {
        fail('negative-zone', `${player.id}'s ${zone} has a negative length.`);
      }
    }
  }

  for (const [id, places] of seenIn) {
    if (places.length > 1) {
      fail(
        'card-in-two-zones',
        `${state.cards[id]?.name ?? id} is in ${places.length} zone lists at once: ` +
          `${places.join(', ')}.`,
        id
      );
    }
    const card = state.cards[id];
    if (card && places.length === 1) {
      const zone = places[0].split('.')[1];
      if (card.zone !== zone) {
        fail(
          'zone-disagrees-with-list',
          `${card.name} says it is in the ${card.zone} but it is sitting in ${places[0]}. ` +
            `The card's own zone field and the player's zone list have to agree or every ` +
            `lookup in the app returns a different answer depending on which side it asked.`,
          id
        );
      }
    }
  }

  for (const [id, card] of Object.entries(state.cards)) {
    if (card.removedFromGame) continue;
    if (card.zone === 'stack') continue;
    if (!seenIn.has(id)) {
      fail(
        'card-in-no-zone',
        `${card.name} says it is in the ${card.zone} but no player's zone list contains it. ` +
          `It has fallen out of the game and nothing can find it.`,
        id
      );
    }
  }

  /* --- state-based actions that should have fired --- */

  for (const card of Object.values(state.cards)) {
    if (card.zone !== 'battlefield') continue;
    /*
     * CR 800.4a — a card that left the game with its owner keeps its old `zone`
     * field and is excluded by `removedFromGame`, which is how the rest of this
     * file and the whole of `sba.ts` read it (`battlefieldPermanents` skips
     * these; so does the `card-in-no-zone` check thirty lines up). This block
     * was the one place that did not, and every rule in it was therefore being
     * asked about cards that are not in the game.
     *
     * It reported nothing while Auras could not attach, because an Aura that
     * never attaches is unattached in every state and the first violation is
     * the one that gets reported. The moment Auras started attaching it produced
     * 21 `aura-attached-to-nothing` findings across 15 of 80 games, every one of
     * them an Aura whose controller had already lost: the Aura went out of the
     * game with its owner, `removePlayerCards` cleared `attachedTo` correctly,
     * and this loop read the stale `zone` and called it a rules violation. The
     * engine was right; the observer was looking at a card that no longer
     * existed. Verified by tracing seed 5004 action 427 through the real
     * reducer: `Sundial, Dawn Tyrant`, the host, reads
     * `removedFromGame: true`.
     */
    if (card.removedFromGame) continue;
    const line = (card.typeLine ?? '').toLowerCase();

    if (line.includes('creature')) {
      const toughness = knownToughness(state, card);
      if (toughness !== null && toughness <= 0) {
        fail(
          'zero-toughness-survives',
          `${card.name} is on the battlefield with toughness ${toughness}. CR 704.5f puts a ` +
            `creature with toughness zero or less into its owner's graveyard, and state-based ` +
            `actions have already run for this action.`,
          card.instanceId
        );
      }
    }

    if (line.includes('planeswalker')) {
      const loyalty = card.counters?.loyalty ?? 0;
      /*
       * Judged only on a printed loyalty this engine can READ, which is the
       * same gate `sba.ts` puts on CR 704.5i and for the same stated reason:
       * the engine never destroys a permanent on a number it does not have.
       *
       * The test used to be `card.loyalty` truthy, which is a different
       * question, and it could never fire because no deck source set the field
       * at all — every planeswalker in every game reached the battlefield with
       * `loyalty` undefined. The moment the field was populated, this line
       * produced 266 violations across one game, all of them the same card:
       * `Nissa, Steward of Elements`, printed `{X}{G}{U}` with a printed
       * loyalty of literally "X". CR 306.5b gives it X counters and nothing in
       * this engine announces an X for a spell, so `withStartingLoyalty` seeds
       * nothing and `sba.ts` declines to judge it. Both are deliberate. The
       * observer was the only one of the three reading the field as a boolean.
       *
       * Measured across the 30,611-card harness pool: 301 planeswalkers, 287
       * with an integer loyalty, 14 with none at all (every one the front face
       * of a double-faced card), and exactly 1 with "X".
       */
      const printed = card.loyalty === undefined ? null : /^[+-]?\d+$/.test(card.loyalty.trim())
        ? Number.parseInt(card.loyalty.trim(), 10)
        : null;
      if (loyalty <= 0 && printed !== null && printed > 0) {
        fail(
          'planeswalker-zero-loyalty',
          `${card.name} is on the battlefield with ${loyalty} loyalty. CR 704.5i puts it into ` +
            `the graveyard.`,
          card.instanceId
        );
      }
    }

    /*
     * CR 704.5m — an Aura on the battlefield attached to nothing is put into
     * its owner's graveyard.
     *
     * This one was added after reading the classifier audit rather than guessed
     * at up front: four of the first five silent cards found were Auras, which
     * is not a coincidence about those four cards, it is what happens when an
     * Aura can enter play and never attach to anything.
     */
    if (line.includes('aura') && !card.attachedTo && auraCanBeJudged(card)) {
      fail(
        'aura-attached-to-nothing',
        `${card.name} is an Aura sitting on the battlefield attached to nothing. CR 704.5m puts ` +
          `an unattached Aura into its owner's graveyard, and state-based actions have already ` +
          `run. It is on the board doing nothing and it cannot legally be there.`,
        card.instanceId
      );
    }

    /* --- attachments --- */
    if (card.attachedTo) {
      const host = state.cards[card.attachedTo];
      if (!host) {
        fail(
          'attached-to-nothing',
          `${card.name} is attached to instance ${card.attachedTo}, which is not a card in this ` +
            `game.`,
          card.instanceId
        );
      } else if (host.zone !== 'battlefield') {
        fail(
          'attached-to-non-permanent',
          `${card.name} is attached to ${host.name}, which is in the ${host.zone}. CR 704.5n ` +
            `unattaches an Equipment whose host is not a permanent.`,
          card.instanceId
        );
      } else if (host.instanceId === card.instanceId) {
        fail('attached-to-self', `${card.name} is attached to itself.`, card.instanceId);
      }
    }

    for (const [counter, value] of Object.entries(card.counters ?? {})) {
      if (value < 0) {
        fail(
          'negative-counter',
          `${card.name} has ${value} ${counter} counters. A negative number of counters is not ` +
            `a thing that can be on a permanent.`,
          card.instanceId
        );
      }
    }
  }

  /* --- attachments outside the battlefield still pointing at something --- */
  for (const card of Object.values(state.cards)) {
    if (card.zone === 'battlefield') continue;
    if (card.attachedTo) {
      fail(
        'stale-attachment',
        `${card.name} is in the ${card.zone} and still says it is attached to ` +
          `${state.cards[card.attachedTo]?.name ?? card.attachedTo}. An Equipment that leaves ` +
          `the battlefield takes its attachment with it into every later calculation.`,
        card.instanceId
      );
    }
  }

  /* --- players --- */

  for (const player of state.players) {
    if (player.life <= 0 && !player.hasLost && !player.conceded && state.status === 'playing') {
      fail(
        'zero-life-still-playing',
        `${player.name} is at ${player.life} life and has not lost. CR 704.5a is a state-based ` +
          `action, and they have already run.`
      );
    }
    if (player.poison >= 10 && !player.hasLost && state.status === 'playing') {
      fail(
        'ten-poison-still-playing',
        `${player.name} has ${player.poison} poison counters and has not lost (CR 704.5c).`
      );
    }
    const lethal = state.rules?.commanderDamageLethal ?? 21;
    for (const [commanderId, amount] of Object.entries(player.commanderDamage ?? {})) {
      if (amount >= lethal && !player.hasLost && state.status === 'playing') {
        fail(
          'lethal-commander-damage-still-playing',
          `${player.name} has taken ${amount} damage from commander ${commanderId} and has not ` +
            `lost, with the threshold at ${lethal}.`
        );
      }
    }
    if (player.hasLost && player.lossReasons.length === 0) {
      fail(
        'lost-for-no-reason',
        `${player.name} has lost the game and no loss reason was recorded, so nothing can tell ` +
          `the table why.`
      );
    }
  }

  /* --- combat --- */

  for (const declaration of state.combat.attackers) {
    const attacker = state.cards[declaration.attackerId];
    if (!attacker) {
      fail(
        'attacker-not-a-card',
        `Instance ${declaration.attackerId} is attacking and is not a card in this game.`
      );
      continue;
    }
    if (attacker.zone !== 'battlefield') {
      // Legitimate for one window: a creature that died in combat is still in
      // the declaration until combat ends. Only flag it once combat is over.
      if (state.step === 'postcombat_main' || state.step === 'end' || state.step === 'cleanup') {
        fail(
          'attacker-left-the-battlefield',
          `${attacker.name} is still recorded as an attacker at step "${state.step}" and is in ` +
            `the ${attacker.zone}. Combat did not clear itself.`,
          attacker.instanceId
        );
      }
    }
    for (const blockerId of declaration.blockedBy) {
      const blocker = state.cards[blockerId];
      if (!blocker) {
        fail('blocker-not-a-card', `Instance ${blockerId} is blocking and is not a card.`);
        continue;
      }
      /*
       * Only judged while both creatures are still on the battlefield.
       *
       * A block declaration survives the creature that made it — a blocker that
       * dies in the damage step is still listed in `blockedBy` until combat
       * ends. Off the battlefield there are no layers, so Winged Sliver, whose
       * only text is "All Sliver creatures have flying", loses the flying it
       * granted itself and its perfectly legal block reads as a rules
       * violation. The block was legal when it was declared and that is when
       * this checks it.
       */
      if (
        attacker.zone === 'battlefield' &&
        blocker.zone === 'battlefield' &&
        kw(state, attacker, 'flying') &&
        !kw(state, blocker, 'flying') &&
        !kw(state, blocker, 'reach')
      ) {
        fail(
          'flyer-blocked-by-ground-creature',
          `${blocker.name} has neither flying nor reach and is blocking ${attacker.name}, which ` +
            `has flying. CR 509.1b forbids that block.`,
          blocker.instanceId
        );
      }
      if (kw(state, blocker, 'defender')) {
        // Defender may block; it may not attack. Checked on the attacker below.
      }
      if (blocker.tapped) {
        fail(
          'tapped-creature-is-blocking',
          `${blocker.name} is tapped and is blocking ${attacker.name}. CR 509.1a requires an ` +
            `untapped creature.`,
          blocker.instanceId
        );
      }
    }
    if (kw(state, attacker, 'defender')) {
      fail(
        'defender-is-attacking',
        `${attacker.name} has defender and is attacking. CR 702.3b forbids it.`,
        attacker.instanceId
      );
    }
  }

  /* --- CR 510.2 / 704.5g — lethal combat damage killed nobody --- */
  hits.push(...lethalCombatSurvivors(frame, base));

  return hits;
}

/**
 * A creature that took lethal combat damage and is still standing.
 *
 * WHY THIS EXISTS, WRITTEN DOWN SO IT IS NOT LOST
 * ----------------------------------------------
 * A mutation test broke CR 704.5g in `sba.ts` and the harness reported nothing:
 * every count was identical to the control, byte for byte. The reason is that
 * `sba.ts` never gets the chance — `combat.ts` decides its own deaths and emits
 * the `MOVE_ZONE` itself, and combat damage to a creature is never written to
 * `card.damage` at all (`DAMAGE_CARD` has zero producers in a real game). So
 * the existing "a creature with toughness 0 or less is still on the
 * battlefield" invariant cannot see a lethal-damage bug, and there was no
 * denominator on `creature-died` either. Breaking the real lethality check in
 * `combat.ts` dropped creature deaths by 97% and the report said only "A
 * creature went from the battlefield to a graveyard — 4", which nobody would
 * read as a defect.
 *
 * HOW IT IS CHECKED WITHOUT RE-IMPLEMENTING COMBAT
 * -----------------------------------------------
 * Only the case where damage assignment is forced: exactly one blocker. Then
 * the attacker deals all of its power to that blocker and the blocker deals all
 * of its power back, with no choice for either side to make. Checked on the
 * action that ENDS the combat damage step, reading the state as it was at the
 * end of that step, so every death that was going to happen has happened.
 *
 * Both creatures must still be on the battlefield. A blocker killed by first
 * strike is not on the battlefield, so its attacker surviving is correct and
 * the pair is skipped rather than reported.
 *
 * Everything that could legally save a creature is excluded rather than judged:
 * indestructible, any text mentioning protection or prevention, and an
 * unevaluated `*` toughness. Those exclusions are why this is allowed to be an
 * invariant instead of a count — what is left cannot legally be alive.
 */
function lethalCombatSurvivors(
  frame: Frame,
  base: Omit<InvariantHit, 'invariant' | 'message'>
): InvariantHit[] {
  const out: InvariantHit[] = [];
  const at = frame.before;
  if (at.step !== 'combat_damage' || frame.after.step === 'combat_damage') return out;
  if (frame.refused) return out;

  /** Anything whose own text could legally have stopped the damage. */
  const couldHaveBeenSaved = (card: CardInstance): boolean =>
    kw(at, card, 'indestructible') || /protection|prevent/i.test(card.oracleText ?? '');

  for (const declaration of at.combat.attackers) {
    if (declaration.blockedBy.length !== 1) continue;
    const attacker = at.cards[declaration.attackerId];
    const blocker = at.cards[declaration.blockedBy[0]];
    if (!attacker || !blocker) continue;
    if (attacker.zone !== 'battlefield' || blocker.zone !== 'battlefield') continue;
    if (!isCreatureCard(attacker) || !isCreatureCard(blocker)) continue;

    for (const [killer, victim] of [
      [attacker, blocker],
      [blocker, attacker],
    ] as const) {
      if (couldHaveBeenSaved(victim)) continue;
      const power = combatPowerIn(at, killer);
      const toughness = knownToughness(at, victim);
      if (toughness === null || toughness <= 0) continue;
      if (power < toughness) continue;
      out.push({
        ...base,
        invariant: 'lethal-combat-damage-survived',
        message:
          `${victim.name} (toughness ${toughness}) was the only creature in a combat lane with ` +
          `${killer.name} (power ${power}) and is still on the battlefield with the combat ` +
          `damage step over. One blocker means damage assignment was forced, so it took ${power} ` +
          `damage and CR 510.2 destroys it before the step ends. It has no indestructible, no ` +
          `protection and no prevention text, so nothing legal kept it alive.`,
        instanceId: victim.instanceId,
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Mana accounting                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Did the player pay for what they played?
 *
 * This engine has no mana pool. `moves.ts` plans a payment, taps the sources and
 * plays the card in one batch, so the only external check available is that the
 * number of sources tapped in the batch covers the card's mana value. It cannot
 * see colours being wrong, and it says so rather than pretending otherwise.
 *
 * A shortfall is real: a card that reached the battlefield with fewer sources
 * tapped than it costs was played for free.
 */
export interface ManaCheck {
  seed: number;
  at: number;
  turn: number;
  card: string;
  cmc: number;
  tapped: number;
  message: string;
}

export function checkManaPaid(
  frames: readonly { action: GameAction; before: GameState; at: number }[],
  seed: number
): ManaCheck[] {
  const out: ManaCheck[] = [];
  let tappedRun = 0;
  let runTurn = -1;

  for (const frame of frames) {
    const { action, before } = frame;
    if (action.type === 'TAP') {
      if (before.turn !== runTurn) {
        runTurn = before.turn;
        tappedRun = 0;
      }
      tappedRun += 1;
      continue;
    }
    if (action.type !== 'PLAY') {
      if (action.type === 'ADVANCE_STEP' || action.type === 'PASS_TURN') tappedRun = 0;
      continue;
    }
    const card = before.cards[action.instanceId];
    if (!card) continue;
    const line = (card.typeLine ?? '').toLowerCase();
    if (line.includes('land')) {
      tappedRun = 0;
      continue;
    }
    /*
     * Phyrexian mana is not a shortfall.
     *
     * {B/P} counts one towards mana value and can be paid with two life, so
     * Vault Skirge at mana value 2 is legitimately cast off one land. Both of
     * the only two "underpaid" cards the first full run produced were Phyrexian
     * — Vault Skirge and Cathedral Membrane — and reporting them would have been
     * the harness inventing a defect out of a rule it had not read.
     */
    const cost = card.manaCost ?? '';
    if (/\{[WUBRGC2]\/P\}/i.test(cost)) {
      tappedRun = 0;
      continue;
    }

    const cmc = card.cmc ?? 0;
    if (cmc > 0 && tappedRun < cmc) {
      out.push({
        seed,
        at: frame.at,
        turn: before.turn,
        card: card.name,
        cmc,
        tapped: tappedRun,
        message:
          `${card.name} costs ${cmc} and reached the battlefield after ${tappedRun} source` +
          `${tappedRun === 1 ? '' : 's'} were tapped in the same batch.`,
      });
    }
    tappedRun = 0;
  }

  return out;
}
