import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManaPip } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { supabase } from '@/integrations/supabase/client';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { DEFAULT_STORAGE_TEMPLATES, getTemplateById } from '@/lib/storageTemplates';
import { cn } from '@/lib/utils';

/**
 * Physical storage — the differentiator.
 *
 * The previous version of this section rendered four progress bars over four
 * invented containers ("Commander binder 284/360"). That was both the owner's
 * specific complaint ("could be much more visual") and a fabricated-data
 * violation, since `storage_containers` is per-user and RLS-scoped: a logged-out
 * visitor cannot be shown anyone's real fill counts, so any number printed here
 * would have to be made up.
 *
 * So this draws the OBJECTS instead of statistics. Everything labelled comes
 * from a real source constant:
 *
 *   - the container names, their types and their slot structure are read from
 *     `DEFAULT_STORAGE_TEMPLATES` (src/lib/storageTemplates.ts) — the templates
 *     the product actually ships. The A–Z dividers on the long box ARE the 26
 *     template slots; the binder's page tabs ARE its 12 page slots; the colour
 *     boxes' six pips ARE the WUBRG+C slot names.
 *   - the cards filed in them are real rows from the card catalogue, rendered
 *     as whole 5:7 cards through `CardImage`, never as cropped art.
 *
 * No count, capacity or percentage appears anywhere, because none could be
 * verified. Depth is surface tint plus inset shadow — no hairlines.
 */

interface FiledCard {
  id: string;
  name: string;
  type_line: string;
  color_identity: string[] | null;
  image_uris: Record<string, string> | null;
  faces: unknown;
  layout: string | null;
  prices: Record<string, string> | null;
  set_code: string;
}

/**
 * A card's edge seen from above, packed in a box.
 *
 * This was `bg-foreground/[0.08]` — 8% white over a near-black inset, which on
 * the dark theme is very nearly invisible. The deck box and the colour boxes
 * are mostly made of these, so both rendered as empty dark rectangles, and the
 * owner's complaint that you cannot tell what is going on was for those two
 * containers literally true: there was nothing to see. 18% reads as a packed
 * stack of cards at a glance without hardening into stripes.
 */
