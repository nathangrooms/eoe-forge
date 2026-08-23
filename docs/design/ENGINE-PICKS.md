# Engine picks: reproducing the four generator failures

Measurement only. **No file under `src/`, `supabase/` or `scripts/` was changed
by this pass.** Three new scripts were written into `scratch/`, which is
gitignored agent scaffolding:

```
scratch/engine-picks-measure.mjs   builds the four decks with the real generator
scratch/fetch-edhrec.mjs           refreshes one column, edhrec_rank, from live
scratch/related-measure.mjs        runs CardRelated's own queries live
```

No fixes are proposed here.

Written 23 Aug 2026.

---

## The one-line answer

Sol Ring is in none of the four generated decks. Bone Saw is in all four.

---

## How this was established

### The generator

`scratch/engine-picks-measure.mjs` imports `generateDeck` from
`src/engine/build/generate.ts` and calls it. Nothing is reimplemented.
`diff` reports that file byte-identical to
`supabase/functions/ai-deck-builder-v2/_engine/build/generate.ts`, which is the
copy the deployed edge function runs, so a deck that comes out wrong here comes
out wrong in production.

The arguments are copied from step 3 of `pipeline.ts` `build()`, the `baseline`
build the function performs before any planner is consulted:

```
format 'commander', slots 99, landTarget 35, budgetUsd null, no preferOracleIds
```

`landTarget` is 35 because `pipeline.ts` reads
`clamp(config.minLandCount ?? 36, 30, 42)` and `DEFAULT_ADMIN_CONFIG.minLandCount`
is 35.

### The catalogue, and the one substitution

Transport only is substituted, and here is why. The pool query the generator
needs, `cards_unique` filtered to commander legality and a four colour identity,
one 1000 row range, was issued live three times on 23 Aug 2026:

```
500 3180ms {"code":"57014","message":"canceling statement due to statement timeout"}
500 3120ms {"code":"57014", ...}
500 3125ms {"code":"57014", ...}
```

So the rows come from `.shots/pool-snapshot.json`, written by
`scratch/snapshot-pool.mjs` on 2026-08-19T03:00:08Z directly out of
`public.cards_unique`: 31,833 commander legal cards, 1,194 land rows carrying
`oracle_text`, display columns for every name. The colour identity and legality
predicates are applied in the harness because the snapshot holds the whole
format, and they are the same two predicates `poolFor` renders into SQL.

One column was refreshed. `edhrec_rank` is null on all 31,833 snapshot rows, so
a raw run would never fire the popularity signal at all, which is not what the
deployed function does. `scratch/fetch-edhrec.mjs` paged
`cards_unique?select=id,name,edhrec_rank&order=id.asc` on 23 Aug 2026, 34 pages,
33,032 rows, zero retries, and that one column was patched in by name. Nothing
else was touched.

### The card page recommendations

`scratch/related-measure.mjs` transcribes every query in
`src/components/cards/CardRelated.tsx` one for one: the same relation
(`cards_unique`), the same predicates, the same limits (40 for subtype and
keyword, `PER_TAG_LIMIT` 60 per tag probe, `TAG_PROBES` 4), the same ranking
functions and the same closing `.slice(0, 14)`. Ranking imports the real
`signalTags`, `sharedTags` and `sharedTagScore` from
`src/engine/knowledge/tag-signal.ts`, which is what the component imports through
the one line re-export at `src/lib/cards/tag-signal.ts`.

These are small indexed reads and they answer live in 150 to 400 ms, so this half
ran against the live database on the anon key, which is the same transport and
the same row level security an anonymous visitor to `/cards/:id` gets.

Raw output:

```
scratch/engine-picks-measure.txt   (365 lines)
scratch/related-measure.txt        (194 lines)
```

---

## 1. There is no creature role, and the decks show it

`src/engine/core/types.ts` declares
`Role = 'ramp' | 'draw' | 'removal' | 'interaction' | 'wincon' | 'land'`.
`roles.ts` sets the Commander targets at ramp 10, draw 10, removal 8,
interaction 4, wincon 3, land 36. At the production `landTarget` of 35 that is
70 of the 99 slots quota driven and 29 free.

Four decks, four very different commanders, one run each.

| | Atraxa WUBG | Krenko R | Talrand U | Muldrotha UBG |
|---|---|---|---|---|
| legal pool | 24,578 | 7,496 | 7,401 | 18,171 |
| total cards | 99 | 99 | 99 | 99 |
| lands | 35 (8 basic) | 35 (2 basic) | 35 (2 basic) | 35 (6 basic) |
| **creatures** | **7** | **3** | **4** | **7** |
| artifacts | 49 | 55 | 54 | 43 |
| artifacts, noncreature | 47 | 54 | 53 | 42 |
| Equipment | 21 | 25 | 23 | 17 |
| colourless spells | 41 | 54 | 54 | 41 |
| nonland at mana value 0 | 14 | 16 | 16 | 16 |
| nonland at mana value 1 or less | 44 | 45 | 42 | 45 |
| nonland mean mana value | 1.16 | 1.11 | 1.22 | 1.11 |
| deck price | $2,210.89 | $2,214.74 | $2,252.31 | $3,126.26 |
| power score | 6.2 | 6.0 | 6.4 | 6.6 |

Krenko, whose whole card is making Goblin creature tokens and swinging with
them, gets **three creatures in 99 cards**. Every deck fills every quota,
`roleFill` reports `ramp 10/10, draw 10/10, removal 8/8, interaction 4/4,
wincon 3/3, land 35/35` in all four, and none of that has anything to say about
creatures because creatures are not a quota.

The reason a creature cannot get in on merit either: of the 24,578 cards in the
Atraxa pool, 15,023 carry no role tag at all (61.1%), and of the 13,396
creatures in that pool, 10,025 carry no role tag. A card with no role tag scores
no role gap, and role gap is the largest weight in the model at 3.0.

## 2. The 29 free slots are almost entirely cheap colourless artifacts

The flex block, after the quotas are full, in each of the four decks:

| flex block, 29 cards | artifacts | colourless | mana value 1 or less | creatures |
|---|---|---|---|---|
| Atraxa | 29 | 27 | 26 | 0 |
| Krenko | 28 | 29 | 26 | 1 |
| Talrand | 29 | 29 | 28 | 0 |
| Muldrotha | 24 | 25 | 26 | 4 |

Flex scores range 4.13 to 4.72 across all four decks, against role bucket scores
of 5.5 to 6.9. So the flex block is not close: it is the tail of the same
ranking, and the tail is Equipment and Mox.

### Two mechanisms put the Equipment there, and one of them feeds itself

**`voltron` is a win condition tag.** `ROLE_TAGS.wincon` in `roles.ts` is
`['finisher', 'wincon', 'extra-turn', 'extra-combat', 'infect', 'storm',
'voltron']`, and the measured table in `tag-signal.ts` puts `voltron` on 1,243
cards. So a piece of Equipment is a card that fills the wincon quota.

**All twelve win condition slots across the four decks are Equipment:**

```
Atraxa      Excalibur II 6.53         Basilisk Collar 6.30      Sylvok Lifestaff 6.20
Krenko      Bloodforged Battle-Axe 6.64  Basilisk Collar 6.30   Ceremonial Knife 6.25
Talrand     Bloodforged Battle-Axe 6.64  Glamdring 6.46         Basilisk Collar 6.30
Muldrotha   Basilisk Collar 6.30      Commander's Plate 6.17    Colossus Hammer 6.06
```

Basilisk Collar is the win condition of all four decks. Krenko, whose actual win
condition is a board of Goblin tokens, is told to win by equipping a 1 mana
Equipment.

**The flex pass then rewards the Equipment already picked.** Pass 3 re-ranks
against the deck as it stands, and by then the deck holds between seventeen and
twenty five pieces of Equipment, so `equipment` and `voltron` are the deck's own
tags. Bone Saw's reason in the Atraxa deck, verbatim, and the other three differ
only in the curve figure:

```
[flex] Shares 2 tags with your deck (equipment, voltron); 1.6 mana value below
your curve; you could pay for this 100% of the time on turn 1; played in a lot
of decks (EDHREC rank 6,734).
```

The deck is full of Equipment because this ranking put it there, and Bone Saw is
then rewarded for matching it. The generator builds the theme it goes on to
match against, and that theme has nothing to do with the commander.

The ten highest scored cards in each deck, from the run:

**Atraxa** (commander tags: creature, evasion, lifegain, proliferate)

```
 1. 6.91  Haywire Mite            1mv  G    removal      Artifact Creature — Insect
 2. 6.90  Arcane Signet           2mv  C    ramp         Artifact
 3. 6.64  Deathrite Shaman        1mv  BG   removal      Creature — Elf Shaman
 4. 6.58  Cankerbloom             2mv  G    removal      Creature — Phyrexian Fungus
 5. 6.56  Fellwar Stone           2mv  C    ramp         Artifact
 6. 6.53  Excalibur II            1mv  C    wincon       Legendary Artifact — Equipment
 7. 6.51  Chrome Mox              0mv  C    ramp         Artifact
 8. 6.47  Fountain of Renewal     1mv  C    draw         Artifact
 9. 6.46  Candy Trail             1mv  C    draw         Artifact — Food Clue
10. 6.41  Everflowing Chalice     0mv  C    ramp         Artifact
```

**Krenko** (creature, token-maker, tokens)

```
 1. 6.90  Arcane Signet           2mv  C    ramp         Artifact
 2. 6.78  Idol of Oblivion        2mv  C    draw         Artifact
 3. 6.64  Bloodforged Battle-Axe  1mv  C    wincon       Artifact — Equipment
 4. 6.56  Fellwar Stone           2mv  C    ramp         Artifact
 5. 6.53  Currency Converter      1mv  C    draw         Artifact
 6. 6.51  Chrome Mox              0mv  C    ramp         Artifact
 7. 6.41  Everflowing Chalice     0mv  C    ramp         Artifact
 8. 6.37  Dino DNA                1mv  C    removal      Artifact
 9. 6.34  Collector's Vault       2mv  C    draw         Artifact
10. 6.33  Great Train Heist       1mv  R    ramp         Instant
```

**Talrand** (creature, spellslinger, token-maker, tokens)

```
 1. 6.90  Arcane Signet           2mv  C    ramp         Artifact
 2. 6.80  An Offer You Can't Refuse 1mv U  ramp         Instant
 3. 6.78  Idol of Oblivion        2mv  C    draw         Artifact
 4. 6.64  Bloodforged Battle-Axe  1mv  C    wincon       Artifact — Equipment
 5. 6.56  Fellwar Stone           2mv  C    ramp         Artifact
 6. 6.53  Currency Converter      1mv  C    draw         Artifact
 7. 6.51  Chrome Mox              0mv  C    ramp         Artifact
 8. 6.46  Glamdring               2mv  C    wincon       Legendary Artifact — Equipment
 9. 6.41  Everflowing Chalice     0mv  C    ramp         Artifact
10. 6.37  Dino DNA                1mv  C    removal      Artifact
```

**Muldrotha** (creature)

```
 1. 6.90  Arcane Signet           2mv  C    ramp         Artifact
 2. 6.56  Fellwar Stone           2mv  C    ramp         Artifact
 3. 6.51  Chrome Mox              0mv  C    ramp         Artifact
 4. 6.41  Everflowing Chalice     0mv  C    ramp         Artifact
 5. 6.30  Basilisk Collar         1mv  C    wincon       Artifact — Equipment
 6. 6.26  Gitaxian Probe          1mv  U    draw         Sorcery
 7. 6.23  Dark Ritual             1mv  B    ramp         Instant
 8. 6.21  An Offer You Can't Refuse 1mv U  ramp         Instant
 9. 6.17  Commander's Plate       1mv  C    wincon       Artifact — Equipment
10. 6.16  Farseek                 2mv  G    ramp         Sorcery
```

Nine of Krenko's top ten have an empty colour identity, the tenth is Great Train
Heist. Talrand's top ten contains one blue card. Muldrotha's top four, Arcane
Signet, Fellwar Stone, Chrome Mox and Everflowing Chalice, all appear in Krenko's
and Talrand's top ten as well.

Exactly one of the forty entries does something the commander cares about, and
its own reason string shows how little that counted. Cankerbloom, fourth in
Atraxa's list, verbatim from the run:

```
[removal] Fills a removal gap (0 of 8); shares 1 tag with your deck
(proliferate); you could pay for this 69% of the time on turn 2; played in a
lot of decks (EDHREC rank 781).
```

The proliferate did fire. `proliferate` is on 101 cards so its rarity weight is
8.40, and after the saturation curve in `rank.ts` that is worth 1.17 of
Cankerbloom's 6.58. The removal gap is worth 3.00. The card is in this deck
because Atraxa needs eight removal spells, and the proliferate is a bonus the
engine noticed afterwards.

### Where the staples ended up

```
Atraxa      IN  Bone Saw 4.57 flex, Arcane Signet 6.90 ramp, Command Tower 4.86 land, Cyclonic Rift 5.94 removal
            OUT Sol Ring, Swords to Plowshares, Cultivate, Rhystic Study, Doubling Season
Krenko      IN  Bone Saw 4.56 flex, Arcane Signet 6.90 ramp, Command Tower 4.86 land
            OUT Sol Ring, Swords to Plowshares, Cultivate, Rhystic Study, Cyclonic Rift
Talrand     IN  Bone Saw 4.64 flex, Arcane Signet 6.90 ramp, Command Tower 4.86 land, Cyclonic Rift 5.99 removal
            OUT Sol Ring, Swords to Plowshares, Cultivate, Rhystic Study, Doubling Season
Muldrotha   IN  Bone Saw 4.58 flex, Arcane Signet 6.90 ramp, Command Tower 4.86 land, Cultivate 5.95 ramp, Cyclonic Rift 6.08 removal
            OUT Sol Ring, Swords to Plowshares, Rhystic Study, Doubling Season
```

