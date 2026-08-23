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
 * "SIMILAR" MEANS DOES A SIMILAR THING
 * -----------------------------------
 * The owner, 2026-08-23: *"looks great, but results dont seem right"*. Measured
 * in `docs/design/ENGINE-PICKS.md`, 22 of the 70 entries this page produced for
 * Sol Ring, Craterhoof Behemoth and Counterspell were genuinely similar cards.
 * Every group matched a WORD, and the tag group was the worst of them: for
 * Counterspell all 60 fetched rows scored an identical 6.32, so the fourteen
 * shown were simply the most expensive sixty-first of the pool, and the list
 * contained Frost Titan and Declaration of Naught while containing no
 * counterspell anyone plays.
 *
 * `Does the same thing` replaces that group wherever the engine can read the
 * card. It compiles both cards' oracle text into the structured ability record
 * (`@/lib/deck/recommend/similar`, over `src/lib/cards/abilities` and the
 * ported XMage records) and ranks by shared EFFECTS AND THEIR ARGUMENTS. Sol
 * Ring's record is `add-mana`, two at a time, for no activation cost; a Dimir
 * Signet's is the same three facts except the cost, and that one difference is
 * why one is on the list and ten Signets are not. The tag group stays, and runs
 * for a card the compiler cannot read at all.
 *
 * The role-tag group ranks by how *rare* the shared tags are, not how many
 * there are — see `@/lib/cards/tag-signal`. Counting raw overlap gave Sol Ring
 * a list containing Flooded Strand, Soldevi Excavations and Elvish Harbinger,
 * with Mana Crypt and Mana Vault absent altogether: every one of the 2,140
 * cards tagged `ramp` was as good a match as another fast rock.
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

/**
 * THE BEHAVIOUR GROUP TAKES THE WHOLE PROBE, NOT SIXTY ROWS OF IT.
 *
 * `PER_TAG_LIMIT` above is the bug the owner saw and not a budget. Postgres
 * applies `limit 60` before anything can rank, so for Counterspell the fourteen
 * cards shown were the most expensive of an arbitrary sixty out of 326, and
 * Mana Drain, Force of Will, Pact of Negation, Dovin's Veto and Negate — which
 * carry the identical tags — were never fetched at all. Ranking carefully
 * inside an arbitrary sample is worse than not ranking.
 *
 * So the behaviour group counts the probe first and fetches all of it, or skips
 * the probe and says it skipped it. Measured live on 2026-08-23: Sol Ring pulls
 * 341 rows across two probes and skips `ramp` at 1,968; Craterhoof pulls 133;
 * Counterspell pulls 326. The cost is one `count=exact` head request per probe,
 * which rides `idx_cards_tags` and answered in 38 to 568 ms.
 */
const BEHAVIOUR_PROBE_CAP = 400;

/** Ceiling across every probe together, so a card with four small tags is bounded too. */
const BEHAVIOUR_POOL_CAP = 900;

/**
 * The behaviour pass ranks on these and never draws them.
 *
 * `oracle_text` is what the ability compiler reads and `image_uris` is the
 * heaviest column on the row, so the ranking fetch takes the first and refuses
 * the second. Tile columns are fetched afterwards, for the fourteen winners
 * only. Measured on the live catalogue, Counterspell's 326-row ranking fetch is
 * 208 kB against the 641 kB the same rows would cost with `image_uris`.
 */
const RANK_COLUMNS =
  'id, oracle_id, name, mana_cost, type_line, cmc, oracle_text, keywords, tags, layout, power, toughness, prices';

/** Races generic enough that "shares the Human type" tells a player nothing. */
const GENERIC_SUBTYPES = new Set(['Human']);

/**
 * The subject's own record, in the group heading, in the card's own terms.
 *
 * A player has to be able to see what the ranking read before they can disagree
 * with it. Sol Ring reads "adds mana, costs nothing to use, 2 mana at a time",
 * and every card under it either matches that or does not.
 */