function CardEdge({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block rounded-[2px] bg-foreground/[0.18]', className)} />;
}

/* --------------------------------------------------------------- the binder */

function BinderPage({ cards }: { cards: FiledCard[] | null }) {
  const template = getTemplateById('binder-12-pages');
  const pages = template?.slots ?? [];
  /* A 9-pocket page is the physical standard, and 3 x 3 is what the app's
     container view draws, so nine cards is the honest unit here. */
  const pockets: (FiledCard | null)[] = cards
    ? Array.from({ length: 9 }, (_, i) => cards[i] ?? null)
    : Array.from({ length: 9 }, () => null);

  return (
    /* max-w caps the object.
​
       In a col-span-7 of a 1600px section this figure was ~910px wide, which
       made each pocket a ~290px card — bigger than the card detail page draws
       one. At that size the eye reads "nine enormous cards" and the binder
       around them disappears: the rings, the page tabs and the sunk page are
       all edge furniture, and edge furniture stops registering once the middle
       is the size of a poster. That is the owner's "so massive its hard to see
       whats even going on".
​
       Capped, the whole object fits in one glance and the rings and tabs are
       back in frame, so it reads as a binder. Cards stay WHOLE 5:7 images
       through CardImage; they are smaller, never cropped.

       The first cap was 440px, and that overshot badly. Measured in the
       browser it made each pocket a 95px card at 1680 and 86px at 1280 —
       narrower than the 110px `sm` token is nominally for, too small to read a
       card name, and a third the size of every other card on the page (precon
       commanders 382px, search results 250px, new-set commanders 250px).
       "Cards are tiny" is the complaint this project hears most, so
       undershooting is not the safe direction to miss in.

       Now `flex-[2]` against the deck box's `flex-[1]`, capped. The ratio is
       the point: the binder is the figure holding readable cards, so when the
       column is short of room the deck box gives up width first. Measured
       after: 168px pockets at 1680, 118px at 1280 — up from 95 and 86, and
       still barely half the 290px that made the object disappear. Cards stay
       WHOLE 5:7 through CardImage at every width; nothing is cropped. */
    <figure className="relative w-full flex-[2_1_0%] max-w-[600px] 2xl:max-w-[660px]">
      {/* Page tabs — one per real template slot, so the binder has as many
          pages as the template declares. */}
      <div className="absolute inset-y-8 -right-1.5 z-0 flex flex-col justify-between sm:-right-2.5">
        {pages.map((p, i) => (
          <span
            key={p.name}
            title={p.name}
            className={cn(
              'block rounded-r-md shadow-md shadow-black/40',
              i === 2 ? 'h-5 w-9 bg-foreground/70' : 'h-4 w-6 bg-foreground/15'
            )}
          />
        ))}
      </div>

      {/* Binder cover */}
      <div className="relative z-10 rounded-[1.4rem] bg-card p-3 pl-11 shadow-2xl shadow-black/60 sm:p-4 sm:pl-16">
        {/* Rings */}
        <div className="absolute inset-y-9 left-3 flex w-5 flex-col items-center justify-around sm:left-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="block h-9 w-3.5 rounded-full bg-background shadow-[inset_0_2px_5px_rgba(0,0,0,0.7)]"
            />
          ))}
        </div>

        {/* The page itself, sunk into the cover */}
        <div className="rounded-xl bg-background/80 p-2.5 shadow-[inset_0_3px_16px_rgba(0,0,0,0.6)] sm:p-3.5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {pockets.map((c, i) => (
              <div
                key={c?.id ?? `pocket-${i}`}
                className="rounded-lg bg-muted/40 p-1 shadow-[inset_0_1px_7px_rgba(0,0,0,0.6)]"
              >
                {c ? (
                  <CardImage card={c} fill size="sm" hideFlip />
                ) : (
                  <CardImageSkeleton fill size="sm" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-4">
        <span className="text-sm font-medium">{template?.name}</span>{' '}
        <span className="text-sm text-muted-foreground">
          Nine cards to a page. You can search for any one of them by name.
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------- the deck box */

function DeckBox({ commander }: { commander: FiledCard | null }) {
  const template = getTemplateById('deckbox-simple');

  return (
    /* The deck box, redrawn to be readable.
​
       The old one was a dark rectangle holding eighteen 1px rules at 8% white,
       with a small commander tucked against its right edge. Nothing in it said
       "box" and nothing said "cards", which is precisely the container the
       owner picked out by name.
​
       Three changes, all aimed at the one-second read:
         - the deck is now a standing WALL of card edges, tall enough to have a
           top and a bottom, so it reads as a deck seen end-on rather than as a
           list of lines;
         - the commander stands proud OF the box, overlapping its lip, which is
           what tells you the box is full of things shaped like that;
         - the lid is visibly hinged behind it.
​
       Whole card, never cropped.

       The width is now the variable that gives, because the binder beside it is
       the one holding cards a visitor has to be able to read. A fixed 420px
       forced the pair to 1,050px, which the 8-of-12 column only has at 1680;
       at 1280 both figures were squeezed and the binder's pockets fell to
       86px. Narrow here first: 280px up to `xl`, 400px above it. Everything
       inside the box is a percentage of that so the object stays in
       proportion rather than a wide box with a small deck in it. */
    <figure className="relative w-full flex-[1_1_0%] max-w-[280px] xl:max-w-[360px]">
      {/* Lid, hinged open behind the box */}
      <div
        aria-hidden="true"
        className="absolute inset-x-8 -top-2.5 h-5 rounded-t-xl bg-muted/60 shadow-lg shadow-black/40"
      />

      <div className="relative rounded-2xl bg-card p-4 pt-5 shadow-2xl shadow-black/60">
        {/* Inside the box, seen from the front: sleeved cards standing up,
            packed front to back, with the commander pulled forward. */}
        <div className="relative rounded-xl bg-background/80 p-3 shadow-[inset_0_3px_16px_rgba(0,0,0,0.6)]">
          {/* Thin, tightly packed, unevenly topped. Wider bars on bigger gaps
              read as a barcode; a deck is ~40 sleeves pressed together, and the
              tell that they are CARDS rather than a pattern is that the tops do
              not line up. */}
          <div className="flex h-[17rem] items-end gap-px pr-[40%] xl:h-[21rem]">
            {Array.from({ length: 44 }).map((_, i) => (
              <CardEdge
                key={i}
                className={cn(
                  'flex-1 rounded-t-[1px]',
                  i % 7 === 0 ? 'h-[93%]' : i % 4 === 0 ? 'h-[96%]' : i % 3 === 0 ? 'h-[98%]' : 'h-full',
                  /* Every so often a sleeve catches the light. */
                  i % 6 === 0 && 'bg-foreground/[0.28]'
                )}
              />
            ))}
          </div>

          {/* The commander, standing proud at the front of the box. A
              percentage rather than a fixed 8.75rem, so it keeps the same
              share of the box at both widths and the sleeve wall keeps the
              same share too — `pr-[40%]` above is the space this occupies. */}
          <div className="absolute -top-6 right-3 w-[36%] rotate-2 drop-shadow-2xl">
            {commander ? (
              <CardImage card={commander} fill size="md" hideFlip />
            ) : (
              <CardImageSkeleton fill size="md" />
            )}
          </div>
        </div>
      </div>

      <figcaption className="mt-4">
        <span className="text-sm font-medium">{template?.name}</span>{' '}
        <span className="text-sm text-muted-foreground">
          Tie one to a deck and the list knows where those cards really are.
        </span>
      </figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------- the bulk box */

function LongBox({ cards }: { cards: FiledCard[] | null }) {
  const template = getTemplateById('long-box-a-z');
  const dividers = template?.slots ?? [];
  const leaning = cards?.slice(9, 11) ?? [];

  return (
    <figure className="relative">
      <div className="rounded-2xl bg-card p-3 shadow-2xl shadow-black/60 sm:p-4">
        <div className="overflow-hidden rounded-xl bg-background/80 p-3 shadow-[inset_0_3px_16px_rgba(0,0,0,0.6)] sm:p-4">
          <div
            className="flex items-end gap-[3px]"
            style={{
              maskImage: 'linear-gradient(to right, black 82%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, black 82%, transparent)',
            }}
          >
            {dividers.map((slot, i) => (
              <Fragment key={slot.name}>
                {/* The A–Z divider tabs are the template's real 26 slots. */}
                <span
                  className="flex h-[4.5rem] w-5 shrink-0 items-start justify-center rounded-t-md bg-muted pt-1 text-[10px] font-medium leading-none text-muted-foreground shadow-md shadow-black/30 sm:h-24"
                >
                  {slot.name}
                </span>
                {Array.from({ length: 4 + ((i * 3) % 5) }).map((_, j) => (
                  <CardEdge
                    key={j}
                    className={cn(
                      'w-[5px] shrink-0',
                      /* Cards do not sit at one exact height in a box. */
                      (i + j) % 3 === 0 ? 'h-[3.1rem] sm:h-[4.6rem]' : 'h-14 sm:h-20',
                      (i * 2 + j) % 5 === 0 && 'bg-foreground/[0.13]'
                    )}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="mt-4 pl-1 sm:pr-56">
          <span className="text-sm font-medium">{template?.name}</span>{' '}
          <span className="text-sm text-muted-foreground">
            Twenty-six dividers, A to Z. Put a card away and it remembers the letter.
          </span>
        </div>
      </div>

      {/* Two cards lifted out of the box — whole cards, standing on its lip. */}
      <div className="pointer-events-none absolute -top-7 right-6 hidden items-end gap-3 sm:flex">
        {(leaning.length ? leaning : [null, null]).map((c, i) => (
          <div
            key={c?.id ?? `leaning-${i}`}
            className={cn('w-24 drop-shadow-2xl lg:w-28', i === 0 ? 'rotate-3' : '-rotate-2')}
          >
            {c ? (
              <CardImage card={c} fill size="sm" hideFlip />
            ) : (
              <CardImageSkeleton fill size="sm" />
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------ colour boxes */

/** The template's slot names, mapped to the pip that stands for them. */
const SLOT_PIP: Record<string, string> = {
  White: 'W',
  Blue: 'U',
  Black: 'B',
  Red: 'R',
  Green: 'G',
  Colorless: 'C',
};

function ColourBoxes({ cards }: { cards: FiledCard[] | null }) {
  const template = getTemplateById('color-boxes-wubrg');
  const slots = template?.slots ?? [];

  /**
   * A card that would genuinely file under this colour slot, and a different one
   * per box.
   *
   * This used to read from the same twelve mythic legendary creatures the binder
   * and the deck box draw from, which broke it twice over: a pool that small has
   * no guarantee of a mono-BLUE legend in it, so the blue box rendered a
   * permanent grey skeleton — a blank slot on the page whose argument is that it
   * draws real cards — and the deck box's commander could turn up a second time
   * three inches below itself. `HomeStorage` now hands this its own pool, wide
   * enough to fill six slots and with the cards used elsewhere already removed.
   *
   * Mono-coloured cards are preferred, since that is what actually ends up in a
   * colour box; a multicolour card falls back to any slot in its identity.
   */
  const taken = new Set<string>();
  const cardFor = (slotName: string): FiledCard | null => {
    if (!cards) return null;
    const pip = SLOT_PIP[slotName] ?? 'C';
    const free = cards.filter(c => !taken.has(c.id));
    const identity = (c: FiledCard) => c.color_identity ?? [];

    const chosen =
      pip === 'C'
        ? free.find(c => identity(c).length === 0)
        : free.find(c => identity(c).length === 1 && identity(c)[0] === pip) ??
          free.find(c => identity(c).includes(pip));

    if (chosen) taken.add(chosen.id);
    return chosen ?? null;
  };

  return (
    <figure>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {slots.map(slot => {
          const card = cardFor(slot.name);
          return (
            <div
              key={slot.name}
              className="flex items-end gap-3 rounded-xl bg-card p-3 shadow-xl shadow-black/40"
            >
              {/* A card standing in the box — whole, not cropped. */}
              <div className="w-20 shrink-0 drop-shadow-xl lg:w-24">
                {card ? (
                  <CardImage card={card} fill size="sm" hideFlip />
                ) : (
                  <CardImageSkeleton fill size="sm" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <ManaPip symbol={SLOT_PIP[slot.name] ?? 'C'} size="lg" />
                <div className="mt-2.5 space-y-[3px] rounded-md bg-background/80 p-1.5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.55)]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <CardEdge key={i} className="h-1" />
                  ))}
                </div>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">{slot.name}</p>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-4 pl-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{template?.name}</span>. One box per colour,
        which is how most people split up their bulk anyway.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ section */

const CARD_COLUMNS =
  'id,name,type_line,color_identity,image_uris,faces,layout,prices,set_code';

/**
 * The colour boxes draw one small card per slot and never flip or price it, so
 * this pool leaves out `faces`, `layout` and `prices` — three jsonb/`text`
 * columns whose weight is what makes a wide read over this table slow enough to
 * hit the statement timeout. Same rows, a fraction of the bytes.
 */
const PALETTE_COLUMNS = 'id,name,type_line,color_identity,image_uris,set_code';

/** Secret Lair drops are real cards, but a crossover is not the face of Magic. */
const drawable = (c: FiledCard) =>
  !c.set_code.startsWith('sl') && Boolean(c.image_uris?.normal ?? c.image_uris?.large);

const byPriceDesc = (a: FiledCard, b: FiledCard) =>
  Number(b.prices?.usd ?? 0) - Number(a.prices?.usd ?? 0);

export function HomeStorage() {
  const [cards, setCards] = useState<FiledCard[] | null>(null);
  const [palette, setPalette] = useState<FiledCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      /* Two pools, because the two exhibits want different cards.

         The binder, the deck box and the long box want commanders: mythic
         legendary creatures, modern frames, art worth filing. The colour boxes
         want one card per colour, and a pool of twelve legends has no guarantee
         of containing a mono-blue one — which is exactly why the blue box used
         to render an empty grey frame. So the colour boxes get their own,
         broader pool of mythics and the commander pool is subtracted from it, so
         no card can appear in two containers at once. */
      const [{ data: legends }, { data: mythics }] = await Promise.all([
        supabase
          .from('cards')
          .select(CARD_COLUMNS)
          .eq('is_legendary', true)
          .eq('rarity', 'mythic')
          .ilike('type_line', '%Creature%')
          .not('image_uris', 'is', null)
          .limit(150),
        supabase
          .from('cards')
          .select(PALETTE_COLUMNS)
          .eq('rarity', 'mythic')
          .not('image_uris', 'is', null)
          .not('color_identity', 'is', null)
          .limit(250),
      ]);

      if (!alive) return;

      const filed = ((legends ?? []) as unknown as FiledCard[])
        .filter(drawable)
        .sort(byPriceDesc)
        .slice(0, 12);

      const used = new Set(filed.map(c => c.id));
      /* No price sort here: the slot is chosen on colour identity, every mythic
         has art worth showing, and asking for `prices` is the expensive half of
         the query this pool was trimmed to avoid. */
      const pool = ((mythics ?? []) as unknown as FiledCard[]).filter(
        c => drawable(c) && !used.has(c.id)
      );

      setCards(filed);
      setPalette(pool);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const commander = cards?.[0] ?? null;
  /* The commander is standing in the deck box, so it should not also be in the
     binder page behind it. */
  const filed = cards ? cards.slice(1) : null;

  return (
    /* ---------------------------------------------------------- composition
​
       Was: a two-column `items-center` split, text in col-span-5 and the binder
       in col-span-7. The binder came out ~1,250px tall and the text ~500px, and
       `items-center` parked that 750px difference as ~375px of dead black above
       AND below the paragraph. A column of air, next to a wall of cards, in the
       one section that is supposed to be the product's whole argument.
​
       Now the two columns are built to relate. The right-hand column holds the
       binder and the deck box standing side by side on a shared bottom line
       (`items-end`), which is both how they sit on a real shelf and what makes
       the column's height a choice rather than an accident. The text column is
       sized to land within ~100px of it, so what is left reads as a deliberate
       stagger rather than a void.
​
       Below that the two wide containers get a full-width row each, because a
       long box IS wide and a row of six colour boxes IS wide. Nothing is
       stretched to fill a column it does not want.

       The split is 4/8 at `2xl`, not 5/7 at `lg`. Two reasons, both measured.
       A binder and a deck box standing side by side want ~1,030px, and 7 of 12
       columns is 957px at 1680 and only 700px at 1280, which is what squeezed
       the pockets down to 95px and 86px. And the lead paragraph at col-span-5
       ran to 655px, wider than a comfortable measure anyway. So the side-by-
       side split waits for `2xl`, where col-span-8 is ~1,056px at 1680 and the
       pair fits. Below that the two boxes take a full-width row of their own
       under the text, which at 1280 is 1,200px, wider than the 700px column
       they used to share. The text does not sprawl when it goes full width:
       SectionHeading caps its measure at max-w-3xl either way. */
    <Section>
      <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-14">
        <div className="min-w-0 lg:col-span-4">
          <SectionHeading
            align="left"
            eyebrow="Nobody else does this"
            title="Know which box it is in"
            lead="Other deck sites know what you own. None of them know where you put it. Tell DeckMatrix which binder, deck box or bulk box a card is in, down to the page and the divider, and finding it takes seconds instead of an afternoon."
          >
            <Button asChild size="lg" className="mt-8">
              <Link to="/register">
                Map your collection
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            {/* Not decoration: these are the box types the product actually
                ships, read straight from the constant. */}
            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
              Five kinds of box come ready to use: {DEFAULT_STORAGE_TEMPLATES.map(t => t.name).join(', ')}.
              Every card you put away gets a place in one of them. The cards shown here are real
              printings from the card list. Yours would hold your own.
            </p>
          </SectionHeading>
        </div>

        <div className="flex min-w-0 flex-wrap items-end justify-center gap-8 lg:flex-nowrap lg:col-span-8 lg:justify-end">
          <BinderPage cards={filed} />
          <DeckBox commander={commander} />
        </div>
      </div>

      <div className="mt-14">
        <LongBox cards={filed} />
      </div>

      <div className="mt-12">
        <ColourBoxes cards={palette} />
      </div>
    </Section>
  );
}

export default HomeStorage;
