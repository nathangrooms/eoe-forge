/**
 * INDEPENDENT re-derivation of the three ability-layer metrics.
 *
 * Written to refute `scripts/ability-layer-coverage.mjs`, not to agree with it.
 * It shares no code with that script: its own file reader, its own pool filter,
 * its own engine-consumer table (each entry re-checked by grepping the tree),
 * and its own card verdict. It imports only the real compiler and the real
 * engine predicates, because those are the things under test.
 *
 * Where it deliberately differs, and why:
 *
 *  1. THE ALL-CLAUSES BAR IS BINDING HERE. The other script computes the card
 *     verdict from the ability list alone and states that a paragraph its
 *     mapping cannot place is "counted rather than assumed away". Counted, but
 *     not counted AGAINST the card: an unplaceable paragraph does not stop a
 *     card being AUTOMATED there. This script fails the card. A paragraph that
 *     cannot be traced to a running ability is a paragraph nobody can show runs.
 *
 *  2. A CONSUMED PARAGRAPH THAT PRODUCED NO ABILITY IS A DROP. `classify` marks
 *     a span consumed and returns `classified.abilities`, which the compiler
 *     spreads. An empty array there satisfies `assertClausesAccounted` (the span
 *     is covered) while producing nothing. Measured, not assumed.
 *
 *  3. AN ENGINE KEYWORD IS ONLY LIVE IF SCRYFALL ALSO PRINTED IT. `keywords.ts`
 *     reads `card.keywords`, never the compiled ability, so a keyword the
 *     compiler read out of oracle text and Scryfall did not list is applied by
 *     nothing. Checked per card.
 *
 * Usage: node --experimental-strip-types scripts/verify-ability-coverage.mjs
 * Local file only. No Supabase, no network at run time, no model.
 */

import { createReadStream, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace, assertClausesAccounted } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { probeBehaviour, probeEffects } from '../src/lib/game/abilities/behaviour-probe.ts';
import { addCard, applyActions, createGame } from '../src/lib/game/rules.ts';
import { castSpellAction } from '../src/lib/game/stack.ts';
import { activationsFor, planActivation } from '../src/lib/game/activate.ts';
import { powerIn } from '../src/lib/game/characteristics.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(
  ROOT,
  'scratch',
  process.env.DM_ACTIVATED_DEAD === '1'
    ? 'verify-ability-coverage-activated-dead.json'
    : 'verify-ability-coverage.json'
);

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ------------------------------------------------------------------ *
 * 1. The pool, built from first principles
 * ------------------------------------------------------------------ */

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

// Is the file one row per oracle id, as an "oracle cards" bulk file claims?
const oracleIds = new Set();
let missingOracleId = 0;
let duplicateOracleId = 0;
for (const c of all) {
  if (!c.oracle_id) { missingOracleId++; continue; }
  if (oracleIds.has(c.oracle_id)) duplicateOracleId++;
  oracleIds.add(c.oracle_id);
}

// My own exclusion sets, written from what the fields mean rather than copied.
const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const drop = new Map();
const pool = [];
for (const c of all) {
  if (NOT_A_CARD.has(c.layout)) { bump(drop, `layout ${c.layout}`); continue; }
  if (NOT_A_GAME_PRODUCT.has(c.set_type)) { bump(drop, `set_type ${c.set_type}`); continue; }
  if (NOT_A_NORMAL_GAME.has(c.layout)) { bump(drop, `layout ${c.layout}`); continue; }
  if (c.digital) { bump(drop, 'digital only'); continue; }
  if (!(c.games ?? []).includes('paper')) { bump(drop, 'no paper printing'); continue; }
  pool.push(c);
}

const poolOracleIds = new Set(pool.map(c => c.oracle_id));

/* ------------------------------------------------------------------ *
 * 2. Does a live consumer run this ability?
 *
 * Every branch below was re-checked with grep in this session. The greps and
 * what they returned:
 *
 *   activatedAbilitiesOf   src/lib/game/abilities/card-abilities.ts:108 only.
 *                          DEFINED AND NEVER CALLED. -> dead
 *   ownedTriggersOf        trigger-bridge.ts:291 (def), triggers.ts:97 (import),
 *                          triggers.ts:468 (call). -> live, gated by
 *                          abilityEngineOwns, which is all-or-nothing per card.
 *   scanStatics            statics.ts:379 continuousEffectsFor -> statics.ts:402
 *                          layeredState -> characteristics.ts:88 -> combat.ts,
 *                          sba.ts. -> live for layer modifications.
 *   hasRestriction         statics.ts:441 (def); callers combat.ts:123, 141, 161
 *                          for 'cant-attack' and 'cant-block' ONLY. Every other
 *                          restriction rule is collected and never read. -> dead
 *   costAdjustmentFor      statics.ts:498 (def). No caller outside its own
 *                          tests. -> dead
 *   intrinsicReplacements  intrinsic.ts:78; handles enters-tapped and
 *                          enters-with-counters with a plain positive number.
 *                          Everything else falls through. -> dead
 *   keywords               keywords.ts reads card.keywords, NOT the compiled
 *                          ability. ENGINE_KEYWORDS + protection are enforced.
 *   spell / mana           no consumer reads a compiled spell or mana ability.
 * ------------------------------------------------------------------ */

const RESTRICTIONS_COMBAT_READS = new Set(['cant-attack', 'cant-block']);

/*
 * THIS IS NOW MEASURED, NOT SWITCHED. Changed 22 Aug 2026.
 *
 * It was `process.env.DM_ACTIVATED_LIVE === '1'`, default off, added the day
 * before with the note that "has no caller" had gone stale on commit 56e982b
 * and that a switch kept the old figure reproducible. That was a reasonable
 * thing to do for one day. It is the same defect as the hardcoded verb list
 * three lines further down: a claim about what other code does, with an expiry
 * date on it and nothing to tell you when it passed. Here it had already
 * passed, and the switch left the script grading 3,690 ability hits dead on a
 * statement its own comment said was false.
 *
 * `measureActivatedRuns` below settles it the way `SPELL_RUNS_ON_RESOLUTION`
 * settles the spell question: by activating a real ability on a real board
 * through the real reducer and looking at what changed. Nobody's opinion is
 * involved, and the answer moves when the engine moves.
 *
 * DM_ACTIVATED_DEAD=1 forces the old verdict back on, for reproducing a figure
 * printed before today. It cannot make a false claim true, so it is the
 * direction that is safe to leave available.
 */
