/**
 * DeckMatrix playtest harness — reading the spells back as a player would.
 *
 * WHY THIS EXISTS
 * ---------------
 * `stack-census.ts` counts. A count cannot tell "the bot cast 51 spells" from
 * "the bot cast 51 spells WELL", and the second one is what the owner asked
 * for. So this replays a recorded game through the real reducer, exactly the
 * way the census does — same deck rebuild, same `buildTable`, same setup
 * actions, same per-action hash check — and stops at every accepted cast of an
 * instant or a sorcery to print the position it was cast into:
 *
 *   whose turn, which step, who cast it, what the card says
 *   what it was aimed at, and who controls that
 *   both boards at that instant, with power and toughness as the game sees them
 *   life totals, and what the caster had left untapped afterwards
 *   what the engine actually did when it resolved
 *
 * That is enough to judge the play by hand. Nothing here scores anything: a
 * script that graded the bot's decisions would only be reporting its own
 * opinion back, and the point is to look at the games.
 *
 *   node --experimental-strip-types scripts/playtest/spell-log.ts \
 *     --run <run folder> [--seed N] [--json]
 *
 * A game whose replay diverges prints the divergence and is skipped, rather
 * than printing positions the game was never in.
 */

import fs from 'node:fs';
import path from 'node:path';

import { applyAction, applyActionTraced } from '../../src/lib/game/rules.ts';
import { buildTable } from '../../src/lib/game/setup.ts';
import type { CardInstance, GameState, StackObject } from '../../src/lib/game/types.ts';
import { isLand } from '../../src/lib/game/mana.ts';
import { combatPowerIn, combatToughnessIn, isCreatureIn } from '../../src/lib/game/characteristics.ts';

import { loadPool } from './pool.ts';
import { buildDeck, type BuiltDeck } from './deck.ts';
import { deckHash, type GameRecord } from './runner.ts';
import { hashState } from './fingerprint.ts';

function firstFace(card: CardInstance | undefined): string {
  return (card?.typeLine ?? '').split('//')[0].toLowerCase();
}

function describeCard(state: GameState, id: string | undefined): string {
  if (!id) return '(nothing)';
  const card = state.cards[id];
  if (!card) return `(unknown ${id})`;
  const body = isCreatureIn(state, card)
    ? ` ${combatPowerIn(state, card)}/${combatToughnessIn(state, card)}`
    : '';
  return `${card.name}${body} [${card.controllerId}]`;
}

function boardOf(state: GameState, playerId: string): string {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return '(no seat)';
  const rows = player.zones.battlefield
    .map(id => state.cards[id])
    .filter((card): card is CardInstance => Boolean(card))
    .filter(card => !isLand(card))
    .map(card =>
      isCreatureIn(state, card)
        ? `${card.name} ${combatPowerIn(state, card)}/${combatToughnessIn(state, card)}${card.tapped ? ' (tapped)' : ''}`
        : `${card.name}${card.tapped ? ' (tapped)' : ''}`
    );
  const lands = player.zones.battlefield.filter(id => isLand(state.cards[id]));
  const untapped = lands.filter(id => !state.cards[id]?.tapped).length;
  return `${rows.length ? rows.join(', ') : 'empty'}  | lands ${lands.length} (${untapped} untapped)`;
}

interface Args {
  run: string;
  seed: number | null;
  json: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { run: '', seed: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run') args.run = path.resolve(argv[++i]);
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--json') args.json = true;
  }
  if (!args.run) throw new Error('--run <folder> is required');
  return args;
}

