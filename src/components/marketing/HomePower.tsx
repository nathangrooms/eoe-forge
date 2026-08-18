import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards/CardImage';
import { Section, SectionHeading } from '@/components/marketing/Section';
import {
  loadCardsByName,
  useDeferred,
  useNearViewport,
  type MarketingCard,
} from '@/components/marketing/sectionData';
import gameChangerCatalog from '@/lib/deckbuilder/score/catalog.gamechangers.json';
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
 * So the weights stay (they are real constants — `EDHPowerCalculator`'s
 * `defaultConfig.weights` in src/lib/deckbuilder/score/edh-power-calculator.ts,
 * expressed there as 0.20 / 0.15 / 0.12 … and printed here as percentages), and
 * underneath them the section prints the catalogue the scorer reads.
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
 *   - The four bands are the calculator's own `thresholds` labels.
 */

/* ------------------------------------------------------------------ weights */

/**
 * `EDHPowerCalculator.defaultConfig.weights`, as percentages.
 *
 * Deliberately not imported: pulling the calculator in would drag the feature
 * extractor, the 10,000-hand simulator and the coach into the marketing bundle
 * to read nine numbers. They are checked against the source above.
 */
const SUBSCORES: { label: string; weight: number; blurb: string }[] = [
  { label: 'Speed', weight: 20, blurb: 'How early the deck can actually do the thing' },
  { label: 'Interaction', weight: 15, blurb: 'Answers held up, not just threats deployed' },
  { label: 'Tutors', weight: 12, blurb: 'Graded by what each one can actually find' },
  { label: 'Resilience', weight: 12, blurb: 'What happens after the board is wiped' },
  { label: 'Mana', weight: 12, blurb: 'Sources, fixing and how many enter untapped' },
  { label: 'Consistency', weight: 12, blurb: 'How often the deck draws its own plan' },
  { label: 'Card advantage', weight: 10, blurb: 'Engines, not one-shot cantrips' },
  { label: 'Stax', weight: 4, blurb: 'Pressure applied to everyone else' },
  { label: 'Synergy', weight: 3, blurb: 'How much the commander is worth to the list' },
];

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
          style={{ width: `${(weight / 20) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{blurb}</p>
    </div>
  );
}

/** A panel of whole cards, with the ones the catalogue table could not resolve dropped. */
function ClassPanel({
  eyebrow,
  title,
  body,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-card p-6 shadow-xl shadow-black/30">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </p>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">
          {count} in the catalogue
        </span>
      </div>
      <h3 className="mt-2 font-medium">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}

function CardWall({ cards }: { cards: MarketingCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {cards.map(card => (
        <figure key={card.id} className="group min-w-0">
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
        eyebrow="Power model"
        title="A power level you can argue with"
        lead="Not a black box. Nine weighted subscores, published below, plus a seeded 10,000-hand simulation for keepable openers and turn-one colour access. Same deck, same score, every time — and the cards that move it are a file in the repository, not a hunch."
      />

      {/* ------------------------------------------------------- the weights */}
      <div className="mt-14 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSCORES.map(entry => (
          <WeightRow key={entry.label} {...entry} />
        ))}
      </div>

      {/* -------------------------------------------------- the game changers */}
      <div className="mt-16">
        <div className="max-w-3xl">
          <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            And the cards it watches for
          </h3>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            A list the model finds no game changer in has speed and resilience docked and up to 1.4
            taken off its score, however tidy its curve looks. These are the four classes it
            recognises, printed straight out of the catalogue it loads.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <ClassPanel
            eyebrow="Compact combo"
            title="Two cards that end the game"
            body="Scored as a pair, not as two good cards. The model knows which partner each half is looking for."
            count={COMPACT_COMBOS.length}
          >
            {combos.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {combos.map(pair => (
                  <ComboPair key={pair.a.id} a={pair.a} b={pair.b} />
                ))}
              </div>
            ) : (
              <div className="h-24" />
            )}
          </ClassPanel>

          <ClassPanel
            eyebrow="Finisher bomb"
            title="The card you cast to win"
            body={`${CONDITIONAL_FINISHERS} of them only count once the rest of the list supports them — Craterhoof wants twenty creatures under it, Aetherflux twenty-five spells.`}
            count={FINISHERS.length}
          >
            <CardWall cards={finishers} />
          </ClassPanel>

          <ClassPanel
            eyebrow="Inevitability engine"
            title="The card that wins it slowly"
            body="Nothing happens the turn it lands. Two turns later the table is a card down and you are three up."
            count={ENGINES.length}
          >
            <CardWall cards={engines} />
          </ClassPanel>

          <ClassPanel
            eyebrow="Massive swing"
            title="The card that undoes the board"
            body="One-sided sweepers and extra turns — the cards that turn a losing table into a won one in a single cast."
            count={SWINGS.length}
          >
            <CardWall cards={swings} />
          </ClassPanel>
        </div>
      </div>

      {/* --------------------------------------------------------- the bands */}
      <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
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
        Weights and bands are {' '}
        <span className="font-mono text-foreground/80">EDHPowerCalculator</span>&rsquo;s own defaults;
        the cards above are its game-changer catalogue, resolved against the card table and drawn in
        full.
      </p>

      <div className="mt-10 text-center">
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
