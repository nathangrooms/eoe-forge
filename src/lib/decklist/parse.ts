/**
 * Reading a pasted card list.
 *
 * ONE PARSER, EVERY SURFACE
 * -------------------------
 * This started life inside `DeckImportExport.tsx` as a closure, which meant the
 * proxy list could not use it without writing a second one, and a second one
 * drifts. It is a pure module now: no React, no network, no Supabase, so it
 * runs under `node --test --experimental-strip-types` and `parse.test.ts` can
 * hold it to every format below by example rather than by assertion.
 *
 * WHAT PEOPLE ACTUALLY PASTE
 * --------------------------
 * A player copies from wherever their deck already is, so "the format" is not
 * one format. These are the shapes this handles, each checked in the tests:
 *
 *   4 Lightning Bolt                      plain, and the most common of all
 *   4x Lightning Bolt                     Moxfield, Archidekt
 *   Lightning Bolt                        a bare list of names, quantity 1
 *   Lightning Bolt x4                     quantity after the name
 *   1 Lightning Bolt (M21) 163            Arena and Moxfield, with the printing
 *   1 Sol Ring (LTC) 284 *F*              Moxfield, foil
 *   1x Sol Ring (ltc) 284 [Ramp]          Archidekt, with its category
 *   4 [M21] Lightning Bolt                Deckstats, set in front
 *   1 Sol Ring #!Commander                Deckstats, role marker
 *   SB: 2 Lightning Bolt                  MTGO sideboard
 *   Deck / Commander / Sideboard          section headings, with or without (n)
 *
 * THE HEADING BUG THIS FIXES
 * --------------------------
 * The original tested headings with `line.toLowerCase().includes('commander')`,
 * so `4 Commander's Sphere` was read as a heading and the card was thrown away
 * silently. A heading here has to carry no quantity and match a known word
 * exactly, so a card whose name contains a section word survives.
 *
 * NOTHING IS DROPPED
 * ------------------
 * A line that cannot be read comes back in `unreadable` with its line number
 * and the text as typed. A parser that returns only its successes is a parser
 * that loses cards quietly, and the person pasting has no way to find out
 * which.
 */

/** Where in the deck a line was sitting. */
export type DeckSection =
  | 'commander'
  | 'main'
  | 'sideboard'
  | 'maybeboard'
  | 'companion'
  | 'tokens';

export interface ParsedCardLine {
  /** 1-based line number in the pasted text, so a problem can be pointed at. */
  line: number;
  /** The line exactly as it was pasted. */
  raw: string;
  /** The card name, with curly apostrophes folded and spacing tidied. */
  name: string;
  quantity: number;
  section: DeckSection;
  /** Scryfall set code, when the paste named one. Lowercased. */
  setCode?: string;
  /** Collector number, when the paste named one. */
  collectorNumber?: string;
  /** A foil or etched marker was on the line. */
  finish?: 'foil' | 'etched';
  /**
   * The other honest reading of a line ending in a bare number.
   *
   * `Lightning Bolt 4` means four Lightning Bolts. `Pain 101` is a card, and so
   * are `Black Waltz No. 3`, `Avalanche of Sector 7` and four more in the
   * catalogue today. Nothing about the text tells them apart, so the parser
   * refuses to guess: it keeps the whole line as the name and hands the other
   * reading along beside it. The lookup settles it, at no extra cost, because
   * both readings ride in the same single batch.
   */
  alternate?: { name: string; quantity: number };
}

export interface UnreadableLine {
  line: number;
  raw: string;
  reason: string;
}

export interface DeckListParse {
  cards: ParsedCardLine[];
  unreadable: UnreadableLine[];
  /**
   * Copies across every readable line, counting the first reading of a line
   * that has two. It is what the paste says before the lookup settles the
   * ambiguous ones, so the review screen counts from the resolved list instead.
   */
  copies: number;
}

/* ------------------------------------------------------------------ *
 * Section headings
 * ------------------------------------------------------------------ */

