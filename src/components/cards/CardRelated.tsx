import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { uniqueCards, cardPrintings } from '@/lib/cards/cardQuery';
import { cn } from '@/lib/utils';
import { CardImage, CardImageSkeleton } from './CardImage';
import { CardRail } from './CardRail';
import { CardCost } from './CardCost';
import { getUsdPrice, formatUsd } from '@/lib/scryfall/card-utils';
import { sharedTagScore, sharedTags, signalTags } from '@/lib/cards/tag-signal';
import { Layers3, Sparkles } from 'lucide-react';

/**
 * "Works well with" and "Similar cards" — both derived from data we actually hold.
 *
 * There is no recommendation engine behind this page and it does not pretend
 * there is. Every group states the query that produced it: cards that sit in
 * the same decks in `deck_cards`, cards that share a creature type, cards that
 * share a keyword, cards that carry the same tag. A player can disagree with a
 * suggestion, but they can always see *why* it was made.
 *
 * The role-tag group ranks by how *rare* the shared tags are, not how many
 * there are — see `@/lib/cards/tag-signal`. Counting raw overlap gave Sol Ring
 * a list containing Flooded Strand, Soldevi Excavations and Elvish Harbinger,
 * with Mana Crypt and Mana Vault absent altogether: every one of the 2,140
 * cards tagged `ramp` was as good a match as another fast rock. It now leads
 * with Mana Vault, Mana Crypt and Sol Talisman.
 *
 * Every filter here rides an existing index — `cards_type_line_trgm_idx`,
 * `cards_keywords_idx`, `idx_cards_tags`, `cards_color_identity_idx`,
 * `cards_cmc_idx`. A predicate outside that set is a sequential scan of 34,000
 * rows and times out with 57014.
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

/** Same, minus the columns only the synergy groups need — `image_uris` is heavy. */
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

/** Rows pulled per probe tag before ranking. */
const PER_TAG_LIMIT = 60;

/** Races generic enough that "shares the Human type" tells a player nothing. */
const GENERIC_SUBTYPES = new Set(['Human']);

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

