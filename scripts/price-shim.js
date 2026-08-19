/**
 * A PostgREST stand-in that sits in front of `fetch`, injected before the app
 * loads. Read the header comment of scripts/price-shots.mjs for why.
 *
 * Two rules:
 *   1. World-readable tables (`cards`, `cards_unique`) go to the real database
 *      with the real anon key, so every price rendered is a real price.
 *   2. Owner-scoped tables are answered from rows defined here, projected
 *      through the request's own `select=` exactly as PostgREST would, embedded
 *      resources included. A surface that forgets to ask for `prices` gets a row
 *      with no `prices`, which is the whole point.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';

  /* ------------------------------------------------------------ session */
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: 'harness-not-a-real-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'harness-refresh',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'harness@localhost',
      app_metadata: { provider: 'email' },
      user_metadata: { username: 'Harness' },
      created_at: new Date(0).toISOString(),
    },
  };
  try {
    localStorage.setItem(
      'sb-udnaflcohfyljrsgqggy-auth-token',
      JSON.stringify(session)
    );
  } catch {}

  /* ------------------------------------------------------------ fixtures */

  /**
   * Real printings, chosen for the price shapes that matter. Every one of these
   * ids exists in `cards`; the shim fetches their real rows, so the prices on
   * screen are the database's own.
   */
  const OWNED = [
    // id                                     qty foil  what it tests
    ['4a2e428c-dd25-484c-bbc8-2d6ce10ef42c', 1, 0], // $7312.50 normal
    ['ade7d00d-4e7b-46e9-ace1-63f628a589fc', 1, 0], // $5719.99 normal
    ['8698c46b-2628-4482-88f9-e37a01ade274', 4, 0], // $0.63 / foil $15.32
    ['8698c46b-2628-4482-88f9-e37a01ade274', 0, 2], // same card owned FOIL only
    ['cf5479c7-9e46-4a57-abe7-8cc670de89e4', 3, 1], // mixed normal + foil
    ['8b8547e0-2928-4edc-a15a-a613cb4d1eac', 2, 0], // cheap, priced
    ['c2c3e33c-8893-436e-ab3a-f8c2ae8b2527', 1, 1], // NO usd, foil $20.64
    ['286ff901-1faf-4a02-a37a-fa165989112f', 0, 1], // NO usd, foil $28.40, foil-only
    ['2923c85a-4022-4cda-bcbb-bb000137f64f', 2, 0], // NO usd, foil $1.42, owned NON-foil
    ['acefc515-bf97-4dc0-b0f7-ae8ae5a61671', 1, 0], // no price at all
    ['e61b9d48-0ace-4453-afe0-a1024444bac0', 3, 0], // no price at all
    ['2952a34c-b0c0-4e1c-9a00-c74c7e6b7d32', 1, 0], // no price at all
  ];

  const user_collections = OWNED.map((row, i) => ({
    id: `col-${i}`,
    user_id: USER_ID,
    card_id: row[0],
    card_name: null, // filled from the real card row below
    set_code: null,
    quantity: row[1],
    foil: row[2],
    condition: 'near_mint',
    price_usd: null, // the stale denormalised column, null exactly as it is live
    created_at: '2026-01-0' + ((i % 9) + 1) + 'T00:00:00+00:00',
    updated_at: '2026-01-0' + ((i % 9) + 1) + 'T00:00:00+00:00',
  }));

  /**
   * A wishlist row whose `card_id` is not in `cards` but whose `card_name` is —
   * the shape that made /wishlist and the dashboard disagree by $2,335.
   */
  const wishlist = [
    { id: 'w-0', user_id: USER_ID, card_id: '4a2e428c-dd25-484c-bbc8-2d6ce10ef42c', card_name: 'Black Lotus', quantity: 1, priority: 'high', created_at: '2026-01-01T00:00:00+00:00', alert_enabled: false, target_price_usd: null, note: null, set_code: null },
    { id: 'w-1', user_id: USER_ID, card_id: '8698c46b-2628-4482-88f9-e37a01ade274', card_name: 'Elvish Guidance', quantity: 2, priority: 'medium', created_at: '2026-01-02T00:00:00+00:00', alert_enabled: false, target_price_usd: null, note: null, set_code: null },
    { id: 'w-2', user_id: USER_ID, card_id: 'acefc515-bf97-4dc0-b0f7-ae8ae5a61671', card_name: 'Vigorbloom Vanguard // Seed Suture', quantity: 1, priority: 'low', created_at: '2026-01-03T00:00:00+00:00', alert_enabled: false, target_price_usd: null, note: null, set_code: null },
    { id: 'w-3', user_id: USER_ID, card_id: 'sol-ring', card_name: 'Sol Ring', quantity: 1, priority: 'high', created_at: '2026-01-04T00:00:00+00:00', alert_enabled: false, target_price_usd: null, note: null, set_code: null },
  ];

  const DECK_ID = 'dddddddd-0000-4000-8000-00000000dm01';
  const user_decks = [
    {
      id: DECK_ID,
      user_id: USER_ID,
      name: 'Harness deck',
      format: 'commander',
      colors: ['G'],
      description: null,
      is_public: false,
      public_enabled: false,
      power_level: null,
      edh_analysis: null,
      created_at: '2026-01-01T00:00:00+00:00',
      updated_at: '2026-01-01T00:00:00+00:00',
    },
  ];

  const deck_cards = OWNED.filter((_, i) => i !== 3).map((row, i) => ({
    id: `dc-${i}`,
    deck_id: DECK_ID,
    card_id: row[0],
    card_name: null,
    quantity: Math.max(1, row[1] || 1),
    is_commander: i === 0,
    is_sideboard: false,
    created_at: '2026-01-01T00:00:00+00:00',
  }));

  const storage_containers = [
    {
      id: 'box-1',
      user_id: USER_ID,
      name: 'Harness binder',
      type: 'binder',
      color: null,
      icon: null,
      is_default: true,
      deck_id: null,
      created_at: '2026-01-01T00:00:00+00:00',
      updated_at: '2026-01-01T00:00:00+00:00',
    },
  ];

  const storage_items = OWNED.slice(0, 6).map((row, i) => ({
    id: `si-${i}`,
    container_id: 'box-1',
    user_id: USER_ID,
    card_id: row[0],
    qty: Math.max(1, row[1] || row[2] || 1),
    foil: row[2] > 0 && row[1] === 0,
    created_at: '2026-01-01T00:00:00+00:00',
  }));

  const profiles = [
    { id: USER_ID, username: 'Harness', is_admin: false, avatar_url: null, created_at: '2026-01-01T00:00:00+00:00' },
  ];

  /**
   * Listings, chosen so the marketplace tile has to answer every price shape a
   * seller can hit. `listings` is owner-scoped, so a signed-out run sees an
   * empty For Sale tab and proves nothing.
   *
   *   card                                  what the tile must get right
   *   8698c46b  normal listing, usd $0.63 and usd_foil $15.32 both real
   *   8698c46b  FOIL listing of the same card, so the two must not read alike
   *   c2c3e33c  no usd at all, foil $20.64 — the ask has nothing to sit beside
   *   a87dd615  finishes = ['nonfoil'], so "never printed in foil" is provable
   *   acefc515  no price in any slot: the panel has to say so in words
   *   4a2e428c  Black Lotus, four figures, listed under market
   */
  const LISTED = [
    ['8698c46b-2628-4482-88f9-e37a01ade274', 0, 1, 0.75, 'near_mint', 'active'],
    ['8698c46b-2628-4482-88f9-e37a01ade274', 1, 1, 14.0, 'near_mint', 'active'],
    ['c2c3e33c-8893-436e-ab3a-f8c2ae8b2527', 1, 1, 22.5, 'lightly_played', 'active'],
    ['a87dd615-565d-4b79-a346-f8c6bb0a8340', 0, 3, 0.4, 'near_mint', 'active'],
    ['acefc515-bf97-4dc0-b0f7-ae8ae5a61671', 0, 1, 2.0, 'near_mint', 'active'],
    ['4a2e428c-dd25-484c-bbc8-2d6ce10ef42c', 0, 1, 6900.0, 'moderately_played', 'sold'],
  ];

  const listings = LISTED.map((row, i) => ({
    id: `lst-${i}`,
    user_id: USER_ID,
    card_id: row[0],
    foil: row[1] === 1,
    qty: row[2],
    price_usd: row[3],
    condition: row[4],
    status: row[5],
    currency: 'USD',
    note: null,
    visibility: 'public',
    created_at: '2026-08-0' + ((i % 9) + 1) + 'T00:00:00+00:00',
    updated_at: '2026-08-1' + (i % 9) + 'T00:00:00+00:00',
  }));

  const TABLES = {
    user_collections,
    wishlist,
    user_decks,
    deck_cards,
    storage_containers,
    storage_items,
    profiles,
    favorite_decks: [],
    activity_log: [],
    listings,
    sales: [],
    messages: [],
    card_price_history: [],
    collection_value_history: [],
    wishlist_shares: [],
    deck_share_events: [],
    user_preferences: [],
    tasks: [],
    build_logs: [],
    price_alerts: [],
    scan_sessions: [],
  };

  /** Straight to the real database, with the real anon key. */
  const PASSTHROUGH = new Set(['cards', 'cards_unique', 'sync_status', 'precons']);

  /* --------------------------------------------------- real card lookup */

  const cardCache = new Map();
  let cardsReady = null;

  async function loadCards() {
    const ids = [...new Set([
      ...OWNED.map(r => r[0]),
      ...wishlist.map(w => w.card_id),
      ...listings.map(l => l.card_id),
    ])].filter(
      id => /^[0-9a-f-]{36}$/i.test(id)
    );
    const url =
      `${URL_BASE}/rest/v1/cards?select=*&id=in.(${ids.join(',')})`;
    const res = await realFetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const rows = await res.json();
    for (const row of rows) cardCache.set(row.id, row);

    // Names/sets on the owned rows come from the real card, so the fixture
    // never invents a card that is not in the catalogue.
    for (const row of user_collections) {
      const card = cardCache.get(row.card_id);
      if (card) {
        row.card_name = card.name;
        row.set_code = card.set_code;
      }
    }
    for (const row of deck_cards) {
      const card = cardCache.get(row.card_id);
      if (card) row.card_name = card.name;
    }
  }

  /* ------------------------------------------------- select= projection */

  /** Split on commas that are not inside parentheses. */
  function splitTop(s) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  /**
   * `quantity,foil,cards(prices)` -> [{name:'quantity'},{name:'foil'},
   * {name:'cards', children:[...]}]. Handles `!inner`, `!fk_name`, `*` and the
   * `alias:column` form.
   */
  function parseSelect(sel) {
    return splitTop(sel.replace(/\s+/g, '')).map(part => {
      const open = part.indexOf('(');
      if (open === -1) {
        const [alias, col] = part.includes(':') ? part.split(':') : [null, part];
        return { name: (col || part).split('!')[0], alias };
      }
      const head = part.slice(0, open);
      const body = part.slice(open + 1, part.lastIndexOf(')'));
      const [alias, rel] = head.includes(':') ? head.split(':') : [null, head];
      return { name: (rel || head).split('!')[0], alias, children: parseSelect(body) };
    });
  }

  /** Which local table an embedded resource name refers to. */
  function embedTarget(name) {
    return name === 'cards' ? 'cards' : name;
  }

  function project(row, fields, tableName) {
    if (!fields || fields.some(f => f.name === '*' && !f.children)) {
      // `*` still needs any explicit embeds alongside it.
      const base = { ...row };
      for (const f of fields || []) if (f.children) attachEmbed(base, f, tableName);
      return base;
    }
    const out = {};
    for (const f of fields) {
      if (f.children) {
        attachEmbed(out, f, tableName);
      } else {
        out[f.alias || f.name] = row[f.name] === undefined ? null : row[f.name];
      }
    }
    return out;

    function attachEmbed(target, field, parentTable) {
      const key = field.alias || field.name;
      const rel = embedTarget(field.name);
      if (rel === 'cards') {
        const card = cardCache.get(row.card_id);
        target[key] = card ? project(card, field.children, 'cards') : null;
      } else if (rel === 'storage_items') {
        const items = storage_items.filter(i => i.container_id === row.id);
        target[key] = items.map(i => project(i, field.children, 'storage_items'));
      } else if (TABLES[rel]) {
        target[key] = [];
      } else {
        target[key] = null;
      }
    }
  }

  /* ----------------------------------------------------------- filtering */

  function applyFilter(rows, key, raw) {
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    switch (op) {
      case 'eq':
        return rows.filter(r => String(r[key] ?? '') === value);
      case 'neq':
        return rows.filter(r => String(r[key] ?? '') !== value);
      case 'in': {
        const set = new Set(
          value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, ''))
        );
        return rows.filter(r => set.has(String(r[key] ?? '')));
      }
      case 'is':
        return value === 'null'
          ? rows.filter(r => r[key] == null)
          : rows.filter(r => r[key] != null);
      case 'gte':
        return rows.filter(r => Number(r[key]) >= Number(value));
      case 'lte':
        return rows.filter(r => Number(r[key]) <= Number(value));
      case 'ilike':
        return rows.filter(r =>
          String(r[key] ?? '').toLowerCase().includes(value.replace(/\*/g, '').toLowerCase())
        );
      default:
        return rows;
    }
  }

  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'and', 'or', 'on_conflict', 'columns']);

  /* -------------------------------------------------------------- fetch */

  const realFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});

    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    // Auth endpoints: the local session is the answer. Nothing is ever sent.
    if (url.includes('/auth/v1/')) {
      if (url.includes('/user')) {
        return new Response(JSON.stringify(session.user), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const m = url.match(/\/rest\/v1\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const selectRaw = params.get('select') || '*';

    if (table) {
      console.log(`[shim-select] ${table}: ${selectRaw.replace(/\s+/g, '')}`);
    }

    if (!table || PASSTHROUGH.has(table)) {
      // Real read. The harness session's token is not a real JWT, so the anon
      // key goes back on before the request leaves.
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      return realFetch(url, { ...opts, headers });
    }

    if ((opts.method || 'GET').toUpperCase() !== 'GET') {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!cardsReady) cardsReady = loadCards();
    await cardsReady;

    let rows = (TABLES[table] || []).slice();
    for (const [key, raw] of params.entries()) {
      if (RESERVED.has(key)) continue;
      rows = applyFilter(rows, key, raw);
    }

    const order = params.get('order');
    if (order) {
      const [col, ...mods] = order.split('.');
      const desc = mods.includes('desc');
      rows.sort((a, b) => {
        const x = a[col];
        const y = b[col];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1);
      });
    }

    const total = rows.length;
    const limit = params.get('limit');
    if (limit) rows = rows.slice(0, Number(limit));

    const fields = parseSelect(selectRaw);
    const body = rows.map(r => project(r, fields, table));

    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    const single = accept.includes('vnd.pgrst.object');

    return new Response(JSON.stringify(single ? (body[0] ?? null) : body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': `0-${Math.max(0, body.length - 1)}/${total}`,
      },
    });
  };

  window.__dmHarnessDeckId = DECK_ID;
})();
