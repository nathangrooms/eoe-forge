/**
 * PROBE TRUTH CENSUS — what `verify-ability-coverage.mjs` declines to test, counted.
 *
 * STALE BY DESIGN SINCE 23 AUG 2026. Read this first. The verdict function below
 * is a copy of the grading as it stood BEFORE the probe was taught to bind a
 * target, answer a mode, ask counter on a board with a stack, grade PROMPTED,
 * and refuse silence. It no longer reproduces the shipped numbers and is not
 * meant to: it is the record of what was refused, and the reason the refusals
 * were lifted is written in docs/engine/PROBE-TRUTH.md section 7.
 *
 * This script GRADES NOTHING. It re-runs the then-current grading of
 * `scripts/verify-ability-coverage.mjs` (the verdict function below is a
 * verbatim copy, and the run asserts it reproduces that script's five headline
 * numbers before any census figure is printed), then counts, per card, WHICH
 * refusal is the one standing between the card and AUTOMATED.
 *
 * It also re-asks two questions the probe refuses to ask, using the real engine
 * seams rather than a relaxed rule:
 *
 *   - targets bound through `chooseTargetsFor`, the same function `activate.ts`,
 *     `cast-targets.ts` and `announce.ts` all end in, then the effects run for
 *     real. A card counts only if actions come out AND nothing is deferred.
 *     That is a stricter bar than the probe's, not a looser one: today the card
 *     is downgraded without its effects ever being run.
 *   - `counter`, with a real spell on the stack and the stack object announced
 *     as the target, because the probe board has no stack and the verb is
 *     graded unresolved on that alone.
 *
 * Usage: node --experimental-strip-types scripts/probe-truth-census.mjs
 * Local file only. No Supabase, no network, no model.
 */

import { createReadStream, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf, watchQueriesIn } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { probeBehaviour, probeEffects } from '../src/lib/game/abilities/behaviour-probe.ts';
import { addCard, applyActions, createGame } from '../src/lib/game/rules.ts';
import { castSpellAction } from '../src/lib/game/stack.ts';
import { activationsFor, planActivation, chooseTargetsFor } from '../src/lib/game/activate.ts';
import { triggerAwaitingTargets } from '../src/lib/game/announce.ts';
import { powerIn } from '../src/lib/game/characteristics.ts';
import { announcedTargetsOf } from '../src/lib/game/abilities/card-abilities.ts';
import { makeContext } from '../src/lib/game/abilities/context.ts';
import { runEffects } from '../src/lib/game/abilities/to-actions.ts';
import { nextBotMove } from '../src/lib/game/bot.ts';

/*
 * DM_ASK_MORE=1 re-runs the SAME grading with three questions the probe
 * declines to ask, each of them asked through a real engine seam and each of
 * them STRICTER than what happens today:
 *
 *   - a targeted ability has its targets bound through `chooseTargetsFor` and
 *     is then required to produce actions with nothing deferred, instead of
 *     being downgraded before its effects are run at all;
 *   - `counter` is put to the interpreter on a board that HAS a spell on the
 *     stack, instead of being graded unresolved on a board with no stack;
 *   - a modal ability counts as asked when a real `nextBotMove` answers it,
 *     instead of only when a shipped human surface draws it.
 *
 * Off by default. It changes no figure in the default run, and the default run
 * is the one that reconciles with `verify-ability-coverage.mjs`.
 */
