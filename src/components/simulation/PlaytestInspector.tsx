/**
 * The card preview for a watched game.
 *
 * `/play`'s `CardInspector` is the right component when a seat is yours: it
 * offers Cast, Play land, Tap, Attack, Block. Nothing here is yours — every
 * seat is played by the bot — so offering those buttons would mean offering
 * buttons that do nothing, which is precisely the failure the owner called out
 * ("why do card effects not do anything"). This preview reads and never acts,
 * and says so.
 *
 * Part of the board, in the rail, never a modal.
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards/CardImage';
import { ManaCost } from '@/components/ui/mana-cost';
import { statLine, type CardInstance, type GameState } from '@/lib/game';

const ZONE_LABEL: Record<string, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  command: 'Command zone',
};

export function PlaytestInspector({
  state,
  card,
  onClose,
  className,
}: {
  state: GameState;
  card: CardInstance;
  onClose: () => void;
  className?: string;
}) {
  const controller = state.players.find(player => player.id === card.controllerId);
  const stats = statLine(card);
  const counters = Object.entries(card.counters ?? {}).filter(([, count]) => count !== 0);

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 p-3', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{card.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {controller?.name ?? 'Unknown'} · {ZONE_LABEL[card.zone] ?? card.zone}
            {card.tapped ? ' · tapped' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {card.imageUrl ? (
        <CardImage card={{ name: card.name, image_url: card.imageUrl }} fill hideFlip />
      ) : (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">{card.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.typeLine}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {card.manaCost && <ManaCost cost={card.manaCost} size="sm" />}
        {stats && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            {stats}
          </span>
        )}
        {card.isCommander && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Commander
          </span>
        )}
        {card.summoningSick && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Summoning sick
          </span>
        )}
      </div>

      {card.typeLine && <p className="text-[11px] text-muted-foreground">{card.typeLine}</p>}

      {counters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {counters.map(([name, count]) => (
            <span
              key={name}
              className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-foreground"
            >
              {name} ×{count}
            </span>
          ))}
        </div>
      )}

      {card.keywords && card.keywords.length > 0 && (
        <p className="text-[11px] capitalize text-muted-foreground">{card.keywords.join(' · ')}</p>
      )}

      <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground">
        Read-only. Every seat at this table is played by the bot — switch to Play to make the
        decisions yourself.
      </p>
    </div>
  );
}
