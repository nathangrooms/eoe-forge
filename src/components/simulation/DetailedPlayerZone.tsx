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
 
   // Commander status (alive = on battlefield)
   const commanderName = player.commandZone[0]?.name;
   const commanderOnBattlefield = commanderName
     ? player.battlefield.some(c => c.name === commanderName)
     : false;
 
    return (
      <div className={cn(
        "h-full flex flex-col gap-1.5"
      )}>
       {/* Compact Player Info Bar */}
       <div className={cn(
         "flex items-center justify-between px-3 py-1.5 rounded border transition-all shrink-0",
         isActive ? "bg-primary/20 border-primary/50" : "bg-muted/30 border-border/50",
         hasPriority && "ring-1 ring-primary/70"
       )}>
         <div className="flex items-center gap-3">
           <div className="flex flex-col leading-tight">
             <span className={cn("text-sm font-semibold", isActive && "text-primary")}
             >
               {player.name}
             </span>
             {commanderName && (
               <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                 <span className={cn(
                   "inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold",
                   commanderOnBattlefield
                     ? "border-emerald-500 text-emerald-400"
                     : "border-destructive/60 text-destructive"
                 )}>
                   ⭐ CMD {commanderOnBattlefield ? 'in play' : 'off board'}
                 </span>
               </span>
             )}
           </div>
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

      {/* Main Battlefield Area - Full Width Rows */}
      <div className="flex-1 overflow-auto min-h-0 space-y-1.5 px-2 pb-2">
        {/* Command Zone Row */}
        {player.commandZone.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-primary/20 w-full">
            <div className="text-[10px] font-bold text-primary mb-1.5 uppercase">⭐ Commander</div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={player.commandZone} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Creatures Row */}
        {creatures.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-red-500/20 w-full">
            <div className="text-[10px] font-bold text-red-400 mb-1.5 uppercase flex items-center gap-1">
              <span>⚔️</span> Creatures ({creatures.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay
                cards={creatures}
                compact
                onRegisterCard={onRegisterCard}
                damages={damages}
                attackers={attackers}
                blockers={blockers}
              />
            </div>
          </div>
        )}

        {/* Lands Row */}
        {lands.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-green-500/20 w-full">
            <div className="text-[10px] font-bold text-green-400 mb-1.5 uppercase flex items-center gap-1">
              <span>🏔️</span> Lands ({lands.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={lands} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Artifacts Row */}
        {artifacts.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-cyan-500/20 w-full">
            <div className="text-[10px] font-bold text-cyan-400 mb-1.5 uppercase">
              🔧 Artifacts ({artifacts.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={artifacts} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Enchantments Row */}
        {enchantments.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-purple-500/20 w-full">
            <div className="text-[10px] font-bold text-purple-400 mb-1.5 uppercase">
              ✨ Enchantments ({enchantments.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={enchantments} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Planeswalkers Row */}
        {planeswalkers.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-amber-500/20 w-full">
            <div className="text-[10px] font-bold text-amber-400 mb-1.5 uppercase">
              👤 Planeswalkers ({planeswalkers.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={planeswalkers} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Graveyard Row */}
        {player.graveyard.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-gray-500/20 w-full">
            <div className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase">
              ⚰️ Graveyard ({player.graveyard.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={player.graveyard.slice(-5)} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Exile Row */}
        {player.exile.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-pink-500/20 w-full">
            <div className="text-[10px] font-bold text-pink-400 mb-1.5 uppercase">
              🚫 Exile ({player.exile.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay cards={player.exile.slice(-5)} compact onRegisterCard={onRegisterCard} />
            </div>
          </div>
        )}

        {/* Hand Row - always last / bottom */}
        {player.hand.length > 0 && (
          <div className="bg-background/15 rounded p-2 border border-primary/10 w-full mt-1">
            <div className="text-[10px] font-bold text-blue-400 mb-1.5 uppercase">
              ✋ Hand ({player.hand.length})
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <GroupedCardDisplay
                cards={player.hand}
                compact
                onRegisterCard={onRegisterCard}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
