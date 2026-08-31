import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { CardImage } from '@/components/cards';
import { supabase } from '@/integrations/supabase/client';
import { DECK_ARCHETYPES, type DeckArchetype } from '@/lib/deck/archetypeShells';
import { ROLES } from '@/engine/core/types';
import { ROLE_FACETS } from '@/engine/knowledge/behaviour';
import { Search, X } from 'lucide-react';

/**
 * EVERY WORD THE ENGINE KNOWS, in one place, with how many cards carry it.
 *
 * The owner, 31 Aug 2026: *"in admin we need a list of all archetypes,
 * strategies and every single type of card definition across both commanders,
 * lands and other cards"*, after *"Especially if we are adding specific rules
 * and types I dont know"*.
 *
 * That last sentence is the whole design brief. The engine invents vocabulary
 * as it learns to read cards — `cost:cast-sacrifice` and `eff:extra-land-drop`
 * were both written this week — and until now the only way to find out what
 * words existed was to read `behaviour.ts`. A vocabulary the owner of the
 * product cannot enumerate is one nobody can check.
 *
 * ## The facet list is READ FROM THE DATABASE, never typed here
 *
 * `public.engine_vocabulary()` unnests what the catalogue actually carries. So
 * a facet a compiler rule emits next week appears on this screen without
 * anybody editing this file, and a facet that stops being emitted disappears.
 * A hand-kept list would be wrong the moment it shipped, and wrong silently,
 * which is the failure this project has made three times with card data.
 *
 * The counts matter as much as the names. A facet on nine cards and a facet on
 * nine thousand are different objects and only one is worth writing a role rule
 * against; `role-rule-try.mjs` exists because that judgement kept being made on
 * intuition.
 *
 * ## The shells draw real cards, whole
 *
 * An archetype described in a sentence is an assertion. The same archetype
 * showing the four sacrifice outlets it means is a claim you can disagree with,
 * which is the point of putting it in front of somebody. Full card images, not
 * crops: standing instruction, and Scryfall's guidelines forbid modifying card
 * images anyway.
 */

interface VocabRow {
  kind: 'facet' | 'tag' | 'coverage';
  name: string;
  cards: number;
  lands: number;
  commanders: number;
}

/**
 * What each prefix MEANS, in a sentence a Commander player would use.
 *
 * This is the half that cannot come from the database: the counts are data, the
 * meaning is not. Keep the sentences plain — no "facet", no "predicate", no
 * "vocabulary". Somebody reading this screen is trying to find out whether the
 * engine understands their deck.
 */
const PREFIX_GLOSS: Array<{ prefix: string; title: string; blurb: string }> = [
  { prefix: 'type:', title: 'Card types', blurb: 'What it is on the type line: creature, instant, land.' },
  { prefix: 'sub:', title: 'Subtypes', blurb: 'Goblin, Aura, Equipment, Island. Every creature type and land type in the game.' },
  { prefix: 'kw:', title: 'Keywords', blurb: 'Flying, trample, hexproof. Both keywords it has and keywords it gives out.' },
  { prefix: 'eff:', title: 'What it does', blurb: 'The verbs. Draw, destroy, add mana, make a token. This is the shortest list here and the most important one.' },
  { prefix: 'trig:', title: 'When it happens', blurb: 'What sets it off: it enters, it attacks, a creature dies, your turn begins.' },
  { prefix: 'cost:', title: 'What you give up', blurb: 'Sacrifice something, discard, pay life. Sacrificing itself and sacrificing anything are separate, because only one of them is a sacrifice outlet.' },
  { prefix: 'acost:', title: 'What the ability costs', blurb: 'The mana on an activated ability. Zero is its own entry because free is different in kind.' },
  { prefix: 'mana:', title: 'Mana it makes', blurb: 'How much, for the ramp count.' },
  { prefix: 'ctr:', title: 'Counters', blurb: '+1/+1, loyalty, energy, and every other counter a card puts somewhere.' },
  { prefix: 'tok:', title: 'Tokens it makes', blurb: 'Treasure, Soldier, Food, Clue.' },
  { prefix: 'cares:type:', title: 'Card types it is about', blurb: 'An anthem for creatures cares about creatures. Different from being one.' },
  { prefix: 'cares:sub:', title: 'Subtypes it is about', blurb: 'A Goblin lord cares about Goblins. This is how tribal is found.' },
  { prefix: 'cares:zone:', title: 'Zones it is about', blurb: 'Graveyard, library, exile. How recursion and tutors are told apart.' },
  { prefix: 'scope:', title: 'How wide it reaches', blurb: 'Everything on the battlefield, or each player, rather than one target.' },
  { prefix: 'rec:', title: 'How much we read', blurb: 'Whether the compiler consumed every line of the card, or only some of it.' },
];

