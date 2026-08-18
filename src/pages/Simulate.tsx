/**
 * Playtest.
 *
 * Owner: *"Playtest - this seems completely broken from what we had before
 * which was an auto game player? Playtest is supposed to play live infront of
 * you verse bots and you should be able to select your opponents decks."*
 *
 * So the page is back to being a game you watch, and it is a **real** game:
 * `src/lib/game`, the same rules engine `/play` runs, with two to four seats
 * each holding a deck you chose and each played by the bot policy. Not the old
 * `StepSimulator`, which was a second, private engine hardcoded to
 * `player1`/`player2` — the thing the previous pass deleted for good reason.
 * What that pass got wrong was replacing it with goldfishing, which has no
 * opponent at all.
 *
 * Goldfishing survives as the second tab, because "does this list curve out"
 * and "does this list beat anything" are different questions and the mulligan
 * study is genuinely good. Live is the default, because that is what was asked
 * for.
 *
 * Every deck is a real list: your saved decks by id, or a commander-legal deck
 * seeded live from the card database for a seat you leave on random. Nothing is
 * invented — a deck that fails to load says so rather than quietly becoming a
 * demo list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Fish, Loader2, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { GoldfishSetup, type GoldfishDeckOption } from '@/components/simulation/goldfish/GoldfishSetup';
import { OpeningHand } from '@/components/simulation/goldfish/OpeningHand';
import { GoldfishTable } from '@/components/simulation/goldfish/GoldfishTable';
import { PlaytestSetup, type SeatDeckId } from '@/components/simulation/PlaytestSetup';
import { PlaytestTable } from '@/components/simulation/PlaytestTable';
import { useAutoGame } from '@/components/simulation/useAutoGame';
import { resolveDeckDetailed, toGameFormat, type DeckSummary } from '@/lib/play/deckSource';
import { buildTable, type BuiltTable, type PlayDeck, type PlayerId } from '@/lib/game';
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

/** How many opening hands to simulate for the goldfish distribution readout. */
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

type Tab = 'live' | 'goldfish';
type GoldfishStage = 'setup' | 'mulligan' | 'playing';

/** A short, table-friendly name for a seat: its commander, not "Player 2". */
function seatNameFor(deck: PlayDeck, index: number): string {
  const commander = deck.commanders[0];
  const source = commander?.name ?? deck.name;
  const short = source.split(/[,—-]/)[0].trim();
  if (short.length === 0) return index === 0 ? 'You' : `Bot ${index}`;
  return short;
}

