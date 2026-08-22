import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { tutorDeck } from '@/lib/homepage/snapshot';
import { preconIndexEntry } from '@/data/precon-index';
import { commanderCard, type PreconCard } from '@/lib/precons/precon-api';
import { scryfallImageUrl } from '@/lib/deck/deckCards';
import { cn } from '@/lib/utils';

/**
 * Tutor.
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
 * Cost control: the deck used to be pulled through the `fetch-precons` edge
 * function on every visit that scrolled this far, and then every one of its 87
 * distinct card names resolved against the card table in chunks. That is a
 * ~50 kB decklist download plus two more round trips, per visitor, for a deck
 * that is frozen: it is a published 2017 product and it will never change.
 *
 * It is resolved once a night in `scripts/homepage-snapshot.mjs` instead, which
 * keeps the rule that mattered: if any card fails to resolve, the generator
 * stores nothing rather than arithmetic that is 99% right, and this section
 * drops to its no-numbers rendering.
 */

/** A real, frozen, published product — not a deck this file made up. */
const PRECON_ID = 'Draconic Domination (Commander 2017 Precon Decklist)';

/** How many of the heaviest nonland cards get drawn under the deck header. */
const GRID_SIZE = 12;
/** How many of those the answer names. */
const NAMED = 3;
/** How many of the wall a phone draws. The three named all sit inside this. */
const TOP_ON_PHONE = 4;

