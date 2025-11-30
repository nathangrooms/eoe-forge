import { Player } from '@/lib/simulation/types';
import { Heart, Library, BookOpen } from 'lucide-react';
import { ZoneSection } from './ZoneSection';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

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
      "h-full flex flex-col gap-2 p-3",
      isTop ? "flex-col" : "flex-col-reverse"
    )}>
      {/* Player info bar */}
      <Card className={cn(
        "p-3 transition-all",
        isActive ? "bg-primary/10 border-primary shadow-lg shadow-primary/20" : "bg-background border-border",
        hasPriority && "ring-2 ring-primary"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "text-xl font-bold",
              isActive && "text-primary"
            )}>
              {player.name}
            </div>
            <div className="flex items-center gap-2">
              <Heart className={cn(
                "h-6 w-6",
                player.life > 30 ? "text-green-500" :
                player.life > 20 ? "text-yellow-500" :
                player.life > 10 ? "text-orange-500" : "text-red-500"
              )} />
              <span className="text-3xl font-bold">{player.life}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              <span className="font-mono font-bold">{player.library.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="font-mono">Hand: {player.hand.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono">GY: {player.graveyard.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono">Exile: {player.exile.length}</span>
            </div>
          </div>

          {/* Mana pool */}
          {Object.values(player.manaPool).some(v => v > 0) && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">Mana Pool:</div>
              {Object.entries(player.manaPool).map(([color, amount]) => {
                if (amount === 0) return null;
                const colorMap: Record<string, string> = {
                  W: 'bg-yellow-100 text-yellow-900 border-yellow-300',
                  U: 'bg-blue-100 text-blue-900 border-blue-300',
                  B: 'bg-gray-800 text-white border-gray-600',
                  R: 'bg-red-100 text-red-900 border-red-300',
                  G: 'bg-green-100 text-green-900 border-green-300',
                  C: 'bg-gray-100 text-gray-900 border-gray-300'
                };
                return (
                  <div key={color} className={cn("font-bold text-sm px-2 py-1 rounded border-2", colorMap[color])}>
                    {color}{amount > 1 ? ` x${amount}` : ''}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Hand (only for bottom player) */}
      {!isTop && (
        <ZoneSection
          title="Hand"
          cards={player.hand}
          orientation={orientation}
          compact
        />
      )}

      {/* Battlefield sections */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {/* Planeswalkers */}
        {planeswalkers.length > 0 && (
          <ZoneSection
            title="Planeswalkers"
            cards={planeswalkers}
            orientation={orientation}
          />
        )}

        {/* Creatures */}
        <ZoneSection
          title="Creatures"
          cards={creatures}
          orientation={orientation}
        />

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <ZoneSection
            title="Artifacts"
            cards={artifacts}
            orientation={orientation}
          />
        )}

        {/* Enchantments */}
        {enchantments.length > 0 && (
          <ZoneSection
            title="Enchantments"
            cards={enchantments}
            orientation={orientation}
          />
        )}

        {/* Lands */}
        <ZoneSection
          title="Lands"
          cards={lands}
          orientation={orientation}
        />

        {/* Graveyard & Exile */}
        <div className="grid grid-cols-2 gap-2">
          {player.graveyard.length > 0 && (
            <ZoneSection
              title="Graveyard"
              cards={player.graveyard.slice(-3)} // Show last 3 cards
              orientation={orientation}
              compact
            />
          )}
          {player.exile.length > 0 && (
            <ZoneSection
              title="Exile"
              cards={player.exile.slice(-3)} // Show last 3 cards
              orientation={orientation}
              compact
            />
          )}
        </div>
      </div>

      {/* Commander Zone */}
      {player.commandZone.length > 0 && (
        <ZoneSection
          title="Command Zone"
          cards={player.commandZone}
          orientation={orientation}
          compact
        />
      )}
    </div>
  );
};