const FORCE_ACTIVATED_DEAD = process.env.DM_ACTIVATED_DEAD === '1';

/*
 * FOUND BY THIS REVIEW — the layer-6 grant of a keyword nothing enforces.
 *
 * `ability-layer-coverage.mjs` corrected itself in tranche 3 for two kinds of
 * static modification that `scanStatics` collects and nothing reads. It stopped
 * one level too early. A `{layer:'ability', grant:[...]}` modification DOES
 * reach a live reader: `toEffectPart` maps it, `layers.ts` applies it, and
 * `characteristics.ts:240 keywordsIn` returns the granted string. So the
 * classifier scores it `run`.
 *
 * What it does not ask is whether the granted keyword MEANS anything.
 * `hasKeywordIn` is only consulted by `combat.ts` for the fifteen names in
 * `ENGINE_KEYWORDS`. A creature granted "wither", "persist", "horsemanship" or
 * "living weapon" gets the word added to a list, renders a badge, and plays
 * exactly as it did before.
 *
 * That is the same player-visible outcome as a PRINTED advisory keyword, which
 * the same classifier scores `dead`. Scoring one dead and the other run is not
 * a judgement call, it is an inconsistency, and it runs in the direction that
 * flatters the number. Graded dead here.
 */
function deadGrant(modification) {
  for (const granted of modification.grant ?? []) {
    const k = String(granted).toLowerCase();
    if (keywordSupport(k) !== 'engine') return k;
  }
  return null;
}

/** The `{do:}` members that hand a decision to a player. Walks nested effects. */
function decisionIn(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may' || e.do === 'choose-mode' || e.do === 'unless-pays') return e.do;
    if (e.do === 'if') { const r = decisionIn(e.then) ?? decisionIn(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionIn(e.effects); if (r) return r; }
  }
  return null;
}

/*
 * THIRD DEFECT FOUND BY THIS REVIEW — the probe board hides these.
 *
 * `to-actions.ts` NAMES these six and never resolves them. Read case by case:
 *
 *   pump           to-actions.ts:389  a duration-limited continuous effect;
 *                                     GameState carries no list to put it in
 *   gain-control   to-actions.ts:405  same
 *   search-library to-actions.ts:~317 a hidden zone the player must pick from
 *   return-from    to-actions.ts:~317 same
 *   add-mana       to-actions.ts:~424 mana.ts counts untapped sources instead
 *   counter        to-actions.ts:~473 no stack to counter anything on
 *
 * The behaviour probe was supposed to catch these, and mostly does. It cannot
 * catch them all, because `pump` and `gain-control` read
 * `if (names.length === 0) break;` BEFORE they push the deferral. On the probe
 * board — no lands, one creature a side — "attacking creatures with flying get
 * +2/+0" matches nothing, so nothing is deferred, the probe returns `silent`,
 * and `silent` is deliberately not a downgrade. The card stays AUTOMATED.
 *
 * Kangee, Sky Warden and Karrthus, Tyrant of Jund both reached AUTOMATED that
 * way. On a real board both print a NOTE and change nothing.
 *
 * A verb the interpreter never resolves is not automation on any board, so it
 * is graded here from the effect tree rather than from what one board happened
 * to match.
 */
/*
 * THIS LIST IS NOW MEASURED, NOT WRITTEN DOWN. Changed 22 Aug 2026.
 *
 * It used to be a literal, `['pump', 'gain-control', 'search-library',
 * 'return-from', 'add-mana', 'counter']`, and it was correct on the day it was
 * typed. A literal describing what other code does is a claim with an expiry
 * date on it, and nothing tells you when it passed: when `to-actions.ts` started
 * calling the primitives in `abilities/primitives/`, every one of these verbs
 * except two began producing real actions and this script kept grading their
 * cards dead. It would have gone the other way just as quietly.
 *
 * So each verb is now put through the REAL `runEffects`, on the real probe
 * board, with a representative effect chosen so the selector matches something.
 * A verb that produces at least one action is resolved. A verb that produces
 * only a deferral is not. Nobody's opinion is involved and the answer moves when
 * the engine moves.
 *
 * Two known limits of the method, both of which UNDERSTATE coverage, which is
 * the direction to be wrong in:
 *
 *   - `counter` needs a spell on the stack and an announced stack target. The
 *     probe board has neither, so `counter` will read unresolved here even
 *     though `counterTargetSpell` fires correctly when a target was announced.
 *   - a verb is graded on one representative effect. A verb that resolves for
 *     the shape below and defers for some other shape reads as resolved.
 */
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

/*
 * DOES A SPELL RUN ITS OWN TEXT WHEN IT RESOLVES?
 *
 * Measured by playing one, not by reading `stack.ts`. Two players, a real card
 * with real oracle text, cast through `castSpellAction` and resolved through the
 * reducer. If the hand grew, the spell ran.
 *
 * Divination rather than something targeted, deliberately: this question is
 * about whether the resolution path calls the compiled ability at all, and a
 * targeted card would fold the separate targeting question into the answer.
 */
function measureSpellRunsOnResolution() {
  try {
    let state = createGame({
      mode: 'full',
      format: 'commander',
      seed: 3,
      players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
    });
    state = { ...state, status: 'playing' };
    for (let i = 0; i < 6; i++) {
      state = addCard(state, {
        instanceId: `lib${i}`, cardId: 'filler', name: `Filler ${i}`,
        ownerId: 'p1', typeLine: 'Creature — Human', oracleText: '',
      }, 'library');
    }
    state = addCard(state, {
      instanceId: 'div', cardId: 'div', name: 'Divination',
      ownerId: 'p1', typeLine: 'Sorcery', oracleText: 'Draw two cards.',
    }, 'hand');

    const before = state.players[0].zones.hand.length;
    state = applyActions(state, [
      castSpellAction('p1', 'div', { resolvesTo: 'graveyard' }),
      { type: 'RESOLVE_STACK' },
    ]);
    // Two drawn, one cast: the hand is one bigger if and only if it ran.
    return state.players[0].zones.hand.length === before + 1;
  } catch {
    return false;
  }
}