const ASK_MORE = process.env.DM_ASK_MORE === '1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(
  ROOT,
  'scratch',
  process.env.DM_ASK_MORE === '1' ? 'probe-truth-census-ask-more.json' : 'probe-truth-census.json'
);

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ---------------------------------------------------------------- *
 * 1. The pool, copied verbatim from verify-ability-coverage.mjs
 * ---------------------------------------------------------------- */

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. Cached bulk file only; this script never downloads.`);
  process.exit(1);
}

const all = [];
for await (const card of rows(SRC)) all.push(card);

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
for (const c of all) {
  if (NOT_A_CARD.has(c.layout)) continue;
  if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
  if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
  if (c.digital) continue;
  if (!(c.games ?? []).includes('paper')) continue;
  pool.push(c);
}

/* ---------------------------------------------------------------- *
 * 2. The engine measurements, copied verbatim
 * ---------------------------------------------------------------- */

const RESTRICTIONS_COMBAT_READS = new Set(['cant-attack', 'cant-block']);

function deadGrant(modification) {
  for (const granted of modification.grant ?? []) {
    const k = String(granted).toLowerCase();
    if (keywordSupport(k) !== 'engine') return k;
  }
  return null;
}

function decisionIn(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may' || e.do === 'choose-mode' || e.do === 'unless-pays') return e.do;
    if (e.do === 'if') { const r = decisionIn(e.then) ?? decisionIn(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionIn(e.effects); if (r) return r; }
  }
  return null;
}

/** Every decision verb in the tree, not just the first. Census-only addition. */
function decisionsIn(effects, out = new Set()) {
  for (const e of effects ?? []) {
    if (e.do === 'may' || e.do === 'choose-mode' || e.do === 'unless-pays') out.add(e.do);
    if (e.do === 'if') { decisionsIn(e.then, out); decisionsIn(e.else, out); }
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') decisionsIn(e.effects, out);
    if (e.do === 'choose-mode') for (const m of e.modes ?? []) decisionsIn(m.effects, out);
  }
  return out;
}

const VERB_PROBES = {
  pump: [{ do: 'pump', what: { sel: 'self' }, power: 1, toughness: 1, duration: 'end-of-turn' }],
  'gain-control': [
    { do: 'gain-control', what: { sel: 'all', where: { is: 'type', value: 'creature' }, zone: 'battlefield' }, who: { who: 'you' }, duration: 'end-of-turn' },
  ],
  'search-library': [
    { do: 'search-library', who: { who: 'you' }, what: { sel: 'all', where: { is: 'type', value: 'creature' } }, count: 1, to: 'hand', thenShuffle: true },
  ],
  'return-from': [
    { do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: { sel: 'all', where: { is: 'type', value: 'creature' } }, count: 1, to: 'hand' },
  ],
  'add-mana': [{ do: 'add-mana', who: { who: 'you' }, mana: '{G}' }],
  counter: [{ do: 'counter', what: { sel: 'target', ref: 0 } }],
  damage: [{ do: 'damage', to: { sel: 'all', where: { is: 'type', value: 'creature' }, zone: 'battlefield' }, amount: 1 }],
};

function measureSpellRunsOnResolution() {
  try {
    let state = createGame({ mode: 'full', format: 'commander', seed: 3, players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] });
    state = { ...state, status: 'playing' };
    for (let i = 0; i < 6; i++) {
      state = addCard(state, { instanceId: `lib${i}`, cardId: 'filler', name: `Filler ${i}`, ownerId: 'p1', typeLine: 'Creature — Human', oracleText: '' }, 'library');
    }
    state = addCard(state, { instanceId: 'div', cardId: 'div', name: 'Divination', ownerId: 'p1', typeLine: 'Sorcery', oracleText: 'Draw two cards.' }, 'hand');
    const before = state.players[0].zones.hand.length;
    state = applyActions(state, [castSpellAction('p1', 'div', { resolvesTo: 'graveyard' }), { type: 'RESOLVE_STACK' }]);
    return state.players[0].zones.hand.length === before + 1;
  } catch { return false; }
}

function measureActivatedRuns() {
  try {
    let state = createGame({ mode: 'full', format: 'commander', seed: 5, players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] });
    state = { ...state, status: 'playing', step: 'precombat_main' };
    state = addCard(state, { instanceId: 'mtn', cardId: 'mtn', name: 'Mountain', ownerId: 'p1', typeLine: 'Basic Land — Mountain', oracleText: '', colorIdentity: ['R'] }, 'battlefield');
    state = addCard(state, { instanceId: 'shivan', cardId: 'shivan', name: 'Shivan Dragon', ownerId: 'p1', typeLine: 'Creature — Dragon', oracleText: 'Flying\n{R}: This creature gets +1/+0 until end of turn.', power: '5', toughness: '5', summoningSick: false }, 'battlefield');
    const options = activationsFor(state, 'p1', state.cards.shivan, { at: 0 });
    const usable = options.find(option => option.ok);
    if (!usable) return { ok: false, detail: `no activation was offered: ${options[0]?.reason || 'nothing'}` };
    const before = powerIn(state, 'shivan');
    state = applyActions(state, [...usable.actions, { type: 'RESOLVE_STACK' }]);
    const after = powerIn(state, 'shivan');
    return after === (before ?? 0) + 1
      ? { ok: true, detail: `Shivan Dragon ${before} -> ${after} power` }
      : { ok: false, detail: `power stayed at ${after}` };
  } catch (err) { return { ok: false, detail: `threw: ${err.message}` }; }
}

function bareBoard() {
  const state = createGame({ mode: 'full', format: 'commander', seed: 7, players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] });
  return { ...state, status: 'playing', step: 'precombat_main' };
}

function measureModeIsAsked() {
  try {
    const state = addCard(bareBoard(), { instanceId: 'birds', cardId: 'birds', name: 'Birds of Paradise', ownerId: 'p1', typeLine: 'Creature — Bird', oracleText: 'Flying\n{T}: Add one mana of any color.', power: '0', toughness: '1', summoningSick: false }, 'battlefield');
    const option = activationsFor(state, 'p1', state.cards.birds).find(o => /any color/i.test(o.text));
    if (!option) return { ok: false, detail: 'not listed' };
    if (option.ok) return { ok: false, detail: 'picked without asking' };
    const choice = (option.pending ?? []).find(p => p.kind === 'mode');
    if (!choice) return { ok: false, detail: 'refused without offering the modes' };
    if ((choice.modes ?? []).length !== 5) return { ok: false, detail: `offered ${(choice.modes ?? []).length} colours` };
    const answered = planActivation(state, 'p1', 'birds', option.abilityId, { choices: { modes: { [choice.modeRef]: [2] } } });
    if (!answered.ok) return { ok: false, detail: `answer refused: ${answered.reason}` };
    const after = applyActions(state, answered.actions);
    const p = (after.manaPool?.p1 ?? []).map(u => u.color);
    return p.join('') === 'B' ? { ok: true, detail: 'five colours offered, the one chosen landed' } : { ok: false, detail: `pool holds ${p.join('') || 'nothing'}` };
  } catch (err) { return { ok: false, detail: `threw: ${err.message}` }; }
}

function measureActivatedTargetIsAsked() {
  try {
    let state = addCard(bareBoard(), { instanceId: 'pyro', cardId: 'pyro', name: 'Prodigal Pyromancer', ownerId: 'p1', typeLine: 'Creature — Human Wizard', oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.', power: '1', toughness: '1', summoningSick: false }, 'battlefield');
    state = addCard(state, { instanceId: 'bear', cardId: 'bear', name: 'Grizzly Bears', ownerId: 'p2', typeLine: 'Creature — Bear', oracleText: '', power: '2', toughness: '2', summoningSick: false }, 'battlefield');
    const option = activationsFor(state, 'p1', state.cards.pyro)[0];
    if (!option) return { ok: false, detail: 'not listed' };
    if (option.ok) return { ok: false, detail: 'aimed itself' };
    const choice = (option.pending ?? []).find(p => p.kind === 'target');
    if (!choice) return { ok: false, detail: 'no candidates offered' };
    const answered = planActivation(state, 'p1', 'pyro', option.abilityId, { choices: { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield', zoneChangeCounter: 0 }] } });
    if (!answered.ok) return { ok: false, detail: `answer refused: ${answered.reason}` };
    const after = applyActions(state, [...answered.actions, { type: 'RESOLVE_STACK' }]);
    return (after.cards.bear?.damage ?? 0) === 1 ? { ok: true, detail: 'candidates offered, the one chosen was hit' } : { ok: false, detail: 'aimed and missed' };
  } catch (err) { return { ok: false, detail: `threw: ${err.message}` }; }
}

function measureTriggerTargetIsAsked() {
  try {
    let state = addCard(bareBoard(), { instanceId: 'bear', cardId: 'bear', name: 'Grizzly Bears', ownerId: 'p2', typeLine: 'Creature — Bear', oracleText: '', power: '2', toughness: '6', summoningSick: false }, 'battlefield');
    state = addCard(state, { instanceId: 'wall', cardId: 'wall', name: 'Stone Wall', ownerId: 'p2', typeLine: 'Creature — Wall', oracleText: '', power: '0', toughness: '5', summoningSick: false }, 'battlefield');
    state = addCard(state, { instanceId: 'ftk', cardId: 'ftk', name: 'Flametongue Kavu', ownerId: 'p1', typeLine: 'Creature — Kavu', oracleText: 'When this creature enters, it deals 4 damage to target creature.', power: '4', toughness: '2' }, 'hand');
    state = applyActions(state, [{ type: 'PLAY', instanceId: 'ftk', to: 'battlefield' }]);
    const ask = triggerAwaitingTargets(state);
    if (!ask) return { ok: false, detail: 'nobody was asked' };
    if (ask.choice.instanceIds.length === 0) return { ok: false, detail: 'nothing to choose from' };
    const after = applyActions(state, [{ type: 'ANNOUNCE_TRIGGER_TARGETS', triggerId: ask.trigger.id, targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield', zoneChangeCounter: state.cards.bear?.zoneChangeCounter ?? 0 }] }]);
    return (after.cards.bear?.damage ?? 0) === 4 && (after.cards.wall?.damage ?? 0) === 0
      ? { ok: true, detail: 'candidates offered, the one chosen was burned' }
      : { ok: false, detail: 'aimed and missed' };
  } catch (err) { return { ok: false, detail: `threw: ${err.message}` }; }
}

const SURFACE_ROOTS = ['components', 'pages', 'hooks'];
function surfaceFiles() {
  const files = [];
  const walk = dir => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  for (const root of SURFACE_ROOTS) walk(join(ROOT, 'src', root));
  return files;
}
function callArguments(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return '';
}
const SUPPLIES_TARGETS = /\btargets\s*[:,}]/;
function measureSpellTargetsAnnounced() {
  for (const file of surfaceFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const call of text.matchAll(/(planCastFromHand|castSpellAction)\s*\(/g)) {
      const open = call.index + call[0].length - 1;
      if (SUPPLIES_TARGETS.test(callArguments(text, open))) return true;
    }
  }
  return false;
}
function measureTriggerTargetsAnnounced() {
  for (const file of surfaceFiles()) {
    const text = readFileSync(file, 'utf8');
    if (/\btriggerAwaitingTargets\b/.test(text)) return true;
    if (/\bannounceTriggerTargetsAction\b/.test(text)) return true;
    if (/type:\s*'ANNOUNCE_TRIGGER_TARGETS'/.test(text)) return true;
  }
  return false;
}
function measureModeAnsweredBySurface() {
  for (const file of surfaceFiles()) {
    const text = readFileSync(file, 'utf8');
    if (/\bmodeRef\b/.test(text)) return true;
    if (/\bchoice\s*\.\s*modes\b/.test(text)) return true;
    if (/\bpending\w*\s*\.\s*modes\b/.test(text)) return true;
    if (/\bchoices\s*:/.test(text) && /\bmodes\s*:\s*\{/.test(text)) return true;
  }
  return false;
}

const SPELL_RUNS_ON_RESOLUTION = measureSpellRunsOnResolution();
const SPELL_TARGETS_ANNOUNCED = measureSpellTargetsAnnounced();
const ACTIVATED_PROBE = measureActivatedRuns();
const ACTIVATED_LIVE = ACTIVATED_PROBE.ok;
const MODE_PROBE = measureModeIsAsked();
const MODE_DRAWN_BY_A_SURFACE = measureModeAnsweredBySurface();
/**
 * DOES A BOT ANSWER A MODE, END TO END?
 *
 * `botChoice` is not exported, so this asks the exported entry point instead:
 * a seat with one Birds of Paradise on the battlefield and nothing else to do.
 * If the move it returns leaves mana in the pool, a bot answered a five-way
 * mode choice and the engine honoured it.
 */
function measureBotAnswersAMode() {
  try {
    let state = addCard(bareBoard(), { instanceId: 'birds', cardId: 'birds', name: 'Birds of Paradise', ownerId: 'p1', typeLine: 'Creature — Bird', oracleText: 'Flying\n{T}: Add one mana of any color.', power: '0', toughness: '1', summoningSick: false }, 'battlefield');
    state = { ...state, activePlayerId: 'p1', priorityPlayerId: 'p1' };
    const move = nextBotMove(state, 'p1', { at: 0 });
    if (!move) return { ok: false, detail: 'the bot had no move at all on that board' };
    const after = applyActions(state, move.actions);
    const pool = (after.manaPool?.p1 ?? []).map(u => u.color).join('');
    return pool
      ? { ok: true, detail: `nextBotMove answered the mode and the pool holds ${pool} (${move.note})` }
      : { ok: false, detail: `the bot moved but no mana landed (${move.note})` };
  } catch (err) { return { ok: false, detail: `threw: ${err.message}` }; }
}
const BOT_ANSWERS_A_MODE = measureBotAnswersAMode();
const MODE_ASKED = MODE_PROBE.ok && (MODE_DRAWN_BY_A_SURFACE || (ASK_MORE && BOT_ANSWERS_A_MODE.ok));
const TARGET_PROBE = measureActivatedTargetIsAsked();
const TRIGGER_TARGET_PROBE = measureTriggerTargetIsAsked();
const TRIGGER_TARGET_DRAWN_BY_A_SURFACE = measureTriggerTargetsAnnounced();
const TRIGGER_TARGET_ASKED = TRIGGER_TARGET_PROBE.ok && TRIGGER_TARGET_DRAWN_BY_A_SURFACE;

const NEVER_RESOLVED = new Set();
const VERB_PROBE_RESULT = {};
for (const [verb, effects] of Object.entries(VERB_PROBES)) {
  const probed = probeEffects(effects);
  VERB_PROBE_RESULT[verb] = probed;
  if (probed.actions === 0) NEVER_RESOLVED.add(verb);
}

function neverResolvedVerb(effects) {
  for (const e of effects ?? []) {
    if (NEVER_RESOLVED.has(e.do)) return e.do;
    if (e.do === 'if') { const r = neverResolvedVerb(e.then) ?? neverResolvedVerb(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') { const r = neverResolvedVerb(e.effects); if (r) return r; }
    if (e.do === 'choose-mode') for (const m of e.modes) { const r = neverResolvedVerb(m.effects); if (r) return r; }
  }
  return null;
}

function abilityVerdict(ability, ownsTriggers, scryfallKeywords, STRICT_GRANTS) {
  if (hasManualEffect(effectsOf(ability))) return { s: 'manual', why: '{do:manual} marker' };
  if (STRICT_GRANTS) {
    const verb = neverResolvedVerb(effectsOf(ability));
    if (verb) return { s: 'dead', why: `effect "${verb}" is named by to-actions.ts and never resolved` };
  }
  const decision = decisionIn(effectsOf(ability));
  switch (ability.kind) {
    case 'triggered':
      if (!ownsTriggers) return { s: 'dead', why: `trigger not owned: ${unrunnableReason(ability) ?? 'another clause on the card disqualified it'}` };
      if (ability.optional) return { s: 'decision', why: 'optional trigger', decision: 'may' };
      if ((ability.targets ?? []).length > 0) return { s: 'decision', why: 'trigger: the target is asked for', asked: TRIGGER_TARGET_ASKED, decision: 'target' };
      if (decision) return { s: 'decision', why: `trigger contains ${decision}`, decision };
      return { s: 'run', why: 'triggers.ts:468 ownedTriggersOf' };
    case 'static': {
      if (decision) return { s: 'decision', why: `static contains ${decision}`, decision };
      for (const m of ability.modifications ?? []) {
        if (m.layer === 'cost-modify') {
          const needsHistory = watchQueriesIn([{ do: 'gain-life', who: { who: 'you' }, amount: m.delta }]).length > 0;
          if (needsHistory) return { s: 'dead', why: 'cost-modify: the delta reads turn history, so costAdjustmentFor skips it' };
          continue;
        }
        if (m.layer === 'restriction') {
          const rule = m.rule?.rule;
          if (!RESTRICTIONS_COMBAT_READS.has(rule)) return { s: 'dead', why: `restriction "${rule}": collected, never read` };
        }
        if (m.layer === 'ability' && STRICT_GRANTS) {
          const bad = deadGrant(m);
          if (bad) return { s: 'dead', why: `grants "${bad}", which combat.ts never asks about` };
        }
      }
      return { s: 'run', why: 'statics.ts -> layeredState -> characteristics.ts' };
    }
    case 'replacement': {
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      const r = ability.result ?? {};
      if (selfEnters && r.do === 'enters-tapped') return { s: 'run', why: 'intrinsic.ts enters-tapped' };
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) return { s: 'run', why: 'intrinsic.ts enters-with-counters' };
      return { s: 'dead', why: 'replacement: intrinsic.ts derives no such result' };
    }
    case 'keyword': {
      const kw = String(ability.keyword ?? '');
      if (keywordSupport(kw) !== 'engine') return { s: 'dead', why: `advisory keyword "${kw.toLowerCase()}"` };
      if (!scryfallKeywords.has(kw.toLowerCase())) return { s: 'dead', why: `engine keyword "${kw.toLowerCase()}" is not in card.keywords, which is the only list keywords.ts reads` };
      return { s: 'run', why: 'keywords.ts reads card.keywords' };
    }
    case 'activated':
      if (!ACTIVATED_LIVE) return { s: 'dead', why: 'activated: activatedAbilitiesOf has no caller' };
      if ((ability.targets ?? []).length > 0) return { s: 'decision', why: 'activated: the target is asked for', asked: TARGET_PROBE.ok, decision: 'target' };
      if (decision) return { s: 'decision', why: `activated contains ${decision}`, asked: decision === 'choose-mode' && MODE_ASKED, decision };
      return { s: 'run', why: 'activate.ts planActivation -> stack.ts compiledAbilityActions' };
    case 'spell': {
      if (!SPELL_RUNS_ON_RESOLUTION) return { s: 'dead', why: 'spell: nothing runs a compiled spell on resolution' };
      if ((ability.targets ?? []).length > 0 && !SPELL_TARGETS_ANNOUNCED) return { s: 'dead', why: 'spell: runs on resolution, but no surface announces a target for a spell' };
      const decisionInSpell = decisionIn(effectsOf(ability));
      if (decisionInSpell) return { s: 'decision', why: `spell contains ${decisionInSpell}`, decision: decisionInSpell };
      return { s: 'run', why: 'stack.ts compiledSpellActions -> to-actions.ts' };
    }
    case 'mana':
      return { s: 'dead', why: 'mana: mana.ts counts untapped sources instead' };
    default:
      return { s: 'dead', why: `unknown kind ${ability.kind}` };
  }
}

/* ---------------------------------------------------------------- *
 * 3. The re-ask: bind targets through the real seam, then run
 * ---------------------------------------------------------------- */

/**
 * The behaviour probe's own board, rebuilt here because it is not exported.
 * Identical to `behaviour-probe.ts` `probeBoard()` line for line, so a
 * difference in outcome is a difference in the QUESTION and not in the board.
 */
function probeBoardSameAsTheProbe() {
  let state = createGame({ mode: 'full', format: 'commander', players: [{ name: 'P1' }, { name: 'P2' }], seed: 7 });
  state = { ...state, status: 'playing' };
  const put = (instanceId, ownerId, name, typeLine, zone) => {
    state = addCard(state, { instanceId, cardId: instanceId, name, ownerId, typeLine, power: '2', toughness: '2', tapped: false, damage: 0 }, zone);
  };
  put('probe-source', 'p1', 'Probe Source', 'Creature — Human', 'battlefield');
  put('probe-mine', 'p1', 'Probe Ally', 'Creature — Soldier', 'battlefield');
  put('probe-theirs', 'p2', 'Probe Foe', 'Creature — Zombie', 'battlefield');
  put('probe-artifact', 'p1', 'Probe Relic', 'Artifact', 'battlefield');
  put('probe-hand', 'p1', 'Probe In Hand', 'Creature — Human', 'hand');
  put('probe-library', 'p1', 'Probe In Library', 'Creature — Human', 'library');
  put('probe-yard', 'p1', 'Probe In Yard', 'Creature — Human', 'graveyard');
  return state;
}

const BOUND_BOARD = probeBoardSameAsTheProbe();

/**
 * Bind one ability's announced targets through `chooseTargetsFor`, answering
 * each question the engine asks with the FIRST legal candidate it offered.
 *
 * The policy is deliberately the dullest one available. `bot.ts`'s `botChoice`
 * prefers an opponent and is not exported; which legal candidate is picked
 * changes what the effect does, not whether it runs, and this is only asking
 * whether it runs. Legality is not decided here at all: `chooseTargetsFor` owns
 * it, which is the same function `activate.ts`, `cast-targets.ts` and
 * `announce.ts` all end in.
 */
function bindTargets(state, ability) {
  const specs = announcedTargetsOf(ability);
  if (specs.length === 0) return { ok: true, targets: [] };
  const card = state.cards['probe-source'];
  let choices = {};
  for (let pass = 0; pass < 8; pass++) {
    const aim = chooseTargetsFor(state, 'p1', card, specs, choices, 0);
    if (!aim.reason) return { ok: true, targets: aim.targets };
    const ask = aim.pending[0];
    if (!ask) return { ok: false, why: aim.blocked ? 'no legal target on the probe board' : aim.reason };
    const id = ask.instanceIds[0];
    const answer = id
      ? { kind: 'card', instanceId: id, zone: state.cards[id]?.zone, zoneChangeCounter: state.cards[id]?.zoneChangeCounter ?? 0 }
      : ask.playerIds[0] ? { kind: 'player', playerId: ask.playerIds[0] } : null;
    if (!answer) return { ok: false, why: 'the question came with nothing to choose from' };
    const targets = [...(choices.targets ?? [])];
    targets[ask.ref] = answer;
    choices = { ...choices, targets };
  }
  return { ok: false, why: 'eight passes and the targets were still not settled' };
}

/**
 * The probe's four outcomes again, with targets BOUND first.
 *
 * The bar is the probe's own and no weaker: actions have to come out and
 * nothing may be deferred. The only difference is that the ability is given the
 * targets it announces before it is asked to run, instead of being failed for
 * announcing any.
 */
function probeWithTargetsBound(abilities) {
  const state = BOUND_BOARD;
  let worst = 'ran';
  const RANK = { ran: 0, deferred: 1, silent: 2, threw: 3 };
  const worsen = o => { if (RANK[o] > RANK[worst]) worst = o; };
  let unbound = null;
  if (abilities.length === 0) return { outcome: 'ran', unbound: null };
  for (const ability of abilities) {
    if (ability.kind === 'keyword' || ability.kind === 'static' || ability.kind === 'replacement') continue;
    const effects = effectsOf(ability);
    if (effects.length === 0) { worsen('silent'); continue; }
    let bound = { ok: true, targets: [] };
    if ('targets' in ability && (ability.targets ?? []).length > 0) {
      bound = bindTargets(state, ability);
      if (!bound.ok) { unbound ??= bound.why; worsen('deferred'); continue; }
    }
    try {
      const run = runEffects(effects, makeContext(state, 'probe-source', 'p1', { targets: bound.targets }), { at: 0, cause: 'probe', idPrefix: 'probe:0' });
      if (run.deferred.length > 0) worsen('deferred');
      else if (run.actions.length === 0) worsen('silent');
    } catch { worsen('threw'); }
  }
  return { outcome: worst, unbound };
}

/**
 * `counter`, asked on a board that HAS a stack.
 *
 * The verb probe grades `counter` unresolved, and the script's own comment says
 * why: the probe board has no spell on it and no announced stack target, so
 * `{do:'counter'}` can only defer. That is a fact about the board. This puts a
 * real spell on the stack, announces it as the target, and looks at whether the
 * stack is empty afterwards.
 */
function measureCounterWithAStack() {
  try {
    let state = createGame({ mode: 'full', format: 'commander', seed: 11, players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] });
    state = { ...state, status: 'playing', step: 'precombat_main' };
    state = addCard(state, { instanceId: 'victim', cardId: 'victim', name: 'Shock', ownerId: 'p2', typeLine: 'Instant', oracleText: 'Shock deals 2 damage to any target.' }, 'hand');
    state = addCard(state, { instanceId: 'src', cardId: 'src', name: 'Probe Source', ownerId: 'p1', typeLine: 'Creature — Human', power: '2', toughness: '2' }, 'battlefield');
    state = applyActions(state, [castSpellAction('p2', 'victim', { resolvesTo: 'graveyard' })]);
    const object = (state.stack ?? [])[0];
    if (!object) return { ok: false, detail: 'nothing reached the stack, so the question could not be put' };
    const ctx = makeContext(state, 'src', 'p1', { targets: [{ kind: 'stack', stackId: object.stackId }] });
    const run = runEffects([{ do: 'counter', what: { sel: 'target', ref: 0 } }], ctx, { at: 0, cause: 'probe', idPrefix: 'probe:0' });
    return run.actions.length > 0
      ? { ok: true, detail: `counter produced ${run.actions.length} action(s) once a spell was on the stack and announced` }
      : { ok: false, detail: `counter still deferred with a spell on the stack: ${run.deferred[0] ?? 'no reason given'}` };
  } catch (err) { return { ok: false, detail: `threw: ${err.message}` }; }
}

const COUNTER_WITH_A_STACK = measureCounterWithAStack();

/*
 * The verb list is mutated AFTER the stack question was put, and only when it
 * came back yes. `neverResolvedVerb` is not called until the card loop below,
 * so this is the same set every card is graded against.
 */
if (ASK_MORE && COUNTER_WITH_A_STACK.ok) NEVER_RESOLVED.delete('counter');

/* ---------------------------------------------------------------- *
 * 4. The run
 * ---------------------------------------------------------------- */

const verdicts = new Map();
const rows_ = {
  // GENUINE-side card counts
  unparsed: 0, manualMarker: 0,
  // the sole-blocker census: what ONE thing stands between this card and AUTOMATED
  soleBlocker: new Map(),
  deadWhyCards: new Map(),
  decisionKindCards: new Map(),
  soleDecisionKind: new Map(),
  /*
   * WHICH ABILITY KIND CARRIES THE MODE, on a card the mode is blocking.
   *
   * `abilityVerdict` only ever marks a mode `asked` in its `activated` branch,
   * so a `Choose one —` on a SPELL or a TRIGGER can never reach PROMPTED
   * however well the mode machinery works. This says how many cards that is,
   * rather than leaving it as a reading of the switch statement.
   */
  modeCarrier: new Map(),
};

const toProbe = [];
let ownedByBridge = 0;

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;
  const scryfallKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));
  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns = result.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);
  if (owns) ownedByBridge++;

  const paragraphs = trace.normalized.paragraphs;
  if (paragraphs.length === 0) { bump(verdicts, 'NO-TEXT'); continue; }

  const perAbility = result.abilities.map(a => abilityVerdict(a, owns, scryfallKeywords, true));

  const unparsedSpans = new Set(result.unparsed.map(u => `${u.span[0]}:${u.span[1]}`));
  const consumed = new Set(trace.consumedSpans.map(([a, b]) => `${a}:${b}`));
  const abilityLines = new Set();
  for (const a of result.abilities) for (const line of String(a.text ?? '').split('\n')) { const k = line.trim(); if (k) abilityLines.add(k); }
  let unmapped = 0, unaccounted = 0;
  for (const para of paragraphs) {
    const key = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(key)) continue;
    if (!consumed.has(key)) { unaccounted++; continue; }
    if (!abilityLines.has(para.raw.trim())) unmapped++;
  }

  const anyManual = perAbility.some(v => v.s === 'manual');
  const anyDead = perAbility.some(v => v.s === 'dead');
  const anyDecision = perAbility.some(v => v.s === 'decision');
  const everyDecisionAsked = anyDecision && perAbility.filter(v => v.s === 'decision').every(v => v.asked === true);

  let mine;
  if (result.unparsed.length || anyManual || anyDead) mine = 'SILENT';
  else if (everyDecisionAsked) mine = 'PROMPTED';
  else if (anyDecision) mine = 'PROMPTABLE';
  else if (result.abilities.length === 0) mine = 'SILENT';
  else mine = 'AUTOMATED';

  // The lenient verdict is only needed to reproduce the headline, and the
  // headline rule below applies the unmapped-paragraph override the same way.
  const lenient = result.abilities.map(a => abilityVerdict(a, owns, scryfallKeywords, false));
  const lManual = lenient.some(v => v.s === 'manual');
  const lDead = lenient.some(v => v.s === 'dead');
  const lDecision = lenient.some(v => v.s === 'decision');
  let theirs;
  if (result.unparsed.length || lManual || lDead) theirs = 'SILENT';
  else if (lDecision) theirs = 'PROMPTABLE';
  else if (result.abilities.length === 0) theirs = 'SILENT';
  else theirs = 'AUTOMATED';
  if ((theirs === 'AUTOMATED' || theirs === 'PROMPTABLE') && (unmapped > 0 || unaccounted > 0)) mine = 'SILENT';

  bump(verdicts, mine);

  /* --- the census --- */
  if (result.unparsed.length) rows_.unparsed++;
  if (anyManual) rows_.manualMarker++;

  // What ONE thing is standing between this card and AUTOMATED. Order matters:
  // the first thing a fix would have to get past.
  if (mine !== 'AUTOMATED') {
    const blocker = result.unparsed.length ? 'compiler could not read some of the text'
      : anyManual ? '{do:manual} marker on the card'
      : anyDead ? [...new Set(perAbility.filter(v => v.s === 'dead').map(v => v.why))].sort().join(' + ')
      : (unmapped > 0 || unaccounted > 0) ? 'a paragraph maps to no ability'
      : anyDecision ? `decision: ${[...new Set(perAbility.filter(v => v.s === 'decision').map(v => v.decision ?? '?'))].sort().join('+')}`
      : 'no ability came out';
    bump(rows_.soleBlocker, blocker);
  }
  for (const why of new Set(perAbility.filter(v => v.s === 'dead').map(v => v.why))) bump(rows_.deadWhyCards, why);
  if (anyDecision) {
    const kinds = [...new Set(perAbility.filter(v => v.s === 'decision').map(v => v.decision ?? '?'))].sort();
    for (const k of kinds) bump(rows_.decisionKindCards, k);
    if (mine === 'PROMPTABLE') bump(rows_.soleDecisionKind, kinds.join('+'));
    if (mine === 'PROMPTABLE' && kinds.includes('choose-mode')) {
      const carriers = new Set();
      perAbility.forEach((v, i) => { if (v.decision === 'choose-mode') carriers.add(result.abilities[i].kind); });
      for (const k of carriers) bump(rows_.modeCarrier, k);
    }
  }

  if (mine === 'AUTOMATED' || mine === 'PROMPTABLE' || mine === 'PROMPTED') {
    toProbe.push({ name: card.name, verdict: mine, abilities: result.abilities });
  }
}

/* ---------------------------------------------------------------- *
 * 5. The probe stage, and the same stage re-asked with targets bound
 * ---------------------------------------------------------------- */

let downgraded = 0;
let probeSilent = 0;
const downgradeCause = new Map();
// The re-ask, on exactly the cards today's probe refuses or never asks.
const reask = {
  automatedDowngradedForTargets: 0,
  automatedDowngradedForTargetsNowRuns: 0,
  automatedDowngradedForTargetsStillNot: new Map(),
  automatedDowngradedOther: 0,
  automatedProbeSilent: 0,
  automatedProbeSilentNowRuns: 0,
  promptedNeverProbed: 0,
  promptedRunsWithTargetsBound: 0,
  promptableNeverProbed: 0,
  promptableRunsWithTargetsBound: 0,
};

const TARGET_SENTENCE = 'targets are not bound on the probe board';

for (const e of toProbe) {
  let v;
  try {
    v = ASK_MORE
      ? { ...probeWithTargetsBound(e.abilities), deferred: [] }
      : probeBehaviour(e.abilities);
  }
  catch (err) { v = { outcome: 'threw', actions: 0, deferred: [], error: err.message }; }

  if (e.verdict === 'AUTOMATED') {
    if (v.outcome === 'threw' || v.outcome === 'deferred') downgraded++;
    if (v.outcome === 'silent') probeSilent++;
    if (v.outcome === 'deferred') {
      const forTargets = v.deferred.some(d => d.includes(TARGET_SENTENCE));
      bump(downgradeCause, forTargets ? 'target binding refused by the probe' : (v.deferred[0] ?? 'no reason recorded').slice(0, 80));
      if (forTargets) {
        reask.automatedDowngradedForTargets++;
        const again = probeWithTargetsBound(e.abilities);
        if (again.outcome === 'ran') reask.automatedDowngradedForTargetsNowRuns++;
        else bump(reask.automatedDowngradedForTargetsStillNot, `${again.outcome}${again.unbound ? `: ${again.unbound.slice(0, 60)}` : ''}`);
      } else {
        reask.automatedDowngradedOther++;
      }
    }
    if (v.outcome === 'silent') {
      reask.automatedProbeSilent++;
      const again = probeWithTargetsBound(e.abilities);
      if (again.outcome === 'ran') reask.automatedProbeSilentNowRuns++;
    }
  } else if (e.verdict === 'PROMPTED') {
    reask.promptedNeverProbed++;
    const again = probeWithTargetsBound(e.abilities);
    if (again.outcome === 'ran') reask.promptedRunsWithTargetsBound++;
  } else {
    reask.promptableNeverProbed++;
    const again = probeWithTargetsBound(e.abilities);
    if (again.outcome === 'ran') reask.promptableRunsWithTargetsBound++;
  }
}

/* ---------------------------------------------------------------- *
 * 6. Report
 * ---------------------------------------------------------------- */

const N = pool.length;
const preAutomated = verdicts.get('AUTOMATED') ?? 0;
const automated = preAutomated - downgraded;
const prompted = verdicts.get('PROMPTED') ?? 0;
const promptable = verdicts.get('PROMPTABLE') ?? 0;
const noText = verdicts.get('NO-TEXT') ?? 0;
const silent = (verdicts.get('SILENT') ?? 0) + downgraded;

const L = [];
const say = s => { L.push(s); console.log(s); };

say('='.repeat(78));
say('PROBE TRUTH CENSUS — what the probe declines to test, counted');
say('='.repeat(78));
say('');
if (ASK_MORE) {
  say('DM_ASK_MORE=1 — three questions the probe declines to ask are being asked.');
  say('These figures are NOT the shipped grading. They are what the shipped grading');
  say('would report if it asked them, on one fixed board, and they are an estimate.');
  say('');
}
say(ASK_MORE ? '--- THE FIVE NUMBERS, WITH THE EXTRA QUESTIONS ASKED ---' : '--- THE FIVE NUMBERS ---');
if (!ASK_MORE) {
  say('THESE NO LONGER RECONCILE with scripts/verify-ability-coverage.mjs, and that is');
  say('expected. On 23 Aug 2026 that script started asking the questions this census');
  say('was written to prove it could ask: targets bound through chooseTargetsFor and');
  say('aimed by bot.ts, modes answered by botChoice, counter asked on a board with a');
  say('stack, the probe made binding on PROMPTED, and silence made a refusal. This');
  say('file still copies the OLD verdict function, so it is a record of the grading as');
  say('it stood before that, not a second opinion on the grading as it stands now.');
  say('For what changed and what it cost see docs/engine/PROBE-TRUTH.md section 7,');
  say('and for the cards that moved run scripts/probe-movers.mjs.');
}
say(`POOL        ${N}`);
say(`AUTOMATED   ${automated}  ${pct(automated, N)}%   (${preAutomated} before the probe, ${downgraded} downgraded)`);
say(`PROMPTED    ${prompted}  ${pct(prompted, N)}%`);
say(`PROMPTABLE  ${promptable}  ${pct(promptable, N)}%`);
say(`SILENT      ${silent}  ${pct(silent, N)}%`);
say(`NO-TEXT     ${noText}  ${pct(noText, N)}%`);
say(`probe-silent, NOT downgraded: ${probeSilent}`);
say(`abilityEngineOwns: ${ownedByBridge}`);
say('');
say('--- WHY AN AUTOMATED CARD WAS DOWNGRADED BY THE PROBE (cards) ---');
for (const [k, v] of top(downgradeCause, 15)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- THE RE-ASK: targets bound through chooseTargetsFor, then the effects run ---');
say(`AUTOMATED downgraded for target binding                 ${reask.automatedDowngradedForTargets}`);
say(`  of those, RAN once the targets were bound             ${reask.automatedDowngradedForTargetsNowRuns}`);
for (const [k, v] of top(reask.automatedDowngradedForTargetsStillNot, 10)) say(`    ${String(v).padStart(6)}  still not: ${k}`);
say(`AUTOMATED downgraded for anything else                  ${reask.automatedDowngradedOther}`);
say(`AUTOMATED probe-silent (accepted today)                 ${reask.automatedProbeSilent}`);
say(`  of those, RAN once the targets were bound             ${reask.automatedProbeSilentNowRuns}`);
say(`PROMPTED cards the probe never grades                   ${reask.promptedNeverProbed}`);
say(`  of those, RAN once the targets were bound             ${reask.promptedRunsWithTargetsBound}`);
say(`PROMPTABLE cards the probe never grades                 ${reask.promptableNeverProbed}`);
say(`  of those, RAN once the targets were bound             ${reask.promptableRunsWithTargetsBound}`);
say('');
say('--- COUNTER, ASKED ON A BOARD THAT HAS A STACK ---');
say(`  ${COUNTER_WITH_A_STACK.ok ? 'RESOLVES' : 'still unresolved'} — ${COUNTER_WITH_A_STACK.detail}`);
say('');
say('--- ENGINE FACTS THIS RUN MEASURED ---');
for (const [verb, probed] of Object.entries(VERB_PROBE_RESULT)) {
  say(`  ${verb.padEnd(16)} ${probed.threw ? `THREW: ${probed.threw}` : probed.actions > 0 ? `resolves (${probed.actions} action(s))` : `NAMED ONLY (${probed.deferred.length} deferral(s))`}`);
}
say(`  ${'mode asked'.padEnd(16)} ${MODE_PROBE.ok} — ${MODE_PROBE.detail}`);
say(`  ${'mode drawn'.padEnd(16)} ${MODE_DRAWN_BY_A_SURFACE}`);
say(`  ${'mode by a bot'.padEnd(16)} ${BOT_ANSWERS_A_MODE.ok} — ${BOT_ANSWERS_A_MODE.detail}`);
say(`  ${'target asked'.padEnd(16)} ${TARGET_PROBE.ok} — ${TARGET_PROBE.detail}`);
say(`  ${'trigger asked'.padEnd(16)} ${TRIGGER_TARGET_PROBE.ok} — ${TRIGGER_TARGET_PROBE.detail}`);
say(`  ${'trigger drawn'.padEnd(16)} ${TRIGGER_TARGET_DRAWN_BY_A_SURFACE}`);
say(`  ${'spell targets'.padEnd(16)} ${SPELL_TARGETS_ANNOUNCED}`);
say('');
say('--- CARDS BY THE ONE THING BLOCKING THEM (sole blocker, cards) ---');
for (const [k, v] of top(rows_.soleBlocker, 30)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- CARDS CARRYING EACH DEAD REASON (cards, not ability hits) ---');
for (const [k, v] of top(rows_.deadWhyCards, 30)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- CARDS CARRYING EACH DECISION KIND (cards) ---');
for (const [k, v] of top(rows_.decisionKindCards, 10)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- PROMPTABLE CARDS BY THE EXACT SET OF DECISIONS THEY CARRY (cards) ---');
for (const [k, v] of top(rows_.soleDecisionKind, 20)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- WHICH ABILITY KIND CARRIES THE MODE, on a PROMPTABLE card (cards) ---');
for (const [k, v] of top(rows_.modeCarrier, 10)) say(`  ${String(v).padStart(6)}  ${k}`);

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  pool: N,
  metrics: { automated, prompted, promptable, silent, noText, preAutomated, downgraded, probeSilent, ownedByBridge },
  downgradeCause: Object.fromEntries(downgradeCause),
  reask: {
    ...reask,
    automatedDowngradedForTargetsStillNot: Object.fromEntries(reask.automatedDowngradedForTargetsStillNot),
  },
  counterWithAStack: COUNTER_WITH_A_STACK,
  verbProbe: Object.fromEntries(Object.entries(VERB_PROBE_RESULT).map(([k, v]) => [k, { actions: v.actions, deferred: v.deferred.length, threw: v.threw ?? null }])),
  engineFacts: {
    MODE_PROBE: MODE_PROBE.ok, MODE_DRAWN_BY_A_SURFACE, MODE_ASKED,
    TARGET_PROBE: TARGET_PROBE.ok, TRIGGER_TARGET_PROBE: TRIGGER_TARGET_PROBE.ok,
    TRIGGER_TARGET_DRAWN_BY_A_SURFACE, TRIGGER_TARGET_ASKED,
    SPELL_RUNS_ON_RESOLUTION, SPELL_TARGETS_ANNOUNCED, ACTIVATED_LIVE,
  },
  soleBlocker: Object.fromEntries(top(rows_.soleBlocker, 60)),
  deadWhyCards: Object.fromEntries(top(rows_.deadWhyCards, 60)),
  decisionKindCards: Object.fromEntries(rows_.decisionKindCards),
  soleDecisionKind: Object.fromEntries(rows_.soleDecisionKind),
  modeCarrier: Object.fromEntries(rows_.modeCarrier),
  botAnswersAMode: BOT_ANSWERS_A_MODE,
  unparsedCards: rows_.unparsed,
  manualMarkerCards: rows_.manualMarker,
}, null, 2));

console.log(`\nwrote ${OUT}`);
