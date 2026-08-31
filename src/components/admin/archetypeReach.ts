import { supabase } from '@/integrations/supabase/client';
import {
  planForArchetype,
  facetBackground,
  planFit,
  type ArchetypePlan,
  type Facet,
  type Want,
} from '@/engine/knowledge/behaviour';
import type { DeckArchetype } from '@/lib/deck/archetypeShells';

/**
 * WHAT A SHELL ACTUALLY MEANS, asked of the engine rather than typed out.
 *
 * The owner, 31 Aug 2026: *"why are only 12 cards named for all shells?"*
 *
 * Because `DECK_ARCHETYPES` is hand-written: three packages of four. Twelve
 * cards is the right size for a SEED — somebody had to say what Aristocrats is,
 * and naming Viscera Seer and Blood Artist says it precisely — but it is the
 * wrong thing to put on a screen as the answer, for the same reason a
 * hand-kept facet list would be. It cannot grow, it cannot learn, and it says
 * nothing about whether the engine agrees.
 *
 * The engine already has the machinery. `planForArchetype` reads the facets the
 * seed cards share and turns them into wants; `archetypeFit` scores any card
 * against those wants. So the twelve become a question — "what IS this shell" —
 * and the catalogue answers it.
 *
 * That makes the screen a real check rather than a restatement. If the engine
 * reaches for a card that has no business in Aristocrats, you can see it,
 * which is the whole point of putting it in front of somebody.
 *
 * ## The pool is fetched once and shared
 *
 * Every shell scores the same cards, so refetching per shell would be eighteen
 * copies of one request. It is cached on the module, which is fine for a screen
 * nobody keeps open for a week and avoids a query on every panel open.
 *
 * `cards_pool` is the narrow view: nine ranking columns and the precompiled
 * facets, 13 MB against `cards_unique`'s 77 MB. It carries no images, so the
 * handful of cards that survive ranking have their art fetched separately —
 * two small requests instead of one fat one.
 */

export interface ReachCard {
  id: string;
  name: string;
  typeLine: string;
  rank: number | null;
  score: number;
  /**
   * EVERY want it matched, not the best one.
   *
   * `planFit` is a noisy-OR, so a card answering one loud want outranks a card
   * answering four quiet ones, and printing only the top want hides that
   * completely: twenty-four cards all captioned "make tokens" look like
   * twenty-four equally good answers. Showing the whole set makes Smothering
   * Tithe (one want) and Pitiless Plunderer (four) tell themselves apart, which
   * is the difference between a screen that restates the ranking and one you
   * can catch it with.
   */
  matched: string[];
  imageUris?: unknown;
}

interface PoolRow {
  id: string;
  name: string;
  type_line: string | null;
  edhrec_rank: number | null;
  facets: string[] | null;
}

/**
 * How many of the most played cards to rank against.
 *
 * The standing instruction is to stop thinking in top-N, and for what the
 * GENERATOR builds that is right. This is a different job: it is a display of
 * what a shell means, and a display is better for showing cards a reader
 * recognises. 2,000 is two PostgREST pages, which is the real constraint —
 * the server caps a response at 1,000 rows whatever `limit` says.
 */
const POOL_SIZE = 2000;

/**
 * A Commander deck's non-land count, which is what `minCards` means.
 *
 * The generator derives it from the shape it is building. There is no deck
 * here, so the format's own number stands in: 100 cards, roughly 37 lands.
 */
const SPELL_SLOTS = 63;

let poolPromise: Promise<PoolRow[]> | null = null;

async function loadPool(): Promise<PoolRow[]> {
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const rows: PoolRow[] = [];
    /*
     * Keyset on rank, NOT offset. `offset=1000` makes Postgres walk and discard
     * a thousand rows; `edhrec_rank=gte.N` is a clean index range, measured at
     * 0.34 s against 2.29 s. `gte` rather than `gt` because rank is not unique,
     * so a seen-set does the deduping the cursor cannot.
     */
    const seen = new Set<string>();
    let after = 1;
    for (let page = 0; page < 4 && rows.length < POOL_SIZE; page++) {
      const { data, error } = await supabase
        .from('cards_pool' as never)
        .select('id,name,type_line,edhrec_rank,facets')
        .eq('commander_legal', 'legal')
        .not('edhrec_rank', 'is', null)
        .gte('edhrec_rank', after)
        .order('edhrec_rank', { ascending: true })
        .limit(1000);
      if (error) throw error;
      const batch = (data ?? []) as unknown as PoolRow[];
      if (batch.length === 0) break;
      for (const row of batch) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
      after = batch[batch.length - 1]?.edhrec_rank ?? after;
      if (batch.length < 1000) break;
    }
    return rows.slice(0, POOL_SIZE);
  })();
  return poolPromise;
}