/*
 * DOES ACTIVATING AN ABILITY DO ANYTHING?
 *
 * The verdict this replaces was the sentence "activatedAbilitiesOf has no
 * caller", and taken literally it is still true — that exported narrower is
 * dead. `activate.ts` has its own private copy of the same one-line filter,
 * `activatedAbilitiesOfCard`, and that one has four callers. Grepping for the
 * exported name and concluding the feature is missing is exactly the kind of
 * answer this file exists to stop trusting, so the question is asked of the
 * board instead.
 *
 * Shivan Dragon, real oracle text: "{R}: This creature gets +1/+0 until end of
 * turn." Chosen because it is the whole chain in one card — `planActivation`
 * reads the ability, pays a real mana cost off a real Mountain,
 * `PUT_ABILITY_ON_STACK` announces it, `RESOLVE_STACK` hands it to
 * `compiledAbilityActions`, `to-actions.ts` turns the pump into an
 * `ADD_CONTINUOUS`, and `layers.ts` has to apply it before the power reads 6.
 * Any break anywhere in that chain leaves the power at 5 and the answer false.
 *
 * Returns the sentence as well as the verdict, because a bare boolean deciding
 * 3,690 ability hits should have to say what it saw.
 */
function measureActivatedRuns() {
  try {
    let state = createGame({
      mode: 'full',
      format: 'commander',
      seed: 5,
      players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
    });
    state = { ...state, status: 'playing', step: 'precombat_main' };

    state = addCard(state, {
      instanceId: 'mtn', cardId: 'mtn', name: 'Mountain',
      ownerId: 'p1', typeLine: 'Basic Land — Mountain', oracleText: '',
      colorIdentity: ['R'],
    }, 'battlefield');
    state = addCard(state, {
      instanceId: 'shivan', cardId: 'shivan', name: 'Shivan Dragon',
      ownerId: 'p1', typeLine: 'Creature — Dragon',
      oracleText: 'Flying\n{R}: This creature gets +1/+0 until end of turn.',
      power: '5', toughness: '5', summoningSick: false,
    }, 'battlefield');

    const options = activationsFor(state, 'p1', state.cards.shivan, { at: 0 });
    const usable = options.find(option => option.ok);
    if (!usable) {
      const why = options[0]?.reason || 'activationsFor returned nothing at all';
      return { ok: false, detail: `no activation was offered: ${why}` };
    }

    const before = powerIn(state, 'shivan');
    state = applyActions(state, [...usable.actions, { type: 'RESOLVE_STACK' }]);
    const after = powerIn(state, 'shivan');

    return after === (before ?? 0) + 1
      ? { ok: true, detail: `Shivan Dragon's own ability took it from ${before} power to ${after}` }
      : { ok: false, detail: `activated and resolved, power stayed at ${after}` };
  } catch (err) {
    return { ok: false, detail: `threw: ${err.message}` };
  }
}

/*
 * IS A DECISION ACTUALLY ASKED, AND IS THE ANSWER HONOURED?
 *
 * The `PROMPTED` line below used to be a hardcoded `0` with a note explaining
 * that no per-card choice UI was counted. That was the last written-down
 * verdict in this file, and it is the same defect as the two above it: a claim
 * about other code with an expiry date on it and nothing to say when it passed.
 *
 * PROMPTED is a real thing and it is narrower than PROMPTABLE. PROMPTABLE means
 * "this card's remaining blocker is a decision". PROMPTED means the engine
 * offers that decision WITH ITS LEGAL OPTIONS and does what it is told. A note
 * reading "choose one of: Add {R} / Add {G}" is not a prompt; nothing can answer
 * it. A refusal carrying both modes and an index for each is.
 *
 * So the two probes below play it out. Each takes a real card, asks
 * `planActivation` for a plan, checks the refusal came back carrying the
 * options, answers it, and checks the plan then works. Anything less than the
 * full round trip reads false.
 *
 * A `may`, a `unless-pays` and every trigger decision are deliberately NOT
 * probed, because nothing offers them: they stay in PROMPTABLE, which is what
 * that bucket is for.
 */
function probeBoard() {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    seed: 7,
    players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
  });
  return { ...state, status: 'playing', step: 'precombat_main' };
}

function measureModeIsAsked() {
  try {
    const state = addCard(probeBoard(), {
      instanceId: 'birds', cardId: 'birds', name: 'Birds of Paradise',
      ownerId: 'p1', typeLine: 'Creature — Bird',
      oracleText: 'Flying\n{T}: Add one mana of any color.',
      power: '0', toughness: '1', summoningSick: false,
    }, 'battlefield');

    const option = activationsFor(state, 'p1', state.cards.birds).find(o => /any color/i.test(o.text));
    if (!option) return { ok: false, detail: 'the ability was not even listed' };
    if (option.ok) return { ok: false, detail: 'it picked a colour without asking, which is worse than not asking' };

    const choice = (option.pending ?? []).find(p => p.kind === 'mode');
    if (!choice) return { ok: false, detail: 'refused without offering the modes, so nothing can answer it' };
    if ((choice.modes ?? []).length !== 5) {
      return { ok: false, detail: `offered ${(choice.modes ?? []).length} colours, not 5` };
    }

    // Answer it and see whether the answer is honoured.
    const answered = planActivation(state, 'p1', 'birds', option.abilityId, {
      choices: { modes: { [choice.modeRef]: [2] } },
    });
    if (!answered.ok) return { ok: false, detail: `asked, but the answer was refused: ${answered.reason}` };

    const after = applyActions(state, answered.actions);
    /*
     * Read straight off state rather than through . This script has
     * to be runnable against a checkout that has no mana pool at all, so that a
     * before-and-after can use ONE instrument. Importing a function that does
     * not exist in the older tree turns the comparison into two scripts, which
     * is the thing a before-and-after is supposed to avoid.
     */
    const pool = (after.manaPool?.p1 ?? []).map(u => u.color);
    return pool.join('') === 'B'
      ? { ok: true, detail: 'Birds of Paradise offered five colours and the one chosen is what landed' }
      : { ok: false, detail: `answered "Add {B}" and the pool holds ${pool.join('') || 'nothing'}` };
  } catch (err) {
    return { ok: false, detail: `threw: ${err.message}` };
  }
}