/** The ten jobs, in the words a player would use rather than the engine's. */
const ROLE_GLOSS: Record<string, string> = {
  ramp: 'Gets you more mana, sooner.',
  draw: 'Refills your hand.',
  removal: 'Kills a thing that has already resolved.',
  interaction: 'Answers something while it is still on the stack, or takes it away later.',
  tutor: 'Finds an exact card. Finding is not drawing and the deck had no word for it until recently.',
  enhance: 'Makes your creatures bigger or better. Auras, equipment, pumps.',
  protection: 'Keeps your commander alive. Hexproof, indestructible, ward.',
  wincon: 'Ends the game.',
  land: 'Lands.',
  creature: 'Bodies on the board. Counted over the whole deck rather than as a bucket, so a mana dork is ramp AND a creature.',
};

const nf = new Intl.NumberFormat();

function ArchetypePanel({ shell, onClose }: { shell: DeckArchetype | null; onClose: () => void }) {
  const names = useMemo(
    () => (shell ? shell.packages.flatMap(p => p.cards) : []),
    [shell]
  );
  const [art, setArt] = useState<Map<string, { id: string; image_uris: unknown }>>(new Map());

  useEffect(() => {
    if (!names.length) return;
    let cancelled = false;
    void supabase
      .from('cards_unique' as never)
      .select('id,name,image_uris')
      .in('name', names)
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return;
        const next = new Map<string, { id: string; image_uris: unknown }>();
        for (const row of data as Array<{ id: string; name: string; image_uris: unknown }>) {
          if (!next.has(row.name)) next.set(row.name, { id: row.id, image_uris: row.image_uris });
        }
        setArt(next);
      });
    return () => { cancelled = true; };
  }, [names]);

  return (
    <Sheet open={Boolean(shell)} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetTitle className="text-xl">{shell?.name ?? ''}</SheetTitle>
        {shell ? (
          <div className="mt-2 space-y-6">
            <div>
              <p className="text-sm text-muted-foreground">{shell.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">
                  Power {shell.targetPower.min} to {shell.targetPower.max}
                </Badge>
                {shell.formats.map(f => (
                  <Badge key={f} variant="outline" className="capitalize">{f}</Badge>
                ))}
                {shell.colors.length > 0 && (
                  <span className="text-muted-foreground">
                    usually {shell.colors.join('')}
                  </span>
                )}
              </div>
            </div>

            {shell.packages.map(pkg => (
              <div key={pkg.name} className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">{pkg.name}</h4>
                  <p className="text-xs text-muted-foreground">{pkg.blurb}</p>
                </div>
                {/* Whole cards, at a size worth looking at. A shell is an
                    argument about which cards belong together, so the cards
                    have to be legible enough to argue with. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {pkg.cards.map(name => {
                    const found = art.get(name);
                    return (
                      /* The name is drawn ONLY when the card is not. A card
                         image already says its name in larger type than this
                         label could, so printing both is noise; printing
                         neither would hide a name that stopped resolving. */
                      <div key={name}>
                        {found ? (
                          <CardImage
                            card={{ id: found.id, name, image_uris: found.image_uris } as never}
                            size="md"
                            className="w-full"
                          />
                        ) : (
                          <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-muted/40 p-2 text-center text-[11px] text-muted-foreground">
                            {name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function EngineDictionary() {
  const [vocab, setVocab] = useState<VocabRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [shell, setShell] = useState<DeckArchetype | null>(null);
  const [openPrefix, setOpenPrefix] = useState<string | null>('eff:');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        /* PostgREST caps a response at 1,000 rows whatever `limit` says, and
           there are more facets than that. Page until a page is short, so this
           keeps working as the vocabulary grows rather than silently losing the
           tail — which is exactly what happened the first time it was called. */
        const rows: VocabRow[] = [];
        for (let page = 0; page < 12; page++) {
          const from = page * 1000;
          const { data, error: err } = await supabase
            .rpc('engine_vocabulary' as never)
            .order('kind', { ascending: true })
            .order('cards', { ascending: false })
            .range(from, from + 999);
          if (err) throw err;
          const batch = (data ?? []) as unknown as VocabRow[];
          rows.push(...batch);
          if (batch.length < 1000) break;
        }
        if (!cancelled) setVocab(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const facets = useMemo(() => (vocab ?? []).filter(r => r.kind === 'facet'), [vocab]);
  const tags = useMemo(() => (vocab ?? []).filter(r => r.kind === 'tag'), [vocab]);

  /*
   * Longest prefix wins, so `cares:type:` claims a facet before `cares:` would.
   * Anything the gloss does not name is grouped under a heading that says so
   * rather than being dropped: a word the engine emits that this file has never
   * heard of is the single most interesting row on the screen, because it is
   * new work nobody has written down.
   */
  const byPrefix = useMemo(() => {
    const order = [...PREFIX_GLOSS].sort((a, b) => b.prefix.length - a.prefix.length);
    const groups = new Map<string, VocabRow[]>();
    const unknown: VocabRow[] = [];
    for (const row of facets) {
      const hit = order.find(p => row.name.startsWith(p.prefix));
      if (!hit) { unknown.push(row); continue; }
      const list = groups.get(hit.prefix) ?? [];
      list.push(row);
      groups.set(hit.prefix, list);
    }
    return { groups, unknown };
  }, [facets]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? [...facets, ...tags].filter(r => r.name.toLowerCase().includes(q)).slice(0, 120) : []),
    [q, facets, tags]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">Every word the engine knows</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              The engine describes a card in two ways at once. It reads the rules text and records
              what the card does, and it applies the tagger's rules and records what the card is.
              Everything below is read live from the catalogue, so a rule written this morning shows
              up here without anyone updating a list.
            </p>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Find a word: sacrifice, goblin, landfall"
              className="pl-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">Could not read the vocabulary: {error}</p>}
          {!vocab && !error && <p className="text-sm text-muted-foreground">Reading the catalogue.</p>}

          {vocab && !q && (
            <p className="text-xs text-muted-foreground">
              {nf.format(facets.length)} things the compiler can say about a card,
              and {nf.format(tags.length)} the tagger can.
            </p>
          )}

          {q && (
            <div className="space-y-1">
              {matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing the engine says matches that.</p>
              ) : (
                matches.map(row => (
                  <div
                    key={`${row.kind}:${row.name}`}
                    className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-1.5 text-sm"
                  >
                    <Badge variant={row.kind === 'tag' ? 'outline' : 'secondary'} className="shrink-0 text-[10px]">
                      {row.kind === 'tag' ? 'is' : 'does'}
                    </Badge>
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{row.name}</code>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {nf.format(row.cards)} cards
                      {row.lands > 0 && <> · {nf.format(row.lands)} lands</>}
                      {row.commanders > 0 && <> · {nf.format(row.commanders)} legends</>}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ jobs -- */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">The ten jobs a deck has to fill</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Every card the builder considers is placed into the job it is neediest for. A card
              that fills no job can still get in, but only through the slots held back for cards
              that fit the commander unusually well.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ROLES.map(role => (
              <div key={role} className="space-y-2 rounded-lg bg-muted/30 p-4">
                <h3 className="text-sm font-semibold capitalize">{role}</h3>
                <p className="text-xs text-muted-foreground">{ROLE_GLOSS[role] ?? ''}</p>
                <div className="flex flex-wrap gap-1">
                  {(ROLE_FACETS[role] ?? []).map(f => (
                    <code key={f} className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px]">
                      {f}
                    </code>
                  ))}
                  {(ROLE_FACETS[role] ?? []).length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      reached through the type line and the tagger rather than through what it does
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- shells -- */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">The {DECK_ARCHETYPES.length} shells</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              What the builder offers when you pick a commander. Which ones you are shown is decided
              by reading the commander, not by a list: the engine looks for the things each shell is
              made of and offers the shells the commander actually asked for. Open one to see the
              cards it means.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DECK_ARCHETYPES.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => setShell(a)}
                className="rounded-lg bg-muted/30 p-4 text-left transition-colors hover:bg-muted/60"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{a.name}</h3>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {a.targetPower.min}-{a.targetPower.max}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {a.packages.length} pieces, {a.packages.reduce((n, p) => n + p.cards.length, 0)} cards named
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- facets -- */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">What the compiler reads off a card</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Grouped by what kind of thing each one is. The numbers are how many cards in the whole
              catalogue carry it, and how many of those are lands or legendary creatures, because a
              word that only ever appears on lands is describing a different part of the game.
            </p>
          </div>

          <div className="space-y-2">
            {PREFIX_GLOSS.map(({ prefix, title, blurb }) => {
              const rows = (byPrefix.groups.get(prefix) ?? []).slice().sort((a, b) => b.cards - a.cards);
              if (rows.length === 0) return null;
              const open = openPrefix === prefix;
              return (
                <div key={prefix} className="overflow-hidden rounded-lg bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setOpenPrefix(open ? null : prefix)}
                    className="flex w-full items-baseline gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                  >
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <code className="font-mono text-[11px] text-muted-foreground">{prefix}</code>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {nf.format(rows.length)} {rows.length === 1 ? 'word' : 'words'}
                    </span>
                  </button>
                  <div className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground">{blurb}</p>
                    {open && (
                      <div className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                        {rows.map(row => (
                          <div
                            key={row.name}
                            className="flex items-baseline gap-2 rounded bg-background/60 px-2 py-1"
                          >
                            <code className="min-w-0 flex-1 truncate font-mono text-[11px]">
                              {row.name.slice(prefix.length) || row.name}
                            </code>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {nf.format(row.cards)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* A word the engine emits that this file has never heard of is the
                most interesting row here, so it gets a heading of its own
                rather than being quietly dropped into an "other" bucket. */}
            {byPrefix.unknown.length > 0 && (
              <div className="rounded-lg bg-muted/30 p-4">
                <h3 className="text-sm font-semibold">Not described here yet</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The engine is saying these and this screen has no explanation for them, which
                  means a rule was added without one. Worth writing down.
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {byPrefix.unknown.slice(0, 60).map(row => (
                    <code key={row.name} className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[11px]">
                      {row.name} <span className="text-muted-foreground">{nf.format(row.cards)}</span>
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ tags -- */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">What the tagger calls a card</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              A second, separate reading of the same rules text, by pattern rather than by grammar.
              It is what the strategy list, the search filters and the deck summary are built on.
              Never quote these numbers as coverage: a card can be tagged and still be one the
              engine cannot play.
            </p>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tags.map(row => (
              <div key={row.name} className="flex items-baseline gap-2 rounded bg-muted/30 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs">{row.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {nf.format(row.cards)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ArchetypePanel shell={shell} onClose={() => setShell(null)} />

      <div className="pb-2">
        <Button asChild variant="outline" size="sm">
          <a href="/admin?tab=engine">Back to engine health</a>
        </Button>
      </div>
    </div>
  );
}
