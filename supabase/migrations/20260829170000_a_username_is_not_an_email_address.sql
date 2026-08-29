-- `profiles` is world readable by design and two usernames were email addresses.
--
-- The SELECT policy is "Public profiles are viewable by everyone", TO public,
-- USING (true). That is deliberate: a public deck names its author, and the
-- lobby names the people at a table. It also means anybody holding the
-- publishable key, which is designed to be public and is hardcoded into the
-- bundle, can read every row of this table without signing in.
--
-- Two of the thirteen rows carried a raw email address in `username`, so two
-- real people's email addresses were readable by anyone who asked. CLAUDE.md
-- has recorded this as "worth scrubbing" since 18 Aug.
--
-- WHAT THIS DOES AND WHAT IT DELIBERATELY DOES NOT DO
--
-- It keeps the local part and drops the @ and the domain, so the person is
-- still recognisably themselves and no longer has an email address published.
-- Rewriting them to something anonymous would be a bigger change than the
-- problem: these are display names their friends see.
--
-- The trigger is the half that lasts. Scrubbing two rows fixes today; the sign
-- up path that produced them is unchanged, so without a guard the next account
-- created from an email address puts one straight back. It normalises on write
-- rather than rejecting, because a sign up failing with a constraint error is a
-- worse outcome for the player than a tidier name.
--
-- Collisions are possible in principle, two people at different domains sharing
-- a local part, and are not handled: `username` carries no unique constraint
-- today, so this cannot fail on one, and inventing a suffix scheme for a case
-- that has not happened would be guessing.

CREATE OR REPLACE FUNCTION public.strip_email_from_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
begin
  if new.username is not null and position('@' in new.username) > 1 then
    new.username := split_part(new.username, '@', 1);
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS profiles_username_is_not_an_email ON public.profiles;
CREATE TRIGGER profiles_username_is_not_an_email
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.strip_email_from_username();

UPDATE public.profiles
   SET username = split_part(username, '@', 1)
 WHERE username LIKE '%@%'
   AND split_part(username, '@', 1) <> '';
