/**
 * What the ability layer ACTUALLY covers today.
 *
 * Runs the REAL compiler (`src/lib/cards/abilities/compiler.ts`) over the REAL
 * census pool (the cached Scryfall bulk file on disk) and classifies every card.
 * No sample, no estimate, no Supabase query, no network, no model.
 *
 * ## The two layers, kept apart on purpose
 *
 * A compiled ability and a running ability are different claims, and this
 * project has already been burned by reporting the first as the second.
 *
 *   COMPILER verdict — what `deriveCoverage` says: did the compiler account for
 *   every clause and leave no `{do:'manual'}` marker. This is the CEILING.
 *
 *   ENGINE verdict — does a live consumer actually run the ability in a game.
 *   Every consumer below was found by grepping the tree for call sites, and the
 *   ones with NO call site outside their own file and their own tests are named
 *   here so the reader can check them:
 *
 *     triggered   -> `triggers.ts:468` via `ownedTriggersOf`, which is gated by
 *                    `abilityEngineOwns`: coverage must be 'full', there must be
 *                    at least one triggered ability, and every triggered ability
 *                    must pass `unrunnableReason(...) === null`. All or nothing
 *                    per card.
 *     static      -> `statics.ts:281` `scanStatics` -> `layeredState` ->
 *                    `characteristics.ts` -> `GameStateContext`. Per ability, no
 *                    whole-card gate. Every `Modification.layer` in the DSL is
 *                    handled by `toEffectPart` or collected by `scanStatics`.
 *     replacement -> `intrinsic.ts:83`, and ONLY for
 *                    `event.on === 'enters' && selfReplacement` with a result of
 *                    `enters-tapped`, or `enters-with-counters` whose count is a
 *                    plain positive number. Everything else is skipped there.
 *     keyword     -> not read from the compiled ability at all. `keywords.ts`
 *                    reads `card.keywords`. A keyword changes what the rules do
 *                    only if it is in `ENGINE_KEYWORDS` (or is protection);
 *                    everything else is `ADVISORY_KEYWORDS`, a badge and a
 *                    reminder, applied by the player by hand.
 *     activated   -> NO call site. `activatedAbilitiesOf` is referenced only by
 *                    its own module and its tests.
 *     spell       -> NO call site. `stack.ts` resolves a spell without ever
 *                    reading a compiled ability.
 *     mana        -> NO call site. `mana.ts` approximates mana separately by
 *                    counting untapped sources.
 *
 * ## The three metrics
 *
 *   AUTOMATED — every clause on the card is understood AND executed by a live
 *               consumer with no player input needed.
 *   PROMPTED  — understood, correctly needs a player choice, AND a prompt
 *               offering the legal options actually exists.
 *   SILENT    — the failure. The card does not do it and nobody is offered the
 *               options.
 *
 * A prompt has to EXIST to count. Searching `src/lib/game`, `src/components/play`
 * and `src/pages/Play.tsx` for any per-card choice UI finds none: `to-actions.ts`
 * turns every `may`, `choose-mode`, `unless-pays` and `manual` into a line in
 * `EffectRun.deferred`, and the caller prints it as a `NOTE` in the game log.
 * A log line is being told; it is not being offered the legal options. So this
 * script reports PROMPTED and, beside it, PROMPTABLE — understood, needs a
 * choice, no prompt built — and never adds the second into the first.
 *
 * ## Granularity
 *
 * Card verdicts are all-or-nothing, because that is the honest definition: a
 * card is done when the WHOLE card is done. Clause-level detail is reported
 * separately so the worklist is actionable.
 *
 * Usage:  node --experimental-strip-types scripts/ability-layer-coverage.mjs
 */

import { createReadStream, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace, assertClausesAccounted } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { probeBehaviour } from '../src/lib/game/abilities/behaviour-probe.ts';

import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
  facesOf,
  creatureTypeSet,
  nameSet,
  dropReminders,
  clausesOf,
} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const CENSUS = join(ROOT, 'scratch', 'clause-census.json');
const OUT = join(ROOT, 'scratch', 'ability-layer-coverage.json');

/* ------------------------------------------------------------------ *
 * Reading the file
 * ------------------------------------------------------------------ */

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ------------------------------------------------------------------ *
 * Does a live consumer run this ability?
 *
 * One function, one switch, and every branch cites the call site it was read
 * from. A kind that is not listed is a kind nothing runs.
 * ------------------------------------------------------------------ */

