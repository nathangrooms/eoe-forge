import { Player } from '@/lib/simulation/types';
import { Heart, Library, BookOpen } from 'lucide-react';
import { GroupedCardDisplay } from './GroupedCardDisplay';
import { cn } from '@/lib/utils';

interface DetailedPlayerZoneProps {
  player: Player;
  isActive: boolean;
  hasPriority: boolean;
  orientation: 'top' | 'bottom';
}

export const DetailedPlayerZone = ({ player, isActive, hasPriority, orientation }: DetailedPlayerZoneProps) => {
  const isTop = orientation === 'top';

  // Separate battlefield by permanent type
  const lands = player.battlefield.filter(c => c.type_line.includes('Land'));
  const creatures = player.battlefield.filter(c => c.type_line.includes('Creature'));
  const artifacts = player.battlefield.filter(c => 
    c.type_line.includes('Artifact') && !c.type_line.includes('Creature')
  );
  const enchantments = player.battlefield.filter(c => c.type_line.includes('Enchantment'));
  const planeswalkers = player.battlefield.filter(c => c.type_line.includes('Planeswalker'));

  return (
    <div className={cn(
      "h-full flex flex-col gap-2",
      isTop ? "flex-col" : "flex-col-reverse"
    )}>
      {/* Compact Player Info Bar */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2 rounded-lg border transition-all",
        isActive ? "bg-primary/20 border-primary/50" : "bg-muted/30 border-border/50",
        hasPriority && "ring-2 ring-primary/70"
      )}>
        <div className="flex items-center gap-4">
          <span className={cn("text-lg font-bold", isActive && "text-primary")}>
            {player.name}
          </span>
          <div className="flex items-center gap-2 bg-background/60 px-3 py-1 rounded-md">
            <Heart className={cn(
              "h-5 w-5",
              player.life > 30 ? "text-green-500" :
              player.life > 20 ? "text-yellow-500" :
              player.life > 10 ? "text-orange-500" : "text-red-500"
            )} />
            <span className="text-2xl font-bold">{player.life}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 bg-background/60 px-2 py-1 rounded">
            <Library className="h-4 w-4 text-primary" />
            <span className="font-mono font-bold">{player.library.length}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-background/60 px-2 py-1 rounded">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-mono">Hand: <b>{player.hand.length}</b></span>
          </div>
          <div className="bg-background/60 px-2 py-1 rounded font-mono">
            GY: <b>{player.graveyard.length}</b>
          </div>
          <div className="bg-background/60 px-2 py-1 rounded font-mono">
            Exile: <b>{player.exile.length}</b>
          </div>
        </div>

        {Object.values(player.manaPool).some(v => v > 0) && (
          <div className="flex items-center gap-2">
            {Object.entries(player.manaPool).map(([color, amount]) => {
              if (amount === 0) return null;
              const colorMap: Record<string, string> = {
                W: 'bg-yellow-100 text-yellow-900 border-yellow-400',
                U: 'bg-blue-100 text-blue-900 border-blue-400',
                B: 'bg-gray-800 text-white border-gray-600',
                R: 'bg-red-100 text-red-900 border-red-400',
                G: 'bg-green-100 text-green-900 border-green-400',
                C: 'bg-gray-100 text-gray-900 border-gray-400'
              };
              return (
                <div key={color} className={cn("font-bold text-xs px-2 py-1 rounded border-2", colorMap[color])}>
                  {color}{amount > 1 ? `×${amount}` : ''}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Commander Zone (if exists) */}
      {player.commandZone.length > 0 && (
        <div className="px-2">
          <div className="text-xs font-bold text-primary mb-1">⭐ COMMAND ZONE</div>
          <GroupedCardDisplay cards={player.commandZone} />
        </div>
      )}

      {/* Main Battlefield Area */}
      <div className="flex-1 overflow-y-auto space-y-2 px-2">
        {/* Hand */}
        {player.hand.length > 0 && (
          <div className="bg-background/20 rounded-lg p-2">
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
              Hand ({player.hand.length})
            </div>
            <GroupedCardDisplay 
              cards={player.hand}
              faceDown={isTop}
              compact
            />
          </div>
        )}

        {/* Creatures */}
        {creatures.length > 0 && (
          <div className="bg-background/20 rounded-lg p-2">
            <div className="text-xs font-semibold text-foreground mb-2 uppercase flex items-center gap-2">
              <span className="text-red-400">⚔️</span>
              Creatures ({creatures.length})
            </div>
            <GroupedCardDisplay cards={creatures} />
          </div>
        )}

        {/* Lands */}
        {lands.length > 0 && (
          <div className="bg-background/20 rounded-lg p-2">
            <div className="text-xs font-semibold text-green-400 mb-2 uppercase flex items-center gap-2">
              <span>🏔️</span>
              Lands ({lands.length})
            </div>
            <GroupedCardDisplay cards={lands} compact />
          </div>
        )}

        {/* Other Permanents */}
        {(artifacts.length > 0 || enchantments.length > 0 || planeswalkers.length > 0) && (
          <div className="grid grid-cols-3 gap-2">
            {artifacts.length > 0 && (
              <div className="bg-background/20 rounded-lg p-2">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Artifacts ({artifacts.length})
                </div>
                <GroupedCardDisplay cards={artifacts} compact />
              </div>
            )}

            {enchantments.length > 0 && (
              <div className="bg-background/20 rounded-lg p-2">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Enchantments ({enchantments.length})
                </div>
                <GroupedCardDisplay cards={enchantments} compact />
              </div>
            )}

            {planeswalkers.length > 0 && (
              <div className="bg-background/20 rounded-lg p-2">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Planeswalkers ({planeswalkers.length})
                </div>
                <GroupedCardDisplay cards={planeswalkers} compact />
              </div>
            )}
          </div>
        )}

        {/* Graveyard & Exile */}
        {(player.graveyard.length > 0 || player.exile.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {player.graveyard.length > 0 && (
              <div className="bg-background/20 rounded-lg p-2">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Graveyard ({player.graveyard.length})
                </div>
                <GroupedCardDisplay cards={player.graveyard.slice(-5)} compact />
              </div>
            )}
            {player.exile.length > 0 && (
              <div className="bg-background/20 rounded-lg p-2">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Exile ({player.exile.length})
                </div>
                <GroupedCardDisplay cards={player.exile.slice(-5)} compact />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
