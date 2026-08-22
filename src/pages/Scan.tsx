import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Camera, Settings, Trash2 } from 'lucide-react';
import { useScanStore } from '@/features/scan/store';
import { DeckAdditionPanel } from '@/components/collection/DeckAdditionPanel';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { matchedLabel, ResultSummary } from '@/components/listing';
import { ScanInsightsHelper } from '@/components/scan/ScanInsightsHelper';
import { CardGrid, CardImage, cardDetailPath } from '@/components/cards';
import { formatPrice } from '@/components/collection/browser/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

/** Rendered width of a card in either grid on this page. */
const CARD_WIDTH = 168;

interface RecentCollectionCard {
  id: string;
  /** The card's own id, not the collection row's — this is what `/cards/:id` takes. */
  cardId: string | null;
  name: string;
  quantity: number;
  card: any;
}

/**
 * A card tile that goes to the card page.
 *
 * Owner: *"Scanned cards, should be able to click the last added to your
 * collection"*. Both grids on this page are cards you have just handled, and a
 * card you have just handled is exactly the one you want to read — so the whole
 * tile, art and caption, is a single link to `/cards/:id`.
 */
function ScanCardTile({
  card,
  href,
  name,
  caption,
  overlay,
}: {
  card: any;
  href: string | null;
  name: string;
  caption: ReactNode;
  overlay?: ReactNode;
}) {
  const body = (
    <>
      <CardImage
        card={card}
        width={CARD_WIDTH}
        fill
        hideFlip
        interactive={!!href}
        title={href ? `Open ${name}` : name}
      >
        {overlay}
      </CardImage>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="truncate text-xs font-medium text-foreground" title={name}>
          {name}
        </p>
        {caption}
      </div>
    </>
  );

  if (!href) return <div className="flex flex-col gap-1.5">{body}</div>;

  return (
    <Link
      to={href}
      className="flex flex-col gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

/**
 * A scanned card holds one image URL, not a Scryfall image set; this is the
 * shape `CardImage` reads. These used to be drawn through a hand-rolled
 * `<img className="object-cover">` at 40×56 — which CLAUDE.md forbids, and
 * which cropped the card besides.
 */
function cardShapeOf(scan: { name: string; imageUrl?: string }) {
  const url = scan.imageUrl || '';
  return {
    name: scan.name,
    image_uris: url ? { small: url, normal: url, large: url } : {},
  };
}

/**
 * The scanner, as a tool.
 *
 * What stood here was a brochure: a "Smart Recognition — Fast Detection / Any
 * Angle / All Languages / Instant Add" claim card, a second full-width "Ready
 * to Scan?" hero pointing at the same route as the header button, and a
 * three-step "How Scanning Works" explainer. 1,488px of page, aimed at a user
 * who has already signed up, pushing the one real control a thousand pixels
 * down — and none of the capability claims was backed by anything ("All
 * Languages" least of all: recognition is English OCR matched against the local
 * `cards` table). All of it is gone.
 *
 * What remains is the two things this page actually decides — where scanned
 * cards go, and how the camera behaves — and then cards: the last things
 * scanned, or, before any scan exists, the last cards that arrived in the
 * collection, which is the destination the page is configuring.
 */
export default function Scan() {
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [addToCollection, setAddToCollection] = useState(true);
  const [addToDeck, setAddToDeck] = useState(false);

  const { recentScans, settings, updateSettings, clearRecentScans } = useScanStore();
  const { user } = useAuth();

  const [recentCollection, setRecentCollection] = useState<RecentCollectionCard[]>([]);

  /**
   * The most recent arrivals in the collection — six rows, read live, nothing
   * aggregated. This is the same table the scanner writes into, so it is the
   * honest answer to "where do these end up".
   */
  const loadRecentCollection = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_collections')
      .select('id, card_name, quantity, foil, created_at, cards(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      console.error('Failed to load recent collection cards:', error);
      return;
    }

    setRecentCollection(
      (data ?? []).map((row: any) => ({
        id: row.id,
        cardId: row.cards?.id ?? null,
        name: row.card_name ?? row.cards?.name ?? 'Unknown card',
        quantity: (row.quantity ?? 0) + (row.foil ?? 0),
        card: row.cards ?? { name: row.card_name },
      }))
    );
  }, [user]);

  useEffect(() => {
    loadRecentCollection();
  }, [loadRecentCollection]);

  const scannedCopies = recentScans.reduce((sum, scan) => sum + scan.quantity, 0);
  const avgConfidence =
    recentScans.length > 0
      ? recentScans.reduce((sum, scan) => sum + scan.confidence, 0) / recentScans.length
      : 0;

  return (
    <StandardPageLayout
      title="Card scanner"
      description="Point the camera at a card, confirm the match, and it lands wherever you send it."
      action={
        <Button asChild size="lg" className="touch-target gap-2">
          <Link to="/scan/camera">
            <Camera className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">Start scanning</span>
            <span className="sm:hidden">Scan</span>
          </Link>
        </Button>
      }
    >
      <div className="space-y-6 pb-safe">
        {/*
         * Where the cards land. Full width because the panel lays its three
         * destinations out in a row of its own — squeezed into a two-thirds
         * column every label wrapped onto three lines. It carries its own Card,
         * so it is not wrapped in a second one.
         */}
        <DeckAdditionPanel
          title="Where scanned cards go"
          className=""
          selectedDeckId={selectedDeckId}
          addToCollection={addToCollection}
          addToDeck={addToDeck}
          onSelectionChange={config => {
            setSelectedDeckId(config.selectedDeckId);
            setAddToCollection(config.addToCollection);
            setAddToDeck(config.addToDeck);
          }}
        />

        <Card>
          <CardHeader className="p-4 pb-3 md:px-6 md:pb-3 md:pt-5">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Settings className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
              Camera behaviour
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 pt-0 md:grid-cols-2 md:gap-8 md:px-6 md:pb-5 md:pt-0">
            {/*
             * Auto capture is wired now. It used to write `settings.autoCapture`
             * into a store nothing read back — `CameraScanView` kept its own
             * `useState(true)` — so this switch changed nothing anywhere in the
             * app. It is now the same switch as the pause control on the camera.
             */}
            <div className="flex items-start justify-between gap-4">
              <Label
                htmlFor="scan-auto-capture"
                className="flex-1 cursor-pointer text-sm font-medium"
              >
                Auto capture
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Fires as soon as the frame holds still and sharp. Off means every shot is
                  a deliberate tap.
                </span>
              </Label>
              <Switch
                id="scan-auto-capture"
                checked={settings.autoCapture}
                onCheckedChange={checked => updateSettings({ autoCapture: checked })}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="scan-auto-add" className="flex-1 cursor-pointer text-sm font-medium">
                Auto add
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Skips the confirm list when the match scores 0.9 or better.
                </span>
              </Label>
              <Switch
                id="scan-auto-add"
                checked={settings.autoAdd}
                onCheckedChange={checked => updateSettings({ autoAdd: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cards. A page about recognising Magic cards had none on it. */}
        {recentScans.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold text-foreground">Recent scans</h2>
              <div className="flex items-center gap-4">
                {/* The shared count line. This was a sixth phrasing of the
                    one fact every list on this side of the app states, and the
                    only one that emboldened each figure inside the sentence. */}
                {/* `ResultSummary`, not `resultSentence`: the match figure
                    carries a caption saying what it is an average of, and a
                    string cannot hold one. */}
                <ResultSummary
                  className="text-sm text-muted-foreground"
                  parts={[
                    matchedLabel(recentScans.length, recentScans.length, 'card'),
                    { value: scannedCopies.toLocaleString(), label: scannedCopies === 1 ? 'copy' : 'copies' },
                    {
                      value: `${(avgConfidence * 100).toFixed(0)}%`,
                      label: 'average match',
                      title: 'How sure the scanner was, averaged over these cards.',
                    },
                  ]}
                />
                <Button variant="ghost" size="sm" onClick={clearRecentScans} className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </Button>
              </div>
            </div>

            <CardGrid width={CARD_WIDTH}>
              {recentScans.map(scan => (
                <ScanCardTile
                  key={scan.id}
                  card={cardShapeOf(scan)}
                  href={cardDetailPath({ id: scan.cardId, name: scan.name })}
                  name={scan.name}
                  overlay={
                    scan.quantity > 1 ? (
                      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
                        ×{scan.quantity}
                      </span>
                    ) : null
                  }
                  caption={
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="truncate font-mono uppercase text-muted-foreground">
                        {scan.setCode || '—'}
                      </span>
                      {scan.priceUsd ? (
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatPrice(scan.priceUsd)}
                        </span>
                      ) : null}
                    </div>
                  }
                />
              ))}
            </CardGrid>
          </section>
        ) : recentCollection.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Last added to your collection
                </h2>
                {/* The heading names what is on screen, so this line has to say
                    why those particular cards are on screen. On its own it read
                    as a flat contradiction of the six cards underneath it. */}
                <p className="text-sm text-muted-foreground">
                  Nothing scanned in this browser yet, so these are the cards you added most
                  recently. Scanned cards land here.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/collection">Open collection</Link>
              </Button>
            </div>

            <CardGrid width={CARD_WIDTH}>
              {recentCollection.map(entry => (
                <ScanCardTile
                  key={entry.id}
                  card={entry.card}
                  href={cardDetailPath({ id: entry.cardId, name: entry.name })}
                  name={entry.name}
                  overlay={
                    entry.quantity > 1 ? (
                      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
                        ×{entry.quantity}
                      </span>
                    ) : null
                  }
                  caption={
                    <span className="truncate font-mono text-[11px] uppercase text-muted-foreground">
                      {entry.card?.set_code || '—'}
                    </span>
                  }
                />
              ))}
            </CardGrid>
          </section>
        ) : null}

        {recentScans.length > 0 && <ScanInsightsHelper recentScans={recentScans} />}
      </div>
    </StandardPageLayout>
  );
}
