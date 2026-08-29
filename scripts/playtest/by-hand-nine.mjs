/**
 * The nine things a player has to be able to do by hand, tried one at a time.
 *
 * The compiled bridge runs the abilities of about 2.7% of the catalogue, so
 * the question that decides whether play mode works is not "does the reducer
 * accept CREATE_TOKEN", it is "with a real board on screen, can I make a
 * Treasure". Those are different questions and this project has answered the
 * first while reporting the second more than once.
 *
 * Every task below is pressed through the controls a player actually sees,
 * found by reading the DOM, and judged on the board AFTER the press. Nothing
 * here imports `src/lib/game`: if the only way to do a thing is to construct
 * the action yourself, then for a player the answer is no.
 *
 * TWO MEASUREMENT TRAPS, both hit on the first run and both fixed here rather
 * than reported as app defects:
 *   - the open preview draws its own copy of the card at a LARGER width than
 *     the mat, so "the widest cluster" became the preview and the board looked
 *     like it had one permanent on it;
 *   - the library's mill control is a row headed `Mill` followed by bare
 *     buttons `1 2 3 4 5 10`, so grepping button text for "mill" finds nothing
 *     and reports a control that is on screen as missing.
 *
 *   node scripts/playtest/by-hand-nine.mjs --base http://localhost:8081
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  launch, sleep, press, openCard, closePreview,
  previewMenu, pressInPreview, startGame, playTurns, previewPanel,
} from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const OUT = '.shots/by-hand-nine';
mkdirSync(OUT, { recursive: true });

/** Permanents on the MAT: exclude anything inside an open panel. */
const matCards = async page => {
  // Cards travel between zones with an animation, so a read taken during a
  // turn change can land while every card is mid-flight. Retry rather than
  // report an empty board that is not empty.
  for (let i = 0; i < 6; i++) {
    const rows = await matCardsOnce(page);
    if (rows.length) return rows;
    await sleep(700);
  }
  return [];
};

const matCardsOnce = page =>
  page.evaluate(sel => {
    const h = window.innerHeight;
    const panel = document.querySelector(sel);
    const rows = [...document.querySelectorAll('[data-instance]')]
      .filter(el => !panel || !panel.contains(el))
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-instance'),
          name: el.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
          w: Math.round(r.width),
          left: Math.round(r.left),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
        };
      });
    const above = rows.filter(r => r.bottom < h * 0.8 && r.top > 40 && r.w > 40);
    if (!above.length) return [];
    /* Zone TILES — the graveyard, exile and command-zone piles in the seat's
       left rail — are `GameCardView`s too, and clicking one opens a zone panel
       rather than a card. They are the only cards drawn left of the mat, so
       they go by position. Everything else counts, including the artifact
       column, which draws its permanents narrower than the creature rows. */
    const railEdge = Math.min(...above.map(r => r.left)) + 200;
    return above.filter(r => r.left > railEdge - 200 + 120);
  }, previewPanel);

const handCards = page =>
  page.evaluate(() => {
    const h = window.innerHeight;
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.top > h * 0.72;
      })
      .map(el => ({ id: el.getAttribute('data-instance') }));
  });

const turnNow = page =>
  page.evaluate(() => (document.body.innerText.match(/TURN\s*\n?\s*(\d+)/) || [])[1] || '?');

const zoneCounts = page =>
  page.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll('button')) {
      const m = (b.innerText || '').trim().match(/^(LIBRARY|GRAVEYARD|EXILE|COMMAND)\s*\n?\s*(\d+)$/i);
      if (m) out[m[1].toUpperCase()] = +m[2];
    }
    return out;
  });

const lifeShown = page =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      /^\d+\s*\n?\s*LIFE$/i.test((x.innerText || '').trim())
    );
    return b ? +(b.innerText.match(/\d+/) || [0])[0] : null;
  });

const cardText = (page, id) =>
  page.evaluate(
    (i, sel) => {
      const panel = document.querySelector(sel);
      const host = [...document.querySelectorAll(`[data-instance="${i}"]`)].find(
        el => !panel || !panel.contains(el)
      );
      return host ? (host.innerText || '').split('\n').join(' · ').trim() : null;
    },
    id,
    previewPanel
  );

