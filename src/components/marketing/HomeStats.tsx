import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { ManaPip } from '@/components/ui/mana-cost';
import { appVisualCards, approxLabel, counts } from '@/lib/homepage/snapshot';
import { Section, SectionHeading } from '@/components/marketing/Section';

/**
 * Catalogue sections.
 *
 * Every figure is a COUNT against the card table, taken by
 * `scripts/homepage-snapshot.mjs` after the nightly sync. Nothing is typed in.
 * If the sync ever regresses, these numbers fall with it, which is the point:
 * the homepage should not be able to overstate the product.
 *
 * They are counted over `cards_unique`, not `cards`. `cards` holds every
 * printing — 97,140 rows over 33,037 distinct cards — so counting it under a
 * label that says "cards" overstates the catalogue roughly threefold. That is
 * what was happening: this section reported 97,140 cards, 11,283 legendary
 * creatures and 9,150 mythics, against real figures of 33,037, 3,540 and 2,110.
 * The rule is in src/lib/cards/source.ts; the counts now follow it.
 *
 * `HomeFormats` used to live here — six tiles of legal-card counts. It was
 * replaced by `HomeFormatPicker`, which demonstrates legality with real cards
 * instead of counting it. See src/components/marketing/HomeFormatPicker.tsx.
 */

/* ------------------------------------------------------ colour identity pool */

const COLORS: { c: string; name: string; blurb: string }[] = [
  { c: 'W', name: 'White', blurb: 'Order, protection, the team' },
  { c: 'U', name: 'Blue', blurb: 'Knowledge, control, the long game' },
  { c: 'B', name: 'Black', blurb: 'Ambition, sacrifice, any cost' },
  { c: 'R', name: 'Red', blurb: 'Impulse, damage, speed' },
  { c: 'G', name: 'Green', blurb: 'Growth, size, mana' },
];

