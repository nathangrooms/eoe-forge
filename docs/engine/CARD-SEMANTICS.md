# The card record: one shape, four consumers

Status: proposed. Types in `src/lib/cards/xmage/`, builder in
`scripts/xmage/build-records.mjs`, tests in
`src/lib/cards/xmage/record.test.ts`.

## Attribution and licence

Behaviour described here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The XMage clone is read in place, outside this repository, and nothing from it
is vendored here. The commit read was `07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`.

Display string CONTENTS are never copied out of XMage. Those strings carry
Wizards of the Coast rules text, which is not XMage's to license. Only the
length of a string is kept, so an empty one can be told from a paragraph. Rules
text for the app comes from Scryfall's `oracle_text`.

Forge is GPL-3.0. It was not fetched, read or referenced.

## Where every number below comes from

`node --experimental-strip-types scripts/xmage/build-records.mjs`, run over all
**32,168 XMage card files**. It writes two artefacts and prints the same figures
to the terminal:

- `scripts/coverage/.data/xmage-record-shape.json`, the census
- `scripts/coverage/.data/xmage-records.hardlist.json`, the worked examples

The worked examples in this document are **printed by that script**, not typed
out here. A design document whose examples were written by its author has
demonstrated nothing.

Where a figure comes from the earlier extraction rather than from this run, it
says so and names `scripts/xmage/extract-effects.mjs`.

---

# 1. The decision

A card record is a list of **primitive invocations with their arguments kept**,
plus four pure functions over it: one for play, one for deck building, one for
search, one for comparison. Nothing is stored twice, so the four views cannot
disagree.

Every argument position is one of exactly three things, and this is the part
that matters most:

| state | meaning | who it costs |
|---|---|---|
| `value` | we have said what this means in DeckMatrix terms | done |
| `carried` | we know exactly what XMage wrote and have not said what it means | one shared table entry, pays for every card that uses it |
| `hole` | the card declares its own Java class | one person, pays for one card |

Unknowns are localised to the SLOT that holds them, never to the card. That is
the whole design, and section 4 is the argument for it.

---

# 2. Why the record is not a `dsl.ts` `Effect` tree

`src/lib/cards/abilities/dsl.ts` already has a closed `Effect` union of about
forty members that the runtime exhaustively switches. The obvious move is to
store every card as one of those trees. It does not work, for a reason that is
countable rather than aesthetic.

`scripts/xmage/extract-effects.mjs` counted, over all 32,168 card files:

- **2,405** distinct primitives the corpus invokes
- **723** of those are effect classes
- `CreateTokenEffect` alone appears with **982** distinct argument shapes,
  `ConditionalOneShotEffect` with 496, `DestroyAllEffect` with 15

Forty members will not hold 723 classes. There are only two ways to force it:
grow the union until nothing can exhaustively switch it, or collapse the
remainder into `{do:'manual'}`. The second is the silent drop this project
already fought and lost twice.

There is a second reason, and it is the one that matters for planning. If the
record can only hold what the reducer already understands, then extraction
progress is gated on reducer progress. There is no way to measure how much work
is left, and the ranked work order that makes the grind countable has nothing to
rank.

**So `Effect` is demoted from STORAGE to RUNTIME TARGET.** It is the output of
`lower()`, not the input. The record holds the recipe faithfully on day one; the
gap between the recipe and what the reducer can run is the measurement.

Everything else in `dsl.ts` is reused verbatim and is the normalisation target.
Section 8 sets out exactly what stays, what moves, and what is missing.

---

# 3. The shape

```
CardRecord
  oracleId, name, layout, commanderLegal, provenance
  faces[]
    index, kind, name, mana, types, subtypes, supertypes, pt, startingLoyalty
    abilities[]
      id, kind                 spell | triggered | activated | static | mana | replacement | keyword
      via: Invocation          the ability class itself; for a trigger this IS the event
      effects: Invocation[]
      costs: Invocation[]
      targets: Invocation[]
      modes[]?                 mode 0 is the ability's own effects
      modeLimits?              { min, max }
      interveningIf?: Slot     CR 603.4, checked twice, so not an effect
      keyword?                 { name, parameter }
      fromHelper?              XMage built this through a shared static helper

Invocation
  prim                         'xmage:DestroyAllEffect' | 'local:RhysticStudyDrawEffect' | 'dm:...'
  role                         from XMage's own class hierarchy, never guessed from the name
  args: Slot[]                 LABELLED with XMage's own parameter names
  mods[]?                      .add(...), .withInterveningIf(...), setMinModes(...)
  children?                    the extraction's sorting of nested constructions
  paramMatch?                  how sure we are the overload matched

Slot
  name?, of?                   parameter name and declared type
  value? | carried? | hole?    exactly one
```

## Three decisions inside that worth defending

**Everything is an `Invocation`.** Abilities, effects, triggers, costs, targets,
filters, tokens, conditions and dynamic values are all one node type. One node
type means one walker, one resolver, and exactly one place a slot can be
recorded as a hole. A design with a node per role has a place per role for an
unknown to go missing quietly, and things that can go missing in nine places do.

