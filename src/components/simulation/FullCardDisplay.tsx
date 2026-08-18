import { GameCard } from '@/lib/simulation/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ManaCost } from '@/components/ui/mana-cost';
import { forwardRef } from 'react';
import { FloatingDamage } from './FloatingDamage';
import { Hourglass } from 'lucide-react';

interface FullCardDisplayProps {
  card: GameCard;
  compact?: boolean;
  faceDown?: boolean;
  damages?: Array<{ id: string; amount: number; timestamp: number }>;
  isAttacking?: boolean;
  isBlocking?: boolean;
}

/**
 * Counters are not all "+N". A planeswalker's loyalty, a -1/-1 counter and an
 * oil counter all rendered as `+{count}` before, so two -1/-1 counters read as
 * "+2" on the card and "+2 minus1minus1" in the tooltip.
 */
function counterLabel(type: string, count: number): string {
  const key = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'p1p1' || key === 'plus1plus1') return `+${count}/+${count}`;
  if (key === 'm1m1' || key === 'minus1minus1') return `-${count}/-${count}`;
  if (key === 'loyalty') return `${count}`;
  return `${count} ${type}`;
}

function counterTitle(type: string, count: number): string {
  const key = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'p1p1' || key === 'plus1plus1') return `${count} +1/+1 counters`;
  if (key === 'm1m1' || key === 'minus1minus1') return `${count} -1/-1 counters`;
  if (key === 'loyalty') return `${count} loyalty`;
  return `${count} ${type} counters`;
}

/**
 * Colour identity drives the card border so the board reads at a glance, using
 * the app's own --mana-* tokens rather than raw palette classes.
 */
function identityBorder(card: GameCard): string {
  const colors = card.color_identity?.length ? card.color_identity : (card.colors ?? []);
  if (colors.length > 1) return 'border-mana-multicolor';
  switch (colors[0]) {
    case 'W':
      return 'border-mana-white';
    case 'U':
      return 'border-mana-blue';
    case 'B':
      return 'border-mana-black';
    case 'R':
      return 'border-mana-red';
    case 'G':
      return 'border-mana-green';
    default:
      return 'border-mana-colorless';
  }
}

