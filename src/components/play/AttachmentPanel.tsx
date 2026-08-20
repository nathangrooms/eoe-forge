/**
 * Which creature is carrying the sword, and what the sword is giving it.
 *
 * ## What this closes
 *
 * `ATTACH` had a reducer, a log line and its own passing tests, and nothing in
 * the app had ever built one, so 672 Equipment and 1,299 Auras in the card pool
 * were cards that could be cast and then did nothing at all. `attach.ts` is the
 * engine half; `AbilityPanel` draws the equip button, because equip is an
 * ordinary activated ability once the compiler expands the keyword; and this is
 * the half that answers the two questions a player asks about an attachment
 * that already exists:
 *
 *   ON A CREATURE       what is on this, and what am I getting from it
 *   ON AN AURA / SWORD  what is this on
 *   IN HAND, AN AURA    what can I put this on
 *
 * ## Nothing here computes a bonus
 *
 * `grantsOn` reads the layer engine's own applied-effect trace, so this panel
 * cannot print "+2/+0" for an effect the board is not applying. An attachment
 * whose text the compiler has not modelled shows its name and nothing else,
 * which is the true thing to say about Pacifism today. Inventing a plausible
 * bonus beside a creature that is not getting one would be worse than the
 * silence this replaces.
 *
 * ## No dialog, no portal, no backdrop
 *
 * A block of the centre preview's details column, like the abilities above it.
 */

import { cn } from '@/lib/utils';
import {
  attachmentKindOf,
  auraNeedsHost,
  grantsOn,
  hostOf,
  hostPrompt,
  legalHostsFor,
  type CardInstance,
  type GameState,
  type InstanceId,
  type PlayerId,
} from '@/lib/game';

export interface AttachmentPanelProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  card: CardInstance;
  /**
   * Cast this Aura at that permanent. The page owns the reducer and the timing
   * check, exactly as it does for an ordinary cast; this only names the host.
   */
  onCastAt?: (card: CardInstance, hostId: InstanceId) => void;
  className?: string;
}

const KIND_WORD = {
  equipment: 'Equipment',
  aura: 'Aura',
  fortification: 'Fortification',
} as const;

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

function Chip({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 max-w-full items-center truncate rounded-md bg-foreground/[0.10] px-2',
        'text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.20]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {label}
    </button>
  );
}

export function AttachmentPanel({
  state,
  viewerPlayerId,
  card,
  onCastAt,
  className,
}: AttachmentPanelProps) {
  const kind = attachmentKindOf(card);
  const nameOf = (instanceId: InstanceId) => state.cards[instanceId]?.name ?? 'That permanent';

  /* ---------------------------------------------------------------- */
  /* An Aura in hand: where can it go                                 */
  /* ---------------------------------------------------------------- */

  if (card.zone === 'hand' && auraNeedsHost(card) && card.controllerId === viewerPlayerId) {
    const hosts = onCastAt ? legalHostsFor(state, viewerPlayerId, card) : [];
    return (
      <div className={cn('w-full space-y-1.5', className)}>
        <Heading>Enchant</Heading>
        {/* The card's own line, verbatim. A player has to be able to check the
            engine against the card rather than against a paraphrase of it. */}
        <p className="text-[11px] leading-snug text-foreground">{hostPrompt(card)}</p>
        {hosts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {hosts.map(instanceId => (
              <Chip
                key={instanceId}
                label={nameOf(instanceId)}
                title={`Cast ${card.name} on ${nameOf(instanceId)}`}
                onClick={() => onCastAt?.(card, instanceId)}
              />
            ))}
          </div>
        ) : (
          /* A refusal is a sentence, never a dead button. An Aura with no legal
             target cannot be cast at all (CR 601.2c), and saying so is the
             difference between a rule and a bug. */
          <p className="text-[10px] leading-snug text-muted-foreground">
            There is nothing on the board this can go on right now.
          </p>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* On the battlefield                                               */
  /* ---------------------------------------------------------------- */

  if (card.zone !== 'battlefield') return null;

  const host = hostOf(state, card);
  const carried = grantsOn(state, card.instanceId);

  if (!kind && carried.length === 0) return null;

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {/* What this attachment is on. */}
      {kind && (
        <div className="space-y-1">
          <Heading>{KIND_WORD[kind]}</Heading>
          <p className="text-[11px] leading-snug text-foreground">
            {host ? `On ${host.name}.` : 'Not attached to anything.'}
          </p>
          {!host && kind === 'equipment' && (
            <p className="text-[10px] leading-snug text-muted-foreground">
              It gives nothing until it is equipped to a creature.
            </p>
          )}
        </div>
      )}

      {/* What this permanent is carrying, and what each thing gives it. */}
      {carried.length > 0 && (
        <div className="space-y-1">
          <Heading>Carrying</Heading>
          {carried.map(grant => (
            <div key={grant.instanceId} className="rounded-lg bg-foreground/[0.05] p-2">
              <div className="flex items-baseline gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                  {grant.name}
                </span>
                {grant.statLine && (
                  <span className="shrink-0 rounded-full bg-foreground/[0.12] px-1.5 text-[10px] font-semibold leading-4 text-foreground">
                    {grant.statLine}
                  </span>
                )}
              </div>

              {grant.keywords.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {grant.keywords.map(keyword => (
                    <span
                      key={keyword}
                      className="rounded-full bg-foreground/[0.08] px-1.5 text-[10px] capitalize leading-4 text-foreground"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              {/* The card's own clause. Shown whether or not a number was read
                  off it, because the clause is the thing that is true. */}
              {grant.clauses.map(clause => (
                <p key={clause} className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  {clause}
                </p>
              ))}

              {grant.clauses.length === 0 && (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  The engine reads no continuous effect off this one. Whatever it says, resolve it
                  yourself.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AttachmentPanel;
