/**
 * A BOARD WITH THINGS ON IT, on the viewer's own seat.
 *
 * Every screenshot pass on this project so far has driven the game by pressing
 * END TURN, which is honest about the engine and dishonest about the LOOK: the
 * viewer's mat stays empty all game and the near half of every screenshot is
 * bare mat. Judging the layout off that is judging a screen no player will see.
 *
 * So this one plays. Each of its own turns it plays a land, then opens hand
 * cards and casts whatever the preview will let it cast, until the board is
 * full enough to be worth looking at. Then it screenshots at several widths.
 *
 * Usage: BASE=http://127.0.0.1:8080 node scripts/playtest/board-shot.mjs <tag>
 */
import fs from 'node:fs';
import { openHarness, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const TAG = process.argv[2] || 'run';
const OUT = `.shots/board-${TAG}`;

/**
 * Open a hand card the fan says is playable.
 *
 * By `aria-label`, which is how `player-can.mjs` does it and the only handle
 * that survives the fan's rotation. A geometric guess at "cards near the bottom"
 * was tried first and found nothing at all: the fan's own buttons are rotated
 * and lifted, so their rectangles are not where a naive bottom-band filter
 * looks. That cost one whole silent run reporting "played 0".
 */
const openHandCard = (page, src) => page.evaluate(s => {
  const rx = new RegExp(s, 'i');
  const el = [...document.querySelectorAll('button')].find(b => {
    const label = b.getAttribute('aria-label') || '';
    return /Click to preview/i.test(label) && rx.test(label);
  });
  if (!el) return null;
  el.click();
  return (el.getAttribute('aria-label') || '').slice(0, 70);
}, src);

const pressPlay = page => page.evaluate(() => {
  const wanted = /^(PLAY LAND|CAST|CAST AT )/i;
  const b = [...document.querySelectorAll('button')]
    .find(x => !x.disabled && wanted.test((x.innerText || '').trim()));
  if (!b) return null;
  const label = (b.innerText || '').trim().replace(/\n/g, ' ');
  b.click();
  return label;
});

const closePreview = page => page.evaluate(() => {
  const x = [...document.querySelectorAll('button')]
    .find(b => /Close the preview/i.test(b.getAttribute('title') || ''));
  if (x) { x.click(); return true; }
  return false;
});

const MEASURE = page => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const boxes = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 30 || r.height < 30) continue;
    if (!/scryfall/.test(img.currentSrc || img.src || '')) continue;
    // Board only: above the hand band, below the HUD.
    if (r.top < 56 || r.bottom > vh - 150) continue;
    boxes.push(r);
  }
  let worst = 0, pairs = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x <= 0 || y <= 0) continue;
      pairs++;
      const f = (x * y) / Math.min(a.width * a.height, b.width * b.height);
      if (f > worst) worst = f;
    }
  }
  const g = window.__dmGame;
  return {
    boardImgs: boxes.length,
    worstOverlap: +worst.toFixed(3),
    overlappingPairs: pairs,
    smallestCard: boxes.length ? Math.round(Math.min(...boxes.map(b => b.width))) : 0,
    largestCard: boxes.length ? Math.round(Math.max(...boxes.map(b => b.width))) : 0,
    bf: g ? g.players.map(p => p.zones.battlefield.length).join('/') : null,
    turn: g?.turn, life: g ? g.players.map(p => p.life).join('/') : null,
  };
});

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1200);
  /* The forward control is not labelled the same in every mode — goldfish says
     something other than "Start a 2-player game" — so press whatever the step's
     own forward button says until a game exists. `playFlow.forwardLabelFor`
     owns those words; this only has to find the button they are on. */
  for (let i = 0; i < 12; i++) {
    const pressed = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => !x.disabled && /^(start|deal|shuffle|sit down|play)/i.test((x.innerText || '').trim()));
      if (!b) return null;
      const label = (b.innerText || '').trim();
      b.click();
      return label;
    });
    if (pressed) console.log('pressed:', pressed);
    if (await page.evaluate(() => !!window.__dmGame)) break;
    await sleep(1200);
  }
  await page.waitForFunction('!!window.__dmGame', { timeout: 60000, polling: 400 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/00-mulligan.png` });
  await pressText(page, /^Keep$/);
  await sleep(2000);

  /*
   * PAUSE THE BOTS AND TURN FREE CAST ON, through the game menu, exactly as a
   * player would.
   *
   * Both are needed and each was learned the hard way. Without paused bots the
   * driver — which presses the primary control to keep the game moving, and
   * therefore never blocks — was dead on turn 16 with four permanents played,
   * so the "board" screenshot was of a corpse. Without free cast a seeded deck
   * at turn 8 has four lands and almost nothing in hand is castable, so the mat
   * fills at about one card every three turns.
   *
   * Neither changes what is DRAWN. They change what the driver can reach.
   */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /card size and table settings/i.test(x.getAttribute('title') || ''));
    if (b) b.click();
  });
  await sleep(900);
  const menu = await page.evaluate(() => {
    const first = el => ((el.innerText || '').split(String.fromCharCode(10))[0] || '');
    const hit = [];
    for (const label of [/free cast/i, /bots?/i]) {
      const b = [...document.querySelectorAll('button')].find(x => label.test(first(x)));
      if (b) { hit.push(first(b)); b.click(); }
    }
    return hit;
  });
  console.log('menu toggles:', JSON.stringify(menu));
  await sleep(600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /card size and table settings/i.test(x.getAttribute('title') || ''));
    if (b) b.click();
  });
  await sleep(700);

  const played = [];
  for (let i = 0; i < 420; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (g.bf >= 14) break;

    const mine = g.active === 'p1' && /main/.test(g.step || '');
    if (mine) {
      /* A land first — the mana is what makes the rest possible — then as many
         spells as the preview will still offer Cast on. */
      /* Keep going until the fan stops offering anything: a land first, then
         spells for as long as one is on offer. */
      for (let attempt = 0; attempt < 7; attempt++) {
        const opened =
          (attempt === 0 && (await openHandCard(page, 'You can play this as a land drop'))) ||
          (await openHandCard(page, 'You can cast this\.'));
        if (!opened) break;
        await sleep(450);
        const did = await pressPlay(page);
        if (did) played.push(`T${g.turn} ${did.slice(0, 24)}`);
        await sleep(700);
        await closePreview(page);
        await sleep(200);
      }
    }
    await unblock(page);
    await sleep(240);
  }

  const g = await gameState(page);
  console.log(`played ${played.length}:`, played.slice(-12).join(' | '));
  console.log('state', JSON.stringify(g));

  for (const [w, h] of [[1600, 1000], [1920, 1080], [1366, 768]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await sleep(1400);
    await page.screenshot({ path: `${OUT}/board-${w}x${h}.png` });
    const m = await MEASURE(page);
    console.log(`${w}x${h}`, JSON.stringify(m));
  }

  console.log(`HEALTH page=${health.pageErrors.length} console=${health.consoleErrors.length} net=${health.netFails.length}`);
  [...new Set(health.pageErrors)].slice(0, 5).forEach(e => console.log('  PAGEERR ' + e));
  await browser.close();
};

run().catch(e => { console.error('FAILED', e); process.exit(1); });
