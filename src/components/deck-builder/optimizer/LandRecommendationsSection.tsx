/**
 * Land recommendations, plus what the mana base actually is.
 *
 * The old version drew each land into a 40×56 box with `object-cover`, which
 * cropped a Magic card to a postage stamp — the one thing design law says never
 * to do to card art. Lands are cards; they get the same grid as every other
 * suggestion.
 *
 * The header now reports the *measured* mana base — real source counts per
 * colour from `buildManaProfile`, computed from the decklist — beside the land
 * count the edge function returned. The count alone never explained why a
 * three-colour deck with 37 lands still stumbles.
 *
 * LANDS CAN NOW BE SWAPPED, NOT ONLY ADDED AND REMOVED
 * ----------------------------------------------------
 * The owner's ask was that lands get the same swap control the cards tab has.
 * They do, and it is the same control: `<SwapsSection>` renders the trades,
 * with its own words. There is no second swap implementation to keep in step
 * with the first, and the multi-apply confirmation is `<ConfirmBar>`, which
 * scrolls itself into view for the reason recorded in that file.
 *
 * Add and swap are different answers to different questions and both are here.
 * When the deck is short of lands there is an empty slot, so ADD is the
 * answer. When the count is where it should be there is no slot, so the only
 * way to play a better land is to trade one, and the swap group says so in a
 * line rather than leaving a player to notice their deck went to 101 cards.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mountain, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { CardGrid } from '@/components/cards';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SuggestionTile, TilePill } from './SuggestionTile';
import { SwapsSection, type SwapSuggestion } from './SwapsSection';
import { landFactsLine, type LandGrounds } from './landFacts';
import { colourSourceReadout } from '@/lib/deck/playabilityView';
import type { ManaProfile } from '@/lib/deck/playability';
import type { ReactNode } from 'react';

/**
 * Re-exported so existing importers keep working. It lives in `landFacts.ts`
 * now, beside the one function that turns it into a sentence, because the land
 * swap rows print the same sentence and there must be only one of it.
 */
export type { LandGrounds };

/**
 * The basics this deck still needs, counted rather than recommended.
 *
 * The owner's objection was that this tab suggested Plains, and it is right: a
 * basic land is not advice, it is what goes in the slots nothing better wants.
 * So the shortfall is one line with a count, and the tiles are kept for lands
 * that actually do something.
 */
export interface BasicFiller {
  shortfall: number;
  byColour: Array<{ colour: string; name: string; quantity: number }>;
  note: string;
}

export interface LandRecommendation {
  type: 'add' | 'remove';
  name: string;
  /** Full card object for `<CardImage>`. `null` if Scryfall lookup failed. */
  card: any | null;
  /**
   * `null` when there is no USD price, never coerced to 0. Lands were the
   * one tab that showed no money at all, which made "add this land" a
   * recommendation you could not cost. A fetch land and a basic are the same
   * suggestion until you can see one is $18 and the other is free.
   */
  price: number | null;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  category?: string;
  /**
   * Copies in the user's collection, counted from `user_collections`.
   *
   * A counted figure only. The panel drops the edge function's floor-of-1 for
   * a name the client merely listed, because "you already own this, it is
   * free" is a claim that has to be true.
   */
  ownedQuantity?: number;
  grounds?: LandGrounds | null;
}

interface LandRecommendationsSectionProps {
  /**
   * Both are counted from the real decklist by the edge function, and both are
   * `null` when it reported neither. The panel used to default them to 0 and 37
   * locally, which rendered "0 / 37 lands · 37 short of the target" as the
   * headline of this tab out of two constants. 37 is a real Commander
   * convention, but a convention nothing measured is not this deck's target,
   * and a land count of zero is never true of a deck that has just been
   * analysed. Absent counts now mean an absent block.
   */
  currentLandCount: number | null;
  idealLandCount: number | null;
  recommendations: LandRecommendation[];
  /** Measured from the real decklist. `null` before an analysis has run. */
  manaProfile: ManaProfile | null;
  /** `null` when the deck is not short of lands, and then nothing renders. */
  basicFiller?: BasicFiller | null;
  /**
   * Land-for-land trades, measured by the edge function.
   *
   * The same type the cards tab uses, because they are rendered by the same
   * component. Empty means no pair could be justified, which is a real answer.
   */
  swaps: SwapSuggestion[];
  onToggleSwap: (index: number) => void;
  onApplySingleSwap: (index: number) => void;
  onApplySelectedSwaps: () => void;
  /** The confirmation, when one is open. Rendered after the swap list. */
  swapConfirm?: ReactNode;
  /**
   * How many of the deck's empty slots are lands, counted server-side.
   *
   * `null` when the deck is not short of cards. It is the reason this tab is
   * worth doing before the ideas tab, and saying it here is half of making
   * that order visible rather than silent.
   */
  landSlots?: number | null;
  emptySlots?: number | null;
  onAddLand: (name: string) => void;
  onRemoveLand: (name: string) => void;
  isApplying: boolean;
  /** The deck these were suggested for, kept as the reason on the shopping list. */
  deckId?: string | null;
}

