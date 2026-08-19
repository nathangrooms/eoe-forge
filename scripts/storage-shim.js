/**
 * A WRITABLE PostgREST stand-in, injected in front of `fetch` before the app
 * loads. Read the header of scripts/storage-shots.mjs for why it exists.
 *
 * `scripts/price-shim.js` proved the technique but answers GET only — every
 * other verb returns `[]`. Storage cannot be verified that way, because the
 * whole point is that cards move: adding, moving and pocketing are all writes.
 * So this one holds real tables in memory and serves INSERT, UPDATE and DELETE
 * as well, plus the two storage RPCs.
 *
 * Rules, same shape as the price shim:
 *   1. World-readable tables (`cards`, `cards_unique`) go to the REAL database
 *      with the real anon key, so every card, every image and every price on
 *      screen is a real row from production.
 *   2. Owner-scoped tables are answered from rows built here — seeded from the
 *      REAL container/slot/item shapes measured in production on 2026-08-19 —
 *      and projected through the request's own `select=`, embeds included.
 *
 * No credentials anywhere. The session handed to AuthProvider is local and
 * never leaves the browser.
 *
 * The two RPCs mirror `storage_move_cards` and `storage_add_slot`. They are a
 * mirror and not the real thing, which is a real limit of this harness: it
 * verifies that the INTERFACE drives a move correctly end to end. The database
 * function's own behaviour was verified separately, directly against production
 * inside a rolled-back transaction.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const realFetch = window.fetch.bind(window);

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

  const BINDER = 'aaaaaaaa-0000-4000-8000-00000000bind';
  const BULK = 'bbbbbbbb-0000-4000-8000-00000000bulk';
  const DECKBOX = 'cccccccc-0000-4000-8000-0000000000db';

  /**
   * Real `cards.id` values, read out of production. Every one exists, so the
   * art, names and prices on screen are the catalogue's own.
   */
  const CARDS = [
    '02e8e540-8aa3-4e6a-9a11-c3949cab5f0f', // Tezzeret, Cruel Captain
    '4415d050-7a76-4f8b-bf78-e33dd21fe4f1', // Abhorrent Overlord
    'e16365a2-4969-4ad5-af95-9dd2d0499f06', // Aardvark Sloth
    '423f13ba-e165-4add-9935-d88503e1e761', // A-Armory Veteran
    'befb996b-1da6-41a3-8d9a-a45c2353c401', // Auriok Salvagers
    'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad', // Sol Ring, the card the run adds
  ];

  const iso = '2026-08-19T00:00:00+00:00';

  const storage_containers = [
    { id: BINDER, user_id: USER_ID, name: 'Binder', type: 'binder', color: null, icon: null, is_default: false, deck_id: null, created_at: iso, updated_at: iso },
    { id: BULK, user_id: USER_ID, name: 'Plains Spacecraft', type: 'box', color: null, icon: null, is_default: false, deck_id: null, created_at: iso, updated_at: iso },
    { id: DECKBOX, user_id: USER_ID, name: 'Commander box', type: 'deckbox', color: null, icon: null, is_default: false, deck_id: null, created_at: iso, updated_at: iso },
  ];

  /**
   * The six dividers that really are in the database and that no screen has
   * ever mentioned. Same names, same positions.
   */
  const storage_slots = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless'].map(
    (name, position) => ({ id: `slot-${position}`, container_id: BULK, name, position })
  );

  /**
   * One card held in THREE copies, because that is the case the move has to get
   * right: send one elsewhere and two stay behind.
   */
  const storage_items = [
    { id: 'item-0', container_id: BULK, slot_id: null, pocket: null, card_id: CARDS[1], qty: 3, foil: false, created_at: iso, updated_at: iso },
    { id: 'item-1', container_id: BULK, slot_id: null, pocket: null, card_id: CARDS[2], qty: 1, foil: false, created_at: iso, updated_at: iso },
    { id: 'item-2', container_id: BULK, slot_id: null, pocket: null, card_id: CARDS[3], qty: 2, foil: false, created_at: iso, updated_at: iso },
    { id: 'item-3', container_id: BINDER, slot_id: null, pocket: null, card_id: CARDS[0], qty: 1, foil: false, created_at: iso, updated_at: iso },
  ];

  const user_collections = CARDS.map((card_id, i) => ({
    id: `col-${i}`,
    user_id: USER_ID,
    card_id,
    card_name: null,
    set_code: null,
    quantity: 8,
    foil: 0,
    condition: 'near_mint',
    price_usd: null,
    created_at: iso,
    updated_at: iso,
  }));

  const profiles = [
    { id: USER_ID, username: 'Harness', is_admin: false, avatar_url: null, created_at: iso },
  ];

  const TABLES = {
    storage_containers,
    storage_slots,
    storage_items,
    user_collections,
    profiles,
    user_decks: [],
    deck_cards: [],
    wishlist: [],
    favorite_decks: [],
    activity_log: [],
    listings: [],
    sales: [],
    messages: [],
    user_preferences: [],
    collection_value_history: [],
    card_price_history: [],
  };

  const PASSTHROUGH = new Set(['cards', 'cards_unique', 'sync_status', 'precons']);

  /* --------------------------------------------------- real card lookup */

  const cardCache = new Map();
  let cardsReady = null;

  /**
   * Retried, and it never rejects.
   *
   * A single transient failure here used to poison `cardsReady` for the life of
   * the page: every later request awaited a rejected promise, so the whole app
   * fell over and a screenshot run reported twenty imaginary failures. A flaky
   * network is not a finding about the interface.
   */
  async function loadCards() {
    /* A seed the driver read out of production before the browser started. It
       is the same rows the live call would return, so the screen is still drawn
       from real data; it just does not go down when PostgREST reloads its
       schema cache mid-run. */
    for (const row of window.__dmCardSeed || []) cardCache.set(row.id, row);

    if (cardCache.size < CARDS.length) {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const res = await realFetch(
            `${URL_BASE}/rest/v1/cards?select=*&id=in.(${CARDS.join(',')})`,
            { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
          );
          if (res.ok) {
            const rows = await res.json();
            if (Array.isArray(rows) && rows.length) {
              for (const row of rows) cardCache.set(row.id, row);
              break;
            }
          }
        } catch (error) {
          console.log('[shim] card load attempt failed:', String(error).slice(0, 120));
        }
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }

    for (const row of user_collections) {
      const card = cardCache.get(row.card_id);
      if (card) {
        row.card_name = card.name;
        row.set_code = card.set_code;
      }
    }
    window.__dmCardsReady = cardCache.size;
  }

  /** A card the app added mid-run: fetch it so the new row can render. */
  async function ensureCard(id) {
    if (!id || cardCache.has(id)) return;
    try {
      const res = await realFetch(`${URL_BASE}/rest/v1/cards?select=*&id=eq.${id}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      });
      for (const row of await res.json()) cardCache.set(row.id, row);
    } catch {}
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
      const rel = field.name;
      if (rel === 'cards') {
        const card = cardCache.get(row.card_id);
        target[key] = card ? project(card, field.children) : null;
      } else if (rel === 'storage_items') {
        target[key] = storage_items
          .filter(i => i.container_id === row.id)
          .map(i => project(i, field.children));
      } else if (rel === 'storage_slots') {
        // A to-one embed: the slot this row is filed under, or null.
        const slot = storage_slots.find(s => s.id === row.slot_id);
        target[key] = slot ? project(slot, field.children) : null;
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
          String(r[key] ?? '')
            .toLowerCase()
            .includes(value.replace(/\*/g, '').toLowerCase())
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

  const uid = () =>
    'x-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);

  /* ---------------------------------------------------------------- RPC */

  /**
   * The same rules `storage_move_cards` enforces in SQL, so the interface is
   * exercised against behaviour that matches production: carry the printing and
   * the finish, merge into a matching loose stack, split when only part of the
   * stack is moving, one card per pocket, qty 1 for a pocketed row.
   */
  function moveCards({ p_item_id, p_qty, p_to_container, p_to_slot = null, p_to_pocket = null }) {
    const src = storage_items.find(i => i.id === p_item_id);
    if (!src) throw new Error('That card is not in your storage');
    if (!(p_qty >= 1)) throw new Error('Move at least one card');
    if (p_qty > src.qty) throw new Error(`There are only ${src.qty} of those here`);
    if (!storage_containers.some(c => c.id === p_to_container)) {
      throw new Error('That container is not yours');
    }
    if (p_to_slot && !storage_slots.some(s => s.id === p_to_slot && s.container_id === p_to_container)) {
      throw new Error('That section is not in the container you are moving to');
    }
    if (p_to_pocket != null) {
      if (!p_to_slot) throw new Error('A pocket needs a page');
      if (p_to_pocket < 1 || p_to_pocket > 9) throw new Error('A binder page has nine pockets');
      if (p_qty !== 1) throw new Error('A pocket holds one card');
      if (storage_items.some(i => i.slot_id === p_to_slot && i.pocket === p_to_pocket && i.id !== src.id)) {
        throw new Error('That pocket already has a card in it');
      }
    }

    const samePlace =
      src.container_id === p_to_container &&
      (src.slot_id ?? null) === (p_to_slot ?? null) &&
      (src.pocket ?? null) === (p_to_pocket ?? null);
    if (samePlace) return src.id;

    let target = null;
    if (p_to_pocket == null) {
      target =
        storage_items.find(
          i =>
            i.container_id === p_to_container &&
            (i.slot_id ?? null) === (p_to_slot ?? null) &&
            i.pocket == null &&
            i.card_id === src.card_id &&
            i.foil === src.foil &&
            i.id !== src.id
        ) ?? null;
    }

    let landed;
    if (target) {
      target.qty += p_qty;
      landed = target.id;
    } else if (p_qty === src.qty) {
      // Whole stack, nothing to merge with: repoint the row itself.
      src.container_id = p_to_container;
      src.slot_id = p_to_slot ?? null;
      src.pocket = p_to_pocket ?? null;
      src.updated_at = new Date().toISOString();
      return src.id;
    } else {
      const row = {
        id: uid(),
        container_id: p_to_container,
        slot_id: p_to_slot ?? null,
        pocket: p_to_pocket ?? null,
        card_id: src.card_id,
        qty: p_qty,
        foil: src.foil,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      storage_items.push(row);
      landed = row.id;
    }

    if (p_qty === src.qty) {
      storage_items.splice(storage_items.indexOf(src), 1);
    } else {
      src.qty -= p_qty;
    }
    return landed;
  }

  function addSlot({ p_container, p_name }) {
    const here = storage_slots.filter(s => s.container_id === p_container);
    const slot = {
      id: uid(),
      container_id: p_container,
      name: (p_name || '').trim() || 'Section',
      position: here.reduce((max, s) => Math.max(max, s.position), -1) + 1,
    };
    storage_slots.push(slot);
    return slot;
  }

  const RPC = { storage_move_cards: moveCards, storage_add_slot: addSlot };

  /* -------------------------------------------------------------- fetch */

  const json = (body, status = 200, extra = {}) =>
    new Response(body === null ? 'null' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...extra },
    });

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      if (url.includes('/user')) return json(session.user);
      return json(session);
    }

    if (!cardsReady) cardsReady = loadCards();
    await cardsReady;

    const method = (opts.method || 'GET').toUpperCase();
    const parsed = new URL(url);
    const params = parsed.searchParams;

    /* RPC */
    const rpcMatch = url.match(/\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)/);
    if (rpcMatch) {
      const name = rpcMatch[1];
      const args = opts.body ? JSON.parse(opts.body) : {};
      console.log(`[shim-rpc] ${name} ${JSON.stringify(args)}`);
      const fn = RPC[name];
      if (!fn) return json({ message: `no shim for rpc ${name}` }, 404);
      try {
        return json(fn(args));
      } catch (error) {
        return json({ message: error.message, code: 'P0001' }, 400);
      }
    }

    const m = url.match(/\/rest\/v1\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    if (!table || PASSTHROUGH.has(table)) {
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      try {
        const res = await realFetch(url, { ...opts, headers });
        if (res.ok || res.status < 500) return res;
        console.log(`[shim] ${table} passthrough returned ${res.status}, using the seed`);
      } catch (error) {
        console.log(`[shim] ${table} passthrough failed, using the seed`);
      }

      /* PostgREST is momentarily unavailable. Answer from the rows already read
         out of production rather than letting an outage look like a broken
         screen. Still real data, just already in hand. */
      if (table !== 'cards' && table !== 'cards_unique') {
        return json({ message: 'unavailable' }, 503);
      }
      const seed = [...cardCache.values()];
      let hits = seed;
      const p = new URL(url).searchParams;
      for (const [key, raw] of p.entries()) {
        if (RESERVED.has(key)) continue;
        hits = applyFilter(hits, key, raw);
      }
      const cap = p.get('limit');
      if (cap) hits = hits.slice(0, Number(cap));
      const fs = parseSelect(p.get('select') || '*');
      const shaped = hits.map(r => project(r, fs));
      const acc = new Headers(opts.headers || {}).get('Accept') || '';
      return json(acc.includes('vnd.pgrst.object') ? shaped[0] ?? null : shaped);
    }

    const selectRaw = params.get('select') || '*';
    const fields = parseSelect(selectRaw);
    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    const single = accept.includes('vnd.pgrst.object');
    console.log(`[shim] ${method} ${table} ${selectRaw.replace(/\s+/g, '')}`);

    if (method === 'POST') {
      const payload = JSON.parse(opts.body || '{}');
      const rows = Array.isArray(payload) ? payload : [payload];
      const created = [];
      for (const row of rows) {
        const record = {
          id: uid(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        if (table === 'storage_items') {
          record.slot_id = record.slot_id ?? null;
          record.pocket = record.pocket ?? null;
          record.foil = Boolean(record.foil);
          await ensureCard(record.card_id);
        }
        (TABLES[table] = TABLES[table] || []).push(record);
        created.push(record);
      }
      const body = created.map(r => project(r, fields));
      return json(single ? body[0] ?? null : body, 201);
    }

    if (method === 'PATCH') {
      const patch = JSON.parse(opts.body || '{}');
      const rows = matching(table, params);
      for (const row of rows) Object.assign(row, patch, { updated_at: new Date().toISOString() });
      const body = rows.map(r => project(r, fields));
      return json(single ? body[0] ?? null : body);
    }

    if (method === 'DELETE') {
      const rows = matching(table, params);
      TABLES[table] = (TABLES[table] || []).filter(r => !rows.includes(r));
      if (table === 'storage_items') storage_items.length = 0, storage_items.push(...TABLES[table]);
      const body = rows.map(r => project(r, fields));
      return json(single ? body[0] ?? null : body);
    }

    /* GET */
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
    const total = rows.length;
    const limit = params.get('limit');
    if (limit) rows = rows.slice(0, Number(limit));
    const body = rows.map(r => project(r, fields));
    return json(single ? body[0] ?? null : body, 200, {
      'Content-Range': `0-${Math.max(0, body.length - 1)}/${total}`,
    });
  };

  /* What the run reads back to check the move actually happened. */
  window.__dmStorage = {
    containers: storage_containers,
    slots: storage_slots,
    items: storage_items,
    ids: { BINDER, BULK, DECKBOX, CARDS },
    snapshot: () =>
      storage_items.map(i => ({
        container: storage_containers.find(c => c.id === i.container_id)?.name,
        card: cardCache.get(i.card_id)?.name ?? i.card_id,
        card_id: i.card_id,
        qty: i.qty,
        slot: storage_slots.find(s => s.id === i.slot_id)?.name ?? null,
        pocket: i.pocket ?? null,
      })),
  };
})();
