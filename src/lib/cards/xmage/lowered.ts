/**
 * The ported XMage behaviour, as the shipped engine reads it.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage's display strings are never
 * copied: they carry Wizards of the Coast rules text, so every ability's `text`
 * is filled from Scryfall's oracle text instead. Forge is GPL-3.0 and was not
 * fetched, read or referenced.
 *
 * ==========================================================================
 * THE PRECEDENCE RULE. Three tiers, one rule, not a per-case judgement.
 * ==========================================================================
 *
 *   1. THE ORACLE-TEXT COMPILER WINS WHENEVER IT FULLY UNDERSTANDS THE CARD.
 *   2. THE XMAGE RECORD, LOWERED THROUGH THE SHARED CLASS TABLE, IS CONSULTED
 *      ONLY FOR A CARD THE COMPILER DOES NOT FULLY UNDERSTAND, AND WHEN IT IS
 *      CONSULTED IT REPLACES THE CARD'S WHOLE ABILITY LIST RATHER THAN BEING
 *      MERGED INTO IT CLAUSE BY CLAUSE.
 *   3. A MACHINE-TRANSLATED XMAGE BODY IS THE LAST RESORT, REACHED ONLY FOR AN
 *      EFFECT CLASS THAT ONE CARD DECLARES FOR ITSELF AND THAT NO SHARED
 *      LOWERING CAN SERVE.
 *
 * ### Why a translated body is last, and how that is enforced
 *
 * Everything in tier 2 is a lowering somebody wrote and can be read: one
 * function, one XMage class, an argument list checked against the source. A
 * tier 3 body is none of those. It is `scripts/xmage/translate-bodies.mjs`
 * rewriting a third party's Java into TypeScript from the parse tree, with no
 * human in the loop for that particular card. It is the least reviewed thing
 * this engine can run, so it runs only where nothing else can.
 *
 * The order is not a preference expressed at a merge. It is structural, in
 * three places:
 *
 *   - A body is keyed `local:SomeEffect`, and a `local:` primitive is BY
 *     DEFINITION one no shared class covers: it is a class the card file
 *     declared for itself. There is nothing for it to take precedence over.
 *   - `xmageBodyLowerings` refuses any primitive `LOWERINGS` already holds, so
 *     the day a hand-written lowering for a card-local class is added, it wins
 *     and the machine translation stands down.
 *   - `to-actions.ts` refuses the body a second time at the point of use when
 *     it is a bare `return true` override, and reports out loud when it throws,
 *     when its key names a body this build does not carry, when it stops on a
 *     question, and when it claims success having changed nothing. A tier 3
 *     body is the only member of the effect union carrying all five guards, and
 *     it carries them because of what it is.
 *
 * ### What tier 3 is NOT, and this is the bar it does not cross
 *
 * A card whose record fails to lower does not fall back to "run whichever of
 * its abilities did lower". 246 cards have a substantive translated body they
 * cannot reach for exactly that reason, and running the reachable part of them
 * would be half a card. The all-or-nothing bar in `emit-lowered.mjs` is the
 * same bar as tier 2's whole-card swap and it is there for the same reason.
 * Tier 3 is a last resort WITHIN a card that lowers completely, not a way to
 * ship part of one that does not.
 *
 * `CLAUDE.md`'s standing position is that oracle text wins and the
 * disagreement is recorded. This does not depart from it. It says WHERE the
 * question arises: only on a card the compiler already admits it has not
 * finished, which is `compilerCoverage !== 'full'` — a value `deriveCoverage`
 * computes, nothing hand-sets, and NOTHING REWRITES. It is not `coverage`.
 * `coverage` describes whatever record is in front of you, so a swap sets it to
 * 'full' and a rule reading it would refuse on a second pass every card it
 * accepted on the first. `compilerCoverage` is the compiler's reading of the
 * printed card and it survives the swap unchanged, which is the only reason
 * this rule is idempotent.
 *
 * ### What the rule refuses that it maybe should not, sized
 *
 * `compilerCoverage === 'full'` says the compiler read every printed paragraph.
 * It does not say the card WORKS. 4,916 in-pool cards hold a record and are
 * refused by that sentence; the shipped verdict passes 3,557 of them and
 * refuses 1,359, and on that 1,359 the compiler read the card and the engine
 * still has no consumer for what it produced. The tempting widening is to
 * consult the port there too. It was measured rather than argued:
 * `DM_XMAGE_FORCE=1` in `scripts/verify-ability-coverage.mjs` puts the port in
 * front of the compiler on all 4,916 and takes the whole pool to the verdict.
 * It wins 20 cards and loses 224, of which 207 lose for one reason — the port
 * lowers "{T}: Add {G}" to a MANA ability and `mana.ts` counts untapped sources
 * instead of reading compiled mana abilities, while the compiler's shape
 * happens to land on a live consumer. So the widening is not blocked by this
 * rule being timid. It is blocked by an engine gap that costs the port eleven
 * cards for every one it gains, and it is that gap and not this sentence that
 * the next phase should move.
 *
 * ### Why the compiler wins where it is complete
 *
 * The compiler reads the card a player is holding: Scryfall's oracle text, the
 * current wording, errata included. The XMage record is a transcription of that
 * card into Java by a third party, joined back to an oracle id afterwards. Both
 * are good; only one of them is the card. Where the printed card is fully
 * understood there is nothing a second-hand copy can add, and preferring it
 * would make the engine's behaviour depend on which of two sources happened to
 * be more complete for that card — which is a per-case judgement wearing a
 * rule's clothes.
 *
 * ### Why the swap is whole-card and never clause by clause
 *
 * Because the two sources disagree about where a clause even STARTS. A compiler
 * ability is paragraph-shaped and carries the span it came from. An XMage
 * ability is a Java object and carries no span at all. Merging them means
 * guessing which XMage ability corresponds to which printed paragraph, and a
 * wrong guess does not produce a card that refuses — it produces a card that
 * RUNS AND IS WRONG. `docs/engine/PORT-LOG.md` section 7 is four separate
 * instances of exactly that, every one of which survived code review and was
 * caught only by walking a named card through. A whole-card swap needs no
 * guess: either the record lowers the entire card or it is not used at all.
 *
 * ### What the whole-card swap costs, stated rather than hidden
 *
 * `Ability.text` is player-facing. `statics.ts`, `activate.ts` and
 * `trigger-bridge.ts` all put it in the game log. A compiler ability carries
 * the one clause it came from; a swapped ability carries the WHOLE front face,
 * because the record genuinely does not know which printed line it came from.
 * So the log for a swapped multi-ability card names the whole card each time it
 * fires. That is verbose and it is true. Attaching a guessed line instead would
 * be neither.
 *
 * ### Two further bars, both of which cost real cards
 *
 * A card with any paragraph on a face other than the front is never swapped.
 * `normalizeCard` marks those a declared gap, the engine does not play a back
 * face today, and consuming them here would silently claim it does.
 *
 * A record is only in `lowered.generated.ts` at all if EVERY ability of every
 * face lowered — the same all-or-nothing bar `lowerCard` and `PORT-LOG.md`
 * use, for the same reason. Half a card is the failure this project has now
 * made three times.
 */

