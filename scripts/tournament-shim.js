/**
 * Tournament-specific additions on top of scripts/dashboard-shim.js, injected
 * after it. Read that file's header first.
 *
 * Two jobs, both narrow:
 *
 * 1. **Card art by name.** `useCardArt` asks for `cards?name=in.(…)`, and the
 *    dashboard shim's `in.` parser splits the list on every comma. Magic card
 *    names are full of commas ("Atraxa, Praetors' Voice"), so every commander
 *    lookup missed, fell through to the live database, and the pairings drew
 *    monogram fallbacks instead of commanders. This answers those from the same
 *    real card rows the runner already prefetched, splitting only on commas
 *    that sit outside quotes.
 *
 * 2. **Seeding the events.** Tournaments live in `localStorage` on the TO's own
 *    machine, so there is no server fixture to write. `window.__dmEvents` is
 *    handed in by the runner and written to the storage key the app reads.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';

  try {
    if (window.__dmEvents) {
      localStorage.setItem('tournaments', JSON.stringify(window.__dmEvents));
    }
  } catch {}

  /** `"a, b",c` -> ['a, b', 'c']. PostgREST quotes any value containing a comma. */
  function splitList(raw) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (const ch of raw) {
      if (ch === '"') {
        quoted = !quoted;
        continue;
      }
      if (ch === ',' && !quoted) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.filter(v => v.length > 0);
  }

  const rows = window.__dmCards ?? [];
  const byName = new Map();
  for (const row of rows) {
    const key = String(row.name ?? '').toLowerCase();
    if (!byName.has(key)) byName.set(key, row);
  }

  const inner = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (!url || !url.startsWith(URL_BASE) || !url.includes('/rest/v1/cards?')) {
      return inner(input, init);
    }

    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    const filter = params.get('name');
    if (!filter || !filter.startsWith('in.')) return inner(input, init);

    const wanted = splitList(decodeURIComponent(filter.slice(3)).replace(/^\(|\)$/g, ''));
    const hits = wanted.map(n => byName.get(n.toLowerCase())).filter(Boolean);
    if (hits.length !== wanted.length) return inner(input, init);

    return new Response(JSON.stringify(hits), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
})();
