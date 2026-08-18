import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { GoldfishSetup, type GoldfishDeckOption } from '@/components/simulation/goldfish/GoldfishSetup';
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
  simulateOpeningHands,
  type GoldfishCard,
  type GoldfishState,
  type OpeningStats,
} from '@/lib/goldfish/engine';

/**
 * Playtest — solo goldfishing.
 *
 * This page used to run `StepSimulator`: two of your decks played each other
 * automatically, hardcoded to `player1`/`player2`, on a board that drew 80px
 * cards. That duplicated the real multiplayer engine in `src/lib/game` that
 * `/play` owns, and it answered a question nobody asks — "which of my two decks
 * would an approximate AI win with".
 *
 * It is now scoped to the thing a playtest tab is for and that nothing else in
 * the product does: **goldfishing one list.** Draw a real opening hand at a size
 * where the mulligan is a decision, keep or throw it back under the London rule,
 * then walk the deck forward turn by turn and watch whether it actually curves
 * out. Every card is the real card from your list; every number is counted.
 */

/** How many opening hands to simulate for the distribution readout. */
const OPENING_TRIALS = 4000;

/** Which card stands in for a deck with no commander — best legend, then any creature. */
function faceRank(typeLine: string | null, isLegendary: boolean | null): number {
  const line = (typeLine ?? '').toLowerCase();
  const creature = line.includes('creature');
  if (creature && isLegendary) return 3;
  if (creature || line.includes('planeswalker')) return 2;
  return 1;
}

function usdPrice(prices: unknown): number {
  const parsed = (typeof prices === 'string' ? JSON.parse(prices) : prices) as
    | { usd?: string | null }
    | null;
  const usd = parseFloat(parsed?.usd ?? '');
  return Number.isFinite(usd) ? usd : 0;
}

/** Only the columns the goldfish reads — cost, types, oracle text, art. */
const CARD_COLUMNS =
  'id, name, set_code, collector_number, type_line, oracle_text, mana_cost, cmc, colors, color_identity, power, toughness, rarity, layout, image_uris, faces, prices, is_legendary';

type Stage = 'setup' | 'mulligan' | 'playing';

