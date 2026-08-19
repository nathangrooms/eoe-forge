-- Turning a pasted list of card names into cards, in ONE round trip.
--
-- WHY THIS IS IN THE DATABASE AND NOT THE CLIENT
-- ----------------------------------------------
-- The obvious client-side shape is a lookup per line, and that is exactly the
-- shape that has already taken this project down twice: a pasted 99 card list
-- becomes 99 requests. `DeckImportExport` still does it that way against
-- Scryfall, one card at a time with a 100 ms sleep between them, which is 10
-- seconds of waiting for a commander deck and a rate limit for anyone with a
-- slow connection. A list is one question, so it is one query.
--
-- It also has to answer more than "did this name match". A proxy sheet is about
-- WHICH ART gets printed, so the answer has to carry the printing that was
-- chosen, how many other printings exist to choose from, and, for a name that
-- matched nothing, the nearest real card names so a typo can be recovered
-- rather than silently dropped. Doing that per line from the client is three
-- more round trips per line.
--
-- WHAT COUNTS AS A MATCH, IN ORDER
-- --------------------------------
--   printing  the paste named a set and a collector number and we hold exactly
--             that printing. MTGO and Arena exports carry these, and honouring
--             them is the difference between printing the art someone chose and
--             printing whatever was cheapest.
--   exact     the name matches a card. Resolved against `cards_unique`, so the
--             printing handed back is the catalogue's canonical one (see
--             section 6.3 of CLAUDE.md) rather than an arbitrary reprint.
--   face      the name matches the FRONT FACE of a double faced card. People
--             paste "Delver of Secrets", the catalogue holds
--             "Delver of Secrets // Insectile Aberration".
--   near      nothing matched, but a real card name is close. The best guess is
--             handed back together with the alternatives, flagged, so the
--             reader confirms it instead of the app deciding quietly.
--   none      nothing matched and nothing was close. Still returned as a row,
--             because a line that vanishes is a line the reader cannot fix.
--
-- Names are compared through `card_name_key`, which lowercases, folds the curly
-- apostrophe that arrives with anything pasted out of a web page ("Urza’s Saga"
-- is not "Urza's Saga" to Postgres) and collapses runs of whitespace.

