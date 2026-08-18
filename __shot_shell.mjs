import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'out';
const HOST = 'udnaflcohfyljrsgqggy.supabase.co';
const REF = 'udnaflcohfyljrsgqggy';
const BASE = 'http://localhost:8081';
const DIR = path.resolve(OUT);
fs.mkdirSync(DIR, { recursive: true });

const USER_ID = '11111111-1111-1111-1111-111111111111';

function jwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: jwt({ sub: USER_ID, role: 'authenticated', exp: now + 3600, aud: 'authenticated', email: 'admin@deckmatrix.test' }),
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: now + 3600,
  refresh_token: 'fake-refresh',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@deckmatrix.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: { username: 'natedog' },
    created_at: '2025-01-04T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
};

/** Canned REST responses keyed by a predicate on the URL. */
const ROUTES = [
  [u => u.includes('/auth/v1/token'), () => session],
  [u => u.includes('/auth/v1/user'), () => session.user],
  [u => u.includes('/auth/v1/factors') || u.includes('/auth/v1/mfa'), () => ({ totp: [], all: [] })],
  [u => u.includes('/rest/v1/profiles') && u.includes('is_admin'), () => [{ is_admin: true }]],
  [u => u.includes('/rest/v1/profiles') && u.includes(`id=eq.${USER_ID}`), () => [{
    id: USER_ID, username: 'natedog', avatar_url: null, is_admin: true,
    created_at: '2025-01-04T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
  }]],
  [u => u.includes('/rest/v1/profiles'), () => ([
    { id: USER_ID, username: 'natedog', avatar_url: null, is_admin: true, created_at: '2025-01-04T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: '22222222-2222-2222-2222-222222222222', username: 'planeswalker99', avatar_url: null, is_admin: false, created_at: '2025-06-21T10:00:00.000Z', updated_at: '2026-02-01T10:00:00.000Z' },
    { id: '33333333-3333-3333-3333-333333333333', username: null, avatar_url: null, is_admin: false, created_at: '2026-01-14T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
  ])],
  [u => u.includes('/rest/v1/rpc/admin_platform_stats'), () => ({
    cards: 104238, users: 13, decks: 41, deck_cards: 3902,
    collection_items: 1877, collection_cards: 5210, wishlist_items: 96,
  })],
  [u => u.includes('/rest/v1/sync_status'), () => ([{
    id: 'scryfall_cards', status: 'completed', records_processed: 104238,
    total_records: 104238, last_sync: '2026-08-17T22:14:00.000Z',
  }])],
  [u => u.includes('/rest/v1/user_subscriptions'), () => ([
    { tier: 'pro', is_active: true, started_at: '2026-02-01T00:00:00.000Z', expires_at: '2026-09-01T00:00:00.000Z' },
    { tier: 'pro', is_active: true, started_at: '2026-03-01T00:00:00.000Z', expires_at: null },
    { tier: 'unlimited', is_active: true, started_at: '2026-04-01T00:00:00.000Z', expires_at: null },
  ])],
  [u => u.includes('/rest/v1/subscription_limits'), () => ([
    { id: 'l1', tier: 'free', feature_key: 'ai_deck_builds', limit_value: 5, limit_type: 'monthly', description: 'AI deck builds per month' },
    { id: 'l2', tier: 'pro', feature_key: 'ai_deck_builds', limit_value: 50, limit_type: 'monthly', description: 'AI deck builds per month' },
    { id: 'l3', tier: 'unlimited', feature_key: 'ai_deck_builds', limit_value: -1, limit_type: 'monthly', description: 'AI deck builds per month' },
    { id: 'l4', tier: 'free', feature_key: 'card_scans', limit_value: 50, limit_type: 'monthly', description: 'Card scans per month' },
    { id: 'l5', tier: 'pro', feature_key: 'card_scans', limit_value: 500, limit_type: 'monthly', description: 'Card scans per month' },
    { id: 'l6', tier: 'unlimited', feature_key: 'card_scans', limit_value: -1, limit_type: 'monthly', description: 'Card scans per month' },
    { id: 'l7', tier: 'free', feature_key: 'ai_coach_queries', limit_value: 10, limit_type: 'monthly', description: 'AI coaching queries per month' },
    { id: 'l8', tier: 'pro', feature_key: 'ai_coach_queries', limit_value: 200, limit_type: 'monthly', description: 'AI coaching queries per month' },
    { id: 'l9', tier: 'unlimited', feature_key: 'ai_coach_queries', limit_value: -1, limit_type: 'monthly', description: 'AI coaching queries per month' },
    { id: 'l10', tier: 'free', feature_key: 'decks', limit_value: 10, limit_type: 'total', description: 'Total decks' },
    { id: 'l11', tier: 'pro', feature_key: 'decks', limit_value: 100, limit_type: 'total', description: 'Total decks' },
    { id: 'l12', tier: 'unlimited', feature_key: 'decks', limit_value: -1, limit_type: 'total', description: 'Total decks' },
  ])],
  [u => u.includes('/rest/v1/feature_usage'), () => ([
    { feature_key: 'ai_deck_builds', user_id: USER_ID, usage_count: 4, period_end: '2026-09-01T00:00:00.000Z' },
    { feature_key: 'card_scans', user_id: '22222222-2222-2222-2222-222222222222', usage_count: 31, period_end: '2026-09-01T00:00:00.000Z' },
    { feature_key: 'card_scans', user_id: USER_ID, usage_count: 12, period_end: '2026-07-01T00:00:00.000Z' },
  ])],
  [u => u.includes('/rest/v1/feature_flags'), () => ([
    { id: 'f1', key: 'ai_deck_builder', name: 'AI Deck Builder', description: 'AI-powered deck building assistance', enabled: true, requires_tier: 'free', is_experimental: false },
    { id: 'f2', key: 'ai_deck_coach', name: 'AI Deck Coach', description: 'Real-time AI coaching for deck improvements', enabled: true, requires_tier: 'pro', is_experimental: false },
    { id: 'f3', key: 'ai_card_scanner', name: 'AI Card Scanner', description: 'Camera-based card recognition', enabled: true, requires_tier: 'free', is_experimental: false },
    { id: 'f4', key: 'mtg_brain', name: 'MTG Brain', description: 'AI card database and insights', enabled: true, requires_tier: 'free', is_experimental: false },
    { id: 'f5', key: 'marketplace', name: 'Marketplace', description: 'Buy and sell cards', enabled: true, requires_tier: 'free', is_experimental: false },
    { id: 'f6', key: 'tcgplayer_sync', name: 'TCGPlayer Sync', description: 'Sync prices from TCGPlayer', enabled: false, requires_tier: 'unlimited', is_experimental: true },
  ])],
  [u => u.includes('/rest/v1/tasks') || u.includes('/rest/v1/dev_tasks'), () => []],
  [u => u.includes('/rest/v1/cards'), () => []],
];

function respond(url) {
  for (const [match, body] of ROUTES) {
    if (match(url)) return body();
  }
  return [];
}

const shots = [
  { name: '30-settings-1440', url: '/settings', w: 1440, h: 1200 },
  { name: '31-admin-1440', url: '/admin', w: 1440, h: 1000 },
  { name: '32-ai-usage-1440', url: '/admin', w: 1440, h: 900, tab: 'AI' },
  { name: '33-admin-features-1440', url: '/admin', w: 1440, h: 1200, tab: 'Features' },
  { name: '34-admin-users-1440', url: '/admin', w: 1440, h: 900, tab: 'Users' },
  { name: '35-admin-ai-375', url: '/admin', w: 375, h: 900, tab: 'AI' },
];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--force-color-profile=srgb'],
});

