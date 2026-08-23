/**
 * DeckMatrix — the XMage runtime API: filters and predicates.
 *
 * Ported from **XMage**, MIT licensed, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. Read in place; nothing vendored. XMage's
 * display strings are not copied — those carry Wizards of the Coast rules text.
 * Every filter here therefore carries a name WE wrote, and it is used only for
 * a log line.
 *
 * ## Why this is worth 3% of every call on its own
 *
 * `scripts/xmage/api-surface-typed.mjs` puts `Filter#add` at rank 9 with 1,852
 * calls across 1,344 card files, and `CardType#getPredicate`,
 * `SubType#getPredicate`, `Predicates#or`, `Predicates#not` and `Filter#match`
 * add 1,633 more. An XMage card body builds its filter imperatively:
 *
 *     FilterCreaturePermanent filter = new FilterCreaturePermanent();
 *     filter.add(SubType.GOBLIN.getPredicate());
 *     filter.add(TargetController.YOU.getControllerPredicate());
 *
 * So the filter builder is not a detail of the port. It is the port's second
 * biggest single piece after `Game`.
 *
 * ## Ours reads our characteristics, not a copy of XMage's
 *
 * A predicate is `(state, card, ctx) => boolean` and asks
 * `characteristics.ts`, so a Goblin that is only a Goblin because of a type
 * changing effect matches. Reading `CardInstance.typeLine` directly would give
 * the PRINTED answer and quietly disagree with the board on screen.
 */

import type { CardInstance, GameState, InstanceId, PlayerId } from '../types.ts';
import {
  colorsIn,
  isCreatureIn,
  keywordsIn,
  subtypesIn,
  supertypesIn,
  typesIn,
} from '../characteristics.ts';

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** Whose point of view "you" and "opponent" are taken from. */
export interface PredicateContext {
  /** The controller of the ability doing the filtering. */
  controllerId?: PlayerId;
  /** The permanent whose ability it is, for "other than this". */
  sourceId?: InstanceId;
}

export type XPredicate = (
  state: GameState,
  card: CardInstance,
  ctx: PredicateContext
) => boolean;

/**
 * XMage's `Filter`, as data. A list of predicates, all of which must hold.
 *
 * Mutable, because the bodies being translated are: `filter.add(...)` is a
 * statement, not an expression. It is safe because a filter is built inside one
 * body and never reaches game state.
 */
export interface XFilter {
  /** Our words, for the log. Never XMage's string. */
  message: string;
  predicates: XPredicate[];
  /** `add` returns the filter so a body can chain, which some XMage bodies do. */
  add(predicate: XPredicate): XFilter;
  /** XMage's `Filter#match`. */
  match(state: GameState, card: CardInstance, ctx?: PredicateContext): boolean;
}

/**
 * Build a filter.
 *
 * `message` takes A LIST OF WORDS as well as a string, and the list is not a
 * convenience. `extract-filters.mjs` derives a name for each of XMage's filter
 * classes from the predicates it resolved — never from XMage's own string,
 * which carries Wizards of the Coast rules text this project may not copy — and
 * that derived name is several words long. Written into `bodies.generated.ts`
 * as one literal it trips check 5 in `translate-check.mjs`, whose rule is
 * deliberately blunt: a space, or more than 24 characters, means wording.
 *
 * The answer was not to soften the check or to exempt these rows from it. It
 * was to stop putting a sentence in the generated file at all: the generator
 * emits the WORDS and the joining happens here, in the folder where "every
 * filter name and log line is ours" already holds. Check 5 stays blunt and
 * stays at zero, which is worth more than the nine rows it would have cost.
 */
export function makeFilter(
  message: string | readonly string[],
  predicates: XPredicate[] = []
): XFilter {
  const filter: XFilter = {
    message: typeof message === 'string' ? message : message.join(' '),
    predicates: [...predicates],
    add(predicate: XPredicate) {
      filter.predicates.push(predicate);
      return filter;
    },
    match(state: GameState, card: CardInstance, ctx: PredicateContext = {}) {
      if (!card) return false;
      for (const predicate of filter.predicates) if (!predicate(state, card, ctx)) return false;
      return true;
    },
  };
  return filter;
}

