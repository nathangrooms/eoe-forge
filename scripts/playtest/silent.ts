/**
 * DeckMatrix playtest harness — the silent card detector.
 *
 * THE SIGNAL
 * ----------
 * A card whose oracle text promises an effect, which resolved, and which
 * produced no change in the game beyond moving zones, did nothing. Nobody was
 * told. That is the failure mode across the whole app, and naming those cards
 * ranked by how often a player actually meets them is what this file is for.
 *
 * THE HARD PART, AND IT IS THE ONLY PART THAT MATTERS
 * ---------------------------------------------------
 * Most quiet resolutions are correct. Getting this wrong in either direction
 * ruins the report:
 *
 *   Report too much and the list is noise, nobody reads it, and the real
 *   findings are buried under four hundred vanilla creatures.
 *   Report too little and the harness understates the problem, which is worse,
 *   because a harness is trusted.
 *
 * So every quiet resolution is put through a series of reasons it might be
 * RIGHT, and only what survives all of them is called silent:
 *
 *   1. The card has no rules text.                       Grizzly Bears.
 *   2. Its text is only keywords the engine enforces.    Flying, vigilance.
 *   3. Its text is only static.                          "Creatures you control get +1/+1"
 *      `layers.ts` computes continuous effects on READ and never writes them
 *      into state, so a working anthem produces a move-only difference. Calling
 *      that broken would be exactly backwards.
 *   4. Its text is only an activated ability.            "{T}: Add {G}."
 *      Nothing is meant to happen when it enters. Whether the ability can ever
 *      be activated is a coverage question, answered elsewhere.
 *   5. Its triggers are for another moment.              "Whenever this attacks…"
 *      A creature with an attack trigger is correct to be quiet on entry.
 *   6. Its trigger had an intervening "if" that was false at resolution.
 *      CR 603.4. Evaluated against the real state, not guessed.
 *   7. It needed a target and no legal target existed.   Lightning Bolt into an
 *      empty board. Checked against the real board, per target noun.
 *   8. It is a land, and the mana it makes is not a state change.
 *
 * What is left is a card that had something to do at that exact moment and did
 * not do it. Each one is then split by whether the player was TOLD, because
 * "the app cannot do this and says so" and "the app cannot do this and went
 * quiet" are different products.
 *
 * NOTHING HERE ASKS THE ENGINE WHETHER IT SUCCEEDED
 * -------------------------------------------------
 * `automationFor` is read, but only as a CLAIM to be checked against the diff,
 * never as evidence that anything happened. When the engine claims a trigger is
 * automated and the state did not move, that disagreement is the finding, and
 * it is the strongest kind in the report.
 */

import type { CardInstance, GameAction, GameEvent, GameState, PlayerId } from '../../src/lib/game/types.ts';
import { automationFor, parseIntervening } from '../../src/lib/game/effects.ts';
import {
  ADVISORY_KEYWORDS,
  ENGINE_KEYWORDS,
  effectiveKeywords,
  keywordSupport,
} from '../../src/lib/game/keywords.ts';
import { resolvesToGraveyard } from '../../src/lib/game/mana.ts';
import { abilitiesFor } from '../../src/lib/game/abilities/card-abilities.ts';
import { effectsOf, hasManualEffect } from '../../src/lib/cards/abilities/dsl.ts';
import type { StateDiff } from './fingerprint.ts';

/* -------------------------------------------------------------------------- */
/* Reading oracle text into clauses                                           */
/* -------------------------------------------------------------------------- */

export type ClauseKind =
  /** A keyword line the engine enforces in combat. */
  | 'engine-keyword'
  /** A keyword line the engine only badges. */
  | 'advisory-keyword'
  /** "{T}: Add {G}." Approximated by `mana.ts`, never a state change on entry. */
  | 'mana-ability'
  /** "{2}, {T}: draw a card." Nothing should happen until it is activated. */
  | 'activated'
  /** "Creatures you control get +1/+1." Computed on read by `layers.ts`. */
  | 'static'
  /** "When this creature enters, …" Due the moment it enters. */
  | 'etb-trigger'
  /** "Whenever this attacks, …" Due at some other moment. */
  | 'other-trigger'
  /** "This enters tapped." / "…enters with two +1/+1 counters." Due on entry. */
  | 'replacement'
  /** An instant or sorcery's body. Due the moment it resolves. */
  | 'spell-body'
  /** Reminder text, flavour, ability words. Carries no rules. */
  | 'noise';

export interface Clause {
  text: string;
  kind: ClauseKind;
  /** True when this clause was due at the moment being judged. */
  due: boolean;
}

/**
 * "When THIS enters", and nothing else.
 *
 * The distinction is the whole difference between a finding and a libel. Cloak
 * and Dagger reads "Whenever a Rogue creature enters, you may attach this
 * Equipment to it" — that trigger is not due when Cloak and Dagger itself
 * enters, it is due when some other creature does. A pattern loose enough to
 * match "a Rogue creature enters" reports the Equipment as broken on arrival,
 * which is wrong, and being wrong here is how a report stops being read.
 *
 * So the subject has to be the card itself: the `~` the engine normalises to,
 * modern "this creature" templating, or the card's own printed name, which is
 * what older oracle text uses.
 */
function selfPattern(cardName: string): string {
  const short = cardName.split(' //')[0].trim();
  const front = short.split(',')[0].trim();
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = [...new Set([short, front])].filter(Boolean).map(escape);
  return (
    `(?:~|this (?:creature|permanent|artifact|enchantment|land|vehicle|token|planeswalker|` +
    `equipment|aura|saga|battle|spell)` +
    (names.length > 0 ? `|${names.join('|')}` : '') +
    `)`
  );
}

function etbOpener(cardName: string): RegExp {
  return new RegExp(
    `^(?:when|whenever)\\s+${selfPattern(cardName)}\\s+enters(?:\\s+the\\s+battlefield)?[^,]{0,40},`,
    'i'
  );
}

const OTHER_TRIGGER_OPENER =
  /^(?:when|whenever|at the beginning of|at end of)\b/i;

/**
 * Continuous effects, which are correct to leave no trace.
 *
 * Deliberately narrow. A pattern that is too generous here hides a real finding,
 * so anything not obviously continuous falls through to being judged.
 */
const STATIC_PATTERNS: readonly RegExp[] = [
  /\b(?:creatures?|permanents?|artifacts?|enchantments?|lands?|players?|opponents?)\b[^.]*\bget[s]?\s+[+-]/i,
  /\bother\b[^.]*\byou control\b[^.]*\b(?:get|have|has)\b/i,
  /\bas long as\b/i,
  /\bcan'?t\b/i,
  /\bcost[s]?\s+\{?\d?\}?\s*(?:less|more)\b/i,
  /\byou control\b[^.]*\bhave\b\s+\w+/i,
  /\bhas\s+(?:flying|trample|vigilance|haste|lifelink|deathtouch|reach|menace|first strike|hexproof|indestructible)\b/i,
  /\bskip your\b/i,
  /\bplay with the top card\b/i,
  /\byou may cast\b/i,
  /\benchant\b/i,
  /\bequip\b/i,
  /\bwhere x is\b/i,
  /^\s*(?:flash|defender|devoid|changeling)\s*$/i,
];

const REPLACEMENT_PATTERNS: readonly RegExp[] = [
  /\benters (?:the battlefield )?tapped\b/i,
  /\benters (?:the battlefield )?with\b/i,
  /\bif .*would .*instead\b/i,
  /\benters (?:the battlefield )?(?:as|under)\b/i,
];

