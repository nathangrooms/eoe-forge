/**
 * DeckMatrix, Tutor: the one control that says what the answer is
 * looking at.
 *
 * This replaces the 320px column that used to sit down the left of `/tutor`.
 * Owner: *"left hand deck context menu is awful - i told you to add a top line
 * dropdown/search for your deck or a specific card."* That column held four
 * controls and a grid of thumbnails squeezed to 140px, and it cost the
 * conversation — the actual product — a quarter of the page for the whole
 * session, even though picking a context is something you do once.
 *
 * So it is a top line now: one trigger showing what is attached, and a search
 * that spans both things worth attaching. A deck is identified by its commander
 * and a card by itself, so both sides of the list are card art rather than
 * names in a select. Decks are matched in memory (there are never many); cards
 * are searched against the same `cards` table the rest of the app reads, so a
 * result here is a printing Tutor can actually be told about.
 *
 * The two are mutually exclusive on purpose. "Answer about this deck" and
 * "answer about this card" are different questions, and a bar claiming both
 * would be lying about which one was actually sent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown, Crown, Layers, Loader2, Search, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CardImage } from '@/components/cards';
import { ManaCost } from '@/components/ui/mana-cost';
import { PowerScoreBadge } from '@/components/deck/PowerScore';
import { supabase } from '@/integrations/supabase/client';
import { uniqueCards } from '@/lib/cards/cardQuery';
import type { DeckSummary } from '@/lib/api/deckAPI';

/**
 * The `cards` columns the picker shows and Tutor is later told about.
 *
 * `produced_mana` is in here because a land's colour is what it TAPS FOR, and
 * nothing else on the row says so: `colors` is empty for every land ever
 * printed. Without it Tutor cannot answer a question about a mana base,
 * which is exactly what went wrong.
 */
export const TUTOR_CARD_COLUMNS =
  'id, name, set_code, collector_number, type_line, mana_cost, cmc, colors, color_identity, produced_mana, rarity, layout, image_uris, faces, oracle_text, prices, edhrec_rank, power, toughness, keywords, legalities';

export interface TutorCard {
  id: string;
  name: string;
  type_line?: string | null;
  mana_cost?: string | null;
  oracle_text?: string | null;
  [key: string]: any;
}

