import { Button } from '@/components/ui/button';
import { Play, Pause, SkipForward, RotateCcw, Download } from 'lucide-react';

interface SimulationControlsProps {
  isPlaying: boolean;
  isComplete: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onRestart: () => void;
  onExport: () => void;
}

export const SimulationControls = ({
  isPlaying,
  isComplete,
  onPlay,
  onPause,
  onStep,
  onRestart,
  onExport,
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

      <div className="flex-1" />

      <Button onClick={onExport} variant="outline">
        <Download className="h-4 w-4 mr-2" />
        Export Results
      </Button>
    </div>
  );
};
