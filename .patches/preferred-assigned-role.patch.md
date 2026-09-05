# UNSHIPPED, UNRESOLVED: charge a preferred card only for its assigned role

Saved as a description rather than a diff because `git stash` is SHARED across
worktrees on this machine and has already caused a 13-file conflict.

## The defect

`preferred` cards - Sol Ring, Arcane Signet, Swiftfoot Boots, Lightning
Greaves, combo pieces, top-end picks - are PLACED before any scoring pass runs
and they SKIP `overRoleCeiling` at generate.ts:1873, 2369 and 2740. But
`carriedCount` counted every role they CARRY, so they consumed ceiling they
were exempt from and never competed for.

Boots and Greaves each carry [enhance, protection]. The placement loop assigns
them to `enhance`, so they consume no protection QUOTA - and they took two of
protection's five ceiling slots anyway. On a Syr Vondam blink deck the engine
said protection was FULL (5 carried) and 2 SHORT (3 assigned) at the same
instant, and refused Ghostway, Another Round and Scrollshift at package fit
1.000.

Two independent workflow agents converged on this.

## The change

1. `const preferredAssignedRole = new Map<string, Role | null>();` declared
   beside `carried` in the closure that owns `carriedCount`.
2. In the preferred placement loop, after computing `filled`:
   `preferredAssignedRole.set(card.oracleId, filled ?? null);`
3. In `carriedCount`'s rebuild loop, a preferred card contributes ONLY its
   assigned role:

       for (const e of picked) {
         const assigned = preferredAssignedRole.get(e.card.oracleId);
         if (assigned !== undefined) {
           if (assigned) carried[assigned] = (carried[assigned] ?? 0) + 1;
           continue;
         }
         for (const r of rolesOf(e.card)) carried[r] = (carried[r] ?? 0) + 1;
       }

## Measurements taken

    blunt version (preferred exempt from carriedCount ENTIRELY)
      eighteen shells   keyed +21, packages +3
      ramp              SIX shells over the p90 of 21, one at 27
      -> rejected: Sol Ring IS ramp and should spend a ramp slot

    narrowed to the ASSIGNED role
      eighteen shells   keyed 1303 -> 1309 (+6), packages +2, named 41 -> 40
      ramp              0 under the floor, 0 over the p90   <-- overshoot fixed
      Syr Vondam        blink spells 3/13 -> 5/13 (Ghostway, Another Round)
      3,358 tests, tsc clean

    deck-shape-check   183/200 -> 165/200      ** SUSPECT **
    commander-bench     47/71 -> 46/71         ** SUSPECT **

## Why the shape number is suspect and must be re-measured

That run happened while the database was still recovering from an IO outage,
and the very next probe run FAILED outright with a 57014 statement timeout on
`combo_pool`. A build that loses its combos or times out mid-pool produces a
different deck, so a shape figure taken in that window measures the database,
not the change. It has NOT been re-measured on a healthy database.

## What to do next

Re-apply the three edits above and run, in this order, ONLY when a single-row
read from `cards_pool` is under 0.3 s:

    LOCAL=1 node --experimental-strip-types scripts/probe/strategy-decks.mjs
    node --experimental-strip-types scripts/probe/deck-shape-check.mjs
    LOCAL=1 ARCHETYPE=1 node --experimental-strip-types scripts/probe/commander-bench.mjs

If shape genuinely falls to ~165, refuse it and record that; the real-deck
yardstick outranks +6 keyed. If shape holds near 183, ship it.

## Measured and REFUSED alongside it: a fit band in the package sort

`PACKAGE_FIT_BAND = 0.2` - within that gap of `packageFit`, let EDHREC rank
decide instead of fit, on the argument that two cards doing substantially the
same amount of a package's job should be settled by which one people play.

It does exactly what it was meant to on the case that motivated it: Vondam's
deck gained Conjurer's Closet (#472), Teleportation Circle (#992) and Solemn
Simulacrum (#38), replacing Icewind Stalwart, Eldrazi Displacer and Spirited
Companion.

    eighteen shells, with the preferred fix   keyed 1309 -> 1292 (-17)
                                              packages +2
    Syr Vondam                                blink spells 5/13 -> 3/13
    total against the two human decks         16/63, UNCHANGED

Seventeen keyed points across the strategy space to buy three cards on one
deck, and it took the blink spells back out because the two changes compete for
the same nine slots. REFUSED on the universal test.
