# Decks against the world

> Readable version: https://claude.ai/code/artifact/24689754-ce03-4ed1-838a-3f8c464fe5d5

Seventeen decks built, read card by card, and judged the way a Commander player
has to judge a deck: would I sleeve this and take it to a table.

Everything below was measured on 2026-08-29 between 22:11 and 22:35 UTC against
the live deployment, the live catalogue, Scryfall, and EDHREC. Nothing is taken
from `.shots/pool-snapshot.json`.

---

## Read this first: the reports being reviewed measured a build that no longer exists

`ai-deck-builder-v2` and `deck-optimizer` were both redeployed at
**2026-08-29T22:11:28Z**, which is roughly eight minutes before this review
started. Read from the management API:

    ai-deck-builder-v2   version 75   updated_at 1788041488090  = 2026-08-29T22:11:28Z
    deck-optimizer       version 38   updated_at 1788041488090  = 2026-08-29T22:11:28Z

The two commits in that deploy are `77d5322 Three and four colour commanders can
be built again` and `1b9204b The engine has an opinion about three commanders in
four, not one in two`. They are fixes for the two headline findings of the
reports under review.

So the first duty of this review is to say which of those findings still stand.
Every deck in this document was rebuilt against version 75. The version was
re-read at the end of the run and had not moved, so all seventeen decks came out
of one build.

### The colour cliff has moved, and the recommendation that rested on it is void

The claim was: *"The deployed generator cannot build a deck for any commander
with three or more colours. 0 of 21 attempts across seven three-plus-colour
commanders."* Re-run against version 75, same seven commanders, three attempts
each:

| commander | colours | built |
|---|--:|--:|
| Lord Windgrace | 3 | 3/3 |
| Uril, the Miststalker | 3 | 3/3 |
| Edgar Markov | 3 | 3/3 |
| Kaalia of the Vast | 3 | 3/3 |
| Atraxa, Praetors' Voice | 4 | 3/3 |
| Najeela, the Blade-Blossom | 5 | **0/3** |
| Golos, Tireless Pilgrim | 5 | **0/3** |

Two more three-colour commanders nobody in the earlier passes touched, chosen to
avoid inheriting their sample: **Muldrotha, the Gravetide 3/3** and **Alela,
Artful Provocateur 3/3**.

The wall is at **five colours**, not three. Both five-colour failures are
`546 WORKER_RESOURCE_LIMIT`. "Nothing else matters until three-colour commanders
build" is no longer the right order of work, and this document does not repeat
it.

The two-colour flakiness is nearly gone but not gone: across the rebuild sweep
Niv-Mizzet needed two attempts, every other one-colour and two-colour commander
answered first time.

---

## The verdict

**No. Not one of the seventeen decks is a deck I would sleeve as built.** One of
them, Yuriko, is close enough that I would fix it rather than start again.

The decks are legal, honestly priced, and every card carries a written reason,
which is more than Moxfield or Archidekt offer. But the reason is frequently
wrong, and it is wrong in a way that is worse than saying nothing. Two of the
five decks I read end to end were built around a plan the engine invented for a
commander whose defining line it cannot read, and both are unplayable because of
it.

The clearest single number in this review: the deck the engine had **no opinion
about at all** (Teysa, zero wants) is markedly better than the two decks the
engine had a **confident wrong opinion** about (Ghalta and Feather, five wants
each).

---

## 1. Three decks read end to end

### Ghalta, Primal Hunger. I would not play this. It cannot cast its own commander.

Ghalta reads: *"This spell costs {X} less to cast, where X is the total power of
creatures you control. Trample."* That first line is the entire deck.

What the engine sees, printed from the shipping `facetsForCard` plus
`planForCommander` against the live catalogue:

    facets: kw:trample rec:partial sub:dinosaur sub:elder type:creature type:legendary
    wants:  0.75 sub:equipment
            0.65 sub:aura
            0.6  eff:pump
            0.5  cares:sub:equipment
            0.45 cares:sub:aura

The cost reduction is invisible. All that survives is `kw:trample`, and the
fallback added in `1b9204b` reads a record made only of combat keywords as a
Voltron commander. Every card in the deck carries the sentence *"Ghalta, Primal
Hunger has trample and no other ability we can read, so the deck is built around
getting it through."*

