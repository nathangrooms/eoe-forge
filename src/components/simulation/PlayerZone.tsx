import { Player } from '@/lib/simulation/types';
import { Heart, Library, Sparkles } from 'lucide-react';
import { CardDisplay } from './CardDisplay';
import { cn } from '@/lib/utils';

interface PlayerZoneProps {
  player: Player;
  isActive: boolean;
  hasPriority: boolean;
  orientation: 'top' | 'bottom';
}

export const PlayerZone = ({ player, isActive, hasPriority, orientation }: PlayerZoneProps) => {
  const isTop = orientation === 'top';

  return (
    <div className={cn("h-full p-4 flex flex-col gap-2", isTop ? "flex-col" : "flex-col-reverse")}>
      {/* Player info bar */}
      <div className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-all",
        isActive ? "bg-primary/10 border-primary shadow-lg shadow-primary/20" : "bg-background border-border",
        hasPriority && "ring-2 ring-primary animate-pulse"
      )}>
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold">{player.name}</div>
          <div className="flex items-center gap-2">
            <Heart className={cn("h-5 w-5", player.life > 20 ? "text-green-500" : player.life > 10 ? "text-yellow-500" : "text-red-500")} />
            <span className="text-2xl font-bold">{player.life}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4" />
            <span>{player.library.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono">Hand: {player.hand.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono">GY: {player.graveyard.length}</span>
          </div>
          {player.commandZone.length > 0 && (
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-primary font-semibold">Commander</span>
            </div>
          )}
        </div>

        {/* Mana pool */}
        <div className="flex items-center gap-2">
          {Object.entries(player.manaPool).map(([color, amount]) => {
            if (amount === 0) return null;
            const colorMap: Record<string, string> = {
              W: 'text-yellow-200',
              U: 'text-blue-400',
              B: 'text-gray-900 dark:text-gray-300',
              R: 'text-red-500',
              G: 'text-green-500',
              C: 'text-gray-400'
            };
            return (
              <div key={color} className={cn("font-bold text-sm px-2 py-1 rounded border", colorMap[color])}>
                {color}: {amount}
              </div>
            );
          })}
        </div>
      </div>

      {/* Battlefield */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-8 gap-2 p-2">
          {player.battlefield.map((card) => (
            <CardDisplay key={card.instanceId} card={card} zone="battlefield" />
          ))}
        </div>
      </div>

      {/* Hand */}
      {!isTop && player.hand.length > 0 && (
        <div className="flex gap-2 overflow-x-auto p-2 bg-background/50 rounded-lg border border-border">
          {player.hand.map((card) => (
            <CardDisplay key={card.instanceId} card={card} zone="hand" compact />
          ))}
        </div>
      )}
    </div>
  );
};
