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
  createToken,
  manualControlsFor,
  marksOn,
  rollDieOnCard,
  setPlayerMark,
  DICE,
  MARK_LABEL_MAX,
  TOKEN_PRESETS,
  type CardInstance,
  type GameAction,
  type GameState,
  type ManaColor,
  type ManualControl,
  type TokenSpec,
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

/**
 * How many token presets are shown before the player asks for the rest.
 *
 * Four, because the four artifact tokens lead the list and they are the ones
 * made by cards of every colour. A Selesnya deck wanting Soldiers taps once
 * more; a deck wanting Treasure taps once, which is the common case.
 */
const TOKEN_HEADLINE = 4;

/** The five colours, for the by-hand token builder. */
const COLOR_SWATCHES: ReadonlyArray<{ code: ManaColor; label: string }> = [
  { code: 'W', label: 'White' },
  { code: 'U', label: 'Blue' },
  { code: 'B', label: 'Black' },
  { code: 'R', label: 'Red' },
  { code: 'G', label: 'Green' },
];

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

/**
 * Making a token, by hand, at the card that told you to.
 *
 * `CREATE_TOKEN` was implemented in the engine, validated, reduced, firing ETB
 * triggers and cleaned up under CR 704.5d, and nothing outside ability
 * resolution had ever built one. So the rules were green and no player could
 * make a Treasure, which is the failure this codebase has already been caught
 * by once with `ATTACH`.
 *
 * Three ways in, narrowest first, because the narrow one is right most often:
 *
 *   the token THIS card names   one press, and it is the token the card in
 *                               front of you actually makes
 *   the twenty common ones      behind one disclosure, so the panel is not
 *                               twenty more identical pills by default
 *   any token at all            a small form, because the list will never be
 *                               complete and a missing token is a stuck game
 *
 * Every one of them ends at `createToken` in `manual.ts`, which is the same
 * builder a resolving ability calls. A Treasure made here and a Treasure made
 * by Dockside Extortionist are the same object downstream: same reducer, same
 * deterministic id, same ETB, same log line, same undo, same broadcast.
 */
