/**
 * PLAY A WHOLE GAME IN A BROWSER, AS A PLAYER, AND WRITE DOWN EVERY MOMENT
 * THE GAME OFFERED A LEGAL THING THAT NOTHING ON SCREEN COULD EXPRESS.
 *
 * Not the harness. Not a unit test. Puppeteer pressing the same DOM buttons a
 * person presses, on the shipped `src/pages/Play.tsx` mounted by the project's
 * own auth-free `play-harness.html`, running until the engine says
 * `status === 'complete'`.
 *
 * THE INTERACTION MODEL, because getting it wrong is how earlier probes on
 * this project reported false findings four separate times:
 *
 *   A hand card is a button with NO TEXT and a `title` of
 *   "Mountain. You can play this as a land drop. Click to preview." Pressing it
 *   opens `CenterPreview`, and the actual play ("Play land", "Cast", "Attack",
 *   "Tap") is a button INSIDE that preview, built by `cardActions.ts`. So every
 *   play is two presses, and a probe that greps for a one-press "Cast Mountain"
 *   control will conclude the game has no controls at all.
 *
 * WHAT COUNTS AS UNREACHABLE. Not a failed grep. This driver asks the shipped
 * engine what is legal, then actually tries to do it through the DOM: open the
 * card, read what the preview offers, press it, and re-read the state. A thing
 * is unreachable only when the attempt was made and no control existed, and the
 * report carries the buttons that WERE on screen at that moment so the claim
 * can be checked rather than believed.
 *
 * Output: JSON on stdout, screenshots into --out.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const OUT = arg('out', '.shots/fullgame');
const MODE = arg('mode', 'VERSUS BOTS');
const SEATS = Number(arg('seats', '2'));            // extra opponents to add
const MAX_PASSES = Number(arg('max-passes', '2000'));
const WIDTH = Number(arg('width', '1600'));
const HEIGHT = Number(arg('height', '1000'));
const PROBE_BAR = process.argv.includes('--probe-bar');

const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,content){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('type','text/css');s.setAttribute('data-vite-dev-id',id);s.textContent=content;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=content;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

// ---------------------------------------------------------------- page setup

async function open() {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 600000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const health = { consoleErrors: [], pageErrors: [], netFails: [] };
  page.on('pageerror', e => health.pageErrors.push(e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') health.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('requestfailed', r => health.netFails.push(`${r.failure()?.errorText} ${r.url().slice(0, 160)}`));
  page.on('response', r => { if (r.status() >= 400) health.netFails.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });

  await page.setRequestInterception(true);
  page.on('request', req => req.url().includes('/@vite/client')
    ? req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB })
    : req.continue());

  await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(6000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(7000);
  return { browser, page, health };
}

/** Pull the shipped rules modules into the page so "legal" is the app's own word. */
const loadEngine = page => page.evaluate(async () => {
  window.__G = await import('/src/lib/game/index.ts');
  window.__FLOW = await import('/src/components/play/turnFlow.ts');
  window.__CA = await import('/src/components/play/cardActions.ts');
  return Object.keys(window.__G).length;
});

// ---------------------------------------------------------------- reading

