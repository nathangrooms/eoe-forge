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
        "relative rounded-lg border-2 border-border/50 bg-gradient-to-br from-muted/20 to-muted/30",
        compact ? "w-20 h-28" : "w-32 h-44",
        "flex items-center justify-center shadow-md"
      )}>
        <div className="text-5xl opacity-30">🂠</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative rounded-lg border-2 transition-all cursor-pointer flex-shrink-0 shadow-lg hover:shadow-2xl",
              compact ? "w-24 h-32" : "w-36 h-50",
              card.isTapped && "opacity-80",
              isLand ? "border-green-600/60" : "border-primary/60",
              card.summoningSick && "ring-2 ring-yellow-500",
              "group hover:scale-110 hover:z-20"
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
              <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center p-2">
                <div className="text-sm font-bold text-center line-clamp-4 text-foreground">
                  {card.name}
                </div>
              </div>
            )}

            {/* Power/Toughness for creatures */}
            {isCreature && (
              <div className={cn(
                "absolute bottom-2 right-2 bg-background/95 backdrop-blur px-3 py-1.5 rounded-md font-bold border-2 shadow-lg",
                card.powerModifier !== 0 || card.toughnessModifier !== 0 ? "border-green-500 text-green-600" : "border-foreground/30"
              )}>
                <div className="text-lg leading-none">
                  {currentPower}/{currentToughness}
                </div>
              </div>
            )}

            {/* Damage marked */}
            {card.damageMarked > 0 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded-full font-bold text-2xl shadow-2xl border-2 border-destructive-foreground/20">
                  -{card.damageMarked}
                </div>
              </div>
            )}

            {/* Counters */}
            {Object.entries(card.counters).length > 0 && (
              <div className="absolute top-2 left-2 flex flex-col gap-1">
                {Object.entries(card.counters).map(([type, count]) => (
                  <Badge key={type} className="text-xs px-2 py-1 bg-primary/90 backdrop-blur">
                    +{count} {type}
                  </Badge>
                ))}
              </div>
            )}

            {/* Summoning sick indicator */}
            {card.summoningSick && card.zone === 'battlefield' && (
              <div className="absolute top-2 right-2 bg-yellow-500 text-yellow-950 px-2 py-1 rounded text-xs font-bold shadow-md">
                ⏱️ Sick
              </div>
            )}

            {/* Tapped overlay */}
            {card.isTapped && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-md">
                <div className="bg-background/90 backdrop-blur px-3 py-1.5 rounded text-sm font-bold">
                  TAPPED
                </div>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm p-4 bg-background/95 backdrop-blur">
          <div className="space-y-3">
            <div className="font-bold text-xl">{card.name}</div>
            <div className="text-sm text-muted-foreground">{card.mana_cost}</div>
            <div className="text-sm font-semibold border-t border-border pt-2">{card.type_line}</div>
            {card.oracle_text && (
              <div className="text-sm border-t border-border pt-2 leading-relaxed">{card.oracle_text}</div>
            )}
            {isCreature && (
              <div className="text-sm font-semibold border-t border-border pt-2">
                <span className="text-muted-foreground">P/T:</span> {currentPower}/{currentToughness}
                {(card.powerModifier !== 0 || card.toughnessModifier !== 0) && (
                  <span className="text-green-500 ml-2">(Base: {basePower}/{baseToughness})</span>
                )}
                {card.damageMarked > 0 && (
                  <span className="text-destructive ml-2">({card.damageMarked} damage)</span>
                )}
              </div>
            )}
            {card.keywords && card.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 border-t border-border pt-2">
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
