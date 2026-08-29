/**
 * Two questions the code cannot answer on its own.
 *
 * 1. THE SETTINGS. The owner says they "dont seem right". A setting that lies
 *    is worse than a missing one, so each one is pressed and the board is asked
 *    whether the thing the label promises actually changed.
 * 2. THE EQUIPMENT. `ATTACH` is off the unreachable list because the compiler
 *    expands "Equip {2}" into an activated ability, which is true for a card
 *    the compiler can read. This asks whether a real Equipment dealt into a
 *    real game offers a real equip control.
 *
 * Free cast is tested on the OPENING HAND, not late. By turn five a goldfish
 * has played everything it can and the hand is one card, so "nothing changed"
 * would be true of a working toggle as well as a broken one.
 *
 *   node scripts/play-settings-probe.mjs [port]
 */
import { mkdirSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, boardCards, openCard, closePreview } from './playDrive.mjs';

const PORT = process.argv[2] || '8081';
const BASE = `http://localhost:${PORT}`;
const OUT = '.shots/settings-probe';

/** The preview rail: the one surface that carries an aria-labelled group. */
const preview = page =>
  page.evaluate(() => {
    const el = document.querySelector('[role="group"][aria-label]');
    if (!el) return null;
    return {
      label: el.getAttribute('aria-label'),
      buttons: [...el.querySelectorAll('button')].map(b => (b.innerText || '').split('\n').join(' ').trim()).filter(Boolean),
      text: (el.innerText || '').split('\n').map(s => s.trim()).filter(Boolean),
    };
  });

/** Everything drawn in the right third of the window: that is the rail. */
const rightRail = page =>
  page.evaluate(() => {
    const cut = window.innerWidth * 0.62;
    return [...document.querySelectorAll('button')]
      .filter(b => b.getBoundingClientRect().left > cut && b.getBoundingClientRect().width > 20)
      .map(b => ({
        text: (b.innerText || '').split('\n').join(' ').trim(),
        title: b.getAttribute('title') || '',
        pressed: b.getAttribute('aria-pressed'),
      }))
      .filter(b => b.text);
  });

const openMenu = async page => {
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(b => /game menu/i.test(b.getAttribute('title') || b.getAttribute('aria-label') || ''))
      ?.click();
  });
  await sleep(900);
};

const pressRight = (page, re) =>
  page.evaluate(src => {
    const cut = window.innerWidth * 0.62;
    const el = [...document.querySelectorAll('button')].find(
      b => !b.disabled && b.getBoundingClientRect().left > cut &&
        new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/** For every card in hand: does the preview offer a cast, and what blocks it. */
const handVerdicts = async page => {
  const hand = await page.evaluate(() => {
    const h = window.innerHeight;
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 40 && r.top > h * 0.7; })
      .map(el => el.getAttribute('data-instance'));
  });
  const out = [];
  for (const id of hand) {
    await openCard(page, id);
    const p = await preview(page);
    out.push({
      name: p?.label || '?',
      castable: !!p?.buttons.some(b => /^(CAST|PLAY LAND|PLAY THIS LAND|SUMMON)/i.test(b)),
    });
    await closePreview(page);
  }
  return out;
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { browser, page } = await launch({ width: 1600, height: 1000 });
  page.setDefaultNavigationTimeout(120000);

  try {
    await startGame(page, { base: BASE, mode: 'GOLDFISH' });

    /* ---------------- FREE CAST, on the opening hand ---------------- */
    const before = await handVerdicts(page);
    console.log('\n--- OPENING HAND, free cast OFF ---');
    for (const c of before) console.log(`  ${c.castable ? 'CAN' : '   '}  ${c.name}`);

    await openMenu(page);
    const menu = await rightRail(page);
    console.log('\n--- GAME MENU, every control it draws ---');
    for (const b of menu) {
      console.log(`  ${b.pressed !== null ? `[${b.pressed === 'true' ? 'on ' : 'off'}]` : '[   ]'} ${b.text}${b.title ? '  |  ' + b.title : ''}`);
    }
    await page.screenshot({ path: `${OUT}/menu.png` });

    const pressed = await pressRight(page, /^Free cast/i);
    console.log('\npressed Free cast:', pressed);
    await sleep(600);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find(b => /close the menu/i.test(b.getAttribute('title') || ''))?.click();
    });
    await sleep(600);

    const after = await handVerdicts(page);
    console.log('\n--- SAME HAND, free cast ON ---');
    for (const c of after) console.log(`  ${c.castable ? 'CAN' : '   '}  ${c.name}`);
    const gained = after.filter(c => c.castable).length - before.filter(c => c.castable).length;
    console.log(`\nFREE CAST: castable ${before.filter(c => c.castable).length} -> ${after.filter(c => c.castable).length}  (${gained >= 0 ? '+' : ''}${gained})`);

    /* ---------------- THE EQUIPMENT ---------------- */
    await playTurns(page, 5, m => console.log(m));
    const board = await boardCards(page);
    const equip = board.find(c => /hammer|sword|blade|bow|boots|greaves|helm|banner|shield/i.test(c.name));
    if (equip) {
      await openCard(page, equip.id);
      const p = await preview(page);
      console.log(`\n--- ${equip.name} ---`);
      console.log('  buttons:', (p?.buttons || []).join(' · '));
      console.log('  EQUIP OFFERED:', (p?.buttons || []).some(b => /equip|attach/i.test(b)));
      await page.screenshot({ path: `${OUT}/equipment.png` });
      await closePreview(page);
    } else {
      console.log('\nno Equipment reached the board this run:', board.map(c => c.name).join(', '));
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
