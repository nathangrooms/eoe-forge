# Play mode — owner's layout spec

Superseding direction for `/play`. This overrides the rotated-pinwheel seating that
`src/lib/game/seating.ts` currently implements as the default.

> ## ⚠️ THE SINGLE MOST IMPORTANT THING
>
> Owner: *"Most important thing on play mode though, just so you dont forget, is being able to
> click and preview your card, then select a button action or close."*
>
> **Click a card → it opens a PREVIEW at readable size → you choose an ACTION or CLOSE.**
>
> A tap must never itself be the action. Today clicking a card in hand plays it immediately, at a
> size where the card cannot even be read. The required flow is:
>
> 1. **Click** any card — in hand, on the battlefield, in any zone, yours or an opponent's.
> 2. **Preview** opens: the card large enough to read its rules text in full.
> 3. **Act or close**: explicit buttons for what is legal right now (Cast, Play land, Attack, Tap,
>    Cancel/Close). Nothing happens until one is pressed.
>
> This applies everywhere in play mode, not just the hand. If only one thing from this document
> gets built, it is this.
>
> ### NOT A MODAL
>
> Owner: *"Make sure no modals in play, it should be beautiful within the playmat system."*
>
> The preview is **part of the board**, not an overlay on top of it. No dimmed backdrop, no
> focus trap, no centred dialog, no Sheet. Nothing may cover the table — a player must still be
> able to see the game while reading a card.
>
> Build it into the mat itself: a dedicated inspector region on the board (the right edge is the
> natural home, alongside the cast spotlight), with the card at readable size and its action
> buttons beneath. It shares the mat's material — same surface tint, same shadow, no border —
> so it reads as part of the table rather than a window floating over it.

## The core change: everything is readable

The current board rotates each seat to face its own player, SpellTable-style. The owner does
not want that:

> "players on left and right - their stats should be correct way around"

Nothing on screen should be upside down or sideways. Rotation is removed as a presentation
concept; `seating.ts` geometry stays for *placement*, but seats render upright.

## Board layout — 2×2 quads

> "the board should split in 4 separate ways - 2 rows, 2 columns, all hands shows as if placed
> in front of you, so you can click their cards and view their board properly"

- Four equal quadrants: two rows, two columns.
- Every player's area is laid out **as if it were in front of you** — same orientation, same
  reading direction, for all seats.
- Each quadrant is interactive: you can click into another player's cards and inspect their
  board. Opponents are not decorative.
- `seating.ts` already offers a `quads` variant. That becomes the default for 4 players; the
  `table` pinwheel is retained only if explicitly chosen.

## View modes

| Mode | Shows |
|---|---|
| **Table** | All four quadrants, everything upright |
| **Hand** | **Exactly the table view, zoomed to your seat alone.** Same mat, same battlefield, same hand — the other three quadrants are simply not drawn. Your quadrant expands to fill the viewport. |
| **View** | Focus a single opponent's board full-screen, read-only |

> "Hand mode is the full screen version just your board."
> "should be able to view other peoples boards in view mode"
> "'hand' mode in the top side, is supposed to show exactly the same as table, but it only shows
> your side so you can view both your cards, and whats on your table"

**Hand mode is not a different screen — it is the same screen with one seat.** It renders the
identical components the table renders (mat, battlefield, lands row, hand, life badge); it just
scopes them to the viewer and lets that one quadrant use the whole viewport. Everything is
therefore much larger, which is the point: you can read your hand AND see your own board at once.

Do NOT build a separate hand-only component. Reuse the seat renderer with a single seat, so the
two views can never drift apart.

**View mode works the same way** for an opponent: their quadrant, full screen, read-only.

## Zones need distinct places on the mat

> "Lands, creatures, enchantments, graveyard, exile, artifacts etc should all have different
> locations too on map - seems like its all just one row."

A real table has geography, and players read a board by WHERE things are before they read what
they are. One undifferentiated row destroys that. Each seat's mat is laid out as:

```
                        ┌─────────────────────────────────────┬──────────┐
   back of your area    │  LANDS            (tap for mana)    │ LIBRARY  │  ← card backs, stacked
                        ├─────────────────────────────────────┤          │
                        │  ARTIFACTS + ENCHANTMENTS + PWs     │ GRAVEYARD│  ← face up, top card visible
                        │  (non-creature permanents)          │          │
                        ├─────────────────────────────────────┤  EXILE   │
   toward the middle    │  CREATURES        (attack/block)    │          │
                        ├─────────────────────────────────────┤ COMMAND  │  ← commander when not cast
                        │  HAND (viewer only)                 │          │
                        └─────────────────────────────────────┴──────────┘
```