function measureActivatedTargetIsAsked() {
  try {
    let state = addCard(probeBoard(), {
      instanceId: 'pyro', cardId: 'pyro', name: 'Prodigal Pyromancer',
      ownerId: 'p1', typeLine: 'Creature — Human Wizard',
      oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.',
      power: '1', toughness: '1', summoningSick: false,
    }, 'battlefield');
    state = addCard(state, {
      instanceId: 'bear', cardId: 'bear', name: 'Grizzly Bears',
      ownerId: 'p2', typeLine: 'Creature — Bear', oracleText: '',
      power: '2', toughness: '2', summoningSick: false,
    }, 'battlefield');

    const option = activationsFor(state, 'p1', state.cards.pyro)[0];
    if (!option) return { ok: false, detail: 'the ability was not even listed' };
    if (option.ok) return { ok: false, detail: 'it aimed itself without asking' };

    const choice = (option.pending ?? []).find(p => p.kind === 'target');
    if (!choice) return { ok: false, detail: 'refused without offering any candidates' };
    if (choice.instanceIds.length === 0 && choice.playerIds.length === 0) {
      return { ok: false, detail: 'asked, but with nothing to choose from' };
    }

    const answered = planActivation(state, 'p1', 'pyro', option.abilityId, {
      choices: { targets: [{ kind: 'card', instanceId: 'bear', zone: 'battlefield', zoneChangeCounter: 0 }] },
    });
    if (!answered.ok) return { ok: false, detail: `asked, but the answer was refused: ${answered.reason}` };

    const after = applyActions(state, [...answered.actions, { type: 'RESOLVE_STACK' }]);
    const damage = after.cards.bear?.damage ?? 0;
    return damage === 1
      ? { ok: true, detail: 'Prodigal Pyromancer offered its candidates and hit the one chosen' }
      : { ok: false, detail: `aimed at the Bears and dealt ${damage} damage to them` };
  } catch (err) {
    return { ok: false, detail: `threw: ${err.message}` };
  }
}

/*
 * DOES ANY SURFACE ANNOUNCE A TARGET FOR A SPELL?
 *
 * A grep, run here rather than written in a comment, because every other
 * consumer claim at the top of this file is a grep somebody did once and this
 * one decides thousands of cards. It looks for a non-test caller passing
 * `targets` into `planCastFromHand` or `castSpellAction`.
 *
 * `stack.test.ts` does exactly that, hundreds of times, which is why tests are
 * excluded: a test constructing an action by hand is the precise thing that
 * proves nothing about whether a player can reach it.
 */
function measureSpellTargetsAnnounced() {
  const roots = [join(ROOT, 'src', 'components'), join(ROOT, 'src', 'lib', 'game'), join(ROOT, 'src', 'pages')];
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
  for (const root of roots) walk(root);

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const call of text.matchAll(/(planCastFromHand|castSpellAction)\s*\(([\s\S]{0,600}?)\)\s*[;,)]/g)) {
      if (/\btargets\s*:/.test(call[2])) return true;
    }
  }
  return false;
}

/*
 * DOES ANY SHIPPED SURFACE DRAW A MODE CHOICE?
 *
 * FOUND BY AN ADVERSARIAL REVIEW, 22 Aug 2026, and it is this file's own
 * standard applied consistently rather than a new one.
 *
 * `measureSpellTargetsAnnounced` above already refuses to count a targeted
 * spell until a NON-TEST caller fills `CastOptions.targets`, on the project's
 * reachability law: the engine supporting it and a player reaching it are
 * different claims. `MODE_PROBE` was held to the weaker standard. It asks
 * `planActivation` directly, which is the engine, and every modal card was
 * then graded PROMPTED on the strength of it.
 *
 * Measured: a `kind:'mode'` PendingChoice carries its options ONLY in
 * `choice.modes`, with `instanceIds` and `playerIds` both empty.
 * `AbilityPanel.tsx` draws chips from `choice.playerIds` (line 214) and
 * `choice.instanceIds` (line 221) and reads `choice.modes` nowhere, so Birds of
 * Paradise draws its prompt with no button under it. Worse, the `!option.ok &&
 * !choice` fallback that would print a reason is skipped, because a choice does
 * exist. And `answer()` (line 135) has two branches, `target` and everything
 * else, so a mode answer would be written into `choices.costs` rather than
 * `choices.modes` and ignored.
 *
 * So the grep below asks for a shipped consumer, the same way the spell one
 * does. It looks for a file outside the tests that reads `PendingChoice.modes`
 * or `modeRef`, or that passes `choices: { modes: ... }`.
 */
