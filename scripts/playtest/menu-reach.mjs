/**
 * How far down the game menu is each setting, and can you see it at all.
 *
 * Owner: the settings are wrong. Opening the menu on a 1600x1000 board shows
 * CARD SIZE, then a sixteen-swatch PLAYMAT grid, then GIVE UP pinned at the
 * bottom. Everything in between — free cast, auto-advance, pause opponents,
 * redraw your hand, seating — is below the fold behind a preference you set
 * once and never touch again.
 *
 * This measures it: the scroll offset of every section, and which of them are
 * on screen when the menu opens.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, startGame, playTurns } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const mode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'GOLDFISH';
const OUT = '.shots/menu-reach';
mkdirSync(OUT, { recursive: true });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode });
  await playTurns(page, 3, s => console.log(s));

  await page.evaluate(() => document.querySelector('button[aria-label^="Game menu"]')?.click());
  await sleep(900);
  await page.screenshot({ path: `${OUT}/menu-${mode}.png` });

  const read = await page.evaluate(() => {
    // The scrolling column of the menu.
    const scroller = [...document.querySelectorAll('*')].find(
      el =>
        el.scrollHeight > el.clientHeight + 20 &&
        /CARD SIZE/i.test(el.innerText || '') &&
        el.getBoundingClientRect().width < 520
    );
    const headings = [...document.querySelectorAll('*')]
      .filter(el => !el.children.length && /^[A-Z][A-Z ]{3,}$/.test((el.innerText || '').trim()))
      .map(el => {
        const r = el.getBoundingClientRect();
        return { text: el.innerText.trim(), top: Math.round(r.top), onScreen: r.top >= 0 && r.bottom <= innerHeight };
      });
    const controls = [...document.querySelectorAll('button')]
      .map(b => {
        const r = b.getBoundingClientRect();
        return {
          label: (b.innerText || '').split('\n')[0].trim().slice(0, 40),
          top: Math.round(r.top),
          visible: r.height > 0 && r.top >= 0 && r.bottom <= innerHeight,
        };
      })
      .filter(c => c.label);
    return {
      scroll: scroller
        ? { height: scroller.clientHeight, content: scroller.scrollHeight, hidden: scroller.scrollHeight - scroller.clientHeight }
        : null,
      headings,
      controls,
    };
  });

  console.log(`\nTHE GAME MENU IN ${mode}`);
  if (read.scroll) {
    console.log(
      `  the column is ${read.scroll.height}px tall holding ${read.scroll.content}px of settings: ` +
        `${read.scroll.hidden}px below the fold`
    );
  }
  console.log('  sections, in order:');
  for (const h of read.headings) {
    console.log(`    ${h.onScreen ? 'on screen ' : 'BELOW    '} ${String(h.top).padStart(5)}px  ${h.text}`);
  }
  const wanted = ['Auto-advance steps', 'Free cast', 'Pause opponents', 'Pause the opponent', 'Redraw your hand'];
  console.log('  the table settings:');
  for (const name of wanted) {
    const found = read.controls.find(c => c.label === name);
    if (!found) console.log(`    absent    ${name}`);
    else console.log(`    ${found.visible ? 'on screen ' : 'BELOW    '} ${String(found.top).padStart(5)}px  ${name}`);
  }
  writeFileSync(`${OUT}/reach-${mode}.json`, JSON.stringify(read, null, 2));
  console.log(`\nerrors: ${errors.length}`);
  await browser.close();
})();