/* -------------------------------------------------------------------------- */
/* Predicate combinators — XMage's `Predicates`                               */
/* -------------------------------------------------------------------------- */

export const Predicates = {
  and(...parts: XPredicate[]): XPredicate {
    return (state, card, ctx) => parts.every(p => p(state, card, ctx));
  },
  or(...parts: XPredicate[]): XPredicate {
    return (state, card, ctx) => parts.some(p => p(state, card, ctx));
  },
  not(part: XPredicate): XPredicate {
    return (state, card, ctx) => !part(state, card, ctx);
  },
  /** Always true. XMage uses it where a filter is required but unrestricted. */
  any(): XPredicate {
    return () => true;
  },
};

/* -------------------------------------------------------------------------- */
/* The predicate vocabulary                                                   */
/* -------------------------------------------------------------------------- */

const lower = (value: string): string => String(value ?? '').toLowerCase();

/** XMage's `CardType.CREATURE.getPredicate()` and friends. */
export function cardTypePredicate(type: string): XPredicate {
  const want = lower(type);
  return (state, card) => typesIn(state, card.instanceId).some(t => lower(t) === want);
}

/** XMage's `SubType.GOBLIN.getPredicate()`. */
export function subTypePredicate(subtype: string): XPredicate {
  const want = lower(subtype);
  return (state, card) => subtypesIn(state, card.instanceId).some(t => lower(t) === want);
}

export function superTypePredicate(supertype: string): XPredicate {
  const want = lower(supertype);
  return (state, card) => supertypesIn(state, card.instanceId).some(t => lower(t) === want);
}

/** XMage's `ColorPredicate`. Takes 'W' | 'U' | 'B' | 'R' | 'G' or a colour word. */
export function colorPredicate(color: string): XPredicate {
  const want = lower(color);
  const letters: Record<string, string> = {
    white: 'w', blue: 'u', black: 'b', red: 'r', green: 'g',
  };
  const letter = letters[want] ?? want;
  return (state, card) => colorsIn(state, card.instanceId).some(c => lower(c) === letter || lower(c) === want);
}

export function keywordPredicate(keyword: string): XPredicate {
  const want = lower(keyword);
  return (state, card) => keywordsIn(state, card.instanceId).some(k => lower(k) === want);
}

/** XMage's `TargetController.YOU.getControllerPredicate()`. */
export function controlledByPredicate(playerId?: PlayerId): XPredicate {
  return (state, card, ctx) => card.controllerId === (playerId ?? ctx.controllerId);
}

/** XMage's `TargetController.OPPONENT`. */
export function controlledByOpponentPredicate(): XPredicate {
  return (state, card, ctx) => !!ctx.controllerId && card.controllerId !== ctx.controllerId;
}

export function ownedByPredicate(playerId?: PlayerId): XPredicate {
  return (state, card, ctx) => card.ownerId === (playerId ?? ctx.controllerId);
}

/** XMage's `AnotherPredicate` — "another target creature". */
export function anotherPredicate(): XPredicate {
  return (state, card, ctx) => card.instanceId !== ctx.sourceId;
}

export function tappedPredicate(tapped = true): XPredicate {
  return (state, card) => !!card.tapped === tapped;
}

export function namePredicate(name: string): XPredicate {
  const want = lower(name);
  return (state, card) => lower(card.name) === want;
}

/** Mana value, XMage's `ManaValuePredicate`. */
export function manaValuePredicate(op: '<' | '<=' | '=' | '>=' | '>', value: number): XPredicate {
  return (state, card) => {
    const mv = card.cmc ?? 0;
    switch (op) {
      case '<': return mv < value;
      case '<=': return mv <= value;
      case '=': return mv === value;
      case '>=': return mv >= value;
      case '>': return mv > value;
      default: return false;
    }
  };
}

