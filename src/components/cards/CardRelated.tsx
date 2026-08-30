import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { uniqueCards, cardPrintings } from '@/lib/cards/cardQuery';
import { cn } from '@/lib/utils';
import { CardImage, CardImageSkeleton } from './CardImage';
import { CardRail } from './CardRail';
import { CardCost } from './CardCost';
import { getUsdPrice, formatUsd } from '@/lib/scryfall/card-utils';
import { signalTags } from '@/lib/cards/tag-signal';
import {
  rankComboPartners,
  comboNote,
  comboBasis,
  MAX_COMBO_PIECES,
  type ComboRow,
  type ComboMemberRow,
} from '@/lib/cards/comboPartners';
import { COMBO_ATTRIBUTION } from '@/lib/meta/types';
import { Layers3, Sparkles } from 'lucide-react';

/**
 * The two recommendation sections on a card page, and what each is allowed to
 * claim.
 *
 * Owner, 2026-08-30, relaying a friend who used the page: the recommendations
 * "are nowhere near alike". And: *"Are we 100% confident this uses the engine
 * too?"*
 *
 * The honest answer that day was no, mostly. `scripts/probe/card-related-quality.mjs`
 * drives the real page and reads every group off the rendered DOM. What it
 * found:
 *
 *   SIMILAR CARDS was a type line, a colour identity and a mana value within
 *   one. Nothing else. Sol Ring returned Phyrexian Dreadnought, Stoneforge
 *   Masterwork, Locket of Yesterdays, Cement Shoes and Golem-Skin Gauntlets;
 *   Swords to Plowshares returned Scent of Jasmine and Elspeth's Smite;
 *   Rhystic Study returned Nerd Rage and Ballad of the Black Flag. Deleted.
 *   Not narrowed, not reranked: the query has no idea what a card does and
 *   there is no ordering of it that would.
 *
 *   WORKS WELL WITH was four similarity groups and one evidence group. Under a
 *   heading promising cards that go in the same deck and do a DIFFERENT job, it
 *   led with `Does the same thing`, which is by construction the same job. And
 *   for Counterspell it led with cards beginning with A: Aether Vial, Aether
 *   Hub, Abundant Countryside, Agent's Toolkit. That group reads `deck_cards`,
 *   which holds 463 rows over 7 decks, so every companion was in exactly one
 *   deck, every count tied, and the sort did nothing. An unordered query was
 *   being drawn as a considered answer. It is gated now, on a real minimum.
 *
 *   The word matchers went with them. `Other Beasts` and `Shares Haste` were
 *   `type_line ilike '%Beast%'` and a keyword overlap, both RANKED BY MARKET
 *   PRICE, which is how a $109 Wolf Pack came to be a card like Craterhoof
 *   Behemoth. `Also tagged ramp` was the same shape and gave Cultivate a list
 *   led by Ancient Tomb and Misty Rainforest.
 *
 * WHAT IS LEFT, AND WHY EACH ONE IS ALLOWED TO SPEAK
 * -------------------------------------------------
 *   `Does the same thing`  Both cards' rules text read into a structured
 *                          record, ranked on shared effects and their
 *                          arguments. `@/lib/deck/recommend/similar`.
 *   `Combines with`        Commander Spellbook's combos. Not a correlation: a
 *                          claim that two cards do something together.
 *                          `@/lib/cards/comboPartners`.
 *   `In the same deck as`  Real decks, counted. Silent until there are enough
 *                          of them to count.
 *
 * A GROUP WITH NOTHING TO SAY SAYS NOTHING. Counterspell, Cultivate and
 * Craterhoof Behemoth are in no recorded combo, so they get no combo group at
 * all. That is the answer, not a shortfall, and widening a query until
 * something comes back is how alphabetical order ends up on a card page.
 *
 * Every filter rides an existing index: `idx_cards_tags`,
 * `cards_color_identity_idx`, `cards_unique`'s unique index on `oracle_id`,
 * `idx_meta_combo_cards_oracle` and `meta_combo_cards_pkey`. A predicate
 * outside that set is a sequential scan of 34,000 rows and times out with
 * 57014.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deep link for any card shape. Scryfall ids route directly; anything else by name. */
export function cardHref(card: any): string {
  const id = typeof card?.id === 'string' ? card.id : '';
  if (UUID.test(id)) return `/cards/${id}`;
  return `/cards/${encodeURIComponent(card?.name ?? '')}`;
}

