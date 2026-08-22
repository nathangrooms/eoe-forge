import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { approxLabel, counts, formatSlots } from '@/lib/homepage/snapshot';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { cn } from '@/lib/utils';

/**
 * Pick a format, see what you can build in it.
 *
 * This replaces "Every format, with real legality" — six tiles reading
 * "Legacy 32,715", which told a player nothing they could act on and fired six
 * concurrent count queries to say it. A legality claim is only worth making if
 * it is demonstrated, so each format now shows the SKELETON OF A DECK in that
 * format: the roles a list needs, filled with real cards, drawn whole at 5:7.
 *
 * Honesty model, because this section makes a legality claim about specific
 * cards:
 *
 *   - The card ids are chosen by hand — a deliberately editorial pick of
 *     recognisable staples, because ranking the pool by price surfaces vintage
 *     collector rares and Secret Lair crossovers rather than cards anyone plays.
 *     They live in `scripts/homepage-snapshot.mjs` with the query that resolves
 *     them.
 *   - The claim "legal in this format" is NOT taken from that hand-picking. The
 *     query filters on `legalities->>'<format>' = 'legal'`, so a card that gets
 *     banned or rotates simply stops appearing here — the row shrinks rather
 *     than lying. (The catalogue is current: Dockside Extortionist and Jeweled
 *     Lotus already read `banned` in Commander.)
 *   - The one number kept from the old section is the count of legal cards, now
 *     a supporting line under six real cards rather than the whole exhibit.
 *   - The rules line for each format is the format's actual deck-construction
 *     rule, not a statistic.
 *
 * Queries: none. This section used to fetch its six cards and count that
 * format's legal pool on every tab, and the count alone measures 1.9 s against
 * a role capped at 3 s. All twelve requests, for all six formats, now happen
 * once a night. A ban therefore shows up here the morning after it lands rather
 * than the instant it does, which is the same latency the card table itself has.
 */

interface FormatDef {
  key: string;
  label: string;
  /** The format's real deck-construction rules. */
  rules: string;
}

/**
 * The formats, and the rule each one is actually played under.
 *
 * The CARDS that fill each row, and the role each one plays in a list, live
 * with the query in `scripts/homepage-snapshot.mjs` under FORMAT_PICKS. So does
 * the legality filter, which is the part that matters: a card that gets banned
 * or rotates stops coming back from that query, so the row shrinks rather than
 * lying.
 */
const FORMATS: FormatDef[] = [
  { key: 'commander', label: 'Commander', rules: '100 cards · singleton · colour identity enforced' },
  { key: 'modern', label: 'Modern', rules: '60 cards · four copies · 8th Edition forward' },
  { key: 'pioneer', label: 'Pioneer', rules: '60 cards · four copies · Return to Ravnica forward' },
  { key: 'standard', label: 'Standard', rules: '60 cards · four copies · the current rotation' },
  { key: 'pauper', label: 'Pauper', rules: '60 cards · four copies · commons only' },
  { key: 'legacy', label: 'Legacy', rules: '60 cards · four copies · nearly the whole card pool' },
];

interface FormatCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string;
  rarity: string | null;
  color_identity: string[] | null;
  image_uris: Record<string, string> | null;
  faces: unknown;
  layout: string | null;
  prices: Record<string, string> | null;
}

interface Slot {
  role: string;
  card: FormatCard;
}

/**
 * What the row shows when the file has no slots for this format.
 *
 * Six empty frames under the roles a list needs, which is the same shape the
 * section used to draw while its query was in flight. It states the roles,
 * which is true of every format, and claims no cards, which is what we have.
 */
/**
 * How many of the six deck slots a phone draws.
 *
 * Six whole cards is one row at `lg` and three rows of ~230px cards at 390px.
 * Four is two rows, the cards are the size they always were, and the four roles
 * that survive are the ones every list in every format has: a commander (or the
 * format's headline card), ramp, removal and card draw.
 */
