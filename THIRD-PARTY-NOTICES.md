# Third-party notices

DeckMatrix bundles and derives from third-party work. This file records what, under which
licence, and — where the obligation is attribution — discharges it.

It also records, deliberately and in writing, one thing DeckMatrix does **not** derive from.
See [Card-Forge/forge is not used](#card-forgeforge-is-not-used-gpl-30) below.

---

## XMage (magefree/mage) — MIT

**Used as:** an architectural source for the rules core in `src/lib/game/`.

DeckMatrix's rules engine is written from scratch in TypeScript. No XMage source file has been
copied, machine-translated, or vendored. What is derived is XMage's **model** — how a game of
Magic decomposes into parts, and what those parts are called. That decomposition is the hard,
well-earned thing in XMage, and it is genuinely load-bearing here, so it is attributed rather
than quietly absorbed.

### Licence

```
MIT License

Copyright (c) 2010 betasteward@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Upstream: <https://github.com/magefree/mage> · Licence file: `LICENSE.txt` in that repository.

### Which parts of `src/lib/game/` are architecturally derived

| DeckMatrix file | XMage counterpart (concept, not code) | What was taken |
|---|---|---|
| `rules.ts` | `mage.game.GameImpl`, `mage.game.GameState`, `mage.game.turn.*` | Turn → phase → step decomposition; the idea that the game object owns a single authoritative state and that every mutation goes through one entry point; state-based actions run after every action rather than on a timer |
| `rules.ts` (`checkStateBasedActions`) | `GameImpl.checkStateBasedActions` | State-based actions as a separate sweep with its own loss/win detection, applied post-action and before triggers |
| `combat.ts` | `mage.game.combat.Combat`, `CombatGroup` | Attacker/blocker declaration as recorded state, damage assignment as a separate resolution policy, first-strike as a genuine second damage step |
| `keywords.ts` | `mage.abilities.keyword.*` | Keyword abilities as a closed, enumerable set with fixed meanings, separable from card-specific text; protection as a parameterised keyword |
| `effects.ts` | `mage.abilities.TriggeredAbility`, `mage.abilities.effects.*` | Triggered abilities as (timing condition → effect list); effects that emit changes rather than mutate directly |
| `types.ts` | `mage.game.GameState`, `mage.cards.Card`, `mage.players.Player` | The state's shape: one flat card registry, zones as ordered id lists, players holding zone references rather than card objects |
| `mana.ts` | `mage.abilities.mana.*`, `mage.ManaCost` | Cost as a parsed symbol list, payment as a separate planning step over available sources |
| `layers.ts` | `mage.abilities.effects.ContinuousEffect`, `ContinuousEffects.apply(Game)`, `mage.constants.Layer`, `mage.constants.SubLayer`, `mage.constants.DependencyType` | The CR 613 layer pipeline as an explicit ordered walk; one effect declaring several layers rather than the layer being inferred from which fields it sets; timestamp ordering within a layer; dependency declared as tag sets (`getDependencyTypes`/`getDependedToTypes` → `provides`/`dependsOn`) because 613.8 dependency is not inferable in general |
| `manual.ts` | *(none — DeckMatrix-specific)* | The manual-resolution path has no XMage counterpart; XMage scripts every card instead |

Files added by the current overhaul — a continuous-effects **layer system**, an explicit
**stack**, **replacement effects**, a dedicated **state-based-actions** module and a
**triggered-ability** collector — derive from the same source: `mage.abilities.effects.ContinuousEffects`
and its layer ordering, `mage.game.stack.SpellStack`, `mage.abilities.effects.ReplacementEffect`,
and `mage.abilities.TriggeredAbilities` respectively. Where those files exist in
`src/lib/game/`, this table applies to them on the same terms.

### What was deliberately *not* taken

XMage's ~25,000 individually-scripted card classes under `Mage.Sets/` were not ported and will
not be. Card behaviour in DeckMatrix comes from compiling Scryfall oracle text against our own
declarative rules (`src/lib/cards/tagger.ts`, `src/lib/game/effects.ts`), not from transcribed
card implementations.

### Where the port diverges, and why

XMage is mutable-object Java: live `Game` instances, inheritance hierarchies, effects that hold
references and mutate the objects they are handed. That model does not survive contact with
DeckMatrix's hard requirement, which is that a game **is** its action log and any client
replaying that log reaches byte-identical state.

So the architecture is ported and the mechanism is not:

- no class instances in state — `GameState` is plain JSON, `structuredClone`-safe;
- no inheritance — behaviour is data plus pure functions over it;
- no clock — timestamps arrive on `action.at`, stamped at the React boundary, never read inside
  `src/lib/game/`;
- no ambient randomness — shuffles run through the seeded mulberry32 RNG in `state.rng`;
- effects return `GameAction[]` for the reducer to apply, rather than mutating state in place.

Where XMage's design would have broken determinism or serialisability, the design was changed.
That is a requirement of the product, not a stylistic preference, and is recorded in
`docs/overhaul/RULES-ENGINE-DIRECTION.md`.

---

## Card-Forge/forge is not used (GPL-3.0)

**Nothing in this repository derives from [Card-Forge/forge](https://github.com/Card-Forge/forge).**

This is stated explicitly because it matters and because a future contributor should be able to
see that the line was held on purpose rather than by accident.

Forge is licensed **GPL-3.0**. Translating GPL-licensed code into another language produces a
derivative work — copyright treats translation of software the way it treats translation of a
book. Porting Forge's engine, or machine-converting its `res/cardsfolder` card scripts into our
DSL, would place DeckMatrix itself under GPL-3.0 with a full source-disclosure obligation. That
is incompatible with the owner's intent to commercialise the product.

Therefore, and permanently:

- no Forge source, in Java or translated to any other language;
- no Forge card scripts, verbatim, edited, or machine-converted;
- no data files extracted from a Forge distribution;
- no Forge-derived ability DSL, keyword table, or effect taxonomy.

### Verification performed

Checked on 2026-08-18 against the working tree:

- Full-text search of `src/`, `docs/`, `scripts/`, `supabase/` and the repository root for
  `forge`, `Card-Forge`, `cardsfolder`, `forge-gui`, `forge-game`, `GPL`, `GPLv3`,
  `GNU General Public`, `LGPL`, `AGPL`. Every hit is one of: prose in
  `docs/overhaul/RULES-ENGINE-DIRECTION.md` and `docs/overhaul/PLAY-MODE-SPEC.md` explaining why
  Forge is excluded; one explanatory comment in `src/lib/game/effects.ts`; the GitHub remote
  name `eoe-forge` in `CLAUDE.md`, which is unrelated; or Magic card names containing the word
  ("Battlefield Forge", "Darksteel Forge", "Forgotten Cave") inside Scryfall-sourced data.
- No `.java` sources, no `res/cardsfolder` tree, no Forge deck (`.dck`) or script (`.txt`) card
  definitions anywhere in the tree.
- Card data throughout is sourced from **Scryfall** (`src/lib/scryfall/`, `scripts/scryfallSync.ts`),
  which is the only card-data origin in this project.
- No GPL-, LGPL- or AGPL-licensed package appears among the 80 direct dependencies in
  `package.json`. (Two transitive **build-time** packages carry an LGPL component — see
  [npm dependencies](#npm-dependencies) — but neither is Forge-related and neither ships in the
  browser bundle.)

Ideas and the rules of Magic are not copyrightable; expression is. Reading Forge to understand a
concept would be lawful, but this project does not do it, because the cheapest way to keep the
line clean is not to approach it. Design questions are answered from XMage or from the Magic
Comprehensive Rules.

---

## Scryfall — card data

Card names, oracle text, type lines, mana costs and images are sourced from the
[Scryfall API](https://scryfall.com/docs/api) under Scryfall's terms of use. Scryfall data is
provided free of charge; the card information itself is copyright Wizards of the Coast.

## Wizards of the Coast

Magic: The Gathering is a trademark of Wizards of the Coast LLC. DeckMatrix is unofficial Fan
Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by
Wizards. Portions of the materials used are property of Wizards of the Coast LLC.

## npm dependencies

Direct dependencies (80, audited 2026-08-18): 73 MIT, 5 Apache-2.0, 1 ISC, and GSAP. Across the
full installed tree (568 packages) the distribution is MIT, ISC, Apache-2.0, BSD-2/3-Clause,
BlueOak-1.0.0, Python-2.0, CC-BY-4.0 and MPL-2.0-or-Apache-2.0. Licence texts ship inside
`node_modules/`.

Two items are worth calling out rather than averaging into "permissive":

- **GSAP** (`gsap`, runtime dependency) is not under an OSI licence. It ships under GreenSock's
  "Standard 'no charge' license" (<https://gsap.com/standard-license>), which permits use in a
  site or app the end user is not charged a fee to access. If DeckMatrix ever charges for access
  to a surface that uses GSAP, that licence must be re-read and a GreenSock commercial licence
  bought, or GSAP replaced. Flagged here because the product is intended to be commercialised.
- **`sharp`** (devDependency, used by `scripts/prepare-logo.mjs`) pulls prebuilt binaries
  `@img/sharp-win32-x64` and `@img/sharp-wasm32`, licensed `Apache-2.0 AND LGPL-3.0-or-later`
  (libvips). These are build-time image tooling. They are never imported by application code,
  never bundled by Vite, and do not appear in `dist/`. Using an LGPL binary as a separate tool
  does not make the calling project a derivative work — but it is recorded here so the claim
  "nothing in this repo is copyleft" is never made carelessly.
