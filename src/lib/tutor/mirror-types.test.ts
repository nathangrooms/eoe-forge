/**
 * The one mirrored file that could not be mirrored, and the check that holds it.
 *
 *   node --test --experimental-strip-types src/lib/tutor/mirror-types.test.ts
 *   node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
 *
 * `scripts/vendor-engine.mjs` copies `src/lib/deck/deckLegality.ts` into
 * `supabase/functions/mtg-brain/_lib/` byte for byte, so Tutor answers "can I
 * run two of these" with the same rules the deck page uses rather than a second
 * opinion written inside the function. Byte-identical means its own import
 * comes across unchanged, and one of them cannot be satisfied:
 *
 *   import type { DeckCardRow } from './deckCards.ts';
 *
 * The real `deckCards.ts` opens the Supabase client through Vite's `@/` alias.
 * That alias is a build-time rewrite and means nothing to Deno, so the file
 * cannot be mirrored and the row type has to be declared a second time in the
 * generated stand-in the vendoring script writes.
 *
 * A shape written down twice is the drift this whole arrangement exists to
 * prevent, so it is written down twice and CHECKED. Each pair below asserts one
 * field is the same type on both sides, in both directions, and it is `tsc`
 * that enforces them: they are type assignments, so they fail the typecheck
 * rather than the runner. The runtime test is here so `npm test` names the file
 * when somebody is reading a list of suites, and so the reason is on screen at
 * the moment it goes red.
 *
 * WHAT THIS CANNOT SEE. `tsconfig.app.json` sets `strict: false`, so
 * `strictNullChecks` is off and `null` is assignable to everything. A field
 * that changed from `string` to `string | null` would pass here. A field that
 * changed from `string` to `number`, was renamed, or was removed would not, and
 * those are the changes that break the rules rather than soften them.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* Type-only on both sides, deliberately. `--experimental-strip-types` erases a
   type import entirely, so importing the real row here does not drag the
   Supabase client into a test runner that cannot resolve `@/`. */
import type { DeckCardRow as Real, DeckCardDetail as RealDetail } from '../deck/deckCards.ts';
import type {
  DeckCardRow as Mirrored,
  DeckCardDetail as MirroredDetail,
} from '../../../supabase/functions/mtg-brain/_lib/deck/deckCards.ts';

/* ------------------------------------------------------------------ *
 * The row
 * ------------------------------------------------------------------ */

/* The whole real row must satisfy the mirror, which is the direction that
   matters at runtime: `deckLegality.ts` is handed real rows and reads them
   through the mirrored declaration. */
const _rowNarrows: Mirrored = null as unknown as Real;

const _cardName: Mirrored['card_name'] = null as unknown as Real['card_name'];
const _cardNameBack: Real['card_name'] = null as unknown as Mirrored['card_name'];

const _quantity: Mirrored['quantity'] = null as unknown as Real['quantity'];
const _quantityBack: Real['quantity'] = null as unknown as Mirrored['quantity'];

/* Only one direction for `card` itself: the mirror declares three of its
   columns and the real one declares eighteen, so the mirror is not a whole
   card. The three columns it does declare are checked both ways below. */
const _cardNarrows: Mirrored['card'] = null as unknown as Real['card'];

/* ------------------------------------------------------------------ *
 * The three card columns the legality rules read
 * ------------------------------------------------------------------ */

const _detailName: MirroredDetail['name'] = null as unknown as RealDetail['name'];
const _detailNameBack: RealDetail['name'] = null as unknown as MirroredDetail['name'];

const _legalities: MirroredDetail['legalities'] = null as unknown as RealDetail['legalities'];
const _legalitiesBack: RealDetail['legalities'] = null as unknown as MirroredDetail['legalities'];

const _identity: MirroredDetail['color_identity'] =
  null as unknown as RealDetail['color_identity'];
const _identityBack: RealDetail['color_identity'] =
  null as unknown as MirroredDetail['color_identity'];

/* ------------------------------------------------------------------ *
 * The runtime half
 * ------------------------------------------------------------------ */

describe('the mirrored deck row matches the real one', () => {
  it('is checked by tsc, not by this runner', () => {
    /* Every assertion in this file is a type assignment above. If any of them
       stopped holding, `npm run typecheck` would have failed before this line
       ever ran, which is why there is nothing to compare here. Keeping the
       values referenced stops a linter deciding they are dead. */
    const declared = [
      _rowNarrows,
      _cardName,
      _cardNameBack,
      _quantity,
      _quantityBack,
      _cardNarrows,
      _detailName,
      _detailNameBack,
      _legalities,
      _legalitiesBack,
      _identity,
      _identityBack,
    ];
    assert.equal(declared.length, 12);
  });
});
