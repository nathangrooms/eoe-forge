/**
 * Commit and push, but ONLY if the tree is green.
 *
 * The owner is asleep and wants to check progress on GitHub. Several workflows
 * are writing to this tree at once, so at any given moment it may be mid-edit.
 * An auto-commit that pushed regardless would put broken states on the branch
 * they are checking, which is worse than pushing nothing.
 *
 * So this is a GATE, not a timer. It runs the same three checks a human would
 * run before committing, and if any of them fails it says so and pushes
 * nothing. A failure is not an error here: it usually means a workflow is
 * halfway through a file, and the next run will pick it up.
 *
 *   node scripts/auto-commit.mjs
 *
 * The message is deliberately plain. Real commit messages on this project
 * explain WHY, and a script cannot know why, so it does not pretend to: it
 * records what changed and leaves the reasoning to the human commit that
 * follows.
 */
import { execFileSync } from 'node:child_process';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });

/* shell:true matters on Windows, where npm is a .cmd and execFile cannot run
   it directly. Leaving it off made this report a build failure on a build that
   exits 0, which is the worst kind of gate: one that blocks good work. */
const quiet = (cmd, args) => {
  try {
    run(cmd, args, { shell: true });
    return true;
  } catch {
    return false;
  }
};

function main() {
  const dirty = run('git', ['status', '--porcelain']).trim();
  if (!dirty) {
    console.log('nothing to commit');
    return;
  }

  const files = dirty.split('\n').length;
  console.log(`${files} files changed, checking the tree before pushing any of them`);

  // The same three a human runs. Typecheck first: it is the fastest way to
  // catch a file that is halfway through being written.
  if (!quiet('node', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.app.json'])) {
    console.log('typecheck failed, pushing nothing (a workflow is probably mid-edit)');
    return;
  }
  console.log('  typecheck clean');

  let tests;
  try {
    tests = run('npm', ['test'], { shell: true });
  } catch (e) {
    console.log('tests failed, pushing nothing');
    return;
  }
  const pass = /^# pass (\d+)/m.exec(tests)?.[1] ?? '?';
  const fail = /^# fail (\d+)/m.exec(tests)?.[1] ?? '?';
  if (fail !== '0') {
    console.log(`${fail} tests failing, pushing nothing`);
    return;
  }
  console.log(`  ${pass} tests pass`);

  if (!quiet('npm', ['run', 'build'])) {
    console.log('build failed, pushing nothing');
    return;
  }
  console.log('  build clean');

  /* What changed, by area, so the message says something a person can scan
     without opening the diff. */
  const areas = new Map();
  for (const line of dirty.split('\n')) {
    const path = line.slice(3).trim().replace(/^"|"$/g, '');
    const area = path.split('/').slice(0, 2).join('/');
    areas.set(area, (areas.get(area) ?? 0) + 1);
  }
  const summary = [...areas.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([a, n]) => `  ${String(n).padStart(3)}  ${a}`)
    .join('\n');

  run('git', ['add', '-A']);
  const message = [
    `Checkpoint: ${files} files, ${pass} tests pass`,
    '',
    'Pushed by scripts/auto-commit.mjs so progress is visible on GitHub while',
    'several workflows are running. It gates on typecheck, tests and build, and',
    'pushes nothing if any of them fails, because a broken checkpoint is worse',
    'than no checkpoint.',
    '',
    'It does not explain WHY anything changed, because a script cannot know. The',
    'workflow that produced this work writes that message when it lands.',
    '',
    'Changed, by area:',
    summary,
    '',
    'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  ].join('\n');

  run('git', ['commit', '-q', '-m', message]);
  run('git', ['push', '-q', 'origin', 'main']);
  const head = run('git', ['rev-parse', '--short', 'HEAD']).trim();
  console.log(`pushed ${head}`);
}

main();
