/**
 * DeckMatrix — MTG Brain: the one control that says what the assistant is
 * looking at.
 *
 * This replaces the 320px column that used to sit down the left of `/brain`.
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
 * result here is a printing the assistant can actually be told about.
 *
 * The two are mutually exclusive on purpose. "Answer about this deck" and
 * "answer about this card" are different questions, and a bar claiming both
 * would be lying about which one the model was given.
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
import type { DeckSummary } from '@/lib/api/deckAPI';

/** The `cards` columns the picker shows and the assistant is later told about. */
export const BRAIN_CARD_COLUMNS =
  'id, name, set_code, collector_number, type_line, mana_cost, cmc, colors, color_identity, rarity, layout, image_uris, faces, oracle_text, prices, power, toughness, keywords, legalities';

export interface BrainCard {
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
  selectedCard: BrainCard | null;
  onSelectDeck: (deck: DeckSummary) => void;
  onSelectCard: (card: BrainCard) => void;
  onClear: () => void;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Card search                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One name per result. The catalogue holds every printing, so a raw `ilike`
 * on "bolt" answers with eleven Lightning Bolts and nothing else fits on
 * screen. Reprints are the same card to a rules or strategy question.
 */
function dedupeByName(rows: BrainCard[]): BrainCard[] {
  const seen = new Set<string>();
  const out: BrainCard[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function useCardResults(query: string, enabled: boolean) {
  const [cards, setCards] = useState<BrainCard[]>([]);
  const [loading, setLoading] = useState(false);
  /** Guards against a slow early request overwriting a later, better one. */
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!enabled || term.length < 2) {
      setCards([]);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('cards')
          .select(BRAIN_CARD_COLUMNS)
          .ilike('name', `%${term}%`)
          .order('name')
          .limit(60);
        if (error) throw error;
        if (id !== requestId.current) return;

        const rows = dedupeByName((data ?? []) as BrainCard[]);
        /* Prefix matches first — typing "sol" should reach Sol Ring before
           Console or Consul's Lieutenant. */
        const lower = term.toLowerCase();
        rows.sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.name.length - b.name.length;
        });
        setCards(rows.slice(0, 8));
      } catch (error) {
        console.error('Card context search failed:', error);
        if (id === requestId.current) setCards([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { cards, loading };
}

/* -------------------------------------------------------------------------- */
/* Trigger face                                                               */
/* -------------------------------------------------------------------------- */

function TriggerFace({
  deck,
  card,
}: {
  deck: DeckSummary | null;
  card: BrainCard | null;
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
  const { cards, loading: cardsLoading } = useCardResults(query, open);

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
            aria-label="Choose what the assistant reasons about"
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
                Detach — go back to general Magic questions
              </button>
            )}

            <GroupLabel>
              {decksLoading
                ? 'Your decks — loading'
                : `Your decks${matchingDecks.length ? ` (${matchingDecks.length})` : ''}`}
            </GroupLabel>

            {!decksLoading && matchingDecks.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {decks.length === 0
                  ? 'No decks yet — card and rules questions still work.'
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

            <GroupLabel>
              {query.trim().length < 2
                ? 'Any card — type two letters to search'
                : cardsLoading
                  ? 'Cards — searching'
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
