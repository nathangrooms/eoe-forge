import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CardGrid } from '@/components/cards';
import { DeckCardTile } from '@/components/deck/DeckCardTile';
import { supabase } from '@/integrations/supabase/client';
import { cardRole } from '@/engine/advise/roles';
import { ROLES, type Role } from '@/engine/core/types';
import { planForCommander } from '@/engine/knowledge/behaviour';
import { facetsForCard } from '@/lib/deck/recommend/behaviour';

/**
 * What the engine can and cannot read, on one screen.
 *
 * ## Why this exists
 *
 * The owner, after a session of finding the same fault three times in three
 * places: *"Perhaps in admin section we need an engine screen which visually
 * shows how everything works so I can monitor it, we have multiple systems we
 * use, including scryfall, edh, xmage and others."*
 *
 * Every number here was previously only reachable by running a script in a
 * terminal, and the two that matter had never been computed at all.
 *
 * ## The two questions, and they are not the same question
 *
 * A deck is built around a commander by reading the commander, then finding
 * cards to answer it. Those are separate abilities and they fail separately:
 *
 *   CAN WE READ A COMMANDER   `planForCommander` over the most played legends.
 *   CAN WE PLACE A CARD       `cardRole` over the most played cards.
 *
 * Measured on 31 Aug 2026 the first was 99.7% and the second was 85.9%, which
 * is the whole diagnosis in two numbers: the engine knows what every commander
 * wants and cannot find enough cards it is allowed to use. `generateDeck` puts
 * each card into its neediest role and SKIPS IT ENTIRELY when it serves none,
 * so a card with no role is not outranked, it is unreachable.
 *
 * ## Computed here, not stored
 *
 * Both walks run in this tab against the live catalogue, because a stored
 * figure would be a figure from whenever it was stored, and the point of the
 * screen is watching these move as rules are added. The sample is the most
 * played cards rather than the whole catalogue for the same reason the
 * generator's pool is: a rule that fixes a card nobody plays has not fixed
 * anything a player will see.
 */

interface Sources {
  printings: number | null;
  cards: number | null;
  ranked: number | null;
  tagged: number | null;
  lastSync: string | null;
}

interface Coverage {
  sample: number;
  read: number;
  inferred: number;
  silent: number;
  placeable: number;
  roleless: number;
  byRole: Record<Role, number>;
  unplaceable: Array<{ id: string; name: string; rank: number | null; tags: string[]; card: unknown }>;
}

const CARD_COLUMNS =
  'id,name,oracle_text,type_line,mana_cost,cmc,colors,color_identity,keywords,tags,' +
  'edhrec_rank,oracle_id,image_uris';

/** How many of the most played cards each walk reads. */
const SAMPLE = 750;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-4">
      <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** A share of a whole, drawn. No hue: the label says which way is good. */
function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/**
 * The three states a card can be in, and they PARTITION.
 *
 * `read part of it` is deliberately the middle band and deliberately the
 * widest: measured over commanders on 31 Aug 2026, every card marked "not read
 * at all" reads 0% of its characters and every card marked "read the whole
 * card" reads 100%, but this one spans 1.5% to 100%. Adeline consumes nine
 * characters of 176, the word "vigilance", and sits in the same band as a card
 * whose only outstanding item is a human resolving a choice.
 *
 * Monochrome, per design law: the bar separates the bands by LIGHTNESS, not by
 * hue. Colour in this product means something (mana, card type, power) and a
 * coverage band is none of those.
 */
const BANDS = [
  {
    key: 'read the whole card',
    label: 'Read the whole card',
    note: 'runs with no help',
    bar: 'bg-foreground/80',
    dot: 'bg-foreground/80',
  },
  {
    key: 'read some of it',
    label: 'Read part of it',
    note: 'one word to all but one line',
    bar: 'bg-foreground/45',
    dot: 'bg-foreground/45',
  },
  {
    key: 'needs a human for all of it',
    label: 'Not read at all',
    note: 'a person does all of it',
    bar: 'bg-foreground/15',
    dot: 'bg-foreground/15',
  },
  /*
   * A VANILLA CREATURE IS NOT AN UNREAD CARD.
   *
   * 347 of these 354 have no rules text at all: Aegis Turtle, Zombie Goliath.
   * They were in NO band, which is why the first three summed to 99% and left a
   * gap a careful reader would have spotted.
   *
   * They are deliberately not folded into "read the whole card", which would be
   * true and misleading. That is the number this project quotes as progress,
   * and 347 cards with nothing written on them are not progress.
   */
  {
    key: 'nothing to read',
    label: 'Nothing to read',
    note: 'no rules text at all',
    bar: 'bg-foreground/5',
    dot: 'bg-foreground/25',
  },
] as const;

