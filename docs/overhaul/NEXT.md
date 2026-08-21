# Next, once the engine and lobby workflows land

Owner, 21 Aug 2026. All three touch `src/components/play`, which the lobby
workflow currently holds, so none of them can start until it releases.

## 1. Bot matches, and an audit of whether both bots actually play

> "playtest some bot matches and audit the logs to ensure that both bots are
> utilising and casting available spell options."

The instrument exists: `scripts/playtest/` plays seeded games headlessly with no
model involved, and `analyze.ts` replays every recorded game through the real
reducer. What it does NOT currently answer is the owner's question, which is
about the bot's *decisions* rather than the engine's correctness.

The measurement to add, per seat rather than per game, so a table where one bot
plays well and the other passes every turn cannot average out:

- cards cast against cards that were castable with the mana available
- activated abilities used against abilities that were activatable
- mana left unspent at end of turn
- turns where the seat did nothing at all
- lands played against lands held

Both seats must be reported separately. A bot that curves out while its
opponent hoards is the failure this is looking for, and a table-level average
hides it.

Context: `bot.ts` says in its own header that it is "not trying to be strong, it
is trying to be plausible". Judge it against that, not against a human. The
question is whether it USES what it has, not whether it plays well.

## 2. Visual audit of the board

> "when we have +tokens they are tiny, plus enchantment/artifact area is tiny,
> some people play full artifact decks."

- **Counters are too small to read.** A +1/+1 counter changes what a creature
  does in combat, so it has to be legible at the size a card is actually drawn
  on a four-seat table, not just on a one-on-one board.
- **The noncreature row does not scale.** It is sized as if artifacts and
  enchantments are a side attraction. Affinity, Lattice and enchantress decks
  put twenty permanents there, and the row should give ground to whichever side
  of the board is actually being used rather than splitting fixed.

Measure before changing: draw a real board with a full artifact deck at 1280 and
1920, count how many permanents fit before it clips, and report the numbers.
The board already had a clipping complaint once.

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
