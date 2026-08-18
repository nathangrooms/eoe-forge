import { GameState, Player } from '@/lib/simulation/types';
import { DetailedPlayerZone } from './DetailedPlayerZone';
import { StackViewer } from './StackViewer';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Heart, Layers, Hand, Swords } from 'lucide-react';

interface GameBoardProps {
  state: GameState;
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
  damages: Map<string, Array<{ id: string; amount: number; timestamp: number }>>;
}

const COMMANDER_LETHAL = 21;

/**
 * Commander damage taken by `player` from the opposing commander.
 *
 * `commanderDamage` is keyed by the *source* player id and stored on the
 * defender (combatSystem.ts:67-70). The engine has always tracked this and ends
 * games on it (turnEngine.ts:155-170), but no UI ever displayed the clock.
 */
function commanderDamageTaken(player: Player, fromPlayerId: 'player1' | 'player2'): number {
  return player.commanderDamage?.[fromPlayerId] ?? 0;
}

function PlayerSummary({
  player,
  opponent,
  opponentId,
  align,
}: {
  player: Player;
  opponent: Player;
  opponentId: 'player1' | 'player2';
  align: 'left' | 'right';
}) {
  const cmdDamage = commanderDamageTaken(player, opponentId);
  const commanderTax = player.commanderCastCount * 2;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col leading-tight text-muted-foreground',
        align === 'right' && 'items-end text-right'
      )}
    >
      <span className="max-w-[160px] truncate font-semibold text-foreground">{player.name}</span>
      <span
        className={cn(
          'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5',
          align === 'right' && 'justify-end'
        )}
      >
        <span className="inline-flex items-center gap-0.5 tabular-nums" title="Life total">
          <Heart className="h-3 w-3" aria-hidden />
          {player.life}
        </span>
        <span className="inline-flex items-center gap-0.5 tabular-nums" title="Cards in library">
          <Layers className="h-3 w-3" aria-hidden />
          {player.library.length}
        </span>
        <span className="inline-flex items-center gap-0.5 tabular-nums" title="Cards in hand">
          <Hand className="h-3 w-3" aria-hidden />
          {player.hand.length}
        </span>
        {cmdDamage > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 tabular-nums',
              cmdDamage >= COMMANDER_LETHAL ? 'font-semibold text-destructive' : 'text-foreground'
            )}
            title={`Commander damage from ${opponent.name}`}
          >
            <Swords className="h-3 w-3" aria-hidden />
            {cmdDamage}/{COMMANDER_LETHAL}
          </span>
        )}
        {commanderTax > 0 && (
          <span className="tabular-nums" title="Commander tax on the next cast">
            tax +{commanderTax}
          </span>
        )}
      </span>
    </div>
  );
}

export const GameBoard = ({ state, onRegisterCard, damages }: GameBoardProps) => {
  return (
    <div className="relative flex w-full flex-1 flex-col bg-background">
      {/* Top status bar: both players + turn */}
      <div className="flex min-h-14 shrink-0 items-stretch gap-3 bg-card px-3 py-2 text-[11px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[200px] sm:flex-none">
          <Badge
            variant="outline"
            className="hidden px-2 py-0.5 font-semibold leading-none sm:inline-flex"
          >
            Opponent
          </Badge>
          <PlayerSummary
            player={state.player2}
            opponent={state.player1}
            opponentId="player1"
            align="left"
          />
        </div>

        <div className="pointer-events-none hidden flex-1 items-center justify-center md:flex">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              Turn {state.turn}
            </span>
            <span className="h-3 w-1 rounded-full bg-muted-foreground/40" />
            <span className="text-[10px] font-medium text-muted-foreground">
              {state.phase.replace(/_/g, ' ').toUpperCase()}
            </span>
            {state.combat.isActive && (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-destructive">
                <Swords className="h-3 w-3" aria-hidden />
                COMBAT
              </span>
            )}
          </div>

          {state.stack.length > 0 && (
            <div className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2">
              <StackViewer stack={state.stack} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:min-w-[200px] sm:flex-none">
          <PlayerSummary
            player={state.player1}
            opponent={state.player2}
            opponentId="player2"
            align="right"
          />
          <Badge
            variant={state.activePlayer === 'player1' ? 'default' : 'outline'}
            className="hidden whitespace-nowrap px-2 py-0.5 font-semibold leading-none sm:inline-flex"
          >
            {state.activePlayer === 'player1' ? 'Your turn' : "Opponent's turn"}
          </Badge>
        </div>
      </div>

      {/* Opponent above, you below — the arrangement every MTG client uses. */}
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-2 overflow-hidden p-2">
        <div className="min-h-0 overflow-auto">
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

        <div className="min-h-0 overflow-auto">
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="space-y-6 p-8 text-center">
            <div className="text-4xl font-bold text-foreground md:text-6xl">
              {state[state.winner!].name} wins
            </div>
            <div className="text-xl text-muted-foreground">Turn {state.turn}</div>
            <div className="flex justify-center gap-12">
              {[state.player1, state.player2].map(p => (
                <div key={p.id} className="text-center">
                  <div className="mb-2 text-sm text-muted-foreground">{p.name}</div>
                  <div
                    className={cn(
                      'inline-flex items-center gap-1 text-3xl font-bold tabular-nums',
                      state.winner === p.id ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <Heart className="h-6 w-6" aria-hidden />
                    {p.life}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