**Arguments are labelled, not positional.** `scripts/xmage/index-engine.mjs`
reads each class's own constructor signatures, so `DestroyAllEffect` comes out as
`filter = ..., noRegen = true` rather than as an unlabelled pair. That is what
lets a role rule say "the `filter` argument" instead of "argument 0", and it is
what makes the rule survive XMage adding an overload.

**The `prim` namespace is not decoration.** `xmage:` ids are shared across many
cards, so writing one lowering pays for every card that uses it. `local:` ids
belong to one card each, so each one costs a person and buys one card. The two
must never be totalled together, and prefixing them differently is what stops
that happening by accident. Section 9 turns that distinction into the ceiling on
the whole approach.

---

# 4. The three-state slot, and why the unit of honesty is the slot

Coverage has been overstated twice on this project. Once at 95.7%, measured over
the first 12,000 rows of a 34,088 row catalogue. Once at 59.26%, which counted a
card as automated when ONE of its abilities compiled.

Both were single numbers, and both had the same underlying fault: **the unit of
honesty was the card**. A card is a bad unit because it is not a single claim. It
is at least four claims, and they fail independently.

Dockside Extortionist is the clean example. XMage writes it as:

```
EntersBattlefieldTriggeredAbility(
  effect = CreateTokenEffect(
    token  = TreasureToken(),
    amount = <DocksideExtortionistValue, a card-local DynamicValue>))
```

The record, printed by the builder:

```json
{ "prim": "xmage:CreateTokenEffect", "role": "one-shot-effect",
  "paramMatch": "names-agree",
  "args": [
    { "name": "token",  "of": "Token", "value": { "k": "invoke",
        "invocation": { "prim": "xmage:TreasureToken", "role": "token", "args": [] } } },
    { "name": "amount", "of": "int",
      "hole": { "reason": "card-local-class", "declared": "DynamicValue",
                "localName": "DocksideExtortionistValue" } } ] }
```

One slot is a hole. The rest of the card is intact. So:

- **play** is blocked, because nothing can supply the count
- **deck building** still knows it makes Treasure tokens, with the magnitude
  recorded as `{ s: 'unknown', reason: 'card-local-class: DocksideExtortionistValue' }`
- **search** still indexes `effect=create-token`, `produces=treasure-token`,
  `role=token-maker`, and also `unknown=token-maker` so a query for reliable ramp
  can exclude it
- **comparison** still places it in `token-maker:any` and can rank it on cost,
  speed and legality, and refuses on quantity

Averaging that into one percentage is arithmetic on four unrelated things.
`coverage.ts` reports four booleans and never one number.

The `declared` field is what makes a hole useful rather than merely honest. The
hole knows it is a `DynamicValue`, so the record still knows the effect creates
SOME number of Treasures. Compare the failure mode this replaces: a default of
`amount ?? 1` would make Dockside a card that creates one Treasure and looks
like it worked.

---

# 5. The four views

All four read the same `Invocation` nodes.

## Play: `lower.ts`

`lowerAbility` turns invocations into `dsl.ts` `Effect` values through a table
keyed by `prim`. Two rules:

**Partial lowering is refused.** `verify-ability-coverage.mjs` casts real spells
through the real reducer and downgrades anything that resolves silently. It
downgraded 612 cards. A lowering that emits two of three effects and drops the
third produces exactly that failure, and produces it where no test notices,
because the ability did run and did change the board. So an ability is all or
nothing, and a failure returns the names of the primitives that are missing.
Those names are the work order.

**An ability that lowers to nothing is blocked, not vacuously fine.** A static or
replacement ability changes the game through `Modification`, and there is no
lowering table for those yet, so it reports blocked with `via.prim` named. That
puts continuous effects into the same ranked queue as one-shots instead of
leaving them invisible. A card with no abilities at all reports `vacuous`, which
is counted separately and never added to `playable`, because "the engine runs
this card" and "this card does nothing" are different claims.

## Deck building: `roles.ts`

A role is a function of `(primitive, resolved arguments)`, expressed as a rule
table of pure data with no closures.

It cannot be a constant on the primitive. `DestroyAllEffect` is a board wipe with
`FILTER_PERMANENT_CREATURES` and mass land destruction with `FILTER_LANDS`, and a
constant would be wrong about one of them. That is exactly the collapse the old
import-based extraction suffered, where fifty different sweepers became one
`[DestroyAllEffect]` signature.

It also should not be a judgement per card. Per card is 32,469 judgements and
every new set adds more. Per primitive is 723 judgements for effect classes and
it propagates to every card that uses one. That ratio is the reason the file
exists.

The role names are **not new**. They are the canonical tags already in
`src/engine/knowledge/tagger.ts`, spelled identically, because that vocabulary is
already in the database, in `derive_card_tags`, in the deck builder and on
screen. What changes is where they come from: the tagger reads oracle text with
66 regular expressions, this reads structure. Both can run, and the diff between
them is a measurement of how wrong the text tagger is.

