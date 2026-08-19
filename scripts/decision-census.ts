/**
 * scripts/decision-census.ts — where the line between AUTOMATED and PROMPTED
 * actually falls, measured rather than estimated.
 *
 *   node --experimental-strip-types scripts/decision-census.ts
 *   node --experimental-strip-types scripts/decision-census.ts --samples may.you
 *   node --experimental-strip-types scripts/decision-census.ts --card "Aether Vial"
 *
 * Runs on the local Scryfall bulk file only. No database, no network at run
 * time, no model. Same pool filter as scripts/clause-census.mjs, so the two
 * reports have the same denominator and can be read side by side.
 *
 * ------------------------------------------------------------------
 * WHY THIS IS TWO MEASUREMENTS AND NOT ONE
 *
 * "Does this card need a human?" and "does our engine understand this card?"
 * are different questions and mixing them is how a coverage number becomes a
 * lie. So the script answers both separately and then crosses them.
 *
 *   PART A — TEXT. A deterministic scan of oracle text for the constructions
 *            that require a decision. It knows nothing about our engine. It is
 *            a property of Magic, and it will still be true in five years.
 *
 *   PART B — ENGINE. The real ability compiler from src/lib/cards/abilities is
 *            run over the same pool, and every card is sorted by what the
 *            engine would actually do with it: resolve it, ask for a decision
 *            it can name, or fail to read it.
 *
 * Part A gives the CEILING (what can ever be automatic). Part B gives TODAY.
 *
 * ------------------------------------------------------------------
 * TWO BANDS, BECAUSE "NEEDS A DECISION" IS NOT ONE THING
 *
 *   ALWAYS      — the card asks a human every single time it resolves and no
 *                 board state removes the question. "You may draw a card" asks
 *                 even on an empty board. These can never be automated. Not
 *                 "hard to automate": automating them is a rules violation.
 *
 *   CONDITIONAL — the card asks only when more than one legal option exists.
 *                 "Destroy target creature" asks nothing when there is exactly
 *                 one creature, and asks a real question when there are six.
 *                 An engine may auto-resolve the single-option case, and MUST
 *                 ask otherwise. This band is the swing, and it is large.
 *
 * A card in neither band has no decision in its text at all, and is therefore
 * automatable in principle. That residual is the honest ceiling.
 *
 * ------------------------------------------------------------------
 * WHAT THIS SCRIPT DELIBERATELY DOES NOT CLAIM
 *
 * It does not claim a prompt exists for anything. Every count here is "the text
 * requires a decision of this kind". Whether the interface offers that decision
 * is a separate fact and is reported separately in PART C, which reads the
 * engine's own type space rather than the card pool.
 *
 * It does not read keywords out of prose. Optional costs and alternate casting
 * costs come from Scryfall's own `keywords` array, which is maintained by
 * people who read the actual rules, and is far better than a regex over text.
 */

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import type { AbilityCard } from '../src/lib/cards/abilities/normalize.ts';
import type { Ability, Effect, CardAbilities, TriggeredAbility } from '../src/lib/cards/abilities/dsl.ts';
import { effectsOf } from '../src/lib/cards/abilities/dsl.ts';
// The game engine's own gate. `abilityEngineOwns` is this plus "coverage is
// full", and it is the only number that describes what happens in a real game.
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'decision-census.json');

/* ------------------------------------------------------------------ *
 * Pool — identical filter to scripts/clause-census.mjs
 * ------------------------------------------------------------------ */

const EXCLUDED_LAYOUTS = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'front_card']);
const EXCLUDED_LAYOUTS_NON_GAME = new Set(['vanguard', 'scheme', 'planar']);
const EXCLUDED_SET_TYPES = new Set(['memorabilia', 'token']);

interface ScryRow extends AbilityCard {
  set_type?: string;
  digital?: boolean;
  games?: string[];
  layout?: string;
  keywords?: string[];
  name?: string;
  mana_cost?: string;
  card_faces?: Array<{ name?: string; oracle_text?: string; mana_cost?: string; type_line?: string }>;
}

async function* rows(path: string): AsyncGenerator<ScryRow> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line) as ScryRow;
}

/* ------------------------------------------------------------------ *
 * Text preparation
 *
 * Reminder text is dropped, because reminder text is full of the word "may"
 * and counting it would inflate every optional bucket. The card's own name is
 * blanked, because "Ayula's Influence" contains no decision but "Choose" does
 * appear in card names. Both are the same two lessons normalize.ts learned.
 * ------------------------------------------------------------------ */