const CONTROLS = page => page.evaluate(() => {
  const seen = [];
  for (const b of document.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(b);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    seen.push({
      text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70),
      title: (b.getAttribute('title') || '').slice(0, 110),
      disabled: !!b.disabled,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return seen;
});

const LEGAL = page => page.evaluate(() => {
  const G = window.__G, FLOW = window.__FLOW, s = window.__dmGame;
  if (!G || !s) return null;
  const me = 'p1';
  const p = s.players.find(x => x.id === me);
  const out = {
    turn: s.turn, step: s.step, phase: s.phase, active: s.activePlayerId,
    status: s.status, stack: (s.stack || []).length,
    hand: p ? p.zones.hand.length : 0, bf: p ? p.zones.battlefield.length : 0,
    life: s.players.map(x => `${x.name}:${x.life}`).join(' '),
    priority: s.priorityPlayerId ?? null, decision: null, wants: [],
    winners: s.winners ?? null,
  };
  try { out.decision = FLOW.decisionFor(s, me) ?? null; } catch (e) { out.decision = 'ERR:' + e.message; }
  if (!p || s.status === 'complete') return out;
  try { out.hasPriority = G.hasPriority(s, me); } catch { out.hasPriority = null; }

  /* `Player.zones` is `Record<Zone, InstanceId[]>` — IDs, not objects. Reading
     `c.name` off the array member gives undefined and every plan then refuses,
     which reads exactly like "the player had nothing legal to do all game". */
  const zone = z => (p.zones[z] || []).map(id => s.cards[id]).filter(Boolean);

  try {
    const land = zone('hand').filter(c => { const x = G.planLandDrop(s, me, c.instanceId); return x && x.ok; }).map(c => c.name);
    if (land.length) out.wants.push({ kind: 'land', n: land.length, sample: land.slice(0, 4) });
  } catch (e) { out.wants.push({ kind: 'land', error: String(e.message) }); }

  try {
    const castable = zone('hand').filter(c => {
      if (G.isLand(c)) return false;
      const plan = G.planCastFromHand(s, me, c.instanceId);
      if (!plan || !plan.ok) return false;
      const t = G.castTiming(s, me, c);
      return t && t.ok;
    }).map(c => c.name);
    if (castable.length) out.wants.push({ kind: 'cast', n: castable.length, sample: castable.slice(0, 6) });
  } catch (e) { out.wants.push({ kind: 'cast', error: String(e.message) }); }

  try {
    const cmd = zone('command').filter(c => {
      const plan = G.planCastFromHand(s, me, c.instanceId);
      if (!plan || !plan.ok) return false;
      const t = G.castTiming(s, me, c);
      return t && t.ok;
    }).map(c => c.name);
    if (cmd.length) out.wants.push({ kind: 'cast-commander', n: cmd.length, sample: cmd });
  } catch { /* */ }

  try {
    const abil = [];
    for (const entry of G.activatablePermanents(s, me)) {
      for (const o of entry.options) {
        if (o.isManaAbility) continue;
        if (!(o.ok || o.pending)) continue;
        abil.push(`${entry.card.name} :: ${(o.text || '').slice(0, 46)}`);
      }
    }
    if (abil.length) out.wants.push({ kind: 'activate', n: abil.length, sample: abil.slice(0, 5) });
  } catch (e) { out.wants.push({ kind: 'activate', error: String(e.message) }); }

  try {
    if (s.step === 'declare_attackers' && s.activePlayerId === me) {
      const a = G.eligibleAttackers(s, me).map(c => c.name);
      if (a.length) out.wants.push({ kind: 'attack', n: a.length, sample: a.slice(0, 5) });
    }
    /* A player in their main phase with untapped creatures wants to SWING, and
       the way there is the ATTACK button. The first version of this driver only
       looked for attackers once the step was already `declare_attackers`, so it
       pressed END TURN out of main one every single turn, never attacked once
       in sixteen turns, and lost 40 to -1. That is a bad player, not a broken
       game. `canReachCombat` is the engine's own name for this. */
    out.canReachCombat = FLOW.canReachCombat(s, me);
    if (out.canReachCombat) {
      const a = G.eligibleAttackers(s, me).map(c => c.name);
      out.wants.push({ kind: 'enter-combat', n: a.length, sample: a.slice(0, 5) });
    }
  } catch (e) { out.wants.push({ kind: 'attack', error: String(e.message) }); }

  try {
    if (s.step === 'declare_blockers' && s.activePlayerId !== me && G.isUnderAttack(s, me)) {
      const b = G.eligibleBlockers(s, me).map(c => c.name);
      if (b.length) out.wants.push({ kind: 'block', n: b.length, sample: b.slice(0, 5) });
    }
  } catch (e) { out.wants.push({ kind: 'block', error: String(e.message) }); }

  try {
    const lanes = G.lanesNeedingDamageOrder ? G.lanesNeedingDamageOrder(s, me) : [];
    if (lanes && lanes.length) out.wants.push({ kind: 'damage-order', n: lanes.length });
  } catch { /* */ }

  try {
    const duties = G.manualDutiesFor ? G.manualDutiesFor(s, me) : [];
    if (duties && duties.length) out.wants.push({ kind: 'manual', n: duties.length, sample: duties.slice(0, 3).map(d => d.card?.name ?? d.label ?? '?') });
  } catch { /* */ }

  try {
    if (out.hasPriority && (s.stack || []).length) {
      const top = s.stack[s.stack.length - 1];
      if (top && top.controllerId !== me) {
        const r = G.responseOptions(s, me);
        const n = (r?.cards?.length ?? 0) + (r?.abilities?.length ?? 0);
        if (n) out.wants.push({ kind: 'respond', n });
      }
    }
  } catch (e) { out.wants.push({ kind: 'respond', error: String(e.message) }); }

  return out;
});

// ---------------------------------------------------------------- pressing

/*
 * `exact` compares the RENDERED text, with the regex anchors stripped first.
 *
 * The version before this one passed '^PLAY LAND$' straight into an equality
 * test against 'PLAY LAND', so every exact press silently matched nothing, and
 * the caller returned "pressed PLAY LAND" regardless. That produced a turn-one
 * stall report against a button that works: driven three ways in
 * `land-probe.mjs`, PLAY LAND moves the card, hand 7 -> 6, battlefield 0 -> 1,
 * "T1 You played Mountain." in the log. Sixth false finding of this shape on
 * this project. So a press now returns null when it pressed nothing, and every
 * caller checks.
 */
const clickText = (page, src, exact = false) => page.evaluate((s, ex) => {
  const bare = s.replace(/^\^/, '').replace(/\$$/, '');
  const re = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find(x => {
    if (x.disabled) return false;
    const t = (x.innerText || '').replace(/\s+/g, ' ').trim();
    return ex ? t.toUpperCase() === bare.toUpperCase() : re.test(t);
  });
  if (!b) return null;
  const label = (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  b.click(); return label || '(icon)';
}, src, exact);

/** Press a button by its rendered text, exactly. Returns null if none matched. */
const clickExact = (page, text) => page.evaluate(t0 => {
  const b = [...document.querySelectorAll('button')].find(x =>
    !x.disabled && (x.innerText || '').replace(/\s+/g, ' ').trim().toUpperCase() === t0.toUpperCase());
  if (!b) return null; b.click(); return t0;
}, text);

/** Press a button by its exact `title`. No regex, so no escaping to get wrong. */
const clickExactTitle = (page, title) => page.evaluate(t0 => {
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (x.getAttribute('title') || '') === t0);
  if (!b) return null; b.click(); return t0.slice(0, 70);
}, title);

const clickTitle = (page, src) => page.evaluate(s => {
  const re = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && re.test(x.getAttribute('title') || ''));
  if (!b) return null;
  const t = b.getAttribute('title').slice(0, 80);
  b.click(); return t;
}, src);

/** Open the card whose title begins with this exact name. */
const openCard = (page, name) => page.evaluate(n => {
  const b = [...document.querySelectorAll('button')].find(x => {
    if (x.disabled) return false;
    const t = x.getAttribute('title') || '';
    return t === n || t.startsWith(n + '.') || t.startsWith(n + ',') || t.startsWith(n + ' ');
  });
  if (!b) return null; b.click(); return b.getAttribute('title').slice(0, 90);
}, name);

/** Everything the preview is currently offering, with the refusals it prints. */
const previewOffer = page => page.evaluate(() => {
  /* A target button in `SpellTargetPanel` is a CARD: art, no text, and
     `title="Cast <spell>"`. A text-only reader sees an empty preview and
     reports "the engine says legal and nothing was offered", which is a lie
     about a panel that is on screen. Both are read. */
  const acts = [...document.querySelectorAll('button')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8; })
    .map(b => ({ t: (b.innerText || '').replace(/\s+/g, ' ').trim(), ti: (b.getAttribute('title') || ''), d: !!b.disabled }))
    .filter(b => (b.t.length > 0 && b.t.length < 60) || b.ti.length > 0);
  const open = [...document.querySelectorAll('button')].some(b => /Close the preview/i.test(b.getAttribute('title') || ''));
  return { acts, open, body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1400) };
});