/** `Legendary Creature — Goblin Warrior` → `['Goblin', 'Warrior']`. */
function subtypesOf(typeLine: string): string[] {
  const dash = typeLine.split(/[—–-]/);
  if (dash.length < 2) return [];
  return dash[dash.length - 1]
    .split('//')[0]
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** The headline card type, which is what "similar" is anchored on. */
function primaryTypeOf(typeLine: string): string | null {
  const front = typeLine.split(/[—–-]/)[0];
  for (const t of [
    'Creature',
    'Planeswalker',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Battle',
    'Land',
  ]) {
    if (front.includes(t)) return t;
  }
  return null;
}

/** Shared traits first, then market price — stated in the UI, not implied. */
function rank(rows: any[], shared: (row: any) => number): any[] {
  return [...rows].sort((a, b) => {
    const d = shared(b) - shared(a);
    if (d !== 0) return d;
    return (getUsdPrice(b) ?? 0) - (getUsdPrice(a) ?? 0);
  });
}

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
      <p className="truncate text-[0.7rem] text-muted-foreground/80" title={card.type_line}>
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

/* ------------------------------------------------------------------ *
 * Works well with
 * ------------------------------------------------------------------ */

export interface CardRelatedProps {
  /** The card being displayed — Scryfall shape or a `cards` row. */
  card: any;
  /** The matching `cards` row, when one exists. Carries `tags`. */
  dbCard: any | null;
  className?: string;
}

export function CardWorksWellWith({ card, dbCard, className }: CardRelatedProps) {
  const [groups, setGroups] = useState<RelatedGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const oracleId: string | undefined = card?.oracle_id ?? dbCard?.oracle_id;
  const name: string = card?.name ?? '';
  const typeLine: string = card?.type_line ?? dbCard?.type_line ?? '';
  const colorIdentity: string[] = useMemo(
    () => (card?.color_identity ?? dbCard?.color_identity ?? []).map((c: string) => c.toUpperCase()),
    [card?.color_identity, dbCard?.color_identity]
  );
  const keywords: string[] = useMemo(
    () => (card?.keywords ?? dbCard?.keywords ?? []).filter(Boolean),
    [card?.keywords, dbCard?.keywords]
  );
  /**
   * The card's role tags reduced to the ones that distinguish it, rarest
   * first. Type tags, `etb`, `evasion` and every legacy alias are gone — see
   * `@/lib/cards/tag-signal` for why each is dropped.
   */
  const tags: string[] = useMemo(() => signalTags(dbCard?.tags), [dbCard?.tags]);

  const ciKey = colorIdentity.join('');
  const kwKey = keywords.join('|');
  const tagKey = tags.join('|');

  useEffect(() => {
    if (!name) return;

    let cancelled = false;
    setLoading(true);
    setGroups([]);

    /** Cards playable alongside this one: identity a subset of its own. */
    const withinIdentity = (q: any) =>
      colorIdentity.length > 0 ? q.containedBy('color_identity', colorIdentity) : q;

    const run = async () => {
      const seen = new Set<string>();
      if (oracleId) seen.add(`id:${oracleId}`);
      if (name) seen.add(`name:${name}`);
      const built: RelatedGroup[] = [];

      /* --- 1. Real decks. The only group that is evidence, not similarity. --- */
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

            if (deckIds.length > 0) {
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
                .sort((a, b) => b[1] - a[1])
                .slice(0, 14)
                .map(([id]) => id);

              if (top.length > 0) {
                const { data: rows } = await supabase
                  .from('cards')
                  .select(CARD_COLUMNS)
                  .in('id', top);

                const ordered = dedupeByOracle(
                  (rows ?? []).sort(
                    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
                  ),
                  seen
                );

                if (ordered.length > 0) {
                  built.push({
                    key: 'decks',
                    label: 'Played alongside',
                    basis: `Read from deck_cards: these appear in the ${deckIds.length} deck${
                      deckIds.length === 1 ? '' : 's'
                    } you can see that also run ${name}.`,
                    entries: ordered.map(row => ({
                      card: row,
                      note: `In ${counts.get(row.id)} of those deck${
                        counts.get(row.id) === 1 ? '' : 's'
                      }`,
                    })),
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        /* A missing synergy group is not worth failing the page over. */
        console.error('Synergy group "played alongside" failed:', err);
      }

      /* --- 2. Shares a creature / permanent subtype (trigram on type_line). --- */
      try {
        const subtype = subtypesOf(typeLine).find(s => !GENERIC_SUBTYPES.has(s));
        if (subtype && subtype.length > 2) {
          // A related-cards row is a card, not a printing. The limit is applied
          // by the database, so searching printings would spend all forty slots
          // on a few heavily reprinted cards.
          let q = uniqueCards()
            .select(CARD_COLUMNS)
            .ilike('type_line', `%${subtype}%`)
            .limit(40);
          q = withinIdentity(q);
          if (oracleId) q = q.neq('oracle_id', oracleId);

          const { data, error } = await retrying(async () => {
            const res = await q;
            if (res.error) throw res.error;
            return res;
          }, 'Synergy (subtype)');
          if (error) throw error;
          const ordered = dedupeByOracle(rank(data ?? [], () => 0), seen).slice(0, 14);

          if (ordered.length > 0) {
            built.push({
              key: 'subtype',
              label: `Other ${subtype}s`,
              basis: `Type line contains "${subtype}"${
                colorIdentity.length
                  ? ` and colour identity fits inside ${colorIdentity.join('')}`
                  : ''
              }. Ranked by market price.`,
              entries: ordered.map(card => ({ card })),
            });
          }
        }
      } catch (err) {
        console.error('Synergy group "subtype" failed:', err);
      }

      /* --- 3. Shares a keyword (GIN overlap on keywords). --- */
      try {
        if (keywords.length > 0) {
          let q = uniqueCards()
            .select(CARD_COLUMNS)
            .overlaps('keywords', keywords)
            .limit(40);
          q = withinIdentity(q);
          if (oracleId) q = q.neq('oracle_id', oracleId);

          const { data, error } = await retrying(async () => {
            const res = await q;
            if (res.error) throw res.error;
            return res;
          }, 'Synergy (keyword overlap)');
          if (error) throw error;
          const sharedCount = (row: any) =>
            (row.keywords ?? []).filter((k: string) => keywords.includes(k)).length;
          const ordered = dedupeByOracle(rank(data ?? [], sharedCount), seen).slice(0, 14);

          if (ordered.length > 0) {
            built.push({
              key: 'keywords',
              label: `Shares ${keywords.slice(0, 3).join(', ')}`,
              basis: `Keyword overlap with ${keywords.join(', ')}${
                colorIdentity.length
                  ? `, colour identity inside ${colorIdentity.join('')}`
                  : ''
              }. Ranked by keywords in common, then market price.`,
              entries: ordered.map(card => ({
                card,
                note: `${sharedCount(card)} keyword${sharedCount(card) === 1 ? '' : 's'} shared`,
              })),
            });
          }
        }
      } catch (err) {
        console.error('Synergy group "keywords" failed:', err);
      }

      /* --- 4. Shares a role tag, weighted by how rare that tag is. ---
       *
       * One indexed `tags @> {tag}` per probe tag instead of a single
       * `tags && {everything}`. The single overlap query was the real problem:
       * Postgres applies `limit 40` before anything can rank, so Sol Ring's
       * list was 40 arbitrary rows out of the 2,140 cards tagged `ramp` — one
       * of them a fetchland — and `fast-mana`, which only 38 cards in the whole
       * catalogue carry, never got a look in. Probing the rarest tags
       * separately guarantees the rare ones are represented, and the merged set
       * is then ranked by summed tag rarity.
       */
      try {
        const probes = tags.slice(0, TAG_PROBES);
        if (probes.length > 0) {
          const batches = await Promise.all(
            probes.map(tag =>
              retrying(async () => {
                let q = uniqueCards()
                  .select(CARD_COLUMNS)
                  .contains('tags', [tag])
                  .limit(PER_TAG_LIMIT);
                q = withinIdentity(q);
                if (oracleId) q = q.neq('oracle_id', oracleId);
                const res = await q;
                if (res.error) throw res.error;
                return res.data ?? [];
              }, `Synergy (tag ${tag})`).catch(err => {
                /* One dead probe should not cost the other three. */
                console.error(`Synergy probe "${tag}" failed:`, err);
                return [] as any[];
              })
            )
          );

          const byId = new Map<string, any>();
          for (const rows of batches) for (const row of rows) byId.set(row.id, row);

          const score = (row: any) => sharedTagScore(tags, row.tags);
          const ordered = dedupeByOracle(rank(Array.from(byId.values()), score), seen).slice(0, 14);

          if (ordered.length > 0) {
            built.push({
              key: 'tags',
              label: `Also tagged ${probes.slice(0, 2).join(', ')}`,
              basis: `Our card table tags this ${tags.join(', ')}. Searched on the ${
                probes.length === 1 ? 'rarest of those' : `${probes.length} rarest of those`
              }, then ranked by how rare the shared tags are — a card matching ${
                probes[0]
              } counts for more than one matching a tag half the catalogue carries.`,
              entries: ordered.map(card => {
                const hits = sharedTags(tags, card.tags);
                return { card, note: hits.length > 0 ? hits.slice(0, 3).join(', ') : undefined };
              }),
            });
          }
        }
      } catch (err) {
        console.error('Synergy group "tags" failed:', err);
      }

      if (!cancelled) {
        setGroups(built);
        setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleId, name, typeLine, ciKey, kwKey, tagKey]);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Works well with
        </h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Grouped by the signal that produced them. DeckMatrix has no recommendation model — every
        group below is a query against real card and deck data, and says which one.
      </p>

      {loading ? (
        <TileRowSkeleton />
      ) : groups.length === 0 ? (
        /* Naming the four signals and which of them this card lacks is more use
           than a padded row — and a padded row would be the fabrication design
           law item 7 forbids. */
        <div className="rounded-lg bg-muted/20 px-4 py-4 text-sm">
          <p className="text-foreground">No honest synergy signal for {name} yet.</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              Decks — no deck you can see runs it. Sign in, or make a deck containing it public.
            </li>
            <li>
              Keywords —{' '}
              {keywords.length > 0
                ? `has ${keywords.join(', ')}, but nothing in its colour identity shares them`
                : 'this card has none'}
              .
            </li>
            <li>
              Creature or permanent type —{' '}
              {subtypesOf(typeLine).length > 0
                ? `${subtypesOf(typeLine).join(' ')}, with no matches inside its identity`
                : 'this card has no subtype'}
              .
            </li>
            <li>
              Role tags —{' '}
              {tags.length > 0
                ? `${tags.join(', ')}, with no matches inside its colour identity`
                : 'our card table records only its card type and the traits half the catalogue shares, neither of which says anything about how it plays'}
              .
            </li>
          </ul>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.key} className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">{group.label}</h3>
              <p className="mb-2 text-xs text-muted-foreground">{group.basis}</p>
              <TileRow entries={group.entries} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Similar cards
 * ------------------------------------------------------------------ */

export function CardSimilar({ card, dbCard, className }: CardRelatedProps) {
  const [entries, setEntries] = useState<RelatedEntry[]>([]);
  const [widened, setWidened] = useState(false);
  const [loading, setLoading] = useState(true);

  const oracleId: string | undefined = card?.oracle_id ?? dbCard?.oracle_id;
  const name: string = card?.name ?? dbCard?.name ?? '';
  const typeLine: string = card?.type_line ?? dbCard?.type_line ?? '';
  const cmc: number = Number(card?.cmc ?? dbCard?.cmc ?? 0);
  const colorIdentity: string[] = useMemo(
    () => (card?.color_identity ?? dbCard?.color_identity ?? []).map((c: string) => c.toUpperCase()),
    [card?.color_identity, dbCard?.color_identity]
  );

  const primary = primaryTypeOf(typeLine);
  const ciKey = colorIdentity.join('');

  useEffect(() => {
    if (!primary) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      /** `exact` matches the colour identity outright; otherwise anything inside it. */
      const fetchBatch = async (exact: boolean) => {
        let q = uniqueCards()
          .select(TILE_COLUMNS)
          // Trigram index on type_line — the only way to filter type without a seq scan.
          .ilike('type_line', `%${primary}%`)
          .gte('cmc', Math.max(0, cmc - 1))
          .lte('cmc', cmc + 1)
          .limit(60);

        // Both `@>` and `<@` ride cards_color_identity_idx.
        if (colorIdentity.length > 0) {
          q = exact
            ? q.contains('color_identity', colorIdentity).containedBy('color_identity', colorIdentity)
            : q.containedBy('color_identity', colorIdentity);
        } else {
          q = q.containedBy('color_identity', []);
        }
        if (oracleId) q = q.neq('oracle_id', oracleId);

        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
      };

      const byCloseness = (a: any, b: any) => {
        const d = Math.abs(Number(a.cmc ?? 0) - cmc) - Math.abs(Number(b.cmc ?? 0) - cmc);
        if (d !== 0) return d;
        return (getUsdPrice(b) ?? 0) - (getUsdPrice(a) ?? 0);
      };

      const seen = new Set<string>();
      if (oracleId) seen.add(`id:${oracleId}`);
      if (name) seen.add(`name:${name}`);

      // Each pass fails on its own. Wrapping both in one try meant a transient
      // 500 on the widening query threw away the exact matches that had already
      // come back, and the section rendered "no similar cards" for a card that
      // demonstrably had some.
      let exact: any[] = [];
      try {
        const rows = await retrying(() => fetchBatch(true), 'Similar cards (exact identity)');
        exact = dedupeByOracle([...rows].sort(byCloseness), seen);
      } catch (err) {
        console.error('Similar cards (exact identity) failed:', err);
      }

      /**
       * A four-colour commander has almost no exact-identity peers, and a row
       * of one card reads as a broken query rather than a true answer. When the
       * exact set is thin it is topped up with cards that merely *fit inside*
       * the identity — still legal in the same deck — and the heading says so.
       */
      let list = exact;
      let didWiden = false;
      if (exact.length < 8 && colorIdentity.length > 0) {
        try {
          const rows = await retrying(() => fetchBatch(false), 'Similar cards (inside identity)');
          const wider = dedupeByOracle([...rows].sort(byCloseness), seen);
          if (wider.length > 0) {
            list = [...exact, ...wider];
            didWiden = true;
          }
        } catch (err) {
          console.error('Similar cards (inside identity) failed:', err);
        }
      }

      if (!cancelled) {
        setEntries(list.slice(0, 18).map(c => ({ card: c })));
        setWidened(didWiden);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleId, primary, cmc, ciKey]);

  return (
    <section className={cn('min-w-0 rounded-xl bg-card p-4 shadow-lg shadow-black/20', className)}>
      <div className="mb-1 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Similar cards
        </h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {primary ? (
          <>
            Same card type ({primary}), the same colour identity
            {colorIdentity.length ? ` (${colorIdentity.join('')})` : ' (colourless)'}, and a mana
            value within one of {cmc}. Closest mana value first.
            {widened && (
              <>
                {' '}
                Too few cards share that identity exactly, so the row continues with cards that fit
                inside {colorIdentity.join('')}.
              </>
            )}
          </>
        ) : (
          'This card has no recognisable primary type, so there is nothing to compare it against.'
        )}
      </p>

      {loading ? (
        <TileRowSkeleton />
      ) : entries.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No other card in our database matches that type, colour identity and mana value.
        </p>
      ) : (
        <TileRow entries={entries} />
      )}
    </section>
  );
}
