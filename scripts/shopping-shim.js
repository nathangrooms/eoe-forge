/**
 * A PostgREST stand-in for the shopping and proxy lists, injected before the
 * app loads. Same two rules as `scripts/price-shim.js`:
 *
 *   1. `cards` goes to the REAL database with the real anon key, so every price
 *      and every piece of art on screen is production data, not a fixture that
 *      agrees with the component by construction.
 *   2. Owner-scoped tables are answered from rows defined here, projected
 *      through the request's own `select=` exactly as PostgREST would.
 *
 * The list rows below are shaped exactly as `card_list_items` defines them,
 * including the constraint that a status and its dates must agree. The same
 * lifecycle was separately exercised for real against the live database through
 * the RPCs; this shim exists only so a screenshot does not require somebody's
 * password.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const SHOPPING_LIST = 'aaaaaaaa-0000-4000-8000-00000000ls01';
  const PROXY_LIST = 'aaaaaaaa-0000-4000-8000-00000000ls02';
  const DECK_A = 'dddddddd-0000-4000-8000-00000000dk01';
  const DECK_B = 'dddddddd-0000-4000-8000-00000000dk02';

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
    localStorage.setItem('sb-udnaflcohfyljrsgqggy-auth-token', JSON.stringify(session));
  } catch {}

  /* ----------------------------------------------------------- fixtures */

  /**
   * Real printings, chosen so the price shapes that matter are all on screen.
   *   Craterhoof cmm has NO usd and NO eur and only a ticket price, which is
   *   the case a rendered $0.00 would lie about.
   */
  const CARD = {
    rhystic: ['9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b', 'Rhystic Study', '53236dd7-845a-444c-96d5-f41ed7325d8f'],
    tithe: ['861b5889-0183-4bee-afeb-a4b2aa700a8e', 'Smothering Tithe', '153376c9-dffd-458c-8ce3-a4c8269bc4e9'],
    rift: ['1fadf1e3-4f4f-4f58-b8a9-11e14bb550f8', 'Cyclonic Rift', 'd75b9c82-1b49-4c3e-a1b5-aeef57d6644b'],
    hoof: ['036f9ba6-6bd1-4be8-b584-f67308e8c60d', 'Craterhoof Behemoth', '8c52bd39-0586-48ca-b263-17210cf9feb6'],
    solring: ['04002706-2236-4b79-bdea-4f263e43cb9c', 'Sol Ring', '6ad8011d-3471-4369-9d68-b264cc027487'],
    tower: ['0548fb60-c843-4f8f-a029-6f10efc63a41', 'Command Tower', '0895c9b7-ae7d-4bb3-af17-3b75deb50a25'],
    swords: ['0e7ff4dc-af63-4342-9a44-d059e62bd14c', 'Swords to Plowshares', 'b1544f21-7e98-461b-aed5-e748b0168c52'],
    dockside: ['47fdac35-d709-4078-8205-ad7c79b6644c', 'Dockside Extortionist', '697bcfe1-ecbf-42a1-bfc7-0766d48ca56b'],
    crypt: ['4d960186-4559-4af0-bd22-63baa15f8939', 'Mana Crypt', '2c63e4e1-89d2-4bc6-a232-94e75c4b1c8a'],
    tutor: ['0fbb8533-9404-4af0-a14a-1e136eacdb3a', 'Demonic Tutor', '82004860-e589-4e38-8d61-8c0210e4ea39'],
  };

  const iso = days => new Date(Date.now() - days * 86400000).toISOString();

  function item(key, over) {
    const [card_id, card_name, oracle_id] = CARD[key];
    return {
      id: `item-${key}-${over.status ?? 'want'}`,
      list_id: over.kind === 'proxy' ? PROXY_LIST : SHOPPING_LIST,
      user_id: USER_ID,
      kind: 'shopping',
      card_id,
      oracle_id,
      card_name,
      finish: 'nonfoil',
      quantity: 1,
      note: null,
      source: 'manual',
      source_deck_id: null,
      status: 'want',
      paid_unit: null,
      paid_currency: null,
      bought_at: null,
      arrived_at: null,
      filed_at: null,
      arrived_card_id: null,
      arrived_finish: null,
      filed_container_id: null,
      filed_deck_id: null,
      created_at: iso(30),
      updated_at: iso(30),
      ...over,
    };
  }

  const card_list_items = [
    // Added by hand from a card page.
    item('rift', { quantity: 1 }),
    // Taken from a deck optimiser suggestion.
    item('solring', { quantity: 1, source: 'suggestion' }),
    // Added from a deck's missing-cards page, so it carries the deck.
    item('hoof', { quantity: 1, source: 'deck', source_deck_id: DECK_A }),

    // Bought three weeks ago and still not here. The fact a wishlist cannot hold.
    item('swords', {
      status: 'bought',
      quantity: 4,
      paid_unit: 1.1,
      paid_currency: 'USD',
      bought_at: iso(23),
    }),
    // Bought and paid in euros, also still out.
    item('tower', {
      status: 'bought',
      quantity: 2,
      paid_unit: 0.25,
      paid_currency: 'EUR',
      bought_at: iso(4),
    }),
    // In hand, waiting to be put away.
    item('dockside', {
      status: 'arrived',
      quantity: 1,
      paid_unit: 14.5,
      paid_currency: 'USD',
      bought_at: iso(12),
      arrived_at: iso(1),
      source_deck_id: DECK_A,
    }),
    // Bought in a bundle, so no per card price was ever known. Blank, not zero.
    item('tithe', {
      id: 'item-tithe-bought',
      status: 'bought',
      quantity: 1,
      bought_at: iso(9),
    }),
    // Already filed away. The purchase record survives.
    item('crypt', {
      status: 'filed',
      quantity: 1,
      paid_unit: 38,
      paid_currency: 'USD',
      bought_at: iso(60),
      arrived_at: iso(52),
      filed_at: iso(52),
    }),
  ];

  const proxy_items = [
    item('tutor', { kind: 'proxy', quantity: 2 }),
    item('crypt', { id: 'proxy-crypt', kind: 'proxy', quantity: 1 }),
    item('rhystic', { id: 'proxy-rhystic', kind: 'proxy', quantity: 1 }),
    item('hoof', { id: 'proxy-hoof', kind: 'proxy', quantity: 1 }),
    item('rift', { id: 'proxy-rift', kind: 'proxy', quantity: 1 }),
  ].map(row => ({ ...row, kind: 'proxy', list_id: PROXY_LIST }));

  const ALL_ITEMS = [...card_list_items, ...proxy_items];

  const card_lists = [
    { id: SHOPPING_LIST, user_id: USER_ID, kind: 'shopping', name: 'Shopping list', created_at: iso(60), updated_at: iso(1) },
    { id: PROXY_LIST, user_id: USER_ID, kind: 'proxy', name: 'Proxy list', created_at: iso(60), updated_at: iso(1) },
  ];

  const wishlist = [
    { id: 'w-1', user_id: USER_ID, card_id: CARD.rhystic[0], card_name: 'Rhystic Study', quantity: 1, priority: 'high', created_at: iso(40), note: null, target_price_usd: null, alert_enabled: false },
    { id: 'w-2', user_id: USER_ID, card_id: CARD.tithe[0], card_name: 'Smothering Tithe', quantity: 1, priority: 'medium', created_at: iso(35), note: null, target_price_usd: null, alert_enabled: false },
    /* A text-imported wishlist row: `card_id` is the literal word, not a
       Scryfall id, so nothing joins onto it and it has NO oracle id. 11 of the
       94 wishlist rows on production look like this, and the admin account's
       Sol Ring is one of them. A deck below is short of the same card and DOES
       carry an oracle id, so this pair is what proves the two sources land on
       one entry rather than printing Sol Ring twice. */
    { id: 'w-3', user_id: USER_ID, card_id: 'sol-ring', card_name: 'Sol Ring', quantity: 1, priority: 'medium', created_at: iso(30), note: null, target_price_usd: null, alert_enabled: false },
  ];

  const user_decks = [
    { id: DECK_A, user_id: USER_ID, name: 'Ghave Tokens', format: 'commander', colors: ['G', 'W', 'B'], description: null, is_public: false, public_enabled: false, power_level: 6, created_at: iso(90), updated_at: iso(2) },
    { id: DECK_B, user_id: USER_ID, name: 'Talrand Draw Go', format: 'commander', colors: ['U'], description: null, is_public: false, public_enabled: false, power_level: 5, created_at: iso(80), updated_at: iso(5) },
  ];

  /* Two decks that each need a Command Tower is the case that proves the sum:
     two decks, two copies. Rhystic Study is wanted by one deck AND the
     wishlist, which is ONE card, not two. */
  const deck_cards = [
    { id: 'dc-1', deck_id: DECK_A, card_id: CARD.rhystic[0], card_name: 'Rhystic Study', quantity: 1, is_commander: false, is_sideboard: false, created_at: iso(90) },
    { id: 'dc-2', deck_id: DECK_A, card_id: CARD.tower[0], card_name: 'Command Tower', quantity: 1, is_commander: false, is_sideboard: false, created_at: iso(90) },
    { id: 'dc-3', deck_id: DECK_B, card_id: CARD.tower[0], card_name: 'Command Tower', quantity: 1, is_commander: false, is_sideboard: false, created_at: iso(80) },
    { id: 'dc-4', deck_id: DECK_B, card_id: CARD.rift[0], card_name: 'Cyclonic Rift', quantity: 1, is_commander: false, is_sideboard: false, created_at: iso(80) },
    { id: 'dc-5', deck_id: DECK_B, card_id: CARD.hoof[0], card_name: 'Craterhoof Behemoth', quantity: 1, is_commander: false, is_sideboard: false, created_at: iso(80) },
    /* Three wanted, two owned, so one short. Pairs with the oracle-less
       wishlist row above. */
    { id: 'dc-6', deck_id: DECK_B, card_id: CARD.solring[0], card_name: 'Sol Ring', quantity: 3, is_commander: false, is_sideboard: false, created_at: iso(80) },
  ];

  const user_collections = [
    { id: 'col-1', user_id: USER_ID, card_id: CARD.crypt[0], card_name: 'Mana Crypt', set_code: '2xm', quantity: 1, foil: 0, condition: 'near_mint', price_usd: null, created_at: iso(52), updated_at: iso(52) },
    { id: 'col-2', user_id: USER_ID, card_id: CARD.solring[0], card_name: 'Sol Ring', set_code: 'ecc', quantity: 2, foil: 0, condition: 'near_mint', price_usd: null, created_at: iso(20), updated_at: iso(20) },
  ];

  const storage_containers = [
    { id: 'box-1', user_id: USER_ID, name: 'Commander binder', type: 'binder', color: null, icon: null, is_default: true, deck_id: null, created_at: iso(200), updated_at: iso(200) },
    { id: 'box-2', user_id: USER_ID, name: 'Bulk box', type: 'box', color: null, icon: null, is_default: false, deck_id: null, created_at: iso(150), updated_at: iso(150) },
  ];

  const profiles = [
    { id: USER_ID, username: 'Harness', is_admin: false, avatar_url: null, created_at: iso(300) },
  ];

  const TABLES = {
    card_lists,
    card_list_items: ALL_ITEMS,
    wishlist,
    user_decks,
    deck_cards,
    user_collections,
    storage_containers,
    storage_items: [],
    profiles,
    favorite_decks: [],
    activity_log: [],
    listings: [],
    sales: [],
    messages: [],
    card_price_history: [],
    collection_value_history: [],
    price_alerts: [],
    deck_maybeboard: [],
    deck_folders: [],
  };

  const PASSTHROUGH = new Set(['cards', 'cards_unique']);

  /* ------------------------------------------------------------ helpers */

  const cardCache = new Map();
  let cardsReady = null;

  /**
   * Pull the real `cards` rows for every fixture id up front.
   *
   * Surfaces that embed `cards(...)` on a row (the collection page does) need
   * the card before the first projection runs, and waiting for some other
   * request to happen to warm the cache leaves them reading `undefined.id`.
   */
  async function loadCards() {
    const ids = [
      ...new Set(
        [
          ...Object.values(CARD).map(c => c[0]),
          ...user_collections.map(r => r.card_id),
          ...deck_cards.map(r => r.card_id),
          ...wishlist.map(r => r.card_id),
        ].filter(Boolean)
      ),
    ];
    const res = await realFetch(
      `${URL_BASE}/rest/v1/cards?select=*&id=in.(${ids.join(',')})`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
    );
    const rows = await res.json();
    if (Array.isArray(rows)) for (const row of rows) if (row?.id) cardCache.set(row.id, row);
  }

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

  function embed(row, field) {
    const key = field.alias || field.name;
    // `cards(...)` is the only embed any of these surfaces asks for, and it is
    // answered from the REAL card row rather than a fixture.
    return [key, field.name === 'cards' ? cardCache.get(row.card_id) ?? null : []];
  }

  function project(row, fields) {
    // `select=*, cards!inner(*)` still has to carry the embed. Returning the
    // bare row here is what made the collection page read `undefined.id`.
    if (!fields || fields.some(f => f.name === '*' && !f.children)) {
      const base = { ...row };
      for (const f of fields || []) {
        if (f.children) {
          const [key, value] = embed(row, f);
          base[key] = value;
        }
      }
      return base;
    }
    const out = {};
    for (const f of fields) {
      if (f.children) {
        const [key, value] = embed(row, f);
        out[key] = value;
      } else {
        out[f.alias || f.name] = row[f.name] === undefined ? null : row[f.name];
      }
    }
    return out;
  }

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
        return value === 'null' ? rows.filter(r => r[key] == null) : rows.filter(r => r[key] != null);
      default:
        return rows;
    }
  }

  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'and', 'or', 'on_conflict', 'columns']);

  const realFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      const body = url.includes('/user') ? session.user : session;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // RPCs are the write path. Nothing is written in a screenshot run.
    if (url.includes('/rest/v1/rpc/')) {
      return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const m = url.match(/\/rest\/v1\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const selectRaw = params.get('select') || '*';

    if (!table || PASSTHROUGH.has(table)) {
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      /* PostgREST answers 503 PGRST002 while it is rebuilding its schema cache,
         which happens whenever anyone applies DDL and can take a minute under
         load. A screenshot run that gives up on the first one photographs an
         empty page and blames the component. */
      let res = await realFetch(url, { ...opts, headers });
      for (let attempt = 0; attempt < 25 && res.status === 503; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        res = await realFetch(url, { ...opts, headers });
      }
      // Cache real card rows so an embedded `cards(...)` can be answered.
      if (table === 'cards' && res.ok) {
        const clone = res.clone();
        try {
          const rows = await clone.json();
          if (Array.isArray(rows)) for (const row of rows) if (row?.id) cardCache.set(row.id, row);
        } catch {}
      }
      return res;
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
    const body = rows.map(r => project(r, fields));
    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    const single = accept.includes('vnd.pgrst.object');

    return new Response(JSON.stringify(single ? body[0] ?? null : body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': `0-${Math.max(0, body.length - 1)}/${total}`,
      },
    });
  };
})();
