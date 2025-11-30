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
      "h-full flex flex-col gap-4 p-4",
      isTop ? "flex-col" : "flex-col-reverse"
    )}>
      {/* Player info bar */}
      <Card className={cn(
        "p-4 transition-all border-2",
        isActive ? "bg-primary/15 border-primary shadow-xl shadow-primary/30" : "bg-muted/20 border-border",
        hasPriority && "ring-4 ring-primary/50"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className={cn(
              "text-2xl font-bold",
              isActive && "text-primary"
            )}>
              {player.name}
            </div>
            <div className="flex items-center gap-3 bg-background/50 px-4 py-2 rounded-lg border border-border">
              <Heart className={cn(
                "h-7 w-7",
                player.life > 30 ? "text-green-500" :
                player.life > 20 ? "text-yellow-500" :
                player.life > 10 ? "text-orange-500" : "text-red-500"
              )} />
              <span className="text-4xl font-bold">{player.life}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg border border-border">
              <Library className="h-5 w-5 text-primary" />
              <span className="font-mono font-bold text-lg">{player.library.length}</span>
            </div>
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg border border-border">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-mono text-lg">Hand: <span className="font-bold">{player.hand.length}</span></span>
            </div>
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg border border-border">
              <span className="font-mono text-lg">GY: <span className="font-bold">{player.graveyard.length}</span></span>
            </div>
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-lg border border-border">
              <span className="font-mono text-lg">Exile: <span className="font-bold">{player.exile.length}</span></span>
            </div>
          </div>

          {/* Mana pool */}
          {Object.values(player.manaPool).some(v => v > 0) && (
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-muted-foreground">Mana Pool:</div>
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
                  <div key={color} className={cn("font-bold text-base px-3 py-1.5 rounded-md border-2 shadow-sm", colorMap[color])}>
                    {color}{amount > 1 ? ` ×${amount}` : ''}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Hand */}
      <ZoneSection
        title="Hand"
        cards={player.hand}
        orientation={orientation}
        compact
      />

      {/* Battlefield sections */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
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
        <div className="grid grid-cols-2 gap-3">
          {player.graveyard.length > 0 && (
            <ZoneSection
              title="Graveyard"
              cards={player.graveyard.slice(-5)} // Show last 5 cards
              orientation={orientation}
            />
          )}
          {player.exile.length > 0 && (
            <ZoneSection
              title="Exile"
              cards={player.exile.slice(-5)} // Show last 5 cards
              orientation={orientation}
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
        />
      )}
    </div>
  );
};
