/**
 * The clicked card, in the CENTRE of the mat, with its actions underneath.
 *
 * Owner, verbatim: *"card you play or attack with when clicked may be better
 * off showing in the middle, then buttons under it - no modal needed as on
 * playmat"*, and then, when it still was not: *"I just clicked a card and it
 * didnt show in centre, still using right menu??"*
 *
 * The spec amendment of 19 Aug 2026 settles what had been two things conflated
 * into one panel:
 *
 *   CLICKING a card is a DECISION      -> the CENTRE of the mat, at the largest
 *                                         readable size, actions in a row
 *                                         BENEATH it
 *   A card being CAST is an ANNOUNCEMENT -> the RIGHT EDGE, unchanged, because
 *                                         play continues around it
 *
 * `CastSpotlight` still owns the second one and is untouched. This owns the
 * first, and it replaces the right-hand `CardInspector` entirely — that
 * component is gone rather than left dead, and the rail it lived in keeps the
 * two jobs that are genuinely about browsing rather than deciding: a zone's
 * contents, and the game menu.
 *
 * ## It is not a modal, and the ways it could accidentally become one
 *
 * Owner: *"Make sure no modals in play"*. So, deliberately and checkably:
 *
 *   - no `Dialog`, `Sheet` or any other dialog primitive;
 *   - no portal — it renders inside the board's own box;
 *   - no `fixed inset-0`, no full-screen anything;
 *   - **no backdrop**. Nothing behind it is dimmed, blurred or covered beyond
 *     the card's own footprint. The board stays visible and alive around it:
 *     the bot keeps playing, life totals keep moving, and the four quadrants
 *     are all still there;
 *   - no focus trap. Every control on the table stays reachable.
 *
 * `pointer-events` are on the panel only. The mat around it takes clicks as it
 * always did, which is what makes "click away to dismiss" work without a
 * catcher sitting over the board swallowing input.
 *
 * ## Actions go UNDERNEATH
 *
 * *"Buttons go underneath the card, not beside it: the eye reads the card, then
 * drops to the choices."* So they are a wrapping row below the card, and they
 * are whatever `cardActions.ts` says is legal for that card in that zone right
 * now. A play that is not available is not a greyed-out button; it is a
 * sentence saying why, because the engine must never silently do nothing.
 *
 * ## Size
 *
 * The card is the point, so it takes as much of the board's height as it can
 * without pushing its own buttons off the bottom. The panel measures the room
 * it has been given rather than assuming a viewport, which is what keeps it
 * honest when the rail is open and the board has narrowed.
 */

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { GameStateProvider } from './GameStateContext';
import { GameCardView } from './GameCardView';
import { CARD_RATIO } from './boardMetrics';
import { actionsForCard, cardNotes, type CardAction } from './cardActions';
import { ManaCost } from '@/components/ui/mana-cost';
import { statLineIn, type CardInstance, type GameState, type PlayerId, type Zone } from '@/lib/game';

const ZONE_LABEL: Record<Zone, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command zone',
  stack: 'Stack',
};

export interface CenterPreviewProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  card: CardInstance;
  /** Playtest escape hatch: ignore mana entirely. */
  freeCast?: boolean;
  /** Room the board has, in px. The panel sizes its card from the height. */
  boardWidth: number;
  boardHeight: number;
  /** Room the floating HUD is holding along the top edge. */
  topInset?: number;
  /** Room the fanned hand (or the feed) is holding along the bottom edge. */
  bottomInset?: number;
  /**
   * This board is being watched rather than played.
   *
   * `/simulate` runs the identical table with the bot in every seat, so the
   * preview there reads and never acts. The plays are dropped by
   * `cardActions.ts` rather than drawn and disabled, and the panel says once,
   * plainly, why there are none — silence would read as the preview being
   * broken, which is the complaint this whole surface exists to answer.
   */
  readOnly?: boolean;
  onCast?: (card: CardInstance) => void;
  onPlayLand?: (card: CardInstance) => void;
  onTapToggle?: (card: CardInstance) => void;
  onAttack?: (card: CardInstance, defenderPlayerId: PlayerId) => void;
  onBlock?: (card: CardInstance, attackerId: string) => void;
  onMoveZone?: (card: CardInstance, to: Zone) => void;
  onFocusSeat?: (playerId: PlayerId) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Room the panel keeps for its own furniture: the zone line above the card, the
 * name and type below it, and the action row under that.
 *
 * Measured off the rendered panel rather than guessed, in the sense that these
 * are the heights those three blocks actually take at this type scale. The card
 * gets everything else.
 */