function describeSubject(facets: readonly string[]): string {
  const phrases: string[] = [];
  for (const f of facets) {
    if (f.startsWith('eff:')) phrases.push(f.slice(4).replace(/-/g, ' '));
    else if (f === 'scope:all') phrases.push('everything at once');
    else if (f.startsWith('cares:type:')) phrases.push(`${f.slice('cares:type:'.length)}s`);
    else if (f.startsWith('mana:')) phrases.push(`${f.slice(5)} mana at a time`);
    else if (f === 'acost:0') phrases.push('for no activation cost');
    if (phrases.length >= 4) break;
  }
  return phrases.length > 0 ? phrases.join(', ') : 'only its type line';
}

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

      /* --- 4. Does the same thing. Read from both cards' ability records. ---
       *
       * The recall is still a tag probe, because facets are not a column yet
       * and `tags @> {tag}` is the only indexed way to get a pool of the right
       * shape out of 34,000 rows. Two things are different and both of them
       * matter:
       *
       *   THE WHOLE PROBE COMES BACK. Counted first, fetched entire, or skipped
       *   and named. `BEHAVIOUR_PROBE_CAP` says why.
       *
       *   THE TAG DOES NOT DECIDE THE ORDER. Every row is compiled into its
       *   ability record and ranked on shared effects and their arguments. The
       *   tag says which conversation to look in; the record says who is in it.
       *
       * The compiler and the ported records are a real chunk of code, so they
       * arrive on demand rather than in the card page's first load.
       */
      let behaviourRendered = false;
      try {
        const probes = tags.slice(0, TAG_PROBES);
        const subjectRow = {
          id: card?.id ?? dbCard?.id ?? null,
          oracle_id: oracleId ?? null,
          name,
          type_line: typeLine,
          oracle_text: card?.oracle_text ?? dbCard?.oracle_text ?? null,
          mana_cost: card?.mana_cost ?? dbCard?.mana_cost ?? null,
          cmc: card?.cmc ?? dbCard?.cmc ?? 0,
          power: card?.power ?? dbCard?.power ?? null,
          toughness: card?.toughness ?? dbCard?.toughness ?? null,
          layout: card?.layout ?? dbCard?.layout ?? null,
          keywords,
          tags: dbCard?.tags ?? null,
          card_faces: card?.card_faces ?? null,
        };

        if (probes.length > 0) {
          const { rankBySameBehaviour, canReadBehaviour } = await import(
            '@/lib/deck/recommend/similar'
          );

          /*
           * A card the compiler produced nothing for has no behaviour to rank
           * on, and dressing its tag list up as a behaviour list would be the
           * exact dishonesty this change is undoing. Rite of Flame is the case:
           * `coverage: 'manual'`, no abilities, one facet off the type line. The
           * old tag group below runs for it instead.
           */
          if (canReadBehaviour(subjectRow)) {
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
                }, `Behaviour (count ${tag})`).catch(() => null)
              )
            );

            const usable = probes
              .map((tag, i) => ({ tag, n: counts[i] }))
              .filter(p => p.n != null && p.n > 0 && p.n <= BEHAVIOUR_PROBE_CAP);
            const skipped = probes
              .map((tag, i) => ({ tag, n: counts[i] }))
              .filter(p => p.n != null && p.n > BEHAVIOUR_PROBE_CAP);

            const batches = await Promise.all(
              usable.map(p =>
                retrying(async () => {
                  let q = uniqueCards()
                    .select(RANK_COLUMNS)
                    .contains('tags', [p.tag])
                    .limit(BEHAVIOUR_PROBE_CAP);
                  q = withinIdentity(q);
                  if (oracleId) q = q.neq('oracle_id', oracleId);
                  const res = await q;
                  if (res.error) throw res.error;
                  return res.data ?? [];
                }, `Behaviour (probe ${p.tag})`).catch(err => {
                  console.error(`Behaviour probe "${p.tag}" failed:`, err);
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

            const result = rankBySameBehaviour(subjectRow, Array.from(pool.values()), {
              limit: 14,
              exclude: seen,
              priceOf: getUsdPrice,
            });

            if (result.entries.length > 0) {
              /*
               * The ranking columns carry no art. One more read, for the
               * fourteen that survived, rather than pulling `image_uris` for
               * every row in a 326-row pool.
               */
              const ids = result.entries.map(e => e.card.id).filter(Boolean);
              const { data: tiles } = await supabase
                .from('cards')
                .select(CARD_COLUMNS)
                .in('id', ids);
              const byId = new Map((tiles ?? []).map(t => [t.id, t]));

              const entries = result.entries
                .map(e => ({ card: byId.get(e.card.id) ?? e.card, note: e.note }))
                .filter(e => e.card);
              const ordered = dedupeByOracle(entries.map(e => e.card), seen);
              const noteFor = new Map(entries.map(e => [e.card.id, e.note]));

              if (ordered.length > 0) {
                const probeText = [
                  ...usable.map(p => `${p.tag} (${p.n} cards, all of them)`),
                  ...skipped.map(p => `${p.tag} (${p.n} cards, too many to rank, skipped)`),
                ].join(', ');

                built.push({
                  key: 'behaviour',
                  label: 'Does the same thing',
                  basis:
                    `Both cards' rules text compiled into an ability record, then ranked by shared effects and ` +
                    `their arguments rather than by shared words. ${name} reads ${describeSubject(result.subject.facets)}. ` +
                    `Candidates came from tags @> ${probeText}, and ${result.census.pool} of them were scored, ` +
                    `not the first sixty. ${result.census.byRecord} of the ${result.entries.length} shown were decided by a record` +
                    `${result.census.byTags > 0 ? `, ${result.census.byTags} by tags because we hold no record for them` : ''}.`,
                  entries: ordered.map(c => ({ card: c, note: noteFor.get(c.id) })),
                });
                behaviourRendered = true;
              }
            }
          }
        }
      } catch (err) {
        console.error('Synergy group "behaviour" failed:', err);
      }

      /* --- 5. Shares a role tag, weighted by how rare that tag is. ---
       *
       * THE FALLBACK NOW, not the answer. It runs only when the group above did
       * not, which means the ability compiler read nothing for this card, and
       * its own weakness is why: one indexed `tags @> {tag}` per probe tag, 60
       * rows each, ranked by summed tag rarity. That ranking cannot separate two
       * cards that share the tag, which is the whole reason `Does the same
       * thing` exists.
       */
      try {
        const probes = tags.slice(0, TAG_PROBES);
        if (!behaviourRendered && probes.length > 0) {
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
              basis: `We hold no ability record for ${name}, so this is matched on words. Our card table tags it ${tags.join(
                ', '
              )}. Searched on the ${
                probes.length === 1 ? 'rarest of those' : `${probes.length} rarest of those`
              }, 60 rows each, then ranked by how rare the shared tags are. A tag cannot tell two cards that carry it apart, so read this as a starting point rather than an answer.`,
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
