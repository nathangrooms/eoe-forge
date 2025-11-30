import { Player } from '@/lib/simulation/types';
import { Heart, Library, BookOpen } from 'lucide-react';
import { GroupedCardDisplay } from './GroupedCardDisplay';
import { cn } from '@/lib/utils';

interface DetailedPlayerZoneProps {
  player: Player;
  isActive: boolean;
  hasPriority: boolean;
  orientation: 'top' | 'bottom';
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
  damages: Map<string, Array<{ id: string; amount: number; timestamp: number }>>;
  attackers: any[];
  blockers: any[];
}

export const DetailedPlayerZone = ({ player, isActive, hasPriority, orientation, onRegisterCard, damages, attackers, blockers }: DetailedPlayerZoneProps) => {
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
      "h-full flex flex-col gap-1.5",
      isTop ? "flex-col" : "flex-col-reverse"
    )}>
      {/* Compact Player Info Bar */}
      <div className={cn(
        "flex items-center justify-between px-3 py-1.5 rounded border transition-all shrink-0",
        isActive ? "bg-primary/20 border-primary/50" : "bg-muted/30 border-border/50",
        hasPriority && "ring-1 ring-primary/70"
      )}>
        <div className="flex items-center gap-3">
          <span className={cn("text-base font-bold", isActive && "text-primary")}>
            {player.name}
          </span>
          <div className="flex items-center gap-1.5 bg-background/60 px-2 py-0.5 rounded">
            <Heart className={cn(
              "h-4 w-4",
              player.life > 30 ? "text-green-500" :
              player.life > 20 ? "text-yellow-500" :
              player.life > 10 ? "text-orange-500" : "text-red-500"
            )} />
            <span className="text-xl font-bold">{player.life}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 bg-background/60 px-1.5 py-0.5 rounded">
            <Library className="h-3 w-3 text-primary" />
            <span className="font-mono font-bold">{player.library.length}</span>
          </div>
          <div className="flex items-center gap-1 bg-background/60 px-1.5 py-0.5 rounded">
            <BookOpen className="h-3 w-3 text-primary" />
            <span className="font-mono"><b>{player.hand.length}</b></span>
          </div>
          <div className="bg-background/60 px-1.5 py-0.5 rounded font-mono">
            GY: <b>{player.graveyard.length}</b>
          </div>
          <div className="bg-background/60 px-1.5 py-0.5 rounded font-mono">
            Ex: <b>{player.exile.length}</b>
          </div>
        </div>

        {Object.values(player.manaPool).some(v => v > 0) && (
          <div className="flex items-center gap-1">
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
                <div key={color} className={cn("font-bold text-xs px-1.5 py-0.5 rounded border", colorMap[color])}>
                  {color}{amount > 1 ? amount : ''}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Battlefield Area - Horizontal Scrolling */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="grid grid-cols-[auto_1fr_auto] gap-1.5 h-full">
          
      {/* LEFT COLUMN: Command Zone + Hand */}
      <div className="flex flex-col gap-1 w-[160px]">
        {player.commandZone.length > 0 && (
          <div className="bg-background/15 rounded p-1">
            <div className="text-[9px] font-bold text-primary mb-0.5">⭐ CMD</div>
            <GroupedCardDisplay cards={player.commandZone} compact onRegisterCard={onRegisterCard} />
          </div>
        )}
        
        {player.hand.length > 0 && (
          <div className="bg-background/15 rounded p-1 flex-1 min-h-0 overflow-auto">
            <div className="text-[9px] font-semibold text-muted-foreground mb-0.5 uppercase">
              Hand ({player.hand.length})
            </div>
            <GroupedCardDisplay 
              cards={player.hand}
              compact
              onRegisterCard={onRegisterCard}
            />
          </div>
        )}
      </div>

          {/* CENTER: Battlefield */}
          <div className="flex flex-col gap-1 overflow-auto">
            {creatures.length > 0 && (
              <div className="bg-background/15 rounded p-1">
                <div className="text-[9px] font-semibold text-red-400 mb-0.5 uppercase flex items-center gap-1">
                  <span>⚔️</span> Creatures ({creatures.length})
                </div>
                <GroupedCardDisplay 
                  cards={creatures} 
                  compact 
                  onRegisterCard={onRegisterCard}
                  damages={damages}
                  attackers={attackers}
                  blockers={blockers}
                />
              </div>
            )}

            {lands.length > 0 && (
              <div className="bg-background/15 rounded p-1">
                <div className="text-[9px] font-semibold text-green-400 mb-0.5 uppercase flex items-center gap-1">
                  <span>🏔️</span> Lands ({lands.length})
                </div>
                <GroupedCardDisplay cards={lands} compact onRegisterCard={onRegisterCard} />
              </div>
            )}

            {(artifacts.length > 0 || enchantments.length > 0 || planeswalkers.length > 0) && (
              <div className="flex gap-1">
                {artifacts.length > 0 && (
                  <div className="bg-background/15 rounded p-1 flex-1">
                    <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                      Artifacts ({artifacts.length})
                    </div>
                    <GroupedCardDisplay cards={artifacts} compact onRegisterCard={onRegisterCard} />
                  </div>
                )}
                {enchantments.length > 0 && (
                  <div className="bg-background/15 rounded p-1 flex-1">
                    <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                      Enchantments ({enchantments.length})
                    </div>
                    <GroupedCardDisplay cards={enchantments} compact onRegisterCard={onRegisterCard} />
                  </div>
                )}
                {planeswalkers.length > 0 && (
                  <div className="bg-background/15 rounded p-1 flex-1">
                    <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                      Planeswalkers ({planeswalkers.length})
                    </div>
                    <GroupedCardDisplay cards={planeswalkers} compact onRegisterCard={onRegisterCard} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Graveyard + Exile */}
          <div className="flex flex-col gap-1 w-[110px]">
            {player.graveyard.length > 0 && (
              <div className="bg-background/15 rounded p-1 flex-1">
                <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                  GY ({player.graveyard.length})
                </div>
                <GroupedCardDisplay cards={player.graveyard.slice(-3)} compact onRegisterCard={onRegisterCard} />
              </div>
            )}
            {player.exile.length > 0 && (
              <div className="bg-background/15 rounded p-1 flex-1">
                <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                  Exile ({player.exile.length})
                </div>
                <GroupedCardDisplay cards={player.exile.slice(-3)} compact onRegisterCard={onRegisterCard} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
