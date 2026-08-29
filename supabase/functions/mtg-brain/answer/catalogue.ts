/**
 * Every read the deterministic answerer makes, in one place.
 *
 * THE RULE THAT SHAPES THIS WHOLE FILE
 * ------------------------------------
 * "We hold nothing about that" and "we could not read it just now" are
 * different facts and a player reads them differently. So nothing here returns
 * an empty array on failure. Every read returns `Read<T>`, which is either the
 * value or the reason there is not one, and the answerers are written so that a
 * failed read produces a sentence saying the lookup failed rather than a
 * sentence saying the card has no combos.
 *
 * `resolve-cards.ts` has the scar this rule came from, written in its own
 * comments: `const { data } = await ...` threw the error away, so a run that
 * resolved 0 of 86 real card names looked exactly like a healthy one.
 *
 * WHICH TABLE
 * -----------
 * `cards_unique` is the default, per CLAUDE.md 6.3: one row per card, so a
 * search cannot spend all ten slots on reprints of Sol Ring. `cards` is read in
 * exactly one place here, `printingOf`, because a price is a fact about a
 * printing and the player has a specific printing open.
 */

import { sharedTagScore, signalTags } from '../_engine/knowledge/tag-signal.ts';

/** The value, or why there is not one. Never an empty result standing in for a failure. */
export type Read<T> = { ok: true; value: T } | { ok: false; why: string };

const ok = <T>(value: T): Read<T> => ({ ok: true, value });
const failed = (why: string): Read<never> => ({ ok: false, why });

/* -------------------------------------------------------------------------- *
 * Shapes
 * -------------------------------------------------------------------------- */

export interface CardRow {
  id: string;
  oracle_id: string | null;
  name: string;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  type_line: string | null;
  oracle_text: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  keywords: string[] | null;
  tags: string[] | null;
  legalities: Record<string, string> | null;
  prices: Record<string, unknown> | null;
  edhrec_rank: number | null;
  rarity: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  game_changer: boolean | null;
  printings_count: number | null;
  faces: unknown;
}

const CARD_COLUMNS =
  'id, oracle_id, name, set_code, set_name, collector_number, type_line, oracle_text, ' +
  'mana_cost, cmc, colors, color_identity, keywords, tags, legalities, prices, ' +
  'edhrec_rank, rarity, power, toughness, loyalty, game_changer, printings_count, faces';

/**
 * What a row in a LIST needs, which is far less than one card being explained.
 *
 * Asking for the full set on a list query drags `image_uris`, `faces`,
 * `oracle_text` and `legalities` out of the heap for every candidate row.
 * Measured on the staples lists: with the wide list three of the five colours
 * hit the 3 s limit and returned nothing; with this one all five come back.
 * The art is attached separately by `resolveCards` and does not need to ride
 * along here.
 */
const LIST_COLUMNS =
  'id, oracle_id, name, set_code, type_line, mana_cost, cmc, color_identity, tags, ' +
  'prices, edhrec_rank, rarity, game_changer';

export interface Combo {
  comboId: string;
  popularity: number | null;
  produces: string[];
  manaNeeded: string | null;
  cardCount: number | null;
  /** How many pieces the combo needs that are described rather than named. */
  templateCount: number | null;
  pieces: string[];
  /** How many combos in total the card appears in, not just the ones returned. */
  totalCombos: number;
}

export interface DeckHit {
  deckName: string;
  format: string | null;
  quantity: number;
  isCommander: boolean;
}

/** One combo out of the whole list, rather than one card's combos. */
export interface ComboPair {
  comboId: string;
  popularity: number | null;
  produces: string[];
  manaNeeded: string | null;
  pieces: string[];
}

/* -------------------------------------------------------------------------- *
 * One card
 * -------------------------------------------------------------------------- */

/**
 * The card by name. `null` means the catalogue does not know that name, which
 * is a real answer and is said out loud rather than papered over.
 *
 * A modal or split card is stored under both halves joined by " // ", and
 * nobody types that, so a miss on the exact name is retried as a half.
 */
