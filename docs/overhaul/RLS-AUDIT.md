# RLS audit — empirical, 18 Aug 2026

The anon key ships in the client bundle and is public by design. RLS is the only
thing between it and 39 tables, and it had never been tested. This audit was run
against the live database with the real anon key over HTTP — not by reading the
catalogue and assuming.

## Result: RLS holds

Every private table returns `[]` to an unauthenticated caller:

    user_decks · user_collections · wishlist · api_keys · messages
    listings · sales · activity_log · storage_containers

`dev_*` (the admin backend) is stronger still — `401 permission denied`, no grant
at all. `cards` and `card_price_history` return rows, which is intended.

All 39 public tables have `relrowsecurity = true`. No table is exposed. The
security advisor reports zero ERROR-level lints.

## One real finding, fixed

`profiles` is deliberately world-readable — usernames and avatars appear on
shared decks and marketplace listings, so its SELECT policy is `USING (true)` on
purpose. But `is_admin` was riding along in that payload. Anyone with the anon
key could list all 13 accounts and see precisely which one was an administrator,
and that account is named `admin`.

Not a breach — the account is still behind auth — but a targeting aid handed out
for free, and cheap to stop.

**Fix:** table-level SELECT revoked from `anon`, then `username`, `avatar_url`
and `created_at` granted back explicitly. `authenticated` keeps full SELECT.

Verified after the change: `is_admin` and `select=*` both return
`42501 permission denied` to anon; `username`/`avatar_url` still resolve; `cards`
still public; private tables still sealed.

### The mistake worth recording

The first attempt used `revoke select (is_admin) ... from anon` and **did
nothing**. A table-level grant covers every column, and a column-level revoke
cannot carve a hole in it. The table grant has to be dropped first, then columns
granted back. This was caught only because the change was re-tested over HTTP
rather than trusted — a catalogue query would have shown the column revoke
present and looked correct.

## Checked and NOT a vulnerability

`profiles` has an UPDATE policy with `USING (auth.uid() = id)` and no
`WITH CHECK`, so Postgres reuses `USING` for the new row. That stops you editing
someone else's profile but appears to leave you free to set `is_admin = true` on
your own — privilege escalation.

It is not exploitable. Column-level grants already prevent it: `authenticated`
holds UPDATE on only `username`, `avatar_url` and `updated_at`. `anon` holds none.

`deck_share_events` has `INSERT WITH CHECK (true)` granted to `public`, despite
being named "Service role can insert share events". An anon insert returns 400
(schema validation), not 403 — so RLS does not block it. Low severity: rows are
FK-constrained to real decks and the table is append-only telemetry. Worth
tightening to `auth.role() = 'service_role'`, not urgent.

## Outstanding — owner action, cannot be fixed from code

These are Supabase dashboard settings:

- **Leaked-password protection is off.** Turn on in Auth → Policies. Free.
- **OTP expiry is long.** Reduce to ≤1 hour.
- **Postgres has known vulnerabilities.** A patch upgrade is available.

## Lower-priority hardening

- 17 `SECURITY DEFINER` functions executable by `authenticated`, 16 by `anon`.
  These bypass RLS by design, so each needs its own argument validation. Not
  reviewed individually yet — the next audit pass should.
- 5 functions have a mutable `search_path`.
- 2 extensions are installed in `public`.
- `card_retag_progress` has RLS on and zero policies (deny-all). Safe, but it
  means nothing but the service role can read it — intended, worth confirming.
