import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export const SimulationLegend = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Info className="h-4 w-4" />
          Legend
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <Card className="p-4 space-y-4">
          <div>
            <h4 className="font-bold mb-2">Card States</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500/50 border-2 border-yellow-500 rounded" />
                <span>Summoning Sick (can't attack/tap)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-muted border-2 border-muted-foreground rounded opacity-50" />
                <span>Tapped (rotated 90°)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xs">+1</Badge>
                <span>+1/+1 Counters</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-lg">💥</div>
                <span>Damage marked on creature</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-2">Zone Layout</h4>
            <div className="space-y-1 text-sm">
              <div>• <strong>Lands:</strong> Mana sources</div>
              <div>• <strong>Creatures:</strong> Combat & blocking</div>
              <div>• <strong>Artifacts:</strong> Permanents & equipment</div>
              <div>• <strong>Enchantments:</strong> Ongoing effects</div>
              <div>• <strong>Graveyard:</strong> Discarded/destroyed cards</div>
              <div>• <strong>Exile:</strong> Removed from game</div>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-2">Phase Indicators</h4>
            <div className="space-y-1 text-sm">
              <div>• <strong>Blue bar:</strong> Current phase</div>
              <div>• <strong>Pulsing:</strong> Active phase with priority</div>
              <div>• <strong>⚔️ Combat:</strong> Battle phase active</div>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-2">Controls</h4>
            <div className="space-y-1 text-sm">
              <div>• <strong>Play:</strong> Auto-play turns</div>
              <div>• <strong>Step:</strong> Advance one turn manually</div>
              <div>• <strong>Speed:</strong> Adjust playback speed</div>
            </div>
          </div>
        </Card>
      </PopoverContent>
    </Popover>
  );
};