## 3. The four decks are mostly the same deck

Overlap counted on card names, basics excluded. The percentage is the shared
count over the smaller of the two sets.

Nonbasic cards, lands included (Atraxa 91, Krenko 97, Talrand 97, Muldrotha 93):

| | Atraxa | Krenko | Talrand | Muldrotha |
|---|---|---|---|---|
| Atraxa | | 39 (43%) | 44 (48%) | 54 (59%) |
| Krenko | 39 (43%) | | 76 (78%) | 53 (57%) |
| Talrand | 44 (48%) | 76 (78%) | | 58 (62%) |
| Muldrotha | 54 (59%) | 53 (57%) | 58 (62%) | |

Nonland nonbasic cards, 64 in every deck:

| | Atraxa | Krenko | Talrand | Muldrotha |
|---|---|---|---|---|
| Atraxa | | 30 (47%) | 35 (55%) | 40 (63%) |
| Krenko | 30 (47%) | | 47 (73%) | 38 (59%) |
| Talrand | 35 (55%) | 47 (73%) | | 42 (66%) |
| Muldrotha | 40 (63%) | 38 (59%) | 42 (66%) | |

**Mean pairwise overlap across the six pairs: 60% of the nonland spells, 58%
counting lands.** Krenko and Talrand, mono red goblins against mono blue
instants, share 47 of their 64 nonland spells, which is 73%.

**Thirty nonland cards are in all four decks:**

Accorder's Shield, Arcane Signet, Arcum's Astrolabe, Bag of Holding, Basilisk
Collar, Blackblade Reforged, Bloodforged Battle-Axe, Bone Saw, Cathar's Shield,
Chrome Mox, Colossus Hammer, Commander's Plate, Currency Converter, Dino DNA,
Dragonfire Blade, Everflowing Chalice, Excalibur II, Fellwar Stone, Goldvein
Pick, Helm of the Gods, Jeweled Amulet, Kite Shield, Mox Amber, Mox Diamond, Mox
Jasper, Mox Opal, Paradise Mantle, Prying Blade, Sigil of Distinction,
Spidersilk Net.

**All thirty are artifacts with an empty colour identity.** Seventeen are
Equipment. Twenty six cost one mana or less. Counted from the snapshot's own
`type_line`, `color_identity` and `cmc` columns.

### The commander's theme is worse than random

Counting how many of the chosen nonbasic cards mention what the commander does,
by regex over each card's own `oracle_text` and `type_line` from the snapshot,
against the base rate of the identical regex over that commander's whole legal
pool:

| commander | theme counted | in the deck | pool base rate |
|---|---|---|---|
| Atraxa | proliferate, any counter | 11 of 91 (12%) | 15% |
| Krenko | goblin | 2 of 97 (2%) | 6% |
| Talrand | instant, sorcery, drake | 30 of 97 (31%) | 28% |
| Muldrotha | graveyard | 12 of 93 (13%) | 16% |

Three of the four decks are **less** on theme than the same number of cards
drawn at random from the same legal pool would be. Talrand's 31% against 28% is inside noise and
is inflated by the word "instant" appearing in the text of cards that are not
spellslinger cards.

The tag synergy signal fired on 31 of Atraxa's 95 entries, 38 of Krenko's 98,
38 of Talrand's 98, and **0 of Muldrotha's 96**. Muldrotha's only tag in our
table is `creature`, which `signalTags` strips as a type tag, so the deck has no
theme the ranker can see at all.

## 4. Bone Saw against Sol Ring: the direction is confirmed, the numbers are not

`generate.ts:204` and `rank.ts` both record: "an Atraxa build scored Bone Saw at
7.50 against Sol Ring at 7.34 and returned thirty pieces of nearly-free
Equipment."

The pass 2 profile was reconstructed from the generator's own exported parts:
the chosen lands taken from the finished Atraxa deck, `buildManaProfile` over
the same provisional library, `deriveDeckProfile` at the same role targets,
`rankCandidates` over the same spell pool. **The reconstruction is exact.** All
35 of the real run's role bucket picks score identically in it, to float
equality.

At `WEIGHTS.popularity` of 0.8, which is the default weight the claim names:

```
Bone Saw               score 5.60  rank 105 of 20,532
    role-gap     3.00  fills a wincon gap (0 of 3)
    castability  2.50  you could pay for this 100% of the time on turn 1
    popularity   0.10  EDHREC rank 6,734

Sol Ring               score 5.40  rank 312 of 20,532
    role-gap     3.00  fills a ramp gap (0 of 10)
    castability  2.40  you could pay for this 96% of the time on turn 1
    (no popularity signal)
```

At the shipped `EMPTY_DECK_POPULARITY` of 2.0, Bone Saw 5.76 at rank 102, Sol
Ring 5.40 at rank 421. Raising the popularity weight makes the gap wider, not
narrower.

Those are pass 2 scores, against the profile of a deck holding only the
commander. Bone Saw's score in the finished Atraxa deck is 4.57, because it was
actually taken in the flex pass, which re-ranks against the deck as it then
stands. Both numbers are real and they are measured at different moments. The
comparison with Sol Ring is the pass 2 one, because that is the pass where the
role quotas are filled and where the old note was taken.

**Verdict: the ordering is confirmed and the figures are refuted.** Bone Saw
does outrank Sol Ring, at both weights, on 23 Aug 2026. The absolute scores are
5.60 and 5.40, not 7.50 and 7.34. The 0.16 gap in the old note is now 0.20. The
"thirty pieces of nearly-free Equipment" is now 21 Equipment in the Atraxa deck
and 25 in Krenko's.

### Why Sol Ring loses: it has no popularity prior

`edhrec_rank` is the only broad evidence in this schema that a card is one people
play, and it is the only counterweight to cheap and colourless. It is missing on
most of the catalogue.

```
cards_unique                          33,032 rows
cards_unique with edhrec_rank         13,440 (40.7%)
Atraxa legal pool                     24,578 cards
   of those with edhrec_rank          10,146 (41.3%)
   with no popularity signal at all   14,432
```

Spot check, live on 23 Aug 2026:

```
Sol Ring              edhrec_rank NULL
Swords to Plowshares  edhrec_rank NULL
Rhystic Study         edhrec_rank NULL
Umezawa's Jitte       edhrec_rank NULL
Sylvok Lifestaff      edhrec_rank NULL

Command Tower         edhrec_rank 2
Arcane Signet         edhrec_rank 3
Cultivate             edhrec_rank 20
Cyclonic Rift         edhrec_rank 53
Doubling Season       edhrec_rank 190
Fountain of Renewal   edhrec_rank 6,297
Bone Saw              edhrec_rank 6,734
Candy Trail           edhrec_rank 6,789
Golden Egg            edhrec_rank 7,974
Bagel and Schmear     edhrec_rank 11,882
```

Bone Saw gets a popularity bonus. Sol Ring does not. That is not a weighting
problem, it is a hole in the data, and no amount of tuning
`EMPTY_DECK_POPULARITY` closes it. It also explains the two staples that do get
picked in every deck: Arcane Signet at rank 3 and Command Tower at rank 2 are
both ranked, and both are in all four decks.

## 5. Card page recommendations match words, not behaviour

Three cards, run through the real `CardRelated` queries live.

"Played alongside" returned **0 companions for all three cards**, because the
anon key sees no deck containing them. So on a logged out card page, the only
group backed by evidence is empty and every group shown is a similarity guess.

### The structural fault, measured

The tag group probes each of the rarest tags with
`tags @> {tag} limit 60`, with no `order by`. Postgres therefore hands back an
arbitrary 60 rows, and the shown 14 are then chosen from those 60 by summed tag
rarity, with **market price as the tie break**.

| card | probe | cards carrying it in identity | rows fetched | rows merged | distinct scores | tied at top |
|---|---|---|---|---|---|---|
| Sol Ring | fast-mana | 31 | 60 | 139 | 4 | 5 |
| | mana-rock | 310 | 60 | | | |
| | ramp | 1,968 | 60 | | | |
| Craterhoof | mass-pump | 127 | 60 | 64 | 2 | 60 |
| | finisher | 133 | 60 | | | |
| Counterspell | counterspell | 326 | 60 | 60 | 1 | 60 |

Read the last two rows. For Craterhoof Behemoth, **60 of the 64 merged rows
score exactly 11.11**, so the list you see is the 14 most expensive of an
arbitrary 60 out of 128 cards that all score identically. For Counterspell,
**all 60 rows score exactly 6.32** out of 327 blue cards carrying the tag, so
the list is purely the 14 most expensive of an arbitrary 60.

Proof that the tie is what is doing the damage. These carry the identical tags
and would score identically, and none of them appear:

```
Overrun                 ["finisher","mass-pump","sorcery","wincon"]
Pathbreaker Ibex        ["creature","finisher","mass-pump","wincon"]
End-Raze Forerunners    ["creature","etb","finisher","mass-pump","wincon"]
Triumph of the Hordes   ["finisher","mass-pump","sorcery","wincon"]

Mana Drain              ["counterspell","instant"]
Force of Will           ["counterspell","instant"]
Fierce Guardianship     ["counterspell","instant"]
Pact of Negation        ["counterspell","instant"]
Dovin's Veto            ["counterspell","instant"]
Negate                  ["counterspell","instant"]
```

### Sol Ring, tag group, 14 entries

```
Mana Vault              20.45  $93.52   {T}: Add {C}{C}{C}
Mana Crypt              20.45  $40.01   {T}: Add {C}{C}
The Enigma Jewel        20.45  $1.18    (our table stores no oracle text for this card)
Sol Talisman            20.45  $1.17    Suspend 3, then a Sol Ring
Pyramid of the Pantheon 20.45  $0.45    three activations, then taps for three
Black Lotus             13.80  $6500    sacrifice: add three of one colour
Lion's Eye Diamond      13.80  $797.61  discard hand, sacrifice: three of one colour
Jeweled Lotus           13.80  $42.02   sacrifice: three, commander only
Noble Hierarch          13.80  $10.61   green creature, taps for one
Culling the Weak        13.80  $6.98    black instant, sacrifice a creature for BBBB
Lotus Bloom             13.80  $4.21    suspend 3 Lotus
Rite of Flame           13.80  $4.11    red sorcery ritual
Heritage Druid          13.80  $3.44    tap three Elves for GGG
Master of Dark Rites    13.80  $3.10    vampire creature, restricted mana
```

Judged as a Magic player, the rule being "would a deckbuilder consider this for
the Sol Ring slot", which means a cheap artifact that produces more mana than it
cost:

- **Genuinely similar, 9 of 14 (64%):** Mana Vault, Mana Crypt, The Enigma Jewel,
  Sol Talisman, Pyramid of the Pantheon, Black Lotus, Lion's Eye Diamond,
  Jeweled Lotus, Lotus Bloom.
- **Shares a tag only, 5 of 14 (36%):** Noble Hierarch, Culling the Weak, Rite of
  Flame, Heritage Druid, Master of Dark Rites. All five are coloured spells or
  creatures with a condition attached. None of them goes in every deck.

This is the best of the three lists, and it is the one the component's own doc
comment says was fixed. Two things still wrong with it. **Three of the fourteen
are banned in Commander:** Black Lotus, Jeweled Lotus and Mana Crypt all read
`legalities->>commander = 'banned'` live, and the group applies no legality
filter. And the ranking cannot see the actual Sol Ring peers: Arcane Signet,
Fellwar Stone, Talisman of Dominance and Mind Stone all carry
`mana-rock, ramp` but not `fast-mana`, so they score 10.64 against the 13.80 of
a green mana dork and never reach the shown fourteen.

### Craterhoof Behemoth, three groups, 42 entries

**"Other Beasts", 14 entries, basis "type line contains Beast, ranked by market
price".** Genuinely similar to Craterhoof, meaning a green creature that ends the
game by pumping the whole board: **1 of 14 (7%)**, Blossoming Bogbeast, whose
text is "creatures you control gain trample and get +X/+X". The other thirteen
are Grave Sifter, Bloated Contaminator, Fangren Firstborn, Elder Gargaroth,
Hystrodon, Chancellor of the Tangle, Caller of the Pack, Hauntwoods Shrieker,
Erithizon, Gemrazer, Herd Baloth, Armored Scrapgorger and Contagious Vorrac.
They share the word Beast and nothing else.

**"Shares Haste", 14 entries.** Genuinely similar: **1 of 14 (7%)**, Decimator of
the Provinces, whose cast trigger gives your creatures +2/+2 and trample and
haste. The list also contains **Eldrazi Guacamole Tightrope, whose type line is
`Stickers`**, at $5.49, second from the top because it is ranked by price. That
is not a card anyone puts in a deck.

**"Also tagged mass-pump, finisher", 14 entries, all scoring 11.11.** Genuinely
similar: **4 of 14 (29%)**.

- Genuine: Finale of Devastation (X of 10 or more gives +X/+X and haste to all),
  Ezuri Renegade Leader (an Overrun on a stick for Elves), Beastmaster Ascension
  (+5/+5 to all creatures), Garruk Wildspeaker (whose ultimate is Overrun).