/** Enough for a tile plus the ranking heuristic. `faces` is null for every row. */
const CARD_COLUMNS =
  'id, oracle_id, name, mana_cost, type_line, cmc, color_identity, colors, rarity, set_code, collector_number, image_uris, prices, keywords, tags, layout';

/** Same, minus the columns only the ranking needs. */
const TILE_COLUMNS =
  'id, oracle_id, name, mana_cost, type_line, cmc, color_identity, rarity, set_code, collector_number, image_uris, prices, layout';

/**
 * One retry, then give up.
 *
 * These queries all ride an index and return in ~100 ms warm, but a cold
 * buffer cache under concurrent load can still trip Postgres' statement
 * timeout (57014). That is transient, and losing a whole section of the page to
 * it is a worse outcome than one extra round trip.
 */
async function retrying<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`${label} failed, retrying once:`, err);
    await new Promise(resolve => setTimeout(resolve, 400));
    return fn();
  }
}

/**
 * How many of a card's role tags we query on.
 *
 * `signalTags` returns them rarest first and each one costs an indexed lookup,
 * so the budget is spent on the rarest — the only ones that pick out a related
 * card rather than a tenth of the table. Sol Ring has three (`fast-mana`,
 * `mana-rock`, `ramp`), Craterhoof Behemoth two (`mass-pump`, `finisher`), and
 * nothing in the catalogue needs more than four to be identified.
 */
const TAG_PROBES = 4;

/**
 * THE BEHAVIOUR GROUP TAKES THE WHOLE PROBE, NOT SIXTY ROWS OF IT.
 *
 * Postgres applies `limit 60` before anything can rank, so for Counterspell the
 * fourteen cards shown were the most expensive of an arbitrary sixty out of
 * 326, and Mana Drain, Force of Will, Pact of Negation, Dovin's Veto and
 * Negate — which carry the identical tags — were never fetched at all. Ranking
 * carefully inside an arbitrary sample is worse than not ranking.
 *
 * So the group counts the probe first and fetches all of it. Measured live on
 * 2026-08-30: Sol Ring merges 366 rows out of three probes, Counterspell 326,
 * Rhystic Study 626, Craterhoof Behemoth 133. The cost is one `count=exact`
 * head request per probe, which rides `idx_cards_tags`.
 *
 * A PROBE OVER THE CAP IS NARROWED, NOT DROPPED. Skipping the only probe skips
 * the whole group. Lightning Bolt's `targeted-removal` counts 1,149 in red, and
 * when an oversized probe was dropped the player saw nothing at all for the
 * most played card in the game. An oversized probe now takes its most-played
 * rows and the basis line says which of the two it did. That ordering is not
 * neutral and is not described as if it were: `edhrec_rank` is NULL on 19,592
 * of 33,032 `cards_unique` rows, so on a narrowed probe an unranked card cannot
 * appear.
 */
const BEHAVIOUR_PROBE_CAP = 400;

/** Ceiling across every probe together, so a card with four small tags is bounded too. */
const BEHAVIOUR_POOL_CAP = 900;

/**
 * The behaviour pass ranks on these and never draws them.
 *
 * `oracle_text` is what the record is read from and `image_uris` is the
 * heaviest column on the row, so the ranking fetch takes the first and refuses
 * the second. Tile columns are fetched afterwards, for the fourteen winners
 * only. Counterspell's probe returns 327 rows: 177 kB on these columns, against
 * 533 kB on `CARD_COLUMNS`.
 */
const RANK_COLUMNS =
  'id, oracle_id, name, mana_cost, type_line, cmc, oracle_text, keywords, tags, layout, power, toughness, prices';

export interface RelatedEntry {
  card: any;
  note?: string;
}

export interface RelatedGroup {
  key: string;
  label: string;
  /** The literal reason these cards are here. Always rendered. */
  basis: string;
  entries: RelatedEntry[];
}

/* ------------------------------------------------------------------ *
 * Card shape helpers
 * ------------------------------------------------------------------ */

/**
 * One tile per card, across every group on the page.
 *
 * Keyed on the oracle id *and* the name. Oracle id alone is not enough: our
 * `cards` table holds two distinct oracle ids named "Black Lotus" (three prints
 * between them), so an oracle-only guard rendered the same card twice in one
 * row, which reads as a broken query.
 */
