-- Same fault as `engine_knowledge`, same fix. This unnested every card's facet
-- array and ran a regex over each element to decide "is this card in the gap",
-- which was affordable before Tagger's words lengthened the arrays and is a 500
-- now. `knowledge_band` is a column with an index on it.

create or replace function public.unmapped_tag_worklist()
returns table (tag_id uuid, slug text, label text, description text,
               blind_cards integer, total_cards integer)
language sql
stable
set search_path = public
as $$
  with blind as (
    select oracle_id::uuid as oid
    from public.cards_pool
    where knowledge_band in ('looks-at-only', 'nothing')
  )
  select t.tag_id, t.slug, t.label, t.description,
         count(distinct b.oid)::integer as blind_cards,
         t.card_count::integer          as total_cards
  from public.scryfall_tags t
  join public.scryfall_card_tags ct on ct.tag_id = t.tag_id
  join blind b on b.oid = ct.oracle_id
  where not exists (select 1 from public.tag_facet_map m where m.tag_id = t.tag_id)
  group by t.tag_id, t.slug, t.label, t.description, t.card_count
  having count(distinct b.oid) >= 2
  order by count(distinct b.oid) desc;
$$;

grant execute on function public.unmapped_tag_worklist() to anon, authenticated, service_role;;
