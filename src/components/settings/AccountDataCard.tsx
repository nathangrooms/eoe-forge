import { useEffect, useState } from 'react';
import { Download, FileText, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DeckRail } from '@/components/deck/DeckRail';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useDeckLibrary } from '@/hooks/useDeckLibrary';

/**
 * Take your data with you, and see what that actually is before you press
 * anything.
 *
 * ## What was wrong
 *
 * The two download rows described their contents in words and gave no figures
 * at all, so "Full export (JSON)" could as easily have been an empty file. The
 * only place a number appeared was the toast AFTER the download, which is the
 * wrong side of the decision. Settings also ended 190px above the fold on a
 * 1600x1000 laptop, and had no card image on it anywhere.
 *
 * ## What is here now
 *
 * The real size of each download, read from the database, in the same units
 * and the same words the toast uses when the file lands. Two figures that
 * describe one file must never be counted two different ways, and the safest
 * way to guarantee that is for the label before and the toast after to say the
 * same sentence.
 *
 * Then the decks themselves, drawn as their commanders. This is the one place
 * on Settings where card art belongs: the decklist download IS those decks, so
 * the art is of the thing on screen rather than wallpaper. The blurred art
 * ground is deliberately NOT used here, because this surface has no single
 * subject and CLAUDE.md is explicit that the treatment is identity only where
 * there is one.
 *
 * ## Cost
 *
 * Two `head` counts, which transfer no rows, plus the three shared queries
 * `useDeckLibrary` runs for the rail. It is a page somebody opens to change
 * their password, not a listing that reloads.
 */

interface Counts {
  collection: number | null;
  wishlist: number | null;
}

export interface AccountDataCardProps {
  exporting: 'json' | 'text' | null;
  onExportJson: () => void;
  onExportDecklists: () => void;
  onSignOut: () => void;
}

export function AccountDataCard({
  exporting,
  onExportJson,
  onExportDecklists,
  onSignOut,
}: AccountDataCardProps) {
  const { user } = useAuth();
  const { decks, loading: decksLoading } = useDeckLibrary();
  const [counts, setCounts] = useState<Counts>({ collection: null, wishlist: null });

  useEffect(() => {
    let cancelled = false;
    if (!user) return;

    (async () => {
      /* `head: true` asks Postgres for the count and returns no rows at all,
         so this costs an index scan rather than a download of the collection. */
      const [collection, wishlist] = await Promise.all([
        supabase
          .from('user_collections')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase.from('wishlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      if (cancelled) return;
      setCounts({
        collection: collection.count ?? null,
        wishlist: wishlist.count ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const deckCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data &amp; account</CardTitle>
        <CardDescription>Take your data with you at any time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Full export (JSON)</p>
            <p className="text-sm text-muted-foreground">
              Collection, decks, deck cards and wishlist.
            </p>
            {/* The size of the file, before the decision rather than after it.
                Same three figures and the same three words the toast prints
                when it lands, so the two can never disagree. */}
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {countLine(counts, decks.length)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onExportJson} disabled={exporting !== null}>
            <Download className="mr-2 h-4 w-4" />
            {exporting === 'json' ? 'Preparing…' : 'Download'}
          </Button>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Decklists (.txt)</p>
              <p className="text-sm text-muted-foreground">
                Plain decklists that import into Moxfield, Archidekt and Arena.
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {decksLoading
                  ? 'Counting your decks'
                  : decks.length === 0
                    ? 'You have no decks to write yet'
                    : `${decks.length} deck${decks.length === 1 ? '' : 's'}, ${deckCards.toLocaleString()} card${deckCards === 1 ? '' : 's'}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportDecklists}
              disabled={exporting !== null || (!decksLoading && decks.length === 0)}
            >
              <FileText className="mr-2 h-4 w-4" />
              {exporting === 'text' ? 'Preparing…' : 'Download'}
            </Button>
          </div>

          {/* The decks that are about to be written, as the commanders that
              lead them. Every deck, including any whose commander has no
              artwork on file, so the count above and the cards below cannot
              come apart. */}
          {decksLoading ? (
            <Skeleton className="h-3 w-40" />
          ) : (
            <DeckRail
              label="The decks this download writes"
              decks={decks.map(deck => ({
                id: deck.id,
                name: deck.name,
                card: deck.commanderCard,
                href: `/deck/${deck.id}`,
                note: `${deck.cardCount} card${deck.cardCount === 1 ? '' : 's'}`,
              }))}
              purpose="in this download"
            />
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="text-sm text-muted-foreground">End this session on this device.</p>
          </div>
          <Button variant="outline" size="sm" onClick={onSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What the JSON file holds, in the words the toast uses afterwards.
 *
 * "Entries" rather than "cards", deliberately. A row in `user_collections` is
 * one entry that can hold any number of copies, and calling it a card would put
 * a figure on screen that counts something other than what it names. The
 * collection page and the wishlist stats already say "entries" for the same
 * reason, so this is the product's existing word rather than a new one.
 *
 * A count we could not read says so instead of printing a zero.
 */
function countLine(counts: Counts, decks: number): string {
  const part = (n: number | null, one: string, many: string) =>
    n == null ? null : `${n.toLocaleString()} ${n === 1 ? one : many}`;

  /* A figure that could not be read is left out rather than reported as a
     phrase. The file still holds those rows; only our count of them failed,
     and a line reading "not counted" says nothing except that something went
     wrong somewhere the reader cannot see. */
  return [
    part(counts.collection, 'collection entry', 'collection entries'),
    `${decks.toLocaleString()} deck${decks === 1 ? '' : 's'}`,
    part(counts.wishlist, 'wishlist entry', 'wishlist entries'),
  ]
    .filter(Boolean)
    .join(' · ');
}