export const FullCardDisplay = forwardRef<HTMLDivElement, FullCardDisplayProps>(
  ({ card, compact = false, faceDown = false, damages = [], isAttacking, isBlocking }, ref) => {
    const isCreature = card.type_line.includes('Creature');
    const basePower = parseInt(card.power || '0');
    const baseToughness = parseInt(card.toughness || '0');
    const currentPower = basePower + card.powerModifier;
    const currentToughness = baseToughness + card.toughnessModifier - card.damageMarked;
    const isModified =
      card.powerModifier !== 0 || card.toughnessModifier !== 0 || card.damageMarked > 0;

    if (faceDown) {
      return (
        <div
          ref={ref}
          className={cn(
            'relative flex items-center justify-center rounded-md border border-border bg-muted',
            compact ? 'h-28 w-20' : 'h-44 w-32'
          )}
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Face down
          </span>
        </div>
      );
    }

    const cardWidth = compact ? 'w-20' : 'w-32';
    const cardHeight = compact ? 'h-28' : 'h-44';

    return (
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <div
              ref={ref}
              className={cn(
                'group relative flex-shrink-0 cursor-pointer rounded-md border-2 transition-transform duration-300',
                cardWidth,
                cardHeight,
                identityBorder(card),
                // Composed into the class list rather than an inline style — an
                // inline `transform` overrode Tailwind's transform utility, so
                // the hover zoom never fired on any card, tapped or untapped.
                card.isTapped ? 'rotate-90 opacity-75' : 'rotate-0',
                'origin-center hover:z-30 hover:scale-[1.15]',
                card.summoningSick && !card.isTapped && 'border-dashed',
                isAttacking && 'ring-2 ring-destructive ring-offset-2 ring-offset-background',
                isBlocking && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
              )}
            >
              {card.image_uris?.normal ? (
                <img
                  src={card.image_uris.normal}
                  alt={card.name}
                  className="absolute inset-0 h-full w-full rounded-md object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-muted p-2">
                  <div className="line-clamp-5 text-center text-xs font-bold text-foreground">
                    {card.name}
                  </div>
                </div>
              )}

              {card.layout === 'token' && (
                <div className="absolute -left-0.5 -top-0.5 z-10 rounded-br-lg rounded-tl-md bg-foreground px-2 py-0.5 text-[9px] font-black text-background">
                  TOKEN
                </div>
              )}

              {Object.entries(card.counters).length > 0 && !card.layout?.includes('token') && (
                <div className="absolute left-1 top-1 flex max-w-[80%] flex-wrap gap-1">
                  {Object.entries(card.counters).map(([type, count]) => (
                    <div
                      key={type}
                      title={counterTitle(type, count)}
                      className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background"
                    >
                      {counterLabel(type, count)}
                    </div>
                  ))}
                </div>
              )}

              {card.summoningSick && card.zone === 'battlefield' && !card.isTapped && (
                <div
                  className="absolute right-1 top-1 rounded bg-background/90 p-0.5"
                  title="Summoning sickness"
                >
                  <Hourglass className="h-3 w-3 text-foreground" aria-hidden />
                </div>
              )}

              {card.damageMarked > 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-lg font-bold tabular-nums text-destructive-foreground">
                    -{card.damageMarked}
                  </div>
                </div>
              )}

              {isCreature && (
                <div
                  className={cn(
                    'absolute bottom-1 right-1 rounded border px-2 py-1 text-sm font-bold tabular-nums',
                    isModified
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background/95 text-foreground'
                  )}
                >
                  {currentPower}/{currentToughness}
                </div>
              )}

              {card.isTapped && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/50">
                  <div className="rounded bg-background/90 px-2 py-1 text-[10px] font-bold text-foreground">
                    TAPPED
                  </div>
                </div>
              )}

              {/* Real combat state, from the props the parent already passes.
                  The badge this replaces was gated on `group-hover:opacity-100`
                  with no `group` ancestor anywhere, so it never rendered — and
                  it was keyed on "can attack", not "is attacking". */}
              {isAttacking && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <div className="rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold text-destructive-foreground">
                    ATTACKING
                  </div>
                </div>
              )}
              {isBlocking && !isAttacking && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <div className="rounded-full bg-foreground px-2 py-0.5 text-[9px] font-bold text-background">
                    BLOCKING
                  </div>
                </div>
              )}

              {damages.length > 0 && <FloatingDamage cardId={card.instanceId} damages={damages} />}
            </div>
          </TooltipTrigger>

          <TooltipContent side="right" className="max-w-md border-border bg-popover p-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-base font-bold text-popover-foreground">{card.name}</div>
                {card.mana_cost && <ManaCost cost={card.mana_cost} size="sm" />}
              </div>
              <div className="border-t border-border pt-2 text-sm font-semibold">
                {card.type_line}
              </div>
              {card.oracle_text && (
                <div className="max-h-40 overflow-y-auto border-t border-border pt-2 text-sm leading-relaxed">
                  {card.oracle_text}
                </div>
              )}
              {isCreature && (
                <div className="space-y-1 border-t border-border pt-2 text-sm font-semibold">
                  <div>
                    <span className="text-muted-foreground">Power / toughness:</span>{' '}
                    <span className="font-bold tabular-nums">
                      {currentPower}/{currentToughness}
                    </span>
                    {isModified && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (base {basePower}/{baseToughness})
                      </span>
                    )}
                  </div>
                  {card.damageMarked > 0 && (
                    <div className="text-xs font-normal text-destructive">
                      {card.damageMarked} damage marked
                    </div>
                  )}
                  {card.summoningSick && (
                    <div className="text-xs font-normal text-muted-foreground">
                      Summoning sickness
                    </div>
                  )}
                </div>
              )}
              {card.keywords && card.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                  {card.keywords.map(kw => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
              )}
              {Object.entries(card.counters).length > 0 && (
                <div className="border-t border-border pt-2">
                  <div className="mb-1 text-xs text-muted-foreground">Counters</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(card.counters).map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {counterTitle(type, count)}
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
  }
);

FullCardDisplay.displayName = 'FullCardDisplay';
