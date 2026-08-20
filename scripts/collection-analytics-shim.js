/**
 * A PostgREST stand-in for measuring the Collection analytics tab.
 *
 * Same idea and same rules as `scripts/price-shim.js`, which this is adapted
 * from, with one difference that matters: the owned rows are not a hand-written
 * fixture list. They are built at runtime from ONE real query against
 * `public.cards`, which is world readable, so every name, set, colour, mana
 * value, rarity and price the charts draw is the database's own. Only the
 * QUANTITIES are synthetic, and they are a fixed pattern rather than random, so
 * two runs measure the same page.
 *
 * `SAMPLE` cards are taken in `edhrec_rank` order. That is a real slice of the
 * catalogue and a realistic shape for a collection: popular staples, spread
 * across every colour and rarity, most of them priced and a few not.
 *
 * Two rules, inherited:
 *   1. World-readable tables go to the real database with the real anon key.
 *   2. Owner-scoped tables are answered locally, projected through the request's
 *      own `select=` exactly as PostgREST would, embedded resources included.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const SAMPLE = Number(window.__DM_SAMPLE || 240);

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

  /* ------------------------------------------------------------ layout shift */

  /**
   * Registered here, before any application code runs, because a layout shift
   * that happens during the first paint is the one worth catching and an
   * observer attached after mount would miss it. `buffered: true` also replays
   * anything that landed before this line executed.
   *
   * Shifts following real input are excluded, which is what Cumulative Layout
   * Shift means. Nothing here clicks during the measured window, so in practice
   * every shift counts.
   */
  window.__dmShift = { total: 0, entries: [] };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__dmShift.total += entry.value;
        window.__dmShift.entries.push({
          value: entry.value,
          at: Math.round(entry.startTime),
          sources: (entry.sources || []).map(s => ({
            node: s.node ? `${s.node.nodeName}.${String(s.node.className || '').slice(0, 60)}` : '?',
            from: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
            to: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
          })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    window.__dmShift.error = String(e);
  }

  /* ------------------------------------------------------------ fixtures */

  const cardCache = new Map();
  let sampleIds = [];
  let user_collections = [];
  let ready = null;

  const realFetch = window.fetch.bind(window);

  /**
   * Quantities and finishes, from the row's position. Deterministic on purpose:
   * a random collection makes two runs incomparable, and this script exists to
   * compare runs.
   */
  function ownership(i) {
    const quantity = [1, 1, 2, 1, 4, 1, 3, 1, 1, 2][i % 10];
    const foil = i % 7 === 0 ? 1 : 0;
    // A handful of foil-only stacks, which is the shape that used to be printed
    // at $0.00 and is worth having on screen while measuring.
    if (i % 23 === 0) return { quantity: 0, foil: 2 };
    return { quantity, foil };
  }

  /** Real ids the collection deliberately does NOT hold, for the decks to want. */
  let unownedIds = [];

  async function loadSample() {
    /* ONE request for the whole sample. Never a request per card: analytics
       runs over a whole collection, and per-row queries here are what took the
       database down twice. The extra 100 rows past the collection are the cards
       the decks are missing.

       `cards_unique`, not `cards`, and that is the difference between a useful
       fixture and a useless one. `cards` holds every printing, so the top 240
       rows by `edhrec_rank` were about ten distinct cards: Sol Ring, Command
       Tower, Arcane Signet and their reprints. Every one of them is colourless,
       so the colour chart drew five empty bars and one full one, and the mana
       curve drew a single column. `cards_unique` is one row per card, so the
       sample is 240 different popular cards across every colour, rarity and
       cost. The ids it carries are still real printings. */
    const url =
      `${URL_BASE}/rest/v1/cards_unique?select=*&edhrec_rank=not.is.null` +
      `&order=edhrec_rank.asc&limit=${SAMPLE + 100}`;
    const res = await realFetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const all = await res.json();

    for (const row of all) cardCache.set(row.id, row);
    const rows = all.slice(0, SAMPLE);
    sampleIds = rows.map(r => r.id);
    unownedIds = all.slice(SAMPLE).map(r => r.id);

    user_collections = rows.map((card, i) => {
      const { quantity, foil } = ownership(i);
      const day = String((i % 27) + 1).padStart(2, '0');
      const month = String((i % 8) + 1).padStart(2, '0');
      return {
        id: `col-${i}`,
        user_id: USER_ID,
        card_id: card.id,
        card_name: card.name,
        set_code: card.set_code,
        quantity,
        foil,
        condition: ['near_mint', 'lightly_played', 'near_mint', 'good'][i % 4],
        price_usd: null,
        printing_chosen: false,
        created_at: `2026-${month}-${day}T00:00:00+00:00`,
        updated_at: `2026-${month}-${day}T00:00:00+00:00`,
      };
    });

    window.__dmFixture = {
      rows: user_collections.length,
      copies: user_collections.reduce((n, r) => n + r.quantity + r.foil, 0),
    };
  }

  /**
   * Three decks, each part built from the sample.
   *
   * They exist so the deck recommendation panel actually runs. Its ownership
   * band is 30% to 95%, so each deck takes a slice of the owned sample plus a
   * slice of cards the collection does not hold, which is what makes it look up
   * prices. That lookup was a query per missing card, and a fixture with no
   * decks would have hidden it completely.
   */
  const DECK_IDS = [
    'dddddddd-0000-4000-8000-00000000dm01',
    'dddddddd-0000-4000-8000-00000000dm02',
    'dddddddd-0000-4000-8000-00000000dm03',
  ];

  function decks() {
    return DECK_IDS.map((id, i) => ({
      id,
      user_id: USER_ID,
      name: `Harness deck ${i + 1}`,
      format: 'commander',
      colors: [['G'], ['U', 'B'], ['R']][i],
      description: null,
      is_public: false,
      public_enabled: false,
      power_level: null,
      edh_analysis: null,
      created_at: '2026-01-01T00:00:00+00:00',
      updated_at: '2026-01-01T00:00:00+00:00',
    }));
  }

  /**
   * 100 cards per deck. Sixty come from the collection and forty from the rows
   * past it, so every deck sits at 60% owned, inside the panel's 30-95% band,
   * and has forty real cards to price. All three decks overlap in what they are
   * missing, which is what a real account looks like and is why the distinct set
   * matters when they are fetched.
   */
  function deckCardRows() {
    const rows = [];
    DECK_IDS.forEach((deckId, d) => {
      for (let n = 0; n < 100; n += 1) {
        const owned = n < 60;
        const cardId = owned
          ? sampleIds[(d * 17 + n) % sampleIds.length]
          : unownedIds[(d * 11 + n) % unownedIds.length];
        rows.push({
          id: `dc-${d}-${n}`,
          deck_id: deckId,
          card_id: cardId,
          card_name: null,
          quantity: 1,
          is_commander: n === 0,
          is_sideboard: false,
          created_at: '2026-01-01T00:00:00+00:00',
        });
      }
    });
    return rows;
  }

  /** Value snapshots, so the value-over-time chart has a line to draw. */
  function valueHistory() {
    const out = [];
    const today = new Date('2026-08-20T00:00:00Z');
    for (let d = 29; d >= 0; d -= 1) {
      const date = new Date(today.getTime() - d * 86400000);
      out.push({
        id: `vh-${d}`,
        user_id: USER_ID,
        snapshot_date: date.toISOString().split('T')[0],
        // A fixed shape, not a random walk. Its only job is to make the chart
        // draw so the chart can be measured.
        total_value_usd: 1000 + (29 - d) * 12 + ((29 - d) % 5) * 9,
        card_count: 600,
        created_at: date.toISOString(),
      });
    }
    return out;
  }

  const TABLES = {
    get user_collections() {
      return user_collections;
    },
    collection_value_history: valueHistory(),
    wishlist: [],
    get user_decks() {
      return sampleIds.length ? decks() : [];
    },
    get deck_cards() {
      return sampleIds.length ? deckCardRows() : [];
    },
    storage_containers: [],
    storage_items: [],
    profiles: [{ id: USER_ID, username: 'Harness', is_admin: false, avatar_url: null, created_at: '2026-01-01T00:00:00+00:00' }],
    favorite_decks: [],
    activity_log: [],
    listings: [],
    sales: [],
    messages: [],
    card_price_history: [],
    wishlist_shares: [],
    deck_share_events: [],
    user_preferences: [],
    tasks: [],
    build_logs: [],
    price_alerts: [],
    scan_sessions: [],
    purchases: [],
    purchase_items: [],
  };

  const PASSTHROUGH = new Set(['cards', 'cards_unique', 'sync_status', 'precons']);

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

  /* ---------------------------------------------------------- filtering */

  function applyFilter(rows, key, raw) {
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    switch (op) {
      case 'eq':
        return rows.filter(r => String(r[key] ?? '') === value);
      case 'neq':
        return rows.filter(r => String(r[key] ?? '') !== value);
      case 'in': {
        const set = new Set(value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, '')));
        return rows.filter(r => set.has(String(r[key] ?? '')));
      }
      case 'is':
        return value === 'null' ? rows.filter(r => r[key] == null) : rows.filter(r => r[key] != null);
      case 'not':
        return rows;
      case 'gte':
        return rows.filter(r => String(r[key] ?? '') >= value);
      case 'lte':
        return rows.filter(r => String(r[key] ?? '') <= value);
      case 'ilike':
        return rows.filter(r =>
          String(r[key] ?? '').toLowerCase().includes(value.replace(/\*/g, '').toLowerCase())
        );
      default:
        return rows;
    }
  }

  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'and', 'or', 'on_conflict', 'columns']);

  /** The ids a `cards` request is asking for, or null when it is not asking by id. */
  function idsFrom(params) {
    const raw = params.get('id');
    if (!raw) return null;
    if (raw.startsWith('eq.')) return [raw.slice(3)];
    if (raw.startsWith('in.')) {
      return raw
        .slice(3)
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map(v => v.replace(/^"|"$/g, ''))
        .filter(Boolean);
    }
    return null;
  }

  /* -------------------------------------------------------------- fetch */

  window.__dmRequests = [];

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

    const m = url.match(/\/rest\/v1\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const selectRaw = params.get('select') || '*';

    if (table) {
      window.__dmRequests.push(`${table}: ${selectRaw.replace(/\s+/g, '')}`);
      console.log(`[shim-select] ${table}: ${selectRaw.replace(/\s+/g, '')}`);
    }

    /**
     * `cards` reads by id are answered from the sample already in memory.
     *
     * This is not a shortcut, it is a safety rail. The version of the deck
     * recommendation panel this script measures fires one
     * `cards?select=prices&id=eq.…` per missing card, and there are 120 of them
     * in this fixture. Letting those reach the real database to prove that they
     * exist would be committing the very fault being measured, on a live
     * project that has already had two outages from exactly this pattern. The
     * request is still COUNTED, which is the whole point; it just does not
     * leave the machine.
     *
     * Anything `cards` is asked that the sample cannot answer still goes to the
     * real database, so nothing on screen is invented.
     */
    if (table === 'cards' && ready) {
      const wanted = idsFrom(params);
      if (wanted && wanted.every(id => cardCache.has(id))) {
        await ready;
        const fields = parseSelect(selectRaw);
        const body = wanted.map(id => project(cardCache.get(id), fields));
        const accept = new Headers(opts.headers || {}).get('Accept') || '';
        return new Response(
          JSON.stringify(accept.includes('vnd.pgrst.object') ? body[0] ?? null : body),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!table || PASSTHROUGH.has(table)) {
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      return realFetch(url, { ...opts, headers });
    }

    if ((opts.method || 'GET').toUpperCase() !== 'GET') {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!ready) ready = loadSample();
    await ready;

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
