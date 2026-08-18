/**
 * Play a real two-player Commander game through src/lib/game, using exactly the
 * helpers /play calls: planLandDrop, planCastFromHand, declareAttack,
 * advanceActions, nextBotMove, applyActions. Nothing is simulated privately.
 */
import fs from 'node:fs';
import {
  buildTable, applyActions, advanceActions, planCastFromHand, planLandDrop,
  declareAttack, nextBotMove, botsAwaitingMove, eligibleAttackers, eligibleBlockers,
  manaSourcesFor, powerOf, toughnessOf, isLand, isCreature, isPermanent, canBlock,
  resolveCombat, STEP_LABELS,
} from './build/game-core.mjs';

const DECKS = JSON.parse(fs.readFileSync(new URL('./decks.json', import.meta.url), 'utf8'));

function toPlayDeck(deckId, name) {
  const rows = DECKS.filter(r => r.deck_id === deckId);
  const cards = [];
  const commanders = [];
  for (const r of rows) {
    const card = {
      cardId: r.id, name: r.name, manaCost: r.mana_cost ?? undefined,
      cmc: r.cmc ?? 0, typeLine: r.type_line ?? undefined,
      power: r.power ?? undefined, toughness: r.toughness ?? undefined,
      colorIdentity: (r.color_identity ?? []).filter(c => 'WUBRGC'.includes(c)),
      imageUrl: r.image ?? undefined,
      keywords: (r.keywords ?? []).map(k => k.toLowerCase()),
    };
    if (r.is_commander) { commanders.push(card); continue; }
    for (let i = 0; i < Math.max(1, r.quantity ?? 1); i++) cards.push(card);
  }
  return { id: deckId, name, format: 'commander', cards, commanders, source: 'user-deck' };
}

const atraxa = toPlayDeck('e0909132-5a48-4416-924c-dd2374d3d34d', "Atraxa Superfriends");
const vondam = toPlayDeck('e110663b-ea8c-4f1d-bf15-f588568828f4', 'Syr Vondam Aristocrats');

console.log(`Deck A: ${atraxa.name} — ${atraxa.cards.length} + ${atraxa.commanders.length} commander (${atraxa.commanders[0]?.name})`);
console.log(`Deck B: ${vondam.name} — ${vondam.cards.length} + ${vondam.commanders.length} commander (${vondam.commanders[0]?.name})`);

const FINDINGS = [];
const seen = new Set();
function find(tag, msg) {
  const key = tag + '::' + msg;
  if (seen.has(key)) return;
  seen.add(key);
  FINDINGS.push({ tag, msg });
  console.log(`   !! [${tag}] ${msg}`);
}

const built = buildTable({
  id: 'harness', seed: 20260818, now: 1, format: 'commander',
  seats: [
    { deck: atraxa, playerName: 'You', playerId: 'p1' },
    { deck: vondam, playerName: 'Vondam Bot', playerId: 'p2', isBot: true },
  ],
});

let state = built.state;
const BOT = ['p2'];
const botOpts = { aggression: 'normal', waitForPlayerIds: ['p1'] };

const p = id => state.players.find(x => x.id === id);
const cardsIn = (id, zone) => p(id).zones[zone].map(i => state.cards[i]).filter(Boolean);
const nameList = arr => arr.map(c => `${c.name}${c.tapped ? '(T)' : ''}`).join(', ') || '—';

function apply(actions, why) {
  if (!actions || actions.length === 0) return;
  const before = state.version;
  state = applyActions(state, actions);
  if (state.version === before) find('no-op', `Action batch for "${why}" changed nothing (${actions.map(a => a.type).join('+')})`);
}

/* ---- what a human player would do on their own turn ------------------ */

