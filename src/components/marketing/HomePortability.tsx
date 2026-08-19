import { useMemo, useState } from 'react';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { portabilityCards } from '@/lib/homepage/snapshot';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { useNearViewport } from '@/components/marketing/sectionData';
import { cn } from '@/lib/utils';

/**
 * Import and export.
 *
 * The old version was two boxes of ticks — twelve format names in two columns,
 * no cards, no text, nothing that could be checked. It asserted portability on a
 * page whose whole argument is that it shows you the thing rather than claiming
 * it.
 *
 * So this runs the round trip on screen: a pasted list on the left, the cards
 * DeckMatrix resolved out of it in the middle, and the same cards written back
 * out in every export format underneath.
 *
 * Honesty model:
 *   - the four line shapes in the paste are the four patterns `parseDeckList`
 *     accepts (src/components/deck-builder/DeckImportExport.tsx), plus its
 *     comment and section-header handling. The parser below implements those
 *     patterns rather than importing them, because that module is a page-sized
 *     component; it is a transcription of the grammar, not of the result.
 *   - every card on the right is a real `cards` row, matched by the name the
 *     parser pulled out of the line, and drawn WHOLE at 5:7. A line that does
 *     not resolve is reported as unresolved rather than quietly dropped.
 *   - "12 of 12 lines" and the card total are counted from the parse, live.
 *   - the six export panels are generated from those same rows by the same
 *     shapes the app writes: Arena / MTGO / plain text / CSV come from
 *     `generateExport` in DeckImportExport, the Moxfield CSV header from
 *     `generateMoxfield` in CollectionExport, and the JSON shape from
 *     `generateJSON` in EnhancedDeckExport. Set codes, collector numbers, mana
 *     values, colours and prices in the output are the real column values.
 */

/* -------------------------------------------------------------------- input */

/**
 * The pasted list.
 *
 * Deliberately messy, because a real paste is: an Arena comment line, a `Deck`
 * header, a set code and collector number, a leading `2x`, and a trailing `x1`.
 * Every one of those is a shape `parseDeckList` handles, and the panel on the
 * right is the proof.
 */
const PASTE = `// exported from MTG Arena
Deck
4 Lightning Bolt (CLU) 141
1 Sol Ring
2x Arcane Signet
Swords to Plowshares x1
1 Cyclonic Rift
1 Rhystic Study
1 Smothering Tithe
1 Demonic Tutor
4 Counterspell
1 Beast Within
1 Craterhoof Behemoth
1 Command Tower`;

interface ParsedLine {
  quantity: number;
  name: string;
  raw: string;
}

/**
 * `parseDeckList`'s grammar, line for line.
 *
 * Patterns, in the order the importer tries them:
 *   1. `^(\d+)x?\s+(.+?)(?:\s+\([^)]+\))?(?:\s+\d+)?$`  →  "4 Name", "4x Name"
 *   2. `^(.+?)\s+x?(\d+)$`                              →  "Name x4"
 *   3. `^(.+)$`                                          →  bare name, quantity 1
 * followed by the same set-code/collector-number strip.
 */
function parseDeckList(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    const lower = line.toLowerCase();
    if (lower === 'deck' || lower.includes('sideboard') || lower.includes('commander')) continue;

    const patterns = [
      /^(\d+)x?\s+(.+?)(?:\s+\([^)]+\))?(?:\s+\d+)?$/i,
      /^(.+?)\s+x?(\d+)$/i,
      /^(.+)$/i,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const match = line.match(patterns[i]);
      if (!match) continue;

      let quantity: number;
      let name: string;
      if (i === 1) {
        name = match[1].trim();
        quantity = parseInt(match[2], 10);
      } else if (i === 2) {
        name = match[1].trim();
        quantity = 1;
      } else {
        quantity = parseInt(match[1], 10);
        name = match[2].trim();
      }

      if (!Number.isFinite(quantity) || quantity < 1 || !name) break;

      /* The importer's own clean-up: drop a trailing "(SET) 117". */
      name = name.replace(/\s*\([^)]+\)\s*\d*$/, '').trim();
      out.push({ quantity, name, raw: line });
      break;
    }
  }

  return out;
}

const PARSED = parseDeckList(PASTE);

/* ------------------------------------------------------------------ lookup */

interface ImportedCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string;
  colors: string[] | null;
  image_uris: Record<string, string> | null;
  faces: unknown;
  layout: string | null;
  prices: Record<string, string> | null;
  set_code: string;
  collector_number: string | null;
}

