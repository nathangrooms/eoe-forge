/**
 * Oracle text -> `CardAbilities`.
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
  Effect,
  GapReason,
  TargetSpec,
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
} from './clause-rules.ts';

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

function newBuild(typeLine: string): AbilityBuild {
  const targets: TargetSpec[] = [];
  const ctx: BuildCtx = {
    typeLine,
    approximate: false,
    addTarget(spec) {
      const ref = targets.length;
      targets.push({ ...spec, ref } as TargetSpec);
      return ref;
    },
  };
  return { ctx, targets };
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
function classify(para: Paragraph, typeLine: string, idAt: number): Classified | null {
  const norm = para.norm;
  const raw = para.raw;
  const id = (n: number) => `a${idAt + n}`;

  /* 1. Keyword lines. */
  const keywords = parseKeywordLine(norm);
  if (keywords) {
    return {
      rule: 'keyword-line',
      abilities: keywords.map((k, n) => {
        const a: Ability = { kind: 'keyword', id: id(n), text: raw, confidence: 'exact', keyword: k.keyword };
        if (k.parameter) (a as { parameter?: string }).parameter = k.parameter;
        return a;
      }),
    };
  }

  /* 2. Loyalty abilities. */
  const loyalty = norm.match(/^([+-]?\d+): (.+)$/);
  if (loyalty && /planeswalker/.test(typeLine)) {
    const costs = parseLoyaltyCost(loyalty[1]);
    if (costs) {
      const build = newBuild(typeLine);
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
    const build = newBuild(typeLine);
    const phrase = trigger[1] === 'at' ? `at ${trigger[2]}` : trigger[2];
    const events = parseTriggerEvent(phrase, build.ctx);
    if (events) {
      const effects = compileEffectBody(trigger[3], build.ctx);
      const confidence = build.ctx.approximate ? 'approximate' : 'exact';
      const abilities = events.map((event, n) => {
        const a: Ability = { kind: 'triggered', id: id(n), text: raw, confidence, event, effects };
        if (build.targets.length) (a as { targets?: TargetSpec[] }).targets = build.targets;
        return a;
      });
      return { rule: `trigger:${events[0].on}`, abilities };
    }
  }

  /* 4. Activated abilities. A quote mark means the colon belongs to a granted
        ability, which is the declared `granted-ability` gap, not a cost. */
  const activated = norm.match(/^([^:"]+): (.+)$/);
  if (activated && !/"/.test(norm)) {
    const costs = parseCosts(activated[1]);
    if (costs) {
      const build = newBuild(typeLine);
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
      }],
    };
  }

  /* 6. Static abilities. */
  const build = newBuild(typeLine);
  const stat = parseStatic(norm, build.ctx);
  if (stat) {
    return {
      rule: `static:${stat.modifications[0].layer}`,
      abilities: [{
        kind: 'static', id: id(0), text: raw, confidence: 'exact',
        affects: stat.affects, modifications: stat.modifications,
      }],
    };
  }

  /* 7. Spell abilities — instants and sorceries only. */
  if (/\b(instant|sorcery)\b/.test(typeLine)) {
    const spellBuild = newBuild(typeLine);
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

  const paragraphs = normalized.paragraphs;
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Faces other than the front are a declared gap, never abilities.
    if (para.face > 0) {
      unparsed.push({ text: para.raw, reason: normalized.backFaceReason, span: para.span });
      continue;
    }

    // Modal runs read ahead across paragraphs.
    const modalBuild = newBuild(normalized.typeLine);
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

    const classified = classify(para, normalized.typeLine, abilities.length);
    if (classified) {
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

  const result: CardAbilities = {
    oracleId: abilityKey(card),
    name: String(card.name ?? ''),
    abilities,
    unparsed,
    source: 'compiler',
    oracleHash: normalized.hash,
    coverage: deriveCoverage(abilities, unparsed),
  };

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
