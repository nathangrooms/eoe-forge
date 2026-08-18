/**
 * The pod, as four equal quadrants — two rows, two columns, every seat upright.
 *
 * Owner: *"the board should split in 4 separate ways - 2 rows, 2 columns, all
 * hands shows as if placed in front of you, so you can click their cards and
 * view their board properly"*.
 *
 * Placement still comes from `src/lib/game/seating.ts`, which owns the geometry
 * and the turn order that goes with it; `layoutFromViewpoint` keeps the viewer
 * in the bottom-left quadrant so a networked table gives every player a board
 * that matches the one in front of them. What this component does NOT do is
 * rotate anything. The pinwheel put three of the four seats sideways or upside
 * down, which made an opponent's board something you squinted at rather than
 * something you used. Four upright quadrants, all interactive.
 *
 * The same renderer draws one seat as draws four. That is the whole reason hand
 * mode and view mode exist as props rather than as separate screens: pass a
 * `focusPlayerId` and that seat takes the entire board. They cannot drift apart
 * because they are the same code.
 *
 * ---------------------------------------------------------------------------
 * Combat happens HERE
 * ---------------------------------------------------------------------------
 * Owner: *"this game engine does not support attacking very well, its an
 * absolute mess and moves onto different screens, attack button should be a
 * sword icon or something too"*.
 *
 * It used to move onto a screen of its own: a lane diagram with its own header
 * and its own tray of cards, drawn *instead of* this table. Declaring an attack
 * therefore meant losing sight of the board you had spent the turn building.
 *
 * Attackers and blockers are now declared on this component, with the real
 * cards in their real positions on their real mats. Pressing the sword on a
 * creature sends it in; pressing the shield on one of yours and then the
 * attacker it faces puts it in the way. `combatUi.ts` decides what each card
 * offers and why, `CombatBar` carries the two things that belong to no single
 * card (who you are hitting, and "that is my declaration"), and `combat.ts`
 * resolves every point of damage. The board never changes into anything else.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { SeatMat } from './SeatMat';
import { Playmat } from './Playmat';
import { GameStateProvider } from './GameStateContext';
import { CombatBar } from './CombatBar';
import { useLiveSession } from './liveSession';
import { cardCombatFor, combatSentence, combatStageFor } from './combatUi';
import type { CombatChipProps, Lunge } from './GameCardView';
import type { LifeDeltaMap } from './useTableMotion';
import {
  layoutFromViewpoint,
  livingPlayers,
  resolveCombat,
  seatingFor,
  tapsToAttack,
  validateBlockGroup,
  type CardInstance,
  type GameAction,
  type GameState,
  type PlayerId,
  type Seat,
  type SeatingVariant,
  type Zone,
} from '@/lib/game';

export interface PlayTableProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  variant?: SeatingVariant;
  /** Draw exactly one seat, filling the board. Hand mode and view mode. */
  focusPlayerId?: PlayerId | null;
  /** Ceiling for a battlefield card. Each mat comes down from it to fit. */
  cardWidth?: number;
  /** A click on any card opens the preview. It is never the action itself. */
  onInspect?: (card: CardInstance) => void;
  /**
   * Tap or untap one of the viewer's own permanents, from the card.
   *
   * Owner: *"tapping should be easy on card."* Handed only to the viewer's mat
   * — an opponent's board stays readable and clickable but not operable.
   */
  onTapCard?: (card: CardInstance) => void;
  onOpenZone?: (playerId: PlayerId, zone: Zone) => void;
  onFocusSeat?: (playerId: PlayerId) => void;
  attackerIds?: readonly string[];
  blockerIds?: readonly string[];
  inspectedId?: string | null;
  lifeDeltas?: LifeDeltaMap;
  /** Room left along the bottom edge for the viewer's fanned hand. */
  bottomInset?: number;
  /** Room left along the top edge for the HUD that floats over the table. */
  topInset?: number;
  className?: string;
}

