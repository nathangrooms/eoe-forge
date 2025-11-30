import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StepSimulator } from '@/lib/simulation/stepSimulator';
import { GameState, SimulationResult } from '@/lib/simulation/types';
import { BattleIntro } from '@/components/simulation/BattleIntro';
import { GameBoard } from '@/components/simulation/GameBoard';
import { GameLog } from '@/components/simulation/GameLog';
import { SimulationControls } from '@/components/simulation/SimulationControls';
import { PhaseProgress } from '@/components/simulation/PhaseProgress';
import { AnimationTestPanel } from '@/components/simulation/AnimationTestPanel';
import { PhaseIndicator } from '@/components/simulation/PhaseIndicator';
import { AbilityTriggerPopup, useAbilityTriggers } from '@/components/simulation/AbilityTriggerPopup';
import { useDamageNumbers } from '@/components/simulation/FloatingDamage';
import { CombatArrows } from '@/components/simulation/CombatArrows';
import { useGameAnimations } from '@/hooks/useGameAnimations';
import { clearTriggerTracking } from '@/lib/simulation/triggerSystem';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';

interface DeckOption {
  id: string;
  name: string;
  format: string;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationInterval, setSimulationInterval] = useState<NodeJS.Timeout | null>(null);
  const [speed, setSpeed] = useState(1); // 1x speed for good viewing
  const [showPhase, setShowPhase] = useState(false);

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
        .select('id, name, format')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      setDecks(data || []);
      if (data && data.length >= 2) {
        setDeck1Id(data[0].id);
        setDeck2Id(data[1].id);
      }
    } catch (error) {
      console.error('Error loading decks:', error);
      toast.error('Failed to load decks');
    } finally {
      setLoading(false);
    }
  };

  const loadDeckCards = async (deckId: string) => {
    // Fetch deck cards
    const { data: deckCards, error: deckCardsError } = await supabase
      .from('deck_cards')
      .select('card_id, quantity, card_name')
      .eq('deck_id', deckId);

    if (deckCardsError) throw deckCardsError;
    if (!deckCards || deckCards.length === 0) return [];

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

    // Expand cards by quantity
    const cards: any[] = [];
    deckCards.forEach((dc) => {
      const cardData = cardMap.get(dc.card_id);
      if (cardData) {
        for (let i = 0; i < dc.quantity; i++) {
          cards.push(cardData);
        }
      }
    });

    return cards;
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

      // Load cards
      const [deck1Cards, deck2Cards] = await Promise.all([
        loadDeckCards(deck1Id),
        loadDeckCards(deck2Id),
      ]);

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

      // Create simulator after intro
      setTimeout(() => {
        try {
          const sim = new StepSimulator(
            deck1Cards,
            deck2Cards,
            deck1Info.name || 'Deck A',
            deck2Info.name || 'Deck B',
            deck1Info.format || 'commander'
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

        // Step through one action/phase at a time
        const prevPhase = gameState.phase;
        const result = simulator.step();
        
        // Process animation events
        processEvents(result.events);
        
        // Show phase indicator on phase change
        if (prevPhase !== result.state.phase) {
          setShowPhase(true);
          setTimeout(() => setShowPhase(false), 1200);
        }
        
        // Update state
        setGameState({ ...result.state });
        
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
      
      // Process animation events
      processEvents(result.events);
      
      // Update state
      setGameState({ ...result.state });
      
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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <AnimatePresence>
        {showIntro && gameState && (
          <BattleIntro
            deck1Name={gameState.player1.name}
            deck2Name={gameState.player2.name}
            onComplete={() => setShowIntro(false)}
          />
        )}
      </AnimatePresence>

      {!gameState ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="p-8 max-w-2xl w-full space-y-6">
            <div className="text-center space-y-2">
              <Swords className="h-16 w-16 mx-auto text-primary" />
              <h1 className="text-4xl font-bold">Deck Simulation</h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Watch realistic MTG gameplay with full rules engine. Each card's abilities are tracked and displayed in real-time.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Deck 1</label>
                <Select value={deck1Id} onValueChange={setDeck1Id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select first deck" />
                  </SelectTrigger>
                  <SelectContent>
                    {decks.map((deck) => (
                      <SelectItem key={deck.id} value={deck.id}>
                        {deck.name} ({deck.format})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-center text-2xl font-bold text-muted-foreground">VS</div>

              <div>
                <label className="text-sm font-medium mb-2 block">Deck 2</label>
                <Select value={deck2Id} onValueChange={setDeck2Id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select second deck" />
                  </SelectTrigger>
                  <SelectContent>
                    {decks.map((deck) => (
                      <SelectItem key={deck.id} value={deck.id}>
                        {deck.name} ({deck.format})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={startSimulation}
                disabled={!deck1Id || !deck2Id || loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Swords className="h-4 w-4 mr-2" />
                    Start Simulation
                  </>
                )}
              </Button>
            </div>

            {decks.length < 2 && (
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  You need at least 2 decks to run a simulation.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go to Deck Builder to create decks first.
                </p>
              </div>
            )}

            {decks.length >= 2 && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm space-y-2">
                <div className="font-semibold text-primary">Simulation Features:</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Full MTG rules: lands, creatures, spells, combat</li>
                  <li>• Real-time card tracking with power/toughness updates</li>
                  <li>• Detailed zones: battlefield, hand, graveyard, exile</li>
                  <li>• Live game log with every action recorded</li>
                  <li>• Speed controls: 0.25x to 2x playback</li>
                </ul>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-[4] flex flex-col overflow-hidden border-r-2 border-primary/20 relative">
            <GameBoard state={gameState} onRegisterCard={registerCard} damages={damages} />
            {gameState && <PhaseIndicator phase={gameState.phase} show={showPhase} />}
            {gameState?.combat.isActive && (
              <CombatArrows attackers={gameState.combat.attackers} blockers={gameState.combat.blockers} />
            )}
            <AbilityTriggerPopup triggers={triggers} />
          </div>
          
          <div className="w-[340px] flex flex-col bg-[#0f0f14] border-l border-primary/20">
            <div className="p-4 border-b border-primary/20 bg-gradient-to-b from-primary/10 to-transparent space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Game Log</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Live updates • Turn {gameState.turn}
                  </p>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                <PhaseProgress
                  currentPhase={gameState.phase}
                  activePlayer={gameState.activePlayer === 'player1' ? gameState.player1.name : gameState.player2.name}
                />
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <GameLog events={gameState.log} />
            </div>
            <div className="border-t border-primary/20">
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
            </div>
          </div>
        </div>
      )}
      
      {/* Dev animation test panel */}
      {gameState && <AnimationTestPanel />}
    </div>
  );
}
