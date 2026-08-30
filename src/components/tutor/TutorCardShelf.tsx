import { useEffect, useState } from 'react';
import { uniqueCards } from '@/lib/cards/cardQuery';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { TUTOR_CARD_COLUMNS, type TutorCard } from './ContextPicker';

/**
 * Cards to ask about, on the page whose entire subject is cards.
 *
 * WHY IT EXISTS
 * -------------
 * The Tutor empty state measured as the emptiest screen in the app: about
 * 1,240 by 255 pixels of flat black between the example prompts and the
 * composer at 1600 wide, and ZERO card images anywhere on a page about Magic
 * cards. The prompt chips even named Rhystic Study without showing it.
 *
 * The owner's standing brief is that visual is always better and that a card
 * should be shown wherever one is referenced, so a shelf of real cards is the
 * obvious thing to put there. It is not decoration: the page already accepts a
 * card as the subject of every question, and clicking one here attaches it,
 * which is the same action the picker at the top performs in two more clicks.
 *
 * WHOLE CARDS, NOT CROPS
 * ----------------------
 * Owner: "try not to use cut cropped card images, always show the full card
 * image instead (means box size larger)". So the tiles are 5:7 and the image
 * fills them at its own aspect, and the grid gets fewer columns rather than
 * squatter boxes. It is also the only treatment Scryfall's guidelines permit
 * without qualification: a card shown whole and unmodified.
 *
 * NOTHING HERE IS CHOSEN BY US
 * ----------------------------
 * The order is `edhrec_rank`, which is how many real decks play each card. That
 * is a fact in the database rather than an editorial list, which matters
 * because the alternative is a hand-picked set of favourites presented as if it
 * meant something. The heading says what the ordering is for the same reason.
 */

/**
 * How many to show. ONE row at the widest breakpoint, and that is a height
 * decision rather than a taste one.
 *
 * Sixteen was the first draft and it measured as the very fault it was added to
 * fix. The empty state lives inside a scroll pane with `flex-1`, so at a
 * 1000px viewport the shelf gets whatever height is left over: the second row
 * was clipped away entirely and the first lost its bottom third, cutting every
 * card off mid-art. Reachable by scrolling the pane, and still a cut card at
 * rest, which is the complaint.
 *
 * SIX, three across on a phone, because the owner asked for the box to be
 * LARGER and not for more of them: at eight across a 390px screen the cards
 * were 80px wide, unreadable, and the fourth was clipped by the edge. Six also
 * divides evenly at both breakpoints, so there is no ragged last row.
 *
 * `nav-audit` caught none of this. Its crop check looks for `object-fit:
 * cover` on a wrong-aspect box, and these were clipped by an ancestor instead.
 * Look at the screenshot as well as the number.
 */
const SHELF_SIZE = 6;

/* THE SAME COLUMNS THE PICKER FETCHES, imported rather than restated.
   A hand-rolled list here left `collector_number` out, and the context panel
   prints "${set} #${collector_number ?? '?'}", so attaching a card off the
   shelf showed "MSC #?" while attaching the identical card through the picker
   showed the real number. One list, one behaviour, whichever door was used. */

export interface TutorCardShelfProps {
  onPick: (card: TutorCard) => void;
  className?: string;
}

export function TutorCardShelf({ onPick, className }: TutorCardShelfProps) {
  const [cards, setCards] = useState<TutorCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await uniqueCards()
        .select(TUTOR_CARD_COLUMNS)
        .eq('legalities->>commander', 'legal')
        .not('edhrec_rank', 'is', null)
        .not('image_uris', 'is', null)
        .order('edhrec_rank', { ascending: true })
        .limit(SHELF_SIZE);

      if (!live) return;
      /* A failed lookup and an empty catalogue look identical if the error is
         discarded, which is how "none of these are cards" once passed for
         healthy on this feature. */
      if (error) {
        console.warn('tutor card shelf: the catalogue lookup failed', error);
        setFailed(true);
        return;
      }
      setCards((data ?? []) as TutorCard[]);
    })();
    return () => {
      live = false;
    };
  }, []);

  /* No shelf rather than an apology. The page is already usable without it and
     an error panel where cards should be is worse than the space. */
  if (failed || (cards && cards.length === 0)) return null;

  return (
    <div className={className}>
      <div className="mb-3 text-center">
        <p className="text-sm text-muted-foreground">Pick a card to ask about</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          The cards played in more Commander decks than any others
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {cards === null
          ? Array.from({ length: SHELF_SIZE }, (_, i) => (
              /* Same 5:7 box the real tiles use, so nothing moves when they
                 arrive. A shelf that reflows on load is worse than a slow one. */
              <CardImageSkeleton key={i} fill />
            ))
          : cards.map(card => (
              <button
                key={card.id}
                type="button"
                onClick={() => onPick(card)}
                title={`Ask about ${card.name}`}
                aria-label={`Ask about ${card.name}`}
                className="group rounded-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardImage card={card} fill interactive />
                <span className="mt-1.5 block truncate text-center text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
                  {card.name}
                </span>
              </button>
            ))}
      </div>
    </div>
  );
}
