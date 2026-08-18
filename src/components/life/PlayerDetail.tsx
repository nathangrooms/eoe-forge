/**
 * DeckMatrix — life counter: one player's detail sheet.
 *
 * Opened by swiping a panel or tapping its name. It fills the screen and is
 * rotated to the seat that opened it, so the player who swiped reads it the
 * right way up — the same trick the panels use, applied to the whole viewport.
 *
 * The commander damage grid is the part that has to be right. Twenty-one is per
 * *commander*, never per opponent, so each source gets its own row and the
 * tallies are never added together. A partner pair is two rows that each need
 * their own 21 — which is why every seat carries a second damage bucket that
 * stays hidden until it is either switched on or has damage on it.
 */

import { useEffect, useRef, useState } from 'react';
import { Biohazard, Crown, Flag, Undo2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ColorIdentity } from '@/components/ui/mana-cost';
import {
  lossReasonLabel,
  seatContentStyle,
  type GameState,
  type Player,
  type PlayerId,
  type Seat,
} from '@/lib/game';

import { StepButton, Stepper } from './Stepper';
import { TRACKED_COUNTERS } from './counters';
import { isPartnerCommander } from './session';
import type { PendingTarget, PlayerView } from './useLifeGame';

export interface PlayerDetailProps {
  player: Player;
  seat: Seat;
  state: GameState;
  view: PlayerView;
  partners: Record<PlayerId, boolean>;
  onNudge: (target: PendingTarget, delta: number) => void;
  onRename: (name: string) => void;
  onConcede: () => void;
  onSetPartner: (playerId: PlayerId, enabled: boolean) => void;
  onUndo: () => void;
  onClose: () => void;
}

interface DamageRow {
  commanderId: string;
  sourceName: string;
  colors: string[];
  isPartner: boolean;
}

