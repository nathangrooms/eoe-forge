# The commander decides the composition

Written 25 Aug 2026. Every number below came out of a script that was run, and
the script is named beside it.

---

## The one-line answer

The role table is gone. A Krenko deck now asks for 29 creatures and 38 lands, a
Talrand deck for 13 creatures and 35 instants and sorceries, and neither number
was written down by anybody.

---

## What was deleted

`src/engine/advise/roles.ts` used to declare a Commander deck as

```
ramp 10   draw 10   removal 8   interaction 4   wincon 3   land 36
creature floor 32 / 24 / 12, by style
```

Seventy of the ninety-nine slots were spoken for before the commander was read,
and the same seventy for every commander in the format. The owner:

> "we cannot force a specific amount of creatures/artifacts/sorceries etc —
> every commander is completely different"
>
> "Decks must be custom to them, as well as the archetype"

The reason a table cannot be repaired by choosing better numbers is that the
numbers disagree with each other by commander. There is no single row that is
right for a Goblin deck, a spellslinger and a lands deck at once.

`COMMANDER_ROLE_TARGETS` and `CREATURE_TARGETS` no longer exist.
`YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED` holds the old row under a name that says
what it is now for: grading a deck somebody typed in, where there is no pool and
often no record and so nothing to derive from. Its `creature` entry is **0**,
because there was never a defensible universal creature count. `roleTargetsFor`
survives with that one job, its `style` parameter removed, and the generator does
not call it.

---

## What replaced it

`src/engine/build/shape.ts`. One idea:

> **A deck is shaped like the cards that do the commander's job.**

`planForCommander` already reads a commander's record into a list of wants:
Krenko wants `sub:goblin`, `cares:sub:goblin`, `tok:goblin`; Talrand wants
`type:instant`, `type:sorcery`, `cares:type:instant`. `planFit` matches those
against the real legal pool, and the cards that come back carry type lines.
Nearly everything satisfying "is a Goblin" is a creature. Nearly nothing
satisfying "is an instant" is. So the creature share of the two decks falls out
of the two records measured against the same catalogue.

That is the answer to *what in the commander's text makes this deck want 40
creatures rather than 15*: Krenko's text names a creature type, so the cards that
do his job are creatures. Talrand's names two card types that are not.

Measured over the eight commanders below, on the pool snapshot:

| commander | cards in the pool doing its job | creature share | instant/sorcery share |
|---|---|---|---|
| Krenko, Mob Boss | 1,520 | **64%** | 12% |
| Talrand, Sky Summoner | 2,088 | **12%** | **75%** |
| Meren of Clan Nel Toth | 18 | 62% | 27% |
| Tatyova, Benthic Druid | 1,590 | 41% | 33% |
| Sram, Senior Edificer | 317 | **23%** | 25% |
| Edgar Markov | 414 | **96%** | 2% |
| Grand Arbiter Augustin IV | 0 | no plan | no plan |
| Muldrotha, the Gravetide | 0 | no plan | no plan |

### A deck is its plan plus its function, and the halves are shaped differently

The share above shapes the slots the floors do not claim. The floors are filled
from the pool by cards that serve those roles, and how many of *those* are
creatures is a second thing that can be counted rather than assumed: in mono-red
32% of the cards that can fill a floor have a body, in blue-white 35%, in Golgari
38%. The creature target is the two added.

Both simpler versions were built first and both were wrong, in opposite
directions, and the measurements are in the code comment:

- Plan share over the theme slots only: **Krenko asked for 22**, fewer than the
  fixed floor of 24 it replaced, because it treated every floor pick as though it
  could never be a creature. A Goblin that adds mana is ramp *and* a Goblin.
- Plan share over all 63 nonland slots: **Edgar Markov asked for 60**, because
  96% of the cards satisfying `sub:vampire` are creatures and the ramp, the
  removal and the draw were being counted as vampires. Sixty of sixty-three is
  the failure `ENGINE-PICKS.md` handover 4 recorded, reached from the other side.

---

## The sanity bounds, and why each one exists

Three kinds, all floors, none a quota. A quota says "take this many and stop"; a
floor says "below this the deck does not work", and the commander's plan takes
everything above it.

### 1. Lands: solved, not declared

`solveLandTarget` walks land counts and takes the one that **maximises the
expected number of this deck's own spells that are castable on curve** —
`(nonland slots) x (mean on-curve castability)`, both halves measured with the
same `castability.ts` hypergeometric that grades a finished deck. Another land
raises the second and lowers the first. The peak is where the next land stops
paying for the spell it costs.

**There is no threshold, and that is the point.** Two thresholded versions came
first and both collapsed onto their own floor:

| criterion | result over the eight commanders |
|---|---|
| the deck's **mean** card reaches the comfort point | **8 of 8** took the floor, 29 |
| the deck's **median** card reaches it | **5 of 8** took the floor |
| maximise expected castable spells | **35 to 43**, spread across all eight |