Magnitude is a union, never a number with a fallback:

```
{ s: 'fixed', n }   { s: 'all' }   { s: 'computed', describe }   { s: 'unknown', reason }
```

Cultivate ramps by one. Dockside ramps by a number nobody can name at deck
building time. A builder that treats both as `ramp: 1` gives bad advice; one that
treats the unknown as `0` gives worse.

## Recommendation: `facetsOf`, in the same file

Facets come out of the **same rules** that emit roles. Not a second table,
because two tables drift and then the card the builder calls ramp is not returned
by a search for ramp.

A query for a one-sided creature sweeper becomes
`effect=destroy-all AND object=creature AND symmetry=one-sided`, which is three
index lookups and returns cards whose oracle text shares no words with the query.
The facet key set is closed, so a rule cannot invent a column and the index
schema stays fixed.

Facets read the effect's object set AND the ability's target set. Cyclonic Rift's
filter is on `TargetPermanent`, not on the effect, and an index that only looked
at effect arguments would answer "symmetric" by omission on the card whose whole
point is that it is not.

## Optimisation: `compare.ts`

Two rules.

**Only compare within a class.** A class is a role plus what it is pointed at,
because "removal" is not a conversation and "sweeps creatures" is. Wrath of God
and Armageddon share a primitive and are not in the same conversation. The
comparison returns `cls: null` for them and stops. A function that produces a
number for every pair of cards produces a number for that pair too, and that
number is noise dressed as advice.

**An axis that does not know says so.** Every axis is `{ known, v?, why? }`. An
optimiser that reads an unresolved magnitude as zero ranks Dockside Extortionist
below a Llanowar Elves, silently.

The axes are mana value, pip count, colours, speed, symmetry, scale, targeted,
conditional, Commander legality.

Mana value and pips are deliberately separate. `{2}{W}{W}` and `{3}{W}` are both
four, and only one is awkward in a three colour deck. Wrath of God against
Damnation is that comparison and nothing else, so an optimiser without pip count
cannot tell those two apart at all.

`colours` is recorded and deliberately not given a verdict. Colour is a deck
legality question, not a card quality one, and a comparison that says white beats
black is not a comparison.

There is **no overall score**. An overall score is a weighting, a weighting is a
format opinion, and a format opinion does not belong in the card record. The
caller weights the axes it cares about.

---

# 6. The hard list, worked

Every row is printed by `scripts/xmage/build-records.mjs` into
`scripts/coverage/.data/xmage-records.hardlist.json`. Slot columns are
total / value / carried / hole. Only 12 role rules and 7 lowerings exist so far,
so `playable` is a floor and not a claim.

| card | slots | play | agg | agg partly | search | comparison classes |
|---|---|---|---|---|---|---|
| Wrath of God | 2/2/0/0 | yes | yes | yes | yes | `board-wipe:creature` |
| Damnation | 2/2/0/0 | yes | yes | yes | yes | `board-wipe:creature` |
| Armageddon | 1/1/0/0 | yes | yes | yes | yes | `land-destruction:land` `stax:land` |
| Lightning Bolt | 1/1/0/0 | yes | yes | yes | yes | `targeted-removal:any` |
| Shock | 1/1/0/0 | yes | yes | yes | yes | `targeted-removal:any` |
| Cultivate | 4/4/0/0 | no | yes | yes | yes | `ramp:any` `tutor-narrow:any` |
| Kodama's Reach | 4/4/0/0 | no | yes | yes | yes | `ramp:any` `tutor-narrow:any` |
| Rhystic Study | 5/3/1/1 | no | no | no | yes | none |
| Cyclonic Rift | 6/6/0/0 | no | yes | yes | yes | `bounce:nonland-permanent` |
| Smothering Tithe | 3/2/0/1 | no | no | no | yes | none |
| Dockside Extortionist | 3/2/0/1 | no | no | yes | yes | `token-maker:any` |
| Cryptic Command | 4/4/0/0 | yes | yes | yes | yes | `counterspell:any` `bounce:any` `stax:creature` `card-draw:any` |
| Battle of Wits | 3/1/0/2 | no | yes | yes | yes | `finisher:any` |
| Delver of Secrets | 1/0/0/1 | no | no | no | yes | none |
| Agadeem's Awakening | 5/3/1/1 | no | yes | yes | yes | `reanimator:any` `graveyard-recursion:any` |

## 6.1 The unlock, end to end

```
Wrath of God   DestroyAllEffect(filter = { type Creature, zone battlefield }, noRegen = true)
Damnation      DestroyAllEffect(filter = { type Creature, zone battlefield }, noRegen = true)
Armageddon     DestroyAllEffect(filter = { type Land,     zone battlefield })
```

Roles, from one rule with three branches:

```
Wrath of God  board-wipe        scale all
Damnation     board-wipe        scale all
Armageddon    land-destruction  scale all
              stax              scale all
```

Lowered for play:

