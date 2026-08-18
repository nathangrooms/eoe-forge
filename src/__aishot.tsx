/* TEMPORARY screenshot harness for the Deck Generator overhaul. Not shipped. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';

import { CommanderStage } from '@/components/ai-builder/CommanderStage';
import { ConfigureStage } from '@/components/ai-builder/ConfigureStage';
import { BuildStage } from '@/components/ai-builder/BuildStage';
import { CommanderFinder } from '@/components/ai-builder/CommanderFinder';
import { EMPTY_COMMANDER_FILTERS } from '@/components/ai-builder/commander-query';
import { AIGeneratedDeckList } from '@/components/deck-builder/AIGeneratedDeckList';
import { AuthProvider } from '@/components/AuthProvider';
import AIBuilder from '@/pages/AIBuilder';

const params = new URLSearchParams(location.search);
const only = params.get('only');
const client = new QueryClient();

const BUILD_PHASES = [
  { id: 'analyzing', label: 'Reading the commander', description: 'Colour identity and rules text' },
  { id: 'planning', label: 'Choosing the pool', description: 'Card search and AI planning' },
  { id: 'assembling', label: 'Placing cards', description: 'Staples, roles, curve and manabase' },
  { id: 'colors', label: 'Colour identity', description: 'Every card legal in the command zone' },
  { id: 'edh', label: 'EDH power check', description: 'Scored against edhpowerlevel.com' },
  { id: 'budget', label: 'Totalling prices', description: 'Live Scryfall prices per card' },
  { id: 'complete', label: 'Ready', description: 'Deck list ready to review' },
];

const ARCHETYPES = [
  { value: 'superfriends', label: 'Superfriends', description: 'Planeswalkers protected by a wide board.', synergy: 'Proliferate adds loyalty every upkeep', powerLevel: 7 },
  { value: 'counters', label: '+1/+1 Counters', description: 'Grow a board of threats and proliferate them.', synergy: 'Commander proliferates every counter you control', powerLevel: 6 },
  { value: 'infect', label: 'Infect', description: 'Poison counters as a second win condition.', synergy: 'Proliferate doubles poison pressure', powerLevel: 8 },
  { value: 'value', label: 'Value Engine', description: 'Grind card advantage across four colours.', synergy: 'Four-colour identity opens every staple', powerLevel: 7 },
];

function useJson<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => r.json())
      .then(d => !cancelled && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  return data;
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section data-shot className="bg-background">
      <p className="px-6 pt-6 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      {/* Mirrors the app shell: fixed 16rem left rail, page padding from
          StandardPageLayout. */}
      <div className="px-3 pb-8 pt-2 md:px-6 md:pt-4">{children}</div>
    </section>
  );
}

function Harness() {
  const commanders = useJson<any>(
    'https://api.scryfall.com/cards/search?q=' +
      encodeURIComponent('is:commander legal:commander') +
      '&order=edhrec&unique=cards'
  );
  const atraxa = useJson<any>(
    'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent("Atraxa, Praetors' Voice")
  );
  // A real four-colour commander-legal pool, used as the generated list.
  const pool = useJson<any>(
    'https://api.scryfall.com/cards/search?q=' +
      encodeURIComponent('id<=WUBG legal:commander -t:basic') +
      '&order=edhrec&unique=cards'
  );

  const [config, setConfig] = useState({
    archetype: 'counters',
    targetPower: 7,
    maxBudget: 750,
    customPrompt: '',
    includeLands: true,
    prioritizeSynergy: true,
    includeBasics: true,
  });
  const [filters, setFilters] = useState(EMPTY_COMMANDER_FILTERS);
  const [finderOpen, setFinderOpen] = useState(only === 'finder');

  const cards = (pool?.data ?? []).slice(0, 99);
  const totalValue = cards.reduce(
    (s: number, c: any) => s + parseFloat(c.prices?.usd || '0'),
    0
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="ml-[16rem]">
        {only === 'page' && (
          <section data-shot className="bg-background">
            <AuthProvider>
              <AIBuilder />
            </AuthProvider>
          </section>
        )}

        {(!only || only === 'commander' || only === 'finder') && (
          <Shell label="Stage 1 — Commander">
            <CommanderStage
              cards={(commanders?.data ?? []).slice(0, 24)}
              loading={!commanders}
              total={commanders?.total_cards ?? null}
              hasMore
              onLoadMore={() => {}}
              source="popular"
              searchValue=""
              onSearchChange={() => {}}
              filters={filters}
              onOpenFinder={() => setFinderOpen(true)}
              onClearFinder={() => {}}
              onSelect={() => {}}
            />
          </Shell>
        )}

        {(!only || only === 'configure') && atraxa && (
          <Shell label="Stage 2 — Configure">
            <ConfigureStage
              commander={atraxa}
              archetypes={ARCHETYPES}
              config={config as any}
              onConfigChange={setConfig as any}
              onBack={() => {}}
              onBuild={() => {}}
            />
          </Shell>
        )}

        {(!only || only === 'build') && atraxa && cards.length > 0 && (
          <Shell label="Stage 3 — Building">
            <BuildStage
              commander={atraxa}
              phases={BUILD_PHASES}
              phaseIndex={4}
              cards={cards.slice(0, 46)}
              targetPower={7}
              budget={750}
            />
          </Shell>
        )}

        {(!only || only === 'result') && atraxa && cards.length > 0 && (
          <Shell label="Stage 4 — Finished deck">
            <AIGeneratedDeckList
              deckName="Atraxa, Praetors' Voice — Counters"
              cards={cards}
              commander={atraxa}
              power={7}
              edhPowerLevel={7}
              totalValue={totalValue}
              analysis={{}}
              changelog={['Added Sol Ring', 'Added Arcane Signet', 'Added Command Tower']}
              onSaveDeck={() => {}}
              onStartOver={() => {}}
            />
          </Shell>
        )}
      </div>

      <CommanderFinder
        open={finderOpen}
        onOpenChange={setFinderOpen}
        filters={filters}
        onFiltersChange={setFilters}
        sortOrder="edhrec"
        onSortOrderChange={() => {}}
        onSearch={() => {}}
        onClear={() => setFilters(EMPTY_COMMANDER_FILTERS)}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <BrowserRouter>
        <Harness />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
