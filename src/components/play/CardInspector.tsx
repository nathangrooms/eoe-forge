/**
 * The preview. The single most important thing on the play board.
 *
 * Owner: *"Most important thing on play mode though, just so you dont forget,
 * is being able to click and preview your card, then select a button action or
 * close."*
 *
 * So: a tap is never the action. Clicking a card anywhere — your hand, your
 * battlefield, an opponent's battlefield, a graveyard — opens this, at a size
 * where the rules text can actually be read, with explicit buttons for whatever
 * is legal right now. Nothing happens to the game until one of them is pressed.
 *
 * Owner: *"Make sure no modals in play, it should be beautiful within the
 * playmat system."*
 *
 * This is therefore NOT a dialog and NOT a Sheet. It is a region of the board:
 * it sits in the rail on the right edge, it is built out of the same `Playmat`
 * material as every mat on the table, it has no backdrop, it dims nothing, it
 * traps no focus, and the board reflows to make room for it rather than being
 * covered by it. A player reading a card can still see the game.
 *
 * Legality is asked of the engine — `planCastFromHand`, `planLandDrop`,
 * `eligibleAttackers` — never re-derived here, so a button can never offer a
 * play the rules would refuse, and a disabled button always says why.
 *
 * Tap is still offered here, but it is no longer the only way to tap. Owner:
 * *"I dont like that tap/untap is in left menu - tapping should be easy on
 * card."* Every permanent you control now carries its own tap chip, so tapping
 * five lands is five taps on five cards and no panels at all; the button below
 * is for the card you already have open, not the way you are meant to get here.
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { GameCardView } from './GameCardView';
import { CARD_RATIO } from './Battlefield';
import { useMeasuredSize } from './useMeasure';
import {
  canBlock,
  eligibleAttackers,
  eligibleBlockers,
  isLand,
  isUnderAttack,
  planCastFromHand,
  planLandDrop,
  powerOf,
  statLine,
  toughnessOf,
  type CardInstance,
  type GameState,
  type PlayerId,
  type Zone,
} from '@/lib/game';

const ZONE_LABEL: Record<Zone, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command zone',
  /* The stack is a zone in the type union but never browsed as a pile. */
  stack: 'Stack',
};

export interface CardInspectorProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  card: CardInstance;
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
  onCast: (card: CardInstance) => void;
  onPlayLand: (card: CardInstance) => void;
  onTapToggle: (card: CardInstance) => void;
  onAttack: (card: CardInstance, defenderPlayerId: PlayerId) => void;
  /**
   * Put this creature in front of one attacker. The mirror image of `onAttack`:
   * blocking is a decision made about a card, so it is made in the preview of
   * that card rather than by a select-then-confirm dance on the board.
   */
  onBlock?: (card: CardInstance, attackerId: string) => void;
  onMoveZone: (card: CardInstance, to: Zone) => void;
  onFocusSeat?: (playerId: PlayerId) => void;
  onClose: () => void;
  className?: string;
}

/** A full-width action. Surface tint and weight, never an outline. */
function ActionButton({
  label,
  hint,
  tone = 'quiet',
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint || label}
      className={cn(
        'flex h-10 w-full items-center justify-center rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'primary'
          ? 'bg-foreground text-background shadow-md shadow-black/40 hover:bg-foreground/90'
          : 'bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.14]'
      )}
    >
      {label}
    </button>
  );
}

/** A quiet zone move. Small, wrapped, and never competing with the real play. */
function MoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-foreground/[0.06] px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