create or replace function public.card_name_key(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    replace(replace(lower(coalesce(p_name, '')), '’', ''''), '‘', ''''),
    '\s+', ' ', 'g'
  ))
$$;

comment on function public.card_name_key(text) is
  'A card name reduced to what two spellings of it have in common: lowercase, straight apostrophes, single spaces.';

create or replace function public.resolve_card_names(p_lines jsonb)
returns table (
  idx integer,
  query text,
  status text,
  card jsonb,
  printings integer,
  suggestions jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
with req as (
  select
    (t.ord - 1)::int as idx,
    btrim(coalesce(t.line ->> 'name', '')) as q,
    lower(nullif(btrim(coalesce(t.line ->> 'set', '')), '')) as set_code,
    lower(nullif(btrim(coalesce(t.line ->> 'cn', '')), '')) as cn
  from jsonb_array_elements(
         case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end
       ) with ordinality as t(line, ord)
),
asked as (
  select
    idx, q, set_code, cn,
    card_name_key(q) as qkey,
    card_name_key(split_part(q, ' // ', 1)) as qfront
  from req
  where q <> ''
),
-- The paste named a printing. Honour it.
hit_printing as (
  select distinct on (a.idx) a.idx, c.id, 'printing'::text as status
  from asked a
  join cards c
    on lower(c.set_code) = a.set_code
   and lower(c.collector_number) = a.cn
   and (card_name_key(c.name) = a.qkey
        or card_name_key(split_part(c.name, ' // ', 1)) = a.qfront)
  where a.set_code is not null and a.cn is not null
  order by a.idx, c.id
),
-- The name is a card. `cards_unique` hands back the canonical printing.
hit_name as (
  select distinct on (a.idx) a.idx, u.id, 'exact'::text as status
  from asked a
  join cards_unique u on card_name_key(u.name) = a.qkey
  where a.idx not in (select idx from hit_printing)
  -- Fifteen names in the catalogue belong to more than one card, mostly Un-set
  -- variants plus a few genuine collisions. The most played one wins, and the
  -- order is total so the same paste always resolves the same way.
  order by a.idx, u.edhrec_rank nulls last, u.released_at, u.id
),
-- The name is the front of a double faced card.
hit_face as (
  select distinct on (a.idx) a.idx, u.id, 'face'::text as status
  from asked a
  join cards_unique u on card_name_key(split_part(u.name, ' // ', 1)) = a.qfront
  where a.idx not in (select idx from hit_printing)
    and a.idx not in (select idx from hit_name)
  order by a.idx, u.edhrec_rank nulls last, u.released_at, u.id
),
matched as (
  select idx, id, status from hit_printing
  union all select idx, id, status from hit_name
  union all select idx, id, status from hit_face
),
unmatched as (
  select a.* from asked a where a.idx not in (select idx from matched)
),
-- Only the lines that matched nothing pay for a trigram search, so a clean
-- paste never touches this at all.
near as (
  select u.idx, s.id, s.name, s.sim,
         row_number() over (partition by u.idx order by s.sim desc, s.name) as rank
  from unmatched u
  cross join lateral (
    select c.id, c.name, similarity(c.name, u.q) as sim
    from cards_unique c
    where c.name % u.q
    order by similarity(c.name, u.q) desc, c.edhrec_rank nulls last
    limit 3
  ) s
),
resolved as (
  select idx, id, status from matched
  union all
  select idx, id, 'near'::text from near where rank = 1
)
select
  a.idx,
  a.q as query,
  coalesce(r.status, 'none') as status,
  case when c.id is null then null else jsonb_build_object(
    'id', c.id,
    'oracle_id', c.oracle_id,
    'name', c.name,
    'set_code', c.set_code,
    'set_name', c.set_name,
    'collector_number', c.collector_number,
    'released_at', c.released_at,
    'artist', c.artist,
    'rarity', c.rarity,
    'layout', c.layout,
    'type_line', c.type_line,
    'mana_cost', c.mana_cost,
    'cmc', c.cmc,
    'colors', c.colors,
    'color_identity', c.color_identity,
    'image_uris', c.image_uris,
    'faces', c.faces,
    'prices', c.prices,
    'finishes', c.finishes
  ) end as card,
  coalesce(pc.n, 0) as printings,
  coalesce(sg.items, '[]'::jsonb) as suggestions
from asked a
left join resolved r on r.idx = a.idx
left join cards c on c.id = r.id
-- Counted on oracle_id, which is indexed, and which is also the right question:
-- "how many printings of this card are there" is a fact about the card, not
-- about the string that was typed.
left join lateral (
  select count(*)::int as n from cards x where x.oracle_id = c.oracle_id
) pc on c.oracle_id is not null
left join lateral (
  select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'score', round(n.sim::numeric, 3))
                   order by n.rank) as items
  from near n where n.idx = a.idx
) sg on true
order by a.idx
$$;

comment on function public.resolve_card_names(jsonb) is
  'Resolve a whole pasted list of card names to printings in one query. Every line comes back, including the ones that matched nothing.';

-- ------------------------------------------------------------------ bulk add
--
-- The same discipline on the way in. Committing a resolved list of 99 cards
-- through `card_list_add` would be 99 round trips, so this is the one-statement
-- version of the same rule: a card already on the list gains copies rather than
-- gaining a second row. Duplicates WITHIN the payload are summed first, because
-- ON CONFLICT cannot touch the same row twice in one statement, and a paste
-- that lists Sol Ring under two headings is a normal paste.
--
-- The finish fallback is copied from `card_list_add` deliberately rather than
-- factored out: both are short, and the alternative is a helper that has to be
-- called correctly from two places to keep an etched-only printing from being
-- asked for as a plain copy.

