/**
 * Generate a real deck with the real generator, and photograph the result page.
 *
 *   node --experimental-strip-types scripts/generator-shots.mjs "Atraxa, Praetors' Voice" counters
 *
 * Two halves, and both of them are the shipping code rather than a stand-in.
 *
 * 1. THE DECK. `supabase/functions/ai-deck-builder-v2/pipeline.ts` is imported
 *    and `build()` is called against the LIVE catalogue over PostgREST, using
 *    the same `Catalog` the deployed function uses. That is why the pipeline was
 *    split out of `index.ts`: `index.ts` calls `serve()` at module scope, so
 *    importing it would start a listener rather than run a build. Nothing here
 *    re-implements the builder, so a deck that comes out wrong here comes out
 *    wrong in production too.
 *
 * 2. THE PAGE. `/smart-builder` sits behind `ProtectedRoute` and a screenshot
 *    run has no credentials, so the result screen cannot be reached through the
 *    front door. This writes a dev-only entry that mounts the REAL
 *    `AIGeneratedDeckList` — the same component the page renders after a build —
 *    with the providers `App.tsx` gives it and without the auth gate, and hands
 *    it the deck from step 1. Same technique as `scripts/play-combat-shots.mjs`,
 *    same reason.
 *
 * The harness files are gitignored agent scaffolding (`src/dev/__*.tsx`,
 * `*-harness.html`). Vite's build input is `index.html` alone, so they are never
 * bundled either way.
 *
 * `--disable-lcd-text` is not optional: subpixel antialiasing puts coloured
 * fringes on thin type over dark backgrounds and reads as a styling bug that is
 * not there.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { Catalog } from '../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../supabase/functions/ai-deck-builder-v2/pipeline.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
/* The publishable (anon) key. Client-visible by design, and the same value
   `src/integrations/supabase/client.ts` ships to every browser. */
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const OUT = '.shots';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const COMMANDER = process.argv[2] || "Atraxa, Praetors' Voice";
const ARCHETYPE = process.argv[3] || 'counters';
const PREFIX = process.env.SHOT_PREFIX || 'generator';

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ *
 * 1. Build, with the deployed pipeline
 * ------------------------------------------------------------------ */

/**
 * An offline stand-in for the database, and ONLY for the database.
 *
 * `POOL_SNAPSHOT=<file>` swaps the transport, nothing else: the pipeline, the
 * ranker, the castability engine and the assembly all run exactly as deployed,
 * against rows read verbatim out of `public.cards_unique`. The colour-identity
 * and legality filters are applied here because the snapshot holds the whole
 * commander-legal catalogue, and they are the same two predicates `poolFor`
 * renders into SQL.
 *
 * It exists because the 553-page printings sync saturates the instance: on
 * 2026-08-19 one page of the four-colour pool measured 12 to 36 seconds of
 * execution against a 3 s `statement_timeout`, so no live fetch could finish.
 * A run without this variable set uses the real `Catalog` and is the one that
 * proves the transport as well.
 */
function snapshotCatalog(file) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const within = (identity, allowed) => {
    const set = new Set(allowed);
    return (identity ?? []).every(c => set.has(c));
  };
  const filter = (rows, query) =>
    rows.filter(
      r =>
        r.legal_in_format === query.legalityFilter.equals &&
        within(r.color_identity, query.colorIdentityFilter.containedBy)
    );
  const byName = new Map();
  for (const row of [...snap.displays, ...snap.details]) {
    if (!byName.has(row.name)) byName.set(row.name, []);
    byName.get(row.name).push(row);
  }
  return {
    poolFor: async query => filter(snap.pool, query),
    landPoolFor: async query => filter(snap.lands, query),
    cardsByName: async (names, format) => {
      const out = [];
      for (const name of new Set(names)) out.push(...(byName.get(name) ?? []));
      for (const r of out) r.legal_in_format = r.legalities?.[format.toLowerCase()] ?? null;
      return out;
    },
    ownedQuantities: async () => new Map(),
  };
}

const SNAPSHOT = process.env.POOL_SNAPSHOT || null;
if (SNAPSHOT) {
  log(`READING THE CATALOGUE FROM A SNAPSHOT: ${SNAPSHOT}`);
  log('  (the pipeline and the engine are unchanged; only the transport is)');
}

log(`building ${COMMANDER} / ${ARCHETYPE} ...`);
const startedAt = Date.now();
const result = await build({
  catalog: SNAPSHOT ? snapshotCatalog(SNAPSHOT) : new Catalog({ url: SUPABASE_URL, anonKey: ANON_KEY }),
  request: {
    commander: { name: COMMANDER },
    archetype: ARCHETYPE,
    powerLevel: 6,
    budget: process.env.BUDGET === 'none' ? undefined : Number(process.env.BUDGET || 500),
    // No LOVABLE_API_KEY outside the edge runtime, so the planner is skipped
    // and the ranking alone chooses every card. That is the honest floor: what
    // the screenshots show is the engine with no model involved at all.
    useAIPlanning: false,
  },
  apiKey: null,
  startedAt,
});

if (result.kind !== 'ok') {
  console.error('BUILD REFUSED:', result.error);
  console.error(JSON.stringify(result.validation, null, 2));
  process.exit(1);
}

const body = result.body;
const cards = body.result.deck;
const analysis = body.result.analysis;