```
Wrath of God  [{ do: 'destroy', what: { sel: 'all', where: { is: 'type', value: 'Creature' },
                                        zone: 'battlefield' } }]
Armageddon    [{ do: 'destroy', what: { sel: 'all', where: { is: 'type', value: 'Land' },
                                        zone: 'battlefield' } }]
```

Compared:

```
Wrath of God vs Damnation    class board-wipe:creature
  manaValue  tie, both 4        pipCount tie, both 2
  symmetry   tie, both symmetric  speed  tie, both sorcery
  targeted   tie, both false    conditional tie, both false
  scale      tie, both affect everything selected

Wrath of God vs Armageddon   no shared class, refused
```

That first result is correct and worth stating plainly: those two cards are the
same card, and the only difference between them is which deck can play one. The
shape says so instead of inventing a winner.

Where an axis does have work to do:

```
Lightning Bolt vs Shock      class targeted-removal:any
  manaValue tie, both 1   pipCount tie, both 1   speed tie, both instant
  scale     A, 3 is more
```

## 6.2 Cultivate, the card the text compiler refuses

`dsl-coverage.latest.json` records Cultivate as `coverage: "manual"`, meaning the
oracle-text compiler produced no abilities for it at all. The XMage record
resolves it completely:

```
SearchLibraryPutOntoBattlefieldTappedRestInHandEffect(
  target = TargetCardInLibrary(minNumTargets = 0, maxNumTargets = 2,
                               filter = { and: [ type Land, supertype Basic ] }))
```

Four slots, four values, no holes. Roles `ramp` and `tutor-narrow`, both scale 1.
Comparable against Kodama's Reach, which ties on every axis, correctly.

`supertype Basic` is only there because the builder replays
`StaticFilters.java`'s static initialisers. The engine index records each
constant's initialiser but not the `static { ... }` block that follows it, and
`FILTER_CARD_BASIC_LANDS` is initialised as a plain `FilterLandCard` with the
word "basic" added afterwards by a predicate. Reading only the initialiser would
record "land card" for Cultivate: wrong in a way nothing downstream would notice.
103 constants and 118 `add()` calls are replayed.

## 6.3 Cryptic Command, modal

Mode 0 is the spell ability's own effects, because that is how XMage builds one:
the first mode IS the spell ability and `addMode` appends the rest. Walking
`effects` and then walking every mode counts mode 0 twice, which made an early
draft report "counterspell" twice for this card and would have inflated every
per-role total taken over the catalogue. One accessor, `effectRootsOf`, so the
mistake has one place to be made.

`getModes.setMinModes(2)` and `setMaxModes(2)` arrive as modifiers, not as
constructor arguments, because that is what they are in the source. The lowered
form:

```json
{ "do": "choose-mode", "min": 2, "max": 2, "modes": [
  { "text": "", "effects": [{ "do": "counter",    "what": { "sel": "target", "ref": 0 } }] },
  { "text": "", "effects": [{ "do": "move-zone",  "what": { "sel": "target", "ref": 0 }, "to": "hand" }] },
  { "text": "", "effects": [{ "do": "tap", "what": { "sel": "all",
       "where": { "is": "type", "value": "Creature" },
       "controller": { "who": "each-opponent" }, "zone": "battlefield" } }] },
  { "text": "", "effects": [{ "do": "draw", "who": { "who": "you" }, "count": 1 }] } ] }
```

`text` is empty on purpose. A mode's printed words are Wizards of the Coast rules
text and are never copied out of the extraction; the renderer fills them from
Scryfall at display time. Note the tap mode carries
`controller: each-opponent`, so it is correctly one-sided.

Each mode's targets are its own. `{sel:'target', ref:0}` in the counter mode
means a spell and in the bounce mode means a permanent, and a lowering that read
the ability's first target for both would point the bounce at the spell.

## 6.4 Battle of Wits, intervening if

```
BeginningOfUpkeepTriggeredAbility(effect = WinGameSourceControllerEffect())
  .withInterveningIf(<BattleOfWitsCondition, card-local Condition>)
```

`interveningIf` is a field on the ability, not an effect inside it, because CR
603.4 checks it twice: once when the trigger would go on the stack and again on
resolution. Folding it into the effects would change what the card does.

880 cards use `withInterveningIf`. The condition here is card-local, so the slot
is a hole with `declared: "Condition"`. The card is therefore not playable, and
the reason given is
`xmage:BeginningOfUpkeepTriggeredAbility: intervening if condition did not resolve`
rather than an empty `blockedBy` list that would read like a bug. It is still
`finisher` for deck building and still searchable on
`trigger=BeginningOfUpkeepTriggeredAbility, effect=win-game-source-controller`.

Beastbond Outcaster is the contrasting case: its intervening if is
`FerociousCondition.instance`, a shared engine class, so it lands as a `carried`
slot that one table entry would resolve for every card that uses it. 49 distinct
shared condition classes appear across the corpus.

## 6.5 Cyclonic Rift, and a false positive that was caught

Cyclonic Rift originally reported `playable: true`, and it was wrong. XMage
writes the card as one call:

