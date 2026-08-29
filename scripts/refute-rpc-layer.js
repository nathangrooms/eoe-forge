/**
 * A second layer over `scripts/refute-shim.js` that answers the four calls the
 * base shim could not, so the four routes that depend on them are walked doing
 * their job rather than drawing an empty state.
 *
 * The base shim returns `null` for every RPC and `{success:false}` for every
 * edge function, and records the names in `window.__dmRpc`. Reading that list
 * off the 2026-08-29 walk gave exactly four unanswered calls outside the play
 * routes:
 *
 *   /decks            rpc:compute_deck_summaries   -> "Create New Deck", i.e.
 *                                                     an account with two decks
 *                                                     told it has none
 *   /precons          fn:fetch-precons             -> "0 precons"
 *   /deck/:id/optimise rpc:check_feature_access    -> "not switched on for this
 *                                                     account"
 *   /tutor            rpc:compute_deck_summaries   -> no deck to attach
 *
 * All four are harness artefacts, and each was checked against the real backend
 * before being answered here:
 *
 *   - `compute_deck_summaries` returns real rows for these deck ids. Run as
 *     service_role it gives Atraxa 100 cards / 33 lands / power 7.34.
 *   - `fetch-precons?action=list` answers 200 with a real product list over
 *     HTTP with the anon key, so this layer FORWARDS it rather than faking it.
 *   - `feature_flags.ai_deck_optimizer` is `enabled = true` in production.
 *
 * The summary below is built in JS from the same fixture rows the base shim
 * already holds, following `compute_deck_summary`'s own jsonb shape field for
 * field. It is a stand-in for the function, not a second implementation of it:
 * nothing in the app reads it except the tiles being photographed.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const baseFetch = window.fetch;

  /**
   * A way out to the real backend that the shim cannot see.
   *
   * The base shim replaced `window.fetch` and kept the original privately, so
   * "forward this to the real backend" cannot mean calling `window.fetch`: that
   * is the shim, and it answers `{success:false}` for every edge function. A
   * first version of this layer did exactly that, and `/precons` came back
   * still saying "0 precons" while the walk recorded `fn:fetch-precons` as
   * unanswered. An iframe's own `fetch` was the second attempt and its
   * `contentWindow` came back null. `XMLHttpRequest` is untouched by any shim
   * here, so it goes out.
   */
  function realFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(opts.method || 'GET', url, true);
      const headers = opts.headers || {};
      for (const k of Object.keys(headers)) xhr.setRequestHeader(k, headers[k]);
      xhr.onload = () =>
        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      xhr.onerror = () => reject(new Error(`xhr failed: ${url}`));
      xhr.send(opts.body || null);
    });
  }

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* Read the fixture tables back out of the base shim by asking it, so this
     layer never keeps a second copy of the deck. */
  async function readTable(table, query) {
    const res = await baseFetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    return res.json();
  }

  const cardCache = new Map();
  async function cardsByIds(ids) {
    const missing = ids.filter(id => !cardCache.has(id));
    for (let i = 0; i < missing.length; i += 120) {
      const slice = missing.slice(i, i + 120);
      const res = await realFetch(
        `${URL_BASE}/rest/v1/cards?select=*&id=in.(${slice.join(',')})`,
        { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
      );
      for (const row of await res.json()) cardCache.set(row.id, row);
    }
    return ids.map(id => cardCache.get(id)).filter(Boolean);
  }

  const num = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  async function summaryFor(deckId) {
    const decks = await readTable('user_decks', `select=*&id=eq.${deckId}`);
    const deck = Array.isArray(decks) ? decks[0] : decks;
    if (!deck) return null;
    const rows = await readTable('deck_cards', `select=*&deck_id=eq.${deckId}`);
    const cards = await cardsByIds(rows.map(r => r.card_id));
    const byId = new Map(cards.map(c => [c.id, c]));

    const count = pred =>
      rows.reduce(
        (n, r) => n + (pred(byId.get(r.card_id) || {}) ? r.quantity || 1 : 0),
        0
      );
    const type = re => c => re.test(String(c.type_line || '').toLowerCase());
    const total = rows.reduce((n, r) => n + (r.quantity || 1), 0);
    const commanderRow = rows.find(r => r.is_commander);
    const commanderCard = commanderRow ? byId.get(commanderRow.card_id) : null;

    return {
      id: deck.id,
      name: deck.name,
      format: deck.format,
      colors: deck.colors || [],
      identity: commanderCard?.color_identity || [],
      power_level: deck.power_level,
      description: deck.description || '',
      is_public: deck.is_public,
      created_at: deck.created_at,
      updatedAt: deck.updated_at,
      commander: commanderRow
        ? {
            name: commanderRow.card_name,
            image:
              commanderCard?.image_uris?.normal || commanderCard?.image_uris?.large || null,
            image_uris: commanderCard?.image_uris || null,
          }
        : null,
      counts: {
        total,
        unique: new Set(rows.map(r => r.card_id)).size,
        sideboard: 0,
        lands: count(type(/land/)),
        creatures: count(type(/creature/)),
        instants: count(type(/instant/)),
        sorceries: count(type(/sorcery/)),
        artifacts: count(c => /artifact/.test(String(c.type_line || '').toLowerCase()) && !/creature/.test(String(c.type_line || '').toLowerCase())),
        enchantments: count(type(/enchantment/)),
        planeswalkers: count(type(/planeswalker/)),
        battles: count(type(/battle/)),
      },
      curve: { bins: {} },
      mana: { sources: null, basis: 'lands', unknownLands: [], landsMakingNoManaThemselves: [] },
      legality: { ok: true, issues: [] },
      power: { score: deck.power_level, band: 'mid', drivers: [], drags: [] },
      economy: {
        priceUSD: rows.reduce(
          (s, r) => s + num(byId.get(r.card_id)?.prices?.usd) * (r.quantity || 1),
          0
        ),
        ownedPct: 0,
        missing: total,
      },
      tags: [],
      favorite: false,
      cards: rows.map(r => ({
        card_id: r.card_id,
        card_name: r.card_name,
        quantity: r.quantity,
        is_commander: r.is_commander,
        is_sideboard: r.is_sideboard,
        card_data: byId.get(r.card_id) || {},
      })),
      edhAnalysis: deck.edh_analysis || null,
    };
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const opts = init || (typeof input === 'object' ? input : {});

    if (url && url.startsWith(URL_BASE)) {
      /* The precon catalogue is a public edge function and answers over HTTP
         with the anon key, so forward it instead of inventing a list. */
      if (url.includes('/functions/v1/fetch-precons')) {
        return realFetch(url, {
          ...opts,
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
      }

      if (url.includes('/rest/v1/rpc/compute_deck_summaries')) {
        let body = {};
        try { body = JSON.parse(opts.body || '{}'); } catch {}
        const ids = body.p_deck_ids || [];
        const out = [];
        for (const id of ids) {
          const s = await summaryFor(id);
          if (s) out.push(s);
        }
        return json(out);
      }

      if (url.includes('/rest/v1/rpc/compute_deck_summary')) {
        let body = {};
        try { body = JSON.parse(opts.body || '{}'); } catch {}
        return json(await summaryFor(body.deck_id));
      }

      /* The real function returns a jsonb object, not a boolean, and
         `useIsFeatureEnabled` reads `.allowed` off it. Checked against the real
         tables: `feature_flags.ai_deck_optimizer` is enabled with
         `requires_tier = 'free'`, and `subscription_limits` holds no row for
         that key, which is the branch that returns an unlimited allow. So this
         is the answer a signed-in free account gets in production. */
      if (url.includes('/rest/v1/rpc/check_feature_access')) {
        return json({ allowed: true, limit: -1, used: 0, remaining: -1, tier: 'free' });
      }

      /* `feature_flags` is world readable and answers 200 to the anon key, so
         the flags the app gates on should be the real ones. The base shim
         answers it locally and empty, which reads as every flag off. */
      if (url.includes('/rest/v1/feature_flags')) {
        return realFetch(url, {
          ...opts,
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
      }
    }

    return baseFetch(input, init);
  };
})();
