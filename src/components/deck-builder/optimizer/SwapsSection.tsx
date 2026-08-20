/**
 * Swaps, rebuilt around the cards themselves.
 *
 * The previous version was a dense text row with two 64px thumbnails wedged
 * beside 9px labels — the owner's "cannot see anything, all so small" was
 * pointed squarely at this file. A swap *is* two cards, so the two cards are
 * now the interface: full art at reading size, side by side, with the reason
 * between them and the mana consequence underneath it.
 *
 * Three other things changed for design-law reasons:
 *   - `<img>` is gone. Card art goes through `<CardImage>`, which picks the
 *     Scryfall resolution to match the rendered size and flips double-faced
 *     cards. Hand-rolled tags did neither.
 *   - Borders are gone. Rows separate by surface tint and shadow.
 *   - The inner `ScrollArea` is gone. It capped the list at 500px inside a
 *     full-height page, so big art would have been trapped in a letterbox.
 *     The page scrolls; the list is just a list.
 *
 * ONE SWAP IMPLEMENTATION, TWO TABS
 * ---------------------------------
 * Lands were given the same swap control the spells tab has, and how that was
 * done matters: this file is still the only swap implementation in the
 * optimiser. The lands tab renders THIS component with different words rather
 * than a second version of it, because a second version starts identical and
 * drifts apart on the first change to either. Everything that differs between
 * a land trade and a spell trade is a string — the heading, the noun, the
 * lead-in — so those are props. A land swap and a card swap are the same
 * object: two cards, a reason each, and one button.
 */

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowDown, Check, Loader2, Package, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage, useOpenCard } from '@/components/cards';
import { motion, AnimatePresence } from 'framer-motion';
import { ManaImpactNote } from './ManaImpactNote';
import { PowerImpactBadge } from './PowerImpactBadge';
import { playabilityBand } from '@/lib/deck/playabilityView';
import type { ManaImpact } from './manaImpact';
import type { CardPlayability } from '@/lib/deck/playability';

export interface SwapSuggestion {
  currentCard: {
    name: string;
    /** Full card object — Scryfall shape or a deck row. Drives `<CardImage>`. */
    card: any;
    price: number | null;
    reason: string;
    playability?: number | null;
    /**
     * Measured facts about this card, in one line, from the engine.
     *
     * Lands use it for what the card taps for and whether it enters tapped —
     * the same line the land tiles carry, phrased by the same helper. Absent
     * means nothing was measured and renders as nothing, never as a zero.
     */
    facts?: string | null;
  };
  newCard: {
    name: string;
    card: any;
    price: number | null;
    reason: string;
    type?: string;
    inCollection?: boolean;
    synergy?: string;
    /**
     * The row id in OUR `cards` table, as the edge function resolved it.
     *
     * `card` above is whatever Scryfall returned for that name, which may be a
     * printing we do not hold — and `deck_cards.card_id` carries a foreign key,
     * so writing that id can fail. This one came out of a row the optimiser
     * actually fetched, so it is the id a caller applying the swap must write.
     * Null when the response did not carry one.
     */
    cardId?: string | null;
    /** Measured facts, one line. See `currentCard.facts`. */
    facts?: string | null;
    /**
     * Copies in the user's collection, counted from `user_collections`.
     *
     * Separate from `inCollection`, which can also be true because the client
     * merely listed the name. A count is only put on screen when it was
     * counted.
     */
    ownedQuantity?: number | null;
  };
  priority: 'high' | 'medium' | 'low';
  category?: string;
  /**
   * The model's own power-delta estimate, or `null` when it did not give one.
   * Never defaulted to a constant — see the note in `AIOptimizerPanel`.
   */
  edhImpact?: number | null;
  /** Computed, not estimated. `null` when the swap does not move the mana base. */
  manaImpact?: ManaImpact | null;
  /**
   * Castability of the incoming card on the sources it would actually arrive
   * on: the post-swap base when the swap moves the mana base, the current base
   * otherwise. Quoting the current base for a land-cutting swap contradicts the
   * mana note sitting directly above it.
   */
  addCastability?: CardPlayability | null;
  /** True when `addCastability` was scored on the post-swap mana base. */
  addCastabilityAfterSwap?: boolean;
  selected: boolean;
}

