import { GameCard } from '@/lib/simulation/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CardDisplayProps {
  card: GameCard;
  zone: 'hand' | 'battlefield' | 'graveyard' | 'exile';
  compact?: boolean;
}

export const CardDisplay = ({ card, zone, compact = false }: CardDisplayProps) => {
  const isCreature = card.type_line.includes('Creature');
  const isLand = card.type_line.includes('Land');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative rounded-lg border-2 transition-all cursor-pointer hover:scale-105",
              compact ? "w-16 h-20" : "w-24 h-32",
              card.isTapped && "rotate-90 origin-center",
              card.summoningSick && zone === 'battlefield' && "opacity-60",
              isLand ? "border-green-500/50 bg-green-950/20" : "border-primary/50 bg-background",
              card.isTapped && "border-muted"
            )}
          >
            {/* Card image or placeholder */}
            {card.image_uris?.art_crop ? (
              <img
                src={card.image_uris.art_crop}
                alt={card.name}
                className="absolute inset-0 w-full h-full object-cover rounded-md opacity-80"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-xs font-bold text-center p-1 line-clamp-2">
                  {card.name}
                </div>
              </div>
            )}

            {/* Mana cost */}
            {!compact && card.mana_cost && (
              <div className="absolute top-1 right-1 text-xs font-bold bg-background/80 px-1 rounded">
                {card.cmc}
              </div>
            )}

            {/* Power/Toughness for creatures */}
            {isCreature && card.power && card.toughness && (
              <div className="absolute bottom-1 right-1 text-xs font-bold bg-background/80 px-1 rounded">
                {card.power}/{parseInt(card.toughness) - card.damageMarked}
              </div>
            )}

            {/* Damage marked */}
            {card.damageMarked > 0 && (
              <div className="absolute top-1 left-1 text-xs font-bold bg-destructive text-destructive-foreground px-1 rounded">
                {card.damageMarked}
              </div>
            )}

            {/* Counters */}
            {Object.keys(card.counters).length > 0 && (
              <div className="absolute top-1 left-1 flex gap-1">
                {Object.entries(card.counters).map(([type, count]) => (
                  <div key={type} className="text-xs font-bold bg-primary text-primary-foreground px-1 rounded">
                    {count}
                  </div>
                ))}
              </div>
            )}

            {/* Summoning sick indicator */}
            {card.summoningSick && zone === 'battlefield' && (
              <div className="absolute inset-0 bg-muted/50 rounded-md flex items-center justify-center">
                <div className="text-2xl">😴</div>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <div className="space-y-2">
            <div className="font-bold">{card.name}</div>
            <div className="text-xs text-muted-foreground">{card.type_line}</div>
            {card.oracle_text && (
              <div className="text-sm">{card.oracle_text}</div>
            )}
            {isCreature && (
              <div className="text-sm font-semibold">
                {card.power}/{card.toughness}
                {card.damageMarked > 0 && ` (${card.damageMarked} damage)`}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
