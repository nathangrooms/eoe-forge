import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Undo2, Redo2 } from 'lucide-react';
import { DeckHistoryManager, setupUndoRedoShortcuts } from '@/lib/deckbuilder/undo-redo';

interface UndoRedoControlsProps {
  historyManager: DeckHistoryManager;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedoControls({ historyManager, onUndo, onRedo }: UndoRedoControlsProps) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoDescription, setUndoDescription] = useState<string | null>(null);
  const [redoDescription, setRedoDescription] = useState<string | null>(null);

  useEffect(() => {
    // Update button states
    const updateStates = () => {
      setCanUndo(historyManager.canUndo());
      setCanRedo(historyManager.canRedo());
      setUndoDescription(historyManager.getUndoDescription());
      setRedoDescription(historyManager.getRedoDescription());
    };

    updateStates();

    // Set up keyboard shortcuts
    const cleanup = setupUndoRedoShortcuts(
      () => {
        if (historyManager.canUndo()) {
          onUndo();
          updateStates();
        }
      },
      () => {
        if (historyManager.canRedo()) {
          onRedo();
          updateStates();
        }
      }
    );

    return cleanup;
  }, [historyManager, onUndo, onRedo]);

  const handleUndo = () => {
    onUndo();
    setCanUndo(historyManager.canUndo());
    setCanRedo(historyManager.canRedo());
    setUndoDescription(historyManager.getUndoDescription());
    setRedoDescription(historyManager.getRedoDescription());
  };

  const handleRedo = () => {
    onRedo();
    setCanUndo(historyManager.canUndo());
    setCanRedo(historyManager.canRedo());
    setUndoDescription(historyManager.getUndoDescription());
    setRedoDescription(historyManager.getRedoDescription());
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={!canUndo}
              className="gap-1"
            >
              <Undo2 className="h-4 w-4" />
              <span className="hidden sm:inline">Undo</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{undoDescription || 'No actions to undo'}</p>
            <p className="text-xs text-muted-foreground">Ctrl+Z / ⌘Z</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRedo}
              disabled={!canRedo}
              className="gap-1"
            >
              <Redo2 className="h-4 w-4" />
              <span className="hidden sm:inline">Redo</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{redoDescription || 'No actions to redo'}</p>
            <p className="text-xs text-muted-foreground">Ctrl+Shift+Z / ⌘⇧Z or Ctrl+Y / ⌘Y</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