- Tag only: Chronicle of Victory, Casal Lurkwood Pathfinder (our table stores no
  oracle text for it), Eldrazi Monument, Joraga Warcaller, Banner of Kinship,
  Forsaken Monument, **Blossoming Tortoise** (a lands matter mill creature),
  Greatbow Doyen, Caged Sun, Glorious Sunrise.

**Craterhoof, across all three groups: 6 of 42 genuinely similar, 14%.**

### Counterspell, tag group, 14 entries, all scoring 6.32

Judged twice, because the two readings give very different answers and the gap
between them is the whole problem.

- **Contains a counter effect somewhere on the card: 12 of 14 (86%).** Only
  Diffusion Sliver and Frost Titan, whose abilities only counter spells that
  target them, fall outside even that.
- **A card a deckbuilder would consider for the Counterspell slot, meaning an
  instant cast to counter a target spell: 7 of 14 (50%).** Disrupting Shoal,
  Flare of Denial, An Offer You Can't Refuse, Access Denied, Familiar's Ruse,
  Deprive, Counterbore.
- **Not substitutes: 7 of 14 (50%).** Declaration of Naught (an enchantment
  locked to one named card), Glen Elendra Archmage (a 4 mana creature),
  Consign to Memory (counters only triggered abilities and colourless spells),
  Counterbalance (an enchantment that counters at random), Diffusion Sliver,
  Frost Titan, Intervene (counters only spells that target a creature).

The list looks plausible on the page. Every entry says the word counter
somewhere. Not one of Counterspell's actual peers is in it.

---

## Summary of the ratios

| list | entries | genuinely similar | share a tag only |
|---|---|---|---|
| Sol Ring, tags | 14 | 9 (64%) | 5 (36%) |
| Craterhoof, Beast subtype | 14 | 1 (7%) | 13 (93%) |
| Craterhoof, Haste keyword | 14 | 1 (7%) | 13 (93%) |
| Craterhoof, tags | 14 | 4 (29%) | 10 (71%) |
| Counterspell, tags | 14 | 7 (50%) | 7 (50%) |
| **all five lists** | **70** | **22 (31%)** | **48 (69%)** |

Every "genuinely similar" call above is a judgement made against the card's own
oracle text, which the harness printed alongside each entry. The counts under
"the structural fault, measured" are not judgements. They are row counts and
score ties read out of the database.

---

## What was measured and what was not

Measured: deck composition, deck overlap, the score of every card in every deck,
the full pool ranking at two popularity weights, `edhrec_rank` coverage,
tag probe sizes and score ties, and the fourteen entries each recommendation
group returns.

Not measured: whether the four decks would win a game against each other,
whether the power scores of 6.0 to 6.6 mean anything, and whether
`src/lib/cards/xmage/` can supply what the tags cannot. The last of those is the
next question and nothing here answers it.

---
---

# Part two: the fix, and what it measured

Written 23 Aug 2026, same day, same snapshot, same generator entry point.

Part one ended by saying the next question was whether `src/lib/cards/xmage/`
can supply what the tags cannot. It can. This part is the change and the
numbers it produced.

**One measurement script, `scratch/engine-picks-after.mjs`, produced every
figure below.** It imports two generators into one process: `generateDeck` from
`src/engine/build/generate.ts` as it now stands, and `generateDeckBefore` from
`scratch/engine-before/`, which is `git archive HEAD src/engine`: the engine
exactly as it was before this session, not a reconstruction. Same pool, same
call arguments, same 2026-08-19 catalogue snapshot, same `edhrec_rank` patch.
One input differs and it is the change under test.

---

## The one-line answer

Mean pairwise overlap on nonland spells across the four decks fell from
**60.4% to 8.3%**. The thirty cards that were in all four decks are now one.

---

## What changed, in four pieces

### 1. Cards now carry what they DO, not words about what they do

`CandidateCard.facets` is a new optional field: `eff:add-mana`, `tok:goblin`,
`cares:type:instant`, `ctr:+1/+1`, `scope:all`, `rec:full`. Each one is read out
of a card's structured ability record, never off its oracle text.

The producer is `src/lib/deck/recommend/behaviour.ts`. It calls
`compileCardAbilities` from `src/lib/cards/abilities/` and then `xmageSwapFor`
from `src/lib/cards/xmage/lowered.ts`, so which of the two sources speaks for a
card is decided by that port's own precedence rule rather than by a second copy
of it. The engine itself declares the vocabulary
(`src/engine/knowledge/behaviour.ts`) and reads the values, because
`engine-parity.test.ts` forbids anything under `src/engine/` from importing
outside it and that rule is what makes the tree mirrorable into an edge function.

Where the facets came from, over all 31,833 commander-legal cards:

| source | cards | share |
|---|---:|---:|
| oracle-text compiler | 24,244 | 76.2% |
| ported XMage record | **0** | 0.0% |
| no record at all, falls back to tags | 7,589 | 23.8% |

**The XMage table contributed nothing, and the zero is worth stating plainly.**
`lowered.generated.ts` holds 6,362 cards and 6,302 of them appear in this
catalogue. The swap was refused for every single one, with the same reason each
time: *"compiler understands this card completely"*. Counted directly, the
31,833 cards split into 9,550 the compiler covers fully and 22,283 it does not,
and the record table holds **none** of the 22,283. The two sources are disjoint
in exactly the wrong place, so the precedence rule never reaches the record. The
call is still made, because the day either side's coverage moves the record
starts paying with no code change, but nothing in this report is owed to it.

Cost: 3.6 seconds to read all 31,833 cards, 0.11 ms each.

### 2. The record decides, unless it admits it did not read the card

Three answers in a fixed order, in `cardServesRole`:

1. **The record says so.** Sol Ring's record contains `add-mana`, so Sol Ring is
   ramp. Nothing else is consulted.
2. **The record read the whole card and did not say so** (`rec:full`). That is a
   positive no. Bone Saw's record is a static +1/+0 and an `attach`, read
   completely, so Bone Saw is not a win condition and its `voltron` tag does not
   get a vote.
3. **The record is missing or incomplete.** Only then do the tags speak.

Step 2 is the point, and step 3 is why step 2 is safe. The first draft trusted
records absolutely and it lost Craterhoof Behemoth: the compiler reads its haste
and its enters trigger and *refuses* "creatures you control get +X/+X", which is
the entire card. `rec:partial` is what tells the engine that silence there means
"not read" rather than "does not do that", so Craterhoof keeps its `finisher`
tag. Bone Saw compiles to `rec:full`, so its silence is evidence.

`voltron` was also removed from `ROLE_TAGS.wincon`, which is what made every
Equipment in the catalogue a win condition.

A second wrong rule was caught by measurement and deleted rather than narrowed.
The first draft also read a mass pump, `eff:pump` together with `scope:all`,
as a win condition. It was wrong in both directions at once:

- **Adventuring Gear, Inventor's Goggles and Sai of the Shinobi qualified.**
  Their "equipped creature gets +N/+N" compiles to a pump whose selector is
  `all` with a creature filter, so three pieces of Equipment became the win
  conditions of the Muldrotha deck: the original bug, rebuilt out of facets.
- **Craterhoof Behemoth did not qualify**, for the reason above.

A rule that admits the Equipment and rejects the Craterhoof is not a narrower
version of the right rule. It is gone.

### 3. There is a creature role, and a style that sets it

`Role` gained `'creature'`. It is decided by the type line and never by a tag or
a facet, and `ROLE_TAGS.creature` is empty and must stay empty.

The number is declared policy, in `CREATURE_TARGETS`:

| style | creatures | why |
|---|---:|---|
| `creatures` | 32 | Half the 64 nonland slots. Inside the 30 to 35 a creature precon runs. This is what "creature mode" means. |
| `balanced` | 24 | Just over a third, leaving the five role quotas free to take the best card rather than the best creature. |
| `spells` | 12 | Enough bodies to block with and to carry a win. |

It is a **floor across the whole deck, not a sixth quota**. A mana dork taken as
ramp is still a creature, and making it choose between the two would either lose
the ramp slot or count the card twice. `generateDeck` counts what the earlier
passes already picked and tops up only the difference.

`GenerateDeckInput.style` carries the choice. Before this, `pipeline.ts` passed
the user's `archetype` to the language model in `planFromShortlist` and never
to `generateDeck` at all, which is precisely why creature mode had nowhere to
express itself.

### 4. The generator reads the commander

`planForCommander` turns a commander's own facets into a list of WANTS, and
`rank.ts` scores every candidate against them as a new `commander-fit` signal at
weight 2.2: above tag synergy at 2.0, below castability at 2.5, below role gap
at 3.0. Declared, with no empirical basis, like every weight beside it.

What it read off the four commanders, printed by the script:

| commander | facets read | tribe | wants |
|---|---|---|---|
| Atraxa | `eff:proliferate` `trig:step` `rec:partial` plus four keywords | none | `eff:proliferate` 1.00, `eff:add-counters` 0.80, `eff:player-counter` 0.60 |
| Krenko | `eff:create-token` `tok:goblin` `sub:goblin` `rec:full` | **goblin** | `cares:sub:goblin` 1.00, `sub:goblin` 1.00, `tok:goblin` 1.00, `eff:create-token` 0.90 |
| Talrand | `cares:type:instant` `cares:type:sorcery` `trig:cast` `tok:drake` `rec:full` | none | `type:instant` 0.90, `type:sorcery` 0.90, `eff:create-token` 0.90 |
| Muldrotha | none | none | **none** |

The tribe rule is strict on purpose: the subtype has to appear **both** on the
commander's type line **and** inside one of its abilities. Krenko is a Goblin
Warrior whose ability counts Goblins, so the tribe is Goblin. Talrand is a
Merfolk Wizard whose ability makes Drakes; neither appears in both places, so
Talrand has no tribe, which is correct, because a Talrand deck is about
instants and sorceries and not about Merfolk.

**Muldrotha is the honest failure and it is not hidden.** The compiler returns
`coverage: 'manual'` and zero abilities for "you may play a land and cast a
permanent spell of each permanent type from your graveyard", the XMage table
holds no record for that oracle id, and the card's only tag in the database is
`creature`. So Muldrotha gets no plan at all, `evidence.plan` comes back null,
and the build note says so in words: *"no ability record for Muldrotha, the
Gravetide, so this deck was picked on tags alone"*. One commander in four.

---

## The cheap and colourless tiebreak had two halves, not one

Part one blamed `edhrec_rank`. That was half of it.

**Half one, popularity.** `EMPTY_DECK_POPULARITY` was 2.0, put there because
against a commander-only profile every role was equally short and popularity was
the only thing left to separate cards by. With roles now coming from records
that reason is gone, and the column was actively harmful: it is populated on
only 13,440 of 33,032 rows and is NULL for Sol Ring, Swords to Plowshares and
Rhystic Study while Bone Saw carries rank 6,734. It is back to the optimiser's
0.8.

**Half two, castability, which part one missed.** `WEIGHTS.playability` times a
percentage looks neutral and is not. A zero-mana colourless artifact is castable
100% of the time by construction, so it collected the full 2.5 for free while a
real two-colour four-drop collected about 2.0. That is a flat half-point bonus
for costing nothing and asking for no colours, applied to every card in the
pool, on every pass.

The evidence was the Muldrotha deck built with only half one fixed: 61 of its 64
nonland cards cost one mana or less, 51 were colourless, and it was castable 94%
of the time on average. A deck that had optimised for being payable.

The signal now saturates at `CASTABILITY_COMFORT_PCT = 75`. Full credit at or
above it, falling away linearly below it toward the `cannot-cast` gate at 25.
"Can this deck reliably pay for this card" is a threshold question, and
Ornithopter being more payable than Birds of Paradise is not a fact about which
is the better card. That single change took Muldrotha from 42 artifacts to 22
and from 61 cards at mana value 1 or less to 37.

### Sol Ring against Bone Saw, on the Atraxa seed profile

| card | before | rank before | after | rank after |
|---|---:|---:|---:|---:|
| **Sol Ring** | 5.40 | 258 of 2,643 | **5.50** | **437** |
| **Bone Saw** | **5.76** | **60** | 2.60 | 1,808 |
| Basilisk Collar | 6.30 | 11 | 2.86 | 1,761 |

Before, Bone Saw scored `role-gap 3.00, castability 2.50, popularity 0.26`.
After it scores `castability 2.50, popularity 0.10`. The role-gap term is gone
entirely, because its record is complete and contains no role.

Sol Ring beats Bone Saw. **Sol Ring is still not in the Atraxa deck**, and the
reason is a data defect this change does not touch: `edhrec_rank` is NULL for
Sol Ring, so the popularity signal never fires for it at all. Scored with the
rank set to 1, the best any card can have, the same card on the same profile
scores **6.30**. The 0.80 it is missing is the whole of the gap between rank 437
and the top of the ramp bucket. **Populating `edhrec_rank` is the highest-value
fix left and it is a sync job, not an engine job.**

---

## The test: overlap between the four decks

Nonland spells only, 64 per deck, `balanced` style for all four so the styles
cannot be what separates them.

| pair | before | after |
|---|---:|---:|
| Atraxa / Krenko | 30/64 47% | 1/64 **2%** |
| Atraxa / Talrand | 35/64 55% | 2/64 **3%** |
| Atraxa / Muldrotha | 40/64 63% | 5/64 **8%** |
| Krenko / Talrand | 47/64 **73%** | 16/64 **25%** |
| Krenko / Muldrotha | 38/64 59% | 3/64 **5%** |
| Talrand / Muldrotha | 42/64 66% | 5/64 **8%** |
| **mean** | **60.4%** | **8.3%** |

