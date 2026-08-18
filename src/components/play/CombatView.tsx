/**
 * Combat, as a room of its own.
 *
 * Combat is the moment a Magic game stops being a board and becomes a decision,
 * and it is the moment a table view is worst at its job: the attackers are on
 * one edge of the screen, the blockers on another, and the player being hit is
 * a number in a corner. This view puts the swing in one place — who is hitting
 * whom, with what, through what, and for how much — and it is the same
 * component whether you are swinging or being swung at.
 *
 * ---------------------------------------------------------------------------
 * Click → preview → act or close
 * ---------------------------------------------------------------------------
 * Owner: *"Most important thing on play mode though, just so you dont forget,
 * is being able to click and preview your card, then select a button action or
 * close."*
 *
 * This view used to be the one place on the board that broke that rule. It had
 * a select-then-confirm flow of its own — tick some creatures, press a target
 * chip, press "Attack with 3" — so a card in combat behaved differently from
 * the same card two seconds earlier in the hand, and no card here was ever
 * drawn at a size anybody could read.
 *
 * It now holds **no selection state at all**. A click anywhere calls
 * `onInspect`; `CardInspector` opens in the board's right-hand rail with that
 * card at readable size; and the engine-checked buttons there — Attack, Block,
 * Tap, Close — are the only things that dispatch. Declaring happens one
 * creature at a time, which is also how it happens on a table.
 *
 * ---------------------------------------------------------------------------
 * What makes it read as combat
 * ---------------------------------------------------------------------------
 *   **The attacked player is a person, not a row heading.** Each front is drawn
 *   on the defender's own playmat, with their life badge, their name and the
 *   arithmetic said out loud: `34 → 22`, or LETHAL.
 *
 *   **A lane is three things across.** Attacker, the damage it actually
 *   delivers, the bodies in its way — full card art at whatever size the
 *   viewport allows, never a 68px thumbnail.
 *
 *   **Every number is computed, never guessed.** `resolveCombat` is the engine
 *   function the damage step itself calls; this view runs it against the
 *   current declaration and reads the result. The damage shown, the trample
 *   spill, the deathtouch kills and the cards marked DIES are literally what
 *   will happen when the step resolves, rather than a second implementation of
 *   the combat rules that can drift away from the first.
 *
 * Motion moves attention and never decorates: lanes slide in as they are
 * declared. `useReducedMotion` collapses all of it.
 */

import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { LifeBadge } from './LifeBadge';
import { GameCardView } from './GameCardView';
import { CARD_RATIO, MIN_BOARD_CARD, PermanentRow, fitRowCardWidth } from './Battlefield';
import { useMeasuredSize } from './useMeasure';
import {
  attackableWith,
  attackingPlayerId,
  canBlock,
  combatLanes,
  eligibleBlockers,
  powerOf,
  resolveCombat,
  toughnessOf,
  type CardInstance,
  type CombatLane,
  type GameState,
  type Player,
  type PlayerId,
} from '@/lib/game';

export type CombatMode = 'declare-attackers' | 'declare-blockers' | 'watch';

export interface CombatViewProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  /** A click on any card opens the preview. It is never the action itself. */
  onInspect: (card: CardInstance) => void;
  /** The card the rail is previewing, so the lane says which one it is. */
  inspectedId?: string | null;
  /** Done declaring — hand the step back to the game. */
  onAdvance: () => void;
  /** Room along the top edge for the HUD that floats over the table. */
  topInset?: number;
  /** Room along the bottom edge for the game feed. */
  bottomInset?: number;
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
  return (
    state.combat.attackers.length > 0 ||
    combatModeFor(state, viewerPlayerId) === 'declare-attackers'
  );
}

/* -------------------------------------------------------------------------- */
/* Reading the swing                                                          */
/* -------------------------------------------------------------------------- */

/** Everything pointed at one player, and what it costs them. */
interface Front {
  defender: Player;
  lanes: CombatLane[];
  /** Life this player loses if the damage step resolved on the current board. */
  damage: number;
  lethal: boolean;
}

/**
 * The swing, as the engine sees it.
 *
 * `resolveCombat` is pure and is the same function the combat damage step
 * calls, so running it against the current declaration is a projection rather
 * than a second opinion. Nothing in this view invents a number: per-attacker
 * damage comes from the `DAMAGE` actions it emits (which is what makes trample
 * spill correct for free), and the DIES marks are its `destroyed` list.
 */