A mean over a Commander deck is carried by the dozen one-drops that are castable
whatever the mana base looks like. A quantity with an interior maximum needs no
level to be declared at all.

Two more corrections, both measured:

- **Lands and ramp are solved together.** Solving lands alone made the deck buy
  its missing mana in lands: the eight commanders wanted **41 to 49** of them.
  The land solve is seeded with ramp's presence floor and re-run once after the
  ramp solve answers.
- **The provisional mana base is built the way the real one is** — two basics per
  colour, then the pool's own most-played lands that produce a deck colour, which
  is what `pickLands` does. A spread of basics is badly wrong for a multicolour
  deck, and Edgar Markov wanted **46 lands** and never peaked before this changed.

**The one floor on lands is 29**, and it is computed rather than chosen: the
smallest count at which three lands appear in the first nine cards more often
than not, 52.3% at 29 of 99. Below that a deck misses its third land drop half
the time, and that is true of a Goblin deck, a spellslinger and a lands deck
alike.

The floor used to be "the fewest lands that cast the commander on curve", which
sounds better and measured worse: a six-mana Muldrotha off lands alone needs
**49**. Reaching a commander's cost is lands *and* ramp, so that requirement
moved to the ramp solve, where the answer is a handful of accelerants.

### 2. Ramp: the larger of a presence floor and a magnitude solve

Presence is the wrong question for ramp on its own — one Sol Ring is not enough
for a deck of seven-drops and two are too many for a deck of two-drops — so it
has both halves:

- **Presence.** 8 copies, so one is drawn by turn 3 more often than not. Same
  rule as the four below.
- **Magnitude.** `solveRampFloor` adds two-mana rocks until the deck's own upper
  quartile is castable at the comfort point, and until the commander itself is.
  On the eight commanders this asks for 0 to 3 on top of the land count the solve
  already took, which is the right shape of answer: the lands did the work.

The probe is the weakest plausible accelerant, a two-mana rock, so the count is
never fewer than the deck turns out to need.

### 3. Draw, removal, interaction, a win condition: one rule, four turns

The only declared numbers left in the composition are four **turns**, in
`WHEN_IT_MATTERS`. The counts are computed from them:

| job | turn it matters | why that turn | copies, from 99 cards |
|---|---|---|---|
| ramp | 3 | after this, acceleration is not acceleration | 8 |
| draw | 5 | the turn a deck that started on seven has spent them | 6 |
| interaction | 5 | it only counts if it was already in hand | 6 |
| removal | 6 | an opponent's commander is out and has attacked | 6 |
| wincon | 10 | Commander games run long, and no longer than this | 4 |

`copiesToSeeOne` answers "how many copies before one is in hand by then, more
often than not" with the same hypergeometric as everything else. The confidence
is 50% deliberately: a floor marks where a deck breaks, not where it is
comfortable. At 75% the four floors take 41 of 64 nonland slots instead of 22,
which is the quota table growing back.

`removal` and `interaction` do not vary with the commander. That is correct
rather than an omission: what they answer is the other three players.

### There is no creature floor

Deliberately. A creature count is exactly the fixed number imposed from outside
that the owner objected to, and every job a creature does for a deck — blocking,
ramping, ending the game — is covered by a floor above that a creature may fill.

---

## The fallback, which matters as much as the happy path

23.8% of cards have no ability record. Two of the eight commanders below produce
**no wants at all**: Muldrotha, the Gravetide (the compiler returns `coverage:
manual` for "you may play a land and cast a permanent spell of each permanent
type from your graveyard", XMage holds no record for that oracle id, and none of
its tags map to a facet) and Grand Arbiter Augustin IV.

**The fallback is not the deleted table under another name.** Putting the numbers
back for the 24% of cases nobody looks at is how a table survives being deleted,
and `shape.test.ts` has a test that fails if the floors ever equal the old row.

It is the same measurement over a wider set: the composition of **the cards
people actually play in these colours**, read off `edhrec_rank`, which is the
only "what gets played" evidence this schema holds. Everything else — the land
solve, the ramp solve, all four floors — runs exactly as it does for a commander
with a record. `evidence.source` reports `colour-identity` so a caller can see
which of the two happened.

| commander | share it fell back to | creatures asked for | finished deck |
|---|---|---|---|
| Grand Arbiter Augustin IV | 17% creatures in WU | 16 | 19 creatures, 16 instants and sorceries, 40 lands |
| Muldrotha, the Gravetide | 25% creatures in UBG | 21 | 21 creatures, 24 instants and sorceries, 35 lands |

Grand Arbiter's 99 came back holding Condescend, Force Spike, Arcane Denial,
Broken Ambitions, Stubborn Denial, Syncopate, Clash of Wills, Phantom
Interference and Chalice of the Void. That is a control deck, and it was built
for a commander the engine could not read a single want from.

