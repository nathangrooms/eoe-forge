# `scripts/coverage/llm/` — LLM-assisted DSL compilation

A **one-time batch** that asks a model to compile cards our own oracle-text
compiler cannot fully represent, validates every answer through five gates, and
caches what survives in Postgres keyed by `oracle_id` + the oracle text hash.

**Nothing in the app calls a model as a result of this work, and nothing may.**
The scanner's per-scan vision model is being removed for cost — a per-request
model call arriving through a different door would be the same mistake with a new
name. The re-run cost here is "the cards in the next set", not "every card, every
time somebody opens a deck".

**And nothing reads `llm_ability_compilations` either — yet.** As of 19 Aug 2026
the app has no read path to it: `abilitiesFor()` in
`src/lib/game/abilities/card-abilities.ts` calls `compileCardAbilities` and
consults no table, so not one model-produced ability reaches a game. Nothing here
can currently claim to be automated, and that is because there is no reader, not
because a reader would be safe. The first reader must run `validateAbilities()`
over the `abilities` column itself — `dsl-compile-store` holds no copy of the DSL
validator and cannot have checked it. The full precondition list is at the top of
`compile.ts`.

## The two numbers this produces

| | what it means |
|---|---|
| **ACCEPTED** | the model's DSL survived all five gates. A REPRESENTABLE figure. |
| **AUTOMATABLE** | coverage is `full` **and** the behaviour probe ran every ability with nothing deferred. |

They are different and the report prints both. Quoting the first as the second is
the dishonesty the whole design exists to prevent.

## The five gates

| gate | question | module |
|---|---|---|
| `transport` | is this the shape of an answer about this card? | `compile.ts` |
| `schema` | does every ability satisfy the DSL, no unknown field, no coerced number? | `src/lib/cards/abilities/validate.ts` |
| `verbatim` | did the model QUOTE the card, and do the quotes account for all of it? | `roundtrip.ts` |
| `roundtrip` | render the DSL back to English — does it invent or drop anything? | `roundtrip.ts` + `render.ts` |
| `behaviour` | run it on a real board — does it throw, or resolve to silence? | `src/lib/game/abilities/behaviour-probe.ts` |

A card is reported at the FIRST gate it failed. Anything failing any gate is
stored with `accepted = false` and its clauses land in `unparsed` — never as
abilities.

### Calibrate before believing any pass rate

```bash
node --experimental-strip-types scripts/coverage/llm/calibrate.ts
```

Runs the round-trip gate over the hand-written compiler's own `coverage:'full'`
cards — text we know is correctly represented — so its **false-rejection rate**
is measured rather than assumed. Every model pass rate must be quoted next to it.

## Running a batch

**1. Mint a run token.** Deliberately not automated: `llm_compile_runs` is under
admin-only RLS, so creating a run is an admin act, and `max_calls` is a hard
budget the edge function charges *before* every model call.

```sql
insert into public.llm_compile_runs
  (label, model, prompt_version, batch_size, max_calls, expires_at)
values ('sample-500', 'google/gemini-2.5-flash', 'set-by-harness', 8, 75,
        now() + interval '6 hours')
returning run_token;
```

**2. Select cards without spending anything.**

```bash
node --experimental-strip-types scripts/coverage/llm/compile.ts --dry --sample 500
```

**3. Run.**

```bash
node --experimental-strip-types scripts/coverage/llm/compile.ts \
  --run <run_token> --sample 500 --batch 8
```

| flag | default | meaning |
|---|---|---|
| `--sample N` | 500 | stratified sample size; `0` or `>= pool` means the whole pool |
| `--seed N` | 1 | which sample; the same seed always draws the same cards |
| `--batch N` | 8 | max cards per model call |
| `--chars N` | 1200 | max oracle text per model call — the binding limit on long cards |
| `--model` | `google/gemini-2.5-flash` | must be on the edge function's allow-list |
| `--dry` | | select and report, call no model |

**4. Merge the missing-primitive census with the XMage-derived order.**

```bash
node --experimental-strip-types scripts/coverage/llm/merge-build-order.ts
```

## Why batches are capped by characters as well as by count

Eight one-line creatures fit in one answer; eight Sagas do not. When the answer
runs past the model's output ceiling the JSON truncates mid-object and **all
eight cards fail transport together** — one batch-sizing mistake reported as
eight model failures. It happened in the first run and cost 24 of 64 cards.

## Resuming, and the pointer

`llm_compile_runs.cursor` holds the last `oracle_id` whose rows were actually
WRITTEN — never merely requested. The completion path clears it, and that is
enforced three times over:

1. `completionPatch()` in `src/lib/cards/abilities/llm-run-state.ts`
2. the `dsl-compile-store` edge function
3. `check (status <> 'complete' or cursor is null)` on the table itself

A completion path that did not clear its pointer froze this project's card sync
for months. A **failed** run keeps its pointer — that is the difference, and it
is what makes it resumable.

The local checkpoint is keyed by `sample` and `seed`, not by the run token, so
resuming under a fresh token continues the same work instead of re-spending it.

### The journal

Every validated row is appended to `.data/journal.sample-N.seed-N.ndjson`
**before** the store is attempted. Postgres in this project goes away for minutes
at a time under concurrent DDL; a store call that gave up would discard output
somebody already paid for.

## The prompt

Canonical text: `src/lib/cards/abilities/llm-prompt.ts`, which **imports
nothing** — its bytes are the record of what was asked. The harness registers it
in `llm_prompt_versions` under `<label>.<fingerprint of the text>` and passes
that key to the edge function, so a prompt edited without its label being bumped
still lands under a different key. `llm-validation.test.ts` asserts the module
stays import-free.

Iterating the prompt therefore needs no redeploy.

## Tables and functions

| | |
|---|---|
| `llm_compile_runs` | one row per batch run; holds the token, the budget and the pointer. Admin-only RLS. |
| `llm_ability_compilations` | one row per `oracle_id`; the answer, the verdict, the stage it failed at. World-readable, service-role-written. |
| `llm_prompt_versions` | insert-only; the verbatim prompt behind every row. |
| `llm_needed_primitives` | view: which primitives the model asked for, ranked by cards. |
| `dsl-compile-batch` | calls the model. Holds the API key. Validates nothing. |
| `dsl-compile-store` | writes rows and moves the pointer. Holds no key, can spend nothing. |

The two functions are separate deployments so that the thing which produces an
answer has no way to store one.

## Tests

```bash
node --test --experimental-strip-types src/lib/cards/abilities/llm-validation.test.ts
```

Most of that file asserts something was REJECTED. A validation stage with only
passing tests is a stage nobody has shown can fail.
