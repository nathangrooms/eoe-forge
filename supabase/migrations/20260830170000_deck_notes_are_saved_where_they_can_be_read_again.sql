-- Deck notes told you they were saved and put them in localStorage.
--
-- `DeckNotesPanel` opened with its own confession:
--
--     // This is a mock - in real implementation, you'd need to create a
--     // deck_notes table. For now, we'll use local storage as a demo
--
-- and then, on submit, raised a toast reading "Note added — Your note has been
-- saved". It had not been saved anywhere anybody could read it again: not on
-- another device, not in another browser, not after clearing site data. A
-- feature that says it saved and did not is the failure-presented-as-a-result
-- shape this project keeps writing down.
--
-- The table is the fix. It is small and the panel is already built.
--
-- PRIVATE TO THE AUTHOR. A deck note is what you would write on the inside of
-- a deck box, not a comment thread: `/p/:slug` publishes a decklist and must
-- not publish what you thought about it. There is deliberately no policy that
-- lets a second person read one, so making notes shared later is a decision
-- somebody takes on purpose rather than something that leaks.

create table if not exists public.deck_notes (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid not null references public.user_decks(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Bounded at the database, not only in the textarea. A client-side maxLength
  -- is a hint to the one client running our JavaScript.
  content    text not null check (length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- The only way this table is ever read: one deck, newest first.
create index if not exists deck_notes_deck_created_idx
  on public.deck_notes (deck_id, created_at desc);

alter table public.deck_notes enable row level security;

-- Four policies rather than one FOR ALL, so the INSERT check can require that
-- the deck is yours as well as the row.
drop policy if exists "read your own deck notes" on public.deck_notes;
create policy "read your own deck notes" on public.deck_notes
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "write notes on your own decks" on public.deck_notes;
create policy "write notes on your own decks" on public.deck_notes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_decks d
      where d.id = deck_id and d.user_id = auth.uid()
    )
  );

-- USING *and* WITH CHECK. Postgres reuses USING as the check when WITH CHECK is
-- absent, which is exactly how `profiles` came to allow any signed-in user to
-- set their own `is_admin`. See the RLS audit in CLAUDE.md.
drop policy if exists "edit your own deck notes" on public.deck_notes;
create policy "edit your own deck notes" on public.deck_notes
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete your own deck notes" on public.deck_notes;
create policy "delete your own deck notes" on public.deck_notes
  for delete to authenticated
  using (auth.uid() = user_id);

-- `anon` gets nothing at all. A policy is not the gate; the grant is.
revoke all on public.deck_notes from anon;
grant select, insert, update, delete on public.deck_notes to authenticated;
