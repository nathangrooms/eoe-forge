/**
 * scripts/xmage/lib/java-parse.mjs
 *
 * A tokenizer and recursive-descent expression parser for the subset of Java
 * that XMage card constructors are written in.
 *
 * ## Why not a regex
 * The previous extraction read imports only, so it never had to look inside a
 * constructor. This one does, and the thing it has to read is nested
 * constructor arguments:
 *
 *     new ConditionalOneShotEffect(
 *         new DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, true),
 *         new PermanentsOnTheBattlefieldCondition(filter, ComparisonType.MORE_THAN, 2))
 *
 * A regex cannot pair those brackets, cannot tell `List<Map<K,V>>` from a
 * comparison, and silently mis-splits arguments on the commas inside generics.
 * So this file tokenizes properly and parses properly, and `unparse()` exists
 * so the result can be re-serialised and compared against the original token
 * stream. That comparison is the parser's measured failure rate; nothing here
 * is estimated.
 *
 * ## Deliberate limits, stated rather than hidden
 *  - `>>` and `>>>` are emitted as separate `>` tokens so generic type
 *    arguments nest correctly. Java's right-shift operators therefore parse as
 *    two comparisons. No XMage card constructor uses a shift; the round-trip
 *    check would catch it if one did, because unparse re-emits `>` `>`.
 *  - Anonymous class bodies, lambda blocks and control-flow headers are kept as
 *    opaque token slices rather than parsed into statements. They are counted
 *    separately in the fidelity report so the number is visible.
 *  - Annotations, generics on methods, and `instanceof` patterns are tolerated
 *    but not interpreted.
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`, and is read from a
 * clone OUTSIDE this repository. Nothing from XMage is vendored here. Comment
 * text is stripped before parsing and never reaches any output, because those
 * `//` lines carry Wizards of the Coast oracle text, which is not XMage's to
 * license and not ours to copy.
 */

/* ------------------------------------------------------------------ *
 * 1. Tokenizer
 * ------------------------------------------------------------------ */

/** Two-character operators kept whole. `>>` is absent on purpose, see header. */
const PUNC2 = [
  '->', '::', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<',
];

const ID_START = /[A-Za-z_$]/;
const ID_PART = /[A-Za-z0-9_$]/;

/**
 * Turn Java source into tokens. Comments are dropped, not returned.
 * Each token is { t, v, p, line } where `t` is one of
 * 'id' | 'num' | 'str' | 'char' | 'punc'.
 */
export function tokenize(src) {
  const toks = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }

    // Comments. Dropped entirely: they are WotC oracle text, not ours.
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // Text block """ ... """
    if (c === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
      const start = i;
      i += 3;
      while (i < n && !(src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"')) {
        if (src[i] === '\\') i++;
        if (src[i] === '\n') line++;
        i++;
      }
      i += 3;
      toks.push({ t: 'str', v: src.slice(start, i), p: start, line });
      continue;
    }

    if (c === '"') {
      const start = i;
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\') i++;
        if (src[i] === '\n') line++;
        i++;
      }
      i++;
      toks.push({ t: 'str', v: src.slice(start, i), p: start, line });
      continue;
    }

    if (c === "'") {
      const start = i;
      i++;
      while (i < n && src[i] !== "'") {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      toks.push({ t: 'char', v: src.slice(start, i), p: start, line });
      continue;
    }

    if (c >= '0' && c <= '9') {
      const start = i;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++;
      } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        i += 2;
        while (i < n && /[01_]/.test(src[i])) i++;
      } else {
        while (i < n && /[0-9_]/.test(src[i])) i++;
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
          i++;
          while (i < n && /[0-9_]/.test(src[i])) i++;
        }
        if (src[i] === 'e' || src[i] === 'E') {
          i++;
          if (src[i] === '+' || src[i] === '-') i++;
          while (i < n && /[0-9_]/.test(src[i])) i++;
        }
      }
      if (/[lLfFdD]/.test(src[i] ?? '')) i++;
      toks.push({ t: 'num', v: src.slice(start, i), p: start, line });
      continue;
    }

    if (ID_START.test(c)) {
      const start = i;
      i++;
      while (i < n && ID_PART.test(src[i])) i++;
      toks.push({ t: 'id', v: src.slice(start, i), p: start, line });
      continue;
    }

    const two = src.slice(i, i + 2);
    if (PUNC2.includes(two)) {
      toks.push({ t: 'punc', v: two, p: i, line });
      i += 2;
      continue;
    }

    toks.push({ t: 'punc', v: c, p: i, line });
    i++;
  }

  toks.push({ t: 'eof', v: '', p: n, line });
  return toks;
}

