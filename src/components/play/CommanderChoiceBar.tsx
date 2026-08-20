/**
 * "Your commander is in your graveyard. Where does it go?"
 *
 * CR 903.9a is the format's own rule and it is a *may*: a commander that would
 * be put into a graveyard or exile may be put into the command zone instead,
 * and its owner decides. This is the moment that decision arrives.
 *
 * ## Why it needs a strip of its own
 *
 * Measured over 80 recorded harness games before this existed: 24 commanders
 * died and 0 came back, because nothing in the app could move a card into a
 * command zone at all — `cardActions.ts` did not even list it among the zones a
 * card can be sent to by hand. A commander that died was gone for the rest of
 * the game, which is not the format.
 *
 * The card-shaped version of this offer lives in `CommanderPanel`, inside the
 * centre preview. That is the right place to READ it and the wrong place to
 * find out about it: a commander dying in the middle of combat damage does not
 * announce itself, and nobody clicks a graveyard on the off chance. So the
 * question comes to the player, once, in the band under the HUD that the
 * mulligan bar and the stack strip already use.
 *
 * ## Both halves are drawn
 *
 * "Leave it there" is a real button, not the absence of one. A choice with a
 * single control on screen is not a choice a player knows they made, and
 * leaving a commander in a graveyard is exactly right for a deck built to bring
 * it back from there. Dismissing is keyed on the card's zone-change counter, so
 * a commander that dies AGAIN is a new object under CR 400.7 and asks again.
 *
 * Made of the mat's own material, in the band the combat strip uses. No dialog,
 * no backdrop, nothing covered, and it gates nothing: the game keeps running
 * underneath and the player can ignore it entirely.
 */

import { Crown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import type { CommanderZoneOffer, GameAction } from '@/lib/game';

export interface CommanderChoiceBarProps {
  offers: readonly CommanderZoneOffer[];
  /** Take the offer. It carries its own actions. */
  onTake: (actions: GameAction[]) => void;
  /** Open the commander in the centre preview, where the full block is. */
  onOpen: (instanceId: string) => void;
  /** Leave it where it is, for now. */
  onDismiss: () => void;
  className?: string;
}

export function CommanderChoiceBar({
  offers,
  onTake,
  onOpen,
  onDismiss,
  className,
}: CommanderChoiceBarProps) {
  if (offers.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex max-w-[min(94vw,44rem)] flex-col gap-1.5 overflow-hidden rounded-xl px-3 py-2 shadow-xl shadow-black/50',
        className
      )}
      role="group"
      aria-label={`${offers.length} commander choice${offers.length === 1 ? '' : 's'}`}
    >
      <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />

      <div className="relative flex items-center gap-2">
        <Crown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Your choice
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          A commander may go to the command zone instead (CR 903.9a).
        </span>
        <button
          type="button"
          onClick={onDismiss}
          title="Leave it where it is for now"
          aria-label="Leave it where it is for now"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {offers.map(offer => (
        <div
          key={offer.instanceId}
          className="relative flex items-center gap-2 rounded-lg bg-foreground/[0.06] px-2 py-1.5"
        >
          <button
            type="button"
            onClick={() => onOpen(offer.instanceId)}
            title={`Look at ${offer.name}`}
            className="flex min-w-0 flex-1 items-baseline gap-2 rounded text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="shrink-0 text-xs font-semibold text-foreground">{offer.name}</span>
            {/* Truncates last, and says the shortest true thing. The first
                version read "Recasting it costs 7 mana, 2 of that tax" and was
                measured on screen as "Recasting it costs 7 m…", which is a
                sentence that has lost the only number in it. */}
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              in your {offer.from}. Recast for {offer.nextCastMana} mana, {offer.nextCastTax} of that tax.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTake(offer.actions)}
            title={`Put ${offer.name} into your command zone`}
            className="flex h-7 shrink-0 items-center rounded-md bg-foreground px-2.5 text-[11px] font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Command zone
          </button>
          <button
            type="button"
            onClick={onDismiss}
            title={`Leave ${offer.name} in your ${offer.from}`}
            className="flex h-7 shrink-0 items-center rounded-md bg-foreground/[0.10] px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Leave it
          </button>
        </div>
      ))}
    </div>
  );
}

export default CommanderChoiceBar;