**Rows, nearest the middle of the table first:**
1. **Creatures** — closest to the centre, because they attack across it. Tapped rotates 90°.
2. **Artifacts, enchantments, planeswalkers** — the permanents that sit behind the line.
3. **Lands** — furthest back, the mana row. Tapped lands rotate too.

**Side column** (a narrow strip on the outer edge of each seat):
- **Library** as a stack of card backs with a count.
- **Graveyard** face up, top card visible, with a count — clicking opens the zone browser.
- **Exile**, same treatment, visually distinct from graveyard.
- **Command zone** holding the commander when it is not on the battlefield, with tax shown.

Zones must be **visibly separate regions** — a change of surface tint and spacing, never a
border. Each is clickable to inspect its contents (`ZoneBrowser.tsx` already exists).

A row that is empty still holds its place, so the board does not reflow as permanents enter and
leave. Its label stays visible at low contrast.

This applies to every seat, not just the viewer's — the owner wants opponents' boards readable
and clickable.

## Sizing — the hand is the biggest thing on screen

> "For the player, the hand needs to be massive."
> "Cards need to be much bigger in general"
> "my hand should be massive - I can barely even see it - cards are tiny"

Measured starting point: `ViewerHand` defaulted to **104px** per card — roughly a third of the
size at which a Magic card can be read. Raised to 210px, and it should go further in hand view.

The hand is where a player STUDIES a card before committing to a play, so it is the largest
element on the table, not a strip of thumbnails along the bottom edge.

### Scale must be adjustable AND automatic

> "Maybe there is a card scale slider for board and hand in the right hand menu or something?"
> "I loaded in smaller screen and cards went off page - might need to be dynamic to scale cards
> smaller automatically if that happens - could have 10+ cards in some cases"

Two separate requirements, and both are needed:

1. **A card scale slider**, for board and hand independently, in the right-hand game menu.
   `src/components/cards/CardSizeSlider.tsx` already exists and persists per surface to
   localStorage — reuse it rather than writing another.
2. **Automatic shrink-to-fit.** The chosen size is a CEILING, not a fixed width. A fanned hand of
   n cards occupies `w + (n-1) * w * (1 - overlap)`, so the renderer solves that for the largest
   `w` that fits the measured container and clamps to a readable minimum. Implemented in
   `ViewerHand` via `fitCardWidth` + a `ResizeObserver`; the battlefield needs the same treatment
   through its existing `overlapFor`.

Without this the hand simply ran off the side of a narrow screen — ten cards at the preferred
210px need roughly 970px.

The viewer's hand is the largest element on the table. Card sizes throughout play should be
substantially larger than the current measurements.

## Turn control

> "need a button to end turn in red top right"
> "every step is a bit insane to click through but should exist and auto update as you do things"

- END TURN, prominent, top right, in the destructive/red token. Red is legitimate here: it is a
  game control, not decoration.
- The 12-step turn structure stays in the engine but must NOT be a click-through gate. Auto-advance
  through steps where no decision exists; stop only at real decision points (declare attackers,
  declare blockers, ordering triggers). Playing a land or casting a spell advances the game itself.

## Width

> "it also doesn't utilise page width like rest of app"

The board fills the viewport. This is a game surface; it gets the whole screen.

## Cast spotlight — right edge, not centre

> "When new creatures come on the map, perhaps show them on the right hand side for a second,
> really large so people can read it, it should fade away or get replaced if another is cast though"

`src/components/play/CastSpotlight.tsx` already detects the card that just left a hand and holds
it enlarged. Two changes:

- **Position:** right edge, not the centre of the board. The centre covers the table; the right
  edge lets play continue underneath it.
- **Size:** large enough to actually READ the rules text — this is the point of it. Somebody
  casting across the table should be able to read what resolved without asking.
- **Lifecycle:** hold for roughly a second, then fade. A new cast **replaces** the current one
  immediately rather than queueing, so the spotlight always shows the most recent thing.
- Respect `prefers-reduced-motion`: no fade, just swap.

## Life counter: rotation is a MODE, not a mistake

The owner: *"Life counter is generally one shared for the table, but could have solo and group mode."*

So the audit finding that seats 2 and 3 render upside down is **correct behaviour for the default
case**, not a bug. A phone lying flat in the middle of a table SHOULD rotate each seat to face the
player sitting on that side — that is what every physical-table life app does, and un-rotating it
would leave three of four players reading upside down.

It is now an explicit choice in setup:

| Mode | Behaviour |
|---|---|
| **On the table** (default) | Seats rotate outward; each player reads their own side |
| **Just me** | Every seat upright, positions unchanged — one reader, one orientation |