export function LandRecommendationsSection({
  currentLandCount,
  idealLandCount,
  recommendations,
  manaProfile,
  basicFiller,
  swaps,
  onToggleSwap,
  onApplySingleSwap,
  onApplySelectedSwaps,
  swapConfirm,
  landSlots,
  emptySlots,
  onAddLand,
  onRemoveLand,
  isApplying,
  deckId,
}: LandRecommendationsSectionProps) {
  const hasCounts = currentLandCount !== null && idealLandCount !== null;
  const landDiff = hasCounts ? currentLandCount - idealLandCount : null;
  const needsMore = landDiff !== null && landDiff < -2;
  const needsLess = landDiff !== null && landDiff > 2;
  const isOptimal = landDiff !== null && Math.abs(landDiff) <= 2;

  const toAdd = recommendations.filter(r => r.type === 'add');
  const toRemove = recommendations.filter(r => r.type === 'remove');

  // Why this tab is worth doing first. Counted server-side, printed here, and
  // never recomputed locally: a second calculation is how two numbers on one
  // screen start disagreeing.
  const landsFirst = typeof landSlots === 'number' && landSlots > 0;

  // The deck page's own readout, reused. It already drops colours the deck does
  // not play, so a mono-red deck never prints "White 0".
  const colourRows = manaProfile ? colourSourceReadout(manaProfile) : [];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
            <div>
              <div className="flex items-center gap-2.5">
                <Mountain className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-xl font-bold">Mana base</h3>
              </div>
              {hasCounts && (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums">
                    {currentLandCount}
                    <span className="text-lg font-medium text-muted-foreground">
                      {' '}
                      / {idealLandCount} lands
                    </span>
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-sm font-medium',
                      isOptimal ? 'text-muted-foreground' : 'text-destructive'
                    )}
                  >
                    {isOptimal && 'Within the normal range'}
                    {needsMore && `${Math.abs(landDiff!)} short of the target`}
                    {needsLess && `${landDiff} over the target`}
                  </p>
                </>
              )}
            </div>

            {/* Measured, not suggested: these come from the decklist itself. */}
            {colourRows.length > 0 && (
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sources by colour · counts every land, rock and dork
                </p>
                <div className="flex flex-wrap gap-2">
                  {colourRows.map(row => (
                    <span
                      key={row.colour}
                      className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium"
                    >
                      {row.name} <span className="tabular-nums">{row.sources}</span>
                    </span>
                  ))}
                </div>
                {manaProfile && (
                  <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                    {manaProfile.landCount} lands · {manaProfile.rockCount} rocks ·{' '}
                    {manaProfile.dorkCount} dorks
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Why this tab came before the ideas tab. Said where the ordering
              is, rather than left as a rearrangement nobody explained. */}
          {landsFirst && (
            <p className="mt-5 text-sm leading-relaxed">
              <span className="font-semibold">Lands first.</span>{' '}
              {landSlots} of the {emptySlots} empty slots in this deck are lands. Fill the
              mana base before the spells: a spell you cannot cast is worth less than the
              land that casts it.
            </p>
          )}
        </CardContent>
      </Card>

      {toAdd.length > 0 && (
        <LandGroup
          title="Add"
          count={toAdd.length}
          items={toAdd}
          isApplying={isApplying}
          /* Only on the lands being ADDED. A land the optimiser wants you to
             cut is already in the deck, so offering to buy it is nonsense. */
          offerLists
          deckId={deckId}
          action={land => (
            <Button
              className="w-full"
              size="lg"
              onClick={() => onAddLand(land.name)}
              disabled={isApplying}
            >
              {isApplying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add
            </Button>
          )}
        />
      )}

      {basicFiller && basicFiller.shortfall > 0 && <BasicFillerLine filler={basicFiller} />}

      {/* The same component the cards tab uses, with the words a land wants.
          Not sticky: its command bar sits inside this list rather than at the
          top of the tab, and two things competing for `top-2` is one of them
          landing on the other. */}
      {swaps.length > 0 && (
        <SwapsSection
          suggestions={swaps}
          onToggle={onToggleSwap}
          onApplySingle={onApplySingleSwap}
          onApplySelected={onApplySelectedSwaps}
          isApplying={isApplying}
          title="Land swaps"
          noun="land swap"
          sticky={false}
          lead={
            <>
              Each of these trades one land for another, so the deck stays the same size
              and the land count does not move.
              {needsMore &&
                ' This deck is still short of lands, so these are on top of the lands to add above, not instead of them.'}
            </>
          }
          footer={swapConfirm}
        />
      )}

      {toRemove.length > 0 && (
        <LandGroup
          title="Remove"
          count={toRemove.length}
          items={toRemove}
          isApplying={isApplying}
          action={land => (
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={() => onRemoveLand(land.name)}
              disabled={isApplying}
            >
              {isApplying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remove
            </Button>
          )}
        />
      )}

      {recommendations.length === 0 && swaps.length === 0 && !basicFiller && (
        <Card className="shadow-lg">
          <CardContent className="p-10 text-center">
            <Check className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">
              {isOptimal
                ? 'No land changes suggested, the count is where it should be.'
                : 'No specific land changes were returned for this deck.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LandGroup({
  title,
  count,
  items,
  isApplying,
  action,
  offerLists,
  deckId,
}: {
  title: string;
  count: number;
  items: LandRecommendation[];
  isApplying: boolean;
  action: (land: LandRecommendation) => React.ReactNode;
  offerLists?: boolean;
  deckId?: string | null;
}) {
  return (
    <section className="space-y-4">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {count}
      </h4>
      <CardGrid width={260} gap={20}>
        <AnimatePresence mode="popLayout">
          {items.map(land => (
            <motion.div
              key={`${land.type}-${land.name}`}
              layout
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
            >
              <SuggestionTile
                name={land.name}
                /* A failed Scryfall lookup still gets a tile — `CardImage`
                   renders its own skeleton for a card with no art, which beats
                   dropping the recommendation on the floor. */
                card={land.card ?? { name: land.name }}
                price={land.ownedQuantity ? null : land.price}
                reason={land.reason}
                tags={<LandPills land={land} />}
                footnote={<LandFacts land={land} />}
                action={action(land)}
                offerLists={offerLists}
                deckId={deckId}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </CardGrid>
    </section>
  );
}

/**
 * The pills above the art: what this land is for, and whether it is free.
 *
 * Ownership comes first because it changes the decision. Every other line on
 * this tab is a thing to go and buy; "you already own one" is the one that is
 * not, and burying it under a category would waste it.
 */
function LandPills({ land }: { land: LandRecommendation }) {
  const owned = land.ownedQuantity ?? 0;
  return (
    <>
      {owned > 0 && (
        <TilePill>
          <Check className="mr-1 inline h-3 w-3" />
          {owned > 1 ? `You own ${owned}` : 'You own this'}
        </TilePill>
      )}
      {land.category && <TilePill>{land.category}</TilePill>}
    </>
  );
}

/** The measured facts under the reason, from the engine rather than the model. */
function LandFacts({ land }: { land: LandRecommendation }) {
  const line = landFactsLine(land.grounds);
  if (!line) return null;
  return <p className="text-xs font-medium text-muted-foreground">{line}</p>;
}

/**
 * The basics, as one line.
 *
 * This is the whole answer to "why is it suggesting Plains". It was suggesting
 * Plains because it was asked for one recommendation per empty land slot, and a
 * deck nine lands short has nine slots. Nine slots is a sentence, not nine
 * cards, and the split comes from what the deck's own spells cost rather than
 * from a model's guess.
 */
function BasicFillerLine({ filler }: { filler: BasicFiller }) {
  return (
    <Card className="shadow-lg">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filler
          </p>
          <p className="mt-1.5 text-base leading-relaxed">{filler.note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filler.byColour.map(b => (
            <span
              key={b.name}
              className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium tabular-nums"
            >
              {b.quantity} {b.name}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
