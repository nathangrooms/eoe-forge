import { GameCard } from '@/lib/simulation/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface FullCardDisplayProps {
  card: GameCard;
  compact?: boolean;
  faceDown?: boolean;
}

export const FullCardDisplay = ({ card, compact = false, faceDown = false }: FullCardDisplayProps) => {
  const isCreature = card.type_line.includes('Creature');
  const isLand = card.type_line.includes('Land');
  const basePower = parseInt(card.power || '0');
  const baseToughness = parseInt(card.toughness || '0');
  const currentPower = basePower + card.powerModifier;
  const currentToughness = baseToughness + card.toughnessModifier - card.damageMarked;

  if (faceDown) {
    return (
      <div className={cn(
        "relative rounded-lg border-2 border-muted bg-gradient-to-br from-primary/5 to-secondary/5",
        compact ? "w-16 h-22" : "w-24 h-32",
        "flex items-center justify-center"
      )}>
        <div className="text-4xl opacity-20">🂠</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative rounded-lg border-2 transition-all cursor-pointer hover:scale-105 hover:z-10 flex-shrink-0",
              compact ? "w-20 h-28" : "w-28 h-40",
              card.isTapped && "opacity-70",
              isLand ? "border-green-500/50" : "border-primary/50",
              card.summoningSick && "ring-2 ring-yellow-500/50",
              "group"
            )}
            style={{
              transform: card.isTapped ? 'rotate(90deg)' : 'none',
              transformOrigin: 'center center'
            }}
          >
            {/* Card image */}
            {card.image_uris?.normal ? (
              <img
                src={card.image_uris.normal}
                alt={card.name}
                className="absolute inset-0 w-full h-full object-cover rounded-md"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-background to-muted flex items-center justify-center p-2">
                <div className="text-xs font-bold text-center line-clamp-3">
                  {card.name}
                </div>
              </div>
            )}

            {/* Overlay for better visibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 rounded-md" />

            {/* Mana cost */}
            {card.mana_cost && !compact && (
              <div className="absolute top-1 right-1 bg-background/90 px-1.5 py-0.5 rounded text-xs font-bold border border-primary/20">
                {card.cmc}
              </div>
            )}

            {/* Card name */}
            <div className="absolute top-1 left-1 right-12 bg-background/90 px-1.5 py-0.5 rounded text-xs font-bold truncate border border-border">
              {card.name}
            </div>

            {/* Power/Toughness for creatures */}
            {isCreature && (
              <div className={cn(
                "absolute bottom-1 right-1 bg-background/95 px-2 py-1 rounded font-bold border-2",
                card.powerModifier !== 0 || card.toughnessModifier !== 0 ? "border-green-500 text-green-500" : "border-border"
              )}>
                <div className="text-sm">
                  {currentPower}/{currentToughness}
                </div>
                {(card.powerModifier !== 0 || card.toughnessModifier !== 0) && (
                  <div className="text-xs text-muted-foreground">
                    ({basePower}/{baseToughness})
                  </div>
                )}
              </div>
            )}

            {/* Damage marked */}
            {card.damageMarked > 0 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="bg-destructive text-destructive-foreground px-3 py-2 rounded-full font-bold text-lg shadow-lg">
                  -{card.damageMarked}
                </div>
              </div>
            )}

            {/* Counters */}
            {Object.entries(card.counters).length > 0 && (
              <div className="absolute top-8 left-1 flex flex-col gap-1">
                {Object.entries(card.counters).map(([type, count]) => (
                  <Badge key={type} variant="default" className="text-xs px-1">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            )}

            {/* Summoning sick indicator */}
            {card.summoningSick && card.zone === 'battlefield' && (
              <div className="absolute bottom-1 left-1 bg-yellow-500/90 text-yellow-950 px-1.5 py-0.5 rounded text-xs font-bold">
                Sick
              </div>
            )}

            {/* Tapped indicator */}
            {card.isTapped && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-muted/80 px-2 py-1 rounded text-xs font-bold">
                  TAPPED
                </div>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <div className="space-y-2">
            <div className="font-bold text-lg">{card.name}</div>
            <div className="text-xs text-muted-foreground">{card.mana_cost}</div>
            <div className="text-sm font-semibold">{card.type_line}</div>
            {card.oracle_text && (
              <div className="text-sm border-t pt-2">{card.oracle_text}</div>
            )}
            {isCreature && (
              <div className="text-sm font-semibold border-t pt-2">
                Power/Toughness: {currentPower}/{currentToughness}
                {(card.powerModifier !== 0 || card.toughnessModifier !== 0) && (
                  <span className="text-green-500"> (Modified from {basePower}/{baseToughness})</span>
                )}
                {card.damageMarked > 0 && (
                  <span className="text-destructive"> ({card.damageMarked} damage marked)</span>
                )}
              </div>
            )}
            {card.keywords && card.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
