import { useEffect, useMemo, useState } from 'react';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { supabase } from '@/integrations/supabase/client';
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

let rowsPromise: Promise<Map<string, ImportedCard>> | null = null;

function loadPastedCards(): Promise<Map<string, ImportedCard>> {
  rowsPromise ??= (async () => {
    const { data } = await supabase
      .from('cards')
      .select(
        'id,name,mana_cost,cmc,type_line,colors,image_uris,faces,layout,prices,set_code,collector_number'
      )
      .in(
        'name',
        PARSED.map(line => line.name)
      )
      .limit(PARSED.length * 8);

    const out = new Map<string, ImportedCard>();
    for (const row of (data ?? []) as unknown as ImportedCard[]) {
      const key = row.name.trim().toLowerCase();
      const existing = out.get(key);
      /* First printing WITH art wins, so the wall never draws a blank frame. */
      if (!existing || (!existing.image_uris?.normal && row.image_uris?.normal)) out.set(key, row);
    }
    return out;
  })();

  return rowsPromise;
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
  const [rows, setRows] = useState<Map<string, ImportedCard> | null>(null);
  const [format, setFormat] = useState(EXPORTS[0].label);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    loadPastedCards()
      .then(map => {
        if (alive) setRows(map);
      })
      .catch(() => {
        /* No rows means no cards drawn — never a placeholder. */
      });
    return () => {
      alive = false;
    };
  }, [near]);

  const resolved = useMemo<Resolved[]>(() => {
    if (!rows) return [];
    return PARSED.map(line => {
      const card = rows.get(line.name.trim().toLowerCase());
      return card ? { ...line, card } : null;
    }).filter((entry): entry is Resolved => entry !== null);
  }, [rows]);

  const copies = resolved.reduce((sum, entry) => sum + entry.quantity, 0);
  const emit = EXPORTS.find(e => e.label === format) ?? EXPORTS[0];
  const loading = rows === null;

  return (
    <Section tint>
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        title="Your data goes in — and comes back out"
        lead="Paste a list from anywhere, and export it anywhere. No lock-in, because a collection you cannot get out of a tool is not really yours. Here is the whole round trip, run on this page."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ------------------------------------------------------ the paste */}
        <div className="min-w-0 lg:col-span-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            You paste this
          </p>
          <div className="mt-4 rounded-2xl bg-card p-4 shadow-xl shadow-black/30 sm:p-5">
            <Mono text={PASTE} className="max-h-[26rem]" />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Comments, an Arena <span className="font-mono text-foreground/80">Deck</span> header, a
            set code with a collector number, a leading{' '}
            <span className="font-mono text-foreground/80">2x</span> and a trailing{' '}
            <span className="font-mono text-foreground/80">x1</span> all sit in that block — every
            line shape the importer accepts:
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
              Every card above is a row out of the catalogue, matched on the name the parser pulled
              off the line — printing, mana value, colours and price come with it, which is what
              makes the export below real rather than a copy of what you pasted.
            </p>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------ and back out */}
      <div className="mt-16">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            And writes it back out as
          </p>
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map(entry => {
              const on = entry.label === format;
              return (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => setFormat(entry.label)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-xs transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    on
                      ? 'bg-foreground font-medium text-background'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-card p-4 shadow-xl shadow-black/30 sm:p-5">
          <Mono
            text={loading ? '' : emit.render(resolved)}
            className="max-h-[22rem] min-h-[12rem]"
          />
        </div>
      </div>
    </Section>
  );
}

export default HomePortability;
