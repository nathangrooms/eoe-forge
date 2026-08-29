/**
 * Look inside a zone.
 *
 * Every playtest tool eventually needs this and most of them hide it: a real
 * game constantly asks you to return something from the graveyard, tutor from
 * the library or put a card on the bottom.
 *
 * It used to be a Sheet — a panel that slid in over the table with a dimmed
 * backdrop behind it. On `/play` that is exactly the wrong shape. Owner: *"Make
 * sure no modals in play, it should be beautiful within the playmat system."*
 * So this is a panel in the board's right-hand rail, the same rail the preview
 * uses, made of the same mat material. The table moves over for it; nothing is
 * ever covered.
 *
 * It also does not move cards itself any more. Clicking a card here opens the
 * preview, and the preview owns the actions — one path from "I clicked a card"
 * to "something happened", everywhere in play mode.
 *
 * The library is shown in order with the top card first and clearly labelled,
 * because "search your library" and "look at the top three" are different
 * actions and confusing them silently invalidates a test.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameCardView } from './GameCardView';
import { CardBack } from './CardBack';
import {
  libraryControlsFor,
  ZONES,
  type CardInstance,
  type GameAction,
  type GameState,
  type LibraryControl,
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

export interface ZonePanelProps {
  state: GameState;
  playerId: PlayerId;
  zone: Zone;
  /** The seat this device controls — other players' hidden zones stay hidden. */
  viewerPlayerId: PlayerId;
  /** Click a card here and the preview opens, exactly as on the board. */
  onInspect: (card: CardInstance) => void;
  onZoneChange: (zone: Zone) => void;
  /** Every by-hand library control ends here. The page holds the reducer. */
  onDispatch: (actions: GameAction[]) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Draw, mill, exile and bottom, off the top of your own library.
 *
 * ---------------------------------------------------------------------------
 * THE ONLY WAY TO MILL A CARD WAS TO READ YOUR WHOLE DECK
 * ---------------------------------------------------------------------------
 * Measured on 29 Aug 2026, driving a real goldfish game and reading every
 * button on the table: nothing anywhere put a card from a library into a
 * graveyard, exiled the top card, or drew one. The turn's own draw step was the
 * only thing in the app that had ever moved a card out of a library, and the
 * only control that touched a library at all was "Search your library", which
 * shows every card in it.
 *
 * So a player asked to mill four had to open their library, reveal all 86
 * cards to themselves, and move four of them one at a time. That is not a
 * missing shortcut. It is a rule the interface made them break, and they cannot
 * un-know their next ten draws afterwards.
 *
 * These four controls never reveal anything. They read the ids off the top of
 * the pile and build the moves from those, so what lands in the graveyard
 * becomes public because a graveyard is public, which is what the rules say.
 *
 * Draw is here rather than on a card because drawing is a LIBRARY action: the
 * card comes off the top of this pile, and this is the pile.
 */
