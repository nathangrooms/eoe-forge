import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards/CardImage';
import { MobileReveal, Section, SectionHeading } from '@/components/marketing/Section';
import {
  loadCardsByName,
  useDeferred,
  useNearViewport,
  type MarketingCard,
} from '@/components/marketing/sectionData';
import gameChangerCatalog from '@/lib/deckbuilder/score/catalog.gamechangers.json';
import {
  SUBSCORE_WEIGHTS,
  SUBSCORE_ORDER,
  SUBSCORE_LABELS,
  SUBSCORE_DESCRIPTIONS,
} from '@/engine/power/weights';
import { cn } from '@/lib/utils';

/**
 * The power model.
 *
 * The old version of this section was nine grey bars and four pills — the only
 * section on the page with no card on it, arguing about Magic without showing
 * any. It also under-sold the thing that actually makes the score defensible:
 * the model does not just weight abstractions, it looks for *named cards*, and
 * that list is a checked-in file rather than a prompt.
 *
 * So the weights stay (they are real constants, imported from
 * `SUBSCORE_WEIGHTS` in src/engine/power/weights.ts, stored there as fractions
 * that sum to 1 and printed here as percentages), and underneath them the
 * section prints the catalogue the scorer reads.
 *
 * This paragraph used to point at `defaultConfig.weights` in
 * src/lib/deckbuilder/score/edh-power-calculator.ts and quote 0.20 / 0.15 /
 * 0.12. That file was deleted when the engine was unified and those are not the
 * numbers any more, which the note twenty lines below says outright. Two
 * comments in one file disagreeing about where a public figure comes from is
 * how a fabricated figure gets shipped next time.
 *
 * Honesty model:
 *   - `catalog.gamechangers.json` is imported from the scorer's own directory —
 *     the same import `FeatureExtractor.detectGameChangers` makes. Nothing here
 *     is a transcription of it.
 *   - Every count is `list.length` over that file, so the numbers cannot drift
 *     away from the model.
 *   - Every card is resolved to a real `cards` row by name and drawn WHOLE at
 *     5:7. A name the catalogue holds but the catalogue table does not is simply
 *     not drawn — there are no placeholder slots.
 *   - The four bands are the engine's own band labels.
 */

/* ------------------------------------------------------------------ weights */

/**
 * The real weights, imported rather than transcribed.
 *
 * This used to be a hand-copied array of nine numbers taken from
 * `EDHPowerCalculator.defaultConfig.weights`, with a comment explaining that
 * importing the calculator would drag the feature extractor, the 10,000-hand
 * simulator and the coach into the marketing bundle.
 *
 * That calculator no longer exists. It was replaced by `src/engine/power/`, the
 * model gained a tenth subscore, and castability became the heaviest at 0.22 —
 * so this page was advertising weights the product had stopped using. A public
 * page stating figures that do not match the software is precisely what
 * CLAUDE.md section 12.7 forbids, and a transcribed constant will drift again
 * the moment anybody retunes the model.
 *
 * The old objection no longer applies either: `weights.ts` is a leaf that
 * imports one type and nothing else. No catalogues, no tagger, no simulator.
 */
const SUBSCORES = SUBSCORE_ORDER.map(key => ({
  label: SUBSCORE_LABELS[key],
  /* Stored as fractions that sum to 1; this section prints percentages. */
  weight: Math.round(SUBSCORE_WEIGHTS[key] * 100),
  blurb: SUBSCORE_DESCRIPTIONS[key],
}));

/**
 * The heaviest weight, so a bar's length is a share of the real top.
 *
 * The bars were drawn as `weight / 20`, a divisor that was correct while the
 * heaviest subscore was 0.20. Castability is 0.22 now, so its bar computed to
 * 110% and the track's `overflow-hidden` clipped it to a full one: castability
 * and a hypothetical 20% would have drawn the same length, and the picture
 * stopped agreeing with the number printed beside it. Derived, so it cannot go
 * stale the next time the model is retuned.
 */
const HEAVIEST_WEIGHT = Math.max(...SUBSCORES.map(s => s.weight));

/**
 * How many of the ten subscore rows a phone shows before it offers the rest.
 *
 * Three, because three is enough to establish that the score is a weighted sum
 * of named, ordinary things rather than a verdict, and the heaviest three carry
 * over half the weight between them.
 */
const WEIGHTS_ON_PHONE = 3;

const BANDS = ['Casual', 'Mid', 'High', 'cEDH'];

/* ------------------------------------------------------- the game changers */

interface ComboEntry {
  name: string;
  requires: string[];
}

