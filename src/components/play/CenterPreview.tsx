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

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { automationFor } from '@/lib/game/effects';
import { Playmat } from './Playmat';
import { GameStateProvider } from './GameStateContext';
import { GameCardView } from './GameCardView';
import { CARD_RATIO } from './boardMetrics';
import { actionsForCard, cardNotes, type CardAction } from './cardActions';
import { ManualPanel } from './ManualPanel';
import { AbilityPanel } from './AbilityPanel';
import { AttachmentPanel } from './AttachmentPanel';
import { SpellTargetPanel } from './SpellTargetPanel';
import { CommanderPanel } from './CommanderPanel';
import { useAimRequest } from './useAiming';
import { ManaCost } from '@/components/ui/mana-cost';
import {
  activationsFor,
  auraNeedsHost,
  enchantClauseOf,
  markDescription,
  markText,
  playerMarksOn,
  rulesCountersOn,
  statLine,
  statLineIn,
  type CardInstance,
  type GameAction,
  type GameState,
  type InstanceId,
  type PlayerId,
  type StackTarget,
  type Zone,
} from '@/lib/game';

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
  /**
   * The game is not open for business yet, and why, in one sentence.
   *
   * Set while the opening hand is still being decided. The card stays large and
   * readable — judging seven cards is the whole decision — and the plays are
   * replaced by the reason rather than removed without one.
   */
  holdReason?: string;
  /**
   * Cast this card. `hostId` is the permanent an Aura is being cast at, which
   * CR 601.2c makes part of casting it rather than something that happens
   * afterwards, so it rides on the cast rather than on a second control.
   */
  onCast?: (card: CardInstance, hostId?: InstanceId) => void;
  /**
   * Cast this card AT something. The other half of CR 601.2c, for every spell
   * that is not an Aura: `SpellTargetPanel` collects the answers and hands the
   * finished `StackTarget[]` back here, and the page puts it on
   * `CastOptions.targets`.
   *
   * A second prop rather than a wider `onCast`, because they are different
   * announcements. An Aura's host is one permanent chosen by the attachment
   * rules; a spell's targets are a positional list indexed by `TargetSpec.ref`,
   * and squeezing the two through one parameter is how a caller ends up passing
   * a host where a ref-0 target was expected.
   */
  onCastAtTargets?: (card: CardInstance, targets: StackTarget[]) => void;
  onPlayLand?: (card: CardInstance) => void;
  onTapToggle?: (card: CardInstance) => void;
  onAttack?: (card: CardInstance, defenderPlayerId: PlayerId) => void;
  onBlock?: (card: CardInstance, attackerId: string) => void;
  onMoveZone?: (card: CardInstance, to: Zone, position?: 'top' | 'bottom') => void;
  onFocusSeat?: (playerId: PlayerId) => void;
  /**
   * Send raw actions from the by-hand controls.
   *
   * Deliberately not another dozen `onCounter` / `onKeyword` / `onStat` props.
   * `manual.ts` already returns each control bound to the actions it produces,
   * so the page only has to be able to dispatch a batch; adding a callback per
   * control would put the list of what is possible in two places and let them
   * drift, which is the disease every other part of this screen was cured of.
   */
  onDispatch?: (actions: GameAction[]) => void;
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
/* -------------------------------------------------------------------------- */
/* HOW WIDE THE PANEL IS, AND WHY IT IS NO LONGER A FIXED 980                  */
/* -------------------------------------------------------------------------- */
/*
 * MEASURED, 2026-08-30, `scripts/probe/card-panel-fit.mjs`, a real goldfish
 * game with a land on the battlefield:
 *
 *              panel        controls   cut off   details column
 *   1600x1000  980 x 722       28         5      781px of content in 722px
 *   1280x 800  980 x 560       28         8      747px of content in 560px
 *    390x 844  350 x 596       28        20     1253px of content in 596px
 *
 * Two separate faults, and the second is the one the owner reported twice.
 *
 * 1. THE PANEL IS `overflow-hidden` AND NOTHING INSIDE IT COULD SCROLL. The
 *    details column carried `overflow-y-auto`, but the flex ROW holding the
 *    card and the column had no `min-h-0`, so the row grew to its content and
 *    the column grew with it. A column that is as tall as its content never
 *    scrolls; the panel simply clipped it. Sacrifice, Exile and Return to hand
 *    were painted BELOW the panel's own bottom edge at every width, invisible,
 *    with nothing to say they existed. Owner: *"this has a sacrifice ability
 *    which I cannot cast?"* and *"All options dont fit into the card
 *    winjdow...?"*
 *
 * 2. AND ON THE OTHER HALF OF THE SAME PANEL, 480 x 450 OF NOTHING. On the
 *    mulligan the details column drew a zone chip, a name, a stat line and a
 *    chip reading *"2 abilities, below"* pointing at content that was gated off
 *    that screen and never rendered. Owner's standing instruction: *"no weird
 *    small windows or unutilised space"*.
 *
 * Both are answered by sizing the panel to what is really in it. The width is
 * BUILT from the card and the details rather than capped at a number: the card
 * takes the height the mat allows, the details take one column or two depending
 * on whether there are by-hand controls to put in the second, and the panel is
 * exactly their sum. So the mulligan gets a narrower panel with no hole in it,
 * and a permanent on the battlefield gets a wider one whose second column is
 * the by-hand controls that used to hang off the bottom.
 */