Cards in all four decks: **30 before, 1 after**. The one is Hangarback Walker, a
colourless artifact creature that makes +1/+1 counters and tokens and is
genuinely on plan for three of the four.

The thirty before were Accorder's Shield, Arcane Signet, Arcum's Astrolabe, Bag
of Holding, Basilisk Collar, Blackblade Reforged, Bloodforged Battle-Axe, Bone
Saw, Cathar's Shield, Chrome Mox, Colossus Hammer, Commander's Plate, Currency
Converter, Dino DNA, Dragonfire Blade, Everflowing Chalice, Excalibur II,
Fellwar Stone, Goldvein Pick, Helm of the Gods, Jeweled Amulet, Kite Shield, Mox
Amber, Mox Diamond, Mox Jasper, Mox Opal, Paradise Mantle, Prying Blade, Sigil
of Distinction and Spidersilk Net. Seventeen of them are Equipment.

Krenko against Talrand is the pair that moved least, 73% to 25%. Both commanders
make tokens, so both plans want `eff:create-token` and the cards that satisfy it
are shared. That is a real similarity rather than a leftover.

---

## Composition of the 99, nonland cards only

| commander | creatures | artifacts | equipment | colourless | mana value 1 or less |
|---|---|---|---|---|---|
| Atraxa | 7 to **34** | 49 to 31 | 21 to **1** | 41 to 32 | 44 to 24 |
| Krenko | 3 to **46** | 53 to **18** | 25 to **2** | 54 to **17** | 45 to 22 |
| Talrand | 4 to **24** | 53 to 28 | 23 to **2** | 54 to 31 | 42 to 18 |
| Muldrotha | 7 to **27** | 42 to 22 | 17 to **2** | 41 to 20 | 45 to 37 |

Equipment across the four decks: **86 cards before, 7 after.**

Win condition slots, which were twelve pieces of Equipment with Basilisk Collar
in all four:

| commander | before | after |
|---|---|---|
| Atraxa | Excalibur II, Basilisk Collar, Sylvok Lifestaff | Blightbelly Rat, Bloated Contaminator, Core Prowler |
| Krenko | Bloodforged Battle-Axe, Basilisk Collar, Ceremonial Knife | Goblin Bushwhacker, Quest for the Goblin Lord, Chrome Dome |
| Talrand | Bloodforged Battle-Axe, Glamdring, Basilisk Collar | Flusterstorm, Chrome Dome, Bring the Ending |
| Muldrotha | Basilisk Collar, Commander's Plate, Colossus Hammer | Blightbelly Rat, Blighted Agent, Favorable Winds |

Zero Equipment in twelve win-condition slots, down from twelve. Blighted Agent
and Blightbelly Rat qualify from the record (`eff:poison`, read off infect);
Goblin Bushwhacker, Quest for the Goblin Lord and Favorable Winds qualify
through the tag fallback on cards the compiler did not finish, which is what the
fallback is for.

---

## On-theme rate

Same regexes as part one, measured against the same regex run over the whole
legal pool as a base rate.

| commander | base rate | before | after |
|---|---:|---:|---:|
| Atraxa (proliferate / counters) | 15% | 10/64 16% | **64/64 100%** |
| Krenko (goblins) | 6% | 1/64 2% | **34/64 53%** |
| Talrand (instants / sorceries / drakes) | 28% | 27/64 42% | **38/64 59%** |
| Muldrotha (graveyard) | 16% | 10/64 16% | 7/64 **11%** |

Three of four go from at or below the base rate to far above it. **Muldrotha
falls below the base rate**, which is what a commander with no plan should look
like: nothing steers it, so it lands wherever the role quotas and the curve put
it. The number is in the report rather than out of it.

---

## Does the mode change the deck

Creature count at each style, same commander, same pool:

| commander | `spells` (floor 12) | `balanced` (floor 24) | `creatures` (floor 32) |
|---|---:|---:|---:|
| Atraxa | 33 | 34 | 37 |
| Krenko | 46 | 46 | 46 |
| Talrand | **12** | **24** | **32** |
| Muldrotha | 20 | 27 | 33 |

Talrand and Muldrotha do what the label says. **Atraxa and Krenko barely move,
and that is the design rather than a bug:** the number is a FLOOR, and for a
commander whose best cards are creatures the floor is never the binding
constraint. Krenko's plan wants Goblins, every Goblin is a creature, so a Krenko
deck is 46 creatures whatever style is asked for. Asking for `spells` cannot
make a Krenko deck stop being creatures without making it stop being a Krenko
deck.

If the owner wants `spells` to be a ceiling as well as a floor, that is a second
number and a deliberate decision, not an oversight in this one.

---

## How much of each build was behaviour, and how much was still tags

| commander | chosen spells with a record | pool with a record | plan |
|---|---|---|---|
| Atraxa | 64/64 (100%) | 18,725/24,577 (76%) | 3 wants |
| Krenko | 58/64 (91%) | 5,651/7,495 (75%) | 6 wants |
| Talrand | 54/64 (84%) | 5,515/7,400 (75%) | 7 wants |
| Muldrotha | 56/64 (88%) | 13,726/18,170 (76%) | **none, tags only** |

Roughly a quarter of every pool has no ability record and falls back to tags,
and between 0 and 16% of each finished deck does. `GeneratedDeck.evidence`
carries these numbers out of the generator so a caller can print them rather
than assume them, and `generateDeck` puts them in `notes` as a sentence.

---

## A PLAYER CANNOT REACH ANY OF THIS YET

This is the part that must not be read past. `CLAUDE.md` has a section headed
"Green tests do not mean a player can reach it", and this change is squarely in
its territory.

307 engine tests pass. 2,365 pass across the repo. Every number above is real.
**And nothing a user can press produces any of it**, because the only caller of
`generateDeck` is `supabase/functions/ai-deck-builder-v2/pipeline.ts`, and:

1. **Pool rows carry no `facets`.** `catalog.ts` selects the columns the pool
   needs and `facets` is not among them, because the column does not exist. With
   no facets every card falls to the tag path and the build is the old build,
   minus `voltron` and the two weight changes.
2. **`style` is never passed.** `pipeline.ts` still hands the user's `archetype`
   to `planFromShortlist` and nothing to `generateDeck`.

Both files are outside this pass's ownership, so both are left. What is needed,
in order of value:

**A. Add a `facets` column to `cards` and populate it in the sync.** This is the
right fix and it is not large. Facets are a pure function of a card row, exactly
as `tags` already are through `derive_card_tags`, and
`src/lib/deck/recommend/behaviour.ts` is that function. Storing them means the
edge function adds one column to its select and passes it through: no vendoring,
no 2.6 MB table in the bundle, no oracle text for 30,000 rows over the wire, and
no 3.6 seconds of compile time per build. The browser gets it for free too.

**B. Pass the style.** `pipeline.ts` step 3 and step 5 both need
`style: request.archetype`, or a dedicated field, since `archetype` today
carries values like `tokens` and `aristocrats` that are not styles.
`creatureTargetFor` already falls back to `balanced` and reports
`matchedStyle: false` for an unrecognised name, so passing the archetype through
is safe and self-reporting from day one.

**C. One line in a file this pass may not touch, since resolved.** Adding
`creature` to `Role` broke the one exhaustive `Record<Role, string>` in the
app:

```
src/components/deck/DeckAddPanel.tsx(86,7): error TS2741:
  Property 'creature' is missing in type '{ ramp: ...; land: string; }'
  but required in type 'Record<Role, string>'
```

`src/components/deck/**` belongs to another workflow, so the line was described
here rather than applied. That workflow added it during this pass, along with a
comment explaining that the map is exhaustive on purpose so the file stops
compiling rather than drawing a tile with no name on it. **`tsc --noEmit -p
tsconfig.app.json` now exits 0 and all 2,365 tests pass.** Nothing is
outstanding here; it is recorded because it is the shape of breakage adding a
role causes, and the next role added will cause it again.

---

## What was measured and what was not

Measured: facet source counts over the whole catalogue, the plan read off each
of the four commanders, deck composition before and after, all six pairwise
overlaps, the cards common to all four decks, on-theme rate against pool base
rate, the score and full-pool rank of Sol Ring, Bone Saw, Basilisk Collar and
Swords to Plowshares at both weights, the Sol Ring counterfactual at rank 1,
creature counts at all three styles, and record coverage per pool and per deck.

Not measured: whether these decks win games, whether the power score moved,
whether 2.2 is the right weight for `commander-fit` against any weight other
than the ones it sits beside, what any of this does for the other commanders in
the format, and whether the card page recommendations improve. That is part one
section 5 and this pass did not touch `CardRelated.tsx`.

Not fixed: `edhrec_rank` is NULL on Sol Ring and on 19,592 other `cards_unique`
rows, and it costs Sol Ring 0.80 points and a place in the deck.

---

# Part three: "similar" means does a similar thing

Owner, 2026-08-23: *"Card pages have recommendations too - looks great, but
results dont seem right"*, and *"similar means does a similar thing"*.

Part one measured that page and found **22 of 70 entries genuinely similar,
31%**. Part two fixed the deck generator and said in as many words that it had
not touched this. This part does.

## The one-line answer

The card page's similarity group now reads both cards' ability records and ranks
on shared effects **and their arguments**. Across the same five lists for the
same three cards, genuinely similar entries went from **22 of 70 (31%) to 37 of
70 (53%)**; on the three lists actually replaced, from **20 of 42 (48%) to 35 of
42 (83%)**. Counterspell went from 7 of 14 to 14 of 14.

## How this was measured

`scratch/related-after.mjs` runs BEFORE and AFTER in one process against the
live database on the anon key, which is the transport and the row-level security
an anonymous visitor to `/cards/:id` gets.

- BEFORE is `scratch/related-measure.mjs` verbatim: the shipped queries, `limit
  60` per tag probe, `sharedTagScore` ordering, market price tie break. It is
  re-run rather than quoted, so both columns see the same database on the same
  day.
- AFTER imports the real `rankBySameBehaviour` from
  `src/lib/deck/recommend/similar.ts`, which is the function the component
  calls. Nothing is re-implemented in the harness.

Output: `scratch/related-after.txt`, with every entry's oracle text printed
beside it so each judgement is made against the card and not against its name.
`scratch/related-keyword-after.mjs` does the same for the keyword and subtype
groups; `scratch/xmage-source-census.mjs` re-counts who speaks for each card
over the 31,833-row 2026-08-19 snapshot.

**Every "genuinely similar" call below uses part one's rule for that card,
unchanged.** Moving the yardstick to move the number would be the same
fabrication as inventing the number.

---

## What changed, in four pieces

### 1. The pool arrives whole

The measured fault in part one was not the ranking, it was the sample. Each
probe ran `tags @> {tag} limit 60` with no `order by`, so Postgres returned an
arbitrary sixty rows and the fourteen shown were the most expensive of those.
For Counterspell that was sixty rows out of 326, every one scoring an identical
6.32.

The behaviour group counts each probe first, with one `count=exact` head
request, then either fetches **all** of it or **skips it and names it**.

| card | probe | cards | fetched |
|---|---|---|---|
| Sol Ring | `fast-mana` | 31 | 31 |
| | `mana-rock` | 310 | 310 |
| | `ramp` | 1,968 | skipped, over the 400 cap |
| Craterhoof | `mass-pump` | 127 | 127 |
| | `finisher` | 133 | 133 |
| Counterspell | `counterspell` | 326 | 326 |

Merged pools: **336, 133 and 326 rows scored**, against 139, 64 and 60 before.
The count requests ride `idx_cards_tags` and answered in 65 to 568 ms.

The tag is recall only now. It says which conversation to look in; it no longer
decides who wins it.

### 2. The ranking is a weighted Jaccard over facets

`behaviourSimilarity`, in `src/engine/knowledge/behaviour.ts`. Shared facet
weight divided by union facet weight, with the verb worth most and the card's
shape worth least:

```
eff:        1.0    the verb
cares:*     0.8    the verb's arguments, the port's whole contribution
scope:      0.8
ctr: tok:   0.7
mana:       0.6    what it produces
acost:      0.6    what it costs to use
trig:       0.4
kw: sub:    0.3
type:       0.25
rec:        0      metadata, read separately as `basis`
```

Union, not overlap, and that is the difference from tag matching. A candidate
that does the subject's job **and four other jobs** scores below one that does
the subject's job and stops. Counterspell and Mana Drain both read
`eff:counter type:instant`. Frost Titan reads
`eff:tap sub:giant trig:attacks trig:enters type:creature` and shares nothing.
Under `sharedTagScore` the two were the same card at 6.32.

### 3. Two arguments the producer was throwing away

**`acost:`, what an activated ability costs in mana.** The producer read the
effect and discarded the cost, which is the same mistake the pre-port XMage
extraction made with constructor arguments. Sol Ring is `{T}: Add {C}{C}` and a
Dimir Signet is `{1}, {T}: Add {U}{B}`; every other facet is identical. Measured
on 2026-08-23 without this facet, the Sol Ring page returned **ten Signets at a
perfect 1.000** and pushed Mana Crypt off the list entirely. 5,418 of 31,833
cards carry an `acost:` facet.

**Magnitudes now compare by distance, not equality.** `mana:` and `acost:` are
numbers. Under set equality `mana:3` shares nothing with `mana:2`, and that
dropped **Mana Vault** out of Sol Ring's list on the strength of adding one mana
too many. They now score `1 / (1 + distance)` of the axis, so a gap of one costs
half. `mana:` is read at its maximum and `acost:` at its minimum, because a card
is described by the biggest thing it produces and the cheapest way to use it.

### 4. Doing the same thing for more mana is not doing the same thing

