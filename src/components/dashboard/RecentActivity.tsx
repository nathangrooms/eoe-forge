import { Link } from 'react-router-dom';
import {
  Activity,
  Camera,
  CheckCircle2,
  Eye,
  Heart,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CardImage, CARD_ASPECT } from '@/components/cards';
import { formatTimeAgo } from '@/features/dashboard/value';
import { useActivityFeed, type ActivityEntry } from '@/features/dashboard/activity';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

/**
 * Recent activity, told through the cards it happened to.
 *
 * The row used to read "Added 1 card" beside a grey icon square, which is a
 * receipt rather than a memory. Every entry now leads with the artwork of the
 * card involved — the card that was scanned or added, or the commander of the
 * deck that was touched — at the real card aspect ratio, so the column scans as
 * a strip of Magic cards instead of a list of sentences.
 *
 * Thumbnails are 56 px wide, which is the one case the brief reserves for
 * `small`: `CardImage` resolves that width to Scryfall's 146 px asset, well
 * above the 112 device pixels a 2× display needs.
 */

const THUMB_WIDTH = 56;

/** Fallback glyph for entries with no card behind them — imports, bulk scans. */
const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  deck_created: Plus,
  deck_updated: Pencil,
  deck_deleted: Trash2,
  deck_favorited: Star,
  deck_opened: Eye,
  card_added: Plus,
  collection_added: Plus,
  collection_updated: Pencil,
  collection_import: Upload,
  wishlist_added: Heart,
  listing_created: Tag,
  sale_completed: CheckCircle2,
  ai_build_run: Sparkles,
  scan_completed: Camera,
};

/** Same footprint and corner geometry as a card, so the column stays aligned. */
function FallbackThumb({ entry }: { entry: ActivityEntry }) {
  const Icon = ACTIVITY_ICONS[entry.type] ?? (entry.kind === 'deck' ? Layers : Activity);
  return (
    <div
      className="grid w-full place-items-center bg-muted shadow-sm shadow-black/30"
      style={{ aspectRatio: CARD_ASPECT, borderRadius: '4.75% / 3.4%' }}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export function RecentActivity() {
  const { entries, loading, error } = useActivityFeed(8);

  /* One batched join back to `cards` for the whole feed — the added card for a
     collection entry, the commander for a deck entry. */
  const lookup = useCardLookup(
    entries.map(entry => entry.artCardId),
    entries.map(entry => entry.artCardName)
  );

  return (
    <Card className="h-full">
      <CardHeader className="space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <ul className="space-y-1">
            {[0, 1, 2, 3, 4].map(i => (
              <li key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton
                  className="shrink-0 rounded-md"
                  style={{ width: THUMB_WIDTH, aspectRatio: CARD_ASPECT }}
                />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center">
            <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Scanning a card, adding to your collection or opening a deck shows up here — with the
              card itself.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry, index) => {
              const card = lookup.resolve(entry.artCardId, entry.artCardName);

              const body = (
                <>
                  <div className="relative shrink-0" style={{ width: THUMB_WIDTH }}>
                    {card ? (
                      <CardImage card={card} width={THUMB_WIDTH} fill hideFlip>
                        {entry.quantity && entry.quantity > 1 ? (
                          <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/85 px-1 py-px text-[10px] font-semibold tabular-nums text-foreground backdrop-blur">
                            &times;{entry.quantity}
                          </span>
                        ) : null}
                      </CardImage>
                    ) : (
                      <FallbackThumb entry={entry} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                    {entry.detail && (
                      <p className="truncate text-xs text-muted-foreground">{entry.detail}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatTimeAgo(entry.at)}
                    </p>
                  </div>
                </>
              );

              const rowClass = cn(
                'flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200',
                'motion-reduce:transition-none'
              );

              return (
                <Reveal as="li" key={entry.id} index={index} delay={index * 45}>
                  {entry.href ? (
                    <Link
                      to={entry.href}
                      className={cn(
                        rowClass,
                        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </Reveal>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
