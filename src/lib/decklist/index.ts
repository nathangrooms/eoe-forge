/**
 * Pasted card lists, read once and understood the same way everywhere.
 *
 * `parse.ts` is pure and holds every format a player might paste. `resolve.ts`
 * turns the result into real cards in a single query. The deck importer and the
 * proxy list both come through here, so a format one of them learns, both learn.
 *
 * ```ts
 * const { parsed, entries } = await resolvePastedList(text);
 * await commitResolvedList({ kind: 'proxy', entries });
 * ```
 */

export {
  mergeParsedLines,
  parseCardLine,
  parseDeckList,
  tidyName,
  type DeckListParse,
  type DeckSection,
  type ParsedCardLine,
  type UnreadableLine,
} from './parse.ts';

export {
  MAX_LINES,
  commitResolvedList,
  isSettled,
  resolveParsedLines,
  resolvePastedList,
  type CommitInput,
  type MatchStatus,
  type ResolvedEntry,
  type Suggestion,
} from './resolve.ts';
