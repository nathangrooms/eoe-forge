/**
 * What the commander costs, why it costs that, and how close it is to killing
 * somebody.
 *
 * ## The three questions this answers
 *
 *   IN THE COMMAND ZONE       what do I pay, and how much of that is tax
 *   IN A GRAVEYARD OR EXILE   CR 903.9a: do I take it back, and what then
 *   ANYWHERE                  who is this commander close to killing at 21
 *
 * ## Why the tax needs a sentence and not just a number
 *
 * A commander that costs five and then costs nine has not changed. The extra
 * four is CR 903.8, two for each time it has already been cast from the command
 * zone, and a player who cannot find that out is being asked to trust a number.
 * `commanderCost().why` is that sentence, built in the engine so this panel and
 * the button label cannot drift apart.
 *
 * The harness had measured the consequence over 80 recorded games: a commander
 * left the command zone 78 times and commander tax was charged 0 times, because
 * nothing could put a dead commander back and so nothing was ever cast twice.
 *
 * ## Nothing here decides anything
 *
 * CR 903.9a says *may*. Both choices are drawn, neither is pressed for the
 * player, and the one that does nothing is a real control rather than the
 * absence of one, because "leave it in the graveyard" is a decision a
 * reanimator deck makes on purpose.
 *
 * A block of the centre preview's details column, like the abilities and the
 * attachments above it. No dialog, no portal, no backdrop.
 */

import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import {
  commanderCost,
  commanderDamageDealt,
  commanderRefOf,
  commanderZoneOfferFor,
  type CardInstance,
  type GameAction,
  type GameState,
  type PlayerId,
} from '@/lib/game';

export interface CommanderPanelProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  card: CardInstance;
  /**
   * Take the CR 903.9a choice. The offer carries its own actions, so this only
   * has to be able to dispatch a batch, the same as every other control here.
   */
  onDispatch?: (actions: GameAction[]) => void;
  className?: string;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

export function CommanderPanel({
  state,
  viewerPlayerId,
  card,
  onDispatch,
  className,
}: CommanderPanelProps) {
  const ref = commanderRefOf(state, card);
  if (!ref) return null;

  const cost = commanderCost(state, ref.id);
  const offer = commanderZoneOfferFor(state, viewerPlayerId, card);
  const dealt = commanderDamageDealt(state, ref.id).filter(row => row.amount > 0);
  const mine = card.ownerId === viewerPlayerId;

  if (!cost) return null;

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* ------------------------------------------------------------ */}
      {/* The price of getting it onto the board                        */}
      {/* ------------------------------------------------------------ */}
      {card.zone === 'command' && (
        <div className="space-y-1">
          <Heading>From the command zone</Heading>
          <div className="flex flex-wrap items-center gap-1.5">
            <ManaCost cost={cost.printedCost} size="sm" />
            {cost.tax > 0 && (
              <>
                <span className="text-[11px] text-muted-foreground">plus</span>
                <span className="rounded-full bg-foreground/[0.14] px-2 text-[11px] font-semibold leading-5 text-foreground">
                  {cost.tax} tax
                </span>
              </>
            )}
            <span className="rounded-full bg-foreground/[0.06] px-2 text-[11px] leading-5 text-muted-foreground">
              {cost.totalMana} mana in total
            </span>
          </div>
          {/* WHY it went up. The whole point of the block. */}
          {cost.why ? (
            <p className="text-[10px] leading-snug text-muted-foreground">{cost.why}</p>
          ) : (
            <p className="text-[10px] leading-snug text-muted-foreground">
              No tax yet. Each cast from here adds {cost.perCast} mana to the next one.
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* CR 903.9a — the choice, both halves of it                     */}
      {/* ------------------------------------------------------------ */}
      {offer && (
        <div className="space-y-1.5 rounded-lg bg-foreground/[0.05] p-2">
          <Heading>Your choice</Heading>
          <p className="text-[11px] leading-snug text-foreground">{offer.reason}</p>
          {onDispatch ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onDispatch(offer.actions)}
                title={`Put ${offer.name} into your command zone. The next cast is ${offer.nextCastMana} mana.`}
                className={cn(
                  'flex h-8 items-center rounded-md bg-foreground px-3 text-[11px] font-semibold text-background',
                  'transition-colors hover:bg-foreground/90',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                To the command zone
              </button>
              {/* The other half of a "may". Drawn, because a choice with one
                  button on screen is not a choice a player knows they made. */}
              <span className="flex h-8 items-center rounded-md bg-foreground/[0.08] px-3 text-[11px] text-muted-foreground">
                Or leave it in your {offer.from}
              </span>
            </div>
          ) : (
            <p className="text-[10px] leading-snug text-muted-foreground">
              Only its owner can make this choice.
            </p>
          )}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Casting it again would cost {offer.nextCastMana} mana, {offer.nextCastTax} of that tax.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* CR 903.10 — twenty-one from this one commander                */}
      {/* ------------------------------------------------------------ */}
      {dealt.length > 0 && (
        <div className="space-y-1">
          <Heading>Commander damage dealt</Heading>
          {dealt.map(row => {
            return (
              <div key={row.toPlayerId} className="flex items-baseline gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                  {row.toPlayerName}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 text-[11px] font-semibold leading-5 tabular-nums',
                    row.fatal
                      ? 'bg-destructive/25 text-destructive-foreground'
                      : 'bg-foreground/[0.12] text-foreground'
                  )}
                >
                  {row.amount} of {row.lethal}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {row.fatal ? 'lethal' : `${row.remaining} more`}
                </span>
              </div>
            );
          })}
          {/* Never summed. 21 from one commander is lethal and 20 from each of
              two is not, and a readout that added them would teach the wrong
              rule at the moment it matters most. */}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Counted per commander. {cost.name} alone has to reach {state.rules.commanderDamageLethal}.
          </p>
        </div>
      )}

      {/* A commander sitting in a zone the rule does not reach, said once so a
          player is not left wondering where their commander went. */}
      {!offer && !mine && card.zone !== 'command' && card.zone !== 'battlefield' && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          This is {ref.name}, a commander. Its own controller decides where it goes.
        </p>
      )}
    </div>
  );
}

export default CommanderPanel;
