/**
 * DOES THE FAN AGREE WITH THE PANEL?
 *
 * `ViewerHand` greys a card the player cannot play and says "You can cast
 * this" on the ones it thinks they can. `actionsForCard` decides, separately,
 * whether the preview offers a Cast button. Two readings of one question is
 * how the hand came to promise a cast the panel then refused.
 *
 * This counts the disagreements over real cards from the harness pool, with a
 * board that can pay for anything, so the only thing that can differ is the
 * rule each side applies. Run it before and after a change to that rule.
 *
 *   node --experimental-strip-types scripts/playtest/hand-panel-agree.ts
 */
import { loadPool } from './pool.ts';
import {
  addCard,
  createGame,
  isLand,
  planCastFromHand,
  planLandDrop,
  planSpellTargets,
  spellNeedsATarget,
  auraNeedsHost,
  type CardInstance,
  type GameState,
} from '../../src/lib/game/index.ts';
import { actionsForCard, handPlayVerdict } from '../../src/components/play/cardActions.ts';

const SAMPLE = Number(process.env.SAMPLE ?? 4000);

/** What `ViewerHand` used to compute for itself, kept to print the before. */
function oldFanVerdict(state: GameState, card: CardInstance): boolean {
  if (isLand(card)) return !!planLandDrop(state, 'p1', card.instanceId).ok;
  return !!planCastFromHand(state, 'p1', card.instanceId).ok;
}

/** What the fan says now. */
function fanVerdict(state: GameState, card: CardInstance): boolean {
  return handPlayVerdict(state, 'p1', card).ok;
}

/**
 * Is there ANY route to playing this card in the preview?
 *
 * Two routes, because a spell that names a target is deliberately not given a
 * plain Cast button: `SpellTargetPanel` casts it once the target is named. A
 * measurement that counted only the buttons would score every removal spell in
 * the game as refused.
 */
function panelVerdict(state: GameState, card: CardInstance): boolean {
  const { actions } = actionsForCard(state, 'p1', card);
  if (actions.some(a => a.kind === 'cast' || a.kind === 'play-land')) return true;
  if (isLand(card) || auraNeedsHost(card) || !spellNeedsATarget(card)) return false;
  /* The panel's own gates, in its own order: it refuses outright when the cast
     is impossible for a reason other than the target, then asks the engine. */
  const verdict = handPlayVerdict(state, 'p1', card);
  if (!verdict.ok && !verdict.needsTarget) return false;
  const aim = planSpellTargets(state, 'p1', card);
  return aim.pending.length > 0 || !aim.reason;
}

async function main() {
  const pool = await loadPool();
  const cards = pool.cards ?? pool;

  let state = createGame({
    id: 'agree',
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Them' },
    ],
    seed: 7,
    now: 0,
  });

  /* Your own main phase with an empty stack: the one moment every legal play is
     legal. Anything the two sides still disagree about is a real disagreement
     about the rule rather than about the clock. */
  state = { ...state, step: (process.env.STEP ?? 'precombat_main') as any, activePlayerId: 'p1', priorityPlayerId: 'p1' };

  /* A board that can pay for anything, so cost never explains a disagreement,
     plus a creature each side so a targeted removal spell has something legal
     to point at some of the time and nothing the rest. */
  for (let i = 0; i < 12; i++) {
    state = addCard(
      state,
      {
        instanceId: `land-${i}`,
        cardId: `land-${i}`,
        ownerId: 'p1',
        name: 'Command Tower',
        typeLine: 'Land',
        colorIdentity: ['W', 'U', 'B', 'R', 'G'],
        oracleText: '{T}: Add one mana of any color.',
      },
      'battlefield'
    );
  }

  const sample = cards.filter((c: any) => c.typeLine || c.type_line).slice(0, SAMPLE);

  const rows: Array<{ name: string; fan: boolean; old: boolean; panel: boolean }> = [];
  for (let i = 0; i < sample.length; i++) {
    const c: any = sample[i];
    const id = `probe-${i}`;
    const withCard = addCard(
      state,
      {
        instanceId: id,
        cardId: c.id ?? id,
        oracleId: c.oracleId ?? c.oracle_id,
        ownerId: 'p1',
        name: c.name,
        typeLine: c.typeLine ?? c.type_line ?? '',
        manaCost: c.manaCost ?? c.mana_cost,
        cmc: c.cmc,
        power: c.power,
        toughness: c.toughness,
        oracleText: c.oracleText ?? c.oracle_text ?? '',
        colorIdentity: c.colorIdentity ?? c.color_identity,
      },
      'hand'
    );
    const card = withCard.cards[id];
    rows.push({
      name: c.name,
      fan: fanVerdict(withCard, card),
      old: oldFanVerdict(withCard, card),
      panel: panelVerdict(withCard, card),
    });
  }

  const promised = rows.filter(r => r.fan && !r.panel);
  const wasPromised = rows.filter(r => r.old && !r.panel);
  const hidden = rows.filter(r => !r.fan && r.panel);

  console.log(`step                        ${state.step}`);
  console.log(`sampled                     ${rows.length}`);
  console.log(`preview offers a route      ${rows.filter(r => r.panel).length}`);
  console.log(`old fan said playable       ${rows.filter(r => r.old).length}`);
  console.log(`new fan says playable       ${rows.filter(r => r.fan).length}`);
  console.log(`OLD promised, panel refused ${wasPromised.length}`);
  console.log(`NEW promised, panel refused ${promised.length}`);
  console.log(`fan greys, panel offers     ${hidden.length}`);
  if (promised.length) {
    console.log('\nstill disagreeing, first 15:');
    for (const r of promised.slice(0, 15)) console.log('  ' + r.name);
  }
  if (wasPromised.length) {
    console.log('\nwhat the old fan promised and the panel refused, first 8:');
    for (const r of wasPromised.slice(0, 8)) console.log('  ' + r.name);
  }
}

main();
