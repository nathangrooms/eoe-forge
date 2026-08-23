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