const withArt = cards.filter(c => c.image_uris && c.image_uris.normal).length;
log('');
log(`  ${body.result.totals.deckCards} cards in ${cards.length} entries, ${body.result.totals.lands} lands`);
log(`  entries carrying image_uris: ${withArt} / ${cards.length}`);
log(`  power ${analysis.power} (${analysis.band}, bracket ${analysis.bracket})`);
log(
  `  castable on curve: ${
    analysis.castability.averagePct === null
      ? 'not measured'
      : analysis.castability.averagePct.toFixed(1) + '%'
  }, ${analysis.castability.belowThresholdCount} cards under ${analysis.castability.threshold}%`
);
log(`  sources by colour: ${JSON.stringify(analysis.castability.sourcesByColour)}`);
log(`  roles: ${JSON.stringify(analysis.roleFill)}`);
log(`  total price: $${analysis.totalValue.toFixed(2)}`);
log(`  built in ${Date.now() - startedAt} ms`);
log('');
log('--- change log ---');
for (const line of body.result.changeLog) log('  ' + line);
log('');
log('--- the deck ---');
for (const c of cards) {
  log(`  ${String(c.quantity).padStart(2)}x ${c.name.padEnd(34)} ${c.role.padEnd(12)} ${c.type_line}`);
}

const payloadPath = path.join(OUT, 'generated-deck.json');
fs.writeFileSync(payloadPath, JSON.stringify(body, null, 2));
log(`\nwrote ${payloadPath}`);

/* ------------------------------------------------------------------ *
 * 2. Render, with the real result component
 * ------------------------------------------------------------------ */

const HARNESS_HTML = 'generator-harness.html';
const HARNESS_ENTRY = 'src/dev/__generatorHarness.tsx';
const DECK_JSON = 'src/dev/__generatedDeck.json';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(DECK_JSON, JSON.stringify(body));
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Deck Generator harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);
fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the Deck Generator result screen. Written
 * by scripts/generator-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { StandardPageLayout } from '../components/layouts/StandardPageLayout';
import { AIGeneratedDeckList } from '../components/deck-builder/AIGeneratedDeckList';
import payload from './__generatedDeck.json';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const p: any = payload;

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/smart-builder']}>
          <StandardPageLayout
            title="Deck Generator"
            description="Pick a commander, set your constraints, and watch a 100-card list assemble."
          >
            <AIGeneratedDeckList
              deckName={p.result.commander.name + ' ${ARCHETYPE} Deck'}
              cards={p.result.deck}
              commander={p.result.commander}
              power={p.result.analysis.power}
              edhPowerLevel={null}
              edhPowerUrl={p.edhPowerUrl}
              totalValue={p.result.analysis.totalValue}
              analysis={p.result.analysis}
              edhAnalysisData={null}
              changelog={p.result.changeLog}
              onSaveDeck={() => {}}
              onStartOver={() => {}}
              onApplyReplacements={() => {}}
            />
          </StandardPageLayout>
          <Toaster position="top-center" />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
`
);

const browser = await puppeteer.launch({
  headless: 'new',
  // Ninety-odd Scryfall images make captureScreenshot slow on a cold cache.
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 160));
});

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 4000));
/* One deliberate reload once the harness files have settled: writing them
   triggers Vite's HMR, and a reload mid-run destroys the execution context. */
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 6000));

/* This repo has several agents editing `src/` at once, so HMR can reload the
   page at any moment. Retry rather than fight it. */
async function ev(fn, ...args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (e) {
      if (attempt >= 6 || !/Execution context was destroyed|Target closed/.test(String(e))) throw e;
      log('  [hmr reload, retrying]');
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

/** Wait for the art itself, not for a timer. */
const settle = () =>
  ev(async () => {
    const deadline = Date.now() + 30000;
    const done = () => {
      const imgs = [...document.querySelectorAll('img')];
      return imgs.length > 3 && imgs.every(i => i.complete);
    };
    while (Date.now() < deadline && !done()) await new Promise(r => setTimeout(r, 400));
    const imgs = [...document.querySelectorAll('img')];
    return {
      total: imgs.length,
      loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
      scryfall: imgs.filter(i => /scryfall/i.test(i.currentSrc || i.src)).length,
    };
  });

const shot = async name => {
  const file = `${OUT}/${PREFIX}-${name}.png`;
  await page.screenshot({ path: file });
  log('  shot ->', file);
};

log('  images (top):', JSON.stringify(await settle()));
await shot('01-result-top');

/* The grid is the surface the owner photographed: forty grey boxes. */
await ev(() => {
  const h = [...document.querySelectorAll('button')].find(e =>
    /Creatures|Lands|Artifacts/.test(e.innerText || '')
  );
  if (h) h.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -16);
});
await new Promise(r => setTimeout(r, 1500));
log('  images (grid):', JSON.stringify(await settle()));
await shot('02-grid');

await ev(() => window.scrollBy(0, 900));
await new Promise(r => setTimeout(r, 1500));
await settle();
await shot('03-grid-lower');

/* The optimiser, opened from the generator without leaving the page. */
const opened = await ev(() => {
  const el = [...document.querySelectorAll('button')].find(e =>
    /Improve this deck/i.test(e.innerText || '')
  );
  if (!el) return false;
  el.click();
  return true;
});
if (opened) {
  await new Promise(r => setTimeout(r, 2500));
  await shot('04-optimiser-panel');
  log('  optimiser slide-over opened');
} else {
  log('  no "Improve this deck" control found');
}

await browser.close();
log('\ndone');
process.exit(0);
