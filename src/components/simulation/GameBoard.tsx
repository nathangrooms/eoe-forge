import { GameState } from '@/lib/simulation/types';
import { DetailedPlayerZone } from './DetailedPlayerZone';
import { StackViewer } from './StackViewer';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GameBoardProps {
  state: GameState;
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
}

export const GameBoard = ({ state, onRegisterCard }: GameBoardProps) => {
  return (
    <div className="relative flex-1 w-full flex flex-col bg-[#0a0a0f]">
      {/* Top status bar: both players + turn */}
      <div className="h-11 border-b border-primary/20 bg-gradient-to-r from-primary/10 via-background to-primary/10 flex items-stretch px-3 gap-3 text-[11px]">
        {/* Opponent summary */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <Badge variant="outline" className="px-2 py-0.5 font-semibold bg-background/80 leading-none">
            OPPONENT
          </Badge>
          <div className="flex flex-col text-muted-foreground leading-tight">
            <span className="font-semibold text-foreground truncate max-w-[160px]">
              {state.player2.name}
            </span>
            <span className="flex items-center gap-1 mt-0.5">
              <span>❤️ {state.player2.life}</span>
              <span>📚 {state.player2.library.length}</span>
              <span>✋ {state.player2.hand.length}</span>
            </span>
          </div>
        </div>

        {/* Center: compact turn pill; detailed tracker lives in Game Log */}
        <div className="flex-1 flex items-center justify-center pointer-events-none">
          <div className="inline-flex items-center gap-2 rounded-full bg-background/90 backdrop-blur px-3 py-1 border border-border/60 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Turn {state.turn}
            </span>
            <span className="h-4 w-px bg-border/60" />
            <span className="text-[10px] font-medium text-muted-foreground">
              {state.phase.replace(/_/g, ' ').toUpperCase()}
            </span>
            {state.combat.isActive && (
              <span className="ml-1 text-[10px] font-bold text-destructive flex items-center gap-1">
                <span className="animate-pulse">⚔️</span>
                COMBAT
              </span>
            )}
          </div>

          {state.stack.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-auto">
              <StackViewer stack={state.stack} />
            </div>
          )}
        </div>

        {/* You summary */}
        <div className="flex items-center gap-2 min-w-[200px] justify-end">
          <div className="flex flex-col text-muted-foreground text-right leading-tight">
            <span className="font-semibold text-foreground truncate max-w-[160px]">
              {state.player1.name}
            </span>
            <span className="flex items-center gap-1 mt-0.5 justify-end">
              <span>❤️ {state.player1.life}</span>
              <span>📚 {state.player1.library.length}</span>
              <span>✋ {state.player1.hand.length}</span>
            </span>
          </div>
          <Badge
            variant={state.activePlayer === 'player1' ? 'secondary' : 'outline'}
            className={cn(
              'px-2 py-0.5 font-semibold leading-none',
              state.activePlayer === 'player1'
                ? 'bg-primary/80 text-primary-foreground shadow-sm'
                : 'bg-background/80'
            )}
          >
            {state.activePlayer === 'player1' ? 'YOUR TURN' : "OPPONENT'S TURN"}
          </Badge>
        </div>
      </div>

      {/* Main board: two columns, each scrollable */}
      <div className="flex-1 grid grid-cols-2 gap-2 p-2 overflow-hidden">
        <div className="h-full overflow-auto border-r border-primary/15 pr-1">
          <DetailedPlayerZone
            player={state.player2}
            isActive={state.activePlayer === 'player2'}
            hasPriority={state.priorityPlayer === 'player2'}
            orientation="top"
            onRegisterCard={onRegisterCard}
          />
        </div>

        <div className="h-full overflow-auto pl-1">
          <DetailedPlayerZone
            player={state.player1}
            isActive={state.activePlayer === 'player1'}
            hasPriority={state.priorityPlayer === 'player1'}
            orientation="bottom"
            onRegisterCard={onRegisterCard}
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