/**
 * The six one-tap prompts Tutor ships with when a deck is selected, copied
 * from `DECK_QUICK_ACTIONS` in `src/pages/Tutor.tsx` rather than invented for
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

export function HomeTutor() {
  const [wrapRef, near] = useNearViewport<HTMLDivElement>();

  const index = preconIndexEntry(PRECON_ID);
  const commander = index?.commanders[0];

  /* The viewport gate stays: there is no request to defer any more, but it
     still keeps the deck's card art out of the initial load. */
  const entries = (near ? tutorDeck() : null) as DeckEntry[] | null;
  /* Failed and pending are now the same state, and both draw the same thing:
     the deck without figures over it. The generator writes no deck at all if it
     could not resolve every card, which is the case this flag existed for. */
  const failed = near && entries === null;

  const stats = useMemo(() => (entries ? composeStats(entries) : null), [entries]);
  const named = stats?.top.slice(0, NAMED) ?? [];

  return (
    <Section tint>
      {/* "The answer is about your deck, not decks in general" was a promise
          about output quality, which is the exact register that makes Magic
          players distrust a tool. The panel underneath demonstrates it instead:
          a real question, a real hundred-card list and an answer that disagrees
          with the premise and names three cards out of it. */}
      {/* "WHAT YOU ALREADY OWN" CLAIMED MORE THAN GOES. What the question
          carries is `deckContext.economy` — `ownedPct` and `missing`, a
          percentage and a count (`supabase/functions/mtg-brain/index.ts:229`,
          built by `useCollectionOwnership`). Tutor is not told WHICH cards you
          have, so "what you already own" promised a card-by-card reading of a
          collection that never leaves the browser. "How much of it" is the
          figure that actually travels. */}
      <SectionHeading
        title="Ask about the deck you actually built"
        lead="Your decklist goes with the question: every card in it, your curve, and how much of it you already own."
      />

      <div
        ref={wrapRef}
        className="mt-9 grid gap-5 sm:mt-14 sm:gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-8"
      >
        {/* -------------------------------------------------------- the deck */}
        <div className="rounded-3xl bg-background p-5 shadow-2xl shadow-black/30 sm:p-7">
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
              {/* THE FIGURES AND THE ANSWER SAY THE SAME THING.

                  The eight tiles and the curve under them are the deck counted;
                  the answer's opening paragraph on the right is the deck counted
                  in words, down to the same eight numbers. Side by side on a
                  desktop that is a figure and its caption. Stacked on a 390px
                  phone it is ~430px of the page saying a thing and then saying
                  it again, so the phone keeps the sentence, which is the one
                  that shows the product answering a question. */}
              {stats ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 max-sm:hidden sm:grid-cols-4">
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
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 max-sm:hidden sm:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-7 w-12" />
                      <Skeleton className="mt-1.5 h-3 w-16" />
                    </div>
                  ))}
                </div>
              )}

              {stats ? (
                <div className="mt-7 max-sm:hidden">
                  <Curve curve={stats.curve} avgMv={stats.avgMv} />
                </div>
              ) : failed ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  A 100-card Commander precon, the same one the Precons page loads.
                </p>
              ) : (
                <Skeleton className="mt-7 h-32 w-full rounded-lg max-sm:hidden" />
              )}
            </div>
          </div>

          {/* The whole card wall is dropped rather than left as permanent
              skeletons if the decklist never arrives. */}
          {!failed && (
            <p className="mt-6 text-[11px] uppercase tracking-wider text-muted-foreground sm:mt-8">
              {stats
                ? // Counts what is drawn, which is four of them on a phone.
                  <>
                    Top of the curve: the{' '}
                    <span className="sm:hidden">{TOP_ON_PHONE}</span>
                    <span className="hidden sm:inline">{GRID_SIZE}</span> heaviest of{' '}
                    {stats.nonland} nonland cards
                  </>
                : 'Top of the curve'}
            </p>
          )}

          <div className={cn('mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6', failed && 'hidden')}>
            {stats
              ? stats.top.map((e, i) => (
                  /* Four of the twelve on a phone, at the same size. Twelve is
                     two rows of six on a desktop and three rows of four at
                     390px, and the three the answer names are all in the first
                     four. The caption above deliberately stopped naming a
                     number so that it is true of both. */
                  <figure
                    key={e.scryfall_id}
                    className={cn('relative', i >= TOP_ON_PHONE && 'hidden sm:block')}
                  >
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
        <div className="flex flex-col rounded-3xl bg-background p-5 shadow-2xl shadow-black/30 sm:p-7">
          {/* Wraps rather than truncates: a `truncate` flex child has no
              automatic minimum of zero, so on a 390 px screen it dragged this
              panel — and the deck panel sharing its grid column — 77 px wider
              than the viewport. */}
          <div className="flex items-start gap-2 rounded-2xl bg-muted/50 px-3.5 py-2 text-xs leading-relaxed text-muted-foreground">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {/* "Deck context" is prompt-assembly vocabulary. The player's word
                for a decklist travelling with a question is attached. */}
            <span className="min-w-0">
              Attached: {index?.name ?? 'Draconic Domination'}
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
                  {/* TWO THINGS LEFT THIS PARAGRAPH.
​
                      "I read all 100 cards first" was the tool defending itself
                      before answering, which is the thing that reads as a tell.
                      The counts that follow prove it did without saying so.
​
                      And the full type breakdown — 34 creatures, 24 of them
                      Dragons, 6 artifacts and so on — is the eight stat tiles
                      to the left of this bubble, read aloud. Six numbers the
                      rest of the answer never uses again. */}
                  <p>
                    <span className="tabular-nums">{stats.lands}</span> lands,{' '}
                    <span className="tabular-nums">{stats.nonland}</span> spells, average mana value{' '}
                    <span className="tabular-nums">{stats.avgMv.toFixed(2)}</span>.
                  </p>
                  {/* THIS PARAGRAPH USED TO GIVE A WRONG ANSWER, AND WRONG IN
                      THE ONE WAY A COMMANDER PLAYER SPOTS IMMEDIATELY.
​
                      It read: "You are asking to cut toward something that is
                      not in the list: 0 of the 63 spells are instants, so
                      interaction here has to be added rather than swapped in."
                      That equates interaction with instants. Draconic
                      Domination has plenty of interaction — Crux of Fate,
                      Fractured Identity, Fortunate Few, Rain of Thorns,
                      Earthquake — and all of it is sorcery-speed. Telling a
                      player who owns this deck that it has no answers, over a
                      panel that lists Crux of Fate, is the fastest way to prove
                      the thing answering does not play.
​
                      What is actually true, and what the numbers on the left
                      support, is the timing: this deck can act on its own turn
                      and cannot respond on anybody else's. That is a real
                      answer to "what should I cut for more interaction", and it
                      is the answer a player at the table would give. */}
                  <p>
                    {/* Branched, because the sentence is only true while the
                        count is nought. The deck is a frozen 2017 product so it
                        will stay nought, and an exhibit that asserts a thing
                        the numbers beside it contradict is the whole fault this
                        paragraph was rewritten for. */}
                    {stats.instants === 0 ? (
                      <>
                        There are answers in here, but not one of the{' '}
                        <span className="tabular-nums">{stats.nonland}</span> spells is an instant,
                        so nothing you hold does anything on somebody else&rsquo;s turn.
                      </>
                    ) : (
                      <>
                        <span className="tabular-nums">{stats.instants}</span> of the{' '}
                        <span className="tabular-nums">{stats.nonland}</span> spells are instants,
                        so most of what answers a threat here has to wait for your own turn.
                      </>
                    )}{' '}
                    The room to fix that is at the top of the curve.{' '}
                    <span className="tabular-nums">{stats.heavy}</span> of those spells cost five or
                    more. The heaviest that are not your commander:{' '}
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
                /* Same correction as the lead: how much of it, not which ones. */
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Tutor reads the whole deck before it answers: every card, the curve, the mana,
                  and how much of it you already own.
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

          {/* THE FOOTNOTE IS GONE. It read: "Every number above is counted
              from the 100 cards on the left, and the three it names carry a
              white badge in that grid. In the app your own deck is attached to
              the question before Tutor answers it." Three sentences: one
              insisting the arithmetic is real, one explaining our own badge
              styling to a stranger, and one repeating the section's lead. */}

          {/* The six prompts Tutor ships with, copied from `DECK_QUICK_ACTIONS`
              in src/pages/Tutor.tsx rather than invented for this page — which
              is why the spelling of "Analyze deck" is what it is. They are
              deliberately unlabelled now: "Also one tap away" was a caption for
              six things that are visibly buttons.
​
              Desktop only, as before. On a desktop they fill the floor of a
              panel that would otherwise have a hole in it; at 390px there is no
              hole and they are ~110px of pills between the answer and the way
              in. */}
          <div className="mt-auto flex flex-wrap gap-2 pt-7 max-sm:hidden sm:pt-9">
            {QUICK_ACTIONS.map(a => (
              <span
                key={a}
                className="rounded-full bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {a}
              </span>
            ))}
          </div>

          {/* The drawn composer went with the footnote. It was a picture of a
              text box sitting directly on top of a real button that does the
              same thing, on both a phone and a desktop. */}
          <div className="mt-7 sm:mt-9">
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link to="/tutor">
                Open Tutor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

export default HomeTutor;