/**
 * The pasted list, resolved.
 *
 * This used to be twelve parallel queries, one per name, and the workaround was
 * itself worth reading: a single `.in()` over all twelve names against `cards`
 * asked for 96 rows, and ten of these twelve names are staples with well over a
 * hundred printings each, so PostgREST spent the whole limit on the first two
 * or three names. Rendered live, this section reported "2 of 12 lines matched"
 * and drew two cards, on a section whose entire argument is that a pasted list
 * comes back out intact. The count was honest; what it was counting was a
 * broken query.
 *
 * `scripts/homepage-snapshot.mjs` reads `cards_unique` instead, which holds one
 * row per card, so twelve names is twelve rows and there is nothing to starve.
 * That is also the right relation by the rule in src/lib/cards/source.ts: a
 * decklist line names a card, not a printing.
 *
 * A line that does not resolve is still reported as unresolved rather than
 * quietly dropped, which is what happens if somebody edits PASTE above without
 * adding the name to PASTE_NAMES in the generator.
 */
function pastedCards(): Map<string, ImportedCard> | null {
  const rows = portabilityCards();
  return rows ? new Map(Object.entries(rows) as [string, ImportedCard][]) : null;
}

/* ------------------------------------------------------------------ output */

interface Resolved extends ParsedLine {
  card: ImportedCard;
}

const category = (card: ImportedCard) =>
  card.type_line.split('—')[0].trim().split(' ').slice(-1)[0].toLowerCase() || 'main';

function toArena(rows: Resolved[]): string {
  return ['Deck', ...rows.map(r => `${r.quantity} ${r.card.name}`)].join('\n');
}

function toMtgo(rows: Resolved[]): string {
  return rows.map(r => `${r.quantity} ${r.card.name}`).join('\n');
}

function toPlainText(rows: Resolved[]): string {
  const groups = new Map<string, Resolved[]>();
  for (const row of rows) {
    const type = row.card.type_line.split('—')[0].trim() || 'Other';
    const bucket = groups.get(type);
    if (bucket) bucket.push(row);
    else groups.set(type, [row]);
  }
  return [...groups.entries()]
    .map(([type, list]) =>
      [`${type}:`, ...list.map(r => `${r.quantity}x ${r.card.name}`)].join('\n')
    )
    .join('\n\n');
}

function toCsv(rows: Resolved[]): string {
  return [
    'Quantity,Name,Category,CMC,Colors',
    ...rows.map(
      r =>
        `${r.quantity},"${r.card.name}","${category(r.card)}",${r.card.cmc ?? 0},"${(
          r.card.colors ?? []
        ).join('')}"`
    ),
  ].join('\n');
}

function toMoxfieldCsv(rows: Resolved[]): string {
  const header =
    'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price';
  return [
    header,
    ...rows.map(r =>
      [
        r.quantity,
        0,
        `"${r.card.name}"`,
        r.card.set_code.toUpperCase(),
        'Near Mint',
        'English',
        '',
        '',
        '',
        r.card.collector_number ?? '',
        '',
        '',
        r.card.prices?.usd ?? '',
      ].join(',')
    ),
  ].join('\n');
}

function toJson(rows: Resolved[]): string {
  return JSON.stringify(
    {
      name: 'Pasted list',
      format: 'commander',
      mainboard: rows.map(r => ({
        name: r.card.name,
        quantity: r.quantity,
        id: r.card.id,
        type: r.card.type_line,
        cmc: r.card.cmc ?? 0,
      })),
      sideboard: [],
    },
    null,
    2
  );
}

const EXPORTS: { label: string; render: (rows: Resolved[]) => string }[] = [
  { label: 'MTG Arena', render: toArena },
  { label: 'MTGO', render: toMtgo },
  { label: 'Moxfield CSV', render: toMoxfieldCsv },
  { label: 'Plain text', render: toPlainText },
  { label: 'CSV', render: toCsv },
  { label: 'JSON', render: toJson },
];

/** The four line shapes the importer's patterns accept, with a live example. */
const SHAPES = ['4 Card Name', '4x Card Name', 'Card Name x4', '1 Card Name (SET) 117'];

/* ------------------------------------------------------------------ pieces */

function Mono({ text, className }: { text: string; className?: string }) {
  return (
    <pre
      className={cn(
        'overflow-auto whitespace-pre rounded-xl bg-background/70 p-4 font-mono text-[12px] leading-relaxed text-muted-foreground shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] sm:text-[13px]',
        className
      )}
    >
      {text}
    </pre>
  );
}

