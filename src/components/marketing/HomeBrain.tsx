import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { supabase } from '@/integrations/supabase/client';
import { preconIndexEntry } from '@/data/precon-index';
import { commanderCard, fetchPreconDeck, type PreconCard } from '@/lib/precons/precon-api';
import { scryfallImageUrl } from '@/lib/deck/deckCards';
import { cn } from '@/lib/utils';

/**
 * MTG Brain.
 *
 * Owner: *"ask about deck — could show a deck."* The old version was a chat
 * bubble asking about a deck that appeared nowhere, and an answer that invented
 * "eleven pieces of interaction against a recommended fifteen" about a deck that
 * did not exist.
 *
 * So there is now a real, complete, published decklist on screen — Draconic
 * Domination, the Commander 2017 precon, all 100 cards — loaded through the same
 * `fetch-precons` path the Precons page uses, and every card resolved against
 * the `cards` table. Every figure in the answer is arithmetic over those 100
 * cards, computed in the browser while you read it. Nothing is asserted that the
 * list on the left does not prove.
 *
 * Cost control: the decklist is ~50 kB gzipped and the section sits well down
 * the page, so nothing is fetched until it is close to the viewport.
 */

/** A real, frozen, published product — not a deck this file made up. */
const PRECON_ID = 'Draconic Domination (Commander 2017 Precon Decklist)';

/** How many of the heaviest nonland cards get drawn under the deck header. */
const GRID_SIZE = 12;
/** How many of those the answer names. */
const NAMED = 3;

/**
 * The six one-tap prompts the assistant ships with when a deck is selected —
 * copied from `DECK_QUICK_ACTIONS` in `src/pages/Brain.tsx`, not invented for
 * this page.
 */
const QUICK_ACTIONS = [
  'Analyze deck',
  'Suggest upgrades',
  'Find combos',
  'Meta analysis',
  'What to cut',
  'Strategy guide',
];

/* ------------------------------------------------------------------ loading */

function useNearViewport<T extends HTMLElement>(rootMargin = '600px') {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, rootMargin]);

  return [ref, near] as const;
}

/* -------------------------------------------------------------- composition */

interface DeckEntry extends PreconCard {
  typeLine: string;
  mv: number;
  manaCost: string | null;
}

interface DeckStats {
  total: number;
  unique: number;
  lands: number;
  nonland: number;
  creatures: number;
  dragons: number;
  artifacts: number;
  enchantments: number;
  instants: number;
  sorceries: number;
  avgMv: number;
  /** Nonland cards at mana value five or more. */
  heavy: number;
  /** Nonland counts by mana value, index 7 meaning "seven or more". */
  curve: number[];
  /** Heaviest nonland cards, commander excluded, heaviest first. */
  top: DeckEntry[];
}

const isLand = (e: DeckEntry) => e.typeLine.includes('land');
const isCreature = (e: DeckEntry) => e.typeLine.includes('creature');

function composeStats(entries: DeckEntry[]): DeckStats {
  const sum = (f: (e: DeckEntry) => boolean) =>
    entries.filter(f).reduce((s, e) => s + e.quantity, 0);

  const nonland = sum(e => !isLand(e));
  const mvTotal = entries
    .filter(e => !isLand(e))
    .reduce((s, e) => s + e.quantity * e.mv, 0);

  const curve = new Array<number>(8).fill(0);
  for (const e of entries) {
    if (isLand(e)) continue;
    curve[Math.min(7, Math.floor(e.mv))] += e.quantity;
  }

  return {
    total: entries.reduce((s, e) => s + e.quantity, 0),
    unique: entries.length,
    lands: sum(isLand),
    nonland,
    creatures: sum(e => !isLand(e) && isCreature(e)),
    dragons: sum(e => e.typeLine.includes('dragon')),
    artifacts: sum(e => !isLand(e) && !isCreature(e) && e.typeLine.includes('artifact')),
    enchantments: sum(
      e =>
        !isLand(e) &&
        !isCreature(e) &&
        !e.typeLine.includes('artifact') &&
        e.typeLine.includes('enchantment')
    ),
    instants: sum(e => !isLand(e) && e.typeLine.includes('instant')),
    sorceries: sum(e => !isLand(e) && e.typeLine.includes('sorcery')),
    avgMv: nonland > 0 ? mvTotal / nonland : 0,
    heavy: sum(e => !isLand(e) && e.mv >= 5),
    curve,
    top: entries
      .filter(e => !isLand(e) && !e.is_commander)
      .sort((a, b) => b.mv - a.mv || a.card_name.localeCompare(b.card_name))
      .slice(0, GRID_SIZE),
  };
}

