/**
 * DeckMatrix playtest harness — the classifier's own audit trail.
 *
 * WHY THIS EXISTS
 * ---------------
 * The silent-card report is a judgement call dressed as a number. Every row on
 * it rests on `silent.ts` having read a card's oracle text correctly, and there
 * is no way to check that from the outside except by putting the text and the
 * verdict side by side and reading them.
 *
 * So this prints a sample of every verdict class, with the card's full text,
 * what the classifier decided was due, and what the game actually did. If a
 * reader disagrees with any line, the classifier is wrong and the number in the
 * report is wrong with it. That is the intended use: this is the thing that
 * makes the report checkable rather than trusted.
 *
 * It samples the CORRECT verdicts as well as the findings, on purpose. A
 * classifier that under-reports is the more dangerous failure and it can only be
 * caught by reading what it decided to stay quiet about.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAction } from '../../src/lib/game/rules.ts';
import { buildTable } from '../../src/lib/game/setup.ts';
import type { CardInstance, GameEvent, GameState } from '../../src/lib/game/types.ts';

import { HARNESS_ROOT, loadPool } from './pool.ts';
import { buildDeck, type BuiltDeck } from './deck.ts';
import { deckHash, type GameRecord } from './runner.ts';
import { diffState, hashState } from './fingerprint.ts';
import { judgeResolution, readClauses, type CardVerdict } from './silent.ts';

interface Sample extends CardVerdict {
  seed: number;
  at: number;
  oracleText: string;
  typeLine: string;
  clauses: Array<{ kind: string; due: boolean; text: string }>;
}

/** Where an action was sending the card, in the action's own words. */
function destinationOf(action: GameRecord['actions'][number]['action']): string | undefined {
  switch (action.type) {
    case 'PLAY':
      return action.to ?? 'battlefield';
    case 'MOVE_ZONE':
      return action.to;
    case 'CAST_SPELL':
      return action.resolvesTo;
    default:
      return undefined;
  }
}

const RUNS_DIR = path.join(HARNESS_ROOT, 'scratch', 'playtest', 'runs');
const REPORT_DIR = path.join(HARNESS_ROOT, 'scratch', 'playtest', 'reports');

async function collect(runs: readonly string[]): Promise<Sample[]> {
  const pool = await loadPool();
  const files: string[] = [];
  for (const run of runs) {
    const dir = path.isAbsolute(run) ? run : path.join(RUNS_DIR, run);
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('game-') && file.endsWith('.json')) files.push(path.join(dir, file));
    }
  }
  files.sort();

  const samples: Sample[] = [];

  for (const file of files) {
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as GameRecord;

    const built: BuiltDeck[] = [];
    for (let i = 0; i < record.players; i++) {
      built.push(
        await buildDeck({
          seed: record.seed,
          kind: record.kind,
          label: `deck:${record.kind}:seat${i}`,
          pool,
        })
      );
    }
    if (built.some((entry, i) => deckHash(entry.deck) !== record.deckHashes[i])) continue;

    const table = buildTable({
      id: `harness-${record.seed}`,
      seats: built.map((entry, index) => ({
        deck: entry.deck,
        playerName: `Bot ${index + 1}`,
        isBot: true,
      })),
      format: built[0].deck.format,
      seed: record.seed,
      now: 0,
    });

    let state: GameState = table.state;
    for (const action of record.setupActions) state = applyAction(state, action);
    if (hashState(state) !== record.openingHash) continue;

    for (const entry of record.actions) {
      const before = state;
      const after = applyAction(before, entry.action);
      if (hashState(after) !== entry.hash) break;
      state = after;

      const type = entry.action.type;
      if (type !== 'PLAY' && type !== 'MOVE_ZONE' && type !== 'CAST_SPELL') continue;
      const subject = entry.action.instanceId;

      const diff = diffState(before, after);
      const move = diff.zoneMoves.find(m => m.instanceId === subject);
      if (!move) continue;
      const resolvedNow =
        (move.to === 'battlefield' && move.from !== 'battlefield') ||
        (move.to === 'graveyard' &&
          (move.from === 'hand' || move.from === 'stack') &&
          (type === 'PLAY' || type === 'CAST_SPELL'));
      if (!resolvedNow) continue;

      const landed = after.cards[subject];
      const asResolved: CardInstance = before.cards[subject] ?? landed;
      if (!landed || !asResolved) continue;

      const logAdded: GameEvent[] = after.log.slice(before.log.length);
      const verdict = judgeResolution({
        card: { ...asResolved, controllerId: landed.controllerId },
        before,
        after,
        diff,
        logAdded,
        landedIn: move.to,
        playedTo: destinationOf(entry.action),
      });

      samples.push({
        ...verdict,
        seed: record.seed,
        at: entry.i,
        oracleText: asResolved.oracleText ?? '(none loaded)',
        typeLine: asResolved.typeLine ?? '',
        clauses: readClauses(
          asResolved.oracleText ?? '',
          verdict.moment,
          asResolved.name
        ).map(c => ({ kind: c.kind, due: c.due, text: c.text })),
      });
    }
  }

  return samples;
}