/**
 * Openers that mean the clause is about OTHER permanents, not this one.
 *
 * Giada, Font of Hope reads "Each other Angel you control enters with an
 * additional +1/+1 counter on it". That is a replacement effect which applies to
 * the next Angel, and it is not due when Giada arrives. A pattern that only
 * looks for the words "enters with" reads it as Giada's own arrival and reports
 * a card that is working as a card that is broken.
 */
const OTHER_SUBJECT =
  /^(?:each|every|another|other|all|creatures?|permanents?|artifacts?|enchantments?|lands?|tokens?|players?|opponents?|whenever|when a |when an |if a |if an )\b/i;

/** A replacement clause about this card arriving, rather than about somebody else's. */
function replacementIsAboutSelf(line: string, cardName: string): boolean {
  const trimmed = line.trim();
  if (OTHER_SUBJECT.test(trimmed)) return false;
  return new RegExp(`^(?:if\\s+)?${selfPattern(cardName)}\\b`, 'i').test(trimmed);
}

const NOISE_PATTERNS: readonly RegExp[] = [
  /^\(.*\)$/,
  /^\s*$/,
  // Bare ability words with no rules attached, e.g. "Landfall —" left alone.
  /^[A-Z][a-z]+\s+—\s*$/,
];

function isEngineKeywordLine(line: string): boolean {
  const parts = line
    .split(/[,;]/)
    .map(p => p.trim().toLowerCase().replace(/\s*\{[^}]*\}\s*$/, '').trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => keywordSupport(part) === 'engine');
}

/**
 * Every keyword the engine has heard of, engine-enforced or advisory.
 *
 * `keywordSupport` cannot be used to ask "is this a keyword at all": it returns
 * 'advisory' for anything it does not recognise, which is the honest answer to
 * the question it is actually asked ("will the engine enforce this") and the
 * wrong answer to this one. Using it here would classify "Destroy target
 * creature." as a keyword line and quietly excuse the most important findings
 * in the report.
 */
const KNOWN_KEYWORDS = new Set<string>([
  ...ENGINE_KEYWORDS.map(k => k.toLowerCase()),
  ...ADVISORY_KEYWORDS.map(k => k.toLowerCase()),
]);

function isAnyKeywordLine(line: string): boolean {
  const parts = line
    .split(/[,;]/)
    .map(p => p.trim().toLowerCase().replace(/\s*\{[^}]*\}\s*$/, '').replace(/\s+\d+$/, '').trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => KNOWN_KEYWORDS.has(part) || part.startsWith('protection from'));
}

/**
 * Split a card's text into clauses and say what each one is.
 *
 * `moment` is what is being judged: a permanent arriving on the battlefield, or
 * an instant or sorcery resolving. It decides which clauses were DUE, which is
 * the whole difference between a finding and a correct silence.
 */
