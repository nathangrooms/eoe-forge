import { CardImage } from '@/components/cards/CardImage';
import { ColorIdentity } from '@/components/ui/mana-cost';
import identityGround from '@/lib/cards/identityGround';
import { cn } from '@/lib/utils';

/**
 * What deck this is, shown rather than named.
 *
 * WHY IT EXISTS
 * -------------
 * `/deck/:id/share` measured as the emptiest screen in the app after Tutor:
 * 422 of 1,000 pixels below the fold were flat black, and the deck being
 * published appeared nowhere except three times in prose. A share page that
 * cannot show you what you are about to publish is asking for a decision
 * without the evidence.
 *
 * Design law 5 is the rule it was breaking by name: "A deck is represented by
 * its commander's art." One subject, on a surface that was otherwise a flat
 * charcoal field.
 *
 * THE GROUND IS NOT BLURRED CARD ART, AND THAT IS DELIBERATE
 * ----------------------------------------------------------
 * The first draft of this file blurred the commander's `art_crop` behind the
 * panel, following the "blurred art as identity ground" pattern in CLAUDE.md.
 * That pattern has since been withdrawn and `src/lib/cards/identityGround.ts`
 * records why: Scryfall's image guidelines say "Do not blur, sharpen,
 * desaturate, or color-shift card images", and the downside of guessing wrong
 * is losing the API this product is built on.
 *
 * So the colour comes from the deck's COLOUR IDENTITY, which is our own derived
 * data rather than Wizards' artwork, through the same helper the precon tiles
 * and the playmat use. It carries the meaning at least as well: a four-colour
 * deck reads as four colours whether or not its commander's illustration does.
 *
 * The card on top is WHOLE and unmodified, which is the owner's standing rule
 * and the one use of card imagery the guidelines permit without qualification.
 *
 * NOTHING HERE IS INVENTED
 * ------------------------
 * Every figure is read from the deck record. A deck with no commander gets no
 * ground and no card, because the honest thing to draw for a deck with no
 * commander is the fact that it has none.
 */

export interface DeckIdentityHeroProps {
  name: string;
  format: string;
  /** A `cards` row. Null when the deck has no commander yet. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commanderCard?: any | null;
  commanderName?: string | null;
  cardCount?: number;
  colors?: string[];
  /** Said above the name, e.g. "This is what people will see". */
  eyebrow?: string;
  className?: string;
}

export function DeckIdentityHero({
  name,
  format,
  commanderCard,
  commanderName,
  cardCount,
  colors,
  eyebrow,
  className,
}: DeckIdentityHeroProps) {
  /* The deck's own colours, falling back to the commander's. `user_decks.colors`
     is empty on decks that predate it being written, and the commander is the
     thing that decides a Commander deck's identity anyway. */
  const identity =
    colors && colors.length > 0
      ? colors
      : ((commanderCard?.color_identity as string[] | undefined) ?? []);
  const ground = identityGround(identity);

  return (
    <section className={cn('relative overflow-hidden rounded-xl bg-card', className)}>
      {ground && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: ground }}
        />
      )}

      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6">
        {commanderCard ? (
          /* Whole, and large. The owner's rule is that a bigger box beats a
             cropped card, so this is a real card and not a thumbnail. */
          <CardImage card={commanderCard} width={200} className="shrink-0 self-start" />
        ) : (
          <div className="flex w-[200px] shrink-0 items-center justify-center self-start rounded-lg bg-muted/60 p-4 text-center text-sm text-muted-foreground"
               style={{ aspectRatio: '5 / 7' }}>
            No commander yet
          </div>
        )}

        <div className="min-w-0 space-y-2">
          {eyebrow && (
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">{name}</h2>

          {commanderName && (
            <p className="text-sm text-muted-foreground">
              Commanded by <span className="text-foreground">{commanderName}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm text-muted-foreground">
            <span className="capitalize text-foreground">{format}</span>
            {typeof cardCount === 'number' && cardCount > 0 && (
              <span>
                <span className="text-foreground">{cardCount}</span> cards
              </span>
            )}
            {identity.length > 0 && <ColorIdentity colors={identity} />}
          </div>
        </div>
      </div>
    </section>
  );
}