function dedupeByOracle(rows: any[], seen: Set<string>): any[] {
  const out: any[] = [];
  for (const row of rows) {
    const oracle = row.oracle_id ? `id:${row.oracle_id}` : '';
    const named = row.name ? `name:${row.name}` : '';
    if (!oracle && !named) continue;
    if ((oracle && seen.has(oracle)) || (named && seen.has(named))) continue;
    if (oracle) seen.add(oracle);
    if (named) seen.add(named);
    out.push(row);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Tiles
 * ------------------------------------------------------------------ */

/* 128 was too small to read. The owner: "make the cards much bigger in size so
   they can be read". 208 is the largest that still fits a useful number of cards
   across a laptop viewport, and it is where a card's art and type line stop
   being a thumbnail. */
const TILE_WIDTH = 208;

function RelatedTile({ entry }: { entry: RelatedEntry }) {
  const { card, note } = entry;
  const price = getUsdPrice(card);

  return (
    <Link
      to={cardHref(card)}
      className="group block w-[208px] shrink-0 snap-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardImage card={card} width={TILE_WIDTH} hideFlip interactive />
      <p className="mt-1.5 truncate text-xs font-medium text-foreground" title={card.name}>
        {card.name}
      </p>
      <div className="flex items-center gap-1">
        <CardCost card={card} size="xs" />
        <span className="truncate text-[0.7rem] text-muted-foreground">
          {price != null ? formatUsd(price) : ''}
        </span>
      </div>
      <p className="truncate text-[0.7rem] text-muted-foreground/80" title={note ?? card.type_line}>
        {note ?? card.type_line}
      </p>
    </Link>
  );
}

function TileRow({ entries }: { entries: RelatedEntry[] }) {
  return (
    <CardRail>
      {entries.map(entry => (
        <RelatedTile key={entry.card.id} entry={entry} />
      ))}
    </CardRail>
  );
}

function TileRowSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <CardImageSkeleton key={i} width={TILE_WIDTH} />
      ))}
    </div>
  );
}

function GroupList({ groups }: { groups: RelatedGroup[] }) {
  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.key} className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{group.label}</h3>
          <p className="mb-2 text-xs text-muted-foreground">{group.basis}</p>
          <TileRow entries={group.entries} />
        </div>
      ))}
    </div>
  );
}

export interface CardRelatedProps {
  /** The card being displayed — Scryfall shape or a `cards` row. */
  card: any;
  /** The matching `cards` row, when one exists. Carries `tags`. */
  dbCard: any | null;
  className?: string;
}