const closePreview = page => clickTitle(page, 'Close the preview');

// ---------------------------------------------------------------- the game

async function startGame(page, shot) {
  const mode = await clickText(page, MODE);
  await sleep(2000); await shot('01-step-two-deck');
  const deck = await clickText(page, 'Choose opponents|Use this deck');
  await sleep(2000);
  for (let i = 0; i < SEATS - 2; i++) { await clickText(page, 'Add an opponent'); await sleep(600); }
  await shot('02-step-three-seats');
  const start = await clickText(page, 'Start .*game');
  await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
  await sleep(3000);
  return { mode, deck, start };
}

/**
 * Try to do ONE legal thing through the DOM, the way a player would.
 * Returns { did, unreachable }.
 */
async function act(page, legal, log) {
  const kinds = new Map((legal?.wants ?? []).map(w => [w.kind, w]));
  const body = await page.evaluate(() => (document.body.innerText || ''));
  const unreachable = [];

  // Opening hand.
  if (/opening hand/i.test(body)) {
    const keep = await clickText(page, 'KEEP THIS HAND') || await clickText(page, '^KEEP$', true);
    if (keep) return { did: 'mulligan-keep:' + keep, unreachable };
  }

  // A targeting overlay is up and blocks everything else.
  if (/CHOOSE A TARGET|Press a card on the table|Cast it at/i.test(body)) {
    const aim = await clickTitle(page, '^Aim ') || await clickTitle(page, '^Cast .* at |^Cast [A-Z]');
    if (aim) return { did: 'target:' + aim, unreachable };
    const bail = await clickText(page, 'Do not cast it|Cancel|Never mind|Back');
    if (bail) return { did: 'target-declined:' + bail, unreachable };
    unreachable.push({ kind: 'target-prompt', why: 'prompt on screen, no aim and no escape' });
  }

  // CR 509.2 damage order.
  if (kinds.has('damage-order')) {
    const o = await clickText(page, 'ORDER|Promote|first strike order|Lock in|Done');
    if (o) return { did: 'damage-order:' + o, unreachable };
    unreachable.push({ kind: 'damage-order', n: kinds.get('damage-order').n, why: 'engine owes an order, no control' });
  }

  // Respond.
  if (legal?.decision === 'respond' || kinds.has('respond')) {
    const answered = Math.random() < 0.3 ? await clickTitle(page, '^Cast ') : null;
    if (answered) return { did: 'respond-cast:' + answered, unreachable };
    const l = await clickText(page, '^LET IT RESOLVE$', true);
    if (l) return { did: 'let-it-resolve', unreachable };
    if (kinds.has('respond')) unreachable.push({ kind: 'respond', n: kinds.get('respond').n, why: 'answer in hand or on board, nothing offered' });
  }

  /*
   * COMBAT IS NOT THE PREVIEW.
   *
   * In `declare_attackers` and `declare_blockers` the board itself becomes the
   * control: each creature grows a sword or shield button carrying
   * `title="Attack with Insidious Bookworms (1/1)"` or `title="Block <x>"`,
   * and the bar at the top holds DECLARE ATTACKERS / NO ATTACKS. Opening the
   * card preview instead finds no Attack button, and the version of this driver
   * that did that pressed NO ATTACKS on four consecutive turns and then said
   * the player could not attack. Measured on the real surface at turn 15:
   * "Attack with Insidious Bookworms (1/1)", "Attack with Dockside Chef (1/2)",
   * "DECLARE ATTACKERS" and "NO ATTACKS" all present and enabled.
   */
  const toggles = async prefix => page.evaluate(pre => {
    const found = [...document.querySelectorAll('button')]
      .filter(b => !b.disabled && (b.getAttribute('title') || '').toLowerCase().startsWith(pre));
    return found.map(b => b.getAttribute('title'));
  }, prefix);

  /*
   * THE CONFIRM LIVES IN THE COMBAT BAR, NOT IN THE TOP RIGHT.
   *
   * `CombatBar.tsx` builds the only control that commits combat, and its label
   * counts what you picked: "Confirm 1 block", "No blocks", "Attack with 2",
   * "No attacks". The loudest button on the page, top right, reads DECLARE
   * BLOCKERS at the same moment and is `handleDecision` in `Play.tsx`, which
   * for this decision is `changeView('combat')` and nothing else.
   */
  const confirmCombat = async attacking => {
    const label = await page.evaluate(atk => {
      const re = atk ? /^(ATTACK WITH \d+|NO ATTACKS)$/i : /^(CONFIRM \d+ BLOCKS?|NO BLOCKS)$/i;
      const b = [...document.querySelectorAll('button')]
        .find(x => !x.disabled && re.test((x.innerText || '').replace(/\s+/g, ' ').trim()));
      if (!b) return null;
      const t = (b.innerText || '').replace(/\s+/g, ' ').trim(); b.click(); return t;
    }, attacking);
    return label;
  };

  // Blocks.
  if (legal?.decision === 'blockers' || kinds.has('block')) {
    const offered = await toggles('block with ');
    let put = 0;
    for (const t of offered.slice(0, 2)) { if (await clickExactTitle(page, t)) put++; await sleep(240); }
    const c = await confirmCombat(false);
    if (put || c) return { did: `block:${put}` + (c ? '|' + c : '|NOT CONFIRMED'), unreachable };
    if (kinds.has('block')) unreachable.push({ kind: 'block', n: kinds.get('block').n, sample: kinds.get('block').sample,
      why: 'eligible blockers, no Block control and no confirm on screen' });
  }

  // Attacks.
  if (legal?.decision === 'attackers' || kinds.has('attack')) {
    const offered = await toggles('attack with ');
    let swung = 0;
    for (const t of offered) { if (await clickExactTitle(page, t)) swung++; await sleep(240); }
    const c = await confirmCombat(true);
    if (swung || c) return { did: `attack:${swung}` + (c ? '|' + c : '|NOT CONFIRMED'), unreachable };
    if (kinds.has('attack')) unreachable.push({ kind: 'attack', n: kinds.get('attack').n, sample: kinds.get('attack').sample,
      why: 'eligible attackers, no Attack control and no confirm on screen' });
  }

  // Swing before ending the turn, the way a player does.
  if (kinds.has('enter-combat')) {
    const enter = await clickExact(page, 'ATTACK');
    if (enter) return { did: 'enter-combat:' + (kinds.get('enter-combat').sample || []).join(','), unreachable };
    unreachable.push({ kind: 'enter-combat', n: kinds.get('enter-combat').n, sample: kinds.get('enter-combat').sample,
      why: 'untapped creatures in main one, no way to reach combat' });
  }

  // Land, then a spell, then the commander.
  for (const kind of ['land', 'cast', 'cast-commander']) {
    if (!kinds.has(kind)) continue;
    const names = kinds.get(kind).sample ?? [];
    const wanted = kind === 'land' ? /^Play land$/i : /^Cast/i;
    const misses = [];
    let previewOpened = false;
    for (const n of names) {
      const opened = await openCard(page, n);
      if (!opened) { misses.push(`${n}: no card control on screen`); continue; }
      await sleep(380);
      const offer = await previewOffer(page);
      /* CR 601.2c: a spell that names a target is not offered a plain Cast.
         `cardActions.ts` says so and hands off to `AimLayer`, whose control is
         a button titled "Aim <spell> at <permanent>". A probe that only looks
         for "Cast" therefore reports thirteen unreachable casts against a
         targeting flow that is on screen and works. */
      const aimPrefix = 'aim ' + n.toLowerCase() + ' at ';
      const hit = offer.acts.find(a => !a.d && wanted.test(a.t))
        || offer.acts.find(a => !a.d && kind !== 'land' && a.ti.toLowerCase().startsWith(aimPrefix))
        || offer.acts.find(a => !a.d && kind !== 'land' && a.ti.toLowerCase().startsWith('cast ' + n.toLowerCase()));
      if (hit) {
        const pressed = hit.t ? await clickExact(page, hit.t) : await clickExactTitle(page, hit.ti);
        if (!pressed) { misses.push(`${n}: preview offered "${hit.t || hit.ti}" and it could not be pressed`); await closePreview(page); await sleep(200); continue; }
        await sleep(500);
        // A targeted spell hands off to the aim layer.
        const aim = await clickTitle(page, '^Aim ');
        if (!aim) await closePreview(page);
        return { did: `${kind}:${n}|${hit.t}${aim ? '|' + aim : ''}`, unreachable };
      }
      /* Ask the component that BUILDS the preview what it returned for this
         card, so a miss carries a reason instead of an absence. */
      const verdict = await page.evaluate(name => {
        const s = window.__dmGame, CA = window.__CA;
        if (!s || !CA) return null;
        const p = s.players.find(x => x.id === 'p1');
        const card = [...p.zones.hand, ...p.zones.command].map(i => s.cards[i]).find(c => c && c.name === name);
        if (!card) return { note: 'card not in hand or command zone any more' };
        const r = CA.actionsForCard(s, 'p1', card);
        return { actions: r.actions.map(a => a.kind + ':' + a.label), blocked: r.blocked.map(b => b.id + ': ' + b.reason),
                 moves: r.moves.map(m => m.label), zone: card.zone, typeLine: card.typeLine };
      }, n).catch(() => null);
      misses.push(`${n}: preview ${offer.open ? 'open' : 'DID NOT OPEN'}, offered [${offer.acts.filter(a => !a.d).map(a => a.t || a.ti).slice(0, 10).join(' / ')}] :: cardActions ${JSON.stringify(verdict)}`);
      previewOpened = previewOpened || offer.open;
      await closePreview(page); await sleep(200);
    }
    /* Only a finding when a preview actually opened and did not carry the play.
       A preview that never opened is the 130 ms auto-advance having moved the
       step out from under the press, which is a race in this probe. */
    if (misses.length === names.length && names.length && previewOpened) {
      unreachable.push({ kind, n: kinds.get(kind).n, sample: names, why: 'engine says legal, preview opened and did not offer it', misses });
    }
  }

  // Activated abilities.
  if (kinds.has('activate')) {
    const first = (kinds.get('activate').sample ?? [])[0];
    const name = first ? first.split(' :: ')[0] : null;
    if (name && Math.random() < 0.5) {
      const opened = await openCard(page, name);
      if (opened) {
        await sleep(380);
        const offer = await previewOffer(page);
        const hit = offer.acts.find(a => !a.d && /^(Use|Activate|⚡|Pay)/i.test(a.t));
        if (hit) { const ok = await clickExact(page, hit.t); await sleep(400); await closePreview(page); if (ok) return { did: 'activate:' + name + '|' + hit.t, unreachable }; }
        await closePreview(page); await sleep(150);
      }
    }
  }

  // A preview left open swallows the board.
  const closed = await closePreview(page);
  if (closed) return { did: 'closed-preview', unreachable };

  /*
   * END TURN, and ONLY from a main phase.
   *
   * The first version of this driver pressed the widest enabled top-right
   * button whenever it had nothing else to do, which meant it pressed END TURN
   * during its own UPKEEP on turn 1 and every turn after. It then played no
   * land and no spell for sixteen turns and lost 40 to -1, and the transcript
   * read exactly like a game where a player cannot do anything. It was the
   * driver ending its own turn before the main phase existed. That is the
   * fifth false finding a probe on this project has produced this way, so the
   * rule is now written down: outside a main phase the surface advances itself
   * in 130 ms and the right move is to WAIT.
   */
  const inMain = /main/.test(legal.step || '');
  if (inMain || legal.decision === 'main' || legal.decision === 'second-main') {
    for (const label of ['END TURN', 'NEXT', 'CONTINUE', 'DONE']) {
      const p = await clickText(page, '^' + label + '$', true);
      if (p) return { did: 'bar:' + p, unreachable };
    }
  }
  return { did: null, unreachable };
}