export async function cardByName(db: any, name: string): Promise<Read<CardRow | null>> {
  const wanted = name.trim();
  if (!wanted) return ok(null);

  const exact = await db.from('cards_unique').select(CARD_COLUMNS).ilike('name', wanted).limit(1);
  if (exact.error) return failed(exact.error.message);
  if (exact.data?.length) return ok(exact.data[0] as CardRow);

  // PostgREST splits an `or=` filter on commas and plenty of card names carry one.
  const safe = wanted.replace(/[,()]/g, '_');
  const half = await db
    .from('cards_unique')
    .select(CARD_COLUMNS)
    .or(`name.ilike.${safe} // %,name.ilike.% // ${safe}`)
    .limit(1);
  if (half.error) return failed(half.error.message);
  return ok((half.data?.[0] as CardRow) ?? null);
}

/**
 * The exact printing the player has open, for its price.
 *
 * This is the one read in this file that goes to `cards` rather than
 * `cards_unique`, and it is the case CLAUDE.md 6.3 names: the printing IS the
 * subject. Two printings of the same card can be a dollar and two hundred
 * dollars, so quoting the cheapest one at somebody looking at a Secret Lair
 * would be a wrong number wearing a right number's clothes.
 */
export async function printingOf(
  db: any,
  name: string,
  setCode: string | null,
  collectorNumber: string | null
): Promise<Read<CardRow | null>> {
  if (!setCode || !collectorNumber) return ok(null);
  /* A short column list on purpose. `printings_count` is worked out by the
     view and does not exist on `cards`, and asking for it here made the whole
     select fail. The failure was then swallowed by a caller that treated "the
     lookup broke" and "there is no such printing" as the same thing, which is
     the exact mistake the header of this file is about. Caught by running it. */
  const { data, error } = await db
    .from('cards')
    .select('id, oracle_id, name, set_code, set_name, collector_number, rarity, prices')
    .ilike('name', name.trim())
    .eq('set_code', String(setCode).toLowerCase())
    .eq('collector_number', String(collectorNumber))
    .limit(1);
  if (error) return failed(error.message);
  return ok((data?.[0] as unknown as CardRow) ?? null);
}

/* -------------------------------------------------------------------------- *
 * Combos
 * -------------------------------------------------------------------------- */

/**
 * The combos this card is part of, most played first.
 *
 * Goes through `tutor_card_combos` rather than two PostgREST reads because
 * PostgREST caps a response at 1,000 rows and eleven cards in this catalogue
 * are in more combos than that. Reading a truncated slice and then calling it
 * "the most played" is exactly the kind of invented answer this work exists to
 * remove. See the migration for the measurements.
 */
export async function combosFor(db: any, oracleId: string, limit = 5): Promise<Read<Combo[]>> {
  const { data, error } = await db.rpc('tutor_card_combos', {
    p_oracle_id: oracleId,
    p_limit: limit,
  });
  if (error) return failed(error.message);
  const rows = (data ?? []) as any[];
  return ok(
    rows.map(r => ({
      comboId: String(r.combo_id),
      popularity: r.popularity ?? null,
      produces: Array.isArray(r.produces) ? r.produces : [],
      manaNeeded: r.mana_needed ?? null,
      cardCount: r.card_count ?? null,
      templateCount: r.template_count ?? null,
      pieces: Array.isArray(r.pieces) ? r.pieces : [],
      totalCombos: Number(r.total_combos ?? 0),
    }))
  );
}

/**
 * The most played two card combos in the whole list.
 *
 * `card_count = 2` and `template_count = 0` together mean both pieces are named
 * cards. A combo needing "a creature with flying" is a real combo and it is not
 * two cards, and printing it as one would be a two card combo that is not one.
 *
 * TWO FILTERS ARE IN THE QUERY AND ONE IS NOT, and the reason is measured.
 * `legalities->>'commander'` in the query makes the planner give up on
 * `idx_meta_combos_popularity` and sequential scan all 61,500 rows: 458 ms cold
 * against a 3 s limit. With that one filter moved into JavaScript the same
 * query is an index scan and takes 16.9 ms. Only 16 of the 3,887 two card
 * combos are not Commander legal, so almost nothing is thrown away here.
 */
