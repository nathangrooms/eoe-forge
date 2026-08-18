# Rules engine — the evidence, and why we are porting rather than hosting

## The straight answer

**XMage can run headless.** That was the open question and it is now settled, conclusively.
We are still porting rather than hosting it, for one reason: scale.

## What the investigation actually proved

**The engine is genuinely separable.** `Mage/` (the rules engine) declares exactly four
dependencies — guava, gson, jsoup, protobuf-java. No Swing, no server, no sockets. The minimum set
to resolve rules is four jars: `mage`, `mage-sets`, one game-type plugin such as
`mage-game-commanderduel`, and your own `Player` implementation.

**Headless play is how they test.** XMage's own suite drives complete games in-process across
roughly 2,000 test classes on every push. A game is a plain constructor call —
`new CommanderDuel(...)` — and `game.start(playerId)` runs it to completion. Commander is a
first-class headless game type. This is not an inference; it is their CI.

**The card/engine ratio is the real insight.** The whole of Lightning Bolt is 34 lines:

```java
super(ownerId, setInfo, new CardType[]{CardType.INSTANT}, "{R}");
this.getSpellAbility().addTarget(new TargetAnyTarget());
this.getSpellAbility().addEffect(new DamageTargetEffect(3));
```

A card is thin declarative wiring over reusable primitives. The primitives ARE the engine — 804
effect classes, 250 keyword classes, 218 conditions, 116 dynamic values, 115 costs, 85 watchers.
The 32,168 card classes are the easy part; `Mage/` is the hard part.

That is exactly why porting is worth it, and exactly what we are porting.

## So why not just host it?

Because of the requirement:

> "it needs to be fast as could have hundreds or thousands of players playing live"

A JVM engine holds each game as live server-side state. Every action round-trips. At a thousand
concurrent games that is a fleet to run, scale and pay for — and it is the one cost that never
goes away.

Our engine is pure, seeded and deterministic, so **a game is its action log**. A client replaying
that log reaches identical state. Clients compute locally for instant feedback; the server
validates and relays actions, never state. Cost per game approaches zero, and it degrades to
"cheap" rather than "down" under load.

Hosting XMage would be faster to first playable game. Porting is the one that reaches the target.

## What we give up, honestly

- **32,168 individually-correct cards.** We replace them with an oracle-text compiler plus
  hand-authored entries, which will cover the common cases well and the long tail poorly. This is
  the real cost and it should not be minimised.
- **Decades of edge-case fixes** in those card implementations.

What we keep: the architecture that makes those cards expressible — layers, the stack,
replacement effects, state-based actions, triggers — which is the part that is genuinely hard to
invent and easy to get subtly wrong.

## The fallback, if the port under-delivers

XMage-as-a-service remains open and is now a known quantity: four jars, no server module, ~1 hour
to a first headless game. If oracle-text coverage proves too thin, hosting it for ranked or
competitive play while keeping the native engine for casual and playtest is a legitimate hybrid —
the seam is the same either way, because both are driven by an action log.

## Licence position

- **XMage is MIT.** Porting its architecture is permitted commercially and closed-source, with
  attribution. See THIRD-PARTY-NOTICES.md.
- **Forge is GPL-3.0 and is not used at all.** Translating GPL code into another language is a
  derivative work; doing so would force DeckMatrix to be GPL-3.0 with full source disclosure.
