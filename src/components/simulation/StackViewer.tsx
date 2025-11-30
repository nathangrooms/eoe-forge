import { StackObject } from '@/lib/simulation/types';
import { Card } from '@/components/ui/card';
import { Layers } from 'lucide-react';

interface StackViewerProps {
  stack: StackObject[];
}

export const StackViewer = ({ stack }: StackViewerProps) => {
  if (stack.length === 0) return null;

  return (
    <Card className="p-4 bg-background/95 backdrop-blur-lg border-primary/50 shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-4 w-4 text-primary" />
        <div className="font-bold text-sm">The Stack</div>
      </div>
      <div className="space-y-2 min-w-[200px]">
        {[...stack].reverse().map((obj, index) => (
          <div
            key={obj.id}
            className="p-2 bg-primary/10 border border-primary/30 rounded-lg text-xs"
          >
            <div className="font-semibold text-primary">{obj.card.name}</div>
            <div className="text-muted-foreground text-xs mt-1">
              Controller: {obj.controller}
            </div>
            {index === stack.length - 1 && (
              <div className="mt-1 text-xs text-primary font-bold">← Resolves first</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
