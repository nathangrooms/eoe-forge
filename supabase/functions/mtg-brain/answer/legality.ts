/**
 * The copy rule and the deck rules, answered by the validator that already
 * exists rather than by a second opinion written here.
 *
 * WHAT THIS REPLACES, AND WHY IT IS NOT A NEW IMPLEMENTATION
 * ---------------------------------------------------------
 * Eleven questions inviting a second copy of a card were put to Tutor with a
 * real Commander deck attached. The fabricated sentence a language model once
 * produced, "you only have one copy, you could add another copy if you want
 * more card draw", did not come back once, which is a genuine improvement. But
 * Tutor never stated the rule either. Six of the eleven were answered with a
 * card page whose only relevant line was
 *
 *   Legal in Commander and Vintage (one copy only). Banned in Legacy.
 *
 * where the parenthetical belongs to Vintage, in which Sol Ring is restricted,
 * and lands at the end of a joined list where it reads as a qualifier on the
 * whole sentence. Asked "can I run two", that reads as yes.
 *
 * `src/lib/deck/deckLegality.ts` answers every one of those eleven questions.
 * It has tests. It was not imported by the function that needed it. So it is
 * mirrored in by `scripts/vendor-engine.mjs` on the engine's terms, and this
 * file calls it. Nothing here decides what is legal.
 *
 * THE VALIDATOR IS CALLED TWICE ON PURPOSE
 * ----------------------------------------
 * `cardFaults` reports ONE fault per row, in the order the reasons are
 * unfixable: banned beats never legal beats restricted beats the copy limit
 * beats colour identity. That is right for a legality panel, where a card is
 * one row to take out. It is wrong for this question, because a player asking
 * "is running 4 copies of Lightning Bolt fine in my deck" needs to hear both
 * that the format is singleton AND that Lightning Bolt is red and their
 * commander is not. At four copies the count fault fires first and the colour
 * fault is never reached.
 *
 * So the validator is asked twice with different inputs: once at one copy,
 * which surfaces everything that is wrong with the card regardless of how many
 * they run, and once at the count they asked about, which surfaces the count
 * itself. Two questions, one validator, no second rule written here.
 */

import {
  cardFaults,
  deckRules,
  formatKeyLabel,
  type DeckRule,
  type LegalityFault,
} from '../_lib/deck/deckLegality.ts';
import type { DeckCardRow } from '../_lib/deck/deckCards.ts';
import { ALL_FORMATS } from '../_lib/magic/formats.ts';
import type { NormalisedCard } from '../deck-context.ts';

export interface Fault {
  fault: LegalityFault;
  detail: string;
}

export interface CopyVerdict {
  /** The format the answer is about, prettified. */
  formatLabel: string;
  /**
   * False when `ALL_FORMATS` does not model this format's construction rules.
   * The card's own legality is still exact; the copy limit is not known, and
   * the answer has to say so rather than assume four of a 60 card deck.
   */
  rulesKnown: boolean;
  /** The copy rule itself, in the validator's own words. */
  rule: string | null;
  /** How many copies the question asked about, or null when it did not say. */
  copies: number | null;
  /** Everything wrong, deduplicated across both calls. */
  faults: Fault[];
  /** True when a basic land is exempt from the limit the rule just stated. */
  basicLandExempt: boolean;
  /**
   * The most copies of THIS card the format accepts, or null when nothing
   * inside the probe range stops it.
   *
   * Not read off the format spec. `deckLegality.ts` decides the allowance from
   * three things at once (the format's default, a per-card exception, and
   * whether the card is restricted), and re-reading those three fields here
   * would be the one line of that rule written down twice. So the validator is
   * asked instead: run it at one copy, two copies, three, and take the last
   * count it did not complain about. Ten calls of a pure function on a single
   * row, which costs nothing and cannot disagree with the rule it is reading.
   */
  allowed: number | null;
}

/**
 * How far the probe goes before it stops asking.
 *
 * Ten is past every real limit in `ALL_FORMATS` and short enough that the loop
 * is free. Nothing stopping it by ten means the format has no copy limit we
 * hold, which is a different answer from "ten", and the caller says so.
 */
const PROBE_CEILING = 10;

const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

/**
 * May this deck run this card, and how many of it.
 *
 * `commanderIdentity` is null when no deck is attached, and null is not an
 * empty identity. `cardFaults` only tests colour identity when it has a
 * commander to test against, which is exactly right: a question with no deck
 * behind it is a question about the format's rule and not about one deck's
 * colours.
 */
