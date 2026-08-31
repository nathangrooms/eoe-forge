/**
 * Photograph the deck generator's CONFIGURE step, with the real strategies.
 *
 *   node scripts/configure-stage-shots.mjs
 *   node scripts/configure-stage-shots.mjs "Meren of Clan Nel Toth"
 *
 * WHY THIS EXISTS. `scripts/probe/nav-audit.mjs` walks the left menu and this
 * screen is not in it: it sits behind choosing a commander, and CLAUDE.md
 * records the cost of that gap in play mode — every structural audit passed
 * `/play` at 390px while the game could not be played on a phone, because none
 * of them opened a game.
 *
 * It matters now because the Strategy panel changed shape. It used to draw FOUR
 * options from a model call with a hardcoded word-list fallback; it draws SIX
 * from `strategiesFor`, which reads the engine. Two columns and six tiles is
 * three rows where it was two, and nothing had looked at it.
 *
 * The commander and the strategies are REAL: the card comes from the live
 * catalogue and the offers come from the shipped `strategiesFor`, so a bad
 * sentence here is a bad sentence in the product.
 *
 * The harness files are gitignored agent scaffolding. Vite's build input is
 * `index.html` alone, so they are never bundled.
 *
 * `--disable-lcd-text` is not optional: subpixel antialiasing puts coloured
 * fringes on thin type over dark backgrounds and reads as a styling bug that is
 * not there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

import { strategiesFor } from '../src/lib/deck/commanderStrategies.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON = fs.readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const OUT = '.shots/configure-stage';
const NAMES = process.argv.length > 2 ? process.argv.slice(2) : ['Syr Vondam, Sunstar Exemplar', 'Krenko, Mob Boss'];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync('src/dev', { recursive: true });

const rest = async q => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

const scenes = [];
for (const name of NAMES) {
  const [row] = await rest(`cards_unique?select=*&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (!row) {
    console.log(`!! ${name} is not in the catalogue`);
    continue;
  }
  const offers = strategiesFor(row);
  console.log(`${row.name}: ${offers.length} strategies`);
  for (const o of offers) console.log(`    ${o.score.toFixed(2)}  ${o.label.padEnd(16)}${o.synergy}`);
  scenes.push({ commander: row, archetypes: offers.map(({ score, ...rest }) => rest) });
}

const HARNESS_HTML = 'configure-harness.html';
const HARNESS_ENTRY = 'src/dev/__configureHarness.tsx';
const SCENES_JSON = 'src/dev/__configureScenes.json';

fs.writeFileSync(SCENES_JSON, JSON.stringify(scenes));
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Configure step harness</title></head>
  <body><div id="root"></div><script type="module" src="/${HARNESS_ENTRY}"></script></body>
</html>
`
);
fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the deck generator's configure step.
 * Written by scripts/configure-stage-shots.mjs. Not shipped, not routed. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../index.css';
import { TooltipProvider } from '../components/ui/tooltip';
import { ConfigureStage } from '../components/ai-builder/ConfigureStage';
import scenes from './__configureScenes.json';

function Scene({ scene }: { scene: any }) {
  const [config, setConfig] = useState({
    archetype: scene.archetypes[0]?.value ?? '',
    style: 'balanced',
    targetPower: scene.archetypes[0]?.powerLevel ?? 7,
    maxBudget: 500,
    customPrompt: '',
    includeLands: true,
    prioritizeSynergy: true,
    includeBasics: true,
  });
  return (
    <div data-scene={scene.commander.name} className="mx-auto w-full max-w-[110rem] px-4 py-6">
      <ConfigureStage
        commander={scene.commander}
        archetypes={scene.archetypes}
        config={config as never}
        onConfigChange={setConfig as never}
        onBack={() => {}}
        onBuild={() => {}}
      />
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          {(scenes as any[]).map((s, i) => (
            <Scene key={i} scene={s} />
          ))}
        </div>
      </TooltipProvider>
    </MemoryRouter>
  </QueryClientProvider>
);
`
);

const PORT = 8123;
const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
);
const ready = new Promise(resolve => {
  const onData = d => {
    if (/Local:.*http/.test(String(d))) resolve();
  };
  vite.stdout.on('data', onData);
  vite.stderr.on('data', onData);
  setTimeout(resolve, 15000);
});
await ready;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--force-device-scale-factor=1'],
});

try {
  for (const width of [1600, 390]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${PORT}/${HARNESS_HTML}`, { waitUntil: 'networkidle0', timeout: 60000 });

    /* Scroll the whole page and wait for every card image to have real pixels.
       `fullPage: true` does NOT scroll, and `CardImage` is lazy, so a capture
       without this photographs grey boxes where the art is. And `naturalWidth`,
       not `complete`, because `complete` is also true for an image that
       finished FAILING. */
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page
      .waitForFunction(
        () => [...document.images].every(i => !i.loading || i.naturalWidth > 0 || i.currentSrc === ''),
        { timeout: 20000 }
      )
      .catch(() => console.log('  (some images never loaded; the shot says so)'));

    const report = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[data-scene]')) {
        const panel = [...el.querySelectorAll('section')].find(s =>
          /strategy/i.test(s.querySelector('h3')?.textContent ?? '')
        );
        const tiles = panel ? [...panel.querySelectorAll('button')] : [];
        const rect = el.getBoundingClientRect();
        const imgs = [...el.querySelectorAll('img')];
        /* WHERE THINGS ACTUALLY SIT, because a 390px-wide full-page capture is
           unreadable at any zoom a person can hold in their head, and squinting
           at one is how three screens were misread in a single day. */
        const aside = el.querySelector('aside');
        const cardImg = aside?.querySelector('img') ?? null;
        const readingBlock = [...el.querySelectorAll('div')].find(d =>
          /what the builder read/i.test(d.querySelector('span')?.textContent ?? '')
        );
        const top = e => (e ? Math.round(e.getBoundingClientRect().top + window.scrollY - rect.top) : null);
        out.push({
          scene: el.getAttribute('data-scene'),
          width: Math.round(rect.width),
          tiles: tiles.length,
          tileHeights: tiles.map(t => Math.round(t.getBoundingClientRect().height)),
          truncated: tiles.filter(t => t.scrollHeight > t.clientHeight + 1).length,
          images: imgs.length,
          brokenImages: imgs.filter(i => i.naturalWidth === 0).length,
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          cardWidth: cardImg ? Math.round(cardImg.getBoundingClientRect().width) : 0,
          asideHeight: aside ? Math.round(aside.getBoundingClientRect().height) : 0,
          /* The gap between where the commander column ends and where the
             controls beside it do — and whether that gap MATTERS.
             A sticky aside follows the scroll, so the leftover height at the
             bottom of the column is the reason the card is still on screen
             beside the budget slider rather than dead charcoal. Reporting the
             number without the flag is reporting the wrong thing. */
          deadInColumn:
            aside && panel
              ? Math.round(
                  el.getBoundingClientRect().height - aside.getBoundingClientRect().height
                )
              : 0,
          asideSticky: aside ? getComputedStyle(aside).position === 'sticky' : false,
          readingAt: top(readingBlock ?? null),
          readingLines: readingBlock ? readingBlock.querySelectorAll('li').length : 0,
        });
      }
      return out;
    });

    for (const r of report) {
      console.log(
        `  ${String(width).padStart(4)}  ${r.scene.padEnd(30)} tiles ${r.tiles}  ` +
          `clipped ${r.truncated}  card ${r.cardWidth}px  aside ${r.asideHeight}px  ` +
          `dead ${width >= 1280 ? r.deadInColumn + 'px' + (r.asideSticky ? ' (sticky, so it follows)' : ' !!') : 'n/a'}  ` +
          `reading ${r.readingLines} lines at y=${r.readingAt}  ` +
          `broken ${r.brokenImages}  overflowX ${r.overflowX}`
      );
    }

    const file = path.join(OUT, `configure-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  wrote ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
  vite.kill();
}
