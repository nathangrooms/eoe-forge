import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Heart, Layers, Library, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { HistoryNav } from '@/components/navigation/HistoryNav';
import { CardImage } from '@/components/cards/CardImage';
import { CardCost } from '@/components/cards/CardCost';
import { OracleText } from '@/components/cards/OracleText';
import { CardLegalityGrid } from '@/components/cards/CardLegalityGrid';
import { CardPrintingsRow } from '@/components/cards/CardPrintingsRow';
import { CardPriceHistory } from '@/components/cards/CardPriceHistory';
import { CardWorksWellWith, CardSimilar } from '@/components/cards/CardRelated';
import { CardAddToDeckPanel } from '@/components/cards/CardAddToDeckPanel';
import {
  canBeCommander,
  edhrecUrl,
  gathererUrl,
  getCardFaces,
  getCardImage,
  getColorIdentity,
  getSetCode,
  getSetName,
  getTypeLine,
  hasBackFace,
  rarityClass,
  scryfallUrl,
  tcgplayerUrl,
} from '@/lib/scryfall/card-utils';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

/**
 * `/cards/:id` — the card as a place.
 *
 * Owner, verbatim: *"Card detail page feels like it has barely any info, no
 * suggestions on what it works well with, similar cards, or any details really
 * about card, other art variants should show straight away too not hidden away
 * — main card page should be beautiful."*
 *
 * So: the card is drawn large and full, never cropped; every printed detail is
 * on the page rather than behind a tab; printings and art variants are a row of
 * real card images immediately under the fold; and the two "what else" sections
 * are built from real queries that name their own basis.
 *
 * The param is a Scryfall id where the caller has one and a card name where it
 * does not — half the rows in this app come from Supabase and half from search.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything the page reads off a local row, including `tags` for synergy. */
const DB_COLUMNS =
  'id, oracle_id, name, set_code, collector_number, layout, type_line, cmc, colors, ' +
  'color_identity, oracle_text, mana_cost, power, toughness, loyalty, keywords, ' +
  'legalities, image_uris, prices, is_legendary, is_reserved, rarity, tags';

/** Resolved cards are shared across mounts — Back into a card should be instant. */
const cache = new Map<string, any>();

async function fetchScryfall(url: string, signal: AbortSignal): Promise<any | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return null;
  }
}

/**
 * Resolve the route param to a card.
 *
 * Scryfall first, because it carries artist, flavour text, set name, release
 * date, every legality and the rulings link — none of which our `cards` table
 * stores. If Scryfall cannot be reached the local row is used instead, so the
 * page degrades to "fewer details" rather than "card not found".
 */
async function resolveCard(param: string, signal: AbortSignal): Promise<any> {
  const cached = cache.get(param);
  if (cached) return cached;

  let card: any = null;

  if (UUID.test(param)) {
    card = await fetchScryfall(`https://api.scryfall.com/cards/${param}`, signal);
  }

  let local: any = null;
  if (!card) {
    // The param may be one of our own non-Scryfall ids (`lightning-bolt-lea`).
    const byId = await supabase.from('cards').select(DB_COLUMNS).eq('id', param).maybeSingle();
    local = byId.data ?? null;

    const name = local?.name ?? param;
    card =
      (await fetchScryfall(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
        signal
      )) ??
      (await fetchScryfall(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
        signal
      ));
  }

  if (!card && local) card = local;
  if (!card) throw new Error('No card matches this link.');

  cache.set(param, card);
  return card;
}

