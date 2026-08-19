import { useMemo } from 'react';
import { ChevronRight, Zap, RotateCcw, Crown, Layers, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards';
import { ManaCost } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import {
  availableMana,
  canCast,
  costFor,
  entersTapped,
  isLand,
  producesMana,
  type GoldfishCard,
  type GoldfishState,
} from '@/lib/goldfish/engine';

interface GoldfishTableProps {
  state: GoldfishState;
  onNextTurn: () => void;
  onAutoPlay: () => void;
  onPlayLand: (uid: string) => void;
  onCast: (uid: string, fromCommandZone: boolean) => void;
  onRestart: () => void;
}

/**
 * The solo table.
 *
 * Every card is a real card at a size where its rules text is legible — the
 * previous board drew 80px tiles, which is smaller than the printed name box.
 * Nothing here is a summary of the game state; it *is* the game state: the
 * battlefield holds the permanents that resolved, the hand holds what was drawn,
 * and the mana readout is the sum of untapped sources actually in play.
 */
export function GoldfishTable({
  state,
  onNextTurn,
  onAutoPlay,
  onPlayLand,
  onCast,
  onRestart,
}: GoldfishTableProps) {
  const mana = useMemo(() => availableMana(state), [state]);
  const lands = state.battlefield.filter(isLand);
  const permanents = state.battlefield.filter(c => !isLand(c));
  const commander = state.commandZone[0] ?? null;
  const commanderCastable = commander ? canCast(state, commander, true) : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Turn bar */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex items-baseline gap-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Turn
            </span>
            <span className="text-2xl font-bold tabular-nums text-foreground">{state.turn}</span>
          </div>

          <Stat label="Mana untapped" value={String(mana)} />
          <Stat label="Land drop" value={state.landPlayed ? 'Used' : 'Available'} />
          <Stat label="Hand" value={String(state.hand.length)} />
          <Stat label="Library" value={String(state.library.length)} />
          <Stat
            label="Commander"
            value={state.commanderTurn !== null ? `Cast turn ${state.commanderTurn}` : commander ? 'In zone' : '—'}
          />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRestart}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              New hand
            </Button>
            <Button variant="secondary" size="sm" onClick={onAutoPlay}>
              <Zap className="mr-2 h-4 w-4" aria-hidden="true" />
              Play this turn out
            </Button>
            <Button size="sm" onClick={onNextTurn}>
              Next turn
              <ChevronRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Command zone + battlefield */}
        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Battlefield
            </h3>
            <p className="text-xs text-muted-foreground">
              {lands.length} land{lands.length === 1 ? '' : 's'} · {permanents.length} other permanent
              {permanents.length === 1 ? '' : 's'}
            </p>
          </div>

          {commander && (
            <div className="mt-4">
              <ZoneLabel icon={Crown}>Command zone</ZoneLabel>
              <div className="mt-2 flex flex-wrap items-start gap-4 rounded-lg bg-muted/20 p-3">
                <div className="w-[10rem] shrink-0">
                  <CardImage card={commander.row} size="md" fill eager />
                  <Button
                    size="sm"
                    variant={commanderCastable ? 'default' : 'secondary'}
                    className="mt-2 w-full"
                    disabled={!commanderCastable}
                    onClick={() => onCast(commander.uid, true)}
                  >
                    Cast for {costFor(state, commander, true).total}
                  </Button>
                </div>
                <div className="min-w-[12rem] flex-1 space-y-2 pt-1">
                  <p className="text-sm font-semibold text-foreground">{commander.name}</p>
                  {commander.mana_cost && <ManaCost cost={commander.mana_cost} size="md" />}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {state.commanderCasts > 0
                      ? `Cast ${state.commanderCasts} time${state.commanderCasts === 1 ? '' : 's'}. Commander tax adds ${state.commanderCasts * 2} generic, so it now costs ${costFor(state, commander, true).total}.`
                      : `Costs ${costFor(state, commander, true).total} from the command zone. Each later cast adds two generic.`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {commanderCastable
                      ? 'Castable right now with the mana in play.'
                      : `${mana} mana untapped. Not enough yet.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {state.battlefield.length === 0 ? (
            <p className="mt-4 rounded-lg bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              Nothing in play yet. Play a land, then cast what your mana supports.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {permanents.length > 0 && (
                <div>
                  <ZoneLabel icon={Layers}>Permanents</ZoneLabel>
                  <CardRow cards={permanents} tapped={state.tapped} />
                </div>
              )}
              {lands.length > 0 && (
                <div>
                  <ZoneLabel>Lands</ZoneLabel>
                  <CardRow cards={lands} tapped={state.tapped} compact />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hand */}
        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Hand
            </h3>
            <p className="text-xs text-muted-foreground">
              {state.hand.length} card{state.hand.length === 1 ? '' : 's'} · {mana} mana untapped
            </p>
          </div>

          {state.hand.length === 0 ? (
            <p className="mt-4 rounded-lg bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              Hand is empty.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
              {state.hand.map(card => {
                const land = isLand(card);
                const playable = land ? !state.landPlayed : canCast(state, card, false);
                const cost = land ? null : costFor(state, card, false);
                return (
                  <div key={card.uid} className="rounded-lg bg-muted/15 p-2">
                    <CardImage
                      card={card.row}
                      size="md"
                      fill
                      imageClassName={cn(!playable && 'opacity-45')}
                    />
                    <p className="mt-2 truncate text-xs font-medium text-foreground" title={card.name}>
                      {card.name}
                    </p>
                    <div className="mt-1 flex h-4 items-center">
                      {card.mana_cost ? (
                        <ManaCost cost={card.mana_cost} size="sm" />
                      ) : (
                        <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                          Land
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={playable ? 'default' : 'secondary'}
                      className="mt-1.5 h-7 w-full text-xs"
                      disabled={!playable}
                      onClick={() => (land ? onPlayLand(card.uid) : onCast(card.uid, false))}
                    >
                      {land
                        ? state.landPlayed
                          ? 'Land drop used'
                          : entersTapped(card)
                            ? 'Play (tapped)'
                            : 'Play land'
                        : playable
                          ? `Cast ${cost?.total ?? 0}`
                          : `Needs ${cost?.total ?? 0}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Log rail */}
      <aside className="flex w-full shrink-0 flex-col rounded-xl bg-card shadow-lg shadow-black/20 xl:w-80">
        <div className="p-4 pb-2">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            What happened
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state.log.length} entr{state.log.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          {state.log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            [...state.log].reverse().map((entry, i) => (
              <div key={`${entry.turn}-${i}`} className="rounded-md bg-muted/25 px-3 py-2">
                <span className="mr-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  T{entry.turn}
                </span>
                <span className="text-xs text-foreground">{entry.text}</span>
              </div>
            ))
          )}
        </div>
        <div className="bg-muted/20 p-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
          Mana is counted from untapped sources in play and checked against colour
          requirements. Triggers, targeting and activated abilities are not simulated.
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.7rem] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ZoneLabel({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </p>
  );
}

function CardRow({
  cards,
  tapped,
  compact = false,
}: {
  cards: GoldfishCard[];
  tapped: Set<string>;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-2 grid gap-3',
        compact
          ? 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]'
          : 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]'
      )}
    >
      {cards.map(card => {
        const isTapped = tapped.has(card.uid);
        return (
          <div key={card.uid} className="min-w-0">
            <div className="relative">
              <CardImage
                card={card.row}
                size={compact ? 'sm' : 'md'}
                fill
                imageClassName={cn(isTapped && 'opacity-40')}
              />
              {isTapped && (
                <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-background/85 py-0.5 text-center text-[0.6rem] font-semibold uppercase tracking-wide text-foreground">
                  Tapped
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[0.65rem] text-muted-foreground">
              {card.name}
              {producesMana(card) && !isLand(card) ? ' · mana' : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
