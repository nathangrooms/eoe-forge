import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardCost } from '@/components/cards/CardCost';
import { CardPrintingComparison } from '@/components/cards/CardPrintingComparison';
import { cn } from '@/lib/utils';
import {
  CURATED_FORMATS,
  LEGALITY_LABEL,
  canBeCommander,
  edhrecUrl,
  gathererUrl,
  getCardImage,
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
import { ExternalLink, Heart, ImageOff, Plus, RefreshCw } from 'lucide-react';

interface CardModalProps {
  card: any;
  isOpen: boolean;
  onClose: () => void;
  onAddToCollection?: (card: any) => void;
  onAddToWishlist?: (card: any) => void;
  onAddToDeck?: (card: any) => void;
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

export function UniversalCardModal({
  card,
  isOpen,
  onClose,
  onAddToCollection,
  onAddToWishlist,
  onAddToDeck,
}: CardModalProps) {
  const [face, setFace] = useState(0);
  const { rulings, loading: loadingRulings, error: rulingsError } = useRulings(card, isOpen);

  useEffect(() => {
    setFace(0);
  }, [card?.id, isOpen]);

  const pt = useMemo(() => getPowerToughness(card), [card]);
  const loyalty = useMemo(() => getLoyalty(card), [card]);
  const flippable = hasBackFace(card);
  const imageSrc = getCardImage(card, 'normal', face);

  if (!card) return null;

  const setCode = getSetCode(card).toUpperCase();
  const setName = getSetName(card);
  const price = card.prices?.usd ? `$${parseFloat(card.prices.usd).toFixed(2)}` : null;
  const foilPrice = card.prices?.usd_foil ? `$${parseFloat(card.prices.usd_foil).toFixed(2)}` : null;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-left">
            <span>{card.name}</span>
            <CardCost card={card} faceIndex={flippable ? face : undefined} size="sm" />
            {canBeCommander(card) && (
              <Badge variant="outline" className="border-border text-xs font-normal text-muted-foreground">
                Can be your commander
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* ------------------------- Card art ------------------------- */}
          <div className="space-y-4">
            <div className="relative mx-auto w-full max-w-[300px]">
              <div className="aspect-[63/88] w-full overflow-hidden rounded-lg border border-border bg-muted">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="h-6 w-6" aria-hidden />
                    <span className="text-sm">No image available</span>
                  </div>
                )}
              </div>

              {flippable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFace(f => (f === 0 ? 1 : 0))}
                  className="absolute right-2 top-2 gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Flip
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {onAddToCollection && (
                <Button onClick={() => onAddToCollection(card)} className="flex-1 gap-2">
                  <Plus className="h-4 w-4" />
                  Add to collection
                </Button>
              )}
              {onAddToDeck && (
                <Button onClick={() => onAddToDeck(card)} variant="outline" className="flex-1 gap-2">
                  <Plus className="h-4 w-4" />
                  Add to deck
                </Button>
              )}
              {onAddToWishlist && (
                <Button
                  onClick={() => onAddToWishlist(card)}
                  variant="outline"
                  size="icon"
                  aria-label="Add to wishlist"
                >
                  <Heart className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={scryfallUrl(card)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Scryfall
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={edhrecUrl(card)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  EDHREC
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={tcgplayerUrl(card)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  TCGplayer
                </a>
              </Button>
              {gathererUrl(card) && (
                <Button variant="outline" size="sm" asChild>
                  <a href={gathererUrl(card)!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Gatherer
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* ------------------------- Card data ------------------------ */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <DetailRow label="Type">{getTypeLine(card, flippable ? face : undefined)}</DetailRow>
              <Separator />
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
                    {foilPrice && (
                      <span className="text-muted-foreground"> · {foilPrice} foil</span>
                    )}
                  </span>
                </DetailRow>
              )}
              {card.artist && <DetailRow label="Artist">{card.artist}</DetailRow>}
            </div>

            {getOracleText(card, flippable ? face : undefined) && (
              <div className="rounded-lg border border-border p-4">
                <h4 className="mb-2 text-sm font-medium text-foreground">Oracle text</h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {getOracleText(card, flippable ? face : undefined)}
                </p>
                {card.flavor_text && (
                  <p className="mt-3 border-t border-border pt-3 text-sm italic text-muted-foreground">
                    {card.flavor_text}
                  </p>
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
                  <p className="text-sm text-destructive">
                    Could not load rulings — {rulingsError}
                  </p>
                )}
                {!loadingRulings && !rulingsError && rulings?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No rulings have been published for this card.
                  </p>
                )}
                {rulings?.map((ruling, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
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
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
                        >
                          <span className="text-sm text-foreground">{format.label}</span>
                          <Badge
                            variant="outline"
                            className={cn('text-xs font-normal', legalityClass(state))}
                          >
                            {LEGALITY_LABEL[state] ?? state}
                          </Badge>
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
      </DialogContent>
    </Dialog>
  );
}