export function EngineHealth() {
  /*
   * LIVE, FROM THE DATABASE, over the WHOLE CATALOGUE.
   *
   * The owner: *"i dont care about top 400, or top 15k cards, everything should
   * be covered, always, automatically"*, and *"Would be cool if admin section
   * always showed live card coverage so I can check and we can track easily"*.
   *
   * Everything else on this screen is computed in the browser over a SAMPLE of
   * the most played cards, because those walks need the compiler and the
   * compiler runs here. This block does not: `card_facet_memo.coverage` stores
   * the compiler's own verdict for every card, written by the fill that already
   * runs every fifteen minutes, so the whole-catalogue answer is one SELECT and
   * it is current for cards printed next week.
   */
  const [census, setCensus] = useState<{ measure: string; cards: number; share: number | null }[] | null>(null);
  const [sources, setSources] = useState<Sources | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The counts are four cheap head requests; they load with the tab. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        void supabase
          .rpc('engine_coverage' as never)
          .then(({ data }) => {
            if (!cancelled && Array.isArray(data)) setCensus(data as never);
          });

        /*
         * ONE RPC, NOT FOUR HEAD REQUESTS.
         *
         * These four were `select('*', { count: 'exact', head: true })` and
         * three of them returned 500, so this screen drew a dash where a
         * number belongs from the day it shipped. `count=exact` is a full
         * scan, and measured:
         *
         *   select count(*) from public.cards   37,284 ms, 47,348 heap fetches
         *
         * against a 3 s statement_timeout. `engine_sources()` reads the three
         * that can be exact from `cards_pool` (the same 33,032 cards in 13 MB,
         * 73 ms) and takes the fourth from the planner, which is why the
         * printings figure says "about".
         */
        const { data, error: srcError } = await supabase.rpc('engine_sources' as never);
        if (cancelled) return;
        if (srcError) throw srcError;
        type SourceRow = {
          printings_estimate: number; cards: number; ranked: number; tagged: number; last_sync: string | null;
        };
        const payload = data as unknown;
        const row = (Array.isArray(payload) ? payload[0] : payload) as SourceRow | undefined;
        setSources({
          printings: row?.printings_estimate ?? null,
          cards: row?.cards ?? null,
          ranked: row?.ranked ?? null,
          tagged: row?.tagged ?? null,
          lastSync: row?.last_sync ?? null,
        });
      } catch (e) {
        if (!cancelled) setError(String(e).slice(0, 160));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      /* Most played first, which is the slice the generator draws from. */
      const { data: cards, error: cardsError } = await supabase
        .from('cards_unique' as never)
        .select(CARD_COLUMNS)
        .not('edhrec_rank', 'is', null)
        .order('edhrec_rank', { ascending: true })
        .limit(SAMPLE);
      if (cardsError) throw cardsError;

      const { data: legends, error: legendError } = await supabase
        .from('cards_unique' as never)
        .select(CARD_COLUMNS)
        .ilike('type_line', '%Legendary%Creature%')
        .not('edhrec_rank', 'is', null)
        .order('edhrec_rank', { ascending: true })
        .limit(300);
      if (legendError) throw legendError;

      const byRole = {} as Record<Role, number>;
      for (const r of ROLES) byRole[r] = 0;
      let roleless = 0;
      const unplaceable: Coverage['unplaceable'] = [];

      for (const raw of (cards ?? []) as any[]) {
        const fc = facetsForCard(raw) as unknown;
        const facets = Array.isArray(fc) ? fc : ((fc as { facets?: string[] })?.facets ?? []);
        const subject = { facets, typeLine: raw.type_line, tags: raw.tags } as never;
        const served = ROLES.filter(r => cardRole(subject, r));
        for (const r of served) byRole[r] += 1;
        if (served.length === 0) {
          roleless += 1;
          if (unplaceable.length < 12) {
            unplaceable.push({
              id: raw.id, name: raw.name, rank: raw.edhrec_rank,
              tags: raw.tags ?? [], card: raw,
            });
          }
        }
      }

      let read = 0, inferred = 0, silent = 0;
      for (const raw of (legends ?? []) as any[]) {
        const plan = planForCommander({
          name: raw.name, oracleText: raw.oracle_text, typeLine: raw.type_line,
          colorIdentity: raw.color_identity, tags: raw.tags,
        } as never);
        const wants = plan?.wants ?? [];
        if (!wants.length) { silent += 1; continue; }
        /* The fallbacks say so in their own words; an intent rule names the
           ability it fired on. */
        const guessed = wants.every(w => /tells us nothing|no record|nothing but its stats/i.test(w.because ?? ''));
        if (guessed) inferred += 1; else read += 1;
      }

      const sample = (cards ?? []).length;
      setCoverage({
        sample, read, inferred, silent,
        placeable: sample - roleless, roleless, byRole, unplaceable,
      });
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setRunning(false);
    }
  }, []);

  const legends = coverage ? coverage.read + coverage.inferred + coverage.silent : 0;
  const pct = (k: number, of: number) => (of > 0 ? (k / of) * 100 : 0);

  const measure = (name: string) => census?.find(row => row.measure === name);
  const measured = measure('measured')?.cards ?? 0;
  const stillToMeasure = measure('still to be measured')?.cards ?? 0;

  return (
    <div className="space-y-6">
      {/*
        HOW MUCH OF EVERY CARD THE ENGINE READS. No sample, no top-N.

        First on the screen because it is the number the whole engine is judged
        by, and because every figure this project quoted before today came from
        someone running a probe over a slice. A slice flatters, a one-off has
        nothing to compare against, and a number nobody is watching can regress
        for weeks. `cards_unique` described 28 August for two days while every
        search was served from it, and nothing said so.
      */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">How much of every card we read</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              The whole catalogue, live, not a sample. Read the whole card means the compiler got to
              the end of every line and needs nobody to finish it. None of these say the reading was
              right, only that it happened.
            </p>
          </div>

          {census === null ? (
            <p className="text-sm text-muted-foreground">Reading the catalogue.</p>
          ) : (
            <>
              {/*
                THREE BOXES, NOT FOUR, BECAUSE ONLY THREE OF THEM PARTITION.

                This drew four equal stats: read the whole card, read part of
                it, not read at all, and "no record". The first three add to
                32,678 of 33,032 and are a real partition. The fourth is the
                UNION of the third and the 354 cards the compiler read and found
                nothing on, so it double-counted 6,736 cards and the row summed
                to 120%. On a screen whose entire purpose is being honest about
                what the engine knows, four numbers that do not add up is the
                worst possible defect.

                It is a derived line under the bar now, said as what it is: how
                many of the above produce nothing a consumer can use.
              */}
              <div className="space-y-3">
                {/*
                  ONE BAR, FULL WIDTH. Three boxes side by side make three
                  numbers you have to compare by reading; a bar makes the shape
                  of the problem the first thing you see, which is that the
                  middle band is the biggest and it is also the vaguest.
                */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
                  {BANDS.map(band => {
                    const row = measure(band.key);
                    const share = row?.share ?? 0;
                    if (share <= 0) return null;
                    return (
                      <div
                        key={band.key}
                        className={band.bar}
                        style={{ width: `${share}%` }}
                        title={`${band.label}: ${row?.cards.toLocaleString()} cards`}
                      />
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {BANDS.map(band => {
                    const row = measure(band.key);
                    return (
                      <div key={band.key} className="rounded-lg bg-muted/30 p-4">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${band.dot}`} />
                          <span className="text-2xl font-semibold tabular-nums">
                            {row ? `${row.share ?? 0}%` : '—'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {band.label}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row ? `${row.cards.toLocaleString()} cards` : ''}
                          {band.note ? `, ${band.note}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/*
                THE MIDDLE BUCKET IS THE COARSE ONE AND IT HAS TO SAY SO.
                Measured over commanders on 31 Aug 2026: every card marked
                "not read at all" reads 0% of its characters and every card
                marked "read the whole card" reads 100%, but "read part of it"
                spans 1.5% to 100%. Adeline consumes nine characters of 176 —
                the word "vigilance" — and sits in the same bucket as a card
                whose only outstanding item is a human resolving a choice. A
                screen that let those two look alike would be the instrument
                flattering itself, which is the failure this file exists to
                stop.
              */}
              <p className="max-w-3xl text-xs text-muted-foreground">
                The middle group is wide. A card in it might have had one word read or all but one
                line. Splitting it needs the share of each card's text that was read to be stored
                alongside the verdict, which is not done yet.
              </p>

              {/* A share of a number nobody can see is not a measurement. */}
              {/* An OVERLAP, not a fourth band: these cards are already counted
                  above, mostly in "not read at all". Saying so is the point. */}
              {measure('no record at all') && (
                <p className="max-w-3xl text-xs text-muted-foreground">
                  Of those, {measure('no record at all')?.cards.toLocaleString()} produce no
                  usable record at all, so there is nothing for the deck builder to rank or the
                  game to resolve. They are counted in the bands above, not on top of them.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Measured over {measured.toLocaleString()} cards.
                {stillToMeasure > 0
                  ? ` ${stillToMeasure.toLocaleString()} still to be read; the fill runs every fifteen minutes and closes this on its own.`
                  : ' Every card in the catalogue has been read.'}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">Where the knowledge comes from</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Four sources, and they answer different questions. Scryfall is printed truth: names,
              costs, type lines and rules text. EDHREC is how often a card is played, which is the
              order the deck builder considers them in. The tagger and the behaviour compiler both
              read the rules text, and between them decide what a card can be used for.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Scryfall printings"
              value={sources?.printings ? `about ${sources.printings.toLocaleString()}` : '—'}
              note={sources?.cards ? `${sources.cards.toLocaleString()} distinct cards, counted exactly` : undefined}
            />
            <Stat
              label="Carry an EDHREC rank"
              value={sources?.ranked?.toLocaleString() ?? '—'}
              note="the play-rate prior the ranker reads"
            />
            <Stat
              label="Carry at least one tag"
              value={sources?.tagged?.toLocaleString() ?? '—'}
              note={
                sources?.tagged != null && sources?.cards != null
                  ? `${(sources.cards - sources.tagged).toLocaleString()} carry none`
                  : 'the tagger'
              }
            />
            <Stat
              label="Last catalogue sync"
              value={sources?.lastSync ? new Date(sources.lastSync).toLocaleDateString() : '—'}
              note="scryfall-sync"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">What the engine can read</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Two abilities, and they fail separately. Reading a commander produces the plan a
                deck is built to answer. Placing a card decides which slot it can fill, and the
                generator SKIPS a card that fills none, whatever else it has going for it. Both
                walks run here against the live catalogue, over the {SAMPLE} most played cards and
                the 300 most played legends.
              </p>
            </div>
            <Button onClick={run} disabled={running} className="shrink-0 gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {running ? 'Reading the catalogue…' : coverage ? 'Run again' : 'Run the check'}
            </Button>
          </div>

          {error && (
            <p className="rounded-lg bg-muted/40 p-3 text-sm text-foreground">{error}</p>
          )}

          {coverage && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3 rounded-lg bg-muted/25 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">Can we read a commander?</h3>
                  <span className="text-2xl font-semibold tabular-nums">
                    {pct(coverage.read, legends).toFixed(1)}%
                  </span>
                </div>
                <Meter pct={pct(coverage.read, legends)} />
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-muted-foreground">Read</dt><dd className="font-semibold tabular-nums">{coverage.read}</dd></div>
                  <div><dt className="text-muted-foreground">Inferred</dt><dd className="font-semibold tabular-nums">{coverage.inferred}</dd></div>
                  <div><dt className="text-muted-foreground">Silent</dt><dd className="font-semibold tabular-nums">{coverage.silent}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  Read means a rule fired on the commander&rsquo;s own rules text. Inferred means no
                  rule fired and the wants were guessed from its stats. Silent means the deck has
                  nothing to aim at.
                </p>
              </div>

              <div className="space-y-3 rounded-lg bg-muted/25 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">Can we place a card?</h3>
                  <span className="text-2xl font-semibold tabular-nums">
                    {pct(coverage.placeable, coverage.sample).toFixed(1)}%
                  </span>
                </div>
                <Meter pct={pct(coverage.placeable, coverage.sample)} />
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-muted-foreground">Can be placed</dt><dd className="font-semibold tabular-nums">{coverage.placeable}</dd></div>
                  <div><dt className="text-muted-foreground">Cannot be placed</dt><dd className="font-semibold tabular-nums">{coverage.roleless}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  A card serving no role is not outranked, it is skipped. Every one of these is a
                  card the deck builder is not allowed to use.
                </p>
              </div>
            </div>
          )}

          {coverage && (
            <div className="space-y-2">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Which slot each card can fill
              </h3>
              <div className="space-y-1.5">
                {ROLES.map(role => (
                  <div key={role} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm">{role}</span>
                    <div className="min-w-0 flex-1"><Meter pct={pct(coverage.byRole[role], coverage.sample)} /></div>
                    <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                      {coverage.byRole[role]} · {pct(coverage.byRole[role], coverage.sample).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A card may fill more than one, so these do not add to 100.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {coverage && coverage.unplaceable.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-5 md:p-6">
            <div>
              <h2 className="text-lg font-semibold">
                The most played cards the deck builder cannot use
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Drawn as cards, because the point lands better that way: these are not obscure.
                Under each one is what the tagger managed to say about it, which is usually the
                whole story of why it cannot be placed.
              </p>
            </div>
            <CardGrid width={190}>
              {coverage.unplaceable.map(entry => (
                <DeckCardTile
                  key={entry.id}
                  card={entry.card as never}
                  width={190}
                  caption={entry.rank ? `#${entry.rank} most played` : undefined}
                  detail={entry.tags.length ? entry.tags.join(', ') : 'no tags at all'}
                />
              ))}
            </CardGrid>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EngineHealth;
