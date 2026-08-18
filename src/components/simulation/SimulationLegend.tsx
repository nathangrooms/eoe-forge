import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

/**
 * Every statement here is checked against what the code actually does. The
 * previous legend described a "blue bar" for the current phase (the bar has
 * never been blue), and said Step advances a whole turn (it advances one action
 * or phase).
 */
export const SimulationLegend = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Legend"
          aria-label="Legend"
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4" align="end">
        <section>
          <h4 className="mb-2 text-sm font-bold text-foreground">Card states</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 rounded border-2 border-dashed border-foreground" />
              Summoning sick — cannot attack or tap
            </li>
            <li className="flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 rotate-90 rounded border-2 border-border bg-muted" />
              Tapped — rotated 90°
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0 text-xs">
                +1/+1
              </Badge>
              Counters, labelled by type and sign
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground">
                -3
              </span>
              Damage marked this turn
            </li>
            <li>Card border colour is the card&apos;s colour identity.</li>
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-bold text-foreground">Combat</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>A red outline plus an ATTACKING tag marks declared attackers.</li>
            <li>A neutral outline plus a BLOCKING tag marks declared blockers.</li>
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-bold text-foreground">Phase tracker</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>A solid bar marks the current phase; dimmed bars are already past.</li>
            <li>The zone with a solid outline is the player who currently has priority.</li>
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-bold text-foreground">Controls</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>Play — run the game automatically.</li>
            <li>Step — advance a single action or phase.</li>
            <li>Speed — 0.25x to 4x playback.</li>
            <li>Export — download the finished game as JSON.</li>
          </ul>
        </section>
      </PopoverContent>
    </Popover>
  );
};