```java
OverloadAbility.implementOverloadAbility(this, new ManaCostsImpl<>("{6}{U}"),
        new TargetPermanent(filter), new ReturnToHandTargetEffect());
```

That single static helper adds BOTH the overload ability and the spell's own base
cast mode. The extraction sees one `OverloadAbility`, so the record has no way to
cast the card for `{1}{U}`. Lowering it produced an activated bounce that ran and
was wrong, which is worse than a card that refuses.

So an ability with `fromHelper` set is now blocked by construction. 35 abilities
across the corpus arrive this way. This is the exact failure class the whole
design is meant to prevent, and it survived until a real card was walked through
the pipeline, which is the argument for checking a hard list rather than a toy
one.

What the record does get right about the card: the overload filter carries
`TargetController.NOT_YOU`, so the facets are
`object=nonland-permanent, symmetry=one-sided` and the comparison class is
`bounce:nonland-permanent`. That symmetry flag is why the card is worth seven
mana, and no bag-of-words reading of its oracle text recovers it.

## 6.6 Rhystic Study and Smothering Tithe, the hard-written tail

Both are one triggered ability whose effect is a class the card file declares
itself:

```
Rhystic Study     SpellCastOpponentTriggeredAbility(zone = battlefield,
                     effect = local:RhysticStudyDrawEffect,
                     filter = StaticFilters.FILTER_SPELL_A, optional = false,
                     setTargetPointer = SetTargetPointer.PLAYER)
Smothering Tithe  DrawCardOpponentTriggeredAbility(
                     effect = local:SmotheringTitheEffect,
                     optional = false, setTargetPointer = true)
```

The trigger is fully resolved. The effect is not, and cannot be by any shared
work, because the class exists once and is used once.

Worth saying plainly, because it contradicts a number already in the repo:
`dsl-coverage.latest.json` marks both of these `coverage: "full", automated:
true`. That is the oracle-text compiler matching a phrasing. XMage, which
actually runs these cards, needed hand-written Java for both. The text figure is
measuring the compiler, not the game.

`dsl.ts` does have `{do:'unless-pays'}` for exactly this shape, added with a
comment explaining that Rhystic Study and Smothering Tithe are one rule with two
spellings. So the DSL can express these two cards. What the record cannot do is
DERIVE that from XMage, because the derivation lives in a Java method body. These
are cards a person writes, and the record's job is to say so precisely rather
than to guess.

## 6.7 Delver of Secrets and Agadeem's Awakening, two faces

```
Delver of Secrets     transform
  face 0  left   Delver of Secrets     {U}   Creature  1/1   1 ability
  face 1  right  Insectile Aberration  none  Creature  3/2   1 ability (Flying)

Agadeem's Awakening   modal-dfc
  face 0  left   Agadeem's Awakening       {X}{B}{B}{B}  Sorcery  1 ability
  face 1  right  Agadeem, the Undercrypt   none          Land     2 abilities
```

Faces are first class because the four consumers need different things from
them. Play needs to know which face may be cast. Deck building needs Agadeem's
Awakening counted in the mana base AND as a reanimation spell. Search must not
return the back face for a query the front face does not answer. Comparison must
rank an MDFC land against a land, not against a sorcery.

`layout` comes from the XMage base class the card extends
(`TransformingDoubleFacedCard`, `ModalDoubleFacedCard`, `SplitCard`,
`AdventureCard`, `MeldCard`), never inferred from the name.

Agadeem's Awakening also shows the `{X}` rule working: `manaValue` reports
`unknown` with the reason "cost contains {X}; mana value is a floor, not a
price", instead of reporting 3.

---

# 7. What this shape cannot express yet

Stated as a boundary, because a boundary is more useful than a claim of
completeness.

**1. Card-local classes.** 10,025 distinct `local:` classes appear across the
corpus, roughly one per card that has any. Writing one of those buys one card,
so there is nothing to be gained by doing them in bulk.
Where the local class is the whole effect (Rhystic Study, Smothering Tithe,
Delver of Secrets) the card is not aggregatable or comparable either, only
searchable on its trigger.

**2. Static and continuous effects.** The record holds them, `dsl.ts` has
`Modification` with explicit CR 613 layers, and there is no lowering table
between the two yet. `xmage:SimpleStaticAbility` heads the work order at 5,867
cards. This is the single largest gap and it is a lowering table, not a design
change.

**3. Keywords.** `keyword:Flying` blocks 3,103 cards, `keyword:Enchant` 1,235,
`keyword:Trample` 980. `dsl.ts` has `KeywordAbility` and the record carries the
name and parameter. What is missing is runtime meaning, which belongs to the
engine agent, not here.

**4. Timing and the stack.** The record says what an effect does, not when it
does it relative to anything else. Priority, the stack, split second, state based
actions and layer application order are all outside it. `index-engine.mjs` reads
a CR 613 layer per class only where the class states one.

