/**
 * GATE 1 — typecheck.
 *
 * Two things, because either alone is cheatable.
 *
 *   1. `npx tsc --noEmit -p tsconfig.app.json` over the whole app. NEVER
 *      `tsconfig.json`: it has `files: []` and compiles nothing, so it reports
 *      success on a folder full of type errors.
 *   2. Each spec's `signature` string must appear VERBATIM in its implementation
 *      file. A compiling file that quietly changed a parameter type would pass
 *      (1) and would not be the primitive that was specified.
 *
 * The repo has other authors in it. Errors are partitioned by path so a broken
 * file elsewhere is reported as exactly that and never lets a primitive fail —
 * or pass — for somebody else's reason.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRIMITIVE_DIR = 'src/lib/game/abilities/primitives';

/**
 * Signature comparison is whitespace-insensitive, and the reason is a measured
 * one rather than a convenience.
 *
 * The first version of this gate demanded a byte-verbatim match. It failed 13 of
 * 20 primitives — every one of which had ZERO type errors and a signature that
 * differed from its spec only in where the line wrapped. That is not a defect in
 * the primitives; it is the gate testing the formatter. A gate whose failures are
 * dominated by a property nobody cares about teaches the reader to skim it, which
 * costs more than the check was worth.
 *
 * Whitespace only. Parameter names, order, types and the return type are still
 * compared exactly, because those are what "the same signature" means.
 */
function normaliseWhitespace(text) {
  return text
    .replace(/\s+/g, ' ')
    // Formatting also inserts a space INSIDE the parens when it wraps
    // (`fn(\n  a,\n  b\n)` normalises to `fn( a, b )`), so whitespace touching
    // punctuation goes too. Everything that carries meaning — names, order,
    // types, the return type — is still compared exactly.
    .replace(/\s*([(),:;<>{}|&[\]?])\s*/g, '$1')
    .trim();
}

export function runTypecheckGate(specs, root) {
  let raw = '';
  try {
    raw = execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
  } catch (err) {
    raw = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  const errors = raw
    .split(/\r?\n/)
    .filter((line) => / error TS\d+:/.test(line))
    .map((line) => {
      const m = line.match(/^(.+?)\((\d+),(\d+)\): (error TS\d+: .*)$/);
      return m ? { file: m[1].replace(/\\/g, '/'), line: Number(m[2]), message: m[4] } : { file: '?', line: 0, message: line };
    });

  const mine = errors.filter((e) => e.file.includes(PRIMITIVE_DIR));
  const theirs = errors.filter((e) => !e.file.includes(PRIMITIVE_DIR));

  const results = {};
  for (const spec of specs) {
    const path = `${PRIMITIVE_DIR}/${spec.file}`;
    const fileErrors = mine.filter((e) => e.file.endsWith(spec.file));

    let signatureOk = false;
    let signatureDetail = '';
    try {
      const source = readFileSync(join(root, path), 'utf8');
      signatureOk = normaliseWhitespace(source).includes(normaliseWhitespace(spec.signature));
      if (!signatureOk) signatureDetail = 'declared signature not found in the implementation (compared modulo whitespace)';
    } catch (err) {
      signatureDetail = `implementation file missing: ${path}`;
    }

    results[spec.id] = {
      pass: fileErrors.length === 0 && signatureOk,
      errors: fileErrors.map((e) => `${e.file}:${e.line} ${e.message}`),
      signatureOk,
      signatureDetail,
    };
  }

  return {
    results,
    projectErrorsOutsidePrimitives: theirs.length,
    projectErrorFilesOutsidePrimitives: [...new Set(theirs.map((e) => e.file))],
  };
}