const SLOTS_ON_PHONE = 4;

const PLACEHOLDER_SLOTS: { role: string }[] = [
  { role: 'Commander' }, { role: 'Ramp' }, { role: 'Removal' },
  { role: 'Card draw' }, { role: 'Tutor' }, { role: 'Finisher' },
];

/* ------------------------------------------------------------------ section */

export function HomeFormatPicker() {
  const [active, setActive] = useState(FORMATS[0].key);

  const format = FORMATS.find(f => f.key === active) ?? FORMATS[0];
  /*
   * Two requests per format tab became none.
   *
   * Every tab used to fetch its six cards and then run an exact count over that
   * format's legal pool. The count alone measures 1.9 s against `cards_unique`
   * and the `anon` role is capped at 3 s, so it was one slow night away from
   * showing nothing. Both run once, for all six formats, in
   * scripts/homepage-snapshot.mjs.
   */
  const loaded = formatSlots(active) as Slot[] | null;
  const count = counts.formatLegal(active);

  return (
    <Section tint>
      <SectionHeading
        eyebrow="Pick your format"
        title={`What can you build in ${format.label}?`}
        lead={
          <>
            What is legal comes from the cards themselves, not from a list someone updates by hand,
            so a new ban shows up here as soon as the cards update overnight.{' '}
            <span className="hidden sm:inline">
              Every format, with its own legal card pool.
            </span>
          </>
        }
      />

      {/* Format tabs */}
      <div className="mt-8 flex flex-wrap justify-center gap-2 sm:mt-12">
        {FORMATS.map(f => {
          const on = f.key === active;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(f.key)}
              aria-pressed={on}
              className={cn(
                /* 40px everywhere before; 44 on a phone via `max-sm`, so the desktop
                   row of six tabs keeps the height it had. */
                'rounded-full px-5 py-2.5 max-sm:py-3 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                on
                  ? 'bg-foreground font-medium text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* The format's real rules, plus the live size of its pool */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{format.rules}</span>
        <span aria-hidden="true" className="hidden text-muted-foreground/40 sm:inline">
          ·
        </span>
        <span className="tabular-nums">
          {count !== null ? (
            <>
              {/* Rounded down with a "+": the pool was counted last night and
                  only grows between syncs, so the unit digit is a precision
                  this page has not got. A ban shrinks it, and the file is at
                  most a night behind that. */}
              <span className="font-medium text-foreground">{approxLabel(count)}</span> cards legal
            </>
          ) : (
            'legal pool not available'
          )}
        </span>
      </div>

      {/* The skeleton of a deck in this format, as whole cards */}
      <div className="mt-8 grid grid-cols-2 gap-5 sm:mt-12 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
        {((loaded ?? PLACEHOLDER_SLOTS) as (Slot | { role: string })[]).map((entry, i) => {
          const slot: Slot | null = 'card' in entry ? (entry as Slot) : null;
          return (
            <figure
              key={slot?.card.id ?? `slot-${i}`}
              className={cn(i >= SLOTS_ON_PHONE && 'hidden sm:block')}
            >
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {entry.role}
              </p>

              {slot ? (
                <CardImage card={slot.card} fill size="md" hideFlip />
              ) : (
                <CardImageSkeleton fill size="md" />
              )}

              <figcaption className="mt-3">
                <p className="truncate text-sm font-medium">{slot ? slot.card.name : ' '}</p>
                <div className="mt-1.5 flex min-h-[1.125rem] items-center gap-2">
                  {slot && <ManaCost cost={slot.card.mana_cost} size="xs" />}
                  {slot?.card.prices?.usd && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      ${Number(slot.card.prices.usd).toFixed(2)}
                    </span>
                  )}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="mt-9 text-center sm:mt-12">
        <Button asChild size="lg" variant="outline">
          <Link to="/cards">
            Search the {format.label} pool
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeFormatPicker;
