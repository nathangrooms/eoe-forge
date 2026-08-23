/**
 * A PostgREST stand-in for driving the deck optimiser end to end.
 *
 * This is `scripts/deck-save-shim.js` with three additions and nothing else
 * changed, because the point is to measure the SAME page the save measurement
 * measures, on the one tab that measurement never reaches:
 *
 *   1. `rpc:check_feature_access` answers `allowed`. The Optimiser tab is
 *      behind the `ai_deck_optimizer` flag and the save shim answers every RPC
 *      with null, so on that shim the tab does not render at all.
 *   2. `fn:deck-optimizer` answers with a real-shaped analysis instead of
 *      `{success:false}`. The replacements are composed HERE, out of the
 *      fixture's own rows, so the outgoing names are cards the deck genuinely
 *      holds rather than names invented in a driver that cannot see the deck.
 *   3. `window.__dmDeckCards()` exposes the shim's `deck_cards` table, so a run
 *      can compare what is ON SCREEN against what was actually WRITTEN. That
 *      distinction is the whole measurement: an optimistic list and a database
 *      can disagree, and only one of them survives a reload.
 *
 * The cards swapped IN are colourless artifacts. `useDeckEditor.refuse()`
 * rejects a card outside the commander's colour identity, and the fixture's
 * commander is whichever creature tops `edhrec_rank` that day, so anything with
 * a colour in it would make the run's result depend on the catalogue rather
 * than on the code under test. An empty colour identity is a subset of every
 * identity.
 *
 * Scryfall is NOT stubbed. `onApplyReplacements` resolves every incoming card
 * by name against `api.scryfall.com`, and stubbing that would remove the
 * request budget, the 120ms spacing and the failure path from the thing being
 * measured. Those calls do not reach `URL_BASE`, so they are not counted as
 * Supabase requests, which is the same rule `deck-save-measure` counts under.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const DECK_ID = 'dddddddd-0000-4000-8000-00000000dm01';
  const SIZE = Number(window.__DM_DECK_SIZE || 100);
  /** How many swaps the stubbed analysis offers. The driver reads this back. */
  const SWAPS = Number(window.__DM_SWAP_COUNT || 9);

  /**
   * Colourless, non-creature, and none of them can collide with the fixture,
   * which is filtered to `type_line ilike '%Creature%'`.
   */
  const INCOMING = [
    'Sol Ring',
    'Arcane Signet',
    'Mind Stone',
    'Thought Vessel',
    'Fellwar Stone',
    "Wayfarer's Bauble",
    'Hedron Archive',
    'Worn Powerstone',
    'Prismatic Lens',
    'Everflowing Chalice',
    'Skyclave Relic',
    'Burnished Hart',
  ];

  window.__DM_DECK_ID = DECK_ID;

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
    localStorage.setItem(
      'deckmatrix.deckView',
      JSON.stringify({ mode: 'grid', sortKey: 'cmc', sortDir: 'asc', size: 150 })
    );
    localStorage.setItem('deckmatrix.deckView.groupBy', 'type');
  } catch {}

  /* ----------------------------------------------------------- fixtures */

  const realFetch = window.fetch.bind(window);
  const cardCache = new Map();
  let ready = null;

  let user_decks = [];
  let deck_cards = [];

  async function load() {
    const url =
      `${URL_BASE}/rest/v1/cards_unique?select=*` +
      `&type_line=ilike.*Creature*&edhrec_rank=not.is.null` +
      `&order=edhrec_rank.asc&limit=${SIZE}`;
    const res = await realFetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const rows = await res.json();
    for (const row of rows) cardCache.set(row.id, row);

    user_decks = [
      {
        id: DECK_ID,
        user_id: USER_ID,
        name: 'Harness deck',
        format: 'commander',
        colors: ['G'],
        description: 'A deck the harness measures saves against.',
        is_public: false,
        public_enabled: false,
        public_slug: null,
        power_level: 5,
        edh_analysis: null,
        edh_cards_hash: null,
        edh_analysis_updated_at: null,
        created_at: '2026-01-01T00:00:00+00:00',
        updated_at: '2026-01-01T00:00:00+00:00',
      },
    ];

    deck_cards = rows.map((card, i) => ({
      id: `dc-${i}`,
      deck_id: DECK_ID,
      card_id: card.id,
      card_name: card.name,
      quantity: 1,
      is_commander: i === 0,
      is_sideboard: false,
      created_at: '2026-01-01T00:00:00+00:00',
    }));

    window.__dmFixture = { deckId: DECK_ID, rows: deck_cards.length };
  }

  /** What the shim's `deck_cards` table holds right now. The written truth. */
  window.__dmDeckCards = () =>
    deck_cards.map(r => ({
      id: r.id,
      card_name: r.card_name,
      quantity: r.quantity,
      is_commander: r.is_commander,
    }));

  /**
   * The analysis, composed against the deck the shim is actually serving.
   *
   * Outgoing rows are taken from the END of the fixture rather than the start:
   * row 0 is the commander and the first rows are the ones the decklist draws
   * first, so taking from the tail keeps the swap targets away from anything a
   * click in the grid might also be touching.
   */
  function optimiserResponse() {
    const pool = deck_cards.filter(r => !r.is_commander);
    const outgoing = pool.slice(-SWAPS);
    const replacements = outgoing.map((row, i) => ({
      remove: row.card_name,
      removeReason: 'Harness fixture row, chosen for the measurement.',
      add: INCOMING[i % INCOMING.length],
      addBenefit: 'Colourless, so colour identity cannot decide this run.',
      addType: 'Artifact',
      priority: 'high',
      category: 'Harness swap',
    }));
    window.__dmPlannedSwaps = replacements.map(r => ({ remove: r.remove, add: r.add }));
    return {
      analysis: {
        summary: 'Harness analysis. Every figure here is fixture, not measured.',
        issues: [],
        strengths: [],
        strategy: [],
        manabase: [],
        categories: null,
        categoriesSource: null,
        additions: [],
        removals: [],
        replacements,
        landRecommendations: [],
        landReplacements: [],
      },
    };
  }

  const TABLES = {
    get user_decks() {
      return user_decks;
    },
    set user_decks(v) {
      user_decks = v;
    },
    get deck_cards() {
      return deck_cards;
    },
    set deck_cards(v) {
      deck_cards = v;
    },
    user_collections: [],
    favorite_decks: [],
    wishlist: [],
    profiles: [
      { id: USER_ID, username: 'Harness', is_admin: false, avatar_url: null, created_at: '2026-01-01T00:00:00+00:00' },
    ],
    deck_matches: [],
    deck_notes: [],
    deck_share_events: [],
    activity_log: [],
    feature_flags: [],
    user_preferences: [],
    tasks: [],
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
      } else if (field.name === 'deck_cards') {
        target[key] = [{ count: deck_cards.filter(r => r.deck_id === row.id).length }];
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
        const set = new Set(
          value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, ''))
        );
        return rows.filter(r => set.has(String(r[key] ?? '')));
      }
      case 'is':
        return value === 'null' ? rows.filter(r => r[key] == null) : rows.filter(r => r[key] != null);
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

  function matching(table, params) {
    let rows = (TABLES[table] || []).slice();
    for (const [key, raw] of params.entries()) {
      if (RESERVED.has(key)) continue;
      rows = applyFilter(rows, key, raw);
    }
    return rows;
  }

  /* -------------------------------------------------------------- fetch */

  window.__dmReq = [];
  window.__dmResetReq = () => {
    window.__dmReq.length = 0;
  };

  function record(entry) {
    window.__dmReq.push(entry);
    console.log(`[req] ${entry.method} ${entry.table} rows=${entry.rows ?? ''}`);
  }

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    const method = (opts.method || 'GET').toUpperCase();

    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      const body = url.includes('/user') ? session.user : session;
      return json(body);
    }

    if (url.includes('/functions/v1/')) {
      const name = url.split('/functions/v1/')[1].split('?')[0];
      record({ method, table: `fn:${name}` });
      if (name === 'deck-optimizer') {
        if (!ready) ready = load();
        await ready;
        return json(optimiserResponse());
      }
      return json({ success: false, error: 'harness' }, 200);
    }

    const parsed = new URL(url);
    const params = parsed.searchParams;
    const m = url.match(/\/rest\/v1\/(?:rpc\/)?([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const isRpc = url.includes('/rest/v1/rpc/');

    if (!table) return realFetch(input, init);

    if (isRpc) {
      record({ method, table: `rpc:${table}` });
      if (table === 'check_feature_access') {
        return json({ allowed: true, is_admin: false, limit: -1, used: 0, remaining: -1 });
      }
      return json(null);
    }

    if (PASSTHROUGH.has(table)) {
      record({ method, table, passthrough: true });
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      return realFetch(url, { ...opts, headers });
    }

    if (!ready) ready = load();
    await ready;

    const selectRaw = params.get('select') || '*';
    const fields = parseSelect(selectRaw);
    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    const single = accept.includes('vnd.pgrst.object');
    let body = null;
    try {
      body = opts.body ? JSON.parse(opts.body) : null;
    } catch {
      body = null;
    }

    if (method === 'GET') {
      let rows = matching(table, params);
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
      const limit = Number(params.get('limit') || 0);
      if (limit > 0) rows = rows.slice(0, limit);
      record({ method, table, rows: rows.length, read: true });
      const out = rows.map(r => project(r, fields));
      return json(single ? out[0] ?? null : out);
    }

    if (method === 'PATCH') {
      const rows = matching(table, params);
      for (const row of rows) Object.assign(row, body || {});
      record({ method, table, rows: rows.length });
      return json(rows.map(r => project(r, fields)));
    }

    if (method === 'DELETE') {
      const doomed = new Set(matching(table, params).map(r => r.id));
      TABLES[table] = (TABLES[table] || []).filter(r => !doomed.has(r.id));
      record({ method, table, rows: doomed.size, names: [...doomed] });
      return json([]);
    }

    if (method === 'POST') {
      const incoming = Array.isArray(body) ? body : body ? [body] : [];
      const conflict = (params.get('on_conflict') || '').split(',').filter(Boolean);
      const current = TABLES[table] || [];
      for (const row of incoming) {
        const hit =
          conflict.length > 0
            ? current.find(r => conflict.every(k => String(r[k]) === String(row[k])))
            : null;
        if (hit) Object.assign(hit, row);
        else current.push({ id: `new-${Math.random().toString(36).slice(2, 10)}`, ...row });
      }
      TABLES[table] = current;
      record({
        method,
        table,
        rows: incoming.length,
        upsert: conflict.length > 0,
        names: incoming.map(r => r.card_name).filter(Boolean),
      });
      return json(incoming.map(r => project(r, fields)));
    }

    record({ method, table });
    return json([]);
  };
})();
