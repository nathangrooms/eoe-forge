# Homepage copy audit — every line judged

**Date:** 22 Aug 2026 · **Scope:** `src/components/marketing/**`, `src/pages/Homepage.tsx`
**Status:** judgement only. No code changed.

The owner's note, which everything below follows from:

> "lots of weird jargon in the text ... you say things like 'card goes sideways' as if people
> dont know what tapping is ... most text is a load of rubbish, also assess whether certain
> text is even needed to streamline"

The rule this audit applies is **not** "avoid Magic terms". It is:

- **Magic vocabulary: yes.** Tapped, commander, mana value, colour identity, precon, sideboard,
  singleton, ramp, wipe, finisher, curve, bracket. These are the words the reader uses.
- **Marketing language: never.** Seamlessly, powerful, unlock, revolutionise, supercharge.
- **Invented paraphrase: never.** "Tapped means turned sideways" is not plain English serving a
  newcomer. It is the word *tapped* explained to somebody who has never held a card, on a page
  selling a Magic collection manager. It tells the reader the product does not know who they are.
- **Product-invented vocabulary: never.** "Portability", "deck context", "snapshots", "rules
  engine", "row out of the card table".

## Verdict key

| | |
|---|---|
| **KEEP** | true, specific, and something a player wants to know |
| **REWRITE** | right idea, wrong words |
| **CUT** | earns nothing. The picture already said it, or it is filler |

## Headline count

**166 lines judged. 54 KEEP, 46 REWRITE, 66 CUT.** Roughly 40% of the words on this page
should not be replaced, they should be deleted. Four whole sections are candidates for removal.

---

## Six patterns that account for most of the rubbish

**1. The page keeps defending itself against the old homepage.**
The 2026 rewrite deleted fabricated testimonials and `Math.random()` prices, and the replacement
copy has never stopped apologising for them. Five sections open by insisting the data is real:
"Real cards. Real costs. Real prices.", "Every card below is a real row out of the card table",
"None of it is typed in by hand", "Nothing here is drawn", "it all ran in your browser as this
page loaded". A visitor never doubted it. They cannot even see the thing being denied. This
reassurance belongs in the code comments, where it already is and where it is genuinely useful.
**This one pattern is about 20 lines of pure deletion.**

**2. Captions describe the picture directly above them.**
"Cards sit in rows the way they do on a real table, lands in their own row underneath" sits
above a photograph of exactly that. "Every panel is turned to face the person sitting at it"
sits under a photograph of exactly that. A screenshot plus a heading plus one line is the
finished shape of most of these sections.

**3. The game gets explained back to the player.**
`HomePlayTable`: "tapped means turned sideways". `HomeTournaments`: "Three points for a win and
one for a draw". `HomeSearch`: "in the order Scryfall ranks them by how often people play them"
(that is EDHREC rank, and they know it). `HomePower` invents four riddles — "The card that wins
it slowly" — for cards the audience calls value engines, finishers and board wipes.

**4. Two copy-rule breaches, verified.**
Em-dashes in user-facing text, banned by CLAUDE.md copy rule 2. Exactly two, both in captions:
`HomePlayTable.tsx:63` and `HomeSections.tsx:168`. Every other `—` in the folder is a code
comment or the type-line splitter in `HomePortability`, and those are fine.

**5. Same fact, three times, in one section.**
`HomeLifeCounter` names commander damage / poison / energy / full screen / screen-awake in the
lead, then again as six chips 40px below, then the picture shows it. `HomeTutor` prints eight
stat tiles and then has the answer read those same eight numbers aloud. `HomePortability`
describes the four line shapes in prose and then prints the four line shapes as chips.

**6. Two live defects found while reading, both user-visible right now.**

- **`#features` in the public nav is a dead anchor.** `PublicNavigation.tsx:10` links to
  `#features`. The only `<Section id="features">` is in `HomeFeatures`, which `Homepage.tsx` does
  not render. Clicking "Features" in the header does nothing.
- **The marketplace section is currently showing its empty state.**
  `src/data/homepage-snapshot.json` has `sections.priceTracking = null`, so every visitor to
  `deckmatrix.com` reads "No price history to chart yet" and "Nothing on the watch list yet."
  under a heading that says "Watch the price before you buy it". The snapshot is also dated
  **19 Aug**, three days stale.

---

# Section by section, in the order the page renders them

## 1. `HomeHero`

| Line | Text | Verdict | Why |
|---|---|---|---|
| h1 | "Your collection. / Finally organised." | **KEEP** | Plain, true, and it is the actual promise. |
| lead | "Track every card you own, right down to the box it is sitting in. Then build decks that already know what is on your shelf." | **KEEP** | Names the differentiator in the first ten words. The strongest sentence on the page. |
| meta | "33,000+ cards · synced nightly from Scryfall" | **KEEP** | One number, read from the catalogue, and Scryfall is the right authority to name. |
| cta | "Start free" / "Sign in" | **KEEP** | |

Nothing to cut. This section is finished.

## 2. `HomeShowcase` — cut the whole section

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Real cards. Real costs. Real prices." | **CUT** | Pattern 1, and a rhetorical triple, which is advertising cadence. Nobody suspected the cards were fake. |
| lead | "Every card below is a real row out of the card table, refreshed with the catalogue every night." | **CUT** | "a real row out of the card table" is database vocabulary. The reader does not have a table. |
| lead (sm+) | "It is the same card data the deck builder, your collection and the marketplace all run on." | **CUT** | Architecture, described to a customer. |
| panel 1 title | "Every detail, straight off the card" | **CUT** | |
| panel 1 body | "Name, type, printing, mana cost and what it sells for. None of it is typed in by hand, and mana costs show as proper symbols." | **CUT** | "None of it is typed in by hand" is pattern 1. "mana costs show as proper symbols" is visible in the rows underneath, and is table stakes. |
| panel 2 title | "See the curve" | **CUT** | |
| panel 2 body | "Worked out from the real mana costs of the cards above. The deck builder does the same sum on your own deck." | **CUT** | It draws a curve over **twelve expensive unrelated cards**. That is not a deck. An EDH player reads a curve over a non-deck as a bug. |
| cta | "Start building" | **CUT** | Third CTA before the fold. |

