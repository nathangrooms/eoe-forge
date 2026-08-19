-- The audit backlog moves out of the browser bundle and into this admin-only table.
--
-- `src/data/auditFindings.json` held 278 internal findings with file paths,
-- severities, what is wrong and what to do about it. Its only importer was the
-- admin Dev Console, but an import is an import: Vite emitted it as a chunk and
-- Lovable served it from the site's own origin. Measured on the live site
-- before this change:
--
--   GET https://deckmatrix.com/assets/auditFindings-B6Ihw0Jk.js
--     -> 200, 330,965 bytes, text/javascript
--
-- and that file name is written into the entry chunk, so it was discoverable
-- rather than merely guessable. No user ever downloaded it. Anyone could.
--
-- `dev_findings` is the right home and already existed: `anon` holds no grant
-- (401), and `authenticated` is gated on `is_dev_admin()`.
--
-- `source` keeps the two kinds apart because the console draws them
-- differently: a tracked finding carries a mutable status pill, a backlog row
-- is labelled "backlog" until someone promotes it. `source_ref` is the id the
-- finding had in the source document (af-001 … af-278), which is also the order
-- the console reads them back in.
--
-- The 278 rows were loaded once from the retired file and are NOT reinserted
-- here on purpose: a data migration carrying that text would put the whole
-- disclosure back into the repo, which is public. `docs/overhaul/AUDIT.md`
-- remains the source document the rows were generated from.

alter table public.dev_findings
  add column if not exists source text not null default 'tracked',
  add column if not exists source_ref text;

alter table public.dev_findings
  drop constraint if exists dev_findings_source_check;

alter table public.dev_findings
  add constraint dev_findings_source_check check (source in ('tracked', 'audit'));

-- One row per finding in the source document, so a re-import corrects rather
-- than duplicates.
create unique index if not exists dev_findings_source_ref_key
  on public.dev_findings (source, source_ref)
  where source_ref is not null;

comment on column public.dev_findings.source is
  'tracked = raised in the Dev Console. audit = imported from the 2026-08-18 audit backlog, which used to ship in the browser bundle as src/data/auditFindings.json.';

comment on column public.dev_findings.source_ref is
  'Stable id from the source document, e.g. af-001. Null for findings raised in the console.';