**5. Static helpers.** 35 abilities are built by a shared helper method that adds
more than the record sees. Cyclonic Rift is the example. These are blocked rather
than guessed at, and the fix is per helper, not general.

**6. Alternative and additional costs.** Flashback, overload, kicker, escape,
evoke and "as an additional cost" are not modelled. The record has an ability's
own `costs` and nothing about alternative ways to cast the card.

**7. Cost interaction.** `dsl.ts` has `cost-modify` as a layer, but nothing in
the record computes what a spell actually costs given the board, so the
optimiser's `manaValue` is a printed cost and not an effective one.

**8. Filters the classifier will not guess.** `classifyFilter` returns `[]` for
anything outside a closed list of object classes, and `[]` means "do not know",
never "no". Over the corpus, 373 of 17,197 filter constructions land on a class
the table does not name, and 2,771 more are refused because a predicate was not
recognised. Refusing is deliberate: every predicate narrows the set, so dropping
one would make the record claim a spell destroys all creatures when it destroys
only some. The largest refusals are `ManaValuePredicate` 328, `AbilityPredicate`
327, `PowerPredicate` 282, `Predicates.not` 185, `NamePredicate` 153.
`NamePredicate` will stay refused: it holds a card name, which is Wizards of the
Coast text and is omitted from the extraction on purpose.

**9. Side effects of a role.** Scale describes the primary role's magnitude and
nothing else. Cultivate and Rampant Growth would both report `ramp: 1`, and the
shape has no axis for the extra land Cultivate puts in hand.

**10. Anything across roles.** "Is Rhystic Study better than Smothering Tithe"
needs a model of a format and a table, which this shape does not have and should
not pretend to.

**11. Two effect classes are reachable in the extraction and not from an ability
root in the built records:** `IsAllCreatureTypesSourceEffect` and
`ReturnToBattlefieldUnderYourControlSourceEffect`, both of which XMage attaches
with `ability.addEffect(...)` on a local variable. That is 2 of 723 and it is
reported rather than explained, because a confident wrong explanation is worse
than a measured gap. Section 9 has the cross-check that found it.

---

# 8. Reconciling with `src/lib/cards/abilities/dsl.ts`

Verdict: **extend it, and demote one type.** Nothing in `dsl.ts` is thrown away.

## What is reused verbatim, and is the normalisation target

`CardFilter`, `Selector`, `PlayerSelector`, `ValueExpr`, `Condition`, `Cost`,
`TargetSpec`, `Modification`, `Restriction`, `Duration`, `Zone`, `Step`,
`TokenSpec`, `ManaColor`, `Cmp`, `WatchQuery`, `assertSerialisable`,
`assertNever`.

`src/lib/cards/xmage/*` imports all of these from `../abilities/dsl.ts` and
defines none of them again. There is one filter language, one arithmetic
language and one serialisation contract for the whole app. A `carried` slot
becomes a `value` slot precisely when it has been expressed in one of these.

## What is demoted

`Effect` moves from storage format to runtime target, for the reasons in section
2. `lower()` produces it; nothing stores it.

## What is superseded

`CardAbilities`, the current top-level record, stops being the source of truth
for behaviour. It stays as the oracle-text compiler's output type and as the
fallback for cards with no XMage record: the extraction joins 31,731 of 32,168
card files to a Scryfall oracle id, so a few hundred catalogue entries will
always need the text path or a human.

`deriveCoverage`'s four-way `full | partial | manual | none` also stops being the
headline. It answers one consumer's question and gets quoted as if it answered
four. `CardCoverage` replaces it with four booleans and a slot census.

## What `dsl.ts` is missing, ordered by how many cards it blocks

Measured by `lowerCard` over all 32,168 records with the seed table, so these are
cards that would become runnable if that one lowering existed and nothing else
changed. The full list is 7,635 entries in
`scripts/coverage/.data/xmage-record-shape.json` under `coverage.workOrder`.

| cards | primitive | `dsl.ts` status |
|---|---|---|
| 5,867 | `xmage:SimpleStaticAbility` | `Modification` exists; no lowering |
| 3,103 | `keyword:Flying` | `KeywordAbility` exists; no runtime |
| 2,164 | `xmage:CreateTokenEffect` | `create-token` exists; needs a token table |
| 1,265 | `xmage:AttachEffect` | `attach` exists |
| 1,235 | `keyword:Enchant` | `KeywordAbility` exists |
| 1,192 | `xmage:BoostTargetEffect` | `pump` exists |
| 1,118 | `xmage:GainLifeEffect` | `gain-life` exists |
| 1,103 | `xmage:AddCountersSourceEffect` | `add-counters` exists |
| 1,101 | `xmage:DestroyTargetEffect` | `destroy` exists |
| 995 | `xmage:GainAbilityTargetEffect` | `Modification` layer `ability` exists |
| 980 | `keyword:Trample` | `KeywordAbility` exists |
| 602 | `xmage:ConditionalOneShotEffect` | `{do:'if'}` exists; needs a condition table |
| 594 | `xmage:EquipAbility` | `attach` plus `ActivatedAbility` exist |
| 580 | `xmage:DoIfCostPaid` | **missing.** `unless-pays` is the inverse polarity |