const results = [];
const record = (task, ok, note) => {
  results.push({ task, ok, note });
  console.log(`  ${ok ? 'CAN   ' : 'CANNOT'}  ${task}  — ${note}`);
};

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });

  console.log('starting a goldfish game...');
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 6, s => console.log(s));

  let board = await matCards(page);
  console.log(`board: ${board.length} permanents — ${board.map(b => b.name || b.id).join(', ')}`);
  await page.screenshot({ path: `${OUT}/00-board.png` });
  if (!board.length) {
    console.log('NO PERMANENTS ON THE MAT. Nothing below is testable.');
    await browser.close();
    return;
  }
  const startTurn = await turnNow(page);

  // A creature if there is one: copy, counters and goad all want a creature.
  const creature = board.find(b => /Apprentice|Pack|Urchin|Sentinel|Golem|Wizard/i.test(b.name)) || board[0];
  const opened = await openCard(page, creature.id);
  console.log(`opened the preview on ${creature.name || creature.id}: ${opened}`);
  const menu = (await previewMenu(page)) || [];
  writeFileSync(`${OUT}/menu.json`, JSON.stringify(menu, null, 2));
  await page.screenshot({ path: `${OUT}/01-preview.png` });

  const byHeading = {};
  for (const row of menu) (byHeading[row.heading] ||= []).push(row.label);
  console.log(`\npreview offers ${menu.length} controls:`);
  for (const [h, labels] of Object.entries(byHeading)) console.log(`  ${h}\n     ${labels.join(' | ')}`);
  console.log('');
  const offers = re => menu.filter(r => re.test(r.label)).map(r => r.label);

  /* 1. make a Treasure */
  {
    const before = (await matCards(page)).length;
    const pressed = await pressInPreview(page, '^Treasure$');
    await sleep(900);
    const after = (await matCards(page)).length;
    await page.screenshot({ path: `${OUT}/02-treasure.png` });
    record('make a Treasure', pressed && after > before, `board ${before} -> ${after}`);
  }

  /* 2. make a 1/1 army */
  {
    const before = (await matCards(page)).length;
    let n = 0;
    // Soldier is behind "15 more".
    await pressInPreview(page, '^15 more$');
    await sleep(400);
    for (let i = 0; i < 3; i++) {
      if (await pressInPreview(page, '^Soldier')) n++;
      await sleep(500);
    }
    const after = (await matCards(page)).length;
    await page.screenshot({ path: `${OUT}/03-army.png` });
    record('make a 1/1 army (three Soldiers)', n === 3 && after >= before + 3,
      `pressed ${n}, board ${before} -> ${after}`);
  }

  /* 3. copy a creature */
  {
    const before = (await matCards(page)).length;
    const pressed = await pressInPreview(page, '^Cop(y|ies)');
    await sleep(900);
    const after = (await matCards(page)).length;
    await page.screenshot({ path: `${OUT}/04-copy.png` });
    record('copy a creature', pressed && after > before,
      `control ${JSON.stringify(offers(/^cop/i))}, board ${before} -> ${after}`);
  }

  /* 4. three +1/+1 counters */
  {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      /* `^\+1/\+1` alone also matches the REMOVE control, which the panel draws
         FIRST the moment the first counter lands — so three presses added one,
         took it off and added it again, and the card read 3/3 with the app
         behaving perfectly. Match the add. */
      if (await pressInPreview(page, '^\\+1/\\+1 \\+1')) n++;
      await sleep(750);
    }
    await sleep(400);
    const onCard = await cardText(page, creature.id);
    const inPanel = await page.evaluate(sel => {
      const p = document.querySelector(sel);
      return p ? (p.innerText || '').split('\n').join(' · ').slice(0, 220) : null;
    }, previewPanel);
    await page.screenshot({ path: `${OUT}/05-counters.png` });
    // A 2/2 with three +1/+1 counters is a 5/5 carrying "+3". Anything else
    // is a press that did not land, and "the card says 3" would accept 3/3.
    record('three +1/+1 counters', n === 3 && /\+3/.test(onCard || ''),
      `pressed ${n}; mat card reads "${(onCard || '').slice(0, 60)}"; panel says "${(inPanel || '').slice(0, 90)}"`);
  }

  /* 5. put a die on something */
  {
    const dice = offers(/die|dice|d20|d6|marker/i);
    const openedForm = await pressInPreview(page, 'Write a marker');
    await sleep(500);
    let placed = false;
    if (openedForm) {
      placed = await page.evaluate(sel => {
        const panel = document.querySelector(sel);
        const text = panel.querySelector('input[aria-label="Marker"]');
        const num = panel.querySelector('input[aria-label="How many"]');
        if (!text) return false;
        const set = (el, v) => {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set(text, 'd20');
        if (num) set(num, '17');
        const go = [...panel.querySelectorAll('button')].find(
          b => !b.disabled && /^put it on$/i.test((b.innerText || '').trim())
        );
        if (!go) return false;
        go.click();
        return true;
      }, previewPanel);
    }
    await sleep(700);
    const shown = await cardText(page, creature.id);
    await page.screenshot({ path: `${OUT}/06-die.png` });
    record('put a die on something', placed && /d20|17/i.test(shown || ''),
      `dice controls ${JSON.stringify(dice)}; card reads "${(shown || '').slice(0, 80)}"`);
  }

  await closePreview(page);
  console.log(`  (turn is still ${await turnNow(page)}, started at ${startTurn})`);

  /* 6. mill four */
  {
    const before = await zoneCounts(page);
    await press(page, /^LIBRARY/);
    await sleep(800);
    await page.screenshot({ path: `${OUT}/07-library.png` });
    // The row headed `Mill`, then its own `4`.
    const milled = await page.evaluate(() => {
      const label = [...document.querySelectorAll('*')].find(
        el => el.children.length === 0 && (el.innerText || '').trim() === 'Mill'
      );
      if (!label) return 'no Mill row';
      let row = label.parentElement;
      for (let i = 0; i < 4 && row; i++) {
        const four = [...row.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '4');
        if (four) { four.click(); return 'pressed'; }
        row = row.parentElement;
      }
      return 'no 4 beside Mill';
    });
    await sleep(900);
    const after = await zoneCounts(page);
    await page.screenshot({ path: `${OUT}/08-mill.png` });
    record('mill four', milled === 'pressed' && after.GRAVEYARD === (before.GRAVEYARD ?? 0) + 4,
      `${milled}; graveyard ${before.GRAVEYARD} -> ${after.GRAVEYARD}, library ${before.LIBRARY} -> ${after.LIBRARY}`);
  }

  /* 7. exile face down */
  {
    const inZone = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter(el => el.children.length === 0)
        .map(el => (el.innerText || '').trim())
        .filter(t => /face.?down|face.?up/i.test(t))
    );
    await page.evaluate(() => document.querySelector('[aria-label="Close the zone"]')?.click());
    await sleep(500);
    board = await matCards(page);
    /*
     * A real card, and not the subject creature.
     *
     * Not a token: CR 704.5d takes a token that leaves the battlefield out of
     * existence, so exiling a Soldier correctly leaves the exile pile at zero
     * and the probe would report a working control as broken. Not the subject
     * either, or the goad step below has nothing to press.
     */
    const opening = new Set(board.map(b => b.id));
    const target =
      board.find(b => b.id !== creature.id && opening.has(b.id) && b.name && !/Soldier|Treasure/i.test(b.name)) ||
      board.find(b => b.id !== creature.id) ||
      board[0];
    await openCard(page, target.id);
    await sleep(400);
    const m = (await previewMenu(page)) || [];
    const faceDown = m.filter(r => /face.?down|face.?up|turn (it )?over|flip/i.test(r.label));
    const pressed = await pressInPreview(page, '^Exile face down$');
    await sleep(900);
    const gone = !(await matCards(page)).some(c => c.id === target.id);
    const exileCount = (await zoneCounts(page)).EXILE;
    await page.screenshot({ path: `${OUT}/09-facedown.png` });
    record('exile face down', pressed && gone && exileCount > 0,
      `card controls: ${faceDown.map(c => c.label).join(' | ') || 'NONE'}; left the mat ${gone}; exile now ${exileCount}`);
    await closePreview(page);
  }

  /* 8. set your own life to 27 */
  {
    const startLife = await lifeShown(page);
    const openedSeat = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        /^\d+\s*\n?\s*LIFE$/i.test((x.innerText || '').trim())
      );
      if (!b) return false;
      b.click();
      return true;
    });
    await sleep(800);
    await page.screenshot({ path: `${OUT}/10-seat-panel.png` });
    const seatControls = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => (b.innerText || '').split('\n').join(' ').trim()).filter(Boolean)
    );
    writeFileSync(`${OUT}/seat-controls.json`, JSON.stringify(seatControls, null, 2));
    const typed = await page.evaluate(() => {
      const num = document.querySelector('input[aria-label="Set life to an exact number"]');
      if (!num) return 'no field';
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(num, '27');
      num.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = [...document.querySelectorAll('button')].find(
        b => !b.disabled && (b.innerText || '').trim() === 'Set'
      );
      if (!btn) return 'no Set button';
      btn.click();
      return 'ok';
    });
    await sleep(800);
    const endLife = await lifeShown(page);
    await page.screenshot({ path: `${OUT}/11-life-27.png` });
    record('set your own life to 27', endLife === 27,
      `panel ${openedSeat ? 'opened' : 'DID NOT OPEN'}, field ${typed}, life ${startLife} -> ${endLife}`);
  }

  /* 9. goad a creature */
  {
    await page.evaluate(() => document.querySelector('[aria-label="Close the seat controls"]')?.click());
    await sleep(400);
    board = await matCards(page);
    const target = board.find(b => b.id === creature.id) || board[0];
    await openCard(page, target.id);
    await sleep(400);
    const m = (await previewMenu(page)) || [];
    const goad = m.filter(r => /goad/i.test(r.label));
    const pressed = await pressInPreview(page, '^Goaded$');
    await sleep(700);
    await closePreview(page);
    await sleep(400);
    const onCard = await cardText(page, target.id);
    await page.screenshot({ path: `${OUT}/12-goad.png` });
    record('goad a creature', pressed && /goad/i.test(onCard || ''),
      `goad controls: ${goad.map(c => c.label).join(' | ') || 'NONE'}; card now reads "${(onCard || '').slice(0, 70)}"`);
  }

  console.log(`\nturn at the end: ${await turnNow(page)} (started this section at ${startTurn})`);
  console.log('\n=== VERDICT ===');
  for (const r of results) console.log(`${r.ok ? 'CAN   ' : 'CANNOT'}  ${r.task}`);
  console.log(`\nconsole/page errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
})();
