-- Two SECURITY DEFINER functions were reachable by anon, and neither has any
-- reason to be.
--
-- price_history_stats() answers an UNAUTHENTICATED caller with a query
-- expensive enough to hit the statement timeout: measured, it returns 57014
-- "canceling statement due to statement timeout" to the anon key. That is a
-- load vector on a project that has already been taken down twice, and it needs
-- no credentials to pull.
--
-- price_sweep_health(integer) hands back the ingestion pipeline's daily health,
-- one row per day naming which sweeps failed. It is operational detail about
-- how the product is run, offered to anybody who asks.
--
-- REVOKE FROM PUBLIC, NOT FROM ANON. Functions are granted EXECUTE to PUBLIC at
-- creation, so revoking from anon alone removes nothing and leaves the function
-- reachable. This project has now been caught by that four times; the previous
-- three are recorded in earlier migrations. Revoking from public and granting
-- back only what is wanted is the shape that actually works.
--
-- Left alone deliberately, because they are public BY DESIGN and were checked
-- rather than assumed: get_public_deck, increment_share_views and
-- is_published_share_target serve deck sharing to signed-out visitors, and
-- card_price_series feeds the card pages the owner intends for search engines.
-- compute_deck_summary was probed with a real private deck id from the anon key
-- and returned null, so it is not leaking and stays as it is.

revoke execute on function public.price_history_stats() from public;
revoke execute on function public.price_history_stats() from anon;
grant execute on function public.price_history_stats() to authenticated, service_role;

revoke execute on function public.price_sweep_health(integer) from public;
revoke execute on function public.price_sweep_health(integer) from anon;
grant execute on function public.price_sweep_health(integer) to authenticated, service_role;
