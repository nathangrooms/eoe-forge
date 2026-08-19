-- One-row summary the browser fetches before deciding whether its cached index
-- is still good. Cheaper than counting 50k rows client-side, and it gives the
-- cache a key that changes exactly when the index changes.
--
-- `algo_version` is part of the key rather than just the count: an index built
-- by an older hash algorithm is not merely stale, it is INCOMPARABLE — its
-- distances mean nothing against new queries — so the client must discard
-- rather than top up when it changes.
create or replace view public.card_image_hash_manifest
with (security_invoker = true) as
select
  count(*)::bigint            as entry_count,
  max(hashed_at)              as newest_hashed_at,
  max(algo_version)::smallint as algo_version
from public.card_image_hashes;

comment on view public.card_image_hash_manifest is
  'Cache key for the client-side hash index: entry count, newest row, and algorithm version.';
