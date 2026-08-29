/**
 * The owner's list, tried one at a time at a real table.
 *
 * "Can a player run a game entirely by hand when the engine declines to" is not
 * a question a test file can answer, because every test in `src/lib/game`
 * builds the action itself. So this opens a game in a browser, plays real
 * turns, and then tries to do the things a Commander player does with their
 * hands every game. Each one is a press on a control that has to already exist,
 * found by reading the DOM.
 *
 *   node scripts/playtest/by-hand-audit.mjs
 *
 * The preview's details column scrolls on its own (`min-h-0 overflow-y-auto`),
 * so a control below the fold is present and not visible. Reading only what is
 * on screen would report a control that exists as missing, which is the mirror
 * of the mistake this whole exercise is about, so every probe scrolls that
 * column to the bottom first and reads the buttons out of the DOM rather than
 * off a screenshot.
 *
 * Shots land in `.shots/by-hand/`. Every "cannot" is a finding.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, press, boardCards, openCard, closePreview, startGame, playTurns } from '../playDrive.mjs';

const BASE = process.env.BASE ?? 'http://localhost:8080';
const OUT = '.shots/by-hand';
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (what, can, detail) => {
  results.push({ what, can, detail });
  console.log(`  ${can ? 'CAN   ' : 'CANNOT'}  ${what}${detail ? ` — ${detail}` : ''}`);
};

/** Scroll every scrollable column in the preview to the bottom. */
const revealAll = page =>
  page.evaluate(async () => {
    const cols = [...document.querySelectorAll('div')].filter(
      el => el.scrollHeight > el.clientHeight + 8 && getComputedStyle(el).overflowY === 'auto'
    );
    for (const el of cols) el.scrollTop = el.scrollHeight;
    await new Promise(r => setTimeout(r, 120));
    return cols.length;
  });

/** Every enabled button in the document, by visible label. */
const allButtons = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(b => !b.disabled)
      .map(b => (b.innerText || b.getAttribute('aria-label') || '').split('\n').join(' ').trim())
      .filter(Boolean)
  );

/** Press a button whose label matches, anywhere. Returns the label pressed. */
const pressAny = (page, pattern) =>
  page.evaluate(src => {
    const re = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('button')].find(b => {
      if (b.disabled) return false;
      const text = (b.innerText || b.getAttribute('aria-label') || '').split('\n').join(' ').trim();
      return re.test(text);
    });
    if (!el) return null;
    const label = (el.innerText || el.getAttribute('aria-label') || '').split('\n').join(' ').trim();
    el.click();
    return label;
  }, pattern);

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

/** Every counter and mark chip drawn on one permanent, read off the board. */
const cardFace = (page, id) =>
  page.evaluate(instance => {
    const host = document.querySelector(`[data-instance="${instance}"]`);
    return host ? (host.innerText || '').split('\n').filter(Boolean).join(' | ') : '(gone)';
  }, id);