function useSwing(state: GameState, viewerPlayerId: PlayerId) {
  return useMemo(() => {
    const outcome = resolveCombat(state);

    /** Attacker instanceId -> life it takes off a player. */
    const damageBySource = new Map<string, number>();
    for (const action of outcome.actions) {
      if (action.type !== 'DAMAGE' || !action.sourceInstanceId) continue;
      damageBySource.set(
        action.sourceInstanceId,
        (damageBySource.get(action.sourceInstanceId) ?? 0) + action.amount
      );
    }

    const damageByPlayer = new Map<PlayerId, number>();
    for (const entry of outcome.playerDamage) damageByPlayer.set(entry.playerId, entry.amount);

    const dying = new Set<string>(outcome.destroyed);

    // A lane whose attacker has already left the battlefield is stale — the
    // reducer keeps the declaration, but there is no card left to draw.
    const lanes = combatLanes(state).filter(lane => !!lane.attacker);

    const byDefender = new Map<PlayerId, CombatLane[]>();
    for (const lane of lanes) {
      if (!lane.defenderPlayerId) continue;
      const list = byDefender.get(lane.defenderPlayerId);
      if (list) list.push(lane);
      else byDefender.set(lane.defenderPlayerId, [lane]);
    }

    const fronts: Front[] = [];
    byDefender.forEach((group, playerId) => {
      const defender = state.players.find(p => p.id === playerId);
      if (!defender) return;
      const damage = damageByPlayer.get(playerId) ?? 0;
      fronts.push({ defender, lanes: group, damage, lethal: damage > 0 && damage >= defender.life });
    });

    // Your own skin first — it is the front you have to answer. Then the
    // heaviest, because that is the one the rest of the table is watching.
    fronts.sort((a, b) => {
      if (a.defender.id === viewerPlayerId) return -1;
      if (b.defender.id === viewerPlayerId) return 1;
      return b.damage - a.damage;
    });

    return { fronts, damageBySource, dying, totalLanes: lanes.length };
  }, [state, viewerPlayerId]);
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One card in combat: full art, clickable straight into the preview, carrying
 * the one piece of news that is not printed on its face — whether it is about
 * to die.
 */
function CombatCard({
  card,
  width,
  role,
  dies,
  dimmed,
  selected,
  onInspect,
  note,
}: {
  card: CardInstance;
  width: number;
  role?: 'attacker' | 'blocker' | null;
  dies?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  onInspect: (card: CardInstance) => void;
  note?: string;
}) {
  return (
    <span className="relative block shrink-0" style={{ width }}>
      <GameCardView
        card={card}
        width={width}
        ignoreTapped
        role={role ?? null}
        dimmed={dimmed}
        selected={selected}
        onClick={() => onInspect(card)}
        title={`${card.name} — ${powerOf(card)}/${toughnessOf(card)}${note ? ` · ${note}` : ''}`}
      />
      {dies && (
        <span
          className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-1.5 text-[9px] font-semibold uppercase leading-4 tracking-wide text-destructive-foreground shadow-md shadow-black/60"
          title={`${card.name} dies in this combat`}
        >
          dies
        </span>
      )}
    </span>
  );
}

/** A control on the combat mat. Surface tint and weight, never an outline. */
function CombatButton({
  label,
  tone = 'quiet',
  onClick,
  title,
}: {
  label: string;
  tone?: 'primary' | 'quiet';
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={cn(
        'flex h-9 shrink-0 items-center justify-center rounded-lg px-3.5 text-xs font-semibold uppercase tracking-wide transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'primary'
          ? 'bg-foreground text-background shadow-md shadow-black/40 hover:bg-foreground/90'
          : 'bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.16]'
      )}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

export function CombatView({
  state,
  viewerPlayerId,
  botPlayerIds,
  onInspect,
  inspectedId,
  onAdvance,
  topInset = 0,
  bottomInset = 0,
  className,
}: CombatViewProps) {
  const reduceMotion = useReducedMotion();
  const [frameRef, frame] = useMeasuredSize<HTMLDivElement>();

  const mode = combatModeFor(state, viewerPlayerId);
  const { fronts, damageBySource, dying, totalLanes } = useSwing(state, viewerPlayerId);

  const aggressorId = attackingPlayerId(state) ?? state.activePlayerId;
  const aggressor = state.players.find(p => p.id === aggressorId) ?? null;
  const aggressorIsViewer = aggressorId === viewerPlayerId;

  /* ---------------------------------------------------------------------- */
  /* The tray: what you can still put into this combat                      */
  /* ---------------------------------------------------------------------- */

  /** Creatures already committed, so the tray never offers one twice. */
  const committed = useMemo(() => {
    const ids = new Set<string>();
    for (const declaration of state.combat.attackers) {
      ids.add(declaration.attackerId);
      for (const blockerId of declaration.blockedBy) ids.add(blockerId);
    }
    return ids;
  }, [state.combat.attackers]);

  /* `attackableWith` and `eligibleBlockers` gate on turn, step, tapped state,
     summoning sickness and defender, so the view never restates a rule the
     engine already owns and a card offered here is a card it will accept. */
  const trayCards = useMemo<CardInstance[]>(() => {
    if (mode === 'declare-attackers') {
      return attackableWith(state, viewerPlayerId).filter(card => !committed.has(card.instanceId));
    }
    if (mode === 'declare-blockers') {
      return eligibleBlockers(state, viewerPlayerId).filter(card => !committed.has(card.instanceId));
    }
    return [];
  }, [mode, state, viewerPlayerId, committed]);

  /** Attackers aimed at the viewer, for the "can this body stop anything" test. */
  const incomingAtViewer = useMemo(
    () =>
      state.combat.attackers
        .filter(declaration => declaration.defenderPlayerId === viewerPlayerId)
        .map(declaration => state.cards[declaration.attackerId])
        .filter((card): card is CardInstance => !!card),
    [state.combat.attackers, state.cards, viewerPlayerId]
  );

  const canStopSomething = (blocker: CardInstance) =>
    incomingAtViewer.some(attacker => canBlock(attacker, blocker));

  /* ---------------------------------------------------------------------- */
  /* Sizing — measured, never guessed                                       */
  /* ---------------------------------------------------------------------- */

  const width = frame.width || 1100;
  const height = frame.height || 640;

  const showTray = trayCards.length > 0;
  const showControls = mode !== 'watch';

  /** Fixed heights the lanes have to share the box with. */
  const HEADLINE_H = 64;
  const TRAY_BAR_H = 34;
  const FRONT_HEADER_H = 62;
  /** The damage column between an attacker and what is in its way. */
  const GUTTER_W = 76;
  /** Below this a card in a lane stops being a card you can read. */
  const LANE_CARD_FLOOR = 88;
  const LANE_CARD_CEILING = 232;

  /* The tray is a strip along the bottom edge, exactly where the hand sits on
     the table view, so the two surfaces feel like the same table. It gets a
     quarter of the height at most — the lanes are the point of this screen —
     and it shrinks before it spills. */
  const trayCard = showTray
    ? Math.max(
        MIN_BOARD_CARD,
        Math.round(
          Math.min(
            164,
            (height * 0.24 - TRAY_BAR_H) * CARD_RATIO,
            fitRowCardWidth(width - 24, trayCards.length, 164)
          )
        )
      )
    : 0;
  const trayHeight = showTray
    ? Math.round(trayCard / CARD_RATIO) + TRAY_BAR_H + 8
    : showControls
      ? TRAY_BAR_H + 10
      : 0;

  /*
   * Lanes fill the board across, not just down.
   *
   * A duel is a wide, short thing — attacker, damage, blockers — so stacking
   * four of them in one column on a 1400px screen left three quarters of the
   * mat empty and squeezed every card down to a thumbnail. They are laid out
   * as a grid instead: as many lanes across as fit at a readable card size,
   * which turns four attackers on a wide screen into two rows of two large
   * duels and keeps a narrow screen honest at one or two.
   */
  const columns = Math.max(
    1,
    Math.min(3, Math.floor(width / 430), Math.max(1, totalLanes))
  );
  const laneWidth = Math.floor((width - (columns - 1) * 8) / columns);
  /* Rows are counted per front rather than over the whole swing: two fronts of
     two lanes each is two grid rows, not one, and guessing low is how a lane
     ends up sized to a box it does not fit in. */
  const laneRows = Math.max(
    1,
    fronts.reduce((sum, front) => sum + Math.ceil(front.lanes.length / columns), 0)
  );

  const frontsHeight = Math.max(160, height - HEADLINE_H - trayHeight - 14);
  const laneBox = Math.floor(
    (frontsHeight - Math.max(1, fronts.length) * FRONT_HEADER_H) / laneRows
  );

  /** The busiest lane, so a gang block shrinks instead of running off the mat. */
  const widestGroup = fronts.reduce(
    (most, front) =>
      front.lanes.reduce((inner, lane) => Math.max(inner, 1 + Math.max(1, lane.blockers.length)), most),
    2
  );

  /* Width is a hard limit — overflowing it is the bug the owner reported. Height
     is a soft one: below the floor the lanes keep their size and the region
     scrolls, because a card too small to recognise is worse than a scrollbar. */
  const laneWidthCap = fitRowCardWidth(laneWidth - GUTTER_W - 20, widestGroup, LANE_CARD_CEILING);
  const laneHeightCap = (laneBox - 14) * CARD_RATIO;

  const laneCard = Math.max(
    MIN_BOARD_CARD,
    Math.round(
      Math.min(LANE_CARD_CEILING, laneWidthCap, Math.max(LANE_CARD_FLOOR, laneHeightCap))
    )
  );
  const laneHeight = Math.round(laneCard / CARD_RATIO) + 12;
  /** What is left of a lane once the attacker and the damage column have theirs. */
  const blockerRoom = Math.max(laneCard, laneWidth - laneCard - GUTTER_W - 22);

  /* ---------------------------------------------------------------------- */
  /* The headline, in a language a person speaks                            */
  /* ---------------------------------------------------------------------- */

  const nameOf = (player: Player | null | undefined, capital: boolean) => {
    if (!player) return capital ? 'Someone' : 'someone';
    if (player.id === viewerPlayerId) return capital ? 'You' : 'you';
    return player.name;
  };

  /* The old header assembled a sentence from a subject and a verb that never
     agreed and an object nobody had looked up — it shipped the literal string
     "You attacks a player". Subject and verb are now chosen together, and the
     object is the actual defender. */
  const subject = nameOf(aggressor, true);
  const verb = aggressorIsViewer ? 'attack' : 'attacks';
  const object =
    fronts.length === 1 ? nameOf(fronts[0].defender, false) : `${fronts.length} players`;

  const headline =
    totalLanes === 0
      ? mode === 'declare-attackers'
        ? 'Declare your attackers'
        : 'No combat right now'
      : `${subject} ${verb} ${object}`;

  const hint =
    mode === 'declare-attackers'
      ? totalLanes > 0
        ? 'Click another creature to add it to the swing, or move on to blockers.'
        : 'Click a creature below to preview it, then press Attack.'
      : mode === 'declare-blockers'
        ? 'Click one of your creatures to preview it, then press Block.'
        : totalLanes > 0
          ? 'Watching. Damage resolves when the step does.'
          : botPlayerIds.length > 0
            ? 'This view opens on its own the moment somebody swings.'
            : 'This view opens on its own the moment somebody swings.';

  const totalDamage = fronts.reduce((sum, front) => sum + front.damage, 0);
  const anyLethal = fronts.some(front => front.lethal);

  const laneMotion = reduceMotion
    ? { initial: false as const, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, x: -22 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 22 },
      };

  /* ---------------------------------------------------------------------- */

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      {/* The same material the table is made of. Combat is a different room in
          the same building, not a different application. */}
      <Playmat tone="board" rounded="rounded-none" className="absolute inset-0 h-full w-full" />

      <div
        ref={frameRef}
        className="absolute inset-x-0 flex flex-col gap-2 px-2 pb-2 md:px-3"
        style={{ top: topInset, bottom: bottomInset }}
      >
        {/* ------------------------------------------------------------- */}
        {/* Who is hitting whom, and does it kill                          */}
        {/* ------------------------------------------------------------- */}
        <header
          className={cn(
            'flex shrink-0 items-center gap-3 rounded-xl px-3 shadow-lg shadow-black/40 backdrop-blur-sm',
            anyLethal ? 'bg-destructive/20' : 'bg-background/55'
          )}
          style={{ height: HEADLINE_H }}
        >
          <Swords
            className={cn('h-5 w-5 shrink-0', anyLethal ? 'text-destructive' : 'text-foreground/70')}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold leading-tight text-foreground">
              {headline}
            </h2>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{hint}</p>
          </div>

          {totalLanes > 0 && (
            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right leading-none">
                <p className="text-2xl font-semibold tabular-nums text-foreground">{totalLanes}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  attacker{totalLanes === 1 ? '' : 's'}
                </p>
              </div>
              <div className="text-right leading-none">
                <p
                  className={cn(
                    'text-2xl font-semibold tabular-nums',
                    totalDamage > 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {totalDamage}
                </p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  damage through
                </p>
              </div>
            </div>
          )}
        </header>

        {/* ------------------------------------------------------------- */}
        {/* The fronts. One per player being attacked.                     */}
        {/* ------------------------------------------------------------- */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {fronts.length === 0 && (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-foreground/[0.035]">
              <p className="max-w-md px-6 text-center text-sm text-muted-foreground">
                {mode === 'declare-attackers'
                  ? trayCards.length > 0
                    ? 'Nothing has swung yet. Pick a creature from the row below to preview it, then press Attack.'
                    : 'Nothing can attack this turn — your creatures are tapped, summoning sick, or absent.'
                  : 'Nobody is attacking. This view opens on its own the moment somebody does.'}
              </p>
            </div>
          )}

          {fronts.map(front => {
            const defenderIsViewer = front.defender.id === viewerPlayerId;
            const after = front.defender.life - front.damage;
            const blockedCount = front.lanes.filter(lane => lane.blockers.length > 0).length;

            return (
              <section
                key={front.defender.id}
                aria-label={`Attacking ${front.defender.name}`}
                className={cn(
                  'relative overflow-hidden rounded-xl shadow-lg shadow-black/40',
                  /* One front — the usual case — takes the whole board, so the
                     defender's mat *is* the table rather than a panel floating
                     on an empty one. Several fronts keep their own heights and
                     the region scrolls. */
                  fronts.length === 1 ? 'min-h-0 flex-1' : 'shrink-0'
                )}
              >
                {/* The front is drawn on the defender's own mat, so the player
                    under attack is a place at the table, not a label. */}
                <Playmat
                  art={front.defender.commanders[0]?.imageUrl}
                  tone={defenderIsViewer ? 'viewer' : 'seat'}
                  rounded="rounded-xl"
                  className="absolute inset-0 h-full w-full"
                />
                {front.lethal && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-destructive/25"
                  />
                )}

                <div className="relative flex h-full flex-col gap-1 p-2">
                  {/* Who is being hit, and what it costs them. */}
                  <div className="flex items-center gap-3" style={{ height: FRONT_HEADER_H - 8 }}>
                    <LifeBadge
                      life={front.defender.life}
                      size="sm"
                      startingLife={state.rules.startingLife}
                      poison={front.defender.poison}
                      poisonLethal={state.rules.poisonLethal}
                      dead={front.defender.hasLost}
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight text-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                        {defenderIsViewer
                          ? 'You are under attack'
                          : `${front.defender.name} is under attack`}
                      </p>
                      <p className="truncate text-[11px] leading-tight text-muted-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                        {front.lanes.length} attacker{front.lanes.length === 1 ? '' : 's'}
                        {blockedCount > 0 ? ` · ${blockedCount} blocked` : ' · nothing blocked yet'}
                      </p>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-background/70 px-2.5 py-1 shadow-md shadow-black/50 backdrop-blur-sm">
                      <span className="text-base font-semibold tabular-nums leading-none text-muted-foreground">
                        {front.defender.life}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span
                        className={cn(
                          'text-2xl font-semibold tabular-nums leading-none',
                          front.lethal ? 'text-destructive' : 'text-foreground'
                        )}
                      >
                        {after}
                      </span>
                      {front.lethal && (
                        <span className="ml-1 rounded-full bg-destructive px-1.5 text-[9px] font-semibold uppercase leading-4 tracking-wide text-destructive-foreground">
                          lethal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The lanes. Attacker · what it delivers · what is in the way. */}
                  <ul
                    className="grid min-h-0 flex-1 content-center gap-2"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                  >
                    <AnimatePresence initial={false}>
                      {front.lanes.map(lane => {
                        const attacker = lane.attacker as CardInstance;
                        const through = damageBySource.get(attacker.instanceId) ?? 0;
                        const blocked = lane.blockers.length > 0;

                        return (
                          <motion.li
                            key={lane.declaration.attackerId}
                            layout={!reduceMotion}
                            initial={laneMotion.initial}
                            animate={laneMotion.animate}
                            exit={laneMotion.exit}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="flex min-w-0 items-center gap-1 rounded-xl bg-background/45 p-1.5 shadow-md shadow-black/30"
                            style={{ minHeight: laneHeight }}
                          >
                            <CombatCard
                              card={attacker}
                              width={laneCard}
                              role="attacker"
                              dies={dying.has(attacker.instanceId)}
                              selected={inspectedId === attacker.instanceId}
                              onInspect={onInspect}
                              note="attacking"
                            />

                            {/* The gutter carries the whole point of the lane:
                                how much of this attacker reaches the player. */}
                            <div
                              className="flex shrink-0 flex-col items-center justify-center leading-none"
                              style={{ width: GUTTER_W }}
                            >
                              <span
                                className={cn(
                                  'text-[2rem] font-semibold tabular-nums',
                                  through > 0 ? 'text-destructive' : 'text-muted-foreground'
                                )}
                              >
                                {through}
                              </span>
                              <span className="mt-1 text-center text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                {blocked ? (through > 0 ? 'tramples' : 'blocked') : 'unblocked'}
                              </span>
                              {lane.lethalIfUnblocked && (
                                <span className="mt-1 rounded-full bg-destructive px-1.5 text-[8px] font-semibold uppercase leading-4 tracking-wide text-destructive-foreground">
                                  lethal
                                </span>
                              )}
                            </div>

                            {blocked ? (
                              /* `PermanentRow` owns the overlap arithmetic the
                                 battlefield already uses, so a gang block lies
                                 side by side while it fits and only starts to
                                 lap once it does not — rather than a fixed
                                 overlap that hid a card's name at two blockers
                                 and still overflowed at six. */
                              <div className="flex min-w-0 flex-1 items-center">
                                <PermanentRow
                                  cards={lane.blockers}
                                  cardWidth={laneCard}
                                  available={blockerRoom}
                                  align="start"
                                  renderCard={(blocker, _index, cardW) => (
                                    <CombatCard
                                      card={blocker}
                                      width={cardW}
                                      role="blocker"
                                      dies={dying.has(blocker.instanceId)}
                                      selected={inspectedId === blocker.instanceId}
                                      onInspect={onInspect}
                                      note="blocking"
                                    />
                                  )}
                                />
                              </div>
                            ) : (
                              /* An empty card-shaped well, so "nothing is in the
                                 way" is a *gap in the line* rather than a
                                 sentence you have to stop and read. */
                              <div className="flex min-w-0 flex-1 items-center justify-center">
                                <span
                                  aria-label="No blockers"
                                  title={`Nothing is blocking ${attacker.name}`}
                                  className="flex shrink-0 items-center justify-center rounded-[6%/4%] bg-black/30 shadow-inner"
                                  style={{ width: laneCard, height: laneCard / CARD_RATIO }}
                                >
                                  <span className="px-1 text-center text-[9px] font-medium uppercase leading-tight tracking-[0.14em] text-muted-foreground/70">
                                    No blockers
                                  </span>
                                </span>
                              </div>
                            )}
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </div>
              </section>
            );
          })}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* The tray, and the one press that ends the step                 */}
        {/* ------------------------------------------------------------- */}
        {(showTray || showControls) && (
          <div
            className="flex shrink-0 flex-col rounded-xl bg-background/50 px-2 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm"
            style={{ height: trayHeight }}
          >
            <div className="flex shrink-0 items-center gap-2" style={{ height: TRAY_BAR_H - 4 }}>
              <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {mode === 'declare-attackers'
                  ? `Can still attack · ${trayCards.length}`
                  : mode === 'declare-blockers'
                    ? `Can still block · ${trayCards.length}`
                    : 'Combat'}
              </span>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                {mode === 'declare-attackers' && (
                  <CombatButton
                    label={totalLanes > 0 ? 'On to blockers' : 'No attacks'}
                    tone={totalLanes > 0 ? 'primary' : 'quiet'}
                    title={
                      totalLanes > 0
                        ? 'Done declaring — let the defenders block'
                        : 'Swing with nothing this turn'
                    }
                    onClick={onAdvance}
                  />
                )}
                {mode === 'declare-blockers' && (
                  <CombatButton
                    label={
                      state.combat.attackers.some(d => d.blockedBy.length > 0)
                        ? 'Done blocking'
                        : 'Take the damage'
                    }
                    tone="primary"
                    title="Done declaring blockers — resolve combat damage"
                    onClick={onAdvance}
                  />
                )}
              </div>
            </div>

            {showTray && (
              <div className="flex min-h-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-visible">
                {trayCards.map(card => {
                  const useless = mode === 'declare-blockers' && !canStopSomething(card);
                  return (
                    <CombatCard
                      key={card.instanceId}
                      card={card}
                      width={trayCard}
                      dimmed={useless}
                      selected={inspectedId === card.instanceId}
                      onInspect={onInspect}
                      note={
                        mode === 'declare-attackers'
                          ? 'can attack'
                          : useless
                            ? 'cannot block anything attacking you'
                            : 'can block'
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CombatView;