/**
 * A heading has to match one of these exactly once the decoration is off, so
 * `Commander's Sphere` cannot be mistaken for one. The type-group words are
 * here because Moxfield and Archidekt group their exports by card type and
 * write `Creatures (30)` above each block; they all mean the main deck.
 */
const SECTIONS: Record<string, DeckSection | 'skip'> = {
  commander: 'commander',
  commanders: 'commander',
  'command zone': 'commander',
  'commander zone': 'commander',

  deck: 'main',
  main: 'main',
  maindeck: 'main',
  'main deck': 'main',
  mainboard: 'main',
  'main board': 'main',
  library: 'main',

  sideboard: 'sideboard',
  'side board': 'sideboard',
  sb: 'sideboard',

  maybeboard: 'maybeboard',
  'maybe board': 'maybeboard',
  considering: 'maybeboard',

  companion: 'companion',

  token: 'tokens',
  tokens: 'tokens',

  /* Arena writes an `About` block holding the deck's own name. It is not cards,
     so it is skipped rather than read as one. */
  about: 'skip',

  creature: 'main',
  creatures: 'main',
  land: 'main',
  lands: 'main',
  instant: 'main',
  instants: 'main',
  sorcery: 'main',
  sorceries: 'main',
  artifact: 'main',
  artifacts: 'main',
  enchantment: 'main',
  enchantments: 'main',
  planeswalker: 'main',
  planeswalkers: 'main',
  battle: 'main',
  battles: 'main',
  spell: 'main',
  spells: 'main',
  other: 'main',
};

/* ------------------------------------------------------------------ *
 * Tidying
 * ------------------------------------------------------------------ */

/**
 * The curly apostrophe is the quiet one.
 *
 * Anything copied out of a web page carries U+2019 rather than an apostrophe,
 * so `Urza’s Saga` and `Urza's Saga` are different strings and an exact lookup
 * on the first finds nothing. Folded here and again in the database, because
 * either side can be handed a name the other did not clean.
 *
 * The dashes are folded one way only, and safely: checked against the live
 * catalogue on 20 Aug 2026, ZERO card names contain an en dash, em dash or
 * figure dash. So a paste whose hyphen was prettified on its way through a web
 * page still matches, and no real name is damaged by the fold.
 */