/**
 * A unit vector from one seat toward another, in screen space.
 *
 * Nothing is rotated any more, so this is the whole calculation: an attacking
 * creature leans toward the quadrant it is attacking and everybody at the table
 * can see which way the swing is pointed.
 */
function lungeBetween(from: Seat, to: Seat, magnitude: number): Lunge | null {
  const vx = to.rect.x + to.rect.w / 2 - (from.rect.x + from.rect.w / 2);
  const vy = to.rect.y + to.rect.h / 2 - (from.rect.y + from.rect.h / 2);
  const length = Math.hypot(vx, vy);
  if (length < 0.001) return null;
  return { x: (vx / length) * magnitude, y: (vy / length) * magnitude };
}

export function PlayTable({
  state,
  viewerPlayerId,
  botPlayerIds,
  variant = 'quads',
  focusPlayerId = null,
  /* A ceiling. Every mat shrinks below it to fit the room it actually has, so
     the only thing a low default buys is a board of icons on a big screen. */
  cardWidth = 200,
  onInspect,
  onTapCard,
  onOpenZone,
  onFocusSeat,
  attackerIds,
  blockerIds,
  inspectedId,
  lifeDeltas,
  bottomInset = 0,
  topInset = 0,
  className,
}: PlayTableProps) {
  const viewerSeat = state.players.find(p => p.id === viewerPlayerId)?.seat ?? 0;

  const layout = useMemo(
    () => layoutFromViewpoint(seatingFor(state.players.length, variant), viewerSeat),
    [state.players.length, variant, viewerSeat]
  );

  const seatBySeatIndex = useMemo(() => {
    const map = new Map<number, Seat>();
    for (const seat of layout.seats) map.set(seat.index, seat);
    return map;
  }, [layout]);

  /** instanceId -> how far and which way that attacker leans. */
  const lunges = useMemo(() => {
    const result: Record<string, Lunge> = {};
    for (const declaration of state.combat.attackers) {
      const attacker = state.cards[declaration.attackerId];
      if (!attacker) continue;

      const attackingPlayer = state.players.find(p => p.id === attacker.controllerId);
      const defenderId =
        declaration.defenderPlayerId ??
        (declaration.defenderInstanceId
          ? state.cards[declaration.defenderInstanceId]?.controllerId
          : undefined);
      if (!attackingPlayer || !defenderId) continue;

      const defendingPlayer = state.players.find(p => p.id === defenderId);
      if (!defendingPlayer) continue;

      const from = seatBySeatIndex.get(attackingPlayer.seat);
      const to = seatBySeatIndex.get(defendingPlayer.seat);
      if (!from || !to) continue;

      const vector = lungeBetween(from, to, 20);
      if (vector) result[declaration.attackerId] = vector;
    }
    return result;
  }, [state.combat.attackers, state.cards, state.players, seatBySeatIndex]);

  const focused = focusPlayerId
    ? state.players.find(p => p.id === focusPlayerId) ?? null
    : null;

  /* ---------------------------------------------------------------------- */
  /* Combat, declared on this board                                         */
  /* ---------------------------------------------------------------------- */

  /*
   * Combat is the one thing on the table that the page does not hand down as a
   * prop, and it is deliberate: the gesture is a press on a CARD, and the card
   * is drawn four levels below `/play`. `liveSession.ts` carries the dispatcher
   * sideways and explains the trade in full. Outside a game this seat is
   * playing — `/simulate`'s auto-game, an opponent's quadrant — it is `null`,
   * every chip disappears, and the board is exactly what it was.
   */
  const session = useLiveSession(state.id, viewerPlayerId);
  const dispatch = session?.dispatch ?? null;
  const stage = combatStageFor(state, viewerPlayerId);

  /** The blocker picked up and not yet put in front of anything. UI only. */
  const [armedBlockerId, setArmedBlockerId] = useState<string | null>(null);
  /** Which opponent the next declared attacker is pointed at. UI only. */
  const [targetId, setTargetId] = useState<PlayerId | null>(null);

  const opponents = useMemo(
    () => livingPlayers(state).filter(player => player.id !== viewerPlayerId),
    [state, viewerPlayerId]
  );

  // A held blocker belongs to one declare-blockers step and nothing else.
  useEffect(() => {
    setArmedBlockerId(null);
  }, [state.step, state.turn]);

  // Keep the chosen defender real: a player who dies mid-combat is not a target.
  useEffect(() => {
    setTargetId(previous =>
      previous && opponents.some(player => player.id === previous)
        ? previous
        : opponents[0]?.id ?? null
    );
  }, [opponents]);

  /** Everything already swinging, as `ATTACK` wants it. */
  const declared = useMemo(
    () =>
      state.combat.attackers
        .filter(d => !!d.defenderPlayerId && !!state.cards[d.attackerId])
        .map(d => ({
          attackerId: d.attackerId,
          defenderPlayerId: d.defenderPlayerId as PlayerId,
        })),
    [state.combat.attackers, state.cards]
  );

  /* `ATTACK` replaces the whole declaration rather than appending to it, so
     every change to the swing re-sends all of it. Re-tapping something already
     tapped is a no-op in the reducer, which is what makes that safe. */
  const attackAction = useCallback(
    (entries: Array<{ attackerId: string; defenderPlayerId: PlayerId }>): GameAction => ({
      type: 'ATTACK',
      at: Date.now(),
      attackers: entries.map(entry => {
        const card = state.cards[entry.attackerId];
        return { ...entry, tap: card ? tapsToAttack(state, card) : true };
      }),
    }),
    [state]
  );

  const declareAttacker = useCallback(
    (card: CardInstance) => {
      if (!dispatch) return;
      const defenderPlayerId = targetId ?? opponents[0]?.id;
      if (!defenderPlayerId) return;
      dispatch(
        attackAction([
          ...declared.filter(entry => entry.attackerId !== card.instanceId),
          { attackerId: card.instanceId, defenderPlayerId },
        ])
      );
    },
    [dispatch, targetId, opponents, declared, attackAction]
  );

  const recallAttacker = useCallback(
    (card: CardInstance) => {
      if (!dispatch) return;
      const actions: GameAction[] = [
        attackAction(declared.filter(entry => entry.attackerId !== card.instanceId)),
      ];
      /* Declaring an attack taps; nothing untaps it on the way back out, and a
         tapped creature is not an eligible attacker. Without this, calling a
         creature back stranded it — tapped, out of the swing, and unable to be
         sent in again for the rest of the combat. */
      if (card.tapped && tapsToAttack(state, card)) {
        actions.push({ type: 'UNTAP', instanceId: card.instanceId });
      }
      dispatch(actions);
    },
    [dispatch, declared, attackAction, state]
  );

  const armBlocker = useCallback((card: CardInstance) => {
    setArmedBlockerId(previous => (previous === card.instanceId ? null : card.instanceId));
  }, []);

  const assignBlock = useCallback(
    (attacker: CardInstance) => {
      if (!dispatch || !armedBlockerId) return;
      dispatch({
        type: 'BLOCK',
        blocks: [{ blockerId: armedBlockerId, attackerId: attacker.instanceId }],
      });
      setArmedBlockerId(null);
    },
    [dispatch, armedBlockerId]
  );

  const releaseBlocker = useCallback(
    (card: CardInstance) => {
      if (!dispatch) return;
      dispatch({ type: 'UNBLOCK', blockerId: card.instanceId });
    },
    [dispatch]
  );

  /**
   * What one card offers right now, and what pressing it does.
   *
   * `combatUi.ts` answers the first half (and is unit-tested on it); this
   * attaches the verb. Handed to every seat, including the opponents', because
   * the creature swinging at you is on THEIR mat and pressing it is how a
   * blocker gets put in its way.
   */
  const combatFor = useCallback(
    (card: CardInstance): { chip: CombatChipProps | null; dimmed: boolean } | null => {
      if (!stage || !dispatch) return null;

      const info = cardCombatFor(state, viewerPlayerId, card, stage, { armedBlockerId });
      if (!info.chip) return info.dimmed ? { chip: null, dimmed: true } : null;

      const kind = info.chip;
      const onClick = () => {
        switch (kind) {
          case 'attack':
            return declareAttacker(card);
          case 'attacking':
            return recallAttacker(card);
          case 'block':
          case 'armed':
            return armBlocker(card);
          case 'blocking':
            return releaseBlocker(card);
          case 'target':
            return assignBlock(card);
        }
      };

      return {
        chip: { kind, enabled: info.enabled, label: info.label, onClick },
        dimmed: info.dimmed,
      };
    },
    [
      stage,
      dispatch,
      state,
      viewerPlayerId,
      armedBlockerId,
      declareAttacker,
      recallAttacker,
      armBlocker,
      releaseBlocker,
      assignBlock,
    ]
  );

  /*
   * The numbers on the bar, computed by the engine rather than by the view.
   *
   * `resolveCombat` is the same pure function the combat damage step calls, so
   * this is a projection of what will happen, not a second opinion about it —
   * trample spill, deathtouch and first strike included, for free.
   */
  const swing = useMemo(() => {
    if (!stage) return { damage: 0, lethal: false };
    const outcome = resolveCombat(state);
    const attacking = stage === 'attackers';
    const relevant = outcome.playerDamage.filter(entry =>
      attacking ? entry.playerId !== viewerPlayerId : entry.playerId === viewerPlayerId
    );
    const damage = relevant.reduce((sum, entry) => sum + entry.amount, 0);
    const lethal = relevant.some(entry => {
      const player = state.players.find(p => p.id === entry.playerId);
      return !!player && entry.amount > 0 && entry.amount >= player.life;
    });
    return { damage, lethal };
  }, [state, stage, viewerPlayerId]);

  /** Blockers this seat has put in the way, counted across every lane. */
  const blockCount = useMemo(
    () =>
      state.combat.attackers.reduce(
        (sum, declaration) =>
          declaration.defenderPlayerId === viewerPlayerId
            ? sum + declaration.blockedBy.length
            : sum,
        0
      ),
    [state.combat.attackers, viewerPlayerId]
  );

  /*
   * Menace is a property of the whole block, so it cannot be enforced as each
   * blocker is assigned — one creature in front of a menacing attacker is an
   * illegal block that becomes legal the moment a second joins it. So the
   * assignment is allowed and the CONFIRM is what refuses, with the reason the
   * engine gives, which is also where a real table would catch it.
   */
  const blockIssue = useMemo(() => {
    if (stage !== 'blockers') return '';
    for (const declaration of state.combat.attackers) {
      if (declaration.blockedBy.length === 0) continue;
      const legality = validateBlockGroup(
        state,
        state.cards[declaration.attackerId],
        declaration.blockedBy.map(id => state.cards[id])
      );
      if (!legality.ok) return legality.reason;
    }
    return '';
  }, [state, stage]);

  const confirmCombat = useCallback(() => {
    if (!dispatch) return;
    setArmedBlockerId(null);
    dispatch({ type: 'ADVANCE_STEP', at: Date.now() });
  }, [dispatch]);

  const armedCard = armedBlockerId ? state.cards[armedBlockerId] ?? null : null;
  const combatHint =
    stage === 'attackers'
      ? declared.length > 0
        ? 'Press another sword to add it to the swing, or attack.'
        : 'Press the sword on a creature to send it in. Greyed-out creatures cannot attack.'
      : armedCard
        ? `${armedCard.name} is ready — now press the attacker it stands in front of.`
        : 'Press the shield on one of your creatures, then the attacker it blocks.';

  return (
    /* Publishes the live state so every `GameCardView` below draws its stat line
       from the layer engine rather than from printed values. The value is the
       state object itself, so it changes identity exactly when the board does
       and the layer computation downstream is memoised on it. */
    <GameStateProvider state={state}>
    <div className={cn('relative w-full overflow-hidden', className)}>
      {/* The table itself, under every mat. Full bleed: a game board does not
          have a corner radius, and the viewport edge is the edge of the table. */}
      <Playmat tone="board" rounded="rounded-none" className="absolute inset-0 h-full w-full" />

      <div
        className="absolute left-0 right-0"
        style={{ top: topInset, bottom: bottomInset }}
      >
        {focused ? (
          <div className="absolute inset-0 p-1">
            <SeatMat
              state={state}
              player={focused}
              isViewer={focused.id === viewerPlayerId}
              isBot={botPlayerIds.indexOf(focused.id) !== -1}
              cardWidth={cardWidth}
              onInspect={onInspect}
              onTapCard={focused.id === viewerPlayerId ? onTapCard : undefined}
              onOpenZone={onOpenZone}
              combatFor={combatFor}
              attackerIds={attackerIds}
              blockerIds={blockerIds}
              inspectedId={inspectedId}
              lunges={lunges}
              lifeDeltas={lifeDeltas?.[focused.id]}
              side="left"
              showHandBacks={focused.id !== viewerPlayerId}
            />
          </div>
        ) : (
          layout.seats.map(seat => {
            const player = state.players[seat.index];
            if (!player) return null;

            const isViewer = player.id === viewerPlayerId;
            const style: CSSProperties = {
              position: 'absolute',
              left: `${seat.rect.x * 100}%`,
              top: `${seat.rect.y * 100}%`,
              width: `${seat.rect.w * 100}%`,
              height: `${seat.rect.h * 100}%`,
            };

            return (
              <div key={seat.index} style={style} className="p-1">
                <SeatMat
                  state={state}
                  player={player}
                  isViewer={isViewer}
                  isBot={botPlayerIds.indexOf(player.id) !== -1}
                  cardWidth={cardWidth}
                  onInspect={onInspect}
                  onTapCard={isViewer ? onTapCard : undefined}
                  onOpenZone={onOpenZone}
                  combatFor={combatFor}
                  onFocusSeat={isViewer ? undefined : onFocusSeat}
                  attackerIds={attackerIds}
                  blockerIds={blockerIds}
                  inspectedId={inspectedId}
                  lunges={lunges}
                  lifeDeltas={lifeDeltas?.[player.id]}
                  side={seat.rect.x + seat.rect.w / 2 <= 0.5 ? 'left' : 'right'}
                  showHandBacks={!isViewer}
                />
              </div>
            );
          })
        )}

        {/*
          Combat's only piece of furniture, and it is a strip rather than a
          screen.

          It hangs from the top edge of the board, immediately under the HUD,
          which is the one band of the table that belongs to no creature row:
          every mat now puts creatures at its top and lands at its foot, so the
          strip crosses the far seat's identity strip and nothing else. The
          player's own board — the one they are declaring from — is untouched
          and fully visible underneath it.
        */}
        {stage && dispatch && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-2 pt-1">
            <CombatBar
              stage={stage}
              sentence={combatSentence(state, viewerPlayerId)}
              hint={combatHint}
              damage={swing.damage}
              lethal={swing.lethal}
              count={stage === 'attackers' ? declared.length : blockCount}
              targets={opponents}
              targetId={targetId}
              onTarget={setTargetId}
              onConfirm={confirmCombat}
              blockedReason={blockIssue}
            />
          </div>
        )}
      </div>
    </div>
    </GameStateProvider>
  );
}

export default PlayTable;
