-- Six internal analysis views were granted INSERT, UPDATE, DELETE and TRUNCATE
-- to anon and authenticated, and one of them is SECURITY DEFINER.
--
-- The write grants are inert today. All six are aggregating views, so
-- information_schema.views reports is_updatable NO and is_insertable_into NO
-- for every one, and a write through them fails before it reaches a table. They
-- are still wrong to hold: the moment anybody adds an INSTEAD OF trigger to one
-- of these views the grant becomes live, and nothing in the grant says it was
-- only ever meant to be a read.
--
-- llm_needed_primitives is the real finding and it is the ERROR the Supabase
-- security advisor reports. It is SECURITY DEFINER over llm_ability_compilations
-- and selectable by anon, so an anonymous caller reads that table with the view
-- owner's rights and any row level security on it does not apply. Nothing in
-- the application reads this view. It is engine analysis, used by two scripts
-- that run as service_role, which is unaffected by these grants. So it leaves
-- the public API entirely rather than being made safe to expose.
--
-- The other five keep their SELECT. card_price_history alone is read in ten
-- application files, and changing how those views resolve their permissions is
-- a separate question from whether anyone should be able to write to them.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.card_image_hash_manifest,
  public.card_price_history,
  public.card_printing_spread,
  public.dev_workstream_progress,
  public.price_snapshot_tier1
FROM anon, authenticated;

REVOKE ALL ON public.llm_needed_primitives FROM anon, authenticated;
