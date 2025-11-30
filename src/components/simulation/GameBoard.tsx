import { GameState } from '@/lib/simulation/types';
import { PlayerZone } from './PlayerZone';
import { StackViewer } from './StackViewer';

interface GameBoardProps {
  state: GameState;
}

export const GameBoard = ({ state }: GameBoardProps) => {
  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Opponent's zone (top) */}
      <div className="flex-1 border-b border-border/50">
        <PlayerZone
          player={state.player2}
          isActive={state.activePlayer === 'player2'}
          hasPriority={state.priorityPlayer === 'player2'}
          orientation="top"
        />
      </div>

      {/* Middle section: Stack and battlefield */}
      <div className="flex-1 flex items-center justify-center bg-background/50 backdrop-blur-sm">
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Stack viewer */}
          {state.stack.length > 0 && (
            <div className="absolute top-4 right-4">
              <StackViewer stack={state.stack} />
            </div>
          )}

          {/* Phase indicator */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary/10 border border-primary/20 rounded-full px-6 py-2">
            <div className="text-sm font-semibold text-primary">
              Turn {state.turn} • {state.phase.replace(/_/g, ' ').toUpperCase()}
            </div>
          </div>

          {/* Combat indicator */}
          {state.combat.isActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-6xl font-bold text-destructive/20 animate-pulse">
                ⚔️ COMBAT
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {state.gameOver && (
            <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-10">
              <div className="text-center space-y-4">
                <div className="text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  {state[state.winner!].name} Wins!
                </div>
                <div className="text-2xl text-muted-foreground">
                  Turn {state.turn}
                </div>
                <div className="flex gap-8 justify-center text-xl">
                  <div>
                    <div className="text-muted-foreground">Player 1</div>
                    <div className={state.winner === 'player1' ? 'text-primary font-bold' : ''}>
                      {state.player1.life} life
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Player 2</div>
                    <div className={state.winner === 'player2' ? 'text-primary font-bold' : ''}>
                      {state.player2.life} life
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player's zone (bottom) */}
      <div className="flex-1 border-t border-border/50">
        <PlayerZone
          player={state.player1}
          isActive={state.activePlayer === 'player1'}
          hasPriority={state.priorityPlayer === 'player1'}
          orientation="bottom"
        />
      </div>
    </div>
  );
};