The facet score is multiplied by a cost factor, and it is **one-sided**: a
candidate cheaper than the subject is not penalised at all, only a dearer one
is. A gap of two mana halves the score.

Not invented here. `src/lib/cards/xmage/compare.ts`, the port's own comparison,
puts `manaValue` and `pipCount` first and grades them `lowerIsBetter`; its doc
comment says an optimiser without them "cannot tell Wrath of God from Damnation
apart at all". The card page's second section already says the same thing out
loud: "a mana value within one".

It is also the only thing that puts Mana Crypt above a Signet. On facets alone
the Signet wins 0.878 to 0.860, because Mana Crypt's upkeep coin flip is a
`trig:step` Sol Ring does not have and Jaccard charges for it. Mana value
settles it. That split is pinned by a test in each file so it stays visible
instead of being rediscovered.

---

## What a card with no record gets

7,565 of 31,833 commander-legal cards (23.8%) compile to no ability at all, and
some of them are the answer: **Arcane Signet and Fellwar Stone** are two of the
cards a Sol Ring list most needs and the compiler reads neither.

Three answers in a fixed order, the same order `cardServesRole` already runs on:

1. **The records match.** Ranked on behaviour. Tile reads "Also counters a
   spell".
2. **Both records are complete and share nothing.** The card is **dropped, not
   demoted**. That is a positive no and the tags do not get to argue with it.
3. **Either record is missing or short.** The card is kept, ranked on tags,
   sorted below every record match, and labelled. Two different silences, told
   apart: "No ability record. Tagged counterspell" for Declaration of Naught,
   which compiled to nothing, and "Record is incomplete. Tagged counterspell"
   for Frost Titan, which compiled partly.

The group heading states the census: *"14 of the 14 shown were decided by a
record"*, or *"8 of the 14 shown were decided by a record, 6 by tags because we
hold no record for them"*.

A subject the compiler cannot read at all gets **no behaviour group**. The old
tag group runs instead, and its heading now says why: *"We hold no ability
record for Rite of Flame, so this is matched on words … A tag cannot tell two
cards that carry it apart, so read this as a starting point rather than an
answer."*

---

## The lists

### Sol Ring: 9 of 14 to 12 of 14

Part one's rule, unchanged: *would a deckbuilder consider this for the Sol Ring
slot, which means a cheap artifact that produces more mana than it cost.* Bold
is an entry that fails it.

**Before**, tag rarity then market price:
Mana Vault · Mana Crypt · The Enigma Jewel · Sol Talisman · Pyramid of the
Pantheon · Black Lotus · Lion's Eye Diamond · Jeweled Lotus ·
**Noble Hierarch** · **Culling the Weak** · Lotus Bloom · **Rite of Flame** ·
**Heritage Druid** · **Master of Dark Rites**

**After**, shared behaviour then cost:
Sol Talisman · **Springleaf Drum** · **Moonsnare Prototype** · Black Lotus ·
Mox Jet · Mox Pearl · Mox Emerald · Mox Diamond · Jeweled Lotus · Mox Tantalite
· Lotus Bloom · Mox Sapphire · Mox Ruby · Mana Crypt

Before: five coloured spells and creatures with a condition attached. After: two
artifacts that add one mana and need a creature or an artifact tapped to do it.

**9 of 14 (64%) → 12 of 14 (86%).**

Three honest notes on this list.

- **Mana Vault is still missing**, at rank 15 with 0.754. It adds three mana
  where Sol Ring adds two, and half an axis is what that costs.
- **Nine of the fourteen are Moxen**, which is repetitive even though every one
  of them is a right answer. A diversity rule is a real idea with no measurement
  behind it, so there is not one.
- **Eight of the fourteen are banned in Commander**, against three of fourteen
  before. See the next section; this got worse, not better, and it is marked
  rather than hidden.

### Counterspell: 7 of 14 to 14 of 14

Part one's rule: *a card a deckbuilder would consider for the Counterspell slot,
meaning an instant cast to counter a target spell.*

**Before:** **Declaration of Naught** · Disrupting Shoal ·
**Glen Elendra Archmage** · **Consign to Memory** · Flare of Denial ·
**Counterbalance** · An Offer You Can't Refuse · **Diffusion Sliver** ·
Access Denied · **Frost Titan** · **Intervene** · Familiar's Ruse · Deprive ·
Counterbore

**After:** Mana Drain · Delay · Arcane Denial · Memory Lapse · Familiar's Ruse ·
Deprive · Disruption Protocol · Wild Unraveling · Abjure · Pact of Negation ·
Flare of Denial · Mana Sculpt · Forbid · Spell Crumple

**7 of 14 (50%) → 14 of 14 (100%).** Every entry after is an instant whose text
contains "Counter target spell". Mana Drain and Pact of Negation, named in part
one as cards carrying the identical tags that never appeared, are on it. The
seven that were there because the word `counterspell` sat in a tag array are all
gone: Frost Titan and Diffusion Sliver counter only spells that target them,
Counterbalance counters at random, Declaration of Naught is an enchantment
locked to one named card.

This is the clean case, and it is clean because Counterspell is one clause the
compiler reads end to end.

### Craterhoof Behemoth, tag group: 4 of 14 to 9 of 14

Part one's rule: *a green card that ends the game by pumping the whole board.*

Craterhoof is the hard case and stays hard. Its record is
`kw:haste sub:beast trig:enters type:creature rec:partial`: the compiler reads
the haste and the enters trigger and refuses "creatures you control gain trample
and get +X/+X", which is the entire card. So its own facets cannot find Overrun,
and 6 of the 14 entries below are tag entries wearing a label.

**Before**, all scoring 11.11, ordered by price:
Finale of Devastation · **Chronicle of Victory** · **Casal, Lurkwood
Pathfinder** · Ezuri, Renegade Leader · **Eldrazi Monument** ·
**Joraga Warcaller** · **Banner of Kinship** · **Forsaken Monument** ·
**Blossoming Tortoise** · Beastmaster Ascension · **Greatbow Doyen** ·
**Caged Sun** · Garruk Wildspeaker · **Glorious Sunrise**

**After:**
Centaur Chieftain · **Prismabasher** · **Ruxa, Patient Professor** ·
Blossoming Bogbeast · End-Raze Forerunners · **Ichorplate Golem** ·
**Glacier Godmaw** · Decimator of the Provinces · Kamahl, Heart of Krosa ·
Vitalizing Wind · **Kozilek, the Broken Reality** · Preposterous Proportions ·
Nissa, Ascended Animist · Overwhelm

**4 of 14 (29%) → 9 of 14 (64%).** Judgement calls made explicit, because this
list has the most of them:

- Centaur Chieftain is counted **in**, and it is the closest call on the page.
  Its threshold ETB is Craterhoof's template exactly, whole board and trample and
  until end of turn, at +1/+1, which does not end a game on its own. Part one
  counted Blossoming Bogbeast in at a comparable magnitude, so this follows it.
  A reader who disagrees should read the ratio as 8 of 14.
- Prismabasher is counted **out**. "Up to X target creatures you control get
  +X/+X" is a targeted pump, not the whole board, and part one's rule says the
  whole board.
- Nissa, Ascended Animist is counted **in**, on exactly the ground part one
  counted Garruk Wildspeaker in: its ultimate is an Overrun.
- Blossoming Bogbeast, End-Raze Forerunners and Decimator of the Provinces were
  each already judged genuine in part one, in the subtype and keyword lists.
- Finale of Devastation was judged genuine in part one and is **not** on the
  after list. It has no ability record, its tag score is matched by every other
  tag entry, and the tie break is now mana value: it is 6 mana clear of
  Craterhoof.

Two separate things did this work and only one of them is the record. **Eight
entries came from behaviour**: `trig:enters` with `type:creature` picks the
enters-and-pumps shape out of the pool, which is why Centaur Chieftain, End-Raze
Forerunners and Decimator of the Provinces are there. **Six came from tags**,
and they are still better than before, because the pool is 133 rows instead of
an arbitrary 60 and **the tie break is mana value rather than market price**.
Price is a fact about the market; mana value is a fact about the card. That one
swap is what replaced Eldrazi Monument, Caged Sun and Banner of Kinship with
Kamahl, Vitalizing Wind and Overwhelm.

### Craterhoof, Beast subtype: 1 of 14 to 1 of 14

Unchanged, measured. Blossoming Bogbeast is still the only entry that pumps a
board.

### Craterhoof, Haste keyword: 1 of 14 to 1 of 14

One real defect fixed, and it did not move the ratio. Part one: *"the list also
contains Eldrazi Guacamole Tightrope, whose type line is `Stickers`, at $5.49,
second from the top because it is ranked by price"*. The subtype and keyword
groups now drop rows whose type line names no card type at all. Measured by
`scratch/related-keyword-after.mjs`:

```
DROPPED: Eldrazi Guacamole Tightrope [Stickers]
ADDED:   Faerie Aerie [Artifact — Contraption]
```

A Contraption is not a card anyone puts in a deck either, so one non-card left
and another took the empty slot. **The ratio does not move and the group is not
fixed.**

Worth recording because it kills the obvious alternative: a legality filter
would NOT have caught the Stickers card. `Eldrazi Guacamole Tightrope` reads
`legalities->>commander = 'legal'` in our own table, while `Faerie Aerie` reads
`not_legal` in every format we store. Two different defects, and the type-line
rule is the one that catches the first.

---

## Summary of the ratios

| list | entries | before | after |
|---|---|---|---|
| Sol Ring, tags → does the same thing | 14 | 9 (64%) | **12 (86%)** |
| Craterhoof, Beast subtype | 14 | 1 (7%) | 1 (7%) |
| Craterhoof, Haste keyword | 14 | 1 (7%) | 1 (7%) |
| Craterhoof, tags → does the same thing | 14 | 4 (29%) | **9 (64%)** |
| Counterspell, tags → does the same thing | 14 | 7 (50%) | **14 (100%)** |
| **all five lists** | **70** | **22 (31%)** | **37 (53%)** |
| the three replaced lists only | 42 | 20 (48%) | **35 (83%)** |

---

## The thing that got worse: banned cards

Part one flagged that this page shows Commander-banned cards with no mark, and
that three of Sol Ring's fourteen were banned. **Reading behaviour makes that
worse**, and for a reason that is not a bug: the cards that most exactly do what
Sol Ring does are the Moxen, and the Moxen are banned.

Measured live, `legalities->>commander`:

| list | not commander-legal |
|---|---|
| Sol Ring, before | 3 of 14: Mana Crypt, Black Lotus, Jeweled Lotus |
| Sol Ring, after | **8 of 14**: Black Lotus, Mox Jet, Mox Pearl, Mox Emerald, Jeweled Lotus, Mox Sapphire, Mox Ruby, Mana Crypt |

The tile now says so: the entry note ends `· banned in Commander`. It costs one
extra column on a fourteen-row read and it is deliberately a MARK and not a
FILTER, because `/cards/:id` is not format-scoped and silently hiding a card
from a Vintage player is a product decision this pass has no standing to make.
Verified in the browser, not asserted.

**This is not resolved.** A format-aware page, or a Commander default with a
control, is the real answer and it is left open.

---

## The order of the groups turned out to be load-bearing

Caught only because the browser disagreed with the harness. One card appears
once on this page, so whichever group runs first claims it. With the behaviour
block running last, "Other Beasts" had already taken Blossoming Bogbeast and
"Shares Haste" had taken Decimator of the Provinces and End-Raze Forerunners, so
the best group on the page was ranking the leftovers: the live page reported **4
of 14 by record** where the harness reported 8, and showed The Immortal Sun and
Seshiro the Anointed instead.

The strongest signal picks first. Execution order is now decks, behaviour,
subtype, keyword, tags, and the display order matches. The page publishes each
group as it lands, so the compiler download does not hold up the cheap ones.

Recorded because it is invisible in any measurement that does not run the whole
component, and this file has already been wrong twice about the gap between "the
engine supports it" and "a player can do it".

---

## A player can reach this one

Checked in the running app rather than asserted. `npm run dev`,
`/cards/Counterspell`, `/cards/Sol Ring` and `/cards/Craterhoof Behemoth`, group
text read out of the DOM:

> **Does the same thing.** Both cards' rules text compiled into an ability
> record, then ranked by shared effects and their arguments rather than by
> shared words. Sol Ring adds mana, 2 mana at a time, costs nothing to use.
> Candidates came from tags @> fast-mana (31 cards, all of them), mana-rock (310
> cards, all of them), ramp (1968 cards, too many to rank, skipped), and 336 of
> them were scored, not the first sixty. 14 of the 14 shown were decided by a
> record.

The lists in the browser match the harness card for card, on all three. Unlike
part two, there is no wiring gap: `CardRelated.tsx` is on the page a player
opens, mounted by `src/pages/CardDetail.tsx`.

---

## What it costs

The ability compiler is a 2.4 MB chunk, 297 kB gzipped, that the card page did
not previously download. It is loaded with `await import()` inside the effect,
and the groups ahead of it are handed to React before the request starts, so the
section paints and the behaviour group appends itself when it arrives.

The ranking fetch takes `oracle_text` and refuses `image_uris`; tile columns are
fetched afterwards for the fourteen winners only. Counterspell's 327-row probe
is **177 kB** on those columns, against 533 kB on the tile columns and 559 kB on
both. Compiling and ranking takes **40 ms** for 326 rows, 90 ms for 336, 23 ms
for 133.

The right answer to all of this is a stored `facets` column, which is already
the open recommendation from part two.

---

## The optimiser and the collection recommendations

