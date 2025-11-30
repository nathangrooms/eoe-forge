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
    <div className="relative h-full w-full flex flex-col bg-[#0a0a0f]">
      {/* Opponent Zone - Top */}
      <div className="h-[35%] border-b border-primary/20 p-3 overflow-hidden">
        <DetailedPlayerZone
          player={state.player2}
          isActive={state.activePlayer === 'player2'}
          hasPriority={state.priorityPlayer === 'player2'}
          orientation="top"
        />
      </div>

      {/* Center Battle Info */}
      <div className="h-[90px] bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border-y border-primary/30 flex items-center justify-between px-6 relative z-10">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-xl px-4 py-2 bg-background/90 backdrop-blur font-bold">
            Turn {state.turn}
          </Badge>
          <Badge className="text-base px-4 py-1.5 bg-primary/30 font-semibold">
            {state.phase.replace(/_/g, ' ').toUpperCase()}
          </Badge>
          {state.combat.isActive && (
            <Badge variant="destructive" className="text-lg px-4 py-2 animate-pulse font-bold">
              ⚔️ COMBAT
            </Badge>
          )}
        </div>

        <div className="flex-1 mx-8">
          <PhaseProgress
            currentPhase={state.phase}
            activePlayer={state.activePlayer === 'player1' ? state.player1.name : state.player2.name}
          />
        </div>

        <Badge variant="secondary" className="text-lg px-4 py-2 font-bold">
          {state.activePlayer === 'player1' ? state.player1.name : state.player2.name}'s Turn
        </Badge>

        {state.stack.length > 0 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <StackViewer stack={state.stack} />
          </div>
        )}
      </div>

      {/* Player Zone - Bottom */}
      <div className="flex-1 p-3 overflow-hidden">
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
