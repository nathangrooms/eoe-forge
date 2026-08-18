import { StackObject } from '@/lib/simulation/types';
import { Card } from '@/components/ui/card';
import { Layers } from 'lucide-react';

interface StackViewerProps {
  stack: StackObject[];
}

export const StackViewer = ({ stack }: StackViewerProps) => {
  if (stack.length === 0) return null;

  return (
    <Card className="bg-popover p-4 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-bold text-popover-foreground">The stack</div>
      </div>
      <div className="space-y-2 min-w-[200px]">
        {[...stack].reverse().map((obj, index) => (
          <div
            key={obj.id}
            className="rounded-lg bg-muted/30 p-2 text-xs"
          >
            <div className="font-semibold text-popover-foreground">{obj.card.name}</div>
            <div className="text-muted-foreground text-xs mt-1">
              Controller: {obj.controller}
            </div>
            {index === 0 && (
              <div className="mt-1 text-xs font-bold text-popover-foreground">
                Resolves first
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