/** Widest the panel may ever be, so the table is still a table behind it. */
const MAX_PANEL_WIDTH = 1240;
/** Under this the card goes ON TOP of the details rather than beside them. */
const STACK_BELOW = 560;
/** Over this, with by-hand controls to show, the details run in two columns. */
const TWO_COLUMN_AT = 900;
/** Card padding plus the gap between the card and the details. */
const PANEL_PADDING = 44;
/** The panel never takes more of the board's height than this. */
const MAX_HEIGHT_SHARE = 0.86;
/** Stacked, the card takes this share of the height and the details take the rest. */
const STACKED_CARD_SHARE = 0.4;

/**
 * One action. Surface tint and weight, never an outline, never a raw hue.
 *
 * Compacted from `h-11 min-w-[7rem]` to `h-10 min-w-0`: the minimum width forced
 * a two-up grid to one-up whenever the column was under 240px, which is every
 * column on a phone, and turned four quiet actions into four full-width rows.
 */
function ActionButton({
  action,
  onClick,
  className,
}: {
  action: CardAction;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={action.hint}
      aria-label={action.hint}
      className={cn(
        'flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        action.tone === 'primary'
          ? 'bg-foreground text-background shadow-lg shadow-black/50 hover:bg-foreground/90'
          : 'bg-foreground/[0.10] text-foreground hover:bg-foreground/[0.18]',
        className
      )}
    >
      <span className="truncate">{action.label}</span>
    </button>
  );
}

/**
 * A heading over a block of controls. One shape, so the panel reads as sections
 * rather than as a wall of chips.
 */
