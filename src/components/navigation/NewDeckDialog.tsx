import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2, Search, Sword, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CardGrid, CardImage } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError, showSuccess } from '@/components/ui/toast-helpers';

/**
 * The "New Deck" flow, owned by the nav shell.
 *
 * The rail's builder entry used to link straight to `/deck-builder`, and that
 * route bounces to `/decks` whenever there is no `?deck=` parameter — so a
 * control labelled "Deck Builder" reliably landed the user on the deck *list*.
 * A new deck has to exist before the builder has anything to open, so the nav
 * creates one here and then navigates to `/deck-builder?deck=<id>`, which is
 * the same destination the deck list's own "New deck" button uses.
 */

type DeckFormat = 'commander' | 'standard' | 'custom';

const FORMATS: ReadonlyArray<{
  id: DeckFormat;
  label: string;
  hint: string;
  icon: typeof Crown;
}> = [
  { id: 'commander', label: 'Commander', hint: '100 cards, singleton', icon: Crown },
  { id: 'standard', label: 'Standard', hint: '60 cards, 4 copies', icon: Sword },
  { id: 'custom', label: 'Custom', hint: 'No restrictions', icon: Wand2 },
];

const FALLBACK_NAME = 'Untitled deck';

export interface NewDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewDeckDialog({ open, onOpenChange }: NewDeckDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [format, setFormat] = useState<DeckFormat>('commander');
  const [name, setName] = useState('');
  const [commander, setCommander] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  // Whether the name box has been typed in. An auto-filled commander name may
  // be overwritten by a later commander choice; a name the user typed may not.
  const nameTouchedRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  // A dialog that remembers last time's half-finished deck is a trap, so every
  // open starts clean.
  useEffect(() => {
    if (!open) return;
    setFormat('commander');
    setName('');
    setCommander(null);
    setQuery('');
    setResults([]);
    setSearching(false);
    nameTouchedRef.current = false;
  }, [open]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  const wantsCommander = format === 'commander';

  useEffect(() => {
    if (!open || !wantsCommander) return;

    const trimmed = query.trim();
    if (!trimmed) {
      searchAbortRef.current?.abort();
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      // Abort the in-flight request so a slow early keystroke cannot land on
      // top of the results for what the user has actually typed.
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      try {
        const response = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
            `${trimmed} is:commander`,
          )}&order=edhrec&unique=cards`,
          { signal: controller.signal },
        );

        // Scryfall answers "nothing matched" with a 404, which is a normal
        // result here rather than an error worth surfacing.
        if (response.status === 404) {
          setResults([]);
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        setResults(Array.isArray(data?.data) ? data.data.slice(0, 12) : []);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        console.error('Commander search failed:', error);
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, open, wantsCommander]);

  const pickCommander = useCallback((card: any) => {
    setCommander(card);
    setQuery('');
    setResults([]);
    if (!nameTouchedRef.current) setName(card.name);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!user) {
      showError('Sign in required', 'Sign in before creating a deck.');
      return;
    }

    const deckName = name.trim() || commander?.name || FALLBACK_NAME;
    const identity: string[] = wantsCommander
      ? commander?.color_identity ?? commander?.colors ?? []
      : [];

    setCreating(true);
    try {
      const { data: newDeck, error } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: deckName,
          format,
          power_level: 5,
          colors: identity,
          description: '',
        })
        .select()
        .single();

      if (error) throw error;
      if (!newDeck) throw new Error('No deck returned');

      if (wantsCommander && commander) {
        const { error: commanderError } = await supabase.from('deck_cards').insert({
          deck_id: newDeck.id,
          card_id: commander.id,
          card_name: commander.name,
          quantity: 1,
          is_commander: true,
          is_sideboard: false,
        });
        // The deck itself exists either way — losing the commander row is worth
        // a log, not worth throwing away a deck the user just made.
        if (commanderError) console.error('Error seeding commander:', commanderError);
      }

      showSuccess('Deck created', `"${deckName}" is ready to build`);
      onOpenChange(false);
      navigate(`/deck-builder?deck=${newDeck.id}`);
    } catch (error) {
      console.error('Error creating deck:', error);
      showError('Could not create deck', 'Something went wrong. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [user, name, commander, wantsCommander, format, navigate, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-none bg-card p-0 shadow-2xl shadow-black/40 sm:rounded-xl">
        <DialogHeader className="px-6 pt-6 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            New deck
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Pick a format, name it, and the builder opens on the empty list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 pb-6">
          <fieldset className="space-y-2">
            <legend className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Format
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(option => {
                const selected = format === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormat(option.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-black/20'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                    )}
                  >
                    <option.icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">{option.label}</span>
                    <span
                      className={cn(
                        'text-[11px] leading-tight',
                        selected ? 'text-primary-foreground/70' : 'text-muted-foreground',
                      )}
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="new-deck-name" className="text-sm font-medium text-foreground">
              Deck name
            </Label>
            <Input
              id="new-deck-name"
              value={name}
              onChange={event => {
                nameTouchedRef.current = true;
                setName(event.target.value);
              }}
              placeholder={wantsCommander ? 'e.g. Atraxa Superfriends' : 'e.g. Mono Red Aggro'}
              autoFocus
              onKeyDown={event => {
                if (event.key === 'Enter' && !creating) handleCreate();
              }}
              className="h-10"
            />
          </div>

          {wantsCommander && (
            <div className="space-y-3">
              <Label
                htmlFor="new-deck-commander"
                className="text-sm font-medium text-foreground"
              >
                Commander <span className="text-muted-foreground">(optional)</span>
              </Label>

              {commander ? (
                <div className="flex items-center gap-4 rounded-lg bg-muted/40 p-3">
                  <CardImage card={commander} width={132} hideFlip />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {commander.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {commander.type_line}
                    </p>
                    <ColorIdentity
                      colors={commander.color_identity ?? []}
                      size="sm"
                      className="mt-2"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCommander(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="new-deck-commander"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Search legendary creatures"
                      className="h-10 pl-9"
                    />
                    {searching && (
                      <Loader2
                        aria-hidden="true"
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
                      />
                    )}
                  </div>

                  {query.trim() && !searching && results.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No commanders match “{query.trim()}”.
                    </p>
                  )}

                  {results.length > 0 && (
                    {/* 132px crosses `cardSizeForWidth`'s `md` threshold, so the
                        picker draws the `large` art rather than `normal` — you
                        are choosing a commander by its face here. */}
                    <CardGrid width={132} className="max-h-64 overflow-y-auto p-0.5">
                      {results.map(card => (
                        <CardImage
                          key={card.id}
                          card={card}
                          width={132}
                          fill
                          hideFlip
                          title={card.name}
                          onClick={() => pickCommander(card)}
                        />
                      ))}
                    </CardGrid>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Creating
                </>
              ) : (
                'Create deck'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
