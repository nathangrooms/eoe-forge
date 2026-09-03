/**
 * Oracle text -> `CardAbilities`.
 *
 * The abilities this file hands the engine for a card the compiler cannot
 * finish are DERIVED FROM XMAGE, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. See `xmageSwapFor`
 * below and `../xmage/lowered.ts`. Nothing from the XMage clone is vendored
 * and no XMage display string is copied. Forge is GPL-3.0 and was not fetched,
 * read or referenced.
 *
 * The compiler CONSUMES text. Every paragraph of the normalised oracle text is
 * either turned into one or more `Ability` values or pushed to `unparsed` with a
 * `GapReason` and its character span. There is no branch that discards a
 * paragraph, and `assertClausesAccounted` proves it: the consumed spans plus the
 * unparsed spans must cover every non-blank character of the normalised text, so
 * a dropped clause is a failing test rather than a quiet regression.
 *
 * That invariant is the whole point of the exercise. The complaint that started
 * this was "a card that appeared to resolve and did not". Under this compiler a
 * card either resolves completely, or carries a visible marker before it
 * resolves and a note after it. There is no third state, and there is no way to
 * spell "fully automated" while text was dropped, because `coverage` is derived
 * from `unparsed` and from the presence of `{do:'manual'}` rather than asserted.
 *
 * ## Reading order
 * `normalize.ts` -> paragraphs. `clause-rules.ts` -> what kind of ability a
 * paragraph is. `effect-rules.ts` -> what it does. This file is the orchestrator
 * and owns only the classification ORDER and the accounting.
 */

import type {
  Ability,
  CardAbilities,
  Condition,
  Cost,
  Effect,
  GapReason,
  TargetSpec,
  TriggerEvent,
  UnparsedClause,
} from './dsl.ts';
import { deriveCoverage, hasManualEffect, manual } from './dsl.ts';
import type { AbilityCard, NormalizedOracle, Paragraph } from './normalize.ts';
import { abilityKey, normalizeCard } from './normalize.ts';
import type { BuildCtx } from './effect-rules.ts';
import { compileEffectBody, namedManual } from './effect-rules.ts';
import {
  parseCosts,
  parseKeywordLine,
  parseLoyaltyCost,
  parseReplacement,
  parseStatic,
  parseTriggerEvent,
  peelInterveningIf,
} from './clause-rules.ts';
import { xmageSwapFor } from '../xmage/lowered.ts';

/* ------------------------------------------------------------------ *
 * Gap classification
 *
 * When nothing parses, WHY it did not parse is the most useful number in the
 * whole report — it says which of the ten declared modelling gaps a clause fell
 * into, or that it is simply a template no rule covers yet. First match wins.
 * ------------------------------------------------------------------ */

const GAP_SIGNALS: Array<[RegExp, GapReason]> = [
  [/becomes a copy of|copy of target|as a copy|change the text|becomes? your commander/, 'copy-layer'],
  [/\bcascade\b|\bsuspend\b|\bforetell\b|\bflashback\b|you may cast (?:it|~|this) from your graveyard|without paying its mana cost|as an additional cost to cast|you may pay|alternative cost|\bconvoke\b|\bdelve\b|\bemerge\b|\bescape\b|\bevoke\b|\bmadness\b|\bmiracle\b|\bovorload\b|\bprowl\b|\bspree\b|\bplot\b|\bdisturb\b|\bembalm\b|\beternalize\b|\bunearth\b|\bblitz\b/, 'alt-cast'],
  [/(?:have|has|gains?) "|gains? the ability|with "/, 'granted-ability'],
  [/until end of combat|until your next end step|for as long as|until ~ leaves|this turn, if|until the beginning of/, 'duration'],
  [/name a card|separate .* into (?:two|three) piles|\bvotes?\b|secretly|choose a card in|without looking|face down|^as ~ enters, choose|is turned face up/, 'hidden-choice'],
  [/this turn\b.*(?:if|whenever)|\bstorm\b|\bmagecraft\b|the second (?:spell|creature)|died this turn|was cast this turn|cast this turn|earlier this turn|entered (?:the battlefield )?this turn/, 'needs-history'],
  [/outside the game|\bsideboard\b|\bcompanion\b|\bdungeon\b|\bventure\b|the ring tempts|\bdaybound\b|\bnightbound\b|\battraction\b|\bsticker\b|\bcontraption\b|\bspeed\b/, 'outside-game'],
  [/damage cant be prevented|cant be countered|counters cant be|cant gain life|cant be sacrificed|if a .* would .* instead/, 'meta-replacement'],
  [/\bbanding\b|assigns? .* combat damage|damage assignment order|\bprovoke\b|must be blocked/, 'complex-combat'],
  [/^whenever you control no|^when(?:ever)? a player (?:has|controls)|^whenever you have|as long as .* has \d+ or (?:less|fewer)/, 'state-trigger'],
  [/depends on|timestamp|\blayer\b/, 'layer-dependency'],
];

