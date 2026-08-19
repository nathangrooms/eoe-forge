-- deck_share_events' INSERT policy was named "Service role can insert share
-- events" but was created TO public with WITH CHECK (true). Anyone holding the
-- anon key could therefore write an unlimited number of share events against
-- ANY deck id, including private ones - inflating another user's analytics and
-- offering an unbounded storage-growth vector. Verified before this migration:
-- an anon POST reached the row and was rejected only by schema/CHECK validation
-- (400), never by RLS (403).
--
-- Locking INSERT to service_role alone was considered and REJECTED: it would
-- silently break the feature. Share events are recorded CLIENT-SIDE by
-- trackShareEvent() in src/lib/api/shareAPI.ts, called from PublicDeck.tsx,
-- which is the logged-out public share page. There is no server-side recorder.
-- CLAUDE.md section 8 documents this as deliberate.
--
-- So: service_role keeps an unrestricted path (for any future server-side
-- recorder), and anon/authenticated keep exactly the narrow path the product
-- needs - an event may be logged only for a deck that is genuinely published,
-- and only under that deck's real slug.

-- The check cannot be an inline EXISTS against user_decks. RLS on user_decks
-- would be applied to that subquery as the calling role, and its SELECT
-- policies key on `is_public`, which is a DIFFERENT column from the sharing
-- flag `public_enabled`. An inline subquery would therefore evaluate false for
-- a legitimately published deck and refuse the very inserts we want to keep.
-- A SECURITY DEFINER predicate sidesteps that. It discloses nothing useful:
-- it returns a boolean only, and only to a caller who already holds both the
-- deck's uuid and its slug.
--
-- Follow-up (adversarial review, 19 Aug 2026): the same `is_public` vs
-- `public_enabled` mismatch that rules out an inline EXISTS was ALSO breaking
-- the client. trackShareEvent() resolved the deck id with a direct
-- `.from('user_decks').eq('public_slug', slug)` read, which matches neither
-- SELECT policy for a logged-out visitor, so it returned early and no event
-- was ever recorded. It now resolves the id through the SECURITY DEFINER
-- `get_public_deck` RPC, which keys on `public_enabled` exactly as the policy
-- below does. This migration is unchanged by that; the note is here because
-- the two decisions share one root cause.
create or replace function public.is_published_share_target(p_deck_id uuid, p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_decks d
    where d.id = p_deck_id
      and d.public_enabled = true
      and d.public_slug = p_slug
  );
$$;

revoke all on function public.is_published_share_target(uuid, text) from public;
grant execute on function public.is_published_share_target(uuid, text)
  to anon, authenticated, service_role;

drop policy if exists "Service role can insert share events" on public.deck_share_events;

create policy "Service role can insert share events"
  on public.deck_share_events
  for insert
  to service_role
  with check (true);

create policy "Share events may be logged only for published decks"
  on public.deck_share_events
  for insert
  to anon, authenticated
  with check (public.is_published_share_target(deck_id, slug));

-- The grants trap: revoking a policy does nothing while a TABLE-level grant
-- still allows the verb. anon and authenticated held UPDATE and DELETE on this
-- table. No policy permitted either, so RLS denied them by default, but the
-- grant is the wrong default to leave lying around - a future permissive policy
-- would silently switch it on. INSERT and SELECT stay: both are gated above.
revoke update, delete on public.deck_share_events from anon, authenticated;