**One caveat, and it is load-bearing.** The fallback reads `edhrec_rank`, which
is NULL on 19,592 of 33,032 `cards_unique` rows. Where it is null the fallback
degrades to an unbiased sample of the pool, and the creature share it measures
drifts toward the catalogue's rather than the format's. The first run of this
harness had the column null on every row and Grand Arbiter asked for **36
creatures** instead of 16.

---

## The eight decks

`scratch/shape-measure.mjs`, style `balanced`. Both arms are the real
`build()` from `supabase/functions/ai-deck-builder-v2/pipeline.ts`:

- **HEAD** is `scratch/head-fn/pipeline.ts`, `git show HEAD:` of the deployed
  function beside an `_engine` copy `git diff` reports identical to HEAD. That is
  what a player gets today.
- **DERIVED** is the code as it now stands.

Rows come from `.shots/pool-snapshot.json`, verbatim `cards_unique` rows, because
the live `color_identity=cd.{...}` pool query still returns `57014` statement
timeouts. One column is patched in: `edhrec_rank`, from `scratch/edhrec-live.json`,
33,032 values paged off `cards_unique` on 23 Aug 2026 — the same single
substitution `ENGINE-PICKS.md` made, and for the reason in the caveat above.

### HEAD: one table of fixed numbers for every commander

```
commander                 what it should be        crea  I/S  arti  ench  land  mean
Krenko, Mob Boss          token swarm                28   14    18     2    35  2.23
Talrand, Sky Summoner     spellslinger               31    8    21     4    35  2.33
Meren of Clan Nel Toth    reanimator                 38    8    15     3    35  2.28
Tatyova, Benthic Druid    lands                      33   10    13     8    35  2.27
Sram, Senior Edificer     voltron                    25    5    30     4    35  2.23
Grand Arbiter Augustin IV control                    28   19    12     4    35  2.06
Muldrotha, the Gravetide  no record at all           27   22    12     3    35  2.03
Edgar Markov              tribal                     35   11    11     5    35  2.20

mean pairwise nonland overlap 12.1%   nonland cards in all eight: 1
creature spread 25 to 38          land spread 35 to 35
```

Every deck in the format runs 35 lands. Talrand, whose entire card is "whenever
you cast an instant or sorcery spell, create a 2/2 Drake", got **31 creatures and
8 instants and sorceries**.

### DERIVED: the shape read off each commander's own record

```
commander                 what it should be        crea  I/S  arti  ench  land  mean
Krenko, Mob Boss          token swarm                29   15    14     3    38  2.62
Talrand, Sky Summoner     spellslinger               13   35     9     3    39  2.42
Meren of Clan Nel Toth    reanimator                 31   13    15     3    37  2.52
Tatyova, Benthic Druid    lands                      24    7    20     7    42  2.44
Sram, Senior Edificer     voltron                    17   12    31     1    38  2.31
Grand Arbiter Augustin IV control                    19   16    18     6    40  2.05
Muldrotha, the Gravetide  no record at all           21   24    16     3    35  1.84
Edgar Markov              tribal                     37   10     4     1    43  2.66

mean pairwise nonland overlap 6.9%   nonland cards in all eight: 0
creature spread 13 to 37          land spread 35 to 43
```

Talrand's instants and sorceries go **8 to 35**. Overlap across all 28 pairs
falls from 12.1% to 6.9%, and the one card that was in all eight decks is in none.

### Would a player call each one recognisable?

Judged from the finished lists in `scratch/shape-measure.json`, honestly, one at
a time.