**They do not benefit, and nothing here breaks them.** Checked, not assumed.

Both read `rankCandidates`: the Add tab's suggestions, the ones badged "you own
N", through `recommend(profile, supabaseCandidateSource)` in
`src/components/deck/DeckAddPanel.tsx`; the optimiser through
`supabase/functions/deck-optimizer/index.ts`. Neither goes near
`behaviourSimilarity`, which is a new export with exactly one caller.

They cannot benefit yet, for a reason upstream of anything on this workflow's
list. `normalizeRow` in `src/engine/advise/query.ts` builds every
`CandidateCard` and **never sets `facets`**, and `adviseSource.ts` does not
select a column it could set them from. So `planFit` returns `NO_FIT` and
`cardServesRole` falls straight through to tags for both callers, exactly as it
did before this pass.

Measured cost of closing that without a stored column, so the argument for the
column carries a number: `POOL_CAP` is 3,000 rows; adding `oracle_text` to the
select takes 1,000 rows from **267 kB to 509 kB**, so roughly 800 kB → 1.53 MB
per press, plus 0.108 ms per card to compile, about **324 ms** for the pool,
plus the same 297 kB gzipped chunk. A `facets` column costs none of it.

**Proof of no regression on the shared code.** The producer is shared with the
generator and `acost:` is a new facet on 5,418 cards.
`scratch/engine-picks-after.mjs` was re-run over the same snapshot with the same
arguments: the four decks are **identical, card for card**. Every quota, every
pairwise overlap and every on-theme rate held. The only lines that moved are the facet
census and Krenko's own facet list gaining `acost:0`. `tsc` exits 0 on every
file this workflow owns, `npm test` passes **2,401**, `npm run build` succeeds,
and `npm run vendor:check` is clean.

---

## Correction to part two: the XMage table is not contributing zero

Part two reported *"The XMage table contributed 0 — all 6,302 of its ids present
in this catalogue are cards the compiler already covers fully"*. **That is
wrong, and the error was in the counting, not in the port.**

`facetsForCard` set `source = abilities.length > 0 ? 'compiler' : 'none'`. But
the oracle-text compiler performs the XMage swap **itself** and reports it on
`CardAbilities.source`, so every card the ported record spoke for was filed
under the compiler. `scratch/xmage-source-census.mjs` reads
`CardAbilities.source` directly over the same 31,833 rows:

| source | cards |
|---|---|
| compiler | 22,727 |
| **ported XMage record** | **1,541 (4.8%)** |
| no record at all | 7,565 (23.8%) |

Wrath of God and Damnation are two of the 1,541: both compile with
`source: 'xmage'`, and both produce
`eff:destroy scope:all cares:type:creature`, while Armageddon produces
`cares:type:land`. That trio is the exact separation the port exists to make,
and the record is the thing making it.

The reading is fixed in `src/lib/deck/recommend/behaviour.ts`. The producer's
own `xmageSwapFor` call still fires zero times, for the reason the old note
gave: it only runs when the compiler is incomplete, and by then the compiler has
already consulted the same table.

Two smaller corrections found while re-measuring: the compiler now reads 24,268
cards where part two measured 24,244, and leaves 7,565 with no record where part
two measured 7,589. `src/lib/cards/abilities/` belongs to another workflow and
moved during this session; those 24 cards are theirs, not this pass's.

---

## Handovers

**1. Craterhoof's clause, and `src/lib/cards/abilities/` is not this workflow's
file.** The compiler turns "creatures you control gain trample and get +X/+X
until end of turn" into `{do:'manual'}` with no hint id, so Craterhoof carries no
`eff:pump`, no `scope:all` and no `cares:type:creature`, and six of its fourteen
entries fall back to tags. Overrun, End-Raze Forerunners and Triumph of the
Hordes all produce those three facets, so a rule for that clause would connect
them immediately. It is worth more than one card: that clause shape is what the
`mass-pump` tag is trying and failing to name across 127 green cards.

**2. `MANUAL_IDS` could grow.** `src/lib/deck/recommend/behaviour.ts` reads four
named `manual` hint ids. The list is short on purpose, but a refused clause
carries its own normalised text, and two cards whose refused clauses normalise
the same are doing the same unread thing. A real signal this pass found a use
for and did not build.

**3. Legality on the card page.** Marked, not filtered, and the mark is not
enough. 8 of Sol Ring's 14 are banned in Commander. `Faerie Aerie` is legal in
no format we store and still appears in the keyword group. This needs a decision
about whether `/cards/:id` has a format.

**4. Still open from part two, unchanged.** `edhrec_rank` is NULL on Sol Ring
and 19,592 other `cards_unique` rows. `pipeline.ts` never passes `style` and
never attaches `facets`, so the generator's creature floor and commander plan
are still unreachable from the app.

**5. Not this pass, reported not touched.**
`src/lib/game/abilities/xmage-body.test.ts` line 204 fails `tsc` with
`'amount' does not exist in type '{ do: "draw" | "mill"; ... }'`. It appeared
mid-session and `src/lib/game/**` is another workflow's file.

---

## What was measured and what was not

Measured: probe size and merged pool size for all three cards; the fourteen
entries each group returns before and after, with oracle text beside each;
per-entry scores and which evidence produced them; the record census over the
whole catalogue; `legalities->>commander` for both Sol Ring lists; the payload
of every column set involved; compile-and-rank time; the keyword and subtype
groups under the new type-line filter; the four generated decks before and after
the producer change; and the rendered group text in a real browser.

Not measured: whether a player prefers these lists; whether the facet weights
are right against any weights other than the ones beside them; whether the 0.15
record floor and the two-mana cost half-life are the right numbers; how these
groups behave on the other 31,830 cards; and whether nine Moxen in one row is a
problem worth a diversity rule.

Not fixed: legality on the card page, Craterhoof's refused clause, Mana Vault's
absence from Sol Ring's list, and everything in handover 4.

---

# Part four: eight commanders, and the alphabet

**Adversarial review, 2026-08-23.** Parts one to three were measured on four
commanders, and parts two and three were also *tuned* on those four. This part
takes eight the tuning never saw and judges the result against the owner's own
four tests, which are not metrics: *it barely adds any creatures*, *it is
taking advantage of colourless artifacts*, *every commander has unique style*,
and *results dont seem right*.

## The one-line answer

**Two different commanders now produce two different decks. Mean pairwise
overlap across eight commanders is 3.9%, down from 11.4% at the start of this
review and 60.4% before part two, and a recommendation list would now survive a
player reading it for four of five well known cards.** Getting there took
thirteen changes across seven files, and the largest one refutes a claim nobody
had made because nobody had looked: **until today the single biggest influence
on what a generated deck contained was the alphabet.**

Three things in part three's write-up did not survive contact with eight
commanders, and one of them was the load-bearing claim.

### What changed

| file | change |
|---|---|
| `src/engine/advise/rank.ts` | `compareTied` replaces the alphabetical tie-break; `stableHash`; `CASTABILITY_COMFORT_PCT` 75 → 50 |
| `src/engine/advise/cuts.ts` | the same tie-break, on the cut list |
| `src/engine/advise/roles.ts` | `infect` out of `ROLE_TAGS.wincon` |
| `src/engine/knowledge/behaviour.ts` | `eff:poison` out of `ROLE_FACETS.wincon`; `agreementFactor` for same-verb-different-object |
| `src/engine/build/generate.ts` | the colourless cap and colour floor; `pickLands` tiers and `producesAnyMana`; a tag-free and plan-free land seed; the tie-mass note; the corrected no-record note |
| `src/lib/deck/recommend/behaviour.ts` | `readOwnTypeInRules`, the printed-text tribe read |
| `src/components/cards/CardRelated.tsx` | an oversized probe is narrowed by `edhrec_rank`, not skipped |

New tests: `src/engine/advise/tiebreak.test.ts` (6),
`src/lib/deck/recommend/behaviour.test.ts` (8), plus 6 in
`src/engine/knowledge/behaviour.test.ts` and 4 in
`src/engine/build/generate.test.ts`. One existing assertion was **reversed** and
says why in place: Blighted Agent used to be a win condition.

`tsc --noEmit -p tsconfig.app.json` reports zero errors, `npm test` is 2,444
passing, `npm run vendor:check` reports parity, `npm run build` succeeds. The
`supabase/functions/*/_engine/` diffs are `scripts/vendor-engine.mjs` output,
which the parity test requires.

## 1. The generator was reading the catalogue in alphabetical order

`rankCandidates` ended with:

```
scored.sort(
  (a, b) =>
    b.score - a.score ||
    a.card.name.localeCompare(b.card.name) ||
    a.card.oracleId.localeCompare(b.card.oracleId)
);
```

The comment above it said the tie-breakers exist so the result does not depend
on input order. They did. They also made it depend on spelling, and the score
ties enormously, so that line was doing the choosing.

Measured by `scratch/refute-ties.mjs`, which imports `rankCandidates` and counts
its own output over the 2026-08-19 snapshot:

| commander | ranked spells | distinct scores | biggest tied block | 64th card's score | names A–I in pool | names A–I chosen |
|---|---|---|---|---|---|---|
| Kaalia of the Vast | 17,818 | 3,472 | **5,074 at 5.3750** | 5.78 | 46% | **92%** |
| Yuriko | 12,100 | 2,687 | 3,177 at 5.3750 | 5.76 | 43% | **91%** |
| Edgar Markov | 17,815 | 4,127 | 4,120 at 5.3750 | 6.45 | 46% | 58% |
| Ghave | 17,616 | 4,402 | 3,989 at 5.3750 | 8.61 | 44% | 56% |

The deck needs 64 spells. For Kaalia the 64th sat at 5.78, a whisker above a
five-thousand-card block on 5.3750, so the role passes and the flex pass reached
straight into that block and took it alphabetically. Pooled over all eight
decks, against each letter's share of the pool:

```
letter   pool%   chosen%   ratio        letter   pool%   chosen%   ratio
  C       7.4     15.0     2.03           R       5.2      1.6     0.30
  E       3.6      6.1     1.70           S      13.4      6.8     0.51
  H       3.6      5.9     1.63           T       6.5      3.5     0.54
  F       4.4      6.3     1.44           V       2.7      0.6     0.22
                                          W       3.6      1.6     0.44
                                          X,Y     0.5      0.0     0.00
```

Sol Ring, Swords to Plowshares, Rhystic Study, Toxic Deluge, Vampiric Tutor and
Wrath of God were losing to Academy Manufactor, Arcane Denial and Blood Artist
for a reason that has nothing to do with Magic.

**Fixed** in `src/engine/advise/rank.ts` (`compareTied`): `edhrec_rank`
ascending with nulls last, then an FNV-1a hash of the oracle id, then the id.
`src/engine/advise/cuts.ts` had the same bug in miniature, so "which card should
I cut" was also a question about spelling, and it now hashes the name.

**This does not make a tied pick a good pick.** It removes one specific wrong
answer. So `generateDeck` now says how much of each deck the score could not
decide, in its own notes: *"29 of 64 spells were picked out of a group the score
could not separate, the widest being 82 cards on the same score."* That number
is the real state of the model and it is now on an object the caller already
reads.

## 2. Removing the alphabet broke the mana base, which proved the mana base was never being chosen

The Edgar Markov deck came back with this:

> Castle Ardenvale, Forbidden Orchard, Abandoned Air Temple, Adagia Windswept
> Bastion, Idyllic Grange, Dwarven Mine, Heap Gate, **Dark Depths**, Crawling
> Barrens, Dunes of the Dead, Cradle of the Accursed, Foundry of the Consuls,
> Big Apple 3 a.m. … Plains, Swamp, Mountain

One Plains, one Swamp, one Mountain, and a Dark Depths, which taps for no mana
at all. Castability on curve: 62%.

Two causes, both real, both hidden by the alphabet because the A-to-C end of
Magic's land names is unusually strong: Ancient Tomb, Arid Mesa, Battlefield
Forge, Blood Crypt, Bloodstained Mire, Caves of Koilos, Cavern of Souls, City of
Brass, Clifftop Retreat, Command Tower.

**Cause one: `pickLands` took any land at all in its second pass.** Every land
scores identically (mana value 0, so full castability; the land quota is the
only role short, so full role gap), so that loop was reading the tie-break, and
`accept(rec, coloursOf(rec))` does not care that `coloursOf` came back empty.
Now tiered: a land that makes one of the deck's colours, then a land that makes
mana, then a land that makes none.

**Cause two, and it is the more interesting one: the land seed carried the
commander's tags and plan.** Measured by `scratch/refute-lands.mjs`:

| Edgar Markov (BRW) | | Kaalia of the Vast (BRW) | |
|---|---|---|---|
| Field of the Dead | 4.014 `[role-gap 3.00, tag-synergy 0.70, popularity 0.31]` | Command Tower | 3.745 `[role-gap 3.00, popularity 0.75]` |
| Castle Ardenvale | 3.984 | Exotic Orchard | 3.626 |
| Abandoned Air Temple | 3.979 | Evolving Wilds | 3.567 |
| Dark Depths | 3.928 | Bojuka Bog | 3.549 |
| … | | … | |
| **Command Tower** | **rank 41** | Godless Shrine | rank 9 |
| **Godless Shrine** | **rank 81** | Blood Crypt | rank 11 |

One shared tag is worth about 0.70. The entire popularity spread across 641
Mardu lands is 0.11 to 0.75. So a single shared word outweighs the whole of the
only evidence we hold about which lands people play, and **the deck with a
working commander plan got the worse mana base.** Kaalia has no plan, nothing
fired, and the same function returned a correct Mardu list.

