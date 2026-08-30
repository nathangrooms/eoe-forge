/**
 * DeckMatrix — mana primitives. P04 and P16.
 *
 * SUPERSEDED IN PART, 22 Aug 2026. Everything below about P04 emitting no action
 * was true when it was written and is not any more: `GameState.manaPool` and the
 * `ADD_MANA` action exist, so P04 emits a real action. The paragraphs are kept
 * because the REASON it could not is the useful part, and because a header
 * rewritten to look like it always said the right thing hides that the engine
 * moved. See the note on `addManaToActions` for what changed.
 *
 * P16 is a parser and is straightforwardly checkable. P04 is the interesting
 * one, because the honest implementation of it emits no action at all.
 *
 * `GameState` carries no mana pool. `mana.ts` derives what a player *could*
 * produce by scanning untapped permanents, which is right for the "can you
 * afford this" question and gives no home to "you now have {G} floating".
 * `GameAction` has no member that adds to a pool either. So P04 cannot emit an
 * action without a state change nobody has designed, and the specification
 * forbids it from inventing one.
 *
 * What it must not do instead is return nothing. An effect that resolves and
 * says nothing is indistinguishable from one that never happened, and that
 * ambiguity is the original bug this engine's honesty contract exists to
 * prevent. So P04 returns a deferred line naming exactly what would have been
 * added — and the measurement in the report counts it as a primitive that PASSED
 * its gates while unlocking zero cards, which is the truthful outcome and a more
 * useful one than a fake pass.
 */

import type { ManaColor } from '../../../cards/abilities/dsl.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { evalValue, playerOf, resolvePlayers } from '../context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { acted, defer, nothing } from './contract.ts';

/* -------------------------------------------------------------------------- */
/* P16 — the parser                                                           */
/* -------------------------------------------------------------------------- */

export type ManaSymbol =
  | { sym: 'colored'; color: ManaColor }
  | { sym: 'generic'; amount: number }
  | { sym: 'x' }
  | { sym: 'hybrid'; colors: ManaColor[] }
  | { sym: 'monocolor-hybrid'; color: ManaColor; generic: number }
  | { sym: 'phyrexian'; color: ManaColor }
  | { sym: 'snow' };

export interface ManaParse {
  /** False if any symbol was not recognised. Never true with a non-empty `unrecognised`. */
  ok: boolean;
  symbols: ManaSymbol[];
  /** Sum of every generic symbol, for callers that only want the number. */
  generic: number;
  /** Verbatim, so a report can name what the grammar is missing. */
  unrecognised: string[];
  /**
   * Split and modal-DFC costs, per face, front face first.
   *
   * REPAIR ROUND. The first version of this parser had no concept of a face and
   * scored 74.82% against the catalogue's 1,092 distinct `mana_cost` values —
   * every one of the 275 failures a `//` string like `{4}{U} // {1}{U}`. The
   * behaviour gate caught it; unit tests A1–A7 all passed and would never have.
   *
   * `symbols` and `generic` describe the FRONT face, because that is what every
   * existing caller means by "the cost". A caller that needs the back face reads
   * `faces`. Merging both faces into one symbol list would have made Fire // Ice
   * cost {1}{R}{1}{U}, which is a worse answer than failing to parse.
   */
  faces?: ManaParse[];
}

const COLORS: readonly string[] = ['W', 'U', 'B', 'R', 'G', 'C'];

function asColor(letter: string): ManaColor | null {
  const upper = letter.toUpperCase();
  return COLORS.includes(upper) ? (upper as ManaColor) : null;
}

/** P16. Spec: `scripts/primitives/specs/P16.spec.json`. */
export function parseManaSymbols(mana: string): ManaParse {
  const text = (mana ?? '').trim();
  if (text === '') return { ok: true, symbols: [], generic: 0, unrecognised: [] };

  // Split and modal-DFC costs. See the `faces` note on `ManaParse`.
  if (text.includes('//')) {
    const faces = text.split('//').map(face => parseManaSymbols(face.trim()));
    const front = faces[0];
    return {
      ok: faces.every(face => face.ok),
      symbols: front.symbols,
      generic: front.generic,
      unrecognised: faces.flatMap(face => face.unrecognised),
      faces,
    };
  }

  const tokens = text.match(/\{[^}]*\}/g);
  // Anything outside braces is not a mana string. Reporting it beats treating
  // "3 mana of any one color" as three generic and losing the restriction.
  const rejoined = (tokens ?? []).join('');
  if (!tokens || rejoined.length !== text.replace(/\s+/g, '').length) {
    return { ok: false, symbols: [], generic: 0, unrecognised: [text] };
  }

  const symbols: ManaSymbol[] = [];
  const unrecognised: string[] = [];

  for (const token of tokens) {
    const body = token.slice(1, -1).trim();
    const upper = body.toUpperCase();

    if (/^\d+$/.test(upper)) {
      symbols.push({ sym: 'generic', amount: Number(upper) });
      continue;
    }
    if (upper === 'X' || upper === 'Y' || upper === 'Z') {
      symbols.push({ sym: 'x' });
      continue;
    }
    if (upper === 'S') {
      symbols.push({ sym: 'snow' });
      continue;
    }
    const solo = asColor(upper);
    if (solo && upper.length === 1) {
      symbols.push({ sym: 'colored', color: solo });
      continue;
    }
    const phyrexian = upper.match(/^([WUBRGC])\/P$/);
    if (phyrexian) {
      symbols.push({ sym: 'phyrexian', color: phyrexian[1] as ManaColor });
      continue;
    }
    const mono = upper.match(/^(\d+)\/([WUBRGC])$/);
    if (mono) {
      symbols.push({ sym: 'monocolor-hybrid', color: mono[2] as ManaColor, generic: Number(mono[1]) });
      continue;
    }
    /*
     * Two or more colours, not exactly two.
     *
     * Printed hybrid is always two, so widening this changes no real card's
     * cost. It exists for `{W/U/B/R/G}`, which is how the compiler spells "one
     * mana of any colour" for Command Tower, Arcane Signet, Fellwar Stone and
     * the rest of the cards that name where the colour comes from. Those carry
     * an `among` on the effect saying which source narrows the five.
     *
     * It lands in `hybrid` on purpose rather than in a symbol of its own,
     * because the consequence is the one that matters and it is already right:
     * a hybrid is a CHOICE, and P05 defers every choice instead of picking a
     * colour for the player.
     */
    const hybrid = upper.match(/^[WUBRGC](?:\/[WUBRGC])+$/);
    if (hybrid) {
      symbols.push({ sym: 'hybrid', colors: upper.split('/') as ManaColor[] });
      continue;
    }
    unrecognised.push(token);
  }

  const generic = symbols.reduce(
    (total, symbol) => total + (symbol.sym === 'generic' ? symbol.amount : 0),
    0
  );
  return { ok: unrecognised.length === 0, symbols, generic, unrecognised };
}

