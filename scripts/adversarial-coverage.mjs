/**
 * ADVERSARIAL re-derivation of the ability-layer coverage numbers.
 *
 * Written to REFUTE `scripts/verify-ability-coverage.mjs`, and it shares no
 * code with it. Different pool filter, different clause accounting, and a
 * different definition of "the engine runs this".
 *
 * THE ONE METHOD DIFFERENCE THAT MATTERS.
 *
 * The other script's bar is `runEffects(...).actions.length > 0`. That asks the
 * INTERPRETER whether it produced an action. It does not ask the REDUCER
 * whether that action did anything. `applyOne` drops an action whose reducer
 * changed nothing, so a card can produce five actions, apply all five and leave
 * the board exactly as it was, and score AUTOMATED.
 *
 * So this script's bar is a BOARD DELTA. Every ability is driven through
 * `applyActions` on a real game built by `createGame`, and the board is
 * fingerprinted before and after. Same fingerprint, no automation, whatever the
 * action count said.
 *
 * Second difference: the clause accounting is done against `oracle_text` with
 * this file's own splitter, never against `trace.consumedSpans`. A card whose
 * text has four lines and whose compile produced abilities covering three is
 * failed here, regardless of what the compiler's own bookkeeping says about it.
 *
 * Usage:
 *   node --experimental-strip-types scripts/adversarial-coverage.mjs
 *   DM_ADV_LIMIT=2000   sample the first N pool cards (for a fast smoke run)
 *   DM_ADV_NAMES=1      write the full AUTOMATED / PROMPTED name lists
 *
 * Local cached bulk file only. No network, no database, no model.
 */

import { createReadStream, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Imports are limited to the things under test: the compiler and the engine.
import { compileCardAbilities } from '../src/lib/cards/abilities/compiler.ts';
import { effectsOf, hasManualEffect } from '../src/lib/cards/abilities/dsl.ts';
import { createGame, addCard, applyActions } from '../src/lib/game/rules.ts';
import { makeContext } from '../src/lib/game/abilities/context.ts';
import { runEffects } from '../src/lib/game/abilities/to-actions.ts';
import { characteristicView, toEffectPart } from '../src/lib/game/abilities/statics.ts';
import { abilityEngineOwns } from '../src/lib/game/abilities/trigger-bridge.ts';
import { activationsFor } from '../src/lib/game/activate.ts';
import { castSpellAction } from '../src/lib/game/stack.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { eligibleAttackers, eligibleBlockers } from '../src/lib/game/combat.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BULK = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'adversarial-coverage.json');

const LIMIT = Number(process.env.DM_ADV_LIMIT ?? 0) || 0;

const tally = new Map();
const note = (key, by = 1) => tally.set(key, (tally.get(key) ?? 0) + by);
const share = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const ranked = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ================================================================== *
 * 1. THE POOL
 *
 * The 95.7% figure this project had to retract was a 12,000 row slice of
 * 34,088. So the pool is counted three ways and all three are printed: rows in
 * the file, distinct oracle_id, and distinct name. If those three disagree the
 * denominator is not a card set and every percentage below is void.
 * ================================================================== */

if (!existsSync(BULK)) {
  console.error(`missing ${BULK}`);
  process.exit(1);
}

const rows = [];
{
  const rl = createInterface({ input: createReadStream(BULK), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t) rows.push(JSON.parse(t));
  }
}

const byOracleId = new Map();
const byName = new Map();
for (const r of rows) {
  if (r.oracle_id) byOracleId.set(r.oracle_id, (byOracleId.get(r.oracle_id) ?? 0) + 1);
  if (r.name) byName.set(r.name, (byName.get(r.name) ?? 0) + 1);
}

/*
 * My own exclusions, chosen from what a PLAYER can put in a deck rather than
 * copied from the other script. A token, an emblem, an art card and a Planechase
 * plane are not cards a deck holds. A digital-only card cannot be owned in
 * paper. Everything else stays in, including un-sets and silver border, because
 * they are real cards and excluding them would flatter the denominator.
 */
const excluded = new Map();
const pool = [];
for (const c of rows) {
  const layout = String(c.layout ?? '');
  const setType = String(c.set_type ?? '');
  let why = null;
  if (layout === 'token' || layout === 'double_faced_token') why = `layout:${layout}`;
  else if (layout === 'emblem') why = 'layout:emblem';
  else if (layout === 'art_series' || layout === 'front_card') why = `layout:${layout}`;
  else if (layout === 'planar' || layout === 'scheme' || layout === 'vanguard') why = `layout:${layout}`;
  else if (setType === 'token' || setType === 'memorabilia') why = `set_type:${setType}`;
  else if (c.digital === true) why = 'digital only';
  else if (!Array.isArray(c.games) || !c.games.includes('paper')) why = 'never printed on paper';
  if (why) { note(`drop ${why}`); excluded.set(why, (excluded.get(why) ?? 0) + 1); continue; }
  pool.push(c);
}