export function HomeColors() {
  /* Five counts that used to be five concurrent count queries on mount. */
  const byColor: Record<string, number> | null = (() => {
    const entries = COLORS.map(({ c }) => [c, counts.colorIdentity(c)] as const);
    return entries.every(([, n]) => n !== null)
      ? (Object.fromEntries(entries) as Record<string, number>)
      : null;
  })();

  const max = byColor ? Math.max(...Object.values(byColor)) : 1;

  return (
    <Section tint>
      <SectionHeading
        title="Colour identity, counted properly"
        lead="Read from each card's identity rather than its mana cost, so hybrid, phyrexian and rules-text pips count the way Commander counts them."
      />

      <div className="mt-14 space-y-3">
        {COLORS.map(({ c, name, blurb }) => {
          const n = byColor?.[c] ?? 0;
          return (
            <div key={c} className="flex items-center gap-4">
              <ManaPip symbol={c} size="lg" />
              <div className="w-24 shrink-0">
                <p className="text-sm font-medium">{name}</p>
              </div>
              <div className="relative h-8 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-foreground/85 transition-all duration-700"
                  style={{ width: byColor ? `${(n / max) * 100}%` : '0%' }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {byColor ? approxLabel(n) : '–'}
              </span>
              <span className="hidden w-56 shrink-0 text-xs text-muted-foreground lg:block">
                {blurb}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------- catalogue at a glance */

export function HomeCatalogue() {
  /*
   * These were three exact counts fired on mount, and the first one was the
   * bug. `count(*)` over `cards` measures 7,586 ms (EXPLAIN ANALYZE,
   * 2026-08-19) and the `anon` role every visitor holds carries
   * statement_timeout=3s, so it could not finish. PostgREST returns null for a
   * count that failed, the tile read `total.count ?? 0`, and the homepage told
   * visitors there were ZERO cards you can search and ZERO legendary creatures
   * while cheerfully reporting the mythic figure beside them.
   *
   * Now they are read from the nightly file, and each one is still
   * independently nullable: the tile draws a dash for a number it does not
   * have. Null, never zero. That distinction is the whole section.
   */
  const tiles = [
    {
      label: 'Cards in the catalogue',
      value: counts.cards(),
      /* Not "cards you can search". Search on /cards is a Scryfall query, so
         that label made a claim about somebody else's catalogue and then put
         our row count under it. This says what the number is. */
      sub: 'one row per card, updated from Scryfall every night',
    },
    {
      label: 'Legendary creatures',
      value: counts.legendaryCreatures(),
      sub: 'every one of them a legal commander',
    },
    {
      label: 'Mythic rares',
      value: counts.mythics(),
      sub: 'with full art and current prices',
    },
  ];

  return (
    <Section tint size="compact">
      <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
        {tiles.map(t => {
          /* Rounded down, with a "+". The count was exact last night and the
             catalogue has grown since, so the unit digit is a precision this
             page has not got. See `approx` in src/lib/homepage/snapshot.ts. */
          const shown = approxLabel(t.value);
          return (
            <div key={t.label} className="text-center">
              <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
                {shown ?? '–'}
              </p>
              <p className="mt-2 font-medium">{t.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.sub}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------- deck builder preview */

interface PreviewCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  image_uris: Record<string, string> | null;
  prices: Record<string, string> | null;
}

const GROUPS = [
  { label: 'Commander', match: (c: PreviewCard) => /Legendary Creature/i.test(c.type_line) },
  { label: 'Creatures', match: (c: PreviewCard) => /Creature/i.test(c.type_line) },
  { label: 'Instants & Sorceries', match: (c: PreviewCard) => /Instant|Sorcery/i.test(c.type_line) },
  { label: 'Artifacts & Enchantments', match: (c: PreviewCard) => /Artifact|Enchantment/i.test(c.type_line) },
  { label: 'Lands', match: (c: PreviewCard) => /Land/i.test(c.type_line) },
];

export function HomeBuilderPreview() {
  /* The same pool `HomeAppVisual` draws from: commander-legal mythics and rares
     with art, picked once a night. This section is not currently on the page
     (see the note at the bottom of src/pages/Homepage.tsx) but it is still
     exported, so it reads the file rather than keeping a live query alive for a
     section nobody is looking at. */
  const cards = appVisualCards() as unknown as PreviewCard[] | null;

  const list = (cards ?? []).slice(0, 40);
  const total = list.reduce((sum, c) => sum + Number(c.prices?.usd ?? 0), 0);

  /* Assign each card to the FIRST matching group so nothing is double-counted.
     A Commander deck has exactly ONE commander, so only the first legendary
     creature goes in that slot — the rest are ordinary creatures. Showing
     "Commander 16" would read as broken to any EDH player. */
  const grouped = GROUPS.map(g => ({ label: g.label, cards: [] as PreviewCard[], match: g.match }));
  const commanderSlot = grouped[0];
  for (const c of list) {
    if (commanderSlot.match(c) && commanderSlot.cards.length === 0) {
      commanderSlot.cards.push(c);
      continue;
    }
    const g = grouped.slice(1).find(x => x.match(c));
    if (g) g.cards.push(c);
  }

  return (
    <Section tint>
      <SectionHeading
        title="A builder that groups itself"
        lead="Cards sort into type categories as you add them, with a running total of what the list costs to finish."
      />

      <div className="mt-14 overflow-hidden rounded-xl bg-background shadow-2xl shadow-black/40">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">Untitled Commander deck</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Commander
          </span>
          <span className="ml-auto text-sm tabular-nums text-muted-foreground">
            {cards ? `${grouped.reduce((n, g) => n + g.cards.length, 0)} cards · $${total.toFixed(2)}` : '–'}
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {grouped.map(g => (
            <div key={g.label} className="rounded-lg bg-muted/25 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {g.cards.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {cards === null
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <li key={i}><Skeleton className="h-4 w-full" /></li>
                    ))
                  : g.cards.slice(0, 6).map(c => (
                      <li key={c.id} className="flex items-center gap-2 text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                          {c.cmc}
                        </span>
                      </li>
                    ))}
                {cards !== null && g.cards.length === 0 && (
                  <li className="text-xs italic text-muted-foreground">Nothing here yet</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg">
          <Link to="/deck-builder">
            Open the builder
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