interface CastReport {
  seed: number;
  index: number;
  turn: number;
  step: string;
  activePlayer: string;
  caster: string;
  card: string;
  spellInstanceId: string;
  typeLine: string;
  text: string;
  note: string;
  aimedAt: string[];
  casterBoard: string;
  victimBoard: string;
  life: Record<string, number>;
  untappedLandsAfter: number;
  resolvedInto: string[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = await loadPool();

  const files = fs
    .readdirSync(args.run)
    .filter(f => f.startsWith('game-') && f.endsWith('.json'))
    .sort();

  const reports: CastReport[] = [];

  for (const file of files) {
    const record: GameRecord = JSON.parse(fs.readFileSync(path.join(args.run, file), 'utf8'));
    if (args.seed !== null && record.seed !== args.seed) continue;

    const built: BuiltDeck[] = [];
    for (let i = 0; i < record.players; i++) {
      built.push(
        await buildDeck({ seed: record.seed, kind: record.kind, label: `deck:${record.kind}:seat${i}`, pool })
      );
    }
    if (built.some((entry, i) => deckHash(entry.deck) !== record.deckHashes[i])) {
      console.log(`${record.seed}: decks did not rebuild, skipped.`);
      continue;
    }

    const table = buildTable({
      id: `harness-${record.seed}`,
      seats: built.map((entry, index) => ({ deck: entry.deck, playerName: `Bot ${index + 1}`, isBot: true })),
      format: built[0].deck.format,
      seed: record.seed,
      now: 0,
    });

    let state: GameState = table.state;
    for (const action of record.setupActions) state = applyAction(state, action);
    if (hashState(state) !== record.openingHash) {
      console.log(`${record.seed}: opening did not reproduce, skipped.`);
      continue;
    }

    /* Stack ids of spells this pass is watching, so the resolution can be
       reported next to the cast that caused it rather than on its own. */
    const watching = new Map<string, CastReport>();

    for (const entry of record.actions) {
      const before = state;
      const { state: after, applied } = applyActionTraced(before, entry.action);
      if (hashState(after) !== entry.hash) {
        console.log(`${record.seed}: replay diverged at action ${entry.i}, rest of game skipped.`);
        break;
      }
      state = after;
      if (after === before) continue;

      /* A spell that LEFT the stack: report what the engine ran for it. */
      const idsAfter = new Set((after.stack ?? []).map(o => o.stackId));
      for (const [stackId, report] of watching) {
        if (idsAfter.has(stackId)) continue;
        /*
         * The spell's OWN graveyard move is CR 608.2m and is not work; a
         * MOVE_ZONE of anything else — a bounce, a tuck, a reanimation — is.
         * Tagging it with the instance is what lets the reader tell those
         * apart, and getting that wrong is how a working bounce spell reads as
         * a card that did nothing.
         */
        report.resolvedInto = applied.slice(1).map(a => {
          if (a.type === 'NOTE') return `NOTE: ${(a as { message?: string }).message ?? ''}`;
          const id = (a as { instanceId?: string }).instanceId;
          if (!id) return a.type;
          return id === report.spellInstanceId ? `${a.type}(self)` : `${a.type}(${state.cards[id]?.name ?? id})`;
        });
        watching.delete(stackId);
      }

      if (entry.action.type !== 'CAST_SPELL' && entry.action.type !== 'PLAY') continue;
      const instanceId = (entry.action as { instanceId?: string }).instanceId;
      const card = before.cards[instanceId ?? ''];
      if (!card || isLand(card)) continue;
      const face = firstFace(card);
      if (!face.includes('instant') && !face.includes('sorcery')) continue;

      const object: StackObject | undefined = (after.stack ?? []).find(
        o => o.cardInstanceId === instanceId
      );
      const aimedAt = (object?.targets ?? []).map(target =>
        target.kind === 'player'
          ? `seat ${target.playerId}`
          : describeCard(before, target.instanceId)
      );

      const victimIds = new Set(
        (object?.targets ?? [])
          .map(t => (t.kind === 'card' ? before.cards[t.instanceId]?.controllerId : t.playerId))
          .filter((id): id is string => Boolean(id))
      );

      const report: CastReport = {
        seed: record.seed,
        index: entry.i,
        turn: entry.turn,
        step: entry.step,
        activePlayer: before.activePlayerId ?? '?',
        caster: entry.seat,
        card: card.name,
        spellInstanceId: card.instanceId,
        typeLine: card.typeLine ?? '',
        text: (card.oracleText ?? '').replace(/\n/g, ' / '),
        note: entry.note ?? '',
        aimedAt,
        casterBoard: boardOf(before, entry.seat),
        victimBoard: [...victimIds]
          .filter(id => id !== entry.seat)
          .map(id => `${id}: ${boardOf(before, id)}`)
          .join('  ||  '),
        life: Object.fromEntries(after.players.map(p => [p.id, p.life])),
        untappedLandsAfter: (after.players.find(p => p.id === entry.seat)?.zones.battlefield ?? []).filter(
          id => isLand(after.cards[id]) && !after.cards[id]?.tapped
        ).length,
        resolvedInto: [],
      };
      reports.push(report);
      if (object) watching.set(object.stackId, report);
    }
  }

  if (args.json) {
    console.log(JSON.stringify(reports, null, 1));
    return;
  }

  for (const r of reports) {
    console.log(
      `\n--- seed ${r.seed} action ${r.index} | turn ${r.turn} ${r.step} | active ${r.activePlayer} | caster ${r.caster}`
    );
    console.log(`    ${r.card} (${r.typeLine})`);
    console.log(`    text: ${r.text}`);
    console.log(`    bot said: ${r.note}`);
    console.log(`    aimed at: ${r.aimedAt.length ? r.aimedAt.join(', ') : '(no target announced)'}`);
    console.log(`    caster board: ${r.casterBoard}`);
    if (r.victimBoard) console.log(`    target board: ${r.victimBoard}`);
    console.log(`    life: ${JSON.stringify(r.life)}  untapped lands after: ${r.untappedLandsAfter}`);
    console.log(`    resolved into: ${r.resolvedInto.length ? r.resolvedInto.join(', ') : '(still on the stack)'}`);
  }
  console.log(`\n${reports.length} instant and sorcery casts.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