`LifeOrientation` lives on `LifeOptions` and on `LifeGameConfig`, so setup picks it and
`newSession` seeds from one place. Orientation is a property of the DEVICE rather than the pod, so
it persists between games on the same phone. `seatContentStyleUpright` in seating.ts drops the
rotation while keeping the seat's rect, so the layout is identical either way.

Note this does NOT relax the rule for /play, where each player has their own screen and nothing
should ever be rotated.

## Life counter shares the layout

The life counter defaults 4 players to the same 2x2 grid (`defaultVariantFor` in
`src/components/life/session.ts`). The pinwheel gave the left and right seats a tall thin strip;
two rows of two keeps every panel the same shape and much larger.

---

# Round 2 feedback — playtable, effects, and the rules question

## Playmat layout — follow a real playmat

> "not sure i like the layout of items. - lands should always be bottom, creatures top - 2 main
> rows, enchanements/artifacts etc should have its own square right side or something. Doesn't
> follow normal playmat setups at all."

Supersedes the earlier three-band diagram. From the VIEWER's perspective:

```
┌──────────────────────────────────────────────┬───────────────┐
│  CREATURES            (top row, they attack) │  ARTIFACTS    │
│                                              │  ENCHANTMENTS │
├──────────────────────────────────────────────┤  PLANESWALKERS│
│  LANDS                (bottom row, mana)     │  (own block)  │
└──────────────────────────────────────────────┴───────────────┘
```

Two main rows only — creatures top, lands bottom. Non-creature permanents get their own block on
the right rather than a third full-width band.

## Tapping

> "I dont like that tap/untap is in left menu - tapping should be easy on card."

Tap must be available ON the card — a direct affordance, not a menu round-trip. The inspector still
offers it, but a player tapping five lands should not open five panels.

## Castability

> "I liked when cards were greyed out if you couldnt cast them."

This was softened to a "gentle step-back" and the owner wants it back. A card you cannot pay for
should be clearly, immediately distinguishable in hand.

## Size

> "cards are tiny on screen overall"

Still too small after the last pass. The board should feel like cards on a table, not icons.

## Starting a game

> "doesnt let you start online game, or bot game etc"

The lobby must offer real choices: solo goldfish, versus bot(s) with a chosen count and difficulty,
and online (even if online is "coming soon", it must be visible and honest). Opponent DECKS must be
selectable.

## Card effects and the rules question

> "why do card effects not do anything or work, are we able to get logic working or allow manual
> intervention like marking cards which fly, have lifesteal, trample, also if they have +1 counters,
> need easy way to add these. Had a card that is +1 life when it gets played, but nothing happened.
> Are we able to apply every single MTG rule for all card types?"

**Be honest about this.** A complete MTG rules engine is one of the largest projects in games —
Forge and XMage each represent many years of work and thousands of individually-scripted cards,
because Magic's rules are Turing-complete and every card can rewrite them. We are not going to
implement all of it, and pretending otherwise would waste the effort.

The realistic split, and what to build:

1. **AUTOMATE the keyword abilities**, which are a closed set and cover most combat maths:
   flying, reach, trample, deathtouch, first strike, double strike, lifelink, vigilance, menace,
   defender, indestructible, hexproof, protection, haste. These are already parseable from
   `keywords` on our own rows. Combat should respect them.
2. **AUTOMATE the common, mechanical triggers** we can detect reliably from oracle text — ETB life
   gain, ETB draw, ETB token creation, "whenever this attacks", upkeep triggers. The tagger already
   classifies these; reuse it rather than writing a second parser.
3. **MANUAL INTERVENTION for everything else, made genuinely fast.** This is the part that makes
   the mode usable today:
   - +1/+1 and −1/−1 counters directly on the card, with a visible badge
   - loyalty, charge and generic counters
   - set/adjust power and toughness
   - manually flag any keyword on any permanent
   - free life adjustment per player
   - create a token
   - move any card between any zones
   All reachable in one or two taps, on the card, not buried.
4. **NEVER SILENTLY DO NOTHING.** If a card has text the engine does not implement, say so on the
   card — a small "manual" marker — so the player knows to resolve it themselves rather than
   assuming the app handled it. Silence is the actual bug being reported.

## Playtest

> "Playtest - this seems completely broken from what we had before which was an auto game player?
> Playtest is supposed to play live infront of you verse bots and you should be able to select your
> opponents decks."

/simulate must play a real game against bots, live, with selectable opponent decks — not a
goldfish-only solitaire.

## Life counter framing

> "Life counter UI is terrible on desktop and goes full screen and is confusing - should be within
> our normal frame/nav etc until you press start"

Setup stays inside the normal app shell with the nav visible. Only the RUNNING game goes immersive.