const COMPACT_COMBOS = gameChangerCatalog.compact_combo as ComboEntry[];
/** Only the entries that name a partner can be drawn AS a pair. */
const COMBOS = COMPACT_COMBOS.filter(entry => entry.requires.length > 0);
const FINISHER_BOMB = gameChangerCatalog.finisher_bomb as {
  cards: string[];
  conditional: Record<string, Record<string, number>>;
};
const FINISHERS = FINISHER_BOMB.cards;
/** Finishers the catalogue only counts once the rest of the list supports them. */
const CONDITIONAL_FINISHERS = Object.keys(FINISHER_BOMB.conditional ?? {}).length;
const ENGINES = (gameChangerCatalog.inevitability_engine as { cards: string[] }).cards;
const SWINGS = (gameChangerCatalog.massive_swing as { cards: string[] }).cards;

/** Every name the panels below might draw, in one request. */
const ALL_NAMES = Array.from(
  new Set([
    ...COMBOS.flatMap(entry => [entry.name, entry.requires[0]]),
    ...FINISHERS,
    ...ENGINES,
    ...SWINGS,
  ])
);

const loadGameChangers = () => loadCardsByName('power-game-changers', ALL_NAMES);

type CardLookup = Map<string, MarketingCard>;

const pick = (cards: CardLookup | null, name: string) =>
  cards?.get(name.trim().toLowerCase()) ?? null;

/* ------------------------------------------------------------------ pieces */

