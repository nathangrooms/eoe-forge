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

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/**
 * These controls live inside a ~360px sidebar. The previous single unwrapped
 * flex row of full-width labelled buttons had roughly 700-750px of intrinsic
 * width, so most of it was clipped. The transport row now wraps and drops to
 * icon-only buttons; speed sits on its own line.
 */
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isPlaying ? (
          <Button onClick={onPlay} disabled={isComplete} size="sm" className="flex-1">
            <Play className="mr-2 h-4 w-4" />
            Play
          </Button>
        ) : (
          <Button onClick={onPause} size="sm" variant="secondary" className="flex-1">
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
        )}

        <Button
          onClick={onStep}
          disabled={isPlaying || isComplete}
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Step one action or phase"
          aria-label="Step one action or phase"
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <Button
          onClick={onRestart}
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Restart the simulation"
          aria-label="Restart the simulation"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        <SimulationLegend />

        <Button
          onClick={onExport}
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!isComplete}
          title={isComplete ? 'Export results as JSON' : 'Available when the game finishes'}
          aria-label="Export results as JSON"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Speed</span>
        {SPEEDS.map(s => (
          <Button
            key={s}
            size="sm"
            variant={speed === s ? 'default' : 'outline'}
            onClick={() => onSpeedChange(s)}
            className="h-7 min-w-[2.25rem] px-1.5 text-xs"
            aria-pressed={speed === s}
          >
            {s}x
          </Button>
        ))}
      </div>
    </div>
  );
};