// ---------------------------------------------------------------- main

(async () => {
  const { browser, page, health } = await open();
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  const shot = async name => {
    const f = `${OUT}/${String(n++).padStart(3, '0')}-${name}.png`;
    try { await page.screenshot({ path: f }); } catch { return null; }
    return f;
  };

  const report = {
    base: BASE, mode: MODE, seats: SEATS, viewport: `${WIDTH}x${HEIGHT}`,
    engineLoaded: null, start: null, passes: 0,
    presses: [], phases: {}, unreachable: [], stalls: [], turnsReached: 0, combatSurfaces: {}, twoButton: {},
    finalState: null, health, shots: [],
  };

  await sleep(1200);
  await shot('00-landing');
  report.engineLoaded = await loadEngine(page).catch(e => 'ERR ' + e.message);
  report.start = await startGame(page, shot);
  await loadEngine(page).catch(() => {});
  await sleep(800);
  await shot('03-opening-hand');

  let lastSig = '', sameFor = 0;
  const seenPhase = new Set();

  for (let i = 0; i < MAX_PASSES; i++) {
    report.passes = i + 1;
    const legal = await LEGAL(page);
    if (!legal) { await sleep(400); continue; }
    report.turnsReached = Math.max(report.turnsReached, legal.turn);
    if (legal.status === 'complete') { report.finalState = legal; break; }

    const controls = await CONTROLS(page);

    const phaseKey = `${legal.step}${legal.active === 'p1' ? '-mine' : '-theirs'}`;
    const decKey = legal.decision ? `decision-${legal.decision}` : null;
    for (const key of [phaseKey, decKey].filter(Boolean)) {
      if (!seenPhase.has(key)) {
        seenPhase.add(key);
        const f = await shot(`t${legal.turn}-${key}`);
        report.phases[key] = { shot: f, turn: legal.turn, life: legal.life, stack: legal.stack };
      }
    }

    /*
     * THE TWO-BUTTON EXPERIMENT, run once per combat decision inside a real
     * game. Declare one attacker or blocker, then press the loudest control on
     * the page (top right, "DECLARE BLOCKERS"), read the state, then press the
     * combat bar's own confirm and read it again. Nothing is asserted from the
     * source; both answers are measurements.
     */
    if (PROBE_BAR && (legal.decision === 'attackers' || legal.decision === 'blockers')
        && !report.twoButton[legal.decision]) {
      const atk = legal.decision === 'attackers';
      const offered = await page.evaluate(pre => [...document.querySelectorAll('button')]
        .filter(b => !b.disabled && (b.getAttribute('title') || '').toLowerCase().startsWith(pre))
        .map(b => b.getAttribute('title')), atk ? 'attack with ' : 'block with ');
      if (offered.length) {
        const toggled = await clickExactTitle(page, offered[0]);
        await sleep(900);
        const before = await LEGAL(page);
        const onScreen = (await CONTROLS(page)).filter(c => !c.disabled && c.text.length > 2)
          .map(c => `${c.text} @y${c.y}`);
        const hudLabel = atk ? 'DECLARE ATTACKERS' : 'DECLARE BLOCKERS';
        const hudShot = await shot(`EXP-${legal.decision}-1-declared`);
        const pressedHud = await clickExact(page, hudLabel);
        await sleep(1700);
        const afterHud = await LEGAL(page);
        const afterHudShot = await shot(`EXP-${legal.decision}-2-after-${hudLabel.replace(/ /g, '-')}`);
        const barPressed = await page.evaluate(a => {
          const re = a ? /^(ATTACK WITH \d+|NO ATTACKS)$/i : /^(CONFIRM \d+ BLOCKS?|NO BLOCKS)$/i;
          const b = [...document.querySelectorAll('button')].find(x => !x.disabled && re.test((x.innerText || '').replace(/\s+/g, ' ').trim()));
          if (!b) return null; const t = (b.innerText || '').replace(/\s+/g, ' ').trim(); b.click(); return t;
        }, atk);
        await sleep(1700);
        const afterBar = await LEGAL(page);
        const key = k => `${k.turn}/${k.step}/stack${k.stack}/${k.life}`;
        report.twoButton[legal.decision] = {
          turn: legal.turn, toggled, buttonsOnScreen: onScreen,
          hud: { label: hudLabel, pressed: pressedHud, before: key(before), after: key(afterHud),
                 movedTheGame: key(before) !== key(afterHud), shotBefore: hudShot, shotAfter: afterHudShot },
          bar: { pressed: barPressed, before: key(afterHud), after: key(afterBar),
                 movedTheGame: key(afterHud) !== key(afterBar), shot: await shot(`EXP-${legal.decision}-3-after-combat-bar`) },
        };
      }
    }

    if ((legal.decision === 'attackers' || legal.decision === 'blockers' || legal.decision === 'damage-order')
        && !report.combatSurfaces[legal.decision]) {
      report.combatSurfaces[legal.decision] = {
        turn: legal.turn, step: legal.step, wants: legal.wants,
        shot: await shot(`t${legal.turn}-SURFACE-${legal.decision}`),
        controls: controls.filter(c => !c.disabled).map(c => ({ text: c.text, title: c.title, x: c.x, y: c.y })),
        body: await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1200)),
      };
    }

    const sig = JSON.stringify([legal.turn, legal.step, legal.stack, legal.hand, legal.bf, legal.life,
      controls.filter(c => !c.disabled).map(c => c.text + '|' + c.title).sort()]);
    if (sig === lastSig) sameFor++; else { sameFor = 0; lastSig = sig; }

    if (sameFor >= 26) {
      const f = await shot(`STALL-t${legal.turn}-${legal.step}`);

      /*
       * THE AUTOPSY. Ask the shipped engine what it thinks is owed, by whom,
       * before anybody writes a sentence about what is stuck. Then try the one
       * control a player still has — the icon-only "Advance one step" — and
       * record whether it moves the game.
       */
      const autopsy = await page.evaluate(() => {
        const G = window.__G, FLOW = window.__FLOW, s = window.__dmGame;
        if (!G || !s) return null;
        const seats = s.players.map(p => {
          let duties = [], bot = null, decision = null;
          try { duties = (G.manualDutiesFor(s, p.id) || []).map(d => `${d.card?.name ?? '?'}: ${(d.label ?? d.text ?? '').slice(0, 80)}`); } catch (e) { duties = ['ERR ' + e.message]; }
          try { decision = FLOW.decisionFor(s, p.id) ?? null; } catch (e) { decision = 'ERR ' + e.message; }
          try { const m = G.nextBotMove(s, p.id); bot = m ? { note: m.note, types: (m.actions || []).map(a => a.type) } : null; } catch (e) { bot = 'ERR ' + e.message; }
          return { id: p.id, name: p.name, isBot: !!p.isBot, life: p.life,
                   priority: (() => { try { return G.hasPriority(s, p.id); } catch { return null; } })(),
                   decision, duties, bot };
        });
        let advance = [];
        try { advance = (G.advanceActions(s, Date.now()) || []).map(a => a.type); } catch (e) { advance = ['ERR ' + e.message]; }
        let flow = [];
        try { flow = (FLOW.flowActions(s, 'p1', Date.now()) || []).map(a => a.type); } catch (e) { flow = ['ERR ' + e.message]; }
        return {
          step: s.step, phase: s.phase, active: s.activePlayerId, priority: s.priorityPlayerId ?? null,
          stack: (s.stack || []).map(o => `${o.name ?? o.kind ?? '?'} by ${o.controllerId}`),
          pendingChoice: s.pendingChoice ?? null, awaiting: s.awaiting ?? null,
          seats, advanceActions: advance, flowActionsForHuman: flow,
          log: (window.__dmLog || []).slice(-12),
        };
      }).catch(e => 'AUTOPSY FAILED ' + e.message);

      const beforeStep = await LEGAL(page);
      const pressedStep = await clickTitle(page, 'Advance one step');
      await sleep(2500);
      const afterStep = await LEGAL(page);
      const stepShot = await shot(`STALL-after-advance-one-step`);

      report.stalls.push({
        autopsy,
        stepButton: {
          pressed: pressedStep,
          before: beforeStep && `${beforeStep.turn}/${beforeStep.step}/${beforeStep.life}`,
          after: afterStep && `${afterStep.turn}/${afterStep.step}/${afterStep.life}`,
          movedTheGame: JSON.stringify(beforeStep) !== JSON.stringify(afterStep),
          shot: stepShot,
        },
        turn: legal.turn, step: legal.step, decision: legal.decision, active: legal.active,
        priority: legal.priority, stack: legal.stack, wants: legal.wants, shot: f,
        enabled: controls.filter(c => !c.disabled).map(c => ({ text: c.text, title: c.title.slice(0, 60), y: c.y })),
        bodyText: await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 900)),
      });
      break;
    }

    const { did, unreachable } = await act(page, legal, report);
    for (const u of unreachable) {
      report.unreachable.push({
        turn: legal.turn, step: legal.step, decision: legal.decision, ...u,
        enabledControls: controls.filter(c => !c.disabled).map(c => c.text || c.title).slice(0, 22),
      });
    }
    if (did) report.presses.push(`t${legal.turn}/${legal.step}/${legal.decision ?? '-'} -> ${did}`);
    await sleep(did ? 240 : 420);
  }

  if (!report.finalState) report.finalState = await LEGAL(page);
  await shot('zz-final');
  report.pressCount = report.presses.length;
  report.presses = report.presses.slice(-140);
  report.health = {
    consoleErrorCount: health.consoleErrors.length, consoleErrors: [...new Set(health.consoleErrors)].slice(0, 20),
    pageErrorCount: health.pageErrors.length, pageErrors: [...new Set(health.pageErrors)].slice(0, 20),
    netFailCount: health.netFails.length, netFails: [...new Set(health.netFails)].slice(0, 20),
  };
  report.shots = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error('DRIVER FAILED:', e); process.exit(1); });