export function tidyName(value: string): string {
  return value
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips a heading's decoration: a trailing colon, and a `(30)` count. */
function headingKey(line: string): string {
  return tidyName(line)
    .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
    .replace(/[:：]\s*$/, '')
    .toLowerCase();
}

/**
 * Set codes are two to five characters in Scryfall's namespace, and a
 * parenthetical of that length is almost always one. These are the words that
 * fit the shape and are not sets, so they stay out of the printing.
 */
const NOT_A_SET = new Set(['cmdr', 'cmd', 'foil', 'etch', 'nf', 'f', 'e']);

/* ------------------------------------------------------------------ *
 * One line
 * ------------------------------------------------------------------ */

interface LineParse {
  name: string;
  quantity: number;
  setCode?: string;
  collectorNumber?: string;
  finish?: 'foil' | 'etched';
  /** A per-line role marker, which beats the section the line sits in. */
  section?: DeckSection;
  alternate?: { name: string; quantity: number };
}

/**
 * Reads one card line, or returns null if there is no card in it.
 *
 * Order matters here and is the whole trick. The printing is lifted out
 * FIRST, so that `1 Lightning Bolt (M21) 163` does not leave a bare `163` on
 * the end that the trailing-quantity rule would then read as "163 copies".
 */
export function parseCardLine(input: string): LineParse | null {
  let text = tidyName(input);
  if (!text) return null;

  let section: DeckSection | undefined;
  let finish: LineParse['finish'];
  let setCode: string | undefined;
  let collectorNumber: string | undefined;

  /* A bullet from a pasted web list. */
  text = text.replace(/^[-*•·]\s+/, '');

  /* MTGO marks its sideboard on the line rather than with a heading. */
  const sb = /^sb:\s*/i.exec(text);
  if (sb) {
    section = 'sideboard';
    text = text.slice(sb[0].length);
  }

  /* Deckstats role markers: `#!Commander`, `#!Sideboard`. Anything else after
     a hash is one of its comments and carries no cards. */
  text = text.replace(/\s*#!?\s*([A-Za-z ]+)\s*$/, (_all, word: string) => {
    const found = SECTIONS[word.trim().toLowerCase()];
    if (found && found !== 'skip') section = found;
    return '';
  });

  /* Moxfield finish markers. */
  text = text.replace(/\s*\*\s*(f|foil|e|etch|etched)\s*\*/gi, (_all, mark: string) => {
    finish = /^e/i.test(mark) ? 'etched' : 'foil';
    return ' ';
  });

  /* Archidekt writes its own category in trailing square brackets, and
     Deckstats writes the set in leading ones. Position tells them apart. */
  text = text.replace(/\s*\[([^\]]{1,40})\]\s*$/, (_all, inside: string) => {
    if (/^[A-Za-z0-9]{2,5}$/.test(inside)) {
      /* Ambiguous on its own, so only taken as a set when nothing else claimed
         one and the line still reads as a card afterwards. */
      setCode = inside.toLowerCase();
    }
    return ' ';
  });
  text = text.replace(/^(\d+\s*x?\s*)?\[([A-Za-z0-9]{2,5})\]\s*/i, (_all, qty: string, code: string) => {
    setCode = code.toLowerCase();
    return qty ?? '';
  });

  /*
   * The printing. `(M21) 163`, `(M21)` alone, or `(M21) 163★`.
   *
   * A CARD NAME CAN END IN A SHORT PARENTHETICAL TOO
   * ------------------------------------------------
   * `1 Hazmat Suit (Used)` is a real Unstable card and `Used` is four
   * characters, so this rule read it as set code `used` and asked the catalogue
   * for `Hazmat Suit`, which is not a card. The line was not dropped, but it
   * came back as a GUESS in "Worth a look" instead of the exact match it is, so
   * a name typed correctly and in full still needed a click to survive.
   *
   * Nothing in the text tells `(Used)` from `(LTC)`, so this does not guess. It
   * keeps the other reading and hands it along, exactly as the trailing-number
   * rule below already does for `Pain 101`: both readings ride in the same
   * single batch and whichever finds a card wins. It only applies when the
   * parenthetical ENDS the line and no collector number follows, because
   * `(LTC) 284` is not ambiguous.
   */
  const printing = /\s*\(([A-Za-z0-9_]{2,5})\)\s*([A-Za-z0-9★†-]{1,8})?/.exec(text);
  let trailingParenthetical: string | undefined;
  if (printing) {
    const code = printing[1];
    const number = printing[2];
    const lower = code.toLowerCase();
    const endsTheLine = printing.index + printing[0].length === text.length;

    if (NOT_A_SET.has(lower)) {
      /* `(Commander)` is nine characters and never reaches here, but `(CMDR)`
         does, and it is a role rather than a set. */
      if (lower === 'cmdr' || lower === 'cmd') section = 'commander';
    } else {
      setCode = lower;
      if (number) collectorNumber = number;
      if (endsTheLine && !number) trailingParenthetical = `(${code})`;
    }

    text = `${text.slice(0, printing.index)} ${text.slice(printing.index + printing[0].length)}`;
  }

  /* Long-form role markers the product's own export writes. */
  text = text.replace(/\s*\((commander|companion|sideboard|maybeboard)\)\s*/i, (_all, word: string) => {
    const found = SECTIONS[word.toLowerCase()];
    if (found && found !== 'skip') section = found;
    return ' ';
  });

  text = tidyName(text);
  if (!text) return null;

  /* Leading quantity: `4`, `4x`, `4 x`, `x4`. */
  let quantity: number | null = null;
  const leading = /^(?:x\s*(\d{1,3})|(\d{1,3})\s*x?)\s+/i.exec(text);
  if (leading) {
    quantity = Number(leading[1] ?? leading[2]);
    text = text.slice(leading[0].length).trim();
  }

  /* Trailing quantity, only when there was no leading one. Safe because the
     printing has already been taken off the end, so a collector number cannot
     be mistaken for a count. */
  let alternate: LineParse['alternate'];
  if (quantity === null) {
    /* `Name x4` says what it means, so it is read outright. */
    const explicit = /^(.+?)\s+x\s*(\d{1,3})$/i.exec(text);
    if (explicit) {
      quantity = Number(explicit[2]);
      text = explicit[1].trim();
    } else {
      /* `Name 4` does not, so both readings are kept. See `alternate`. */
      const bare = /^(.+?)\s+(\d{1,3})$/.exec(text);
      if (bare) {
        const count = Number(bare[2]);
        if (count > 0) alternate = { name: tidyName(bare[1]), quantity: count };
      }
    }
  }

  const name = tidyName(text);
  if (!name) return null;
  /* A line that is nothing but digits is a stray count, not a card. */
  if (/^\d+$/.test(name)) return null;

  /* The parenthetical this line ended with, put back. Only when the
     trailing-number rule has not already claimed the alternate, which it cannot
     have: a line cannot end in both `(Used)` and a bare number. */
  if (trailingParenthetical && !alternate) {
    alternate = {
      name: tidyName(`${name} ${trailingParenthetical}`),
      quantity: quantity && quantity > 0 ? quantity : 1,
    };
  }

  return {
    name,
    quantity: quantity && quantity > 0 ? quantity : 1,
    setCode,
    collectorNumber,
    finish,
    section,
    alternate: alternate && alternate.name ? alternate : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * The whole paste
 * ------------------------------------------------------------------ */

export function parseDeckList(text: string): DeckListParse {
  const cards: ParsedCardLine[] = [];
  const unreadable: UnreadableLine[] = [];
  let section: DeckSection = 'main';
  let skipping = false;

  const lines = (text ?? '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    /* Deckstats writes its headings as comments (`//Sideboard`), so a comment
       is checked for a heading before it is discarded. */
    const withoutComment = trimmed.replace(/^(\/\/+|#(?!!))\s*/, '');
    const heading = SECTIONS[headingKey(withoutComment)];
    if (heading) {
      if (heading === 'skip') {
        skipping = true;
      } else {
        skipping = false;
        section = heading;
      }
      continue;
    }
    if (trimmed !== withoutComment) continue;
    if (skipping) continue;

    const parsed = parseCardLine(trimmed);
    if (!parsed) {
      unreadable.push({
        line: i + 1,
        raw: trimmed,
        reason: 'We could not find a card name on this line.',
      });
      continue;
    }

    cards.push({
      line: i + 1,
      raw: trimmed,
      name: parsed.name,
      quantity: parsed.quantity,
      section: parsed.section ?? section,
      setCode: parsed.setCode,
      collectorNumber: parsed.collectorNumber,
      finish: parsed.finish,
      alternate: parsed.alternate,
    });
  }

  return {
    cards,
    unreadable,
    copies: cards.reduce((sum, card) => sum + card.quantity, 0),
  };
}

/**
 * Collapses lines naming the same card into one entry.
 *
 * A paste that lists Sol Ring under two headings is a normal paste, and a
 * review screen that shows it twice makes the reader decide twice about one
 * card. Grouped on name plus printing, because someone who asked for two
 * different printings of one card meant it: on a proxy sheet that is two
 * different pieces of art.
 */
export function mergeParsedLines(cards: ParsedCardLine[]): ParsedCardLine[] {
  const out = new Map<string, ParsedCardLine>();
  for (const card of cards) {
    const key = [
      card.name.toLowerCase(),
      card.setCode ?? '',
      card.collectorNumber ?? '',
      card.finish ?? '',
    ].join('|');
    const seen = out.get(key);
    if (seen) {
      seen.quantity += card.quantity;
      if (seen.alternate && card.alternate) {
        seen.alternate = { ...seen.alternate, quantity: seen.alternate.quantity + card.alternate.quantity };
      }
    } else {
      out.set(key, { ...card, alternate: card.alternate ? { ...card.alternate } : undefined });
    }
  }
  return [...out.values()];
}
