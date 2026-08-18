/* Screenshot scaffolding for the playmat. Not part of the app.
 *
 * `/play` starts every game on turn one with an empty board, which is exactly
 * the board that tells you nothing about the layout. This harness builds a real
 * four-seat table from real decks and then DEVELOPS it — lands down and mostly
 * tapped, creatures out, artifacts and enchantments resolved, a graveyard, an
 * exile — before rendering the same composition the play page renders, so the
 * mat can be photographed in the state a player actually spends a game looking
 * at. matshot.html is throwaway and so is this file.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/components/AuthProvider';
import { PlayTable } from '@/components/play/PlayTable';
import { ViewerHand } from '@/components/play/ViewerHand';
import { BoardRail, railWidthFor } from '@/components/play/BoardRail';
import { CardInspector } from '@/components/play/CardInspector';
import { resolveDeck } from '@/lib/play/deckSource';
import {
  applyActions,
  buildTable,
  isCreature,
  isLand,
  type CardInstance,
  type GameAction,
  type GameState,
  type PlayDeck,
  type PlayerId,
} from '@/lib/game';
import '@/index.css';

const HUD_INSET = 56;
const CARD_RATIO = 0.7176;
const BOARD_CARD_DEFAULT = 200;
const HAND_CARD_DEFAULT = 300;

function handMetrics(viewportHeight: number, ceiling: number, focused: boolean) {
  const height = Math.max(480, viewportHeight);
  const share = focused ? 0.42 : 0.25;
  const cardWidth = Math.round(Math.min(ceiling, Math.max(96, height * share * CARD_RATIO)));
  const overhang = focused ? 0.94 : 1;
  return { cardWidth, inset: Math.round((cardWidth / CARD_RATIO) * overhang) };
}

/** Deal a plausible mid-game board out of each seat's library. */
function develop(state: GameState): GameState {
  const actions: GameAction[] = [];

  for (const player of state.players) {
    const library = player.zones.library.map(id => state.cards[id]).filter(Boolean);

    const lands = library.filter(isLand).slice(0, 6);
    const creatures = library.filter(c => isCreature(c) && !isLand(c)).slice(0, 5);
    const support = library
      .filter(c => !isLand(c) && !isCreature(c) && /Artifact|Enchantment|Planeswalker/.test(c.typeLine ?? ''))
      .slice(0, 4);
    const dead = library.filter(c => !lands.includes(c) && !creatures.includes(c)).slice(-3);

    for (const card of [...lands, ...creatures, ...support]) {
      actions.push({ type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'battlefield' });
    }
    // Most lands tapped, a couple left up — the state a board is usually in.
    for (const card of lands.slice(0, 4)) {
      actions.push({ type: 'TAP', instanceId: card.instanceId });
    }
    for (const card of dead.slice(0, 2)) {
      actions.push({ type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'graveyard' });
    }
    if (dead[2]) actions.push({ type: 'MOVE_ZONE', instanceId: dead[2].instanceId, to: 'exile' });
  }

  return applyActions(state, actions);
}

function shortName(deck: PlayDeck, index: number): string {
  const commander = deck.commanders[0];
  if (!commander) return `Bot ${index + 1}`;
  return commander.name.split(/[,—-]/)[0].trim() || `Bot ${index + 1}`;
}

function Harness() {
  const [state, setState] = useState<GameState | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const decks: PlayDeck[] = [];
      for (let i = 0; i < 4; i++) decks.push(await resolveDeck(null, { seed: 7 + i * 977 }));
      const built = buildTable({
        id: 'matshot',
        seed: 7,
        now: 1,
        format: decks[0].format,
        seats: decks.map((deck, index) => ({
          deck,
          playerName: index === 0 ? 'You' : shortName(deck, index - 1),
          playerId: `p${index + 1}` as PlayerId,
          isBot: index > 0,
        })),
      });
      if (!cancelled) setState(develop(built.state));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) {
    return <div className="fixed inset-0 grid place-items-center text-muted-foreground">Dealing…</div>;
  }

  const inspected: CardInstance | null = inspectId ? state.cards[inspectId] ?? null : null;
  const railWidth = railWidthFor(viewport.width);
  const focused = new URLSearchParams(location.search).get('view') === 'hand';
  const hand = handMetrics(viewport.height, HAND_CARD_DEFAULT, focused);

  const tap = (card: CardInstance) =>
    setState(current =>
      current
        ? applyActions(current, [
            { type: card.tapped ? 'UNTAP' : 'TAP', instanceId: card.instanceId },
          ])
        : current
    );

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-background">
      <div className="relative min-h-0 min-w-0 flex-1">
        <PlayTable
          className="h-full w-full"
          state={state}
          viewerPlayerId="p1"
          botPlayerIds={['p2', 'p3', 'p4']}
          variant="quads"
          focusPlayerId={focused ? 'p1' : null}
          cardWidth={BOARD_CARD_DEFAULT}
          bottomInset={hand.inset}
          topInset={HUD_INSET}
          onInspect={card => setInspectId(card.instanceId)}
          onTapCard={tap}
          inspectedId={inspectId}
        />
        <ViewerHand
          className="absolute inset-x-0 bottom-2 z-30"
          state={state}
          viewerPlayerId="p1"
          cardWidth={hand.cardWidth}
          selectedId={inspectId}
          onInspect={card => setInspectId(card.instanceId)}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-14 items-center px-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          aria-hidden="true"
        >
          HUD placeholder — turn 6
        </div>
      </div>

      {inspected && (
        <BoardRail width={railWidth} topInset={HUD_INSET}>
          <CardInspector
            state={state}
            viewerPlayerId="p1"
            card={inspected}
            onCast={() => undefined}
            onPlayLand={() => undefined}
            onTapToggle={tap}
            onAttack={() => undefined}
            onMoveZone={() => undefined}
            onClose={() => setInspectId(null)}
          />
        </BoardRail>
      )}
    </div>
  );
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            <Harness />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