/** The `{do:...}` members that hand a decision back to a player. */
function decisionReason(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may') return 'may';
    if (e.do === 'choose-mode') return 'choose-mode';
    if (e.do === 'unless-pays') return 'unless-pays';
    if (e.do === 'if') {
      const r = decisionReason(e.then) ?? decisionReason(e.else);
      if (r) return r;
    }
    if (e.do === 'for-each' || e.do === 'repeat') {
      const r = decisionReason(e.effects);
      if (r) return r;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * T3 CORRECTION — "static" was not one thing, and calling it one over-claimed.
 *
 * Until this tranche the switch below returned `run` for EVERY static, on the
 * strength of the note in `statics.ts` that `scanStatics` has no whole-card
 * gate. That is true and it is not the question. The question is whether the
 * thing `scanStatics` collected is ever READ, and for two of the three kinds of
 * modification it is not:
 *
 *   layer mods (control, type, color, ability, pt-set, pt-modify, pt-switch)
 *     LIVE. `toEffectPart` maps each one, `scanStatics` hands them to
 *     `computeStateLayers`, `characteristics.ts:88` calls `layeredState`, and
 *     the whole app reads characteristics through it.
 *
 *   restriction
 *     `scanStatics` collects all eight rules into `StaticScan.restrictions`,
 *     and the ONLY reader is `hasRestriction`, whose own signature accepts four
 *     rules and which is called from exactly three places, all in `combat.ts`
 *     (lines 123, 141, 161), for exactly two: 'cant-attack' and 'cant-block'.
 *     'must-attack', 'cant-untap', 'cant-be-blocked-except-by',
 *     'cant-be-targeted', 'cant-cast', 'max-lands-per-turn' and
 *     'damage-prevention' have no reader anywhere outside `statics.test.ts`.
 *     A creature with "can't be blocked except by two or more creatures" is
 *     blocked by one creature in this engine today.
 *
 *   cost-modify
 *     collected into `StaticScan.costMods`, read only by `costAdjustmentFor`,
 *     which has NO call site outside `statics.test.ts`. Grep the tree: the
 *     function is exercised by eight assertions and called by nothing. Ruby
 *     Medallion was in this script's own AUTOMATED sample list, and no spell in
 *     this game has ever cost {1} less because of it.
 *
 * This is CLAUDE.md's "green tests do not mean a player can reach it", found
 * again, in the measurement rather than in the engine. Correcting it LOWERS the
 * AUTOMATED number, which is the point: the previous number was not earned.
 * ------------------------------------------------------------------ */

/** Restriction rules `combat.ts` actually asks about. */
const READ_RESTRICTIONS = new Set(['cant-attack', 'cant-block']);

/**
 * Effect members `to-actions.ts` writes a line about and never carries out.
 * Read case by case out of that file:
 *   pump           a duration-limited continuous effect; GameState has no list
 *   gain-control   same
 *   search-library a hidden zone the player must pick from
 *   return-from    same
 *   add-mana       mana.ts counts untapped sources instead of holding a pool
 *   counter        there is no stack to counter anything on
 */
const NAMED_NOT_RESOLVED = new Set(['pump', 'gain-control', 'search-library', 'return-from', 'add-mana', 'counter']);

function namedNotResolved(effects) {
  for (const e of effects ?? []) {
    if (NAMED_NOT_RESOLVED.has(e.do)) return e.do;
    if (e.do === 'if') { const r = namedNotResolved(e.then) ?? namedNotResolved(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') {
      const r = namedNotResolved(e.effects); if (r) return r;
    }
    if (e.do === 'choose-mode') for (const m of e.modes) { const r = namedNotResolved(m.effects); if (r) return r; }
  }
  return null;
}

/**
 * The reason a static ability is dead, or `null` when every modification on it
 * reaches a live consumer. A static is dead if ANY of its modifications is,
 * because the ability is one sentence and half of one is not the card.
 */
function staticDeadModification(ability) {
  for (const modification of ability.modifications ?? []) {
    if (modification.layer === 'cost-modify') {
      return 'static cost modification: costAdjustmentFor has no call site';
    }
    if (modification.layer === 'restriction') {
      const rule = modification.rule?.rule;
      if (!READ_RESTRICTIONS.has(rule)) {
        return `static restriction "${rule}": collected by scanStatics, no reader outside its own tests`;
      }
    }
    /*
     * ADVERSARIAL REVIEW — the T3 correction stopped one level too early.
     *
     * A `{layer:'ability', grant:[...]}` modification does reach a live reader:
     * `toEffectPart` maps it, `layers.ts` applies it, and `characteristics.ts`
     * `keywordsIn` returns the granted string. So it was scored `run`.
     *
     * Nobody asked whether the granted word MEANS anything. `hasKeywordIn` is
     * consulted by `combat.ts` for the fifteen names in `ENGINE_KEYWORDS` and
     * nothing else. A creature granted "wither", "persist", "horsemanship" or
     * "living weapon" gets the word appended to a list, renders a badge, and
     * plays exactly as it did before.
     *
     * That is the same player-visible result as a PRINTED advisory keyword,
     * which the switch below already scores `dead`. Grading the printed one
     * dead and the granted one run is an inconsistency, and it ran in the
     * direction that flattered the number. Costs 31 cards, measured.
     */
    if (modification.layer === 'ability') {
      for (const granted of modification.grant ?? []) {
        const word = String(granted).toLowerCase();
        if (keywordSupport(word) !== 'engine') {
          return `static grants "${word}", which is advisory: combat.ts never asks about it`;
        }
      }
    }
  }
  return null;
}

/**
 * `run` | `decision` | `dead`, plus why.
 *
 * `ownsTriggers` is the card-level `abilityEngineOwns` answer, computed once per
 * card because the predicate is all-or-nothing over the whole card.
 */
function abilityStatus(ability, ownsTriggers) {
  const effects = effectsOf(ability);
  const decision = decisionReason(effects);

  /*
   * ADVERSARIAL REVIEW — a verb `to-actions.ts` only NAMES.
   *
   * The behaviour probe was meant to catch these and mostly does. It cannot
   * catch them all: `case 'pump'` and `case 'gain-control'` both read
   * `if (names.length === 0) break;` BEFORE they push the deferral. The probe
   * board holds no lands and one creature a side, so "attacking creatures with
   * flying get +2/+0" matches nothing there, defers nothing, and comes back
   * `silent` — which the probe deliberately does not treat as a failure.
   * Kangee, Sky Warden and Karrthus, Tyrant of Jund reached AUTOMATED that way
   * and both print a NOTE and change nothing on a real board.
   *
   * Graded from the effect tree instead, which does not depend on what one
   * synthetic board happened to match. 104 abilities carry one; 83 were already
   * being caught by the probe, so the headline moves by 21 cards.
   */
  const named = namedNotResolved(effects);
  if (named) return { status: 'dead', why: `effect "${named}": to-actions.ts names it and never resolves it` };

  switch (ability.kind) {
    case 'triggered': {
      /*
       * ADVERSARIAL REVIEW — ownership is asked FIRST now, and it used to be
       * asked last.
       *
       * The old order was: optional -> decision -> ownership. A trigger the
       * bridge refuses outright was graded `decision` on the strength of
       * carrying a "you may", and the card landed in PROMPTABLE, a bucket the
       * reports describe as "waiting on a prompt that has never been built".
       * That sentence claims a prompt would finish the card.
       *
       * For 174 of the 262 it would not. `scripts/verify-promptable-audit.mjs`
       * ran `unrunnableReason` over every decision-carrying trigger in that
       * bucket: 74 need announced targets a `PendingTrigger` cannot carry, and
       * 100 name an event `deriveTriggerEvents` never emits. Gravedigger is not
       * one prompt short. Its trigger does not fire.
       *
       * Ownership first, so `decision` can only ever be reached by an ability
       * the engine would actually run. PROMPTABLE goes 262 -> 88; the other 174
       * land in SILENT, which is where a card nobody can use belongs.
       */
      if (!ownsTriggers) {
        const reason = unrunnableReason(ability);
        return { status: 'dead', why: `trigger not owned: ${reason ?? 'another clause on the card disqualified it'}` };
      }
      if (ability.optional) return { status: 'decision', why: 'optional trigger ("you may")' };
      if (decision) return { status: 'decision', why: `trigger contains ${decision}` };
      return { status: 'run', why: 'triggers.ts runs it via ownedTriggersOf' };
    }

    case 'static': {
      if (decision) return { status: 'decision', why: `static contains ${decision}` };
      const dead = staticDeadModification(ability);
      if (dead) return { status: 'dead', why: dead };
      return { status: 'run', why: 'statics.ts applies it via layeredState' };
    }

    case 'replacement': {
      const r = ability.result ?? {};
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      if (selfEnters && r.do === 'enters-tapped') {
        return { status: 'run', why: 'intrinsic.ts derives enters-tapped' };
      }
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) {
        return { status: 'run', why: 'intrinsic.ts derives enters-with-counters' };
      }
      return { status: 'dead', why: 'replacement: intrinsic.ts only derives enters-tapped and a plain-number enters-with-counters' };
    }

    case 'keyword': {
      const support = keywordSupport(ability.keyword ?? '');
      if (support === 'engine') return { status: 'run', why: 'ENGINE_KEYWORDS: combat.ts applies it' };
      return { status: 'dead', why: `advisory keyword "${(ability.keyword ?? '').toLowerCase()}": a badge, applied by hand` };
    }

    case 'activated':
      return { status: 'dead', why: 'activated ability: activatedAbilitiesOf has no call site' };

    case 'spell':
      return { status: 'dead', why: 'spell ability: nothing runs a compiled spell on resolution' };

    case 'mana':
      return { status: 'dead', why: 'mana ability: mana.ts approximates sources instead' };

    default:
      return { status: 'dead', why: `unknown ability kind ${ability.kind}` };
  }
}

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`);
  process.exit(1);
}

const all = [];
for await (const card of rows(SRC)) all.push(card);

const excluded = { layoutNotACard: 0, layoutNonGame: 0, setTypeExtra: 0, digitalOnly: 0, notPaper: 0 };
const pool = [];
for (const card of all) {
  if (EXCLUDED_LAYOUTS.has(card.layout)) { excluded.layoutNotACard++; continue; }
  if (EXCLUDED_SET_TYPES.has(card.set_type)) { excluded.setTypeExtra++; continue; }
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout)) { excluded.layoutNonGame++; continue; }
  if (card.digital) { excluded.digitalOnly++; continue; }
  if (!(card.games ?? []).includes('paper')) { excluded.notPaper++; continue; }
  pool.push(card);
}

const ctx = { types: creatureTypeSet(pool), names: nameSet(pool), selfNames: [] };

/* ------------------------------------------------------------------ *
 * Self-check: does the extracted normaliser reproduce the census?
 *
 * If these do not match, every pattern cross-reference below is measuring
 * something other than what the census measured, and the run stops.
 * ------------------------------------------------------------------ */

const census = existsSync(CENSUS) ? JSON.parse(readFileSync(CENSUS, 'utf8')) : null;
const selfCheck = { pool: pool.length, censusPool: census?.pool?.censusPool ?? null };

if (census) {
  const patternUses = new Map();
  let totalClauses = 0;
  for (const card of pool) {
    const clauses = clausesOf(card, ctx, 'full', 'clause');
    totalClauses += clauses.length;
    for (const c of clauses) bump(patternUses, c);
  }
  selfCheck.recomputedClauses = totalClauses;
  selfCheck.recomputedPatterns = patternUses.size;
  selfCheck.censusClauses = census.runs.clauseFull.totalClauses;
  selfCheck.censusPatterns = census.runs.clauseFull.distinctPatterns;
  selfCheck.matches =
    totalClauses === census.runs.clauseFull.totalClauses &&
    patternUses.size === census.runs.clauseFull.distinctPatterns;
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const verdicts = new Map();          // AUTOMATED | PROMPTED | PROMPTABLE | SILENT | NO-TEXT
const compilerCoverage = new Map();  // full | partial | manual | none
const silentReasons = new Map();     // one per card, its worst reason
const unparsedGapReasons = new Map();
const deadWhy = new Map();
const manualHints = new Map();
const unparsedPatterns = new Map();  // normalised unparsed line -> cards
const deadPatterns = new Map();
const manualPatterns = new Map();
const decisionKinds = new Map();
const abilityKindCount = new Map();
const abilityKindStatus = new Map();

// pattern -> {cards, run, decision, dead, manual, unparsed}
const patternStatus = new Map();

let ownedByBridge = 0;
let accountingFailures = 0;
const accountingSamples = [];
let cardsWithText = 0;

/** What actually carried an AUTOMATED card, so "flying works" is not sold as compiler work. */
const automatedBy = new Map();
const automatedSamples = [];
const promptableSamples = [];
/** Cards to hand to the behaviour probe, which runs the real interpreter. */
const toProbe = [];
/** Same marker set the census used to size the PROMPTED bucket. */
const DECISION_MARKER = /\byou may\b|\bchoose\b|\bup to\b|\bmay pay\b|\bof your choice\b|\byou could\b|\bmay have\b|\bdivided as you choose\b/i;
const overReach = [];
const oneLineShort = new Map();
let oneLineShortCards = 0;
let overReachCount = 0;
/** Unparsed lines split by face, because a back face is unparsed BY DESIGN. */
const unparsedFront = new Map();
const unparsedBack = new Map();

/** Which line of which face did this ability come from, by verbatim text. */
function paragraphStatuses(trace, ownsTriggers) {
  const { result, normalized, consumedSpans } = trace;
  const consumed = new Set(consumedSpans.map(([a, b]) => `${a}:${b}`));
  const unparsedSpans = new Set(result.unparsed.map(u => `${u.span[0]}:${u.span[1]}`));
  const unparsedReasonBySpan = new Map(result.unparsed.map(u => [`${u.span[0]}:${u.span[1]}`, u.reason]));

  // Ability text -> the worst status of the abilities that came from that text.
  const byText = new Map();
  const rank = { run: 0, decision: 1, dead: 2, manual: 3 };
  for (const ability of result.abilities) {
    const manual = hasManualEffect(effectsOf(ability));
    const st = manual
      ? { status: 'manual', why: 'compiled to a {do:manual} marker' }
      : abilityStatus(ability, ownsTriggers);
    bump(abilityKindCount, ability.kind);
    bump(abilityKindStatus, `${ability.kind}/${st.status}`);
    if (st.status === 'decision') bump(decisionKinds, st.why);
    if (st.status === 'dead') bump(deadWhy, st.why);
    // A modal run is ONE ability whose `text` is the whole run joined with
    // newlines, so indexing on the whole string would leave every bullet
    // unmatched. Indexing line by line matches the paragraphs it came from.
    for (const rawLine of String(ability.text ?? '').split('\n')) {
      const key = rawLine.trim();
      if (!key) continue;
      const prev = byText.get(key);
      if (!prev || rank[st.status] > rank[prev.status]) byText.set(key, st);
    }
  }

  const out = [];
  for (const para of normalized.paragraphs) {
    const spanKey = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(spanKey)) {
      out.push({ para, status: 'unparsed', why: unparsedReasonBySpan.get(spanKey) });
      continue;
    }
    if (consumed.has(spanKey)) {
      const st = byText.get(para.raw.trim());
      // No default to 'run'. A paragraph the mapping cannot place is counted as
      // unmapped and reported, never assumed to work.
      out.push(st ? { para, status: st.status, why: st.why } : { para, status: 'unmapped', why: 'consumed but not traceable to an ability' });
      continue;
    }
    // A paragraph that is neither: cannot happen while assertClausesAccounted
    // passes, but it is counted rather than assumed away.
    out.push({ para, status: 'unaccounted', why: 'neither consumed nor unparsed' });
  }
  return out;
}

/** Manual hints, walked the same way coverage.ts walks them. */
function walkHints(effects, out) {
  for (const e of effects ?? []) {
    if (e.do === 'manual') { bump(out, e.hint ?? '(no hint)'); continue; }
    if (e.do === 'if') { walkHints(e.then, out); walkHints(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') walkHints(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes) walkHints(m.effects, out);
  }
}

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;

  try {
    assertClausesAccounted(trace);
  } catch (err) {
    accountingFailures++;
    if (accountingSamples.length < 10) accountingSamples.push(`${card.name}: ${err.message}`);
  }

  bump(compilerCoverage, result.coverage);

  // `abilityEngineOwns`, replicated exactly from trigger-bridge.ts.
  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns =
    result.coverage === 'full' &&
    triggered.length > 0 &&
    triggered.every(a => unrunnableReason(a) === null);
  if (owns) ownedByBridge++;

  for (const a of result.abilities) walkHints(effectsOf(a), manualHints);

  const statuses = paragraphStatuses(trace, owns);

  if (statuses.length === 0) {
    bump(verdicts, 'NO-TEXT');
    continue;
  }
  cardsWithText++;

  const counts = { run: 0, decision: 0, dead: 0, manual: 0, unparsed: 0, unaccounted: 0, unmapped: 0 };
  for (const s of statuses) counts[s.status]++;

  /*
   * The card verdict is computed from the ABILITIES and the UNPARSED list, not
   * from the paragraph mapping above. The mapping exists for the pattern
   * cross-reference and can leave a paragraph unplaced; a verdict must not
   * depend on it, or an unplaced paragraph turns into a card reported as
   * working. Same rule as the compiler's own: never default to success.
   */
  const abilityVerdicts = result.abilities.map(a =>
    hasManualEffect(effectsOf(a)) ? { status: 'manual' } : abilityStatus(a, owns)
  );
  const anyManual = abilityVerdicts.some(v => v.status === 'manual');
  const anyDead = abilityVerdicts.some(v => v.status === 'dead');
  const anyDecision = abilityVerdicts.some(v => v.status === 'decision');

  let verdict;
  if (result.unparsed.length || anyManual || anyDead) verdict = 'SILENT';
  else if (anyDecision) verdict = 'PROMPTABLE'; // understood, needs a choice, no prompt built
  else if (result.abilities.length === 0) verdict = 'SILENT';
  else verdict = 'AUTOMATED';
  bump(verdicts, verdict);

  if (verdict === 'AUTOMATED' || verdict === 'PROMPTABLE') {
    toProbe.push({ name: card.name, verdict, abilities: result.abilities });
  }

  /*
   * The over-reach check. A card whose text says "up to", "you may" or "choose"
   * and whose compiled abilities carry no decision at all has had a player's
   * choice made for them. That is the WRONG-ability failure, which the file
   * header of `normalize.ts` calls the thing the whole design exists to prevent,
   * and it is worse than a gap because nothing marks it.
   */
  // Reminder text is stripped first. "myriad" and "banding" carry "up to" in
  // their reminder and the compiler never reads reminder text, so matching on
  // raw oracle text would report eight cards that are not over-reaching.
  if (verdict === 'AUTOMATED' && DECISION_MARKER.test(dropReminders(String(card.oracle_text ?? '')))) {
    overReachCount++;
    if (overReach.length < 60) {
      overReach.push(`${card.name} :: ${(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 120)}`);
    }
  }

  if (verdict === 'AUTOMATED') {
    const kinds = new Set(result.abilities.map(a => a.kind));
    const label = kinds.size === 1 && kinds.has('keyword')
      ? 'keyword lines only (keywords.ts, not the compiler)'
      : [...kinds].sort().join('+');
    bump(automatedBy, label);
    if (automatedSamples.length < 40 && !kinds.has('keyword')) {
      automatedSamples.push(`${card.name} :: ${(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 130)}`);
    }
  }
  if (verdict === 'PROMPTABLE' && promptableSamples.length < 20) {
    promptableSamples.push(`${card.name} :: ${(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 130)}`);
  }

  if (verdict === 'SILENT') {
    // One headline reason per card, worst first, so the histogram sums to the
    // card count instead of double counting.
    const worst = result.unparsed.length ? 'text the compiler could not parse'
      : anyManual ? 'compiled, but to a {do:manual} marker'
      : anyDead ? 'compiled and understood, but nothing in the engine runs it'
      : 'text on the card, no ability came out';
    bump(silentReasons, worst);

    /*
     * The one-line-short list. A SILENT card with exactly ONE blocking
     * paragraph becomes a finished card the moment that one line is handled,
     * so this ranking is worth more per entry than a raw frequency count: it
     * names lines that finish cards rather than lines that merely appear often.
     */
    const blocking = statuses.filter(s => s.status === 'unparsed' || s.status === 'manual' || s.status === 'dead' || s.status === 'unmapped');
    if (blocking.length === 1) {
      bump(oneLineShort, `${blocking[0].status} :: ${blocking[0].para.norm}`);
      oneLineShortCards++;
    }
  }

  // Clause-level detail for the worklist.
  for (const s of statuses) {
    if (s.status === 'unparsed') bump(unparsedGapReasons, String(s.why));
  }

  // Pattern attribution, line by line. A line's status is attributed to every
  // census clause cut from that line, which is stated as a caveat in the report.
  const seenPattern = new Map();
  for (const s of statuses) {
    const faceCard = { ...card, keywords: card.keywords };
    const lineClauses = clausesOf(
      { name: card.name, keywords: card.keywords, oracle_text: s.para.raw, card_faces: null },
      ctx,
      'full',
      'clause'
    );
    for (const p of lineClauses) {
      if (seenPattern.get(p) === s.status) continue;
      let e = patternStatus.get(p);
      if (!e) { e = { cards: 0, run: 0, decision: 0, dead: 0, manual: 0, unparsed: 0, unaccounted: 0, unmapped: 0 }; patternStatus.set(p, e); }
      if (!seenPattern.has(p)) { e.cards++; }
      e[s.status]++;
      seenPattern.set(p, s.status);
    }
    void faceCard;
  }

  // Ranked blockers, by the raw normalised line, deduped per card.
  const seenLine = new Set();
  for (const s of statuses) {
    const key = dropReminders(s.para.raw).trim().toLowerCase();
    if (seenLine.has(`${s.status}|${key}`)) continue;
    seenLine.add(`${s.status}|${key}`);
    if (s.status === 'unparsed') {
      bump(unparsedPatterns, s.para.norm);
      bump(s.para.face > 0 ? unparsedBack : unparsedFront, s.para.norm);
    }
    if (s.status === 'dead') bump(deadPatterns, `${s.why}`);
    if (s.status === 'manual') bump(manualPatterns, s.para.norm);
  }
}

/* ------------------------------------------------------------------ *
 * Second stage: run the real interpreter
 *
 * "A consumer exists" is still a claim about code, not about behaviour. The
 * behaviour probe in `src/lib/game/abilities/behaviour-probe.ts` runs the
 * ability's effects through `makeContext` and `runEffects` — the same two the
 * game uses — on a fixed synthetic board, and says whether actions came out.
 *
 * Every card this script called AUTOMATED is probed. A card that comes back
 * `silent` or `threw` is DOWNGRADED, because the probe is evidence and the
 * classification above is only inference. It reports keyword, static and
 * replacement abilities as `ran` with zero actions by design, since those are
 * not effect trees, so they neither prove nor disprove anything here.
 * ------------------------------------------------------------------ */

const probeOutcomes = new Map();
const probeDeferReasons = new Map();
const probeThrew = [];
const probeSilentOnBoard = [];
let downgraded = 0;

for (const entry of toProbe) {
  let verdict;
  try {
    verdict = probeBehaviour(entry.abilities);
  } catch (err) {
    verdict = { outcome: 'threw', actions: 0, deferred: [], error: err.message };
  }
  bump(probeOutcomes, `${entry.verdict}/${verdict.outcome}`);
  if (entry.verdict !== 'AUTOMATED') continue;

  /*
   * Only `threw` and `deferred` are decisive here.
   *
   * `threw` is broken DSL. `deferred` is the interpreter saying out loud that it
   * declined, which is exactly not-automated.
   *
   * `silent` is NOT decisive and is deliberately not downgraded. The probe board
   * holds no lands and one creature per player, so "untap up to five lands" and
   * "draw a card for each black creature your opponents control" both produce
   * zero actions on it while being perfectly capable of producing actions on a
   * real board. Counting those as failures would be as wrong as counting them
   * as successes, so they are listed for a human to read instead.
   */
  if (verdict.outcome === 'threw') {
    downgraded++;
    if (probeThrew.length < 30) probeThrew.push(`${entry.name} :: ${verdict.error ?? ''}`);
  } else if (verdict.outcome === 'deferred') {
    downgraded++;
    for (const d of verdict.deferred) bump(probeDeferReasons, d.slice(0, 90));
  } else if (verdict.outcome === 'silent') {
    if (probeSilentOnBoard.length < 30) probeSilentOnBoard.push(entry.name);
  }
}

const automatedBefore = verdicts.get('AUTOMATED') ?? 0;
const automatedAfterProbe = automatedBefore - downgraded;
const probeSilentCount = probeOutcomes.get('AUTOMATED/silent') ?? 0;

/* ------------------------------------------------------------------ *
 * Cross-reference with the census top patterns
 * ------------------------------------------------------------------ */

let topCross = null;
if (census) {
  const top = [...census.runs.clauseFull.topPatterns].sort((a, b) => b.cards - a.cards).slice(0, 100);
  topCross = top.map(p => {
    const e = patternStatus.get(p.pattern) ?? { cards: 0, run: 0, decision: 0, dead: 0, manual: 0, unparsed: 0, unaccounted: 0, unmapped: 0 };
    const seen = e.run + e.decision + e.dead + e.manual + e.unparsed + e.unaccounted;
    return {
      pattern: p.pattern,
      censusCards: p.cards,
      seen,
      run: e.run,
      decision: e.decision,
      dead: e.dead,
      manual: e.manual,
      unparsed: e.unparsed,
      runPct: seen ? Number(((e.run / seen) * 100).toFixed(1)) : 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const V = k => verdicts.get(k) ?? 0;
const total = pool.length;

const line = (s = '') => console.log(s);

line('=========================================================');
line(' ABILITY LAYER COVERAGE — real compiler, full census pool');
line('=========================================================');
line();
line(`bulk file      ${SRC}`);
line(`rows           ${all.length}`);
line(`census pool    ${total}`);
line(`excluded       ${JSON.stringify(excluded)}`);
line();
line('-- self-check: extracted normaliser vs clause-census.json --');
line(JSON.stringify(selfCheck, null, 2));
line();
line(`accounting failures (assertClausesAccounted): ${accountingFailures}`);
for (const s of accountingSamples) line(`   ${s}`);
line();

line('-- COMPILER verdict (the ceiling: what it understands) --');
for (const [k, v] of [...compilerCoverage.entries()].sort((a, b) => b[1] - a[1])) {
  line(`  ${k.padEnd(10)} ${String(v).padStart(6)}  ${pct(v, total)}%`);
}
line();

line('-- ENGINE verdict (what a player experiences) --');
line(`  AUTOMATED   ${String(V('AUTOMATED')).padStart(6)}  ${pct(V('AUTOMATED'), total)}% of pool   ${pct(V('AUTOMATED'), cardsWithText)}% of cards with text`);
line(`  PROMPTED    ${String(V('PROMPTED')).padStart(6)}  ${pct(V('PROMPTED'), total)}%   (no per-card choice prompt exists in play mode)`);
line(`  SILENT      ${String(V('SILENT')).padStart(6)}  ${pct(V('SILENT'), total)}%`);
line(`  PROMPTABLE  ${String(V('PROMPTABLE')).padStart(6)}  ${pct(V('PROMPTABLE'), total)}%   understood, needs a choice, NO prompt built`);
line(`  NO-TEXT     ${String(V('NO-TEXT')).padStart(6)}  ${pct(V('NO-TEXT'), total)}%   nothing to run`);
line();
line(`  cards with text: ${cardsWithText}`);
line();

line('-- behaviour probe: the real interpreter, on a real board --');
for (const [k, v] of [...probeOutcomes.entries()].sort((a, b) => b[1] - a[1])) line(`  ${String(v).padStart(6)}  ${k}`);
line(`  AUTOMATED downgraded (threw or deferred): ${downgraded}`);
line(`  AUTOMATED after the probe: ${automatedAfterProbe}  (${pct(automatedAfterProbe, total)}% of ${total})`);
line(`  produced no actions on the probe board (NOT downgraded, board is too small to judge): ${probeSilentCount}`);
line(`     e.g. ${probeSilentOnBoard.slice(0, 12).join(', ')}`);
line('  what the interpreter deferred on cards this script called AUTOMATED:');
for (const [k, v] of topOf(probeDeferReasons, 15)) line(`    ${String(v).padStart(4)}  ${k}`);
for (const s of probeThrew) line(`   threw: ${s}`);
line();

line('-- OVER-REACH CHECK: coverage "full" on text that contains a player decision --');
line(`  cards the compiler calls fully covered: ${compilerCoverage.get('full') ?? 0}`);
line(`  of those, oracle text contains a decision marker: ${overReachCount}`);
line('  (a decision resolved without asking is a WRONG ability, not a missing one)');
for (const s of overReach.slice(0, 25)) line(`   ${s}`);
line();

line('-- the 906 figure, re-measured --');
line(`  abilityEngineOwns over this pool: ${ownedByBridge}  (${pct(ownedByBridge, total)}% of ${total})`);
line();

line('-- why cards are SILENT (one headline reason per card) --');
for (const [k, v] of [...silentReasons.entries()].sort((a, b) => b[1] - a[1])) {
  line(`  ${String(v).padStart(6)}  ${k}`);
}
line();

line('-- unparsed clauses by gap reason (clause count) --');
for (const [k, v] of [...unparsedGapReasons.entries()].sort((a, b) => b[1] - a[1])) {
  line(`  ${String(v).padStart(6)}  ${k}`);
}
line();

line('-- compiled but nothing runs it, by reason (cards) --');
for (const [k, v] of topOf(deadWhy, 25)) line(`  ${String(v).padStart(6)}  ${k}`);
line();

line('-- ability kinds produced, and what happens to them --');
for (const [k, v] of [...abilityKindStatus.entries()].sort((a, b) => b[1] - a[1])) {
  line(`  ${String(v).padStart(7)}  ${k}`);
}
line();

line(`-- paragraphs the pattern mapping could not place: ${[...patternStatus.values()].reduce((n, e) => n + e.unmapped, 0)} clause hits --`);
line();
line('-- what carried the AUTOMATED cards --');
for (const [k, v] of [...automatedBy.entries()].sort((a, b) => b[1] - a[1])) line(`  ${String(v).padStart(6)}  ${k}`);
line();
line('-- AUTOMATED samples that are NOT just keyword lines --');
for (const s of automatedSamples) line(`   ${s}`);
line();
line('-- PROMPTABLE samples (understood, needs a choice, no prompt) --');
for (const s of promptableSamples) line(`   ${s}`);
line();

line('-- top 40 UNPARSED FRONT-FACE lines, by cards affected --');
for (const [k, v] of topOf(unparsedFront, 40)) line(`  ${String(v).padStart(5)}  ${k.slice(0, 110)}`);
line();
line('-- top 15 UNPARSED BACK-FACE lines (unparsed by design) --');
for (const [k, v] of topOf(unparsedBack, 15)) line(`  ${String(v).padStart(5)}  ${k.slice(0, 110)}`);
line();

line('-- top 30 {do:manual} hints --');
for (const [k, v] of topOf(manualHints, 30)) line(`  ${String(v).padStart(6)}  ${k}`);
line();

line('-- top 30 MANUAL-marker lines, by cards affected --');
for (const [k, v] of topOf(manualPatterns, 30)) line(`  ${String(v).padStart(5)}  ${k.slice(0, 110)}`);
line();

if (topCross) {
  line(`-- SILENT cards that are ONE LINE short: ${oneLineShortCards} --`);
line('   the single blocking line, ranked by cards it would finish');
for (const [k, v] of topOf(oneLineShort, 40)) line(`  ${String(v).padStart(5)}  ${k.slice(0, 115)}`);
line();

line('-- census top 100 patterns by cards: handled or not --');
  line('   cards  run%   run/dead/manual/unparsed  pattern');
  for (const p of topCross) {
    line(
      `  ${String(p.censusCards).padStart(5)}  ${String(p.runPct).padStart(5)}  ` +
      `${String(p.run).padStart(5)}/${String(p.dead).padStart(5)}/${String(p.manual).padStart(5)}/${String(p.unparsed).padStart(5)}  ${p.pattern.slice(0, 80)}`
    );
  }
  line();
  const clean = topCross.filter(p => p.runPct >= 95).length;
  const none = topCross.filter(p => p.runPct === 0).length;
  line(`  of the top 100: ${clean} run on >=95% of the lines they appear on, ${none} run on none of them.`);
  line();
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      script: 'scripts/ability-layer-coverage.mjs',
      source: SRC,
      pool: { rows: all.length, censusPool: total, excluded, cardsWithText },
      selfCheck,
      accountingFailures,
      accountingSamples,
      compilerCoverage: Object.fromEntries(compilerCoverage),
      verdicts: Object.fromEntries(verdicts),
      abilityEngineOwns: ownedByBridge,
      overReach: { count: overReachCount, samples: overReach },
      behaviourProbe: {
        outcomes: Object.fromEntries(probeOutcomes),
        automatedBefore,
        downgraded,
        automatedAfterProbe,
        threw: probeThrew,
        deferReasons: topOf(probeDeferReasons, 50),
        silentOnBoard: probeSilentCount,
      },
      silentReasons: Object.fromEntries(silentReasons),
      unparsedGapReasons: Object.fromEntries(unparsedGapReasons),
      deadWhy: Object.fromEntries(topOf(deadWhy, 200)),
      abilityKindStatus: Object.fromEntries(abilityKindStatus),
      decisionKinds: Object.fromEntries(decisionKinds),
      automatedBy: Object.fromEntries(automatedBy),
      automatedSamples,
      promptableSamples,
      oneLineShort: { cards: oneLineShortCards, top: topOf(oneLineShort, 400) },
      topUnparsedLines: topOf(unparsedPatterns, 500),
      topUnparsedFrontLines: topOf(unparsedFront, 500),
      topUnparsedBackLines: topOf(unparsedBack, 200),
      topManualLines: topOf(manualPatterns, 500),
      topManualHints: topOf(manualHints, 200),
      censusTop100Cross: topCross,
    },
    null,
    2
  )
);
line(`written: ${OUT}`);