function measureModeAnsweredBySurface() {
  const roots = [join(ROOT, 'src', 'components'), join(ROOT, 'src', 'pages'), join(ROOT, 'src', 'hooks')];
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
  for (const root of roots) walk(root);

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // A surface that draws the options, or one that hands an answer back.
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
const ACTIVATED_LIVE = !FORCE_ACTIVATED_DEAD && ACTIVATED_PROBE.ok;
const MODE_PROBE = measureModeIsAsked();
const MODE_DRAWN_BY_A_SURFACE = measureModeAnsweredBySurface();
/* The engine offering a mode is necessary and not sufficient. A player has to
   be able to see the options and press one. Both, or it is not a prompt. */
const MODE_ASKED = MODE_PROBE.ok && MODE_DRAWN_BY_A_SURFACE;
const TARGET_PROBE = measureActivatedTargetIsAsked();

/** Which decisions this run found the engine willing to ask. Printed, never guessed. */
const PROMPT_BASIS = (() => {
  const asked = [];
  if (TARGET_PROBE.ok) asked.push('an activated ability\'s target');
  if (MODE_ASKED) asked.push('a modal choice');
  return asked.length === 0
    ? 'nothing offers a decision with its options, so nothing can be answered'
    : `every decision on the card is one of: ${asked.join(', ')}`;
})();

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
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') {
      const r = neverResolvedVerb(e.effects); if (r) return r;
    }
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
      /*
       * SECOND DEFECT FOUND BY THIS REVIEW — ownership is asked FIRST.
       *
       * `ability-layer-coverage.mjs` asked `optional` and `decision` before
       * ownership, so a trigger `unrunnableReason` refuses outright was graded
       * `decision` because it said "you may", and the card landed in
       * PROMPTABLE — a bucket the reports describe as waiting only on a prompt.
       * 174 of the 262 in it are not waiting on a prompt: 74 need announced
       * targets a PendingTrigger cannot carry and 100 name an event
       * `deriveTriggerEvents` never emits. Measured by
       * scripts/verify-promptable-audit.mjs.
       */
      if (!ownsTriggers) return { s: 'dead', why: `trigger not owned: ${unrunnableReason(ability) ?? 'another clause on the card disqualified it'}` };
      if (ability.optional) return { s: 'decision', why: 'optional trigger' };
      if (decision) return { s: 'decision', why: `trigger contains ${decision}` };
      return { s: 'run', why: 'triggers.ts:468 ownedTriggersOf' };

    case 'static': {
      if (decision) return { s: 'decision', why: `static contains ${decision}` };
      for (const m of ability.modifications ?? []) {
        if (m.layer === 'cost-modify') return { s: 'dead', why: 'cost-modify: costAdjustmentFor has no caller' };
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
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) {
        return { s: 'run', why: 'intrinsic.ts enters-with-counters' };
      }
      return { s: 'dead', why: 'replacement: intrinsic.ts derives no such result' };
    }

    case 'keyword': {
      const kw = String(ability.keyword ?? '');
      if (keywordSupport(kw) !== 'engine') return { s: 'dead', why: `advisory keyword "${kw.toLowerCase()}"` };
      // The extra bar this script adds: keywords.ts reads card.keywords.
      if (!scryfallKeywords.has(kw.toLowerCase())) {
        return { s: 'dead', why: `engine keyword "${kw.toLowerCase()}" is not in card.keywords, which is the only list keywords.ts reads` };
      }
      return { s: 'run', why: 'keywords.ts reads card.keywords' };
    }

    /*
     * See ACTIVATED_LIVE above. With the switch on, a target or an in-effect
     * decision makes this a DECISION rather than a run, because
     * `planActivation` refuses to guess and asks the player. That is PROMPTED,
     * not AUTOMATED, and the two must not be merged.
     */
    /*
     * `asked` is what separates PROMPTED from PROMPTABLE, and it is measured
     * rather than assumed. A decision is `asked` only when a probe at the top of
     * this run watched the engine offer that decision with its legal options and
     * then do what it was told. See `measureModeIsAsked` and
     * `measureActivatedTargetIsAsked`.
     *
     * A `may` and an `unless-pays` are never `asked`: nothing anywhere
     * enumerates a yes and a no for them or consumes an answer. They stay in
     * PROMPTABLE, which is the bucket for a decision nobody offers yet.
     */
    case 'activated':
      if (!ACTIVATED_LIVE) return { s: 'dead', why: 'activated: activatedAbilitiesOf has no caller' };
      if ((ability.targets ?? []).length > 0) {
        return { s: 'decision', why: 'activated: the target is asked for', asked: TARGET_PROBE.ok };
      }
      if (decision) {
        return {
          s: 'decision',
          why: `activated contains ${decision}`,
          asked: decision === 'choose-mode' && MODE_ASKED,
        };
      }
      return { s: 'run', why: 'activate.ts planActivation -> stack.ts compiledAbilityActions' };
    /*
     * A COMPILED SPELL, GRADED IN TWO HALVES. Changed 22 Aug 2026.
     *
     * This used to be one line: dead, "nothing runs a compiled spell on
     * resolution". That was true and is not any more. `compiledAbilityActions`
     * returned an empty list for any stack object without an `abilityId`, and a
     * spell cast from hand has none, so every instant and sorcery in the game
     * resolved into its own graveyard having done nothing.
     *
     * `SPELL_RUNS_ON_RESOLUTION` below is not a claim, it is the result of
     * casting a real card through the real reducer at the top of this run.
     *
     * The halves are graded differently on purpose, and this is the project's
     * own law about reachability rather than a technicality. A spell that names
     * no target runs when a player casts it, today. A spell that DOES name one
     * needs a target announced, and no surface fills `CastOptions.targets` for a
     * spell — `SPELL_TARGETS_ANNOUNCED` greps the tree for a caller rather than
     * trusting this comment. Until one exists, a targeted instant is engine-ready
     * and player-unreachable, and only the second of those is what a person
     * experiences.
     */
    case 'spell': {
      if (!SPELL_RUNS_ON_RESOLUTION) {
        return { s: 'dead', why: 'spell: nothing runs a compiled spell on resolution' };
      }
      if ((ability.targets ?? []).length > 0 && !SPELL_TARGETS_ANNOUNCED) {
        return { s: 'dead', why: 'spell: runs on resolution, but no surface announces a target for a spell' };
      }
      const decisionInSpell = decisionIn(effectsOf(ability));
      if (decisionInSpell) return { s: 'decision', why: `spell contains ${decisionInSpell}` };
      return { s: 'run', why: 'stack.ts compiledSpellActions -> to-actions.ts' };
    }
    case 'mana':
      return { s: 'dead', why: 'mana: mana.ts counts untapped sources instead' };
    default:
      return { s: 'dead', why: `unknown kind ${ability.kind}` };
  }
}

/* ------------------------------------------------------------------ *
 * 3. The run
 * ------------------------------------------------------------------ */

const verdicts = new Map();
const coverageHist = new Map();
const deadWhy = new Map();
const silentReason = new Map();

let accountingFailures = 0;
const accountingSamples = [];
let ownedByBridge = 0;

// Defect counters this script exists to find.
let consumedButNoAbility = 0;                 // a span was consumed and produced nothing
const consumedButNoAbilitySamples = [];
let automatedWithUnmappedParagraph = 0;       // AUTOMATED under their rule, refused under mine
const unmappedSamples = [];
let automatedWithoutFullCoverage = 0;
let keywordNotInScryfall = 0;
let deadGrantCost = 0;   // AUTOMATED under their grading, refused by the dead-grant rule
let neverResolvedCost = 0;  // AUTOMATED and probe-clean, but carries a verb to-actions.ts only names
const neverResolvedSamples = [];
const keywordNotInScryfallSamples = [];

const automatedBy = new Map();
const automatedSamples = [];
/*
 * Every AUTOMATED name, not the 400-row sample, written to its own file when
 * DM_NAME_LIST=1. Added 21 Aug 2026 so the automated set can be INTERSECTED
 * with another measurement — "which cards our engine already composes" — rather
 * than compared at the level of two percentages that share no rows. Off by
 * default; the sample and every printed figure are untouched.
 */
