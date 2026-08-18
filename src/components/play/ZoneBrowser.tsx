/**
 * Look inside a zone, and move cards out of it.
 *
 * Every playtest tool eventually needs this and most of them hide it: a real
 * game constantly asks you to return something from the graveyard, tutor from
 * the library or put a card on the bottom. Without a manual zone mover, a
 * playtest surface can only replay the subset of Magic its author automated.
 *
 * The library is shown in order with the top card first and clearly labelled,
 * because "search your library" and "look at the top three" are different
 * actions and confusing them silently invalidates a test.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ManaCost } from '@/components/ui/mana-cost';
import { GameCardView } from './GameCardView';
import { ZONES, type CardInstance, type GameState, type PlayerId, type Zone } from '@/lib/game';

const ZONE_LABEL: Record<Zone, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command zone',
};

export interface ZoneBrowserProps {
  state: GameState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: PlayerId | null;
  zone: Zone | null;
  /** The seat this device controls — other players' hidden zones stay hidden. */
  viewerPlayerId: PlayerId;
  onMove: (instanceId: string, to: Zone, position?: 'top' | 'bottom') => void;
  onZoneChange: (zone: Zone) => void;
}

export function ZoneBrowser({
  state,
  open,
  onOpenChange,
  playerId,
  zone,
  viewerPlayerId,
  onMove,
  onZoneChange,
}: ZoneBrowserProps) {
  if (!state || !playerId || !zone) return null;

  const player = state.players.find(p => p.id === playerId);
  if (!player) return null;

  const isMine = playerId === viewerPlayerId;
  const hidden = (zone === 'library' || zone === 'hand') && !isMine;
  const cards: CardInstance[] = player.zones[zone].map(id => state.cards[id]).filter(Boolean);

  const destinations: Zone[] = ZONES.filter(target => target !== zone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {player.name} · {ZONE_LABEL[zone]}
          </DialogTitle>
          <DialogDescription>
            {hidden
              ? 'Hidden zone — you can see the count, not the cards.'
              : zone === 'library'
                ? `${cards.length} cards, top of the library first. Looking here is a search.`
                : `${cards.length} card${cards.length === 1 ? '' : 's'}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1">
          {ZONES.map(target => (
            <Button
              key={target}
              size="sm"
              variant={target === zone ? 'default' : 'secondary'}
              className="h-7 text-[11px]"
              onClick={() => onZoneChange(target)}
            >
              {ZONE_LABEL[target]} · {player.zones[target].length}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {hidden ? (
            <p className="rounded-lg bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              {cards.length} card{cards.length === 1 ? '' : 's'}, face down.
            </p>
          ) : cards.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {cards.map((card, index) => (
                <li
                  key={card.instanceId}
                  className="flex items-center gap-3 rounded-lg bg-muted/40 p-2"
                >
                  <GameCardView card={card} size="xs" ignoreTapped />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {zone === 'library' && index === 0 && (
                        <span className="mr-1.5 rounded bg-foreground px-1 text-[9px] font-semibold uppercase text-background">
                          Top
                        </span>
                      )}
                      {card.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <ManaCost cost={card.manaCost} size="xs" />
                      <span className="truncate text-[10px] text-muted-foreground">
                        {card.typeLine}
                      </span>
                    </div>
                  </div>

                  {isMine && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {destinations.map(target => (
                        <Button
                          key={target}
                          size="sm"
                          variant="secondary"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() =>
                            onMove(card.instanceId, target, target === 'library' ? 'top' : undefined)
                          }
                        >
                          {ZONE_LABEL[target]}
                        </Button>
                      ))}
                      {zone !== 'library' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => onMove(card.instanceId, 'library', 'bottom')}
                        >
                          Bottom
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