export function copyVerdict(opts: {
  card: {
    name: string;
    legalities: Record<string, string> | null;
    colorIdentity: readonly string[] | null;
  };
  copies: number | null;
  format: string;
  commanderName?: string | null;
  commanderIdentity: readonly string[] | null;
}): CopyVerdict {
  const key = opts.format.toLowerCase();
  const spec = ALL_FORMATS[key];

  const row = (quantity: number): DeckCardRow => ({
    card_name: opts.card.name,
    quantity,
    card: {
      name: opts.card.name,
      legalities: opts.card.legalities,
      color_identity: [...(opts.card.colorIdentity ?? [])],
    },
  });

  /* A stand-in for the command zone, carrying nothing but the identity the
     request already told us. It is never reported on: `cardFaults` reads the
     commander only for `commanderIdentity`, and the commander itself is not in
     `rows`, so no fault can be raised about it. */
  const commander: DeckCardRow | null = opts.commanderIdentity
    ? {
        card_name: opts.commanderName ?? 'your commander',
        quantity: 1,
        card: {
          name: opts.commanderName ?? 'your commander',
          legalities: null,
          color_identity: [...opts.commanderIdentity],
        },
      }
    : null;

  const seen = new Set<string>();
  const faults: Fault[] = [];
  const collect = (found: { fault: LegalityFault; detail: string }[]) => {
    for (const f of found) {
      const dedupe = `${f.fault}:${f.detail}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      faults.push({ fault: f.fault, detail: f.detail });
    }
  };

  // One copy first: everything wrong with the card whatever the count.
  collect(cardFaults({ rows: [row(1)], commander }, key));
  // Then the count they actually asked about.
  if (opts.copies != null && opts.copies > 1) {
    collect(cardFaults({ rows: [row(opts.copies)], commander }, key));
  }

  /* The rule in the validator's own words, taken off a one card deck. Only the
     copy rule is read: `size` and `commander` would be answered against a
     synthetic list of one and would be nonsense. */
  const rule =
    deckRules({ rows: [row(1)], commander }, key).find(r => r.id === 'copies')?.label ?? null;

  let allowed: number | null = null;
  for (let n = 1; n <= PROBE_CEILING; n++) {
    const stopped = cardFaults({ rows: [row(n)], commander }, key).some(
      f => f.fault === 'copy-limit' || f.fault === 'restricted'
    );
    if (stopped) {
      allowed = n - 1;
      break;
    }
  }

  return {
    formatLabel: formatKeyLabel(key),
    rulesKnown: Boolean(spec),
    rule,
    copies: opts.copies,
    faults,
    basicLandExempt: BASIC_LANDS.has(opts.card.name.trim().toLowerCase()),
    allowed,
  };
}

/**
 * The deck rules a request body can answer on its own.
 *
 * `deckRules` reads names and quantities and the format's own spec, and touches
 * no card metadata at all, so it runs on the list the page already sent with no
 * database read: exactly 100 cards commander included, a commander in the
 * command zone, one copy of each card with basics excepted.
 *
 * `cardFaults` is deliberately NOT run over the deck here. It needs each card's
 * `legalities` and `color_identity`, and the page sends neither, so running it
 * would report every card as `no-data` and produce a hundred faults that are
 * facts about our request shape rather than about the deck. The deck page has
 * already checked that half and its verdict rides along in the body; the answer
 * says which half came from where.
 */
export function deckRuleVerdicts(
  deckCards: readonly NormalisedCard[],
  format: string
): { rules: DeckRule[]; rulesKnown: boolean; formatLabel: string } {
  const key = (format || 'commander').toLowerCase();
  const main = deckCards.filter(c => !c.isSideboard);
  const rows: DeckCardRow[] = main
    .filter(c => !c.isCommander)
    .map(c => ({ card_name: c.name, quantity: c.quantity, card: null }));
  const commanderCard = main.find(c => c.isCommander);
  const commander: DeckCardRow | null = commanderCard
    ? { card_name: commanderCard.name, quantity: 1, card: null }
    : null;

  return {
    rules: deckRules({ rows, commander }, key),
    rulesKnown: Boolean(ALL_FORMATS[key]),
    formatLabel: formatKeyLabel(key),
  };
}

/* -------------------------------------------------------------------------- *
 * A card that says the singleton rule does not apply to it
 * -------------------------------------------------------------------------- */

/**
 * The copy allowance a card prints on itself, or null.
 *
 * THIS IS THE MIRROR IMAGE OF THE BUG THAT STARTED ALL OF THIS. The stored
 * fault was a Commander deck being told it "could add another copy" of Mystic
 * Remora. The other way round is Relentless Rats being told "one copy, and one
 * only", and measured on 2026-08-30 that is exactly what Tutor said. It is
 * wrong, it is confident, and a player would take it to a table.
 *
 * Fifteen cards in the catalogue carry their own allowance in their own printed
 * text, the same way a keyword carries its own definition: Relentless Rats, Rat
 * Colony, Shadowborn Apostle, Persistent Petitioners, Dragon's Approach, Slime
 * Against Humanity, Hare Apparent, Templar Knight, Tempest Hawk, Cid, Nazgul at
 * nine and Seven Dwarves at seven. We hold every one of those sentences.
 * Nothing here is remembered and nothing is listed by name.
 *
 * The WORDS are returned rather than a number, because "up to nine" is what the
 * card says and nine is a reading of it. The caller quotes the line either way.
 *
 * It lives beside the copy rule rather than beside the answer that prints it,
 * because it IS a copy rule, and because here it can be tested without a
 * network.
 */
export function printedCopyException(
  oracleText: string | null | undefined
): { line: string; allowance: string } | null {
  const found = String(oracleText ?? '').match(
    /A deck can have (any number of|up to [a-z]+) cards named ([^.\n]+)\./i
  );
  if (!found) return null;
  return { line: found[0], allowance: found[1].toLowerCase() };
}
