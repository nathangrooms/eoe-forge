# App screenshots on the homepage

**Date:** 2026-08-19
**Owner's note that started it:** *"not sure app versus homepage you're doing you can forget that, we
will likely just replace some sections with in-app screenshots"*, following an earlier one:
*"lots of the images dont actually look like real in app screens"*.

---

## 1. Why screenshots at all

The homepage used to draw pictures of the app in CSS. Some of those drawings were good, and the good
ones are still there. The problem with the rest was not that they were badly drawn — it was that no
amount of care makes a drawing of a screen into the screen. A player who has used Moxfield can tell
in half a second, and once they have spotted one picture that is not the product they stop believing
the rest of the page.

A screenshot of the real app cannot look unlike the real app. That is the whole argument.

The cost of a screenshot is that it goes stale, and a stale screenshot is a fabrication that nobody
typed: the truth moved and the picture did not. §5 is how that is kept under control.

---

## 2. Re-running the capture

```bash
npm run dev                     # or any vite server already on this repo
node scripts/app-shots.mjs      # ~6 minutes for all eight scenes at both widths
```

Useful switches:

| | |
|---|---|
| `BASE=http://127.0.0.1:8080` | point at a different dev server (default `:8099`) |
| `ONLY=collection,card` | capture one or two scenes; the manifest keeps the rest |
| `WIDTHS=1600` | skip the 1920 pass while iterating |
| `PRECON="Veloci-Ramp-Tor"` | use a different real decklist in the builder shots |

Commit whatever lands in `public/screens/` — the images are the deliverable and the homepage loads
them straight out of `public/`. The harness the script writes (`app-shots-harness.html`,
`src/dev/__appShotsHarness.tsx`) is gitignored: a page that renders the app without a session should
not be a file that ships.

If a scene comes back as `NOT captured`, the script refused to write a picture of a page that had not
drawn. Re-run that one scene. A shared dev server serving a 500 for one module mid-save is the usual
cause, and it is why the run reloads up to four times before giving up.

---

## 3. What is real in these pictures

Stated plainly, because this repo has shipped fabricated data before and the whole point of the
exercise is that it cannot happen here.

**Real.** The pages. Every pixel is the shipped component tree, rendering through the providers
`App.tsx` gives it, inside the same header-and-rail shell `App.tsx` builds. No recreation, no CSS
mockup, no retouching, no compositing. Every card, card image, card name, price, type line and oracle
text is a row read out of the live catalogue. The deck in the builder and deck shots is a **Wizards
precon decklist**, fetched at capture time from the same `fetch-precons` edge function the `/precons`
page calls, and resolved card by card against `public.cards_unique`. Its power score, its curve, its
average mana value and its $123 are all computed by the app from those rows.

**Fixture.** Who owns what. A signed-out request may never be shown a real person's collection, decks
or wishlist, so the account in the pictures is invented — modelled on the shape of the one real
account in this database that has data. It lives in `scripts/dashboard-shim.js`, whose header
explains it in full. Tournament events are fixture for a second reason: they live in `localStorage`
on the organiser's own machine, so there is no server-side "real" event to read.

**Never done.** No credentials are entered anywhere. No real user's data is read. No number on any
screen is written by the capture script.

### Database discipline

Every read the script makes is a keyed lookup (`id=eq.`, `id=in.(…)`, `name=in.(…)`) against an
indexed column, chunked, and cached to `.shots/app/` so a repeat run asks the database for nothing.
Decklists resolve through `cards_unique`, never `cards`: a hundred-name `in.()` against `cards`
returns every printing of every name, which is both the wrong answer for a decklist and a great deal
of work for the database to do. No scans, no counts, no cron job.

---

## 4. The scenes

| Key | Page | What it shows |
|---|---|---|
| `collection` | `/collection` | A collection with its cards, its value and what each copy is worth |
| `deck-builder` | `/deck-builder` | A real 100-card Commander list, grouped, counted and priced |
| `deck` | `/deck/:id` | The deck overview: commander, power, playability, value |
| `card` | `/cards/:id` | The card page: the card whole and large, prices, printings |
| `tournament` | `/tournament` | Round three of a Swiss event, every seat showing its deck |
| `tournament-standings` | `/tournament` | Standings with DCI tiebreakers |
| `life-counter` | `/life` | Four seats mid-game, each turned to face its player |
| `play-table` | `/play` | A mid-game board in the browser |

Two widths are captured, 1600 and 1920, each **at** that width rather than resized from one big shot,
so the layout in the picture is the layout the app really has there. 1280 was tried and dropped: the
shell's 256px rail leaves 1024px of page, and the deck header's right column overhangs it, so the
1280 shot came back with `Edit deck` sliced down the middle. That reads as a broken build rather than
as a narrow window.

`public/screens/manifest.json` lists what was written, when, at what size, and a caption for each.

---

## 5. Keeping them true

**Re-run the capture when you change any of these:**

- one of the eight pages above,
- the app shell — `src/components/navigation/TopNavigation.tsx`, `LeftNavigation.tsx` — because it is
  in six of the eight pictures,
- the design tokens in `src/index.css` or `tailwind.config.ts`, because they are in all eight,
- `src/components/cards/CardImage.tsx`, because every picture is mostly cards.

**How to tell they are stale:** `public/screens/manifest.json` carries `generatedAt`. If it predates
the last commit that touched the areas above, the pictures are out of date. That is the check to make
in review, and it is the one thing standing between this and the failure mode the transcribed power
weights had — a number that was correct on the day someone copied it and wrong ever after.

