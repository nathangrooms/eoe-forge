# Next, once the engine and lobby workflows land

Owner, 21 Aug 2026. All three touch `src/components/play`, which the lobby
workflow currently holds, so none of them can start until it releases.

## 1. THE ACCEPTANCE TEST: every card type, proven in real games

Owner, 21 Aug 2026, and this is the definition of done for the whole engine
effort, not a nice-to-have:

> "test and deeply analyse the bot history, ensuring that every spell is being
> activated and deployed properly - including creatures, artifacts,
> enchantments, abilities, tappable, on enter, everything, even board wipes,
> exiles etc - it all has to work 100%"

### The shape of the report

A matrix, by card type and by effect category, EVERY ROW WITH A DENOMINATOR.
"It works" is not a result; "203 of 183 chances" is. Categories, at minimum:

| category | what counts as it working |
|---|---|
| creatures | resolved onto the battlefield, attacked, blocked, died |
| artifacts | resolved, and any activated ability used |
| enchantments | resolved and stayed; auras attached to something legal |
| equipment | attached, and the creature's printed numbers CHANGED |
| activated abilities | cost paid, on the stack, resolved |
| tap abilities | the `{T}` genuinely paid, not paid twice by one tap |
| enters-the-battlefield | the trigger fired and its effect landed |
| board wipes | every legal creature actually left the battlefield |
| exile | the card reached exile, not the graveyard |
| counterspells | a spell on the stack was countered |
| tokens | a real object entered and could attack and die |
| counters | +1/+1 changed the numbers, not just a badge |
| loyalty | plus AND minus abilities, and the planeswalker's loyalty moved |
| commander | cast from the command zone, tax charged, damage tracked |

### Rules that make the report trustworthy

- **Per SEAT, not per game.** A table where one bot plays well and the other
  passes every turn averages out to "fine". Report both seats.
- **Denominators come from opportunity, not from intent.** "Board wipes: 4 of 4"
  means four were cast and four wiped. If none was ever cast, the row reads 0 of
  0 and says so, because that is a gap in the test, not a pass.
- **A zero is the headline.** If any category is still 0 with chances above 0,
  it leads the report. Do not bury it under the categories that moved.
- **Read the log, not just the counters.** The owner asked for the bot HISTORY
  analysed. Pull real games and read what happened, so a category that counts as
  working but produced nonsense is caught.
- Compare against the recorded baseline in commit 56e982b: activations 2,262,
  equipment 203, auras 74, loyalty 84, across 120 games.

### The instrument

`scripts/playtest/` already plays seeded games headlessly with no model, and
`analyze.ts` replays them through the real reducer. Extend its catalogue rather
than writing a second harness. `observe.ts` holds the event catalogue and the
invariants; `silent.ts` holds the silent-card classifier and its exclusions.

Also measure whether the bots USE what they hold, which is a different question
from whether the engine works: cards cast against cards castable with available
mana, abilities used against abilities activatable, mana unspent at end of turn,
and turns where a seat did nothing. `bot.ts` says in its own header it aims to
be plausible rather than strong, so judge it against that.

## 2. Visual audit of the whole play system

Owner named two faults and then asked for the sweep: "visual audit of play
system".

### The two already reported

- **Counters are too small to read.** A +1/+1 counter changes what a creature
  does in combat, so it must be legible at the size a card is actually drawn on
  a FOUR-seat table, not just one-on-one.
- **The noncreature row does not scale.** It is sized as though artifacts and
  enchantments are a side attraction. Affinity, Lattice and enchantress decks
  put twenty permanents there. The row should give ground to whichever side of
  the board is being used rather than splitting fixed.

### The sweep

Drive real games and photograph them. Every check at 1280 AND 1920, and at two
and four seats, because the board has had a clipping complaint before and the
four-seat case is where things break:

- nothing clips at any seat count, including the support row and the fanned hand
- tapped cards do not shift their neighbours (a layout-shift complaint already)
- combat is legible: who is attacking whom, and what is blocking what
- the stack is visible and readable when several things are on it
- counters, keywords, damage and summoning sickness all readable at real size
- the log says what happened without being opened
- reduced motion: still usable, genuinely still
- one screenshot per state, kept, so the next change can be compared against it

`scripts/play-*-shots.mjs` and `scripts/measure-overflow.mjs` already exist.
Extend them rather than starting again.

### Generated art for the game modes

Owner: "You can use gemini pro 3.5 to generate images for the game modes if you
want, could be cool."

Worth doing, with two caveats stated up front.

**I cannot generate images.** There is no image tool in this environment. This
needs either the owner generating them, or a script against an API key the
project holds. Say which before planning around it.

**Where generated art fits, and where it does not.** It fits the playmat
`image` slot, which already exists in `matStyles.ts` and is unset on every
built-in style: composited above the ground and below the weave, so the mat
still reads as a mat. It does NOT go anywhere near card art, which is Scryfall's
and cannot be modified at all.

And one judgement the owner should make rather than me: they have already said
"people in magic community hate AI", which is why MTG Brain became Tutor. An
abstract or textural playmat is a long way from a fake card, but if it ships it
should not be advertised as generated, and it must not imitate Wizards' art
style or any real artist.

## 3. Playmats are not reachable from play

> "there was no playmat settings tab for custom uploaded playmats etc"

The page exists at `/play/mats` with uploads, account persistence and RLS
covering both the owner and players at the same table. Two entry points exist:
the play setup screen and the in-game menu picker.

What is missing is a settings surface in play mode itself. The agent that built
it deliberately left no link out of the in-game menu, and gave a real reason:
following a route from there unmounts the board and loses the game. So this
needs a panel or slide-over that manages mats WITHOUT navigating, not a link.

Note the shared-UI law in CLAUDE.md: whatever this becomes, it belongs to all
four modes, not to online.