/* ------------------------------------------------------------------ *
 * 2. Parser
 * ------------------------------------------------------------------ */

const BIN_PREC = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
  '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7,
  '<<': 8,
  '+': 9, '-': 9,
  '*': 10, '/': 10, '%': 10,
};

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=']);

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'abstract',
  'synchronized', 'native', 'transient', 'volatile', 'strictfp', 'default',
]);

export class ParseError extends Error {
  constructor(msg, tok) {
    super(`${msg} at line ${tok?.line ?? '?'} near "${tok?.v ?? 'eof'}"`);
    this.tok = tok;
  }
}

export class JavaParser {
  constructor(toks) {
    this.toks = toks;
    this.i = 0;
    this.guard = 0;
  }

  peek(k = 0) { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
  get cur() { return this.peek(0); }
  next() { return this.toks[this.i++]; }
  at(v, k = 0) { const t = this.peek(k); return t.v === v && t.t !== 'str' && t.t !== 'char'; }
  atId(k = 0) { return this.peek(k).t === 'id'; }

  eat(v) { if (this.at(v)) { this.i++; return true; } return false; }

  expect(v) {
    if (!this.at(v)) throw new ParseError(`expected "${v}"`, this.cur);
    return this.next();
  }

  /** `>=` inside a generic argument list is really `>` then `=`. Split it. */
  splitGt() {
    const t = this.cur;
    if (t.v === '>=') {
      this.toks.splice(this.i, 1,
        { t: 'punc', v: '>', p: t.p, line: t.line },
        { t: 'punc', v: '=', p: t.p + 1, line: t.line });
    }
  }

  tick() {
    if (++this.guard > 4_000_000) throw new ParseError('parser did not terminate', this.cur);
  }

  /* ---------------- types ---------------- */

  /** Try to parse a type. Returns null and rewinds if this is not one. */
  tryType() {
    const save = this.i;
    const t = this.parseTypeOrNull();
    if (t === null) { this.i = save; return null; }
    return t;
  }

  parseTypeOrNull() {
    if (!this.atId()) return null;
    const parts = [this.next().v];
    let typeArgs = null;
    let dims = 0;

    for (;;) {
      this.tick();
      if (this.at('<')) {
        const ta = this.tryTypeArgs();
        if (ta === null) break;
        typeArgs = ta;
        continue;
      }
      if (this.at('.') && this.peek(1).t === 'id') {
        this.i++;
        parts.push(this.next().v);
        continue;
      }
      break;
    }

    while (this.at('[') && this.at(']', 1)) { this.i += 2; dims++; }

    return { name: parts.join('.'), typeArgs, dims };
  }

  /** `<...>` if it really is a type-argument list, else null (index rewound). */
  tryTypeArgs() {
    const save = this.i;
    if (!this.eat('<')) return null;
    const args = [];
    if (this.at('>')) { this.i++; return args; } // diamond
    for (;;) {
      this.tick();
      if (this.at('?')) {
        this.i++;
        if (this.at('extends') || this.at('super')) {
          this.i++;
          const b = this.parseTypeOrNull();
          if (!b) { this.i = save; return null; }
          args.push(b);
        } else {
          args.push({ name: '?', typeArgs: null, dims: 0 });
        }
      } else {
        const a = this.parseTypeOrNull();
        if (!a) { this.i = save; return null; }
        args.push(a);
      }
      this.splitGt();
      if (this.eat(',')) continue;
      if (this.eat('>')) return args;
      this.i = save;
      return null;
    }
  }

  /* ---------------- expressions ---------------- */

  parseExpression() { return this.parseAssignment(); }

  parseAssignment() {
    const left = this.parseTernary();
    const t = this.cur;
    if (t.t === 'punc' && ASSIGN_OPS.has(t.v)) {
      this.i++;
      const right = this.parseAssignment();
      return { k: 'assign', op: t.v, l: left, r: right };
    }
    return left;
  }

  parseTernary() {
    const c = this.parseBinary(0);
    if (this.eat('?')) {
      const a = this.parseAssignment();
      this.expect(':');
      const b = this.parseAssignment();
      return { k: 'ternary', c, a, b };
    }
    return c;
  }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      this.tick();
      const t = this.cur;
      const op = t.v;
      const prec = (t.t === 'punc' || op === 'instanceof') ? BIN_PREC[op] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      this.i++;
      if (op === 'instanceof') {
        const ty = this.parseTypeOrNull();
        let bind = null;
        if (this.atId() && !MODIFIERS.has(this.cur.v)) bind = this.next().v;
        left = { k: 'instanceof', l: left, type: ty, bind };
        continue;
      }
      const right = this.parseBinary(prec + 1);
      left = { k: 'bin', op, l: left, r: right };
    }
  }

  parseUnary() {
    const t = this.cur;
    if (t.t === 'punc' && ['!', '-', '+', '~', '++', '--'].includes(t.v)) {
      this.i++;
      return { k: 'unary', op: t.v, arg: this.parseUnary() };
    }
    // Cast: `(Type) unary`, only when what follows cannot be a binary operand.
    if (this.at('(')) {
      const save = this.i;
      this.i++;
      const ty = this.parseTypeOrNull();
      if (ty && this.at(')')) {
        this.i++;
        const after = this.cur;
        const castable =
          after.t === 'id' || after.t === 'num' || after.t === 'str' ||
          after.t === 'char' || after.v === '(' || after.v === '!' || after.v === '~';
        if (castable && ty.name !== 'this') {
          return { k: 'cast', type: ty, arg: this.parseUnary() };
        }
      }
      this.i = save;
    }
    return this.parsePostfix(this.parsePrimary());
  }

  parsePostfix(node) {
    for (;;) {
      this.tick();
      if (this.at('.')) {
        // `.new` inner-class creation and `.<T>method()` are tolerated as opaque.
        if (this.peek(1).t === 'id') {
          this.i++;
          const name = this.next().v;
          if (this.at('(')) {
            node = { k: 'call', obj: node, name, args: this.parseArgs() };
          } else {
            node = { k: 'field', obj: node, name };
          }
          continue;
        }
        if (this.at('<', 1)) {
          this.i++;
          this.tryTypeArgs();
          if (this.atId()) {
            const name = this.next().v;
            node = this.at('(')
              ? { k: 'call', obj: node, name, args: this.parseArgs() }
              : { k: 'field', obj: node, name };
            continue;
          }
        }
        break;
      }
      if (this.at('[')) {
        this.i++;
        const idx = this.parseExpression();
        this.expect(']');
        node = { k: 'index', obj: node, idx };
        continue;
      }
      if (this.at('::')) {
        this.i++;
        const name = this.next().v;
        node = { k: 'mref', obj: node, name };
        continue;
      }
      if (this.at('++') || this.at('--')) {
        const op = this.next().v;
        node = { k: 'postfix', op, arg: node };
        continue;
      }
      break;
    }
    return node;
  }

  parseArgs() {
    this.expect('(');
    const args = [];
    if (this.eat(')')) return args;
    for (;;) {
      this.tick();
      args.push(this.parseExpression());
      if (this.eat(',')) continue;
      this.expect(')');
      return args;
    }
  }

  /** Slice from `(` or `{` at the cursor through its matching close. */
  captureBalanced(open, close) {
    const start = this.i;
    this.expect(open);
    let depth = 1;
    while (depth > 0) {
      this.tick();
      const t = this.next();
      if (t.t === 'eof') throw new ParseError(`unbalanced "${open}"`, t);
      if (t.t === 'punc' && t.v === open) depth++;
      else if (t.t === 'punc' && t.v === close) depth--;
    }
    return this.toks.slice(start, this.i);
  }

  isLambdaAhead() {
    if (this.atId() && this.at('->', 1)) return true;
    if (!this.at('(')) return false;
    let depth = 0;
    for (let k = this.i; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.t === 'punc' && t.v === '(') depth++;
      else if (t.t === 'punc' && t.v === ')') {
        depth--;
        if (depth === 0) return this.toks[k + 1]?.v === '->';
      } else if (t.t === 'eof') return false;
    }
    return false;
  }

  parseLambda() {
    const params = [];
    let paren = false;
    if (this.atId()) {
      params.push(this.next().v);
    } else {
      paren = true;
      const head = this.captureBalanced('(', ')');
      for (let k = 1; k < head.length - 1; k++) {
        if (head[k].t === 'id' && (head[k + 1]?.v === ',' || head[k + 1]?.v === ')')) {
          params.push(head[k].v);
        }
      }
    }
    this.expect('->');
    if (this.at('{')) {
      const body = this.captureBalanced('{', '}');
      return { k: 'lambda', params, paren, bodyKind: 'block', raw: body };
    }
    const e = this.parseExpression();
    return { k: 'lambda', params, paren, bodyKind: 'expr', body: e };
  }

  parsePrimary() {
    const t = this.cur;

    if (this.isLambdaAhead()) return this.parseLambda();

    if (t.t === 'num') { this.i++; return { k: 'lit', type: numKind(t.v), v: t.v }; }
    if (t.t === 'str') { this.i++; return { k: 'lit', type: 'str', v: t.v }; }
    if (t.t === 'char') { this.i++; return { k: 'lit', type: 'char', v: t.v }; }

    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') { this.i++; return { k: 'lit', type: 'bool', v: t.v }; }
      if (t.v === 'null') { this.i++; return { k: 'lit', type: 'null', v: 'null' }; }
      if (t.v === 'new') return this.parseNew();
      // `this(...)` / `super(...)` constructor delegation.
      if (t.v === 'this' || t.v === 'super') {
        this.i++;
        if (this.at('(')) return { k: 'ctorcall', which: t.v, args: this.parseArgs() };
        return { k: t.v };
      }
      if (t.v === 'switch') {
        // switch expression: opaque
        this.i++;
        const head = this.captureBalanced('(', ')');
        const body = this.captureBalanced('{', '}');
        return { k: 'opaque', what: 'switch-expr', raw: [{ t: 'id', v: 'switch' }, ...head, ...body] };
      }
      // Primitive-type class literals / casts like `int.class` are not used here.
      this.i++;
      if (this.at('(')) return { k: 'call', obj: null, name: t.v, args: this.parseArgs() };
      return { k: 'name', id: t.v };
    }

    if (t.v === '(') {
      this.i++;
      const e = this.parseExpression();
      this.expect(')');
      return { k: 'paren', e };
    }

    if (t.v === '{') {
      const items = this.parseArrayInit();
      return { k: 'arrayinit', items };
    }

    throw new ParseError('unexpected token in expression', t);
  }

  parseArrayInit() {
    this.expect('{');
    const items = [];
    if (this.eat('}')) return items;
    for (;;) {
      this.tick();
      if (this.at('{')) items.push({ k: 'arrayinit', items: this.parseArrayInit() });
      else items.push(this.parseExpression());
      if (this.eat(',')) {
        if (this.eat('}')) return items; // trailing comma
        continue;
      }
      this.expect('}');
      return items;
    }
  }

  parseNew() {
    this.expect('new');
    const type = this.parseTypeOrNull();
    if (!type) throw new ParseError('expected a type after new', this.cur);

    // `new T[expr]` / `new T[]{...}`
    if (this.at('[')) {
      const dims = [];
      while (this.at('[')) {
        this.i++;
        if (this.at(']')) { this.i++; dims.push(null); continue; }
        dims.push(this.parseExpression());
        this.expect(']');
      }
      let init = null;
      if (this.at('{')) init = { k: 'arrayinit', items: this.parseArrayInit() };
      return { k: 'newarray', type, dims, init };
    }
    if (type.dims > 0 && this.at('{')) {
      const init = { k: 'arrayinit', items: this.parseArrayInit() };
      return { k: 'newarray', type: { ...type, dims: 0 }, dims: new Array(type.dims).fill(null), init };
    }

    const args = this.parseArgs();
    let body = null;
    if (this.at('{')) body = this.captureBalanced('{', '}');
    return { k: 'new', type, args, body };
  }

  /* ---------------- statements ---------------- */

  parseBlockStatements(endAtBrace = true) {
    const out = [];
    for (;;) {
      this.tick();
      if (this.cur.t === 'eof') break;
      if (endAtBrace && this.at('}')) break;
      out.push(this.parseStatement());
    }
    return out;
  }

  parseStatement() {
    if (this.eat(';')) return { k: 'empty' };

    if (this.at('{')) {
      this.expect('{');
      const stmts = this.parseBlockStatements(true);
      this.expect('}');
      return { k: 'block', stmts };
    }

    const t = this.cur;

    // `case X:` / `case X ->` / `default:` inside a switch body, and `yield`.
    if (t.t === 'id' && (t.v === 'case' || (t.v === 'default' && [':', '->'].includes(this.peek(1).v)))) {
      const start = this.i;
      while (this.cur.t !== 'eof' && !this.at(':') && !this.at('->')) {
        if (this.at('(')) { this.captureBalanced('(', ')'); continue; }
        this.i++;
      }
      this.i++; // the ':' or '->'
      return { k: 'opaqueStmt', what: 'switch-label', raw: this.toks.slice(start, this.i) };
    }
    if (t.t === 'id' && t.v === 'yield') {
      this.i++;
      const e = this.parseExpression();
      this.expect(';');
      return { k: 'yield', e };
    }
    if (t.t === 'id' && t.v === 'assert') {
      const start = this.i;
      while (this.cur.t !== 'eof' && !this.at(';')) this.i++;
      this.i++;
      return { k: 'opaqueStmt', what: 'assert', raw: this.toks.slice(start, this.i) };
    }

    if (t.t === 'id' && ['if', 'for', 'while', 'switch', 'synchronized', 'catch'].includes(t.v)) {
      this.i++;
      const head = this.captureBalanced('(', ')');
      const body = this.parseStatement();
      let elseBody = null;
      if (t.v === 'if' && this.at('else')) {
        this.i++;
        elseBody = this.parseStatement();
      }
      return { k: 'control', kw: t.v, head, body, elseBody };
    }

    if (t.t === 'id' && t.v === 'do') {
      this.i++;
      const body = this.parseStatement();
      this.expect('while');
      const head = this.captureBalanced('(', ')');
      this.eat(';');
      return { k: 'control', kw: 'do', head, body, elseBody: null };
    }

    if (t.t === 'id' && t.v === 'try') {
      this.i++;
      let head = null;
      if (this.at('(')) head = this.captureBalanced('(', ')');
      const body = this.parseStatement();
      const tail = [];
      while (this.at('catch') || this.at('finally')) {
        const kw = this.next().v;
        const h = this.at('(') ? this.captureBalanced('(', ')') : null;
        tail.push({ kw, head: h, body: this.parseStatement() });
      }
      return { k: 'try', head, body, tail };
    }

    if (t.t === 'id' && ['return', 'throw'].includes(t.v)) {
      this.i++;
      let e = null;
      if (!this.at(';')) e = this.parseExpression();
      this.expect(';');
      return { k: t.v, e };
    }

    if (t.t === 'id' && ['break', 'continue'].includes(t.v)) {
      this.i++;
      let label = null;
      if (this.atId()) label = this.next().v;
      this.expect(';');
      return { k: t.v, label };
    }

    // Nested type declaration inside a constructor is not a thing, but a local
    // `class`/`enum` is legal Java. Keep it opaque.
    if (t.t === 'id' && ['class', 'enum', 'interface', 'record'].includes(t.v)) {
      const start = this.i;
      while (!this.at('{') && this.cur.t !== 'eof') this.i++;
      this.captureBalanced('{', '}');
      return { k: 'opaqueStmt', what: 'local-type', raw: this.toks.slice(start, this.i) };
    }

    // Local variable declaration?
    const decl = this.tryLocalDecl();
    if (decl) return decl;

    const e = this.parseExpression();
    this.expect(';');
    return { k: 'expr', e };
  }

  tryLocalDecl() {
    const save = this.i;
    const mods = [];
    while (this.atId() && MODIFIERS.has(this.cur.v)) mods.push(this.next().v);
    if (this.at('@')) { this.i = save; return null; }

    const type = this.parseTypeOrNull();
    if (!type) { this.i = save; return null; }
    if (!this.atId() || MODIFIERS.has(this.cur.v)) { this.i = save; return null; }

    const after = this.peek(1).v;
    if (!['=', ';', ',', '[', ':'].includes(after)) { this.i = save; return null; }
    if (after === ':') { this.i = save; return null; } // enhanced-for header

    // A bare `Foo bar;` where Foo is not a known type is still a declaration in
    // Java, so accepting it here is correct rather than optimistic.
    const vars = [];
    for (;;) {
      this.tick();
      const name = this.next().v;
      let extraDims = 0;
      while (this.at('[') && this.at(']', 1)) { this.i += 2; extraDims++; }
      let init = null;
      if (this.eat('=')) {
        init = this.at('{')
          ? { k: 'arrayinit', items: this.parseArrayInit() }
          : this.parseExpression();
      }
      vars.push({ name, extraDims, init });
      if (this.eat(',')) continue;
      if (!this.eat(';')) { this.i = save; return null; }
      break;
    }
    return { k: 'decl', mods, type, vars };
  }
}