function humanPlaysLand() {
  const me = p('p1');
  if (me.landsPlayedThisTurn >= 1) return false;
  const lands = cardsIn('p1', 'hand').filter(isLand);
  if (lands.length === 0) return false;
  const plan = planLandDrop(state, 'p1', lands[0].instanceId, { at: 1 });
  if (!plan.ok) { find('land', `planLandDrop refused ${lands[0].name}: ${plan.reason}`); return false; }
  apply(plan.actions, 'land drop');
  console.log(`   You play ${lands[0].name}`);
  return true;
}

function humanCastsBest() {
  // A player casts the biggest thing they can pay for, commander included.
  const hand = cardsIn('p1', 'hand').filter(c => !isLand(c));
  const cmd = cardsIn('p1', 'command');
  const options = [...hand, ...cmd]
    .map(c => ({ c, plan: planCastFromHand(state, 'p1', c.instanceId, { at: 1 }) }))
    .filter(o => o.plan.ok)
    .sort((a, b) => (b.c.cmc ?? 0) - (a.c.cmc ?? 0));
  if (options.length === 0) return false;
  const { c, plan } = options[0];
  const manaBefore = manaSourcesFor(state, 'p1').length;
  apply(plan.actions, `cast ${c.name}`);
  const manaAfter = manaSourcesFor(state, 'p1').length;
  console.log(`   You cast ${c.name} [${c.manaCost ?? 'free'}] -> ${plan.destination} (mana ${manaBefore}->${manaAfter}, tapped ${plan.payment.tapIds.length})`);
  if (plan.destination === 'battlefield' && !isPermanent(c)) find('zone', `${c.name} (${c.typeLine}) resolved to the battlefield but is not a permanent`);
  return true;
}

function humanAttacks() {
  const available = eligibleAttackers(state, 'p1');
  if (available.length === 0) return false;
  const blockers = eligibleBlockers(state, 'p2');
  // A human swings with anything that is not obviously walking into death.
  const swinging = available.filter(a => {
    const killers = blockers.filter(b => canBlock(a, b) && powerOf(b) >= toughnessOf(a) && toughnessOf(b) > powerOf(a));
    return powerOf(a) > 0 && killers.length === 0;
  });
  if (swinging.length === 0) return false;
  const actions = declareAttack(state, swinging.map(a => ({ attackerId: a.instanceId, defenderPlayerId: 'p2' })), 1);
  apply(actions, 'declare attackers');
  console.log(`   You attack with ${swinging.map(a => `${a.name} ${powerOf(a)}/${toughnessOf(a)}`).join(', ')}`);
  return true;
}

/* ---- driving the table ----------------------------------------------- */

let guard = 0;
const MAX = 4000;
let lastLog = 0;

function drainBots() {
  let n = 0;
  while (n++ < 60) {
    const waiting = botsAwaitingMove(state, BOT, botOpts);
    if (waiting.length === 0) return;
    const move = nextBotMove(state, waiting[0], { ...botOpts, at: 1 });
    if (!move) return;
    const before = state.step + '|' + state.version;
    apply(move.actions, `bot ${move.note}`);
    if (state.step + '|' + state.version === before) { find('bot-stall', `Bot returned a move that changed nothing at ${state.step}: "${move.note}"`); return; }
    if (move.note && !/^(Untaps|Upkeep|Draws|Begins combat|Combat damage|Combat ends|End step|Waits)/.test(move.note)) {
      console.log(`   Bot: ${move.note}`);
    }
    if (state.activePlayerId === 'p1' && state.step === 'untap') return;
  }
  find('bot-stall', 'Bot drain hit 60 iterations without settling');
}

function flushLog() {
  for (let i = lastLog; i < state.log.length; i++) {
    const e = state.log[i];
    if (['DAMAGE', 'PLAYER_LOST', 'GAME_OVER', 'COMMANDER_DAMAGE'].includes(e.type)) console.log(`      · ${e.message}`);
  }
  lastLog = state.log.length;
}

