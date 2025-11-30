import { GameState } from '@/lib/simulation/types';
import { DetailedPlayerZone } from './DetailedPlayerZone';
import { StackViewer } from './StackViewer';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GameBoardProps {
  state: GameState;
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
  damages: Map<string, Array<{ id: string; amount: number; timestamp: number }>>;
}

export const GameBoard = ({ state, onRegisterCard, damages }: GameBoardProps) => {
  return (
    <div className="relative flex-1 w-full flex flex-col bg-[#0a0a0f]">
      {/* Main board: two columns, each scrollable */}
      <div className="flex-1 grid grid-cols-2 gap-2 p-2 overflow-hidden">
        <div className="h-full overflow-auto border-r border-primary/15 pr-1">
          <DetailedPlayerZone
            player={state.player2}
            isActive={state.activePlayer === 'player2'}
            hasPriority={state.priorityPlayer === 'player2'}
            orientation="top"
            onRegisterCard={onRegisterCard}
            damages={damages}
            attackers={state.combat.attackers}
            blockers={state.combat.blockers}
          />
        </div>

        <div className="h-full overflow-auto pl-1">
          <DetailedPlayerZone
            player={state.player1}
            isActive={state.activePlayer === 'player1'}
            hasPriority={state.priorityPlayer === 'player1'}
            orientation="bottom"
            onRegisterCard={onRegisterCard}
            damages={damages}
            attackers={state.combat.attackers}
            blockers={state.combat.blockers}
          />
        </div>
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
