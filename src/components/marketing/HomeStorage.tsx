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

/** A card's edge seen from above, packed in a box. */
function CardEdge({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block rounded-[2px] bg-foreground/[0.08]', className)} />;
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
    <figure className="relative">
      {/* Page tabs — one per real template slot, so the binder has as many
          pages as the template declares. */}
      <div className="absolute inset-y-10 -right-1.5 z-0 flex flex-col justify-between sm:-right-2.5">
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

      <figcaption className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{template?.name}</span>
        <span className="text-sm text-muted-foreground">
          Nine pockets a page, and every pocket is a slot you can search by.
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------- the deck box */

function DeckBox({ commander }: { commander: FiledCard | null }) {
  const template = getTemplateById('deckbox-simple');

  return (
    <figure className="relative">
      <div className="relative rounded-2xl bg-card p-4 pb-5 shadow-2xl shadow-black/60">
        {/* Lid, hinged open behind the box */}
        <div
          aria-hidden="true"
          className="absolute inset-x-6 -top-3 h-6 rounded-t-xl bg-muted/60 shadow-lg shadow-black/40"
        />
        {/* The deck seen from above: sleeved card edges packed front to back,
            with the commander standing proud at the front of the box. */}
        <div className="relative rounded-xl bg-background/80 p-3 pr-[7.5rem] shadow-[inset_0_3px_16px_rgba(0,0,0,0.6)] sm:pr-[8.5rem]">
          <div className="space-y-[3px] py-1">
            {Array.from({ length: 18 }).map((_, i) => (
              <CardEdge key={i} className={cn('h-1', i % 6 === 0 && 'bg-foreground/[0.18]')} />
            ))}
          </div>

          <div className="absolute -right-2 -top-6 w-28 rotate-3 drop-shadow-2xl sm:w-32">
            {commander ? (
              <CardImage card={commander} fill size="md" hideFlip />
            ) : (
              <CardImageSkeleton fill size="md" />
            )}
          </div>
        </div>

        <p className="mt-4 pl-1 text-sm font-medium">{template?.name}</p>
        <p className="pl-1 text-sm text-muted-foreground">
          Link it to a deck and the list knows where the cards physically are.
        </p>
      </div>
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

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-1 sm:pr-56">
          <span className="text-sm font-medium">{template?.name}</span>
          <span className="text-sm text-muted-foreground">
            Twenty-six dividers, straight out of the template. Filing a card writes down its letter.
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
   * A card that would genuinely file under this colour slot, and a different
   * one per box — the same card appearing in two boxes reads as a bug.
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
      <figcaption className="mt-5 pl-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{template?.name}</span> — six slots, one per
        colour, the way most players actually break down a bulk collection.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ section */

export function HomeStorage() {
  const [cards, setCards] = useState<FiledCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      /* Mythic legendary creatures: real commanders, modern frames, art worth
         filing. `.limit(150)` keeps the payload small; the Secret Lair filter
         is there because sorting by price otherwise surfaces crossover drops
         (My Little Pony et al) rather than Magic. */
      const { data } = await supabase
        .from('cards')
        .select('id,name,type_line,color_identity,image_uris,faces,layout,prices,set_code')
        .eq('is_legendary', true)
        .eq('rarity', 'mythic')
        .ilike('type_line', '%Creature%')
        .not('image_uris', 'is', null)
        .limit(150);

      if (!alive) return;

      const list = ((data ?? []) as unknown as FiledCard[])
        .filter(
          c =>
            /* Secret Lair drops (sld, slx, …) are real cards but they are
               crossovers — Rainbow Dash at the top of a Magic page is exactly
               the note the audit raised. */
            !c.set_code.startsWith('sl') &&
            Boolean(c.image_uris?.normal ?? c.image_uris?.large)
        )
        .sort((a, b) => Number(b.prices?.usd ?? 0) - Number(a.prices?.usd ?? 0))
        .slice(0, 12);

      setCards(list.length ? list : []);
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
    <Section tint>
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-5">
          <SectionHeading
            align="left"
            eyebrow="Nobody else does this"
            title="Know which box it is in"
            lead="Moxfield and Archidekt know what you own. Neither knows where it is. Map your collection onto the real furniture — binders, deck boxes, bulk boxes — down to the page, the divider and the slot, so finding a card is a lookup instead of an afternoon."
          >
            <Button asChild size="lg" className="mt-8">
              <Link to="/register">
                Map your collection
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            {/* The container names on the right are not decoration: they are the
                templates the product ships, read straight from the constant. */}
            <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
              {DEFAULT_STORAGE_TEMPLATES.map(t => t.name).join(', ')} — the container templates
              DeckMatrix ships with. Pages, dividers and colours become named slots, and every card
              you file is written to one, so the collection can answer "where is it" as well as "do
              I own it". The cards below are real printings from the catalogue; your containers hold
              yours.
            </p>
          </SectionHeading>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <BinderPage cards={filed} />
        </div>
      </div>

      <div className="mt-16 grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-4">
          <DeckBox commander={commander} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <LongBox cards={filed} />
        </div>
      </div>

      <div className="mt-16">
        <ColourBoxes cards={cards} />
      </div>
    </Section>
  );
}

export default HomeStorage;
