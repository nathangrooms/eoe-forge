-- How many printings a card has, and what they cost.
--
-- The companion to 20260819210000_own_a_printing_not_a_card.sql. Applied as its
-- own migration because the column add and the view are independent, and the
-- database was under a heavy concurrent load that would not accept them in one
-- statement batch.

-- ------------------------------------------------ how many, and what they cost

-- A plain view, not a materialized one. `cards` is rewritten every night by the
-- sync and again by the price capture, and a stale price range is a worse
-- answer than a marginally slower fresh one. The aggregate is only ever read
-- filtered by oracle_id (a collection is tens of cards, not tens of thousands),
-- and a qualification on the grouping column pushes down into the scan, so it
-- is served by idx_cards_oracle_id_released rather than by a full pass.
--
-- The regex guard is not defensive theatre. `prices` is Scryfall's blob copied
-- verbatim and a single non-numeric string anywhere in 96,732 rows would make
-- an unguarded ::numeric throw for every caller, on a view that only exists to
-- make the product more honest.

create or replace view public.card_printing_spread as
select
  c.oracle_id,
  count(*)::int as printings,
  min(case when c.prices->>'usd'        ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'usd')::numeric        end) as usd_min,
  max(case when c.prices->>'usd'        ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'usd')::numeric        end) as usd_max,
  min(case when c.prices->>'usd_foil'   ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'usd_foil')::numeric   end) as usd_foil_min,
  max(case when c.prices->>'usd_foil'   ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'usd_foil')::numeric   end) as usd_foil_max,
  min(case when c.prices->>'eur'        ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'eur')::numeric        end) as eur_min,
  max(case when c.prices->>'eur'        ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'eur')::numeric        end) as eur_max,
  min(case when c.prices->>'eur_foil'   ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'eur_foil')::numeric   end) as eur_foil_min,
  max(case when c.prices->>'eur_foil'   ~ '^[0-9]+(\.[0-9]+)?$' then (c.prices->>'eur_foil')::numeric   end) as eur_foil_max
from public.cards c
where c.oracle_id is not null
group by c.oracle_id;

-- Runs as the caller, so `cards`'s own public-read policy is what grants it
-- rather than the view owner's rights. Nothing new is exposed either way:
-- `cards` already carries USING (true).
alter view public.card_printing_spread set (security_invoker = true);

comment on view public.card_printing_spread is
  'One row per card: how many printings the catalogue holds and the cheapest and dearest each finish costs across them. Read it to tell "we know what you own" apart from "we picked one for you", and to state the range instead of inventing a number.';

grant select on public.card_printing_spread to anon, authenticated, service_role;