export function PlayerDetail({
  player,
  seat,
  state,
  view,
  partners,
  onNudge,
  onRename,
  onConcede,
  onSetPartner,
  onUndo,
  onClose,
}: PlayerDetailProps) {
  const [name, setName] = useState(player.name);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setName(player.name), [player.name]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === player.name) {
      setName(player.name);
      return;
    }
    onRename(trimmed);
  };

  const rules = state.rules;
  const alive = !player.hasLost;
  const running = state.status === 'playing';

  /**
   * One row per opposing commander. A partner bucket appears when its owner has
   * switched partners on — or whenever it already carries damage, so a tally can
   * never be hidden from the player it is about to kill.
   */
  const damageRows: DamageRow[] = [];
  for (const opponent of state.players) {
    if (opponent.id === player.id) continue;
    opponent.commanders.forEach(commander => {
      const partner = isPartnerCommander(commander.id);
      const tally = view.commanderDamage[commander.id] ?? 0;
      // A partner bucket with damage on it always shows, even when the switch is
      // off — a hidden row could otherwise be sitting on lethal.
      if (partner && !partners[opponent.id] && tally === 0) return;
      damageRows.push({
        commanderId: commander.id,
        sourceName: opponent.name,
        colors: (commander.colorIdentity ?? []) as string[],
        isPartner: partner,
      });
    });
  }

  const lifeTarget: PendingTarget = { kind: 'life', playerId: player.id };
  const colors = (player.commanders[0]?.colorIdentity ?? []) as string[];

  return (
    <div
      className="fixed inset-0 z-50 bg-background"
      style={{ containerType: 'size' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} details`}
    >
      <div
        style={{ ...seatContentStyle(seat), overflowY: 'auto', touchAction: 'manipulation' }}
        className="overscroll-contain"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 p-3 pb-8">
          {/* Identity */}
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              onBlur={commitName}
              onKeyDown={event => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
              aria-label="Player name"
              maxLength={24}
              className="h-12 flex-1 border-0 bg-muted text-lg font-semibold"
            />
            {colors.length > 0 && (
              <div className="shrink-0 rounded-xl bg-muted/40 px-2 py-2">
                <ColorIdentity colors={colors} size="md" />
              </div>
            )}
            <Button
              ref={closeRef}
              variant="secondary"
              size="icon"
              className="h-12 w-12 shrink-0"
              onClick={onClose}
              aria-label="Close details"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Life */}
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-3">
            <div className="flex items-center gap-2">
              <StepButton
                direction={-1}
                label="Lose 1 life"
                disabled={!running || !alive}
                onStep={delta => onNudge(lifeTarget, delta)}
              />
              <Button
                variant="secondary"
                className="h-11 w-11 p-0 text-sm font-semibold"
                disabled={!running || !alive}
                onClick={() => onNudge(lifeTarget, -5)}
              >
                −5
              </Button>
            </div>

            <div className="text-center leading-none">
              <div className="text-5xl font-semibold tabular-nums">{view.life}</div>
              {view.lifeDelta !== 0 && (
                <div className="mt-1 text-sm font-medium tabular-nums text-muted-foreground">
                  {view.lifeDelta > 0 ? `+${view.lifeDelta}` : view.lifeDelta}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="h-11 w-11 p-0 text-sm font-semibold"
                disabled={!running || !alive}
                onClick={() => onNudge(lifeTarget, 5)}
              >
                +5
              </Button>
              <StepButton
                direction={1}
                label="Gain 1 life"
                disabled={!running || !alive}
                onStep={delta => onNudge(lifeTarget, delta)}
              />
            </div>
          </div>

          {!alive && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-destructive">Eliminated</div>
                <div className="truncate text-xs text-muted-foreground">
                  {player.lossReasons.map(lossReasonLabel).join(' · ') || 'Out of the game'}
                </div>
              </div>
              <Button variant="secondary" className="shrink-0" onClick={onUndo}>
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
            </div>
          )}

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))]">
            {/* Commander damage */}
            {rules.usesCommanderDamage && (
              <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
                <header className="flex flex-col gap-0.5 px-1">
                  <div className="flex items-center gap-2">
                    <Crown aria-hidden className="h-4 w-4 text-type-commander" />
                    <h2 className="text-sm font-semibold">Commander damage</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lethal at {rules.commanderDamageLethal} from a single commander — partners each
                    need their own. Adding damage here also removes that much life.
                  </p>
                </header>

                {damageRows.length === 0 && (
                  <p className="px-1 pb-1 text-sm text-muted-foreground">No opponents at the table.</p>
                )}

                {damageRows.map(row => (
                  <Stepper
                    key={row.commanderId}
                    label={row.isPartner ? `${row.sourceName} · partner` : row.sourceName}
                    value={view.commanderDamage[row.commanderId] ?? 0}
                    delta={view.commanderDelta[row.commanderId] ?? 0}
                    lethal={rules.commanderDamageLethal}
                    tone="text-type-commander"
                    hint={row.colors.length > 0 ? <ColorIdentity colors={row.colors} size="xs" /> : undefined}
                    disabled={!running || !alive}
                    onStep={delta =>
                      onNudge(
                        { kind: 'commander', playerId: player.id, commanderId: row.commanderId },
                        delta,
                      )
                    }
                  />
                ))}
              </section>
            )}

            {/* Poison and counters */}
            <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
              <header className="flex items-center gap-2 px-1">
                <Biohazard aria-hidden className="h-4 w-4 text-mana-green" />
                <h2 className="text-sm font-semibold">Counters</h2>
              </header>

              <Stepper
                label="Poison"
                value={view.poison}
                delta={view.poisonDelta}
                lethal={rules.poisonLethal}
                icon={Biohazard}
                tone="text-mana-green"
                disabled={!running || !alive}
                onStep={delta => onNudge({ kind: 'poison', playerId: player.id }, delta)}
              />

              {TRACKED_COUNTERS.map(counter => (
                <Stepper
                  key={counter.key}
                  label={counter.label}
                  value={view.counters[counter.key] ?? 0}
                  delta={view.counterDelta[counter.key] ?? 0}
                  icon={counter.icon}
                  hint={counter.description}
                  disabled={!running || !alive}
                  onStep={delta =>
                    onNudge({ kind: 'counter', playerId: player.id, counter: counter.key }, delta)
                  }
                />
              ))}
            </section>
          </div>

          {/* Table settings for this seat */}
          <div className="flex flex-col gap-2 rounded-2xl bg-card p-3">
            {rules.usesCommanderDamage && (
              <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Partner commander</span>
                  <span className="block text-xs text-muted-foreground">
                    Adds a second damage row for {player.name} on every opponent's sheet
                  </span>
                </span>
                <Switch
                  checked={!!partners[player.id]}
                  onCheckedChange={checked => onSetPartner(player.id, checked)}
                  aria-label="Partner commander"
                />
              </label>
            )}

            {alive && running && (
              <Button
                variant="ghost"
                className={cn('h-11 justify-start text-destructive hover:bg-destructive/10 hover:text-destructive')}
                onClick={onConcede}
              >
                <Flag className="h-4 w-4" />
                Concede
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