const errors = [];

for (const shot of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: shot.w, height: shot.h, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);

  page.on('request', req => {
    const url = req.url();
    if (url.includes(HOST)) {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Expose-Headers': 'Content-Range',
      };
      if (req.method() === 'OPTIONS') {
        req.respond({ status: 204, headers: cors, body: '' });
        return;
      }
      req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { ...cors, 'Content-Range': '0-2/3' },
        body: JSON.stringify(respond(url)),
      });
      return;
    }
    if (/scryfall\.io|scryfall\.com|gstatic|googleapis/.test(url)) {
      req.abort();
      return;
    }
    req.continue();
  });

  page.on('console', m => {
    if (m.type() === 'error') errors.push(`[${shot.name}] ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', e => errors.push(`[${shot.name}] PAGEERROR ${String(e).slice(0, 300)}`));

  await page.evaluateOnNewDocument(
    (key, value) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem('dm.nav.collapsed', '0');
    },
    `sb-${REF}-auth-token`,
    JSON.stringify(session)
  );

  await page.goto(BASE + shot.url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  for (const label of [shot.tab, shot.tab2].filter(Boolean)) {
    const handles = await page.$$('[role="tab"]');
    let hit = null;
    for (const h of handles) {
      const text = await h.evaluate(n => n.textContent.replace(/\s+/g, ' ').trim());
      if (text === label) { hit = h; break; }
    }
    if (!hit) {
      console.log('  !! tab not found:', label);
    } else {
      await hit.click();
    }
    await new Promise(r => setTimeout(r, 1800));
  }

  await page.screenshot({ path: path.join(DIR, `${shot.name}.png`), fullPage: false });
  const where = await page.evaluate(() => location.pathname).catch(() => '?');
  console.log('shot', shot.name, where);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.log('\n--- console errors ---');
  console.log([...new Set(errors)].slice(0, 25).join('\n'));
}
