/**
 * The mana base, judged from the catalogue rather than from recall.
 *
 * "Which lands can I upgrade?" has a real answer that can be computed: find the
 * lands in this deck that make no colour the deck needs, then find lands in the
 * catalogue that make two or more of them, are legal in the format, and are not
 * already in the list. Tutor is then asked to explain and rank a shortlist that
 * exists, rather than to remember one.
 *
 * Everything here reads `produced_mana`, which is what a land TAPS FOR. It is
 * not `colors`, which is empty for every land ever printed.
 */

import type { NormalisedCard } from './deck-context.ts';
import { isLand } from './deck-context.ts';

export interface LandVerdict {
  name: string;
  quantity: number;
  produces: string[] | null;
  /** Colours it makes that this deck actually plays. */
  relevant: string[];
  entersTapped: boolean;
  isBasic: boolean;
  priceUSD: number | null;
  verdict: 'no colour' | 'makes no mana' | 'one colour, enters tapped' | 'one colour' | 'fixes two or more' | 'basic';
}

const TAPPED = /enters tapped|enters the battlefield tapped/i;

export function gradeLands(cards: NormalisedCard[], identity: string[]): LandVerdict[] {
  const colours = identity.filter(c => 'WUBRG'.includes(c));
  return cards
    .filter(c => !c.isSideboard && !c.isCommander && isLand(c))
    .map(c => {
      const produces = c.producedMana;
      const relevant = (produces ?? []).filter(m => colours.includes(m));
      const entersTapped = TAPPED.test(c.oracleText);
      const isBasic = /basic land/i.test(c.typeLine);

      let verdict: LandVerdict['verdict'];
      if (isBasic) verdict = 'basic';
      else if (produces === null) verdict = 'no colour';
      else if (produces.length === 0) verdict = 'makes no mana';
      else if (relevant.length === 0) verdict = 'no colour';
      else if (relevant.length === 1) verdict = entersTapped ? 'one colour, enters tapped' : 'one colour';
      else verdict = 'fixes two or more';

      return {
        name: c.name,
        quantity: c.quantity,
        produces,
        relevant,
        entersTapped,
        isBasic,
        priceUSD: c.priceUSD,
        verdict,
      };
    });
}

/**
 * The lands worth replacing first, weakest first.
 *
 * A land that makes none of the deck's colours is the clearest upgrade slot
 * there is: in a four-colour deck it is a land that does nothing for casting
 * anything. Basics are excluded because cutting basics is a different decision.
 */
export function upgradeTargets(verdicts: LandVerdict[]): LandVerdict[] {
  const rank: Record<LandVerdict['verdict'], number> = {
    'no colour': 0,
    'makes no mana': 1,
    'one colour, enters tapped': 2,
    'one colour': 3,
    'fixes two or more': 9,
    basic: 9,
  };
  return verdicts
    .filter(v => !v.isBasic && rank[v.verdict] <= 2)
    .sort((a, b) => rank[a.verdict] - rank[b.verdict]);
}

export interface LandCandidate {
  id: string;
  name: string;
  type_line: string;
  oracle_text: string | null;
  produced_mana: string[] | null;
  prices: Record<string, string | null> | null;
  edhrec_rank: number | null;
}

/**
 * Lands from the catalogue that fix two or more of this deck's colours.
 *
 * Ordered by `edhrec_rank`, which is a real measure of how much Commander plays
 * a card, so the shortlist is the popular fixing for these colours rather than
 * whatever happens to come to mind. Cards already in the deck are excluded,
 * because suggesting a card someone already runs is the fastest way to prove
 * nothing read the list.
 *
 * WHY THERE IS NO `type_line` FILTER IN THE QUERY
 * ----------------------------------------------
 * There used to be `.ilike('type_line', '%Land%')`, and it was the single most
 * expensive thing in this function while filtering out nothing at all.
 *
 * Measured on the live database, four-colour identity WUBG:
 *
 *   produced_mana && WUBG                      1392 rows, GIN scan  ~0.2 s
 *   ... AND edhrec_rank IS NOT NULL             575 rows
 *   ... AND type_line ILIKE '%Land%'            575 rows   <- removes ZERO
 *
 * A leading-wildcard ILIKE cannot use a btree index, so it was served by
 * `cards_type_line_trgm_idx`, a GIN trigram scan that took ~5 s on its own and
 * was then bitmap-ANDed with the other two. Total execution 17.4 s against the
 * 8 s `statement_timeout` the edge function's role carries, so this query never
 * once returned: the logs show `land candidate query failed: canceling
 * statement due to statement timeout` on every call.
 *
 * It removed nothing because a card that taps for two or more colours and has an
 * EDHREC rank is, in this catalogue, already a land. The type is checked in
 * JavaScript below instead, over at most ~1400 rows, which costs nothing.
 */
export async function findLandCandidates(
  supabase: any,
  identity: string[],
  excludeNames: string[],
  limit = 45
): Promise<LandCandidate[] | null> {
  const colours = identity.filter(c => 'WUBRG'.includes(c));
  if (colours.length < 2) return [];

  const { data, error } = await supabase
    .from('cards')
    .select('id, name, type_line, oracle_text, produced_mana, prices, edhrec_rank, legalities')
    .overlaps('produced_mana', colours)
    .not('edhrec_rank', 'is', null)
    .order('edhrec_rank', { ascending: true })
    .limit(1500);

  /* null, not []. An empty list and a failed lookup are different facts, and the
     caller has to be able to tell them apart: "there are no candidates" is worth
     saying out loud, while "the catalogue could not be read" must NOT quietly
     turn into an invitation to suggest lands from memory. */
  if (error) {
    console.error('land candidate query failed:', error.message);
    return null;
  }

  const excluded = new Set(excludeNames.map(n => n.toLowerCase()));
  const seen = new Set<string>();
  const out: LandCandidate[] = [];

  for (const row of data ?? []) {
    const name = String(row.name);
    if (seen.has(name.toLowerCase())) continue;
    if (excluded.has(name.toLowerCase())) continue;
    // The type check the database used to do, done here for nothing.
    if (!/\bland\b/i.test(row.type_line ?? '')) continue;
    if (/basic land/i.test(row.type_line ?? '')) continue;
    if (row.legalities && row.legalities.commander && row.legalities.commander !== 'legal') continue;

    const produces: string[] = Array.isArray(row.produced_mana) ? row.produced_mana : [];
    const relevant = produces.filter((m: string) => colours.includes(m));
    if (relevant.length < 2) continue;

    seen.add(name.toLowerCase());
    out.push({
      id: row.id,
      name,
      type_line: row.type_line,
      oracle_text: row.oracle_text,
      produced_mana: produces,
      prices: row.prices,
      edhrec_rank: row.edhrec_rank,
    });
    if (out.length >= limit) break;
  }

  return out;
}

export function renderCandidates(candidates: LandCandidate[], colours: string[]): string {
  if (!candidates.length) return '';
  const lines = candidates.map(c => {
    const relevant = (c.produced_mana ?? []).filter(m => colours.includes(m)).join('');
    const usd = c.prices?.usd ? `$${Number(c.prices.usd).toFixed(2)}` : 'price unknown';
    const tapped = TAPPED.test(c.oracle_text ?? '') ? ', enters tapped' : ', enters untapped';
    return `  ${c.name} [taps for ${relevant}${tapped}] ${usd}`;
  });
  return lines.join('\n');
}
