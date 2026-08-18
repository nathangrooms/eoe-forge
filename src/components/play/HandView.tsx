/**
 * The focused hand.
 *
 * The table view shows a hand as a number, which is right for a board overview
 * and useless when you are deciding what to cast. This view is the other half:
 * cards big enough to read, each one saying plainly whether you can cast it and,
 * if not, exactly why — "Needs 5 mana, 3 untapped sources available" rather than
 * a greyed-out button with no explanation.
 *
 * Affordability comes from `planCastFromHand`, the same helper the bot uses, so
 * the two can never disagree about what is castable.
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ManaCost } from '@/components/ui/mana-cost';
import { GameCardView } from './GameCardView';
import { SeatPanel } from './SeatPanel';
import {
  availableMana,
  isLand,
  planCastFromHand,
  planLandDrop,
  type CardInstance,
  type GameState,
  type PlayerId,
  type Zone,
} from '@/lib/game';

export interface HandViewProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
  onCast: (card: CardInstance) => void;
  onPlayLand: (card: CardInstance) => void;
  onDiscard: (card: CardInstance) => void;
  onMulligan?: () => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  onCardClick?: (card: CardInstance) => void;
  selectedIds?: string[];
  className?: string;
}

export function HandView({
  state,
  viewerPlayerId,
  botPlayerIds,
  freeCast,
  onCast,
  onPlayLand,
  onDiscard,
  onMulligan,
  onOpenZone,
  onCardClick,
  selectedIds,
  className,
}: HandViewProps) {
  const me = state.players.find(p => p.id === viewerPlayerId);
  if (!me) return null;

  const hand = me.zones.hand.map(id => state.cards[id]).filter(Boolean);
  const command = me.zones.command.map(id => state.cards[id]).filter(Boolean);
  const mana = availableMana(state, viewerPlayerId);
  const myTurn = state.activePlayerId === viewerPlayerId;

  const renderPlayable = (card: CardInstance, fromCommandZone: boolean) => {
    const land = isLand(card);
    const landPlan = land ? planLandDrop(state, viewerPlayerId, card.instanceId) : null;
    const castPlan = land
      ? null
      : planCastFromHand(state, viewerPlayerId, card.instanceId, { ignoreMana: freeCast });

    const ok = land ? !!landPlan?.ok : !!castPlan?.ok;
    const reason = land ? landPlan?.reason ?? '' : castPlan?.reason ?? '';
    const tax = castPlan?.tax ?? 0;

    return (
      <li key={card.instanceId} className="flex w-[9rem] flex-col gap-2">
        <GameCardView
          card={card}
          size="lg"
          ignoreTapped
          dimmed={!ok && !freeCast}
          selected={selectedIds ? selectedIds.indexOf(card.instanceId) !== -1 : false}
          onClick={onCardClick ? () => onCardClick(card) : undefined}
        />

        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground" title={card.name}>
            {card.name}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <ManaCost cost={card.manaCost} size="xs" />
            {tax > 0 && (
              <span className="text-[10px] text-muted-foreground" title="Commander tax">
                +{tax} tax
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            variant={ok ? 'default' : 'secondary'}
            disabled={!ok}
            title={ok ? undefined : reason}
            onClick={() => (land ? onPlayLand(card) : onCast(card))}
            className="h-8 w-full text-xs"
          >
            {land ? 'Play land' : fromCommandZone ? 'Cast commander' : 'Cast'}
          </Button>
          {!ok && reason && (
            <p className="text-[10px] leading-tight text-muted-foreground">{reason}</p>
          )}
          {!fromCommandZone && (
            <button
              type="button"
              onClick={() => onDiscard(card)}
              className="text-left text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Discard
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="rounded-xl bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Your hand</h2>
            <p className="text-xs text-muted-foreground">
              {hand.length} card{hand.length === 1 ? '' : 's'} · {mana} untapped source
              {mana === 1 ? '' : 's'} ·{' '}
              {myTurn ? `${me.landsPlayedThisTurn} land played this turn` : 'not your turn'}
              {freeCast ? ' · free cast on' : ''}
            </p>
          </div>
          {onMulligan && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onMulligan}
              className="h-8 text-xs"
              title="Shuffle back and draw one fewer"
            >
              Mulligan
            </Button>
          )}
        </div>

        {hand.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted/40 px-3 py-8 text-center text-sm text-muted-foreground">
            Your hand is empty.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-4">
            {hand.map(card => renderPlayable(card, false))}
          </ul>
        )}

        {command.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Command zone
            </h3>
            <ul className="mt-3 flex flex-wrap gap-4">
              {command.map(card => renderPlayable(card, true))}
            </ul>
          </div>
        )}
      </div>

      <SeatPanel
        state={state}
        player={me}
        density="comfortable"
        isViewer
        isBot={botPlayerIds.indexOf(me.id) !== -1}
        onCardClick={onCardClick}
        onOpenZone={onOpenZone}
        selectedIds={selectedIds}
        className="min-h-[16rem]"
      />
    </div>
  );
}
