/**
 * DeckMatrix playtest harness — the command line.
 *
 *   node --experimental-strip-types scripts/playtest/run.ts --seed 1 --games 10
 *   node --experimental-strip-types scripts/playtest/run.ts --seed 1 --games 3 --kind sixty
 *   node --experimental-strip-types scripts/playtest/run.ts --seed 1 --games 50 --verify
 *
 * Game N of a run uses seed `--seed + N`, so any single game is reproduced on
 * its own with `--seed <that number> --games 1`. Nothing here reads a clock as
 * input, including the output directory name, so a run is reproducible down to
 * the filenames.
 *
 * Every game is written to `scratch/playtest/runs/<run>/game-<seed>.json` with
 * its full action list, and the run summary sits next to them. A finding nobody
 * can reproduce is not actionable, so the seed is printed on every line.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_ROOT, loadPool } from './pool.ts';
import { DEFAULT_LIMITS, replayGame, runGame, type GameRecord, type Limits } from './runner.ts';
import type { DeckKind } from './deck.ts';

interface Args {
  seed: number;
  games: number;
  kind: DeckKind | 'both';
  players: number;
  out: string;
  verify: boolean;
  quiet: boolean;
  slim: boolean;
  noMulligan: boolean;
  aggression: 'timid' | 'normal' | 'aggressive';
  useStack: boolean;
  limits: Partial<Limits>;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    seed: 1,
    games: 3,
    kind: 'commander',
    players: 2,
    out: path.join(HARNESS_ROOT, 'scratch', 'playtest', 'runs'),
    verify: false,
    quiet: false,
    slim: false,
    noMulligan: false,
    aggression: 'normal',
    useStack: false,
    limits: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const num = (): number => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${flag} needs a number, got "${value}"`);
      i += 1;
      return parsed;
    };

    switch (flag) {
      case '--seed': args.seed = num(); break;
      case '--games': args.games = num(); break;
      case '--players': args.players = num(); break;
      case '--kind':
        if (value !== 'commander' && value !== 'sixty' && value !== 'both') {
          throw new Error(`--kind must be commander, sixty or both, got "${value}"`);
        }
        args.kind = value;
        i += 1;
        break;
      case '--stack':
        // Cast through the stack and hold a priority round, the way /play does.
        args.useStack = true;
        break;
      case '--aggression':
        if (value !== 'timid' && value !== 'normal' && value !== 'aggressive') {
          throw new Error(`--aggression must be timid, normal or aggressive`);
        }
        args.aggression = value;
        i += 1;
        break;
      case '--out': args.out = path.resolve(value); i += 1; break;
      case '--verify': args.verify = true; break;
      case '--quiet': args.quiet = true; break;
      case '--slim': args.slim = true; break;
      case '--no-mulligan': args.noMulligan = true; break;
      case '--max-turns': args.limits.maxTurns = num(); break;
      case '--max-actions': args.limits.maxActions = num(); break;
      case '--max-actions-per-turn': args.limits.maxActionsPerTurn = num(); break;
      case '--max-actions-per-step': args.limits.maxActionsPerStep = num(); break;
      case '--max-ms': args.limits.maxMillis = num(); break;
      case '--help':
      case '-h':
        console.log(HELP);
        process.exit(0);
        break;
      default:
        if (flag.startsWith('--')) throw new Error(`Unknown flag ${flag}`);
    }
  }

  return args;
}

const HELP = `
DeckMatrix playtest harness

  --seed N        base seed (default 1). Game i uses seed N+i.
  --games N       how many games (default 3)
  --kind K        commander | sixty | both   (default commander)
  --players N     seats at the table (default 2)
  --aggression A  timid | normal | aggressive (default normal)
  --stack         bots announce spells onto the stack, as Play.tsx configures them
  --verify        replay every game and check every state hash
  --slim          drop per-action state deltas from the log (smaller files)
  --no-mulligan   keep every opening hand, however unplayable
  --out DIR       where run folders are written
  --quiet         one line per game, no per-turn detail
  --max-turns N, --max-actions N, --max-actions-per-turn N,
  --max-actions-per-step N, --max-ms N
`.trim();

/* -------------------------------------------------------------------------- */

