/**
 * The cards that show you what an archetype IS.
 *
 * WHY
 * ---
 * The Templates page is eleven Magic archetypes drawn as eleven blocks of text:
 * a name, some format badges, a row of grey role chips and a card count.
 * Measured, it carried `art 0`. A player who does not already know what
 * "Aristocrats" means learns nothing from the word Aristocrats, and a player who
 * does know it recognises the deck instantly from Blood Artist and Viscera Seer.
 *
 * NOTHING HERE IS INVENTED, which is the only reason it can ship. Design law 7
 * forbids a made-up statistic, and a hand-written list of "iconic cards per
 * archetype" would be exactly that: my opinion, frozen into the repo, drifting
 * from the catalogue the moment a set is printed.
 *
 * Instead both halves are already in the database:
 *
 *   WHAT THE ARCHETYPE WANTS  is `template.weights.synergy`, the tags the deck
 *   builder itself scores candidates against. Twenty-seven of the twenty-nine
 *   keys the templates use are real values in `cards.tags`; `anthem` and
 *   `graveyard` are the two that are not, and they are mapped to the canonical
 *   names the tagger writes rather than being quietly dropped.
 *
 *   WHICH CARDS DO IT       is `cards_unique.tags`, written by the same tagger
 *   the builder reads, ordered by `edhrec_rank`, which is how many real decks
 *   play the card.
 *
 * So "the most played cards our tagger says do this" is a fact with a
 * denominator, not a curation.
 *
 * ONE QUERY FOR THE WHOLE PAGE. Measured with EXPLAIN on the real database
 * before it was written, because a per-tile query is eleven round trips and
 * this project has taken itself down twice with fan-out reads:
 *
 *     Index Scan using cards_unique_edhrec_rank_idx, 400 rows, 606 buffer hits
 *     Execution Time: 2.465 ms
 *
 * It walks the rank index and stops at 400, so the cost does not grow with the
 * catalogue. `Rows Removed by Filter: 202` — it reads 602 rows to return 400.
 */

import type { ArchetypeTemplate } from '../types';

/**
 * Template synergy keys that are not tags the tagger writes.
 *
 * `sac-outlet`, `tokens`, `removal-spot` and the rest ARE written, as aliases,
 * which is why only two entries are here. Checked against `ALL_TAGS` rather
 * than assumed: 27 of the 29 keys the templates use resolve on their own.
 */
const TAG_ALIASES: Record<string, string> = {
  anthem: 'mass-pump',
  graveyard: 'graveyard-recursion',
};

/** How many cards represent one archetype. Three fit a tile at a readable size. */
export const FACES_PER_TEMPLATE = 3;

/**
 * How deep into the popularity ranking the shared query reaches.
 *
 * 250, not 400, and the difference is measured rather than guessed. The query
 * walks the rank index and filters on tags, so the limit decides how many rows
 * it reads: 400 costs 1,134 heap blocks and 250 costs 797. Cold, at this
 * project's roughly 8.8ms per block read, the first is about ten seconds
 * against a three second statement timeout, and `sweep.mjs` duly caught it
 * failing with 57014 twice in twenty presses.
 *
 * 250 is the floor that still fills every tile. Replayed offline against the
 * real pool: at 250 all eleven archetypes get three cards; at 180 both
 * Aggressive Burn and Draw-Go Control come up short.
 */
export const FACE_POOL_SIZE = 250;

export interface FaceCard {
  id: string;
  name: string;
  tags: string[] | null;
  edhrec_rank: number | null;
  color_identity: string[] | null;
  [key: string]: unknown;
}

/** Every tag any template asks for, resolved to what the tagger actually writes. */
export function faceTagsFor(templates: readonly ArchetypeTemplate[]): string[] {
  const tags = new Set<string>();
  for (const template of templates) {
    for (const key of Object.keys(template.weights?.synergy ?? {})) {
      tags.add(TAG_ALIASES[key] ?? key);
    }
  }
  return [...tags];
}

