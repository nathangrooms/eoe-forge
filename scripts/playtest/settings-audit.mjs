/**
 * Every setting in the game menu, pressed, and judged on what changed.
 *
 * The owner said the settings are wrong. A setting is wrong in one of three
 * ways and all three are checkable from outside: it promises something it does
 * not do, it is offered where it cannot apply, or it is missing. So each one
 * below is pressed with the board measured either side of the press, and the
 * result is the difference rather than the label.
 *
 *   node scripts/playtest/settings-audit.mjs --base http://localhost:8081
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, press, startGame, playTurns, matCards, handCards, openCard, closePreview, previewMenu, previewPanel } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const mode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'GOLDFISH';
const OUT = '.shots/settings-audit';
mkdirSync(OUT, { recursive: true });

/**
 * The game menu opens from one icon in the HUD, and it has an exact label:
 * "Game menu: card size and table settings". Matching loosely on /settings|
 * menu/ instead finds "Leave the table" and "Table view" first, which is how
 * an earlier run of this script audited the top bar and reported four settings
 * as broken that it had never opened.
 */
const openMenu = async page => {
  const ok = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label^="Game menu"]');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(800);
  return ok;
};

/**
 * Shut the menu.
 *
 * Escape does not close it — there is no key handler on the rail — so a probe
 * that pressed Escape and then tried to open a card was clicking through a
 * panel that was still there, and reported Free cast, Auto-advance and Redraw
 * as doing nothing when it had never left the menu.
 */
const closeMenu = async page => {
  await page.evaluate(() => document.querySelector('[aria-label="Close the menu"]')?.click());
  await sleep(500);
};

const menuItems = page =>
  page.evaluate(() => {
    // The right-hand rail. Everything in it, with its state.
    const close = document.querySelector('[aria-label="Close the menu"]');
    const rail = close ? close.closest('div')?.parentElement : null;
    if (!rail) return null;
    return [...rail.querySelectorAll('button')].map(b => ({
      label: (b.innerText || '').split('\n').join(' · ').trim().slice(0, 60),
      pressed: b.getAttribute('aria-pressed'),
      title: b.getAttribute('title') || '',
    }));
  });

const stepLabel = page =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-current="step"]')][0];
    return el ? (el.innerText || '').trim() : null;
  });

const turnNow = page =>
  page.evaluate(() => +(document.body.innerText.match(/TURN\s*\n?\s*(\d+)/) || [])[1] || 0);

const pressLabel = (page, text) =>
  page.evaluate(t => {
    const b = [...document.querySelectorAll('button')].find(
      x => (x.innerText || '').split('\n')[0].trim() === t
    );
    if (!b) return false;
    b.click();
    return true;
  }, text);