/** The seed cards, resolved so their facets can be read. */
async function loadSeeds(names: string[]): Promise<PoolRow[]> {
  if (names.length === 0) return [];
  const { data, error } = await supabase
    .from('cards_pool' as never)
    .select('id,name,type_line,edhrec_rank,facets')
    .in('name', names);
  if (error) throw error;
  const byName = new Map<string, PoolRow>();
  for (const row of (data ?? []) as unknown as PoolRow[]) {
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  /* The caller's order, so a card the catalogue could not resolve is a gap in
     the list rather than a silent reordering of it. */
  return names.map(n => byName.get(n)).filter((r): r is PoolRow => Boolean(r));
}

export interface ArchetypeReach {
  plan: ArchetypePlan;
  /** How many of the shell's named cards the catalogue actually resolved. */
  seedsFound: number;
  seedsNamed: number;
  /** Which of the seeds carry no ability record, so contributed nothing. */
  seedsWithoutRecord: number;
  picks: ReachCard[];
  poolSize: number;
}

export async function reachFor(shell: DeckArchetype, take = 24): Promise<ArchetypeReach> {
  const names = shell.packages.flatMap(p => p.cards);
  const [seeds, pool] = await Promise.all([loadSeeds(names), loadPool()]);

  /*
   * THE BACKGROUND IS NOT OPTIONAL, and leaving it out is a silent disaster.
   *
   * A want's weight is a LIFT: how many times more often the shell's own cards
   * carry a facet than the cards it will be ranking do. Without a background
   * there is nothing to lift against, so the loudest want becomes whatever the
   * twelve seeds happen to share most, and what twelve creature-adjacent cards
   * share most is `cares:type:creature`.
   *
   * Measured, with the background omitted: Aristocrats reached for Swords to
   * Plowshares, Path to Exile, Negate, Blasphemous Act and Lightning Greaves,
   * every one of them carrying the same reason. `generate.ts` names this exact
   * failure in a comment above its own call — `cares:type:creature` is on five
   * of the shell's twelve cards and on 21% of the pool, so it separates
   * nothing, while `trig:dies` is on four of twelve and 2.6% of the pool and
   * separates a deck.
   *
   * Lands are excluded the way the generator excludes them: the wants pick
   * spells, and the mana base is chosen with no plan at all. `minCards` is a
   * deck's worth of spells, because a want fewer cards than that can satisfy
   * cannot shape a deck, only decorate a few slots.
   */
  const spells = pool.filter(c => !(c.type_line ?? '').includes('Land'));
  const background = facetBackground(
    spells.map(c => ({ facets: (c.facets ?? []) as Facet[] })),
    SPELL_SLOTS
  );

  const plan = planForArchetype(
    {
      id: shell.id,
      name: shell.name,
      named: names.length,
      exemplars: seeds.map(s => ({ name: s.name, facets: (s.facets ?? []) as Facet[] })),
    },
    background
  );

  /*
   * THE SHELL'S WEIGHTS ARE LIFTS, NOT SCORES, and `planFit` expects 0 to 1.
   *
   * `ArchetypePlan.wants[].weight` says how many times more often the shell's
   * own cards carry a facet than the pool does, so it is usually greater than
   * one — the only `Want` in the engine that is. In the generator
   * `withArchetype` rescales the list against the commander before it ever
   * reaches `planFit`. There is no commander here, so the rescale is against
   * the strongest want in the shell itself: the loudest thing about the shell
   * becomes 1 and everything else keeps its proportion.
   *
   * `archetypeFit` is not used because it wants an `ArchetypeInfluence`, which
   * only exists once a commander has been folded in.
   */
  const topLift = Math.max(1e-6, ...plan.wants.map(w => w.weight));
  const scaled: Want[] = plan.wants.map(w => ({ ...w, weight: Math.min(1, w.weight / topLift) }));

  const scored: ReachCard[] = [];
  for (const row of pool) {
    const facets = (row.facets ?? []) as Facet[];
    if (facets.length === 0) continue;
    const fit = planFit(
      { commanderName: plan.name, wants: scaled, tribe: null, fromTagsOnly: false },
      { facets }
    );
    if (fit.fit <= 0) continue;
    const matched = fit.matched.map(w => w.facet);
    scored.push({
      id: row.id,
      name: row.name,
      typeLine: row.type_line ?? '',
      rank: row.edhrec_rank,
      score: fit.fit,
      matched,
    });
  }

  scored.sort((a, b) => b.score - a.score || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const picks = scored.slice(0, take);

  /* Art for the survivors only. Fetching images for 2,000 rows to draw 24 is
     the mistake the pool query itself was making until 31 Aug. */
  if (picks.length > 0) {
    const { data } = await supabase
      .from('cards_unique' as never)
      .select('id,image_uris')
      .in('id', picks.map(p => p.id));
    const art = new Map<string, unknown>();
    for (const row of (data ?? []) as Array<{ id: string; image_uris: unknown }>) {
      art.set(row.id, row.image_uris);
    }
    for (const p of picks) p.imageUris = art.get(p.id);
  }

  return {
    plan,
    seedsFound: seeds.length,
    seedsNamed: names.length,
    seedsWithoutRecord: seeds.filter(s => !(s.facets ?? []).some(f => f.startsWith('rec:'))).length,
    picks,
    poolSize: pool.length,
  };
}