function TokenMaker({
  card,
  named,
  onDispatch,
}: {
  card: CardInstance;
  named: ManualControl[];
  onDispatch: (actions: GameAction[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState({ name: '', power: '1', toughness: '1', colors: [] as ManaColor[] });

  const shown = showAll ? TOKEN_PRESETS : TOKEN_PRESETS.slice(0, TOKEN_HEADLINE);
  /* The card's own token is offered above, so offering it again in the common
     list would be the same button twice in one panel. */
  const namedLabels = new Set(named.map(control => control.label));

  const makeDraft = () => {
    const name = draft.name.trim();
    if (!name) return;
    const power = draft.power.trim();
    const toughness = draft.toughness.trim();
    /* A creature is a creature only if it was given a body. Typing a name and
       leaving both boxes empty makes an artifact, which is how Treasure-likes
       and the odd Emblem-shaped thing get made without a second form. */
    const isCreature = power !== '' && toughness !== '';
    const spec: TokenSpec = {
      name,
      typeLine: isCreature ? `Token Creature — ${name}` : `Token Artifact — ${name}`,
      power: isCreature ? power : undefined,
      toughness: isCreature ? toughness : undefined,
      colorIdentity: draft.colors.length > 0 ? draft.colors : undefined,
    };
    onDispatch(createToken(card.controllerId, spec, 1));
    setDraft({ name: '', power: '1', toughness: '1', colors: [] });
    setBuilding(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Make a token
        </span>
        {named.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">
            this card makes {named.map(control => control.label).join(', ')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {/* The card's own, first and marked, because it is the one press that
            is almost always the right one. */}
        {named.map(control => (
          <button
            key={control.id}
            type="button"
            onClick={() => onDispatch(control.actions)}
            title={`Create a ${control.label} token. This card names it.`}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {control.label}
          </button>
        ))}

        {shown
          .filter(preset => !namedLabels.has(preset.name))
          .map(preset => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onDispatch(createToken(card.controllerId, preset, 1))}
              title={
                preset.power
                  ? `Create a ${preset.power}/${preset.toughness} ${preset.name} token`
                  : `Create a ${preset.name} token`
              }
              className="flex items-center gap-1.5 rounded-md bg-foreground/[0.08] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{preset.name}</span>
              {preset.power !== undefined && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {preset.power}/{preset.toughness}
                </span>
              )}
            </button>
          ))}

        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          className="rounded-md px-2 py-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? 'Fewer' : `${TOKEN_PRESETS.length - TOKEN_HEADLINE} more`}
        </button>

        <button
          type="button"
          onClick={() => setBuilding(value => !value)}
          className="rounded-md px-2 py-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {building ? 'Cancel' : 'Another token'}
        </button>
      </div>

      {/* Inline, in the flow of the panel. Not a dialog: project law is no
          centred modals in play, and a form that covered the board would hide
          the card the token is being made for. */}
      {building && (
        <div className="space-y-1.5 rounded-lg bg-foreground/[0.05] p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={draft.name}
              onChange={event => setDraft(d => ({ ...d, name: event.target.value }))}
              onKeyDown={event => {
                if (event.key === 'Enter') makeDraft();
              }}
              placeholder="Token name"
              aria-label="Token name"
              autoFocus
              className="h-8 min-w-0 flex-1 rounded-md bg-background/60 px-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              value={draft.power}
              onChange={event => setDraft(d => ({ ...d, power: event.target.value }))}
              aria-label="Power"
              className="h-8 w-11 rounded-md bg-background/60 px-2 text-center text-xs tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground">/</span>
            <input
              value={draft.toughness}
              onChange={event => setDraft(d => ({ ...d, toughness: event.target.value }))}
              aria-label="Toughness"
              className="h-8 w-11 rounded-md bg-background/60 px-2 text-center text-xs tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {COLOR_SWATCHES.map(swatch => {
              const on = draft.colors.includes(swatch.code);
              return (
                <button
                  key={swatch.code}
                  type="button"
                  aria-pressed={on}
                  title={swatch.label}
                  onClick={() =>
                    setDraft(d => ({
                      ...d,
                      colors: on
                        ? d.colors.filter(c => c !== swatch.code)
                        : [...d.colors, swatch.code],
                    }))
                  }
                  className={cn(
                    'h-7 w-7 rounded-full text-[11px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    /* The one place hue is allowed: this IS mana colour, which
                       project law reserves colour for. */
                    on
                      ? `text-background ${MANA_ON[swatch.code]}`
                      : 'bg-foreground/[0.08] text-muted-foreground hover:bg-foreground/[0.16]'
                  )}
                >
                  {swatch.code}
                </button>
              );
            })}
            <button
              type="button"
              onClick={makeDraft}
              disabled={!draft.name.trim()}
              className="ml-auto rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Make it
            </button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Leave power and toughness empty for a token that is not a creature.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Mana colour, and the only hue in this panel. Project law reserves colour for
 * MTG semantics, and a colour pip is the clearest case there is.
 */
const MANA_ON: Record<ManaColor, string> = {
  W: 'bg-mana-white',
  U: 'bg-mana-blue',
  B: 'bg-mana-black',
  R: 'bg-mana-red',
  G: 'bg-mana-green',
  C: 'bg-mana-colorless',
};

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

  const tokens = byGroup('tokens');
  const namedTokens = tokens.filter(control => control.id.startsWith('token-named:'));
  const copyControl = tokens.find(control => control.id === 'token:copy');

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

      {/* Tokens. Their own section with its own heading, because a token is a
          different KIND of thing from a counter or a keyword flag: those change
          a card that is already there, this puts a new permanent on the board.
          Fifteen identical pills in undifferentiated rows was the complaint. */}
      <TokenMaker card={card} named={namedTokens} onDispatch={onDispatch} />

      {copyControl && (
        <button
          type="button"
          onClick={() => onDispatch(copyControl.actions)}
          title="Create a token that is a copy of this permanent. Counters and damage are not copied (CR 707.2)."
          className="rounded-md bg-foreground/[0.08] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copyControl.label}
        </button>
      )}

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
