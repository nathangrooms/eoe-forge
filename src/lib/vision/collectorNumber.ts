/**
 * Reading the bottom-left block of a card: collector number and set code.
 *
 * This is the only signal on the card that identifies a *printing* rather than
 * a card. Art cannot do it, because reprints overwhelmingly reuse the original
 * illustration — so when two printings share art, this line is the sole
 * distinguishing information that exists in the photograph.
 *
 * Everything here is pure string work. The OCR engine is injected by the
 * caller, so this parses equally well from Tesseract output, from a paste, or
 * from a test fixture.
 *
 * Two hard limits, both properties of the cards rather than of the code:
 *
 *  - Cards printed before 2015 have no collector number on them at all. The
 *    bottom line is a copyright notice. No amount of OCR recovers a number that
 *    was never printed, so those cards fall through to the user picker.
 *  - The line is the smallest text on the card and the first thing lost to
 *    blur. A parse failure here is normal and must be treated as "unknown",
 *    never as "no match".
 */

/** What we managed to read off the bottom line. */
export interface CollectorReading {
  /** Digits only, leading zeros stripped, e.g. "166". Null when unreadable. */
  collectorNumber: string | null;
  /** A trailing letter or star that is part of the number, e.g. the "a" of "166a". */
  numberSuffix: string | null;
  /** Three-to-five character set code, uppercased, e.g. "CLU" or "M21". Null when unreadable. */
  setCode: string | null;
  /** The set's printed card total, when the "166/291" form was read. */
  setTotal: string | null;
  /** True when the line looks like a pre-2015 copyright notice with no number. */
  looksPre2015: boolean;
  /** The raw text this reading came from, for debugging and for the UI's "what I saw". */
  raw: string;
}

/**
 * Characters Tesseract routinely swaps in this typeface, at this size.
 *
 * Applied only inside a slot already known to be numeric. Applying it to the
 * set code would turn valid alphanumeric codes such as "M21" into nonsense.
 */
const DIGIT_FIXES: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2',
  E: '3',
  A: '4',
  S: '5', s: '5',
  G: '6', b: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

function toDigits(s: string): string {
  return s
    .split('')
    .map((c) => (/\d/.test(c) ? c : (DIGIT_FIXES[c] ?? c)))
    .join('')
    .replace(/\D/g, '');
}

/**
 * Set codes that are really words Tesseract likes to hallucinate from the
 * language/legal text sharing the line. Rejecting them costs nothing — a real
 * card whose code collides is still resolvable by collector number alone.
 */
const NOT_SET_CODES = new Set([
  'EN', 'DE', 'FR', 'IT', 'ES', 'PT', 'JA', 'KO', 'RU', 'ZH', 'CS',
  'THE', 'AND', 'INC', 'LLC', 'TM', 'WOTC', 'WIZARDS', 'COAST', 'ALL',
  'RIGHTS', 'RESERVED', 'USA', 'CHINA', 'MADE', 'NOT', 'FOR', 'SALE',
]);

/**
 * Parse a raw OCR string from the collector block.
 *
 * Written to fail to null rather than to guess. A wrong collector number that
 * happens to match a real sibling printing would be a silent, unrecoverable
 * error in the user's collection value; an unread one merely shows them a
 * picker.
 */
export function parseCollectorLine(raw: string): CollectorReading {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  const empty: CollectorReading = {
    collectorNumber: null,
    numberSuffix: null,
    setCode: null,
    setTotal: null,
    looksPre2015: false,
    raw: text,
  };
  if (!text) return empty;

  // A copyright year or year range means a pre-2015 frame, which carries no
  // collector number. Detect it explicitly so the caller can skip straight to
  // the picker instead of reporting a failed read.
  const looksPre2015 = /(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}/.test(text) ||
    /(©|\(c\)|&\s*©)/i.test(text) ||
    /wizards|coast/i.test(text);

  let collectorNumber: string | null = null;
  let numberSuffix: string | null = null;
  let setTotal: string | null = null;
  /** Raw tokens already consumed as the number or set total, so the set-code
   *  scan does not re-read them as a code. */
  const consumed = new Set<string>();

  // Form 1: "166/291" — the most reliable, because the separator is
  // distinctive and the two numbers constrain each other.
  //
  // The separator class deliberately excludes "1", even though Tesseract does
  // sometimes read a slash as a one. Allowing it made "O 1993-2009" parse as
  // collector number 0 of 993: the leading O became a 0, the 1 of 1993 became
  // the slash, and a copyright notice turned into a printing. Losing a few
  // genuine reads is far cheaper than inventing printings out of legal text.
  const pair = text.match(/([0-9OoIlSBZQDGT]{1,4})\s*([a-z★*]?)\s*[/|]\s*([0-9OoIlSBZQDGT]{2,4})/);
  if (pair) {
    const n = toDigits(pair[1]);
    const t = toDigits(pair[3]);
    const nInt = n ? parseInt(n, 10) : NaN;
    const tInt = t ? parseInt(t, 10) : NaN;
    if (n && t && n.length <= 4 && t.length <= 4 && nInt > 0 && tInt > 0) {
      collectorNumber = String(nInt);
      numberSuffix = pair[2] ? pair[2].toLowerCase() : null;
      setTotal = String(tInt);
      consumed.add(pair[1]);
      consumed.add(pair[3]);
    }
  }

  // Form 2: a bare number such as "0166". Every candidate on the line is tried,
  // not just the first — the first is frequently a year, and giving up on it
  // would throw away the real number sitting two tokens later.
  if (collectorNumber === null) {
    const bare = text.matchAll(/(?:^|[\s:,])(\d{1,4})\s*([a-z★*]?)(?=$|[\s/,])/g);
    for (const m of bare) {
      const n = toDigits(m[1]);
      const asInt = n ? parseInt(n, 10) : NaN;
      if (!n || Number.isNaN(asInt) || asInt <= 0 || asInt > 9999) continue;
      // A four-digit number in the 1900s or 2000s on this line is a copyright
      // year far more often than it is a collector number.
      if (/^(19|20)\d{2}$/.test(n)) continue;
      collectorNumber = String(asInt);
      numberSuffix = m[2] ? m[2].toLowerCase() : null;
      consumed.add(m[1]);
      break;
    }
  }

  // Set code: an isolated 3-5 character run that is not a language tag, legal
  // boilerplate, or the number we just read.
  //
  // Set codes are ALPHANUMERIC, not alphabetic — "GN3", "M21", "3ED", "10E" are
  // all real. Stripping digits to "letters only" silently discarded every one
  // of those. What separates a code from a number is therefore not its digit
  // ratio (which would reject "M21") but that it contains at least one letter
  // and was not already consumed as the collector number.
  //
  // Scanned LEFT to right. A modern frame reads "<set> • <language> <artist>",
  // so the code is the first such run; scanning from the right returns the
  // artist's surname.
  let setCode: string | null = null;
  const runs = text.match(/[A-Za-z0-9★]{2,6}/g) ?? [];
  for (const run of runs) {
    if (consumed.has(run)) continue;
    const candidate = run.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (candidate.length < 3 || candidate.length > 5) continue;
    if (!/[A-Z]/.test(candidate)) continue; // all digits: a number, not a code
    if (NOT_SET_CODES.has(candidate)) continue;
    setCode = candidate;
    break;
  }

  return { collectorNumber, numberSuffix, setCode, setTotal, looksPre2015, raw: text };
}

