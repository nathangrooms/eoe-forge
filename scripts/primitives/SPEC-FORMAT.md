# The primitive specification format

One `.spec.json` file per primitive, in `scripts/primitives/specs/`. The spec is
the **input** to generation and the **contract** the gates check against. Nothing
in a spec is prose for a human to interpret: every field is read by a gate.

A primitive is a **pure function**. It takes data, returns data, and touches no
state. That is not a style preference — `src/lib/game/abilities/index.ts` states
the property the whole engine rests on, that two clients replaying one action log
land on byte-identical state, and a primitive that read a clock or mutated its
input would break it silently for one player and not the other.

## Fields

| field | type | read by | meaning |
|---|---|---|---|
| `id` | `string` | all gates | `P07`-style stable id. Names the impl file and the test `describe`. |
| `name` | `string` | report | The exported function name. |
| `family` | `"effect-handler" \| "pure-fn"` | registry gate | `effect-handler` slots into the `Effect` switch and is registered; `pure-fn` is a helper another primitive composes. |
| `implements` | `string \| null` | registry gate | For `effect-handler`, the `Effect['do']` member it handles. `null` for `pure-fn`. |
| `signature` | `string` | typecheck gate | Verbatim TypeScript signature. Generation must produce exactly this. |
| `rules` | `string[]` | report | Comprehensive Rules citations. Prose, for the reviewer. |
| `layerOrTiming` | `string` | report | CR 613 sublayer, or the timing window. `"n/a"` for pure computation. |
| `contract` | `string[]` | report | Numbered behavioural obligations, one sentence each. |
| `purity` | `object` | purity gate | `{ noClock, noRandom, noMutation, noAmbientState }`, all required `true`. Present so a primitive can never quietly opt out; the gate rejects any spec that sets one `false`. |
| `xmage` | `object \| null` | differential gate | `{ fqn, evidence[] }`. See below. |
| `cards` | `object[]` | behaviour gate | The REAL cards that exercise it. `{ name, oracleId, why }`. The gate fails if a named card is absent from the catalogue or if its oracle text does not contain `why.textMustContain`. |
| `assertions` | `object[]` | behaviour gate | `{ id, given, expect }` — one per test. Every id must appear as a passing test. |
| `unlocks` | `object` | report | `{ blockerKey, measuredSolo, measuredTouches, source }`. Measured, never estimated; `source` names the script that measured it. |

## The `xmage` block and what the differential gate actually proves

```json
"xmage": {
  "fqn": "mage.abilities.effects.common.DamageTargetEffect",
  "evidence": [
    { "claim": "damage is MARKED on the permanent, not resolved into a destroy",
      "mustContain": "permanent.damage(amount.calculate(game, source, this), source.getSourceId(), source, game, false, preventable)" },
    { "claim": "the effect never destroys anything itself",
      "mustNotContain": "permanent.destroy(" }
  ]
}
```

The gate reads the class out of a magefree/mage clone pinned at
`07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`, **strips comments** (XMage's `//`
lines carry Wizards of the Coast's oracle text, and a licence-header reflow must
not raise an alarm nobody reads twice), and checks each `mustContain` /
`mustNotContain` against what is left.

**Be precise about what this proves and what it does not.** It proves that the
semantic claim our implementation was written against is still literally present
in XMage's current source — which is the exact defect
`PRIMITIVE-BUILD-ORDER.md` §6 measures at 10.8% a year, a class keeping its name
while its body changes. It does **not** prove behavioural equivalence: that would
mean running both engines over the same game state, which needs a JVM and an
XMage build, and is not what this gate does. A primitive that passes the
differential gate has a *checked citation*, not a proof.

XMage is MIT and reading it as a reference is legal with attribution. Nothing is
copied: `evidence` quotes are assertions about upstream source, the way a test
asserts against a fixture. Forge is GPL-3.0 and is not read, cloned or referenced.

## The four gates, and what "passed" means

A primitive counts **only** if all four pass. There is no partial credit and no
patching a failure into place; a failure is reported as a failure.

1. **typecheck** — `npx tsc --noEmit -p tsconfig.app.json` over the whole app,
   plus a per-primitive check that the emitted signature is byte-identical to
   `spec.signature`. `tsconfig.json` has `files: []` and compiles nothing; it is
   never used.
2. **purity** — a TypeScript AST walk over the impl file. Rejects `Date`,
   `Math.random`, `performance`, `crypto`, `process`, `async`/`await`, `Promise`,
   module-scope `let`/`var`, assignment to anything reachable from a parameter,
   and the mutating array methods on a parameter-derived expression.
3. **behaviour** — `node --test` over the primitive's assertions, on game states
   built from REAL catalogue rows. Every `assertions[].id` must appear as a
   passing test; a spec that names an assertion with no test fails, so a test
   file cannot quietly cover less than the spec claims.
4. **differential** — the `xmage` block above. A spec with `"xmage": null`
   records **no reference**, which is reported in its own column and is not
   counted as a pass.