export async function topTwoCardCombos(db: any, want: number): Promise<Read<ComboPair[]>> {
  const combos = await db
    .from('meta_combos')
    .select('id, popularity, produces, mana_needed, legalities')
    .eq('card_count', 2)
    .eq('template_count', 0)
    .order('popularity', { ascending: false, nullsFirst: false })
    .limit(Math.max(want * 5, 40));
  if (combos.error) return failed(combos.error.message);

  const rows = ((combos.data ?? []) as any[]).filter(
    r => String(r.legalities?.commander ?? '') === 'true'
  );
  if (!rows.length) return ok([]);

  const pieces = await db
    .from('meta_combo_cards')
    .select('combo_id, card_name')
    .in('combo_id', rows.map(r => String(r.id)));
  if (pieces.error) return failed(pieces.error.message);

  const byCombo = new Map<string, string[]>();
  for (const piece of (pieces.data ?? []) as any[]) {
    const key = String(piece.combo_id);
    const list = byCombo.get(key) ?? [];
    list.push(String(piece.card_name));
    byCombo.set(key, list);
  }

  return ok(
    rows.map(r => ({
      comboId: String(r.id),
      popularity: r.popularity ?? null,
      produces: Array.isArray(r.produces) ? r.produces : [],
      manaNeeded: r.mana_needed ?? null,
      pieces: (byCombo.get(String(r.id)) ?? []).sort(),
    }))
  );
}

/* -------------------------------------------------------------------------- *
 * Lists of cards
 * -------------------------------------------------------------------------- */

/**
 * Every card in one legality state for one format, most played first.
 *
 * CONTAINMENT, NOT EQUALITY, and it is the difference between an answer and a
 * timeout. `legalities->>'commander' = 'banned'` cannot use an index and
 * sequential scans all 33,032 rows: measured 2,738 ms against a 3 s limit, so
 * the banned list would have failed roughly whenever the cache was cold.
 * `legalities @> '{"commander":"banned"}'` uses the existing GIN index on the
 * column and takes 22.8 ms for the same 76 rows.
 *
 * The `= 'legal'` reads elsewhere in this file are left alone: they are always
 * paired with an `edhrec_rank` order, which the partial index
 * `cards_unique_commander_rank_idx` already serves.
 */
export async function cardsInLegalityState(
  db: any,
  format: string,
  state: 'banned' | 'restricted',
  limit: number
): Promise<Read<CardRow[]>> {
  const { data, error } = await db
    .from('cards_unique')
    .select(LIST_COLUMNS)
    .contains('legalities', { [format]: state })
    .order('edhrec_rank', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) return failed(error.message);
  return ok((data ?? []) as CardRow[]);
}

/* THERE IS NO "MOST EXPENSIVE CARDS" READ HERE, ON PURPOSE.
   `prices` is jsonb and `prices->>'usd'` is text, so a database order on it
   sorts 9.99 above 10000.00, and `cards_unique` carries no numeric price
   column: checked, no column on the view matches price or usd other than the
   jsonb. Answering it would mean reading 32,449 priced rows to sort them in
   here, which is the shape of read that has taken this database down twice. So
   a price question with no card named says so and asks for a card, rather than
   being served a list that was sorted as text. */

export interface RoleQuery {
  /**
   * A tag from `cards.tags`. The router only ever passes one it recognised.
   * Left out for "what are the staples", which is the same list with no job
   * filter on it at all.
   */
  tag?: string | null;
  /** Colour letters the card must fit inside. Empty means any colour. */
  colours?: string[];
  /**
   * One colour the card must actually be. Different from `colours`: "removal a
   * WUBG deck can play" fits inside four colours, "black removal" is black.
   */
  mustInclude?: string | null;
  /** An exact mana value, when the question asked for one. */
  manaValue?: number | null;
  /** Cards to leave out, by name. Used to keep a deck's own cards off a shortlist. */
  exclude?: string[];
  /**
   * The most a card may cost in dollars, when the question set a budget.
   *
   * Applied here rather than in the query because `prices->>'usd'` is text and
   * a text comparison would put 9.99 above 10.00. So the page of candidates is
   * widened and the filter runs on the rows.
   */
  maxUsd?: number | null;
  limit?: number;
}

/** How far down the popularity order a budget question is allowed to look. */
export const BUDGET_PAGE = 300;

