/**
 * Photograph and MEASURE the playmat page, and the one rendering claim in it
 * that could quietly be wrong.
 *
 * ## The claim worth checking
 *
 * A mat is one element with one `background-image` holding six to nine layers.
 * Adding an uploaded picture to that stack means adding `background-size`,
 * which is a COMMA LIST that has to line up with the layers one for one. Get
 * the order wrong and a gradient gets sized `cover` and a photograph gets sized
 * `auto`, which tiles it at its natural size. On a 1920 px picture in a 948 px
 * mat that looks almost right, which is the worst way for it to be wrong.
 *
 * So this does not only take pictures. It reads the computed style back off a
 * real `Playmat` and asserts that the picture layer, and only the picture
 * layer, is `cover`, and that the drawn surfaces still emit no sizing at all.
 *
 * ## What it cannot see
 *
 * It runs signed out, because there are no test credentials. That means the
 * library is empty and the upload button is correctly disabled, so the paths it
 * covers are: the page, the surfaces, the colours, the copy, and the image
 * layer itself against a picture generated in the page. It does NOT cover the
 * round trip to storage. Do not read a green run here as "uploading works".
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/playmat';
const BASE = process.env.BASE || 'http://127.0.0.1:8137';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'playmat-harness.html';
const HARNESS_ENTRY = 'src/dev/__playmatHarness.tsx';

const writeIfChanged = (file, body) => {
  try {
    if (fs.readFileSync(file, 'utf8') === body) return;
  } catch {
    /* absent */
  }
  fs.writeFileSync(file, body);
};

writeIfChanged(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Playmat harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.mkdirSync('src/dev', { recursive: true });
writeIfChanged(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness. Written by scripts/playmat-shots.mjs.
 * Not shipped, not routed, not built. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { Playmat } from '../components/play/Playmat';
import { PlaymatManager } from '../components/play/PlaymatManager';

/* A picture that is deliberately the WRONG shape for a mat: square, against a
   strip that is five times wider than it is tall. Diagonal stripes make a
   squash or a tile obvious to the eye as well as to the assertion. Base64 PNG
   rather than an SVG data URI, because the latter is full of spaces and the
   component refuses any URL that could end url() early. */
function testPicture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#123'; c.fillRect(0, 0, 512, 512);
  for (let i = -512; i < 1024; i += 64) {
    c.strokeStyle = i % 128 === 0 ? '#e8c37a' : '#7aa7e8';
    c.lineWidth = 22;
    c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 512, 512); c.stroke();
  }
  c.fillStyle = '#fff'; c.font = 'bold 64px sans-serif';
  c.fillText('512', 20, 70);
  return canvas.toDataURL('image/png');
}

function Harness() {
  const [picture, setPicture] = useState<string | null>(null);
  useEffect(() => { setPicture(testPicture()); }, []);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div data-probe="image-mats" className="space-y-3">
        <Playmat
          colors={['U', 'G']}
          tone="viewer"
          image={picture}
          className="h-[369px] w-[948px]"
        />
        <Playmat
          colors={['U', 'G']}
          tone="viewer"
          image={null}
          className="h-[369px] w-[948px]"
        />
      </div>
      <div className="mt-8">
        <PlaymatManager colors={['U', 'G']} />
      </div>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/play/mats']}>
          <Harness />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
`
);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => {
  if (m.type() === 'error') log('  [error]', m.text().slice(0, 200));
});

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1500);

/* ------------------------------------------------------------ measurements */

const probe = await page.evaluate(() => {
  /* A background-image value cannot be split on commas with a regex: every
     layer is a gradient full of `hsl(0 0% 0% / 0.13)` and nested parentheses.
     The first version of this script tried and reported 26 layers where there
     were 8, so the splitter counts depth. */
  const splitLayers = value => {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };

  const wrap = document.querySelector('[data-probe="image-mats"]');
  const mats = Array.from(wrap?.children ?? []);
  return mats.map(el => {
    const s = getComputedStyle(el);
    const images = splitLayers(s.backgroundImage);
    return {
      layers: images.length,
      pictureIndex: images.findIndex(v => v.startsWith('url(')),
      textures: images.filter(v => v.startsWith('repeating-linear-gradient')),
      washes: images.filter(v => v.startsWith('linear-gradient')),
      sizes: splitLayers(s.backgroundSize),
      repeats: splitLayers(s.backgroundRepeat),
      positions: splitLayers(s.backgroundPosition),
      box: { w: el.clientWidth, h: el.clientHeight },
    };
  });
});

const [withPicture, withoutPicture] = probe;
const sizes = withPicture.sizes;

const checks = [
  /* A picture takes the COLOUR WASH's place and nothing else's. Dyeing
     somebody's photograph is not what choosing a photograph means, so the
     tint is dropped; the weave and the table light are not, because those are
     what sit the cards down onto the surface. */
  ['a picture takes the place of the colour wash', withPicture.layers === withoutPicture.layers],
  ['the colour wash is gone while a picture is live', withPicture.washes.length === 0 && withoutPicture.washes.length === 1],
  ['the weave is untouched by the picture', JSON.stringify(withPicture.textures) === JSON.stringify(withoutPicture.textures) && withPicture.textures.length > 0],
  ['the picture is the last layer, under everything else', withPicture.pictureIndex === withPicture.layers - 1],
  ['the size list lines up with the layer list', sizes.length === withPicture.layers],
  ['the picture layer is sized cover', sizes[withPicture.pictureIndex] === 'cover'],
  ['every other layer is left alone', sizes.slice(0, -1).every(v => v === 'auto')],
  ['the picture does not repeat', withPicture.repeats[withPicture.pictureIndex] === 'no-repeat'],
  ['the picture is centred', withPicture.positions[withPicture.pictureIndex] === '50% 50%'],
  ['a drawn surface has no picture in it', withoutPicture.pictureIndex === -1],
  ['a drawn surface is sized exactly as it always was', withoutPicture.sizes.every(v => v === 'auto')],
  ['the mat is still the box it was', withPicture.box.w === 948 && withPicture.box.h === 369],
];

log('\nplaymat image layer');
for (const [name, ok] of checks) log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
log(`  layers with picture: ${withPicture.layers}, without: ${withoutPicture.layers}`);
log(`  background-size: ${withPicture.sizes.join(', ')}`);

/* ---------------------------------------------------------------- pictures */

await page.screenshot({ path: `${OUT}/01-image-layer.png`, clip: { x: 0, y: 0, width: 1000, height: 780 } });
await page.evaluate(() => window.scrollTo(0, 800));
await sleep(400);
await page.screenshot({ path: `${OUT}/02-page.png` });
await page.evaluate(() => window.scrollTo(0, 1700));
await sleep(400);
await page.screenshot({ path: `${OUT}/03-page-lower.png` });

await page.setViewport({ width: 430, height: 1000, deviceScaleFactor: 1 });
await page.evaluate(() => window.scrollTo(0, 900));
await sleep(500);
await page.screenshot({ path: `${OUT}/04-narrow.png` });

const overflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
log(`\nnarrow viewport: scrollWidth ${overflow.scrollWidth} vs clientWidth ${overflow.clientWidth}`);

await browser.close();

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  log(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
log('\nall checks passed');
