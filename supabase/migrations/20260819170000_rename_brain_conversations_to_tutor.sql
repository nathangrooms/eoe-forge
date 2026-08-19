-- The feature is called Tutor now.
--
-- Owner: "is there something we can rename mtg brain to? Not really a fan of the
-- name - dont want to use any words like AI as people in magic community hate
-- AI." To tutor, in Magic, is to search your library for exactly the card you
-- need. Every player knows the word, it describes this feature precisely, and it
-- carries no technology connotation at all.
--
-- These two tables were created earlier today by
-- `20260819013618_brain_conversations` and hold **zero rows** (checked before
-- writing this: 0 conversations, 0 messages). A rename is therefore free, and
-- leaving them under the old name would be the codebase carrying two names for
-- one thing, which is the thing the rename exists to stop.
--
-- Renaming a table carries its policies, indexes, constraints and RLS state with
-- it. The policies are renamed too, because a policy named "brain conversations"
-- on a table named `tutor_conversations` is exactly the kind of half-rename that
-- makes people think there are two features.

alter table public.brain_conversations rename to tutor_conversations;
alter table public.brain_messages      rename to tutor_messages;

alter index if exists public.brain_conversations_user_updated_idx
  rename to tutor_conversations_user_updated_idx;
alter index if exists public.brain_messages_conversation_idx
  rename to tutor_messages_conversation_idx;

alter policy "Users read their own brain conversations"
  on public.tutor_conversations rename to "Users read their own tutor conversations";
alter policy "Users create their own brain conversations"
  on public.tutor_conversations rename to "Users create their own tutor conversations";
alter policy "Users update their own brain conversations"
  on public.tutor_conversations rename to "Users update their own tutor conversations";
alter policy "Users delete their own brain conversations"
  on public.tutor_conversations rename to "Users delete their own tutor conversations";

alter policy "Users read their own brain messages"
  on public.tutor_messages rename to "Users read their own tutor messages";
alter policy "Users create their own brain messages"
  on public.tutor_messages rename to "Users create their own tutor messages";
alter policy "Users delete their own brain messages"
  on public.tutor_messages rename to "Users delete their own tutor messages";

-- The grants are stated again rather than assumed. `anon` holds nothing on
-- either table: the recorded trap from the RLS audit is that revoking a COLUMN
-- privilege does nothing while a TABLE grant stands, so the gate is the table
-- grant, not the policy.
revoke all on public.tutor_conversations from anon;
revoke all on public.tutor_messages      from anon;
grant select, insert, update, delete on public.tutor_conversations to authenticated;
grant select, insert, update, delete on public.tutor_messages      to authenticated;

-- TRUNCATE bypasses row level security completely: one statement empties the
-- table for every user regardless of any policy. `harden_rls_privilege_
-- escalation_and_service_role_scoping` revoked it across the database, but these
-- two tables were created after that ran and inherited it from the default
-- grant, so `authenticated` held it. Measured before this line: authenticated
-- had DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on both.
revoke truncate, references, trigger on public.tutor_conversations from authenticated;
revoke truncate, references, trigger on public.tutor_messages      from authenticated;

-- The trigger function follows the tables.
drop trigger if exists brain_messages_touch_conversation on public.tutor_messages;
drop function if exists public.touch_brain_conversation();

create or replace function public.touch_tutor_conversation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.tutor_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger tutor_messages_touch_conversation
  after insert on public.tutor_messages
  for each row execute function public.touch_tutor_conversation();

comment on table public.tutor_conversations is
  'One saved Tutor chat. Scoped to auth.uid() by RLS; anon holds no grant.';
comment on table public.tutor_messages is
  'The turns of a Tutor chat, with the cards and charts that were shown, so a '
  'reloaded thread looks as it did when it was written.';

-- `alter table ... rename` does not rename the table's constraints: the primary
-- keys, foreign keys and the role check all kept `brain_*` names. PostgREST uses
-- foreign key constraint names to disambiguate embedded resources, and the
-- generated TypeScript records them verbatim as `foreignKeyName`, so leaving
-- them would put the old word straight back into the codebase.
alter table public.tutor_conversations rename constraint brain_conversations_pkey to tutor_conversations_pkey;
alter table public.tutor_conversations rename constraint brain_conversations_user_id_fkey to tutor_conversations_user_id_fkey;
alter table public.tutor_messages rename constraint brain_messages_pkey to tutor_messages_pkey;
alter table public.tutor_messages rename constraint brain_messages_user_id_fkey to tutor_messages_user_id_fkey;
alter table public.tutor_messages rename constraint brain_messages_conversation_id_fkey to tutor_messages_conversation_id_fkey;
alter table public.tutor_messages rename constraint brain_messages_role_check to tutor_messages_role_check;
