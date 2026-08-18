/**
 * Homepage — play mode.
 *
 * `/play` is a genuinely playable table against a bot and the homepage did not
 * mention it existed. This draws the table the way the real one is laid out, in
 * CSS, from real `cards` rows: permanents in rows with lands in their own row
 * below the rest (the rule `Battlefield.tsx` is built around), tapped permanents
 * turned ninety degrees, the commander in its own zone, and the hand fanned
 * along the bottom edge rather than clipped by it.
 *
 * The board is a depiction of a game, not a claim about one — no counts of games
 * played, no usage numbers. What is asserted in the copy (bot opponent, three
 * views, the twelve-step turn with decision-free steps walked automatically) was
 * read out of `src/components/play` and `src/lib/game` before it was written.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Hand as HandIcon, LayoutGrid, Swords } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { cn } from '@/lib/utils';

import { Section, SectionHeading } from '@/components/marketing/Section';
import {
  loadCardsByName,
  useDeferred,
  useNearViewport,
  type MarketingCard,
} from '@/components/marketing/sectionData';

/* -------------------------------------------------------------------------- */
/* The board                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A coherent mid-game Selesnya board. Coherent matters: an arbitrary pile of
 * expensive rares under a commander that cannot cast them is the exact "lie by
 * juxtaposition" the builder mock was pulled up for. These lands make this
 * commander's colours, and these creatures are castable off them.
 */
const COMMANDER = "Trostani, Selesnya's Voice";
const BOT_COMMANDER = 'Lazav, Dimir Mastermind';

const YOUR_CREATURES: Array<{ name: string; tapped?: boolean }> = [
  { name: 'Sigarda, Host of Herons' },
  { name: 'Sun Titan', tapped: true },
  { name: 'Eternal Witness' },
  { name: 'Llanowar Elves', tapped: true },
];

const YOUR_LANDS: Array<{ name: string; tapped?: boolean }> = [
  { name: 'Command Tower', tapped: true },
  { name: 'Temple Garden' },
  { name: 'Sunpetal Grove' },
  { name: 'Forest' },
  { name: 'Plains', tapped: true },
];

const BOT_CREATURES: Array<{ name: string; tapped?: boolean }> = [
  { name: 'Consecrated Sphinx' },
  { name: 'Snapcaster Mage', tapped: true },
];

const BOT_LANDS: Array<{ name: string; tapped?: boolean }> = [
  { name: 'Watery Grave' },
  { name: 'Island' },
  { name: 'Swamp', tapped: true },
];

const YOUR_HAND = [
  'Swords to Plowshares',
  'Beast Within',
  'Wrath of God',
  'Sol Ring',
  'Smothering Tithe',
];

const ALL_NAMES = Array.from(
  new Set([
    COMMANDER,
    BOT_COMMANDER,
    ...YOUR_CREATURES.map(c => c.name),
    ...YOUR_LANDS.map(c => c.name),
    ...BOT_CREATURES.map(c => c.name),
    ...BOT_LANDS.map(c => c.name),
    ...YOUR_HAND,
  ])
);

const loadTable = () => loadCardsByName('play-table', ALL_NAMES);

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/** A real Magic card is 63 x 88 mm; `CardImage` draws at 488 x 680. */
const CARD_RATIO = 680 / 488;

/**
 * One permanent on the battlefield.
 *
 * A tapped card is rotated ninety degrees, and a CSS rotation does not change
 * the layout box — so the wrapper swaps its own width and height first and the
 * card is spun inside it. Without that, a tapped permanent overlaps its
 * neighbours instead of taking the wider footprint it really occupies.
 */
function Permanent({
  card,
  width,
  tapped = false,
}: {
  card: MarketingCard | undefined;
  width: number;
  tapped?: boolean;
}) {
  const height = Math.round(width * CARD_RATIO);

  return (
    <span
      className="relative block shrink-0"
      style={{ width: tapped ? height : width, height: tapped ? width : height }}
    >
      <span
        className="absolute left-1/2 top-1/2 block origin-center"
        style={{ transform: `translate(-50%, -50%) rotate(${tapped ? 90 : 0}deg)` }}
      >
        {card ? (
          <CardImage card={card} size="sm" width={width} title={card.name} />
        ) : (
          <CardImageSkeleton size="sm" width={width} />
        )}
      </span>
    </span>
  );
}

function PermanentRow({
  cards,
  lookup,
  width,
  className,
}: {
  cards: Array<{ name: string; tapped?: boolean }>;
  lookup: Map<string, MarketingCard> | null;
  width: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-2 sm:gap-3', className)}>
      {cards.map((c, i) => (
        <Permanent
          key={`${c.name}-${i}`}
          card={lookup?.get(c.name.toLowerCase())}
          width={width}
          tapped={c.tapped}
        />
      ))}
    </div>
  );
}

function ZoneLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  );
}

/** A seat's line: who it is, their life, and the two counts that matter. */
function SeatLine({
  name,
  note,
  life,
  hand,
  library,
  align = 'left',
}: {
  name: string;
  note: string;
  life: number;
  hand: number;
  library: number;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4',
        align === 'right' && 'flex-row-reverse text-right'
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-lg font-semibold tabular-nums">
        {life}
      </span>
      <div className={cn('min-w-0', align === 'right' && 'text-right')}>
        <p className="text-sm font-medium leading-tight">{name}</p>
        <p className="text-[11px] text-muted-foreground">{note}</p>
      </div>
      <div
        className={cn(
          'ml-auto flex shrink-0 gap-2 text-[11px] tabular-nums text-muted-foreground',
          align === 'right' && 'ml-0 mr-auto'
        )}
      >
        <span className="rounded-full bg-muted/40 px-2.5 py-1">Hand {hand}</span>
        <span className="rounded-full bg-muted/40 px-2.5 py-1">Library {library}</span>
      </div>
    </div>
  );
}

