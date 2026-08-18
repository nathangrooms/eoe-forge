import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CardGrid,
  CardImage,
  CardImageSkeleton,
  cardHref,
  useCardSize,
  CardSizeSlider,
} from '@/components/cards';
import { ColorIdentity, ManaCost } from '@/components/ui/mana-cost';
import {
  CATEGORY_BG_CLASS,
  CATEGORY_TEXT_CLASS,
  groupByCategory,
} from '@/lib/deck/cardCategories';
import { computeDeckStats, type DeckCardRow } from '@/lib/deck/deckCards';
import {
  commanderArt,
  commanderCard,
  rowCard,
  type PreconDeck,
  type PreconSummary,
} from '@/lib/precons/precon-api';

/**
 * One precon, opened.
 *
 * The same visual language as the tile, scaled up: the commander's art crop as
 * a band, the commander's card hung over it, then the shape of the deck
 * (composition, curve) before the list itself. Every card in the list is drawn
 * at the size the reader picked, from the highest resolution available — this
 * page is the reason to look at a precon at all.
 */

export interface PreconDeckViewProps {
  precon: PreconSummary;
  deck: PreconDeck | null;
  rows: DeckCardRow[];
  loading: boolean;
  saving: boolean;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
}

const CURVE_BINS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export function PreconDeckView({
  precon,
  deck,
  rows,
  loading,
  saving,
  canSave,
  onBack,
  onSave,
}: PreconDeckViewProps) {
  const [cardWidth, setCardWidth] = useCardSize('precons', 150);

  /**
   * The deck payload is authoritative once it lands — a precon that shipped
   * after the generated index still gets a real commander here.
   */
  const commanderRows = rows.filter(row => row.is_commander);
  const commanderCards = useMemo(() => {
    if (commanderRows.length > 0) return commanderRows.map(rowCard);
    return precon.commanders.map(ref => commanderCard(ref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, precon]);

  const art = commanderCards[0] ? commanderArt(commanderCards[0]) : null;

  const identity = useMemo(() => {
    const fromRows = Array.from(
      new Set(commanderRows.flatMap(row => row.card?.color_identity ?? []))
    );
    return fromRows.length > 0 ? fromRows : precon.ci;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, precon]);

  const stats = useMemo(() => computeDeckStats(rows), [rows]);

  const landCount = useMemo(
    () =>
      rows.reduce(
        (sum, row) =>
          (row.card?.type_line ?? '').toLowerCase().includes('land') ? sum + row.quantity : sum,
        0
      ),
    [rows]
  );

  const groups = useMemo(
    () =>
      groupByCategory(rows, row => ({
        typeLine: row.card?.type_line,
        isCommander: row.is_commander,
        isSideboard: row.is_sideboard,
      })),
    [rows]
  );

  /** Non-land curve, in the eight buckets players read. */
  const curve = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bin of CURVE_BINS) counts[bin] = 0;
    for (const row of rows) {
      if (!row.card) continue;
      if (row.card.type_line.toLowerCase().includes('land')) continue;
      const mv = Math.max(0, Math.floor(row.card.cmc ?? 0));
      const bin = mv >= 7 ? '7+' : String(mv);
      counts[bin] = (counts[bin] ?? 0) + row.quantity;
    }
    const peak = Math.max(1, ...CURVE_BINS.map(b => counts[b]));
    return CURVE_BINS.map(bin => ({ bin, count: counts[bin], ratio: counts[bin] / peak }));
  }, [rows]);

  /** Derived numbers are meaningless until the card metadata has landed. */
  const ready = !loading && rows.length > 0;

  const totalCards = deck?.totalCards ?? precon.total ?? stats.totalCards;
  const composition = groups.filter(g => g.category !== 'sideboard');
  const compositionTotal = composition.reduce(
    (sum, g) => sum + g.items.reduce((n, row) => n + row.quantity, 0),
    0
  );

  const year = precon.released ? precon.released.slice(0, 4) : null;
  const wide = commanderCards.length > 1;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ChevronLeft className="mr-1 h-4 w-4" />
        All precons
      </Button>

      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-card shadow-lg shadow-black/20">
        <div className="relative h-32 w-full overflow-hidden bg-muted sm:h-44 md:h-56">
          {art && (
            <img
              src={art}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover object-[50%_30%]"
            />
          )}
        </div>

        <div className="flex flex-col gap-4 p-4 md:flex-row md:gap-6 md:p-6">
          <div className="-mt-20 flex shrink-0 gap-2 sm:-mt-28 md:-mt-36">
            {commanderCards.length > 0 ? (
              commanderCards.slice(0, 2).map((card, i) => (
                // The commander is a card, so it goes where every other card
                // goes when clicked.
                <Link
                  key={card?.id ?? i}
                  to={cardHref(card)}
                  aria-label={card?.name ?? 'Commander'}
                  className={cn(
                    'block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    wide ? 'w-24 sm:w-32 md:w-36' : 'w-28 sm:w-36 md:w-44'
                  )}
                >
                  <CardImage
                    card={card}
                    size="lg"
                    fill
                    eager
                    interactive
                    imageClassName="shadow-2xl shadow-black/60"
                  />
                </Link>
              ))
            ) : (
              <div className="w-28 sm:w-36 md:w-44">
                <CardImageSkeleton size="lg" fill />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              {/* h2, not h1: the page layout already owns the document's one
                  h1 ("Precons"), and two h1s is a broken outline. */}
              <h2 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">
                {deck?.name ?? precon.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {precon.set}
                {year ? ` · ${year}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {identity.length > 0 && <ColorIdentity colors={identity} size="md" />}
              {commanderCards.slice(0, 2).map((card, i) => (
                <span key={card?.id ?? i} className="inline-flex items-center gap-1.5">
                  <span className="text-sm font-medium">{card?.name}</span>
                  {card?.mana_cost && <ManaCost cost={card.mana_cost} size="xs" />}
                </span>
              ))}
            </div>

            {/* Capped, or four stats stretch across a 900px hero as four
                lonely numbers with a hand's width between them. */}
            <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Cards" value={String(totalCards)} />
              <Stat label="Lands" value={ready ? String(landCount) : '—'} />
              <Stat label="Avg MV" value={ready ? stats.avgManaValue.toFixed(2) : '—'} />
              <Stat
                label="Est. value"
                value={
                  ready && stats.totalValueUSD > 0 ? `$${stats.totalValueUSD.toFixed(0)}` : '—'
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={onSave} disabled={saving || !canSave || loading}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Load this list
              </Button>
              {!canSave && (
                <span className="text-xs text-muted-foreground">
                  Sign in to copy this precon into your decks.
                </span>
              )}
              {stats.missingMetadata > 0 && (
                <span className="text-xs text-muted-foreground">
                  {stats.missingMetadata} card
                  {stats.missingMetadata === 1 ? '' : 's'} not in the local card database yet
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Shape of the deck */}
      {ready && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Composition
            </h2>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {composition.map(group => {
                const count = group.items.reduce((n, row) => n + row.quantity, 0);
                return (
                  <span
                    key={group.category}
                    className={cn('h-full', CATEGORY_BG_CLASS[group.category])}
                    style={{ width: `${(count / Math.max(1, compositionTotal)) * 100}%` }}
                    title={`${group.label}: ${count}`}
                  />
                );
              })}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {composition.map(group => {
                const count = group.items.reduce((n, row) => n + row.quantity, 0);
                return (
                  <li key={group.category} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        CATEGORY_BG_CLASS[group.category]
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-muted-foreground">{group.label}</span>
                    <span className="ml-auto shrink-0 font-medium tabular-nums">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Mana curve
            </h2>
            <div className="mt-3 flex h-28 items-end gap-1.5">
              {curve.map(({ bin, count, ratio }) => (
                <div key={bin} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[0.65rem] tabular-nums text-muted-foreground">
                    {count || ''}
                  </span>
                  <div
                    className="w-full rounded-t bg-foreground/70 transition-[height] duration-500 motion-reduce:transition-none"
                    style={{ height: `${Math.max(ratio * 100, count > 0 ? 4 : 1.5)}%` }}
                    title={`${count} card${count === 1 ? '' : 's'} at mana value ${bin}`}
                  />
                  <span className="text-[0.65rem] tabular-nums text-muted-foreground">{bin}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[0.7rem] text-muted-foreground">
              Non-land cards by mana value.
            </p>
          </div>
        </section>
      )}

      {/* Decklist */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Decklist{' '}
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {totalCards} cards
            </span>
          </h2>
          <CardSizeSlider
            storageKey="precons"
            value={cardWidth}
            onValueChange={setCardWidth}
            showValue={false}
          />
        </div>

        {/* Clicking a card goes to the card. This used to dock a detail pane
            beside the list — a second card page, reachable only from here and
            worse than the real one at `/cards/:id`. */}
        <div className="space-y-4">
          {loading ? (
              <CardGrid width={cardWidth}>
                {Array.from({ length: 20 }, (_, i) => (
                  <CardImageSkeleton key={i} width={cardWidth} fill />
                ))}
              </CardGrid>
            ) : groups.length === 0 ? (
              <div className="rounded-xl bg-card p-10 text-center shadow-lg shadow-black/20">
                <p className="font-medium">This decklist could not be loaded</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Precon lists are fetched live from a public repository. Try again shortly.
                </p>
              </div>
            ) : (
              groups.map(group => {
                const count = group.items.reduce((n, row) => n + row.quantity, 0);
                return (
                  <div key={group.category} className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                      <span
                        className={cn(
                          'h-3 w-1 rounded-full',
                          CATEGORY_BG_CLASS[group.category]
                        )}
                        aria-hidden
                      />
                      <span className={CATEGORY_TEXT_CLASS[group.category]}>{group.label}</span>
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </h3>

                    <CardGrid width={cardWidth}>
                      {group.items.map(row => (
                        // A real link, so the card can be opened in a new tab
                        // and the destination shows in the status bar.
                        <Link
                          key={row.id}
                          // `cardHref`, not the raw id: a row the local card
                          // table has never seen still carries its Scryfall id
                          // here, and the routed page resolves by name.
                          to={cardHref(rowCard(row))}
                          aria-label={row.card_name}
                          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <CardImage card={rowCard(row)} width={cardWidth} fill interactive>
                            {row.quantity > 1 && (
                              <span className="absolute left-1.5 top-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[0.7rem] font-bold tabular-nums text-foreground backdrop-blur-sm">
                                {row.quantity}
                              </span>
                            )}
                          </CardImage>
                        </Link>
                      ))}
                    </CardGrid>
                  </div>
                );
              })
            )}
        </div>
      </section>
    </div>
  );
}

export default PreconDeckView;
