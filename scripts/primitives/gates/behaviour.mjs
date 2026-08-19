/**
 * GATE 3 — behaviour, over real cards.
 *
 * Runs `node --test` across the primitive test files and reads the TAP back.
 * Test names are `P##/A#` by convention, which is what makes the second half of
 * this gate possible:
 *
 *   1. every test naming a primitive must pass;
 *   2. every `assertions[].id` in the spec must appear as a PASSING test.
 *
 * (2) is the half that stops a spec drifting away from its tests. Without it a
 * primitive could claim six behavioural obligations, ship two tests, and report
 * a green gate — which is how a suite ends up asserting that the implementation
 * does what the implementation does.
 *
 * The fixtures themselves are real catalogue rows and every spec's `cards[]`
 * claim is checked against the actual oracle text; see `harness.testlib.ts`.
 */
import { execFileSync } from 'node:child_process';

const TEST_GLOB = 'src/lib/game/abilities/primitives/*.test.ts';

export function runBehaviourGate(specs, root) {
  let raw = '';
  try {
    raw = execFileSync('node', ['--test', '--experimental-strip-types', TEST_GLOB], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    raw = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  /** TAP lines: `ok 3 - P03/A1 — ...` / `not ok 9 - P16/A8 — ...` */
  const tests = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(not ok|ok)\s+\d+\s+-\s+(.*)$/);
    if (!m) continue;
    const name = m[2].trim();
    if (/^\S+\.test\.ts$/.test(name)) continue; // per-file summary line
    tests.push({ ok: m[1] === 'ok', name });
  }

  const results = {};
  for (const spec of specs) {
    const mine = tests.filter((t) => t.name.startsWith(`${spec.id}/`));
    const failed = mine.filter((t) => !t.ok);

    const passingIds = new Set(
      mine.filter((t) => t.ok).map((t) => t.name.slice(spec.id.length + 1).split(/[\s—-]/)[0])
    );
    const uncovered = spec.assertions.map((a) => a.id).filter((id) => !passingIds.has(id));

    results[spec.id] = {
      pass: mine.length > 0 && failed.length === 0 && uncovered.length === 0,
      testsRun: mine.length,
      testsFailed: failed.map((t) => t.name),
      assertionsUncovered: uncovered,
      detail:
        mine.length === 0
          ? 'no test names this primitive'
          : uncovered.length > 0
            ? `spec claims assertions with no passing test: ${uncovered.join(', ')}`
            : '',
    };
  }

  return {
    results,
    totalTests: tests.length,
    totalFailed: tests.filter((t) => !t.ok).length,
  };
}