const run = async () => {
  const { browser, page } = await launch({ width: 1600, height: 1000 });
  const consoleErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));

  console.log('opening a goldfish game');
  await startGame(page, { base: BASE, mode: 'GOLDFISH' });
  await playTurns(page, 6, s => console.log(s));

  let board = await boardCards(page);
  console.log(`board: ${board.length} permanents`);
  await shot(page, '00-board');
  if (!board.length) {
    console.log('no permanents; nothing to test against');
    await browser.close();
    return;
  }

  const subject = await page.evaluate(ids => {
    for (const id of ids) {
      const host = document.querySelector(`[data-instance="${id}"]`);
      if (host && /\d+\s*\/\s*\d+/.test(host.innerText || '')) return id;
    }
    return ids[0];
  }, board.map(c => c.id));
  console.log(`subject: ${subject}`);

  const open = async () => {
    await openCard(page, subject);
    await revealAll(page);
    await sleep(250);
  };

  /* ---------------------------------------------------------------- 1 */
  console.log('\n1. make a Treasure');
  await open();
  let before = (await boardCards(page)).length;
  const t = await pressAny(page, '^Treasure$');
  await sleep(900);
  let after = (await boardCards(page)).length;
  await shot(page, '01-treasure');
  record('make a Treasure', !!t && after > before, t ? `pressed "${t}", ${before} -> ${after} permanents` : 'no Treasure control');

  /* ---------------------------------------------------------------- 2 */
  console.log('\n2. make a 1/1 army (three Soldiers)');
  await revealAll(page);
  before = (await boardCards(page)).length;
  let pressed = 0;
  for (let i = 0; i < 3; i++) {
    await revealAll(page);
    if (await pressAny(page, '^Soldier( 1/1)?$')) {
      pressed++;
      await sleep(800);
    }
  }
  after = (await boardCards(page)).length;
  await shot(page, '02-army');
  record('make a 1/1 army', pressed === 3 && after >= before + 3, `${pressed} presses, ${before} -> ${after}`);

  /* ---------------------------------------------------------------- 3 */
  console.log('\n3. copy a creature');
  await revealAll(page);
  before = (await boardCards(page)).length;
  const copied = await pressAny(page, '^Copy ');
  await sleep(900);
  after = (await boardCards(page)).length;
  await shot(page, '03-copy');
  record('copy a creature', !!copied && after > before, copied ? `pressed "${copied}", ${before} -> ${after}` : 'no copy control');

  /* ---------------------------------------------------------------- 4 */
  console.log('\n4. three +1/+1 counters');
  await revealAll(page);
  let plus = 0;
  for (let i = 0; i < 3; i++) {
    await revealAll(page);
    if (await pressAny(page, '^\\+1/\\+1')) {
      plus++;
      await sleep(600);
    }
  }
  await closePreview(page);
  await sleep(400);
  const face = await cardFace(page, subject);
  await shot(page, '04-counters');
  record('put three +1/+1 counters on something', plus === 3 && /\+3|3\b/.test(face), `${plus} presses, card reads "${face.slice(0, 70)}"`);

  /* ---------------------------------------------------------------- 5 */
  console.log('\n5. put a die / numbered marker on something');
  await open();
  const labels5 = await allButtons(page);
  const diceish = labels5.filter(l => /\bd(20|12|10|8|6|4)\b|roll/i.test(l));
  const markerControl = labels5.filter(l => /marker|mark\b/i.test(l));
  let markerSet = false;
  if (await pressAny(page, 'Write a marker|Add a marker|marker')) {
    await sleep(400);
    markerSet = await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')].find(
        i => i.offsetParent !== null && /marker|label|name/i.test(i.getAttribute('aria-label') || i.placeholder || '')
      );
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'd20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    });
    await sleep(800);
  }
  await closePreview(page);
  await sleep(300);
  const face5 = await cardFace(page, subject);
  await shot(page, '05-marker');
  record(
    'put a die on something',
    diceish.length > 0,
    diceish.length ? diceish.join(', ') : 'dice were removed on purpose (250f077); a die at a Magic table is a marker'
  );
  record('put a numbered marker on something', markerSet && /d20/i.test(face5), `controls: ${markerControl.join(', ') || 'none'}; card reads "${face5.slice(0, 70)}"`);

  /* ---------------------------------------------------------------- 6 */
  console.log('\n6. mill four');
  await closePreview(page);
  await sleep(300);
  const libSize = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find(b => /^LIBRARY/i.test((b.innerText || '').trim()));
      const m = el && (el.innerText || '').match(/(\d+)/);
      return m ? Number(m[1]) : null;
    });
  const before6 = await libSize();
  const openedLib = await pressAny(page, '^LIBRARY');
  await sleep(700);
  const millLabels = (await allButtons(page)).filter(l => /^Mill|Off the top|Draw|Exile|bottom/i.test(l));
  // The panel is rows of numbers under a label, so press the 4 in the Mill row.
  const milled = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter(
      d => /^Mill$/i.test((d.firstElementChild?.textContent || '').trim())
    );
    const row = rows[rows.length - 1];
    if (!row) return false;
    const four = [...row.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '4');
    if (!four) return false;
    four.click();
    return true;
  });
  await sleep(900);
  const after6 = await libSize();
  const graveyard = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => /^GRAVEYARD/i.test((b.innerText || '').trim()));
    const m = el && (el.innerText || '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  });
  await shot(page, '06-mill');
  record(
    'mill four',
    milled && before6 !== null && after6 === before6 - 4,
    `library ${before6} -> ${after6}, graveyard ${graveyard}; panel opened: ${!!openedLib}; controls: ${millLabels.slice(0, 6).join(' | ')}`
  );
  const searchNeeded = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /Stop searching/i.test(b.innerText || ''))
  );
  record('mill without revealing your library', milled && !searchNeeded, `library was being searched: ${searchNeeded}`);

  /* ---------------------------------------------------------------- 7 */
  console.log('\n7. exile face down');
  await page.evaluate(() => document.querySelector('[aria-label="Close the zone"]')?.click());
  await sleep(400);
  await open();
  const labels7 = await allButtons(page);
  const faceDown = labels7.filter(l => /face.?down|turn.*face|morph|manifest/i.test(l));
  const exile = labels7.filter(l => /exile/i.test(l));
  await shot(page, '07-facedown');
  record('exile face down', faceDown.length > 0, faceDown.length ? faceDown.join(', ') : `only a face-up exile is offered: ${exile.join(', ') || 'none'}`);

  /* ---------------------------------------------------------------- 8 */
  console.log('\n8. set your own life to 27');
  await closePreview(page);
  await sleep(300);
  const seatOpened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button,[role="button"]')].find(b =>
      /life|seat/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || '')
    );
    if (!el) return null;
    el.click();
    return el.getAttribute('aria-label') || el.getAttribute('title');
  });
  await sleep(800);
  let lifeSet = false;
  if (seatOpened) {
    lifeSet = await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')].find(
        i => i.offsetParent !== null && /life|total/i.test(i.getAttribute('aria-label') || i.placeholder || '')
      );
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '27');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const form = input.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    });
    await sleep(900);
  }
  const lifeShown = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter(el => el.childElementCount === 0 && /^\d{1,3}$/.test((el.innerText || '').trim()))
      .map(el => (el.innerText || '').trim())
  );
  await shot(page, '08-life');
  record('set your own life to 27', lifeSet && lifeShown.includes('27'), `seat control: ${seatOpened ?? 'none'}, numbers on screen: ${[...new Set(lifeShown)].join(',')}`);

  /* ---------------------------------------------------------------- 9 */
  console.log('\n9. goad a creature');
  await open();
  const labels9 = await allButtons(page);
  await shot(page, '09-goad');
  record('goad a creature', labels9.some(l => /goad/i.test(l)), 'the word goad appears on no control');

  /* --------------------------------------------------------- extras */
  console.log('\nextras the census predicted were missing');
  await page.evaluate(() => document.querySelector('[aria-label="Close the zone"]')?.click());
  await sleep(300);
  await open();
  const labels = await allButtons(page);
  const find = re => labels.filter(l => re.test(l));

  const dmgBefore = await cardFace(page, subject);
  const dmg = await pressAny(page, '^Damage \+2$');
  await sleep(700);
  await closePreview(page);
  await sleep(300);
  const dmgAfter = await cardFace(page, subject);
  await shot(page, '10-damage');
  record('mark damage on a creature by hand', !!dmg, dmg ? `pressed "${dmg}"; card "${dmgBefore.slice(0, 40)}" -> "${dmgAfter.slice(0, 40)}"` : 'no damage control');

  // Damage to a seat, from the seat panel.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button,[role="button"]')].find(b =>
      /life/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || '')
    );
    el?.click();
  });
  await sleep(700);
  const seatLabels = await allButtons(page);
  const dealt = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('*')].filter(
      el => el.childElementCount === 0 && /^Damage$/i.test((el.innerText || '').trim())
    );
    const section = heads[0]?.closest('div')?.parentElement;
    const three = section && [...section.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '3');
    if (!three) return false;
    three.click();
    return true;
  });
  await sleep(700);
  const lifeNow = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(
      e => e.childElementCount === 0 && /^\d{1,3}$/.test((e.innerText || '').trim()) && e.className.includes('text-4xl')
    );
    return el ? (el.innerText || '').trim() : null;
  });
  await shot(page, '11-seat-damage');
  record('deal damage to a player by hand', dealt, `seat panel offers: ${seatLabels.filter(l => /^(1|2|3|5|as poison)$/.test(l)).join(', ') || 'nothing'}; life now ${lifeNow}`);

  record('attach / equip by hand', find(/^Put it on$/i).length > 0 || find(/Take it off/i).length > 0, 'checked on the open card; an Equipment has to be on the board for the row to appear');
  record('add mana to your pool by hand', find(/add mana|mana pool/i).length > 0, find(/add mana|mana pool/i).join(', ') || 'no mana control');

  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, consoleErrors }, null, 2));
  console.log(`\nconsole errors: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`);
  console.log(`\nCAN: ${results.filter(r => r.can).length} / ${results.length}`);
  await browser.close();
};

run().catch(e => {
  console.error(e);
  process.exit(1);
});
