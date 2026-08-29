-- REGENERATED because a fetch land is not ramp.
--
-- The land-search clause carried no land exclusion, which contradicted the rule
-- note a few lines below it. Evolving Wilds sacrifices itself to find a basic
-- and puts it onto the battlefield tapped: you spent your land drop and end the
-- turn on the same mana. That is colour fixing.
--
-- It reached the player. ArchetypeDetection fires Ramp/Big Mana at twelve ramp
-- cards, so an ordinary Commander mana base cleared the floor by itself, and a
-- white-black COUNTERS deck was reported as "Ramp/Big Mana, PRIMARY, 100 past
-- the floor" with Evolving Wilds, Terramorphic Expanse and Fabled Passage
-- printed underneath as the cards that said so. 33 lands were tagged this way.
--
-- Lands that fetch TWO keep the tag: Blighted Woodland and Myriad Landscape net
-- a land after sacrificing themselves, which is acceleration.
--
-- THE TRIGGER IS WHY THIS HAS TO BE THE FIX. `cards_apply_role_tags` recomputes
-- tags BEFORE every write, so removing the tag with an UPDATE is undone in the
-- same statement. Measured: an array_remove over 274 printings left every one
-- of them still tagged. The function is the authority and the rows follow it.

-- ============================================================================
-- Card role tagging.
--
-- GENERATED FROM src/lib/cards/tagger.ts BY scripts/generate-tagger-sql.ts.
-- Do not edit the derive_card_tags body by hand — edit TAG_RULES and regenerate,
-- or the browser tagger and the database tagger will disagree about what a card
-- does.
--
-- Before this migration `cards.tags` was mostly card TYPES: creature 18824,
-- removal 5536, sacrifice 66, recursion 23, and no role at all on Sol Ring. The
-- deck builder's role quotas and the "works well with" panel had nothing to read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The classifier. Pure: same inputs, same output, no table access, so it is
-- IMMUTABLE and can be used in an index or a generated column later.
-- ---------------------------------------------------------------------------
create or replace function public.derive_card_tags(
  p_name       text,
  p_type_line  text,
  p_oracle_text text,
  p_keywords   text[],
  p_mana_cost  text,
  p_cmc        numeric,
  p_faces      jsonb
) returns text[]
language plpgsql
immutable
parallel safe
as $fn$
declare
  v_text  text;
  v_type  text;
  v_kw    text[];
  v_mana  text;
  v_cmc   numeric := coalesce(p_cmc, 0);
  v_tags  text[] := '{}'::text[];
  v_names text[];
  v_name  text;
