import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardCost } from '@/components/cards/CardCost';
import { CardImage } from './CardImage';
import { CardPrintingComparison } from '@/components/cards/CardPrintingComparison';
import { cn } from '@/lib/utils';
import {
  CURATED_FORMATS,
  LEGALITY_LABEL,
  canBeCommander,
  edhrecUrl,
  gathererUrl,
  getColorIdentity,
  getLoyalty,
  getOracleText,
  getPowerToughness,
  getSetCode,
  getSetName,
  getTypeLine,
  hasBackFace,
  legalityClass,
  rarityClass,
  scryfallUrl,
  tcgplayerUrl,
} from '@/lib/scryfall/card-utils';
import { ExternalLink, Heart, Plus, RefreshCw } from 'lucide-react';

/**
 * The card-detail surface, with no container of its own.
 *
 * This used to be the body of a `<Dialog>` — the most-opened overlay in the
 * product. It is now a plain region, and where a player reads a card is one
 * place: the routed page at `/cards/:id`, which every card click in the app
 * leads to. Nothing here dims the page or traps focus, and nothing here owns
 * its own open state.
 */

export interface CardDetailProps {
  card: any;
  onAddToCollection?: (card: any) => void;
  onAddToWishlist?: (card: any) => void;
  onAddToDeck?: (card: any) => void;
  /**
   * `split` puts art and data side by side (routed page, wide layouts);
   * `stacked` keeps one column, which is what a docked pane has room for.
   */
  layout?: 'split' | 'stacked';
  /** Rendered by the pane/page shell instead when it owns the heading. */
  showHeading?: boolean;
  className?: string;
}

interface Ruling {
  source: string;
  published_at: string;
  comment: string;
}

/**
 * Real Scryfall rulings. This tab previously rendered two invented sentences on
 * a fake loading delay for every card, which is the single worst thing an MTG
 * site can do — it is the tab a player opens to settle a rules dispute.
 */