function render(samples: readonly Sample[], perClass: number): string {
  const lines: string[] = [];
  const w = (line = ''): void => {
    lines.push(line);
  };

  const byVerdict = new Map<string, Sample[]>();
  for (const sample of samples) {
    const list = byVerdict.get(sample.verdict) ?? [];
    list.push(sample);
    byVerdict.set(sample.verdict, list);
  }

  w(`# Classifier audit`);
  w();
  w(
    `${samples.length.toLocaleString()} card resolutions were judged. Below is a sample of every ` +
      `verdict class with the card's real oracle text next to what the classifier decided, so the ` +
      `decision can be checked rather than taken on trust. If any line reads wrong, the number in ` +
      `the report that depends on it is wrong.`
  );
  w();
  w(`| verdict | count |`);
  w(`|---|---|`);
  for (const [verdict, list] of [...byVerdict].sort((a, b) => b[1].length - a[1].length)) {
    w(`| ${verdict} | ${list.length.toLocaleString()} |`);
  }
  w();

  for (const [verdict, list] of [...byVerdict].sort((a, b) => b[1].length - a[1].length)) {
    w(`## ${verdict}`);
    w();
    // Spread the sample across distinct cards rather than showing one card six
    // times, so a systematic mistake is visible instead of an anecdote.
    const seen = new Set<string>();
    const picked: Sample[] = [];
    for (const sample of list) {
      if (seen.has(sample.cardName)) continue;
      seen.add(sample.cardName);
      picked.push(sample);
      if (picked.length >= perClass) break;
    }

    for (const sample of picked) {
      w(`### ${sample.cardName}`);
      w();
      w(`\`${sample.typeLine}\` — judged at the moment it ${sample.moment === 'enters' ? 'entered the battlefield' : 'resolved as a spell'}. Engine's own claim: \`${sample.engineLevel}\`. Confidence: ${sample.confidence}.`);
      w();
      w(`Oracle text:`);
      w();
      for (const line of sample.oracleText.split('\n')) w(`> ${line}`);
      w();
      w(`How each line was read:`);
      w();
      w(`| due now | read as | line |`);
      w(`|---|---|---|`);
      for (const clause of sample.clauses) {
        w(`| ${clause.due ? 'YES' : 'no'} | ${clause.kind} | ${clause.text.slice(0, 110)} |`);
      }
      w();
      w(`What the game actually did: ${sample.footprint.length > 0 ? sample.footprint.join('; ') : '**nothing at all**'}`);
      w();
      w(`Verdict: ${sample.why}`);
      w();
      w(`Reproduce: seed ${sample.seed}, action ${sample.at}.`);
      w();
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runs: string[] = [];
  let perClass = 6;
  let name = 'audit';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run') runs.push(argv[++i]);
    else if (argv[i] === '--per-class') perClass = Number(argv[++i]);
    else if (argv[i] === '--name') name = argv[++i];
  }
  if (runs.length === 0) {
    console.error('Usage: audit.ts --run <run folder> [--per-class N] [--name <file>]');
    process.exit(1);
  }

  const samples = await collect(runs);
  const out = render(samples, perClass);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${name}.md`);
  fs.writeFileSync(file, out);
  console.log(`${samples.length} resolutions sampled. Written to ${path.relative(HARNESS_ROOT, file)}`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