begin
  -- ---- oracle text -------------------------------------------------------
  -- 802 rows carry a null oracle_text and a populated `faces`: every transform,
  -- modal DFC, split and adventure card. Reading only the top level would
  -- classify all of them as blank.
  v_text := lower(coalesce(p_oracle_text, ''));

  if p_faces is not null and jsonb_typeof(p_faces) = 'array' then
    v_text := v_text || E'\n' || coalesce((
      select string_agg(lower(coalesce(f.value ->> 'oracle_text', '')), E'\n' order by f.ordinality)
      from jsonb_array_elements(p_faces) with ordinality as f(value, ordinality)
    ), '');
  end if;

  -- Oracle text refers to the card by name ("Blasphemous Act deals 13 damage to
  -- each creature") and names contain trigger words, so every name form is
  -- replaced with a placeholder. Longest first, so a face name that is a prefix
  -- of the full name cannot shadow it.
  v_names := array(
    select n from (
      select lower(p_name) as n
      union all
      select trim(both from x) from unnest(string_to_array(lower(coalesce(p_name, '')), ' // ')) as x
      union all
      select lower(f.value ->> 'name')
      from jsonb_array_elements(case when jsonb_typeof(p_faces) = 'array' then p_faces else '[]'::jsonb end) as f(value)
    ) s
    where n is not null and length(n) >= 3
    group by n
    order by length(n) desc
  );

  foreach v_name in array coalesce(v_names, '{}'::text[]) loop
    v_text := replace(v_text, v_name, '~');
  end loop;

  -- Reminder text is not rules the card imposes on the game — Smothering
  -- Tithe's Treasure reminder would otherwise make every Treasure producer a
  -- sacrifice outlet and a mana rock.
  v_text := regexp_replace(v_text, '\([^)]*\)', ' ', 'g');
  -- Oracle text mixes U+2019 and ASCII apostrophes by vintage; dropping both
  -- lets one pattern match "can't", "cant" and "can’t".
  v_text := regexp_replace(v_text, '[’''`]', '', 'g');
  v_text := regexp_replace(v_text, '[ \t]+', ' ', 'g');

  -- ---- type line ---------------------------------------------------------
  v_type := lower(coalesce(p_type_line, ''));
  if p_faces is not null and jsonb_typeof(p_faces) = 'array' then
    v_type := v_type || coalesce((
      select string_agg(' // ' || lower(coalesce(f.value ->> 'type_line', '')), '' order by f.ordinality)
      from jsonb_array_elements(p_faces) with ordinality as f(value, ordinality)
    ), '');
  end if;
  v_type := translate(v_type, '—–', '--');

  -- ---- keywords / mana ---------------------------------------------------
  v_kw := coalesce(array(select lower(k) from unnest(coalesce(p_keywords, '{}'::text[])) as k), '{}'::text[]);
  v_mana := lower(coalesce(p_mana_cost, ''));

  -- ---- rules -------------------------------------------------------------
  if v_type ~ 'creature'
  then v_tags := v_tags || array['creature']::text[]; end if;

  if v_type ~ 'instant'
  then v_tags := v_tags || array['instant']::text[]; end if;

  if v_type ~ 'sorcery'
  then v_tags := v_tags || array['sorcery']::text[]; end if;

  if v_type ~ 'artifact'
  then v_tags := v_tags || array['artifact']::text[]; end if;

  if v_type ~ 'enchantment'
  then v_tags := v_tags || array['enchantment']::text[]; end if;

  if v_type ~ 'planeswalker'
  then v_tags := v_tags || array['planeswalker']::text[]; end if;

  if v_type ~ 'land'
  then v_tags := v_tags || array['land']::text[]; end if;

  if v_type ~ 'battle'
  then v_tags := v_tags || array['battle']::text[]; end if;

  if v_type ~ 'basic[^\n]{0,20}land'
  then v_tags := v_tags || array['basic-land']::text[]; end if;

  if v_type ~ 'equipment'
  then v_tags := v_tags || array['equipment']::text[]; end if;

  if v_type ~ 'aura'
  then v_tags := v_tags || array['aura', 'auras']::text[]; end if;

  if v_type ~ 'vehicle'
  then v_tags := v_tags || array['vehicle']::text[]; end if;

  -- Mana production or extra land drops. Lands qualify only when a single activation yields two or more mana (Ancient Tomb, Cabal Coffers) — otherwise every basic Forest would be "ramp".
  if (v_text ~ '(?:(?:(^|\n)add (\{|one |two |three |four |x ))|(?:you may play an additional land)|(?:play an additional land)|(?:creates? [^\n]{0,60}treasure token))'
         or (v_text ~ ': add (\{|one |two |three |four |five |six |x |that much )'
        and not (v_type ~ 'land'))
         or (v_text ~ 'search your library for [^\n]{0,70}land[^\n]{0,90}onto the battlefield'
        and not (v_type ~ 'land'))
         or (v_type ~ 'land'
        and v_text ~ 'search your library for [^\n]{0,40}(up to two|two basic)')
         or (v_type ~ 'land'
        and v_text ~ '(?:(?:: add [^\n]{0,8}\{[wubrgc]\}[^\n]{0,8}\{[wubrgc]\})|(?:: add [^\n]{0,40}for each)|(?:: add (two|three|four|x) ))'))
  then v_tags := v_tags || array['ramp']::text[]; end if;

  -- Non-creature artifact with a mana ability whose cost is not a sacrifice.
  if (v_type ~ 'artifact'
        and not (v_type ~ 'creature')
        and not (v_type ~ 'land')
        and v_text ~ ': add (\{|one |two |three |four |five |six |x |that much )'
        and not (v_text ~ '(^|\n)[^\n:]{0,60}sacrifice[^\n:]{0,60}: add '))
  then v_tags := v_tags || array['mana-rock']::text[]; end if;

  if (v_type ~ 'creature'
        and v_text ~ ': add (\{|one |two |three |four |five |six |x |that much )'
        and not (v_text ~ '(^|\n)[^\n:]{0,60}sacrifice[^\n:]{0,60}: add '))
  then v_tags := v_tags || array['mana-dork']::text[]; end if;

  -- One mana or less, produces two or more — Sol Ring, Mana Crypt, Lotus Petal.
  if (v_cmc <= 1
        and not (v_type ~ 'land')
        and v_text ~ '(?:(?:: add [^\n]{0,8}\{[wubrgc]\}[^\n]{0,8}\{[wubrgc]\})|(?:: add (two|three|four) )|(?:(^|\n)add [^\n]{0,8}\{[wubrgc]\}[^\n]{0,8}\{[wubrgc]\}))')
  then v_tags := v_tags || array['fast-mana']::text[]; end if;

  if v_text ~ 'treasure token'
  then v_tags := v_tags || array['treasure']::text[]; end if;

  -- Reduces OTHER spells. "This spell costs {1} less" (Blasphemous Act) is self-discounting, not a cost reducer, and is excluded by requiring "you cast cost" or "spells cost".
  if v_text ~ '(?:(?:you cast costs? \{\d+\} less)|(?:spells cost \{\d+\} less to cast)|(?:abilities [^\n]{0,30}cost \{\d+\} less)|(?:you cast costs? \{\d+\} less to cast))'
  then v_tags := v_tags || array['cost-reduction']::text[]; end if;

  -- English templating separates "draw" (you) from "draws" (someone else), so requiring "draw <quantity> card" keeps out "each player draws a card" and "target opponent draws", which are group-hug and gift effects.
  if v_text ~ '(?:(?:draw (a|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+|that many) cards?)|(?:draw cards equal to)|(?:draw that many cards))'
  then v_tags := v_tags || array['card-draw', 'draw']::text[]; end if;

  -- Library search that is not purely a land fetch.
  if (v_text ~ 'search your library for'
        and not (v_text ~ 'search your library for [^\n]{0,60}(basic land|land card|basic plains|plains, island|island, swamp|forest card|mountain card|swamp card|plains card)'))
  then v_tags := v_tags || array['tutor']::text[]; end if;

  -- Fetches any card at all — Demonic Tutor, Vampiric Tutor, Enlightened Tutor is narrow.
  if v_text ~ '(?:(?:search your library for a card)|(?:search your library for any card))'
  then v_tags := v_tags || array['tutor-broad']::text[]; end if;

  if (v_text ~ 'search your library for'
        and not (v_text ~ 'search your library for [^\n]{0,60}(basic land|land card|basic plains|plains, island|island, swamp|forest card|mountain card|swamp card|plains card)')
        and not (v_text ~ 'search your library for a card'))
  then v_tags := v_tags || array['tutor-narrow']::text[]; end if;

  if v_text ~ '(?:(?:each player draws)|(?:each other player draws)|(?:each player may draw)|(?:each player searches their library)|(?:each player may search))'
  then v_tags := v_tags || array['group-hug']::text[]; end if;

  if v_text ~ '(?:(?:mills? (a|one|two|three|four|five|six|seven|ten|x|\d+|that many))|(?:puts? the top (\d+|one|two|three|four|five|seven|ten|x) cards? of [^\n]{0,30}library into [^\n]{0,30}graveyard))'
  then v_tags := v_tags || array['mill']::text[]; end if;

  if v_text ~ '(?:(?:you mill (a|one|two|three|four|five|six|seven|ten|x|\d+))|(?:mill (a|one|two|three|four|five|six|seven|ten|x|\d+) cards?, then))'
  then v_tags := v_tags || array['self-mill']::text[]; end if;

  -- Opponent-facing hand attack only. Self-discard is `discard-outlet`.
  if v_text ~ '(?:(?:(each|target|that) (opponent|player|other player) discards)|(?:each other player discards)|(?:opponents? discards?)|(?:discards? their hand))'
  then v_tags := v_tags || array['discard']::text[]; end if;

  if v_text ~ '(?:(?:(^|\n|, )discard (a|one|two|three|x|\d+|your hand) card)|(?:discard (a|one|two|three|x|\d+) cards?:)|(?:then discard (a|one|two|three|x|\d+) cards?))'
  then v_tags := v_tags || array['discard-outlet']::text[]; end if;

  -- Exiling something YOU control is a blink or a sacrifice, not removal — Ephemerate reads "exile target creature you control, then return it". Oblivion Ring, which exiles an opponent's permanent and returns it later, is deliberately still removal.
  if (not (v_text ~ '(destroy|exile) (target|another target)[^\n]{0,40}(creature|permanent|artifact|enchantment|land) you control')
        and v_text ~ '(?:(?:(destroy|exile) (target|another target|up to (one|two|three|four|x) target|each of up to (one|two|three) target)[^\n]{0,60}(creature|permanent|artifact|enchantment|planeswalker|land|battle))|(?:target creature gets -\d+/-\d+)|(?:target creature gets -x/-x)|(?:deals \d+ damage to target (creature|planeswalker|battle|creature or))|(?:deals \d+ damage to any target)|(?:deals x damage to (target|any target))|(?:deals damage to (target creature|any target) equal to)|(?:target (player|opponent) sacrifices a (creature|permanent|nonland permanent))|(?:each opponent sacrifices a (creature|permanent|nonland permanent))|(?:fights? target creature)|(?:put target (creature|nonland permanent)[^\n]{0,40}(on the bottom|into (its|their) owner)))')
  then v_tags := v_tags || array['targeted-removal', 'removal', 'removal-spot']::text[]; end if;

  -- Cyclonic Rift reaches this through `overload`, which rewrites "target" to "each" — the single-target text alone would never read as a wipe.
  if (v_text ~ '(?:(?:(destroy|exile) all (creature|nonland|permanent|artifact|enchantment|land|planeswalker|token))|(?:(destroy|exile) each (creature|nonland|permanent|artifact|enchantment))|(?:all creatures get -\d+/-\d+)|(?:all creatures get -x/-x)|(?:deals \d+ damage to each creature)|(?:deals x damage to each creature)|(?:each player sacrifices (all|half|x|\d+|one|two|three))|(?:sacrifices all (creature|permanent))|(?:return all (nonland permanents|creatures|permanents|artifacts|enchantments)))'
         or (v_text ~ 'overload \{'
        and v_text ~ '(?:(?:(destroy|exile) target)|(?:return target)|(?:target creature gets -)|(?:deals \d+ damage to target))'))
  then v_tags := v_tags || array['board-wipe', 'removal', 'removal-sweeper']::text[]; end if;

  if v_text ~ '(?:(?:return (target|all|each|another target|up to (one|two|three|x) target)[^\n]{0,80}to (its|their) owner)|(?:return (target|all|each)[^\n]{0,80}to (its|their) (owner|controller)))'
  then v_tags := v_tags || array['bounce']::text[]; end if;

  if v_text ~ '(?:(?:counter target (spell|creature spell|noncreature spell|artifact spell|activated|triggered|ability))|(?:counter that spell)|(?:counter it unless)|(?:counter target spell))'
  then v_tags := v_tags || array['counterspell']::text[]; end if;

  if v_text ~ '(?:(?:(destroy|exile) target( nonbasic| basic)? land)|(?:destroy all lands)|(?:(each player|target player|each opponent) sacrifices a land))'
  then v_tags := v_tags || array['land-destruction']::text[]; end if;

  -- Someone else's graveyard. "Exile two cards from your graveyard" is a delve/escape COST, not hate, so a bare "from your graveyard" does not qualify.
  if v_text ~ '(?:(?:exile [^\n]{0,50}from (a|target players|each players|target opponents|all) graveyard)|(?:exile (target players|each players|all|target opponents)[^\n]{0,20}graveyard)|(?:exile all cards from (all|each|target))|(?:cards? in graveyards? cant be)|(?:graveyards? cant)|(?:if a card would be put into (a|an opponents) graveyard))'
  then v_tags := v_tags || array['graveyard-hate']::text[]; end if;

  -- Taxes and denial. Rhystic Study lands here as well as card-draw via "unless that player pays" — it genuinely is a tax effect.
  if v_text ~ '(?:(?:spells? cost \{\d+\} more)|(?:costs? \{\d+\} more to cast)|(?:unless that player pays)|(?:unless they pay)|(?:unless its controller pays)|(?:unless that players? controller pays)|(?:players cant)|(?:your opponents cant)|(?:each opponent cant)|(?:cant cast spells)|(?:cant search)|(?:(lands|creatures|permanents|artifacts|players) [^\n]{0,30}dont untap during)|(?:skip (your|their|that players) (draw|untap|combat|precombat))|(?:maximum hand size is)|(?:cant draw more than)|(?:creatures cant attack))'
  then v_tags := v_tags || array['stax']::text[]; end if;

  -- Grants protection. A creature that merely HAS hexproof is not a protection spell.
  if v_text ~ '(?:(?:gains? (hexproof|indestructible|shroud|protection from|ward))|(?:(creatures|permanents|artifacts|enchantments) you control (have|gain) (hexproof|indestructible|shroud|protection from|ward))|(?:you have hexproof)|(?:have (hexproof|indestructible|shroud) until end of turn)|(?:prevent all (damage|combat damage))|(?:regenerate target)|(?:(creatures|permanents) you control cant be))'
  then v_tags := v_tags || array['protection']::text[]; end if;

  if (v_text ~ '(?:(?:return [^\n]{0,70}from your graveyard to (your hand|the battlefield))|(?:return [^\n]{0,70}from (a|your|target players) graveyard to the battlefield)|(?:put [^\n]{0,70}from your graveyard (onto|on) the battlefield)|(?:return [^\n]{0,40}card from your graveyard))'
         or v_kw && array['flashback', 'unearth', 'escape', 'disturb', 'embalm', 'eternalize', 'encore', 'jump-start', 'aftermath', 'retrace']::text[])
  then v_tags := v_tags || array['graveyard-recursion', 'recursion']::text[]; end if;

  if (v_text ~ '(?:(?:return target creature card from (a|your|target players) graveyard to the battlefield)|(?:put target creature card from (a|your) graveyard onto the battlefield)|(?:return [^\n]{0,30}creature card[^\n]{0,40}graveyard to the battlefield))'
         or v_kw && array['unearth', 'encore']::text[])
  then v_tags := v_tags || array['reanimator']::text[]; end if;

  -- The sacrifice must sit in an activated-ability COST — left of a colon on its own line. "Sacrifice a creature. If you do..." is a one-shot effect, not an outlet, and has no colon. It must also sacrifice something OTHER than the card itself: an outlet is a repeatable way to convert your other permanents into value, which is not what "Sacrifice this land:" offers.
  if v_text ~ '(?:(?:(^|\n)[^\n:]{0,70}sacrifice (a|an|another|one|two|three|x|\d+|any number of)[^\n:]{0,60}:)|(?:(^|\n)[^\n:]{0,70}sacrifice [^\n:]{0,50}(another|other) [^\n:]{0,40}:))'
  then v_tags := v_tags || array['sacrifice-outlet', 'sac-outlet', 'sacrifice']::text[]; end if;

  if v_text ~ '(?:(?:whenever [^\n]{0,70}creature[^\n]{0,30} dies)|(?:whenever [^\n]{0,50}dies, (you|each|target|that))|(?:whenever you sacrifice)|(?:whenever [^\n]{0,40}creature you control dies))'
  then v_tags := v_tags || array['aristocrats']::text[]; end if;

  -- The verb "create" is required — "creature tokens you control get +1/+1" is a payoff, not a maker.
  if v_text ~ '(?:(?:creates? [^\n]{0,90}token)|(?:put [^\n]{0,50}token onto the battlefield)|(?:creates? that many))'
  then v_tags := v_tags || array['token-maker', 'tokens']::text[]; end if;

  if (v_text ~ '\+1/\+1 counter'
         or v_kw && array['modular', 'evolve', 'adapt', 'bolster', 'outlast', 'renown', 'mentor', 'training', 'backup']::text[])
  then v_tags := v_tags || array['counters']::text[]; end if;

  if v_text ~ 'proliferate'
  then v_tags := v_tags || array['proliferate']::text[]; end if;

  if (v_text ~ '(?:(?:poison counter)|(?:(^|\n)infect))'
         or v_kw && array['infect', 'toxic']::text[])
  then v_tags := v_tags || array['infect']::text[]; end if;

  -- Grants haste to something else. A creature that simply has Haste does not qualify.
  if v_text ~ '(?:(?:(creatures|creature tokens|permanents|they|it|those creatures) you control (gain|gains|have|has) haste)|(?:gains? haste)|(?:creatures you control have haste)|(?:has haste for as long as))'
  then v_tags := v_tags || array['haste-enabler']::text[]; end if;

  if v_text ~ '(?:(?:takes? an extra turn)|(?:take an extra turn after this one))'
  then v_tags := v_tags || array['extra-turn']::text[]; end if;

  if v_text ~ '(?:(?:additional combat phase)|(?:an additional combat))'
  then v_tags := v_tags || array['extra-combat']::text[]; end if;

  if v_text ~ '(?:(?:untap (target|another target|all|each|up to (one|two|three|four|five|x) target))|(?:untap all (creatures|lands|permanents|artifacts))|(?:untap [^\n]{0,30}during each (other players|opponents) untap step))'
  then v_tags := v_tags || array['untapper']::text[]; end if;

  if v_text ~ '(?:(?:exile [^\n]{0,90}return (it|them|that card|those cards|the exiled card|the exiled cards)[^\n]{0,90}to the battlefield)|(?:exile [^\n]{0,90}then return (it|them|those cards)[^\n]{0,60}to the battlefield)|(?:exile [^\n]{0,60}return (it|them)[^\n]{0,60}under (its|their|your) owners control))'
  then v_tags := v_tags || array['blink']::text[]; end if;

  if v_text ~ '(?:(?:as a copy of)|(?:copy of (any|target) (creature|permanent|artifact))|(?:enters as a copy))'
  then v_tags := v_tags || array['clone']::text[]; end if;

  if (v_text ~ 'as though it had flash'
         or v_kw && array['flash']::text[])
  then v_tags := v_tags || array['flash']::text[]; end if;

  if v_kw && array['cascade']::text[]
  then v_tags := v_tags || array['cascade']::text[]; end if;

  if (v_text ~ 'cant be blocked'
         or v_kw && array['flying', 'menace', 'shadow', 'fear', 'intimidate', 'horsemanship', 'skulk']::text[])
  then v_tags := v_tags || array['evasion']::text[]; end if;

  -- Mass pump and alternate wins. Craterhoof reaches this through "creatures you control ... get +X/+X".
  if v_text ~ '(?:(?:you win the game)|(?:(target player|each opponent) loses the game)|(?:creatures you control [^\n]{0,60}get \+(x|\d+)/\+(x|\d+))|(?:creatures you control get \+(x|\d+)/\+(x|\d+))|(?:each opponent loses \d+ life for each))'
  then v_tags := v_tags || array['finisher', 'wincon']::text[]; end if;

  if v_text ~ '(?:(?:creatures you control get \+)|(?:creatures you control [^\n]{0,60}get \+))'
  then v_tags := v_tags || array['mass-pump']::text[]; end if;

  -- "Its controller gains life" (Swords to Plowshares) is the opponent gaining, and is excluded.
  if (v_text ~ '(?:(?:you gain (\d+|x|that much) life)|(?:you gain life equal to)|(?:(^|\n)gain (\d+|x) life)|(?:whenever you gain life)|(?:(creatures|permanents) you control (have|gain) lifelink))'
         or v_kw && array['lifelink']::text[])
  then v_tags := v_tags || array['lifegain']::text[]; end if;

  if v_text ~ '(?:(?:equipped creature gets \+)|(?:enchanted creature gets \+)|(?:equipped creature has)|(?:enchanted creature has))'
  then v_tags := v_tags || array['voltron']::text[]; end if;

  if v_text ~ '(?:(?:landfall)|(?:whenever a land (you control )?enters))'
  then v_tags := v_tags || array['landfall', 'lands-matter']::text[]; end if;

  if v_text ~ '(?:(?:for each land you control)|(?:lands you control)|(?:whenever a land [^\n]{0,20}enters))'
  then v_tags := v_tags || array['lands-matter']::text[]; end if;

  if (v_text ~ '(?:(?:for each artifact you control)|(?:artifacts you control (get|have|gain))|(?:whenever (an|another) artifact [^\n]{0,30}enters))'
         or v_kw && array['affinity', 'metalcraft', 'improvise', 'prototype']::text[])
  then v_tags := v_tags || array['artifacts-matter']::text[]; end if;

  if (v_text ~ '(?:(?:for each enchantment you control)|(?:enchantments you control (get|have|gain))|(?:whenever an enchantment [^\n]{0,30}enters))'
         or v_kw && array['constellation']::text[])
  then v_tags := v_tags || array['enchantments-matter']::text[]; end if;

  if v_text ~ '(?:(?:whenever you cast (an|a) (instant|sorcery|noncreature))|(?:instant or sorcery spell you cast)|(?:for each instant and sorcery card))'
  then v_tags := v_tags || array['spellslinger']::text[]; end if;

  if (v_text ~ 'whenever you cast a noncreature spell, this'
         or v_kw && array['prowess']::text[])
  then v_tags := v_tags || array['prowess']::text[]; end if;

  if (v_text ~ '(?:(?:for each spell cast before it)|(?:for each spell (youve|you have) cast this turn))'
         or v_kw && array['storm']::text[])
  then v_tags := v_tags || array['storm']::text[]; end if;

  if v_text ~ '(?:(?:(^| )(other )?(human|humans|elf|elves|goblin|goblins|wizard|wizards|warrior|warriors|soldier|soldiers|beast|beasts|dragon|dragons|angel|angels|demon|demons|vampire|vampires|zombie|zombies|spirit|spirits|elemental|elementals|merfolk|knight|knights|cleric|clerics|rogue|rogues|shaman|shamans|giant|giants|dwarf|dwarves|treefolk|sliver|slivers|cat|cats|dog|dogs|wolf|wolves|bird|birds|snake|snakes|spider|spiders|insect|insects|fungus|fungi|saproling|saprolings|pirate|pirates|ninja|ninjas|samurai|monk|monks|druid|druids|rat|rats|bear|bears|horror|horrors|construct|constructs|golem|golems|thopter|thopters|phyrexian|phyrexians|dinosaur|dinosaurs|hydra|hydras|god|gods|minotaur|minotaurs|centaur|centaurs|satyr|satyrs|faerie|faeries|kithkin|kor|leonin|naga|orc|orcs|ogre|ogres|troll|trolls|myr|assassin|assassins|archer|archers|berserker|berserkers|advisor|advisors|noble|nobles|peasant|peasants|citizen|citizens|artificer|artificers|mercenary|mercenaries|rebel|rebels|werewolf|werewolves|wurm|wurms|kraken|leviathan|leviathans|serpent|serpents|crab|crabs|fish|frog|frogs|lizard|lizards|salamander|salamanders|turtle|turtles|plant|plants|bat|bats|boar|boars|elephant|elephants|ox|oxen|goat|goats|rhino|rhinos|squirrel|squirrels|otter|otters|fox|foxes|griffin|griffins|pegasus|unicorn|unicorns|sphinx|sphinxes|gargoyle|gargoyles|scarecrow|scarecrows|servo|servos|drake|drakes|imp|imps|devil|devils|nightmare|nightmares|shade|shades|skeleton|skeletons|monkey|monkeys|ape|apes|mouse|mice|raccoon|raccoons|bringer|illusion|illusions) (creatures )?you control (get|gain|have))|(?:choose a creature type)|(?:creatures of the chosen type)|(?:(^| )other (human|humans|elf|elves|goblin|goblins|wizard|wizards|warrior|warriors|soldier|soldiers|beast|beasts|dragon|dragons|angel|angels|demon|demons|vampire|vampires|zombie|zombies|spirit|spirits|elemental|elementals|merfolk|knight|knights|cleric|clerics|rogue|rogues|shaman|shamans|giant|giants|dwarf|dwarves|treefolk|sliver|slivers|cat|cats|dog|dogs|wolf|wolves|bird|birds|snake|snakes|spider|spiders|insect|insects|fungus|fungi|saproling|saprolings|pirate|pirates|ninja|ninjas|samurai|monk|monks|druid|druids|rat|rats|bear|bears|horror|horrors|construct|constructs|golem|golems|thopter|thopters|phyrexian|phyrexians|dinosaur|dinosaurs|hydra|hydras|god|gods|minotaur|minotaurs|centaur|centaurs|satyr|satyrs|faerie|faeries|kithkin|kor|leonin|naga|orc|orcs|ogre|ogres|troll|trolls|myr|assassin|assassins|archer|archers|berserker|berserkers|advisor|advisors|noble|nobles|peasant|peasants|citizen|citizens|artificer|artificers|mercenary|mercenaries|rebel|rebels|werewolf|werewolves|wurm|wurms|kraken|leviathan|leviathans|serpent|serpents|crab|crabs|fish|frog|frogs|lizard|lizards|salamander|salamanders|turtle|turtles|plant|plants|bat|bats|boar|boars|elephant|elephants|ox|oxen|goat|goats|rhino|rhinos|squirrel|squirrels|otter|otters|fox|foxes|griffin|griffins|pegasus|unicorn|unicorns|sphinx|sphinxes|gargoyle|gargoyles|scarecrow|scarecrows|servo|servos|drake|drakes|imp|imps|devil|devils|nightmare|nightmares|shade|shades|skeleton|skeletons|monkey|monkeys|ape|apes|mouse|mice|raccoon|raccoons|bringer|illusion|illusions) you control)|(?:creature type of your choice))'
  then v_tags := v_tags || array['tribal-payoff']::text[]; end if;

  if v_text ~ '(?:(?:when [^\n]{0,40}enters)|(?:whenever [^\n]{0,40}enters the battlefield))'
  then v_tags := v_tags || array['etb']::text[]; end if;

  if v_mana ~ '\{x\}'
  then v_tags := v_tags || array['x-spell']::text[]; end if;

  -- Sorted with the C collation so the array is byte-for-byte identical to what
  -- the TypeScript tagger's Array.sort() produces, which is what the parity
  -- check compares.
  return coalesce((select array_agg(tg order by tg collate "C") from (select distinct unnest(v_tags) as tg) d), '{}'::text[]);
end;
$fn$;

comment on function public.derive_card_tags(text, text, text, text[], text, numeric, jsonb) is
  'Deterministic MTG role classifier. Generated from src/lib/cards/tagger.ts by scripts/generate-tagger-sql.ts — do not hand-edit.';

-- ---------------------------------------------------------------------------
-- Keep tags correct on write, so a newly synced card is tagged on arrival
-- whatever wrote it. Recomputation is skipped when nothing the classifier reads
-- has changed, which keeps a price-only upsert cheap and makes the bulk retag
-- below a single pass rather than a double one.
-- ---------------------------------------------------------------------------
create or replace function public.cards_apply_role_tags()
returns trigger
language plpgsql
as $trg$
begin
  if tg_op = 'INSERT'
     or new.tags is null
     or new.name        is distinct from old.name
     or new.type_line   is distinct from old.type_line
     or new.oracle_text is distinct from old.oracle_text
     or new.keywords    is distinct from old.keywords
     or new.mana_cost   is distinct from old.mana_cost
     or new.cmc         is distinct from old.cmc
     or new.faces       is distinct from old.faces
  then
    new.tags := public.derive_card_tags(
      new.name, new.type_line, new.oracle_text, new.keywords, new.mana_cost, new.cmc, new.faces
    );
  end if;
  return new;
end;
$trg$;

drop trigger if exists cards_apply_role_tags on public.cards;
create trigger cards_apply_role_tags
  before insert or update on public.cards
  for each row execute function public.cards_apply_role_tags();

-- ---------------------------------------------------------------------------
-- Re-runnable bulk retag, keyset-paginated on id so it never re-reads a page and
-- never runs long enough to hit a statement timeout. Call until `remaining` is
-- false.
-- ---------------------------------------------------------------------------
create or replace function public.retag_cards_batch(
  p_limit integer default 2000,
  p_after text default ''
) returns table(scanned integer, changed integer, last_id text, remaining boolean)
language plpgsql
as $fn$
declare
  v_scanned integer := 0;
  v_changed integer := 0;
  v_last    text := p_after;
begin
  with page as (
    select c.id, c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces, c.tags
    from public.cards c
    where c.id > p_after
    order by c.id
    limit p_limit
  ), computed as (
    select p.id,
           public.derive_card_tags(p.name, p.type_line, p.oracle_text, p.keywords, p.mana_cost, p.cmc, p.faces) as new_tags
    from page p
  ), written as (
    update public.cards c
       set tags = k.new_tags
      from computed k
     where c.id = k.id
       and c.tags is distinct from k.new_tags
    returning c.id
  )
  select (select count(*) from page), (select count(*) from written), (select max(id) from page)
    into v_scanned, v_changed, v_last;

  return query select v_scanned, v_changed, coalesce(v_last, p_after), v_scanned = p_limit;
end;
$fn$;

-- Retag an explicit set of ids. scryfall-sync calls this for exactly the rows it
-- just upserted, so tagging on arrival is visible in the sync code rather than
-- being an invisible side effect of a trigger.
create or replace function public.retag_cards(p_ids text[])
returns integer
language plpgsql
as $fn$
declare v_changed integer := 0;
begin
  with computed as (
    select c.id,
           public.derive_card_tags(c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces) as new_tags
    from public.cards c
    where c.id = any(p_ids)
  ), written as (
    update public.cards c
       set tags = k.new_tags
      from computed k
     where c.id = k.id
       and c.tags is distinct from k.new_tags
    returning c.id
  )
  select count(*) into v_changed from written;
  return v_changed;
end;
$fn$;

grant execute on function public.derive_card_tags(text, text, text, text[], text, numeric, jsonb) to authenticated, anon, service_role;
grant execute on function public.retag_cards_batch(integer, text) to service_role;
grant execute on function public.retag_cards(text[]) to service_role;