export default function Simulate() {
  const [tab, setTab] = useState<Tab>('live');

  const [decks, setDecks] = useState<GoldfishDeckOption[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  /* ---------------------------------------------------------------------- */
  /* Live game                                                              */
  /* ---------------------------------------------------------------------- */

  const [seats, setSeats] = useState<SeatDeckId[]>([null, null]);
  const [armedSeat, setArmedSeat] = useState(0);
  const [aggression, setAggression] = useState<'timid' | 'normal' | 'aggressive'>('normal');
  const [table, setTable] = useState<BuiltTable | null>(null);
  const [startingLive, setStartingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [speedMs, setSpeedMs] = useState(450);

  const { state, feed, halted, stepOnce, restart } = useAutoGame({
    table,
    aggression,
    speedMs,
    running,
  });

  /* ---------------------------------------------------------------------- */
  /* Goldfish                                                               */
  /* ---------------------------------------------------------------------- */

  const [selectedId, setSelectedId] = useState('');
  const [startingGoldfish, setStartingGoldfish] = useState(false);
  const [stage, setStage] = useState<GoldfishStage>('setup');
  const [library, setLibrary] = useState<GoldfishCard[]>([]);
  const [commander, setCommander] = useState<GoldfishCard | null>(null);
  const [goldfish, setGoldfish] = useState<GoldfishState | null>(null);
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

        const firstPlayable = options.find(o => o.cardCount > 0) ?? options[0];
        setSelectedId(firstPlayable?.id ?? '');
        // Your seat opens on a deck of yours; the opponent stays on random, so
        // one click starts a real game.
        if (firstPlayable) setSeats([firstPlayable.id, null]);
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

  /* ---------------------------------------------------------------------- */
  /* Dealing the live table                                                 */
  /* ---------------------------------------------------------------------- */

  const summaryFor = useCallback(
    (deckId: SeatDeckId): DeckSummary | null => {
      if (!deckId) return null;
      const deck = decks.find(d => d.id === deckId);
      if (!deck) return null;
      return {
        id: deck.id,
        name: deck.name,
        format: toGameFormat(deck.format),
        colors: deck.colors,
        cardCount: deck.cardCount,
      };
    },
    [decks]
  );

  const startLive = useCallback(async () => {
    setStartingLive(true);
    setLiveError(null);

    try {
      const seed = Math.floor(Math.random() * 100000) + 1;
      const resolved: PlayDeck[] = [];
      const notices: string[] = [];

      for (let index = 0; index < seats.length; index++) {
        const outcome = await resolveDeckDetailed(summaryFor(seats[index]), {
          seed: seed + index * 977,
        });
        if (outcome.notice) notices.push(`Seat ${index + 1}: ${outcome.notice}`);
        resolved.push(outcome.deck);
      }

      const built = buildTable({
        id: `playtest-${seed}-${Date.now()}`,
        seed,
        now: Date.now(),
        format: resolved[0].format,
        seats: resolved.map((deck, index) => ({
          deck,
          playerName: seatNameFor(deck, index),
          playerId: `p${index + 1}` as PlayerId,
          // Every seat, the first included: this is a game you watch.
          isBot: true,
        })),
      });

      setTable(built);
      setRunning(true);
      for (const notice of notices) toast.warning(notice, { duration: 9000 });
    } catch (error) {
      console.error('[playtest] could not deal the table', error);
      setLiveError(
        error instanceof Error ? error.message : 'Could not deal the table. Try again.'
      );
    } finally {
      setStartingLive(false);
    }
  }, [seats, summaryFor]);

  const addSeat = useCallback(() => {
    setSeats(current => (current.length >= 4 ? current : [...current, null]));
    setArmedSeat(current => current);
  }, []);

  const removeSeat = useCallback((index: number) => {
    setSeats(current => (current.length <= 2 ? current : current.filter((_, i) => i !== index)));
    setArmedSeat(current => (current >= index && current > 0 ? current - 1 : current));
  }, []);

  const setSeatDeck = useCallback((index: number, deckId: SeatDeckId) => {
    setSeats(current => current.map((seat, i) => (i === index ? deckId : seat)));
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Goldfish actions                                                       */
  /* ---------------------------------------------------------------------- */

  const startGoldfish = useCallback(async () => {
    if (!selectedId) return;
    setStartingGoldfish(true);
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
      setGoldfish(drawOpening(newGame(builtLibrary, builtCommander, rng), 0, rng));
      setStage('mulligan');
    } catch (error) {
      console.error('Error starting goldfish:', error);
      toast.error('Failed to load that deck');
    } finally {
      setStartingGoldfish(false);
    }
  }, [selectedId, rng]);

  const mulligan = useCallback(() => {
    setGoldfish(prev => (prev ? drawOpening(prev, prev.mulligans + 1, rng) : prev));
  }, [rng]);

  const keep = useCallback((bottomUids: string[]) => {
    setGoldfish(prev => (prev ? nextTurn(keepHand(prev, bottomUids)) : prev));
    setStage('playing');
  }, []);

  const restartGoldfish = useCallback(() => {
    setGoldfish(drawOpening(newGame(library, commander, rng), 0, rng));
    setStage('mulligan');
  }, [library, commander, rng]);

  const backToGoldfishSetup = useCallback(() => {
    setStage('setup');
    setGoldfish(null);
    setStats(null);
    setLibrary([]);
    setCommander(null);
  }, []);

  const shape = useMemo(() => deckShape(library, commander), [library, commander]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  // A running game takes the viewport, exactly as /play and /life do. Setup
  // stays inside the app shell — owner: "should be within our normal frame/nav
  // etc until you press start".
  if (tab === 'live' && table && state) {
    return (
      <PlaytestTable
        state={state}
        viewerPlayerId={state.players[0]?.id ?? 'p1'}
        botPlayerIds={table.botPlayerIds}
        feed={feed}
        halted={halted}
        running={running}
        onRunning={setRunning}
        speedMs={speedMs}
        onSpeedMs={setSpeedMs}
        onStep={stepOnce}
        onRestart={restart}
        onLeave={() => {
          setTable(null);
          setRunning(true);
        }}
      />
    );
  }

  if (loadingDecks) {
    return (
      <StandardPageLayout title="Playtest" description="Watch your decks play a real game">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </StandardPageLayout>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Swords }> = [
    { id: 'live', label: 'Live game', icon: Swords },
    { id: 'goldfish', label: 'Goldfish', icon: Fish },
  ];

  const tabStrip = (
    <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
      {tabs.map(entry => {
        const Icon = entry.icon;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === entry.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {entry.label}
          </button>
        );
      })}
    </div>
  );

  if (tab === 'live') {
    return (
      <StandardPageLayout
        title="Playtest"
        description="Two to four real decks, played live by the bot on the same rules engine as /play"
        action={tabStrip}
      >
        <PlaytestSetup
          decks={decks}
          seats={seats}
          armedSeat={armedSeat}
          onArmSeat={setArmedSeat}
          onSeatDeck={setSeatDeck}
          onAddSeat={addSeat}
          onRemoveSeat={removeSeat}
          aggression={aggression}
          onAggression={setAggression}
          onStart={startLive}
          starting={startingLive}
          error={liveError}
        />
      </StandardPageLayout>
    );
  }

  if (stage === 'setup' || !goldfish) {
    return (
      <StandardPageLayout
        title="Playtest"
        description="Goldfish one of your decks solo — draw a real opening hand, mulligan, and see whether it curves out"
        action={tabStrip}
      >
        <GoldfishSetup
          decks={decks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStart={startGoldfish}
          starting={startingGoldfish}
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
          onClick={backToGoldfishSetup}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Choose another deck
        </button>
      }
    >
      {stage === 'mulligan' && stats ? (
        <OpeningHand
          key={`${goldfish.mulligans}-${goldfish.hand.map(c => c.uid).join('')}`}
          hand={goldfish.hand}
          mulligans={goldfish.mulligans}
          toBottom={goldfish.mulligans}
          stats={stats}
          librarySize={goldfish.library.length}
          onMulligan={mulligan}
          onKeep={keep}
        />
      ) : (
        <GoldfishTable
          state={goldfish}
          onNextTurn={() => setGoldfish(prev => (prev ? nextTurn(prev) : prev))}
          onAutoPlay={() => setGoldfish(prev => (prev ? autoPlay(prev) : prev))}
          onPlayLand={uid => setGoldfish(prev => (prev ? playLand(prev, uid) : prev))}
          onCast={(uid, fromCommandZone) =>
            setGoldfish(prev => (prev ? castCard(prev, uid, fromCommandZone) : prev))
          }
          onRestart={restartGoldfish}
        />
      )}
    </StandardPageLayout>
  );
}