function gapReasonFor(norm: string, looksStructured: boolean): GapReason {
  for (const [re, reason] of GAP_SIGNALS) if (re.test(norm)) return reason;
  return looksStructured ? 'ambiguous' : 'unrecognised';
}

/* ------------------------------------------------------------------ *
 * Per-ability build context
 * ------------------------------------------------------------------ */

interface AbilityBuild {
  ctx: BuildCtx;
  targets: TargetSpec[];
}

/**
 * T3. The card-level facts every ability on one card shares.
 *
 * Was a bare `typeLine: string` threaded by hand through `classify` and
 * `newBuild`. It became a record when the single-characteristic CDA rule needed
 * the printed P/T boxes as well, and one record beats a third and a fourth
 * positional argument that every call site has to keep in the right order.
 */
export interface CardShape {
  typeLine: string;
  printedPower: string;
  printedToughness: string;
}

function newBuild(shape: CardShape): AbilityBuild {
  const targets: TargetSpec[] = [];
  const ctx: BuildCtx = {
    typeLine: shape.typeLine,
    printedPower: shape.printedPower,
    printedToughness: shape.printedToughness,
    approximate: false,
    targetsSoFar: 0,
    // T2. In an activated, loyalty or spell ability the source is the only
    // thing a bare "it" can mean before the sentence names something else, so
    // the binding starts offered and `compileEffectBody` withdraws it on the
    // bodies that name something first. A TRIGGER is the one shape that can
    // rename the subject, and branch 3 below clears this when it does.
    itBinding: { sel: 'self' },
    addTarget(spec) {
      const ref = targets.length;
      targets.push({ ...spec, ref } as TargetSpec);
      ctx.targetsSoFar = targets.length;
      return ref;
    },
  };
  return { ctx, targets };
}

/**
 * T2. Does this trigger's event happen to the source itself?
 *
 * The gate on binding a bare "it" to the source inside a trigger's body.
 * "Whenever this creature attacks, it gets +2/+0" and "Whenever ANOTHER creature
 * you control dies, return it to its owner's hand" have identical bodies and
 * different pronouns, and only the event tells them apart. Without this check
 * the second card would bounce the wrong permanent — itself, from the
 * battlefield, on somebody else's death.
 */
function eventSubjectIsSelf(event: TriggerEvent): boolean {
  const e = event as { who?: { sel?: string }; source?: { sel?: string }; what?: { sel?: string } };
  const subject = e.who ?? e.source ?? e.what;
  return subject?.sel === 'self';
}

/** An effect list is worth publishing only if at least one clause is real. */
function anyAutomated(effects: readonly Effect[]): boolean {
  return effects.some((e) => e.do !== 'manual');
}

/**
 * Does this ability produce mana and nothing else? A mana ability does not use
 * the stack and cannot be responded to (CR 605), so getting this wrong makes
 * every dual land respondable.
 *
 * A colour choice counts: "Add {R} or {G}" compiles to a `choose-mode` whose
 * every mode is an `add-mana`, and that is still a mana ability.
 */
function isManaOnly(effects: readonly Effect[]): boolean {
  if (!effects.length) return false;
  return effects.every((e) => {
    if (e.do === 'add-mana') return true;
    if (e.do === 'choose-mode') return e.modes.every((m) => isManaOnly(m.effects));
    return false;
  });
}

/**
 * Peels the activation restrictions off the end of an activated ability's body.
 *
 * These read like sentences but are ability properties, and the difference
 * matters: an "activate only as a sorcery" left in the effect list becomes a
 * `{do:'manual'}` note, and a note is something a player reads AFTER deciding
 * to activate. `timing: 'sorcery'` is something the legality check enforces
 * BEFORE they can. Same text, opposite outcomes.
 */
function readActivationLimits(body: string): {
  body: string;
  sorceryOnly: boolean;
  limit?: { per: 'turn' | 'game'; count: number };
} {
  let rest = body.trim();
  let sorceryOnly = false;
  let limit: { per: 'turn' | 'game'; count: number } | undefined;

  for (;;) {
    const sorcery = rest.match(/[.\s]*activate (?:this ability )?only (?:as a sorcery|any time you could cast a sorcery)\.?$/);
    if (sorcery) { rest = rest.slice(0, sorcery.index).trim(); sorceryOnly = true; continue; }

    const once = rest.match(/[.\s]*activate (?:this ability )?only once each (turn|game)\.?$/);
    if (once) {
      rest = rest.slice(0, once.index).trim();
      limit = { per: once[1] === 'game' ? 'game' : 'turn', count: 1 };
      continue;
    }
    break;
  }

  return limit ? { body: rest, sorceryOnly, limit } : { body: rest, sorceryOnly };
}

