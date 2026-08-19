-- Mana sources were counted by card.colors. Lands carry an EMPTY colors array on
-- Scryfall (a land's colour comes from what it PRODUCES, not from what it is), so
-- every nonbasic land in the catalogue was filed as colourless. The owner's
-- four-colour Atraxa deck reported B:5 C:34 G:8 R:0 U:5 W:3 — 34 "colourless"
-- sources in a deck holding Zagoth Triome, Overgrown Tomb and Selesnya Guildgate.
--
-- The honest key is Scryfall's produced_mana. It is not in the cards table, so:
--   1. add the column,
--   2. add a derivation from the rules text as a stopgap for rows the sync has
--      not filled yet,
--   3. rewrite compute_deck_summary to use it, and to return NULL rather than a
--      confident wrong number when a land cannot be classified at all.

alter table public.cards
  add column if not exists produced_mana text[];

comment on column public.cards.produced_mana is
  'Scryfall produced_mana: the mana symbols this card can add. Distinct from '
  '"colors", which is empty for every land. Written by scryfall-sync; NULL means '
  'not yet synced, which callers must treat as unknown rather than as none.';

create index if not exists cards_produced_mana_idx
  on public.cards using gin (produced_mana);

-- ---------------------------------------------------------------------------
-- Stopgap derivation, used only where produced_mana is still NULL.
--
-- Reads two things and nothing else: the intrinsic mana ability that a basic
-- land subtype grants, and every explicit "Add ..." clause in the rules text.
-- Anything it cannot read returns NULL — the caller is expected to report that
-- as unknown, not to fold it into the colourless bucket the way the old query
-- did.
-- ---------------------------------------------------------------------------
create or replace function public.derive_produced_mana(
  p_type_line text,
  p_oracle_text text,
  p_faces jsonb default null
)
returns text[]
language plpgsql
immutable
as $$
declare
  tl    text := lower(coalesce(p_type_line, ''));
  body  text;
  found text[] := '{}';
  seg   text;
  sym   text;
begin
  if position('land' in tl) = 0 then
    return null;
  end if;

  -- Multi-face lands (Agadeem's Awakening // Agadeem, the Undercrypt) publish no
  -- top-level oracle_text; the rules live in faces[].
  body := coalesce(
    nullif(p_oracle_text, ''),
    (select string_agg(f->>'oracle_text', E'\n')
       from jsonb_array_elements(coalesce(p_faces, '[]'::jsonb)) f),
    ''
  );

  -- A basic land subtype carries its mana ability without printing it.
  if tl like '%plains%'   then found := found || 'W'::text; end if;
  if tl like '%island%'   then found := found || 'U'::text; end if;
  if tl like '%swamp%'    then found := found || 'B'::text; end if;
  if tl like '%mountain%' then found := found || 'R'::text; end if;
  if tl like '%forest%'   then found := found || 'G'::text; end if;
  if tl like '%wastes%'   then found := found || 'C'::text; end if;

  for seg in
    select t.m[1] from regexp_matches(body, 'Add ([^.\n]*)', 'g') as t(m)
  loop
    if seg ~* 'any color' then
      found := found || array['W','U','B','R','G'];
    end if;
    if seg ~* 'any type' then
      found := found || array['W','U','B','R','G','C'];
    end if;
    for sym in
      select t2.m[1] from regexp_matches(seg, '\{([WUBRGC])\}', 'g') as t2(m)
    loop
      found := found || sym::text;
    end loop;
  end loop;

  if array_length(found, 1) is null then
    return null;
  end if;

  return array(select distinct unnest(found) order by 1);
end;
$$;

comment on function public.derive_produced_mana(text, text, jsonb) is
  'Stopgap for cards.produced_mana. Reads basic land subtypes and explicit '
  '"Add ..." clauses. Returns NULL when the land cannot be read, so the caller '
  'can say "unknown" instead of guessing colourless.';

-- ---------------------------------------------------------------------------
-- One place that answers "what does this land tap for", for the whole database.
-- ---------------------------------------------------------------------------
-- NULL and '{}' mean different things and must not be conflated. NULL is "the
-- sync has never written this row", which is unknown. '{}' is Scryfall stating
-- the card produces no mana at all, which is a fact and true of every fetchland:
-- Marsh Flats does not tap for mana, it sacrifices for a land that does.
create or replace function public.card_mana_produced(p_card public.cards)
returns text[]
language sql
immutable
as $$
  select coalesce(
    p_card.produced_mana,
    public.derive_produced_mana(p_card.type_line, p_card.oracle_text, p_card.faces)
  );
$$;
