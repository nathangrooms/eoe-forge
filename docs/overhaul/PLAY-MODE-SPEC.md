# Play mode — owner's layout spec

Superseding direction for `/play`. This overrides the rotated-pinwheel seating that
`src/lib/game/seating.ts` currently implements as the default.

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
| **Hand** | Full-screen version of **your board only** — your mat, your battlefield, your hand at size |
| **View** | Focus a single opponent's board full-screen, read-only |

> "Hand mode is the full screen version just your board."
> "should be able to view other peoples boards in view mode"

## Card interaction

> "I need a much clearer way of selecting and viewing a card before making an action - it always
> just plays from hand and I cant even read it"

Clicking a card in hand must **select and enlarge it first**, showing the card readably along
with the actions available for it (cast, play land, cancel). Playing must never be the immediate
consequence of a single tap on a small image.

## Sizing

> "For the player, the hand needs to be massive."
> "Cards need to be much bigger in general"

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

## Life counter shares the layout

The life counter defaults 4 players to the same 2x2 grid (`defaultVariantFor` in
`src/components/life/session.ts`). The pinwheel gave the left and right seats a tall thin strip;
two rows of two keeps every panel the same shape and much larger.