/* ------------------------------------------------------------------ *
 * Modal runs — "Choose one —" plus its bullet paragraphs
 * ------------------------------------------------------------------ */

const MODE_COUNTS: Record<string, [number, number] | 'all'> = {
  one: [1, 1],
  two: [2, 2],
  three: [3, 3],
  'one or both': [1, 2],
  'one or more': 'all',
  'any number': 'all',
};

interface ModalRun {
  prefix: string;
  effect: Effect;
  consumed: number;
  text: string;
}

/**
 * Modes span paragraphs, so this is the one place the compiler reads ahead. A
 * run is accepted only when at least two bullets follow and at least one mode
 * has a real effect in it — a modal spell whose every mode is `{do:'manual'}` is
 * an unparsed clause with extra steps, and is reported as one.
 */
function readModal(paragraphs: readonly Paragraph[], i: number, build: AbilityBuild): ModalRun | null {
  const head = paragraphs[i].norm.match(/^(.*?)choose (one|two|three|one or both|one or more|any number) -$/);
  if (!head) return null;
  const spec = MODE_COUNTS[head[2]];
  if (!spec) return null;

  const modes: Array<{ text: string; effects: Effect[] }> = [];
  const rawParts: string[] = [paragraphs[i].raw];
  let j = i + 1;
  for (; j < paragraphs.length; j++) {
    const p = paragraphs[j];
    if (p.face !== paragraphs[i].face) break;
    const bullet = p.norm.match(/^[•*] ?(.+)$/);
    if (!bullet) break;
    rawParts.push(p.raw);
    modes.push({ text: p.raw, effects: compileEffectBody(bullet[1], build.ctx) });
  }
  if (modes.length < 2) return null;
  if (!modes.some((m) => anyAutomated(m.effects))) return null;

  const [min, max] = spec === 'all' ? [1, modes.length] : spec;
  return {
    prefix: head[1],
    effect: { do: 'choose-mode', min, max, modes },
    consumed: j - i,
    text: rawParts.join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * Paragraph classification
 * ------------------------------------------------------------------ */

interface Classified {
  abilities: Ability[];
  /** Which rule fired, for the coverage histogram. */
  rule: string;
}

/**
 * One front-face paragraph -> abilities, or `null` to refuse.
 *
 * The ORDER is the contract. Keywords first because a keyword line is
 * unambiguous and cheap. Loyalty before general activation because `-2:` is a
 * cost the generic cost parser would reject. Triggered before activated because
 * "When ~ enters, sacrifice a creature: ..." must not be read as a cost. Spell
 * abilities last, and only for instants and sorceries, because a bare paragraph
 * on a permanent is far more likely to be a static ability we failed to read
 * than a one-shot effect.
 */
function classify(para: Paragraph, shape: CardShape, idAt: number): Classified | null {
  const norm = para.norm;
  const raw = para.raw;
  const typeLine = shape.typeLine;
  const id = (n: number) => `a${idAt + n}`;

  /* 1. Keyword lines. */
  const keywords = parseKeywordLine(norm);
  if (keywords) {
    const abilities: Ability[] = [];
    for (const k of keywords) {
      const attachment = attachmentAbilities(k, raw, () => id(abilities.length));
      if (attachment) {
        abilities.push(...attachment);
        continue;
      }
      const cycling = cyclingAbility(k, raw, () => id(abilities.length));
      if (cycling) {
        abilities.push(...cycling);
        continue;
      }
      const a: Ability = {
        kind: 'keyword', id: id(abilities.length), text: raw, confidence: 'exact', keyword: k.keyword,
      };
      if (k.parameter) (a as { parameter?: string }).parameter = k.parameter;
      abilities.push(a);
    }
    return { rule: abilities.some(a => a.kind === 'activated') ? 'keyword-attach' : 'keyword-line', abilities };
  }

  /* 2. Loyalty abilities. */
  const loyalty = norm.match(/^([+-]?\d+): (.+)$/);
  if (loyalty && /planeswalker/.test(typeLine)) {
    const costs = parseLoyaltyCost(loyalty[1]);
    if (costs) {
      const build = newBuild(shape);
      const effects = compileEffectBody(loyalty[2], build.ctx);
      if (anyAutomated(effects)) {
        const a: Ability = {
          kind: 'activated', id: id(0), text: raw,
          confidence: build.ctx.approximate ? 'approximate' : 'exact',
          costs, timing: 'sorcery', isLoyalty: true, effects,
        };
        if (build.targets.length) (a as { targets?: TargetSpec[] }).targets = build.targets;
        return { rule: 'loyalty', abilities: [a] };
      }
    }
  }

  /* 3. Triggered abilities. */
  const trigger = norm.match(/^(when|whenever|at) (.+?), (.+)$/);
  if (trigger) {
    const build = newBuild(shape);
    const phrase = trigger[1] === 'at' ? `at ${trigger[2]}` : trigger[2];
    const events = parseTriggerEvent(phrase, build.ctx);
    if (events) {
      // T2 — a bare "it" may mean the source only when the event happened TO
      // the source. Every event in the run has to agree: "whenever ~ enters or
      // another creature enters" would otherwise let one reading license the
      // other.
      // T3, MEASURED AND REJECTED (22 Aug 2026). The obvious next step is to
      // bind the pronoun to `{sel:'trigger-subject'}` here instead of dropping
      // it, now that the runtime can tell a watcher which object an event
      // happened to. It was built, measured over the whole pool, and taken out
      // again: worth +5 AUTOMATED cards, and it made Fearless Fledgling WRONG.
      //
      // "Landfall — Whenever a land you control enters, put a +1/+1 counter on
      // this creature. It gains flying until end of turn." The "It" is the
      // Fledgling. `itMayBind` is meant to catch exactly that and does not,
      // because the body is split into sentences before it is applied and the
      // second sentence starts with the pronoun, with the noun that claimed it
      // in the sentence before. That gap is harmless while the binding is the
      // source (which is what "It" means there anyway) and produces a confident
      // wrong answer the moment the binding is some other object.
      //
      // Fix `itMayBind` to see the whole body first. Until then this stays
      // `undefined`, which costs those cards a manual marker and costs nobody a
      // creature that flew when it should not have.
      if (!events.every(eventSubjectIsSelf)) build.ctx.itBinding = undefined;

      /* CR 603.4 — "[trigger], if [condition], [effect]". The clause comes off
         before the body is compiled, because no effect rule begins with "if"
         and leaving it in made the whole body one manual marker: Field of the
         Dead knew WHEN to fire and not that it makes a Zombie. See
         `peelInterveningIf` for the two outcomes; the marker below is the
         unreadable one, and it is what keeps the bridge from running the
         effect on a condition nothing checked. */
      const intervening = peelInterveningIf(trigger[3]);
      const effects = compileEffectBody(intervening ? intervening.rest : trigger[3], build.ctx);
      if (intervening && !intervening.condition) {
        effects.unshift(manual(
          intervening.text,
          'intervening-if: a condition the vocabulary cannot express; check it by hand when this triggers and again as it resolves',
        ));
      }
      const confidence = build.ctx.approximate ? 'approximate' : 'exact';
      const abilities = events.map((event, n) => {
        const a: Ability = { kind: 'triggered', id: id(n), text: raw, confidence, event, effects };
        if (intervening?.condition) {
          (a as { condition?: Condition }).condition = intervening.condition;
          (a as { interveningIf?: boolean }).interveningIf = true;
        }
        if (build.targets.length) (a as { targets?: TargetSpec[] }).targets = build.targets;
        return a;
      });
      const suffix = !intervening ? '' : intervening.condition ? '+if' : '+if-manual';
      return { rule: `trigger:${events[0].on}${suffix}`, abilities };
    }
  }

  /* 4. Activated abilities. A quote mark means the colon belongs to a granted
        ability, which is the declared `granted-ability` gap, not a cost. */
  const activated = norm.match(/^([^:"]+): (.+)$/);
  if (activated && !/"/.test(norm)) {
    const costs = parseCosts(activated[1]);
    if (costs) {
      const build = newBuild(shape);
      // "Activate only as a sorcery" and "only once each turn" are properties of
      // the ABILITY, not effects it produces. Left in the effect body they
      // become `{do:'manual'}` notes, and a note does not stop a player
      // activating a sorcery-speed ability at instant speed — so they are lifted
      // out to the fields the DSL has for them.
      const activation = readActivationLimits(activated[2]);
      const effects = compileEffectBody(activation.body, build.ctx);
      if (anyAutomated(effects)) {
        const isMana = isManaOnly(effects) && build.targets.length === 0;
        const a: Ability = {
          kind: 'activated', id: id(0), text: raw,
          confidence: build.ctx.approximate ? 'approximate' : 'exact',
          costs, effects,
        };
        if (build.targets.length) (a as { targets?: TargetSpec[] }).targets = build.targets;
        if (isMana) (a as { isManaAbility?: boolean }).isManaAbility = true;
        if (activation.sorceryOnly) (a as { timing?: 'any' | 'sorcery' }).timing = 'sorcery';
        if (activation.limit) (a as { limit?: { per: 'turn' | 'game'; count: number } }).limit = activation.limit;
        return { rule: isMana ? 'mana-ability' : 'activated', abilities: [a] };
      }
    }
  }

  /* 5. Replacement effects. */
  const replacement = parseReplacement(norm);
  if (replacement) {
    return {
      rule: `replacement:${replacement.result.do}`,
      abilities: [{
        kind: 'replacement', id: id(0), text: raw, confidence: 'exact',
        event: replacement.event, result: replacement.result,
        selfReplacement: replacement.selfReplacement,
        // Present only for the conditional forms ("enters tapped unless ...").
        // Undefined for everything else, so the ability is unchanged.
        ...(replacement.condition ? { condition: replacement.condition } : {}),
      }],
    };
  }

  /* 6. Static abilities. */
  const build = newBuild(shape);
  const stat = parseStatic(norm, build.ctx);
  if (stat) {
    const ability: Ability = {
      kind: 'static', id: id(0), text: raw, confidence: 'exact',
      affects: stat.affects, modifications: stat.modifications,
    };
    // "As long as …". `scanStatics` asks it before handing the effect to the
    // layer engine, so an ability that carries one and an ability that does not
    // take the same path here.
    if (stat.condition) (ability as { condition?: typeof stat.condition }).condition = stat.condition;
    return { rule: `static:${stat.modifications[0].layer}${stat.condition ? '+condition' : ''}`, abilities: [ability] };
  }

  /* 7. Spell abilities — instants and sorceries only. */
  if (/\b(instant|sorcery)\b/.test(typeLine)) {
    const spellBuild = newBuild(shape);
    const effects = compileEffectBody(norm, spellBuild.ctx);
    if (anyAutomated(effects)) {
      const a: Ability = {
        kind: 'spell', id: id(0), text: raw,
        confidence: spellBuild.ctx.approximate ? 'approximate' : 'exact',
        effects,
      };
      if (spellBuild.targets.length) (a as { targets?: TargetSpec[] }).targets = spellBuild.targets;
      return { rule: 'spell', abilities: [a] };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Equip, Reconfigure and Fortify — keyword labels that ARE abilities
 * ------------------------------------------------------------------ */

/**
 * What each of these three keywords attaches to, in the comprehensive rules'
 * own words. `subtype` is the type word the host has to be.
 *
 * They are one shape because the rules make them one shape:
 *
 *   CR 702.6a    "Equip [cost]" means "[cost]: Attach this permanent to target
 *                creature you control. Activate only as a sorcery."
 *   CR 702.66a   "Fortify [cost]" means the same with target land you control.
 *   CR 702.151a  "Reconfigure [cost]" means that PLUS "[cost]: Unattach this
 *                permanent. Activate only as a sorcery."
 *
 * ## Why this is here rather than left as a keyword badge
 *
 * `parseKeywordLine` read "Equip {2}" correctly and produced
 * `{kind:'keyword', keyword:'equip', parameter:'{2}'}` — a LABEL. A label has
 * no costs, no target and no effects, so nothing downstream could offer it,
 * charge for it or run it, and 674 printed equip abilities across the pool were
 * a badge a player could look at and never press. That is the same shape as
 * every other reachability failure on this project: the engine could see it and
 * no path constructed it.
 *
 * Expanding the keyword into the activated ability it is printed shorthand FOR
 * means equip needs no special case anywhere else. `activate.ts` plans it,
 * `AbilityPanel` draws it, `stack.ts` resolves it and `bot.ts` can use it, all
 * because it is an ordinary activated ability with an ordinary cost, ordinary
 * sorcery timing and an ordinary target.
 *
 * Only a plain mana parameter is expanded. "Equip legendary creature {3}" (5
 * cards), "Equip—Pay 3 life." (2) and the rest of the long tail measured over
 * the 38,626-row bulk file do not reach `parseKeywordWithParameter` at all —
 * their line falls through to `unparsed`, which is where it already was, and
 * this changes nothing for them rather than guessing at a restriction it cannot
 * enforce.
 */
const ATTACH_KEYWORDS: Record<string, { subtype: string; unattach: boolean }> = {
  equip: { subtype: 'creature', unattach: false },
  fortify: { subtype: 'land', unattach: false },
  reconfigure: { subtype: 'creature', unattach: true },
};

/**
 * One of those keywords, expanded into the activated ability it stands for, or
 * null when this is an ordinary keyword to be left as a label.
 *
 * `nextId` is a thunk because reconfigure produces TWO abilities and the second
 * one's id depends on the first having been counted.
 */
function attachmentAbilities(
  hit: { keyword: string; parameter?: string },
  raw: string,
  nextId: () => string
): Ability[] | null {
  const shape = ATTACH_KEYWORDS[hit.keyword];
  if (!shape || !hit.parameter) return null;

  const costs = parseCosts(hit.parameter);
  if (!costs) return null;

  const target: TargetSpec = {
    ref: 0,
    what: 'card',
    filter: { is: 'type', value: shape.subtype },
    zone: 'battlefield',
    controller: { who: 'you' },
    min: 1,
    max: 1,
    prompt: `Choose a ${shape.subtype} you control`,
  };

  const attach: Ability = {
    kind: 'activated',
    id: nextId(),
    text: raw,
    confidence: 'exact',
    costs,
    timing: 'sorcery',
    effects: [{ do: 'attach', what: { sel: 'self' }, to: { sel: 'target', ref: 0 } }],
    targets: [target],
  };

  if (!shape.unattach) return [attach];

  return [
    attach,
    {
      kind: 'activated',
      id: nextId(),
      // Reconfigure's second half has no printed line of its own, so the text
      // is the rules' own wording of what this half does rather than a repeat
      // of the keyword. A player reading two identical clauses beside two
      // different buttons would have no way to tell them apart.
      text: `${raw} (unattach)`,
      confidence: 'exact',
      costs,
      timing: 'sorcery',
      effects: [{ do: 'attach', what: { sel: 'self' }, to: { sel: 'none' } }],
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Cycling — the same trick as equip, from the hand instead
 * ------------------------------------------------------------------ */

/**
 * CR 702.29a: "Cycling [cost]" means "[cost], Discard this card: Draw a card."
 * Activated only from hand, and at instant speed.
 *
 * ## Why this is here
 *
 * Exactly the failure `ATTACH_KEYWORDS` above was written to fix, one zone
 * over. `parseKeywordLine` read "Cycling {2}" and produced
 * `{kind:'keyword', keyword:'cycling', parameter:'{2}'}` — a label with no
 * cost, no effect and nothing able to press it. The coverage probe measured
 * 125 cards whose ONLY unreached clause was that label.
 *
 * `activate.ts` already reads `activeZones` (`activeZonesOf`, defaulting to
 * battlefield), and it already pays a `discard` cost. The one thing it did not
 * do was discard THIS card without asking, which `{pay:'discard',
 * what:{sel:'self'}}` now means there. So this expansion needs no new engine
 * concept, in the same way equip's needed none.
 *
 * ## What is deliberately NOT expanded
 *
 * Only bare "Cycling {cost}". Typecycling — "Plainscycling {2}", "Landcycling
 * {1}{G}" and the rest — searches a library instead of drawing, and its keyword
 * is not in `KEYWORDS` at all, so those lines fall through to `unparsed` where
 * they already were. Guessing "draw a card" for them would be worse than
 * leaving them unread, because the player would press a button that did the
 * wrong thing. Same bargain, and the same reason, as "Equip legendary creature
 * {3}".
 *
 * Timing is NOT 'sorcery'. Cycling is an activated ability with no timing
 * restriction, so it defaults to instant speed, which is what `activate.ts`
 * treats an absent `timing` as.
 */
function cyclingAbility(
  hit: { keyword: string; parameter?: string },
  raw: string,
  nextId: () => string
): Ability[] | null {
  if (hit.keyword !== 'cycling' || !hit.parameter) return null;

  const manaCosts = parseCosts(hit.parameter);
  if (!manaCosts) return null;

  return [
    {
      kind: 'activated',
      id: nextId(),
      text: raw,
      confidence: 'exact',
      costs: [...manaCosts, { pay: 'discard', what: { sel: 'self' }, count: 1 }],
      activeZones: ['hand'],
      effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }],
    },
  ];
}

/** Did the paragraph at least LOOK like an ability? Drives `ambiguous` vs `unrecognised`. */
function looksStructured(norm: string): boolean {
  return /^(when|whenever|at the beginning)/.test(norm) || /^[^:"]{1,60}: /.test(norm);
}

/* ------------------------------------------------------------------ *
 * The compiler
 * ------------------------------------------------------------------ */

export interface CompileTrace {
  result: CardAbilities;
  normalized: NormalizedOracle;
  /** Spans of paragraphs turned into abilities. */
  consumedSpans: Array<[number, number]>;
  /** Which rule fired for each consumed paragraph, for the coverage histogram. */
  ruleHits: string[];
}

/** The full compile, with the accounting a test or a coverage report needs. */
export function compileWithTrace(card: AbilityCard): CompileTrace {
  const normalized = normalizeCard(card);
  const abilities: Ability[] = [];
  const unparsed: UnparsedClause[] = [];
  const consumedSpans: Array<[number, number]> = [];
  const ruleHits: string[] = [];

  const shape: CardShape = {
    typeLine: normalized.typeLine,
    printedPower: normalized.printedPower,
    printedToughness: normalized.printedToughness,
  };

  /** An additional cost read but not yet attached to the spell it belongs to. */
  let pendingCost: { costs: Cost[]; span: [number, number]; text: string; norm: string } | null = null;

  const paragraphs = normalized.paragraphs;
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Faces other than the front are a declared gap, never abilities.
    if (para.face > 0) {
      unparsed.push({ text: para.raw, reason: normalized.backFaceReason, span: para.span });
      continue;
    }

    // Modal runs read ahead across paragraphs.
    const modalBuild = newBuild(shape);
    const modal = readModal(paragraphs, i, modalBuild);
    if (modal) {
      const ability = modalAbility(modal, modalBuild, abilities.length, normalized.typeLine);
      if (ability) {
        abilities.push(ability);
        ruleHits.push('modal');
        for (let j = i; j < i + modal.consumed; j++) consumedSpans.push(paragraphs[j].span);
        i += modal.consumed - 1;
        continue;
      }
    }

    /*
     * "As an additional cost to cast this spell, sacrifice a creature."
     *
     * Its own paragraph, printed ABOVE the effect it belongs to, and no rule
     * matched it — so 26 of the 2,000 most played cards read as doing nothing,
     * Village Rites and Deadly Dispute and Crop Rotation among them.
     *
     * Held and attached to the next spell ability rather than made into an
     * ability of its own, because it is not one: it is part of the cost of
     * casting the spell below it, and a record that made it a separate ability
     * would let a consumer count it as a second thing the card does.
     *
     * IT IS ONLY CONSUMED IF IT IS ATTACHED. If no spell ability follows, the
     * paragraph falls through to `unparsed` at the end of the loop, because the
     * whole design rests on consumed spans plus unparsed spans covering every
     * character, and a clause silently held and never used would break that
     * proof in the direction that hides a gap.
     */
    const addCost = para.norm.match(/^as an additional cost to cast (?:this spell|~), (.+?)\.?$/);
    if (addCost && !pendingCost) {
      const parsed = parseCosts(addCost[1]);
      if (parsed && parsed.length) {
        pendingCost = { costs: parsed, span: para.span, text: para.raw, norm: para.norm };
        continue;
      }
    }

    const classified = classify(para, shape, abilities.length);
    if (classified) {
      if (pendingCost) {
        const spell = classified.abilities.find(a => a.kind === 'spell');
        if (spell) {
          (spell as { additionalCosts?: Cost[] }).additionalCosts = pendingCost.costs;
          /*
           * AND A MARKER, because NOTHING PAYS IT.
           *
           * Costs are paid on announcement and `announce.ts` has no cost step;
           * `planActivation` in `activate.ts` is the only cost machinery in the
           * engine and it serves activated abilities. So a spell ability that
           * resolved from this record would draw the two cards and never eat
           * the creature, and Village Rites went from `manual` — a player doing
           * all of it by hand, correctly — to a card the engine casts for free.
           *
           * That is the exact failure the whole compiler is built to refuse: a
           * card that appears to resolve and does the wrong thing. Reading the
           * cost is worth doing anyway, because the deck builder needs
           * `cost:sacrifice` and the deck builder never pays anything; the
           * marker is what keeps the RUNTIME honest about the half it cannot do.
           *
           * `deriveCoverage` turns this into `partial`, which is the true
           * description: every word was read, and a human is needed for one of
           * them. Delete this line the day the cast path can pay a cost, and
           * not before.
           */
          (spell as { effects: Effect[] }).effects.unshift(
            manual(
              `Pay the additional cost to cast ${String(card.name ?? 'this spell')}: ${pendingCost.norm
                .replace(/^as an additional cost to cast (?:this spell|~), /, '')
                .replace(/\.$/, '')}.`,
              'The engine reads this cost but cannot pay it yet, so do it by hand before the spell resolves.'
            )
          );
          consumedSpans.push(pendingCost.span);
          ruleHits.push('additional-cost');
          pendingCost = null;
        }
      }
      abilities.push(...classified.abilities);
      ruleHits.push(classified.rule);
      consumedSpans.push(para.span);
      continue;
    }

    unparsed.push({
      text: para.raw,
      reason: gapReasonFor(para.norm, looksStructured(para.norm)),
      span: para.span,
    });
  }

  /* An additional cost with nothing to attach to. Reported unread, which is
     what it is: the cost was understood and the spell it modifies was not, so
     claiming the card is read would be the lie the span proof exists to stop. */
  if (pendingCost) {
    unparsed.push({
      text: pendingCost.text,
      reason: gapReasonFor(pendingCost.norm, looksStructured(pendingCost.norm)),
      span: pendingCost.span,
    });
  }

  /*
   * Derived ONCE, here, from this function's own two lists, and read twice
   * below under two different names. `compilerCoverage` is the value the
   * precedence rule tests and it is never recomputed; `coverage` is the
   * record's description of itself and the swap does rewrite it.
   */
  const compilerCoverage = deriveCoverage(abilities, unparsed);

  const result: CardAbilities = {
    oracleId: abilityKey(card),
    name: String(card.name ?? ''),
    abilities,
    unparsed,
    source: 'compiler',
    oracleHash: normalized.hash,
    coverage: compilerCoverage,
    compilerCoverage,
  };

  /*
   * THE SECOND SOURCE, and the only place it is allowed in.
   *
   * `src/lib/cards/xmage/` holds thousands of cards' behaviour, already lowered into
   * the `Ability` shapes below, and `docs/engine/PORT-LOG.md` recorded that
   * nothing outside that folder imported it, so the shipped app played 0 cards
   * from it. This is the import. It goes HERE, in `compileWithTrace`, and not
   * in `card-abilities.ts` one layer up, for the reason `card-abilities.ts`'s
   * own header gives: there is exactly one classifier per card and no second
   * one to drift from it. A fallback wired above the compiler would be a second
   * classifier, and the coverage report — which calls this function directly —
   * would not have been able to see it.
   *
   * The precedence rule, the argument for it, and the three bars it refuses on
   * are all in `../xmage/lowered.ts`. The short version is that the compiler
   * wins whenever it fully understands the card, so the line below can only
   * ever fire on a card this function has already marked incomplete.
   *
   * The rule reads `result.compilerCoverage`, which is the value computed above
   * and which the swap below does not touch. `result.coverage` IS rewritten by
   * the swap, so asking the rule a second time on a finished record used to
   * reverse its answer on every swapped card. It no longer can: put a swapped
   * record back in and the rule reads the same `compilerCoverage` it read the
   * first time and reaches the same decision.
   */
  const decision = xmageSwapFor(result, normalized);
  if ('swap' in decision) {
    const swapped: CardAbilities = {
      ...result,
      abilities: decision.swap.abilities,
      unparsed: [],
      source: 'xmage',
      /*
       * Recomputed on purpose, and it means something different from the value
       * it replaces: "the ported record accounts for this whole card", not "the
       * compiler read this whole card". `compilerCoverage` is spread through
       * from `result` above and still carries the second meaning, so both are
       * on the record and neither has to be inferred from the other.
       */
      coverage: deriveCoverage(decision.swap.abilities, []),
    };
    return {
      result: swapped,
      normalized,
      consumedSpans: decision.swap.consumed,
      ruleHits: ['xmage'],
    };
  }

  return { result, normalized, consumedSpans, ruleHits };
}

/** A modal run becomes a spell ability or a triggered one, depending on its prefix. */
function modalAbility(modal: ModalRun, build: AbilityBuild, idAt: number, typeLine: string): Ability | null {
  const id = `a${idAt}`;
  const confidence = build.ctx.approximate ? 'approximate' : 'exact';
  const prefix = modal.prefix.trim();

  if (!prefix) {
    if (!/\b(instant|sorcery)\b/.test(typeLine)) return null;
    const a: Ability = { kind: 'spell', id, text: modal.text, confidence, effects: [modal.effect] };
    if (build.targets.length) (a as { targets?: TargetSpec[] }).targets = build.targets;
    return a;
  }

  const trigger = prefix.match(/^(when|whenever|at) (.+?),$/);
  if (!trigger) return null;
  const phrase = trigger[1] === 'at' ? `at ${trigger[2]}` : trigger[2];
  const events = parseTriggerEvent(phrase, build.ctx);
  if (!events || !events.length) return null;
  const a: Ability = { kind: 'triggered', id, text: modal.text, confidence, event: events[0], effects: [modal.effect] };
  if (build.targets.length) (a as { targets?: TargetSpec[] }).targets = build.targets;
  return a;
}

/** The compile, without the trace. */
export function compileCardAbilities(card: AbilityCard): CardAbilities {
  return compileWithTrace(card).result;
}

/* ------------------------------------------------------------------ *
 * The no-silent-drop proof
 * ------------------------------------------------------------------ */

/**
 * Asserts that consumed spans plus unparsed spans cover every non-blank
 * character of the normalised text, and that no character is covered twice.
 *
 * This is the assertion the whole design leans on. Without it, "nothing is ever
 * skipped" is a claim about code that nobody re-reads; with it, a rule that
 * quietly swallows a clause is a failing test on the next run. It is cheap
 * enough to run over the entire 34,088-row catalogue, and `coverage.ts` does.
 */
export function assertClausesAccounted(trace: CompileTrace): void {
  const text = trace.normalized.text;
  const covered = new Uint8Array(text.length);

  const mark = (span: [number, number], what: string): void => {
    for (let i = span[0]; i < span[1]; i++) {
      if (covered[i]) throw new Error(`double-counted character ${i} (${what}) in: ${text.slice(span[0], span[1])}`);
      covered[i] = 1;
    }
  };

  for (const span of trace.consumedSpans) mark(span, 'consumed');
  for (const clause of trace.result.unparsed) mark(clause.span, 'unparsed');

  for (let i = 0; i < text.length; i++) {
    if (covered[i]) continue;
    if (/\s/.test(text[i])) continue; // paragraph separators are structure, not content
    const from = Math.max(0, i - 20);
    throw new Error(`unaccounted character ${i} near "${text.slice(from, i + 40)}" in ${trace.result.name}`);
  }
}

/* ------------------------------------------------------------------ *
 * Re-exports so callers need one import
 * ------------------------------------------------------------------ */

export { manual, hasManualEffect, namedManual };
export type { AbilityCard, CardAbilities };
