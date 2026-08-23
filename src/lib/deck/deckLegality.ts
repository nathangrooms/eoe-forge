/* Relative imports carry their `.ts` extension so this module runs unchanged
   under `node --test --experimental-strip-types`, the runner the repo already
   uses. Same convention as `deckCardFilters.ts`, and the same reason: the rules
   about what is legal are exactly the part worth testing without a browser. */
import { ALL_FORMATS } from '../magic/formats.ts';
import type { DeckCardRow } from './deckCards.ts';

/**
 * Is this deck legal, and where else could you play it?
 *
 * ## Why this is a module rather than a panel
 *
 * The Legality tab was the only one of the eight importing nothing from
 * `@/components/listing`, and the reason turned out to be upstream of the
 * styling: there was no answer to compute. `DeckLegalityChecker` returns a list
 * of sentences — `"Sol Ring appears 2 times (violates singleton rule)"` — with
 * the card name interpolated into English. A panel handed sentences can only
 * print sentences, which is why the tab was a wall of `Alert`s while every
 * other tab drew cards.
 *
 * So the verdict is computed as data. Every fault names the row it is about,
 * which means the panel can draw the card, and the card can carry the Remove
 * and Replace controls the panel beside it already had. `useDeckEditor` has
 * exposed `deleteAll` and `setQuantity` the whole time.
 *
 * ## Every format, not the one you picked
 *
 * `cards.legalities` is a JSON blob carrying every format Scryfall tracks, and
 * the tab printed one of them. Moxfield's headline legality feature is telling
 * you which formats a list is legal in; the data for it has been arriving with
 * every deck load since `CARD_COLUMNS` was written. {@link deckFormatVerdicts}
 * is that table.
 *
 * ## What is measured and what is not, stated rather than implied
 *
 * Per-card legality is read straight off the printing, so it is exact for every
 * format the card carries a key for. Deck-construction rules — size, the copy
 * limit, whether a commander is required — come from `ALL_FORMATS`, which
 * covers eleven formats. A format Scryfall reports and `ALL_FORMATS` does not
 * model (`predh`, `oldschool`, `duel` and the rest) gets its card legality
 * answered and its construction rules reported as unknown, rather than being
 * quietly assumed to be four-of 60-card Constructed. `FormatVerdict.rulesKnown`
 * is that distinction and the panel must print it.
 */

export type LegalityFault =
  /** The printing says `banned` in this format. */
  | 'banned'
  /** The printing says `not_legal`: never printed into this format. */
  | 'not-legal'
  /** Restricted to one copy, and the deck runs more. */
  | 'restricted'
  /** More copies than the format's limit allows. */
  | 'copy-limit'
  /** Outside the commander's colour identity. */
  | 'colour-identity'
  /** The printing has not synced, so nothing can be said about it. */
  | 'no-data';

export const FAULT_LABEL: Record<LegalityFault, string> = {
  banned: 'Banned',
  'not-legal': 'Not in the format',
  restricted: 'Restricted',
  'copy-limit': 'Over the copy limit',
  'colour-identity': 'Outside colour identity',
  'no-data': 'No card data',
};

/** One card, one reason, and the row so the panel can act on it. */
export interface CardFault {
  row: DeckCardRow;
  fault: LegalityFault;
  /** One line, in the words a player would use. Never a whole sentence. */
  detail: string;
}

/** A rule about the deck as a whole rather than about one card. */
export interface DeckRule {
  id: string;
  ok: boolean;
  /** What the rule is, stated as the rule rather than as a complaint. */
  label: string;
  /** Where this deck stands against it. */
  reading: string;
}

export interface FormatVerdict {
  format: string;
  label: string;
  legal: boolean;
  /** Copies of cards this format will not accept. */
  offendingCopies: number;
  /** Distinct rows at fault. */
  offendingRows: number;
  /**
   * False when `ALL_FORMATS` does not model this format's construction rules,
   * so the verdict covers card legality alone. Say so; do not assume.
   */
  rulesKnown: boolean;
  /** Deck-construction rules, when they are known. */
  rules: DeckRule[];
}

const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

function isBasic(name: string): boolean {
  return BASIC_LANDS.has(name.trim().toLowerCase());
}

function nameOf(row: DeckCardRow): string {
  return row.card?.name || row.card_name;
}

/**
 * Prettify a Scryfall format key.
 *
 * `ALL_FORMATS` names eleven of them and Scryfall reports twenty-three, so the
 * overrides below are for the keys whose prettified form would read wrong. Same
 * table as `CardLegalityGrid`, which is the other place in the product that
 * draws every format at once; the two are kept in step by hand and there is no
 * third.
 */
