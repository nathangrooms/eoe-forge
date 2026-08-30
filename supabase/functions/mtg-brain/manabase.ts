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

/**
 * Whether a land really does come down tapped, said the way a player says it.
 *
 * The plain test above is a substring match and a lot of lands say "enters
 * tapped" inside a condition. Watery Grave says you may pay 2 life and it does
 * not, and reporting that as "enters tapped" is a wrong fact about a card in an
 * answer that is otherwise correct. It was on screen in the first run of this.
 *
 * Only the two conditions worth naming are separated out. Anything else that
 * qualifies its own tapped clause is reported as "sometimes enters tapped",
 * which is vague and true, rather than flatly wrong.
 */
/**
 * A card's text with the reminder brackets taken out.
 *
 * REMINDER TEXT IS NOT THE RULE, and reading it as one printed a wrong fact.
 * Path of Ancestry says "This land enters tapped." flatly, and the only "you
 * may" on the whole card is inside the scry reminder,
 * "(Look at the top card of your library. You may put that card on the
 * bottom.)". The qualifier test below saw that and downgraded a flat statement
 * to "sometimes enters tapped", which was offered to a player as a swap.
 *
 * Measured over the catalogue on 2026-08-30: 59 lands say "This land enters
 * tapped." and also carry the words "you may" somewhere. After the brackets
 * come out, 18 still do. **41 of the 59 were being described wrongly**, and
 * Path of Ancestry is the second most played land in Commander among them.
 */
function withoutReminders(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ');
}

export function tappedNote(oracleText: string | null | undefined): string {
  const text = String(oracleText ?? '');
  if (!TAPPED.test(text)) return 'enters untapped';
  const rules = withoutReminders(text);
  if (/pay \d+ life/i.test(rules)) return 'enters untapped if you pay the life';
  if (/\bunless\b|\bif you don't\b|\bif you do\b|\byou may\b/i.test(rules)) return 'sometimes enters tapped';
  return 'enters tapped';
}

/**
 * What a land's colours depend on, when they depend on something.
 *
 * `produced_mana` is the list of colours a land CAN EVER make, and a swap list
 * printed it as what the land WILL make. Exotic Orchard carries
 * `["B","G","R","U","W"]` and its ability is
 * `{T}: Add one mana of any color that a land an opponent controls could
 * produce.` Against three mono red opponents it makes {R} and casts nothing in
 * a four colour deck. It was offered as a straight upgrade over a land that at
 * least reliably makes {C}, and it is the third land in the shortlist for any
 * four colour deck because it is ranked 9.
 *
 * Two conditions and no more, because only two are worth naming and a wider net
 * would hedge lands that are fine:
 *
 *   - "could produce" makes the colours depend on somebody's board. Six lands.
 *   - "Spend this mana only" makes the colours real and the mana restricted.
 *     Forty nine lands.
 *
 * Command Tower is deliberately NOT flagged. Its condition is the commander's
 * own colour identity, which is the deck being asked about, so "taps for BGUW"
 * is exactly right for a BGUW deck. That is the line between a condition that
 * matters to the answer and one that does not.
 */
export function conditionNote(oracleText: string | null | undefined): string | null {
  const rules = withoutReminders(String(oracleText ?? ''));
  if (/could produce/i.test(rules)) {
    return 'though only the colours somebody else\'s lands are already making';
  }
  if (/spend this mana only/i.test(rules)) {
    return 'though the card limits what that mana may be spent on';
  }
  return null;
}

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

  /* 600 rows, not 1,500. Measured over HTTP with the anon key, four colours:
   *
   *   cards        limit 1500   3.48 s   over the 3 s statement_timeout
   *   cards        limit  600   0.40 s
   *
   * At 1,500 this returned nothing at all, so "which lands can I upgrade" gave
   * the list of weak lands and then said the shortlist could not be read. The
   * loop below drops every land that does not make two of the deck's colours,
   * so 600 in popularity order is still far more than the 45 that survive it.
   *
   * WHY THIS STILL READS `cards` RATHER THAN `cards_unique`
   * ------------------------------------------------------
   * CLAUDE.md 10b says the source should move, and it cannot yet. Measured the
   * same way on the same day:
   *
   *   cards_unique limit  600   3.08 s   times out
   *   cards_unique limit 1500   3.20 s   times out
   *
   * `cards` carries an index on `produced_mana` and `cards_unique` does not, so
   * the view has to scan for the overlap. Moving the source means adding that
   * index first, and this file is not the place to decide that: the database
   * discipline note is explicit that the two already carry near duplicate index
   * sets. Results are unaffected either way, because the loop below dedupes by
   * name, which is why the note called it tidiness rather than a bug. */
  const { data, error } = await supabase
    .from('cards')
    .select('id, name, type_line, oracle_text, produced_mana, prices, edhrec_rank, legalities')
    .overlaps('produced_mana', colours)
    .not('edhrec_rank', 'is', null)
    .order('edhrec_rank', { ascending: true })
    .limit(600);

  /* null, not []. An empty list and a failed lookup are different facts, and the
     caller has to be able to tell them apart: "there are no candidates" is worth
     saying out loud, while "the catalogue could not be read" must NOT quietly
     turn into an invitation to suggest lands from memory. */
  if (error) {
    console.error('land candidate query failed:', error.message);
    return null;
  }

  const excluded = new Set(excludeNames.map(n => n.toLowerCase()));

  /* One entry per card, and the entry is the printing worth quoting a price
     from. `cards` holds every printing, so the same land arrives several times
     and keeping whichever came first printed "no price on file" beside Watery
     Grave, a card that plainly has a price. That is the missing price rule
     broken from the other end: absence reported where there is none.

     The tie break is the project's existing one rather than a new one: a priced
     printing beats an unpriced printing, then the cheaper price wins. Same rule
     as `cards_unique`'s own ordering and as `comparePrintings`. */
  const best = new Map<string, LandCandidate>();

  for (const row of data ?? []) {
    const name = String(row.name);
    if (excluded.has(name.toLowerCase())) continue;
    // The type check the database used to do, done here for nothing.
    if (!/\bland\b/i.test(row.type_line ?? '')) continue;
    if (/basic land/i.test(row.type_line ?? '')) continue;
    if (row.legalities && row.legalities.commander && row.legalities.commander !== 'legal') continue;

    const produces: string[] = Array.isArray(row.produced_mana) ? row.produced_mana : [];
    const relevant = produces.filter((m: string) => colours.includes(m));
    if (relevant.length < 2) continue;

    const candidate: LandCandidate = {
      id: row.id,
      name,
      type_line: row.type_line,
      oracle_text: row.oracle_text,
      produced_mana: produces,
      prices: row.prices,
      edhrec_rank: row.edhrec_rank,
    };

    const key = name.toLowerCase();
    const held = best.get(key);
    if (!held || betterPrinting(candidate, held)) best.set(key, candidate);
  }

  return [...best.values()]
    .sort((a, b) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9))
    .slice(0, limit);
}

/** A priced printing beats an unpriced one, then the cheaper price wins. */
function betterPrinting(a: LandCandidate, b: LandCandidate): boolean {
  const priceOf = (c: LandCandidate): number | null => {
    const raw = c.prices?.usd;
    if (raw == null) return null;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const one = priceOf(a);
  const two = priceOf(b);
  if (one != null && two == null) return true;
  if (one == null) return false;
  return one < (two as number);
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