function describe(record: GameRecord): string {
  const seats = record.seats
    .map(seat => `${seat.playerId} ${seat.life}${seat.hasLost ? ' (out)' : ''}`)
    .join(' vs ');

  if (record.ended) {
    const winner = record.winnerNames.length > 0 ? record.winnerNames.join(', ') : 'nobody';
    const reason = record.seats
      .filter(seat => seat.hasLost)
      .flatMap(seat => seat.lossReasons)
      .join(', ');
    return `finished, ${winner} won on turn ${record.turns}${reason ? ` (${reason})` : ''}. ${seats}`;
  }
  return `STALLED ${record.end} on turn ${record.turns} at "${record.stall?.step}". ${seats}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const kinds: DeckKind[] = args.kind === 'both' ? ['commander', 'sixty'] : [args.kind];

  const poolStart = Date.now();
  const pool = await loadPool();
  if (!args.quiet) {
    console.log(
      `Card snapshot: ${pool.cards.length.toLocaleString()} commander-legal cards ` +
        `(${Date.now() - poolStart} ms, no network, no database).`
    );
  }

  /* `--stack` is part of the run's identity, not a detail. Two runs on the
     same seeds with the stack on and off are different games, and writing
     them to one folder would let the second silently overwrite the first. */
  const runId = `${args.kind}-${args.players}p-seed${args.seed}-x${args.games}${args.useStack ? '-stack' : ''}`;
  const outDir = path.join(args.out, runId);
  fs.mkdirSync(outDir, { recursive: true });

  const records: GameRecord[] = [];
  const failures: string[] = [];
  const runStart = Date.now();

  for (const kind of kinds) {
    for (let i = 0; i < args.games; i++) {
      const seed = args.seed + i;
      const record = await runGame({
        seed,
        kind,
        players: args.players,
        pool,
        limits: args.limits,
        mulligan: !args.noMulligan,
        aggression: args.aggression,
        useStack: args.useStack,
        keepDeltas: !args.slim,
      });
      records.push(record);

      /*
       * The one field that is not a game fact, held out of the file.
       *
       * `ms` is how long this process took, and it was the only thing that
       * differed when the same seed was run three times: every action, every
       * state hash, both decklists and the winner were identical, and the files
       * still had three different sha256 sums. A reviewer checking "does this
       * seed reproduce" by hashing two runs got a false negative from a
       * stopwatch. The timing is still printed on the line below and still
       * lands in `summary.json`, which is a report about the run rather than a
       * record of the game.
       */
      const file = path.join(outDir, `game-${kind}-${seed}.json`);
      const { ms: _elapsed, ...onDisk } = record;
      fs.writeFileSync(file, JSON.stringify(onDisk));

      const commanders = record.seats
        .map(s => s.commander ?? (s.identity.join('') || 'C'))
        .join(' vs ');
      console.log(
        `[${kind} seed ${seed}] ${describe(record)}\n` +
          `    ${commanders}\n` +
          `    ${record.actions.length} actions, ${record.turns} turns, ${record.ms} ms, ` +
          `${record.rejected} refused, ${record.silentActions} changed nothing, ` +
          `${record.moveOnlyPlays} resolved silently` +
          (args.slim ? '' : `, log ${(fs.statSync(file).size / 1024).toFixed(0)} KB`)
      );

      if (record.stall) {
        console.log(`    WHY: ${record.stall.why}`);
        for (const intent of record.stall.botIntent) {
          console.log(
            `      ${intent.seat} wanted: ${intent.note ?? 'nothing (returned null)'}` +
              (intent.actionTypes.length ? ` [${intent.actionTypes.join(', ')}]` : '')
          );
        }
        if (record.stall.error) console.log(`      error: ${record.stall.error.message}`);
        failures.push(`${kind} seed ${seed}: ${record.end}`);
      }

      if (args.verify) {
        const replay = await replayGame(record, pool);
        if (!replay.ok) {
          console.log(`    REPLAY FAILED: ${replay.reason}`);
          failures.push(`${kind} seed ${seed}: replay diverged`);
        } else if (!args.quiet) {
          console.log(`    replay verified: ${replay.checked} actions, every hash matched`);
        }
      }
    }
  }

  /* ---- summary ---- */

  const byEnd = new Map<string, number>();
  for (const record of records) byEnd.set(record.end, (byEnd.get(record.end) ?? 0) + 1);

  const finished = records.filter(r => r.ended);
  const totalActions = records.reduce((sum, r) => sum + r.actions.length, 0);
  const elapsed = Date.now() - runStart;

  const summary = {
    runId,
    seed: args.seed,
    games: records.length,
    kinds,
    players: args.players,
    limits: { ...DEFAULT_LIMITS, ...args.limits },
    poolVersion: pool.version,
    poolCards: pool.cards.length,
    finished: finished.length,
    stalled: records.length - finished.length,
    outcomes: Object.fromEntries(byEnd),
    totalActions,
    ms: elapsed,
    games_detail: records.map(record => ({
      seed: record.seed,
      kind: record.kind,
      end: record.end,
      ended: record.ended,
      turns: record.turns,
      actions: record.actions.length,
      winners: record.winnerNames,
      commanders: record.seats.map(s => s.commander),
      rejected: record.rejected,
      silentActions: record.silentActions,
      moveOnlyPlays: record.moveOnlyPlays,
      stallWhy: record.stall?.why ?? null,
      ms: record.ms,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('');
  console.log(`${records.length} games, ${finished.length} finished, ${records.length - finished.length} stalled.`);
  for (const [kind, count] of [...byEnd].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log(
    `${totalActions.toLocaleString()} actions in ${(elapsed / 1000).toFixed(1)}s ` +
      `(${(elapsed / Math.max(1, records.length)).toFixed(0)} ms per game).`
  );
  console.log(`Written to ${path.relative(HARNESS_ROOT, outDir)}`);

  if (failures.length > 0) {
    console.log('');
    console.log('Reportable:');
    for (const failure of failures) console.log(`  ${failure}`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
