/**
 * Combat, as a room of its own.
 *
 * Combat is the moment a Magic game stops being a board and becomes a decision,
 * and it is the moment a table view is worst at its job: the attackers are on
 * one edge of the screen, the blockers on another, and the hand that holds the
 * trick is a number. This view puts all three in one place — the attacking
 * creatures, the defender's battlefield and the defender's hand — and it is the
 * same component whether you are swinging or being swung at.
 *
 * It has three modes, driven entirely by whose decision the rules engine is
 * waiting on:
 *
 *   declare-attackers  your turn, pick who swings and at whom
 *   declare-blockers   someone is attacking you, assign blocks
 *   watch              combat exists but the decision is not yours
 *
 * Motion is used to move attention, not to decorate: lanes slide in as they are
 * declared. `useReducedMotion` collapses all of it to a cross-fade-free instant
 * render for anyone who asked the OS for that.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ShieldOff, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GameCardView } from './GameCardView';
import {
  attackableWith,
  attackingPlayerId,
  canBlock,
  combatLanes,
  eligibleBlockers,
  powerOf,
  toughnessOf,
  type CardInstance,
  type GameState,
  type PlayerId,
} from '@/lib/game';

export type CombatMode = 'declare-attackers' | 'declare-blockers' | 'watch';

export interface CombatViewProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  onDeclareAttack: (attacks: Array<{ attackerId: string; defenderPlayerId: PlayerId }>) => void;
  onDeclareBlocks: (blocks: Array<{ blockerId: string; attackerId: string }>) => void;
  onAdvance: () => void;
  className?: string;
}

/** Which decision, if any, is this viewer's to make right now. */
export function combatModeFor(state: GameState, viewerPlayerId: PlayerId): CombatMode {
  if (state.activePlayerId === viewerPlayerId && state.step === 'declare_attackers') {
    return 'declare-attackers';
  }
  if (
    state.step === 'declare_blockers' &&
    state.combat.attackers.some(d => d.defenderPlayerId === viewerPlayerId)
  ) {
    return 'declare-blockers';
  }
  return 'watch';
}

/** True when there is anything worth showing in the combat view. */
export function combatIsLive(state: GameState, viewerPlayerId: PlayerId): boolean {
  return state.combat.attackers.length > 0 || combatModeFor(state, viewerPlayerId) === 'declare-attackers';
}