export function CardInspector({
  state,
  viewerPlayerId,
  card,
  freeCast,
  onCast,
  onPlayLand,
  onTapToggle,
  onAttack,
  onBlock,
  onMoveZone,
  onFocusSeat,
  onClose,
  className,
}: CardInspectorProps) {
  const [bodyRef, body] = useMeasuredSize<HTMLDivElement>();

  const controller = state.players.find(p => p.id === card.controllerId);
  const mine = card.controllerId === viewerPlayerId;
  const land = isLand(card);

  const landPlan = mine && land && card.zone === 'hand'
    ? planLandDrop(state, viewerPlayerId, card.instanceId)
    : null;
  const castPlan =
    mine && !land && (card.zone === 'hand' || card.zone === 'command')
      ? planCastFromHand(state, viewerPlayerId, card.instanceId, { ignoreMana: freeCast })
      : null;

  const canDeclare =
    mine &&
    card.zone === 'battlefield' &&
    state.step === 'declare_attackers' &&
    state.activePlayerId === viewerPlayerId &&
    eligibleAttackers(state, viewerPlayerId).some(c => c.instanceId === card.instanceId);

  const defenders = canDeclare
    ? state.players.filter(p => p.id !== viewerPlayerId && !p.hasLost)
    : [];

  const alreadyAttacking = state.combat.attackers.some(
    declaration => declaration.attackerId === card.instanceId
  );
  const alreadyBlocking = state.combat.attackers.find(
    declaration => declaration.blockedBy.indexOf(card.instanceId) !== -1
  );

  /*
   * Blocking, asked of the engine rather than restated here.
   *
   * `eligibleBlockers` owns "is this creature able to block at all" and
   * `canBlock` owns evasion, so a button offered here is a block the rules
   * would accept. A creature already in front of something is not offered
   * again: `BLOCK` appends to the declaration, so a second press would put the
   * same body in the way twice.
   */
  const canDeclareBlock =
    mine &&
    !!onBlock &&
    card.zone === 'battlefield' &&
    state.step === 'declare_blockers' &&
    isUnderAttack(state, viewerPlayerId) &&
    !alreadyBlocking &&
    eligibleBlockers(state, viewerPlayerId).some(c => c.instanceId === card.instanceId);

  const blockable: Array<{ attackerId: string; attacker: CardInstance }> = canDeclareBlock
    ? state.combat.attackers
        .filter(declaration => declaration.defenderPlayerId === viewerPlayerId)
        .map(declaration => ({
          attackerId: declaration.attackerId,
          attacker: state.cards[declaration.attackerId],
        }))
        .filter(
          (entry): entry is { attackerId: string; attacker: CardInstance } =>
            !!entry.attacker && canBlock(entry.attacker, card)
        )
    : [];

  const stats = statLine(card);

  /* The card is the point of this panel — *"the card large enough to read its
     rules text in full"* — so it takes as much of the rail as it can without
     pushing its own buttons off the bottom. The panel scrolls, so overshooting
     costs a scroll rather than a lost button; undershooting costs the one thing
     the preview exists for. */
  const cardWidth = Math.max(
    140,
    Math.round(Math.min(body.width || 300, ((body.height || 600) * 0.64) * CARD_RATIO))
  );

  const notes: string[] = [];
  if (card.tapped) notes.push('Tapped');
  if (card.summoningSick && card.zone === 'battlefield') notes.push('Summoning sick');
  if (card.damage > 0) notes.push(`${card.damage} damage`);
  for (const [key, value] of Object.entries(card.counters)) {
    if (value !== 0) notes.push(`${value > 0 ? '+' : ''}${value} ${key}`);
  }
  if (alreadyAttacking) notes.push('Attacking');
  if (alreadyBlocking) {
    const blocked = state.cards[alreadyBlocking.attackerId];
    notes.push(blocked ? `Blocking ${blocked.name}` : 'Blocking');
  }

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {ZONE_LABEL[card.zone]}
          {controller ? ` · ${controller.name}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close the preview"
          aria-label="Close the preview"
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-3 pb-3">
        <GameCardView
          card={card}
          width={cardWidth}
          ignoreTapped
          className="shrink-0 drop-shadow-[0_14px_30px_rgba(0,0,0,0.7)]"
          title={card.name}
        />

        <div className="w-full shrink-0">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
              {card.name}
            </h3>
            <ManaCost cost={card.manaCost} size="xs" className="shrink-0 pt-0.5" />
          </div>
          {card.typeLine && (
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{card.typeLine}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {stats && (
              <span className="rounded-full bg-foreground/[0.08] px-1.5 text-[10px] font-semibold leading-4 text-foreground">
                {stats}
              </span>
            )}
            {notes.map(note => (
              <span
                key={note}
                className="rounded-full bg-foreground/[0.06] px-1.5 text-[10px] leading-4 text-muted-foreground"
              >
                {note}
              </span>
            ))}
          </div>
        </div>

        {/* What is legal, right now, said out loud. */}
        <div className="flex w-full shrink-0 flex-col gap-1.5">
          {landPlan && (
            <ActionButton
              label="Play land"
              tone="primary"
              disabled={!landPlan.ok}
              hint={landPlan.ok ? `Play ${card.name}` : landPlan.reason}
              onClick={() => onPlayLand(card)}
            />
          )}

          {castPlan && (
            <ActionButton
              label={
                card.zone === 'command'
                  ? castPlan.tax > 0
                    ? `Cast commander · +${castPlan.tax} tax`
                    : 'Cast commander'
                  : 'Cast'
              }
              tone="primary"
              disabled={!castPlan.ok}
              hint={castPlan.ok ? `Cast ${card.name}` : castPlan.reason}
              onClick={() => onCast(card)}
            />
          )}

          {castPlan && !castPlan.ok && castPlan.reason && (
            <p className="text-[10px] leading-tight text-muted-foreground">{castPlan.reason}</p>
          )}
          {landPlan && !landPlan.ok && landPlan.reason && (
            <p className="text-[10px] leading-tight text-muted-foreground">{landPlan.reason}</p>
          )}

          {mine && card.zone === 'battlefield' && (
            <ActionButton
              label={card.tapped ? 'Untap' : 'Tap'}
              tone={canDeclare || blockable.length > 0 ? 'quiet' : 'primary'}
              onClick={() => onTapToggle(card)}
            />
          )}

          {defenders.map(defender => (
            <ActionButton
              key={defender.id}
              label={defenders.length === 1 ? 'Attack' : `Attack ${defender.name}`}
              tone="primary"
              hint={`Declare ${card.name} as an attacker against ${defender.name}`}
              onClick={() => onAttack(card, defender.id)}
            />
          ))}

          {/* One button per attacker this creature could legally stand in front
              of, named, because "block" with nothing named is a guess. */}
          {blockable.map(({ attackerId, attacker }) => (
            <ActionButton
              key={attackerId}
              label={`Block ${attacker.name}`}
              tone="primary"
              hint={`${card.name} (${powerOf(card)}/${toughnessOf(card)}) blocks ${attacker.name} (${powerOf(attacker)}/${toughnessOf(attacker)})`}
              onClick={() => onBlock?.(card, attackerId)}
            />
          ))}

          {!mine && onFocusSeat && controller && (
            <ActionButton
              label={`Look at ${controller.name}'s board`}
              onClick={() => onFocusSeat(controller.id)}
            />
          )}

          <ActionButton label="Close" onClick={onClose} />
        </div>

        {/* Manual zone moves, for the parts of Magic no engine automates. */}
        {mine && (
          <div className="flex w-full shrink-0 flex-wrap gap-1">
            {card.zone !== 'hand' && (
              <MoveButton label="To hand" onClick={() => onMoveZone(card, 'hand')} />
            )}
            {card.zone !== 'battlefield' && (
              <MoveButton label="To battlefield" onClick={() => onMoveZone(card, 'battlefield')} />
            )}
            {card.zone !== 'graveyard' && (
              <MoveButton label="To graveyard" onClick={() => onMoveZone(card, 'graveyard')} />
            )}
            {card.zone !== 'exile' && (
              <MoveButton label="Exile" onClick={() => onMoveZone(card, 'exile')} />
            )}
            {card.zone !== 'library' && (
              <MoveButton label="To library" onClick={() => onMoveZone(card, 'library')} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CardInspector;