The conclusion is sharper than expected and worth stating: **the head of the work
order is almost entirely lowerings, not new `Effect` members.** `dsl.ts`'s
vocabulary is broadly adequate. What is missing is three lookup tables and the
functions that use them.

| table | distinct shared classes in the corpus |
|---|---|
| tokens, XMage `Token` class to `TokenSpec` | 629 |
| conditions, XMage `Condition` class to `Condition` | 49 |
| dynamic values, XMage `DynamicValue` class to `ValueExpr` | 30 |
| costs, XMage `Cost` class to `Cost` | 66 |
| targets, XMage `Target` class to `TargetSpec` | 49 |
| filters, XMage `Filter` class to `CardFilter` | 52 |

Those are small, bounded and countable. 629 token classes is the largest, and
most are one line.

## Additions `dsl.ts` will need

Named here so the DSL owner accepts or rejects them deliberately rather than
inheriting them:

1. `{ do: 'do-if-cost-paid', who, cost, then }`. 580 cards. `unless-pays` asks
   somebody else and runs the effects on refusal; this asks the controller and
   runs them on payment. Getting the polarity wrong resolves the card backwards,
   which is why it is a separate member and not a flag.
2. `{ do: 'transform', what }`. Required by every transforming double-faced card.
3. `{ do: 'scry' | 'surveil', who, count }`. `ScryEffect` blocks 335 cards.
4. `{ do: 'fight', a, b }` and `{ do: 'copy', what }`. Not in the head of the
   list, and both are commonly asked for by name in a deck builder.

Nothing else in the head of the work order needs a new `Effect` member.

---

# 9. The measurements

Denominator everywhere: **32,168 XMage card files**, which is the whole
`Mage.Sets/src/mage/cards` tree. Printed by
`node --experimental-strip-types scripts/xmage/build-records.mjs`.

## Slot census

Every argument position in every built record, deduplicated by object identity.

| state | slots | share |
|---|---|---|
| total | 184,863 | |
| `value` | 142,624 | 77.15% |
| `carried` | 34,939 | 18.90% |
| `hole` | 7,300 | 3.95% |

`carried` broken down by what it holds: `enum` 15,624, `text` 6,162 (display
strings whose contents are omitted for the licence reason), `factory` 5,594,
`self` 3,138, `construct` 2,760, `const` 1,033, `null` 674, `class-literal` 445,
`card-ref` 160.

The deduplication is load bearing, not tidiness. The extraction states one
construction twice, as an argument to the ability's constructor and again in its
own effect list, because both are true. Counting both inflates every ratio taken
over the census. Measured: 189,132 slot positions normalised, 184,863 distinct
slots counted.

## Filters

| measure | count |
|---|---|
| filter constructions seen | 17,198 |
| resolved to a `CardFilter` | 14,052 (81.71%) |
| narrowed by the filter's OWN constructor argument | 1,829 |
| refused, class not in the table | 373 |
| refused, predicate not recognised | 2,771 |
| `StaticFilters` references resolved | 6,491 of 6,878 (94.4%) |

30 filter class entries is enough that only 2.2% of constructions land on an
unnamed class. The class table is explicit, never decomposed from the class's
spelling, because decomposing an identifier is a text search wearing a hat.

## Constructor overload ambiguity

1,860 invocations matched more than one constructor overload of the same arity.
Of those, **473 have the same parameter name at every position across all
candidates**. The overload is unknown; the name is not. Separating those two
cases is what lets Dockside Extortionist still be recognised as a Treasure maker:
`CreateTokenEffect(Token, int)` and `CreateTokenEffect(Token, DynamicValue)` both
call the second argument `amount`. The remaining 1,387 are refused by any rule
that reads an argument by name.

## The four coverage numbers

With 12 role rules and 7 lowerings written. These are a floor on the method, not
a report on the engine.

| question | cards | share |
|---|---|---|
| playable | 5,985 | 18.61% |
| aggregatable | 4,688 | 14.57% |
| aggregatable, magnitude unknown | 6,688 | 20.79% |
| searchable | 29,618 | 92.07% |
| comparable | 6,276 | 19.51% |

`playable` was 717 when this table was first written, against a `lowerAbility`
that produced `Effect[]` and 7 lowerings. It now produces a whole `dsl.ts`
`Ability` and reads 41 effects, 11 ability classes and six vocabulary tables,
which is why the figure moved. `docs/engine/PORT-LOG.md` re-measures the before
side under the current definition rather than comparing the two.

**`searchable` is the weakest of the four and must not be quoted bare.** It asks
only whether a card has at least one facet, and every effect contributes its own
class name as one. 17,739 of those 29,618 cards, 59.9%, carry nothing beyond the
effect and trigger class names, which is the fingerprint the 22 Aug settlement
said was not enough. 4,553 cards, 14.15%, carry what the effect points at.
Counted by `scripts/coverage/xmage-runnable.mjs`.