const allAutomatedNames = [];
const allPromptableNames = [];
const toProbe = [];

const DECISION_TEXT = /\byou may\b|\bchoose\b|\bup to\b|\bmay pay\b|\bof your choice\b|\bdivided as you choose\b/i;
const overReach = [];

/** Strip reminder text the way a reader would, for the over-reach text test only. */
function withoutReminders(text) {
  return String(text ?? '').replace(/\([^()]*\)/g, ' ');
}

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;

  try { assertClausesAccounted(trace); }
  catch (err) {
    accountingFailures++;
    if (accountingSamples.length < 10) accountingSamples.push(`${card.name}: ${err.message}`);
  }

  bump(coverageHist, result.coverage);

  const scryfallKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));

  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns = result.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);
  if (owns) ownedByBridge++;

  const paragraphs = trace.normalized.paragraphs;
  if (paragraphs.length === 0) { bump(verdicts, 'NO-TEXT'); continue; }

  // Per-ability verdicts.
  // Two passes over the same abilities. `lenient` is their rule, kept so the
  // two runs can be compared line for line; `perAbility` is mine, which also
  // grades a grant of a keyword combat never asks about as dead.
  const lenient = result.abilities.map(a => abilityVerdict(a, owns, scryfallKeywords, false));
  const perAbility = result.abilities.map(a => abilityVerdict(a, owns, scryfallKeywords, true));
  for (const v of perAbility) if (v.s === 'dead') bump(deadWhy, v.why);

  // Paragraph coverage, made binding. Every non-blank front-face paragraph must
  // map to at least one ability, or be on the unparsed list.
  const unparsedSpans = new Set(result.unparsed.map(u => `${u.span[0]}:${u.span[1]}`));
  const consumed = new Set(trace.consumedSpans.map(([a, b]) => `${a}:${b}`));
  const abilityLines = new Set();
  for (const a of result.abilities) {
    for (const line of String(a.text ?? '').split('\n')) {
      const k = line.trim();
      if (k) abilityLines.add(k);
    }
  }

  let unmapped = 0;
  let unaccounted = 0;
  for (const para of paragraphs) {
    const key = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(key)) continue;
    if (!consumed.has(key)) { unaccounted++; continue; }
    if (!abilityLines.has(para.raw.trim())) unmapped++;
  }

  if (unmapped > 0) {
    consumedButNoAbility++;
    if (consumedButNoAbilitySamples.length < 25) {
      consumedButNoAbilitySamples.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 150)}`);
    }
  }

  const anyManual = perAbility.some(v => v.s === 'manual');
  const anyDead = perAbility.some(v => v.s === 'dead');
  const anyDecision = perAbility.some(v => v.s === 'decision');
  /*
   * PROMPTED, and it is a strict subset of PROMPTABLE. Every decision on the
   * card has to be one the engine measurably OFFERS with its legal options and
   * then honours. One decision nobody offers is enough to keep the whole card
   * out, for the same reason one dead ability keeps a card out of AUTOMATED: a
   * card is only as reachable as its least reachable clause.
   */
  const everyDecisionAsked =
    anyDecision && perAbility.filter(v => v.s === 'decision').every(v => v.asked === true);

  // THEIR verdict rule, on THEIR lenient grading, so the two runs can be
  // compared line for line.
  const lManual = lenient.some(v => v.s === 'manual');
  const lDead = lenient.some(v => v.s === 'dead');
  const lDecision = lenient.some(v => v.s === 'decision');
  let theirs;
  if (result.unparsed.length || lManual || lDead) theirs = 'SILENT';
  else if (lDecision) theirs = 'PROMPTABLE';
  else if (result.abilities.length === 0) theirs = 'SILENT';
  else theirs = 'AUTOMATED';

  // MINE, on my grading, plus: an unplaced or unaccounted paragraph fails.
  let mine;
  if (result.unparsed.length || anyManual || anyDead) mine = 'SILENT';
  else if (everyDecisionAsked) mine = 'PROMPTED';
  else if (anyDecision) mine = 'PROMPTABLE';
  else if (result.abilities.length === 0) mine = 'SILENT';
  else mine = 'AUTOMATED';

  if (theirs === 'AUTOMATED' && mine !== 'AUTOMATED') {
    deadGrantCost++;
    const verbHit = perAbility.find(v => v.s === 'dead' && v.why.includes('never resolved'));
    if (verbHit) {
      neverResolvedCost++;
      if (neverResolvedSamples.length < 25) {
        const oneLine = String(card.oracle_text ?? '').split('\n').join(' | ');
        neverResolvedSamples.push(`${card.name} :: ${verbHit.why} :: ${oneLine.slice(0, 120)}`);
      }
    }
  }
  if ((theirs === 'AUTOMATED' || theirs === 'PROMPTABLE') && (unmapped > 0 || unaccounted > 0)) {
    mine = 'SILENT';
    if (theirs === 'AUTOMATED') {
      automatedWithUnmappedParagraph++;
      if (unmappedSamples.length < 25) {
        unmappedSamples.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 150)}`);
      }
    }
  }

  if (mine === 'AUTOMATED' && result.coverage !== 'full') automatedWithoutFullCoverage++;

  // Did an engine keyword fail only because Scryfall did not print it?
  if (theirs !== 'SILENT') {
    for (const v of perAbility) {
      if (v.s === 'dead' && v.why.includes('is not in card.keywords')) {
        keywordNotInScryfall++;
        if (keywordNotInScryfallSamples.length < 20) keywordNotInScryfallSamples.push(`${card.name} :: ${v.why}`);
      }
    }
  }

  bump(verdicts, mine);
  bump(verdicts, `THEIRS:${theirs}`);

  if (mine === 'AUTOMATED' || mine === 'PROMPTABLE' || mine === 'PROMPTED') {
    toProbe.push({ name: card.name, verdict: mine, abilities: result.abilities, oracle: card.oracle_text ?? '' });
  }

  // PROMPTED is carved out of PROMPTABLE, so the name list still holds both.
  if (mine === 'PROMPTABLE' || mine === 'PROMPTED') allPromptableNames.push(card.name);

  if (mine === 'AUTOMATED') {
    allAutomatedNames.push(card.name);
    const kinds = new Set(result.abilities.map(a => a.kind));
    bump(automatedBy, kinds.size === 1 && kinds.has('keyword') ? 'keyword lines only' : [...kinds].sort().join('+'));
    if (automatedSamples.length < 400) {
      automatedSamples.push({
        name: card.name,
        type: card.type_line ?? '',
        oracle: String(card.oracle_text ?? ''),
        kinds: [...kinds].sort(),
        paragraphs: paragraphs.length,
        abilities: result.abilities.length,
      });
    }
    if (DECISION_TEXT.test(withoutReminders(card.oracle_text))) {
      overReach.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 160)}`);
    }
  }

  if (mine === 'SILENT') {
    const worst = result.unparsed.length ? 'unparsed text'
      : anyManual ? '{do:manual} marker'
      : anyDead ? 'understood, nothing runs it'
      : unmapped > 0 ? 'consumed paragraph produced no ability'
      : unaccounted > 0 ? 'paragraph neither consumed nor unparsed'
      : 'text on the card, no ability came out';
    bump(silentReason, worst);
  }
}

/* ------------------------------------------------------------------ *
 * 4. The behaviour probe, on my AUTOMATED set
 * ------------------------------------------------------------------ */

const probeOut = new Map();
const downgradedNames = new Set();
let downgraded = 0;
const probeDeferred = new Map();
const probeThrew = [];
let probeSilent = 0;
const probeSilentNames = [];

for (const e of toProbe) {
  let v;
  try { v = probeBehaviour(e.abilities); }
  catch (err) { v = { outcome: 'threw', actions: 0, deferred: [], error: err.message }; }
  bump(probeOut, `${e.verdict}/${v.outcome}`);
  if (e.verdict !== 'AUTOMATED') continue;
  if (v.outcome === 'threw') { downgraded++; if (probeThrew.length < 20) probeThrew.push(`${e.name} :: ${v.error ?? ''}`); }
  else if (v.outcome === 'deferred') { downgraded++; for (const d of v.deferred) bump(probeDeferred, d.slice(0, 90)); }
  else if (v.outcome === 'silent') { probeSilent++; if (probeSilentNames.length < 30) probeSilentNames.push(e.name); }
  if (v.outcome === 'threw' || v.outcome === 'deferred') downgradedNames.add(e.name);
}

/* ------------------------------------------------------------------ *
 * 5. Report
 * ------------------------------------------------------------------ */

const N = pool.length;
const preAutomated = verdicts.get('AUTOMATED') ?? 0;
const promptable = verdicts.get('PROMPTABLE') ?? 0;
const prompted = verdicts.get('PROMPTED') ?? 0;
const noText = verdicts.get('NO-TEXT') ?? 0;
const preSilent = verdicts.get('SILENT') ?? 0;

const automated = preAutomated - downgraded;
const silent = preSilent + downgraded;

const L = [];
const say = s => { L.push(s); console.log(s); };

say('='.repeat(78));
say('INDEPENDENT VERIFICATION of the ability-layer coverage numbers');
say('='.repeat(78));
say('');
say('--- THE POOL ---');
say(`rows in the cached bulk file            ${all.length}`);
say(`distinct oracle_id                      ${oracleIds.size}`);
say(`rows with no oracle_id                  ${missingOracleId}`);
say(`rows repeating an oracle_id             ${duplicateOracleId}`);
say('excluded:');
for (const [k, v] of top(drop, 20)) say(`  ${k.padEnd(36)} ${v}`);
say(`POOL                                    ${N}`);
say(`distinct oracle_id in the pool          ${poolOracleIds.size}`);
say('');
say('--- ACCOUNTING ---');
say(`assertClausesAccounted failures         ${accountingFailures}`);
for (const s of accountingSamples) say(`  ${s}`);
say('');
say('--- WHAT THIS RUN MEASURED ABOUT THE ENGINE, rather than assumed ---');
say('(each of these decides thousands of card verdicts, so each is run, not written down)');
for (const [verb, probed] of Object.entries(VERB_PROBE_RESULT)) {
  const verdict = probed.threw
    ? `THREW: ${probed.threw}`
    : probed.actions > 0
      ? `resolves (${probed.actions} action${probed.actions === 1 ? '' : 's'} on the probe board)`
      : `NAMED ONLY (${probed.deferred.length} deferral${probed.deferred.length === 1 ? '' : 's'}, no action)`;
  say(`  ${verb.padEnd(16)} ${verdict}`);
}
say(`  ${'spell resolution'.padEnd(16)} ${SPELL_RUNS_ON_RESOLUTION ? 'a cast Divination drew its two cards' : 'a cast Divination drew nothing'}`);
say(`  ${'spell targets'.padEnd(16)} ${SPELL_TARGETS_ANNOUNCED ? 'some non-test caller announces targets for a spell' : 'NO non-test caller announces a target for a spell'}`);
say(`  ${'activated'.padEnd(16)} ${ACTIVATED_PROBE.detail}`);
if (FORCE_ACTIVATED_DEAD) {
  say(`  ${''.padEnd(16)} DM_ACTIVATED_DEAD=1 is set, so the activated verdict is forced back to dead`);
}
say(`  ${'mode asked'.padEnd(16)} ${MODE_PROBE.detail}`);
say(`  ${'mode drawn'.padEnd(16)} ${MODE_DRAWN_BY_A_SURFACE ? 'a shipped surface draws the options and hands an answer back' : 'NO shipped surface draws a mode choice, so nothing can answer it'}`);
say(`  ${'target asked'.padEnd(16)} ${TARGET_PROBE.detail}`);
say('');
say('--- THE THREE METRICS, my rule (an unplaceable paragraph fails the card) ---');
say(`AUTOMATED   ${String(automated).padStart(6)}  ${pct(automated, N)}%   (${preAutomated} before the probe, ${downgraded} downgraded)`);
/*
 * PROMPTED IS NOW COUNTED, NOT ASSERTED. Changed 22 Aug 2026.
 *
 * It was a hardcoded `0` with a note that no per-card choice UI existed. That
 * was the last written-down verdict in this file and it went the way the other
 * two did: a claim about other code, with an expiry date, and nothing to say
 * when it passed.
 *
 * A card is PROMPTED when every decision it still carries is one the engine
 * OFFERS with its legal options and then honours. That is measured at the top
 * of this run by playing two real cards, not read off a comment. PROMPTABLE
 * below is the wider bucket it is carved out of: a decision that is real but
 * that nothing anywhere offers yet, which is most of them.
 */
say(`PROMPTED    ${String(prompted).padStart(6)}  ${pct(prompted, N)}%   (${PROMPT_BASIS})`);
say(`SILENT      ${String(silent).padStart(6)}  ${pct(silent, N)}%`);
say(`NO-TEXT     ${String(noText).padStart(6)}  ${pct(noText, N)}%`);
say(`PROMPTABLE  ${String(promptable).padStart(6)}  ${pct(promptable, N)}%   (a real decision, and nothing offers it yet)`);
say(
  `reconciles: ${automated} + ${prompted} + ${promptable} + ${silent} + ${noText} = ` +
    `${automated + prompted + promptable + silent + noText} of ${N}`
);
say('');
say('--- THE SAME RUN, scored by THEIR rule ---');
const theirAuto = verdicts.get('THEIRS:AUTOMATED') ?? 0;
const theirPromptable = verdicts.get('THEIRS:PROMPTABLE') ?? 0;
const theirSilent = verdicts.get('THEIRS:SILENT') ?? 0;
say(`AUTOMATED pre-probe   ${theirAuto}   PROMPTABLE ${theirPromptable}   SILENT ${theirSilent}`);
say('');
say('--- DEFECTS THIS SCRIPT LOOKS FOR ---');
say(`cards with a consumed paragraph that produced NO ability   ${consumedButNoAbility}`);
for (const s of consumedButNoAbilitySamples.slice(0, 15)) say(`  ${s}`);
say(`AUTOMATED under their rule, refused under mine             ${automatedWithUnmappedParagraph}`);
for (const s of unmappedSamples.slice(0, 15)) say(`  ${s}`);
say(`AUTOMATED with coverage !== 'full'                         ${automatedWithoutFullCoverage}`);
say(`AUTOMATED under their grading, refused by my stricter grading ${deadGrantCost}`);
say(`  of those, refused for a verb to-actions.ts only NAMES            ${neverResolvedCost}`);
for (const s2 of neverResolvedSamples.slice(0, 20)) say(`    ${s2}`);
say(`engine keyword compiled but absent from card.keywords      ${keywordNotInScryfall}`);
for (const s of keywordNotInScryfallSamples.slice(0, 15)) say(`  ${s}`);
say(`AUTOMATED whose oracle text still carries a decision word  ${overReach.length}`);
for (const s of overReach.slice(0, 25)) say(`  ${s}`);
say('');
say('--- WHAT CARRIES AN AUTOMATED CARD ---');
for (const [k, v] of top(automatedBy, 15)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- COMPILER CEILING ---');
for (const [k, v] of top(coverageHist, 6)) say(`  ${k.padEnd(10)} ${String(v).padStart(6)}  ${pct(v, N)}%`);
say(`abilityEngineOwns (the "906" predicate)  ${ownedByBridge}  ${pct(ownedByBridge, N)}%`);
say('');
say('--- WHY SILENT ---');
for (const [k, v] of top(silentReason, 10)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- DEAD, by reason (ability hits, not cards) ---');
for (const [k, v] of top(deadWhy, 20)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- PROBE ---');
for (const [k, v] of top(probeOut, 10)) say(`  ${String(v).padStart(6)}  ${k}`);
say(`downgraded ${downgraded};  silent-on-probe-board (NOT downgraded) ${probeSilent}`);
for (const s of probeThrew) say(`  threw: ${s}`);
for (const [k, v] of top(probeDeferred, 12)) say(`  defer ${String(v).padStart(5)}  ${k}`);
say('');
say(`If every probe-silent card were also downgraded, AUTOMATED would be ${automated - probeSilent} (${pct(automated - probeSilent, N)}%).`);

writeFileSync(OUT, JSON.stringify({
  pool: { rows: all.length, distinctOracleIds: oracleIds.size, duplicateOracleId, pool: N, poolOracleIds: poolOracleIds.size, drop: Object.fromEntries(drop) },
  metrics: { automated, prompted, silent, noText, promptable, preProbeAutomated: preAutomated, downgraded, probeSilent },
  theirs: { automated: theirAuto, promptable: theirPromptable, silent: theirSilent },
  defects: {
    consumedButNoAbility, consumedButNoAbilitySamples,
    automatedWithUnmappedParagraph, unmappedSamples,
    automatedWithoutFullCoverage,
    keywordNotInScryfall, keywordNotInScryfallSamples,
    deadGrantCost, neverResolvedCost, neverResolvedSamples,
    overReach,
  },
  accountingFailures, accountingSamples,
  ownedByBridge,
  coverage: Object.fromEntries(coverageHist),
  automatedBy: Object.fromEntries(automatedBy),
  silentReason: Object.fromEntries(silentReason),
  deadWhy: Object.fromEntries(top(deadWhy, 60)),
  probe: { outcomes: Object.fromEntries(probeOut), deferred: Object.fromEntries(top(probeDeferred, 40)), threw: probeThrew, silentNames: probeSilentNames },
  automatedSamples,
}, null, 2));

console.log(`\nwrote ${OUT}`);

/*
 * The full name lists, for intersecting this measurement with another one.
 * Off unless DM_NAME_LIST=1, and it changes no figure above.
 *
 * `automated` here is the FINAL set: the pre-probe list minus the names the
 * behaviour probe downgraded, so it reconciles with the AUTOMATED line rather
 * than sitting a few rows above it.
 */
if (process.env.DM_NAME_LIST === '1') {
  const NAMES = join(
    ROOT,
    'scratch',
    process.env.DM_ACTIVATED_LIVE === '1'
      ? 'verify-names-activated-live.json'
      : 'verify-names.json'
  );
  const finalAutomated = allAutomatedNames.filter(n => !downgradedNames.has(n));
  writeFileSync(
    NAMES,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        activatedLive: process.env.DM_ACTIVATED_LIVE === '1',
        pool: N,
        automated: finalAutomated,
        promptable: allPromptableNames,
      },
      null,
      1
    )
  );
  console.log(`wrote ${NAMES}  (automated ${finalAutomated.length}, promptable ${allPromptableNames.length})`);
}