function dropReminders(text: string): string {
  let out = text;
  for (let i = 0; i < 6; i++) {
    const next = out.replace(/\([^()]*\)/g, ' ');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Every face's text, joined. A modal on the back of a card is still a modal. */
function allText(card: ScryRow): string {
  const faces = Array.isArray(card.card_faces) && card.card_faces.length
    ? card.card_faces.map(f => ({ text: f.oracle_text ?? '', name: f.name ?? card.name ?? '' }))
    : [{ text: card.oracle_text ?? '', name: card.name ?? '' }];

  const names = new Set<string>();
  if (card.name) names.add(card.name);
  for (const f of card.card_faces ?? []) if (f.name) names.add(f.name);
  // Longest first, so "Jace, the Mind Sculptor" is blanked before "Jace".
  const ordered = [...names].sort((a, b) => b.length - a.length);

  return faces
    .map(f => {
      let s = dropReminders(f.text);
      for (const n of ordered) s = s.split(n).join('~');
      return s;
    })
    .join('\n')
    .toLowerCase();
}

/** Every mana cost on the card, front and back. */
function allCost(card: ScryRow): string {
  if (Array.isArray(card.card_faces) && card.card_faces.length) {
    return card.card_faces.map(f => f.mana_cost ?? '').join('');
  }
  return card.mana_cost ?? '';
}

/* ------------------------------------------------------------------ *
 * Keyword vocabularies, taken from Scryfall's own `keywords` array
 *
 * Split by WHAT THE DECISION IS, not by rules-text family, because the prompt
 * the interface has to build is different for each of the three.
 * ------------------------------------------------------------------ */

/**
 * Optional ADDITIONAL cost. The spell is cast either way; paying buys extra.
 * The prompt is a yes/no (or a number, for the repeatable ones) asked at
 * announcement, before any mana is paid.
 */
const KW_OPTIONAL_EXTRA = new Set([
  'kicker', 'multikicker', 'buyback', 'entwine', 'escalate', 'replicate',
  'conspire', 'casualty', 'bargain', 'spree', 'splice', 'offering',
  'awaken', 'surge', 'strive',
]);

/**
 * ALTERNATIVE or additional way to cast. The prompt is "which way", asked
 * before the spell exists, and it changes cost, timing and zone.
 */
const KW_ALT_CAST = new Set([
  'flashback', 'jump-start', 'embalm', 'eternalize', 'unearth', 'dash', 'blitz',
  'plot', 'disturb', 'aftermath', 'foretell', 'madness', 'miracle', 'morph',
  'megamorph', 'disguise', 'evoke', 'prowl', 'spectacle', 'emerge', 'overload',
  'escape', 'bestow', 'channel', 'cycling', 'transmute', 'forecast', 'adventure',
  'encore', 'demonstrate', 'freerunning', 'impending', 'warp', 'harmonize',
  'gift', 'craft', 'prototype', 'suspend', 'rebound',
]);

/** Repeatable optional cost — the prompt is a number, not a yes/no. */
const KW_NUMERIC_OPTIONAL = new Set(['multikicker', 'replicate', 'strive', 'spree', 'escalate']);

/* ------------------------------------------------------------------ *
 * PART A — the detectors
 *
 * Every one is a plain regex over prepared text, every one is named, and every
 * one can be sampled with --samples <id> so a reader can check it rather than
 * trust it. That flag is not a convenience, it is the audit trail.
 * ------------------------------------------------------------------ */

type Band = 'always' | 'conditional';

interface Detector {
  id: string;
  band: Band;
  /** What the interface has to put in front of a player. */
  label: string;
  test: (t: string, card: ScryRow, cost: string) => boolean;
}

/** "may" occurrences that are not "you may" — somebody else is being asked. */
const MAY = /\bmay\b/g;
function otherMay(t: string): boolean {
  for (const m of t.matchAll(MAY)) {
    const before = t.slice(Math.max(0, m.index - 4), m.index);
    if (!/you $/.test(before)) return true;
  }
  return false;
}

const DETECTORS: Detector[] = [
  /* --- ALWAYS: no board state removes the question --- */
  {
    id: 'may.you',
    band: 'always',
    label: 'you may — controller says yes or no',
    test: t => /\byou may\b/.test(t),
  },
  {
    id: 'may.other',
    band: 'always',
    label: 'someone else may — a player who is not the controller says yes or no',
    test: t => otherMay(t),
  },
  {
    id: 'modal',
    band: 'always',
    label: 'modal — pick which of the printed modes happen',
    test: t => /\bchoose (one|two|three|four|one or both|one or more|two or more|any number)\b/.test(t) || /(^|\n)\s*•/.test(t),
  },
  {
    id: 'upto',
    band: 'always',
    label: 'up to N — pick how many, zero allowed',
    test: t => /\bup to (a |an |one|two|three|four|five|six|seven|eight|nine|ten|x\b|\d+|that many|the number|the amount)/.test(t),
  },
  {
    id: 'choose.other',
    band: 'always',
    label: 'choose something not printed on the card — a colour, a type, a number, a pile',
    // Modal has its own bucket, so this one is everything else the word covers.
    test: t => /\bchoos(e|es|en|ing)\b/.test(t) && !/\bchoose (one|two|three|four|one or both|one or more|two or more|any number)\b/.test(t),
  },
  {
    id: 'choose.byOpponent',
    band: 'always',
    // The hardest prompt to build: it interrupts a player who is not the one
    // acting, so a shared screen has to hand over and hand back.
    label: 'a player who is not the controller makes the choice',
    test: t => /\b(an opponent|target opponent|each opponent|another player|that player|target player|each player|each other player|the defending player|its controller|that creature's controller|the chosen player)\s+(chooses|choose|may)\b/.test(t),
  },
  {
    id: 'divide',
    band: 'always',
    label: 'divided as you choose — assign an amount across recipients',
    test: t => /\b(divided|distributed|divide|distribute)\b[^.]{0,40}\bas you choose\b/.test(t) || /\bas you choose\b/.test(t),
  },
  {
    id: 'unless.pays',
    band: 'always',
    label: 'pay mana or decline — a yes/no with a price on it',
    test: t => /\bunless\b[^.]{0,80}\bpays?\b/.test(t),
  },
  {
    id: 'unless.doesSomething',
    band: 'always',
    // Found by reading the residual: Vapor Snare says "sacrifice this Aura
    // unless you return a land you control to its owner's hand". Same yes/no
    // shape, no mana in it, and the mana-only regex missed every one.
    label: 'do something or decline — a yes/no whose price is not mana',
    test: t => /\bunless\b[^.]{0,90}\b(sacrifices?|discards?|returns?|exiles?|reveals?|removes?|taps?)\b/.test(t),
  },
  {
    id: 'mana.choice',
    band: 'always',
    // "Add one mana of any color" and "{T}: Add {U} or {B}" both ask which
    // colour, every single time, on a card the player taps constantly. Missing
    // this would have understated the most-used prompt in the game.
    label: 'which colour of mana this produces',
    test: t => /\badds?\b[^.]{0,40}\bmana of any (one )?colou?r\b/.test(t)
      || /\badds?\b[^.]{0,30}\{[wubrgc]\}[^.]{0,20}\bor\b\s*\{/.test(t),
  },
  {
    id: 'name.card',
    band: 'always',
    label: 'name a card — free text against the whole card pool',
    test: t => /\bnames? a card\b/.test(t) || /\bchoose a card name\b/.test(t),
  },
  {
    id: 'order',
    band: 'always',
    label: 'put these in an order you pick',
    test: t => /\bin any order\b/.test(t),
  },
  {
    id: 'cost.x',
    band: 'always',
    label: 'X — pick a number, then pay for it',
    test: (t, _card, cost) => /\{x\}/i.test(cost) || /\{x\}/.test(t),
  },
  {
    id: 'kw.optionalExtra',
    band: 'always',
    label: 'optional extra cost on the way in (kicker and family)',
    test: (_t, card) => (card.keywords ?? []).some(k => KW_OPTIONAL_EXTRA.has(k.toLowerCase())),
  },
  {
    id: 'kw.altCast',
    band: 'always',
    label: 'another way to cast it (flashback and family)',
    test: (_t, card) => (card.keywords ?? []).some(k => KW_ALT_CAST.has(k.toLowerCase())),
  },
  {
    id: 'kw.numericOptional',
    band: 'always',
    label: 'repeatable optional cost — the answer is a number',
    test: (_t, card) => (card.keywords ?? []).some(k => KW_NUMERIC_OPTIONAL.has(k.toLowerCase())),
  },

  /* --- CONDITIONAL: only asks when more than one option is legal --- */
  {
    id: 'target.any',
    band: 'conditional',
    label: 'targets something — asks when more than one legal target exists',
    test: t => /\btargets?\b/.test(t),
  },
  {
    id: 'target.multi',
    band: 'conditional',
    label: 'names target more than once — also an assignment, not just a pick',
    test: t => (t.match(/\btargets?\b/g) ?? []).length > 1,
  },
  {
    id: 'discard',
    band: 'conditional',
    // "Discard your hand" and "discard at random" are not decisions and are
    // excluded on purpose. Only a counted discard asks which card.
    label: 'discard a counted number — which card leaves the hand',
    test: t => /\bdiscards? (a|an|two|three|four|five|six|seven|\d+|that many|x |any number of)\b/.test(t) && !/\bat random\b/.test(t),
  },
  {
    id: 'sacrifice',
    band: 'conditional',
    // "Sacrifice this creature" has exactly one legal option and is not a
    // decision. "Sacrifice all" is not either. Only a counted, filtered
    // sacrifice asks which permanent.
    label: 'sacrifice a counted number — which permanent dies',
    test: t => /\bsacrifices? (a|an|another|two|three|four|five|\d+|that many|x |any number of|all but one)\b/.test(t),
  },
  {
    id: 'search',
    band: 'conditional',
    label: 'search a library or graveyard — which card comes out',
    test: t => /\bsearch(es)? (your|their|a|that player's|his or her|target player's|each player's)\b/.test(t),
  },
  {
    id: 'look.keep',
    band: 'conditional',
    label: 'look then decide — scry, surveil, explore, reveal and keep',
    test: t => /\bscry \d|\bsurveil \d|\bexplores?\b|\blook at the top\b|\blooks at the top\b/.test(t),
  },
  {
    id: 'attach.pick',
    band: 'conditional',
    // An Aura, Equipment or Vehicle never says the word "target" on its keyword
    // line, so the target detector misses all of them. Choosing what to enchant
    // or equip is a decision, and it happens on nearly every Aura ever printed.
    label: 'pick what to attach it to — aura, equipment, fortification',
    test: t => /(^|\n)enchant /.test(t) || /\bequip\b/.test(t) || /\breconfigure\b/.test(t) || /\bfortify\b/.test(t) || /\bbestow\b/.test(t),
  },
  {
    id: 'payWithPermanents',
    band: 'conditional',
    // Crew, convoke, delve and their family are paid by choosing WHICH cards or
    // permanents to spend. The cost line looks fixed and the payment is not.
    label: 'pick which cards or creatures pay the cost — crew, convoke, delve',
    test: (t, card) => (card.keywords ?? []).some(k =>
      ['crew', 'convoke', 'delve', 'improvise', 'emerge', 'escape', 'exploit', 'offering'].includes(k.toLowerCase())
    ) || /\btap any number of\b/.test(t),
  },
  {
    id: 'putOntoBattlefield.pick',
    band: 'conditional',
    label: 'return from a graveyard — which one comes back',
    test: t => /\breturns? (target |a |an |up to |all )?[^.]{0,30}\bfrom (your|their|a|his or her) graveyard\b/.test(t),
  },
  {
    id: 'bounce.pick',
    band: 'conditional',
    // Azorius Chancery says "return a land you control to its owner's hand".
    // No "target", no graveyard, and a real choice on every karoo land.
    label: 'return one of your own permanents to hand — which one',
    test: t => /\breturns? (a|an|two|three|\d+|another)\b[^.]{0,40}\byou control\b[^.]{0,30}\bto (its|their) owner's hand\b/.test(t),
  },
  {
    id: 'fromAmong',
    band: 'conditional',
    // "Put a creature card from among them onto the battlefield" — the pile is
    // built by the card and the pick out of it is the player's.
    label: 'pick out of a pile the card just made — from among them',
    test: t => /\bfrom among (them|the|those)\b/.test(t),
  },
  {
    id: 'kw.payOrLose',
    band: 'always',
    // Echo and cumulative upkeep are a yes/no every upkeep with the permanent
    // as the stake. The reminder text carries the "unless" and reminder text is
    // stripped, so the prose detectors never see them.
    label: 'pay each upkeep or lose it — echo, cumulative upkeep',
    test: (t, card) => (card.keywords ?? []).some(k =>
      ['echo', 'cumulative upkeep', 'suspend'].includes(k.toLowerCase())
    ),
  },
];

/* ------------------------------------------------------------------ *
 * PART B — what the engine itself would do
 *
 * Walks the compiled ability tree looking for the three decision-bearing
 * members the DSL already has, plus the marker that means "not understood".
 * ------------------------------------------------------------------ */

interface EngineFlags {
  may: boolean;
  chooseMode: boolean;
  unlessPays: boolean;
  manual: boolean;
  optionalTrigger: boolean;
  targeted: boolean;
}

function walk(effects: readonly Effect[], flags: EngineFlags): void {
  for (const e of effects) {
    switch (e.do) {
      case 'may':
        flags.may = true;
        walk(e.effects, flags);
        break;
      case 'choose-mode':
        flags.chooseMode = true;
        for (const m of e.modes) walk(m.effects, flags);
        break;
      case 'unless-pays':
        flags.unlessPays = true;
        walk(e.effects, flags);
        break;
      case 'manual':
        flags.manual = true;
        break;
      case 'if':
        walk(e.then, flags);
        if (e.else) walk(e.else, flags);
        break;
      case 'for-each':
      case 'repeat':
        walk(e.effects, flags);
        break;
      default:
        break;
    }
  }
}

function engineFlagsOf(result: CardAbilities): EngineFlags {
  const flags: EngineFlags = {
    may: false, chooseMode: false, unlessPays: false,
    manual: false, optionalTrigger: false, targeted: false,
  };
  for (const a of result.abilities as Ability[]) {
    walk(effectsOf(a), flags);
    if (a.kind === 'triggered' && a.optional) flags.optionalTrigger = true;
    const targets = (a as { targets?: unknown[] }).targets;
    if (Array.isArray(targets) && targets.length) flags.targeted = true;
  }
  return flags;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const argOf = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
};
const sampleId = argOf('--samples');
const cardArg = argOf('--card');

const pool: ScryRow[] = [];
const excluded = { layoutNotACard: 0, layoutNonGame: 0, setTypeExtra: 0, digitalOnly: 0, notPaper: 0 };
let fileRows = 0;

for await (const card of rows(SRC)) {
  fileRows++;
  if (EXCLUDED_LAYOUTS.has(card.layout ?? '')) { excluded.layoutNotACard++; continue; }
  if (EXCLUDED_SET_TYPES.has(card.set_type ?? '')) { excluded.setTypeExtra++; continue; }
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout ?? '')) { excluded.layoutNonGame++; continue; }
  if (card.digital) { excluded.digitalOnly++; continue; }
  if (!(card.games ?? []).includes('paper')) { excluded.notPaper++; continue; }
  pool.push(card);
}

/* --- PART A --- */

const hitCount: Record<string, number> = {};
const samples: Record<string, string[]> = {};
for (const d of DETECTORS) { hitCount[d.id] = 0; samples[d.id] = []; }

let withText = 0;
let noDecisionAtAll = 0;
let alwaysBand = 0;
let conditionalOnly = 0;
/** How many ALWAYS-band kinds one card stacks up. A card can need four prompts. */
const alwaysKindsPerCard: Record<number, number> = {};

const perCard = new Map<string, { always: string[]; conditional: string[] }>();
/** Cards that matched nothing but still have rules text. Read these by hand. */
const residualSample: string[] = [];

for (const card of pool) {
  const t = allText(card);
  const cost = allCost(card);
  if (t.trim()) withText++;

  const always: string[] = [];
  const conditional: string[] = [];

  for (const d of DETECTORS) {
    if (!d.test(t, card, cost)) continue;
    hitCount[d.id]++;
    if (samples[d.id].length < 400) samples[d.id].push(card.name ?? '?');
    (d.band === 'always' ? always : conditional).push(d.id);
  }

  perCard.set(card.oracle_id ?? card.name ?? String(Math.random()), { always, conditional });

  // The residual is the ceiling claim, so it is the bucket most worth reading
  // by hand. Keep a sample of the ones that also carry real rules text.
  if (!always.length && !conditional.length && t.trim() && residualSample.length < 4000) {
    residualSample.push(`${card.name}  ::  ${t.replace(/\n/g, ' | ').slice(0, 150)}`);
  }

  if (always.length) alwaysBand++;
  else if (conditional.length) conditionalOnly++;
  else noDecisionAtAll++;

  const k = always.length;
  alwaysKindsPerCard[k] = (alwaysKindsPerCard[k] ?? 0) + 1;
}

/* --- PART B --- */

interface EngineBuckets {
  compiled: number;
  full: number;
  partial: number;
  none: number;
  /** coverage full AND no decision-bearing effect: the engine finishes it alone. */
  fullAutomatic: number;
  /** coverage full BUT carries may / choose-mode / unless-pays / optional trigger. */
  fullNeedsPrompt: number;
  /** anything the compiler could not fully read. */
  notUnderstood: number;
  /** cards with no compiled abilities at all and text present. */
  textButNoAbility: number;
  byDecisionKind: Record<string, number>;
  errors: number;

  /* --- the decomposition that stops "coverage full" being read as "it runs" --- */
  /** No rules text at all. Trivially finished: a 2/2 bear does nothing and that is correct. */
  blank: number;
  /** coverage full, and every ability is a keyword or a static. Nothing to execute. */
  fullNothingToRun: number;
  /** coverage full and carries at least one triggered / activated / spell / mana ability. */
  fullHasBody: number;
  /** The game engine's own gate: full, has triggers, every trigger runnable. */
  engineOwns: number;
  /** Why a triggered ability on an otherwise-full card is still not run. */
  unrunnable: Record<string, number>;
  /** Of `engineOwns`, how many fire and then print a note instead of doing it. */
  ownedButResolvesToANote: number;
  /** Cards blocked from `engineOwns` purely because a trigger cannot carry targets. */
  blockedOnTargetsOnly: number;
  /** Cards blocked purely because the trigger is optional ("you may"). */
  blockedOnOptionalOnly: number;
}

const eng: EngineBuckets = {
  compiled: 0, full: 0, partial: 0, none: 0,
  fullAutomatic: 0, fullNeedsPrompt: 0, notUnderstood: 0, textButNoAbility: 0,
  byDecisionKind: {}, errors: 0,
  blank: 0, fullNothingToRun: 0, fullHasBody: 0, engineOwns: 0, ownedButResolvesToANote: 0,
  unrunnable: {}, blockedOnTargetsOnly: 0, blockedOnOptionalOnly: 0,
};

/** Cross-tab: engine verdict against the text bands. */
const cross: Record<string, number> = {};
const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

for (const card of pool) {
  let result: CardAbilities;
  try {
    result = compileWithTrace(card as AbilityCard).result;
  } catch {
    eng.errors++;
    continue;
  }
  eng.compiled++;
  const cov = result.coverage;
  if (cov === 'full') eng.full++;
  else if (cov === 'none') eng.none++;
  else eng.partial++;

  const t = allText(card);
  if (t.trim() && result.abilities.length === 0) eng.textButNoAbility++;

  const flags = engineFlagsOf(result);
  const needsPrompt = flags.may || flags.chooseMode || flags.unlessPays || flags.optionalTrigger;

  if (flags.may) bump(eng.byDecisionKind, 'may');
  if (flags.chooseMode) bump(eng.byDecisionKind, 'choose-mode');
  if (flags.unlessPays) bump(eng.byDecisionKind, 'unless-pays');
  if (flags.optionalTrigger) bump(eng.byDecisionKind, 'optional trigger');
  if (flags.targeted) bump(eng.byDecisionKind, 'has a target spec');

  if (!t.trim()) eng.blank++;

  if (cov !== 'full') eng.notUnderstood++;
  else if (needsPrompt) eng.fullNeedsPrompt++;
  else eng.fullAutomatic++;

  /* --- "coverage full" is not "the engine runs it". Decompose it. --- */
  if (cov === 'full') {
    const kinds = new Set((result.abilities as Ability[]).map(a => a.kind));
    const hasBody = ['triggered', 'activated', 'spell', 'mana'].some(k => kinds.has(k as Ability['kind']));
    if (hasBody) eng.fullHasBody++;
    else eng.fullNothingToRun++;

    const triggered = (result.abilities as Ability[]).filter(
      (a): a is TriggeredAbility => a.kind === 'triggered'
    );
    if (triggered.length) {
      const reasons = triggered.map(a => unrunnableReason(a));
      for (const r of reasons) if (r) bump(eng.unrunnable, r.replace(/"[^"]*"/g, '"…"'));
      if (reasons.every(r => r === null)) {
        eng.engineOwns++;
        // The 877 is not 877 cards that fully resolve. `unrunnableReason` lets
        // a `may` or a `choose-mode` through — the DSL's `optional` flag on a
        // trigger is declared and never set by the compiler, so "you may" lands
        // inside the body as an effect instead of on the ability. At resolution
        // to-actions.ts turns it into a NOTE. The card is owned, it fires, and
        // the effect does not happen. That subset is counted here.
        const f: EngineFlags = {
          may: false, chooseMode: false, unlessPays: false,
          manual: false, optionalTrigger: false, targeted: false,
        };
        for (const a of triggered) walk(a.effects, f);
        if (f.may || f.chooseMode || f.unlessPays) eng.ownedButResolvesToANote++;
      }
      else {
        const bad = reasons.filter((r): r is string => r !== null);
        if (bad.every(r => r.includes('announced targets'))) eng.blockedOnTargetsOnly++;
        else if (bad.every(r => r.startsWith('optional'))) eng.blockedOnOptionalOnly++;
      }
    }
  }

  const bands = perCard.get(card.oracle_id ?? card.name ?? '');
  const textBand = !bands ? 'unknown' : bands.always.length ? 'always' : bands.conditional.length ? 'conditional' : 'none';
  bump(cross, `${cov === 'full' ? 'full' : 'not-full'} / text ${textBand}`);
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const out: string[] = [];
const line = (s = '') => { out.push(s); console.log(s); };
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(2)}%`;

if (cardArg) {
  const card = pool.find(c => (c.name ?? '').toLowerCase() === cardArg.toLowerCase());
  if (!card) { console.log(`no card named ${cardArg} in the pool`); process.exit(1); }
  const t = allText(card);
  console.log(`${card.name}\n${'-'.repeat(card.name?.length ?? 4)}`);
  console.log(`cost: ${allCost(card) || '(none)'}`);
  console.log(`keywords: ${(card.keywords ?? []).join(', ') || '(none)'}`);
  console.log(`\ntext read by the detectors:\n${t}\n`);
  for (const d of DETECTORS) if (d.test(t, card, allCost(card))) console.log(`  [${d.band}] ${d.id} — ${d.label}`);
  const r = compileWithTrace(card as AbilityCard).result;
  console.log(`\nengine coverage: ${r.coverage}, ${r.abilities.length} abilities, ${r.unparsed.length} unparsed`);
  console.log(`decision flags: ${JSON.stringify(engineFlagsOf(r))}`);
  process.exit(0);
}

if (sampleId === 'none') {
  console.log(`cards with rules text that matched NO decision detector: ${residualSample.length} sampled
`);
  const step = Math.max(1, Math.floor(residualSample.length / 60));
  for (let i = 0; i < residualSample.length; i += step) console.log(`  ${residualSample[i]}`);
  process.exit(0);
}

if (sampleId) {
  const d = DETECTORS.find(x => x.id === sampleId);
  if (!d) { console.log(`unknown detector. ids: ${DETECTORS.map(x => x.id).join(', ')}`); process.exit(1); }
  console.log(`${d.id} — ${d.label}\n${hitCount[d.id]} cards. First 40 of the sample:\n`);
  for (const n of samples[d.id].slice(0, 40)) console.log(`  ${n}`);
  process.exit(0);
}

line(`SOURCE  scratch/scryfall/oracle-cards.jsonl  (Scryfall bulk "oracle_cards")`);
line(`        rows in file .................. ${fileRows}`);
line(`        POOL .......................... ${pool.length} unique cards`);
line(`        of which carry rules text ..... ${withText}`);
line();

line(`PART A — DECISIONS IN THE TEXT (a property of Magic, not of our engine)`);
line();
line(`  ALWAYS ASKS — no board state removes the question`);
for (const d of DETECTORS.filter(x => x.band === 'always')) {
  line(`    ${d.id.padEnd(22)} ${String(hitCount[d.id]).padStart(6)}  ${pct(hitCount[d.id], pool.length).padStart(7)}  ${d.label}`);
}
line();
line(`  ASKS ONLY WHEN MORE THAN ONE OPTION IS LEGAL`);
for (const d of DETECTORS.filter(x => x.band === 'conditional')) {
  line(`    ${d.id.padEnd(22)} ${String(hitCount[d.id]).padStart(6)}  ${pct(hitCount[d.id], pool.length).padStart(7)}  ${d.label}`);
}
line();
line(`  THE THREE BANDS, each card counted once`);
line(`    always asks .................. ${String(alwaysBand).padStart(6)}  ${pct(alwaysBand, pool.length)}`);
line(`    conditional only ............. ${String(conditionalOnly).padStart(6)}  ${pct(conditionalOnly, pool.length)}`);
line(`    no decision in the text ...... ${String(noDecisionAtAll).padStart(6)}  ${pct(noDecisionAtAll, pool.length)}`);
line();
line(`  HOW MANY SEPARATE ALWAYS-ASK KINDS ONE CARD STACKS UP`);
for (const k of Object.keys(alwaysKindsPerCard).map(Number).sort((a, b) => a - b)) {
  line(`    ${k} kind(s) .................... ${String(alwaysKindsPerCard[k]).padStart(6)}  ${pct(alwaysKindsPerCard[k], pool.length)}`);
}
line();

/* --- PART A2: the one place the engine decides silently, sized exactly --- *
 *
 * `parseCost` in src/lib/game/mana.ts records `hasX` and then leaves X out of
 * `total`, and `planPayment` charges `total`. So a spell with {X} in its
 * printed cost is cast today for its non-X part with X = 0, no question asked
 * and nothing said. That is the exact failure the brief warns about, so it is
 * counted separately from every "needs a prompt" figure.
 */
let xInPrintedCost = 0;
let xOnlyInText = 0;
for (const card of pool) {
  const inCost = /\{x\}/i.test(allCost(card));
  const inText = /\{x\}/.test(allText(card));
  if (inCost) xInPrintedCost++;
  else if (inText) xOnlyInText++;
}
line(`  X, SPLIT BY WHERE IT SITS — because the two break differently`);
line(`    {X} in the printed mana cost .. ${String(xInPrintedCost).padStart(6)}  ${pct(xInPrintedCost, pool.length)}  cast today with X silently 0`);
line(`    {X} only in an ability cost ... ${String(xOnlyInText).padStart(6)}  ${pct(xOnlyInText, pool.length)}`);
line();

line(`PART B — WHAT THE ENGINE DOES WITH THE SAME POOL`);
line(`        (src/lib/cards/abilities compiler, front face only, run locally)`);
line();
line(`    cards compiled ............... ${eng.compiled}`);
line(`    compiler threw ............... ${eng.errors}`);
line(`    coverage full ................ ${String(eng.full).padStart(6)}  ${pct(eng.full, eng.compiled)}`);
line(`    coverage partial ............. ${String(eng.partial).padStart(6)}  ${pct(eng.partial, eng.compiled)}`);
line(`    coverage none ................ ${String(eng.none).padStart(6)}  ${pct(eng.none, eng.compiled)}`);
line(`    has text but no ability ...... ${String(eng.textButNoAbility).padStart(6)}  ${pct(eng.textButNoAbility, eng.compiled)}`);
line();
line(`    THE THREE METRICS, engine side`);
line(`    AUTOMATED  full and no decision  ${String(eng.fullAutomatic).padStart(6)}  ${pct(eng.fullAutomatic, eng.compiled)}`);
line(`    PROMPTED   full but must ask     ${String(eng.fullNeedsPrompt).padStart(6)}  ${pct(eng.fullNeedsPrompt, eng.compiled)}`);
line(`    NOT READ   coverage below full   ${String(eng.notUnderstood).padStart(6)}  ${pct(eng.notUnderstood, eng.compiled)}`);
line();
line(`    "COVERAGE FULL" DECOMPOSED — it does not mean the engine runs the card`);
line(`      no rules text at all ....... ${String(eng.blank).padStart(6)}  (finished by doing nothing, correctly)`);
line(`      full, nothing to execute ... ${String(eng.fullNothingToRun).padStart(6)}  (keyword or static abilities only)`);
line(`      full, has a body ........... ${String(eng.fullHasBody).padStart(6)}  (a trigger, activated, spell or mana ability)`);
line(`      the game engine RUNS it .... ${String(eng.engineOwns).padStart(6)}  ${pct(eng.engineOwns, eng.compiled)}  (abilityEngineOwns gate)`);
line(`        of those, fire and then print a note instead: ${eng.ownedButResolvesToANote}`);
line();
line(`    WHY AN OTHERWISE-READABLE TRIGGER IS STILL NOT RUN`);
for (const [k, v] of Object.entries(eng.unrunnable).sort((a, b) => b[1] - a[1])) {
  line(`      ${String(v).padStart(5)}  ${k}`);
}
line(`      cards blocked ONLY by "triggers cannot carry targets" .. ${eng.blockedOnTargetsOnly}`);
line(`      cards blocked ONLY by "optional (you may)" ............. ${eng.blockedOnOptionalOnly}`);
line();
line(`    decision-bearing shapes the compiler actually emitted`);
for (const [k, v] of Object.entries(eng.byDecisionKind).sort((a, b) => b[1] - a[1])) {
  line(`      ${k.padEnd(22)} ${String(v).padStart(6)}`);
}
line();
line(`    ENGINE VERDICT crossed with TEXT BAND`);
for (const [k, v] of Object.entries(cross).sort((a, b) => b[1] - a[1])) {
  line(`      ${k.padEnd(34)} ${String(v).padStart(6)}`);
}
line();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'scratch/scryfall/oracle-cards.jsonl',
      fileRows,
      pool: pool.length,
      withText,
      detectors: DETECTORS.map(d => ({ id: d.id, band: d.band, label: d.label, cards: hitCount[d.id] })),
      bands: { alwaysBand, conditionalOnly, noDecisionAtAll },
      alwaysKindsPerCard,
      engine: eng,
      cross,
    },
    null,
    2
  )
);
line(`written: ${OUT}`);
