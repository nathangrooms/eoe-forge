import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StepSimulator } from '@/lib/simulation/stepSimulator';
import { GameState, SimulationResult } from '@/lib/simulation/types';
import { BattleIntro } from '@/components/simulation/BattleIntro';
import { GameBoard } from '@/components/simulation/GameBoard';
import { GameLog } from '@/components/simulation/GameLog';
import { SimulationControls } from '@/components/simulation/SimulationControls';
import { PhaseProgress } from '@/components/simulation/PhaseProgress';

import { AbilityTriggerPopup, useAbilityTriggers } from '@/components/simulation/AbilityTriggerPopup';
import { useDamageNumbers } from '@/components/simulation/FloatingDamage';
import { CombatArrows } from '@/components/simulation/CombatArrows';
import { useGameAnimations } from '@/hooks/useGameAnimations';
import { clearTriggerTracking } from '@/lib/simulation/triggerSystem';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { Loader2, PanelRightOpen } from 'lucide-react';
import { SimulationSetup, type SimDeckOption } from '@/components/simulation/SimulationSetup';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { SimulationCinematicOverlay } from '@/components/simulation/SimulationCinematicOverlay';
import { TurnOverview } from '@/components/simulation/TurnOverview';

type DeckOption = SimDeckOption;

function usdPrice(prices: unknown): number {
  const parsed = (typeof prices === 'string' ? JSON.parse(prices) : prices) as
    | { usd?: string | null }
    | null;
  const usd = parseFloat(parsed?.usd ?? '');
  return Number.isFinite(usd) ? usd : 0;
}

/**
 * Which card stands in for a deck that has no commander. Same rule the dashboard
 * uses: the best legendary creature, then any creature, then anything, with
 * price breaking ties. Price alone picks the fetch land out of a budget list.
 */
function faceRank(typeLine: string | null, isLegendary: boolean | null): number {
  const line = (typeLine ?? '').toLowerCase();
  const creature = line.includes('creature');
  if (creature && isLegendary) return 3;
  if (creature || line.includes('planeswalker')) return 2;
  return 1;
}