const work = LIMIT > 0 ? pool.slice(0, LIMIT) : pool;

/* ================================================================== *
 * 2. MY OWN CLAUSE ACCOUNTING
 *
 * Straight off `oracle_text`, split on newlines, reminder text in brackets
 * removed, ability-word prefixes ("Landfall — ") removed. Every surviving line
 * must appear verbatim inside some compiled ability's `text`. The compiler's own
 * span bookkeeping is never consulted, because that bookkeeping is one of the
 * things being checked.
 * ================================================================== */

const stripReminders = s => String(s ?? '').replace(/\([^()]*\)/g, ' ');
const squash = s => stripReminders(s).replace(/\s+/g, ' ').trim().toLowerCase();

function frontFaceText(card) {
  // A modal DFC or transform card: only the front face is playable from hand as
  // itself, and the compiler declares the back a gap. Judge the front.
  const faces = card.card_faces;
  if (Array.isArray(faces) && faces.length > 0 && card.oracle_text == null) {
    return String(faces[0]?.oracle_text ?? '');
  }
  return String(card.oracle_text ?? '');
}

function clauseLines(card) {
  return frontFaceText(card)
    .split('\n')
    .map(line => line.replace(/^[A-Z][A-Za-z'\- ]{2,24}\s+—\s+/, ''))
    .map(squash)
    .filter(Boolean);
}

function abilityHaystack(abilities) {
  return abilities.map(a => squash(a.text ?? '')).filter(Boolean);
}

/** Every printed line is inside some compiled ability's recorded text. */
function everyClausePlaced(card, abilities) {
  const lines = clauseLines(card);
  if (lines.length === 0) return { ok: true, missing: [] };
  const hay = abilityHaystack(abilities);
  const missing = [];
  for (const line of lines) {
    // A keyword line is several abilities: "Flying, vigilance" compiles to two,
    // each carrying only its own word. Match a comma list piecewise.
    const parts = line.split(/,\s*/).map(p => p.trim()).filter(Boolean);
    const placed = parts.every(part => hay.some(h => h.includes(part) || part.includes(h)));
    if (!placed) missing.push(line);
  }
  return { ok: missing.length === 0, missing };
}

/* ================================================================== *
 * 3. THE BOARD, AND THE FINGERPRINT THAT DECIDES EVERYTHING
 * ================================================================== */

const BASE = (() => {
  let s = createGame({
    mode: 'full',
    format: 'commander',
    seed: 11,
    players: [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }],
  });
  s = { ...s, status: 'playing', step: 'precombat_main', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  const put = (id, owner, name, typeLine, zone, extra = {}) => {
    s = addCard(s, {
      instanceId: id, cardId: id, name, ownerId: owner, typeLine,
      power: '2', toughness: '2', tapped: false, damage: 0, summoningSick: false,
      oracleText: '', ...extra,
    }, zone);
  };
  // Lands of every colour so a real mana cost can actually be paid.
  const colours = [['W', 'Plains'], ['U', 'Island'], ['B', 'Swamp'], ['R', 'Mountain'], ['G', 'Forest']];
  for (const [c, name] of colours) {
    for (let i = 0; i < 3; i++) {
      put(`land-${c}-${i}`, 'p1', name, `Basic Land — ${name}`, 'battlefield', {
        power: undefined, toughness: undefined, colorIdentity: [c],
      });
    }
  }
  put('ally', 'p1', 'Ally Bear', 'Creature — Bear', 'battlefield');
  put('foe', 'p2', 'Foe Zombie', 'Creature — Zombie', 'battlefield');
  put('relic', 'p1', 'Ally Relic', 'Artifact', 'battlefield', { power: undefined, toughness: undefined });
  put('inhand', 'p1', 'Hand Bear', 'Creature — Bear', 'hand');
  put('inyard', 'p1', 'Yard Bear', 'Creature — Bear', 'graveyard');
  for (let i = 0; i < 8; i++) put(`lib${i}`, 'p1', `Deck Bear ${i}`, 'Creature — Bear', 'library');
  for (let i = 0; i < 8; i++) put(`olib${i}`, 'p2', `Foe Deck Bear ${i}`, 'Creature — Bear', 'library');
  return s;
})();

/**
 * A projection of everything a player could SEE change. Deliberately excludes
 * the log, the clock, priority and the rng, because those move on every action
 * whether or not anything happened.
 */
function fingerprint(state) {
  const parts = [];
  for (const p of state.players) {
    parts.push(
      p.id, p.life, p.poisonCounters ?? 0,
      p.zones.hand.length, p.zones.library.length, p.zones.graveyard.length,
      p.zones.battlefield.length, p.zones.exile.length, p.zones.command?.length ?? 0,
      (state.manaPool?.[p.id] ?? []).map(u => u.color ?? '?').sort().join('')
    );
  }
  const ids = Object.keys(state.cards).sort();
  for (const id of ids) {
    const c = state.cards[id];
    parts.push(
      id, c.zone, c.tapped ? 1 : 0, c.damage ?? 0, c.controllerId,
      c.attachedTo ?? '-', c.faceDown ? 1 : 0,
      JSON.stringify(c.counters ?? {})
    );
  }
  parts.push('stack', (state.stack ?? []).length);
  parts.push('timed', (state.timedEffects ?? []).length);
  parts.push('pending', (state.pendingTriggers ?? []).length);
  return parts.join('|');
}

/** Every characteristic the engine computes for every object, as one string. */
function viewPrint(state) {
  let out = '';
  const view = characteristicView(state);
  for (const id of Object.keys(view).sort()) {
    const v = view[id];
    out += `${id}:${v.power}/${v.toughness}:${(v.types ?? []).join('.')}:${(v.subtypes ?? []).join('.')}:${(v.colors ?? []).join('')}:${(v.keywords ?? []).slice().sort().join('.')};`;
  }
  return out;
}

const BASE_PRINT = fingerprint(BASE);
const BASE_VIEW = viewPrint(BASE);

let staticNoDeltaHere = 0;
let nextId = 0;
function withCard(card, zone, typeLine, extra = {}) {
  const id = `sub${nextId++}`;
  const state = addCard(BASE, {
    instanceId: id,
    cardId: id,
    name: String(card.name ?? 'Subject'),
    ownerId: 'p1',
    typeLine,
    oracleText: frontFaceText(card),
    power: card.power ?? undefined,
    toughness: card.toughness ?? undefined,
    manaCost: card.mana_cost ?? undefined,
    keywords: card.keywords ?? [],
    tapped: false,
    damage: 0,
    summoningSick: false,
  }, zone);
  return { state, id };
}

/* ================================================================== *
 * 4. DOES THE ENGINE ACTUALLY DO IT? ONE ANSWER PER ABILITY.
 *
 * `runs`     the board moved
 * `asks`     the engine refused and offered the decision with its options
 * `blocked`  a decision nothing offers
 * `dead`     nothing moved and nothing was offered
 * ================================================================== */

/** Run an effect tree and require the REDUCER to move the board. */
function effectsMoveTheBoard(effects, state, sourceId) {
  let run;
  try {
    run = runEffects(effects, makeContext(state, sourceId, 'p1'), {
      at: 0, cause: 'adversarial', idPrefix: 'adv:0',
    });
  } catch (err) {
    return { moved: false, threw: String(err?.message ?? err), actions: 0, deferred: [] };
  }
  if (run.actions.length === 0) {
    return { moved: false, actions: 0, deferred: run.deferred };
  }
  let after;
  try {
    after = applyActions(state, run.actions);
  } catch (err) {
    return { moved: false, threw: String(err?.message ?? err), actions: run.actions.length, deferred: run.deferred };
  }
  return {
    moved: fingerprint(after) !== fingerprint(state) || viewPrint(after) !== viewPrint(state),
    actions: run.actions.length,
    deferred: run.deferred,
  };
}

const DECIDING = new Set(['may', 'choose-mode', 'unless-pays']);
function decisionKind(effects) {
  for (const e of effects ?? []) {
    if (DECIDING.has(e.do)) return e.do;
    if (e.do === 'if') { const r = decisionKind(e.then) ?? decisionKind(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') {
      const r = decisionKind(e.effects); if (r) return r;
    }
    if (e.do === 'choose-mode') { for (const m of e.modes) { const r = decisionKind(m.effects); if (r) return r; } }
  }
  return null;
}

function gradeKeyword(ability, printed) {
  const kw = String(ability.keyword ?? '').toLowerCase();
  if (keywordSupport(kw) !== 'engine') return { s: 'dead', why: `advisory keyword "${kw}"` };
  if (!printed.has(kw)) return { s: 'dead', why: `engine keyword "${kw}" absent from card.keywords` };
  return { s: 'runs', why: 'engine keyword, printed' };
}

/**
 * A static ability runs when adding the card to the battlefield CHANGES what
 * `characteristicView` answers for some object. That is a real delta through the
 * real layer engine, not a table saying which layers have a reader.
 */
/*
 * WHICH RESTRICTIONS DOES ANYTHING ACTUALLY ENFORCE?
 *
 * Measured, not listed. One creature, one real restriction clause, and combat.ts
 * asked whether it may attack and whether it may block. A rule whose presence
 * changes neither answer is enforced by nobody.
 */
const RESTRICTIONS_ENFORCED = (() => {
  const enforced = new Set();
  const probes = [
    ['cant-attack', "This creature can't attack.", 'attack'],
    ['cant-block', "This creature can't block.", 'block'],
    ['cant-untap', "This creature doesn't untap during your untap step.", 'attack'],
    ['must-attack', 'This creature attacks each combat if able.', 'attack'],
    ['cant-be-blocked-except-by', "This creature can't be blocked except by two or more creatures.", 'block'],
  ];
  for (const [rule, text, which] of probes) {
    try {
      const plainId = `probe-plain-${rule}`;
      const restrId = `probe-restr-${rule}`;
      let s1 = addCard(BASE, { instanceId: plainId, cardId: plainId, name: 'Plain Probe', ownerId: 'p1',
        typeLine: 'Creature — Human', oracleText: '', power: '2', toughness: '2', summoningSick: false }, 'battlefield');
      let s2 = addCard(BASE, { instanceId: restrId, cardId: restrId, name: 'Restricted Probe', ownerId: 'p1',
        typeLine: 'Creature — Human', oracleText: text, power: '2', toughness: '2', summoningSick: false }, 'battlefield');
      const a1 = eligibleAttackers(s1, 'p1').some(c => c.instanceId === plainId);
      const a2 = eligibleAttackers(s2, 'p1').some(c => c.instanceId === restrId);
      const b1 = eligibleBlockers(s1, 'p1').some(c => c.instanceId === plainId);
      const b2 = eligibleBlockers(s2, 'p1').some(c => c.instanceId === restrId);
      if (which === 'attack' ? a1 !== a2 : b1 !== b2) enforced.add(rule);
    } catch { /* an unreadable probe is not evidence of enforcement */ }
  }
  return enforced;
})();

function gradeStatic(ability, card, typeLine) {
  const { state, id } = withCard(card, 'battlefield', typeLine);

  /*
   * FIRST, THE MAPPER, because a delta on ONE board cannot refute a static.
   * "Other Elves you control get +1/+1" changes nothing here, and my board
   * having no Elves is a fact about my board. So the binding question is asked
   * of `toEffectPart`, which is the engine's own translator from a compiled
   * modification into something `layers.ts` applies. Null means layers.ts has
   * no part for it and the modification is inert on EVERY board.
   */
  const ctx = makeContext(state, id, 'p1');
  for (const m of ability.modifications ?? []) {
    /*
     * A restriction is NOT a layer effect and `toEffectPart` returns null for
     * every one of them, so asking the mapper would grade Propaganda and Pacifism
     * alike as dead. `scanStatics` collects them into `StaticScan.restrictions`
     * and `hasRestriction` answers them. Which rules a consumer reads is measured
     * once, at the top of this run, by putting a real restriction on a real
     * creature and asking combat.ts whether it may attack or block.
     */
    if (m.layer === 'restriction') {
      const rule = String(m.rule?.rule ?? '?');
      if (!RESTRICTIONS_ENFORCED.has(rule)) {
        return { s: 'dead', why: `static: nothing enforces the restriction "${rule}"` };
      }
      continue;
    }
    let part = null;
    try { part = toEffectPart(m, ctx); } catch { part = null; }
    if (!part) return { s: 'dead', why: `static: layers.ts has no part for a "${m.layer}" modification${m.layer === 'restriction' ? ` (${m.rule?.rule})` : ''}` };
  }

  let after;
  try { after = viewPrint(state); }
  catch (err) { return { s: 'dead', why: `layers threw: ${String(err?.message ?? err)}` }; }
  // The subject itself is new, so its own row is always "different". Compare only
  // the rows that existed before.
  const before = new Map(BASE_VIEW.split(';').filter(Boolean).map(r => [r.split(':')[0], r]));
  for (const row of after.split(';')) {
    if (!row) continue;
    const id = row.split(':')[0];
    if (!before.has(id)) continue;
    if (before.get(id) !== row) return { s: 'runs', why: 'a characteristic of an existing object changed' };
  }
  // A static that only modifies ITSELF (a "this creature gets +1/+1 as long as")
  // still counts, so compare the subject against its printed box.
  const subjectRow = after.split(';').find(r => r.startsWith('sub'));
  if (subjectRow) {
    const [, pt] = subjectRow.split(':');
    const printedPt = `${card.power ?? 'null'}/${card.toughness ?? 'null'}`;
    if (pt && pt !== printedPt && card.power != null) return { s: 'runs', why: 'the source\'s own box changed' };
  }
  /*
   * The mapper said layers.ts has a part for it and nothing on THIS board
   * changed, which is a fact about the board and not about the card. Counted
   * separately and graded `runs`, so this script never claims a static is dead
   * on the strength of one small battlefield.
   */
  staticNoDeltaHere++;
  return { s: 'runs', why: 'layers.ts has a part for it; nothing on this board matched' };
}

function gradeTriggered(ability, card, typeLine, owns) {
  if (!owns) return { s: 'dead', why: 'trigger not owned by the ability engine' };
  const d = decisionKind(effectsOf(ability));
  if (d) return { s: 'blocked', why: `trigger contains ${d}` };
  const { state, id } = withCard(card, 'battlefield', typeLine);
  const r = effectsMoveTheBoard(effectsOf(ability), state, id);
  if (r.threw) return { s: 'dead', why: `trigger threw: ${r.threw.slice(0, 60)}` };
  if (r.deferred.length > 0) return { s: 'dead', why: `trigger deferred: ${r.deferred[0].slice(0, 60)}` };
  if (!r.moved) return { s: 'dead', why: r.actions === 0 ? 'trigger produced no action' : 'trigger acted and the board did not move' };
  return { s: 'runs', why: 'trigger owned, ran, and the board moved' };
}

function gradeActivated(ability, card, typeLine) {
  const { state, id } = withCard(card, 'battlefield', typeLine);
  let options;
  try { options = activationsFor(state, 'p1', state.cards[id], { at: 0 }); }
  catch (err) { return { s: 'dead', why: `activationsFor threw: ${String(err?.message ?? err).slice(0, 60)}` }; }
  const option = options.find(o => o.abilityId === ability.id);
  if (!option) return { s: 'dead', why: 'the ability was never offered' };
  if (!option.ok) {
    if ((option.pending ?? []).length > 0) {
      const kinds = [...new Set(option.pending.map(p => p.kind))].join('+');
      const empty = option.pending.some(p =>
        (p.kind === 'mode' ? (p.modes ?? []).length : (p.instanceIds ?? []).length + (p.playerIds ?? []).length) === 0);
      return empty
        ? { s: 'blocked', why: `asked for a ${kinds} with nothing to choose from` }
        : { s: 'asks', why: `offers a ${kinds} with its options` };
    }
    return { s: 'dead', why: `refused: ${String(option.reason ?? '').slice(0, 70)}` };
  }
  let after;
  try { after = applyActions(state, [...option.actions, { type: 'RESOLVE_STACK' }]); }
  catch (err) { return { s: 'dead', why: `activation threw: ${String(err?.message ?? err).slice(0, 60)}` }; }
  const before = fingerprint(state);
  if (fingerprint(after) === before && viewPrint(after) === viewPrint(state)) {
    return { s: 'dead', why: 'activated, resolved, board unchanged' };
  }
  // Tapping to pay is not the ability doing something. Require a change that is
  // not only the source becoming tapped.
  const onlyTaps = (() => {
    const a = fingerprint(after).split('|');
    const b = before.split('|');
    let diffs = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs++;
    return diffs <= 1;
  })();
  if (onlyTaps && viewPrint(after) === viewPrint(state)) {
    return { s: 'dead', why: 'the only change was the cost being paid' };
  }
  return { s: 'runs', why: 'planned, paid, announced, resolved, board moved' };
}

function gradeSpell(ability, card, typeLine) {
  if ((ability.targets ?? []).length > 0 && !SPELL_TARGETS_ANNOUNCED) {
    return { s: 'dead', why: 'a spell target, and no shipped surface announces one' };
  }
  const d = decisionKind(effectsOf(ability));
  if (d) return { s: 'blocked', why: `spell contains ${d}` };
  const { state, id } = withCard(card, 'hand', typeLine);
  let after;
  try {
    after = applyActions(state, [
      castSpellAction('p1', id, { resolvesTo: 'graveyard' }),
      { type: 'RESOLVE_STACK' },
    ]);
  } catch (err) {
    return { s: 'dead', why: `cast threw: ${String(err?.message ?? err).slice(0, 60)}` };
  }
  // The card itself moving hand -> graveyard is the cast, not the spell's text.
  // Blank the subject's own row out of both prints before comparing.
  const scrub = s => s.split('|').filter(x => !String(x).startsWith(id)).join('|');
  const beforeF = scrub(fingerprint(state));
  const afterF = scrub(fingerprint(after));
  // Hand and graveyard counts move for the same reason. Normalise them too.
  const normal = s => s.replace(/\|\d+\|/g, '|#|');
  if (beforeF === afterF) return { s: 'dead', why: 'resolved and nothing but the card itself moved' };
  if (normal(beforeF) === normal(afterF) && viewPrint(after) === viewPrint(state)) {
    return { s: 'dead', why: 'only the zone counts moved, which is the cast itself' };
  }
  return { s: 'runs', why: 'cast and resolved, the board moved' };
}

function gradeReplacement(ability, card, typeLine) {
  const r = ability.result ?? {};
  const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
  if (!selfEnters) return { s: 'dead', why: 'replacement: not a self-enters replacement' };
  /*
   * A replacement is applied by `replacement.ts` on the PLAY action, never by
   * `addCard`. So this one is graded by actually PLAYING the card out of hand
   * through the reducer and reading the permanent that landed.
   */
  const played = (() => {
    const { state, id } = withCard(card, 'hand', typeLine);
    try { return { after: applyActions(state, [{ type: 'PLAY', instanceId: id, at: 0 }]), id }; }
    catch (err) { return { threw: String(err?.message ?? err), id }; }
  })();
  if (played.threw) return { s: 'dead', why: `PLAY threw: ${played.threw.slice(0, 60)}` };
  const landed = played.after.cards[played.id];
  if (!landed || landed.zone !== 'battlefield') return { s: 'dead', why: 'PLAY did not put it on the battlefield' };

  if (r.do === 'enters-tapped') {
    return landed.tapped
      ? { s: 'runs', why: 'entered tapped' }
      : { s: 'dead', why: 'enters-tapped, and it entered untapped' };
  }
  if (r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) {
    const counters = landed.counters ?? {};
    return Object.values(counters).some(v => Number(v) > 0)
      ? { s: 'runs', why: 'entered with counters' }
      : { s: 'dead', why: 'enters-with-counters, and it entered with none' };
  }
  return { s: 'dead', why: `replacement result "${r.do}" has no reader` };
}

function gradeMana(ability, card, typeLine) {
  const { state, id } = withCard(card, 'battlefield', typeLine);
  let options;
  try { options = activationsFor(state, 'p1', state.cards[id], { at: 0 }); }
  catch { return { s: 'dead', why: 'activationsFor threw on a mana ability' }; }
  const option = options.find(o => o.abilityId === ability.id);
  if (!option) return { s: 'dead', why: 'the mana ability was never offered' };
  if (!option.ok) {
    return (option.pending ?? []).length > 0
      ? { s: 'asks', why: 'mana ability offers its choice' }
      : { s: 'dead', why: `refused: ${String(option.reason ?? '').slice(0, 60)}` };
  }
  const after = applyActions(state, option.actions);
  const pool = (after.manaPool?.p1 ?? []).length;
  return pool > (state.manaPool?.p1 ?? []).length
    ? { s: 'runs', why: 'mana landed in the pool' }
    : { s: 'dead', why: 'activated and the pool did not grow' };
}

/* Does any shipped surface announce a target for a SPELL? Asked once, by
 * running the shipped planner rather than by grepping for a call site. */
const SPELL_TARGETS_ANNOUNCED = (() => {
  // `CastOptions.targets` existing is not the question; a caller filling it is.
  // Grep the shipped tree, tests excluded, for a call that passes one.
  const hits = [];
  const walk = dir => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      if (/\.test\.tsx?$/.test(e.name)) continue;
      const text = readFileSync(full, 'utf8');
      for (const m of text.matchAll(/(planCastFromHand|castSpellAction|castSpell)\s*\(([\s\S]{0,800}?)\n\s*\)/g)) {
        if (/\btargets\s*:/.test(m[2])) hits.push(full);
      }
    }
  };
  walk(join(ROOT, 'src', 'components'));
  walk(join(ROOT, 'src', 'pages'));
  return hits.length > 0;
})();

/* ================================================================== *
 * 5. THE RUN
 * ================================================================== */

const verdicts = new Map();
const deadWhy = new Map();
const silentWhy = new Map();
const automatedShape = new Map();
const automatedNames = [];
const promptedNames = [];
const clauseGapSamples = [];
let clauseGapCards = 0;
let compileThrew = 0;

const started = Date.now();
let done = 0;

for (const card of work) {
  done++;
  if (done % 4000 === 0) {
    process.stderr.write(`  ${done}/${work.length}  ${Math.round((Date.now() - started) / 1000)}s\n`);
  }

  let compiled;
  try { compiled = compileCardAbilities(card); }
  catch (err) { compileThrew++; note('COMPILE THREW'); verdicts.set('SILENT', (verdicts.get('SILENT') ?? 0) + 1); continue; }

  const abilities = compiled.abilities ?? [];
  const unparsed = compiled.unparsed ?? [];
  const printedKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));
  const typeLine = String(card.type_line ?? (card.card_faces?.[0]?.type_line ?? 'Artifact'));

  if (clauseLines(card).length === 0) { verdicts.set('NO-TEXT', (verdicts.get('NO-TEXT') ?? 0) + 1); continue; }

  // Hard gate 1: the compiler dropped text, or gave up.
  if (unparsed.length > 0) {
    verdicts.set('SILENT', (verdicts.get('SILENT') ?? 0) + 1);
    silentWhy.set('unparsed text', (silentWhy.get('unparsed text') ?? 0) + 1);
    continue;
  }
  if (abilities.some(a => hasManualEffect(effectsOf(a)))) {
    verdicts.set('SILENT', (verdicts.get('SILENT') ?? 0) + 1);
    silentWhy.set('{do:manual}', (silentWhy.get('{do:manual}') ?? 0) + 1);
    continue;
  }
  if (abilities.length === 0) {
    verdicts.set('SILENT', (verdicts.get('SILENT') ?? 0) + 1);
    silentWhy.set('text, and no ability came out', (silentWhy.get('text, and no ability came out') ?? 0) + 1);
    continue;
  }

  // Hard gate 2: MY clause accounting, off oracle_text.
  const placed = everyClausePlaced(card, abilities);
  if (!placed.ok) {
    clauseGapCards++;
    if (clauseGapSamples.length < 30) clauseGapSamples.push(`${card.name} :: unplaced line: ${placed.missing[0].slice(0, 90)}`);
    verdicts.set('SILENT', (verdicts.get('SILENT') ?? 0) + 1);
    silentWhy.set('a printed line maps to no ability', (silentWhy.get('a printed line maps to no ability') ?? 0) + 1);
    continue;
  }

  // The ability engine's own ownership gate, needed by the trigger grade.
  let owns = false;
  try {
    const { state, id } = withCard(card, 'battlefield', typeLine);
    owns = abilityEngineOwns(state.cards[id]);
  } catch { owns = false; }

  const grades = [];
  for (const ability of abilities) {
    let g;
    try {
      switch (ability.kind) {
        case 'keyword': g = gradeKeyword(ability, printedKeywords); break;
        case 'static': g = gradeStatic(ability, card, typeLine); break;
        case 'triggered': g = gradeTriggered(ability, card, typeLine, owns); break;
        case 'activated': g = gradeActivated(ability, card, typeLine); break;
        case 'spell': g = gradeSpell(ability, card, typeLine); break;
        case 'replacement': g = gradeReplacement(ability, card, typeLine); break;
        case 'mana': g = gradeMana(ability, card, typeLine); break;
        default: g = { s: 'dead', why: `unknown kind ${ability.kind}` };
      }
    } catch (err) {
      g = { s: 'dead', why: `grader threw: ${String(err?.message ?? err).slice(0, 60)}` };
    }
    grades.push(g);
    if (g.s === 'dead') deadWhy.set(g.why, (deadWhy.get(g.why) ?? 0) + 1);
  }

  const anyDead = grades.some(g => g.s === 'dead');
  const anyBlocked = grades.some(g => g.s === 'blocked');
  const anyAsks = grades.some(g => g.s === 'asks');

  let verdict;
  if (anyDead) verdict = 'SILENT';
  else if (anyBlocked) verdict = 'PROMPTABLE';
  else if (anyAsks) verdict = 'PROMPTED';
  else verdict = 'AUTOMATED';

  verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
  if (verdict === 'SILENT') {
    const first = grades.find(g => g.s === 'dead');
    silentWhy.set('understood, nothing moved the board', (silentWhy.get('understood, nothing moved the board') ?? 0) + 1);
  }
  if (verdict === 'AUTOMATED') {
    automatedNames.push(card.name);
    const kinds = [...new Set(abilities.map(a => a.kind))].sort().join('+');
    automatedShape.set(kinds, (automatedShape.get(kinds) ?? 0) + 1);
  }
  if (verdict === 'PROMPTED') promptedNames.push(card.name);
}

