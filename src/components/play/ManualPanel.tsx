/**
 * The half of Magic this engine does not run, made doable in one tap.
 *
 * Measured, and it is not a footnote: the compiled-ability bridge owns 906
 * cards, about 2.7% of the catalogue. The other 97% are correctly marked as
 * needing a human. That split is deliberate and right, because a wrong ability
 * corrupts a game while a missing one just needs a player. It only works if the
 * player is TOLD and can act, and until now neither happened —
 * `manualControlsFor` in `src/lib/game/manual.ts` computed the entire menu,
 * fully tested, and no component had ever called it.
 *
 * Owner, twice: *"why do card effects not do anything or work, are we able to
 * get logic working or allow manual intervention like marking cards which fly,
 * have lifesteal, trample, also if they have +1 counters, need easy way to add
 * these"*, and *"I also have an artifact in play, which says at beginning of my
 * upkeep I can place a charge counter (Aether Vial) — no way to do this."*
 *
 * Every button here dispatches `GameAction`s built by `manual.ts`, so a
 * hand-placed charge counter goes down the identical path as an engine-placed
 * one: validated, logged, undoable, and broadcastable to a networked table.
 * Nothing in this file knows a rule.
 *
 * ## Why it curates
 *
 * `manualControlsFor` returns everything that is legal — eleven counter kinds
 * with an add and a remove each, four stat nudges, every flaggable keyword,
 * five destination zones. Rendered flat that is well over sixty buttons on one
 * card, which is a worse answer than none: the player stops reading. So the
 * first row is the two or three things that card actually wants (loyalty on a
 * planeswalker, +1/+1 on a creature, charge on an artifact), counters the card
 * already carries are always shown so they can be taken off again, and the long
 * tails open only when asked for.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  automationFor,
  manualControlsFor,
  type CardInstance,
  type GameAction,
  type GameState,
  type ManualControl,
} from '@/lib/game';

export interface ManualPanelProps {
  state: GameState;
  card: CardInstance;
  /** Every control ends here. The page holds the reducer. */
  onDispatch: (actions: GameAction[]) => void;
  className?: string;
}

/** How many counter kinds are offered before the player asks for the rest. */
const COUNTER_HEADLINE = 3;

function Chip({
  label,
  count,
  tone = 'quiet',
  title,
  onClick,
}: {
  label: string;
  count?: number;
  tone?: 'quiet' | 'active';
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'active'
          ? 'bg-foreground text-background hover:bg-foreground/90'
          : 'bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.16]'
      )}
    >
      <span>{label}</span>
      {count !== undefined && count !== 0 && (
        <span className="rounded-sm bg-background/25 px-1 text-[10px] leading-4">{count}</span>
      )}
    </button>
  );
}

export function ManualPanel({ state, card, onDispatch, className }: ManualPanelProps) {
  const [showAllCounters, setShowAllCounters] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);

  const controls = manualControlsFor(state, card, Date.now());
  const automation = automationFor(card);

  const byGroup = (group: ManualControl['group']) => controls.filter(c => c.group === group);

  const counters = byGroup('counters');
  /* Adds come back in "what this card wants first" order, and a remove is only
     offered for a counter the card is carrying. Keeping every remove visible is
     what lets a mis-tap be taken back without hunting. */
  const adds = counters.filter(c => c.id.startsWith('counter+:'));
  const removes = counters.filter(c => c.id.startsWith('counter-:'));
  const shownAdds = showAllCounters ? adds : adds.slice(0, COUNTER_HEADLINE);

  const stats = byGroup('stats');
  const keywords = byGroup('keywords');
  const marker = byGroup('marker')[0];

  const engineKeywords = keywords.filter(c => c.support === 'engine');
  const advisoryKeywords = keywords.filter(c => c.support !== 'engine');
  const shownKeywords = showKeywords
    ? [...engineKeywords, ...advisoryKeywords]
    : keywords.filter(c => c.active);

  return (
    <div className={cn('w-full shrink-0 space-y-2', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          By hand
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {automation.summary}
        </span>
      </div>

      {/*
        What the engine will not do for this card, in the card's own words.
        Owner: *"NEVER SILENTLY DO NOTHING."* Two lines at most, because a card
        with nine unimplemented clauses does not need nine lines to make the
        point, and the rules box above already holds the full text.
      */}
      {automation.manualNotes.slice(0, 2).map(note => (
        <p key={note} className="text-[11px] leading-snug text-muted-foreground">
          {note}
        </p>
      ))}

      <div className="flex flex-wrap gap-1">
        {removes.map(control => (
          <Chip
            key={control.id}
            label={control.label}
            tone="active"
            title={`Take one off. ${control.count ?? 0} on this card now.`}
            onClick={() => onDispatch(control.actions)}
          />
        ))}
        {shownAdds.map(control => (
          <Chip
            key={control.id}
            label={control.label}
            count={control.count}
            title="Put one on"
            onClick={() => onDispatch(control.actions)}
          />
        ))}
        {adds.length > COUNTER_HEADLINE && (
          <Chip
            label={showAllCounters ? 'Fewer counters' : 'More counters'}
            onClick={() => setShowAllCounters(value => !value)}
          />
        )}
      </div>

      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {stats.map(control => (
            <Chip
              key={control.id}
              label={control.label}
              title={control.label}
              onClick={() => onDispatch(control.actions)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {shownKeywords.map(control => (
          <Chip
            key={control.id}
            label={control.label}
            tone={control.active ? 'active' : 'quiet'}
            /* A badge that looks enforced and is not is the same silent lie as
               a trigger that never fires, so the tooltip says which it is. */
            title={
              control.support === 'engine'
                ? `${control.label} — the rules engine applies this.`
                : `${control.label} — a reminder on the card. The engine does not apply it.`
            }
            onClick={() => onDispatch(control.actions)}
          />
        ))}
        <Chip
          label={showKeywords ? 'Fewer keywords' : 'Keywords'}
          onClick={() => setShowKeywords(value => !value)}
        />
      </div>

      {marker && (
        <button
          type="button"
          onClick={() => onDispatch(marker.actions)}
          className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {marker.label}
        </button>
      )}
    </div>
  );
}

export default ManualPanel;
