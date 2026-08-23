/**
 * A PostgREST stand-in for counting per-row query loops.
 *
 * Adapted from `scripts/deck-save-shim.js` and keeps its rules:
 *
 *   1. `cards` and `cards_unique` are forwarded to the real database with the
 *      real anon key, and counted exactly like everything else.
 *   2. Owner-scoped tables are answered locally, projected through the
 *      request's own `select=`, embedded resources included.
 *   3. Writes APPLY. A loop that writes N rows is not measured against a table
 *      that never changed.
 *
 * Every call that reaches the Supabase origin is recorded in `window.__dmReq`,
 * whether it is answered here or forwarded. That list is the measurement.
 *
 * Scenarios are picked with `window.__DM_SCENARIO`.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const OTHER_ID = '00000000-0000-4000-8000-00000000dm02';
  const LISTING_ID = 'llllllll-0000-4000-8000-00000000dm01';
  const CONTAINER_ID = 'cccccccc-0000-4000-8000-00000000dm01';

  const SCENARIO = window.__DM_SCENARIO || 'decks';
  const DECKS = Number(window.__DM_DECKS || 9);
  const SIZE = Number(window.__DM_DECK_SIZE || 100);
  const MESSAGES = Number(window.__DM_MESSAGES || 60);
  const COLLECTION = Number(window.__DM_COLLECTION || 100);

  const deckId = i => `dddddddd-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;

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

  /* AuthProvider clears every per-user localStorage key on the first auth
     event, which lands before the deck store hydrates. Hold the one fixture
     key the deck picker reads; nothing else is affected. */
  const realRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (key) {
    if (key === 'deck-management-storage') return;
    return realRemoveItem.call(this, key);
  };

  /* ----------------------------------------------------------- fixtures */

  const realFetch = window.fetch.bind(window);
  const cardCache = new Map();
  /* Real `cards_unique` rows, fetched once by the measure script and injected
     here, so the fixture is built synchronously at document start. It has to
     be: the deck picker reads a zustand store out of localStorage, and zustand
     hydrates before the first request would have arrived. */
  const cardPool = window.__DM_CARDS || [];

  const TABLES = {
    user_decks: [],
    deck_cards: [],
    user_collections: [],
    favorite_decks: [],
    wishlist: [],
    profiles: [],
    messages: [],
    listings: [],
    storage_containers: [],
    storage_slots: [],
    storage_items: [],
    deck_matches: [],
    deck_notes: [],
    activity_log: [],
    feature_flags: [],
    user_preferences: [],
    tasks: [],
    sync_status_local: [],
  };

  function load() {
    for (const row of cardPool) cardCache.set(row.id, row);

    TABLES.profiles = [
      { id: USER_ID, username: 'Harness', is_admin: false, avatar_url: null, created_at: '2026-01-01T00:00:00+00:00' },
      { id: OTHER_ID, username: 'Seller', is_admin: false, avatar_url: null, created_at: '2026-01-01T00:00:00+00:00' },
    ];

    /* --- decks, for the deck list and for the storage panel's deck picker --- */
    const rows = cardPool.slice(0, SIZE);
    const wantedDecks = SCENARIO === 'decks' ? DECKS : 1;
    for (let d = 0; d < wantedDecks; d += 1) {
      TABLES.user_decks.push({
        id: deckId(d),
        user_id: USER_ID,
        name: `Harness deck ${d + 1}`,
        format: 'commander',
        colors: ['G'],
        description: 'A deck the harness measures against.',
        is_public: false,
        public_enabled: false,
        public_slug: null,
        power_level: 5,
        // No stored analysis: the state an account is in after any decklist
        // edit, and the state that makes the power backfill run.
        edh_analysis: null,
        edh_cards_hash: null,
        edh_analysis_updated_at: null,
        created_at: '2026-01-01T00:00:00+00:00',
        updated_at: `2026-01-0${(d % 9) + 1}T00:00:00+00:00`,
      });
      rows.forEach((card, i) => {
        TABLES.deck_cards.push({
          id: `dc-${d}-${i}`,
          deck_id: deckId(d),
          card_id: card.id,
          card_name: card.name,
          quantity: 1,
          is_commander: i === 0,
          is_sideboard: false,
          created_at: '2026-01-01T00:00:00+00:00',
        });
      });
    }

    /* --- a message thread with exactly two participants --- */
    if (SCENARIO === 'messages') {
      TABLES.listings = [
        {
          id: LISTING_ID,
          user_id: OTHER_ID,
          card_id: rows[0].id,
          card_name: rows[0].name,
          price: 10,
          condition: 'near_mint',
          quantity: 1,
          status: 'active',
          created_at: '2026-01-01T00:00:00+00:00',
        },
      ];
      for (let i = 0; i < MESSAGES; i += 1) {
        const mine = i % 2 === 0;
        TABLES.messages.push({
          id: `msg-${String(i).padStart(3, '0')}`,
          listing_id: LISTING_ID,
          sender_id: mine ? USER_ID : OTHER_ID,
          receiver_id: mine ? OTHER_ID : USER_ID,
          message: `Message number ${i + 1} about this card.`,
          is_read: true,
          created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        });
      }
    }

    /* --- a container, and a collection to file out of --- */
    if (SCENARIO.startsWith('storage')) {
      TABLES.storage_containers = [
        {
          id: CONTAINER_ID,
          user_id: USER_ID,
          name: 'Harness box',
          type: 'box',
          color: null,
          icon: null,
          is_default: false,
          deck_id: null,
          created_at: '2026-01-01T00:00:00+00:00',
          updated_at: '2026-01-01T00:00:00+00:00',
        },
      ];
      const owned = SCENARIO === 'storage-collection' ? cardPool.slice(0, COLLECTION) : [];
      owned.forEach((card, i) => {
        TABLES.user_collections.push({
          id: `uc-${i}`,
          user_id: USER_ID,
          card_id: card.id,
          card_name: card.name,
          set_code: card.set_code,
          quantity: 4,
          foil: 0,
          condition: 'near_mint',
          price_usd: Number((card.prices && card.prices.usd) || 0),
          printing_chosen: false,
          created_at: '2026-01-01T00:00:00+00:00',
          updated_at: '2026-01-01T00:00:00+00:00',
        });
      });

      // The deck picker reads a persisted zustand store, not the database.
      try {
        localStorage.setItem(
          'deck-management-storage',
          JSON.stringify({
            version: 0,
            state: {
              decks: [
                {
                  id: deckId(0),
                  name: 'Harness deck 1',
                  format: 'commander',
                  description: '',
                  cards: rows.map(card => ({
                    id: card.id,
                    name: card.name,
                    cmc: card.cmc,
                    type_line: card.type_line,
                    colors: card.colors || [],
                    mana_cost: card.mana_cost,
                    quantity: 1,
                    category: 'other',
                    image_uris: card.image_uris,
                    prices: card.prices,
                  })),
                  colors: ['G'],
                  powerLevel: 5,
                  totalCards: rows.length,
                  isPublic: false,
                  favorite: false,
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ],
              activeDeck: null,
            },
          })
        );
      } catch {}
    }

    window.__dmFixture = {
      scenario: SCENARIO,
      decks: TABLES.user_decks.length,
      deckCards: TABLES.deck_cards.length,
      messages: TABLES.messages.length,
      collection: TABLES.user_collections.length,
    };
  }

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
        target[key] = [{ count: TABLES.deck_cards.filter(r => r.deck_id === row.id).length }];
      } else if (field.name === 'storage_slots' || field.name === 'slot') {
        const slot = TABLES.storage_slots.find(s => s.id === row.slot_id) || null;
        target[key] = slot ? project(slot, field.children) : null;
      } else if (field.name === 'profiles') {
        const p = TABLES.profiles.find(x => x.id === (row.sender_id || row.user_id)) || null;
        target[key] = p ? project(p, field.children) : null;
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

  /* ------------------------------------------------------- the deck RPC */

  /** The shape `compute_deck_summary` returns, built from the local fixture. */
  function summaryFor(id) {
    const deck = TABLES.user_decks.find(d => d.id === id);
    if (!deck) return null;
    const rows = TABLES.deck_cards.filter(r => r.deck_id === id);
    const card = r => cardCache.get(r.card_id) || {};
    const sum = fn => rows.reduce((n, r) => n + (fn(r) ? r.quantity : 0), 0);
    const typed = word => sum(r => String(card(r).type_line || '').toLowerCase().includes(word));
    const commanderRow = rows.find(r => r.is_commander) || null;
    const commanderCard = commanderRow ? card(commanderRow) : null;
    const bin = test => rows.reduce((n, r) => n + (test(Number(card(r).cmc || 0)) ? r.quantity : 0), 0);

    return {
      id: deck.id,
      name: deck.name,
      format: deck.format,
      colors: deck.colors,
      identity: (commanderCard && commanderCard.color_identity) || [],
      power_level: deck.power_level,
      description: deck.description || '',
      is_public: deck.is_public,
      created_at: deck.created_at,
      updatedAt: deck.updated_at,
      commander: commanderRow
        ? {
            name: commanderRow.card_name,
            image: (commanderCard.image_uris && commanderCard.image_uris.normal) || '',
            image_uris: commanderCard.image_uris || null,
          }
        : null,
      counts: {
        total: rows.reduce((n, r) => n + r.quantity, 0),
        unique: new Set(rows.map(r => r.card_id)).size,
        sideboard: 0,
        lands: typed('land'),
        creatures: typed('creature'),
        instants: typed('instant'),
        sorceries: typed('sorcery'),
        artifacts: typed('artifact'),
        enchantments: typed('enchantment'),
        planeswalkers: typed('planeswalker'),
        battles: typed('battle'),
      },
      curve: {
        bins: {
          '0-1': bin(c => c <= 1),
          2: bin(c => c === 2),
          3: bin(c => c === 3),
          4: bin(c => c === 4),
          5: bin(c => c === 5),
          '6-7': bin(c => c >= 6 && c <= 7),
          '8-9': bin(c => c >= 8 && c <= 9),
          '10+': bin(c => c >= 10),
        },
      },
      mana: {
        sources: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        basis: 'lands',
        unknownLands: [],
        landsMakingNoManaThemselves: [],
        untappedPctByTurn: { t1: 95, t2: 90, t3: 85 },
      },
      legality: { ok: true, issues: [] },
      power: { score: deck.power_level, band: 'mid', drivers: [], drags: [] },
      economy: { priceUSD: 0, ownedPct: 0, missing: 0 },
      tags: [],
      favorite: false,
      cards: rows.map(r => ({
        card_id: r.card_id,
        card_name: r.card_name,
        quantity: r.quantity,
        is_commander: r.is_commander,
        is_sideboard: r.is_sideboard,
        card_data: {
          cmc: card(r).cmc || 0,
          type_line: card(r).type_line || '',
          mana_cost: card(r).mana_cost || '',
          oracle_text: card(r).oracle_text || '',
          produced_mana: card(r).produced_mana || null,
          colors: card(r).colors || [],
          color_identity: card(r).color_identity || [],
          prices: card(r).prices || {},
          edhrec_rank: card(r).edhrec_rank || null,
          rarity: card(r).rarity || 'common',
        },
      })),
      edhAnalysis: deck.edh_analysis,
    };
  }

  function rpcAnswer(name, body) {
    if (name === 'compute_deck_summary') return summaryFor(body && body.deck_id);
    if (name === 'compute_deck_summaries') {
      const ids = (body && body.p_deck_ids) || [];
      return ids.map(summaryFor).filter(Boolean);
    }
    if (name === 'persist_deck_power_batch') {
      const scores = (body && body.p_scores) || [];
      let n = 0;
      for (const entry of scores) {
        const deck = TABLES.user_decks.find(d => d.id === entry.deck_id);
        if (!deck) continue;
        deck.edh_analysis = { ...(deck.edh_analysis || {}), deckmatrix: entry.deckmatrix };
        deck.power_level = entry.power_level;
        n += 1;
      }
      return n;
    }
    if (name === 'resolve_card_names') {
      /* `resolve_card_names` resolves a whole pasted list in one statement. The
         fixture answers it from the same real `cards_unique` rows the deck is
         built from, exact name only, which is the path a decklist takes. */
      const lines = (body && body.p_lines) || [];
      const byName = new Map();
      for (const card of cardPool) byName.set(String(card.name).toLowerCase(), card);
      return lines.map((line, idx) => {
        const card = byName.get(String((line && line.name) || '').toLowerCase()) || null;
        return {
          idx,
          query: (line && line.name) || '',
          status: card ? 'exact' : 'none',
          card: card
            ? {
                id: card.id,
                oracle_id: card.oracle_id,
                name: card.name,
                set_code: card.set_code,
                type_line: card.type_line,
                mana_cost: card.mana_cost,
                cmc: card.cmc,
                colors: card.colors,
                color_identity: card.color_identity,
                image_uris: card.image_uris,
                prices: card.prices,
              }
            : null,
          printings: card ? 1 : 0,
          suggestions: [],
        };
      });
    }
    if (name === 'storage_move_cards') return 'moved';
    return null;
  }

  /* -------------------------------------------------------------- fetch */

  window.__dmReq = [];
  window.__dmResetReq = () => {
    window.__dmReq.length = 0;
  };

  function record(entry) {
    entry.at = Date.now();
    window.__dmReq.push(entry);
  }

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  load();

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    const method = (opts.method || 'GET').toUpperCase();

    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      // Counted: `supabase.auth.getUser()` is a real round trip to the origin.
      record({ method, table: 'auth:user' });
      const body = url.includes('/user') ? session.user : session;
      return json(body);
    }

    if (url.includes('/functions/v1/')) {
      const name = url.split('/functions/v1/')[1].split('?')[0];
      record({ method, table: `fn:${name}` });
      return json({ success: false, error: 'harness' }, 200);
    }

    const parsed = new URL(url);
    const params = parsed.searchParams;
    const m = url.match(/\/rest\/v1\/(?:rpc\/)?([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const isRpc = url.includes('/rest/v1/rpc/');

    if (!table) return realFetch(input, init);

    let body = null;
    try {
      body = opts.body ? JSON.parse(opts.body) : null;
    } catch {
      body = null;
    }

    if (isRpc) {
      record({ method, table: `rpc:${table}` });
      return json(rpcAnswer(table, body));
    }

    if (PASSTHROUGH.has(table)) {
      record({ method, table, passthrough: true });
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      return realFetch(url, { ...opts, headers });
    }

    const selectRaw = params.get('select') || '*';
    const fields = parseSelect(selectRaw);
    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    // `.single()` and `.maybeSingle()` ask for an object, on writes too. A shim
    // that ignores this on PATCH hands back an array, `data.card_id` comes out
    // undefined and every following call fails early — which reads as a cheap
    // page and is not one.
    const single = accept.includes('vnd.pgrst.object');

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
      const out = rows.map(r => project(r, fields));
      return json(single ? out[0] ?? null : out);
    }

    if (method === 'DELETE') {
      const doomed = new Set(matching(table, params).map(r => r.id));
      TABLES[table] = (TABLES[table] || []).filter(r => !doomed.has(r.id));
      record({ method, table, rows: doomed.size });
      return json([]);
    }

    if (method === 'POST') {
      const incoming = Array.isArray(body) ? body : body ? [body] : [];
      const conflict = (params.get('on_conflict') || '').split(',').filter(Boolean);
      const current = TABLES[table] || [];
      const written = [];
      for (const row of incoming) {
        let hit = null;
        if (conflict.length > 0) {
          hit = current.find(r => conflict.every(k => String(r[k]) === String(row[k])));
        } else if (row.id != null) {
          hit = current.find(r => String(r.id) === String(row.id));
        }
        if (hit) {
          Object.assign(hit, row);
          written.push(hit);
        } else {
          const made = { id: `new-${Math.random().toString(36).slice(2, 10)}`, ...row };
          current.push(made);
          written.push(made);
        }
      }
      TABLES[table] = current;
      record({ method, table, rows: incoming.length, upsert: conflict.length > 0 });
      const out = written.map(r => project(r, fields));
      return json(single ? out[0] ?? null : out);
    }

    record({ method, table });
    return json([]);
  };
})();