Fixed: the land seed now carries no tags and no plan, because a land is picked
for the mana it makes. Edgar's castability on curve went 62% → 69%, and both
Mardu decks now get the same mana base, which is the right answer, because a
mana base is a function of the colours.

## 3. Every commander has unique style: three of eight had no style at all

`planForCommander` reads wants off the commander's record. On the four tuned
commanders it worked. On eight it produced nothing usable for four of them, and
the failure is silent.

| commander | record the compiler produced | tribe | wants |
|---|---|---|---|
| Edgar Markov | `kw:first strike kw:haste rec:partial sub:knight sub:vampire` | **none** | **none** |
| Lathril | `acost:0 eff:gain-life eff:lose-life kw:menace rec:partial sub:elf sub:noble` | **none** | `eff:gain-life@0.70` |
| Yuriko | `rec:partial sub:human sub:ninja trig:deals-damage` | **none** | **none** |
| Kaalia | `kw:flying rec:partial sub:cleric sub:human` | **none** | **none** |

The compiler refuses precisely the clauses that make a tribal commander tribal:
Edgar's eminence trigger and his +1/+1 attack trigger, Lathril's "create that
many 1/1 Elf Warrior tokens" and "Tap ten untapped Elves", Yuriko's "Whenever a
Ninja you control deals combat damage". All three record `rec:partial` and are
then treated as though the silence were an answer.

And those four are exactly the four decks that failed the owner's tests. On-theme
rate against each commander's own pool base rate, before any fix:

| commander | pool base rate | deck |
|---|---|---|
| Edgar Markov | 2% | 2% |
| **Kaalia** | **5%** | **3%** |
| Lathril | 4% | 6% |
| **Yuriko** | **4%** | **2%** |
| Meren | 35% | 61% |
| Niv-Mizzet | 38% | 91% |
| Ghave | 23% | 86% |

For Kaalia and Yuriko the generated deck was **less on theme than drawing at
random from their own colour pool.**

**Fixed** in `src/lib/deck/recommend/behaviour.ts` (`readOwnTypeInRules`): does a
subtype from this card's own type line appear as a word in its own rules text?
That is a printed-truth read, Scryfall's half of the division of sources in
CLAUDE.md, and it is not an attempt to work out what the card does. It emits
`cares:sub:` and never `tok:` and never an effect, so it can say "this card is
about Vampires" and can never say what it does about them.

The negative cases are the point and all are tested:

- **Talrand** is a Merfolk Wizard whose text names instants, sorceries and
  Drakes. Neither of its own subtypes appears, so it still has no tribe.
- **Kaalia** is a Human Cleric whose text names Angel, Demon and Dragon. None is
  her own subtype, so she still gets none, which is right: she is not a tribal
  commander.
- **"Commander ninjutsu"** must not match `sub:ninja`. Word boundaries, and
  reminder text in brackets is stripped first.

Edgar → tribe vampire. Lathril → elf. Yuriko → ninja. Kaalia → still none.

## 4. Win conditions: `voltron` came back wearing the word `infect`

Part two removed `voltron` from `ROLE_TAGS.wincon` because every Equipment was a
win condition. Eight commanders found the same mistake in a different word.

Win condition slots at the start of this review:

```
Edgar Markov     Chrome Dome, Crawling Chorus, Kemba, Kha Enduring
Meren            Blightbelly Rat, Bloated Contaminator, Core Prowler
Kaalia           Great Train Heist, Fear of Missing Out, Blightbelly Rat
Yuriko           Blightbelly Rat, Ichorclaw Myr, Chrome Dome
```

Blightbelly Rat is a two-mana 1/1 with toxic 1. It was a win condition of three
decks out of eight. Kaalia of the Vast, whose entire function is putting a Demon
onto the battlefield attacking, was handed a 1/1 Rat as one of her three ways to
end a game.

**A role has two doors and closing one closes neither.** Removing `eff:poison`
from `ROLE_FACETS` changed nothing, because the producer prints Blightbelly Rat
as `rec:partial` with no poison facet at all, because the compiler reads its
dies trigger and refuses toxic, so it was coming through the tag fallback. Both
lists lost their poison entry.

**What it costs, stated rather than buried:** Blightsteel Colossus is
`rec:partial` and its only tags are `artifact`, `creature`, `infect`, so it no
longer reaches this role by any door. That is a real loss on a real win
condition, taken because the same word was putting a 1/1 Rat in three decks.

After: `Sorin, Lord of Innistrad / Sorin, Solemn Visitor / Captivating Vampire`
for Edgar; `Ezuri, Renegade Leader / Sylvan Advocate / Thornfist Striker` for
Lathril; `Aetherflux Reservoir / Aggravated Assault / Flowering of the White
Tree` for Kaalia.

## 5. Colourless artifacts: measured against the pool, not against a feeling

The right question is not "how many artifacts" but "more than the pool it was
drawn from?" `scratch/refute-colour.mjs` answers both halves.

| commander | pool colourless | deck colourless, start | after | ratio now |
|---|---|---|---|---|
| Edgar Markov | 13.4% | 68.8% | **3.1%** | 0.23 |
| Niv-Mizzet | 19.7% | 43.8% | **6.3%** | 0.32 |
| Lathril | 19.8% | 34.4% | **4.7%** | 0.24 |
| Yuriko | 19.7% | 40.6% | **14.1%** | 0.72 |
| Urza (mono-U) | 34.0% | **98.4%** | 50.0% | 1.47 |
| Kaalia | 13.4% | 28.1% | 26.6% | 1.99 |
| Ghave | 13.5% | 42.2% | 31.3% | 2.31 |
| Meren | 19.8% | 45.3% | 28.1% | 1.42 |

Urza, Lord High Artificer's mono-blue 99 contained **one blue spell out of
sixty-four**. Nobody asked for that deck.

Two fixes, and they are different in kind.

**The declared one.** `COLOURED_FLOOR_SHARE = 0.5` in `generate.ts`: at least
half the nonland slots carry one of the commander's colours. Same shape as
`CREATURE_TARGETS`: a number the product chose, written where it can be argued
with rather than buried in a weight. It is enforced as a **cap on colourless
cards rather than a floor on coloured ones**, and that detail is the whole
difference between working and not: written as a top-up pass after the quotas,
it reached 28 of the 31 it needed with nowhere to put the rest, because neither
floor may cut what an earlier pass chose. The only way to keep the room is to
not spend it.

**The root-cause one.** `CASTABILITY_COMFORT_PCT` 75 → 50. The comfort point has
to be a figure an ordinary on-colour card actually reaches or the saturation
only ever fires for the colourless cards it was written to stop rewarding. A
five-drop in three colours lands near 50%, so at 75 it still collected a third
less than a Bone Saw.

Ghave at 2.31 and Kaalia at 1.99 are the residue: the floor is not binding for
them, so what is left is the scoring bias itself, still measurable. **The floor
is a floor, not a correction, and it is reported as one.**

## 6. The curve, which is the largest thing still wrong

With everything else fixed, `scratch/refute-eight.mjs` counts the mana values of
each finished deck's 64 nonland spells:

```
commander                        mean   0mv  1mv  2mv  3mv  4mv  5mv  6mv  7+  |  5+
Edgar Markov                     2.39    0  11  26  18   9   0   0   0  |    0
Meren of Clan Nel Toth           2.28    5  17   9  21  12   0   0   0  |    0
Niv-Mizzet, Parun                2.39    0  12  23  21   8   0   0   0  |    0
Ghave, Guru of Spores            1.80   12  20  10  13   9   0   0   0  |    0
Kaalia of the Vast               2.14    4  12  23  21   4   0   0   0  |    0
Urza, Lord High Artificer        2.41    2   7  24  25   6   0   0   0  |    0
Lathril, Blade of the Elves      2.08    0  28  10  19   7   0   0   0  |    0
Yuriko, the Tiger's Shadow       2.69    3   6  18  20  15   2   0   0  |    2
```

At the comfort point of 75 this was worse still: mean 1.33 to 2.08, and across
all eight decks, 512 spells, **exactly two cards cost five mana or more.** At
50 it is two again, and **no card at six mana or more in any of the eight
decks.** These decks run 35 lands and have nothing to ramp into.

Kaalia's ability reads "put an Angel, Demon, or Dragon creature card from your
hand onto the battlefield tapped and attacking". Her deck contains no Angel, no
Demon and no Dragon, and its most expensive nonland card costs four.

**Not fixed, deliberately.** A curve target is a product decision with nothing in
this repository to ground it, and this is the third floor I would be adding to
work around the same ranker. Three floors is the signal: the ranker's preference
for cheap cards is the bug, and the floors are patches on its symptoms. See
handover 1.

## The eight decks

`scratch/refute-eight.mjs`, style `balanced`, arguments copied from
`pipeline.ts` build step 3.

```
commander                        spells  creat  artif  equip  colourless  mv<=1
Edgar Markov                         64     58      2      0           2     11
Meren of Clan Nel Toth               64     39     19      3          18     22
Niv-Mizzet, Parun                    64     24      2      0           4     12
Ghave, Guru of Spores                64     42     19      0          20     32
Kaalia of the Vast                   64     27     19      1          17     16
Urza, Lord High Artificer            64     30     45      0          32      9
Lathril, Blade of the Elves          64     50      5      0           3     28
Yuriko, the Tiger's Shadow           64     43     11      0           9      9
```

Creature counts run 24 to 58 against a floor of 24. *It barely adds any
creatures* is answered.

### Overlap, all 28 pairs

| | start of review | now |
|---|---|---|
| mean pairwise overlap on nonland spells | 11.4% | **3.9%** |
| worst pair | Kaalia / Yuriko 47% | Kaalia / Yuriko **19%** |
| nonland cards in all eight decks | 0 | **0** |
| nonland cards in six or more decks | 0 | **0** |

For reference, part one measured the four tuned commanders at **60.4% mean
overlap with thirty cards in all four decks**.

The worst pair is still Kaalia and Yuriko, and the reason is now specific rather
than general: Kaalia is the one commander of the eight for whom
`planForCommander` still produces nothing, so her deck is assembled from role
quotas alone, and role quotas are the same for everybody.

## Reading two of them as a player

### Edgar Markov: I would sleeve this, with about ten changes

58 creatures, almost all Vampires. Blood Artist, Cruel Celebrant, Kalastria
Highborn, Viscera Seer, Indulgent Aristocrat, Vampire Socialite, Captivating
Vampire, Stromkirk Captain, Bloodtithe Harvester, Anje Falkenrath, Sorin
Imperious Bloodlord, Yahenni. A player would recognise this as an Edgar deck on
sight, and the mana base is one they would keep: Command Tower, Godless Shrine,
Blood Crypt, Badlands, Battlefield Forge, Caves of Koilos, Clifftop Retreat,
Cavern of Souls.

The five worst cards and why they are there:

1. **Gimli of the Glittering Caves**, in the *ramp* slot. A Dwarf Warrior that
   does not produce mana, in a Vampire deck. It holds a ramp slot because a role
   is answered by a record or a tag and neither said no loudly enough.
2. **Idol of False Gods**, a Kindred Artifact Eldrazi, in a deck with two
   artifacts. Nothing to do with Vampires; it is a colourless rock that survived
   the colourless cap because the ramp quota ran before the cap bit.
3. **Fain, the Broker**, a Human Warlock in the ramp slot. Same failure as
   Gimli.
4. **Coin of Mastery**, a four-mana artifact that does very little, filling the
   last ramp slot.
5. **Morlun, Devourer of Spiders**, a Vampire, so the plan likes it, but a
   marginal card holding a removal slot in a deck with almost no removal.

The deeper criticism, which no score reports: **58 creatures out of 64 means
this deck has six non-creature cards and essentially no interaction.** The
creature floor is 24; commander-fit at 2.2 for `sub:vampire` did the other 34.
Swords to Plowshares, Anguished Unmaking and Vandalblast are all legal here and
all absent. The tribe want went from too weak to too strong in one change, and
nothing in the engine caps it.

### Kaalia of the Vast: I would not sleeve this, and the reason is the commander

Judged on its own, this is a competent Mardu midrange deck: Anguished Unmaking,
Generous Gift, Deadly Rollick, Damn, Boros Charm, Abrade, Go for the Throat;
Grand Abolisher, Flawless Maneuver, Ghostly Prison, Drannith Magistrate; Chrome
Mox, Arcane Signet, Ashnod's Altar, Black Market Connections; Esper Sentinel,
Braids Arisen Nightmare, Deadly Dispute. Aetherflux Reservoir and Aggravated
Assault as win conditions.

**It contains no Angel, no Demon and no Dragon**, and its most expensive nonland
card costs four. The commander is a 4-mana 2/2 flier that does nothing. The deck
would be strictly better with any other Mardu commander, which is the definition
of failing *every commander has unique style*.

The five worst cards:

1. **Cryptic Trilobite**, a 0-mana 0/0 that enters with counters and taps for
   colourless. It is in the flex slots because it is free, and free is what the
   castability signal still rewards most.
2. **Diamond Pick-Axe**, a one-mana Equipment. The `voltron` fix stopped
   Equipment being *win conditions*; it did not stop cheap Equipment being flex
   filler.
3. **Currency Converter**, a one-mana artifact, same slot, same reason.
4. **Gold Myr**, a mana dork in a deck whose top end is four mana. There is
   nothing to ramp into.
5. **Hell to Pay**, a one-mana sorcery filling the last flex slot.

