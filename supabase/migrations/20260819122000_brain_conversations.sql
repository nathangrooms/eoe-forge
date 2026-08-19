-- The Brain kept its whole conversation in React state and sent the last six
-- turns. Reloading the page threw the conversation away, and past chats could
-- not be returned to because they were never anywhere. Owner: "do chats
-- continue?"
--
-- Two tables. Messages hang off a conversation and cascade with it, so deleting
-- a chat cannot leave orphans behind.

create table if not exists public.brain_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'New chat',
  -- What the chat was attached to. Kept as a loose reference on purpose: a chat
  -- about a deck stays readable after the deck is deleted.
  deck_id     uuid,
  deck_name   text,
  card_id     text,
  card_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.brain_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.brain_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- The cards and charts that were shown with this answer, so a reloaded thread
  -- looks exactly as it did when it was written rather than degrading to text.
  cards           jsonb not null default '[]'::jsonb,
  visual_data     jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists brain_conversations_user_updated_idx
  on public.brain_conversations (user_id, updated_at desc);
create index if not exists brain_messages_conversation_idx
  on public.brain_messages (conversation_id, created_at);

alter table public.brain_conversations enable row level security;
alter table public.brain_messages      enable row level security;

-- A policy is not the gate. The recorded trap from the RLS audit is that a
-- column-level revoke does nothing while a table-level grant stands, and the
-- same logic applies here: `anon` is given no grant at all, so a logged-out
-- caller holding the publishable key cannot reach these tables even if a policy
-- were later written carelessly.
revoke all on public.brain_conversations from anon;
revoke all on public.brain_messages      from anon;

grant select, insert, update, delete on public.brain_conversations to authenticated;
grant select, insert, update, delete on public.brain_messages      to authenticated;

drop policy if exists "Users read their own brain conversations"   on public.brain_conversations;
drop policy if exists "Users create their own brain conversations" on public.brain_conversations;
drop policy if exists "Users update their own brain conversations" on public.brain_conversations;
drop policy if exists "Users delete their own brain conversations" on public.brain_conversations;

create policy "Users read their own brain conversations"
  on public.brain_conversations for select to authenticated
  using (auth.uid() = user_id);

create policy "Users create their own brain conversations"
  on public.brain_conversations for insert to authenticated
  with check (auth.uid() = user_id);

-- USING and WITH CHECK both, always. The privilege-escalation hole on `profiles`
-- came from an UPDATE policy with no WITH CHECK, which let Postgres reuse USING
-- as the check and allowed a row to be rewritten into someone else's name.
create policy "Users update their own brain conversations"
  on public.brain_conversations for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete their own brain conversations"
  on public.brain_conversations for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users read their own brain messages"   on public.brain_messages;
drop policy if exists "Users create their own brain messages" on public.brain_messages;
drop policy if exists "Users delete their own brain messages" on public.brain_messages;

create policy "Users read their own brain messages"
  on public.brain_messages for select to authenticated
  using (auth.uid() = user_id);

-- Owning the message is not enough: it must also land in a conversation you own,
-- or one user could staple messages into another user's thread.
create policy "Users create their own brain messages"
  on public.brain_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.brain_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Users delete their own brain messages"
  on public.brain_messages for delete to authenticated
  using (auth.uid() = user_id);

-- A thread's position in the list is "when did I last say something in it".
create or replace function public.touch_brain_conversation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.brain_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists brain_messages_touch_conversation on public.brain_messages;
create trigger brain_messages_touch_conversation
  after insert on public.brain_messages
  for each row execute function public.touch_brain_conversation();
