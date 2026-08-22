# Play mode covers

One image per mode, this exact name, dropped straight in here. Nothing else has
to change: `ModeWall` looks for the file and falls back to the procedural
playmat surface when it is not there.

| File | Mode |
|---|---|
| `online.webp` | ONLINE |
| `bots.webp` | VERSUS BOTS |
| `goldfish.webp` | GOLDFISH |
| `playtest.webp` | PLAYTEST |

**Shape: 3:4 portrait. Recommended 1200 x 1600.** The door is drawn at
`aspect-ratio: 3 / 4` and the image is `object-fit: cover`, so anything else is
cropped rather than squashed. Measured on a real page: 297 x 396 at a 1280
viewport and 457 x 609 at 1920, so 1200 wide covers a 2x display at the largest
size with room to spare.

**The bottom half carries the type.** A scrim darkens the lower two thirds of
the card so the eyebrow, the title, the description and the metadata line can
sit on it. Keep the subject high in the frame and keep the bottom third quiet.

**Never use Magic card art here.** A cover has to be darkened for type to sit on
it, and Scryfall's image guidelines forbid modifying card images: *"Do not blur,
sharpen, desaturate, or color-shift card images."* That is exactly what the
scrim does. This project has already removed two patterns for that reason; see
`src/components/play/Playmat.tsx` and `src/lib/cards/identityGround.ts`. A deck
tile shows a commander card WHOLE and UNMODIFIED, which is the permitted case,
and that is why art is allowed one step later in the flow and not here.

Commissioned or permissively licensed illustration only, and record where it
came from in `THIRD-PARTY-NOTICES.md` when you add it.