const findings = [];
const say = (setting, verdict, note) => {
  findings.push({ setting, verdict, note });
  console.log(`  ${verdict.padEnd(8)} ${setting.padEnd(24)} ${note}`);
};

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode });
  await playTurns(page, 4, s => console.log(s));

  const opened = await openMenu(page);
  if (!opened) throw new Error('no Game menu button on the HUD');
  const items = await menuItems(page);
  await page.screenshot({ path: `${OUT}/menu-${mode}.png` });
  console.log(`\nTHE MENU IN ${mode}:`);
  for (const item of items ?? []) console.log(`   ${item.pressed ?? '-'}  ${item.label}   (${item.title})`);
  console.log('');
  writeFileSync(`${OUT}/menu-${mode}.json`, JSON.stringify(items, null, 2));
  const has = re => (items ?? []).some(i => re.test(i.label));
  /* The opener TOGGLES. Leaving the inventory's menu open meant the next
     `openMenu` shut it, and Free cast was then measured against a menu that
     was not on screen. */
  await closeMenu(page);

  /* Pause opponents: offered only where there ARE opponents. */
  {
    const offered = has(/Pause the opponent|Pause opponents/);
    if (mode === 'GOLDFISH') {
      say('Pause opponents', offered ? 'WRONG' : 'right',
        offered
          ? 'offered in goldfish, which is one seat: nothing to pause'
          : 'correctly absent in goldfish, which is one seat');
    } else {
      say('Pause opponents', offered ? 'right' : 'WRONG',
        offered ? 'offered, and there are bots' : 'missing where there are bots');
    }
  }

  /* Free cast: it should make a card castable that was not. */
  {
    const castableNow = async label => {
      let n = 0;
      const seen = [];
      for (const card of await handCards(page)) {
        const opened = await openCard(page, card.id);
        const m = (await previewMenu(page)) || [];
        const play = m.filter(c => /^(CAST|SUMMON|PLAY)/i.test(c.label));
        const why = await page.evaluate(sel => {
          const panel = document.querySelector(sel);
          if (!panel) return '';
          return [...panel.querySelectorAll('p')]
            .map(x => (x.innerText || '').trim())
            .filter(t => /mana|cannot|not your|only|wait|land/i.test(t))
            .slice(0, 2)
            .join(' / ');
        }, previewPanel);
        seen.push(`${opened ? '' : '(preview did not open) '}${play.map(c => `${c.label}${c.disabled ? ' [off]' : ''}`).join(' / ') || `no play control${why ? ` — "${why}"` : ''}`}`);
        if (play.some(c => !c.disabled)) n++;
        await closePreview(page);
      }
      console.log(`      ${label}: ${seen.join('  |  ')}`);
      return n;
    };
    const before = await castableNow('before');
    await openMenu(page);
    const pressed = await pressLabel(page, 'Free cast');
    await sleep(600);
    const toggleState = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        x => (x.innerText || '').split(String.fromCharCode(10))[0].trim() === 'Free cast'
      );
      return b ? b.getAttribute('aria-pressed') : 'no button';
    });
    console.log(`      Free cast pressed=${pressed}, aria-pressed now ${toggleState}`);
    await closeMenu(page);
    const after = await castableNow('after');
    say('Free cast', pressed && after > before ? 'right' : 'CHECK',
      `castable in hand ${before} -> ${after}`);
    await openMenu(page);
    await pressLabel(page, 'Free cast');
    await sleep(400);
    await closeMenu(page);
  }

  /* Auto-advance: off should leave the game parked in a step. */
  {
    await openMenu(page);
    const off = await pressLabel(page, 'Auto-advance steps');
    await sleep(500);
    await closeMenu(page);
    const turnBefore = await turnNow(page);
    await press(page, /^END TURN$/);
    await sleep(2500);
    const parked = { turn: await turnNow(page), step: await stepLabel(page) };
    await openMenu(page);
    await pressLabel(page, 'Auto-advance steps');
    await sleep(400);
    await closeMenu(page);
    const turnMid = await turnNow(page);
    await press(page, /^END TURN$/);
    await sleep(2500);
    const walked = { turn: await turnNow(page), step: await stepLabel(page) };
    say('Auto-advance steps', off && parked.step !== walked.step ? 'right' : 'CHECK',
      `off: turn ${turnBefore}->${parked.turn} parked at "${parked.step}"; on: turn ${turnMid}->${walked.turn} at "${walked.step}"`);
  }

  /* Redraw your hand: a fresh seven. */
  {
    /*
     * Counted off the app rather than off the fan. `handCards` picks cards by
     * how far down the window they are, which is close enough to drive a game
     * and not close enough to assert on: it read 7 before and 8 after for a
     * control whose whole promise is a fixed number.
     */
    const handSize = () =>
      page.evaluate(() => {
        const m = document.body.innerText.match(/Hand\s*·\s*(\d+)/);
        return m ? +m[1] : null;
      });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find(b => /^LIBRARY/.test((b.innerText || '').trim()))
        ?.click();
    });
    await sleep(700);
    const before = await handSize();
    await openMenu(page);
    const pressed = await pressLabel(page, 'Redraw your hand');
    await sleep(1200);
    await closeMenu(page);
    await sleep(400);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find(b => /^LIBRARY/.test((b.innerText || '').trim()))
        ?.click();
    });
    await sleep(700);
    const after = await handSize();
    await page.screenshot({ path: `${OUT}/redraw-${mode}.png` });
    await page.evaluate(() => document.querySelector('[aria-label="Close the zone"]')?.click());
    await sleep(400);
    say('Redraw your hand', pressed && after === 7 ? 'right' : 'CHECK',
      `the app's own count: hand ${before} -> ${after}`);
  }

  /* Concede and Leave: two controls, and neither may fire on one press. */
  {
    await openMenu(page);
    const board = (await matCards(page)).length;
    const armed = await pressLabel(page, 'Concede the game');
    await sleep(500);
    const asks = await page.evaluate(() =>
      /Concede this game\?|Are you sure/i.test(document.body.innerText)
    );
    await page.screenshot({ path: `${OUT}/concede-${mode}.png` });
    const stillPlaying = (await matCards(page)).length === board;
    say('Concede', armed && asks && stillPlaying ? 'right' : 'CHECK',
      `one press ${armed ? 'armed' : 'did nothing'}, asks in place ${asks}, board untouched ${stillPlaying}`);
    await page.keyboard.press('Escape');
    await sleep(400);
  }

  console.log(`\nerrors: ${errors.length}`);
  for (const e of errors.slice(0, 6)) console.log('  ' + e);
  writeFileSync(`${OUT}/findings-${mode}.json`, JSON.stringify({ findings, errors }, null, 2));
  await browser.close();
})();