function boardSnapshot(pid) {
  const bf = cardsIn(pid, 'battlefield');
  return {
    lands: bf.filter(isLand).length,
    creatures: bf.filter(isCreature).length,
    other: bf.filter(c => !isLand(c) && !isCreature(c)).length,
    hand: p(pid).zones.hand.length,
    gy: p(pid).zones.graveyard.length,
    life: p(pid).life,
  };
}

console.log(`\nOpening hands: You ${p('p1').zones.hand.length}, Bot ${p('p2').zones.hand.length}. Life ${p('p1').life}/${p('p2').life}. Format ${state.format}, lethal cmd dmg ${state.rules.commanderDamageLethal}.`);
console.log(`Your opening hand: ${nameList(cardsIn('p1', 'hand'))}\n`);

let turnsSeen = 0;
let lastTurn = -1;
const stepsThisTurn = [];

while (state.status === 'playing' && guard++ < MAX && turnsSeen < 24) {
  if (state.turn !== lastTurn) {
    lastTurn = state.turn;
    turnsSeen++;
    const who = p(state.activePlayerId).name;
    console.log(`\n=== Turn ${state.turn} (round ${state.round}) — ${who} — You ${p('p1').life} / Bot ${p('p2').life} ===`);
    const a = boardSnapshot('p1'), b = boardSnapshot('p2');
    console.log(`   You: ${a.lands}L ${a.creatures}C ${a.other}O hand ${a.hand} gy ${a.gy} | Bot: ${b.lands}L ${b.creatures}C ${b.other}O hand ${b.hand} gy ${b.gy}`);
    stepsThisTurn.length = 0;
  }
  stepsThisTurn.push(state.step);

  if (state.activePlayerId === 'p2') {
    // Bot's turn. We are the defender.
    if (state.step === 'declare_blockers' && state.combat.attackers.some(d => d.defenderPlayerId === 'p1' && d.blockedBy.length === 0)) {
      // Human blocks: block anything we kill and survive, or chump if lethal.
      const incoming = state.combat.attackers.filter(d => d.defenderPlayerId === 'p1' && d.blockedBy.length === 0)
        .map(d => state.cards[d.attackerId]).filter(Boolean);
      const mine = eligibleBlockers(state, 'p1');
      const used = new Set(); const blocks = [];
      const lethal = incoming.reduce((s, c) => s + powerOf(c), 0) >= p('p1').life;
      for (const atk of incoming.sort((x, y) => powerOf(y) - powerOf(x))) {
        const cand = mine.filter(m => !used.has(m.instanceId) && canBlock(atk, m));
        const good = cand.find(m => powerOf(m) >= toughnessOf(atk) && toughnessOf(m) > powerOf(atk))
          ?? (lethal ? cand[0] : undefined);
        if (!good) continue;
        used.add(good.instanceId);
        blocks.push({ blockerId: good.instanceId, attackerId: atk.instanceId });
      }
      if (blocks.length > 0) {
        console.log(`   You block: ${blocks.map(b => `${state.cards[b.blockerId].name} blocks ${state.cards[b.attackerId].name}`).join('; ')}`);
        apply([{ type: 'BLOCK', blocks, at: 1 }], 'blocks');
      }
      // Preview what damage will do, then advance through it.
      const preview = resolveCombat(state, 1);
      apply(advanceActions(state, 1), 'advance past blockers');
      if (state.step === 'combat_damage') {
        const out = resolveCombat(state, 1);
        console.log(`   Combat: ${out.summary}`);
        apply([...out.actions, { type: 'ADVANCE_STEP', at: 1 }], 'combat damage');
      }
      flushLog();
      continue;
    }
    drainBots();
    if (state.activePlayerId === 'p2' && botsAwaitingMove(state, BOT, botOpts).length === 0 && state.status === 'playing') {
      // Bot has nothing to do but it is still its turn — the surface must push.
      apply(advanceActions(state, 1), 'advance for stalled bot turn');
    }
    flushLog();
    continue;
  }

  // Our turn.
  switch (state.step) {
    case 'precombat_main':
    case 'postcombat_main': {
      let acted = false;
      if (state.step === 'precombat_main') acted = humanPlaysLand() || acted;
      let castLoop = 0;
      while (humanCastsBest() && castLoop++ < 12) acted = true;
      apply(advanceActions(state, 1), `leave ${state.step}`);
      break;
    }
    case 'declare_attackers': {
      humanAttacks();
      apply(advanceActions(state, 1), 'leave declare_attackers');
      break;
    }
    case 'declare_blockers': {
      // Bot declares blocks against us.
      drainBots();
      apply(advanceActions(state, 1), 'leave declare_blockers');
      break;
    }
    case 'combat_damage': {
      const out = resolveCombat(state, 1);
      if (state.combat.attackers.length > 0) console.log(`   Combat: ${out.summary}`);
      apply(advanceActions(state, 1), 'combat damage');
      flushLog();
      break;
    }
    default:
      apply(advanceActions(state, 1), `advance ${state.step}`);
  }
  flushLog();
}

