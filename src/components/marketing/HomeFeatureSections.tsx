import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check } from 'lucide-react';
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

/* -------------------------------------------------------------------- storage
 * `HomeStorage` moved to src/components/marketing/HomeStorage.tsx, where it is
 * drawn as physical containers — a binder page, a deck box, an A-Z long box —
 * instead of four progress bars over four invented containers.
 */

/* ------------------------------------------------------------- import/export */

const IN = ['MTG Arena', 'MTGO', 'Moxfield CSV', 'Plain text', 'CSV', '4x Card Name', 'Card Name x4'];
const OUT = ['MTG Arena', 'MTGO', 'Moxfield CSV', 'Plain text', 'CSV', 'JSON'];

export function HomePortability() {
  return (
    <Section tint>
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
    <Section>
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

/* --------------------------------------------------- scanner / brain re-export */

/**
 * Both of these outgrew this file.
 *
 * `HomeScanner` is now a CSS camera — body, viewfinder, focus brackets around a
 * whole 5:7 card, shutter, and the fuzzy match resolving underneath.
 * `HomeBrain` now loads a real 100-card precon and computes its answer from it.
 * They live in their own modules; re-exported here so importers do not move.
 */
export { HomeScanner } from '@/components/marketing/HomeScanner';
export { HomeBrain } from '@/components/marketing/HomeBrain';

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
