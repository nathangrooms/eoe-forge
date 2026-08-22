/**
 * The opening hand study, moved off `/simulate` intact.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS STILL A SEPARATE THING INSIDE GOLDFISH
 * ---------------------------------------------------------------------------
 * `/simulate` had two tabs and only one of them was a duplicate. The live game
 * WAS the same table `/play` deals, differing only in who presses the buttons,
 * and it has been merged into the playtest mode with nothing left behind. This
 * tab was not: it answers a different question with a different measurement.
 * Goldfish mode plays the deck on `src/lib/game`; this samples opening hands on
 * `src/lib/goldfish/engine`, with the London mulligan, a keepable figure and the
 * shape of the list.
 *
 * Both live under GOLDFISH, because both are "one seat, no opponent", and the
 * reader chooses between playing it and studying it. Merging the two engines is
 * a real piece of work and it is NOT this task; a merge that quietly dropped
 * the mulligan study would be the regression this phase was warned about.
 *
 * Two queries, both batched: the deck's entries, then every distinct card in
 * one `.in()`. No lookup inside a loop.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { OpeningHand } from '@/components/simulation/goldfish/OpeningHand';
import { GoldfishTable } from '@/components/simulation/goldfish/GoldfishTable';
import {
  autoPlay,
  buildDeckList,
  castCard,
  deckShape,
  drawOpening,
  keepHand,
  mulberry32,
  newGame,
  nextTurn,
  playLand,
  openingHandStats,
  type GoldfishCard,
  type GoldfishState,
  type OpeningStats,
} from '@/lib/goldfish/engine';

/** Only the columns the goldfish reads: cost, types, oracle text, art. */
const CARD_COLUMNS =
  'id, name, set_code, collector_number, type_line, oracle_text, mana_cost, cmc, colors, color_identity, power, toughness, rarity, layout, image_uris, faces, prices, is_legendary';

export interface GoldfishStudyProps {
  deckId: string;
  deckName: string;
  onBack: () => void;
  /** Rendered beside the heading, so the page keeps its shape. */
  onShapeLine?: (line: string | null) => void;
}

export function GoldfishStudy({ deckId, deckName, onBack, onShapeLine }: GoldfishStudyProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [library, setLibrary] = useState<GoldfishCard[]>([]);
  const [commander, setCommander] = useState<GoldfishCard | null>(null);
  const [state, setState] = useState<GoldfishState | null>(null);
  const [stats, setStats] = useState<OpeningStats | null>(null);
  const [playing, setPlaying] = useState(false);

  /* One RNG per mount. A study should be reproducible within a sitting but
     never identical between them: a fixed seed shows the same seven cards
     every time the page is opened. */
  const rng = useMemo(() => mulberry32(Math.floor(Math.random() * 2 ** 31)), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFailed(null);
      try {
        const { data: entries, error } = await supabase
          .from('deck_cards')
          .select('card_id, quantity, is_commander, is_sideboard')
          .eq('deck_id', deckId);

        if (error) throw error;

        const maindeck = (entries ?? []).filter(entry => !entry.is_sideboard && entry.card_id);
        if (maindeck.length === 0) {
          if (!cancelled) setFailed('That deck has no cards in it yet.');
          return;
        }

        const ids = [...new Set(maindeck.map(entry => entry.card_id))];
        const { data: cardRows, error: cardsError } = await supabase
          .from('cards')
          .select(CARD_COLUMNS)
          .in('id', ids);

        if (cardsError) throw cardsError;

        const rowsById = new Map((cardRows ?? []).map(row => [row.id, row]));
        const built = buildDeckList(
          maindeck.map(entry => ({
            card_id: entry.card_id,
            quantity: entry.quantity ?? 1,
            is_commander: Boolean(entry.is_commander),
          })),
          rowsById
        );

        if (built.library.length < 7) {
          if (!cancelled) setFailed('Not enough cards in that deck to draw an opening hand.');
          return;
        }

        if (cancelled) return;
        setLibrary(built.library);
        setCommander(built.commander);
        setStats(openingHandStats(built.library));
        setState(drawOpening(newGame(built.library, built.commander, rng), 0, rng));
        setPlaying(false);
      } catch (error) {
        console.error('[play] could not load that deck for the study', error);
        if (!cancelled) {
          setFailed('Could not read that deck. Try again.');
          toast.error('Failed to load that deck');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [deckId, rng]);

  const shape = useMemo(() => deckShape(library, commander), [library, commander]);

  useEffect(() => {
    if (!onShapeLine) return;
    onShapeLine(
      library.length > 0 && !playing
        ? `${shape.total} cards · ${shape.lands} lands · ${shape.ramp} other mana sources · ${shape.averageMv.toFixed(2)} average mana value`
        : null
    );
  }, [onShapeLine, library.length, playing, shape]);

  const mulligan = useCallback(() => {
    setState(previous => (previous ? drawOpening(previous, previous.mulligans + 1, rng) : previous));
  }, [rng]);

  const keep = useCallback((bottomUids: string[]) => {
    setState(previous => (previous ? nextTurn(keepHand(previous, bottomUids)) : previous));
    setPlaying(true);
  }, []);

  const restart = useCallback(() => {
    setState(drawOpening(newGame(library, commander, rng), 0, rng));
    setPlaying(false);
  }, [library, commander, rng]);

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-card py-24 shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (failed || !state || !stats) {
    return (
      <section className="w-full rounded-xl bg-card p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{failed ?? 'Nothing to study'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {deckName} could not be dealt into an opening hand.
        </p>
        <Button className="mt-4" variant="secondary" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to your seat
        </Button>
      </section>
    );
  }

  return (
    <div className="w-full space-y-4">
      {playing ? (
        <GoldfishTable
          state={state}
          onNextTurn={() => setState(previous => (previous ? nextTurn(previous) : previous))}
          onAutoPlay={() => setState(previous => (previous ? autoPlay(previous) : previous))}
          onPlayLand={uid => setState(previous => (previous ? playLand(previous, uid) : previous))}
          onCast={(uid, fromCommandZone) =>
            setState(previous => (previous ? castCard(previous, uid, fromCommandZone) : previous))
          }
          onRestart={restart}
        />
      ) : (
        <OpeningHand
          key={`${state.mulligans}-${state.hand.map(card => card.uid).join('')}`}
          hand={state.hand}
          mulligans={state.mulligans}
          toBottom={state.mulligans}
          stats={stats}
          librarySize={state.library.length}
          onMulligan={mulligan}
          onKeep={keep}
        />
      )}

      <div className="rounded-xl bg-card px-4 py-3 shadow-sm">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to your seat
        </Button>
      </div>
    </div>
  );
}
