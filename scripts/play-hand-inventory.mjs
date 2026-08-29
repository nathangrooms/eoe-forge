/**
 * What can a player actually DO by hand at this table?
 *
 * The task said: play a real game and write down every time you wanted to do
 * something by hand and could not. This is that, done by machine so the list is
 * a measurement rather than a memory. It plays a goldfish game to a real board,
 * then for every permanent it controls it reads back EVERY button on screen:
 * the preview's own actions, the by-hand panel, the ability panel, and the game
 * menu. What comes out is the inventory. What is missing from the inventory is
 * the task.
 *
 * Nothing here reads a debug global. `window.__deckmatrixGame` does not exist.
 * Everything is read off the DOM a player is looking at.
 *
 *   node scripts/play-hand-inventory.mjs [port]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, boardCards, openCard, closePreview } from './playDrive.mjs';

const PORT = process.argv[2] || '8081';
const BASE = `http://localhost:${PORT}`;
const OUT = '.shots/hand-inventory';

/** Every enabled button anywhere in the right-hand rail, with its section. */
const railButtons = page =>
  page.evaluate(() => {
    const rail = document.querySelector('[role="group"][aria-label]');
    if (!rail) return { label: null, buttons: [] };
    return {
      label: rail.getAttribute('aria-label'),
      buttons: [...rail.querySelectorAll('button')].map(b => ({
        text: (b.innerText || '').split('\n').join(' ').trim(),
        title: b.getAttribute('title') || '',
        disabled: b.disabled,
      })).filter(b => b.text || b.title),
    };
  });

/** Headings inside the rail, so we can see how the panel is sectioned. */
const railHeadings = page =>
  page.evaluate(() => {
    const rail = document.querySelector('[role="group"][aria-label]');
    if (!rail) return [];
    return [...rail.querySelectorAll('span, p, h1, h2, h3, h4')]
      .map(el => (el.innerText || '').trim())
      .filter(t => t && t.length < 60 && t === t.toUpperCase() && /[A-Z]/.test(t));
  });

/** Every top-level button on the table (HUD, turn controls). */
const tableButtons = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(b => !b.closest('[role="group"][aria-label]'))
      .map(b => (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').split('\n').join(' ').trim())
      .filter(Boolean)
  );

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { browser, page } = await launch({ width: 1600, height: 1000 });
  /* The dev server holds an HMR socket open, so `networkidle2` can never
     settle on a cold start. Give it room rather than changing the shared
     driver every other script depends on. */
  page.setDefaultNavigationTimeout(120000);
  const report = { table: [], menu: [], cards: [] };

  try {
    console.log('starting a goldfish game...');
    await startGame(page, { base: BASE, mode: 'GOLDFISH' });
    await playTurns(page, 6, m => console.log(m));

    const board = await boardCards(page);
    console.log(`\nboard: ${board.length} permanents`);

    report.table = [...new Set(await tableButtons(page))];
    console.log('\n--- TABLE CONTROLS (outside the rail) ---');
    for (const b of report.table) console.log('  ' + b);

    // The game menu, which is where the settings live.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find(b =>
        /menu/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || '')
      );
      el?.click();
    });
    await sleep(800);
    const menu = await railButtons(page);
    report.menu = menu.buttons;
    console.log('\n--- GAME MENU ---  rail:', menu.label);
    for (const b of menu.buttons) console.log(`  [${b.disabled ? ' ' : 'x'}] ${b.text}  |  ${b.title}`);
    await page.screenshot({ path: `${OUT}/menu.png` });
    await closePreview(page);

    // Every permanent on the mat.
    console.log('\n--- BY-HAND CONTROLS, PER PERMANENT ---');
    for (const card of board.slice(0, 6)) {
      await openCard(page, card.id);
      const rail = await railButtons(page);
      const heads = await railHeadings(page);
      report.cards.push({ name: card.name, headings: heads, buttons: rail.buttons });
      console.log(`\n  ${card.name}`);
      console.log(`    sections: ${heads.join(' | ')}`);
      console.log(`    buttons (${rail.buttons.length}): ${rail.buttons.map(b => b.text).filter(Boolean).join(' · ')}`);
      await page.screenshot({ path: `${OUT}/card-${card.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}.png` });
      await closePreview(page);
    }

    writeFileSync(`${OUT}/inventory.json`, JSON.stringify(report, null, 2));
    console.log(`\nwrote ${OUT}/inventory.json`);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
