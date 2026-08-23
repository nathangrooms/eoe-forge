/**
 * The light half of the recommender: measuring a deck, without ranking one.
 *
 * ## Why this file exists rather than one import from `../recommend`
 *
 * `@/lib/deck/recommend` re-exports the whole engine, so importing anything
 * from it pulls `rank.ts` and the knowledge tables behind it into whatever
 * chunk asked. The Add tab wants two different things at two different times:
 *
 * - **On open**, "what is this deck short of" — `deriveDeckProfile` counting
 *   the deck's own cards against `roleTargetsFor`'s declared targets. No
 *   request, no scoring, and it is drawn before anybody presses anything.
 * - **On demand**, the ranked suggestions, which need the scorer, its weights
 *   and its tag knowledge, and a real download of candidates behind them.
 *
 * Measured on the built bundle: mounting both statically put `DeckInterface` at
 * 132.44 kB. Splitting them so the scorer arrives with the button press is what
 * keeps the deck page's first load paying only for what it draws.
 *
 * Nothing is reimplemented here. Every symbol is the engine's own, named
 * individually so the chunk boundary is a fact about the import graph rather
 * than a hope about tree-shaking.
 */

export { deriveDeckProfile, type DeckProfileInput } from '../../../engine/advise/profile.ts';
export { roleTargetsFor, rolesOf, servesRole } from '../../../engine/advise/roles.ts';
export {
  ROLES,
  type Role,
  type DeckProfile,
  type CandidateCard,
  type Recommendation,
} from '../../../engine/core/types.ts';