interface SwapsSectionProps {
  suggestions: SwapSuggestion[];
  onToggle: (index: number) => void;
  onApplySingle: (index: number) => void;
  onApplySelected: () => void;
  onFindMoreSwaps?: () => void;
  isApplying: boolean;
  isLoadingMore?: boolean;
  useCollection?: boolean;
  /** Heading on the command bar. Defaults to the card-swap wording. */
  title?: string;
  /**
   * The noun on the buttons and counts, singular. "swap" for cards, "land
   * swap" for lands. Pluralised by adding an s, which is all either needs.
   */
  noun?: string;
  /**
   * A sentence under the command bar, for anything true of the whole list.
   *
   * The lands tab uses it to say that a trade keeps the land count where it
   * is, which is the one thing a player needs to know before applying six of
   * them while the deck is short of lands.
   */
  lead?: ReactNode;
  /**
   * Rendered after the list. This is where a confirmation goes.
   *
   * It has to come after, because a confirmation that covers the swaps hides
   * the thing it is asking you to check. `ConfirmBar` is what scrolls itself
   * into view so that being below the fold does not read as nothing happening.
   */
  footer?: ReactNode;
  /** Whether the command bar sticks to the top. Off inside another list. */
  sticky?: boolean;
}

const PRIORITY_LABEL = {
  high: 'Critical',
  medium: 'Recommended',
  low: 'Optional',
} as const;

/** Money is only shown when both sides actually have a price. */
function priceDelta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

function formatPrice(price: number | null): string | null {
  if (price === null) return null;
  return `$${price.toFixed(2)}`;
}

