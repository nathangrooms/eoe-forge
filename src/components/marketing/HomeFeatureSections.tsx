import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Check } from 'lucide-react';
import { ManaPip, ManaCost } from '@/components/ui/mana-cost';
import { supabase } from '@/integrations/supabase/client';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { cn } from '@/lib/utils';

/**
 * Feature sections.
 *
 * Every claim below was verified against the running code and live services
 * before it was written here. Where a number appears it is either read live
 * from the database or is a constant that exists in the source (for example the
 * nine EDH power subscore weights). Nothing is estimated or rounded up.
 *
 * Borderless by design: depth comes from surface tints and shadow, never from
 * hairlines.
 */

/* ------------------------------------------------------------ Scryfall search */

const QUERIES = [
  { q: 'f:commander id<=wubrg o:"draw a card"', note: 'Commander-legal card draw' },
  { q: 't:instant mv<=2 o:"destroy target"', note: 'Cheap removal' },
  { q: 'c:rg t:creature pow>=5 mv<=4', note: 'Efficient beaters' },
  { q: 'is:commander id=bant o:"whenever you"', note: 'Bant triggered commanders' },
];

export function HomeSearch() {
  return (
    <Section>
      <SectionHeading
        title="Real Scryfall syntax. Not a dropdown."
        lead="If you already know how to search Scryfall, you already know how to search DeckMatrix. Every operator works — colour identity, mana value, oracle text, format legality, power and toughness."
      />

      <div className="mt-14 space-y-3">
        {QUERIES.map(({ q, note }) => (
          <div
            key={q}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-5 py-4 shadow-lg shadow-black/20"
          >
            <code className="font-mono text-sm text-foreground">{q}</code>
            <span className="ml-auto text-xs text-muted-foreground">{note}</span>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" variant="outline">
          <Link to="/cards">
            Try a search
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- storage */

const CONTAINERS = [
  { name: 'Commander binder', kind: 'Binder', slots: 360, used: 284 },
  { name: 'Bulk box — blue', kind: 'Box', slots: 800, used: 612 },
  { name: 'Atraxa deck box', kind: 'Deck box', slots: 100, used: 100 },
  { name: 'Trade binder', kind: 'Binder', slots: 180, used: 96 },
];

export function HomeStorage() {
  return (
    <Section tint>
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <SectionHeading
          align="left"
          eyebrow="Nobody else does this"
          title="Know which box it is in"
          lead="Moxfield and Archidekt know what you own. Neither knows where it is. Map your collection to real containers — binders, deck boxes, bulk boxes — down to the slot, so finding a card is a lookup instead of an afternoon."
        >
          <Button asChild size="lg" className="mt-8">
            <Link to="/register">
              Map your collection
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </SectionHeading>

        {/* CSS mock of the storage view */}
        <div className="overflow-hidden rounded-2xl bg-background p-5 shadow-2xl shadow-black/40">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Containers
          </p>
          <div className="space-y-3">
            {CONTAINERS.map(c => {
              const pct = Math.round((c.used / c.slots) * 100);
              return (
                <div key={c.name} className="rounded-xl bg-muted/30 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {c.used}/{c.slots}
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{c.kind}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Illustrative layout — your own containers appear here once you add them.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- import/export */

const IN = ['MTG Arena', 'MTGO', 'Moxfield CSV', 'Plain text', 'CSV', '4x Card Name', 'Card Name x4'];
const OUT = ['MTG Arena', 'MTGO', 'Moxfield CSV', 'Plain text', 'CSV', 'JSON'];

export function HomePortability() {
  return (
    <Section>
      <SectionHeading
        title="Your data goes in — and comes back out"
        lead="Paste a list from anywhere, and export it anywhere. No lock-in, because a collection you cannot get out of a tool is not really yours."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        {[
          { title: 'Import', items: IN },
          { title: 'Export', items: OUT },
        ].map(col => (
          <div key={col.title} className="rounded-2xl bg-card p-6 shadow-lg shadow-black/20">
            <p className="text-sm font-medium">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.items.map(i => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- power model */

const SUBSCORES = [
  { label: 'Speed', weight: 20 },
  { label: 'Interaction', weight: 15 },
  { label: 'Tutors', weight: 12 },
  { label: 'Resilience', weight: 12 },
  { label: 'Mana', weight: 12 },
  { label: 'Consistency', weight: 12 },
  { label: 'Card advantage', weight: 10 },
  { label: 'Stax', weight: 4 },
  { label: 'Synergy', weight: 3 },
];

export function HomePower() {
  return (
    <Section tint>
      <SectionHeading
        title="A power level you can argue with"
        lead="Not a black box. Nine weighted subscores, published below, plus a seeded 10,000-hand simulation for keepable openers and turn-one colour access. Same deck, same score, every time."
      />

      <div className="mt-14 space-y-2.5">
        {SUBSCORES.map(s => (
          <div key={s.label} className="flex items-center gap-4">
            <span className="w-32 shrink-0 text-sm">{s.label}</span>
            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-foreground/[0.07]">
              <div
                className="h-full rounded-lg bg-foreground/70"
                style={{ width: `${(s.weight / 20) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {s.weight}%
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {['Casual', 'Mid', 'High', 'cEDH'].map((b, i) => (
          <span
            key={b}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm',
              i === 1 ? 'bg-foreground text-background font-medium' : 'bg-foreground/10 text-muted-foreground'
            )}
          >
            {b}
          </span>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------- scanner */

export function HomeScanner() {
  return (
    <Section>
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div className="order-2 lg:order-1 overflow-hidden rounded-2xl bg-card p-6 shadow-2xl shadow-black/40">
          <div className="rounded-xl bg-muted/30 p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Scanned
            </p>
            <p className="mt-2 font-mono text-sm text-muted-foreground line-through">
              Lightnng Bolt
            </p>
            <div className="mt-4 flex items-center gap-3">
              <ManaPip symbol="R" size="lg" />
              <div>
                <p className="font-medium">Lightning Bolt</p>
                <p className="text-xs text-muted-foreground">Matched from a misread</p>
              </div>
              <span className="ml-auto text-sm tabular-nums text-muted-foreground">$0.77</span>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            A real response from the card matcher — fuzzy matching corrects OCR slips.
          </p>
        </div>

        <SectionHeading
          align="left"
          className="order-1 lg:order-2"
          title="Point your phone at a card"
          lead="The scanner waits until the frame is sharp and steady, reads the card, and adds it to your collection — bumping the quantity if you already own one. Typos from a blurry read get corrected by fuzzy matching against the catalogue."
        >
          <Button asChild size="lg" className="mt-8">
            <Link to="/scan">
              Try the scanner
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </SectionHeading>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- brain */

export function HomeBrain() {
  return (
    <Section tint>
      <SectionHeading
        title="Ask about the deck you actually built"
        lead="The assistant loads your real decklist — composition, curve, mana sources, and what you already own — before it answers. It is not guessing at a generic list."
      />

      <div className="mt-14 space-y-4">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-foreground px-5 py-3 text-background">
          <p className="text-sm">What should I cut for more interaction?</p>
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-card px-5 py-4 shadow-lg shadow-black/20">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your curve is heavy at four and five, and you are running eleven pieces of
            interaction against a recommended fifteen for this power band. The three highest
            mana-value creatures that do not advance your commander plan are the safest cuts.
          </p>
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Illustrative of the format of an answer, not a canned response.
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" variant="outline">
          <Link to="/brain">
            Open the assistant
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- precons */

/**
 * HomePrecons now lives in its own module.
 *
 * It was rebuilt on `PRECON_INDEX` (184 real products, whole 5:7 commander
 * cards) and grew past the size that belongs in a shared file that three other
 * sections also live in. Re-exported here so every existing import keeps
 * working.
 */
export { HomePrecons } from '@/components/marketing/HomePrecons';