create or replace function public.card_list_add_many(
  p_kind text,
  p_items jsonb,
  p_source text default 'manual'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_list uuid;
  v_rows integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'A bulk add needs a list of cards.' using errcode = '22023';
  end if;

  v_list := card_list_ensure(p_kind);

  with raw as (
    select
      btrim(coalesce(e ->> 'card_id', '')) as card_id,
      btrim(coalesce(e ->> 'card_name', '')) as card_name,
      nullif(btrim(coalesce(e ->> 'oracle_id', '')), '') as oracle_id,
      greatest(1, coalesce(nullif(e ->> 'quantity', '')::int, 1)) as quantity,
      coalesce(nullif(btrim(coalesce(e ->> 'finish', '')), ''), 'nonfoil') as finish
    from jsonb_array_elements(p_items) e
  ),
  valid as (
    select * from raw where card_id <> '' and card_name <> ''
  ),
  settled as (
    select
      v.card_id,
      v.card_name,
      coalesce(v.oracle_id, c.oracle_id) as oracle_id,
      v.quantity,
      case
        when v.finish = 'nonfoil'
         and c.finishes is not null
         and array_length(c.finishes, 1) = 1
         and not ('nonfoil' = any (c.finishes))
         and c.finishes[1] in ('foil', 'etched')
        then c.finishes[1]
        else v.finish
      end as finish
    from valid v
    left join cards c on c.id = v.card_id
  ),
  grouped as (
    select
      card_id,
      finish,
      min(card_name) as card_name,
      min(oracle_id) as oracle_id,
      sum(quantity)::int as quantity
    from settled
    group by card_id, finish
  )
  insert into card_list_items (
    list_id, user_id, kind, card_id, oracle_id, card_name, finish, quantity, source
  )
  select
    v_list, auth.uid(), p_kind, g.card_id, g.oracle_id, g.card_name,
    g.finish, g.quantity, coalesce(p_source, 'manual')
  from grouped g
  on conflict (list_id, card_id, finish) where status = 'want'
  do update set quantity = card_list_items.quantity + excluded.quantity;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.card_list_add_many(text, jsonb, text) is
  'Put a whole list of cards on one of the caller''s lists in a single statement, raising quantities where a card is already there.';

revoke all on function public.card_name_key(text) from anon, public;
revoke all on function public.resolve_card_names(jsonb) from anon, public;
revoke all on function public.card_list_add_many(text, jsonb, text) from anon, public;

grant execute on function public.card_name_key(text) to authenticated, anon;
grant execute on function public.resolve_card_names(jsonb) to authenticated;
grant execute on function public.card_list_add_many(text, jsonb, text) to authenticated;

-- ------------------------------------------------------------ a road not taken
--
-- Tried and reverted on 20 Aug 2026, recorded so nobody spends the afternoon on
-- it again. Pasting "Counterspell" resolves to the borderless Final Fantasy
-- printing whose title on the card reads "Wild Rose Rebellion", because
-- `cards_unique` picks the cheapest printing and that is the cheapest one. For
-- a card you are about to cut out and play with, that is a poor default.
--
-- The obvious fix is to prefer the plain printing: black bordered, not full
-- art, no frame effects, not a promo. It does not work, because the signal is
-- missing. Measured on the live catalogue:
--
--   border_color, full_art, promo, set_name and released_at are ALL NULL on
--   57,397 of 97,140 printings (59%) -- the rows `scryfall-sync` added when it
--   moved to `unique=prints` on 19 Aug and has not backfilled since.
--
-- So a plainness test reads "ordinary" for 59% of the table whatever the card
-- looks like, and since many of those rows are also cheap they win the
-- ordering. Measured: Counterspell got better, Sol Ring and Lightning Bolt got
-- worse, and it bought a second rule about which printing represents a card
-- when the project has exactly one. Reverted.
--
-- The fix is upstream: when the sync backfills those columns, this becomes
-- worth doing, and the printing picker also stops showing blank set names and
-- no year for most printings.