function WeightRow({ label, weight, blurb }: { label: string; weight: number; blurb: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-3">
        <span className="shrink-0 text-sm font-medium">{label}</span>
        <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
          {weight}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
        <div
          className="h-full rounded-full bg-foreground/75"
          style={{ width: `${(weight / HEAVIEST_WEIGHT) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{blurb}</p>
    </div>
  );
}

/** A panel of whole cards, with the ones the catalogue table could not resolve dropped. */
/*
 * The eyebrow this used to carry was the catalogue's own key for the class —
 * "Compact combo", "Finisher bomb", "Inevitability engine", "Massive swing".
 * Those are internal names for internal groupings, and "engine" is on the
 * owner's banned list by name. The plain-English `title` underneath already
 * says the same thing better ("The card that wins it slowly"), so the eyebrow
 * was jargon sitting on top of the translation of itself. Dropped; the count
 * moves next to the title, where it still says how many real cards there are.
 */
function ClassPanel({
  title,
  body,
  count,
  children,
}: {
  title: string;
  body: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-card p-6 shadow-xl shadow-black/30">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-medium">{title}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">
          {count} cards like this
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}

/** How many of a panel's cards a phone draws. Six is two rows there, one here. */
const WALL_ON_PHONE = 3;

function CardWall({ cards }: { cards: MarketingCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {cards.map((card, i) => (
        /* Fewer cards, not smaller ones. Six cards is two rows of three at
           390px and one row of six from `sm` up, so the phone pays double for a
           point the first row has already made. The cards that stay are the
           same size they always were. */
        <figure key={card.id} className={cn('group min-w-0', i >= WALL_ON_PHONE && 'hidden sm:block')}>
          <CardImage
            card={card}
            size="sm"
            fill
            hideFlip
            className="transition-transform duration-500 group-hover:-translate-y-1"
          />
          <figcaption className="mt-2 truncate text-[11px] leading-snug text-muted-foreground">
            {card.name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * One combo, drawn as the pair the model scores.
 *
 * Sized to the same card scale as `CardWall` deliberately: three pairs across
 * is six cards across, so the four panels read as one exhibit rather than one
 * panel of enormous cards beside three panels of small ones.
 */
function ComboPair({ a, b }: { a: MarketingCard; b: MarketingCard }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <CardImage card={a} size="sm" fill hideFlip />
        </div>
        <span aria-hidden className="shrink-0 text-xs font-medium text-muted-foreground">
          +
        </span>
        <div className="min-w-0 flex-1">
          <CardImage card={b} size="sm" fill hideFlip />
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] leading-snug text-muted-foreground">
        {a.name} + {b.name}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ section */

export function HomePower() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const cards = useDeferred(near, loadGameChangers);

  const resolved = (names: string[], limit: number) =>
    names
      .map(name => pick(cards, name))
      .filter((card): card is MarketingCard => card !== null)
      .slice(0, limit);

  const combos = COMBOS.map(entry => {
    const a = pick(cards, entry.name);
    const b = pick(cards, entry.requires[0]);
    return a && b ? { a, b } : null;
  })
    .filter((pair): pair is { a: MarketingCard; b: MarketingCard } => pair !== null)
    .slice(0, 3);

  const finishers = resolved(FINISHERS, 6);
  const engines = resolved(ENGINES, 6);
  const swings = resolved(SWINGS, 6);

  return (
    <Section>
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        eyebrow="Power level"
        title="A power level you can argue with"
        lead={
          <>
            Find out if your deck is too strong for your group, before you sit down. Ten things get
            measured and you can see every one of them, so you can see why the number came out the
            way it did.{' '}
            <span className="hidden sm:inline">The same deck always gets the same score.</span>
          </>
        }
      />

      {/* ------------------------------------------------------- the weights

          Three of the ten on a phone, then a control for the rest.

          The ten rows are three columns and about one screen on a desktop. On a
          390px phone they are ten rows one under another, roughly 1,150px, and
          the four panels of cards below them another 1,600px: this was a five
          screen section on a phone against two on a desktop. The argument on a
          phone is "here is the score and here is why"; the full table and the
          card catalogue behind it are what you open when you want to check it.
          Nothing is removed and nothing moves above `sm`. */}
      <div className="mt-9 grid gap-x-10 gap-y-7 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSCORES.slice(0, WEIGHTS_ON_PHONE).map(entry => (
          <WeightRow key={entry.label} {...entry} />
        ))}
      </div>

      <MobileReveal
        label={`See the other ${SUBSCORES.length - WEIGHTS_ON_PHONE}, and the cards it watches for`}
      >
        {/* The remaining rows continue the same grid: `mt-7` is the same 28px
            the grid's own `gap-y-7` puts between rows, so at `sm` and above the
            ten rows land exactly where one grid of ten put them. */}
        <div className="mt-7 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {SUBSCORES.slice(WEIGHTS_ON_PHONE).map(entry => (
            <WeightRow key={entry.label} {...entry} />
          ))}
        </div>

      {/* -------------------------------------------------- the game changers

          Heading centred, not left-aligned. `max-w-3xl` with no `mx-auto`
          pinned this heading and its paragraph to the left edge of a 1600px
          section, so two lines of text sat next to ~800px of empty background:
          the same ragged void the storage section had, in miniature. Every
          other sub-heading on the page is centred; this was the odd one out. */}
      <div className="mt-10 sm:mt-12">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            And the cards it watches for
          </h3>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Some cards win a game on their own. A deck with none of them scores lower, however tidy
            it looks on paper. These are the four kinds it looks for, and the real cards in each.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:mt-10 lg:grid-cols-2">
          <ClassPanel
            title="Two cards that end the game"
            body="These count as a pair, not as two good cards on their own. Each half is useless without the other."
            count={COMPACT_COMBOS.length}
          >
            {combos.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {combos.map((pair, i) => (
                  /* One pair on a phone. Three pairs is six cards stacked
                     vertically there, and the second and third say exactly what
                     the first one says. */
                  <div key={pair.a.id} className={cn(i >= 1 && 'hidden sm:block')}>
                    <ComboPair a={pair.a} b={pair.b} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-24" />
            )}
          </ClassPanel>

          <ClassPanel
            title="The card you cast to win"
            body={`${CONDITIONAL_FINISHERS} of these only count if the rest of your deck backs them up. Craterhoof wants twenty creatures out. Aetherflux wants twenty-five spells.`}
            count={FINISHERS.length}
          >
            <CardWall cards={finishers} />
          </ClassPanel>

          <ClassPanel
            title="The card that wins it slowly"
            body="Nothing happens the turn it lands. Two turns later the table is a card down and you are three up."
            count={ENGINES.length}
          >
            <CardWall cards={engines} />
          </ClassPanel>

          <ClassPanel
            title="The card that undoes the board"
            body="Board wipes that only hit them, and extra turns. One cast and a game you were losing is a game you are winning."
            count={SWINGS.length}
          >
            <CardWall cards={swings} />
          </ClassPanel>
        </div>
      </div>

      </MobileReveal>

      {/* --------------------------------------------------------- the bands */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:mt-14">
        {BANDS.map((band, i) => (
          <span
            key={band}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm',
              i === 1
                ? 'bg-foreground font-medium text-background'
                : 'bg-foreground/10 text-muted-foreground'
            )}
          >
            {band}
          </span>
        ))}
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        These are the numbers and the bands the score really uses
        {/* True only once the cards are on screen, and on a phone they are
            behind the control above until somebody opens it. */}
        <span className="hidden sm:inline">
          , and the cards above are the real list it checks your deck against
        </span>
        .
      </p>

      <div className="mt-8 text-center sm:mt-10">
        <Button asChild size="lg" variant="outline">
          <Link to="/decks">
            Score a deck
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomePower;