**And `playable` is not automation.** It says every ability lowered into a
`dsl.ts` shape. `scripts/coverage/xmage-runnable.mjs` carries that forward to the
engine's own doors: 5,984 would not throw or be silently dropped, and 5,183
(16.11%) reach an engine that would act on every ability. The 802 in between are
triggered abilities the engine cannot fire, mostly because it cannot yet announce
targets for a trigger. Nothing outside `src/lib/cards/xmage/` imports this
module, so the number of cards the shipped app runs from these records is 0.

351 cards are vacuous, having no abilities at all. They are never added to
`playable`.

A sanity check worth recording, with both denominators stated because they are
different. When this was written `playable` was 717 of 32,168 XMage card files,
2.23%, under the older `Effect[]` lowering. The independently
measured `abilityEngineOwns` figure for the existing compiled-ability bridge is
906 of 34,088 catalogue rows, 2.66%. The two counts are over different sets and
must not be added or subtracted, but landing in the same part of a percent from
7 lowerings against a hand-built compiler is what you would expect, and is weak
evidence that neither is inflated.

## The ceiling, and this is the important one

A shared XMage primitive pays for every card that uses it. A card-local class
pays for one card. The set of cards with **no hole and no `local:` primitive
anywhere** is the most that shared work can ever reach.

| | cards | share |
|---|---|---|
| reachable by shared work alone | 23,007 | 71.52% |
| needs a person | 9,161 | 28.48% |

That 28.48% is not a gap to be closed by better parsing. It is 10,025 distinct
Java classes that exist once each. Any plan that says "we will automate the
catalogue" has to say what it means to do about those 9,161 cards, and the honest
answers are hand-write them, buy them, or leave them marked as needing a human.

## What the record adds over the oracle-text path

7,292 cards are marked `coverage: "manual"` in `dsl-coverage.latest.json`,
meaning the text compiler produced no abilities for them at all, and also join to
an XMage record. Of those:

| | cards | share of 7,292 |
|---|---|---|
| the record makes structurally searchable | 6,981 | 95.74% |
| the record gives at least one deck-builder role | 1,001 | 13.73% |
| the record makes playable | 436 | 5.98% |

The first row is the answer to "why are recommendations weak", with the caveat
above attached: the app currently decides what a card does by matching its
wording, and for 7,292 cards the wording match produces nothing, while the record
produces at least a structural class name for 95.74% of them. For most of that
95.74% a class name is all it produces. The row that says the record understands
those cards is the second one, at 13.73%.

## Cross-check against the extraction

Two independent walks of the same corpus, so agreement is evidence the record
shape did not lose a branch.

| measure | count |
|---|---|
| distinct effect classes counted by `extract-effects.mjs` over every `new` node | 723 |
| reachable from an ability root in the built records | 721 |
| in the extraction, not reached here | 2, named in section 7 |
| reached here, not in the extraction | 0 |

## Shared vocabulary

Distinct XMage classes the corpus invokes, by role, printed by the same run:

```
   629  token              66  cost
   411  one-shot-effect    52  filter
   310  continuous-effect  52  watcher
   296  triggered-ability  49  target
   174  static-ability     49  condition
   123  other              30  dynamic-value
    79  activated-ability  24  predicate
                           23  mana-ability

 10025  CARD-LOCAL classes, used by one card each
```

---

# 10. How to reproduce

```
node --experimental-strip-types scripts/xmage/build-records.mjs
node --test --experimental-strip-types "src/lib/cards/xmage/*.test.ts"
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

The builder needs `scripts/coverage/.data/xmage-card-effects.ndjson` and
`xmage-engine-index.json`, both produced by `scripts/xmage/extract-effects.mjs`
and `scripts/xmage/index-engine.mjs`, and it reads `StaticFilters.java` from
`$XMAGE_ROOT` in place.

## Files

| file | what it holds |
|---|---|
| `src/lib/cards/xmage/record.ts` | the record, the invocation, the three-state slot, the walkers |
| `src/lib/cards/xmage/roles.ts` | the deck-builder role vocabulary, the rule table, facets |
| `src/lib/cards/xmage/compare.ts` | comparison classes, axes, verdicts |
| `src/lib/cards/xmage/lower.ts` | the lowering contract to `dsl.ts` `Effect`, and the work order |
| `src/lib/cards/xmage/coverage.ts` | the four coverage numbers and the slot census |
| `src/lib/cards/xmage/record.test.ts` | 19 tests, each pinning one decision argued above |
| `scripts/xmage/build-records.mjs` | the builder, the normaliser, and every figure in this document |

## One thing outside this work that is now stale

`THIRD-PARTY-NOTICES.md` line 72 reads: *"XMage's ~25,000 individually-scripted
card classes under `Mage.Sets/` were not ported and will not be."* The 22 August
settlement reversed that decision. The file is outside this workflow's ownership
list and other workflows are live, so it has not been edited. Attribution itself
is satisfied: the MIT notice and copyright line appear at the top of this
document and in every script and type file added here.