const PANEL_CHROME = 210;
/** The panel never takes more of the board than this, so the table stays a table. */
const MAX_HEIGHT_SHARE = 0.86;
const MAX_WIDTH_SHARE = 0.5;

/** One action. Surface tint and weight, never an outline, never a raw hue. */
function ActionButton({ action, onClick }: { action: CardAction; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={action.hint}
      aria-label={action.hint}
      className={cn(
        'flex h-11 min-w-[7rem] flex-1 items-center justify-center rounded-lg px-4 text-xs font-semibold uppercase tracking-wide transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        action.tone === 'primary'
          ? 'bg-foreground text-background shadow-lg shadow-black/50 hover:bg-foreground/90'
          : 'bg-foreground/[0.10] text-foreground hover:bg-foreground/[0.18]'
      )}
    >
      {action.label}
    </button>
  );
}

export function CenterPreview({
  state,
  viewerPlayerId,
  card,
  freeCast,
  boardWidth,
  boardHeight,
  topInset = 0,
  bottomInset = 0,
  readOnly = false,
  onCast,
  onPlayLand,
  onTapToggle,
  onAttack,
  onBlock,
  onMoveZone,
  onFocusSeat,
  onClose,
  className,
}: CenterPreviewProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Click away to dismiss, without a catcher over the board.
   *
   * A transparent full-board overlay would close the preview on any click, and
   * it would also eat that click — so dismissing it by pressing a card would
   * take two presses and pressing END TURN through it would take none. Listening
   * on the document instead leaves every control on the table live: the press
   * lands where it was aimed AND the panel closes.
   *
   * `pointerdown` rather than `click` so the panel is already gone by the time a
   * click on another card sets the next one, which is what makes clicking
   * straight from one card to another feel like one gesture instead of two.
   */
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const node = panelRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const { actions, blocked, moves } = actionsForCard(state, viewerPlayerId, card, {
    freeCast,
    canFocusSeat: !!onFocusSeat,
    readOnly,
  });

  const controller = state.players.find(p => p.id === card.controllerId);
  const notes = cardNotes(state, card);
  const stats = statLineIn(state, card);

  /* The card is as large as the board can hold it. Height is the binding
     constraint on every screen this runs on, so it is solved for first and the
     width follows from the card's own proportions. */
  const matHeight = Math.max(240, boardHeight - topInset - bottomInset);
  const cardHeight = Math.max(
    170,
    Math.min(matHeight * MAX_HEIGHT_SHARE - PANEL_CHROME, (boardWidth * MAX_WIDTH_SHARE) / CARD_RATIO)
  );
  const cardWidth = Math.round(cardHeight * CARD_RATIO);

  const run = (action: CardAction) => {
    switch (action.kind) {
      case 'play-land':
        return onPlayLand?.(card);
      case 'cast':
        return onCast?.(card);
      case 'tap':
      case 'untap':
        return onTapToggle?.(card);
      case 'attack':
        return action.defenderPlayerId && onAttack?.(card, action.defenderPlayerId);
      case 'block':
        return action.attackerId && onBlock?.(card, action.attackerId);
      case 'move':
        return action.zone && onMoveZone?.(card, action.zone);
      case 'focus-seat':
        return controller && onFocusSeat?.(controller.id);
    }
  };

  return (
    /* Mounted beside `PlayTable` rather than inside it, so it publishes the
       state itself — otherwise this card would draw printed values while the
       identical card on the mat drew layered ones. */
    <GameStateProvider state={state}>
      <div
        className={cn(
          /* `absolute`, never `fixed`. This is a region OF the board, centred on
             the playmat surface, and it moves with the board when the rail opens
             and the table narrows. `pointer-events-none` on the wrapper is what
             leaves the mat around the panel clickable. */
          'pointer-events-none absolute inset-x-0 z-40 flex items-center justify-center p-4',
          className
        )}
        /* Centred on the MAT, not on the window. The HUD floats over the top
           edge and the fanned hand laps over the bottom one; centring between
           them is what puts the card in the middle of the table a player is
           actually looking at, rather than behind their own hand. */
        style={{ top: topInset, bottom: bottomInset }}
      >
        <motion.div
          ref={panelRef}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={
            reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 28, mass: 0.7 }
          }
          className="pointer-events-auto relative flex max-h-full flex-col items-center overflow-hidden rounded-2xl"
          style={{ width: Math.min(boardWidth - 32, Math.max(cardWidth + 48, 320)) }}
          role="group"
          aria-label={`${card.name}, ${ZONE_LABEL[card.zone]}`}
        >
          {/* The panel is made of the table. Same material, same shadow, no
              border — it reads as a card laid on the mat, not a window over it. */}
          <Playmat tone="board" rounded="rounded-2xl" className="absolute inset-0 h-full w-full" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_28px_70px_rgba(0,0,0,0.75)]"
          />

          <div className="relative flex min-h-0 w-full flex-col items-center gap-3 overflow-y-auto px-4 pb-4 pt-3">
            <div className="flex w-full shrink-0 items-center gap-2">
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

            {/* The card, at the largest size the board can hold. */}
            <GameCardView
              card={card}
              width={cardWidth}
              ignoreTapped
              className="shrink-0 drop-shadow-[0_18px_40px_rgba(0,0,0,0.8)]"
              title={card.name}
            />

            <div className="w-full shrink-0">
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">
                  {card.name}
                </h3>
                <ManaCost cost={card.manaCost} size="sm" className="shrink-0 pt-0.5" />
              </div>
              {card.typeLine && (
                <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{card.typeLine}</p>
              )}
              {(stats || notes.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {stats && (
                    <span className="rounded-full bg-foreground/[0.10] px-2 text-[11px] font-semibold leading-5 text-foreground">
                      {stats}
                    </span>
                  )}
                  {notes.map(note => (
                    <span
                      key={note}
                      className="rounded-full bg-foreground/[0.06] px-2 text-[11px] leading-5 text-muted-foreground"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* THE ACTIONS. Underneath the card, in a row, and only the ones
                that are really available. */}
            {actions.length > 0 && (
              <div className="flex w-full shrink-0 flex-wrap gap-2">
                {actions.map(action => (
                  <ActionButton key={action.id} action={action} onClick={() => run(action)} />
                ))}
              </div>
            )}

            {/* A watched table has no plays for the same reason all the way
                down, so it is said once here rather than card by card. */}
            {readOnly && (
              <p className="w-full shrink-0 text-[11px] leading-snug text-muted-foreground">
                You are watching. The bot is playing every seat at this table.
              </p>
            )}

            {/* Not a button you cannot press: a sentence saying why there is no
                button. The engine never silently does nothing. */}
            {blocked.map(entry => (
              <p key={entry.id} className="w-full shrink-0 text-[11px] leading-snug text-muted-foreground">
                {entry.reason}
              </p>
            ))}

            {moves.length > 0 && (
              <div className="flex w-full shrink-0 flex-wrap gap-1 border-0 pt-0.5">
                {moves.map(move => (
                  <button
                    key={move.id}
                    type="button"
                    onClick={() => run(move)}
                    title={move.hint}
                    className="rounded-md bg-foreground/[0.06] px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {move.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </GameStateProvider>
  );
}

export default CenterPreview;