function numKind(v) {
  if (/[.eE]/.test(v) && !/^0[xX]/.test(v)) return 'double';
  if (/[fFdD]$/.test(v)) return 'double';
  if (/[lL]$/.test(v)) return 'long';
  return 'int';
}

/* ------------------------------------------------------------------ *
 * 3. Locating a class and its constructor
 * ------------------------------------------------------------------ */

/**
 * Token index of the body of `ClassName(` ... `)` `{` in a token stream, or
 * null. Returns { open, close } token indices of the braces, plus the
 * parameter tokens.
 */
export function findConstructor(toks, className) {
  for (let i = 0; i < toks.length - 2; i++) {
    const t = toks[i];
    if (t.t !== 'id' || t.v !== className) continue;
    if (toks[i + 1].v !== '(') continue;
    // Reject `new ClassName(` and `return ClassName(`.
    const prev = toks[i - 1];
    if (prev && prev.t === 'id' && (prev.v === 'new' || prev.v === 'return')) continue;
    if (prev && prev.v === '.') continue;
    // Must be preceded by a modifier or `;`/`{`/`}` to be a declaration.
    if (prev && !(MODIFIERS.has(prev.v) || ['{', '}', ';'].includes(prev.v))) continue;

    // Skip the parameter list.
    let j = i + 1;
    let depth = 0;
    for (; j < toks.length; j++) {
      if (toks[j].v === '(') depth++;
      else if (toks[j].v === ')') { depth--; if (depth === 0) { j++; break; } }
    }
    // `throws X, Y`
    while (j < toks.length && toks[j].v !== '{' && toks[j].v !== ';') j++;
    if (toks[j]?.v !== '{') continue;

    const open = j;
    let d = 0;
    for (; j < toks.length; j++) {
      if (toks[j].v === '{') d++;
      else if (toks[j].v === '}') { d--; if (d === 0) break; }
    }
    if (toks[j]?.v !== '}') continue;

    const params = toks.slice(i + 1, open);
    return { open, close: j, params, nameIndex: i, isPublic: prev?.v === 'public' };
  }
  return null;
}