export default function Simulate() {
  const [decks, setDecks] = useState<GoldfishDeckOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [starting, setStarting] = useState(false);

  const [stage, setStage] = useState<Stage>('setup');
  const [library, setLibrary] = useState<GoldfishCard[]>([]);
  const [commander, setCommander] = useState<GoldfishCard | null>(null);
  const [state, setState] = useState<GoldfishState | null>(null);
  const [stats, setStats] = useState<OpeningStats | null>(null);

  /* One RNG per mount. A goldfish should be reproducible within a session but
     never identical between them — a fixed seed would show you the same seven
     cards every time you opened the page. */
  const rng = useMemo(() => mulberry32(Math.floor(Math.random() * 2 ** 31)), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoadingDecks(false);
          return;
        }

        const { data: deckRows, error } = await supabase
          .from('user_decks')
          .select('id, name, format, colors')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        const rows = deckRows ?? [];
        if (rows.length === 0) {
          if (!cancelled) {
            setDecks([]);
            setLoadingDecks(false);
          }
          return;
        }

        const { data: deckCards } = await supabase
          .from('deck_cards')
          .select('deck_id, card_id, card_name, quantity, is_commander, is_sideboard')
          .in(
            'deck_id',
            rows.map(r => r.id)
          );

        const counts: Record<string, number> = {};
        const commanders: Record<string, { id: string | null; name: string }> = {};
        const candidates: Record<string, string[]> = {};

        for (const entry of deckCards ?? []) {
          if (!entry.is_sideboard) {
            counts[entry.deck_id] = (counts[entry.deck_id] ?? 0) + (entry.quantity ?? 1);
            if (entry.card_id) (candidates[entry.deck_id] ??= []).push(entry.card_id);
          }
          if (entry.is_commander && !commanders[entry.deck_id]) {
            commanders[entry.deck_id] = { id: entry.card_id ?? null, name: entry.card_name };
          }
        }

        /* One batched join back to `cards` for every face the picker might draw:
           each deck's commander, plus a slice of candidates for the decks that
           have none. The picker is a wall of card art, so it needs real rows. */
        const faceCandidateIds = new Set<string>();
        for (const row of rows) {
          const commanderId = commanders[row.id]?.id;
          if (commanderId) faceCandidateIds.add(commanderId);
          else for (const id of (candidates[row.id] ?? []).slice(0, 100)) faceCandidateIds.add(id);
        }

        const faceRows = faceCandidateIds.size
          ? (
              await supabase
                .from('cards')
                .select('id, name, type_line, mana_cost, color_identity, rarity, layout, image_uris, faces, prices, is_legendary')
                .in('id', [...faceCandidateIds])
            ).data ?? []
          : [];

        const byId = new Map(faceRows.map(r => [r.id, r]));

        const options: GoldfishDeckOption[] = rows.map(row => {
          const commanderId = commanders[row.id]?.id ?? null;
          let face = commanderId ? byId.get(commanderId) ?? null : null;

          if (!face) {
            let bestRank = -1;
            let bestPrice = -1;
            for (const id of candidates[row.id] ?? []) {
              const candidate = byId.get(id);
              if (!candidate) continue;
              const rank = faceRank(candidate.type_line, candidate.is_legendary);
              const price = usdPrice(candidate.prices);
              if (rank > bestRank || (rank === bestRank && price > bestPrice)) {
                bestRank = rank;
                bestPrice = price;
                face = candidate;
              }
            }
          }

          const colors = Array.isArray(row.colors) && row.colors.length
            ? (row.colors as string[])
            : (face?.color_identity as string[] | null) ?? [];

          return {
            id: row.id,
            name: row.name,
            format: row.format,
            cardCount: counts[row.id] ?? 0,
            colors,
            commanderName: commanders[row.id]?.name ?? null,
            faceCard: face,
          };
        });

        if (cancelled) return;
        setDecks(options);
        // Default to the first deck that actually holds cards.
        setSelectedId((options.find(o => o.cardCount > 0) ?? options[0])?.id ?? '');
      } catch (error) {
        console.error('Error loading decks:', error);
        if (!cancelled) toast.error('Failed to load decks');
      } finally {
        if (!cancelled) setLoadingDecks(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDeck = decks.find(d => d.id === selectedId) ?? null;

  const start = useCallback(async () => {
    if (!selectedId) return;
    setStarting(true);
    try {
      const { data: entries, error } = await supabase
        .from('deck_cards')
        .select('card_id, quantity, is_commander, is_sideboard')
        .eq('deck_id', selectedId);

      if (error) throw error;

      const maindeck = (entries ?? []).filter(e => !e.is_sideboard && e.card_id);
      if (maindeck.length === 0) {
        toast.error('That deck has no cards yet');
        return;
      }

      const ids = [...new Set(maindeck.map(e => e.card_id))];
      const { data: cardRows, error: cardsError } = await supabase
        .from('cards')
        .select(CARD_COLUMNS)
        .in('id', ids);

      if (cardsError) throw cardsError;

      const rowsById = new Map((cardRows ?? []).map(r => [r.id, r]));
      const { library: builtLibrary, commander: builtCommander } = buildDeckList(
        maindeck.map(e => ({
          card_id: e.card_id,
          quantity: e.quantity ?? 1,
          is_commander: Boolean(e.is_commander),
        })),
        rowsById
      );

      if (builtLibrary.length < 7) {
        toast.error('Not enough cards in that deck to draw an opening hand');
        return;
      }

      setLibrary(builtLibrary);
      setCommander(builtCommander);
      setStats(simulateOpeningHands(builtLibrary, OPENING_TRIALS, rng));
      setState(drawOpening(newGame(builtLibrary, builtCommander, rng), 0, rng));
      setStage('mulligan');
    } catch (error) {
      console.error('Error starting goldfish:', error);
      toast.error('Failed to load that deck');
    } finally {
      setStarting(false);
    }
  }, [selectedId, rng]);

  const mulligan = useCallback(() => {
    setState(prev => (prev ? drawOpening(prev, prev.mulligans + 1, rng) : prev));
  }, [rng]);

  const keep = useCallback((bottomUids: string[]) => {
    setState(prev => (prev ? nextTurn(keepHand(prev, bottomUids)) : prev));
    setStage('playing');
  }, []);

  const restart = useCallback(() => {
    setState(drawOpening(newGame(library, commander, rng), 0, rng));
    setStage('mulligan');
  }, [library, commander, rng]);

  const backToSetup = useCallback(() => {
    setStage('setup');
    setState(null);
    setStats(null);
    setLibrary([]);
    setCommander(null);
  }, []);

  const shape = useMemo(() => deckShape(library, commander), [library, commander]);

  if (loadingDecks) {
    return (
      <StandardPageLayout title="Playtest" description="Goldfish a deck — real hand, real mulligans">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </StandardPageLayout>
    );
  }

  if (stage === 'setup' || !state) {
    return (
      <StandardPageLayout
        title="Playtest"
        description="Goldfish one of your decks solo — draw a real opening hand, mulligan, and see whether it curves out"
      >
        <GoldfishSetup
          decks={decks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStart={start}
          starting={starting}
        />
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title={selectedDeck?.name ?? 'Playtest'}
      description={
        stage === 'mulligan'
          ? `${shape.total} cards · ${shape.lands} lands · ${shape.ramp} other mana sources · ${shape.averageMv.toFixed(2)} average mana value`
          : 'Solo goldfish — no opponent, no blockers, just the list'
      }
      action={
        <button
          type="button"
          onClick={backToSetup}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Choose another deck
        </button>
      }
    >
      {stage === 'mulligan' && stats ? (
        <OpeningHand
          key={`${state.mulligans}-${state.hand.map(c => c.uid).join('')}`}
          hand={state.hand}
          mulligans={state.mulligans}
          toBottom={state.mulligans}
          stats={stats}
          librarySize={state.library.length}
          onMulligan={mulligan}
          onKeep={keep}
        />
      ) : (
        <GoldfishTable
          state={state}
          onNextTurn={() => setState(prev => (prev ? nextTurn(prev) : prev))}
          onAutoPlay={() => setState(prev => (prev ? autoPlay(prev) : prev))}
          onPlayLand={uid => setState(prev => (prev ? playLand(prev, uid) : prev))}
          onCast={(uid, fromCommandZone) =>
            setState(prev => (prev ? castCard(prev, uid, fromCommandZone) : prev))
          }
          onRestart={restart}
        />
      )}
    </StandardPageLayout>
  );
}