/** Human-readable, for a log line. Never parsed back. */
function describe(symbols: readonly ManaSymbol[]): string {
  return symbols
    .map(symbol => {
      switch (symbol.sym) {
        case 'colored':
          return symbol.color;
        case 'generic':
          return String(symbol.amount);
        case 'x':
          return 'X';
        case 'snow':
          return 'S';
        case 'hybrid':
          return symbol.colors.join('/');
        case 'monocolor-hybrid':
          return `${symbol.generic}/${symbol.color}`;
        case 'phyrexian':
          return `${symbol.color}/P`;
        default:
          return '?';
      }
    })
    .join('');
}

/* -------------------------------------------------------------------------- */
/* P04 — the handler                                                          */
/* -------------------------------------------------------------------------- */

/**
 * P04. Spec: `scripts/primitives/specs/P04.spec.json`.
 *
 * THIS NOW EMITS AN ACTION. Changed 22 Aug 2026, and the module header above it
 * is left as it was written so the reason it could not is still readable.
 *
 * The old body returned a deferral and nothing else, correctly, because
 * `GameState` carried no mana pool and this file was forbidden from inventing
 * one. `GameState.manaPool` and the `ADD_MANA` action exist now, so the honest
 * implementation is no longer a note.
 *
 * `count` is honoured. `{do:'add-mana', mana:'{R}', count:{...}}` is Mana Geyser
 * adding one red per tapped land an opponent controls, and a version of this
 * that added a single {R} would have been a wrong number rather than a missing
 * one. `restriction` rides along verbatim for the same reason: Geosurge's
 * "spend this mana only to cast artifact or creature spells" changes what the
 * mana can do, and a pool holding seven unrestricted red would let a player
 * cast something the card does not allow.
 *
 * A mana string the parser will not guess at still defers and adds nothing. A
 * hybrid or `{X}` symbol is a decision, and picking a colour on a player's
 * behalf is exactly what this folder does not do.
 */
export function addManaToActions(
  effect: Extract<Effect, { do: 'add-mana' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const parse = parseManaSymbols(effect.mana);
  const players = resolvePlayers(effect.who, ctx);

  if (players.length === 0) return defer(`adds ${effect.mana}, but no player was resolved to add it to`);

  if (!parse.ok) {
    return defer(
      ...players.map(playerId => {
        const name = playerOf(ctx.state, playerId)?.name ?? 'A player';
        return `${name} adds ${effect.mana}: the engine does not understand that mana string (${parse.unrecognised.join(', ')})`;
      })
    );
  }

  /*
   * A symbol the pool cannot hold without choosing something. `{R/G}` is a
   * mode, `{X}` is a number nobody announced, `{S}` is snow this engine does
   * not track. Each is a decision, so the whole effect defers rather than
   * putting a guessed colour in a pool.
   */
  const undecidable = parse.symbols.filter(
    symbol => symbol.sym !== 'colored' && symbol.sym !== 'generic'
  );
  if (undecidable.length > 0) {
    return defer(
      ...players.map(playerId => {
        const name = playerOf(ctx.state, playerId)?.name ?? 'A player';
        return `${name} adds {${describe(parse.symbols)}}, which needs a choice this cannot make: ${describe(undecidable)}`;
      })
    );
  }

  /*
   * An empty string parses cleanly into no symbols at all, so it passes every
   * check above and used to build an `ADD_MANA` that added nothing. The reducer
   * would then change nothing, and `applyOne` drops an action that changed
   * nothing without a log entry: a silent no-op, found by the test that pins
   * this invariant. An effect that names no mana says so instead.
   */
  if (parse.symbols.length === 0) {
    return defer(
      ...players.map(playerId => {
        const name = playerOf(ctx.state, playerId)?.name ?? 'A player';
        return `${name} adds no mana: this effect names none`;
      })
    );
  }

  /*
   * `count: 0` is a different thing and is genuinely nothing. "Add {R} for each
   * creature you control" with no creatures adds no mana, which is the correct
   * answer and not a decision anybody has to be told about.
   */
  const copies = Math.max(0, evalValue(effect.count ?? 1, ctx));
  if (copies === 0) return nothing();

  const mana = effect.mana.repeat(copies);
  const sourceName = ctx.state.cards[ctx.sourceId]?.name;

  return acted(
    players.map(playerId => ({
      type: 'ADD_MANA' as const,
      playerId,
      mana,
      ...(effect.restriction ? { restriction: effect.restriction.text } : {}),
      ...(sourceName ? { sourceName } : {}),
      at: env.at,
      ...(env.cause ? { cause: env.cause } : {}),
    }))
  );
}