function LibraryReach({
  controls,
  onDispatch,
}: {
  controls: LibraryControl[];
  onDispatch: (actions: GameAction[]) => void;
}) {
  const rows: Array<{ group: LibraryControl['group']; title: string; note: string }> = [
    { group: 'draw', title: 'Draw', note: 'into your hand' },
    { group: 'mill', title: 'Mill', note: 'top cards to your graveyard' },
    { group: 'exile', title: 'Exile', note: 'top cards, face up' },
    { group: 'bottom', title: 'To the bottom', note: 'top cards under the pile' },
  ];

  return (
    <div className="shrink-0 space-y-1.5 px-3 pb-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Off the top, without looking
      </p>
      {rows.map(row => {
        const inRow = controls.filter(control => control.group === row.group);
        if (inRow.length === 0) return null;
        return (
          <div key={row.group} className="flex items-center gap-2">
            <span className="w-[6.5rem] shrink-0 truncate text-[11px] text-foreground">
              {row.title}
            </span>
            <div className="flex flex-wrap gap-1">
              {inRow.map(control => (
                <button
                  key={control.id}
                  type="button"
                  onClick={() => onDispatch(control.actions)}
                  title={control.hint}
                  className="h-7 min-w-7 rounded-md bg-foreground/[0.08] px-2 text-[11px] font-medium tabular-nums text-foreground transition-colors hover:bg-foreground/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {control.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Big enough to recognise, small enough that a 99-card library still scans. */
const THUMB_WIDTH = 92;

export function ZonePanel({
  state,
  playerId,
  zone,
  viewerPlayerId,
  onInspect,
  onZoneChange,
  onDispatch,
  onClose,
  className,
}: ZonePanelProps) {
  const player = state.players.find(p => p.id === playerId);
  const isMine = playerId === viewerPlayerId;

  /* YOUR OWN LIBRARY IS HIDDEN FROM YOU TOO, until you say you are searching it.
     ------------------------------------------------------------------------
     This used to read `&& !isMine`, so a library was concealed from opponents
     and wide open to its owner. The panel even said "Looking here is a search",
     which is an honest admission that it treated every peek as a tutor without
     ever making anyone declare one.

     Knowing your next ten draws is not a UI detail, it is information the rules
     do not give you, and a player who glances once cannot un-know it. Owner:
     "if you click it, it shows entire deck ... dont want to see every card
     then".

     Searching stays possible, because "search your library" is a real thing
     cards ask you to do. It is now a DECLARED action rather than the default
     view, and the log records it, so the other seat can see a search happened.
     A hand is unconditional: nobody looks at their opponent's hand, and you can
     already see your own. */
  const [searching, setSearching] = useState(false);
  useEffect(() => setSearching(false), [zone, playerId]);

  /*
   * BELOW THE HOOKS, and that is the whole of this fix.
   *
   * This was `if (!player) return null` on the line the lookup sits on, three
   * lines above `useState`. A seat that leaves the game leaves `state.players`,
   * so a rail left open on a dead player's graveyard went from a render with
   * two hooks to a render with none, and React answers that by throwing
   * "Rendered fewer hooks than expected" and unmounting the tree, which here is
   * the whole table rather than the panel. Nothing else about the component
   * changes: the same render is refused one step later, where it is free.
   */
  if (!player) return null;

  const isLibrary = zone === 'library';
  const hidden = isLibrary
    ? !isMine || !searching
    : zone === 'hand' && !isMine;
  const cards: CardInstance[] = player.zones[zone].map(id => state.cards[id]).filter(Boolean);

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {player.name} · {ZONE_LABEL[zone]}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close the zone"
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1 px-3 pb-2">
        {ZONES.map(target => (
          <button
            key={target}
            type="button"
            onClick={() => onZoneChange(target)}
            aria-pressed={target === zone}
            className={cn(
              'rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors',
              target === zone
                ? 'bg-foreground text-background'
                : 'bg-foreground/[0.07] text-muted-foreground hover:text-foreground'
            )}
          >
            {ZONE_LABEL[target]} · {player.zones[target].length}
          </button>
        ))}
      </div>

      <p className="shrink-0 px-3 pb-2 text-[10px] leading-tight text-muted-foreground">
        {hidden
          ? isLibrary && isMine
            ? `${cards.length} cards. Face down, like the real thing.`
            : 'Hidden zone. You can see the count, not the cards.'
          : isLibrary
            ? `${cards.length} cards, top first. You are searching, and the table has been told.`
            : `${cards.length} card${cards.length === 1 ? '' : 's'}. Click one to preview it.`}
      </p>

      {/* Reaching into the top of the pile, and only then the declared search.
          In that order on purpose: mill, exile and scry-to-the-bottom are what
          a player wants from their library twenty times a game and none of them
          involve looking, while a search is the rare one and the one that costs
          the information. Putting the search first was what made it the only
          door. */}
      {isLibrary && isMine && (
        <>
          <LibraryReach
            controls={libraryControlsFor(state, playerId, Date.now())}
            onDispatch={onDispatch}
          />
          <div className="shrink-0 px-3 pb-2">
            <button
              type="button"
              onClick={() => setSearching(value => !value)}
              className="rounded-md bg-foreground/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {searching ? 'Stop searching' : 'Search your library'}
            </button>
          </div>
        </>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {hidden ? (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.min(20, cards.length) }).map((_, index) => (
              <CardBack key={index} width={THUMB_WIDTH} />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <p className="rounded-lg bg-foreground/[0.05] px-4 py-8 text-center text-xs text-muted-foreground">
            Nothing here.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {cards.map((card, index) => (
              <li key={card.instanceId} className="relative">
                <button
                  type="button"
                  onClick={() => onInspect(card)}
                  title={card.name}
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <GameCardView card={card} width={THUMB_WIDTH} ignoreTapped title={card.name} />
                </button>
                {zone === 'library' && index === 0 && (
                  <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded bg-foreground px-1 text-[9px] font-semibold uppercase leading-4 text-background">
                    Top
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ZonePanel;
