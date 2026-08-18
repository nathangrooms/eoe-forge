/* TEMPORARY screenshot harness — deleted after visual verification. Not shipped. */
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';

import { PRECON_INDEX } from '@/data/precon-index';
import { CardGrid } from '@/components/cards';
import { PreconTile, PreconTileSkeleton } from '@/components/precons/PreconTile';
import { summarizePrecons, fetchCommanderCards } from '@/lib/precons/precon-api';
import { useEffect, useState } from 'react';

import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';
import { supabase } from '@/integrations/supabase/client';
import { FavoriteDecksPreview } from '@/components/collection/FavoriteDecksPreview';

const TILE_WIDTH = 380;

/* ------------------------------------------------------------------ *
 * Fake session + deck summaries so the DB branch of the favourites
 * component renders. Harness only.
 * ------------------------------------------------------------------ */

function power(score: number, band: string, bracket: number) {
  return {
    score,
    band,
    bracket,
    subscores: {},
    simulation: {},
    diagnostics: {},
    drivers: [],
    drags: [],
    legality: { ok: true, issues: [] },
    hash: 'x',
    scoredAt: new Date().toISOString(),
    stale: false,
    source: 'engine',
    engineVersion: 1,
  } as any;
}

function summary(
  id: string,
  name: string,
  commanderName: string,
  scryfallId: string,
  identity: string[],
  total: number,
  missing: number,
  priceUSD: number,
  p: any
): DeckSummary {
  const a = scryfallId[0];
  const b = scryfallId[1];
  return {
    id,
    name,
    format: 'commander',
    colors: identity,
    identity,
    commander: {
      name: commanderName,
      image: `https://cards.scryfall.io/large/front/${a}/${b}/${scryfallId}.jpg`,
    },
    counts: {
      total,
      unique: total - 4,
      lands: 37,
      creatures: 28,
      instants: 8,
      sorceries: 7,
      artifacts: 10,
      enchantments: 6,
      planeswalkers: 2,
      battles: 0,
    },
    curve: { bins: { '0-1': 4, '2': 12, '3': 15, '4': 12, '5': 8, '6-7': 6, '8-9': 3, '10+': 1 } },
    mana: {
      sources: { W: 12, U: 14, B: 11, R: 0, G: 13, C: 4 },
      untappedPctByTurn: { t1: 60, t2: 75, t3: 84 },
    },
    legality: { ok: true, issues: [] },
    power: p,
    economy: { priceUSD, ownedPct: 0, missing },
    tags: [],
    updatedAt: new Date().toISOString(),
    favorite: true,
  };
}

/* Real commanders (real printing ids => real art) lifted from the precon index. */
const PICKS = PRECON_INDEX.filter(e => e.commanders.length === 1 && e.ci.length >= 1).slice(0, 3);

const FIXTURES: DeckSummary[] = [
  summary('d1', 'Atraxa Superfriends', PICKS[0].commanders[0].name, PICKS[0].commanders[0].scryfallId, PICKS[0].ci, 100, 17, 1284, power(7.4, 'high', 3)),
  summary('d2', 'Goblin Swarm', PICKS[1].commanders[0].name, PICKS[1].commanders[0].scryfallId, PICKS[1].ci, 100, 0, 412, power(5.6, 'mid', 2)),
  summary('d3', 'Ninja Tribal', PICKS[2].commanders[0].name, PICKS[2].commanders[0].scryfallId, PICKS[2].ci, 100, 31, 2140, null as any),
];

(supabase.auth as any).getSession = async () => ({ data: { session: { user: { id: 'u' } } } });
(DeckAPI as any).getDeckSummaries = async () => FIXTURES;

/* ------------------------------------------------------------------ */

function Precons() {
  const [cards, setCards] = useState<any>(undefined);
  useEffect(() => {
    fetchCommanderCards()
      .then(setCards)
      .catch(() => setCards(new Map()));
  }, []);

  const summaries = summarizePrecons(
    PRECON_INDEX.slice(0, 6).map(e => ({
      id: e.id,
      name: e.name,
      set: e.set,
      filename: `${e.id}.json`,
    }))
  );

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Precons — tile</h2>
      <CardGrid width={TILE_WIDTH}>
        {summaries.map((p, i) => (
          <PreconTile key={p.id} precon={p} cards={cards} onSelect={() => {}} eager={i < 6} />
        ))}
      </CardGrid>
      <h2 className="text-2xl font-bold">Precons — skeleton</h2>
      <CardGrid width={TILE_WIDTH}>
        {[0, 1, 2].map(i => (
          <PreconTileSkeleton key={i} />
        ))}
      </CardGrid>
    </section>
  );
}

function Harness() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background p-8 text-foreground">
        {/* ~1160px is the content width on a 1440 viewport once the nav rail is gone */}
        <div
          className="mx-auto space-y-12"
          style={{ maxWidth: Number(new URLSearchParams(location.search).get('w') || 1160) }}
        >
          <Precons />
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Collection — favourite decks</h2>
            <FavoriteDecksPreview />
          </section>
        </div>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