/* ------------------------------------------------------------------ section */

export function HomePortability() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  /* Which shape of the same list is on screen: the pasted text, or one of
     the formats it can be written back out as. */
  const [shape, setShape] = useState('You paste this');

  /* The viewport gate stays, and still earns its keep: there is no request to
     defer any more, but it keeps twelve card images out of the initial load. */
  const rows = near ? pastedCards() : null;

  const resolved = useMemo<Resolved[]>(() => {
    if (!rows) return [];
    return PARSED.map(line => {
      const card = rows.get(line.name.trim().toLowerCase());
      return card ? { ...line, card } : null;
    }).filter((entry): entry is Resolved => entry !== null);
  }, [rows]);

  const copies = resolved.reduce((sum, entry) => sum + entry.quantity, 0);
  const loading = rows === null;

  return (
    <Section tint>
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        title="Bring your decks in, take them out again"
        lead="Paste in a list from anywhere, and get it back out in whatever shape you need. Nothing you put in here is stuck here. This is it working, on this page."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ------------------------------------------------------ the paste */}
        {/* IN AND OUT SHARE ONE PANEL.

            The export block used to sit in its own band underneath the whole
            section, which meant the page showed the same decklist twice in two
            places with a wall of cards between them. The owner: "you paste this
            can have exports in tabs next to it, takes up too much space having
            that below".

            They are the same conversation. What you pasted and what comes back
            out are one document in two shapes, so they are one panel with tabs
            and the cards in the middle show what it became. */}
        <div className="min-w-0 lg:col-span-5">
          <div className="flex flex-wrap gap-1.5">
            {['You paste this', ...EXPORTS.map(e => e.label)].map(tab => {
              const on = tab === shape;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setShape(tab)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    on
                      ? 'bg-foreground font-medium text-background'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl bg-card p-4 shadow-xl shadow-black/30 sm:p-5">
            <Mono
              text={
                shape === 'You paste this'
                  ? PASTE
                  : loading
                    ? ''
                    : (EXPORTS.find(e => e.label === shape) ?? EXPORTS[0]).render(resolved)
              }
              className="max-h-[26rem] min-h-[16rem]"
            />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Comments, an Arena <span className="font-mono text-foreground/80">Deck</span> header, a
            set code with a collector number, a leading{' '}
            <span className="font-mono text-foreground/80">2x</span> and a trailing{' '}
            <span className="font-mono text-foreground/80">x1</span> are all in that block, and every
            one of them works:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SHAPES.map(shape => (
              <span
                key={shape}
                className="rounded-full bg-muted/50 px-3 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {shape}
              </span>
            ))}
          </div>
        </div>

        {/* -------------------------------------------------- what it became */}
        <div className="min-w-0 lg:col-span-7">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              DeckMatrix reads this
            </p>
            {!loading && (
              <span className="text-[11px] tabular-nums text-muted-foreground/70">
                {resolved.length} of {PARSED.length} lines matched · {copies} cards
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {loading
              ? Array.from({ length: PARSED.length }).map((_, i) => (
                  <CardImageSkeleton key={i} size="sm" fill />
                ))
              : resolved.map(entry => (
                  <figure key={entry.card.id} className="group relative min-w-0">
                    <CardImage
                      card={entry.card}
                      size="md"
                      fill
                      hideFlip
                      className="transition-transform duration-500 group-hover:-translate-y-1"
                    >
                      {entry.quantity > 1 && (
                        /* Bottom-left, not top-left: the top strip of a Magic
                           card is its name and mana cost, and a quantity pill
                           parked over the title is the one place on a card you
                           must never cover. */
                        <span className="absolute bottom-1.5 left-1.5 z-10 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground shadow-md shadow-black/40 backdrop-blur">
                          ×{entry.quantity}
                        </span>
                      )}
                    </CardImage>
                    <figcaption className="mt-2 truncate text-[11px] leading-snug text-muted-foreground">
                      {entry.card.name}
                    </figcaption>
                  </figure>
                ))}
          </div>

          {!loading && (
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              Each card above was looked up by name in the real card list, so its printing, mana cost,
              colours and price all came with it. That is why the file below is a real deck and not
              just a copy of what you pasted.
            </p>
          )}
        </div>
      </div>

    </Section>
  );
}

export default HomePortability;