export function SwapsSection({
  suggestions,
  onToggle,
  onApplySingle,
  onApplySelected,
  onFindMoreSwaps,
  isApplying,
  isLoadingMore,
  useCollection,
  title = 'Card replacements',
  noun = 'swap',
  lead,
  footer,
  sticky = true,
}: SwapsSectionProps) {
  const selected = suggestions.filter(s => s.selected);
  const selectedCount = selected.length;

  // Only sum swaps where both prices are known; a missing price must not read
  // as $0 and quietly understate the bill.
  const pricedSelected = selected.filter(
    s => s.newCard.price !== null && s.currentCard.price !== null
  );
  const totalCostDiff = pricedSelected.reduce(
    (sum, s) => sum + ((s.newCard.price ?? 0) - (s.currentCard.price ?? 0)),
    0
  );

  const order = ['high', 'medium', 'low'] as const;

  return (
    <div className="space-y-6">
      {/* Command bar. Sticks to the top so Apply stays reachable however far
          down the list you have scrolled — the old version put it in a header
          card that scrolled away above a 500px inner scroller.

          Not sticky on the lands tab, where this list sits inside a longer
          page: two cards both claiming `top-2` is one of them landing on the
          other. */}
      <Card
        className={cn(
          'bg-card/95 shadow-lg backdrop-blur',
          sticky && 'sticky top-2 z-20'
        )}
      >
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {suggestions.length} suggested
              {selectedCount > 0 && <> · {selectedCount} selected</>}
              {pricedSelected.length > 0 && (
                <>
                  {' '}
                  · {totalCostDiff >= 0 ? '+' : '−'}$
                  {Math.abs(totalCostDiff).toFixed(2)}
                  {pricedSelected.length !== selectedCount && ' (priced swaps only)'}
                </>
              )}
              {useCollection && <> · from your collection</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onFindMoreSwaps && (
              <Button
                variant="outline"
                size="lg"
                onClick={onFindMoreSwaps}
                disabled={isLoadingMore || isApplying}
              >
                {isLoadingMore ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Find more
              </Button>
            )}
            <Button
              size="lg"
              onClick={onApplySelected}
              disabled={selectedCount === 0 || isApplying}
            >
              {isApplying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Apply {selectedCount > 0 ? selectedCount : ''} {noun}
              {selectedCount === 1 ? '' : 's'}
            </Button>
          </div>

          {lead && (
            <p className="w-full text-sm leading-relaxed text-muted-foreground">{lead}</p>
          )}
        </CardContent>
      </Card>

      {order.map(priority => {
        const items = suggestions.filter(s => s.priority === priority);
        if (items.length === 0) return null;

        return (
          <section key={priority} className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {PRIORITY_LABEL[priority]} · {items.length}
            </h4>

            <div className="space-y-5">
              <AnimatePresence mode="popLayout">
                {items.map(swap => {
                  const index = suggestions.indexOf(swap);
                  const delta = priceDelta(swap.newCard.price, swap.currentCard.price);

                  return (
                    <motion.article
                      key={`${swap.currentCard.name}→${swap.newCard.name}`}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        'rounded-2xl p-5 transition-colors sm:p-6',
                        // Selection reads as a lift in surface tone, not an
                        // outline — design law 2.
                        swap.selected ? 'bg-muted shadow-xl' : 'bg-card shadow-lg'
                      )}
                    >
                      {/* Row header: what kind of swap, and the two controls. */}
                      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={swap.selected}
                            onChange={() => onToggle(index)}
                            className="h-5 w-5 cursor-pointer accent-primary"
                          />
                          <span className="text-base font-semibold">
                            {swap.category || PRIORITY_LABEL[swap.priority]}
                          </span>
                        </label>

                        <div className="ml-auto flex flex-wrap items-center gap-3">
                          {delta !== null && (
                            <span
                              className={cn(
                                'rounded-lg bg-muted px-3 py-1.5 text-sm font-medium tabular-nums',
                                swap.selected && 'bg-background/60'
                              )}
                            >
                              {delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}
                            </span>
                          )}
                          {/* Renders nothing when the model returned no
                              estimate — the badge owns that decision. */}
                          <PowerImpactBadge
                            impact={swap.edhImpact}
                            className={swap.selected ? 'bg-background/60' : undefined}
                          />
                          <Button
                            size="lg"
                            onClick={() => onApplySingle(index)}
                            disabled={isApplying}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Apply this {noun}
                          </Button>
                        </div>
                      </div>

                      {/* The swap itself. Cards get their own columns and keep
                          their full frame — never cropped to a band. */}
                      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,17rem)] lg:gap-8">
                        <SwapSide
                          label="Cut"
                          tone="out"
                          name={swap.currentCard.name}
                          card={swap.currentCard.card}
                          price={swap.currentCard.price}
                          playability={swap.currentCard.playability}
                          facts={swap.currentCard.facts}
                        />

                        <div className="space-y-4 lg:pt-8">
                          <div className="flex items-center gap-3 lg:justify-center">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
                              <ArrowDown className="h-5 w-5 lg:hidden" />
                              <ArrowRight className="hidden h-5 w-5 lg:block" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground lg:hidden">
                              Replace with
                            </span>
                          </div>

                          <div className="space-y-4 rounded-xl bg-muted/60 p-4">
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Why cut {swap.currentCard.name}
                              </p>
                              <p className="text-base leading-relaxed">
                                {swap.currentCard.reason}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Why {swap.newCard.name}
                              </p>
                              <p className="text-base leading-relaxed">{swap.newCard.reason}</p>
                              {swap.newCard.synergy && (
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                  {swap.newCard.synergy}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Computed consequences, shown only when real. */}
                          <ManaImpactNote impact={swap.manaImpact ?? null} />

                          {swap.addCastability && swap.addCastability.pct !== null && (
                            <p className="rounded-xl bg-background/60 p-4 text-sm leading-relaxed">
                              <span className="font-semibold">{swap.newCard.name}</span> is
                              castable on turn {swap.addCastability.turn} in{' '}
                              <span
                                className={cn(
                                  'font-semibold tabular-nums',
                                  playabilityBand(swap.addCastability.pct).textClass
                                )}
                              >
                                {swap.addCastability.pct.toFixed(0)}%
                              </span>{' '}
                              of games on{' '}
                              {swap.addCastabilityAfterSwap
                                ? 'the mana base this swap leaves behind'
                                : 'this mana base'}
                              .
                            </p>
                          )}
                        </div>

                        <SwapSide
                          label="Add"
                          tone="in"
                          name={swap.newCard.name}
                          card={swap.newCard.card}
                          price={swap.newCard.price}
                          owned={swap.newCard.inCollection}
                          ownedQuantity={swap.newCard.ownedQuantity}
                          facts={swap.newCard.facts}
                        />
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        );
      })}

      {footer}
    </div>
  );
}

interface SwapSideProps {
  label: string;
  tone: 'in' | 'out';
  name: string;
  card: any;
  price: number | null;
  playability?: number | null;
  owned?: boolean;
  /** Counted copies, when the count came from the collection itself. */
  ownedQuantity?: number | null;
  /** One line of measured facts, under the name. */
  facts?: string | null;
}

/**
 * One side of a swap: the card at a size you can actually read, with its name
 * and the couple of facts that belong on the card rather than in the reason.
 */
function SwapSide({
  label,
  tone,
  name,
  card,
  price,
  playability,
  owned,
  ownedQuantity,
  facts,
}: SwapSideProps) {
  const counted = typeof ownedQuantity === 'number' && ownedQuantity > 0;
  /*
   * The price stays on screen even when the card is owned, which is the
   * opposite of what the land TILES do, and the difference is deliberate. A
   * tile is a thing to go and buy, so "you own it" replaces the price. A swap
   * is a comparison of two cards, the command bar above sums exactly these two
   * numbers, and hiding one of them would leave a total nothing on the row
   * adds up to. The pill says you do not have to buy it.
   */
  const priceLabel = formatPrice(price);
  // Card click navigates to `/cards/:id`, same as the deck grid one component
  // across on this very page. The optimiser is the surface where "what does
  // this card actually do?" is the whole question, and until now it was the
  // one card-heavy surface where the art was inert.
  const openCard = useOpenCard();

  return (
    <div className="mx-auto w-full max-w-[17rem] lg:mx-0">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
            tone === 'out' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-foreground'
          )}
        >
          {label}
        </span>
        {(owned || counted) && (
          <span className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
            <Package className="h-3 w-3" />
            {counted && ownedQuantity! > 1 ? `You own ${ownedQuantity}` : 'Owned'}
          </span>
        )}
        {/* Labelled, not bare. A pill reading "41%" beside a card is a number
            with no stated unit — it could be a price, a win rate or a share of
            the deck. The removals grid already says "41% castable"; this is the
            same measurement and says the same words. */}
        {playability !== null && playability !== undefined && (
          <span
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium"
            title="Castability on this deck's mana base"
          >
            <span className="tabular-nums">{playability.toFixed(0)}%</span> castable
          </span>
        )}
      </div>

      {/* `fill` + `size="xl"` so the art is requested at 672px and drawn at
          ~272px — the resolution ladder in CardImage depends on the size token,
          which `fill` does not infer. */}
      <CardImage
        card={card}
        size="xl"
        fill
        onClick={() => openCard(card)}
        imageClassName={tone === 'out' ? 'opacity-90' : undefined}
      />

      <div className="mt-3">
        <p className="text-base font-semibold leading-snug">{name}</p>
        {priceLabel && (
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{priceLabel}</p>
        )}
        {/* Measured, from the engine, and absent when nothing was measured. */}
        {facts && <p className="mt-1 text-xs font-medium text-muted-foreground">{facts}</p>}
      </div>
    </div>
  );
}