export function CombatView({
  state,
  viewerPlayerId,
  botPlayerIds,
  onDeclareAttack,
  onDeclareBlocks,
  onAdvance,
  className,
}: CombatViewProps) {
  const reduceMotion = useReducedMotion();
  const mode = combatModeFor(state, viewerPlayerId);

  const [chosenAttackers, setChosenAttackers] = useState<string[]>([]);
  const [target, setTarget] = useState<PlayerId | null>(null);
  const [pendingBlocks, setPendingBlocks] = useState<Array<{ blockerId: string; attackerId: string }>>([]);
  const [focusedAttacker, setFocusedAttacker] = useState<string | null>(null);

  const lanes = combatLanes(state);
  const aggressorId = attackingPlayerId(state) ?? state.activePlayerId;
  const aggressor = state.players.find(p => p.id === aggressorId);

  // The defender this view is centred on: you, if you are being attacked;
  // otherwise whoever is taking the most heat.
  const defenderId = useMemo<PlayerId | null>(() => {
    if (lanes.some(lane => lane.defenderPlayerId === viewerPlayerId)) return viewerPlayerId;
    const counts = new Map<PlayerId, number>();
    for (const lane of lanes) {
      if (!lane.defenderPlayerId) continue;
      counts.set(lane.defenderPlayerId, (counts.get(lane.defenderPlayerId) ?? 0) + 1);
    }
    let best: PlayerId | null = null;
    let bestCount = 0;
    counts.forEach((count, id) => {
      if (count > bestCount) {
        best = id;
        bestCount = count;
      }
    });
    return best;
  }, [lanes, viewerPlayerId]);

  const defender = defenderId ? state.players.find(p => p.id === defenderId) : null;
  const defenderIsViewer = defenderId === viewerPlayerId;

  // A lane whose attacker has already left the battlefield is stale — the
  // reducer keeps the declaration, but there is no card left to draw.
  const incoming = lanes.filter(lane => lane.defenderPlayerId === defenderId && !!lane.attacker);
  const unblockedDamage = incoming
    .filter(lane => lane.declaration.blockedBy.length === 0)
    .reduce((sum, lane) => sum + powerOf(lane.attacker), 0);
  const lethal = !!defender && unblockedDamage >= defender.life;

  const opponents = state.players.filter(p => p.id !== viewerPlayerId && !p.hasLost);
  // `attackableWith` gates on turn and step itself, so the view never has to
  // restate the legality rule alongside the engine.
  const available = attackableWith(state, viewerPlayerId);

  const blockedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lane of lanes) for (const id of lane.declaration.blockedBy) ids.add(id);
    for (const block of pendingBlocks) ids.add(block.blockerId);
    return ids;
  }, [lanes, pendingBlocks]);

  const myBlockers =
    defenderIsViewer && mode === 'declare-blockers'
      ? eligibleBlockers(state, viewerPlayerId).filter(card => !blockedIds.has(card.instanceId))
      : [];

  const lane = reduceMotion
    ? { initial: false as const, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, x: -18 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 18 },
      };

  const toggleAttacker = (id: string) => {
    setChosenAttackers(previous =>
      previous.indexOf(id) === -1 ? [...previous, id] : previous.filter(entry => entry !== id)
    );
  };

  const assignBlock = (blocker: CardInstance) => {
    if (!focusedAttacker) return;
    const attacker = state.cards[focusedAttacker];
    if (!attacker || !canBlock(attacker, blocker)) return;
    setPendingBlocks(previous => [
      ...previous,
      { blockerId: blocker.instanceId, attackerId: focusedAttacker },
    ]);
  };

  const commitAttack = () => {
    const defenderPlayerId = target ?? opponents[0]?.id;
    if (!defenderPlayerId || chosenAttackers.length === 0) return;
    onDeclareAttack(
      chosenAttackers.map(attackerId => ({ attackerId, defenderPlayerId }))
    );
    setChosenAttackers([]);
  };

  const commitBlocks = () => {
    if (pendingBlocks.length > 0) onDeclareBlocks(pendingBlocks);
    setPendingBlocks([]);
    setFocusedAttacker(null);
    onAdvance();
  };

  /* ---------------------------------------------------------------------- */

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Headline: who is hitting whom, and does it kill. */}
      <div className={cn('rounded-xl p-4 shadow-sm', lethal ? 'bg-destructive/15' : 'bg-card')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {mode === 'declare-attackers'
                  ? 'Declare attackers'
                  : mode === 'declare-blockers'
                    ? 'Declare blockers'
                    : 'Combat'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {mode === 'declare-attackers' && 'Pick your attackers, then choose who they hit.'}
                {mode === 'declare-blockers' &&
                  `${aggressor?.name ?? 'An opponent'} is attacking you with ${incoming.length} creature${incoming.length === 1 ? '' : 's'}.`}
                {mode === 'watch' &&
                  `${aggressor?.name ?? 'Someone'} attacks ${defender?.name ?? 'a player'}.`}
              </p>
            </div>
          </div>

          {defender && incoming.length > 0 && (
            <div className="text-right">
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums leading-none',
                  lethal ? 'text-destructive' : 'text-foreground'
                )}
              >
                {unblockedDamage}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                unblocked damage {lethal ? '— lethal' : `of ${defender.life} life`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Attacker selection, when it is your swing. */}
      {mode === 'declare-attackers' && (
        <div className="rounded-xl bg-card p-4 shadow-sm">
          {available.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-4">
              <p className="text-sm text-muted-foreground">
                {/* Once you have swung, "nothing can attack" is true but reads as a
                    failure. Say what actually happened instead. */}
                {state.combat.attackers.length > 0
                  ? `${state.combat.attackers.length} attacker${state.combat.attackers.length === 1 ? '' : 's'} declared — everything else is tapped or sick.`
                  : 'Nothing can attack this turn — creatures are tapped, summoning sick, or absent.'}
              </p>
              <Button size="sm" className="h-8 text-xs" onClick={onAdvance}>
                {state.combat.attackers.length > 0 ? 'On to blockers' : 'Skip combat'}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {available.map(card => (
                  <GameCardView
                    key={card.instanceId}
                    card={card}
                    size="md"
                    selected={chosenAttackers.indexOf(card.instanceId) !== -1}
                    onClick={() => toggleAttacker(card.instanceId)}
                    title={`${card.name} — ${powerOf(card)}/${toughnessOf(card)}`}
                  />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Attack:</span>
                {opponents.map(opponent => (
                  <button
                    key={opponent.id}
                    type="button"
                    onClick={() => setTarget(opponent.id)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      (target ?? opponents[0]?.id) === opponent.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                    )}
                  >
                    {opponent.name} · {opponent.life}
                  </button>
                ))}
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => {
                      setChosenAttackers([]);
                      onAdvance();
                    }}
                  >
                    <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                    No attacks
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={chosenAttackers.length === 0 || opponents.length === 0}
                    onClick={commitAttack}
                  >
                    Attack with {chosenAttackers.length}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* The lanes. One row per attacker, blockers alongside. */}
      {incoming.length > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attacking {defender?.name ?? 'a player'}
          </h3>

          <ul className="mt-3 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {incoming.map(entry => {
                const pending = pendingBlocks.filter(
                  block => block.attackerId === entry.declaration.attackerId
                );
                const focused = focusedAttacker === entry.declaration.attackerId;
                const blockers = [
                  ...entry.blockers,
                  ...pending.map(block => state.cards[block.blockerId]).filter(Boolean),
                ];

                return (
                  <motion.li
                    key={entry.declaration.attackerId}
                    layout={!reduceMotion}
                    initial={lane.initial}
                    animate={lane.animate}
                    exit={lane.exit}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg p-2 transition-colors',
                      focused ? 'bg-muted' : 'bg-muted/40'
                    )}
                  >
                    <GameCardView
                      card={entry.attacker}
                      size="sm"
                      ignoreTapped
                      role="attacker"
                      onClick={
                        mode === 'declare-blockers'
                          ? () =>
                              setFocusedAttacker(
                                focused ? null : entry.declaration.attackerId
                              )
                          : undefined
                      }
                    />

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />

                    {blockers.length === 0 ? (
                      <span
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium',
                          entry.lethalIfUnblocked
                            ? 'bg-destructive text-destructive-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {entry.lethalIfUnblocked ? 'Lethal if unblocked' : 'Unblocked'}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {blockers.map(blocker => (
                          <GameCardView
                            key={blocker.instanceId}
                            card={blocker}
                            size="sm"
                            ignoreTapped
                            role="blocker"
                          />
                        ))}
                      </div>
                    )}

                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {powerOf(entry.attacker)}/{toughnessOf(entry.attacker)}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          {mode === 'declare-blockers' && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {focusedAttacker
                  ? 'Now pick a creature below to block with.'
                  : 'Select an attacker to block it.'}
              </p>
              <div className="ml-auto flex gap-2">
                {pendingBlocks.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => {
                      setPendingBlocks([]);
                      setFocusedAttacker(null);
                    }}
                  >
                    Clear blocks
                  </Button>
                )}
                <Button size="sm" className="h-8 text-xs" onClick={commitBlocks}>
                  {pendingBlocks.length > 0
                    ? `Confirm ${pendingBlocks.length} block${pendingBlocks.length === 1 ? '' : 's'}`
                    : 'Take the damage'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The defender's board and hand, side by side — the point of this view. */}
      {defender && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {defenderIsViewer ? 'Your battlefield' : `${defender.name}'s battlefield`}
            </h3>
            {myBlockers.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {myBlockers.length} untapped creature{myBlockers.length === 1 ? '' : 's'} can still block.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {defender.zones.battlefield.length === 0 && (
                <p className="w-full rounded-lg bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
                  No permanents in play.
                </p>
              )}
              {defender.zones.battlefield
                .map(id => state.cards[id])
                .filter(Boolean)
                .map(card => {
                  const canAssign =
                    mode === 'declare-blockers' &&
                    !!focusedAttacker &&
                    !blockedIds.has(card.instanceId) &&
                    myBlockers.some(blocker => blocker.instanceId === card.instanceId) &&
                    canBlock(state.cards[focusedAttacker], card);

                  return (
                    <GameCardView
                      key={card.instanceId}
                      card={card}
                      size="sm"
                      role={blockedIds.has(card.instanceId) ? 'blocker' : null}
                      dimmed={mode === 'declare-blockers' && !!focusedAttacker && !canAssign}
                      onClick={canAssign ? () => assignBlock(card) : undefined}
                    />
                  );
                })}
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {defenderIsViewer ? 'Your hand' : `${defender.name}'s hand`}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {defender.zones.hand.length} card{defender.zones.hand.length === 1 ? '' : 's'}
              {defenderIsViewer ? ' — a trick you could still cast' : ' — hidden information'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {defender.zones.hand
                .map(id => state.cards[id])
                .filter(Boolean)
                .map(card => (
                  <GameCardView
                    key={card.instanceId}
                    card={card}
                    size="sm"
                    ignoreTapped
                    hidden={!defenderIsViewer}
                  />
                ))}
              {defender.zones.hand.length === 0 && (
                <p className="w-full rounded-lg bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
                  Empty hand.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'watch' && incoming.length === 0 && (
        <p className="rounded-xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
          No combat right now. This view opens automatically when someone attacks.
          {botPlayerIds.length > 0 ? ' The bot will swing when it likes the maths.' : ''}
        </p>
      )}
    </div>
  );
}
