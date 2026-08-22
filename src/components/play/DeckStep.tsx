/**
 * Step two. Choose your deck.
 *
 * The owner's character select reference, with our nouns in it: the grid of
 * options, the large render of what is currently selected, and the detail panel
 * beside it. The large render is the COMMANDER CARD AT FULL SIZE, which is the
 * point of the whole step. It is the most striking art in the product, it is
 * already the house style, and showing a card whole and unmodified is precisely
 * what Scryfall's terms allow.
 *
 * ONE OF THESE, SHARED BY ALL FOUR MODES. Online adds a seat and a table on top
 * of it at the next step; it does not get its own deck picker. What the mode
 * changes here is exactly one thing: which decks it can deal, and that lives in
 * `deckPlayability` rather than in this file.
 */

import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CardImage, CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { PowerScore } from '@/components/deck/PowerScore';
import { DeckWall } from './DeckWall';
import { cardCountLine, deckIntent, deckPlayability } from './playDeckView';
import type { PlayDeckOption } from './usePlayDecks';
import { modeOf, type PlayModeId } from './playModes';

export interface DeckStepProps {
  decks: PlayDeckOption[];
  loading: boolean;
  mode: PlayModeId;
  value: string | null;
  onChoose: (deckId: string | null) => void;
  /** Offered on every mode except online, where an absent deck is refused. */
  allowSeeded: boolean;
}

/** A fact and its label, in the detail panel. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function DeckStep({ decks, loading, mode, value, onChoose, allowSeeded }: DeckStepProps) {
  const door = modeOf(mode);
  const selected = value ? decks.find(deck => deck.id === value) ?? null : null;

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-card py-24 shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  /* No decks at all is the entry gate, not an empty wall. The reader is told
     what is missing and handed the control that fixes it, which is the same
     shape the lobby's own gate takes. */
  if (decks.length === 0) {
    return (
      <section className="w-full rounded-xl bg-card p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">You have no decks yet</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {mode === 'online'
            ? 'A table needs the deck you named, so online asks for one deck with cards in it before you sit down.'
            : 'Build one and every card dealt at the table comes from your real list. Until then this mode can deal a seeded commander deck instead.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/decks/new">Build a deck</Link>
          </Button>
          {allowSeeded && (
            <Button variant="secondary" onClick={() => onChoose(null)}>
              Use a seeded deck
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_46rem]">
      {/* The wall. */}
      <div className="min-w-0 rounded-xl bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your decks
          </h2>
          <p className="text-xs text-muted-foreground">
            {decks.length} deck{decks.length === 1 ? '' : 's'} · card counts read from your lists
          </p>
        </div>

        <DeckWall
          className="mt-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4"
          decks={decks}
          mode={mode}
          value={value}
          onChoose={id => onChoose(id)}
          seeded={
            allowSeeded
              ? {
                  label: 'Seeded commander deck',
                  hint: 'No deck of my own for this seat',
                  chosen: value === null,
                  onChoose: () => onChoose(null),
                }
              : null
          }
        />
      </div>

      {/* The selection, large, and what it is. */}
      <aside className="grid min-w-0 content-start gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-card p-4 shadow-sm">
          {selected?.faceCard ? (
            <CardImage card={selected.faceCard} size="xl" fill eager title={selected.name} />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 px-4 text-center"
              style={{ aspectRatio: CARD_ASPECT }}
            >
              <p className="text-sm text-muted-foreground">
                {selected
                  ? 'This deck has no commander set, so there is no card to show.'
                  : 'A seeded commander deck is built when the table is dealt, so its commander is not known yet.'}
              </p>
            </div>
          )}
          <p className="mt-3 truncate text-center text-xs text-muted-foreground">
            {selected?.commanderName ?? 'Commander chosen at the table'}
          </p>
        </div>

        <div className="min-w-0 rounded-xl bg-card p-4 shadow-sm md:p-5">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {selected?.name ?? 'Seeded commander deck'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected
              ? `Playing ${door.title.toLowerCase()}`
              : 'Built live from commander legal cards when the table is dealt.'}
          </p>

          {selected ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <Fact label="Format">{selected.formatLabel}</Fact>
                <Fact label="Cards">{cardCountLine(selected)}</Fact>
                <Fact label="Colours">
                  <ColorIdentity colors={selected.colors} size="sm" />
                </Fact>
                <Fact label="Commander">{selected.commanderName ?? 'None set'}</Fact>
              </dl>

              <div className="mt-4">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Power
                </span>
                {/* The one power score in the product, drawn by the one
                    component that draws it. `/decks` and the builder show the
                    same object from the same engine. */}
                <PowerScore
                  className="mt-1.5"
                  power={selected.power}
                  variant="compact"
                  unscoredReason="Open this deck and score it, and the number shows up here."
                />
              </div>

              {deckIntent(selected) && (
                <div className="mt-4">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    What it does best
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {deckIntent(selected)}
                  </p>
                </div>
              )}

              {selected.power?.legality && !selected.power.legality.ok && (
                <div className="mt-4 rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-foreground">
                    Not legal in {selected.formatLabel}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {selected.power.legality.issues.slice(0, 4).map(issue => (
                      <li key={issue} className="text-xs text-muted-foreground">
                        {issue}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    The table will still deal it. Legality is checked against the saved format,
                    not enforced by the rules engine.
                  </p>
                </div>
              )}

              {deckPlayability(selected, mode).note && (
                <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-foreground">
                  {deckPlayability(selected, mode).note}
                </p>
              )}

              <Button asChild variant="ghost" size="sm" className="mt-4 -ml-2">
                <Link to={`/deck/${selected.id}`}>Open this deck</Link>
              </Button>
            </>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              A legal commander is picked from the card database and a deck is built around it,
              from the seed shown on the next step. The same seed builds the same deck, so a bad
              draw is reproducible.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
