/**
 * Turning the list into something a shop will actually accept.
 *
 * A malformed export is the feature broken: the player copies it, pastes it,
 * and the site tells them nothing matched. So each format below was checked
 * against the shop's own documentation rather than guessed, and the checks are
 * recorded here so the next person does not have to redo them.
 *
 * ── Cardmarket wants ────────────────────────────────────────────────────────
 * CONFIRMED against Cardmarket's own help page, "How to Add a Magic Decklist to
 * Wants" (help.cardmarket.com/en/how-to-add-a-mtg-decklist-to-wants), read on
 * 19 Aug 2026. It documents these lines:
 *
 *     4 Dark Ritual
 *     4x High Tide (V.1) (Fallen Empires)
 *     Tarmogoyf
 *     2 Dark Confidant (Modern Masters)
 *
 * So: one card per line, quantity optional and leading, `x` after the quantity
 * allowed, and the expansion in parentheses by its FULL NAME rather than its
 * code. This is the only one of the three whose set syntax is documented, which
 * is why it is the only one offered with the set included.
 *
 * ── TCGplayer Mass Entry ────────────────────────────────────────────────────
 * TCGplayer's help article "Getting Started With Mass Entry" documents the line
 * as quantity, card name, set code in brackets, then the collector number, e.g.
 * `1 Lightning Bolt [SLD] 84`, and states that dropping the number or dropping
 * the set both still work. Their help site returns 403 to an automated fetch,
 * so that wording came through the search index rather than a direct read of
 * the page, and it is the reason we emit the plainest form.
 *
 * We deliberately emit only `quantity name`. Our set codes are Scryfall's, and
 * Scryfall's namespace is not TCGplayer's. Most modern codes agree and some do
 * not, and a code that does not agree makes the line silently fail to match,
 * which is worse than making the player pick the printing in the basket.
 *
 * ── Card Kingdom ────────────────────────────────────────────────────────────
 * Card Kingdom's Deck Builder accepts three formats. Their own blog post
 * describing the tool states the rule in words: "if you are looking to purchase
 * more than 1 of any card, make sure to include the number you want to purchase
 * ahead of the card name", and that repeated names are added up for you. The
 * three example formats are published as an image rather than text, so only the
 * quantity-then-name form is confirmed, and that is what we emit.
 *
 * ── Plain text ──────────────────────────────────────────────────────────────
 * The fallback. Same shape, no vendor to satisfy, and it is what every other
 * deck site in the hobby reads.
 */

export type ExportFormat = 'tcgplayer' | 'cardkingdom' | 'cardmarket' | 'text';

export interface ExportLine {
  name: string;
  quantity: number;
  /** Full expansion name, e.g. "Modern Masters". Only Cardmarket can use it. */
  setName?: string | null;
}

export interface ExportTarget {
  id: ExportFormat;
  /** What a player calls the shop. */
  name: string;
  /** One line saying what to do with the text. No jargon. */
  instructions: string;
  /** Where to paste it. */
  url: string;
  /** Whether `includeSet` does anything for this target. */
  supportsSet: boolean;
  /** How the syntax was checked, for the report and for the next reader. */
  confirmedBy: string;
}

export const EXPORT_TARGETS: ExportTarget[] = [
  {
    id: 'tcgplayer',
    name: 'TCGplayer',
    instructions: 'Paste into Mass Entry, then pick the printing and seller you want.',
    url: 'https://www.tcgplayer.com/massentry',
    supportsSet: false,
    confirmedBy: 'TCGplayer help, Getting Started With Mass Entry',
  },
  {
    id: 'cardkingdom',
    name: 'Card Kingdom',
    instructions: 'Paste into the Deck Builder search box on the left.',
    url: 'https://www.cardkingdom.com/builder',
    supportsSet: false,
    confirmedBy: 'Card Kingdom blog, Deck Builder: Craft Your Next Deck',
  },
  {
    id: 'cardmarket',
    name: 'Cardmarket',
    instructions: 'Paste into your Wants list. This is the only one that can name the set.',
    url: 'https://www.cardmarket.com/en/Magic/Wants',
    supportsSet: true,
    confirmedBy: 'Cardmarket help, How to Add a Magic Decklist to Wants',
  },
  {
    id: 'text',
    name: 'Plain list',
    instructions: 'Works anywhere else that reads a decklist.',
    url: '',
    supportsSet: false,
    confirmedBy: 'No shop to satisfy',
  },
];

/**
 * Merge lines by card name before writing.
 *
 * Every one of these shops matches on the name, so two rows for two printings
 * of Sol Ring are two lines asking for the same product. Cardmarket adds them
 * up itself and Card Kingdom says it does too, but relying on that would leave
 * the player looking at a list that does not say what they are buying.
 */
export function mergeLines(lines: ExportLine[]): ExportLine[] {
  const out = new Map<string, ExportLine>();
  for (const line of lines) {
    const name = (line.name ?? '').trim();
    const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
    if (!name || quantity < 1) continue;
    const key = name.toLowerCase();
    const existing = out.get(key);
    if (existing) {
      existing.quantity += quantity;
      // Two printings in one line cannot both be named, so the set is dropped
      // rather than one of them being picked and presented as the answer.
      if (existing.setName !== line.setName) existing.setName = null;
    } else {
      out.set(key, { name, quantity, setName: line.setName ?? null });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ExportOptions {
  /** Cardmarket only. Adds the expansion name in parentheses. */
  includeSet?: boolean;
}

export function formatExport(
  lines: ExportLine[],
  format: ExportFormat,
  options: ExportOptions = {}
): string {
  const merged = mergeLines(lines);

  if (format === 'cardmarket' && options.includeSet) {
    return merged
      .map(line => (line.setName ? `${line.quantity} ${line.name} (${line.setName})` : `${line.quantity} ${line.name}`))
      .join('\n');
  }

  // Every remaining target takes the same line, which is the point: the shape
  // all three shops document is `quantity name`.
  return merged.map(line => `${line.quantity} ${line.name}`).join('\n');
}

/** File name for the download, dated so two exports do not overwrite. */
export function exportFileName(format: ExportFormat, today = new Date()): string {
  const date = today.toISOString().slice(0, 10);
  return `deckmatrix-shopping-${format}-${date}.txt`;
}