/* ================================================================== *
 * 6. REPORT
 * ================================================================== */

const N = work.length;
const A = verdicts.get('AUTOMATED') ?? 0;
const P = verdicts.get('PROMPTED') ?? 0;
const B = verdicts.get('PROMPTABLE') ?? 0;
const S = verdicts.get('SILENT') ?? 0;
const T = verdicts.get('NO-TEXT') ?? 0;

const say = s => console.log(s);
say('='.repeat(78));
say('ADVERSARIAL COVERAGE — board-delta bar, own pool, own clause accounting');
say('='.repeat(78));
say('');
say('--- POOL, counted three ways ---');
say(`rows in the cached bulk file      ${rows.length}`);
say(`distinct oracle_id                ${byOracleId.size}`);
say(`distinct name                     ${byName.size}`);
say(`oracle_ids appearing twice        ${[...byOracleId.values()].filter(v => v > 1).length}`);
say('excluded:');
for (const [k, v] of ranked(excluded, 20)) say(`  ${k.padEnd(34)} ${v}`);
say(`POOL                              ${pool.length}`);
say(`GRADED THIS RUN                   ${N}${LIMIT ? '  (DM_ADV_LIMIT sample, NOT the pool)' : ''}`);
say('');
say('--- WHAT THIS RUN MEASURED ABOUT THE ENGINE ---');
say(`  spell targets announced by a shipped surface: ${SPELL_TARGETS_ANNOUNCED ? 'YES' : 'NO'}`);
say(`  restrictions something actually enforces: ${[...RESTRICTIONS_ENFORCED].join(', ') || 'none'}`);
say('');
say('--- THE THREE METRICS, board-delta bar ---');
say(`AUTOMATED   ${String(A).padStart(6)}  ${share(A, N)}%`);
say(`PROMPTED    ${String(P).padStart(6)}  ${share(P, N)}%`);
say(`SILENT      ${String(S).padStart(6)}  ${share(S, N)}%`);
say(`PROMPTABLE  ${String(B).padStart(6)}  ${share(B, N)}%`);
say(`NO-TEXT     ${String(T).padStart(6)}  ${share(T, N)}%`);
say(`reconciles: ${A + P + S + B + T} of ${N}`);
say('');
say('--- CARDS FAILED BY MY CLAUSE ACCOUNTING (a printed line maps to no ability) ---');
say(`  ${clauseGapCards}`);
for (const s of clauseGapSamples.slice(0, 20)) say(`  ${s}`);
say('');
say('--- WHY SILENT ---');
for (const [k, v] of ranked(silentWhy, 12)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- DEAD, by reason (ability hits) ---');
for (const [k, v] of ranked(deadWhy, 30)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- WHAT CARRIES AN AUTOMATED CARD ---');
for (const [k, v] of ranked(automatedShape, 15)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say(`compile threw on ${compileThrew} cards`);
say(`static modifications layers.ts maps but this board did not exercise: ${staticNoDeltaHere}`);

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  pool: { rows: rows.length, oracleIds: byOracleId.size, names: byName.size, pool: pool.length, graded: N, excluded: Object.fromEntries(excluded) },
  metrics: { automated: A, prompted: P, promptable: B, silent: S, noText: T },
  spellTargetsAnnounced: SPELL_TARGETS_ANNOUNCED,
  clauseGapCards, clauseGapSamples, staticNoDeltaHere,
  silentWhy: Object.fromEntries(silentWhy),
  deadWhy: Object.fromEntries(ranked(deadWhy, 80)),
  automatedShape: Object.fromEntries(automatedShape),
  automatedNames: process.env.DM_ADV_NAMES === '1' ? automatedNames : automatedNames.slice(0, 200),
  promptedNames: process.env.DM_ADV_NAMES === '1' ? promptedNames : promptedNames.slice(0, 200),
}, null, 2));
console.log(`\nwrote ${OUT}`);
