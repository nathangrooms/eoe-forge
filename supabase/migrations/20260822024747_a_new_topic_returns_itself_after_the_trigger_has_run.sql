-- ===========================================================================
-- A new topic returns itself after the trigger has run
-- ===========================================================================
-- Measured, not guessed. `start_forum_topic` was returning this:
--
--   "post_count": 1, "last_post_name": null
--
-- for a topic that had one post by somebody with a name. The row was captured
-- by `returning * into v_topic` BEFORE the opening post existed, so the counter
-- trigger had not yet touched it, and the function then patched `post_count`
-- back to 1 by hand to cover half of the gap.
--
-- Patching one field by hand is how the other field stayed wrong. So the row is
-- read back instead, which is one lookup by primary key inside a statement that
-- has already written twice, and the answer is then the same answer a re-read
-- would give.
-- ===========================================================================

create or replace function public.start_forum_topic(
  p_title        text,
  p_body         text,
  p_display_name text default null,
  p_table_code   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_name  text;
  v_title text := btrim(coalesce(p_title, ''));
  v_code  text := nullif(upper(btrim(coalesce(p_table_code, ''))), '');
  v_topic public.forum_topics;
  v_post  public.forum_posts;
begin
  v_user := public.forum_write_guard(p_body, true);

  if char_length(v_title) < 3 then
    raise exception 'give the topic a title so people know what it is about';
  end if;

  v_name := public.safe_display_name(
    coalesce(p_display_name, (select username from public.profiles where id = v_user))
  );

  insert into public.forum_topics (scope, title, author_id, author_name, table_code)
  values ('board', left(v_title, 120), v_user, v_name, v_code)
  returning * into v_topic;

  insert into public.forum_posts (topic_id, scope, user_id, display_name, body, table_code)
  values (v_topic.id, 'board', v_user, v_name, left(btrim(p_body), 2000), v_code)
  returning * into v_post;

  -- After the insert, so the counters the trigger maintains are the ones that
  -- come back rather than the ones the row was created with.
  select * into v_topic from public.forum_topics where id = v_topic.id;

  -- One nudge on the lobby topic. The client re-reads the board, which is one
  -- indexed query, rather than trusting a payload that can drift.
  perform realtime.send(
    jsonb_build_object('kind', 'topic', 'topicId', v_topic.id),
    'forum',
    'lobby',
    true
  );

  return jsonb_build_object('topic', to_jsonb(v_topic), 'post', to_jsonb(v_post));
end;
$$;

revoke all on function public.start_forum_topic(text, text, text, text) from public, anon, authenticated;
grant execute on function public.start_forum_topic(text, text, text, text) to authenticated;