export function readClauses(
  oracleText: string,
  moment: 'enters' | 'spell-resolves',
  cardName: string
): Clause[] {
  const out: Clause[] = [];
  const ETB_OPENER = etbOpener(cardName);
  for (const raw of oracleText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (NOISE_PATTERNS.some(re => re.test(line))) {
      out.push({ text: line, kind: 'noise', due: false });
      continue;
    }

    // Reminder text in brackets never carries rules of its own, and an ability
    // word ("Heroic —", "Landfall —") is flavour with no rules meaning at all.
    // Leaving the prefix on hides the real opener behind it, so "Landfall —
    // Whenever a land enters" would be read as a static line instead of a
    // trigger.
    const stripped = line
      .replace(/\([^)]*\)/g, '')
      .replace(/^[A-Z][A-Za-z'’\- ]{2,28}\s*[—–-]\s+/, '')
      .trim();
    if (!stripped) {
      out.push({ text: line, kind: 'noise', due: false });
      continue;
    }

    let kind: ClauseKind;
    if (isEngineKeywordLine(stripped)) kind = 'engine-keyword';
    else if (isAnyKeywordLine(stripped)) kind = 'advisory-keyword';
    else if (/:\s*add\b/i.test(stripped)) kind = 'mana-ability';
    else if (ETB_OPENER.test(stripped)) kind = 'etb-trigger';
    else if (OTHER_TRIGGER_OPENER.test(stripped)) kind = 'other-trigger';
    else if (
      REPLACEMENT_PATTERNS.some(re => re.test(stripped)) &&
      replacementIsAboutSelf(stripped, cardName)
    ) {
      kind = 'replacement';
    } else if (REPLACEMENT_PATTERNS.some(re => re.test(stripped))) kind = 'static';
    else if (/^[^:\n]{1,60}:\s/.test(stripped)) kind = 'activated';
    else if (STATIC_PATTERNS.some(re => re.test(stripped))) kind = 'static';
    else if (moment === 'spell-resolves') kind = 'spell-body';
    else kind = 'static';

    const due =
      moment === 'spell-resolves'
        ? kind === 'spell-body' || kind === 'etb-trigger'
        : kind === 'etb-trigger' || kind === 'replacement';

    out.push({ text: line, kind, due });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Was there anything to target?                                              */
/* -------------------------------------------------------------------------- */

/**
 * A spell that needed a target and had none does nothing, correctly. CR 601.2c
 * will not even let it be cast.
 *
 * This is checked against the real board rather than assumed, because assuming
 * it is how a harness quietly excuses every removal spell in the game. Only the
 * target nouns that can be answered honestly are handled; anything else returns
 * `unknown`, and an unknown never excuses a finding, it only lowers its
 * confidence.
 */
export type TargetVerdict = 'had-a-target' | 'no-legal-target' | 'no-target-needed' | 'unknown';

const TARGET_NOUNS: ReadonlyArray<{ re: RegExp; test: (state: GameState, controller: PlayerId) => boolean }> = [
  {
    re: /\btarget (?:attacking |blocking |tapped |untapped )?creature\b(?! you control)/i,
    test: state => Object.values(state.cards).some(c => onBattlefieldCreature(c)),
  },
  {
    re: /\btarget creature you control\b/i,
    test: (state, controller) =>
      Object.values(state.cards).some(c => onBattlefieldCreature(c) && c.controllerId === controller),
  },
  {
    re: /\btarget creature an opponent controls\b/i,
    test: (state, controller) =>
      Object.values(state.cards).some(c => onBattlefieldCreature(c) && c.controllerId !== controller),
  },
  {
    re: /\btarget (?:player|opponent)\b/i,
    test: state => state.players.some(p => !p.hasLost && !p.conceded),
  },
  {
    re: /\btarget artifact\b/i,
    test: state => Object.values(state.cards).some(c => onBattlefieldType(c, 'artifact')),
  },
  {
    re: /\btarget enchantment\b/i,
    test: state => Object.values(state.cards).some(c => onBattlefieldType(c, 'enchantment')),
  },
  {
    re: /\btarget land\b/i,
    test: state => Object.values(state.cards).some(c => onBattlefieldType(c, 'land')),
  },
  {
    re: /\btarget planeswalker\b/i,
    test: state => Object.values(state.cards).some(c => onBattlefieldType(c, 'planeswalker')),
  },
  {
    re: /\btarget permanent\b/i,
    test: state => Object.values(state.cards).some(c => c.zone === 'battlefield'),
  },
];

function onBattlefieldCreature(card: CardInstance): boolean {
  return card.zone === 'battlefield' && (card.typeLine ?? '').toLowerCase().includes('creature');
}

function onBattlefieldType(card: CardInstance, word: string): boolean {
  return card.zone === 'battlefield' && (card.typeLine ?? '').toLowerCase().includes(word);
}

export function targetVerdict(
  text: string,
  state: GameState,
  controller: PlayerId
): TargetVerdict {
  if (!/\btargets?\b/i.test(text)) return 'no-target-needed';

  /*
   * "up to X target creatures" on a permanent's own enters trigger.
   *
   * X is only defined by something that set it, and nothing sets X for a
   * trigger with no cost to pay, so X is zero (CR 107.3b). Exiling zero
   * creatures is then the only legal resolution and the state not moving is
   * correct. Extraordinary Journey was reported as a silent card twice for
   * exactly this. "up to two" and "up to three" are left alone: a stated number
   * is a real chance the card had and did not take.
   */
  if (/\bup to X\b/i.test(text)) return 'no-legal-target';

  /*
   * A target in a graveyard, which the board-reading nouns below cannot see —
   * they all test the battlefield.
   *
   * Dire Fleet Daredevil wants an instant or sorcery in an opponent's
   * graveyard. The bots cast almost no instants and no sorceries, so opponent
   * graveyards essentially never hold one, and doing nothing was correct on the
   * one resolution in the corpus. Reported as a broken card before this.
   */
  const inYard = /\btarget ([a-z ]{0,44}?)cards? (?:in|from) (?:an? |your |each |their )?(?:opponent'?s?|player'?s?)? ?graveyard/i.exec(
    text
  );
  if (inYard) {
    const words = inYard[1]
      .toLowerCase()
      .split(/\s+or\s+|\s+/)
      .map(word => word.trim())
      .filter(word => word.length > 2 && word !== 'and');
    if (words.length > 0) {
      const found = Object.values(state.cards).some(card => {
        if (card.zone !== 'graveyard') return false;
        const line = (card.typeLine ?? '').toLowerCase();
        return words.some(word => line.includes(word));
      });
      if (!found) return 'no-legal-target';
      return 'had-a-target';
    }
  }

  let matched = false;
  for (const noun of TARGET_NOUNS) {
    if (!noun.re.test(text)) continue;
    matched = true;
    if (noun.test(state, controller)) return 'had-a-target';
  }
  return matched ? 'no-legal-target' : 'unknown';
}

/* -------------------------------------------------------------------------- */
/* "unless" — the escape clause on the end of a sentence                      */
/* -------------------------------------------------------------------------- */

/**
 * Words that can appear in "you control a <thing>" and be answered from the
 * board. A phrase with any word outside this set is `unknown` rather than
 * guessed at, because a wrong answer here either invents a defect or hides one.
 */
const COUNTABLE_WORDS = new Set([
  'basic', 'land', 'lands', 'creature', 'creatures', 'artifact', 'artifacts',
  'enchantment', 'enchantments', 'planeswalker', 'planeswalkers',
  'plains', 'island', 'swamp', 'mountain', 'forest',
]);

const QUANTITY: Readonly<Record<string, number>> = {
  a: 1, an: 1, another: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Was the escape clause on the end of a sentence satisfied?
 *
 * WHY THIS EXISTS
 * ---------------
 * "This land enters tapped unless you control a basic land" is a card that does
 * nothing at all when you control a basic land, and doing nothing is then the
 * only correct outcome. Twenty silent verdicts were read by hand against the
 * board state they came from and four of them were this: Abandoned Air Temple
 * with two basics out, Smoldering Marsh with three. Both were reported as
 * cards that did not work. Both worked.
 *
 * `interveningHolds` could not see them because it only matches a leading
 * `if …,` and returns `true` for everything else, so an "unless" was treated as
 * an unconditional promise. `parseIntervening` in the engine cannot help here
 * either: its pattern takes a single word after the quantity, so "a basic land"
 * and "two or more basic lands" both fall through to unknown.
 *
 * Returns `true` when the escape applied and the card was right to do nothing,
 * `false` when the condition was not met and the text really was due, and
 * `'unknown'` for any phrasing outside the closed set above — which reports the
 * card, at lower confidence, rather than excusing it.
 */
export function unlessEscapes(
  clause: string,
  state: GameState,
  controller: PlayerId
): boolean | 'unknown' {
  const match = /\bunless ([^.;]+)/i.exec(clause);
  if (!match) return false;

  const condition = match[1].toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
  const parsed =
    /^(you|your opponents|an opponent|each opponent) controls? ([a-z0-9]+)(?: or more)? (.+)$/.exec(
      condition
    );
  if (!parsed) return 'unknown';

  const [, who, quantityWord, nounPhrase] = parsed;
  const atLeast = QUANTITY[quantityWord] ?? (/^\d+$/.test(quantityWord) ? Number(quantityWord) : null);
  if (atLeast === null) return 'unknown';

  // "Mount or Vehicle" is an any-of. Each alternative is its own word list, and
  // every word in it has to be one this can actually answer.
  const alternatives = nounPhrase.split(/\s+or\s+/).map(part =>
    part
      .replace(/\bcards?\b/g, '')
      .split(/\s+/)
      .filter(Boolean)
  );
  for (const words of alternatives) {
    if (words.length === 0) return 'unknown';
    for (const word of words) if (!COUNTABLE_WORDS.has(word)) return 'unknown';
  }

  const singular = (word: string): string => (word.endsWith('s') ? word.slice(0, -1) : word);
  const mine = who === 'you';
  const count = Object.values(state.cards).filter(card => {
    if (card.zone !== 'battlefield') return false;
    if (mine ? card.controllerId !== controller : card.controllerId === controller) return false;
    const line = (card.typeLine ?? '').toLowerCase();
    return alternatives.some(words => words.every(word => line.includes(singular(word))));
  }).length;

  return count >= atLeast;
}

/* -------------------------------------------------------------------------- */
/* CR 603.4 intervening "if"                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Was the condition on the front of a trigger true when it would have resolved?
 *
 * Only the closed set `effects.ts` itself can classify is evaluated. Anything
 * else is `unknown`, and an unknown does not excuse a silent card — it lowers
 * the confidence on the finding and says so in the report.
 */
export function interveningHolds(
  clause: string,
  state: GameState,
  controller: PlayerId
): boolean | 'unknown' {
  const match = /^if ([^,]+),/i.exec(clause.trim());
  if (!match) return true;
  const condition = parseIntervening(match[1].toLowerCase().replace(/['’]/g, ''));
  const player = state.players.find(p => p.id === controller);
  if (!player) return 'unknown';

  switch (condition.kind) {
    case 'life-at-least':
      return player.life >= condition.amount;
    case 'life-at-most':
      return player.life <= condition.amount;
    case 'your-turn':
      return state.activePlayerId === controller;
    case 'controls': {
      const count = Object.values(state.cards).filter(
        c =>
          c.zone === 'battlefield' &&
          c.controllerId === controller &&
          (c.typeLine ?? '').toLowerCase().includes(condition.typeWord)
      ).length;
      return count >= condition.atLeast;
    }
    default:
      return 'unknown';
  }
}

/* -------------------------------------------------------------------------- */
/* Did the resolution change anything?                                        */
/* -------------------------------------------------------------------------- */

/** Card fields the engine writes as a mechanical consequence of ANY zone change. */
const MECHANICAL_FIELDS = new Set([
  'zone',
  'zoneChangeCounter',
  'summoningSick',
  'damage',
  'damagedByDeathtouch',
  'manualResolved',
  'controllerId',
  // Commander tax bookkeeping. Bumped by the act of casting, not by the card.
  'castCount',
]);

/**
 * Player fields the engine writes because a card was played, whatever card it
 * was. None of them is the card's text taking effect.
 *
 * Missing these was hiding real findings rather than inventing them, which is
 * the worse direction. Every land bumps `landsPlayedThisTurn`, so before this
 * list existed a land whose text says "When this enters, you gain 1 life" was
 * credited with having done something the moment it hit the battlefield, and
 * dropped off the silent list. The same for every commander cast, via
 * `castCount`.
 */
const BOOKKEEPING_PATHS: readonly RegExp[] = [
  /^players\.[^.]+\.landsPlayedThisTurn$/,
  /^players\.[^.]+\.commanders\[\d+\]\.castCount$/,
];

export interface Footprint {
  /** Everything the resolution did, beyond relocating the card itself. */
  effects: string[];
  /** True when the answer is "nothing at all". */
  quiet: boolean;
}

/**
 * What one resolution actually did, in plain terms.
 *
 * Reads the structured difference rather than the log, because the log is the
 * engine describing itself and the difference is what a player would see on the
 * table. A log line with no matching difference is a card that announced
 * something it did not do, and that shows up here as `quiet` with a note in the
 * report.
 */
export function footprintOf(
  diff: StateDiff,
  selfInstanceId: string,
  logAdded: readonly GameEvent[] = [],
  options: { name?: string; applied?: readonly GameAction[] } = {}
): Footprint {
  const effects: string[] = [];

  /*
   * COUNTERING IS THE ONE EFFECT WITH NO FOOTPRINT ON THE BOARD.
   *
   * Countering an ability takes an object off the stack and moves no card at
   * all: there is no card behind an activated ability. Countering a spell moves
   * one card from the stack to a graveyard, and the block below ignores the
   * whole `stack` path because a resolution always disturbs it. Between them,
   * a counterspell that did exactly what it says came out as "resolved and
   * changed nothing", which filed Essence Capture and Quench under
   * `silent-untold` in a run where both worked. That row means "did nothing and
   * told nobody", and it is the row this project holds at zero, so putting two
   * working cards in it is not a small mistake.
   *
   * `reason` on a `COUNTER_SPELL` is the name of the object that countered,
   * set by `actionsForEffect` in `stack.ts`, so this is the card's own name
   * coming back off the action the engine ran.
   */
  for (const action of options.applied ?? []) {
    if (action.type !== 'COUNTER_SPELL') continue;
    if (options.name && action.reason !== options.name) continue;
    effects.push(`countered ${action.reason ?? 'a spell'}`);
  }

  /*
   * State-based actions run inside the same `applyAction` call, so a creature
   * that entered and a creature the rules then put into a graveyard are one
   * difference. Crediting the arriving card with the death would hide a silent
   * card behind an unrelated event, so a graveyard move that coincides with a
   * state-based action is not counted as this card's doing.
   */
  const sbaFired = logAdded.some(entry => entry.type === 'STATE_BASED_ACTION');

  if (diff.added.length > 0) effects.push(`${diff.added.length} new card(s) appeared`);
  if (diff.removed.length > 0) effects.push(`${diff.removed.length} card(s) ceased to exist`);

  for (const move of diff.zoneMoves) {
    if (move.instanceId === selfInstanceId) continue;
    if (sbaFired && (move.to === 'graveyard' || move.to === 'exile')) continue;
    effects.push(`${move.name} moved ${move.from} to ${move.to}`);
  }

  for (const change of diff.changes) {
    const { path } = change;

    // Player zone lists mirror the card zone fields; they are not a second event.
    if (/^players\.[^.]+\.zones\./.test(path)) continue;

    if (path.startsWith('cards.')) {
      const rest = path.slice('cards.'.length);
      const dot = rest.indexOf('.');
      const instanceId = dot === -1 ? rest : rest.slice(0, dot);
      const field = path.slice(path.lastIndexOf('.') + 1);
      if (MECHANICAL_FIELDS.has(field)) continue;
      if (instanceId === selfInstanceId) {
        // The card's own tapped state and counters ARE its text working:
        // "enters tapped", "enters with two +1/+1 counters", a planeswalker's
        // starting loyalty. Those count.
        effects.push(`its own ${field} changed`);
      } else {
        effects.push(`another card's ${field} changed`);
      }
      continue;
    }

    if (path.startsWith('players.')) {
      if (BOOKKEEPING_PATHS.some(re => re.test(path))) continue;
      effects.push(`${path} changed`);
      continue;
    }
    if (path.startsWith('combat')) {
      effects.push('combat changed');
      continue;
    }
    if (path === 'step' || path === 'turn' || path === 'round' || path === 'priorityPlayerId') {
      // Turn structure is not the card's doing.
      continue;
    }

    /*
     * THE PRIORITY ROUND IS NOT THE CARD'S DOING EITHER, and this is the line
     * that stops a harness repair from turning into a flattering lie.
     *
     * A spell cast through the stack resolves inside the `PASS_PRIORITY` that
     * completed the round, so the state difference for that one action ALWAYS
     * carries `stack` shrinking and `passedPriority` being cleared, whatever
     * the card was. Without this, every card that resolved would have a
     * non-empty footprint, `quiet` would be false for all of them, and every
     * one would be filed as `acted`.
     *
     * Measured on seed 9000 before the fix: 42 resolutions in that one game,
     * every single one credited with "stack changed" and "passedPriority
     * changed" and nothing else. Across the twenty games it moved `acted` from
     * 185 to 942 and `correctly-quiet` from 1,141 to 482, with no engine change
     * behind any of it. A false zero sends somebody to fix working code; a
     * false success like that one stops anybody looking at all, which is worse,
     * and it is the direction this project has overstated itself in before.
     *
     * `pendingTriggers` and `timedEffects` are deliberately NOT here. A card
     * that queued a trigger or registered a continuous effect did something,
     * and those are the difference that says so.
     */
    if (path === 'stack' || path.startsWith('stack.') || path.startsWith('stack[')) continue;
    if (path === 'passedPriority' || path.startsWith('passedPriority')) continue;
    if (path === 'nextStackId') continue;

    effects.push(`${path} changed`);
  }

  return { effects, quiet: effects.length === 0 };
}

/**
 * A creature whose printed body is zero toughness and whose text says it enters
 * with counters.
 *
 * Modular, graft and every "enters with X +1/+1 counters" creature is printed
 * 0/0. If the counters do not arrive it is a 0/0 and CR 704.5f is correct to
 * bin it immediately. Naming the cause matters: "was in the graveyard by the
 * time the action finished" tells a reader nothing they can act on, and
 * "counters that never arrive" tells them exactly which code is missing.
 */
function zeroToughnessOnArrival(card: CardInstance): boolean {
  const toughness = Number(card.toughness);
  if (!Number.isFinite(toughness) || toughness > 0) return false;
  return /\benters .{0,40}\bwith\b.{0,40}counter|\b(?:modular|graft|reinforce)\b/i.test(
    card.oracleText ?? ''
  );
}

/* -------------------------------------------------------------------------- */
/* Drawbacks — the silence that is not harmless                               */
/* -------------------------------------------------------------------------- */

/**
 * NOT ALL SILENCE IS THE SAME, AND TREATING IT AS THE SAME IS THE BUG
 * -------------------------------------------------------------------
 * Everything above this block asks one question: did the card do what it
 * promised? A card that promised a benefit and delivered nothing is a wasted
 * card. The player loses a draw, notices, shrugs, plays on. It is a defect and
 * it is survivable.
 *
 * A card that promised a PENALTY and delivered nothing is a different animal
 * entirely, because the printed numbers on it were chosen with the penalty in
 * place. Death's Shadow is printed 13/13 and costs one black mana. Its whole
 * price is the line "This creature gets -X/-X, where X is your life total" —
 * at a starting 20 life that is a -7/-7 which dies the instant it arrives. Drop
 * the line and you have not got a slightly worse Death's Shadow. You have a
 * one-mana 13/13, which is not a card, and the owner watched it win a game on
 * turn three.
 *
 * So the two failures are not neighbours on a list. One costs a player a card;
 * the other hands them a card nobody balanced, in a game the other seat cannot
 * win. This block is what separates them.
 *
 * ONLY THE STRONGER DIRECTION COUNTS
 * ----------------------------------
 * Text that goes missing can make a card weaker too — a `*`/`*` body that never
 * gets defined arrives as a 0/0 and dies. That is already reported, as
 * `dead-on-arrival`, and it is loud rather than quiet: the card visibly is not
 * there. Every pattern below is one where the missing text makes the permanent
 * play STRONGER than it is printed, because that is the failure a player cannot
 * see and the opponent cannot answer.
 *
 * A PATTERN IS NOT A FINDING
 * --------------------------
 * Matching the text is the cheap half and on its own it would be a libel: the
 * engine really does implement some of these. A drawback is only reported when
 * the compiler ALSO refused the clause carrying it, or compiled it to a
 * "resolve by hand" marker. Both of those are the engine's own admission, read
 * from `abilitiesFor`, not a guess made here.
 */
export type DrawbackEvidence =
  /** The compiler could not read the clause at all. Nothing can apply it. */
  | 'unparsed'
  /** It compiled, to a marker that says a human has to do it. */
  | 'manual';

export interface DrawbackFinding {
  /** Short bucket name, so a report can group these rather than list them. */
  label: string;
  /** The line of oracle text that carries it. */
  clause: string;
  evidence: DrawbackEvidence;
}

/**
 * Drawback shapes, each one written so a MISSING implementation makes the
 * permanent stronger than printed.
 *
 * Deliberately narrower than `scratch/drawback-scan.mjs`, which counted any of
 * nine patterns anywhere in the text and reported 2,608 permanents. That number
 * is the right size for a survey and the wrong size for a worklist: it counts
 * "power and toughness are each equal to" (missing that makes a card weaker,
 * not stronger) and it counts a restriction printed on an OPPONENT's creatures
 * as though it were the card's own cost.
 */
const DRAWBACK_PATTERNS: ReadonlyArray<{
  label: string;
  re: RegExp;
  /**
   * Must the clause's subject be this card?
   *
   * The difference between a drawback and a removal spell. "This creature
   * can't block" is a price Mogg Flunkies pays; "target creature can't block
   * this turn" is Goblin Shortcutter doing that TO somebody, and if the engine
   * drops it the card is weaker, not stronger. Same six words either way, so
   * the subject is the only thing that separates them.
   *
   * `false` is for clauses whose subject is "you" — the controller — which is
   * already the card's own side by construction.
   */
  self: boolean;
}> = [
  { label: 'gets -X/-X or -N/-N', re: /\bgets? -(?:x|\d+)\/-(?:x|\d+)/i, self: true },
  { label: 'enters tapped', re: /\benters (?:the battlefield )?tapped\b/i, self: true },
  { label: 'enters with -1/-1 counters', re: /\benters\b[^.]{0,60}\bwith\b[^.]{0,30}-1\/-1 counter/i, self: true },
  { label: 'does not untap', re: /\bdoesn'?t untap during\b/i, self: true },
  { label: 'delayed sacrifice', re: /\bsacrifice (?:it|this|~)\b[^.]{0,60}\b(?:at the beginning|unless|if)\b/i, self: true },
  { label: 'must attack', re: /\battacks? each combat if able\b/i, self: true },
  { label: 'cannot block', re: /\bcan'?t block\b/i, self: true },
  { label: 'cannot attack', re: /\bcan'?t attack\b/i, self: true },
  { label: 'upkeep cost', re: /^at the beginning of (?:your|each) upkeep, (?:you lose|sacrifice|pay|this)/i, self: false },
  { label: 'cumulative upkeep', re: /\bcumulative upkeep\b/i, self: false },
  { label: 'echo', re: /^echo\b/i, self: false },
  { label: 'hurts its controller', re: /\bdeals \d+ damage to you\b|\byou lose \d+ life\b/i, self: false },
  { label: 'restricts what you may cast', re: /\byou can'?t (?:cast|play)\b/i, self: false },
  { label: 'skips a step', re: /\bskip your\b/i, self: false },
];

/**
 * Things a clause does FOR the player who controls the card.
 *
 * A clause that carries both a cost and a benefit does not net out to
 * "stronger when ignored", and guessing which half is bigger is not something
 * this file is in a position to do. Frightcrawler's threshold line is "gets
 * +2/+2 and can't block" — drop it and the creature is smaller, not freer.
 * Dreadhorde Invasion's upkeep is "you lose 1 life AND amass Zombies 1" and
 * losing both is a worse deal for its controller, not a better one.
 *
 * So a mixed clause is dropped. That understates the count, which is the
 * direction to be wrong in: a report nobody trusts is worth nothing, and every
 * row on this list is an accusation that a card is unfairly strong.
 */
const BENEFIT_IN_THE_SAME_CLAUSE =
  /\bgets? \+\d|\bdraws?\b|\bcreates?\b|\bamass\b|\byou gain \w+ life\b|\bput a \+1\/\+1 counter\b|\bsearch your library\b|\b(?:scr(?:y|ies)|surveils?|explores?|connives?|endures?|incubates?|proliferates?|adapts?)\b|\bonto the battlefield\b|\breturn\b[^.]*\bto (?:your hand|the battlefield)\b|\bgains? control\b/i;

/**
 * The drawbacks on this card that nothing in the engine can apply.
 *
 * A clause is matched to the compiler's verdict by TEXT, because that is the
 * only key both sides share: `unparsed` carries the clause as it was written,
 * every compiled `Ability` carries the clause it came from in `text`, and the
 * oracle text is split on the same newlines the compiler splits on.
 *
 * Three ways a matched clause produces NO finding, and all three are the
 * engine's own answer rather than a judgement made here:
 *
 *   - the compiler turned it into a real ability. The engine owns it. This is
 *     why implementing "enters tapped" took every plain dual off the list
 *     without anyone editing the patterns above;
 *   - the clause also does something good for its controller, so ignoring it
 *     is not a straight upgrade;
 *   - it names somebody else's permanent, so ignoring it costs its controller
 *     an effect rather than handing them one.
 */
export function inertDrawbacks(card: CardInstance): DrawbackFinding[] {
  const text = card.oracleText ?? '';
  if (!text.trim()) return [];

  const record = abilitiesFor(card);
  const refused = record.unparsed.map(u => u.text.trim()).filter(Boolean);
  // The escapes are doubled because this is a template literal before it is a
  // regex. A single backslash-b inside a JS string is a backspace character,
  // and the pattern then matches nothing at all, silently, which is how every
  // self-subject drawback quietly disappeared from the report once.
  const isSelf = new RegExp(`^(?:if\\s+)?${selfPattern(card.name)}\\b`, 'i');

  const out: DrawbackFinding[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\([^)]*\)/g, '').trim();
    if (!line) continue;
    if (BENEFIT_IN_THE_SAME_CLAUSE.test(line)) continue;

    for (const { label, re, self } of DRAWBACK_PATTERNS) {
      if (!re.test(line)) continue;
      if (self && !isSelf.test(line)) break;

      const overlaps = (other: string): boolean => other.includes(line) || line.includes(other);
      if (refused.some(overlaps)) {
        out.push({ label, clause: line, evidence: 'unparsed' });
        break;
      }

      // It compiled. Did it compile to a marker that says a human has to do it?
      // Asked per clause, against the ability that came from THIS line, rather
      // than "is anything on the card manual" — Feldon can't block, and one of
      // his other abilities is manual, and the coarse question said the
      // restriction was unimplemented when the compiler had read it fine.
      const own = record.abilities.find(ability => overlaps(ability.text ?? ''));
      if (own && hasManualEffect(effectsOf(own))) {
        out.push({ label, clause: line, evidence: 'manual' });
      }
      break;
    }
  }
  return out;
}

/**
 * The drawbacks still standing once the BOARD has had its say.
 *
 * `inertDrawbacks` reads text and the compiler. Neither can see the game, and
 * two things that only the game knows will otherwise turn this list into a
 * libel:
 *
 *   1. **The escape clause was met.** "This land enters tapped unless you
 *      control a Forest or a Plains", played with a Forest already out, is a
 *      land that is CORRECT to arrive untapped. Four of twenty hand-checked
 *      verdicts were this exact shape once before, which is why
 *      `unlessEscapes` exists; it is reused here rather than reinvented.
 *   2. **It actually happened.** The strongest evidence available is the state
 *      difference the harness already measured. If the permanent's own tapped
 *      flag moved, "enters tapped" applied, whatever the compiler managed to
 *      read, and there is nothing to report.
 *
 * Both gates only ever REMOVE a finding. Neither can invent one, so being
 * wrong about either understates the problem rather than accusing a working
 * card, which is the direction this file already leans everywhere else.
 */
export function drawbacksAfterBoard(
  drawbacks: readonly DrawbackFinding[],
  before: GameState,
  controller: PlayerId,
  footprint: Footprint
): DrawbackFinding[] {
  const tappedItself = footprint.effects.some(effect => effect === 'its own tapped changed');

  return drawbacks.filter(finding => {
    if (finding.label === 'enters tapped' && tappedItself) return false;
    if (/\bunless\b/i.test(finding.clause)) {
      // `true` means the escape applied, so the card was right to do nothing.
      // `'unknown'` keeps the finding: an unreadable condition is not proof the
      // drawback was paid.
      if (unlessEscapes(finding.clause, before, controller) === true) return false;
    }
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* The verdict                                                                */
/* -------------------------------------------------------------------------- */

export type Verdict =
  /**
   * A permanent was played to the battlefield and was not there afterwards.
   *
   * Found by reading the classifier audit rather than by predicting it: an Aura
   * enters unattached, CR 704.5m is correctly applied, and it is in the
   * graveyard before the player has finished letting go of the card. The rules
   * are right and the card is unplayable, which is a worse finding than a
   * trigger that did not fire.
   */
  | 'dead-on-arrival'
  /** The card did something. Nothing to report. */
  | 'acted'
  /** Correct silence. Vanilla, keywords, static, activated, another timing. */
  | 'correctly-quiet'
  /** Correct silence for a reason that depended on the board. No target, false condition. */
  | 'correctly-quiet-conditional'
  /**
   * The card carries a DRAWBACK that nothing in the engine can apply, so it
   * plays stronger than it is printed.
   *
   * Ranked above every other silence on purpose. A benefit that goes missing
   * costs the player a card. A penalty that goes missing hands them a card
   * whose printed body was priced around the penalty, and the other seat has no
   * answer to a card that was never supposed to exist.
   */
  | 'silent-drawback'
  /** Text was due, nothing happened, and the engine never said so. */
  | 'silent-untold'
  /** Text was due, nothing happened, and a "resolve by hand" marker is on the permanent. */
  | 'silent-marked'
  /** Text was due, nothing happened, and the log carries a note about it. */
  | 'silent-noted'
  /** Oracle text was never loaded, so the card cannot work and nothing knows why. */
  | 'text-not-loaded';

/**
 * How much this row matters, kept separate from `verdict` because they answer
 * different questions.
 *
 * `verdict` says WHAT happened. `severity` says how much it costs, and the
 * whole point of having both is that a removal spell which correctly fizzled
 * and a one-mana 13/13 are not two entries on one list. Before this existed
 * they were.
 *
 *   `high`   — the card plays stronger than it is printed. Somebody is winning
 *              games with a card that has had its price deleted.
 *   `normal` — the card promised something and did not deliver it. A wasted
 *              card, and a real defect.
 *   `none`   — working, or correctly quiet. Not a finding.
 */
export type Severity = 'high' | 'normal' | 'none';

export interface CardVerdict {
  verdict: Verdict;
  /** How much this costs. See `Severity`; `high` means it plays too strong. */
  severity: Severity;
  /** Drawbacks on this card that nothing in the engine can apply. */
  drawbacks: DrawbackFinding[];
  /**
   * Printed power/toughness, or `undefined` for a card with no P/T box.
   *
   * Carried because a drawback finding is unreadable without it: "Death's
   * Shadow carries a drawback nothing applies" is a shrug, and "Death's Shadow
   * is a 13/13 for one mana and carries a drawback nothing applies" is the
   * whole report.
   */
  printedBody?: string;
  /** One sentence a reader can act on. */
  why: string;
  /** 'certain' survives every exclusion. 'likely' had an unevaluable condition in it. */
  confidence: 'certain' | 'likely';
  cardName: string;
  /** The engine's own claim about this card, checked and not trusted. */
  engineLevel: string;
  /** The clauses that were due at this moment and produced nothing. */
  dueText: string[];
  /** A coarse bucket, so the report can group four hundred cards into ten mechanics. */
  mechanic: string;
  moment: 'enters' | 'spell-resolves';
  /** Whether the resolution touched the game at all. */
  footprint: string[];
}

/** Buckets, longest and most specific first. */
const MECHANIC_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ['create a token', /\bcreate\b[^.]*\btoken\b/i],
  ['put +1/+1 counters', /\bput\b[^.]*\+1\/\+1 counter/i],
  ['put counters', /\bput\b[^.]*\bcounter/i],
  ['destroy or exile a permanent', /\b(?:destroy|exile)\b[^.]*\b(?:creature|permanent|artifact|enchantment|land)\b/i],
  ['deal damage', /\bdeals? \d+ damage|\bdeals? damage\b/i],
  ['draw cards', /\bdraw(?:s)? (?:a card|\w+ cards?)/i],
  ['gain life', /\bgain(?:s)? \w+ life\b/i],
  ['lose life', /\blose(?:s)? \w+ life\b/i],
  ['search the library', /\bsearch your library\b/i],
  ['return from graveyard', /\breturn\b[^.]*\bgraveyard\b/i],
  ['bounce to hand', /\breturn\b[^.]*\bto (?:its owner|their owner|your hand)/i],
  ['sacrifice', /\bsacrifice\b/i],
  ['discard', /\bdiscard\b/i],
  ['mill', /\bmill\b|\bputs? the top \w+ cards? of\b[^.]*\bgraveyard\b/i],
  ['scry or surveil', /\b(?:scry|surveil)\b/i],
  ['tap or untap', /\b(?:taps?|untaps?)\b[^.]*\b(?:target|creature|permanent)\b/i],
  ['pump until end of turn', /\bgets? [+-]\d+\/[+-]\d+ until end of turn\b/i],
  ['grant a keyword', /\bgains?\b[^.]*\buntil end of turn\b/i],
  ['add mana', /\badds? \{/i],
  ['counter a spell', /\bcounter target\b/i],
  ['fight', /\bfights?\b/i],
  ['copy', /\bcopy\b|\bcopies\b/i],
  ['transform or turn face up', /\btransform\b|\bturn(?:s)? .* face up\b/i],
];

function mechanicOf(text: string): string {
  for (const [name, re] of MECHANIC_PATTERNS) {
    if (re.test(text)) return name;
  }
  return 'other';
}

export interface JudgeInput {
  /** The card as it was at the moment of resolution. */
  card: CardInstance;
  /**
   * Where the card was sent, and where it actually finished. Both observed,
   * neither derived from the type line.
   *
   * They are two different facts and the classifier needs both. `resolvesTo`
   * reading the type line was wrong twice over: a modal double-faced card's
   * type line carries both faces — "Creature — Human // Instant" — so a
   * creature entering the battlefield was judged as an instant resolving; and
   * an Aura played to the battlefield that a state-based action immediately
   * binned finished in the graveyard, which is the finding, not the moment.
   *
   * So `playedTo` decides which of a card's clauses were due, and `landedIn`
   * decides whether the permanent survived arriving.
   */
  playedTo?: string;
  landedIn?: string;
  /** The state the resolution started from, for targets and conditions. */
  before: GameState;
  /** The state it produced, for the manual marker. */
  after: GameState;
  diff: StateDiff;
  /** Log lines this one action appended. */
  logAdded: readonly GameEvent[];
  /**
   * Every action the engine ran for this frame, from `applyActionTraced`.
   *
   * Only countering is read from it, and only because countering is the one
   * effect a player can see and a state difference cannot. See `footprintOf`.
   */
  applied?: readonly GameAction[];
}

/**
 * How bad is this row?
 *
 * A drawback nothing can apply is `high` whatever else the card did, because
 * the cost is not "this resolution was quiet" — it is that the permanent now
 * sitting on the battlefield is stronger than the one printed on the card, and
 * it stays that way for the rest of the game.
 */
function severityOf(verdict: Omit<CardVerdict, 'severity'>): Severity {
  if (verdict.drawbacks.length > 0) return 'high';
  switch (verdict.verdict) {
    case 'acted':
    case 'correctly-quiet':
    case 'correctly-quiet-conditional':
      return 'none';
    default:
      return 'normal';
  }
}

/**
 * One resolution, judged, with its severity attached.
 *
 * Severity is worked out here rather than inside each branch so there is one
 * place that decides it, and so a branch added later cannot forget to set it.
 */
export function judgeResolution(input: JudgeInput): CardVerdict {
  const verdict = judgeWhatHappened(input);
  return { ...verdict, severity: severityOf(verdict) };
}

/**
 * One resolution, judged.
 *
 * The order of the checks is the order of the argument: cheapest and most
 * certain exclusions first, so the expensive board reads only run on cards that
 * are still candidates.
 */
function judgeWhatHappened(input: JudgeInput): Omit<CardVerdict, 'severity'> {
  const { card, before, after, diff, logAdded } = input;
  const landed = input.landedIn ?? after.cards[card.instanceId]?.zone;
  const sentTo = input.playedTo ?? (resolvesToGraveyard(card) ? 'graveyard' : 'battlefield');
  const moment: 'enters' | 'spell-resolves' =
    sentTo === 'battlefield' ? 'enters' : 'spell-resolves';
  const controller = card.controllerId;
  const automation = automationFor(card);
  const footprint = footprintOf(diff, card.instanceId, logAdded, {
    name: card.name,
    applied: input.applied,
  });

  const drawbacks = drawbacksAfterBoard(
    inertDrawbacks(card),
    before,
    controller,
    footprint
  );

  const base = {
    cardName: card.name,
    engineLevel: automation.level,
    moment,
    footprint: footprint.effects.slice(0, 8),
    drawbacks,
    printedBody:
      card.power !== undefined && card.toughness !== undefined
        ? `${card.power}/${card.toughness}`
        : undefined,
  };

  /* --- 0. did it even stay on the battlefield? --- */
  if (moment === 'enters') {
    if (landed && landed !== 'battlefield') {
      const line = (card.typeLine ?? '').toLowerCase();
      const why = line.includes('aura')
        ? `${card.name} is an Aura. It was played, it entered attached to nothing, and a ` +
          `state-based action put it straight into the ${landed}. The rule is applied ` +
          `correctly; the card is unplayable, because nothing in the game ever attaches an Aura ` +
          `to anything.`
        : zeroToughnessOnArrival(card)
          ? `${card.name} is printed ${card.power ?? '?'}/${card.toughness ?? '?'} and its ` +
            `counters come from text the engine did not resolve, so it arrived as a ` +
            `${card.power ?? '?'}/${card.toughness ?? '?'} and CR 704.5f put it straight into ` +
            `the ${landed}. Every card that gets its body from entering with counters is ` +
            `unplayable for the same reason.`
          : `${card.name} was played to the battlefield and was in the ${landed} by the time ` +
            `the action finished.`;
      return {
        ...base,
        verdict: 'dead-on-arrival',
        confidence: 'certain',
        why,
        dueText: [],
        mechanic: line.includes('aura')
          ? 'aura cannot attach'
          : zeroToughnessOnArrival(card)
            ? 'enters with counters that never arrive'
            : 'left play immediately',
      };
    }
  }

  /* --- 0b. is it playing stronger than it is printed? ---
   *
   * BEFORE the "did anything happen" check, and that ordering is the argument
   * this whole block makes.
   *
   * A drawback is not a promise the card makes at one moment, it is the price
   * printed on the card, and a price nothing collects is wrong for the rest of
   * the game. Two consequences, both deliberate:
   *
   *   - a card that DID something else still lands here. Doing one thing right
   *     does not pay for a penalty nobody applied.
   *   - a CONTINUOUS drawback lands here at all, which it could not before.
   *     "~ gets -X/-X, where X is your life total" is read as a static clause,
   *     static clauses are not due at any moment, and `layers.ts` computing
   *     statics on read means a working one leaves no trace. So the checks
   *     below correctly refuse to call a quiet static a defect — and that is
   *     exactly how Death's Shadow was filed as `correctly-quiet` while
   *     attacking for 13 on turn three. The compiler saying it could not read
   *     the clause is the evidence those checks had no way to ask for.
   */
  if (drawbacks.length > 0) {
    const first = drawbacks[0];
    const printed =
      card.power !== undefined && card.toughness !== undefined
        ? ` It is printed ${card.power}/${card.toughness}, and that body was priced with the penalty in place.`
        : '';
    return {
      ...base,
      verdict: 'silent-drawback',
      confidence: first.evidence === 'unparsed' ? 'certain' : 'likely',
      why:
        `${card.name} carries a drawback nothing in the engine applies: "${first.clause.slice(0, 120)}". ` +
        (first.evidence === 'unparsed'
          ? `The compiler could not read that line, so no ability exists to apply it.`
          : `It compiled to a "resolve by hand" marker, so it only applies if a player does it themselves.`) +
        printed +
        ` A card that loses its drawback does not get slightly worse. It gets a price deleted.`,
      dueText: drawbacks.map(d => d.clause),
      mechanic: `drawback: ${first.label}`,
    };
  }

  if (!footprint.quiet) {
    return {
      ...base,
      verdict: 'acted',
      confidence: 'certain',
      why: `${card.name} resolved and changed the game.`,
      dueText: [],
      mechanic: 'n/a',
    };
  }

  /* --- 1. no text at all --- */
  if (card.oracleText === undefined || card.oracleText === null) {
    return {
      ...base,
      verdict: 'text-not-loaded',
      confidence: 'certain',
      why:
        `${card.name} reached the battlefield with no oracle text loaded. Nothing in the app can ` +
        `know what it does, including the part of the app that would tell the player it does not ` +
        `know.`,
      dueText: [],
      mechanic: 'unreadable',
    };
  }

  if (card.oracleText.trim() === '') {
    return {
      ...base,
      verdict: 'correctly-quiet',
      confidence: 'certain',
      why: `${card.name} has no rules text. A vanilla card arriving is the whole event.`,
      dueText: [],
      mechanic: 'vanilla',
    };
  }

  /* --- 2. lands: mana is not a state change in this engine --- */
  const line = (card.typeLine ?? '').toLowerCase();
  if (line.includes('land') && !line.includes('creature')) {
    const clauses = readClauses(card.oracleText, moment, card.name);
    const dueLand = clauses.filter(c => c.due);
    if (dueLand.length === 0) {
      return {
        ...base,
        verdict: 'correctly-quiet',
        confidence: 'certain',
        why:
          `${card.name} is a land whose text is mana production or an activated ability. ` +
          `Neither writes anything into state when the land enters.`,
        dueText: [],
        mechanic: 'land',
      };
    }
  }

  /* --- 3. what was due at this moment --- */
  const clauses = readClauses(card.oracleText, moment, card.name);
  const due = clauses.filter(c => c.due);

  if (due.length === 0) {
    const kinds = [...new Set(clauses.map(c => c.kind))].join(', ');
    return {
      ...base,
      verdict: 'correctly-quiet',
      confidence: 'certain',
      why:
        `${card.name} had nothing due when it ${moment === 'enters' ? 'entered' : 'resolved'}. ` +
        `Its text is ${kinds || 'nothing the engine reads'}, and none of that writes into state ` +
        `at this moment.`,
      dueText: [],
      mechanic: kinds.includes('static') ? 'static ability' : 'not due now',
    };
  }

  /* --- 4. legitimate no-ops that depended on the board --- */
  const dueText = due.map(c => c.text);
  const joined = dueText.join(' ');
  let confidence: 'certain' | 'likely' = 'certain';

  /*
   * "This creature enters with X +1/+1 counters on it."
   *
   * X is chosen as the spell is cast, and nothing in this engine ever pays for
   * an X. Entering with zero counters is the correct outcome of X being zero, so
   * this cannot be called certain — it is reported, because a card that can only
   * ever be a 0/0 is still a card that does not work, but the confidence says
   * what it is.
   */
  if (/\benters .{0,30}\bwith X\b/i.test(joined)) confidence = 'likely';

  /*
   * "If this creature was kicked…" and every other cost the caster could have
   * chosen to pay.
   *
   * Nothing in this engine pays kicker, so the creature was not kicked, so the
   * clause correctly does nothing. Reporting Prison Barricade as a silent card
   * because it did not get the counter it only gets when kicked would be a
   * finding about a cost that was never paid, not about the card.
   */
  if (/\bwas (?:kicked|foretold|cast for its|bargained)\b|\bif .{0,20}kicked\b/i.test(joined)) {
    return {
      ...base,
      verdict: 'correctly-quiet-conditional',
      confidence: 'certain',
      why:
        `${card.name}'s text only does something when an optional cost was paid, and nothing in ` +
        `the game ever pays one. Doing nothing is the correct outcome of the cost not being paid. ` +
        `Whether that cost can be paid at all is a separate question and is not this row.`,
      dueText,
      mechanic: mechanicOf(joined),
    };
  }

  // Any conditional the engine cannot evaluate lowers confidence rather than
  // excusing the finding. Tested on the raw clause: stripping to the first comma
  // hides "If this creature was kicked, it enters with…" from the check.
  if (due.some(clause => /^\s*if\b/i.test(clause.text))) confidence = 'likely';

  const targets = targetVerdict(joined, before, controller);
  if (targets === 'no-legal-target') {
    return {
      ...base,
      verdict: 'correctly-quiet-conditional',
      confidence: 'certain',
      why:
        `${card.name} needs a target and there was none on the board when it resolved. ` +
        `Doing nothing is correct.`,
      dueText,
      mechanic: mechanicOf(joined),
    };
  }
  if (targets === 'unknown') confidence = 'likely';

  /*
   * The escape clause. "Enters tapped unless you control a basic land" with two
   * basics on the board is a card that correctly did nothing, and reporting it
   * was 4 of the 20 hand-checked verdicts. Every clause has to be excused, not
   * just one: a card whose other due text is a real promise is still a finding.
   */
  const unlessVerdicts = due
    .filter(clause => /\bunless\b/i.test(clause.text))
    .map(clause => unlessEscapes(clause.text, before, controller));
  if (unlessVerdicts.length === due.length && unlessVerdicts.every(v => v === true)) {
    return {
      ...base,
      verdict: 'correctly-quiet-conditional',
      confidence: 'certain',
      why:
        `${card.name}'s text only applies unless a condition is met, and the condition WAS met ` +
        `on the board when it resolved, so the card was right to do nothing.`,
      dueText,
      mechanic: mechanicOf(joined),
    };
  }
  if (unlessVerdicts.some(v => v === 'unknown')) confidence = 'likely';

  for (const clause of due) {
    const holds = interveningHolds(clause.text.replace(/^[^,]*,\s*/, ''), before, controller);
    if (holds === false) {
      return {
        ...base,
        verdict: 'correctly-quiet-conditional',
        confidence: 'certain',
        why:
          `${card.name} has an intervening "if" (CR 603.4) that was false when it resolved, so ` +
          `the ability correctly did nothing.`,
        dueText,
        mechanic: mechanicOf(joined),
      };
    }
    if (holds === 'unknown') confidence = 'likely';
    // A conditional body the engine cannot evaluate is not proof of a bug.
    if (/^\s*if\b/i.test(clause.text.replace(/^[^,]*,\s*/, ''))) confidence = 'likely';
  }

  /* --- 5. what is left is a card that did not do its job. Was anybody told? --- */

  const mechanic = mechanicOf(joined);
  const nameFragment = card.name.split(',')[0].split(' //')[0];
  const noted = logAdded.some(
    entry => entry.type === 'NOTE' && entry.message.includes(nameFragment)
  );
  const afterCard = after.cards[card.instanceId];
  const marked =
    afterCard !== undefined &&
    afterCard.zone === 'battlefield' &&
    automationFor(afterCard).needsManual;

  const promise = dueText[0].slice(0, 140);

  if (noted) {
    return {
      ...base,
      verdict: 'silent-noted',
      confidence,
      why:
        `${card.name} did nothing, and the game log said so. The rule is still not implemented, ` +
        `but the player was told: "${promise}".`,
      dueText,
      mechanic,
    };
  }

  if (marked) {
    return {
      ...base,
      verdict: 'silent-marked',
      confidence,
      why:
        `${card.name} did nothing. It is on the battlefield carrying a "resolve by hand" marker, ` +
        `so a player looking straight at the card can see it, but no log line was written and ` +
        `nothing happened: "${promise}".`,
      dueText,
      mechanic,
    };
  }

  return {
    ...base,
    verdict: 'silent-untold',
    confidence,
    why:
      `${card.name} ${moment === 'enters' ? 'entered the battlefield' : 'resolved'} and changed ` +
      `nothing. Its text says "${promise}". No log line, no marker, nothing on the board. The ` +
      `player has no way to know it did not work.`,
    dueText,
    mechanic,
  };
}

/**
 * Cards that entered and were never able to use what they have.
 *
 * Separate from the silent detector on purpose: a creature with "{T}: draw a
 * card" that sits doing nothing is CORRECT on entry, and reporting it as silent
 * would be wrong. The finding is that the ability was never reachable at all,
 * which is counted across the whole run rather than per resolution.
 */
export function hasActivatedAbility(card: CardInstance): boolean {
  const text = card.oracleText ?? '';
  if (!text) return false;
  return text
    .split('\n')
    .some(line => /^[^:\n]{1,60}:\s/.test(line.trim()) && !/:\s*add\b/i.test(line));
}

/** Cards whose only unimplemented text is a keyword the engine badges but does not enforce. */
export function advisoryKeywordsOn(card: CardInstance): string[] {
  return effectiveKeywords(card).filter(k => keywordSupport(k) !== 'engine');
}