/**
 * The most played cards doing one job.
 *
 * Ordered by `edhrec_rank`, which is how many Commander decks run the card. It
 * is a popularity measure and nothing else, and every answer built on it says
 * so, because "most played" and "best" are not the same claim and only one of
 * them is ours to make.
 */
export async function topByRole(db: any, q: RoleQuery): Promise<Read<CardRow[]>> {
  const limit = q.limit ?? 10;
  const narrowing = Boolean(q.colours?.length || q.exclude?.length);
  let query = db
    .from('cards_unique')
    .select(LIST_COLUMNS)
    .not('edhrec_rank', 'is', null)
    .eq('legalities->>commander', 'legal')
    .order('edhrec_rank', { ascending: true })
    /* Only fetch spare rows when something below is going to throw rows away.
       Reading forty when five are wanted looks free and is not: measured on the
       colour staple lists, limit 40 took 3.1 s and hit the 3 s ceiling while
       limit 5 took 0.07 s. Blue and black came back empty for that reason and
       for no other.

       A BUDGET NEEDS A MUCH WIDER PAGE, because most of what is cheap is
       unpopular and the filter runs after the order. Measured on "black removal
       under a dollar": with the colour pushed into the query, 300 rows is
       255 ms and holds ten cards inside the budget, the first of them Feed the
       Swarm at rank 89. */
    .limit(q.maxUsd != null ? BUDGET_PAGE : narrowing ? Math.max(limit * 4, 40) : limit);

  if (q.tag) query = query.contains('tags', [q.tag]);
  if (q.manaValue != null) query = query.eq('cmc', q.manaValue);
  /* Pushed into the query rather than filtered afterwards. Without a job tag to
     narrow on, the first N rows in rank order are almost all colourless, so
     filtering a page of 40 in JavaScript found nothing for any colour.

     A single colour asked for is pushed down too when there is a budget, for
     the same reason the page is wider: 300 rows of every colour would spend
     most of the page on cards the answer is going to drop anyway. */
  const narrowTo = q.mustInclude ?? (q.maxUsd != null && q.colours?.length === 1 ? q.colours[0] : null);
  if (narrowTo) query = query.contains('color_identity', [narrowTo]);

  const { data, error } = await query;
  if (error) return failed(error.message);

  const colours = (q.colours ?? []).filter(c => 'WUBRG'.includes(c));
  const excluded = new Set((q.exclude ?? []).map(n => n.toLowerCase()));
  const out: CardRow[] = [];

  for (const row of (data ?? []) as CardRow[]) {
    if (excluded.has(row.name.toLowerCase())) continue;
    if (q.maxUsd != null) {
      /* A CARD WE HOLD NO PRICE FOR IS NOT A CHEAP CARD. This is the same rule
         as everywhere else: absence is not zero. Around a thousand printings
         carry no dollar quote, and letting them through a budget filter would
         put them at the top of a list of cards under a dollar. */
      const usd = Number(row.prices?.usd);
      if (!Number.isFinite(usd) || usd <= 0 || usd > q.maxUsd) continue;
    }
    if (colours.length) {
      const identity = Array.isArray(row.color_identity) ? row.color_identity : [];
      // Fits inside the colours asked for. A colourless card fits everywhere.
      if (!identity.every(c => colours.includes(c))) continue;
      // "removal in black" means a black card, not a colourless one that any deck can play.
      if (identity.length === 0) continue;
    }
    out.push(row);
    if (out.length >= limit) break;
  }
  return ok(out);
}

/**
 * Cards that do the same job as this one.
 *
 * Two cards do the same job when they share the rarest thing we know about
 * either of them. `tags` is a small closed vocabulary, so the rarest tag a card
 * carries is the most descriptive one: `counterspell` says far more than
 * `creature`. Candidates are pulled on that tag and then scored by how much of
 * the rest of the card they also match, which is a count of shared tags and
 * nothing cleverer.
 *
 * It is deliberately not a claim about quality. The caller says "these do a
 * similar job" and reports price and how much Commander plays each one, which
 * is what a player asking for a cheaper option actually wants to compare.
 */