**What NOT to do:** do not touch up an image, do not crop one to hide something, and do not keep an
image whose page has been redesigned "because it still looks fine". The value of a screenshot is that
it is not a decision anybody made. Edit one and it becomes a drawing again, with none of a drawing's
advantages.

---

## 6. Which homepage sections use a screenshot, and which kept their mock

The owner was explicit: *"Not all mocks on homepage are better, many are not"*. Each was judged on
its own.

### Replaced with a real screen

| Section | Was | Why the screenshot wins |
|---|---|---|
| `HomeAppVisual` — "This is the builder" | A CSS recreation of a builder, filled with 60 rows from a `rarity in (mythic, rare)` query | It was captioned "This is the builder" and it was not the builder. Worse, the rows were a slice of the catalogue rather than a deck: the commander slot held whichever legend came back first, and the grid showed the same card three times over — which in Commander is illegal on sight. The real shot is a real 100-card precon in the real builder, with the real stacked curve. |
| `HomePlayTable` | A CSS diagram of a board | Play mode's whole claim is "this is a real game in a browser". A diagram of a game is precisely the thing that claim has to overcome. The shot is a real mid-game board driven by pressing the buttons a player presses. |
| `HomeLifeCounter` | The counter's own geometry, drawn from `seatingFor` | The closest call on the page, because the mock already used the app's real seating maths. It was replaced because a photograph of four seats mid-game shows the mats, the type sizes and the pressure of a real total, and the section's own promise — "the phone goes in the middle of the table" — is a claim about how it *looks*, which is the one kind of claim a picture settles. The three alternate pod layouts beside it are kept: they show two, three and four seats at once, which one screenshot cannot. |

### Kept the mock and added a real screen beside it

Two sections do something a screenshot cannot, and also never showed the product. They now do both:
the picture first, the live proof underneath.

| Section | The mock that stayed | The screen that was added |
|---|---|---|
| `HomeTournaments` | The worked example: four real precon decks, two rounds played, and every standing produced by calling the product's own `computeStandings` and `generatePairings` in the reader's browser | `tournament` — the real manager running a Swiss event, with the round clock, the pairings and each seat's registered commander |
| `HomeSearch` | Four Scryfall queries that actually run against `api.scryfall.com` when the page loads, printing Scryfall's own `total_cards` | `card` — the page every one of those results opens into, with the card whole and large, its prices at each shop and its printings |

### Brought back onto the page

| Section | Why |
|---|---|
| `HomeCollection` — "Your collection, not just your decklists" | Dropped on 2026-08-19 because its picture was `/hero-768.webp`, the hero's own background reused as decoration and cropped to 16:10, so the page opened and closed on the same artwork. That was the right call then and it is fixed now: the picture is the real `/collection` screen. The hero promises a collection finally organised, and until this the page never once showed one. Its four bullets are gone rather than restored — three are whole sections further down, and the fourth is a footer link. |

### Kept the mock

| Section | Why |
|---|---|
| `HomeStorage` | It draws the *objects* — a binder with its twelve page tabs, a long box with its twenty-six A–Z dividers, the colour boxes — read from `DEFAULT_STORAGE_TEMPLATES`. The real storage screen is a list of containers, which is the right UI and the wrong advertisement: the thing being sold here is the idea of a physical box, and the drawing sells it. |
| `HomeMarketplace` | It draws a real price history series out of `card_price_history`. The claim is "we keep the history", and a live chart is the evidence. |
| `HomeScanner` | The scanner's screen is a camera viewfinder. A screenshot of one is a black rectangle. |
| `HomeShowcase`, `HomeCatalogue`, `HomeNewSets`, `HomePower`, `HomeFormatPicker`, `HomePrecons` | None of these is a picture of a screen. They are live counts, live card rows and the engine's own published weights, rendered as page content. There is nothing to replace. |
| `HomeHero` | Seven real cards over the painted five-colour background. It is the hook, not a product screen. |
| `HomeTutor` | Left as it is for now, and it is the weakest thing on the page: a mocked chat bubble whose "answer" is a description of what Tutor would do. Replacing it needs a real Tutor answer captured from the live edge function — `scripts/tutor-land-shots.mjs` already does that — and a decision about whether a model's answer belongs on a marketing page. Flagged rather than fixed. |

---

## 7. Open: the card page is captured but not shown

`card` is in the manifest and it is a good picture of a good page — except down its right-hand
edge. The details rail (`xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]` inside
`src/pages/CardDetail.tsx`) ends up wider than the space it is given, and the page's own
`overflow-x-hidden` on the wrapper at `CardDetail.tsx:456` silently clips it rather than letting it
scroll. The result is four labels sliced mid-word — `COLOUR IDENT`, `COLLECTOR N`,
`ARTIST Victor Adam`, `DECKMATRIX T… Creature, Ev` — at **both** 1600 and 1920. Measured: nothing
reports as overflowing the viewport, precisely because the clip is happening one level in.

The screenshot was pulled from `HomeSearch` rather than published, because a picture of a clipped
page is an advertisement for the clipping. `HomeSearch.tsx` carries a comment saying so and pointing
here. Once the rail has a gutter, put the picture back — no re-capture logic is needed, only
re-running `ONLY=card node scripts/app-shots.mjs`.

This is worth fixing on its own merits: the same clip is happening to real users on the real card
page, and nobody has reported it because the labels are the part that gets cut, not the values.
