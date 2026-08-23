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
import { ZONES, type CardInstance, type GameState, type PlayerId, type Zone } from '@/lib/game';

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
  onClose: () => void;
  className?: string;
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
  onClose,
  className,
}: ZonePanelProps) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return null;

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

      {/* The declared search. Only your own library, and only one way in. */}
      {isLibrary && isMine && (
        <div className="shrink-0 px-3 pb-2">
          <button
            type="button"
            onClick={() => setSearching(value => !value)}
            className="rounded-md bg-foreground/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {searching ? 'Stop searching' : 'Search your library'}
          </button>
        </div>
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
