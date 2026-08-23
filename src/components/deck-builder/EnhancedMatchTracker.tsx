import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Loader2, Plus, X } from 'lucide-react';
import { EmptyState, FIELD, SEARCH_DEBOUNCE_MS } from '@/components/listing';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CardImage } from '@/components/cards';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import type { DeckRecordStats, MatchRow } from '@/lib/deck/deckRecord';

/**
 * A deck's games: recorded, listed and read back.
 *
 * ## Where the query went
 *
 * `MatchAnalytics` used to sit directly under this component on the Record tab.
 * Both ran their own `deck_matches.select('*').eq('deck_id', …)` and both
 * derived total, wins, losses, draws and a win rate from it with identical
 * arithmetic, so one tab made two reads of one set of rows and printed the same
 * figure twice. They also drifted: logging a match reloaded this one only, and
 * the panel beneath kept its old win rate until the page was reloaded. That
 * panel was folded in here.
 *
 * The query has now moved up again, to `DeckRecordPanel`, and the arithmetic
 * with it (`@/lib/deck/deckRecord`). Same reason one step further on: the tab's
 * metric row and this panel are two things that have to agree about one set of
 * rows, so exactly one of them reads and computes, and it is the one that
 * contains both.
 *
 * What this still owns: the form, the list, and the per-opponent breakdown.
 *
 * ## The opponent is a card now
 *
 * `deck_matches.opponent_commander` is free text and the catalogue holds every
 * commander in Magic, so a per-opponent breakdown grouped on exactly what was
 * typed: "Atraxa", "atraxa" and "Atraxa, Praetors' Voice" were three opponents.
 * The field autocompletes against `cards` — legendary creatures only, one
 * debounced query per search and never one per keystroke — and shows the card,
 * so picking one writes the card's own name every time. Typing something that
 * is not a card still works, because you can play against a deck that has no
 * commander.
 */

interface EnhancedMatchTrackerProps {
  deckId: string;
  deckName: string;
  /** Newest first, as the query returns them. */
  matches: MatchRow[];
  stats: DeckRecordStats;
  loading?: boolean;
  /** Re-read the matches. The panel above owns the query. */
  onRecorded: () => void;
}

/** One commander the catalogue knows about, for the opponent field. */
interface CommanderSuggestion {
  id: string;
  name: string;
  image_uris: Record<string, string> | null;
}

/**
 * The opponent field, with the catalogue behind it.
 *
 * One query per settled search, on the shared 250ms debounce, capped at six
 * rows. Not one per keystroke: that is the shape the consistency audit counted
 * on four surfaces and the reason `SEARCH_DEBOUNCE_MS` exists.
 */
function OpponentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<CommanderSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  /* The name the reader picked, so choosing a suggestion does not immediately
     search for the thing that was just chosen. */
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    const needle = value.trim();
    if (needle.length < 3 || needle === chosen.current) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const id = window.setTimeout(() => {
      void supabase
        .from('cards')
        .select('id, name, image_uris')
        .ilike('name', `%${needle}%`)
        .eq('is_legendary', true)
        .ilike('type_line', '%Creature%')
        .order('edhrec_rank', { ascending: true, nullsFirst: false })
        .limit(6)
        .then(({ data, error }) => {
          if (cancelled) return;
          setSearching(false);
          if (error) {
            setSuggestions([]);
            return;
          }
          setSuggestions((data ?? []) as unknown as CommanderSuggestion[]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [value]);

  return (
    <div className="relative space-y-2">
      <Label htmlFor="match-opponent-commander">Opponent’s commander</Label>
      <div className="relative">
        <Input
          className={cn(FIELD, value ? 'pr-9' : undefined)}
          id="match-opponent-commander"
          value={value}
          autoComplete="off"
          onChange={e => {
            chosen.current = null;
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          /* Deferred, because a click on a suggestion drawn below the field is
             a blur before it is a click. Same delay `ListingSearch` uses. */
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          placeholder="Start typing a commander"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              chosen.current = null;
              onChange('');
            }}
            aria-label="Clear the opponent"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 space-y-1 rounded-lg bg-popover p-2 shadow-xl shadow-black/40">
          {suggestions.map(card => (
            <li key={card.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  chosen.current = card.name;
                  onChange(card.name);
                  setSuggestions([]);
                  setOpen(false);
                }}
              >
                <span className="w-10 shrink-0">
                  {/* The card, small but whole: this is a picker row, and the
                      point of it is that you recognise the commander. */}
                  <CardImage card={card} size="xs" fill hideFlip />
                </span>
                <span className="min-w-0 truncate text-sm">{card.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Picking one writes the card’s own name, so the breakdown below groups. Free text is
        fine too: not every deck has a commander.
      </p>
    </div>
  );
}

export function EnhancedMatchTracker({
  deckId,
  deckName,
  matches,
  stats,
  loading = false,
  onRecorded,
}: EnhancedMatchTrackerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    result: 'win',
    opponent_commander: '',
    opponent_deck_name: '',
    notes: '',
    played_at: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { error } = await supabase.from('deck_matches').insert({
        deck_id: deckId,
        user_id: user.id,
        result: formData.result,
        opponent_commander: formData.opponent_commander || null,
        opponent_deck_name: formData.opponent_deck_name || null,
        notes: formData.notes || null,
        played_at: new Date(formData.played_at).toISOString(),
      });
      if (error) throw error;

      showSuccess('Match recorded');
      setFormOpen(false);
      setFormData({
        result: 'win',
        opponent_commander: '',
        opponent_deck_name: '',
        notes: '',
        played_at: new Date().toISOString().split('T')[0],
      });
      onRecorded();
    } catch (error: any) {
      showError('Could not record that match', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* Borderless. These read `border-border` and `border-destructive/40` before,
     which is a hairline on a chip inside a row that also drew one. A loss is
     the one result worth marking, and the tint alone says so. */
  const resultColors = {
    win: 'border-0 bg-muted text-foreground',
    loss: 'border-0 bg-destructive/10 text-destructive',
    draw: 'border-0 bg-muted text-foreground',
  };

  const recent = useMemo(() => matches.slice(0, 10), [matches]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Match history</CardTitle>
            <CardDescription>{deckName}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setFormOpen(open => !open)}>
            <Plus className="mr-2 h-4 w-4" />
            Record match
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/**
         * The form expands where the history is, rather than covering it.
         *
         * You are recording a result relative to the run of games listed
         * directly below, and a dialog put those out of sight at exactly the
         * moment you were typing about them.
         */}
        {formOpen && (
          <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-xl bg-muted/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="match-result">Result</Label>
                <Select
                  value={formData.result}
                  onValueChange={value => setFormData({ ...formData, result: value })}
                >
                  <SelectTrigger className={FIELD} id="match-result">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win">Win</SelectItem>
                    <SelectItem value="loss">Loss</SelectItem>
                    <SelectItem value="draw">Draw</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="match-date">Date</Label>
                <Input
                  className={FIELD}
                  id="match-date"
                  type="date"
                  value={formData.played_at}
                  onChange={e => setFormData({ ...formData, played_at: e.target.value })}
                />
              </div>

              <OpponentField
                value={formData.opponent_commander}
                onChange={next => setFormData({ ...formData, opponent_commander: next })}
              />

              <div className="space-y-2">
                <Label htmlFor="match-opponent-deck">Opponent’s deck name</Label>
                <Input
                  className={FIELD}
                  id="match-opponent-deck"
                  value={formData.opponent_deck_name}
                  onChange={e => setFormData({ ...formData, opponent_deck_name: e.target.value })}
                  placeholder="Superfriends, Voltron"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="match-notes">Notes</Label>
              <Textarea
                className={FIELD}
                id="match-notes"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Key plays, what worked, what did not"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save match
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div
            className="h-32 animate-pulse rounded-lg bg-muted/30 motion-reduce:animate-none"
            role="status"
            aria-label="Loading matches"
          />
        ) : matches.length === 0 ? (
          /* Was a bare centred line reading `No matches recorded yet. Click
             "Record Match" to get started!` — which named a button by a label
             that button does not have, and ended on the kind of exclamation the
             copy rules rule out. The shared panel, and the way out is the
             control rather than a sentence describing it. */
          <EmptyState
            title="No matches yet"
            description="Once you have played some games with this deck, its record and win rate build up here."
            action={{ label: 'Record a match', onClick: () => setFormOpen(true) }}
          />
        ) : (
          /* Each row is `bg-muted/30`, not `border bg-card`. A hairline round
             every row of a ten-row list is the one thing the design law names
             outright, and a recessed ground separates them without it. */
          <div className="space-y-3">
            {recent.map(match => (
              <div
                key={match.id}
                className="flex items-start justify-between rounded-lg bg-muted/30 p-3"
              >
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={resultColors[match.result as keyof typeof resultColors]}
                    >
                      {match.result.toUpperCase()}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(match.played_at).toLocaleDateString()}
                    </span>
                  </div>
                  {(match.opponent_commander || match.opponent_deck_name) && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">vs </span>
                      <span className="font-medium">
                        {match.opponent_commander || match.opponent_deck_name}
                      </span>
                    </div>
                  )}
                  {match.notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{match.notes}</p>
                  )}
                </div>
              </div>
            ))}
            {matches.length > recent.length && (
              <p className="text-sm text-muted-foreground">
                The {recent.length} most recent of {matches.length}. Every one of them is in the
                figures above and in the breakdown below.
              </p>
            )}
          </div>
        )}

        {/* Who you have played, and how it went. Same rows as the list above,
            grouped, from the same read. Sorted by games played, which is the
            order that puts your real meta at the top; each line carries its own
            rate rather than one line claiming to be the best matchup. */}
        {!loading && stats.opponents.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              By opponent
            </h3>
            {stats.opponents.map(opponent => (
              <div key={opponent.opponent} className="rounded-lg bg-muted/30 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{opponent.opponent}</div>
                    <div className="text-xs text-muted-foreground">
                      {opponent.total} match{opponent.total === 1 ? '' : 'es'} · {opponent.wins}W /{' '}
                      {opponent.losses}L
                      {opponent.draws > 0 ? ` / ${opponent.draws}D` : ''}
                    </div>
                  </div>
                  <Badge variant="secondary" className="border-0 tabular-nums">
                    {opponent.winRate.toFixed(0)}%
                  </Badge>
                </div>
                <Progress value={opponent.winRate} className="h-2" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EnhancedMatchTracker;
