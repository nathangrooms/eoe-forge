/**
 * Combat, which is no longer a room of its own.
 *
 * ---------------------------------------------------------------------------
 * What this file used to be, and why it stopped
 * ---------------------------------------------------------------------------
 * Owner: *"this game engine does not support attacking very well, its an
 * absolute mess and moves onto different screens, attack button should be a
 * sword icon or something too"*.
 *
 * This was the different screen. Eight hundred lines of lane diagram — fronts,
 * damage gutters, a tray of eligible attackers along the bottom, its own
 * headline, its own card sizing — drawn *instead of* the table. Pressing Attack
 * took your board away and replaced it with a picture of your board, and every
 * creature you had spent the turn arranging was suddenly somewhere else on
 * screen. It had its own idea of grammar too; it is where "You attacks a
 * player" came from.
 *
 * Combat now happens on the playmat. `PlayTable` owns it: the sword chip on a
 * creature declares the attack, the shield chip on one of yours followed by the
 * attacker in front of it declares the block, `combatUi.ts` decides what each
 * card offers and why, and `CombatBar` carries the two things that belong to no
 * single card — who you are hitting, and "that is my declaration". Real cards,
 * in their real positions, on their real mats.
 *
 * ---------------------------------------------------------------------------
 * So why does this component still exist?
 * ---------------------------------------------------------------------------
 * Because `src/pages/Play.tsx` still routes to it, and that page belongs to
 * another workstream and is not ours to edit. It switches `view` to `'combat'`
 * the moment this seat owes an attack or a block. If this file rendered a
 * different surface — or nothing — the takeover would still be there.
 *
 * So it renders **the table**: the same `PlayTable`, the same seats, the same
 * hand fanned over the same edge, at the same measurements, reading the same
 * stored card-size preferences. What a player sees when combat opens is the
 * board they were already looking at, with the swords now live on their
 * creatures.
 *
 * When `Play.tsx` can be edited, the `view === 'combat'` branch should be
 * deleted and this file with it; nothing else imports it. Until then the few
 * measurements below are duplicated from that page, deliberately and with its
 * name on them, because a hand that changes size the instant you press Attack
 * is the same "different screen" arriving through the back door.
 */

import { useMemo } from 'react';
import { useCardSize } from '@/components/cards/CardSizeSlider';
import { PlayTable } from './PlayTable';
import { ViewerHand } from './ViewerHand';
import { useLiveSession } from './liveSession';
import { combatStageFor } from './combatUi';
import { defaultSeatingFor } from './seatingDefaults';
import type { CardInstance, GameState, PlayerId } from '@/lib/game';

export type CombatMode = 'declare-attackers' | 'declare-blockers' | 'watch';

export interface CombatViewProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  /** A click on any card opens the preview. It is never the action itself. */
  onInspect: (card: CardInstance) => void;
  /** The card the rail is previewing, so the board says which one it is. */
  inspectedId?: string | null;
  /** Part of the page's call signature. The combat bar advances the step now. */
  onAdvance?: () => void;
  /** Room along the top edge for the HUD that floats over the table. */
  topInset?: number;
  /** Part of the page's call signature. The hand is measured, as on the table. */
  bottomInset?: number;
  className?: string;
}

/** Which decision, if any, is this viewer's to make right now. */
export function combatModeFor(state: GameState, viewerPlayerId: PlayerId): CombatMode {
  const stage = combatStageFor(state, viewerPlayerId);
  if (stage === 'attackers') return 'declare-attackers';
  if (stage === 'blockers') return 'declare-blockers';
  return 'watch';
}

/** True when there is anything combat-related worth saying to this seat. */
export function combatIsLive(state: GameState, viewerPlayerId: PlayerId): boolean {
  return state.combat.attackers.length > 0 || combatModeFor(state, viewerPlayerId) !== 'watch';
}

/* -------------------------------------------------------------------------- */
/* Measurements, mirrored from Play.tsx                                       */
/* -------------------------------------------------------------------------- */

/** A real card is 63 × 88 mm: height = width ÷ this. */
const CARD_RATIO = 0.7176;
/** `Play.tsx`'s defaults, under the same `useCardSize` keys it stores them at. */
const BOARD_CARD_DEFAULT = 200;
const HAND_CARD_DEFAULT = 300;
/** `Play.tsx`'s `HUD_INSET`. */
const HUD_INSET = 56;

/**
 * `Play.tsx`'s `handMetrics`, for the un-focused (whole-table) case.
 *
 * Duplicated on purpose, and only until that page can be edited. If this
 * measured the hand differently the fan would resize the instant combat opened
 * and every mat would re-fit its cards around it — which is the takeover the
 * owner reported, arriving by another route.
 */
function handMetrics(viewportHeight: number, ceiling: number) {
  const height = Math.max(480, viewportHeight);
  const cardWidth = Math.round(Math.min(ceiling, Math.max(96, height * 0.25 * CARD_RATIO)));
  return { cardWidth, inset: Math.round(cardWidth / CARD_RATIO) };
}

export function CombatView({
  state,
  viewerPlayerId,
  botPlayerIds,
  onInspect,
  inspectedId,
  topInset = HUD_INSET,
  className,
}: CombatViewProps) {
  const session = useLiveSession(state.id, viewerPlayerId);

  /* The same preferences the table view reads, from the same store, so nothing
     changes size between the two. `useCardSize` reads on mount, and this mounts
     when combat opens — after any slider move, never before one. */
  const [boardCardWidth] = useCardSize('play-board', BOARD_CARD_DEFAULT);
  const [handCardWidth] = useCardSize('play-hand', HAND_CARD_DEFAULT);

  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const hand = handMetrics(viewportHeight, handCardWidth);

  const attackerIds = useMemo(
    () => state.combat.attackers.map(d => d.attackerId),
    [state.combat.attackers]
  );
  const blockerIds = useMemo(
    () => state.combat.attackers.flatMap(d => d.blockedBy),
    [state.combat.attackers]
  );

  /* Tapping stays available while combat is declared: holding up a mana source
     mid-combat is a normal thing to do, and a control that disappears for the
     duration is one more way this would read as a different surface. */
  const onTapCard = session
    ? (card: CardInstance) => {
        if (card.zone !== 'battlefield') return;
        if (card.controllerId !== viewerPlayerId) return;
        session.dispatch({ type: card.tapped ? 'UNTAP' : 'TAP', instanceId: card.instanceId });
      }
    : undefined;

  return (
    <div className={className}>
      <div className="relative h-full w-full">
        <PlayTable
          className="h-full w-full"
          state={state}
          viewerPlayerId={viewerPlayerId}
          botPlayerIds={botPlayerIds}
          variant={defaultSeatingFor(state.players.length)}
          cardWidth={boardCardWidth}
          bottomInset={hand.inset}
          topInset={topInset}
          onInspect={onInspect}
          onTapCard={onTapCard}
          attackerIds={attackerIds}
          blockerIds={blockerIds}
          inspectedId={inspectedId}
        />

        {/* Your hand, held over the near edge of the table, exactly as it is on
            the table view. Clicking a card opens the preview; it never plays it. */}
        <ViewerHand
          className="absolute inset-x-0 bottom-2 z-30"
          state={state}
          viewerPlayerId={viewerPlayerId}
          cardWidth={hand.cardWidth}
          selectedId={inspectedId}
          onInspect={onInspect}
        />
      </div>
    </div>
  );
}

export default CombatView;