export async function similarTo(
  db: any,
  card: CardRow,
  limit = 8
): Promise<Read<CardRow[]>> {
  /* `signalTags` is the engine's answer to "what actually distinguishes this
     card", rarest first, and it does three things this function used to do for
     itself and got wrong.

     It drops the type tags. Leaving them in was measured to matter: Tezzeret
     the Seeker carries `planeswalker` along with three real roles, so "sharing
     two tags" was satisfied by any planeswalker that also untaps, and the
     answer to "what does a similar job" came back as Kaito Shizuki, Sarkhan
     Unbroken and Vivien, Monsters' Advocate.

     It drops the alias names. `removal`, `removal-spot` and `targeted-removal`
     are one idea under three names, so counting shared names scored being
     removal three times and being a Storm payoff once. Measured over
     `cards_unique` on 2026-08-29: 12,911 of the 24,645 cards carrying a role
     tag, 52.4%, had their count inflated this way, 2.61 names per 1.82 ideas.

     And it drops `etb` and `evasion`, which are true of 4,512 and 4,291 cards.
     2,647 cards had no other role tag at all, so their shortlist of "cards
     doing the same job" was other cards that also have an enters trigger. They
     now correctly get no shortlist. */
  const mine = signalTags(card.tags);
  if (!mine.length) return ok([]);

  const rarest = mine[0];

  const { data, error } = await db
    .from('cards_unique')
    .select(LIST_COLUMNS)
    .contains('tags', [rarest])
    .not('edhrec_rank', 'is', null)
    .eq('legalities->>commander', 'legal')
    .order('edhrec_rank', { ascending: true })
    .limit(300);
  if (error) return failed(error.message);

  /* Every candidate already shares the rarest thing we know about this card,
     because that is what the query asked for. What orders them is how much
     ELSE they share, weighted by how surprising each shared idea is: two cards
     both counting Storm says far more than two cards both making mana.

     That weighting is the engine's `sharedTagScore` and it replaces a count
     with a hard floor of two. The floor was doing the wrong job in both
     directions. Over deduplicated ideas it would have emptied the shortlist for
     the 9,937 cards carrying two or more of them, since it would demand a match
     on every one; over raw names it was satisfied by a single idea whenever
     that idea happened to have a legacy spelling. */
  const scored = ((data ?? []) as CardRow[])
    .filter(row => row.name.toLowerCase() !== card.name.toLowerCase())
    .map(row => ({ row, score: sharedTagScore(mine, row.tags) }))
    .sort((a, b) => b.score - a.score || (a.row.edhrec_rank ?? 1e9) - (b.row.edhrec_rank ?? 1e9))
    .slice(0, limit);

  return ok(scored.map(s => s.row));
}

/* -------------------------------------------------------------------------- *
 * The player's own decks
 * -------------------------------------------------------------------------- */

/**
 * Which of the caller's own decks already play this card.
 *
 * Scoped to the caller by user id on purpose. `deck_cards` can also be read for
 * anybody's public deck, so a query by card name alone would answer "which
 * decks play this" with strangers' decks in it, which nobody asked for and
 * which is somebody else's business.
 *
 * Returns null when there is no signed in caller. That is not zero decks, and
 * the answerer must not print it as zero, the same way a missing price is not
 * a price of nothing.
 */
export async function decksPlaying(userDb: any | null, name: string): Promise<Read<DeckHit[]> | null> {
  if (!userDb) return null;

  const who = await userDb.auth.getUser();
  const userId = who?.data?.user?.id;
  if (!userId) return null;

  const decks = await userDb.from('user_decks').select('id, name, format').eq('user_id', userId);
  if (decks.error) return failed(decks.error.message);
  const rows = (decks.data ?? []) as { id: string; name: string; format: string | null }[];
  if (!rows.length) return ok([]);

  const byId = new Map(rows.map(d => [d.id, d]));
  const hits = await userDb
    .from('deck_cards')
    .select('deck_id, quantity, is_commander')
    .ilike('card_name', name.trim())
    .in('deck_id', rows.map(d => d.id));
  if (hits.error) return failed(hits.error.message);

  const out: DeckHit[] = [];
  for (const hit of (hits.data ?? []) as any[]) {
    const deck = byId.get(hit.deck_id);
    if (!deck) continue;
    out.push({
      deckName: deck.name,
      format: deck.format,
      quantity: Number(hit.quantity ?? 1),
      isCommander: Boolean(hit.is_commander),
    });
  }
  return ok(out);
}