interface ContextPickerProps {
  decks: DeckSummary[];
  decksLoading: boolean;
  selectedDeck: DeckSummary | null;
  selectedCard: TutorCard | null;
  onSelectDeck: (deck: DeckSummary) => void;
  onSelectCard: (card: TutorCard) => void;
  onClear: () => void;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Card search                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One name per result.
 *
 * The printing collapse is done by the database now: the search reads
 * `cards_unique`, which is one row per oracle_id, so eleven Lightning Bolts
 * arrive as one. This is the last thin layer on top, for the handful of cards
 * that share a printed name across DIFFERENT oracle ids and would still read as
 * a duplicate to someone scanning the list. Reprints are the same card to a
 * rules or strategy question, and so are these.
 */
function dedupeByName(rows: TutorCard[]): TutorCard[] {
  const seen = new Set<string>();
  const out: TutorCard[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Distinct cards pulled per keystroke. */
const CARD_FETCH_LIMIT = 60;
/** Distinct cards actually offered. More than this and the list stops being scannable. */
const CARD_RESULT_LIMIT = 8;

function useCardResults(query: string, enabled: boolean) {
  const [cards, setCards] = useState<TutorCard[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * True when the catalogue holds more matches than are on screen, so the
   * header can say "closest 8" instead of claiming 8 is the total. `ilike
   * %lightning%` really matches 56+ distinct names; the list shows 8.
   */
  const [truncated, setTruncated] = useState(false);
  /** Guards against a slow early request overwriting a later, better one. */
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!enabled || term.length < 2) {
      setCards([]);
      setTruncated(false);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // One row per card, not one per printing.
        //
        // `cards` holds every printing now, and the limit is applied by the
        // database BEFORE anything here can collapse them. Asking for
        // CARD_FETCH_LIMIT rows matching "sol" would return that many PRINTINGS
        // covering a handful of cards, so the list would look nearly empty
        // while the query looked perfectly healthy.
        const { data, error } = await uniqueCards()
          .select(TUTOR_CARD_COLUMNS)
          .ilike('name', `%${term}%`)
          .order('name')
          .limit(CARD_FETCH_LIMIT);
        if (error) throw error;
        if (id !== requestId.current) return;

        const fetched = (data ?? []) as TutorCard[];
        const rows = dedupeByName(fetched);
        /* Prefix matches first — typing "sol" should reach Sol Ring before
           Console or Consul's Lieutenant. */
        const lower = term.toLowerCase();
        rows.sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.name.length - b.name.length;
        });
        setCards(rows.slice(0, CARD_RESULT_LIMIT));
        /*
         * Two ways the screen is not the whole truth: more distinct names came
         * back than fit, or the fetch itself hit its ceiling, in which case
         * even the number of matches is unknown. Either way, do not print a
         * total — the header would be stating a figure nothing measured.
         */
        setTruncated(
          rows.length > CARD_RESULT_LIMIT || fetched.length >= CARD_FETCH_LIMIT
        );
      } catch (error) {
        console.error('Card context search failed:', error);
        if (id === requestId.current) {
          setCards([]);
          setTruncated(false);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { cards, loading, truncated };
}

/* -------------------------------------------------------------------------- */
/* Trigger face                                                               */
/* -------------------------------------------------------------------------- */

function TriggerFace({
  deck,
  card,
}: {
  deck: DeckSummary | null;
  card: TutorCard | null;
}) {
  if (card) {
    return (
      <>
        <span className="w-8 shrink-0">
          <CardImage card={card} size="xs" fill />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-foreground">{card.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {card.type_line || 'Card in focus'}
          </span>
        </span>
      </>
    );
  }

  if (deck) {
    return (
      <>
        <span className="w-8 shrink-0">
          {deck.commander?.image ? (
            <CardImage
              card={{ name: deck.commander.name, image_uris: { normal: deck.commander.image } }}
              size="xs"
              fill
            />
          ) : (
            <span className="flex aspect-[488/680] items-center justify-center rounded bg-muted/50">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-foreground">{deck.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
            {deck.commander?.name ? (
              <>
                <Crown className="h-3 w-3 shrink-0 text-type-commander" aria-hidden="true" />
                <span className="truncate">{deck.commander.name}</span>
              </>
            ) : (
              <span className="truncate">{deck.format}</span>
            )}
            <span className="shrink-0">· {deck.counts?.total ?? 0} cards</span>
          </span>
        </span>
      </>
    );
  }

  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">
          No deck or card attached
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          Answers cover all of Magic
        </span>
      </span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Picker                                                                     */
/* -------------------------------------------------------------------------- */

export function ContextPicker({
  decks,
  decksLoading,
  selectedDeck,
  selectedCard,
  onSelectDeck,
  onSelectCard,
  onClear,
  className,
}: ContextPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { cards, loading: cardsLoading, truncated: cardsTruncated } = useCardResults(query, open);

  const matchingDecks = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return decks;
    return decks.filter(
      deck =>
        deck.name.toLowerCase().includes(term) ||
        (deck.commander?.name ?? '').toLowerCase().includes(term)
    );
  }, [decks, query]);

  // A fresh search every time it opens; last week's query is not a starting point.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const choose = useCallback((run: () => void) => {
    run();
    setOpen(false);
  }, []);

  const hasContext = Boolean(selectedDeck || selectedCard);

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Choose what the answers are about"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-card px-3 py-2 text-left shadow-md shadow-black/20 transition-colors hover:bg-accent"
          >
            <TriggerFace deck={selectedDeck} card={selectedCard} />
            <ChevronsUpDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          /* Matches the trigger, so the list reads as the control unrolling
             rather than as a separate floating box. */
          className="w-[max(22rem,min(var(--radix-popover-trigger-width),calc(100vw-2rem)))] border-0 bg-popover p-0 shadow-xl shadow-black/40"
        >
          <div className="flex items-center gap-2 px-3 pt-3">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search your decks, or any card…"
              aria-label="Search your decks or any card"
              /* No ring: this field is autofocused for the whole life of the
                 popover, so the default focus ring reads as a hard border box
                 around it — the one thing the design forbids. The popover being
                 open is the focus cue. */
              className="h-9 border-0 bg-transparent px-0 text-sm focus-visible:!ring-0 focus-visible:!ring-offset-0"
            />
          </div>

          <div className="mt-2 max-h-[24rem] overflow-y-auto px-2 pb-2">
            {hasContext && (
              <button
                type="button"
                onClick={() => choose(onClear)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Detach, and go back to general Magic questions
              </button>
            )}

            <GroupLabel>
              {decksLoading
                ? 'Your decks, loading'
                : `Your decks${matchingDecks.length ? ` (${matchingDecks.length})` : ''}`}
            </GroupLabel>

            {!decksLoading && matchingDecks.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {decks.length === 0
                  ? 'No decks yet. Card and rules questions still work.'
                  : 'No deck matches that.'}
              </p>
            )}

            {matchingDecks.map(deck => (
              <button
                key={deck.id}
                type="button"
                onClick={() => choose(() => onSelectDeck(deck))}
                aria-current={deck.id === selectedDeck?.id}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent',
                  deck.id === selectedDeck?.id && 'bg-accent'
                )}
              >
                <span className="w-10 shrink-0">
                  {deck.commander?.image ? (
                    <CardImage
                      card={{
                        name: deck.commander.name,
                        image_uris: { normal: deck.commander.image },
                      }}
                      size="xs"
                      fill
                    />
                  ) : (
                    <span className="flex aspect-[488/680] items-center justify-center rounded bg-muted/50">
                      <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {deck.name}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {deck.commander?.name && (
                      <>
                        <Crown className="h-3 w-3 shrink-0 text-type-commander" aria-hidden="true" />
                        <span className="truncate">{deck.commander.name}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="shrink-0">{deck.counts?.total ?? 0} cards</span>
                  </span>
                </span>
                <PowerScoreBadge power={deck.power} />
              </button>
            ))}

            {/* `Cards (8)` used to sit here, which was the length of the list
                after it had been sliced to eight — not a count of anything.
                "lightning" matches 56+ distinct names and the header still
                said 8. A number on screen has to be measured, so an exact
                count ships only when the list really is everything. */}
            <GroupLabel>
              {query.trim().length < 2
                ? 'Any card. Type two letters to search'
                : cardsLoading
                  ? 'Cards, searching'
                  : cardsTruncated
                    ? `Cards, closest ${cards.length}. Keep typing to narrow`
                    : `Cards (${cards.length})`}
            </GroupLabel>

            {query.trim().length >= 2 && cardsLoading && (
              <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Searching the card catalogue…
              </p>
            )}

            {query.trim().length >= 2 && !cardsLoading && cards.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No card in the catalogue matches “{query.trim()}”.
              </p>
            )}

            {cards.map(card => (
              <button
                key={card.id}
                type="button"
                onClick={() => choose(() => onSelectCard(card))}
                aria-current={card.id === selectedCard?.id}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent',
                  card.id === selectedCard?.id && 'bg-accent'
                )}
              >
                <span className="w-10 shrink-0">
                  <CardImage card={card} size="xs" fill />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {card.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {card.type_line}
                  </span>
                </span>
                {card.mana_cost && <ManaCost cost={card.mana_cost} size="sm" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {hasContext && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClear}
          aria-label="Detach the current deck or card"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}
