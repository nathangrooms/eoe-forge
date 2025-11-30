import { GameCard } from '@/lib/simulation/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { forwardRef } from 'react';

interface FullCardDisplayProps {
  card: GameCard;
  compact?: boolean;
  faceDown?: boolean;
}

export const FullCardDisplay = forwardRef<HTMLDivElement, FullCardDisplayProps>(
  ({ card, compact = false, faceDown = false }, ref) => {
  const isCreature = card.type_line.includes('Creature');
  const isLand = card.type_line.includes('Land');
  const basePower = parseInt(card.power || '0');
  const baseToughness = parseInt(card.toughness || '0');
  const currentPower = basePower + card.powerModifier;
  const currentToughness = baseToughness + card.toughnessModifier - card.damageMarked;

  if (faceDown) {
    return (
      <div 
        ref={ref}
        className={cn(
          "relative rounded-md border border-border/50 bg-gradient-to-br from-muted/30 to-muted/50",
          compact ? "w-16 h-22" : "w-28 h-40",
          "flex items-center justify-center shadow-md"
        )}
      >
        <div className="text-4xl opacity-40">🂠</div>
      </div>
    );
  }

  const cardWidth = compact ? "w-20" : "w-32";
  const cardHeight = compact ? "h-28" : "h-44";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <div
            ref={ref}
            className={cn(
              "relative rounded-md border transition-all cursor-pointer flex-shrink-0",
              cardWidth,
              cardHeight,
              "shadow-lg hover:shadow-2xl hover:scale-[1.15] hover:z-30",
              card.isTapped && "opacity-75",
              isLand ? "border-green-500/70" : card.summoningSick ? "border-yellow-500" : "border-primary/70",
              "animate-fade-in"
            )}
            style={{
              transform: card.isTapped ? 'rotate(90deg)' : 'rotate(0deg)',
              transformOrigin: 'center center',
              transition: 'transform 0.3s ease-out'
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
                <div className="text-xs font-bold text-center line-clamp-5 text-foreground">
                  {card.name}
                </div>
              </div>
            )}

            {/* Top-left counter badges */}
            {Object.entries(card.counters).length > 0 && (
              <div className="absolute top-1 left-1 flex flex-wrap gap-1 max-w-[80%]">
                {Object.entries(card.counters).map(([type, count]) => (
                  <div
                    key={type}
                    className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-lg border border-primary-foreground/20"
                  >
                    +{count}
                  </div>
                ))}
              </div>
            )}

            {/* Top-right indicators */}
            <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
              {card.summoningSick && card.zone === 'battlefield' && !card.isTapped && (
                <div className="bg-yellow-500 text-yellow-950 rounded px-1.5 py-0.5 text-[10px] font-bold shadow-md">
                  ⏱
                </div>
              )}
            </div>

            {/* Center damage indicator */}
            {card.damageMarked > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-destructive text-destructive-foreground rounded-full w-12 h-12 flex items-center justify-center font-bold text-xl shadow-2xl border-2 border-white/50 animate-pulse">
                  -{card.damageMarked}
                </div>
              </div>
            )}

            {/* Bottom-right P/T */}
            {isCreature && (
              <div className={cn(
                "absolute bottom-1 right-1 rounded px-2 py-1 font-bold text-sm shadow-lg backdrop-blur",
                card.powerModifier !== 0 || card.toughnessModifier !== 0 || card.damageMarked > 0
                  ? "bg-green-500/95 text-white border border-green-300"
                  : "bg-background/95 text-foreground border border-border"
              )}>
                {currentPower}/{currentToughness}
              </div>
            )}

            {/* Tapped overlay */}
            {card.isTapped && (
              <div className="absolute inset-0 bg-black/50 rounded-md flex items-center justify-center">
                <div className="bg-background/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold rotate-[-90deg]">
                  TAPPED
                </div>
              </div>
            )}

            {/* Attacking indicator */}
            {card.zone === 'battlefield' && !card.isTapped && isCreature && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-destructive text-destructive-foreground rounded-full px-2 py-0.5 text-[9px] font-bold shadow-md">
                  ATK
                </div>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-md p-4 bg-background/98 backdrop-blur border-2 border-primary/50">
          <div className="space-y-2">
            <div className="font-bold text-lg text-primary">{card.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{card.mana_cost || "—"}</div>
            <div className="text-sm font-semibold border-t border-border pt-2">{card.type_line}</div>
            {card.oracle_text && (
              <div className="text-sm border-t border-border pt-2 leading-relaxed max-h-40 overflow-y-auto">
                {card.oracle_text}
              </div>
            )}
            {isCreature && (
              <div className="text-sm font-semibold border-t border-border pt-2 space-y-1">
                <div>
                  <span className="text-muted-foreground">Power/Toughness:</span>{" "}
                  <span className={cn(
                    "font-bold",
                    (card.powerModifier !== 0 || card.toughnessModifier !== 0 || card.damageMarked > 0) && "text-green-500"
                  )}>
                    {currentPower}/{currentToughness}
                  </span>
                  {(card.powerModifier !== 0 || card.toughnessModifier !== 0 || card.damageMarked > 0) && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Base: {basePower}/{baseToughness})
                    </span>
                  )}
                </div>
                {card.damageMarked > 0 && (
                  <div className="text-destructive text-xs">
                    💥 {card.damageMarked} damage marked
                  </div>
                )}
                {card.summoningSick && (
                  <div className="text-yellow-500 text-xs">
                    ⏱️ Summoning sickness
                  </div>
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
            {Object.entries(card.counters).length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="text-xs text-muted-foreground mb-1">Counters:</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(card.counters).map(([type, count]) => (
                    <Badge key={type} variant="default" className="text-xs">
                      +{count} {type}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

FullCardDisplay.displayName = 'FullCardDisplay';
