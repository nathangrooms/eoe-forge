/**
 * GATE 4 — differential against XMage.
 *
 * XMage is MIT, so reading it as a reference is legal with attribution. Nothing
 * is copied: the `evidence` entries in a spec are ASSERTIONS ABOUT upstream
 * source, the way a test asserts against a fixture. Forge is GPL-3.0 and is not
 * read, cloned or referenced anywhere in this repo.
 *
 * ## What this gate proves, stated before what it does
 *
 * It proves that the semantic claim a primitive was written against is still
 * literally present in XMage's current source. It does NOT prove behavioural
 * equivalence. That would mean running both engines over the same game state,
 * which needs a JVM and a built XMage, and is not what happens here. A primitive
 * that passes this gate has a CHECKED CITATION, not a proof.
 *
 * ## Why a citation is worth a gate anyway
 *
 * `PRIMITIVE-BUILD-ORDER.md` §6 measured the failure mode this catches: over one
 * year, 379 of 3,503 surviving XMage engine classes (10.8%) changed body without
 * changing name, and 187 of those are on the build order. A rename breaks a
 * name-keyed extractor loudly. A body change does not break anything — our note
 * still says `DamageTargetEffect`, our code still compiles, the card still
 * resolves, and it is now quietly wrong. Pinning the exact line a primitive's
 * behaviour was derived from is what turns that silent class of defect into a
 * failing gate.
 *
 * Comments are stripped before matching, for two reasons: a reflowed licence
 * header must not raise an alarm nobody reads twice, and XMage's `//` lines
 * carry Wizards of the Coast's oracle text.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const PINNED_COMMIT = '07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d';

function xmageRoot() {
  const root = process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
  return existsSync(join(root, 'Mage/src/main/java/mage')) ? root : null;
}

/** Block and line comments out; string literals are left alone. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function findClass(root, fqn) {
  const relative = fqn.split('.').join('/') + '.java';
  const direct = join(root, 'Mage/src/main/java', relative);
  if (existsSync(direct)) return direct;

  // Fall back to a name search: XMage moves classes between packages, and a
  // stale package in a spec should be reported as a stale package rather than
  // as a missing class.
  const simple = fqn.split('.').pop() + '.java';
  const stack = [join(root, 'Mage/src/main/java')];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (entry === simple) return full;
    }
  }
  return null;
}

export function runDifferentialGate(specs) {
  const root = xmageRoot();
  const results = {};

  let commit = null;
  if (root) {
    try {
      commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      commit = null;
    }
  }

  for (const spec of specs) {
    if (!spec.xmage) {
      results[spec.id] = {
        pass: false,
        status: 'no-reference',
        detail: 'the spec declares no XMage class; this is reported, never counted as a pass',
        checks: [],
      };
      continue;
    }
    if (!root) {
      results[spec.id] = {
        pass: false,
        status: 'no-clone',
        detail: 'XMAGE_ROOT is not a magefree/mage clone; the gate could not run',
        checks: [],
      };
      continue;
    }

    const path = findClass(root, spec.xmage.fqn);
    if (!path) {
      results[spec.id] = {
        pass: false,
        status: 'class-missing',
        detail: `${spec.xmage.fqn} not found in the clone — a rename or a deletion, which is the LOUD half of drift`,
        checks: [],
      };
      continue;
    }

    const packageMatches = path.replace(/\\/g, '/').endsWith(spec.xmage.fqn.split('.').join('/') + '.java');
    const source = stripComments(readFileSync(path, 'utf8'));

    const checks = spec.xmage.evidence.map((ev) => {
      if (ev.mustContain !== undefined) {
        return { claim: ev.claim, kind: 'mustContain', needle: ev.mustContain, ok: source.includes(ev.mustContain) };
      }
      return { claim: ev.claim, kind: 'mustNotContain', needle: ev.mustNotContain, ok: !source.includes(ev.mustNotContain) };
    });

    const failed = checks.filter((c) => !c.ok);
    results[spec.id] = {
      pass: failed.length === 0 && packageMatches,
      status: failed.length === 0 && packageMatches ? 'agrees' : 'drifted',
      detail: packageMatches ? '' : `class found at a DIFFERENT package than the spec names: ${path}`,
      checks,
    };
  }

  return {
    results,
    clone: root,
    commit,
    pinned: PINNED_COMMIT,
    onPinnedCommit: commit === PINNED_COMMIT,
  };
}