**Recommendation:** delete the section. Move the full-bleed card marquee up into the hero,
where a wall of recognisable art is doing real work, and drop everything else. Saves a screen
and a half.

## 3. `HomeCatalogue` (in `HomeStats.tsx`)

| Line | Text | Verdict | Why |
|---|---|---|---|
| tile 1 | "33,000+ / Cards in the catalogue / one row per card, updated from Scryfall every night" | **REWRITE** | "one row per card" is a database sentence. It exists to explain that we no longer count printings. The reader does not need to know we ever did. |
| tile 2 | "3,500+ / Legendary creatures / every one of them a legal commander" | **REWRITE** | **Accuracy risk.** Not every legendary creature is a legal commander: banned legends, Un-set legends and non-creature-side faces all fail it. This is the shape of overstatement the owner has already had to correct. |
| tile 3 | "2,100+ / Mythic rares / with full art and current prices" | **CUT** | Nobody chooses a collection manager on mythic count. Pure vanity number. |

**Recommendation:** delete the tile row entirely. The hero's meta line already carries the one
number that matters, and it carries it where a visitor is still reading.

## 4. `HomeSearch` — the best-conceived section on the page

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Search it the way you search Scryfall" | **KEEP** | Exactly the right register. Assumes the reader knows Scryfall, which they do. |
| lead a | "If you know how to search on Scryfall, you already know how to search here." | **KEEP** | |
| lead b | "The same search terms all work: colour identity, mana value, rules text, what is legal where, power and toughness." | **REWRITE** | Says the same thing as (a) again. And "what is legal where" is an invented paraphrase of **format legality**, which is the term on the reader's own screen in every deck builder they have used. |
| lead (sm+) | "Pick one below and watch it run." | **CUT** | Stage direction. |
| chips | "Commander-legal card draw" / "Cheap removal" / "Efficient beaters" / "Bant triggered commanders" | **KEEP** | Four labels, four correct registers. "Bant" and "beaters" are the proof this page *can* write for the audience. |
| caption a | "The first 6 of 1,204 results for `f:commander id<=wubrg o:"draw a card"`, commander-legal card draw," | **KEEP** | The number is Scryfall's own. |
| caption b | "in the order Scryfall ranks them by how often people play them." | **REWRITE** | That is **EDHREC rank**. Say it. Nine words become two. |
| caption c | "This ran for real when the page loaded, on the same search the card browser uses." | **CUT** | Pattern 1. |
| cta | "Try a search" | **KEEP** | |

## 5. `HomeAppVisual` — the heading contradicts the picture

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "This is the builder" | **REWRITE** | **It is not the builder.** The `scene` is `deck` — the deck detail page, changed on the owner's own instruction ("Maybe need to just use the deck detail page instead"). The heading was never updated. The heading and the picture disagree on screen. |
| lead | "Cards drop into the right group on their own, the curve redraws as you go, and what the deck costs is always on screen." | **REWRITE** | Describes the builder's editing behaviour over a photograph of a finished deck page. Two of the three claims are not visible in the shot. |
| caption a | "A real Commander precon." | **REWRITE** | Name it. It is **Eldrazi Incursion**, per `public/screens/manifest.json`. A named deck is evidence; "a real precon" is a claim. |
| caption b | "The power score, the value and the type breakdown are all worked out from the hundred cards in the list." | **CUT** | Pattern 1. |
| cta | "Open the builder" | **KEEP** | |

## 6. `HomeCollection` (in `HomeSections.tsx`)

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Collection" | **KEEP** | |
| title | "Your collection, not just your decklists" | **KEEP** | |
| lead a | "Most deck builders assume you can buy anything." | **CUT** | Competitor claim. Design law 12.7 forbids them and it is unverifiable. |
| lead b | "DeckMatrix starts from what is already in your boxes: how many you have, what condition they are in, which box they are sitting in, and what the lot is worth today." | **REWRITE** | Good list, but "which box they are sitting in" is `HomeStorage`'s entire heading two sections later, and the hero already said it. Cut that clause. |
| caption | "Cards, unique cards, market value and the ones nobody has a price for **—** counted from the copies you actually own, at the printing you own." | **REWRITE** | **Em-dash: copy rule 2 breach** (`HomeSections.tsx:168`). "the ones nobody has a price for" is an in-app caveat that has no business on a sales page. "at the printing you own" is good and should survive. |
| cta | "Start your collection" | **KEEP** | |