/**
 * How well one card speaks for one archetype.
 *
 * The template's own synergy WEIGHTS decide, because the template already says
 * which of its tags matter most: Aristocrats scores `aristocrats` and
 * `sac-outlet` at 4 and `tokens` at 3, so a card doing the first two describes
 * it better than one that only makes tokens. A card carrying several of them is
 * a better face than a card carrying one, which is why the weights are summed
 * rather than maxed.
 *
 * Returns 0 for a card the archetype never asked for.
 */
function synergyScore(template: ArchetypeTemplate, card: FaceCard): number {
  const tags = card.tags ?? [];
  if (tags.length === 0) return 0;
  let score = 0;
  for (const [key, weight] of Object.entries(template.weights?.synergy ?? {})) {
    if (tags.includes(TAG_ALIASES[key] ?? key)) score += weight;
  }
  return score;
}

/**
 * Whether a card is buildable in this archetype's colours.
 *
 * A mono-red burn template showing a blue counterspell would be wrong in the
 * one way a Magic player notices immediately. A template with no colours
 * declared accepts anything; a colourless card fits everywhere.
 */
function fitsColours(template: ArchetypeTemplate, card: FaceCard): boolean {
  const needs = (template.colors ?? []).map(c => c.toUpperCase());
  if (needs.length === 0) return true;
  const identity = (card.color_identity ?? []).map(c => String(c).toUpperCase());
  return identity.every(c => needs.includes(c));
}

/**
 * The faces for every template, from one shared pool of cards.
 *
 * Pure, so it is tested without a database. The caller runs the single query
 * described at the top of this file and hands the rows in.
 *
 * A template with no card scoring above zero gets an EMPTY array rather than
 * the most popular cards in the pool. A tile showing Sol Ring under "Aggressive
 * Burn" because nothing else matched is worse than a tile showing no cards: the
 * first is wrong and the second is merely quiet.
 */
export function facesForTemplates(
  templates: readonly ArchetypeTemplate[],
  pool: readonly FaceCard[],
  perTemplate = FACES_PER_TEMPLATE
): Record<string, FaceCard[]> {
  const out: Record<string, FaceCard[]> = {};
  /*
   * A CARD SPEAKS FOR ONE ARCHETYPE ON THIS PAGE.
   *
   * Guttersnipe genuinely is both Aggressive Burn and Spellslinger, and the
   * first version showed it on both — measured, Aggressive Burn and Spellslinger
   * drew the IDENTICAL three cards, as did Commander Control and Draw-Go
   * Control. Two tiles side by side with the same art read as a bug whatever
   * the truth of it, and the whole point of the strip is telling eleven
   * archetypes apart.
   *
   * Greedy, in display order: a template takes its best cards that no earlier
   * template has taken. It falls back to a card already used rather than
   * showing a gap, because a half-empty strip is worse than a repeat.
   */
  const taken = new Set<string>();

  for (const template of templates) {
    const scored: Array<{ card: FaceCard; score: number }> = [];
    for (const card of pool) {
      if (!fitsColours(template, card)) continue;
      const score = synergyScore(template, card);
      if (score > 0) scored.push({ card, score });
    }

    /* Best fit first, and the more played card wins a tie, because both halves
       of "this is what the deck looks like" matter: it has to do the thing, and
       it has to be a card people recognise. `edhrec_rank` is ascending, so a
       missing rank sorts last rather than first. */
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (a.card.edhrec_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.card.edhrec_rank ?? Number.MAX_SAFE_INTEGER) ||
        a.card.name.localeCompare(b.card.name)
    );

    const fresh = scored.filter(entry => !taken.has(entry.card.id));
    const chosen = fresh.slice(0, perTemplate).map(entry => entry.card);

    /* Only if being strict would leave a gap. */
    if (chosen.length < perTemplate) {
      for (const entry of scored) {
        if (chosen.length >= perTemplate) break;
        if (!chosen.some(card => card.id === entry.card.id)) chosen.push(entry.card);
      }
    }

    for (const card of chosen) taken.add(card.id);
    out[template.id] = chosen;
  }

  return out;
}