/** The subject in the shape both the record reader and the ranker want. */
function subjectRowFor(card: any, dbCard: any | null) {
  return {
    id: card?.id ?? dbCard?.id ?? null,
    oracle_id: card?.oracle_id ?? dbCard?.oracle_id ?? null,
    name: card?.name ?? dbCard?.name ?? '',
    type_line: card?.type_line ?? dbCard?.type_line ?? '',
    oracle_text: card?.oracle_text ?? dbCard?.oracle_text ?? null,
    mana_cost: card?.mana_cost ?? dbCard?.mana_cost ?? null,
    cmc: card?.cmc ?? dbCard?.cmc ?? 0,
    power: card?.power ?? dbCard?.power ?? null,
    toughness: card?.toughness ?? dbCard?.toughness ?? null,
    layout: card?.layout ?? dbCard?.layout ?? null,
    keywords: (card?.keywords ?? dbCard?.keywords ?? []).filter(Boolean),
    tags: dbCard?.tags ?? null,
    card_faces: card?.card_faces ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Does the same thing
 * ------------------------------------------------------------------ */

/**
 * The card page's answer to "what else does this?".
 *
 * This replaced a section headed SIMILAR CARDS that matched a type line, a
 * colour identity and a mana value. Both cards are read into a structured
 * record and ranked on shared effects and their arguments, so Sol Ring's list
 * is the Moxen rather than every one-mana artifact.
 *
 * WHEN THE RECORD CANNOT SPEAK, NEITHER DOES THE SECTION. `canReadBehaviour`
 * refuses a card whose record names only a type, a subtype and a keyword,
 * because the only sentence a comparison can build from that is "also a
 * Pirate". Measured over an 8,000 card sample, that is 31.4% of the catalogue
 * on top of the 22.4% we cannot read at all. Silence there is the point.
 */
export function CardDoesTheSameThing({ card, dbCard, className }: CardRelatedProps) {
  const [group, setGroup] = useState<RelatedGroup | null>(null);
  const [readable, setReadable] = useState(true);
  const [loading, setLoading] = useState(true);

  const oracleId: string | undefined = card?.oracle_id ?? dbCard?.oracle_id;
  const name: string = card?.name ?? dbCard?.name ?? '';
  const colorIdentity: string[] = useMemo(
    () => (card?.color_identity ?? dbCard?.color_identity ?? []).map((c: string) => c.toUpperCase()),
    [card?.color_identity, dbCard?.color_identity]
  );
  /**
   * The card's role tags reduced to the ones that distinguish it, rarest
   * first. Type tags, `etb`, `evasion` and every legacy alias are gone — see
   * `@/lib/cards/tag-signal` for why each is dropped.
   */
  const tags: string[] = useMemo(() => signalTags(dbCard?.tags), [dbCard?.tags]);

  const ciKey = colorIdentity.join('');
  const tagKey = tags.join('|');

  useEffect(() => {
    if (!name) return;

    let cancelled = false;
    setLoading(true);
    setGroup(null);
    setReadable(true);

    /** Cards playable alongside this one: identity a subset of its own. */
    const withinIdentity = (q: any) =>
      colorIdentity.length > 0 ? q.containedBy('color_identity', colorIdentity) : q;

    const run = async () => {
      const seen = new Set<string>();
      if (oracleId) seen.add(`id:${oracleId}`);
      if (name) seen.add(`name:${name}`);

      try {
        const subject = subjectRowFor(card, dbCard);
        const probes = tags.slice(0, TAG_PROBES);

        /*
         * The recall is a tag probe because facets are not a column yet and
         * `tags @> {tag}` is the only indexed way to get a pool of the right
         * shape out of 34,000 rows. The tag says which conversation to look in.
         * The record says who is in it.
         *
         * The reader and the ported records are a real chunk of code, so they
         * arrive on demand rather than in the card page's first load.
         */
        const { rankBySameBehaviour, canReadBehaviour } = await import(
          '@/lib/deck/recommend/similar'
        );

        if (!canReadBehaviour(subject) || probes.length === 0) {
          if (!cancelled) {
            setReadable(canReadBehaviour(subject) && probes.length > 0);
            setLoading(false);
          }
          return;
        }

        const counts = await Promise.all(
          probes.map(tag =>
            retrying(async () => {
              let q = uniqueCards()
                .select('id', { count: 'exact', head: true })
                .contains('tags', [tag]);
              q = withinIdentity(q);
              if (oracleId) q = q.neq('oracle_id', oracleId);
              const res = await q;
              if (res.error) throw res.error;
              return res.count ?? null;
            }, `Same thing (count ${tag})`).catch(() => null)
          )
        );

        const usable = probes
          .map((tag, i) => ({
            tag,
            n: counts[i],
            narrowed: (counts[i] ?? 0) > BEHAVIOUR_PROBE_CAP,
          }))
          .filter(p => p.n != null && p.n > 0);

        const batches = await Promise.all(
          usable.map(p =>
            retrying(async () => {
              let q = uniqueCards().select(RANK_COLUMNS).contains('tags', [p.tag]);
              // A probe over the cap takes its most-played rows rather than its
              // first arbitrary ones. See `BEHAVIOUR_PROBE_CAP`.
              if (p.narrowed) q = q.order('edhrec_rank', { ascending: true, nullsFirst: false });
              q = q.limit(BEHAVIOUR_PROBE_CAP);
              q = withinIdentity(q);
              if (oracleId) q = q.neq('oracle_id', oracleId);
              const res = await q;
              if (res.error) throw res.error;
              return res.data ?? [];
            }, `Same thing (probe ${p.tag})`).catch(err => {
              console.error(`Probe "${p.tag}" failed:`, err);
              return [] as any[];
            })
          )
        );

        const pool = new Map<string, any>();
        for (const rows of batches) {
          for (const row of rows) {
            if (pool.size >= BEHAVIOUR_POOL_CAP) break;
            pool.set(row.id, row);
          }
        }

        const result = rankBySameBehaviour(subject, Array.from(pool.values()), {
          limit: 14,
          exclude: seen,
          priceOf: getUsdPrice,
        });

        if (result.entries.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }

        /*
         * The ranking columns carry no art. One more read, for the fourteen
         * that survived, rather than pulling `image_uris` for every row in a
         * 326-row pool.
         */
        const ids = result.entries.map(e => e.card.id).filter(Boolean);
        const { data: tiles } = await supabase
          .from('cards')
          .select(`${CARD_COLUMNS}, legalities`)
          .in('id', ids);
        const byId = new Map((tiles ?? []).map(t => [t.id, t]));

        /*
         * SAY IT IF IT IS BANNED, and do not quietly filter it out.
         *
         * The cards that most exactly do what Sol Ring does are the Moxen, and
         * 8 of its 14 are banned in Commander. A filter would be a format
         * decision on a page that is not format scoped, so the tile states the
         * fact instead and the player decides. It costs one extra column on a
         * fourteen row read.
         */
        const entries = result.entries
          .map(e => {
            const tile = byId.get(e.card.id) ?? e.card;
            const banned = (tile as any)?.legalities?.commander === 'banned';
            return { card: tile, note: banned ? `${e.note} · banned in Commander` : e.note };
          })
          .filter(e => e.card);
        const ordered = dedupeByOracle(entries.map(e => e.card), seen);
        const noteFor = new Map(entries.map(e => [e.card.id, e.note]));

        if (ordered.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }

        const probeText = usable
          .map(p =>
            p.narrowed
              ? `${p.tag} (${p.n} cards, the ${BEHAVIOUR_PROBE_CAP} most played of them)`
              : `${p.tag} (${p.n} cards, all of them)`
          )
          .join(', ');

        /*
         * EVERY ENTRY CAME FROM TAGS, SO THE HEADING CHANGES.
         *
         * Craterhoof Behemoth is the case. Its record is partial because the
         * reader refuses "creatures you control get +X/+X", which is the whole
         * card, so no candidate can share an effect with it and all fourteen
         * fall to the tag tier. The list that comes back is good — Kamahl,
         * Heart of Krosa, End-Raze Forerunners, Vitalizing Wind, Overwhelm,
         * Pathbreaker Ibex — and it is not a list of cards we have read. Saying
         * "does the same thing" over it would be the same lie in a quieter
         * voice, so the group says what it actually did.
         */
        const byRecord = result.census.byRecord > 0;

        const basis = byRecord
          ? `Both cards' rules text read into a record of what they do, then ranked by shared effects and ` +
            `their arguments rather than by shared words. ${name} ${result.subject.reads}. ` +
            `Candidates came from cards tagged ${probeText}, and ${result.census.pool} of them were scored. ` +
            `${result.census.byRecord} of the ${result.entries.length} shown were settled by a record` +
            `${result.census.byTags > 0 ? `, ${result.census.byTags} by role tags because we hold no record for them` : ''}.`
          : `We cannot read all of ${name} yet, so nothing in the catalogue could be matched to it on what it ` +
            `does. These carry the same roles we record for it. Candidates came from cards tagged ${probeText}, ` +
            `and ${result.census.pool} of them were ranked by how rare the shared roles are. A role cannot tell ` +
            `two cards that share it apart, so read this as a starting point rather than an answer.`;

        if (!cancelled) {
          setGroup({
            key: 'behaviour',
            label: byRecord ? 'Does the same thing' : 'Fills the same role',
            basis,
            entries: ordered.map(c => ({ card: c, note: noteFor.get(c.id) })),
          });
          setLoading(false);
        }
      } catch (err) {
        console.error('Card page "does the same thing" failed:', err);
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleId, name, ciKey, tagKey]);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <div className="mb-1 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {group?.label ?? 'Does the same thing'}
        </h2>
      </div>

      {loading ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Reading what {name} does and looking for cards that do it too.
          </p>
          <TileRowSkeleton />
        </>
      ) : group ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{group.basis}</p>
          <TileRow entries={group.entries} />
        </>
      ) : (
        /* Naming what we could not read is more use than a padded row, and a
           padded row would be the fabrication design law item 7 forbids. */
        <div className="rounded-lg bg-muted/20 px-4 py-4 text-sm">
          <p className="text-foreground">
            {readable
              ? `Nothing in ${name}'s colours does what it does.`
              : `We cannot read what ${name} does yet.`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {readable
              ? 'Every card carrying its roles was read and compared, and none of them matched on what actually happens.'
              : "We turn a card's rules text into a record of what it does, and this one is still beyond us. Rather than show cards that merely share a type line or a keyword, we are showing none."}
          </p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Works well with
 * ------------------------------------------------------------------ */

/**
 * How many combos we look at before ranking.
 *
 * The database does the ordering, through the foreign key from
 * `meta_combo_cards` to `meta_combos`, so this is a cap on a SORTED result and
 * not a sample of an unsorted one. That distinction is the whole of rule four:
 * measured on 2026-08-30 one card is in 3,897 combos and 314 cards are in more
 * than 120, so a client side `limit` on an unordered read would be picking
 * arbitrary rows and drawing them as recommendations.
 */
const COMBO_FETCH = 60;

/**
 * Decks before "played alongside" is evidence rather than coincidence.
 *
 * `deck_cards` holds 463 rows over 7 decks. Every companion of Counterspell was
 * in exactly one of them, so every count tied at 1 and the sort was a no-op:
 * the page drew whatever order Postgres returned, which was alphabetical, under
 * a heading that reads as a recommendation. Requiring a companion to appear in
 * at least two of the decks that also run this card means the count is
 * ORDERING something. With the corpus this size the group will almost never
 * draw, and that is correct. It starts working when there are real decks.
 */
const MIN_SHARED_DECKS = 2;

export function CardWorksWellWith({ card, dbCard, className }: CardRelatedProps) {
  const [groups, setGroups] = useState<RelatedGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const oracleId: string | undefined = card?.oracle_id ?? dbCard?.oracle_id;
  const name: string = card?.name ?? dbCard?.name ?? '';

  useEffect(() => {
    if (!name) return;

    let cancelled = false;
    setLoading(true);
    setGroups([]);

    const run = async () => {
      const seen = new Set<string>();
      if (oracleId) seen.add(`id:${oracleId}`);
      if (name) seen.add(`name:${name}`);
      const built: RelatedGroup[] = [];

      const publish = () => {
        if (cancelled) return;
        const order = ['combos', 'decks'];
        setGroups([...built].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)));
        if (built.length > 0) setLoading(false);
      };

      /* --- 1. Combos. The only source that names a complement outright. --- */
      try {
        if (oracleId) {
          /*
           * One read, ordered by the database. Smallest combo first and then
           * how many decks run it, so Sol Ring's two card line with Hullbreaker
           * Horror comes above its more famous three card line with Displacer
           * Kitten. `meta_combos.card_count` filters in the join, so a five
           * card loop never reaches the client.
           */
          const rows = await retrying(async () => {
            const res = await (supabase as any)
              .from('meta_combo_cards')
              .select('combo_id, meta_combos!inner(id, card_count, popularity, produces)')
              .eq('oracle_id', oracleId)
              .lte('meta_combos.card_count', MAX_COMBO_PIECES)
              /*
               * `order=meta_combos(card_count)`, which orders the PARENT rows
               * by a column of the embedded one. Not `{ referencedTable }`,
               * which builds `meta_combos.order=` and orders the rows INSIDE
               * each embed. For a to-one embed that is a no-op, it returns 200,
               * and the only way to notice is to read the result: measured on
               * 2026-08-30 it put Sol Ring's three card line with Displacer
               * Kitten above its two card line with Hullbreaker Horror, which
               * is `limit` over an unsorted set drawn as a recommendation.
               */
              .order('meta_combos(card_count)', { ascending: true })
              .order('meta_combos(popularity)', { ascending: false, nullsFirst: false })
              .limit(COMBO_FETCH);
            if (res.error) throw res.error;
            return (res.data ?? []) as { combo_id: string; meta_combos: ComboRow | null }[];
          }, 'Combos (for this card)').catch(err => {
            console.error('Combo lookup failed:', err);
            return [] as { combo_id: string; meta_combos: ComboRow | null }[];
          });

          const combos: ComboRow[] = rows
            .map(r => r.meta_combos)
            .filter((c): c is ComboRow => !!c && !!c.id);

          if (combos.length > 0) {
            const members = await retrying(async () => {
              const res = await (supabase as any)
                .from('meta_combo_cards')
                .select('combo_id, oracle_id, card_name')
                .in('combo_id', combos.map(c => c.id));
              if (res.error) throw res.error;
              return (res.data ?? []) as ComboMemberRow[];
            }, 'Combos (partners)').catch(err => {
              console.error('Combo partner lookup failed:', err);
              return [] as ComboMemberRow[];
            });

            const partners = rankComboPartners(oracleId, combos, members, 14);

            if (partners.length > 0) {
              const { data: tiles } = await uniqueCards()
                .select(TILE_COLUMNS)
                .in('oracle_id', partners.map(p => p.oracleId));

              const tileFor = new Map((tiles ?? []).map((t: any) => [t.oracle_id, t]));
              const entries = partners
                .map(p => ({ card: tileFor.get(p.oracleId), note: comboNote(p) }))
                .filter(e => e.card);
              const ordered = dedupeByOracle(entries.map(e => e.card), seen);
              const noteFor = new Map(entries.map(e => [e.card.id, e.note]));

              if (ordered.length > 0) {
                built.push({
                  key: 'combos',
                  label: 'Combines with',
                  basis: `${comboBasis(name, ordered.length, combos.length)} ${COMBO_ATTRIBUTION}.`,
                  entries: ordered.map(c => ({ card: c, note: noteFor.get(c.id) })),
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Synergy group "combines with" failed:', err);
      }

      publish();

      /* --- 2. Real decks, counted, and silent until the count means something. --- */
      try {
        if (oracleId) {
          // Printings, deliberately: a deck holds a specific printing, so
          // finding decks that contain this card means matching ANY of its
          // printings, not just the one representing it.
          const { data: prints } = await cardPrintings()
            .select('id')
            .eq('oracle_id', oracleId)
            .limit(60);

          const selfIds = new Set((prints ?? []).map(p => p.id));

          if (selfIds.size > 0) {
            const { data: hits } = await supabase
              .from('deck_cards')
              .select('deck_id')
              .in('card_id', Array.from(selfIds))
              .limit(200);

            const deckIds = Array.from(new Set((hits ?? []).map(h => h.deck_id)));

            if (deckIds.length >= MIN_SHARED_DECKS) {
              const { data: companions } = await supabase
                .from('deck_cards')
                .select('card_id')
                .in('deck_id', deckIds)
                .limit(1500);

              const counts = new Map<string, number>();
              for (const row of companions ?? []) {
                if (!row.card_id || selfIds.has(row.card_id)) continue;
                counts.set(row.card_id, (counts.get(row.card_id) ?? 0) + 1);
              }

              const top = Array.from(counts.entries())
                .filter(([, n]) => n >= MIN_SHARED_DECKS)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 14)
                .map(([id]) => id);

              if (top.length > 0) {
                const { data: rows } = await supabase
                  .from('cards')
                  .select(CARD_COLUMNS)
                  .in('id', top);

                const ordered = dedupeByOracle(
                  (rows ?? []).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)),
                  seen
                );

                if (ordered.length > 0) {
                  built.push({
                    key: 'decks',
                    label: 'In the same deck as',
                    basis:
                      `Counted from the ${deckIds.length} decks you can see that run ${name}. ` +
                      `Only cards in at least ${MIN_SHARED_DECKS} of them are shown, so the count is ` +
                      `putting them in order rather than tying.`,
                    entries: ordered.map(row => ({
                      card: row,
                      note: `In ${counts.get(row.id)} of those decks`,
                    })),
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        /* A missing synergy group is not worth failing the page over. */
        console.error('Synergy group "in the same deck as" failed:', err);
      }

      publish();
      // `publish` only clears the skeleton when it has something to draw, so a
      // card with no signal at all still needs this to reach its empty state.
      if (!cancelled) setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleId, name]);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Works well with
        </h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Cards that go in the same deck and do a different job. Every group says where it came from,
        and a group with nothing to say is not shown.
      </p>

      {loading ? (
        <TileRowSkeleton />
      ) : groups.length === 0 ? (
        <div className="rounded-lg bg-muted/20 px-4 py-4 text-sm">
          <p className="text-foreground">Nothing we can point to for {name}.</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              Combos. No published combo uses it, or every one it appears in takes more than{' '}
              {MAX_COMBO_PIECES} cards to assemble.
            </li>
            <li>
              Decks. Fewer than {MIN_SHARED_DECKS} decks you can see run it. Sign in, or make a deck
              containing it public.
            </li>
          </ul>
        </div>
      ) : (
        <GroupList groups={groups} />
      )}
    </section>
  );
}
