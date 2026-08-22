import { Activity } from 'lucide-react';
import { formatTimeAgo } from '@/features/dashboard/value';
import { useActivityFeed } from '@/features/dashboard/activity';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import { RailSection, RailEmpty, railTileWidth } from './RailSection';
import { RailTile } from './RailTile';

/**
 * What you did last, told through the cards it happened to, two at a time.
 *
 * The owner's layout: "recent activity should show 2 only (same size as recent
 * decks) so 5 total in first row. Also scrollbar on activity." Same rail as the
 * decks beside it, same tile component, so the two really are the same size
 * rather than close enough. The rest of the feed pages behind these two.
 *
 * Every row leads with artwork: the card that was scanned or added, or the
 * commander of the deck that was touched. A row used to read "Added 1 card"
 * beside a grey square, which is a receipt rather than a memory.
 */

/* Six across, not two. These two rails moved from a narrow column into a full
   width row of their own, and their per-view count did not move with them, so
   the owner got "2 massive ones" where a dozen fit. The rail still scrolls, so
   this is how many are VISIBLE rather than how many exist. */
const PER_VIEW = 6;

/** Enough to page through without making the feed a second collection browser. */
const FEED_LENGTH = 18;

export function RecentActivity({ className }: { className?: string }) {
  const { entries, loading, error } = useActivityFeed(FEED_LENGTH);

  /* One batched join back to `cards` for the whole feed: the added card for a
     collection entry, the commander for a deck entry. */
  const lookup = useCardLookup(
    entries.map(entry => entry.artCardId),
    entries.map(entry => entry.artCardName)
  );

  return (
    <RailSection
      title="Recent activity"
      perView={PER_VIEW}
      className={className}
      loading={loading}
      error={error}
      isEmpty={entries.length === 0}
      empty={
        <RailEmpty
          icon={Activity}
          headline="Nothing here yet"
          body="Scan a card, add one to your collection or open a deck and it shows up here, with the card itself."
          actionLabel="Scan a card"
          actionTo="/scan"
        />
      }
    >
      {entries.map((entry, index) => {
        const card = lookup.resolve(entry.artCardId, entry.artCardName);

        /* Clicking a card always opens that card's page. Only fall back to the
           entry's own destination when there is no card to open. */
        const to = card ? `/cards/${card.id}` : (entry.href ?? '/collection');

        return (
          <div key={entry.id} className={railTileWidth(PER_VIEW)}>
            <RailTile
              to={to}
              card={card}
              colors={card?.color_identity ?? []}
              fallbackNote="No card art for this one"
              eager={index < PER_VIEW}
              title={entry.title}
              overlay={
                entry.quantity && entry.quantity > 1 ? (
                  <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
                    &times;{entry.quantity}
                  </span>
                ) : undefined
              }
              subtitle={entry.detail ? <span className="block truncate">{entry.detail}</span> : undefined}
              meta={<span className="block truncate">{formatTimeAgo(entry.at)}</span>}
            />
          </div>
        );
      })}
    </RailSection>
  );
}