/** Every constructor of `className` in declaration order. */
export function findAllConstructors(toks, className) {
  const out = [];
  let from = 0;
  for (;;) {
    const sub = toks.slice(from);
    const hit = findConstructor(sub, className);
    if (!hit) break;
    out.push({
      open: hit.open + from,
      close: hit.close + from,
      params: hit.params,
      nameIndex: hit.nameIndex + from,
      isPublic: hit.isPublic,
    });
    from += hit.close + 1;
  }
  return out;
}

/** `import a.b.C;` and `import a.b.*;` from a token stream. */
export function readImports(toks) {
  const single = new Map();
  const wildcard = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== 'import') continue;
    if (i > 0 && toks[i - 1].v === '.') continue;
    let j = i + 1;
    if (toks[j]?.v === 'static') j++;
    const parts = [];
    let star = false;
    for (; j < toks.length; j++) {
      const t = toks[j];
      if (t.v === ';') break;
      if (t.v === '.') continue;
      if (t.v === '*') { star = true; continue; }
      parts.push(t.v);
    }
    if (!parts.length) continue;
    if (star) wildcard.push(parts.join('.'));
    else single.set(parts[parts.length - 1], parts.join('.'));
  }
  return { single, wildcard };
}

/** `package a.b.c;` */
export function readPackage(toks) {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t === 'id' && toks[i].v === 'package') {
      const parts = [];
      for (let j = i + 1; j < toks.length && toks[j].v !== ';'; j++) {
        if (toks[j].v !== '.') parts.push(toks[j].v);
      }
      return parts.join('.');
    }
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * 4. unparse, which is the fidelity check
 *
 * Re-emits a token-value list from AST fields only. Regions kept as opaque
 * token slices are re-emitted verbatim and counted, so the report can say how
 * much of the corpus was genuinely parsed rather than carried through.
 * ------------------------------------------------------------------ */

