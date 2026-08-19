/**
 * Deck seeding for `scripts/app-shots.mjs`, injected AFTER `dashboard-shim.js`
 * and `tournament-shim.js`. Read `scripts/dashboard-shim.js`'s header first —
 * it explains the session, the fixture tables and the honesty rules that this
 * file inherits.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The dashboard fixture's decks are shaped like a real account's decks — nine
 * of them, most short of 100, two empty — which is exactly right for a
 * dashboard, and wrong for a photograph of the deck builder. Its 79-card
 * "Atraxa counters" is seven filler cards carrying large quantities, so the
 * builder drew thirteen copies of Sol Ring in a row and average mana value came
 * out as 0.00. That is a truthful picture of the fixture and a terrible
 * advertisement for the product.
 *
 * So the deck in the pictures is a REAL Commander decklist: a Wizards precon,
 * fetched at capture time from the same `fetch-precons` edge function the
 * `/precons` page calls, with every one of its cards resolved against
 * `public.cards_unique`. One hundred distinct real cards, real art, real mana
 * costs, real prices, a real curve.
 *
 * Stated plainly, because this repo has shipped fabricated data before:
 *
 *   REAL — the decklist (Wizards published it), and every card row behind it
 *          (read from the live catalogue).
 *   FIXTURE — that this pretend account owns and has saved that deck. Ownership
 *          is the one thing an anonymous request may never be shown for a real
 *          person, so it has to be invented, and it is invented here rather
 *          than anywhere a real user could see it.
 *
 * Nothing is typed out by hand: no card name, no price, no count. The runner
 * hands the resolved rows in as `window.__dmDeck`.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';

  /**
   * The fixture account's display name.
   *
   * `dashboard-shim.js` calls it "Harness", which is right for a diagnostic run
   * and wrong in a published picture: the play table prints the seat's name, so
   * the board came back with a player called `harness` on it. "Demo" is what the
   * account actually is, it is nobody's name, and it does not pretend to be a
   * real person — which is the whole reason the account is invented.
   */
  try {
    const key = 'sb-udnaflcohfyljrsgqggy-auth-token';
    const raw = localStorage.getItem(key);
    if (raw) {
      const session = JSON.parse(raw);
      session.user.user_metadata = { ...session.user.user_metadata, username: 'Demo' };
      /* `Play` names the human seat `user.email.split('@')[0]`, which is where
         `harness` was coming from. Nothing is ever sent to this address. */
      session.user.email = 'demo@deckmatrix.com';
      localStorage.setItem(key, JSON.stringify(session));
    }
  } catch {
    /* no storage, no rename; the picture is still the real page */
  }

  const seed = window.__dmDeck;
  if (!seed || !Array.isArray(seed.rows) || seed.rows.length === 0) return;

  const DECK_ID = seed.deckId;
  const inner = window.fetch.bind(window);

  /** `id, card_id, cards (name, type_line, …)` -> a tree the projector walks. */
  function splitTop(s) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
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
      if (open === -1) return { name: part.split('!')[0] };
      const head = part.slice(0, open).split('!')[0];
      return { name: head, children: parseSelect(part.slice(open + 1, part.lastIndexOf(')'))) };
    });
  }

  const cardById = new Map(seed.cards.map(row => [row.id, row]));

  function project(row, fields) {
    if (!fields || fields.some(f => f.name === '*' && !f.children)) return { ...row };
    const out = {};
    for (const f of fields) out[f.name] = row[f.name] === undefined ? null : row[f.name];
    return out;
  }

  /** `deck_cards` rows in the shape PostgREST returns them, `cards` embedded. */
  function deckCardRows(select) {
    const fields = parseSelect(select || '*');
    const embed = fields.find(f => f.name === 'cards' && f.children);
    return seed.rows.map((row, i) => {
      const base = {
        id: `dm-shot-${i}`,
        deck_id: DECK_ID,
        card_id: row.card_id,
        card_name: row.card_name,
        quantity: row.quantity,
        is_commander: row.is_commander,
        is_sideboard: false,
        created_at: new Date(0).toISOString(),
      };
      const out = project(base, fields.filter(f => !f.children));
      if (embed) {
        const card = cardById.get(row.card_id) ?? null;
        out.cards = card ? project(card, embed.children) : null;
      }
      return out;
    });
  }

  const json = (body, extra) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}),
    });

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (!url || !url.startsWith(URL_BASE)) return inner(input, init);

    const opts = init || (typeof input === 'object' ? input : {});
    const method = (opts.method || 'GET').toUpperCase();
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));

    /* This deck's cards, from the real decklist rather than the fixture's
       seven-card filler. Only this deck: every other deck the fixture defines
       still answers from the dashboard shim, so the decks LIST keeps the shape
       of a real account. */
    if (url.includes('/rest/v1/deck_cards') && params.get('deck_id') === `eq.${DECK_ID}`) {
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': `0-${seed.rows.length - 1}/${seed.rows.length}`,
          },
        });
      }
      if (method === 'GET') {
        const rows = deckCardRows(params.get('select') || '*');
        return json(rows, { 'Content-Range': `0-${rows.length - 1}/${rows.length}` });
      }
    }

    const response = await inner(input, init);

    /* The deck's NAME comes from the decklist too, so the title over the
       picture is the deck that is in the picture. Patched on the way out rather
       than re-implemented, so everything else about `user_decks` stays the
       dashboard shim's. */
    if (url.includes('/rest/v1/user_decks') && method === 'GET') {
      try {
        const body = await response.clone().json();
        const patch = row => {
          if (!row || row.id !== DECK_ID) return row;
          return { ...row, name: seed.name, format: 'commander' };
        };
        const patched = Array.isArray(body) ? body.map(patch) : patch(body);
        return json(patched, {
          'Content-Range': response.headers.get('Content-Range') || undefined,
        });
      } catch {
        /* not JSON; hand back what the inner shim said */
      }
    }

    return response;
  };
})();