/** Magic's turn structure, collapsed to the strip the HUD shows. */
const PHASES = ['Untap', 'Upkeep', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End'];
const ACTIVE_PHASE = 'Main 1';

const VIEWS = [
  { id: 'table', label: 'Table', icon: LayoutGrid },
  { id: 'hand', label: 'Hand', icon: HandIcon },
  { id: 'combat', label: 'Combat', icon: Swords },
];

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

export function HomePlayTable() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const lookup = useDeferred(near, loadTable);

  const commander = lookup?.get(COMMANDER.toLowerCase());
  const botCommander = lookup?.get(BOT_COMMANDER.toLowerCase());

  return (
    <Section tint>
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        eyebrow="Play"
        title="Play a real game, in the browser"
        lead="Sit one of your decks down against a bot. Permanents lie in rows the way they lie on a table, lands in their own row underneath, tapped means turned. Switch between the table, your hand at a readable size, and a combat view for declaring attackers and blockers — and the steps of the turn that hold no decision are walked for you."
      />

      <div className="mt-14 overflow-hidden rounded-2xl bg-background shadow-2xl shadow-black/40">
        {/* ------------------------------------------------------------- HUD */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-muted/40 px-5 py-3">
          <div className="flex gap-1">
            {VIEWS.map((v, i) => (
              <span
                key={v.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
                  i === 0 ? 'bg-foreground text-background' : 'text-muted-foreground'
                )}
              >
                <v.icon className="h-3.5 w-3.5" aria-hidden />
                {v.label}
              </span>
            ))}
          </div>

          <div className="hidden items-center gap-1 md:flex">
            {PHASES.map(p => (
              <span
                key={p}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px]',
                  p === ACTIVE_PHASE
                    ? 'bg-foreground/15 font-medium text-foreground'
                    : 'text-muted-foreground/70'
                )}
              >
                {p}
              </span>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">Turn 7</span>
            <span className="rounded-lg bg-destructive px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-destructive-foreground">
              End turn
            </span>
          </div>
        </div>

        {/* ----------------------------------------------------------- table */}
        <div className="space-y-6 px-4 py-6 sm:px-8 sm:py-8">
          {/* ---- opponent, across the table: lands furthest away ---- */}
          <div className="rounded-2xl bg-muted/20 p-4 sm:p-5">
            <SeatLine
              name="Bot"
              note="Lazav, Dimir Mastermind · even — trades up and blocks sensibly"
              life={34}
              hand={4}
              library={71}
              align="right"
            />
            {/* Mirrored: the seat across the table has its command zone on the
                far side and its rows running back towards the middle. */}
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-3">
                <div>
                  <ZoneLabel className="text-right">Lands</ZoneLabel>
                  <PermanentRow
                    cards={BOT_LANDS}
                    lookup={lookup}
                    width={62}
                    className="justify-end"
                  />
                </div>
                <div>
                  <ZoneLabel className="text-right">Battlefield</ZoneLabel>
                  <PermanentRow
                    cards={BOT_CREATURES}
                    lookup={lookup}
                    width={80}
                    className="justify-end"
                  />
                </div>
              </div>

              <div>
                <ZoneLabel className="text-right">Command zone</ZoneLabel>
                <div className="flex justify-end">
                  {botCommander ? (
                    <CardImage card={botCommander} size="sm" width={80} />
                  ) : (
                    <CardImageSkeleton size="sm" width={80} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ---- you, near edge: battlefield then lands underneath ---- */}
          <div className="rounded-2xl bg-muted/30 p-4 sm:p-5">
            <SeatLine
              name="You"
              note="Trostani, Selesnya's Voice · Commander"
              life={29}
              hand={5}
              library={63}
            />

            <div className="mt-4 grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
              <div>
                <ZoneLabel>Command zone</ZoneLabel>
                {commander ? (
                  <CardImage card={commander} size="sm" width={88} />
                ) : (
                  <CardImageSkeleton size="sm" width={88} />
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <ZoneLabel>Battlefield</ZoneLabel>
                  <PermanentRow cards={YOUR_CREATURES} lookup={lookup} width={88} />
                </div>
                <div>
                  <ZoneLabel>Lands</ZoneLabel>
                  <PermanentRow cards={YOUR_LANDS} lookup={lookup} width={66} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------ hand */}
        <div className="bg-muted/40 px-4 pb-8 pt-5 sm:px-8">
          <ZoneLabel>Your hand · 5</ZoneLabel>
          <div className="flex justify-center pt-2">
            {YOUR_HAND.map((name, i) => {
              const mid = (YOUR_HAND.length - 1) / 2;
              const offset = i - mid;
              const card = lookup?.get(name.toLowerCase());
              return (
                <span
                  key={name}
                  className="block origin-bottom transition-transform duration-300 hover:z-20 hover:-translate-y-3"
                  style={{
                    marginLeft: i === 0 ? 0 : -26,
                    transform: `rotate(${offset * 4}deg) translateY(${Math.abs(offset) * 7}px)`,
                    zIndex: i,
                  }}
                >
                  {card ? (
                    <CardImage card={card} size="sm" width={104} title={name} />
                  ) : (
                    <CardImageSkeleton size="sm" width={104} />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg">
          <Link to="/play">
            Sit down at the table
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomePlayTable;