/** A `CardImage`-shaped object from a decklist row — no extra query for art. */
function displayCard(entry: DeckEntry) {
  return {
    id: entry.scryfall_id,
    name: entry.card_name,
    mana_cost: entry.manaCost,
    type_line: entry.typeLine,
    layout: 'normal',
    image_uris: {
      large: scryfallImageUrl(entry.scryfall_id, 'large') ?? undefined,
      normal: scryfallImageUrl(entry.scryfall_id, 'normal') ?? undefined,
      small: scryfallImageUrl(entry.scryfall_id, 'small') ?? undefined,
    },
  };
}

/* ----------------------------------------------------------------- fragments */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Curve({ curve, avgMv }: { curve: number[]; avgMv: number }) {
  /* Drop leading empty buckets so a deck with no zero-drops does not draw one. */
  const first = curve.findIndex(n => n > 0);
  const buckets = curve.map((n, i) => ({ n, i })).slice(first < 0 ? 0 : first);
  const max = Math.max(1, ...buckets.map(b => b.n));

  return (
    <div>
      {/* Each column owns the full height and the bar is anchored to its floor,
          so the percentage resolves against a real box rather than an auto one. */}
      <div className="flex h-28 gap-1.5">
        {buckets.map(b => (
          <div key={b.i} className="flex flex-1 flex-col gap-1.5">
            <span className="text-center text-[10px] leading-none tabular-nums text-muted-foreground">
              {b.n}
            </span>
            <div className="relative flex-1">
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground/65"
                style={{ height: `${Math.max(3, (b.n / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {buckets.map(b => (
          <span
            key={b.i}
            className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
          >
            {b.i === 7 ? '7+' : b.i}
          </span>
        ))}
      </div>
      <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
        Mana curve across the nonland cards. Average mana value{' '}
        <span className="tabular-nums text-foreground">{avgMv.toFixed(2)}</span>.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- main */

export function HomeBrain() {
  const [wrapRef, near] = useNearViewport<HTMLDivElement>();
  const [entries, setEntries] = useState<DeckEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const index = preconIndexEntry(PRECON_ID);
  const commander = index?.commanders[0];

  useEffect(() => {
    if (!near) return;
    let cancelled = false;

    (async () => {
      try {
        const deck = await fetchPreconDeck(PRECON_ID);
        const names = Array.from(new Set(deck.cards.map(c => c.card_name)));

        const rows: any[] = [];
        for (let i = 0; i < names.length; i += 80) {
          const { data, error } = await supabase
            .from('cards')
            .select('name,mana_cost,cmc,type_line')
            .in('name', names.slice(i, i + 80));
          if (error) throw error;
          rows.push(...((data ?? []) as any[]));
        }

        const byName = new Map<string, any>();
        for (const row of rows) if (!byName.has(row.name)) byName.set(row.name, row);

        /* Every figure below is a count over these rows, so a card the table is
           missing would quietly shift the arithmetic. Rather than print a number
           that is 99% right, drop to the no-numbers rendering. */
        if (names.some(n => !byName.has(n))) throw new Error('incomplete card resolution');

        const resolved: DeckEntry[] = deck.cards.map(c => {
          const row = byName.get(c.card_name);
          return {
            ...c,
            typeLine: String(row.type_line ?? '').toLowerCase(),
            mv: Number(row.cmc ?? 0),
            manaCost: row.mana_cost ?? null,
          };
        });

        if (!cancelled) setEntries(resolved);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [near]);

  const stats = useMemo(() => (entries ? composeStats(entries) : null), [entries]);
  const named = stats?.top.slice(0, NAMED) ?? [];

  return (
    <Section tint>
      <SectionHeading
        title="Ask about the deck you actually built"
        lead="Your question goes off with your actual decklist attached: every card in it, your curve, and what you already own. The answer is about your deck, not decks in general."
      />

      <div
        ref={wrapRef}
        className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-8"
      >
        {/* -------------------------------------------------------- the deck */}
        <div className="rounded-3xl bg-background p-6 shadow-2xl shadow-black/30 sm:p-7">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-xl font-semibold tracking-tight">
              {index?.name ?? 'Draconic Domination'}
            </h3>
            <ColorIdentity colors={index?.ci ?? []} size="sm" />
            <p className="text-sm text-muted-foreground">
              {index?.set ?? 'Commander 2017'} precon
              {index?.total ? ` · ${index.total} cards` : ''}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:gap-7">
            <div className="mx-auto sm:mx-0">
              {commander ? (
                <CardImage card={commanderCard(commander)} width={196} />
              ) : (
                <Skeleton className="h-[273px] w-[196px] rounded-xl" />
              )}
              <p className="mt-2.5 max-w-[196px] text-[11px] uppercase tracking-wider text-muted-foreground">
                Commander
              </p>
            </div>

            <div className="min-w-0 flex-1">
              {stats ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                  <Stat value={String(stats.total)} label="Cards" />
                  <Stat value={String(stats.lands)} label="Lands" />
                  <Stat value={String(stats.creatures)} label="Creatures" />
                  <Stat value={String(stats.dragons)} label="Dragons" />
                  <Stat value={String(stats.artifacts)} label="Artifacts" />
                  <Stat value={String(stats.enchantments)} label="Enchantments" />
                  <Stat value={String(stats.sorceries)} label="Sorceries" />
                  <Stat value={String(stats.instants)} label="Instants" />
                </div>
              ) : failed ? null : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-7 w-12" />
                      <Skeleton className="mt-1.5 h-3 w-16" />
                    </div>
                  ))}
                </div>
              )}

              {stats ? (
                <div className="mt-7">
                  <Curve curve={stats.curve} avgMv={stats.avgMv} />
                </div>
              ) : failed ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  A real 100-card deck. It is the same one the Precons page loads, and the same one the
                  assistant is handed when you ask it something.
                </p>
              ) : (
                <Skeleton className="mt-7 h-32 w-full rounded-lg" />
              )}
            </div>
          </div>

          {/* The whole card wall is dropped rather than left as permanent
              skeletons if the decklist never arrives. */}
          {!failed && (
            <p className="mt-8 text-[11px] uppercase tracking-wider text-muted-foreground">
              {stats
                ? `Top of the curve: the ${GRID_SIZE} heaviest of ${stats.nonland} nonland cards`
                : 'Top of the curve'}
            </p>
          )}

          <div className={cn('mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6', failed && 'hidden')}>
            {stats
              ? stats.top.map((e, i) => (
                  <figure key={e.scryfall_id} className="relative">
                    <CardImage card={displayCard(e)} fill title={`${e.card_name}, mana value ${e.mv}`} />
                    {/* Bottom-left: the top of the card carries its name and cost. */}
                    <figcaption
                      className={cn(
                        'absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                        i < NAMED ? 'bg-foreground text-background' : 'bg-black/75 text-white/85'
                      )}
                    >
                      {e.mv}
                    </figcaption>
                  </figure>
                ))
              : Array.from({ length: GRID_SIZE }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[488/680] rounded-lg" />
                ))}
          </div>
        </div>

        {/* ---------------------------------------------------- the question */}
        <div className="flex flex-col rounded-3xl bg-background p-6 shadow-2xl shadow-black/30 sm:p-7">
          {/* Wraps rather than truncates: a `truncate` flex child has no
              automatic minimum of zero, so on a 390 px screen it dragged this
              panel — and the deck panel sharing its grid column — 77 px wider
              than the viewport. */}
          <div className="flex items-start gap-2 rounded-2xl bg-muted/50 px-3.5 py-2 text-xs leading-relaxed text-muted-foreground">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              Deck context: {index?.name ?? 'Draconic Domination'}
              {stats ? `, ${stats.total} cards, ${stats.unique} unique` : ''}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background">
              <p className="text-sm">What should I cut for more interaction?</p>
            </div>

            <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-muted/45 px-5 py-4">
              {stats ? (
                <div className="space-y-3.5 text-sm leading-relaxed">
                  <p>
                    I read all {stats.total} cards first.{' '}
                    <span className="tabular-nums">{stats.lands}</span> lands,{' '}
                    <span className="tabular-nums">{stats.nonland}</span> spells, average mana value{' '}
                    <span className="tabular-nums">{stats.avgMv.toFixed(2)}</span>. Those spells are{' '}
                    <span className="tabular-nums">{stats.creatures}</span> creatures,{' '}
                    <span className="tabular-nums">{stats.dragons}</span> of them Dragons,{' '}
                    <span className="tabular-nums">{stats.artifacts}</span> artifacts,{' '}
                    <span className="tabular-nums">{stats.enchantments}</span> enchantments,{' '}
                    <span className="tabular-nums">{stats.sorceries}</span> sorceries and{' '}
                    <span className="tabular-nums">{stats.instants}</span> instants.
                  </p>
                  <p>
                    You are asking to cut <em>toward</em> something that is not in the list:{' '}
                    <span className="tabular-nums">{stats.instants}</span> of the{' '}
                    <span className="tabular-nums">{stats.nonland}</span> spells are instants, so
                    interaction here has to be added rather than swapped in. The room is at the top
                    of the curve. <span className="tabular-nums">{stats.heavy}</span> of those
                    spells cost five or more. The heaviest that are not your commander:{' '}
                    {named.map((e, i) => (
                      <span key={e.scryfall_id}>
                        {i > 0 && (i === named.length - 1 ? ' and ' : ', ')}
                        <span className="font-medium text-foreground">{e.card_name}</span>{' '}
                        <span className="tabular-nums text-muted-foreground">({e.mv})</span>
                      </span>
                    ))}
                    .
                  </p>
                </div>
              ) : failed ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The assistant reads the whole deck before it answers: every card, the curve, the mana,
                  and which of them you already own.
                </p>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-[92%]" />
                  <Skeleton className="h-4 w-[78%]" />
                  <Skeleton className="mt-4 h-4 w-full" />
                  <Skeleton className="h-4 w-[85%]" />
                </div>
              )}
            </div>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground/80">
            {stats
              ? `Every number above is counted from the ${stats.total} cards on the left, and the three it names carry a white badge in that grid. In the app your own deck is attached to the question before the assistant sees it.`
              : 'In the app your decklist is attached to the question before the assistant sees it.'}
          </p>

          {/* Composer group sits on the floor of the panel — the space above it
              is the empty conversation area every chat UI has, rather than a
              hole punched between two blocks. */}
          <div className="mt-auto pt-9">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Also one tap away
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_ACTIONS.map(a => (
                <span
                  key={a}
                  className="rounded-full bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-9">
            <Link
              to="/brain"
              className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <span className="min-w-0 flex-1 truncate">Ask about your own deck</span>
              <SendHorizontal className="h-4 w-4 shrink-0" />
            </Link>

            <Button asChild size="lg" variant="outline" className="mt-4 w-full">
              <Link to="/brain">
                Open the assistant
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

export default HomeBrain;
