import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GameSimulator } from '@/lib/simulation/simulator';
import { GameState, SimulationResult } from '@/lib/simulation/types';
import { BattleIntro } from '@/components/simulation/BattleIntro';
import { GameBoard } from '@/components/simulation/GameBoard';
import { GameLog } from '@/components/simulation/GameLog';
import { SimulationControls } from '@/components/simulation/SimulationControls';
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
  const [simulator, setSimulator] = useState<GameSimulator | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationInterval, setSimulationInterval] = useState<NodeJS.Timeout | null>(null);

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
    const { data: deckCards, error } = await supabase
      .from('deck_cards')
      .select(`
        card_id,
        quantity,
        cards (*)
      `)
      .eq('deck_id', deckId);

    if (error) throw error;

    const cards: any[] = [];
    deckCards?.forEach((dc: any) => {
      for (let i = 0; i < dc.quantity; i++) {
        cards.push(dc.cards);
      }
    });

    return cards;
  };

  const startSimulation = async () => {
    if (!deck1Id || !deck2Id) {
      toast.error('Please select both decks');
      return;
    }

    setLoading(true);
    try {
      const [deck1Cards, deck2Cards, deck1Info, deck2Info] = await Promise.all([
        loadDeckCards(deck1Id),
        loadDeckCards(deck2Id),
        supabase.from('user_decks').select('name, format').eq('id', deck1Id).single(),
        supabase.from('user_decks').select('name, format').eq('id', deck2Id).single(),
      ]);

      if (deck1Cards.length === 0 || deck2Cards.length === 0) {
        toast.error('One or both decks are empty');
        return;
      }

      // Show battle intro
      setShowIntro(true);

      // Create simulator after intro
      setTimeout(() => {
        const sim = new GameSimulator(
          deck1Cards,
          deck2Cards,
          deck1Info.data?.name || 'Deck A',
          deck2Info.data?.name || 'Deck B',
          deck1Info.data?.format || 'commander'
        );
        setSimulator(sim);
        setGameState(sim.getState());
        setShowIntro(false);
        toast.success('Simulation ready! Press Play to begin');
      }, 2500);

    } catch (error) {
      console.error('Error starting simulation:', error);
      toast.error('Failed to start simulation');
    } finally {
      setLoading(false);
    }
  };

  const play = () => {
    if (!simulator || !gameState) return;
    
    setIsPlaying(true);
    const interval = setInterval(() => {
      if (gameState.gameOver) {
        pause();
        return;
      }

      // Run one full turn
      const result = simulator.simulate();
      setGameState(simulator.getState());
      
      if (result.winner) {
        setResult(result);
        pause();
        toast.success(`${result.winner === 'player1' ? gameState.player1.name : gameState.player2.name} wins!`);
      }
    }, 1000); // 1 second per turn

    setSimulationInterval(interval);
  };

  const pause = () => {
    setIsPlaying(false);
    if (simulationInterval) {
      clearInterval(simulationInterval);
      setSimulationInterval(null);
    }
  };

  const step = () => {
    if (!simulator || !gameState || gameState.gameOver) return;
    
    const result = simulator.simulate();
    setGameState(simulator.getState());
    
    if (result.winner) {
      setResult(result);
      toast.success(`${result.winner === 'player1' ? gameState.player1.name : gameState.player2.name} wins!`);
    }
  };

  const restart = () => {
    pause();
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
              <p className="text-muted-foreground">
                Run realistic MTG simulations between two decks with full rules engine
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
              <div className="text-center text-sm text-muted-foreground">
                You need at least 2 decks to run a simulation
              </div>
            )}
          </Card>
        </div>
      ) : (
        <>
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-[2] overflow-hidden">
              <GameBoard state={gameState} />
            </div>
            <div className="flex-1 border-l border-border">
              <GameLog events={gameState.log} />
            </div>
          </div>

          <SimulationControls
            isPlaying={isPlaying}
            isComplete={gameState.gameOver}
            onPlay={play}
            onPause={pause}
            onStep={step}
            onRestart={restart}
            onExport={exportResults}
          />
        </>
      )}
    </div>
  );
}