import type { Ability, CardAbilities } from '../abilities/dsl.ts';
import type { NormalizedOracle } from '../abilities/normalize.ts';
import { XMAGE_LOWERED, XMAGE_LOWERED_STATS } from './lowered.generated.ts';

export { XMAGE_LOWERED_STATS };

/**
 * Turns the second source off, so the figures from before it was wired can be
 * reproduced by a session that no longer has the code it was measured against.
 *
 * The same escape hatch, and the same argument for it, as `DM_ACTIVATED_DEAD`
 * in `scripts/verify-ability-coverage.mjs`: it can only ever make the engine
 * claim LESS than it does, so it is the direction that is safe to leave
 * available. There is no switch in the other direction.
 *
 * Read once, here, rather than per card, and guarded because `process` does not
 * exist in a browser.
 */
const XMAGE_OFF =
  typeof process !== 'undefined' && process?.env?.DM_XMAGE_OFF === '1';

/** How many cards the shipped table can speak for. Not a coverage number. */
export function xmageLoweredCardCount(): number {
  return Object.keys(XMAGE_LOWERED).length;
}

/** Does the table hold this card at all? Says nothing about precedence. */
export function hasXmageRecord(oracleId: string | null | undefined): boolean {
  return !!oracleId && Object.prototype.hasOwnProperty.call(XMAGE_LOWERED, oracleId);
}