const LABEL_OVERRIDE: Record<string, string> = {
  paupercommander: 'Pauper EDH',
  standardbrawl: 'Standard Brawl',
  historicbrawl: 'Historic Brawl',
  oldschool: 'Old School',
  premodern: 'Premodern',
  predh: 'PreDH',
  duel: 'Duel Commander',
  penny: 'Penny Dreadful',
  future: 'Future Standard',
  oathbreaker: 'Oathbreaker',
};

export function formatKeyLabel(key: string): string {
  if (LABEL_OVERRIDE[key]) return LABEL_OVERRIDE[key];
  if (ALL_FORMATS[key]) return ALL_FORMATS[key].name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Curated first, so the answers a player is actually looking for are top left. */
const FORMAT_ORDER = [
  'commander',
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'brawl',
  'historic',
  'timeless',
  'alchemy',
  'explorer',
  'oathbreaker',
  'duel',
  'paupercommander',
  'predh',
  'premodern',
  'oldschool',
  'penny',
  'gladiator',
  'standardbrawl',
  'future',
];

/**
 * Every format key any card in this deck reports on.
 *
 * Taken from the cards rather than from a hard-coded list, so a format Scryfall
 * adds appears here the day the sync picks it up, and a deck of cards none of
 * which have synced reports nothing rather than reporting twenty-three unknowns.
 */
export function formatsInDeck(rows: readonly DeckCardRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.card?.legalities ?? {})) keys.add(key);
  }
  const rank = (k: string) => {
    const i = FORMAT_ORDER.indexOf(k);
    return i === -1 ? FORMAT_ORDER.length : i;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface LegalityInput {
  /** The mainboard. The commander is passed separately. */
  rows: readonly DeckCardRow[];
  /** The command zone, when the deck has one. */
  commander?: DeckCardRow | null;
}

/**
 * Copies of each distinct card name in the deck, commander included.
 *
 * By NAME rather than by row, because the copy limit is a rule about the card
 * and a deck can hold two rows pointing at two printings of one card. A
 * checker that counted rows would pass a deck running Sol Ring twice from two
 * sets, which is the illegal case a singleton check exists to catch.
 */
function copiesByName(input: LegalityInput): Map<string, number> {
  const counts = new Map<string, number>();
  const all = input.commander ? [...input.rows, input.commander] : [...input.rows];
  for (const row of all) {
    const key = nameOf(row).trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + Math.max(1, row.quantity));
  }
  return counts;
}

/**
 * Every card this format will not accept, and why.
 *
 * One fault per row: a card that is both banned and over the copy limit is one
 * card to take out, and listing it twice would make the count say two problems
 * where a player has one job. Banned outranks not-legal outranks restricted
 * outranks the copy limit outranks colour identity, which is the order in which
 * the reasons are unfixable — you cannot make a banned card legal by running
 * fewer of it.
 */
export function cardFaults(input: LegalityInput, format: string): CardFault[] {
  const key = format.toLowerCase();
  const spec = ALL_FORMATS[key];
  const counts = copiesByName(input);
  const commanderIdentity = input.commander?.card?.color_identity ?? null;
  const singleton = spec?.isSingleton ?? false;
  const limit = spec?.cardLimits.defaultLimit ?? Infinity;
  const exceptions = spec?.cardLimits.exceptions ?? {};

  const faults: CardFault[] = [];

  for (const row of input.rows) {
    const name = nameOf(row);
    const lower = name.trim().toLowerCase();
    const copies = counts.get(lower) ?? row.quantity;

    if (!row.card) {
      faults.push({
        row,
        fault: 'no-data',
        detail: 'This printing is not in the local card table, so nothing can be checked.',
      });
      continue;
    }

    const state = row.card.legalities?.[key];

    if (state === 'banned') {
      faults.push({ row, fault: 'banned', detail: `Banned in ${formatKeyLabel(key)}.` });
      continue;
    }
    if (state === 'not_legal') {
      faults.push({
        row,
        fault: 'not-legal',
        detail: `Never legal in ${formatKeyLabel(key)}.`,
      });
      continue;
    }
    if (state === 'restricted' && copies > 1) {
      faults.push({
        row,
        fault: 'restricted',
        detail: `Restricted to one copy, and this deck runs ${copies}.`,
      });
      continue;
    }

    /* Basic lands are exempt from every copy limit in every format that has
       one, which is why they are tested before the limit rather than given a
       limit of Infinity: `Wastes` is a basic land and is not in every format's
       exception table. */
    if (!isBasic(name)) {
      const allowed = exceptions[name] ?? (singleton ? 1 : limit);
      if (Number.isFinite(allowed) && copies > allowed) {
        faults.push({
          row,
          fault: 'copy-limit',
          detail:
            allowed === 1
              ? `This format is singleton and the deck runs ${copies}.`
              : `${copies} copies, and this format allows ${allowed}.`,
        });
        continue;
      }
    }

    /* Colour identity is a commander-format rule and only means anything when
       there is a commander to measure against. A deck with no commander yet is
       not breaking this rule; it has not chosen one. */
    if (singleton && spec?.commandZone?.required && commanderIdentity) {
      const allowed = new Set(commanderIdentity);
      const outside = (row.card.color_identity ?? []).filter(c => !allowed.has(c));
      if (outside.length > 0) {
        faults.push({
          row,
          fault: 'colour-identity',
          detail: `Uses ${outside.join('')}, which your commander does not.`,
        });
      }
    }
  }

  return faults;
}

