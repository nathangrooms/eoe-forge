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
 */

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mountain, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { CardGrid } from '@/components/cards';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SuggestionTile, TilePill } from './SuggestionTile';
import { colourSourceReadout } from '@/lib/deck/playabilityView';
import type { ManaProfile } from '@/lib/deck/playability';

export interface LandRecommendation {
  type: 'add' | 'remove';
  name: string;
  /** Full card object for `<CardImage>`. `null` if Scryfall lookup failed. */
  card: any | null;
  /**
   * `null` when Scryfall has no USD price, never coerced to 0. Lands were the
   * one tab that showed no money at all, which made "add this land" a
   * recommendation you could not cost. A fetch land and a basic are the same
   * suggestion until you can see one is $18 and the other is free.
   */
  price: number | null;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  category?: string;
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

      {recommendations.length === 0 && (
        <Card className="shadow-lg">
          <CardContent className="p-10 text-center">
            <Check className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">
              {isOptimal
                ? 'No land changes suggested — the count is where it should be.'
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
                price={land.price}
                reason={land.reason}
                tags={land.category ? <TilePill>{land.category}</TilePill> : undefined}
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