console.log(`\n=== Game ended: status=${state.status} winners=${JSON.stringify(state.winnerIds)} after ${state.turn} turns, ${state.version} actions ===`);
for (const pl of state.players) {
  console.log(`   ${pl.name}: life ${pl.life}, poison ${pl.poison}, lost=${pl.hasLost} ${JSON.stringify(pl.lossReasons)}, cmdDmg ${JSON.stringify(pl.commanderDamage)}`);
  console.log(`      bf ${pl.zones.battlefield.length} hand ${pl.zones.hand.length} gy ${pl.zones.graveyard.length} lib ${pl.zones.library.length} cmd ${pl.zones.command.length}`);
}

/* ---- post-game invariant checks -------------------------------------- */
console.log('\n--- invariants ---');
for (const pl of state.players) {
  const total = Object.values(pl.zones).reduce((s, z) => s + z.length, 0);
  const expected = pl.id === 'p1' ? atraxa.cards.length + atraxa.commanders.length : vondam.cards.length + vondam.commanders.length;
  if (total !== expected) find('card-count', `${pl.name} has ${total} cards across zones, expected ${expected}`);
}
for (const [id, c] of Object.entries(state.cards)) {
  const owner = state.players.find(x => x.id === c.ownerId);
  const ctrl = state.players.find(x => x.id === c.controllerId);
  const inOwner = owner?.zones[c.zone]?.includes(id);
  const inCtrl = ctrl?.zones[c.zone]?.includes(id);
  if (!inOwner && !inCtrl) find('zone-desync', `${c.name} says zone=${c.zone} but is in neither owner's nor controller's ${c.zone} array`);
}
// Summoning sickness / tapped state sanity
const stuckTapped = cardsIn('p1', 'battlefield').filter(c => c.tapped);
console.log(`   Your permanents still tapped at game end: ${stuckTapped.length}`);
// Graveyard sanity: instants/sorceries should be there
const gySpells = cardsIn('p1', 'graveyard').filter(c => /instant|sorcery/i.test(c.typeLine ?? ''));
console.log(`   Instants/sorceries in your graveyard: ${gySpells.length}`);
const bfSpells = cardsIn('p1', 'battlefield').filter(c => /instant|sorcery/i.test(c.typeLine ?? ''));
if (bfSpells.length) find('zone', `Instants/sorceries sitting on your battlefield: ${nameList(bfSpells)}`);

console.log('\n--- findings ---');
if (FINDINGS.length === 0) console.log('   none from invariants');
for (const f of FINDINGS) console.log(`   [${f.tag}] ${f.msg}`);

fs.writeFileSync(new URL('./final-state.json', import.meta.url), JSON.stringify({ log: state.log.map(e => `${e.turn}/${e.step}: ${e.message}`) }, null, 2));