/** The matching row in our `cards` table — needed for tags and both foreign keys. */
async function findDbCard(card: any): Promise<any | null> {
  if (!card) return null;
  try {
    if (card.id) {
      const { data } = await supabase.from('cards').select(DB_COLUMNS).eq('id', card.id).maybeSingle();
      if (data) return data;
    }
    if (card.oracle_id) {
      const { data } = await supabase
        .from('cards')
        .select(DB_COLUMNS)
        .eq('oracle_id', card.oracle_id)
        .limit(1);
      if (data?.[0]) return data[0];
    }
    if (card.name) {
      const { data } = await supabase.from('cards').select(DB_COLUMNS).eq('name', card.name).limit(1);
      if (data?.[0]) return data[0];
    }
  } catch (err) {
    console.error('Local card lookup failed:', err);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Rulings — real ones, from Scryfall.
 * ------------------------------------------------------------------ */

interface Ruling {
  source: string;
  published_at: string;
  comment: string;
}

function Rulings({ card, className }: { card: any; className?: string }) {
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rulingsUri: string | undefined = card?.rulings_uri;
  const cardId: string | undefined = UUID.test(card?.id ?? '') ? card.id : undefined;

  useEffect(() => {
    if (!rulingsUri && !cardId) {
      setRulings([]);
      setLoading(false);
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
  }, [rulingsUri, cardId]);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Rulings
      </h2>
      {loading && <p className="text-sm text-muted-foreground">Loading rulings from Scryfall…</p>}
      {error && <p className="text-sm text-destructive">Could not load rulings — {error}</p>}
      {!loading && !error && rulings?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No rulings have been published for this card.
        </p>
      )}
      <div className="space-y-2">
        {rulings?.map((ruling, i) => (
          <div key={i} className="rounded-lg bg-muted/30 p-3">
            <OracleText text={ruling.comment} className="text-sm" />
            <p className="mt-2 text-xs text-muted-foreground">
              {ruling.source === 'wotc' ? 'Wizards of the Coast' : 'Scryfall'} ·{' '}
              {new Date(ruling.published_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Small presentational pieces
 * ------------------------------------------------------------------ */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

function faceValue(card: any, faceIndex: number, key: string): any {
  const faces = getCardFaces(card);
  if (faces.length > 0) {
    const face = faces[Math.min(faceIndex, faces.length - 1)];
    if (face?.[key] != null) return face[key];
  }
  return card?.[key] ?? null;
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [card, setCard] = useState<any>(null);
  const [dbCard, setDbCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [face, setFace] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [owned, setOwned] = useState<{ quantity: number; foil: number } | null>(null);

  /* ---------------------------- Resolve ---------------------------- */

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setFace(0);

    resolveCard(id, controller.signal)
      .then(setCard)
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setCard(null);
        setError(err instanceof Error ? err.message : 'Could not load this card.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!card) {
      setDbCard(null);
      return;
    }
    findDbCard(card).then(row => {
      if (!cancelled) setDbCard(row);
    });
    return () => {
      cancelled = true;
    };
  }, [card?.id, card?.oracle_id, card?.name]);

  const dbCardId: string | null = dbCard?.id ?? null;

  /* How many copies the signed-in player already owns — real, not decorative. */
  useEffect(() => {
    let cancelled = false;
    if (!user || !dbCardId) {
      setOwned(null);
      return;
    }
    supabase
      .from('user_collections')
      .select('quantity, foil')
      .eq('user_id', user.id)
      .eq('card_id', dbCardId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setOwned(data ? { quantity: data.quantity ?? 0, foil: data.foil ?? 0 } : null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, dbCardId]);

  /* ---------------------------- Actions ---------------------------- */

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/cards');
  }, [navigate]);

  const addToCollection = useCallback(async () => {
    if (!card) return;
    if (!user) {
      showError('Sign in required', 'Sign in to add cards to your collection.');
      return;
    }
    if (!dbCardId) {
      showError(
        'Not in the card database',
        'This printing has not synced into DeckMatrix yet, so it cannot be added to a collection.'
      );
      return;
    }
    try {
      const { data: existing, error: readError } = await supabase
        .from('user_collections')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', dbCardId)
        .maybeSingle();
      if (readError) throw readError;

      if (existing) {
        const { error } = await supabase
          .from('user_collections')
          .update({ quantity: (existing.quantity ?? 0) + 1 })
          .eq('id', existing.id);
        if (error) throw error;
        setOwned(o => ({ quantity: (o?.quantity ?? 0) + 1, foil: o?.foil ?? 0 }));
      } else {
        const { error } = await supabase.from('user_collections').insert({
          user_id: user.id,
          card_id: dbCardId,
          card_name: card.name,
          set_code: (dbCard?.set_code ?? getSetCode(card) ?? 'unknown').toUpperCase(),
          quantity: 1,
          condition: 'near_mint',
        });
        if (error) throw error;
        setOwned({ quantity: 1, foil: 0 });
      }
      showSuccess('Added to collection', `${card.name} — one copy.`);
    } catch (err: any) {
      showError('Collection error', err?.message ?? 'Could not add this card.');
    }
  }, [card, dbCard, dbCardId, user]);

  const addToWishlist = useCallback(async () => {
    if (!card) return;
    if (!user) {
      showError('Sign in required', 'Sign in to add cards to your wishlist.');
      return;
    }
    const wishlistId = dbCardId ?? card.id;
    try {
      const { data: existing, error: readError } = await supabase
        .from('wishlist')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', wishlistId)
        .maybeSingle();
      if (readError) throw readError;

      if (existing) {
        const { error } = await supabase
          .from('wishlist')
          .update({ quantity: (existing.quantity ?? 0) + 1 })
          .eq('id', existing.id);
        if (error) throw error;
        showSuccess('Wishlist updated', `Another copy of ${card.name} added.`);
      } else {
        const { error } = await supabase.from('wishlist').insert({
          user_id: user.id,
          card_id: wishlistId,
          card_name: card.name,
          quantity: 1,
          priority: 'medium',
        });
        if (error) throw error;
        showSuccess('Added to wishlist', card.name);
      }
    } catch (err: any) {
      showError('Wishlist error', err?.message ?? 'Could not add this card.');
    }
  }, [card, dbCardId, user]);

  /**
   * Swapping printing keeps the page — same card, different object.
   *
   * The URL is rewritten with `replaceState` rather than `navigate`, on
   * purpose. `navigate` would re-run the resolve effect, which flips `loading`
   * for a frame and blanks the whole page to "Loading card…" even though the
   * printing is already in hand. Reusing the current history state object keeps
   * the router's entry key intact, so Back still goes where the player came
   * from and `HistoryNav` does not gain a phantom entry.
   */
  const selectPrinting = useCallback((printing: any) => {
    if (!printing?.id) return;
    setCard(printing);
    setFace(0);
    cache.set(printing.id, printing);
    window.history.replaceState(window.history.state, '', `/cards/${printing.id}`);
  }, []);

  /* ---------------------------- Derived ---------------------------- */

  const faces = useMemo(() => getCardFaces(card), [card]);
  const flippable = useMemo(() => hasBackFace(card), [card]);
  /** Split, adventure and flip cards carry two faces but one image. */
  const stackedFaces = faces.length > 1 && !flippable;
  const activeFace = flippable ? face : undefined;

  const art = card ? getCardImage(card, 'art_crop', flippable ? face : 0) : undefined;
  const typeLine = card ? getTypeLine(card, activeFace) : '';
  const power = card ? faceValue(card, face, 'power') : null;
  const toughness = card ? faceValue(card, face, 'toughness') : null;
  const loyalty = card ? faceValue(card, face, 'loyalty') : null;
  const defense = card ? faceValue(card, face, 'defense') : null;
  const oracle = card ? faceValue(card, face, 'oracle_text') : null;
  const flavour = card ? faceValue(card, face, 'flavor_text') : null;
  const artist = card ? faceValue(card, face, 'artist') ?? card.artist : null;
  const faceName = card ? faceValue(card, face, 'name') : '';

  const keywords: string[] = card?.keywords ?? dbCard?.keywords ?? [];
  const legalities = card?.legalities ?? dbCard?.legalities ?? null;
  const setCode = card ? getSetCode(card).toUpperCase() : '';
  const setName = card ? getSetName(card) : '';

  /* ---------------------------- Render ----------------------------- */

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-10 pt-2 md:px-6 md:pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <HistoryNav />
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Breadcrumb className="ml-1 hidden sm:block">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/cards">Cards</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {card && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[20rem] truncate">{card.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {loading && (
        <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-lg shadow-black/20">
          Loading card…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl bg-card p-10 text-center shadow-lg shadow-black/20">
          <h1 className="mb-2 text-lg font-semibold text-foreground">Card not found</h1>
          <p className="mb-5 text-sm text-muted-foreground">{error}</p>
          <Button variant="secondary" onClick={() => navigate('/cards')}>
            Search every card
          </Button>
        </div>
      )}

      {!loading && !error && card && (
        <>
          {/* ------------------------- Hero ------------------------- */}
          <section className="relative overflow-hidden rounded-2xl bg-card shadow-lg shadow-black/20">
            {/* Atmosphere comes from the card's own art, never from chrome. */}
            {art && (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <img
                  src={art}
                  alt=""
                  className="h-full w-full object-cover opacity-[0.13]"
                  style={{
                    maskImage: 'linear-gradient(to bottom, black, transparent 78%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 78%)',
                  }}
                />
              </div>
            )}

            <div className="relative grid min-w-0 gap-6 p-4 md:p-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-8">
              {/* ---- The card, large ---- */}
              <div className="min-w-0">
                <div className="mx-auto w-full max-w-[380px] lg:sticky lg:top-20">
                  <CardImage
                    card={card}
                    size="xl"
                    fill
                    eager
                    faceIndex={flippable ? face : 0}
                    onFaceChange={setFace}
                    hideFlip
                  />

                  {flippable && (
                    <Button
                      variant="secondary"
                      className="mt-3 w-full gap-2"
                      onClick={() => setFace(f => (f === 0 ? 1 : 0))}
                    >
                      <RefreshCw
                        className={cn(
                          'h-4 w-4 transition-transform duration-500 motion-reduce:transition-none',
                          face > 0 && 'rotate-180'
                        )}
                      />
                      Flip to {getCardFaces(card)[face === 0 ? 1 : 0]?.name ?? 'other face'}
                    </Button>
                  )}

                  <div className="mt-3 grid gap-2">
                    <Button className="w-full gap-2" onClick={addToCollection}>
                      <Library className="h-4 w-4" />
                      Add to collection
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" className="gap-2" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Add to deck
                      </Button>
                      <Button variant="secondary" className="gap-2" onClick={addToWishlist}>
                        <Heart className="h-4 w-4" />
                        Wishlist
                      </Button>
                    </div>
                  </div>

                  {owned && owned.quantity + owned.foil > 0 && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      You own {owned.quantity} regular
                      {owned.foil > 0 ? ` and ${owned.foil} foil` : ''} cop
                      {owned.quantity + owned.foil === 1 ? 'y' : 'ies'}.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      { href: scryfallUrl(card), label: 'Scryfall' },
                      { href: edhrecUrl(card), label: 'EDHREC' },
                      { href: tcgplayerUrl(card), label: 'TCGplayer' },
                      ...(gathererUrl(card) ? [{ href: gathererUrl(card)!, label: 'Gatherer' }] : []),
                    ].map(link => (
                      <Button key={link.label} variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                        <a href={link.href} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 h-3 w-3" />
                          {link.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ---- Everything printed on it ---- */}
              <div className="min-w-0 space-y-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h1 className="min-w-0 text-2xl font-semibold leading-tight text-foreground md:text-3xl">
                      {card.name}
                    </h1>
                    <CardCost card={card} faceIndex={activeFace} size="lg" />
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-base text-muted-foreground">{typeLine}</p>
                    {power != null && toughness != null && (
                      <span className="text-base font-semibold tabular-nums text-foreground">
                        {power}/{toughness}
                      </span>
                    )}
                    {loyalty != null && (
                      <span className="text-base font-semibold tabular-nums text-foreground">
                        Loyalty {loyalty}
                      </span>
                    )}
                    {defense != null && (
                      <span className="text-base font-semibold tabular-nums text-foreground">
                        Defence {defense}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn('capitalize', rarityClass(card.rarity))}>
                      {card.rarity ?? 'unknown rarity'}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-muted-foreground">
                      {setName || 'Unknown set'}{' '}
                      <span className="font-mono uppercase">{setCode}</span>
                      {card.collector_number ? ` #${card.collector_number}` : ''}
                    </span>
                    {card.released_at && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-muted-foreground">
                          {new Date(card.released_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </>
                    )}
                    {artist && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-muted-foreground">Art by {artist}</span>
                      </>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {canBeCommander(card) && (
                      <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-foreground">
                        Can be your commander
                      </span>
                    )}
                    {(card.reserved || dbCard?.is_reserved) && (
                      <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-foreground">
                        Reserved List
                      </span>
                    )}
                    {card.promo && (
                      <span className="rounded-full bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                        Promo
                      </span>
                    )}
                    {card.full_art && (
                      <span className="rounded-full bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                        Full art
                      </span>
                    )}
                    {card.frame_effects?.map((fx: string) => (
                      <span
                        key={fx}
                        className="rounded-full bg-muted/40 px-2.5 py-1 text-xs capitalize text-muted-foreground"
                      >
                        {fx.replace(/([a-z])([A-Z])/g, '$1 $2')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Rules text and the printed facts sit side by side once there is
                    room for both — a single column left half the hero empty. */}
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
                  <div className="min-w-0 space-y-4">
                {/* ---- Rules text ---- */}
                <div className="rounded-xl bg-muted/30 p-4">
                  {stackedFaces ? (
                    <div className="space-y-4">
                      {faces.map((f: any, i: number) => (
                        <div key={i} className={cn(i > 0 && 'pt-4')}>
                          <div className="mb-1 flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-semibold text-foreground">{f.name}</span>
                            <CardCost card={card} faceIndex={i} size="xs" />
                            <span className="text-xs text-muted-foreground">{f.type_line}</span>
                          </div>
                          <OracleText text={f.oracle_text} />
                          {f.flavor_text && (
                            <p className="mt-2 whitespace-pre-line text-sm italic text-muted-foreground">
                              {f.flavor_text}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : oracle ? (
                    <>
                      {flippable && faces.length > 1 && (
                        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                          {faceName} — {face === 0 ? 'front face' : 'back face'}
                        </p>
                      )}
                      <OracleText text={oracle} />
                      {flavour && (
                        <p className="mt-3 whitespace-pre-line text-sm italic text-muted-foreground">
                          {flavour}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This card has no rules text — it does exactly what its type line says.
                    </p>
                  )}
                </div>

                    {keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.map((kw: string) => (
                          <span
                            key={kw}
                            className="rounded-full bg-muted/50 px-2.5 py-1 text-xs text-foreground"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Price rides in the hero rather than below it: with a
                        380px card on the left, a short rules box left several
                        hundred pixels of dead column, and price is the number
                        a player wants without scrolling anyway. */}
                    <CardPriceHistory
                      card={card}
                      oracleId={card.oracle_id ?? dbCard?.oracle_id}
                      surface="inset"
                    />
                  </div>

                {/* ---- Facts ---- */}
                <div className="grid min-w-0 grid-cols-2 gap-1.5 self-start sm:grid-cols-3 xl:grid-cols-1">
                  <Fact label="Mana value">
                    <span className="tabular-nums">{card.cmc ?? dbCard?.cmc ?? 0}</span>
                  </Fact>
                  <Fact label="Colour identity">
                    <ColorIdentity colors={getColorIdentity(card)} size="xs" />
                  </Fact>
                  <Fact label="Layout">
                    <span className="capitalize">
                      {String(card.layout ?? 'normal').replace(/_/g, ' ')}
                    </span>
                  </Fact>
                  <Fact label="Set">
                    <span className="font-mono uppercase">{setCode || '—'}</span>
                  </Fact>
                  <Fact label="Collector no.">
                    <span className="tabular-nums">{card.collector_number ?? '—'}</span>
                  </Fact>
                  <Fact label="Rarity">
                    <span className="capitalize">{card.rarity ?? '—'}</span>
                  </Fact>
                  {card.artist && <Fact label="Artist">{card.artist}</Fact>}
                  {card.edhrec_rank != null && (
                    <Fact label="EDHREC rank">
                      <span className="tabular-nums">
                        #{Number(card.edhrec_rank).toLocaleString()}
                      </span>
                    </Fact>
                  )}
                  {card.lang && (
                    <Fact label="Language">
                      <span className="uppercase">{card.lang}</span>
                    </Fact>
                  )}
                  {Array.isArray(dbCard?.tags) && dbCard.tags.length > 0 && (
                    <Fact label="DeckMatrix tags">
                      <span className="capitalize">{dbCard.tags.join(', ')}</span>
                    </Fact>
                  )}
                </div>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Printings & art variants ---------------- */}
          <CardPrintingsRow
            className="mt-4"
            oracleId={card.oracle_id ?? dbCard?.oracle_id}
            cardName={card.name}
            activeId={card.id}
            onSelect={selectPrinting}
          />

          {/* ------------------------ Legality ------------------------ */}
          <section className="mt-4 min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-4 w-4" aria-hidden />
              Format legality
            </h2>
            <CardLegalityGrid legalities={legalities} />
          </section>

          {/* ------------------------- Related ------------------------ */}
          <CardWorksWellWith className="mt-4" card={card} dbCard={dbCard} />
          <CardSimilar className="mt-4" card={card} dbCard={dbCard} />
          <Rulings className="mt-4" card={card} />

          <CardAddToDeckPanel
            open={addOpen}
            onOpenChange={setAddOpen}
            card={card}
            dbCardId={dbCardId}
          />
        </>
      )}
    </div>
  );
}