| deck | verdict |
|---|---|
| **Krenko, token swarm** | **Yes.** 29 creatures and the spells are General Kreat, Breeches, Eager Pillager, Howlsquad Heavy, Enterprising Scallywag, Ib Halfheart, Goblin Tactician, Goblin Glasswright. It is a Goblin deck. A player would want more than 29 bodies. |
| **Talrand, spellslinger** | **Yes, and it is the clearest win.** 13 creatures, 35 instants and sorceries: An Offer You Can't Refuse, Case of the Ransacked Lab, Aether Channeler, Eldrazi Confluence, Glimmerburst. Head gave the same commander 31 creatures and 8 spells. |
| **Meren, reanimator** | **Partly.** Blood Artist, Cordial Vampire, Falkenrath Noble, Dauthi Voidwalker, Gate to the Afterlife and Deadly Dispute are the right deck. But Bloated Contaminator, Bloom Hulk, Core Prowler, Evolution Sage and Pollenbright Druid are proliferate cards, pulled in because Meren's *experience counter* reads as `eff:add-counters` and the plan cannot tell one counter from another. That is a vocabulary gap, named below. |
| **Tatyova, lands** | **Yes.** 42 lands is the most in the eight and this is the deck that should have the most. Breeding Pool, Boseiju, Hinterland Harbor, Dreamroot Cascade, Flooded Grove, Hedge Maze, Botanical Sanctum, Dryad Arbor, plus Khalni Heart Expedition. Only 7 instants and sorceries, which is right for a deck that wins by playing lands. |
| **Sram, voltron** | **Mostly.** 31 artifacts, and Sword of Fire and Ice, Skullclamp, Zephyr Boots, Skeleton Key, Wrench and Mesa Enchantress are the deck. Jack-o'-Lantern and Bagel and Schmear are not. The shape is right and the card quality inside it is the ranker's problem, not this one's. |
| **Grand Arbiter, control** | **Yes, and it should not have been.** Nine counterspells and Chalice of the Void, from a commander the engine reads no want from at all. The interaction floor of 6 and the colour-identity fallback did that between them. |
| **Muldrotha, no record** | **It is a deck.** 99 cards, 35 lands, 21 creatures, 24 instants and sorceries, every floor filled. It is not a *Muldrotha* deck, because nothing in this engine can currently read what Muldrotha does. |
| **Edgar Markov, tribal** | **Yes.** Sorin, Captivating Vampire, Vampire Nocturnus, Kalitas, Drana, Elenda, Strefan, Bartolomé del Presidio. It also holds 6 removal and 6 interaction, which the 58-creature version did not. |

### Style still moves it, and cannot invent a shape the commander does not have

Creature counts in the finished decks:

```
             Krenko  Talrand  Meren  Tatyova  Sram  Arbiter  Muldrotha  Edgar
creatures      37      16      39      28      20     20        26       46
balanced       29      13      31      24      17     19        21       37
spells         24      10      24      24      17     18        15       28
```

A Talrand deck in creature mode holds 16 creatures. A Krenko deck in spell mode
holds 24. Neither is 24-by-declaration; the style tilts the derived share a
quarter each way and cannot turn a spellslinger into a creature deck, which is
right, because asking for one is asking for a worse Talrand deck.

Head has no style parameter at all, so it has one row and cannot have three.

---

## The connection, because a fix that is not called is not a fix

Two things had to change outside the engine or none of the above would reach a
player. This is the seventh time on this project that mattered.

1. **`pipeline.ts` passed `landTarget` on every build.** The line read
   `clamp(config.minLandCount ?? 36, 30, 42)`, `minLandCount` defaults to 35, and
   nothing had ever changed it. An explicit caller number still overrides the
   solve, so every deck this function has ever built ran 35 lands. It now passes
   a land target **only when an admin actually set one**: `loadAdminConfig`
   reports which keys were present in `AI_BUILDER_CONFIG`, and a default nobody
   chose no longer speaks.

2. **`minRampCount`, `minDrawCount` and `minRemovalCount` were declared and never
   read.** They have sat in `AdminConfig` with defaults of 10, 10 and 8 since it
   was written, and nothing looked at any of them. They are connected now, under
   the same rule: only when explicitly set. Connecting the *defaults* would put
   ramp 10 / draw 10 / removal 8 straight back onto every deck.

The style picker in `ConfigureStage.tsx` no longer prints "At least 32
creatures". It cannot: the number differs per commander now, so any figure on
that screen would be a promise the builder cannot keep.

---

## Known and not fixed

1. **The live pool query still times out.** `color_identity=cd.{...}` on
   `cards_unique` returns `57014`. Nothing here reaches a player until that is
   fixed. Unchanged from the last pass and still the biggest item.
2. **`eff:add-counters` cannot tell one counter from another**, which is why
   Meren's deck holds proliferate cards. `ctr:` facets exist and carry the kind;
   the `PLAN_RULES` entry does not read them.
3. **The implied curve is more expensive than the deck the ranker builds.**
   Edgar's implied mean is 3.65 and his finished deck's is 2.66, so the land
   solve is answering for a deck slightly richer than the one that gets built.
   That gap is `ENGINE-PICKS.md` handover 1, the ranker's preference for cheap
   cards, and it is unchanged.
4. **More lands means more bad lands.** Raising Edgar to 43 lands pulls in Gond
   Gate, Gateway Plaza, Holdout Settlement and Heap Gate. `pickLands` has three
   tiers and no quality signal inside a tier beyond popularity, and the fourth
   tier was tried and removed for making the Mardu mana base worse.
5. **The derivation costs about 40 ms** of a roughly 1,100 ms build. Measured by
   instrumenting `deriveDeckShape`: doers 3-12 ms, land solve 3-8 ms, ramp solve
   0-3 ms, function share 12-30 ms. The rest of the build time is ranking, and it
   is not new.
6. **Muldrotha still gets no plan**, and no amount of shape derivation changes
   that. The fix is in the ability compiler, not here.
