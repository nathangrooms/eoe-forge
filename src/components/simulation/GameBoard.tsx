import { GameState } from '@/lib/simulation/types';
import { DetailedPlayerZone } from './DetailedPlayerZone';
import { StackViewer } from './StackViewer';
import { PhaseProgress } from './PhaseProgress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GameBoardProps {
  state: GameState;
}

export const GameBoard = ({ state }: GameBoardProps) => {
  return (
    <div className="relative h-full w-full flex flex-col bg-gradient-to-b from-background via-background/95 to-background">
      {/* Opponent's zone (top) */}
      <div className="flex-1 border-b-2 border-primary/20 overflow-y-auto">
        <DetailedPlayerZone
          player={state.player2}
          isActive={state.activePlayer === 'player2'}
          hasPriority={state.priorityPlayer === 'player2'}
          orientation="top"
        />
      </div>

      {/* Middle section: Phase info and Stack */}
      <div className="relative flex flex-col items-center gap-2 bg-gradient-to-r from-primary/5 via-accent/5 to-secondary/5 py-4 border-y border-border">
        {/* Turn and active player */}
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-xl px-5 py-2 bg-background/80 backdrop-blur font-bold">
            Turn {state.turn}
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {state.activePlayer === 'player1' ? state.player1.name : state.player2.name}'s Turn
          </Badge>
          <Badge className="text-lg px-4 py-2 bg-primary/20 border-primary">
            {state.phase.replace(/_/g, ' ').toUpperCase()}
          </Badge>
        </div>

        {/* Phase progress bar */}
        <PhaseProgress 
          currentPhase={state.phase} 
          activePlayer={state.activePlayer === 'player1' ? state.player1.name : state.player2.name}
        />

        {/* Stack viewer */}
        {state.stack.length > 0 && (
          <div className="absolute right-4 top-4">
            <StackViewer stack={state.stack} />
          </div>
        )}

        {/* Combat indicator */}
        {state.combat.isActive && (
          <div className="absolute left-4 top-4">
            <Badge variant="destructive" className="text-xl px-6 py-3 animate-pulse font-bold shadow-lg">
              ⚔️ COMBAT PHASE
            </Badge>
          </div>
        )}
      </div>

      {/* Player's zone (bottom) */}
      <div className="flex-1 border-t-2 border-primary/20 overflow-y-auto">
        <DetailedPlayerZone
          player={state.player1}
          isActive={state.activePlayer === 'player1'}
          hasPriority={state.priorityPlayer === 'player1'}
          orientation="bottom"
        />
      </div>

      {/* Game over overlay */}
      {state.gameOver && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-md flex items-center justify-center z-50">
          <div className="text-center space-y-6 p-8">
            <div className="text-7xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent animate-pulse">
              {state[state.winner!].name} Wins!
            </div>
            <div className="text-3xl text-muted-foreground">
              Turn {state.turn}
            </div>
            <div className="flex gap-12 justify-center text-2xl">
              <div className="text-center">
                <div className="text-muted-foreground mb-2">{state.player1.name}</div>
                <div className={cn(
                  "text-4xl font-bold",
                  state.winner === 'player1' ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {state.player1.life} ❤️
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground mb-2">{state.player2.name}</div>
                <div className={cn(
                  "text-4xl font-bold",
                  state.winner === 'player2' ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {state.player2.life} ❤️
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