function useRulings(card: any, enabled: boolean) {
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rulingsUri: string | undefined = card?.rulings_uri;
  const cardId: string | undefined = card?.id;

  useEffect(() => {
    if (!enabled || (!rulingsUri && !cardId)) {
      setRulings(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(rulingsUri ?? `https://api.scryfall.com/cards/${cardId}/rulings`, {
      signal: controller.signal,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);
        const data = await res.json();
        setRulings(data?.data ?? []);
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Could not load rulings');
        setRulings(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, rulingsUri, cardId]);

  return { rulings, loading, error };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm text-foreground">{children}</span>
    </div>
  );
}

/** Heading line — name, mana cost, commander eligibility. */
export function CardDetailHeading({
  card,
  faceIndex,
  className,
}: {
  card: any;
  faceIndex?: number;
  className?: string;
}) {
  if (!card) return null;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      <span className="min-w-0 truncate text-base font-semibold text-foreground">{card.name}</span>
      <CardCost card={card} faceIndex={faceIndex} size="sm" />
      {canBeCommander(card) && (
        <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
          Can be your commander
        </Badge>
      )}
    </div>
  );
}

export function CardDetail({
  card,
  onAddToCollection,
  onAddToWishlist,
  onAddToDeck,
  layout = 'split',
  showHeading = false,
  className,
}: CardDetailProps) {
  const [face, setFace] = useState(0);
  const { rulings, loading: loadingRulings, error: rulingsError } = useRulings(card, !!card);

  useEffect(() => {
    setFace(0);
  }, [card?.id]);

  const pt = useMemo(() => getPowerToughness(card), [card]);
  const loyalty = useMemo(() => getLoyalty(card), [card]);

  if (!card) return null;

  const flippable = hasBackFace(card);
  const activeFace = flippable ? face : undefined;
  const setCode = getSetCode(card).toUpperCase();
  const setName = getSetName(card);
  const price = card.prices?.usd ? `$${parseFloat(card.prices.usd).toFixed(2)}` : null;
  const foilPrice = card.prices?.usd_foil ? `$${parseFloat(card.prices.usd_foil).toFixed(2)}` : null;
  const oracle = getOracleText(card, activeFace);

  return (
    <div className={cn('min-w-0', className)}>
      {showHeading && <CardDetailHeading card={card} faceIndex={activeFace} className="mb-4" />}

      <div
        className={cn(
          'grid min-w-0 grid-cols-1 gap-6',
          layout === 'split' && 'md:grid-cols-2'
        )}
      >
        {/* ------------------------- Card art ------------------------- */}
        <div className="min-w-0 space-y-4">
          <div className="relative mx-auto w-full max-w-[300px]">
            {/* CardImage, not a hand-rolled <img>. This is the largest a card
                is ever drawn in the product (300px), and the hand-rolled
                version asked for `normal` — a 488px scan stretched over 600
                device pixels. It also boxed the card at 63/88 (0.7159) and
                let `object-contain` letterbox it, because the actual scan is
                488/680 (0.7176); CardImage carries the scan's own ratio, so
                the art meets the frame on all four sides.
                `hideFlip` because the labelled Flip button below owns the
                face — it swaps the oracle text with the art. */}
            <CardImage
              card={card}
              size="xl"
              fill
              hideFlip
              interactive={false}
              faceIndex={flippable ? face : 0}
              imageClassName="shadow-lg shadow-black/20"
            />

            {flippable && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFace(f => (f === 0 ? 1 : 0))}
                className="absolute right-2 top-2 gap-1.5 shadow-md shadow-black/30"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Flip
              </Button>
            )}
          </div>

          {(onAddToCollection || onAddToDeck || onAddToWishlist) && (
            <div className="flex flex-wrap gap-2">
              {onAddToCollection && (
                <Button onClick={() => onAddToCollection(card)} className="flex-1 gap-2">
                  <Plus className="h-4 w-4" />
                  Add to collection
                </Button>
              )}
              {onAddToDeck && (
                <Button onClick={() => onAddToDeck(card)} variant="secondary" className="flex-1 gap-2">
                  <Plus className="h-4 w-4" />
                  Add to deck
                </Button>
              )}
              {onAddToWishlist && (
                <Button
                  onClick={() => onAddToWishlist(card)}
                  variant="secondary"
                  size="icon"
                  aria-label="Add to wishlist"
                >
                  <Heart className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <a href={scryfallUrl(card)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                Scryfall
              </a>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={edhrecUrl(card)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                EDHREC
              </a>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={tcgplayerUrl(card)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3 w-3" />
                TCGplayer
              </a>
            </Button>
            {gathererUrl(card) && (
              <Button variant="secondary" size="sm" asChild>
                <a href={gathererUrl(card)!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Gatherer
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* ------------------------- Card data ------------------------ */}
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg bg-muted/30 p-4">
            <DetailRow label="Type">{getTypeLine(card, activeFace)}</DetailRow>
            <DetailRow label="Mana value">
              <span className="tabular-nums">{card.cmc ?? 0}</span>
            </DetailRow>
            <DetailRow label="Color identity">
              <ColorIdentity colors={getColorIdentity(card)} size="xs" className="justify-end" />
            </DetailRow>
            <DetailRow label="Set">
              {setCode ? (
                <span>
                  {setName ? `${setName} ` : ''}
                  <span className="font-mono text-xs text-muted-foreground">
                    {setCode}
                    {card.collector_number ? ` #${card.collector_number}` : ''}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </DetailRow>
            <DetailRow label="Rarity">
              <span className={cn('capitalize', rarityClass(card.rarity))}>
                {card.rarity ?? 'unknown'}
              </span>
            </DetailRow>
            {pt && (
              <DetailRow label="Power / toughness">
                <span className="tabular-nums">
                  {pt.power}/{pt.toughness}
                </span>
              </DetailRow>
            )}
            {loyalty && <DetailRow label="Loyalty">{loyalty}</DetailRow>}
            {card.edhrec_rank != null && (
              <DetailRow label="EDHREC rank">
                <span className="tabular-nums">#{Number(card.edhrec_rank).toLocaleString()}</span>
              </DetailRow>
            )}
            {(price || foilPrice) && (
              <DetailRow label="Price (USD)">
                <span className="tabular-nums">
                  {price ?? '—'}
                  {foilPrice && <span className="text-muted-foreground"> · {foilPrice} foil</span>}
                </span>
              </DetailRow>
            )}
            {card.artist && <DetailRow label="Artist">{card.artist}</DetailRow>}
          </div>

          {oracle && (
            <div className="rounded-lg bg-muted/30 p-4">
              <h4 className="mb-2 text-sm font-medium text-foreground">Oracle text</h4>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {oracle}
              </p>
              {card.flavor_text && (
                <p className="mt-3 text-sm italic text-muted-foreground">{card.flavor_text}</p>
              )}
            </div>
          )}

          {Array.isArray(card.keywords) && card.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.keywords.map((kw: string) => (
                <Badge key={kw} variant="secondary" className="text-xs font-normal">
                  {kw}
                </Badge>
              ))}
            </div>
          )}

          <Tabs defaultValue="rulings" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="rulings">Rulings</TabsTrigger>
              <TabsTrigger value="legality">Legality</TabsTrigger>
              <TabsTrigger value="printings">Printings</TabsTrigger>
            </TabsList>

            <TabsContent value="rulings" className="space-y-3 pt-3">
              {loadingRulings && (
                <p className="text-sm text-muted-foreground">Loading rulings from Scryfall…</p>
              )}
              {rulingsError && (
                <p className="text-sm text-destructive">Could not load rulings — {rulingsError}</p>
              )}
              {!loadingRulings && !rulingsError && rulings?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No rulings have been published for this card.
                </p>
              )}
              {rulings?.map((ruling, i) => (
                <div key={i} className="rounded-md bg-muted/30 p-3">
                  <p className="text-sm text-foreground">{ruling.comment}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ruling.source === 'wotc' ? 'Wizards of the Coast' : 'Scryfall'} ·{' '}
                    {new Date(ruling.published_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="legality" className="pt-3">
              {card.legalities ? (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {CURATED_FORMATS.filter(f => card.legalities[f.key]).map(format => {
                    const state = card.legalities[format.key] as string;
                    return (
                      <div
                        key={format.key}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-1.5"
                      >
                        <span className="text-sm text-foreground">{format.label}</span>
                        <span className={cn('text-xs font-medium', legalityClass(state))}>
                          {LEGALITY_LABEL[state] ?? state}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Legality information is not available for this card.
                </p>
              )}
            </TabsContent>

            <TabsContent value="printings" className="pt-3">
              <CardPrintingComparison cardName={card.name || ''} oracleId={card.oracle_id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default CardDetail;