export default function Simulate() {
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [deck1Id, setDeck1Id] = useState<string>('');
  const [deck2Id, setDeck2Id] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [simulator, setSimulator] = useState<StepSimulator | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [introDeckNames, setIntroDeckNames] = useState<{ deck1: string; deck2: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationInterval, setSimulationInterval] = useState<NodeJS.Timeout | null>(null);
  const [speed, setSpeed] = useState(1); // 1x speed for good viewing
  const [showTurnOverview, setShowTurnOverview] = useState(false);
  /** Below lg the controls/log column collapses into a region under the board. */
  const [controlsOpen, setControlsOpen] = useState(false);
  const [turnDamage, setTurnDamage] = useState({ toPlayer1: 0, toPlayer2: 0, player1Commander: 0, player2Commander: 0 });
  const [cinematicMode, setCinematicMode] = useState<
    | null
    | {
        type: 'attack' | 'block' | 'destroy' | 'cast' | 'ability' | 'tokens' | 'ramp' | 'exile';
        attackers?: string[];
        blockers?: string[];
        destroyed?: string[];
        castCardId?: string;
        abilitySourceId?: string;
        abilityDescription?: string;
        tokens?: Array<{ name: string; count: number }>;
        rampedLandIds?: string[];
        exiledCardIds?: string[];
        playerName?: string;
      }
  >(null);

  const { damages, showDamage } = useDamageNumbers();
  const { triggers, showTrigger } = useAbilityTriggers();

  // Setup animation system
  const { registerCard, processEvents } = useGameAnimations(gameState, speed, showDamage, showTrigger);

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to simulate decks');
        return;
      }

      const { data, error } = await supabase
        .from('user_decks')
        .select('id, name, format, colors')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      const deckRows = data ?? [];

      /* The picker shows each deck as a card, so it needs the commander (or,
         for a deck without one, the most valuable card in the list) and the
         real card count. Two extra queries, once, on a page that is about to
         load two whole decks anyway. */
      const counts: Record<string, number> = {};
      const commanders: Record<string, { id: string | null; name: string }> = {};
      const candidates: Record<string, string[]> = {};

      if (deckRows.length > 0) {
        const { data: deckCards } = await supabase
          .from('deck_cards')
          .select('deck_id, quantity, is_commander, is_sideboard, card_name, card_id')
          .in('deck_id', deckRows.map(row => row.id));

        for (const entry of deckCards ?? []) {
          if (!entry.is_sideboard) {
            counts[entry.deck_id] = (counts[entry.deck_id] ?? 0) + (entry.quantity ?? 1);
            if (entry.card_id) (candidates[entry.deck_id] ??= []).push(entry.card_id);
          }
          if (entry.is_commander && !commanders[entry.deck_id]) {
            commanders[entry.deck_id] = { id: entry.card_id ?? null, name: entry.card_name };
          }
        }
      }

      const faces: Record<string, string> = {};
      const needFace = deckRows.filter(row => !commanders[row.id]).map(row => row.id);
      const faceIds = Array.from(
        new Set(needFace.flatMap(deckId => (candidates[deckId] ?? []).slice(0, 120)))
      );

      if (faceIds.length > 0) {
        const { data: faceRows } = await supabase
          .from('cards')
          .select('id, prices, type_line, is_legendary')
          .in('id', faceIds);

        const scoreById = new Map<string, { rank: number; price: number }>();
        for (const card of faceRows ?? []) {
          scoreById.set(card.id, {
            rank: faceRank(card.type_line, card.is_legendary),
            price: usdPrice(card.prices),
          });
        }

        for (const deckId of needFace) {
          let best: string | null = null;
          let bestRank = -1;
          let bestPrice = -1;
          for (const cardId of candidates[deckId] ?? []) {
            const score = scoreById.get(cardId);
            if (!score) continue;
            if (score.rank > bestRank || (score.rank === bestRank && score.price > bestPrice)) {
              bestRank = score.rank;
              bestPrice = score.price;
              best = cardId;
            }
          }
          if (!best) best = candidates[deckId]?.[0] ?? null;
          if (best) faces[deckId] = best;
        }
      }

      const options: DeckOption[] = deckRows.map(row => ({
        id: row.id,
        name: row.name,
        format: row.format,
        cardCount: counts[row.id] ?? 0,
        colors: Array.isArray(row.colors) ? (row.colors as string[]) : [],
        commanderName: commanders[row.id]?.name ?? null,
        commanderCardId: commanders[row.id]?.id ?? null,
        faceCardId: commanders[row.id]?.id ?? faces[row.id] ?? null,
      }));

      setDecks(options);
      if (options.length >= 2) {
        setDeck1Id(options[0].id);
        setDeck2Id(options[1].id);
      }
    } catch (error) {
      console.error('Error loading decks:', error);
      toast.error('Failed to load decks');
    } finally {
      setLoading(false);
    }
  };

  const loadDeckCards = async (deckId: string) => {
    // Fetch deck cards with commander info
    const { data: deckCards, error: deckCardsError } = await supabase
      .from('deck_cards')
      .select('card_id, quantity, card_name, is_commander')
      .eq('deck_id', deckId);

    if (deckCardsError) throw deckCardsError;
    if (!deckCards || deckCards.length === 0) return { cards: [], commanderId: undefined };

    // Get unique card IDs
    const cardIds = [...new Set(deckCards.map(dc => dc.card_id))];

    // Fetch card details
    const { data: cardsData, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .in('id', cardIds);

    if (cardsError) throw cardsError;

    // Create a map for quick lookup
    const cardMap = new Map(cardsData?.map(card => [card.id, card]) || []);

    // Find commander
    const commanderEntry = deckCards.find(dc => dc.is_commander);
    const commanderId = commanderEntry?.card_id;

    // Expand cards by quantity
    const cards: any[] = [];
    deckCards.forEach((dc) => {
      const cardData = cardMap.get(dc.card_id);
      if (cardData) {
        // Only add 1 copy of commander (it starts in command zone)
        const quantity = dc.is_commander ? 1 : dc.quantity;
        for (let i = 0; i < quantity; i++) {
          cards.push(cardData);
        }
      }
    });

    return { cards, commanderId };
  };

  const startSimulation = async () => {
    if (!deck1Id || !deck2Id) {
      toast.error('Please select both decks');
      return;
    }

    if (deck1Id === deck2Id) {
      toast.error('Please select two different decks');
      return;
    }

    setLoading(true);
    try {
      // Load deck info first
      const { data: deck1Info, error: deck1Error } = await supabase
        .from('user_decks')
        .select('name, format')
        .eq('id', deck1Id)
        .maybeSingle();

      const { data: deck2Info, error: deck2Error } = await supabase
        .from('user_decks')
        .select('name, format')
        .eq('id', deck2Id)
        .maybeSingle();

      if (deck1Error || deck2Error) {
        throw new Error('Failed to load deck information');
      }

      if (!deck1Info || !deck2Info) {
        toast.error('One or both decks not found');
        return;
      }

      setIntroDeckNames({ deck1: deck1Info.name || 'Deck A', deck2: deck2Info.name || 'Deck B' });

      // Load cards
      const [deck1Result, deck2Result] = await Promise.all([
        loadDeckCards(deck1Id),
        loadDeckCards(deck2Id),
      ]);

      const deck1Cards = deck1Result.cards;
      const deck2Cards = deck2Result.cards;
      const deck1CommanderId = deck1Result.commanderId;
      const deck2CommanderId = deck2Result.commanderId;

      if (deck1Cards.length === 0) {
        toast.error(`${deck1Info.name} is empty or has no valid cards`);
        return;
      }

      if (deck2Cards.length === 0) {
        toast.error(`${deck2Info.name} is empty or has no valid cards`);
        return;
      }

      console.log(`Loaded ${deck1Cards.length} cards from ${deck1Info.name}`);
      console.log(`Loaded ${deck2Cards.length} cards from ${deck2Info.name}`);

      // Show battle intro
      setShowIntro(true);

      // Create simulator after intro animation plays
      setTimeout(() => {
        try {
          const sim = new StepSimulator(
            deck1Cards,
            deck2Cards,
            deck1Info.name || 'Deck A',
            deck2Info.name || 'Deck B',
            deck1Info.format || 'commander',
            30,
            deck1CommanderId,
            deck2CommanderId
          );
          setSimulator(sim);
          setGameState(sim.getState());
          setShowIntro(false);
          toast.success('Simulation ready! Press Play to begin');
        } catch (simError) {
          console.error('Error creating simulator:', simError);
          setShowIntro(false);
          toast.error('Failed to initialize simulator');
        }
      }, 2500);

    } catch (error: any) {
      console.error('Error starting simulation:', error);
      toast.error(error?.message || 'Failed to start simulation');
      setShowIntro(false);
    } finally {
      setLoading(false);
    }
  };

  const play = () => {
    if (!simulator || !gameState) return;

    setIsPlaying(true);

    const runStep = () => {
      try {
        if (gameState.gameOver) {
          pause();
          return;
        }

        // Track life at start of turn for damage calculation
        const startLifeP1 = gameState.player1.life;
        const startLifeP2 = gameState.player2.life;
        const startTurn = gameState.turn;

        // Step through one action/phase at a time
        const prevPhase = gameState.phase;
        const result = simulator.step();

        // Trigger cinematic overlays for key events
        if (result.events.length > 0) {
          let shouldShowCinematic = false;

          result.events.forEach((event) => {
            // Combat events
            if (event.type === 'attack_declared' && event.attackerIds?.length) {
              setCinematicMode({ type: 'attack', attackers: event.attackerIds });
              shouldShowCinematic = true;
            }
            if (event.type === 'blockers_declared' && event.blocks?.length) {
              const blockers = event.blocks.map((b: any) => b.blocker).filter(Boolean);
              setCinematicMode({ type: 'block', blockers });
              shouldShowCinematic = true;
            }
            if (event.type === 'creature_dies') {
              setCinematicMode({ type: 'destroy', destroyed: [event.cardId] });
              shouldShowCinematic = true;
            }

            // Spell casting
            if (event.type === 'cast_spell' && event.cardId) {
              const playerName = event.player === 'player1' ? result.state.player1.name : result.state.player2.name;
              setCinematicMode({
                type: 'cast',
                castCardId: event.cardId,
                playerName,
              });
              shouldShowCinematic = true;
            }

            // Token creation
            if (event.type === 'token_created' && event.tokenIds?.length) {
              // Group tokens by name
              const tokenCards = event.tokenIds
                .map((id: string) => {
                  return (
                    result.state.player1.battlefield.find((c) => c.instanceId === id) ||
                    result.state.player2.battlefield.find((c) => c.instanceId === id)
                  );
                })
                .filter(Boolean);

              const tokenGroups = tokenCards.reduce((acc: any, card: any) => {
                const existing = acc.find((g: any) => g.name === card.name);
                if (existing) {
                  existing.count++;
                } else {
                  acc.push({ name: card.name, count: 1 });
                }
                return acc;
              }, []);

              if (tokenGroups.length > 0) {
                setCinematicMode({ type: 'tokens', tokens: tokenGroups });
                shouldShowCinematic = true;
              }
            }

            // Exile events
            if (event.type === 'card_exiled' && event.cardId) {
              setCinematicMode({ type: 'exile', exiledCardIds: [event.cardId] });
              shouldShowCinematic = true;
            }
          });

          // Check log for ability triggers (since they're logged not evented directly)
          const lastLog = result.state.log[result.state.log.length - 1];
          if (lastLog && lastLog.type === 'ability_triggered' && lastLog.cardName) {
            // Find the source card
            const sourceCard =
              result.state.player1.battlefield.find((c) => c.name === lastLog.cardName) ||
              result.state.player2.battlefield.find((c) => c.name === lastLog.cardName) ||
              result.state.player1.graveyard.find((c) => c.name === lastLog.cardName) ||
              result.state.player2.graveyard.find((c) => c.name === lastLog.cardName);

            if (sourceCard) {
              // Check what type of ability it is
              const desc = lastLog.description.toLowerCase();

              // Ramp abilities
              if (desc.includes('search') && desc.includes('land')) {
                const lands = result.state[lastLog.player].battlefield.filter(
                  (c) => c.type_line.includes('Land') && c.wasPlayedThisTurn
                );
                if (lands.length > 0) {
                  setCinematicMode({
                    type: 'ramp',
                    rampedLandIds: lands.map((l) => l.instanceId),
                  });
                  shouldShowCinematic = true;
                }
              }
              // Other abilities (damage, life gain, etc.)
              else {
                setCinematicMode({
                  type: 'ability',
                  abilitySourceId: sourceCard.instanceId,
                  abilityDescription: lastLog.description,
                });
                shouldShowCinematic = true;
              }
            }
          }

          if (shouldShowCinematic) {
            setTimeout(() => setCinematicMode(null), 3500);
          }
        }

        // Process animation events
        processEvents(result.events);

        // Check for turn end and show damage overview
        const turnChanged = result.state.turn > gameState.turn;
        const damageP1 = gameState.player1.life - result.state.player1.life;
        const damageP2 = gameState.player2.life - result.state.player2.life;

        // Update state
        setGameState({ ...result.state });

        // Show turn overview if damage was dealt and turn ended
        if (turnChanged && (damageP1 > 0 || damageP2 > 0)) {
          setTurnDamage({
            toPlayer1: damageP1,
            toPlayer2: damageP2,
            player1Commander: 0,
            player2Commander: 0,
          });
          setShowTurnOverview(true);
          setTimeout(() => setShowTurnOverview(false), 2500);
        }

      if (!result.shouldContinue || result.state.gameOver) {
          pause();

          if (result.state.winner) {
            const winnerName = result.state.winner === 'player1'
              ? result.state.player1.name
              : result.state.player2.name;

            setResult({
              winner: result.state.winner,
              turns: result.state.turn,
              player1Life: result.state.player1.life,
              player2Life: result.state.player2.life,
              events: result.state.log,
              finalState: result.state,
            });

            toast.success(`${winnerName} wins in ${result.state.turn} turns!`);
          }
        }
      } catch (error) {
        console.error('Error during simulation:', error);
        pause();
        toast.error('Simulation encountered an error');
      }
    };

    // Calculate interval based on speed - each step is one action/phase
    const baseInterval = 600; // 600ms base for good visibility
    const interval = setInterval(runStep, baseInterval / speed);
    setSimulationInterval(interval);
  };

  const pause = () => {
    setIsPlaying(false);
    if (simulationInterval) {
      clearInterval(simulationInterval);
      setSimulationInterval(null);
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      pause();
    }
    setSpeed(newSpeed);
    if (wasPlaying) {
      // Restart with new speed
      setTimeout(() => play(), 100);
    }
  };

  const step = () => {
    if (!simulator || !gameState || gameState.gameOver) return;

    try {
      const result = simulator.step();

      if (result.events.length > 0) {
        let shouldShowCinematic = false;

        result.events.forEach((event) => {
          // Combat events
          if (event.type === 'attack_declared' && event.attackerIds?.length) {
            setCinematicMode({ type: 'attack', attackers: event.attackerIds });
            shouldShowCinematic = true;
          }
          if (event.type === 'blockers_declared' && event.blocks?.length) {
            const blockers = event.blocks.map((b: any) => b.blocker).filter(Boolean);
            setCinematicMode({ type: 'block', blockers });
            shouldShowCinematic = true;
          }
          if (event.type === 'creature_dies') {
            setCinematicMode({ type: 'destroy', destroyed: [event.cardId] });
            shouldShowCinematic = true;
          }

          // Spell casting
          if (event.type === 'cast_spell' && event.cardId) {
            const playerName =
              event.player === 'player1' ? result.state.player1.name : result.state.player2.name;
            setCinematicMode({
              type: 'cast',
              castCardId: event.cardId,
              playerName,
            });
            shouldShowCinematic = true;
          }

          // Token creation
          if (event.type === 'token_created' && event.tokenIds?.length) {
            const tokenCards = event.tokenIds
              .map((id: string) => {
                return (
                  result.state.player1.battlefield.find((c) => c.instanceId === id) ||
                  result.state.player2.battlefield.find((c) => c.instanceId === id)
                );
              })
              .filter(Boolean);

            const tokenGroups = tokenCards.reduce((acc: any, card: any) => {
              const existing = acc.find((g: any) => g.name === card.name);
              if (existing) {
                existing.count++;
              } else {
                acc.push({ name: card.name, count: 1 });
              }
              return acc;
            }, []);

            if (tokenGroups.length > 0) {
              setCinematicMode({ type: 'tokens', tokens: tokenGroups });
              shouldShowCinematic = true;
            }
          }

          // Exile events
          if (event.type === 'card_exiled' && event.cardId) {
            setCinematicMode({ type: 'exile', exiledCardIds: [event.cardId] });
            shouldShowCinematic = true;
          }
        });

        // Check log for ability triggers
        const lastLog = result.state.log[result.state.log.length - 1];
        if (lastLog && lastLog.type === 'ability_triggered' && lastLog.cardName) {
          const sourceCard =
            result.state.player1.battlefield.find((c) => c.name === lastLog.cardName) ||
            result.state.player2.battlefield.find((c) => c.name === lastLog.cardName) ||
            result.state.player1.graveyard.find((c) => c.name === lastLog.cardName) ||
            result.state.player2.graveyard.find((c) => c.name === lastLog.cardName);

          if (sourceCard) {
            const desc = lastLog.description.toLowerCase();

            if (desc.includes('search') && desc.includes('land')) {
              const lands = result.state[lastLog.player].battlefield.filter(
                (c) => c.type_line.includes('Land') && c.wasPlayedThisTurn
              );
              if (lands.length > 0) {
                setCinematicMode({
                  type: 'ramp',
                  rampedLandIds: lands.map((l) => l.instanceId),
                });
                shouldShowCinematic = true;
              }
            } else {
              setCinematicMode({
                type: 'ability',
                abilitySourceId: sourceCard.instanceId,
                abilityDescription: lastLog.description,
              });
              shouldShowCinematic = true;
            }
          }
        }

          if (shouldShowCinematic) {
            setTimeout(() => setCinematicMode(null), 1500);
          }
        }

        // Process animation events
        processEvents(result.events);

        // Check for turn end and show damage overview
        const turnChanged = result.state.turn > gameState.turn;
        const damageP1 = gameState.player1.life - result.state.player1.life;
        const damageP2 = gameState.player2.life - result.state.player2.life;

        // Update state
        setGameState({ ...result.state });

        // Show turn overview if damage was dealt and turn ended
        if (turnChanged && (damageP1 > 0 || damageP2 > 0)) {
          setTurnDamage({
            toPlayer1: damageP1,
            toPlayer2: damageP2,
            player1Commander: 0, // Could track commander damage separately
            player2Commander: 0,
          });
          setShowTurnOverview(true);
          setTimeout(() => setShowTurnOverview(false), 2500);
        }

      if (!result.shouldContinue || result.state.gameOver) {
        if (result.state.winner) {
          const winnerName = result.state.winner === 'player1'
            ? result.state.player1.name
            : result.state.player2.name;

          setResult({
            winner: result.state.winner,
            turns: result.state.turn,
            player1Life: result.state.player1.life,
            player2Life: result.state.player2.life,
            events: result.state.log,
            finalState: result.state,
          });

          toast.success(`${winnerName} wins in ${result.state.turn} turns!`);
        }
      }
    } catch (error) {
      console.error('Error stepping simulation:', error);
      toast.error('Error stepping through simulation');
    }
  };

  const restart = () => {
    pause();
    clearTriggerTracking(); // Clear ETB trigger tracking
    setSimulator(null);
    setGameState(null);
    setResult(null);
  };

  const exportResults = () => {
    if (!result) return;

    const data = {
      winner: result.winner,
      turns: result.turns,
      player1Life: result.player1Life,
      player2Life: result.player2Life,
      events: result.events,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Results exported');
  };

  if (loading) {
    return (
      <StandardPageLayout
        title="Playtest"
        description="Watch two of your decks play each other, step by step"
      >
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </StandardPageLayout>
    );
  }

  const sidebar = gameState && (
    <>
      <div className="shrink-0 bg-muted/20 p-3">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Game log</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Turn {gameState.turn}</p>
        </div>

        <SimulationControls
          isPlaying={isPlaying}
          isComplete={gameState.gameOver}
          speed={speed}
          onPlay={play}
          onPause={pause}
          onStep={step}
          onRestart={restart}
          onExport={exportResults}
          onSpeedChange={handleSpeedChange}
        />

        <div className="mt-3">
          <PhaseProgress
            currentPhase={gameState.phase}
            activePlayer={
              gameState.activePlayer === 'player1' ? gameState.player1.name : gameState.player2.name
            }
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <GameLog events={gameState.log} />
      </div>
      <div className="shrink-0 bg-muted/20 p-3 text-center text-xs text-muted-foreground">
        {gameState.log.length} events logged
      </div>
    </>
  );

  // App.tsx renders routes inside a pt-16 wrapper below a fixed 64px header, so
  // a full 100vh child overflows the viewport. Subtract the header instead.
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <AnimatePresence>
        {showIntro && introDeckNames && (
          <BattleIntro
            deck1Name={introDeckNames.deck1}
            deck2Name={introDeckNames.deck2}
            onComplete={() => setShowIntro(false)}
          />
        )}
      </AnimatePresence>

      {cinematicMode && gameState && (
        <SimulationCinematicOverlay
          mode={cinematicMode.type}
          attackerCards={
            cinematicMode.attackers
              ?.map((id) =>
                gameState.player1.battlefield.concat(gameState.player2.battlefield).find((c) => c.instanceId === id)
              )
              .filter(Boolean) as any
          }
          blockerCards={
            cinematicMode.blockers
              ?.map((id) =>
                gameState.player1.battlefield.concat(gameState.player2.battlefield).find((c) => c.instanceId === id)
              )
              .filter(Boolean) as any
          }
          destroyedCards={
            cinematicMode.destroyed
              ?.map((id) =>
                gameState.player1.graveyard
                  .concat(gameState.player2.graveyard)
                  .concat(gameState.player1.exile)
                  .concat(gameState.player2.exile)
                  .find((c) => c.instanceId === id)
              )
              .filter(Boolean) as any
          }
          castCard={
            cinematicMode.castCardId
              ? gameState.player1.battlefield
                  .concat(gameState.player2.battlefield)
                  .concat(gameState.player1.graveyard)
                  .concat(gameState.player2.graveyard)
                  .concat(gameState.player1.hand)
                  .concat(gameState.player2.hand)
                  .find((c) => c.instanceId === cinematicMode.castCardId)
              : undefined
          }
          abilitySource={
            cinematicMode.abilitySourceId
              ? gameState.player1.battlefield
                  .concat(gameState.player2.battlefield)
                  .concat(gameState.player1.graveyard)
                  .concat(gameState.player2.graveyard)
                  .find((c) => c.instanceId === cinematicMode.abilitySourceId)
              : undefined
          }
          abilityDescription={cinematicMode.abilityDescription}
          tokensCreated={cinematicMode.tokens}
          ramppedLands={
            cinematicMode.rampedLandIds
              ?.map((id) =>
                gameState.player1.battlefield.concat(gameState.player2.battlefield).find((c) => c.instanceId === id)
              )
              .filter(Boolean) as any
          }
          exiledCards={
            cinematicMode.exiledCardIds
              ?.map((id) =>
                gameState.player1.exile.concat(gameState.player2.exile).find((c) => c.instanceId === id)
              )
              .filter(Boolean) as any
          }
          playerName={cinematicMode.playerName}
        />
      )}

      {!gameState ? (
        <StandardPageLayout
          title="Playtest"
          description="Watch two of your decks play each other, step by step"
        >
          <SimulationSetup
            decks={decks}
            deck1Id={deck1Id}
            deck2Id={deck2Id}
            onDeck1Change={setDeck1Id}
            onDeck2Change={setDeck2Id}
            onStart={startSimulation}
            starting={loading}
          />
        </StandardPageLayout>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative flex min-h-[60vh] flex-1 flex-col overflow-hidden lg:min-h-0">
            <GameBoard state={gameState} onRegisterCard={registerCard} damages={damages} />
            {gameState?.combat.isActive && (
              <CombatArrows attackers={gameState.combat.attackers} blockers={gameState.combat.blockers} />
            )}
            <AbilityTriggerPopup triggers={triggers} />

            {/* Below lg the same node becomes a region under the board rather
                than a Sheet over it: one sidebar, two inline placements. */}
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-3 right-3 z-20 shadow-md lg:hidden"
              onClick={() => setControlsOpen(open => !open)}
              aria-expanded={controlsOpen}
            >
              <PanelRightOpen className="mr-2 h-4 w-4" />
              {controlsOpen ? 'Hide controls & log' : 'Controls & log'}
            </Button>
          </div>

          {controlsOpen && (
            <div className="flex max-h-[45vh] w-full flex-col overflow-y-auto bg-card lg:hidden">
              {sidebar}
            </div>
          )}

          <div className="hidden w-full flex-col bg-card lg:flex lg:w-96">
            {sidebar}
          </div>
        </div>
      )}

       {/* Turn Overview */}
       <TurnOverview show={showTurnOverview} state={gameState} damageDealt={turnDamage} />
     </div>
   );
 }