/**
 * The reason this card was NOT swapped, or `null` when it was.
 *
 * Returned as a sentence rather than a boolean because every other refusal in
 * this port names itself, and a swap that silently did not happen is the kind
 * of thing that gets rediscovered a session later as a mystery.
 */
export type SwapRefusal =
  | 'compiler understands this card completely'
  | 'no XMage record for this oracle id'
  | 'the card has text on a face the engine does not play'
  | 'the record lowered to no abilities'
  | 'DM_XMAGE_OFF=1';

export interface XmageSwap {
  abilities: Ability[];
  /** Every front-face paragraph, which the swap consumes as a whole. */
  consumed: Array<[number, number]>;
}

/**
 * Apply the precedence rule.
 *
 * `compiled` is what the oracle-text compiler made of the card. Returning
 * `null` means the compiler's answer stands, which is the common case and the
 * default: this function only ever fires on a card the compiler has already
 * marked incomplete.
 */
export function xmageSwapFor(
  compiled: CardAbilities,
  normalized: NormalizedOracle,
): { swap: XmageSwap } | { refused: SwapRefusal } {
  if (XMAGE_OFF) return { refused: 'DM_XMAGE_OFF=1' };

  /*
   * THE RULE, first line, before anything else is looked at.
   *
   * The port is consulted only for a card the ORACLE-TEXT COMPILER did not
   * fully read, and "did not fully read" is `compilerCoverage`: the value
   * `deriveCoverage` computed from the compiler's own abilities and its own
   * unparsed list, set once before this function was called and carried through
   * the swap unchanged. It is deliberately NOT `coverage`, which the swap
   * rewrites to 'full' on every card it speaks for, so a rule reading
   * `coverage` answers one way on a fresh record and the opposite way on a
   * finished one. Reading a value the decision cannot change is what makes this
   * a rule rather than an artefact of the order two statements happen to be
   * written in, and it is why handing a swapped record back to this function
   * now returns the answer it returned the first time. What the sentence does
   * NOT claim is that the compiler's answer WORKS: full coverage says every
   * printed paragraph was read, and on 1,359 cards that hold a record it was
   * read and the card still does nothing on a board, because the engine has no
   * consumer for what the compiler produced. Widening the sentence to reach
   * those was measured end to end with DM_XMAGE_FORCE=1 over all 32,469 cards
   * and it loses 224 cards to win 20, so the sentence stays as written and
   * those 1,359 are an engine-consumer gap rather than a precedence question.
   */
  if (compiled.compilerCoverage === 'full') {
    return { refused: 'compiler understands this card completely' };
  }

  const oracleId = compiled.oracleId;
  if (!Object.prototype.hasOwnProperty.call(XMAGE_LOWERED, oracleId)) {
    return { refused: 'no XMage record for this oracle id' };
  }

  const paragraphs = normalized.paragraphs;
  if (paragraphs.some((p) => p.face > 0)) {
    return { refused: 'the card has text on a face the engine does not play' };
  }

  const stored = XMAGE_LOWERED[oracleId];
  if (!stored || stored.length === 0) return { refused: 'the record lowered to no abilities' };

  // The whole front face, verbatim, as `Paragraph.raw` defines it: "this is what
  // `Ability.text` carries". Every swapped ability carries all of it, for the
  // reason in this file's header.
  const text = paragraphs.map((p) => p.raw).join('\n');

  return {
    swap: {
      abilities: stored.map((ability) => ({ ...ability, text }) as Ability),
      consumed: paragraphs.map((p) => p.span),
    },
  };
}
