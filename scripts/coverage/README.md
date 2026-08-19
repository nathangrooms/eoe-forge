# `scripts/coverage/` — the XMage planning extractor

A **planning instrument**. It reads XMage's source out of a clone **outside this
repo** and produces one artefact: a ranked, dependency-ordered list of engine
primitives to write, with a measured count of DeckMatrix cards attached to every
line.

It does **not** populate a table, generate card behaviour, or feed the runtime.
Nothing it emits is executable. See `docs/overhaul/PRIMITIVE-BUILD-ORDER.md`.

## Setup

XMage is never vendored here. Clone it somewhere else and point at it:

```bash
git clone --filter=blob:none https://github.com/magefree/mage /some/path/outside/this/repo
git -C /some/path/outside/this/repo checkout 07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d
export XMAGE_ROOT=/some/path/outside/this/repo
```

`07ecb7cf…` is the commit every published figure was measured at. Every artefact
records the commit it actually read, and the scripts print a warning when the
clone is not on the pinned one.

## Running it

```bash
node scripts/coverage/engine-index.mjs                          # 0. index XMage's engine tree
node scripts/coverage/extract.mjs                               # 1. census all 32,168 card classes
node scripts/coverage/join.mjs                                  # 2. join to our `cards` table
node --experimental-strip-types scripts/coverage/our-coverage.ts # 2b. what our compiler already does
node scripts/coverage/rank.mjs                                  # 3. the ranked build order
```

Passes 0–2b write to `scripts/coverage/.data/` (gitignored). Pass 3 reads them
and prints the report; it also writes `primitive-order.<weight>.<objective>.json`.

Useful flags on `rank.mjs`:

| flag | default | effect |
|---|---|---|
| `--weight commander \| all` | `commander` | which of our cards to weight by |
| `--rank-by new \| gross` | `new` | `new` ignores cards our own compiler already handles |
| `--top N` | `400` | how many rows to print |

## Drift

```bash
node scripts/coverage/drift.mjs --snapshot   # freeze today's engine as the baseline
# …later, against a newer XMage checkout:
node scripts/coverage/engine-index.mjs
node scripts/coverage/drift.mjs --check      # exit 1 if a primitive WE implemented changed
```

`--check` reports classes whose body changed with **no rename** — the failure
mode that leaves a card looking automated while its semantics moved upstream. It
cross-references the ranked order and `implemented-primitives.json` so the output
is a short list of things to review, not a wall of noise.

`implemented-primitives.json` is the list of primitives we have actually built.
It is `{"primitives": []}` today. **Add to it as verbs ship** — it is what turns
drift from information into an alarm.

## Files

| file | role |
|---|---|
| `lib.mjs` | shared parsing, the free set, the capability detector, name folding |
| `engine-index.mjs` | pass 0 — engine tree index, framework detection, drift hashes |
| `extract.mjs` | pass 1 — card census, capabilities, primitives, identity map |
| `join.mjs` | pass 2 — our `cards` table joined by folded name |
| `our-coverage.ts` | pass 2b — our own compiler's verdict per `oracle_id` |
| `rank.mjs` | pass 3 — the ranked, dependency-ordered build order |
| `drift.mjs` | silent-semantic-drift detector |
| `implemented-primitives.json` | primitives we have shipped; drives drift triage |
| `dsl-coverage.ts` | REPRESENTABLE coverage of **our own** catalogue, before/after |

## `dsl-coverage.ts` — measuring us, not XMage

Everything above measures XMage. This one measures what fraction of our `cards`
table our own compiler can express.

```bash
node --experimental-strip-types scripts/coverage/dsl-coverage.ts --baseline  # freeze today
# …make a compiler change…
node --experimental-strip-types scripts/coverage/dsl-coverage.ts --diff      # what moved, both ways
```

It caches the catalogue in `.data/catalogue.json` on the first run, so a
before/after comparison is over **identical input** and a delta is a change in
the compiler rather than a change in the data underneath it. `--refetch` pulls
again.

`--diff` reports the cards that LEFT `full` as well as the ones that entered it,
and that direction is the more important one: a precision fix removing false
positives shows up there, and so does a rule that quietly started over-matching.

**The number it prints is REPRESENTABLE, never AUTOMATED.** It also prints how
many of the `full` cards provably cannot execute today — a watch query nothing
folds, a "that player" no trigger names, an opponent-facing cost nothing can
offer. That is a ceiling on a ceiling; neither figure is an automation count.

`implemented-primitives.json` is deliberately **not** touched by DSL work. It
lists XMage classes we have ported, and it is what turns upstream drift into an
alarm. The four DSL extensions ported no XMage class — they are our own type
space and our own oracle-text front end — so adding names to it for them would
arm the alarm against code that does not exist.

## Rules this code holds to

- **Precision over recall.** Classifiers are package-keyed, not name-keyed. Cards
  carrying hand-written Java are excluded from the unlockable set even though
  they pass the capability detector, because implementing their imports would not
  make them run.
- **Structure only, never text.** `stripComments` runs before any analysis.
  XMage's `//` lines are Wizards of the Coast's oracle text and are not XMage's
  to license; our rules text comes from our own `cards.oracle_text`.
- **XMage is MIT**, attributed in `THIRD-PARTY-NOTICES.md`. **Forge is GPL-3.0
  and is never read, cloned, or referenced** — this app ships its rules engine to
  the browser, which is distribution.
- **Two numbers, never conflated.** Everything here informs REPRESENTABLE and the
  plan toward AUTOMATED. Nothing here is an automation figure.