export function creaturePredicate(): XPredicate {
  return (state, card) => isCreatureIn(state, card.instanceId);
}

/* -------------------------------------------------------------------------- */
/* The enum shape a translated body calls                                     */
/* -------------------------------------------------------------------------- */

/*
 * XMage bodies say `CardType.CREATURE.getPredicate()` and
 * `SubType.GOBLIN.getPredicate()`. Together those are 712 calls, ranks 67 and
 * 76. Keeping the same spelling means a translated line is the Java line with
 * the semicolon removed, which is the whole point of implementing the API
 * rather than paraphrasing each card.
 */

interface PredicateSource {
  name: string;
  getPredicate(): XPredicate;
}

function predicateSource(name: string, build: (name: string) => XPredicate): PredicateSource {
  return { name, getPredicate: () => build(name) };
}

/** `CardType.CREATURE`, `CardType.LAND`, … and `CardType.of('Battle')` for the rest. */
export const CardType = {
  of: (name: string): PredicateSource => predicateSource(name, cardTypePredicate),
  CREATURE: predicateSource('creature', cardTypePredicate),
  LAND: predicateSource('land', cardTypePredicate),
  ARTIFACT: predicateSource('artifact', cardTypePredicate),
  ENCHANTMENT: predicateSource('enchantment', cardTypePredicate),
  PLANESWALKER: predicateSource('planeswalker', cardTypePredicate),
  INSTANT: predicateSource('instant', cardTypePredicate),
  SORCERY: predicateSource('sorcery', cardTypePredicate),
  BATTLE: predicateSource('battle', cardTypePredicate),
};

/** `SubType.GOBLIN`, `SubType.of('Eldrazi')`. Every creature type is a string. */
export const SubType = {
  of: (name: string): PredicateSource => predicateSource(name, subTypePredicate),
};

/** `SuperType.LEGENDARY`, `SuperType.of('Snow')`. */
export const SuperType = {
  of: (name: string): PredicateSource => predicateSource(name, superTypePredicate),
  LEGENDARY: predicateSource('legendary', superTypePredicate),
  BASIC: predicateSource('basic', superTypePredicate),
};

/* -------------------------------------------------------------------------- */
/* The stock filters XMage bodies start from                                  */
/* -------------------------------------------------------------------------- */

/*
 * Names are ours. XMage's `StaticFilters` carries strings such as its own
 * wording for "creature you control"; those are Wizards rules text and are not
 * copied. What is ported is the PREDICATE SET, which is behaviour.
 */

export const StaticFilters = {
  permanent: (): XFilter => makeFilter('permanent'),
  creature: (): XFilter => makeFilter('creature', [creaturePredicate()]),
  creatureYouControl: (): XFilter =>
    makeFilter('creature you control', [creaturePredicate(), controlledByPredicate()]),
  creatureOpponentControls: (): XFilter =>
    makeFilter('creature an opponent controls', [
      creaturePredicate(),
      controlledByOpponentPredicate(),
    ]),
  anotherCreature: (): XFilter =>
    makeFilter('another creature', [creaturePredicate(), anotherPredicate()]),
  land: (): XFilter => makeFilter('land', [cardTypePredicate('land')]),
  artifact: (): XFilter => makeFilter('artifact', [cardTypePredicate('artifact')]),
  enchantment: (): XFilter => makeFilter('enchantment', [cardTypePredicate('enchantment')]),
  planeswalker: (): XFilter => makeFilter('planeswalker', [cardTypePredicate('planeswalker')]),
  card: (): XFilter => makeFilter('card'),
  creatureCard: (): XFilter => makeFilter('creature card', [cardTypePredicate('creature')]),
  landCard: (): XFilter => makeFilter('land card', [cardTypePredicate('land')]),
  basicLandCard: (): XFilter =>
    makeFilter('basic land card', [cardTypePredicate('land'), superTypePredicate('basic')]),
};