## 7. `HomeStorage` — the best idea, wrapped in boasting

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Nobody else does this" | **CUT** | A boast, and an unverifiable competitor claim. The heading under it already wins the argument. |
| title | "Know which box it is in" | **KEEP** | The best heading on the page. Concrete, plain, and nothing else does it. |
| lead a | "Other deck sites know what you own. None of them know where you put it." | **CUT** | Two more competitor claims. |
| lead b | "Tell DeckMatrix which binder, deck box or bulk box a card is in, down to the page and the divider." | **KEEP** | This is the whole section, said once, correctly. |
| lead (sm+) | "Then finding it takes seconds instead of an afternoon." | **CUT** | Advertising. |
| body a | "Five kinds of box come ready to use: Binder, Deck box, Long box A–Z, Colour boxes, ..." | **KEEP** | Read from `DEFAULT_STORAGE_TEMPLATES`, so it cannot drift. Concrete. |
| body b | "Every card you put away gets a place in one of them." | **CUT** | Restates lead b. |
| body c | "The cards shown here are real printings from the card list. Yours would hold your own." | **CUT** | Pattern 1, plus explaining that an illustration is an illustration. |
| binder caption | "Nine cards to a page." | **KEEP** | |
| binder caption | "You can search for any one of them by name." | **CUT** | Search existing is not news. |
| deck box caption | "Tie one to a deck and the list knows where those cards really are." | **KEEP** | Specific, and it is a genuine feature nobody expects. |
| long box caption | "Twenty-six dividers, A to Z. Put a card away and it remembers the letter." | **KEEP** | |
| colour box caption | "One box per colour, which is how most people split up their bulk anyway." | **REWRITE** | First half KEEP. "how most people split up their bulk" is an invented claim about players. |
| reveal label | "See the other four kinds of box" | **KEEP** | |
| cta | "Map your collection" | **REWRITE** | "Map" is the marketing verb. "Add your boxes" is what the button does. |

## 8. `HomeScanner`

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Scan a card" | **KEEP** | |
| title | "Point your phone at a card" | **KEEP** | |
| lead a | "Hold a card up to the camera and it lands in your collection." | **REWRITE** | Says the title again in different words. Merge, keep one. |
| lead b | "No typing, no picking the set, no menus." | **CUT** | Advertising triple. "No menus" is not even a benefit anyone asked for. |
| step 1 | "It waits for a clean frame" | **KEEP** | |
| step 1 body | "It only takes the photo once the picture has held still and sharp, so you are never fighting the shutter." | **REWRITE** | Keep the first clause. "you are never fighting the shutter" is copywriting. |
| step 2 | "It forgives a bad read" / "A near miss still finds the right card. 'Lightnng Bolt' works fine." | **KEEP** | The best piece of writing in this folder. It shows a real failure and how it is handled, in fourteen words. |
| step 3 | "It files the card" / "Straight into your collection, a deck or a box. If you already own one, it just adds another." | **KEEP** | |
| match panel | "Read from frame" / "93% name match" | **KEEP** | The percentage is computed on screen from the two strings shown. |
| match panel | "Matched. Ready to file into a collection, a deck or a box." | **CUT** | Word for word the same list as step 3, 200px below it. |
| viewfinder | "Card scanner" / "Auto-capture" / "Card detected" | **KEEP** | Camera furniture. Reads correctly. |
| viewfinder | "Captures on its own once the frame is sharp" | **CUT** | Step 1 verbatim. |
| cta | "Try the scanner" | **KEEP** | |

## 9. `HomePlayTable` — the section the owner was quoting

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Play" | **KEEP** | |
| title | "Play a real game, in the browser" | **KEEP** | |
| lead a | "Play one of your own decks against the computer." | **KEEP** | The one sentence this section needs. |
| lead b | "Cards sit in rows the way they do on a real table, lands in their own row underneath," | **CUT** | Describes the photograph directly underneath it. |
| lead c | "**and tapped means turned sideways.**" | **CUT** | **This is the line.** Tapping explained to a Magic player. Delete it and never write anything like it again. |
| lead (sm+) a | "Swap between the table, your hand and a combat view for picking attackers and blockers." | **CUT** | The three tiles below are literally captioned Table / Hand / Combat. |
| lead (sm+) b | "Any part of the turn with nothing to decide is done for you." | **REWRITE** | Real and worth saying. Say it in the player's words: "It skips the steps you have no decisions in." |
| caption | "A real game, several turns in." | **KEEP** | |
| caption | "Nothing here is drawn **—** the board was played out by the **rules engine** and photographed." | **CUT** | Three breaches in one clause: em-dash (rule 2), "engine" (banned word list, CLAUDE.md copy rule 1), and pattern 1. `HomePlayTable.tsx:63`. |
| tiles | "Table / The whole board, both seats." · "Hand / Your seat, zoomed in." · "Combat / Pick attackers and blockers." | **KEEP** | Nine words each, all load-bearing. |
| cta | "Sit down at the table" | **KEEP** | Best button label on the page. |