/** The subset of printing metadata needed to match a reading against. */
export interface PrintingIdentity {
  cardId: string;
  setCode: string;
  collectorNumber: string;
}

/** How well a reading matched one printing. */
export interface CollectorMatch {
  cardId: string;
  /** Both number and set code agreed — the only combination treated as ground truth. */
  exact: boolean;
  matchedNumber: boolean;
  matchedSetCode: boolean;
}

/**
 * Match a reading against the known printings of an already-identified card.
 *
 * The critical design property: a printing is only accepted when the collector
 * number *and* the set code both agree with a real printing of that card. That
 * conjunction is what makes this layer fail-safe. A misread digit almost never
 * also produces a set code that matches the same row, so the usual failure mode
 * is "no match" — which defers to the user — rather than "wrong match", which
 * would silently corrupt their collection.
 *
 * Returns every printing that matched, so a caller can see an ambiguous read
 * rather than being handed an arbitrary winner.
 */
export function matchPrintingByCollector(
  reading: CollectorReading,
  printings: readonly PrintingIdentity[],
): CollectorMatch[] {
  const out: CollectorMatch[] = [];
  if (!reading.collectorNumber && !reading.setCode) return out;

  for (const p of printings) {
    const printedNumber = normaliseCollectorNumber(p.collectorNumber);
    const readNumber = reading.collectorNumber
      ? normaliseCollectorNumber(
          reading.collectorNumber + (reading.numberSuffix ?? ''),
        )
      : null;

    // Reprint sets that keep the ORIGINAL set's identity on the card face.
    // "The List" (`plst`) is the significant one: the physical card shows the
    // original set symbol and collector number, and the catalogue stores that
    // as a compound number like "RNA-91" under set code `plst`. A perfectly
    // correct read of "RNA" + "91" would otherwise match only the original
    // `rna` printing — recording a card the user does not own, at the wrong
    // price. Measured: this accounted for 4 of 12 wrong printings in a
    // 1,680-capture evaluation.
    const compound = /^([A-Za-z0-9]{2,5})-(.+)$/.exec(p.collectorNumber?.trim() ?? '');
    const compoundSet = compound ? compound[1].toUpperCase() : null;
    const compoundNumber = compound ? normaliseCollectorNumber(compound[2]) : null;

    const matchedNumber =
      readNumber !== null && (printedNumber === readNumber || compoundNumber === readNumber);
    const matchedSetCode =
      reading.setCode !== null &&
      (p.setCode.toUpperCase() === reading.setCode.toUpperCase() ||
        compoundSet === reading.setCode.toUpperCase());

    if (matchedNumber || matchedSetCode) {
      out.push({
        cardId: p.cardId,
        exact: matchedNumber && matchedSetCode,
        matchedNumber,
        matchedSetCode,
      });
    }
  }
  return out;
}

/**
 * Canonical form of a collector number for comparison.
 *
 * Scryfall stores "166", "166a", "★166" and "T3" as printed. Leading zeros are
 * an artefact of the card face, not of the identity, so they are stripped from
 * the numeric part while any suffix is preserved and lowercased.
 */
export function normaliseCollectorNumber(value: string): string {
  const s = (value || '').trim().toLowerCase();
  const m = s.match(/^([^\d]*)0*(\d+)(.*)$/);
  if (!m) return s;
  return `${m[1]}${m[2]}${m[3]}`.trim();
}