export function unparse(node, out = [], stat = { opaque: 0, structural: 0 }) {
  const push = (v) => { out.push(v); stat.structural++; };
  const pushRaw = (toks) => { for (const t of toks) { out.push(t.v); stat.opaque++; } };

  const typeOut = (ty) => {
    ty.name.split('.').forEach((p, k) => { if (k) push('.'); push(p); });
    if (ty.typeArgs) {
      push('<');
      ty.typeArgs.forEach((a, k) => { if (k) push(','); typeOut(a); });
      push('>');
    }
    for (let d = 0; d < ty.dims; d++) { push('['); push(']'); }
  };

  const walk = (nd) => {
    if (nd == null) return;
    switch (nd.k) {
      case 'lit': push(nd.v); break;
      case 'name': push(nd.id); break;
      case 'this': push('this'); break;
      case 'super': push('super'); break;
      case 'ctorcall':
        push(nd.which); push('(');
        nd.args.forEach((a, k) => { if (k) push(','); walk(a); });
        push(')');
        break;
      case 'field': walk(nd.obj); push('.'); push(nd.name); break;
      case 'call':
        if (nd.obj) { walk(nd.obj); push('.'); }
        push(nd.name); push('(');
        nd.args.forEach((a, k) => { if (k) push(','); walk(a); });
        push(')');
        break;
      case 'new':
        push('new'); typeOut(nd.type); push('(');
        nd.args.forEach((a, k) => { if (k) push(','); walk(a); });
        push(')');
        if (nd.body) pushRaw(nd.body);
        break;
      case 'newarray':
        push('new'); typeOut(nd.type);
        for (const d of nd.dims) { push('['); if (d) walk(d); push(']'); }
        if (nd.init) walk(nd.init);
        break;
      case 'arrayinit':
        push('{');
        nd.items.forEach((a, k) => { if (k) push(','); walk(a); });
        push('}');
        break;
      case 'index': walk(nd.obj); push('['); walk(nd.idx); push(']'); break;
      case 'mref': walk(nd.obj); push('::'); push(nd.name); break;
      case 'unary': push(nd.op); walk(nd.arg); break;
      case 'postfix': walk(nd.arg); push(nd.op); break;
      case 'bin': walk(nd.l); push(nd.op); walk(nd.r); break;
      case 'instanceof':
        walk(nd.l); push('instanceof');
        if (nd.type) typeOut(nd.type);
        if (nd.bind) push(nd.bind);
        break;
      case 'ternary': walk(nd.c); push('?'); walk(nd.a); push(':'); walk(nd.b); break;
      case 'assign': walk(nd.l); push(nd.op); walk(nd.r); break;
      case 'cast': push('('); typeOut(nd.type); push(')'); walk(nd.arg); break;
      case 'paren': push('('); walk(nd.e); push(')'); break;
      case 'lambda':
        if (nd.params.length === 1 && !nd.paren) push(nd.params[0]);
        else {
          push('(');
          nd.params.forEach((p, k) => { if (k) push(','); push(p); });
          push(')');
        }
        push('->');
        if (nd.bodyKind === 'block') pushRaw(nd.raw); else walk(nd.body);
        break;
      case 'opaque': pushRaw(nd.raw); break;

      /* statements */
      case 'empty': push(';'); break;
      case 'expr': walk(nd.e); push(';'); break;
      case 'block':
        push('{');
        nd.stmts.forEach(walk);
        push('}');
        break;
      case 'decl':
        nd.mods.forEach(push);
        typeOut(nd.type);
        nd.vars.forEach((v, k) => {
          if (k) push(',');
          push(v.name);
          for (let d = 0; d < v.extraDims; d++) { push('['); push(']'); }
          if (v.init) { push('='); walk(v.init); }
        });
        push(';');
        break;
      case 'control':
        push(nd.kw);
        pushRaw(nd.head);
        walk(nd.body);
        if (nd.elseBody) { push('else'); walk(nd.elseBody); }
        break;
      case 'try':
        push('try');
        if (nd.head) pushRaw(nd.head);
        walk(nd.body);
        for (const c of nd.tail) {
          push(c.kw);
          if (c.head) pushRaw(c.head);
          walk(c.body);
        }
        break;
      case 'return': push('return'); if (nd.e) walk(nd.e); push(';'); break;
      case 'yield': push('yield'); walk(nd.e); push(';'); break;
      case 'throw': push('throw'); walk(nd.e); push(';'); break;
      case 'break': case 'continue':
        push(nd.k); if (nd.label) push(nd.label); push(';'); break;
      case 'opaqueStmt': pushRaw(nd.raw); break;
      default:
        throw new Error(`unparse: unknown node kind ${nd.k}`);
    }
  };

  if (Array.isArray(node)) node.forEach(walk);
  else walk(node);
  return { out, stat };
}

/**
 * The parser's own failure rate, measured rather than estimated: parse a token
 * slice, unparse it, and compare token values one for one.
 */
export function roundTrip(toks, stmts) {
  const { out, stat } = unparse(stmts);
  const orig = toks.map((t) => t.v);
  if (orig.length !== out.length) {
    let k = 0;
    while (k < orig.length && k < out.length && orig[k] === out[k]) k++;
    return { ok: false, at: k, expected: orig.slice(k, k + 6), got: out.slice(k, k + 6), stat };
  }
  for (let k = 0; k < orig.length; k++) {
    if (orig[k] !== out[k]) {
      return { ok: false, at: k, expected: orig.slice(k, k + 6), got: out.slice(k, k + 6), stat };
    }
  }
  return { ok: true, stat };
}
