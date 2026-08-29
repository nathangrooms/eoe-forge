/**
 * Walks /login and /register with the keyboard only, and submits a bad password
 * to see what a screen reader would be told.
 *
 * It NEVER creates an account: the only submission it makes is one the client
 * refuses before any network call, which is the password mismatch.
 *
 *   node scripts/probe/auth-a11y.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/launch-repair';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const describe = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'BODY (reading position lost)';
    const label =
      el.getAttribute('aria-label') ||
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
      el.innerText ||
      el.getAttribute('placeholder') ||
      '';
    const r = el.getBoundingClientRect();
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${label.trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
  });

// ------------------------------------------------------------------ tab order
for (const route of ['/login', '/register']) {
  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const order = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    order.push(await describe());
  }
  console.log(`\n=== ${route} tab order`);
  order.forEach((o, i) => console.log(` ${i + 1}. ${o}`));
}

// ------------------------------------------------- a bad password on /register
await page.goto(BASE + '/register', { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1500);
await page.type('#username', 'probe');
await page.type('#email', 'probe@example.invalid');
await page.type('#password', 'abcdefgh');
await page.type('#confirmPassword', 'different');
await page.click('button[type=submit]');
await sleep(800);

const after = await page.evaluate(() => {
  const f = id => {
    const el = document.getElementById(id);
    return el
      ? {
          invalid: el.getAttribute('aria-invalid'),
          describedby: el.getAttribute('aria-describedby'),
        }
      : null;
  };
  const alerts = [...document.querySelectorAll('[role=alert]')].map(a => a.textContent.trim());
  const active = document.activeElement;
  return {
    focus: active ? `${active.tagName.toLowerCase()}#${active.id || ''}` : 'none',
    alerts,
    password: f('password'),
    confirmPassword: f('confirmPassword'),
  };
});
console.log('\n=== after a mismatched password, immediately');
console.log(JSON.stringify(after, null, 1));

await sleep(4000);
const later = await page.evaluate(() => ({
  alerts: [...document.querySelectorAll('[role=alert]')].map(a => a.textContent.trim()),
  stillMarked: document.getElementById('confirmPassword')?.getAttribute('aria-invalid'),
}));
console.log('\n=== 4.8 seconds later, after any toast has gone');
console.log(JSON.stringify(later, null, 1));
await page.screenshot({ path: `${OUT}/register-error.png`, fullPage: true });

await browser.close();