**Honesty gap, and it is the biggest one on the homepage.** CLAUDE.md records that the engine
runs the abilities of about **2.7% of the catalogue** and correctly marks the other 95.7% as
needing a human. The section says "Play a real game" and never mentions that most cards need
manual handling. That is not a lie today, but it is the exact shape of claim the owner has had
to correct twice. One honest line ("Most cards you still resolve yourself, with counters, tap
and zone controls to hand") would cost nothing and defuse it permanently.

## 10. `HomeLifeCounter`

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Life counter" | **KEEP** | |
| title | "The phone goes in the middle of the table" | **KEEP** | Excellent. It is the whole idea and it is an image, not a claim. |
| lead a | "Every seat gets its own panel, turned to face whoever is sitting there," | **KEEP** | |
| lead b | "so nobody has to read their life total upside down." | **CUT** | Explains the consequence of a photograph the reader is looking at. |
| lead c | "Tap the top to gain and the bottom to lose." | **CUT** | A manual instruction. Nobody signs up because of the tap targets. |
| lead (sm+) | "Quick taps add up into one change, so a mis-tap is easy to fix. It counts commander damage, poison, energy and experience too, goes full screen, and stops the phone sleeping." | **CUT** | Every item is in the chip row 40px below. Pattern 5. |
| chips | Commander damage · Poison · Energy and experience · Undo any tap · Screen stays awake · Full screen | **KEEP** | Six chips, six real features, zero wasted words. This is the model the rest of the page should copy. |
| pod labels | "Two players" / "Three players" / "Four, two by two" | **KEEP** | |
| caption | "Four players, one to an edge. Every panel is turned to face the person sitting at it." | **CUT** | The lead said it and the picture shows it. |
| cta | "Start a pod" | **KEEP** | |

## 11. `HomeMarketplace` — currently rendering its empty state

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Marketplace" | **KEEP** | |
| title | "Watch the price before you buy it" | **KEEP** | |
| lead a | "DeckMatrix saves the price of every card it tracks, once a day, **going back months**." | **REWRITE** | **Accuracy risk.** Broad daily capture only started 19 Aug 2026, and `priceTracking` is `null` in the shipped snapshot. "Going back months" is not backed today. |
| lead b | "So you can see whether a card is climbing or falling instead of only today's number." | **KEEP** | |
| lead (sm+) a | "Put cards up for sale straight from your collection, get told when one hits the price you wanted," | **KEEP** | Two real features, plainly said. |
| lead (sm+) b | "and buy without leaving the page." | **REWRITE** | **Contradicted 400px below by our own chip row**, "Buy links open at TCGplayer, Cardmarket, ...". Buying leaves the page. |
| empty state | "No price history to chart yet" / "Prices are saved once a day. A card needs two days on record before there is a line worth drawing..." | **CUT** | Honest, well written, and it is what **every visitor sees right now**. A homepage section whose exhibit says "nothing here yet" should be held back until the data exists, not shipped with an apology. |
| watchlist | "Also tracking" / "Nothing on the watch list yet." | **CUT** | Same reason. |
| sell panel | "Sell what you are not playing" / "List straight out of your collection with condition, foiling and quantity, take messages from buyers, then record the sale and the copy leaves your collection." | **KEEP** | The most concrete sentence in the section and it is buried in a side panel. Promote it. |
| vendors | "Buy links open at TCGplayer, Cardmarket, Card Kingdom, Cardhoarder, eBay" | **KEEP** | Verified against `buildBuyRows`. |
| caption | "Daily price **snapshots** between 19 Aug and 21 Aug, from DeckMatrix's own price history." | **REWRITE** | "Snapshots" is our word for a database row. Say "daily prices". Keep the dates. |
| cta | "Open the marketplace" | **KEEP** | |

**Recommendation:** either hold the section until `priceTracking` is non-null, or reduce it to
the sell panel plus the vendor chips, which are true today.

## 12. `HomeTournaments`

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Tournaments" | **KEEP** | |
| title | "Run the pod, not a spreadsheet" | **KEEP** | Knows exactly who it is talking to. |
| lead a | "Swiss or knockout, scored the way a paper event scores it." | **REWRITE** | First half KEEP. "scored the way a paper event scores it" is a preamble to (b), which should not exist. |
| lead b | "Three points for a win and one for a draw, with your opponents' win rate breaking the ties." | **CUT** | Match points and OMW explained to somebody who has played an FNM. Pattern 3. |
| lead (sm+) a | "Nobody gets paired with the same person twice while somebody else is free." | **CUT** | Chip 2 below reads "Pairings that avoid rematches". |
| lead (sm+) b | "Results go in with one click, and you can take them back." | **KEEP** | Small, true, and a real relief to anyone who has run an event. |
| caption a | "A Swiss event in progress: the round clock, the pairings for round three with the deck each seat registered," | **KEEP** | |
| caption b | "and the standings as they stand." | **CUT** | A pun standing in for information. |
| chips | Swiss or single elimination · Pairings that avoid rematches · Byes handled properly · Round timer · Drops mid-event · Decklists registered per player | **KEEP** | Six chips carry more than the 90 words above them. |
| reveal label | "See it score a real event" | **CUT** | Goes with the worked example below. |
| worked ex. | "Round 1 · played" / "4 decks · Commander" / "Standings after round 2" / "Awaiting result" / "The results those come from" | **CUT** | The whole worked example. See below. |
| worked ex. note | "A worked example: four real precon decks, two rounds played. Every number in this table was worked out by the same code the app itself uses, including the round-three pairings, and it all ran in your browser as this page loaded." | **CUT** | Pattern 1 at maximum volume. This paragraph is addressed to a code reviewer, not a player. |
| cta | "Open the tournament manager" | **KEEP** | |

**Recommendation:** delete the entire live worked example. It is ~980px on a phone spent proving
arithmetic nobody disputed, and we already have `tournament-standings-1600.webp` sitting unused
in `public/screens/` that shows real standings with real tiebreakers. Two screenshots and six
chips is the whole section.

## 13. `HomePrecons`

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Start from a precon, then make it yours" | **KEEP** | "Precon" unexplained is exactly right. |
| lead a | "184 Commander precon decklists you can load, compare against what you own, and upgrade card by card." | **KEEP** | Three verbs, three real actions, one real count derived from `PRECON_INDEX`. |
| lead b | "Every one comes with its real commander, set and full list." | **CUT** | "Real" again. The four tiles below print the commander, the set and the card count. |
| tiles | product name · set · colour identity pips · "100 cards" · commander name | **KEEP** | All five data points earn their space. |
| cta | "Browse all 184 precons" | **KEEP** | |

Tightest section on the page. Two lines and four cards.

## 14. `HomeTutor`

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Ask about the deck you actually built" | **KEEP** | |
| lead a | "Your question goes off with your actual decklist attached: every card in it, your curve, and what you already own." | **REWRITE** | The idea is right and it is the differentiator. "goes off with" is clumsy; "actual" repeats the title's "actually". |
| lead b | "The answer is about your deck, not decks in general." | **CUT** | A promise about output quality, which is exactly the register that makes MTG players distrust a tool. |
| deck chip | "**Deck context**: Draconic Domination, 100 cards, 100 unique" | **REWRITE** | "Deck context" is prompt-assembly vocabulary. The player's word is "attached". |
| card wall label | "Top of the curve: the 12 heaviest of 62 nonland cards" | **KEEP** | "Nonland", "curve", "heaviest". Perfect register. |
| question | "What should I cut for more interaction?" | **KEEP** | Exactly what a Commander player types. |
| answer ¶1 | "I read all 100 cards first. 38 lands, 62 spells, average mana value 3.29." | **REWRITE** | "I read all 100 cards first" is the tool defending itself. The counts are fine. |
| answer ¶1 (sm+) | "Those spells are 34 creatures, 24 of them Dragons, 6 artifacts, 4 enchantments, 8 sorceries and 3 instants." | **CUT** | The eight stat tiles beside it print these same numbers. Pattern 5. |
| answer ¶2 | "You are asking to cut *toward* something that is not in the list: 3 of the 62 spells are instants, so interaction here has to be added rather than swapped in. The room is at the top of the curve..." | **KEEP** | This is the product working. It answers the question, disagrees with the premise, and names three cards. Do not touch it. |
| footnote | "Every number above is counted from the 100 cards on the left, and the three it names carry a white badge in that grid. In the app your own deck is attached to the question before Tutor answers it." | **CUT** | Pattern 1, plus an explanation of our own badge styling. |
| chips label | "Also one tap away" | **CUT** | |
| chips | "**Analyze** deck" · "Suggest upgrades" · "Find combos" · "**Meta analysis**" · "What to cut" · "Strategy guide" | **REWRITE** | Two problems. "Analyze" is US spelling on a page that writes "colour", "organised", "favourite" — it reads as a slip. And "Meta analysis" is vague to the point of meaning nothing. |
| composer | "Ask about your own deck" | **CUT** | A drawn text box directly above a real button that does the same thing. |
| cta | "Open Tutor" | **KEEP** | |

## 15. `HomePower`

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Power level" | **KEEP** | |
| title | "A power level you can argue with" | **KEEP** | Genuinely good. It knows that every pod argues about power level, and it offers to join in rather than settle it. |
| lead a | "Find out if your deck is too strong for your group, before you sit down." | **KEEP** | The real job to be done. |
| lead b | "Ten things get measured and you can see every one of them, so you can see why the number came out the way it did." | **REWRITE** | "Ten things" is vague where the ten labels are printed directly below. "you can see... so you can see" repeats. |
| lead (sm+) | "The same deck always gets the same score." | **KEEP** | A real differentiator against every tool that asks a language model for a number. |
| sub-head | "And the cards it watches for" | **KEEP** | |
| sub-lead a | "Some cards win a game on their own. A deck with none of them scores lower, however tidy it looks on paper." | **REWRITE** | First sentence KEEP. "however tidy it looks on paper" is copywriting. |
| sub-lead b | "These are the four kinds it looks for, and the real cards in each." | **CUT** | "Real" again. |
| panel 1 | "Two cards that end the game" | **REWRITE** | This is a **two-card combo**. The audience has had that phrase for twenty years. |
| panel 2 | "The card you cast to win" | **REWRITE** | This is a **finisher**. |
| panel 3 | "The card that wins it slowly" | **REWRITE** | This is a **value engine**, or inevitability. The file comment says "engine" was avoided because it is on the banned-word list — but that ban is about *marketing and engineering* vocabulary ("the engine", "the pipeline"), not about Magic's own words. Applying it literally produced four riddles. |
| panel 4 | "The card that undoes the board" | **REWRITE** | These are **board wipes and extra turns**, which the body text then says outright. |
| panel 1 body | "These count as a pair, not as two good cards on their own. Each half is useless without the other." | **KEEP** | Explains the *scoring rule*, which is the part a player cannot guess. |
| panel 2 body | "3 of these only count if the rest of your deck backs them up. Craterhoof wants twenty creatures out. Aetherflux wants twenty-five spells." | **KEEP** | The best two sentences in this section. Named cards, real conditions, no explanation of what a Craterhoof is. |
| panel 3 body | "Nothing happens the turn it lands. Two turns later the table is a card down and you are three up." | **KEEP** | |
| panel 4 body a | "Board wipes that only hit them, and extra turns." | **KEEP** | |
| panel 4 body b | "One cast and a game you were losing is a game you are winning." | **CUT** | Advertising cadence. |
| counts | "42 cards like this" | **KEEP** | Derived from the catalogue file. |
| bands | Casual · Mid · High · cEDH | **REWRITE — open question** | Wizards now ships an official **Commander bracket** vocabulary (1–4), and pods increasingly talk in brackets. A private four-band scale beside it invites "which is this in brackets?" Worth a decision, not a silent choice. |
| footer | "These are the numbers and the bands the score really uses, and the cards above are the real list it checks your deck against" | **CUT** | Pattern 1. |
| cta | "Score a deck" | **KEEP** | |

## 16. `HomeFormatPicker`

| Line | Text | Verdict | Why |
|---|---|---|---|
| eyebrow | "Pick your format" | **KEEP** | |
| title | "What can you build in Commander?" | **KEEP** | |
| lead a | "What is legal comes from the cards themselves, not from a list someone updates by hand, so a new ban shows up here as soon as the cards update overnight." | **REWRITE** | Entirely about our implementation. No player has ever wondered how a site stores legality. The half worth keeping is "bans show up overnight". |
| lead (sm+) | "Pick a format and the cards below change with it." | **CUT** | Stage direction. The tabs are self-evident. |
| rules | "100 cards · singleton · colour identity enforced" | **REWRITE** | "singleton" and "colour identity" are correct. "enforced" is our word about our software. |
| rules | "60 cards · four copies · 8th Edition forward" etc. | **KEEP** | Accurate deck-construction rules, said in three words. |
| count | "31,000+ cards legal" | **KEEP** | Low value but honest and cheap. |
| slot labels | Commander · Ramp · Removal · Card draw · Tutor · Finisher | **KEEP** | Six words, six roles, zero explanation. This is the register the whole page should be in. |
| cta | "Search the Commander pool" | **KEEP** | |

**Recommendation:** this is the **fourth** wall of cards on the page (after the hero fan, the
marquee and the search results) and it argues a point nobody disputes. Merge the format tabs
into `HomeSearch` as a second row of chips, or cut it.

## 17. `HomeNewSets`

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "New sets, the week they land" | **KEEP with a maintenance warning** | Currently true: the snapshot holds hob 321, msh 453, msc 866, sos 368, soc 426, tmt 320, matching Scryfall. But `FEATURED_SETS` is a hand-typed list of six set names and dates. It goes stale the day nobody edits it, and the heading is the promise most exposed to that. |
| lead a | "Cards update from Scryfall every night." | **KEEP** | |
| lead b | "You can search a new set and start building with it as soon as it is spoiled, not months later." | **REWRITE** | "as soon as it is spoiled" over-promises: spoiler season is not the same as Scryfall publication, which is what actually gates us. "not months later" is a swipe at competitors. |
| tiles | set art · set code · release month · card count | **KEEP** | Four real data points per tile, three of them read from the catalogue. |
| sub-head | "Fresh commanders, already legal to build" | **CUT** | |
| sub-lead | "A legend from each of those sets, shown as a whole card." | **CUT** | "Shown as a whole card" is the page narrating its own rendering policy to a stranger. |
| reveal label | "See a new commander from each of them" | **KEEP** | |
| cta | "Browse every card" | **KEEP** | |

## 18. `HomePortability`

Note the component name itself: "portability" is on CLAUDE.md's banned-word list by name. It is
not user-visible, but it is why the copy reads the way it does.

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Bring your decks in, take them out again" | **REWRITE** | Collides with `HomeCTA`'s "Bring your collection with you" at the foot of the page. "Import and export" is plainer and is what the reader is scanning for. |
| lead a | "Paste in a list from anywhere, and get it back out in whatever shape you need." | **KEEP** | |
| lead b | "Nothing you put in here is stuck here." | **KEEP** | No lock-in, in six words. Strong. |
| lead (sm+) | "This is it working, on this page." | **CUT** | Pattern 1. |
| label | "DeckMatrix reads this" | **REWRITE** | Nearly right; "What we read" or just the count. |
| count | "12 of 12 lines matched · 21 cards" | **KEEP** | Computed live from the parse. |
| body a | "Comments, an Arena `Deck` header, a set code with a collector number, a leading `2x` and a trailing `x1` are all in that block, and every one of them works:" | **CUT** | A test-case list read aloud. The four chips directly beneath say it better and shorter. |
| chips | `4 Card Name` · `4x Card Name` · `Card Name x4` · `1 Card Name (SET) 117` | **KEEP** | Promote these; they replace the paragraph above. |
| body b | "Each card above was looked up by name in the real card list, so its printing, mana cost, colours and price all came with it. That is why the file below is a real deck and not just a copy of what you pasted." | **CUT** | Pattern 1, and "the file below" is **wrong on the current layout** — since the tabs merged, the file is beside it, not below. |
| tabs | You paste this · MTG Arena · MTGO · Moxfield CSV · Plain text · CSV · JSON | **KEEP** | The format names *are* the feature. |
| — | *(no call to action anywhere in this section)* | **MISSING** | Every other section has a way through. This one ends on a paragraph. |

## 19. `FAQSection`

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Frequently asked questions" | **KEEP** | |
| Q1 | "What is DeckMatrix?" | **REWRITE** | The answer repeats the hero and the footer near word for word ("A deck builder and collection manager for Magic: The Gathering"). By question one of the FAQ the reader has scrolled 20 screens. |
| Q2 | "Where does the card data come from?" | **KEEP** | Scryfall attribution belongs here. |
| Q3 | "What does the storage feature **actually** do?" | **CUT** | There is a whole illustrated section on storage above. And "actually" is the page bracing for disbelief. |
| Q4 | "How is collection value calculated?" | **KEEP** | The caveat about buylists is honest and necessary. |
| Q5 | "Which formats are supported?" | **CUT** | `HomeFormatPicker` answers it with six tabs and real cards. |
| Q6 | "Is it free?" | **KEEP** | **The single most important question on the page, and it is sixth of seven.** |
| Q7 | "Is this an official Wizards of the Coast product?" | **CUT** | The footer carries this text verbatim, two inches below. |
| closer | "Still have questions?" / "Contact our **support team** →" | **REWRITE** | "Our support team" is a claim about a company with 13 registered accounts. "Email support@deckmatrix.com" is true and friendlier. |

## 20. `HomeCTA`

| Line | Text | Verdict | Why |
|---|---|---|---|
| title | "Bring your collection with you" | **REWRITE** | Means nothing here, and collides with `HomePortability`'s heading. |
| lead | "Free while we are in early access. No card details, no trial timer." | **KEEP** | The best CTA line on the page and it is at the bottom. Consider putting it under the hero buttons too. |
| cta | "Create your account" / "Sign in" | **KEEP** | |

## 21. `HomeFooter`

| Line | Text | Verdict | Why |
|---|---|---|---|
| blurb | "A deck builder and collection manager for Magic: The Gathering." | **KEEP** | |
| Build group | Deck builder · Collection · Storage · Card search · Precons · Wishlist | **REWRITE** | **Proxies and the shopping list are missing** and both are real shipped pages (`/proxies`, `/shopping`). |
| Play group | Marketplace · Tournaments · Life counter · Play a game · Scan a card | **KEEP** | |
| Account group | Sign in · Create account · Reset password | **KEEP** | |
| legal | Scryfall + Wizards Fan Content | **KEEP** | Required and correctly worded. |
| — | *every Build and Play link points at a protected route* | **FLAG** | A logged-out visitor who clicks "Collection" in the footer is bounced to the login screen with no explanation. Eleven of fourteen links do this. |

## Not rendered, still in the folder

| Component | Status |
|---|---|
| `HomeFeatures` | Not on the page. Its `id="features"` is what the public nav links to, so **the nav's Features link is dead**. Either render it, retarget the anchor, or drop the nav item. |
| `HomeColorIdentity` | Not rendered. Its lead explains colour identity to Commander players. Leave it dead. |
| `HomeColors` | Not rendered. Five bars of near-identical length. Correctly retired. |
| `HomeBuilderPreview` | Not rendered. Superseded by the real screenshot. Delete. |

---

# 1. What order should the sections be in?

Argued from what a player wants to know, in the order they want to know it. Not from what the
app is proudest of.

The visitor is a Commander player who already uses Moxfield or Archidekt. They are not asking
"is this good software". They are asking, in this order: **what does this do that mine does
not** → **can I get my stuff in** → **is it any good at the thing I do every week** → **what
else is here** → **what does it cost**.

The current order gets that badly wrong in one specific way: **everything in the first four
sections is something Moxfield already does**, so a visitor who knows Moxfield has scrolled
four screens before seeing a single reason to switch. The page comment even admits it
("Everything above this line, Moxfield and Archidekt also do"), then puts storage fifth anyway.

### Proposed order

| # | Section | Why here |
|---|---|---|
| 1 | **Hero** | Unchanged. Absorb the card marquee from `HomeShowcase`. |
| 2 | **Storage** | *The* differentiator, immediately. "Know which box it is in" is the one heading no competitor can copy. Put it where the visitor is still deciding whether to keep reading. |
| 3 | **Collection** | The screenshot that backs up storage: this is what the collection looks like once mapped. |
| 4 | **Scanner** | The obvious objection to 2 and 3 is "that is hours of typing". The camera is the answer, so it goes directly after the problem it solves. |
| 5 | **Deck page / builder** | Now the visitor knows their collection is in, show building against it. |
| 6 | **Proxies** *(new)* | Follows the builder naturally: you built it, here is the sheet you print before you buy it. See §2. |
| 7 | **Import and export** (`HomePortability`) | The last objection before signing up: "can I get my decks in, and back out". Answering it here converts; answering it at position 18 is too late. |
| 8 | **Search** | Absorb the format picker as a second chip row. |
| 9 | **Precons** | |
| 10 | **Power level** | Precons then power reads as one argument: start here, find out where it sits. |
| 11 | **Tutor** | |
| 12 | **Play a game** | The breadth block starts. Table first, because it is the least expected. |
| 13 | **Life counter** | |
| 14 | **Tournaments** | |
| 15 | **Marketplace** | Last of the breadth, and the one currently showing an empty state. Hold it until there is a chart. |
| 16 | **New sets** | Freshness is a closing reassurance, not an opening argument. |
| 17 | **FAQ** (four questions) | |
| 18 | **CTA + footer** | |

**Cut from the page entirely:** `HomeShowcase` (marquee moves to the hero), `HomeCatalogue`
(the number moves to the hero meta line), and the format picker as a standalone section.
Nineteen sections become sixteen, and the three that go were the three that showed cards
without making an argument.

# 2. What is missing?

### Proxies — named by the owner, and the page has never mentioned it

It is a real, finished, tested feature and it is better specified than several things that do
have sections:

- `/proxies` is a real route with its own nav entry (`nav-items.ts:146`), built on the same
  primitive as the shopping list.
- Paste a list, or pull it from a deck, your wishlist or your shopping list.
- **Pick the art.** `useProxyArt.ts` lets you swap to any printing of a card and autosaves the
  choice by storing the printing id, so it survives a reload.
- **63 × 88 mm, deliberately not 63.5 × 88.9.** `proxy-geometry.ts` documents why: the half a
  millimetre compounds to 2.7 mm down a three-up column and walks the cut line off the border.
  A proxy drops into a sleeve next to a real card.
- Nine to a page, A4 or Letter, crop marks, bleed, print or PDF.
- Three separate consumers (print stylesheet, on-screen preview, jsPDF export) all read the same
  geometry constants, and the geometry has unit tests plus a browser measurement.

**This should be a section, and it should be almost entirely a photograph** of a printed sheet
with crop marks. Heading and one line, in the reader's own words:

> **Print proxies at the right size**
> Nine to a page with crop marks, at 63 by 88 mm, so a proxy sleeves up next to a real card.
> Pick which printing's art gets used.

No screenshot exists yet. `proxy-sheet`, showing the sheet preview with the art picker open, is
the single highest-value new capture on this list.

### Also missing, ranked

| Missing | Why it matters | Verdict |
|---|---|---|
| **Shopping list** (`/shopping`) | The other half of proxies: the same list, one ending buys and one prints. "Here is what this deck still costs you" is a question every EDH player has. | Worth a line inside the proxies section rather than its own. |
| **Wishlist** | Ships, has price-drop alerts, is a footer link only. | One line. |
| **Deck sharing** (`/p/:slug`) | Public deck pages with view counts already work. Sharing a list is one of the top three reasons people use Moxfield at all, and we do not mention it once. | **Deserves a mention in the deck section.** Real gap. |
| **The honest limit on play mode** | ~2.7% of the catalogue is fully automated, 95.7% correctly marked manual. Saying so first is much cheaper than being caught. | **One line in `HomePlayTable`.** |
| **Dashboard** | First screen after sign-up, never shown. | Optional. |
| **Playmats** (`/play/mats`) | Cosmetic but visual and Magic-native. | Optional. |
| **Online play / the lobby** (`/play/online`) | The forum and lobby components exist. Whether a game can actually be played seat-to-seat is **not verified in this audit**, and CLAUDE.md is explicit that "the engine supports it" and "a player can do it" are different claims. | **Do not put on the homepage until somebody plays a real online game end to end.** |
| **Pricing** | "Free while we are in early access" appears once, at the very bottom, and in FAQ question six. It is the second question every visitor has. | Move it under the hero buttons. |

# 3. Which sections should be a screenshot with almost no words?

### The rule these should follow

`HomePlayTable` is already the right shape and proves it: eyebrow, heading, one sentence,
photograph, three eight-word tiles, button. Everything else in it is deletable. Copy that shape.

### Sections that should become a screenshot

| Section | Now | Should be |
|---|---|---|
| **`HomeShowcase`** | 12-card marquee + a fake catalogue table + a curve over non-deck cards + 80 words | **Delete.** Marquee to the hero. |
| **`HomeTournaments`** | photograph **plus** a live-computed worked example, standings table, results list and 110 words | **Two screenshots** (`tournament`, `tournament-standings`), heading, one line, six chips. Delete the worked example. Saves ~980px on a phone. |
| **`HomePortability`** | a CSS mock of a paste box, tabs, a card wall, 90 words | **Screenshot of the real import screen** with the paste in it. The mock is well made and is still a drawing of a feature we could photograph. |
| **`HomeTutor`** | a CSS chat mock, deck panel, stat tiles, curve, card wall, 130 words | **Screenshot of `/tutor`** with a real answer on screen. Keep the real question and the real second paragraph as the caption. |
| **`HomeScanner`** | CSS camera, well built, ~120 words | **Keep as-is.** This is the one mock that should stay: a phone camera cannot be screenshotted from a desktop capture script, and it is genuinely good. Just cut the duplicated lines. |
| **`HomeStorage`** | CSS binder / deck box / long box / colour boxes | **Keep as-is.** Same reason: these are physical objects, not screens. Cut the boasting around them. |
| **Proxies** *(new)* | does not exist | **Screenshot-first from day one.** |

### Screenshots: what needs retaking

Every file in `public/screens/` is from **19 Aug 13:15 or earlier**, except `deck-1600` and
`deck-1920` (retaken 21 Aug 16:25). The manifest's `generatedAt` is 21 Aug but only the deck
scene was rewritten then. The snapshot feeding the page, `src/data/homepage-snapshot.json`, is
also dated **19 Aug**.

| Scene | Age | On the page? | Action |
|---|---|---|---|
| `deck` | **21 Aug** | yes (`HomeAppVisual`) | Current. Fix the heading that calls it "the builder". |
| `collection` | 19 Aug | yes (`HomeCollection`) | **Retake.** Named in the hero's promise; the most important screenshot on the page. |
| `play-table` | 19 Aug | yes (`HomePlayTable`) | **Retake.** Play mode has had the most interface work since. |
| `life-counter` | 19 Aug | yes (`HomeLifeCounter`) | **Retake.** |
| `tournament` | 19 Aug | yes (`HomeTournaments`) | **Retake.** |
| `tournament-standings` | 19 Aug | **no — captured and never used** | **Retake and put on the page.** It replaces the worked example outright. |
| `card` | 19 Aug | **no — deliberately withheld** | Held back because the details rail truncates four labels mid-word under `overflow-x-hidden` (see `HomeSearch.tsx:282`). **Fix the rail, then retake and use it.** The card page is the screen a player looks at most. |
| `deck-builder` | 19 Aug | **no — superseded by `deck`** | Retake only if the builder gets its own section back. |
| `proxy-sheet` | **does not exist** | no | **Capture.** Blocks the proxies section. |
| `tutor` | **does not exist** | no | **Capture** if Tutor becomes a screenshot section. |
| `shopping` | **does not exist** | no | Optional. |

**Six retakes, three new captures.** The retakes are one `node scripts/app-shots.mjs` run
(`scripts/` is owned by another workflow, so it has to be requested rather than edited here).
The three new scenes need scene definitions added to that script.

---

## Summary of the ten things worth doing first

1. Delete the line "and tapped means turned sideways" (`HomePlayTable.tsx`). It is the owner's
   own example.
2. Delete the two em-dashes in captions (`HomePlayTable.tsx:63`, `HomeSections.tsx:168`) and the
   word "rules engine" that sits between one of them.
3. Delete every sentence that insists the data is real. About 20 lines, listed under pattern 1.
4. Delete `HomeShowcase` and `HomeCatalogue`. Marquee to the hero, card count to the hero meta
   line.
5. Move `HomeStorage` to position two. It is the only thing on this page nobody else has.
6. Add the proxies section, screenshot-led.
7. Fix "This is the builder", which is captioning a photograph of the deck page.
8. Fix the dead `#features` nav anchor.
9. Hold `HomeMarketplace` until `priceTracking` is non-null, or reduce it to the sell panel and
   the vendor links. Right now every visitor reads "No price history to chart yet".
10. Delete the tournaments worked example and use `tournament-standings-1600.webp`, which is
    already captured and has never been shown to anybody.
