/**
 * A PostgREST stand-in for photographing the dashboard, injected in front of
 * `fetch` before the app loads. Same technique as `scripts/price-shim.js`, read
 * that file's header first.
 *
 * Why a fixture at all: `/dashboard` reads six tables whose RLS is scoped to
 * `auth.uid()`, so a signed-out run renders nothing but empty states. No
 * credentials are entered anywhere; the session handed to AuthProvider is a
 * local object that never leaves the browser.
 *
 * What is real and what is not, stated plainly because this repo has shipped
 * fabricated data twice:
 *
 *   - REAL, straight from the live database: every card row, every price, and
 *     every row of `card_price_history`. `cards` and `card_price_history` are
 *     both world-readable, so they pass through with the anon key and the
 *     screenshots show the database's own numbers.
 *   - FIXTURE, defined below: which cards this pretend account owns, wants and
 *     has put in decks. Those are ownership facts, and no anonymous request can
 *     ever be shown a real person's ownership.
 *
 * So a price on screen is always a real price. A *quantity* is invented. The
 * deck shapes are modelled on the one account in this database that has real
 * data (nine Commander decks, most under 100 cards, several with no commander,
 * two empty) because that shape is what the dashboard has to handle well.
 *
 * `?state=empty` serves a brand-new account instead. Twelve of the thirteen
 * real accounts look like that, so it is the more common screen of the two.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const EMPTY = new URLSearchParams(location.search).get('state') === 'empty';

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

  /* ------------------------------------------------------------ fixtures */

  /** Real printing ids. Names are filled in from the real card rows at load. */
  const C = {
    atraxa: 'd0d33d52-3d28-4635-b985-51e126289259',
    edgar: 'a577ba08-0aa8-45be-aa83-d5078770127c',
    lyra: 'b2abce4d-ef21-4028-8a86-b7d1387bc937',
    miirym: 'a934590b-5c70-4f07-af67-fbe817a99531',
    yuriko: 'fe9be3e0-076c-4703-9750-2a6b0a178bc9',
    krenko: '824b2d73-2151-4e5e-9f05-8f63e2bdcaa9',
    kaalia: 'e71c8c39-3fbb-4a42-9cf6-b3224f5a56fc',
    prosper: 'd743336e-d5c7-4053-a23d-92ec7581f74e',
    rift: 'dfb7c4b9-f2f4-4d4e-baf2-86551c8150fe',
    demonic: 'a24b4cb6-cebb-428b-8654-74347a6a8d63',
    rhystic: '9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b',
    tithe: '861b5889-0183-4bee-afeb-a4b2aa700a8e',
    henge: '6340e0f3-7f9c-4d71-8daf-e1be5505eb5b',
    vampiric: '34a0203f-9cce-43a4-9cb7-8ce6647895cd',
    crypt: '4d960186-4559-4af0-bd22-63baa15f8939',
    lotus: 'd7183700-6941-4a3d-a581-4f33bea795e9',
    doubling: 'f2c4f80e-84a0-463b-82c3-5c6503809351',
    hoof: '276f5cee-a501-4658-bd4d-7a044bf1ccbc',
    dockside: '9e2e3efb-75cb-430f-b9f4-cb58f3aeb91b',
    solring: 'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad',
    hoofNoPrice: '0e172790-7ab4-4dea-9439-e3cedd3e5cab',
  };

  const day = n => new Date(Date.now() - n * 86400000).toISOString();

  /** [card_id, quantity, foil] */
  const OWNED = [
    [C.rhystic, 1, 0],
    [C.demonic, 1, 0],
    [C.henge, 1, 0],
    [C.tithe, 1, 0],
    [C.vampiric, 1, 0],
    [C.lotus, 1, 0],
    [C.crypt, 1, 0],
    [C.rift, 1, 0],
    [C.edgar, 1, 0],
    [C.doubling, 1, 0],
    [C.atraxa, 1, 0],
    [C.hoof, 2, 0],
    [C.dockside, 1, 0],
    [C.miirym, 1, 0],
    [C.yuriko, 1, 0],
    [C.solring, 4, 1],
    [C.krenko, 2, 0],
    [C.kaalia, 1, 0],
    [C.lyra, 1, 0],
    [C.prosper, 1, 0], // no USD price at all — the honesty case
    [C.hoofNoPrice, 1, 0], // ditto
  ];

  const user_collections = OWNED.map((row, i) => ({
    id: `col-${i}`,
    user_id: USER_ID,
    card_id: row[0],
    card_name: null,
    set_code: null,
    quantity: row[1],
    foil: row[2],
    condition: 'near_mint',
    price_usd: null,
    created_at: day(40 - i),
    updated_at: day(i < 4 ? i : 40 - i),
  }));

  /**
   * Deck shapes copied from the one account with real data: mostly Commander,
   * mostly short of 100, one with no commander at all, two empty.
   * [id, name, commander, cardCount, days since touched, favourite]
   */
  const DECKS = [
    ['d1', 'Atraxa counters', C.atraxa, 79, 1, true],
    ['d2', 'Edgar Markov vampires', C.edgar, 86, 3, false],
    ['d3', 'Angels', null, 67, 6, false],
    ['d4', 'Miirym dragons', C.miirym, 100, 9, true],
    ['d5', 'Yuriko ninjas', C.yuriko, 100, 14, false],
    ['d6', 'Krenko goblins', C.krenko, 64, 21, false],
    ['d7', 'Kaalia reanimator', C.kaalia, 1, 30, false],
    ['d8', 'Prosper treasure', C.prosper, 0, 44, false],
    ['d9', 'New Commander deck', null, 0, 61, false],
  ];

  const DECK_UUID = i => `dddddddd-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;

  const user_decks = DECKS.map((d, i) => ({
    id: DECK_UUID(i),
    user_id: USER_ID,
    name: d[1],
    format: 'commander',
    colors: [],
    archetype: null,
    description: null,
    folder_id: null,
    is_public: false,
    public_enabled: false,
    public_slug: null,
    published_at: null,
    share_view_count: 0,
    power_level: 0,
    edh_analysis: null,
    edh_analysis_updated_at: null,
    edh_cards_hash: null,
    created_at: day(120),
    updated_at: day(d[4]),
  }));

  const FILLER = [C.solring, C.rift, C.demonic, C.hoof, C.dockside, C.doubling, C.henge];

  const deck_cards = [];
  DECKS.forEach((d, i) => {
    const deckId = DECK_UUID(i);
    let remaining = d[3];
    if (d[2] && remaining > 0) {
      deck_cards.push({
        id: `dc-${i}-cmd`,
        deck_id: deckId,
        card_id: d[2],
        card_name: null,
        quantity: 1,
        is_commander: true,
        is_sideboard: false,
        created_at: day(120),
      });
      remaining -= 1;
    }
    // The rest as a handful of rows, so `deck_cards` looks like a list rather
    // than a single row with a large quantity.
    let n = 0;
    while (remaining > 0) {
      const take = Math.min(remaining, Math.ceil(d[3] / 6) || 1);
      deck_cards.push({
        id: `dc-${i}-${n}`,
        deck_id: deckId,
        card_id: FILLER[n % FILLER.length],
        card_name: null,
        quantity: take,
        is_commander: false,
        is_sideboard: false,
        created_at: day(120),
      });
      remaining -= take;
      n += 1;
    }
  });

  const favorite_decks = DECKS.filter(d => d[5]).map((d, i) => ({
    id: `fav-${i}`,
    user_id: USER_ID,
    deck_id: DECK_UUID(DECKS.indexOf(d)),
    created_at: day(10),
  }));

  /** [card_id, quantity, priority] */
  const WANTED = [
    [C.solring, 1, 'high'],
    [C.dockside, 1, 'high'],
    [C.miirym, 1, 'medium'],
    [C.doubling, 1, 'medium'],
    [C.crypt, 1, 'low'],
    [C.lotus, 1, 'low'],
    [C.rhystic, 2, 'high'],
    [C.henge, 1, 'medium'],
    [C.prosper, 1, 'low'],
  ];

  const wishlist = WANTED.map((w, i) => ({
    id: `w-${i}`,
    user_id: USER_ID,
    card_id: w[0],
    card_name: null,
    quantity: w[1],
    priority: w[2],
    category: null,
    note: null,
    target_price_usd: null,
    alert_enabled: false,
    last_notified_at: null,
    created_at: day(20 - i),
    updated_at: day(20 - i),
  }));

  const ACTIVITY = [
    ['card_added', 'card', C.rhystic, { source: 'scan', quantity: 1 }, 0.2],
    ['deck_updated', 'deck', DECK_UUID(0), { format: 'commander' }, 1],
    ['card_added', 'card', C.henge, { source: 'camera_scan', quantity: 1 }, 2],
    ['wishlist_added', 'card', C.crypt, { quantity: 1 }, 3],
    ['deck_created', 'deck', DECK_UUID(1), { format: 'commander' }, 4],
    ['card_added', 'card', C.dockside, { source: 'scan', quantity: 1 }, 6],
    ['deck_opened', 'deck', DECK_UUID(3), { format: 'commander' }, 7],
    ['card_added', 'card', C.lotus, { quantity: 1 }, 9],
    ['wishlist_added', 'card', C.doubling, { quantity: 1 }, 11],
    ['deck_updated', 'deck', DECK_UUID(2), { format: 'commander' }, 13],
    ['card_added', 'card', C.vampiric, { source: 'scan', quantity: 1 }, 15],
    ['deck_opened', 'deck', DECK_UUID(4), { format: 'commander' }, 18],
  ];

  const activity_log = ACTIVITY.map((a, i) => ({
    id: `act-${i}`,
    user_id: USER_ID,
    type: a[0],
    entity: a[1],
    entity_id: a[2],
    meta: a[3],
    created_at: day(a[4]),
  }));

  const profiles = [
    {
      id: USER_ID,
      username: 'Harness',
      is_admin: false,
      avatar_url: null,
      created_at: day(400),
    },
  ];

  const TABLES = EMPTY
    ? {
        user_collections: [],
        wishlist: [],
        user_decks: [],
        deck_cards: [],
        favorite_decks: [],
        activity_log: [],
        profiles,
        collection_value_history: [],
        listings: [],
        sales: [],
        messages: [],
        storage_containers: [],
        storage_items: [],
        price_alerts: [],
        tasks: [],
      }
    : {
        user_collections,
        wishlist,
        user_decks,
        deck_cards,
        favorite_decks,
        activity_log,
        profiles,
        collection_value_history: [],
        listings: [],
        sales: [],
        messages: [],
        storage_containers: [],
        storage_items: [],
        price_alerts: [],
        tasks: [],
      };

  /**
   * Straight to the real database. `card_price_history` is on this list on
   * purpose: it is world-readable, so the trend the dashboard draws is built
   * from the real nightly snapshots rather than from anything invented here.
   *
   * `cards` is NOT, and that is not a change of principle. Its rows are still
   * the real ones, they are simply read once by the shot runner and answered
   * from that copy, so a screenshot does not fail because the database was busy
   * for eight seconds. Any `cards` read the copy cannot satisfy still falls
   * through to the real table below.
   */
  const PASSTHROUGH = new Set(['cards_unique', 'card_price_history', 'sync_status', 'precons']);

  /* --------------------------------------------------- real card lookup */

  const realFetch = window.fetch.bind(window);
  const cardCache = new Map();
  let cardsReady = null;

  /**
   * The card rows, handed in by the shot script rather than fetched here.
   *
   * They are still real rows read from the live database, just read once by the
   * runner and cached to disk. Reading them from the browser made every
   * screenshot depend on the database being responsive at that second, and this
   * is a free-tier instance that several agents share: a long `price_snapshot_run`
   * from another session pushed `select id, name from cards where id = $1` past
   * the eight second statement timeout, PostgREST returned 500, and because
   * every fixture response awaits this promise, one slow query blanked the whole
   * page. Prefetching removes the dependency and makes runs repeatable.
   */
  /**
   * Which prefetched rows answer this `cards` request, or null when it asks for
   * something the copy does not hold and the real table has to be asked.
   *
   * Only the two shapes the dashboard actually sends are understood: by id and
   * by name. Anything else returns null and falls through, which is the safe
   * direction to be wrong in.
   */
  function matchCards(params) {
    const all = [...cardCache.values()];
    const idFilter = params.get('id');
    const nameFilter = params.get('name');

    const values = raw => {
      const [op, ...rest] = raw.split('.');
      const value = rest.join('.');
      if (op === 'eq') return [decodeURIComponent(value)];
      if (op === 'in') {
        return value
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map(v => decodeURIComponent(v.replace(/^"|"$/g, '')));
      }
      return null;
    };

    if (idFilter) {
      const wanted = values(idFilter);
      if (!wanted) return null;
      const rows = wanted.map(id => cardCache.get(id)).filter(Boolean);
      // Any id we do not hold means the copy is not the authority here.
      return rows.length === wanted.length ? rows : null;
    }

    if (nameFilter) {
      const wanted = values(nameFilter);
      if (!wanted) return null;
      const keys = new Set(wanted.map(n => n.toLowerCase()));
      const rows = all.filter(row => keys.has(String(row.name ?? '').toLowerCase()));
      const covered = new Set(rows.map(row => String(row.name).toLowerCase()));
      return covered.size === keys.size ? rows : null;
    }

    return null;
  }

  async function loadCards() {
    for (const row of window.__dmCards ?? []) cardCache.set(row.id, row);

    // Names come from the real card row, so the fixture never names a card the
    // catalogue does not hold.
    const name = id => cardCache.get(id)?.name ?? null;
    for (const row of user_collections) {
      row.card_name = name(row.card_id);
      row.set_code = cardCache.get(row.card_id)?.set_code ?? null;
    }
    for (const row of deck_cards) row.card_name = name(row.card_id);
    for (const row of wishlist) row.card_name = name(row.card_id);
    for (const row of activity_log) {
      if (row.entity === 'card') row.meta = { ...row.meta, name: name(row.entity_id) };
      else if (row.entity === 'deck') {
        const deck = user_decks.find(d => d.id === row.entity_id);
        row.meta = { ...row.meta, name: deck?.name ?? null };
      }
    }
  }

  /* ------------------------------------------------- select= projection */

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

  function project(row, fields) {
    if (!fields || fields.some(f => f.name === '*' && !f.children)) {
      const base = { ...row };
      for (const f of fields || []) if (f.children) attach(base, f);
      return base;
    }
    const out = {};
    for (const f of fields) {
      if (f.children) attach(out, f);
      else out[f.alias || f.name] = row[f.name] === undefined ? null : row[f.name];
    }
    return out;

    function attach(target, field) {
      const key = field.alias || field.name;
      if (field.name === 'cards') {
        const card = cardCache.get(row.card_id);
        target[key] = card ? project(card, field.children) : null;
      } else {
        target[key] = TABLES[field.name] ? [] : null;
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
      case 'gt':
        return rows.filter(r => Number(r[key]) > Number(value));
      case 'gte':
        return rows.filter(r => Number(r[key]) >= Number(value));
      case 'lt':
        return rows.filter(r => Number(r[key]) < Number(value));
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

  const RESERVED = new Set([
    'select', 'order', 'limit', 'offset', 'and', 'or', 'on_conflict', 'columns',
  ]);

  /* -------------------------------------------------------------- fetch */

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const opts = init || (typeof input === 'object' ? input : {});

    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      const body = url.includes('/user') ? session.user : session;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const m = url.match(/\/rest\/v1\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const params = new URL(url).searchParams;
    const method = (opts.method || 'GET').toUpperCase();

    if (table) console.log(`[shim-select] ${table}: ${(params.get('select') || '*').replace(/\s+/g, '')}`);

    const passthrough = () => {
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      return realFetch(url, { ...opts, headers });
    };

    if (!table || PASSTHROUGH.has(table)) return passthrough();

    /* `cards`, answered from the prefetched real rows when they cover the
       request. Everything else about the table is unchanged: the same select
       list is projected, so a caller that forgets to ask for `prices` still gets
       a row without `prices`. */
    if (table === 'cards' && (method === 'GET' || method === 'HEAD')) {
      if (!cardsReady) cardsReady = loadCards();
      await cardsReady;
      const rows = matchCards(params);
      if (!rows) return passthrough();
      const body = rows.map(r => project(r, parseSelect(params.get('select') || '*')));
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': `0-${Math.max(0, body.length - 1)}/${body.length}`,
        },
      });
    }

    // Writes are accepted and dropped: nothing here should reach the database.
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!cardsReady) cardsReady = loadCards().catch(() => {});
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

    // `head: true` is how every count on this page is taken, so it has to carry
    // a Content-Range or the dashboard reads every count as null.
    const range = `0-${Math.max(0, rows.length - 1)}/${total}`;
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Range': range },
      });
    }

    const body = rows.map(r => project(r, parseSelect(params.get('select') || '*')));
    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    const single = accept.includes('vnd.pgrst.object');

    return new Response(JSON.stringify(single ? (body[0] ?? null) : body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Range': range },
    });
  };
})();
