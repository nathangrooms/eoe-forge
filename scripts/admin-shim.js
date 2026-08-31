/**
 * A signed-in ADMIN session for photographing `/admin`, injected before the app
 * loads. Read `scripts/dashboard-shim.js`'s header first; this is the same
 * technique, cut down to the smallest thing that opens the admin gate.
 *
 * WHY IT IS SO SHORT. The dashboard shim has to fake ownership, because no
 * anonymous request may ever be shown a real person's collection. The Engine
 * and Words screens need none of that: `engine_coverage()`,
 * `engine_vocabulary()` and `cards_unique` are all granted to `anon`, so every
 * number on those screens is the real database answering a real request. The
 * only thing being faked is the gate — `AuthProvider` reads
 * `profiles.is_admin`, and a signed-out visitor gets no profile row.
 *
 * So: a local session object, one profile row saying is_admin, and everything
 * else passed straight through to PostgREST. No credentials are entered
 * anywhere and nothing leaves the browser.
 *
 * This means the screenshots can be trusted as measurements. If a count looks
 * wrong on one of these screens, it is wrong in the database.
 */
(() => {
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
  const USER_ID = '00000000-0000-4000-8000-00000000adm1';

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
      email: 'harness-admin@localhost',
      app_metadata: { provider: 'email' },
      user_metadata: { username: 'Harness' },
      created_at: new Date(0).toISOString(),
    },
  };
  try {
    localStorage.setItem('sb-udnaflcohfyljrsgqggy-auth-token', JSON.stringify(session));
  } catch {}

  const PROFILE = {
    id: USER_ID,
    username: 'Harness',
    is_admin: true,
    subscription_tier: 'unlimited',
    created_at: new Date(0).toISOString(),
  };

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);

    /* Auth: the client asks who this is on boot and on every refresh. */
    if (url.includes('/auth/v1/user')) return json(session.user);
    if (url.includes('/auth/v1/token')) return json(session);

    /* The gate itself. Anything else about profiles goes to the database. */
    if (url.includes('/rest/v1/profiles') && /is_admin|select=\*/.test(url)) {
      const one = /Accept.*vnd\.pgrst\.object/.test(JSON.stringify(init.headers ?? {}));
      return json(one ? PROFILE : [PROFILE]);
    }

    /*
     * Everything else is REAL. The bearer is swapped back to the anon key,
     * because the fake access token would be rejected and PostgREST would
     * answer 401 for reads that anon is perfectly entitled to make.
     */
    if (url.includes('supabase.co')) {
      const headers = new Headers(init.headers ?? {});
      if (headers.get('Authorization')?.includes('harness')) {
        headers.set('Authorization', `Bearer ${ANON}`);
      }
      return realFetch(input, { ...init, headers });
    }

    return realFetch(input, init);
  };
})();
