import { Button } from '@/components/ui/button';
import { Play, Pause, SkipForward, RotateCcw, Download } from 'lucide-react';
import { SimulationLegend } from './SimulationLegend';

interface SimulationControlsProps {
  isPlaying: boolean;
  isComplete: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onRestart: () => void;
  onExport: () => void;
  onSpeedChange: (speed: number) => void;
}

export const SimulationControls = ({
  isPlaying,
  isComplete,
  speed,
  onPlay,
  onPause,
  onStep,
  onRestart,
  onExport,
  onSpeedChange,
}: SimulationControlsProps) => {
  return (
    <div className="flex items-center gap-2 p-4 bg-background border-t border-border">
      {!isPlaying ? (
        <Button onClick={onPlay} disabled={isComplete} size="lg">
          <Play className="h-4 w-4 mr-2" />
          Play
        </Button>
      ) : (
        <Button onClick={onPause} size="lg" variant="secondary">
          <Pause className="h-4 w-4 mr-2" />
          Pause
        </Button>
      )}

      <Button onClick={onStep} disabled={isPlaying || isComplete} variant="outline">
        <SkipForward className="h-4 w-4 mr-2" />
        Step
      </Button>

      <Button onClick={onRestart} variant="outline">
        <RotateCcw className="h-4 w-4 mr-2" />
        Restart
      </Button>

      {/* Speed control */}
      <div className="flex items-center gap-2 ml-4">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Speed:</span>
        <div className="flex gap-1">
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={speed === s ? "default" : "outline"}
              onClick={() => onSpeedChange(s)}
              className="w-10 text-xs px-2"
            >
              {s}x
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <SimulationLegend />

      <Button onClick={onExport} variant="outline" disabled={!isComplete}>
        <Download className="h-4 w-4 mr-2" />
        Export Results
      </Button>
    </div>
  );
};