function Legend({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </span>
      {note && (
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">{note}</span>
      )}
    </div>
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
  holdReason,
  onCast,
  onCastAtTargets,
  onPlayLand,
  onTapToggle,
  onAttack,
  onBlock,
  onMoveZone,
  onFocusSeat,
  onDispatch,
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
  /*
   * A QUESTION ASKED FROM THIS PANEL IS ANSWERED ON THE BOARD, SO THE PANEL
   * STANDS ASIDE AND STOPS LISTENING.
   *
   * `SpellTargetPanel` and `AbilityPanel` live inside here, and while one of
   * them is asking what a spell or an ability is aimed at, the answer is a
   * press on a card several hundred pixels away. Two things would otherwise go
   * wrong at that press, and both of them silently:
   *
   *   - `away` would fire first and close the preview, which UNMOUNTS the asker
   *     and takes its half-collected answers with it. The card's own click then
   *     lands on nothing, because by the time the click resolves the button it
   *     was aimed at has gone. Targeting from the board would simply not work;
   *   - and the preview would stay open under it, because a question that has
   *     had no answers given yet has nothing for its own cancel to clear. That
   *     was measured: one press of Escape mid-announcement left the aim strip
   *     up and all nine press targets still live on the board. A prompt that
   *     will not close on Escape is the trap this seam is supposed to avoid.
   *
   * So the pointer is yielded and the key is NOT. Escape does both halves at
   * once: `AimLayer` clears the answers given so far and this closes the panel
   * that was asking, which withdraws the question. Between them that is the
   * whole announcement rewound, which is what CR 601.2 does to one that cannot
   * be completed. A waiting trigger has no panel to close and keeps only the
   * first half, correctly: CR 603.3d put it on the stack and Escape does not
   * take it off again.
   */
  const aiming = useAimRequest(state.id, viewerPlayerId);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      const node = panelRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (!aiming) document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose, aiming]);

  const { actions, blocked, moves } = actionsForCard(state, viewerPlayerId, card, {
    freeCast,
    canFocusSeat: !!onFocusSeat,
    readOnly,
    holdReason,
  });

  const controller = state.players.find(p => p.id === card.controllerId);
  const notes = cardNotes(state, card);
  const stats = statLineIn(state, card);
  /* The printed line beside the live one. A number that changed is only
     obviously a change if you can see the old one, which is the same reason
     `GameCardView` holds both for its badge. */
  const printedStats = statLine(card);
  const statsModified = Boolean(stats && printedStats && stats !== printedStats);
  /* The card's state, split the way `marks.ts` splits it: what the game put on
     this permanent, and what a person did. Battlefield only, because damage and
     counters on a card in a graveyard are not a thing a player is reading. */
  const onBattlefield = card.zone === 'battlefield';
  const damage = onBattlefield ? card.damage : 0;
  const rulesCounters = onBattlefield ? rulesCountersOn(card.counters) : [];
  const handMarks = onBattlefield ? playerMarksOn(card.counters) : [];

  /* WHAT THIS CARD DOES, AND WHO HAS TO DO IT.
     `automationFor` already works this out for every card and nothing had ever
     shown it. It is the difference between a player trusting the board and a
     player wondering whether the game noticed their trigger. Owner: "it should
     automatically detect the cards action/events/control/abilities etc, but
     then give the user a way of manually controlling how it's played." */
  const automation = automationFor(card);
  const handled = automation.engineKeywords;

  /*
   * AN ABILITY THE ENGINE NOW RUNS MUST NOT STILL BE MARKED "YOU RESOLVE".
   *
   * `automationFor` is the older reporting path and it has never known about
   * activated abilities, so it lists every one of them as a clause the player
   * has to resolve by hand. That was true until `activate.ts` landed, and the
   * moment the Abilities block below drew a working control it became a lie in
   * the opposite direction: measured on a real table, Sinew Dancer's
   * "{3}{W}, {T}: Tap target creature" appeared as an amber "you resolve" chip
   * on the same screen as the button that resolves it.
   *
   * An ability the engine cannot use is still listed, because that one really
   * is the player's job. `activationsFor` is memoised on the compiler, so
   * asking it twice on one card costs nothing.
   */
  const runsItself = new Set(
    activationsFor(state, viewerPlayerId, card, { ignoreMana: freeCast })
      .filter(option => option.ok || option.pending.length > 0)
      .map(option => option.text.trim())
  );
  /*
   * AND THE SAME FOR "ENCHANT", which was the second half of the same lie.
   *
   * `automationFor` reports every keyword it does not recognise as one the
   * player has to resolve, and "enchant" has never been in the engine's list.
   * That was true right up until this panel started drawing the row of
   * permanents an Aura may be cast at: measured on a real table, Ethereal Armor
   * showed *"enchant — the engine does not enforce this keyword"* directly under
   * the control that enforces it, beside a list of the only creatures it would
   * let the Aura go on.
   *
   * Gated on `auraNeedsHost` rather than on the word, so an Aura the engine
   * cannot read a subject off still says so. It is the same test the Enchant
   * block itself is drawn on, which is what stops the two from disagreeing.
   */
  const enchantClause = auraNeedsHost(card) ? enchantClauseOf(card) : null;
  const enforcedByEngine = (note: string): boolean => {
    const trimmed = note.trim();
    if (runsItself.has(trimmed)) return true;
    if (!enchantClause) return false;
    // Three spellings of the same claim reach this list: the bare keyword from
    // `advisoryKeywords`, the card's own "Enchant creature" line, and the
    // "does not enforce" note built from the keyword.
    if (trimmed.toLowerCase() === 'enchant') return true;
    if (/^enchant\b/i.test(trimmed) && /does not enforce/i.test(trimmed)) return true;
    return trimmed === enchantClause;
  };

  const yours = [...automation.advisoryKeywords, ...automation.manualNotes].filter(
    note => !enforcedByEngine(note)
  );

  /* A KEYWORD IS A CHIP. A CLAUSE IS A SENTENCE. They were the same list.
     ---------------------------------------------------------------------
     Owner, on this panel: *"still confusing and unclear"*, and before that
     *"Thought this would have so much more to it and look way better"*.

     `yours` is advisoryKeywords concatenated with manualNotes, and those are
     two different shapes of thing. A keyword is one word: proliferate,
     landwalk. A manual note is a whole clause off the card, and Atraxa's is 143
     characters. Both were drawn as rounded chips, so a paragraph was rendered
     as a pill and the row it sat in became the wall the owner is describing.

     Worse, the clause was ALREADY ON SCREEN TWICE MORE: once printed on the
     card image, which is the largest and most legible thing in the panel, and
     once inside `ManualPanel` below, which is the place that actually offers
     the controls to resolve it. Three copies of one paragraph.

     So the chips carry the KEYWORDS only, which is what a chip is for, and the
     clauses stay in `ManualPanel` beside the controls that act on them. The
     count is still stated here, because "there are two things the engine will
     not do" is worth knowing before you scroll to them. */
  const yourKeywords = automation.advisoryKeywords.filter(note => !enforcedByEngine(note));
  /*
   * AND A CLAUSE THAT IS ONLY THE CHIP BESIDE IT, SPELT OUT, IS NOT A CLAUSE.
   *
   * `automationFor` adds one manual note per advisory keyword, worded exactly
   * `"<keyword>. This keyword is not applied for you."` (`effects.ts`). While
   * the clauses were only counted, that cost nothing. Now that they are written
   * out in full, every advisory keyword would appear twice on one panel: once as
   * the chip, and again as a sentence saying what the chip already means.
   * Measured on Yuna, Grand Summoner at the mulligan: the chip "grand summon"
   * with "grand summon. This keyword is not applied for you." directly beneath.
   *
   * Matched on the exact sentence rather than on a prefix, so a card whose real
   * rules text happens to begin with a keyword still has its own clause shown.
   */
  const restatesAChip = (note: string) =>
    yourKeywords.some(word => note.trim() === `${word}. This keyword is not applied for you.`);
  const yourClauses = automation.manualNotes.filter(
    note => !enforcedByEngine(note) && !restatesAChip(note)
  );

  /*
   * ARE THE BY-HAND CONTROLS GOING TO BE ON THIS PANEL AT ALL?
   *
   * Asked once, here, because THREE separate things were reading the same four
   * conditions and one of them disagreed with the others. The chip reading
   * *"2 abilities, below"* was drawn whenever the card had unautomated clauses;
   * the block it pointed at was drawn only when all four of these held. On the
   * mulligan they do not, so the panel promised content that the same render
   * had already decided not to draw. Owner saw exactly that, and so did the
   * screenshot at the top of this session.
   */
  const byHandOpen =
    !readOnly && !holdReason && !!onDispatch && card.controllerId === viewerPlayerId;

  /* CARD LEFT, EVERYTHING ELSE RIGHT, and the sizing follows from that.
     Stacked, the card ate the height and the text below it overflowed, so the
     panel scrolled. Owner: "i dont really like the modal window, and scroll bar
     ... maybe card details is on right hand of the card instead? Could maybe be
     a glass modal instead but wider."

     Beside the card there is no chrome under it to subtract, so the card is
     free to use the full height, and the details column takes width the panel
     was not using before.

     THE WIDTH IS NOW BUILT, NOT CAPPED. `panelWidth` used to be
     `min(boardWidth - 32, 980)` whatever was in it, so the mulligan drew a
     980px panel around a name and a stat line and left half of it empty, while
     a permanent with twenty by-hand controls drew the same 980px and clipped
     them. The card and the details each ask for what they need and the panel is
     their sum, which is the only arrangement where neither failure can happen. */
  const matHeight = Math.max(240, boardHeight - topInset - bottomInset);
  const roomy = Math.max(280, Math.min(boardWidth - 32, MAX_PANEL_WIDTH));
  /* Under `STACK_BELOW` there is no room for a card beside a readable column,
     so the card goes on top and the details take the full width underneath. */
  const stacked = roomy < STACK_BELOW;
  /* The second column exists to hold the by-hand controls. With no by-hand
     controls to put in it, a second column is the empty half of the panel the
     owner is complaining about, so it is not drawn. */
  const twoColumn = !stacked && byHandOpen && roomy >= TWO_COLUMN_AT;
  const detailsWidth = stacked
    ? 0
    : twoColumn
      ? Math.min(700, Math.max(620, Math.round(roomy * 0.52)))
      : Math.min(380, Math.max(300, Math.round(roomy * 0.4)));
  const cardHeight = stacked
    ? Math.max(150, Math.min(matHeight * STACKED_CARD_SHARE, (roomy - 28) / CARD_RATIO))
    : Math.max(
        170,
        Math.min(matHeight * MAX_HEIGHT_SHARE, (roomy - detailsWidth - PANEL_PADDING) / CARD_RATIO)
      );
  const cardWidth = Math.round(cardHeight * CARD_RATIO);
  const panelWidth = stacked
    ? roomy
    : Math.min(roomy, cardWidth + detailsWidth + PANEL_PADDING);

  /* One chip shape for every by-hand control on this panel, matching
     `ManualPanel`'s so the whole surface reads as one set of controls rather
     than three sets that happen to sit together. */
  const CHIP =
    'flex h-7 items-center rounded-md bg-foreground/[0.08] px-2.5 text-[11px] font-medium ' +
    'text-foreground transition-colors hover:bg-foreground/[0.16] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const run = (action: CardAction) => {
    switch (action.kind) {
      case 'play-land':
        return onPlayLand?.(card);
      case 'cast':
        // An Aura is cast AT something (CR 601.2c), and the host row below is
        // where that is chosen. Pressing the plain button would cast it at
        // nothing, and CR 704.5m would put it straight into the graveyard.
        if (auraNeedsHost(card)) return;
        return onCast?.(card);
      case 'tap':
      case 'untap':
        return onTapToggle?.(card);
      case 'attack':
        return action.defenderPlayerId && onAttack?.(card, action.defenderPlayerId);
      case 'block':
        return action.attackerId && onBlock?.(card, action.attackerId);
      case 'move':
        return action.zone && onMoveZone?.(card, action.zone, action.position);
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
          className={cn(
            'pointer-events-auto relative flex max-h-full flex-col overflow-hidden rounded-2xl',
            /*
             * OUT OF THE WAY WHILE YOU AIM, WITHOUT UNMOUNTING.
             *
             * This panel sits in the middle of the mat and the legal targets are
             * spread across it, so it would be standing on some of the answers.
             * It cannot simply be removed: the component asking the question is
             * inside it and holds the answers given so far, and unmounting it
             * throws a half-announced two-target spell away.
             *
             * `invisible` is `visibility: hidden`, which keeps the element
             * mounted and its state alive while taking it out of the picture,
             * out of the tab order and out of the way of a pointer. `AimLayer`
             * is carrying this card and its clause in the meantime, so nothing
             * a player needs has left the screen.
             */
            aiming && 'invisible'
          )}
          style={{ width: panelWidth }}
          role="group"
          aria-hidden={aiming ? true : undefined}
          aria-label={`${card.name}, ${ZONE_LABEL[card.zone]}`}
          /* A handle for `scripts/probe/card-panel-fit.mjs`, and the reason it
             exists: that probe used to find "the container with the most
             buttons", which on this page is the page, and every number it
             printed was therefore measured against the whole viewport where
             nothing can be off screen. A probe that cannot fail is not a
             measurement. Not a class, so a restyle cannot silently blind it. */
          data-card-panel="1"
          data-card-panel-layout={stacked ? 'stacked' : twoColumn ? 'two-column' : 'one-column'}
        >
          {/* Glass over the table rather than another slab of it. The mat
              behind stays visible through the blur, which is what keeps this
              reading as something laid ON the board mid-game instead of a
              window that has replaced it.

              Deliberately low opacity: 30% ground under a heavy blur, so the
              playmat's colour and weave still come through and the panel reads
              as glass rather than as a grey slab. The blur does the legibility
              work, not the fill. `backdrop-saturate` keeps the mat's colour
              alive through it instead of washing to grey. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl bg-background/30 backdrop-blur-3xl backdrop-saturate-150"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_28px_70px_rgba(0,0,0,0.75),inset_0_1px_0_hsl(0_0%_100%/0.10)]"
          />

          {/* THE BODY, AND THE `min-h-0` THAT WAS MISSING FROM IT.
              -----------------------------------------------------------------
              Owner: "All options dont fit into the card winjdow...?" and "this
              has a sacrifice ability which I cannot cast?"

              This row is the reason. The details column beside the card already
              carried `overflow-y-auto`, and it never once scrolled, because a
              flex item's default `min-height: auto` stops it shrinking below its
              content. So the ROW grew to the height of the column, the column
              was as tall as everything in it, and the panel above (which is
              `max-h-full overflow-hidden`) quietly cut the bottom off. Measured
              at 1600x1000: 781px of controls in a 722px box, with Sacrifice,
              Exile and Return to hand painted below the panel's own edge.

              `min-h-0` here is the whole fix. The row may now shrink to the
              panel, the column shrinks with it, and the scrollport inside really
              scrolls. It is a fallback rather than the plan: at desktop widths
              the two columns below mean there is nothing left to scroll to. */}
          <div
            className={cn(
              'relative flex min-h-0 w-full p-3.5',
              /* Under `STACK_BELOW` a card beside a column leaves neither of
                 them readable: measured at 390px, the card came out 122px wide
                 and the row still overflowed the panel by 36px. On a phone the
                 card goes on top, whole and unmodified, and the details take
                 the full width underneath. */
              stacked ? 'flex-col items-center gap-3' : 'items-stretch gap-3.5'
            )}
          >
            {/* The card, as large as the panel can hold. */}
            <GameCardView
              card={card}
              width={cardWidth}
              ignoreTapped
              /* The state row beside the card says all of this several times
                 larger, so the rail here would be the same facts twice on one
                 screen — and the panel clips at its own rounded corner, which
                 cut the marks in half. See `showMarks` on `GameCardView`. */
              showMarks={false}
              className={cn(
                'shrink-0 drop-shadow-[0_18px_40px_rgba(0,0,0,0.8)]',
                !stacked && 'self-center'
              )}
              title={card.name}
            />

            {/* Everything else, beside it (or under it on a phone). */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              {/* THE ONE ROW THAT NEVER SCROLLS: where this card is, whether
                  the rules engine runs it, and the way out. Lifted out of the
                  scrolling area because a close control that can scroll off the
                  top is a panel a player cannot shut. */}
              <div className="flex w-full shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {ZONE_LABEL[card.zone]}
                  {controller ? ` · ${controller.name}` : ''}
                </span>
                {/* THE MANUAL MARKER, ALWAYS VISIBLE.
                    Project law, from the product decisions of 19 Aug 2026: "The
                    manual marker must always be visible. The engine already
                    computes `automationFor(card).needsManual` correctly and
                    nothing renders it, so the engine is honest and the interface
                    is not." It was rendered only inside the by-hand block, which
                    is drawn on none of the screens where a player most needs to
                    know: the mulligan, a watched table, an opponent's permanent.
                    Here it is on every one of them. */}
                {automation.needsManual && (
                  <span
                    title="The rules engine does not run this card's abilities. You resolve them yourself."
                    className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Needs you
                  </span>
                )}
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

              {/* TWO COLUMNS, AND WHAT PUT THEM THERE.
                  -----------------------------------------------------------
                  The right half of this panel was 480 x 450 of nothing on the
                  mulligan, and 657px of clipped controls on the battlefield.
                  One arrangement answers both: what you can DO on the left,
                  what you have to do BY HAND on the right. The by-hand controls
                  are the long tail (twenty-odd chips on a permanent), so moving
                  them into a column of their own roughly halves the height and
                  fills the space that was empty with the thing that did not fit.

                  No conditional wrappers: the two columns are always two
                  children, and only the container changes between a grid and a
                  stack. A layout that grew and shrank its own tag structure is
                  how the same content ends up written twice. */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
                {/* CENTRED AGAINST THE CARD WHEN THERE IS LESS TO SAY THAN THE
                    CARD IS TALL.
                    -----------------------------------------------------------
                    A whole Magic card is 648px on a 1000px screen and the panel
                    is as tall as the card, so on the mulligan a name, a stat
                    line and two clauses sat at the top of a 650px column with
                    390 x 450 of nothing under them. Nothing is missing there;
                    the content is simply shorter than a card. Centring says
                    that, and a hole at the bottom says the panel is broken.

                    `my-auto` rather than `justify-center` on the scrolling box.
                    Centred justification in an overflow container puts the
                    overflow above the start edge, where no scrollbar can reach
                    it, which would reintroduce the unreachable-control bug this
                    whole change is about. Auto margins resolve to zero the
                    moment there is no free space, so a long panel scrolls
                    normally and a short one is composed. */}
                <div
                  data-card-panel-columns="1"
                  className={cn(
                    'my-auto',
                    twoColumn ? 'grid grid-cols-2 items-start gap-x-5' : 'flex flex-col gap-2'
                  )}
                >
                <div className="flex min-w-0 flex-col gap-2 empty:hidden">

            {/*
              THE HEADING, and why the sizes changed.

              Owner, looking at Atraxa selected: *"Thought this would have so
              much more to it and look way better"*, and separately that the
              stats *"should be large for their power, toughness"*.

              What was on screen was a card name at 16px, a type line at 12px,
              a power and toughness pill at 11px, rules text at 12px and every
              button label at 12px, all in the same grey. Nothing led, so the
              eye had nowhere to land and a panel with a lot of real
              information in it read as a wall.

              So there is a hierarchy now and it is deliberate: the NAME is the
              largest thing, POWER AND TOUGHNESS is the second, and everything
              else steps down from there. Power and toughness earns that place
              because in combat it is the number checked most often and most
              urgently, and because on the mat it is a badge a few pixels tall.
              Here there is room, so it is set as a display number rather than
              hidden in a row of pills that all look alike.
            */}
            <div className="w-full shrink-0">
              <div className="flex items-start gap-3">
                <h3
                  className={cn(
                    'min-w-0 flex-1 font-semibold leading-tight tracking-tight text-foreground',
                    /* Stacked, the card is above the name rather than beside it,
                       so the name has a column a third as wide to sit in. */
                    stacked ? 'text-lg' : 'text-2xl'
                  )}
                >
                  {card.name}
                </h3>
                <ManaCost cost={card.manaCost} size="sm" className="shrink-0 pt-1" />
              </div>
              {card.typeLine && (
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{card.typeLine}</p>
              )}
              {/*
                WHAT THIS CREATURE IS RIGHT NOW, at the size the question is
                asked. Owner: the stats *"should be large for their power,
                toughness, dice markers etc."*

                Power and toughness leads at 48px, larger than the name, because
                it is the only number on this panel a player checks in the
                middle of combat with a hand of cards in the other hand. It is
                also, deliberately, the same reading order as the rail on the
                mat: what it IS, then what has hit it, then what is on it, then
                what the player wrote on it. Two surfaces, one order, so a
                glance at the board and a look at the panel agree.

                It says PRINTED N/N underneath when the live line differs, which
                is the fact a player is actually checking when they open this:
                not "it is a 6/6" but "it is a 6/6 and the card says 2/2".
              */}
              {(stats || damage > 0 || rulesCounters.length > 0 || handMarks.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1.5">
                  {stats && (
                    <div className="shrink-0">
                      <p
                        className={cn(
                          'font-bold leading-none tabular-nums text-foreground',
                          stacked ? 'text-4xl' : 'text-5xl'
                        )}
                      >
                        {stats}
                      </p>
                      {statsModified && printedStats && (
                        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          printed {printedStats}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-1">
                    {damage > 0 && (
                      <span
                        title={`${damage} damage marked on ${card.name}. It is destroyed when this reaches its toughness.`}
                        className="rounded-full bg-destructive px-2.5 text-sm font-semibold leading-7 tabular-nums text-destructive-foreground"
                      >
                        {damage} damage
                      </span>
                    )}
                    {/* "+1 +1/+1" is what `${delta} ${key}` produces for the
                        commonest counter in Magic, and it is not a thing anyone
                        says. A player says one plus-one-plus-one counter. */}
                    {rulesCounters.map(counter => (
                      <span
                        key={counter.key}
                        title={`${counter.key} counters. The game put these here.`}
                        className="rounded-full bg-foreground px-2.5 text-sm font-semibold leading-7 tabular-nums text-background"
                      >
                        {counter.value === 1
                          ? `${counter.key} counter`
                          : `${counter.value} ${counter.key} counters`}
                      </span>
                    ))}
                    {/* Glass rather than filled, exactly as on the mat, because
                        a person laid this on the card and the rules did not. */}
                    {handMarks.map(mark => (
                      <span
                        key={mark.key}
                        title={markDescription(mark)}
                        className="rounded-md bg-foreground/[0.10] px-2.5 text-sm font-medium leading-7 text-foreground"
                      >
                        {mark.die ? `${mark.label} ${mark.value}` : markText(mark)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {notes.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
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

            {/* THE ACTIONS. Beside the card, and only the ones really
                available. The room this gained is what the owner asked it to
                buy: "This could give room to overwrite actions on the card too." */}
            {actions.length > 0 && (
              <div className="w-full shrink-0 space-y-1.5">
                {/* THE PLAY, on its own and unmistakable. `tone: 'primary'` is
                    the engine's own answer to "what are you most likely here to
                    do", and burying it in a grid with four zone moves was the
                    reason this needed reading rather than glancing at. */}
                {actions
                  .filter(action => action.tone === 'primary')
                  .map(action => (
                    <ActionButton
                      key={action.id}
                      action={action}
                      onClick={() => run(action)}
                      className="h-11 w-full text-sm"
                    />
                  ))}
                {actions.some(action => action.tone !== 'primary') && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {actions
                      .filter(action => action.tone !== 'primary')
                      .map(action => (
                        <ActionButton key={action.id} action={action} onClick={() => run(action)} />
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Not a button you cannot press: a sentence saying why there is no
                button. The engine never silently does nothing. Directly under
                the actions, because it is the answer to "where is the button I
                expected", and it used to sit eight blocks below them. */}
            {blocked.map(entry => (
              <p key={entry.id} className="w-full shrink-0 text-xs leading-snug text-muted-foreground">
                {entry.reason}
              </p>
            ))}

            {/* A watched table has no plays for the same reason all the way
                down, so it is said once here rather than card by card. */}
            {readOnly && (
              <p className="w-full shrink-0 text-xs leading-snug text-muted-foreground">
                You are watching. The bot is playing every seat at this table.
              </p>
            )}

            {/* SACRIFICE, EXILE, DISCARD, BOUNCE. Beside the plays, because
                they ARE plays.
                -----------------------------------------------------------
                Owner: "this has a sacrifice ability which I cannot cast?" and
                "Including sending to graveyard, exile, etc". The control was
                built, and it was the LAST block on a column that overflowed the
                panel, so it was painted below the panel's own bottom edge and
                clipped away at all three widths measured. It was also called
                "To graveyard", which is a destination rather than an act;
                `moveLabel` in `cardActions.ts` now names each one the way a
                player would, from the zone the card is leaving. */}
            {moves.length > 0 && (
              <div className="w-full shrink-0 space-y-1.5">
                <Legend note="the rules engine will not do this for you">Move this card</Legend>
                <div className="flex flex-wrap gap-1">
                  {moves.map(move => (
                    <button
                      key={move.id}
                      type="button"
                      onClick={() => run(move)}
                      title={move.hint}
                      aria-label={move.hint}
                      className={CHIP}
                    >
                      {move.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* THE PERMANENT'S OWN ABILITIES. An ability is a play, so it sits
                with the plays rather than in a panel of its own. Only for a
                card you control and only while this board takes decisions, for
                the same reasons the by-hand controls below carry. */}
            {!readOnly && !holdReason && onDispatch && card.controllerId === viewerPlayerId && (
              <AbilityPanel
                state={state}
                viewerPlayerId={viewerPlayerId}
                card={card}
                freeCast={freeCast}
                onDispatch={onDispatch}
                className="shrink-0"
              />
            )}

            {/* THE COMMAND ZONE. What this costs from it and why it went up,
                the CR 903.9a choice when it is in a graveyard or exile, and how
                close it is to twenty-one on somebody. Above the attachments
                because a commander's price is the first thing a player is
                deciding about, and it is the block the Cast button's own label
                is a summary of. */}
            <CommanderPanel
              state={state}
              viewerPlayerId={viewerPlayerId}
              card={card}
              onDispatch={
                !readOnly && !holdReason && card.ownerId === viewerPlayerId ? onDispatch : undefined
              }
              className="shrink-0"
            />

            {/* WHAT IS ON THIS, AND WHAT IT IS GIVING.
                Under the abilities on purpose: equip is one of those abilities
                now, so the button that moves the sword and the readout of what
                the sword is doing sit together. Read-only boards get the
                readout and not the cast, which is the same split every other
                block here takes. */}
            <AttachmentPanel
              state={state}
              viewerPlayerId={viewerPlayerId}
              card={card}
              onCastAt={!readOnly && !holdReason ? onCast : undefined}
              className="shrink-0"
            />

            {/* WHAT THIS SPELL IS BEING CAST AT (CR 601.2c).
                Beside the Aura's host row rather than instead of it, because
                they are the same question asked of two different card types and
                each one draws only for the cards it is about. This is the
                control `cardActions.ts` withholds the plain Cast button for: a
                targeted spell is cast FROM here, aimed, or it is not cast. */}
            <SpellTargetPanel
              state={state}
              viewerPlayerId={viewerPlayerId}
              card={card}
              freeCast={freeCast}
              onCastAt={
                !readOnly && !holdReason && onCastAtTargets
                  ? (target, options) => onCastAtTargets(target, options.targets ?? [])
                  : undefined
              }
              className="shrink-0"
            />

            {/* WHAT THE GAME IS DOING FOR YOU, AND WHAT IT IS NOT.
                Two lists, never merged, because the whole value is the
                distinction. A green mark means the rules engine enforces it and
                you can forget about it. An amber one means the card says it and
                nothing will happen unless you make it happen, which is what the
                manual controls underneath are for. */}
            {(handled.length > 0 || yours.length > 0) && (
              <div className="w-full shrink-0 space-y-1.5">
                {handled.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Automatic
                    </span>
                    {handled.map(word => (
                      <span
                        key={word}
                        title="The rules engine applies this for you"
                        className="rounded-full bg-emerald-400/[0.14] px-2.5 text-xs capitalize leading-6 text-emerald-200/90"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                )}
                {(yourKeywords.length > 0 || yourClauses.length > 0) && (
                  <div className="w-full space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        You resolve
                      </span>
                      {yourKeywords.map(word => (
                        <span
                          key={word}
                          title="The engine does not apply this. You do it yourself."
                          className="rounded-full bg-amber-400/[0.14] px-2.5 text-xs leading-6 text-amber-200/90"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                    {/*
                      "2 ABILITIES, BELOW" WITH NOTHING BELOW.
                      ---------------------------------------------------------
                      What stood here was a chip counting the clauses and
                      pointing at `ManualPanel`, which prints the first two of
                      them beside its controls. On the mulligan `ManualPanel` is
                      not drawn at all, so the chip pointed at the bottom of an
                      empty column. Screenshotted on 2026-08-30 at 1600x1000:
                      *"2 abilities, below"*, and then 480 x 450 of nothing.

                      A count is not worth a chip anyway. The clauses themselves
                      are the content, they are the reason the manual controls
                      exist, and reading them is the whole of what a player does
                      with an opening hand. So they are written out here, always,
                      in the card's own words, and `ManualPanel` no longer
                      repeats them (`showNotes={false}`) so there is exactly one
                      copy on the panel.

                      Neutral surface rather than the amber the chips use:
                      project law reserves hue for MTG semantics, and a
                      paragraph-sized amber block is decoration rather than a
                      mana colour or a card type.
                    */}
                    {yourClauses.map(clause => (
                      <p
                        key={clause}
                        className="rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground"
                      >
                        {clause}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
                </div>

                {/* ------------------------------------------------------- */}
                {/* COLUMN TWO: THE BY-HAND CONTROLS                        */}
                {/* ------------------------------------------------------- */}
                {/* WHY THE SPLIT FALLS HERE, and it was measured rather than
                    guessed. With the automatic / you-resolve readout on this
                    side, the two columns came out 400px and 585px against a
                    496px box at 1280 x 800, so the taller one scrolled while
                    the shorter one had 96px spare. The readout is about what
                    the CARD does, which is the left column's subject, so it
                    moved there and the two now balance. Everything left here is
                    one thing: the controls for doing it yourself. */}
                <div className="flex min-w-0 flex-col gap-2 empty:hidden">
            {/* Everything the engine will not resolve for this card, and the
                controls to resolve it yourself. Only for a card you control:
                reaching into an opponent's permanent is a different, larger
                question and offering it here would be a lie about whose turn
                it is to act.

                The "Play it yourself" heading that used to sit over this is
                gone: `ManualPanel` opens with its own "By hand" heading and the
                same summary, so the panel carried two headings and a repeated
                sentence over one block of controls. */}
            {byHandOpen && onDispatch && (
              <div className="w-full shrink-0 rounded-lg bg-foreground/[0.04] p-2.5">
                <ManualPanel
                  state={state}
                  card={card}
                  onDispatch={onDispatch}
                  /* The clauses are written out above, once. */
                  showNotes={false}
                />
              </div>
            )}
                </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </GameStateProvider>
  );
}

export default CenterPreview;
