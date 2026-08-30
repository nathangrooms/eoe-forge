# The probes

Forty-seven scripts and no index, which is how a third em-dash checker came to
be written on 30 Aug 2026 while two already existed. **Read this before writing
a new one.**

Every probe serves `dist/`, so `npm run build` first. Each one picks a free port
on its own, so several can run at once — but see the warning at the bottom about
what that does to the readings.

---

## The five that get run regularly

| Probe | The question it answers |
|---|---|
| `nav-audit.mjs` | Is a screen using the room it has? Dead space below the fold, unused width, cropped card art, how much card art at all, and a card grid in one column with room for two. Screenshots to `.shots/nav-audit/`. |
| `clip-audit.mjs` | Is a screen HIDING part of itself inside a box? Separates a scroller you can reach from an `overflow: hidden` clip you cannot. `nav-audit` cannot see this: Tutor scored perfectly on every layout rule while hiding 156px of its own welcome screen. |
| `sweep.mjs` | Does every control on a route work? Presses each one on a fresh page load and reports failures, slow requests, throws, and presses that changed nothing. |
| `press.mjs` | The same for ONE named control, with the request bodies and a screenshot. Reach for it when `sweep` flags something. |
| `screens.mjs` | Not a probe. The route lists the other two take: `SCREENS=deck`, `deck-routes`, `collection`, `rest`, `public`, `admin`, `play`. Tab names are read from the source so a new tab appears without anybody remembering. |

```bash
npm run build
node scripts/probe/nav-audit.mjs                       # the left menu, both widths
SCREENS=deck node scripts/probe/nav-audit.mjs          # the ten deck tabs
SHIM=off SCREENS=public node scripts/probe/nav-audit.mjs   # signed out
ADMIN=1 SCREENS=admin node scripts/probe/clip-audit.mjs
node scripts/probe/sweep.mjs --route "/collection"
node scripts/probe/press.mjs --route "/cards" --button "Reserved list"
```

`pressControl.mjs` is shared by `sweep` and `press` and is not run directly. It
exists because both had their own copy of the same synthetic-click bug and gave
different answers about the same button.

## The copy rules

| Probe | Rule |
|---|---|
| `em-dash-sweep.mjs` | No em-dashes in player copy, read from source. The careful one: type lines, ranges, placeholders and character classes are all exempt, each for a reason its header gives. |
| `emdash-scan.mjs` | The same rule read off the RENDERED DOM on public routes, so it sees text however it was built. |
| `copy-rules.mjs` | No product-invented vocabulary. Dashes are deliberately NOT its job. |
| `refute-aiwords.mjs` | The naming ban list from CLAUDE.md §10a: no "AI", "assistant", "smart", "powered by". Lives in `scripts/`, not here. |

## One question each

`deck-suggest` · does Suggest cards suggest cards. `tutor-shelf-click` · does the
Tutor shelf attach a card. `card-panel-fit` · does the card panel fit the screen.
`card-related-quality` · what the card page actually recommends.
`home-card-links` · how many homepage cards go anywhere. `cta-walk` · do the
homepage calls to action lead somewhere a stranger can reach. `gate-walk` · what
a signed-out visitor sees behind a gated link. `nav-duplication` · is the
duplicated header nav hidden. `field-borders` · does any field still draw a
hairline. `live-regions` · does one message land in two of them.
`play-space` · how much screen the play flow uses.

## Accessibility and the public routes

`auth-a11y` · sign-in and register by keyboard alone. `public-card-audit` ·
the public card page as phone and screen reader see it. `public-regression` ·
every public route at both widths: console errors, failed requests.
`public-search-walk` · signed out, can a new Commander player find a card.

## The `seventh-*` family

Fourteen undocumented one-offs from an earlier pass (`seventh-walk`,
`seventh-contrast`, `seventh-kbd`, `seventh-numbers` and friends). They carry no
header saying what they were for. Treat them as historical: read one before
running it, and do not assume a clean run means anything.

---

## Two things that will mislead you

**A screenshot is evidence, not proof.** `fullPage` does not scroll, so
lazy-loaded images photograph as grey boxes, and a `position: fixed` header
lands wherever the page happened to be scrolled. Both are handled now, and
neither is handled completely. Before acting on a grey box, read
`naturalWidth` with a probe. CLAUDE.md records the four artefacts that cost
real time.

**Do not run probes beside a build.** Twelve unrelated reads once came back at
32.6 seconds each on one press, which reads as the game engine blocking the
page. A heartbeat measured the main thread busy for 147ms; three builds and two
other probes were running. `sweep` now says so when several slow readings land
within 10% of each other, but the rule is simpler: run it alone.