/**
 * The deck-construction rules, each stated as the rule and then as a reading.
 *
 * Both halves matter. "This deck has 97 cards" is a complaint; "Exactly 100
 * cards, commander included · this deck has 97" is a rule and where you stand
 * against it, which is what a player checking a deck before a game actually
 * wants to see whether it passes or not.
 */
export function deckRules(input: LegalityInput, format: string): DeckRule[] {
  const key = format.toLowerCase();
  const spec = ALL_FORMATS[key];
  if (!spec) return [];

  const rules: DeckRule[] = [];
  const mainCopies = input.rows.reduce((sum, row) => sum + Math.max(1, row.quantity), 0);
  const withCommander = mainCopies + (input.commander ? 1 : 0);

  const { min, max, exactSize } = spec.deckSize;
  if (exactSize) {
    rules.push({
      id: 'size',
      ok: withCommander === exactSize,
      label: `Exactly ${exactSize} cards${spec.commandZone?.required ? ', commander included' : ''}`,
      reading: `this deck has ${withCommander}`,
    });
  } else {
    const ok = withCommander >= min && withCommander <= max;
    rules.push({
      id: 'size',
      ok,
      label: Number.isFinite(max) ? `${min} to ${max} cards` : `At least ${min} cards`,
      reading: `this deck has ${withCommander}`,
    });
  }

  if (spec.commandZone?.required) {
    rules.push({
      id: 'commander',
      ok: Boolean(input.commander),
      label: 'A commander in the command zone',
      reading: input.commander
        ? nameOf(input.commander)
        : 'this deck has not chosen one',
    });
  }

  const counts = copiesByName(input);
  const overLimit: string[] = [];
  const singleton = spec.isSingleton;
  const limit = spec.cardLimits.defaultLimit;
  for (const [lower, copies] of counts) {
    if (isBasic(lower)) continue;
    const allowed = singleton ? 1 : limit;
    if (Number.isFinite(allowed) && copies > allowed) overLimit.push(lower);
  }
  rules.push({
    id: 'copies',
    ok: overLimit.length === 0,
    label: singleton
      ? 'One copy of each card, basics excepted'
      : `At most ${limit} copies of each card, basics excepted`,
    reading:
      overLimit.length === 0
        ? 'every card is within the limit'
        : `${overLimit.length} card${overLimit.length === 1 ? '' : 's'} over it`,
  });

  return rules;
}

/**
 * Where this decklist could be played, one row per format.
 *
 * Sorted so the formats the deck IS legal in come first — the question this
 * table exists to answer is "where can I take this", and a reader scanning
 * twenty-three rows for a yes should not have to.
 */
export function deckFormatVerdicts(input: LegalityInput): FormatVerdict[] {
  const verdicts = formatsInDeck([
    ...input.rows,
    ...(input.commander ? [input.commander] : []),
  ]).map<FormatVerdict>(key => {
    const faults = cardFaults(input, key);
    /* The commander is a card the format has to accept too. It is not in
       `rows`, so it is checked here rather than being silently exempt: a deck
       whose commander is banned in Duel Commander is not legal in Duel
       Commander. */
    const commanderState = input.commander?.card?.legalities?.[key];
    const commanderFault = commanderState === 'banned' || commanderState === 'not_legal';

    const rules = deckRules(input, key);
    const rulesKnown = Boolean(ALL_FORMATS[key]);

    return {
      format: key,
      label: formatKeyLabel(key),
      legal: faults.length === 0 && !commanderFault && rules.every(r => r.ok),
      offendingCopies:
        faults.reduce((sum, f) => sum + Math.max(1, f.row.quantity), 0) +
        (commanderFault ? 1 : 0),
      offendingRows: faults.length + (commanderFault ? 1 : 0),
      rulesKnown,
      rules,
    };
  });

  return verdicts.sort((a, b) => {
    if (a.legal !== b.legal) return a.legal ? -1 : 1;
    return a.offendingRows - b.offendingRows;
  });
}