All five are in the flex block, all five cost one or zero, and that is the curve
finding in miniature. The engine's own note on this deck is honest about the
cause: *"Kaalia of the Vast has an ability record but nothing in it says what
the deck should do, so this deck was picked on roles and tags alone."*

## Sol Ring against Bone Saw, printed

`scratch/refute-eight.mjs`, on each commander's seed profile, popularity weight
0.8. Signals in brackets are the engine's own.

```
Edgar Markov
   Sol Ring                 5.50  rank 389/2487    [role-gap 3.00, castability 2.50]
   Bone Saw                 2.60  rank 1645/2487   [castability 2.50, popularity 0.10]
   Basilisk Collar          2.86  rank 1594/2487   [castability 2.50, popularity 0.36]
Urza, Lord High Artificer
   Sol Ring                 7.32  rank 101/2199    [role-gap 2.70, commander-fit 1.32, tag-synergy 0.80, castability 2.50]
   Bone Saw                 2.60  rank 1385/2199   [castability 2.50, popularity 0.10]
```

Sol Ring beats Bone Saw on all eight commanders, 5.50 to 2.60, and Bone Saw
ranks in the bottom third of every pool. **Confirmed.**

**And no build returns a pile of nearly free Equipment.** Equipment across the
eight finished decks: **4 cards in total**, three in Meren, one in Kaalia, none
in the other six. Equipment in the twenty-four win condition slots: **zero**.
For comparison, part one measured 86 Equipment across four decks with all twelve
win-condition slots filled by Equipment and Basilisk Collar in all four. Cards at mana value 1 or less
across the eight: 9 to 32 out of 64, against 34 of 64 for Edgar at the start of
this review.

One caveat that is not the generator's: on the seed profile every coloured card
scores `castability 0.00` and is refused, because the profile is built from a
placeholder 35-land mana base with no oracle text. That is an artifact of the
harness both this part and part two used, so the Sol Ring / Bone Saw comparison
is sound (both are colourless) and any figure quoted from that table for a
coloured card is not.

## Recommendations: five well known cards

`scratch/refute-related.mjs` mirrors `CardRelated.tsx` step by step against the
live database on the anon key, including the colour-identity filter, which
matters: `counterspell` counts 416 unfiltered and 326 within blue.

Judged by part one's rule, unchanged: would a player call this entry genuinely
similar?

| card | group rendered | entries a player would call similar |
|---|---|---|
| Sol Ring | yes | **12 / 14** |
| Counterspell | yes | **14 / 14** |
| Wrath of God | yes | **14 / 14** (was 10 / 14 before the fix below) |
| Lightning Bolt | **no → yes** | **12 / 14** (was the word-matched list) |
| Cultivate | **no** | **0 / 14** (word-matched list) |
| **all five** | 4 of 5 | **52 / 70, 74%** |

Part three reported 37/70 (53%) over a different five lists; these five are
different cards, so the two figures are not the same measurement and are not
presented as one. What is comparable is the same-day before/after on the two
lists that changed here.

### Wrath of God ranked two Armageddons above Rout

The list before, with the engine's own notes:

```
 7. Ravages of War       Also destroys, hits everything at once
 8. Armageddon           Also destroys, hits everything at once
 9. Cleansing Meditation Also destroys, hits everything at once
10. Rout                 Also destroys, about creatures, hits everything at once
14. Cleanfall            Also destroys, hits everything at once
```

Ravages of War and Armageddon read "Destroy all lands." Cleansing Meditation and
Cleanfall read "Destroy all enchantments." All four outranked Rout, which
destroys all creatures, **and the page's own notes gave it away**: the four
wrong entries printed without the "about creatures" clause.

Rout lost because it also has a flash clause, so it carries an extra facet
(`acost:2`), and every extra facet is another unshared term in a Jaccard union.
**The measure counted doing MORE against a card harder than doing something
ELSE.**

Fixed in `behaviourSimilarity`: when both records name an object on the same
axis (`cares:type:`, `cares:sub:`) and share none of them, that is a
contradiction and not an absence, and the score is cut by `AGREEMENT_FLOOR`.
Silence on either side stays an absence, so a partial record is never punished
for what it did not read. All fourteen of Wrath's entries now destroy all
creatures.

### Lightning Bolt: the group was being skipped entirely

`targeted-removal` counts 1,149 cards in red, over `BEHAVIOUR_PROBE_CAP` of 400,
so the only probe was skipped, so the group did not render, so the player saw
the word-matching list this whole change set exists to replace:

> Eldrazi Confluence, Beacon of Destruction, Chain of Plasma, Blast from the
> Past, Weight of Spires, End-Blaze Epiphany, Frost Bite, Harvest Pyre, **Drill
> Too Deep**, Heated Debate, **Breath of Fire**, Deem Worthy, Conduct
> Electricity, Galvanic Bombardment

Counterspell (326) and Wrath of God (136) survived on the identity filter alone.
The three cards part three was tuned on all had small probes; the cards a player
actually opens do not.

An oversized probe is now **narrowed, not dropped**: it takes its 400
most-played rows in `edhrec_rank` order and the group's basis line says so.
Lightning Bolt now returns Chain Lightning, Burst Lightning, Galvanic Blast,
Gut Shot, Geistflame, Death Spark, Banefire, Blaze, Disintegrate, Demonfire,
Crater's Claws, Burn from Within, Goblin Grenade, Collateral Damage.

That ordering is **not neutral and is not described as neutral**: `edhrec_rank`
is NULL on 19,592 of 33,032 rows, so on a narrowed probe an unranked card cannot
appear. On a probe under the cap nothing changed and everything is still scored.

### The two entries in Lightning Bolt's list a player would reject

Goblin Grenade and Collateral Damage both require sacrificing a creature, and
the note on both says only "Also deals damage". The vocabulary has no magnitude
axis for damage the way it has `mana:` for mana, so Geistflame dealing 1 to a
creature and Banefire dealing X to anything print the identical clause. Same
shape of gap as the poison one in section 4.

## Cards with no structured record

**23.7% of the catalogue**: 7,537 of 31,833 rows produce no ability record at
all. Source census over the same rows, from `facetsForCard` on the final run:
compiler 22,677, ported XMage record 1,619 (5.1%), none 7,537.

Part three reported 22,727 / 1,541 / 7,565 for the same census earlier today.
The difference is not this pass: another workflow was regenerating
`src/lib/cards/xmage/lowered.generated.ts` throughout the session, so the ported
record gained 78 cards while this review ran. The figure is a moving target and
is quoted with the run that produced it.

They do not disappear, and the behaviour differs correctly by caller:

- **In a deck**, a card with no record falls back to tags through
  `cardServesRole`, and the generator reports the rate: Edgar's finished deck is
  *"62 of 64 chosen spells had an ability record (97%); the rest fell back to
  tags. Pool: 14,260 of 18,467 (77%)."* Kaalia's is 54 of 64 (84%). Cards with
  no record are picked, ranked and reported, not filtered.
- **On a card page as a candidate**, a no-record card is kept, ranked on tags,
  sorted last and labelled, and the group's basis line counts it.
- **On a card page as the subject**, `canReadBehaviour` returns false and the
  behaviour group does not render at all, because dressing a tag list up as a
  behaviour list is the dishonesty this change set is undoing.

**Cultivate is that case and it is worth naming.** `facetsForCard` returns
`{facets: ["type:sorcery"], source: "none", coverage: "manual"}`. The compiler
refuses "search for up to two basic lands, put one onto the battlefield and the
other into your hand" entirely. Rampant Growth, one clause simpler, compiles
fully to `cares:type:land, cares:zone:library, eff:search-library, rec:full,
scope:all`. So a player asking for cards like Cultivate gets City of Shadows,
Cabal Stronghold, Exploration, Heritage Druid and Joiner Adept, so **zero of
fourteen are land-fetch ramp spells**, and Kodama's Reach, which is a functional
reprint, is absent. `src/lib/cards/abilities/` is not this workflow's to change;
handover 2.

## The optimiser and the collection recommendations

`rankCandidates` and the cut list both changed today, so "they do not touch
`behaviourSimilarity`" is not an answer. `scratch/refute-optimiser.mjs` runs
both over a real 99-card Meren deck built from the snapshot:

```
candidates      12434      additions 12412      cuts 64      power score 5.8
hard rules      all held over the top 500 additions and every cut
determinism     additions identical, cuts identical
input order     does not change the result
top 40 order    not alphabetical   letters URCBDSZALFWMHEGKP
```

Not broken. Every suggestion is legal, in identity, not already in the deck and
castable; every cut names a card the deck holds; the same input gives the same
output; input order still does not matter.

**One thing it surfaced that is not fixed.** The top twenty additions the
optimiser would offer a Meren deck include Paradise Mantle at 4, Sigil of
Distinction at 6, Accorder's Shield at 9, Bone Saw at 10, Adventuring Gear at 11
and Cathar's Shield at 12, every one of them on `tag-synergy` over
`equipment, voltron`, shared with the three Equipment the generator put in that
deck in the first place. Part one identified this loop and it is still live in
the optimiser: the ranker recommends more of what a previous ranking put there.
Bone Saw is no longer a win condition and no longer a generator pick, and it is
still the tenth thing the optimiser wants to add to a graveyard deck.

## What was measured and what was not

**Measured**, all by scripts in the gitignored `scratch/`, all re-run today:
eight full decks and their composition, curve, castability and win conditions;
tie mass and first-letter distribution over eight ranked pools; colourless share
of pool against deck for all eight; pairwise overlap over all 28 pairs; the land
ranking with per-signal breakdown for two same-identity commanders; Sol Ring
against Bone Saw on eight seed profiles; five live recommendation lists with the
old and new group side by side on the same day; oracle text fetched live for
every entry judged; the facet census over 31,833 rows; and the optimiser's
additions, cuts, determinism and hard rules over a real 99-card deck.

**Not measured**: whether a player prefers these decks to the old ones;
whether `COLOURED_FLOOR_SHARE = 0.5`, `CASTABILITY_COMFORT_PCT = 50` or
`AGREEMENT_FLOOR = 0.4` are the right numbers against anything other than the
cases beside them, because there is still no labelled data in this product to
fit them to; how the eight decks play; and anything about the other 31,825
cards.

**Not fixed**: the curve; Kaalia's empty plan; the tribe want having no ceiling;
Cultivate; damage magnitude; Mana Vault; and everything below.

## Handovers

1. **The curve, and it is the biggest one.** Eight decks, 512 nonland spells,
   two cards at five mana or more and none at six, with 35 lands. The mechanism
   is `WEIGHTS.playability`: castability's job is to REFUSE cards the deck
   cannot cast, and the `cannot-cast` gate at 25% already does that, but above
   the gate it still pays up to 2.5 for being cheap. Lowering
   `CASTABILITY_COMFORT_PCT` to 50 moved the mean from 1.6 to 2.3 and stopped
   there. The fix is a declared curve target beside `COMMANDER_ROLE_TARGETS`,
   which is a product decision this review would not invent. Note that this
   would be the **third** floor working around the same ranker, and the honest
   reading is that the ranker's cheap bias is the defect and the floors are
   patches.

2. **Cultivate, and it is the same class as Craterhoof.** The compiler returns
   `coverage: 'manual'` with zero abilities. Reproduction, one line:
   `facetsForCard({type_line:'Sorcery', oracle_text:'Search your library for up
   to two basic land cards, reveal those cards, put one onto the battlefield
   tapped and the other into your hand, then shuffle.'})` returns
   `["type:sorcery"]`. Rampant Growth's simpler clause compiles fully. The
   difference is "up to two … put one … and the other". `src/lib/cards/abilities/`.

3. **Mana Vault is still missing from Sol Ring's list, and the arithmetic says
   why.** Sol Ring `["acost:0","eff:add-mana","mana:2","rec:full","type:artifact"]`;
   Mana Vault adds `trig:step` from its upkeep and draw-step downside clauses and
   has `mana:3`. Scores: Springleaf Drum 0.878, Mox Diamond 0.878, Mana Crypt
   0.860, **Mana Vault 0.754**. The 0.4 of union weight from `trig:step` is the
   entire gap. Two separate causes and neither is fixable in the current
   vocabulary: magnitude distance is absolute rather than proportional, so 2
   against 3 costs the same as 2 against 1; and there is no way to say that a
   clause is a DRAWBACK rather than a second thing the card does. Part three
   claimed the distance comparison had put Mana Vault back. It had not.

4. **The tribe want has no ceiling.** Edgar Markov's deck is 58 creatures out of
   64 nonland cards and holds essentially no interaction. `commanderFit` at 2.2
   applied to `sub:vampire` beats everything else in a mono-tribal pool. The
   creature floor is 24 and is not what produced 58.

5. **A magnitude axis for damage and poison.** `mana:` is graded and compared by
   distance; `eff:damage` and `eff:poison` are booleans. That is why one poison
   counter had to be removed from the win-condition rule wholesale, taking
   Blightsteel Colossus with it, and why Geistflame and Banefire print the
   identical note under Lightning Bolt.

6. **Still open from parts two and three, all re-confirmed today:**
   `edhrec_rank` NULL on 19,592 of 33,032 `cards_unique` rows, which now also
   decides what a narrowed recommendation probe can return; `pipeline.ts` passes
   no `style` and attaches no `facets`, so **a player still cannot reach any of
   this**; eight of Sol Ring's fourteen are banned in Commander and the page
   marks rather than filters them.

7. **Not this workflow's, and it appeared mid-session:**
   `src/lib/game/xmage/bodies.generated.ts` was failing `tsc` with a moving set
   of errors while another workflow regenerated it. It is clean as of the final
   run.