What came out:

| | |
|---|--:|
| Equipment | **29** |
| Auras | 8 |
| creatures | 30 |
| **total printed power across all 30 creatures** | **35** |
| **highest power of any creature** | **2** |
| creatures with power 4 or more | **0** |
| lands | **29** |
| basic Forests | **2** |
| spells that search for a basic land | 9 |

Power distribution across the 28 creatures with a printed power: three at 0,
fifteen at 1, ten at 2.

Ghalta costs `{10}{G}{G}` minus total board power. To cast her for `{G}{G}` you
need ten power on the battlefield. The best this deck can do is 2 power per
creature, so you need five creatures out before she is even castable at four
generic, and the deck has no way to make that happen quickly. **In a normal game
of Commander you never cast your commander.**

Twenty-nine lands is fewer than any of the 192 real Commander decklists we hold
(`meta_decks`, minimum 34, median 38, none at 33 or fewer, verified by query
against the live database). Two Forests supporting nine basic-land searchers is
the same fetch-over-basics fault the earlier passes reported, and it is still
live.

Against [EDHREC's Ghalta page](https://edhrec.com/commanders/ghalta-primal-hunger)
(8,722 decks): **2 of the top 25 present**, and one of those is Forest. Missing
Llanowar Elves 81%, Garruk's Uprising 73%, Sol Ring 73%, Elvish Mystic 72%,
Goreclaw 65%, Return of the Wildspeaker 60%, Rishkar's Expertise 56%,
Gigantosaurus 55%.

**Cut** all 29 Equipment and all 8 Auras. That is 37 slots and none of them do
anything for this commander. **Add** the mana dorks (Llanowar Elves, Elvish
Mystic, Fyndhorn Elves, Llanowar Tribe), the actual fat (Gigantosaurus, End-Raze
Forerunners, Terastodon), the trample and draw payoffs (Garruk's Uprising,
Return of the Wildspeaker, Rishkar's Expertise), Beast Within and Ram Through for
interaction, seven more lands, and about fifteen more Forests.

### Teysa Karlov. Closest to playable of the three, and it is missing the one card the deck is about.

Teysa's plan is empty. Coverage `manual`, `fromTagsOnly: true`, and **zero
wants**, so the deck was assembled from archetype, role targets and global
popularity with no commander signal at all.

It is still the best of the three, and the card pool is genuinely the archetype:
Blood Artist, Zulaport Cutthroat, Cruel Celebrant, Elas il-Kor, Vengeful
Bloodwitch, Falkenrath Noble, Sanctum Seeker, Marionette Apprentice, Pitiless
Plunderer, Ayara, Skullclamp, Smothering Tithe, Black Market Connections,
Phyrexian Arena, Deadly Dispute, Anguished Unmaking, Infernal Grasp. 13 of
EDHREC's top 25 for [Teysa](https://edhrec.com/commanders/teysa-karlov) (21,241
decks).

**And it has no free sacrifice outlet.** Five cards in the deck can sacrifice a
creature. Phyrexian Tower taps and works once a turn. Vampiric Rites charges
`{1}{B}` each time. Popular Egotist charges `{1}{B}` and gives you indestructible
on itself. Commissar Severina Raine and Denethor do not sacrifice on demand at
all. Teysa doubles death triggers, so with six drain creatures on board the deck
should be able to convert a board into fifty damage at instant speed; instead it
waits for opponents to kill things.

Missing Viscera Seer 71%, Ashnod's Altar 69%, Carrion Feeder, Reassembling
Skeleton 60%, Sol Ring 90%, Arcane Signet 83%, Swords to Plowshares 67%.

It also runs **Liliana's Contract** filed as `[wincon]`, which needs four Demons
with different names. The deck holds **zero Demons**. That exact card was flagged
in an earlier pass and is still being picked.

**Cut** Liliana's Contract, Hunted Bonebrute (gives an opponent two blockers),
Rotten Reunion, Dross Harvester, Dimension X Pizzasaur, Elspeth Sun's Nemesis,
Hierophant's Chalice. **Add** Viscera Seer, Ashnod's Altar, Carrion Feeder,
Reassembling Skeleton, Sol Ring, Arcane Signet, Swords to Plowshares. That is a
deck I would sleeve.

### Yuriko, the Tiger's Shadow. The best deck the engine builds, and I would still not take it to a table without changes.

This is the one where the engine reads the commander correctly:

    facets: cares:sub:ninja rec:partial sub:human sub:ninja trig:deals-damage
    wants:  1.0 cares:sub:ninja
            1.0 sub:ninja
            1.0 tok:ninja

And the deck follows: 36 creatures, **36 of them Ninjas**, 26 cards with
ninjutsu, and **17 of EDHREC's top 25** for
[Yuriko](https://edhrec.com/commanders/yuriko-the-tigers-shadow) (31,797 decks),
including Ingenious Infiltrator 86%, Thousand-Faced Shadow 85%, Prosperous Thief
84%, Mistblade Shinobi 78%, Silver-Fur Master 78%, Ninja of the Deep Hours 75%.
It is the only deck in the seventeen with Sol Ring except one.

Two faults, both arithmetic rather than taste:

1. **Ninjutsu needs an unblocked attacker and the deck has one.** Exactly one
   creature at mana value 1 (Thousand-Faced Shadow) and no Ornithopter, no
   Changeling Outcast (90% of real Yuriko decks), no Slither Blade, no Faerie
   Seer, no Tetsuko. Twenty-six ninjutsu cards with nothing to return.
2. **The payoff points the wrong way.** Yuriko deals damage equal to the revealed
   card's mana value. Mean mana value of the nonland cards is 2.79, the maximum
   is 6, and **41 of the 99 cards are lands**, which reveal for zero. So a trigger
   is worth about 1.6 damage on average across the whole deck.

**Cut** ten lands and the one-shot damage artifacts (Shuriken, Throwing Knife,
Foot Chopper). **Add** Changeling Outcast, Ornithopter, Slither Blade, Faerie
Seer, Tetsuko, Brainstorm, and two or three genuinely expensive cards for the
flip (Treasure Cruise and Dig Through Time are mana value 8 and cost one blue).
Then it is a real deck.

---

## 2. Two commanders nobody above chose

Picked to test different things and to be gradeable in one read.

### Feather, the Redeemed (RW). The worst result in the review, and it is a regression.

Feather: *"Whenever you cast an instant or sorcery spell that targets a creature
you control, exile that card instead of putting it into your graveyard as it
resolves. If you do, return it to your hand at the beginning of the next end
step."*

Requested `archetype: value`, `style: spells`. Built 4/4 attempts, roughly 3 to
5 seconds each.

**The deck contains one instant and one sorcery.**

| | |
|---|--:|
| creatures | 17 |
| **instants** | **1** (Expedite) |
| **sorceries** | **1** (Rile) |
| artifacts | 25, of which **24 are Equipment** |
| enchantments | 17, of which 13 are Auras |
| lands | 38 |

Feather's own plan, printed from the shipping code:

    facets: kw:flying rec:partial sub:angel type:creature type:legendary
    wants:  0.75 sub:equipment
            0.65 sub:aura
            0.6  eff:pump

Byte for byte the same plan as Ghalta. Her rebound clause is unreadable to the
compiler, `kw:flying` is all that is left, and the new Voltron fallback builds an
Equipment deck. Every card in the list says so: *"Feather, the Redeemed has
flying and no other ability we can read, so the deck is built around getting it
through."*

This is worse than the silence it replaced. Flying on an Angel is a creature
type convention, not a strategy. The fallback cannot tell "combat is all this
card says" from "combat is all we managed to read", and on Feather it produced a
deck that ignores the requested style entirely.

Against [EDHREC](https://edhrec.com/commanders/feather-the-redeemed) (13,405
decks): **6 of the top 25**, and five of those six are lands. The one spell it
found is Expedite at 81%. Missing Defiant Strike 86%, Shelter 83%, Arcane Signet
83%, Zada Hedron Grinder 75%, Sol Ring 75%, Storm-Kiln Artist 74%, Gods Willing
73%, Fists of Flame 72%.

### Yawgmoth, Thran Physician (mono black). Reads one line of the card backwards.

Yawgmoth's line is **"Protection from Humans"**. The engine's plan:

    wants:  1.0 cares:sub:human
            1.0 sub:human
            1.0 tok:human
            0.9 ctr:-1/-1
            0.9 eff:add-counters
            0.8 eff:proliferate
            0.7 eff:draw

The `-1/-1` counters and proliferate are right. The top three wants, at the
highest weight in the plan, are the result of reading "protection **from**
Humans" as "cares about Humans". The deck is **24 Humans out of 33 creatures**,
and one of the optimiser's own suggestions says the quiet part out loud:
*"Yawgmoth, Thran Physician is a human that counts humans."*

Then the archetype's engine is missing:

| | |
|---|--:|
| creatures with undying or persist | **0** |
| Blood Artist / Zulaport Cutthroat | **0** |
| repeatable free sacrifice outlets besides the commander | 0 |

Yawgmoth plus an undying creature plus a drain is the reason people play him. Of
[EDHREC's](https://edhrec.com/commanders/yawgmoth-thran-physician) top 25 (7,075
decks) the deck has 6: Swamp, Pitiless Plunderer 71%, Bastion of Remembrance 67%,
Cabal Coffers 64%, Ayara 55%, Phyrexian Tower 54%. Missing Sol Ring 91%, Zulaport
Cutthroat 85%, Blood Artist 85%, Nest of Scarabs 81%, Dark Ritual 80%, Ophiomancer
74%, Butcher Ghoul 73%, Pawn of Ulamog 69%, Geralf's Messenger 68%.

It also holds Liliana's Contract with zero Demons, the second deck in the
seventeen to do that.

**Quality does not hold outside the sample. It gets worse**, because both of my
commanders have a defining line the compiler cannot read, and the engine now
fills that silence with a confident guess instead of leaving it empty.

---

## 3. The original complaint, verified fresh

*"Would always give artifacts colourless."* Counted over the nonland cards of
every deck, because a colourless land is not what the complaint was about.

| deck | identity | nonland cards | colourless | share | artifacts | on-colour |
|---|---|--:|--:|--:|--:|--:|
| kozilek | C | 68 | 68 | 100% | 66 | 0 |
| uril | WRG | 60 | 1 | 2% | 2 | 59 |
| edgar | WBR | 59 | 3 | 5% | 2 | 56 |
| kaalia | WBR | 50 | 3 | 6% | 4 | 47 |
| adeline | W | 64 | 5 | 8% | 5 | 59 |
| nivmizzet | UR | 57 | 5 | 9% | 7 | 52 |
| gaaiv | WU | 61 | 6 | 10% | 5 | 55 |
| teysa | WB | 59 | 6 | 10% | 9 | 53 |
| windgrace | BRG | 58 | 9 | 16% | 9 | 49 |
| yuriko | UB | 58 | 11 | 19% | 17 | 47 |
| atraxa | WUBG | 60 | 12 | 20% | 13 | 48 |
| alela | WUB | 60 | 15 | 25% | 21 | 45 |
| meren | BG | 60 | 16 | 27% | 17 | 44 |
| muldrotha | UBG | 59 | 18 | 31% | 18 | 41 |
| **yawgmoth** | B | 59 | 18 | 31% | 22 | 41 |
| **feather** | WR | 61 | 20 | 33% | 25 | 41 |
| **ghalta** | G | 70 | **32** | **46%** | **33** | 38 |

**The systemic version of the complaint is fixed.** Fourteen of seventeen decks
are between 2% and 31% colourless, against a median of 8 colourless nonland cards
in the 192 real Commander decklists we hold. Kozilek at 100% is correct: his
colour identity is empty, so every legal card is colourless.

**A specific version of it is not.** Three decks are a third to a half
colourless artifacts, and all three are decks where the engine invented a
Voltron plan. This is the complaint reappearing through a new door.

And here is the sharp end of it. Ghalta is mono green. Kozilek is colourless.
They share **27 nonland cards**:

> Sword of the Animist · Bitterthorn, Nissa's Animus · Case of the Shattered
> Pact · Skullclamp · Buster Sword · Skateboard · Silver Shroud Costume · Saw ·
> Thornbite Staff · Sword of Fire and Ice · Captain America's Shield · Orcrist,
> Goblin-cleaver · Oathkeeper, Takeno's Daisho · Sword of Hearth and Home · Mask
> of Memory · Arm-Mounted Anchor · Paradise Mantle · Sword of Forge and Frontier
> · Sword of Wealth and Power · Zephyr Boots · Lotus Ring · It That Heralds the
> End · Crashing Drawbridge · Weathered Sentinels · Hedron Scrabbler · Chrome
> Dome · Skeleton Key

Across all 136 pairs the mean overlap is 2.6 nonland cards, which is healthy.
Ghalta and Kozilek at 27, Feather and Kozilek at 15, Feather and Ghalta at 14
are not.

---

## 4. Five optimiser suggestions, checked one at a time

Engine `deck-optimizer/6-engine-only`, read from `analysis.engine.version`. It
still sets no version header. Rules text from Scryfall, play rates from each
commander's own EDHREC page.

**1. Feather: cut Purphoros, God of the Forge ($28.74) for Cathar's Shield
($0.23).** Cathar's Shield is a `{0}` Equipment: "Equipped creature gets +0/+3
and has vigilance. Equip {3}." Three mana to give something three toughness. Not
on Feather's EDHREC page at any inclusion. A player would laugh at this.

**2. Feather: cut The Mightstone and Weakstone ($4.88) for Bone Saw ($0.09).**
Bone Saw: "Equipped creature gets +1/+0. Equip {1}." The card it replaces draws
two cards or kills a creature and then taps for `{C}{C}`. Not on the page.

**3. Feather: cut Swordsman's Steel ($12.62) for Kite Shield ($0.24).** Kite
Shield: "+0/+3. Equip {3}." Not on the page. Three of the ten swaps offered to
this deck are `{0}` Equipment with equip 3, which is among the least playable
card templates printed.

**4. Yawgmoth: cut Darksteel Reactor for Avacyn's Collar,** reason *"Yawgmoth,
Thran Physician is a human that counts humans."* Avacyn's Collar is EDHREC rank
19,145 globally and does not appear on Yawgmoth's page. The reason is the
protection misread quoted back to the player as justification.

**5. Yawgmoth: cut The One Ring for Hangarback Walker.** The optimiser priced the
cut card at $98.13 and Scryfall's default printing is $114.26 today, so both
numbers are real and neither is small. Hangarback Walker is a defensible Yawgmoth
card and I would not object
to adding it. Cutting The One Ring for it, in a deck the same response says is
short of removal, is not a trade a player makes. The One Ring is in 8% of
Yawgmoth decks, Hangarback Walker in none the page lists.

For the record, four suggestions in the same run were good: Walking Ballista into
Yawgmoth (EDHREC rank 431, correct card, correct commander), and three of the
land swaps.

**Two more optimiser faults confirmed still live.** Ghalta's summary reads
*"29 lands against 37 for the format. Short of: land 29/36"*, which names two
different land targets in one sentence, and then offers **zero** land additions
to a deck it has just called seven lands short. Prices behaved: across 1,646
deck rows there was one null USD price and **zero** rendered as `$0.00`.

---

## 5. Legality: seventeen for seventeen

Every printing id was sent to `api.scryfall.com/cards/collection` and judged on
what came back. The ban list was fetched the same day from Scryfall
`banned:commander` and holds 83 cards.

| check | result |
|---|---|
| 100 cards including the commander | 17 / 17 |
| singleton outside basic lands | 17 / 17 clean |
| colour identity | 17 / 17 clean |
| banned cards in the 99 | 0 |
| banned commander | 0 |
| commander legal in the format | 17 / 17 |
| our row disagreeing with Scryfall on name, type line or colour identity | **0 of 1,646** |

Our catalogue has not drifted from Scryfall. Either source answers a legality
question the same way.

---

## 6. Faults that show up in every deck, counted

Measured across all seventeen decks at once.

| fault | count |
|---|---|
| role gap counters frozen ("Fills a draw gap (0 of 6)" repeated) | **102 roles frozen, 0 that advance** |
| cards whose reason reads "Fills a interaction gap" | 85 |
| cards whose role label disagrees with the gap its own reason claims to fill | 155 |
| cards labelled `[ramp]` that add no mana, fetch no land and reduce no cost | **45 of 160 (28%)** |
| decks containing Sol Ring | **2 / 17** |
| decks containing Arcane Signet | **1 / 17** |
| decks containing Command Tower | 17 / 17 |
| white decks containing Swords to Plowshares or Path to Exile | **0 / 9** |
| green decks containing Cultivate | **0 / 6** |
| decks containing Lightning Greaves or Swiftfoot Boots | **0 / 17** |

That last row is worth a sentence on its own. The engine decided two of these
decks were Voltron decks and filled them with 24 and 29 Equipment, and **neither
of the two Equipment every Voltron deck in Magic actually runs appears in any
deck it has ever built.**

Land counts run from **29** (Ghalta) to **49** (Kaalia). The 192 real Commander
decklists in `meta_decks` run 34 to 47 with a median of 38 and 178 of 192 between
36 and 40. Basics run 0 to 8 with a median of 4, against a real median of 19.

---

## 7. Build gates

| gate | result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | clean, exit 0 |
| `npm test` | **2,911 pass, 0 fail**, 159 suites, 36.0 s |
| `npx deno check supabase/functions/ai-deck-builder-v2/index.ts` | clean |
| `npx deno check supabase/functions/deck-optimizer/index.ts` | clean |

Nothing was committed and nothing was deployed.

---

## Is this the best deck builder on the market?

No.

**Where it is already ahead of Moxfield and Archidekt:** neither of them builds a
deck at all, and neither explains a card choice. Every pick here carries the role
it fills, what the commander wants, the chance you can pay for it on curve, and
how widely it is played. Legality is perfect. Prices are honest, with a missing
price printed as nothing rather than as zero. Yuriko is a real deck and Teysa is
close to one.

**The three things standing between it and best on the market:**

**1. The engine guesses when it cannot read the commander, and a wrong guess
costs more than silence.** Ghalta's cost reduction, Feather's rebound and
Yawgmoth's protection are the three lines those decks are about, and the compiler
read none of them. Ghalta and Feather then received an invented Voltron plan and
are the two worst decks in the set; Teysa received no plan at all and is one of
the two best. The fallback added in `1b9204b` cannot distinguish "combat is all
this card says" from "combat is all we managed to read", and until it can, it
should not outrank the archetype the player asked for. The deeper fix is card
coverage: 587 of 3,153 commander-legal legendary creatures still produce no wants
at all.

**2. It does not know what people play with a given commander.** Sol Ring in 2 of
17 decks against 73% to 96% inclusion on the relevant pages. Arcane Signet 1 of
17. Swords to Plowshares in none of nine white decks. `edhrec_rank` is one global
number and it cannot tell Adeline from Kozilek, which is why every deck opens
with the same fifteen lands and why "played in a lot of decks" appears under
cards nobody plays with that commander. `meta_card_inclusion` is the right shape
and its per-commander scope is empty because precons give about one deck per
commander. Closing that needs a many-decks-per-commander source, and every
candidate is off limits without written permission. That is a licensing decision,
not an engineering one.

**3. Nothing reads the finished 99 before handing it over.** One pass over the
completed deck catches all of this at once: a commander that cannot be cast
because the board has 35 total power, 29 lands when no real deck runs under 34,
two Forests behind nine basic-land searchers, Liliana's Contract with zero
Demons in two separate decks, 45 cards labelled as ramp that make no mana, 85
sentences reading "a interaction", and 102 role counters frozen at their starting
value. None of these need new card knowledge. They need the deck to be read once
more before it ships.

---

## Files

New scripts, none committed:

- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\decks-against-the-world.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\world-build-all.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\world-audit.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\world-decklist.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\world-optimise.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\world-edhrec-check.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\voltron-fallback-audit.mjs`
- `C:\Users\natha\Desktop\Software\Deckmatrix\scripts\plan-probe.mjs`

Data under `C:\Users\natha\Desktop\Software\Deckmatrix\.shots\world\` (gitignored):
seventeen `*.deck.json` builds, five `*.txt` full decklists, `audit.json`,
`colourless.json`, `edhrec-check.json`, `optimise.json`, `scryfall-cache.json`,
`ban-list.json`, `build-index.json`, `cliff-recheck.json`.

No owned source file was changed. Nothing was committed. Nothing was deployed.
