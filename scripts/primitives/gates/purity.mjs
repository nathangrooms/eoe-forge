/**
 * GATE 2 — purity, by AST rather than by grep.
 *
 * Determinism is a product requirement, not a preference: a DeckMatrix game IS
 * its action log, the engine runs in the browser, and the server only orders and
 * revalidates. One `Date.now()` in one primitive and two clients replaying the
 * same log land on different boards — and they land there quietly, several
 * actions after the cause.
 *
 * A regex would be the obvious check and is not good enough: it cannot tell
 * `state.cards[id]` (a read) from `state.cards[id] = x` (a write), and it cannot
 * see that `ids.push(x)` is fine on a local array and fatal on a parameter. So
 * this walks TypeScript's own AST, and attributes every finding to the enclosing
 * exported function so one bad primitive cannot fail its file-mates.
 *
 * ## What is rejected
 *
 * | rule | why |
 * |---|---|
 * | `Date`, `performance`, `process.hrtime` | a clock makes replay non-reproducible |
 * | `Math.random`, `crypto` | the reducer owns the seeded RNG; a second source diverges |
 * | `async`, `await`, `Promise` | resolution is synchronous; a promise reorders the log |
 * | module-scope `let` / `var` | ambient mutable state is memory between calls |
 * | assignment to anything reachable from a parameter | the caller's data is not ours |
 * | `push`/`pop`/`splice`/`sort`/`reverse`/`shift`/`unshift`/`fill`/`copyWithin` on a parameter-derived expression | the same, one method call away |
 *
 * `push` on a LOCAL array is allowed. Building a result by pushing into an array
 * declared inside the function is not a side effect: nothing outside can observe
 * it, and forbidding it would push every primitive into `reduce` for no gain.
 *
 * ## What this does not prove
 *
 * Reachability is computed syntactically: a binding is parameter-derived if it is
 * a parameter, or was initialised from an expression rooted at one. Aliasing
 * through a function return (`const xs = pick(state); xs.push(1)`) is not
 * tracked. It is a lint with a sharp, stated boundary, not a proof of purity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const MUTATORS = new Set(['push', 'pop', 'splice', 'sort', 'reverse', 'shift', 'unshift', 'fill', 'copyWithin']);
const BANNED_GLOBALS = new Set(['Date', 'performance', 'crypto', 'Promise']);

export function runPurityGate(specs, root) {
  // Resolved from THIS module, not from `root`. `root` is the tree being
  // inspected and may be a scratch directory with no `node_modules` — which is
  // exactly what `selftest-purity.mjs` hands it.
  const require = createRequire(import.meta.url);
  const ts = require('typescript');

  /** Root identifier of a possibly-nested access: `a.b.c[0]` -> `a`. */
  const rootOf = (node) => {
    let cur = node;
    for (;;) {
      if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) cur = cur.expression;
      else if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur)) cur = cur.expression;
      else break;
    }
    return ts.isIdentifier(cur) ? cur.text : null;
  };

  const byFile = new Map();
  for (const spec of specs) {
    if (!byFile.has(spec.file)) byFile.set(spec.file, []);
    byFile.get(spec.file).push(spec);
  }

  const results = {};

  for (const [file, fileSpecs] of byFile) {
    const path = join(root, 'src/lib/game/abilities/primitives', file);
    let source;
    try {
      source = readFileSync(path, 'utf8');
    } catch {
      for (const spec of fileSpecs) results[spec.id] = { pass: false, violations: [`missing file ${file}`] };
      continue;
    }

    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const findings = new Map(); // function name -> violations[]
    const moduleScope = [];

    /* --- module scope: no mutable ambient state --- */
    for (const stmt of sf.statements) {
      if (ts.isVariableStatement(stmt)) {
        const flags = stmt.declarationList.flags;
        const isConst = (flags & ts.NodeFlags.Const) !== 0;
        if (!isConst) {
          moduleScope.push(
            `module-scope ${(flags & ts.NodeFlags.Let) !== 0 ? 'let' : 'var'} at line ${sf.getLineAndCharacterOfPosition(stmt.pos).line + 1} — ambient mutable state`
          );
        }
      }
    }

    const walkFunction = (name, fnNode) => {
      const violations = [];
      /** Bindings inside this function that trace to a parameter. */
      const tainted = new Set();
      for (const param of fnNode.parameters) {
        if (ts.isIdentifier(param.name)) tainted.add(param.name.text);
      }
      /** Bindings declared locally. Safe to mutate. */
      const local = new Set();

      const at = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

      const visit = (node) => {
        if (fnNode.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
          // recorded once, below
        }
        if (ts.isAwaitExpression(node)) violations.push(`await at line ${at(node)}`);

        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const from = node.initializer ? rootOf(node.initializer) : null;
          if (from && tainted.has(from)) tainted.add(node.name.text);
          else local.add(node.name.text);
        }

        if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text)) {
          const parent = node.parent;
          const isTypePosition =
            parent &&
            (ts.isTypeReferenceNode(parent) || ts.isImportSpecifier(parent) || ts.isTypeQueryNode(parent));
          if (!isTypePosition) violations.push(`${node.text} at line ${at(node)}`);
        }

        if (ts.isPropertyAccessExpression(node)) {
          const text = node.getText(sf);
          if (text === 'Math.random' || text.startsWith('process.')) {
            violations.push(`${text} at line ${at(node)}`);
          }
          if (MUTATORS.has(node.name.text)) {
            const target = rootOf(node.expression);
            if (target && tainted.has(target) && !local.has(target)) {
              violations.push(`${node.name.text}() on parameter-derived '${target}' at line ${at(node)}`);
            }
          }
        }

        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const target = rootOf(node.left);
          const writesIntoLeft = ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left);
          if (target && writesIntoLeft && tainted.has(target) && !local.has(target)) {
            violations.push(`assignment into parameter-derived '${target}' at line ${at(node)}`);
          }
        }

        ts.forEachChild(node, visit);
      };

      if (fnNode.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
        violations.push('declared async — resolution is synchronous');
      }
      ts.forEachChild(fnNode, visit);
      findings.set(name, violations);
    };

    const topLevel = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) walkFunction(node.name.text, node);
      ts.forEachChild(node, topLevel);
    };
    ts.forEachChild(sf, topLevel);

    for (const spec of fileSpecs) {
      const own = findings.get(spec.name);
      const violations = [
        ...moduleScope,
        ...(own === undefined ? [`no exported function named ${spec.name} found in ${file}`] : own),
      ];
      const declaredPure = Object.values(spec.purity).every(Boolean);
      if (!declaredPure) violations.push('spec opts out of a purity requirement; that is not allowed');
      results[spec.id] = { pass: violations.length === 0, violations };
    }
  }

  return { results };
}
