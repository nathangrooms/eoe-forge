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
import { reachFor, type ArchetypeReach } from './archetypeReach';

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

interface CoverageRow {
  kind: string;
  value: string;
  facet: string;
  cards: number;
  is_read: boolean;
}

/** What each catalog is called in words a player would use. */
const KIND_LABEL: Record<string, string> = {
  'keyword-abilities': 'Keyword abilities',
  'keyword-actions': 'Keyword actions',
  'ability-words': 'Ability words',
  'creature-types': 'Creature types',
  'land-types': 'Land types',
  'artifact-types': 'Artifact types',
  'enchantment-types': 'Enchantment types',
  'spell-types': 'Spell types',
  'planeswalker-types': 'Planeswalker types',
  'supertypes': 'Supertypes',
  'battle-types': 'Battle types',
};

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
  { prefix: 'cares:power', title: 'Wants big creatures', blurb: 'Xenagos doubling what he points at, Berserk, "power 4 or greater" payoffs. Worth more the bigger the creature already is.' },
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

/**
 * WORDS THIS ENGINE INVENTED, which Magic has no name for.
 *
 * The owner: *"what if we also have custom ones from our engine, these can be
 * included too"*. They should, and they are the more interesting half.
 *
 * Magic names 885 things and the section above checks us against all of them.
 * But Magic has no word for "this card is a sacrifice OUTLET rather than a card
 * that eats itself", and a deck builder cannot work without one. Every entry
 * below exists because a real deck came out wrong without it, and each one is
 * recorded with the deck that forced it, because a distinction nobody can
 * justify is a distinction somebody will delete.
 *
 * These are DELIBERATELY not in `mtg_vocabulary`: that table is Wizards' list
 * and mixing ours into it would destroy the one denominator on this screen
 * that is not an opinion.
 */
const OUR_WORDS: Array<{ facet: string; means: string; why: string }> = [
  {
    facet: 'cost:sacrifice',
    means: 'Eats something else, on demand. A sacrifice outlet.',
    why: 'A generated Meren deck had Grave Pact, Blood Artist and Grim Haruspex in it and nothing that could sacrifice a creature on demand. Magic calls Ashnod’s Altar and Sakura-Tribe Elder the same thing; a deck does not.',
  },
  {
    facet: 'cost:sacrifice-self',
    means: 'Eats only itself, once.',
    why: 'The other half of the same split. Sakura-Tribe Elder is not an outlet.',
  },
  {
    facet: 'cost:cast-sacrifice',
    means: 'An extra cost to CAST a spell, not an ability you activate.',
    why: 'Village Rites and Deadly Dispute pay with a creature but cannot be used at will.',
  },
  {
    facet: 'eff:exile-graveyard',
    means: 'Graveyard hate, kept apart from ordinary exile.',
    why: 'Reading it as `eff:exile` made every piece of graveyard hate count as REMOVAL, which is worse than not reading it. The generator put Soul-Guide Lantern in a graveyard deck.',
  },
  {
    facet: 'eff:wheel',
    means: 'Everyone throws their hand away and draws a new one. Wheel of Fortune, Windfall.',
    why: 'Magic calls the discard and the draw two separate things. A wheel deck is built on them happening together, to every player, and the community tags already used the word before the engine could read the cards.',
  },
  {
    facet: 'eff:extra-land-drop',
    means: 'More lands per turn. Exploration, Azusa, and every "put a land card from your hand onto the battlefield".',
    why: 'Not mana, but it is what a player means by ramp, and no Magic keyword covers it. Chulane and Uro carry it for the land they put down off a trigger.',
  },
  {
    facet: 'eff:put-onto-battlefield',
    means: 'A card goes from your hand straight onto the battlefield without being cast. Elvish Piper, Sneak Attack.',
    why: 'The compiler reads it with the same verb as recursion, and recursion is filed as card advantage. Sakura-Tribe Scout is not a Regrowth, so it needed its own word.',
  },
  {
    facet: 'eff:impulse',
    means: 'Exile cards off the top of a library and play them from exile for a turn or two. Light Up the Stage, Reckless Impulse, Prosper.',
    why: 'The exile and the permission are two sentences and neither means anything alone, so these cards carried no facet at all. Kept apart from exile, which is the removal role, because a draw spell is not an answer.',
  },
  {
    facet: 'eff:choose',
    means: 'An open choice made as a permanent arrives.',
    why: 'Cavern of Souls and Secluded Courtyard produced no record at all while every "as this enters, choose" was filed as hidden information alongside "name a card".',
  },
  {
    facet: 'cares:sub:chosen',
    means: 'It is about a creature type, and the type is up to you.',
    why: 'Fifty cards choose a type as they enter and every one is a tribal card. Naming a real subtype would be an invention: Secluded Courtyard is not a Goblin card, it is a card that becomes one.',
  },
  {
    facet: 'cares:zone:*',
    means: 'Which zone the card is about. Graveyard, library, exile.',
    why: 'How recursion is told from tutoring, and the thing Syr Vondam needs: he is paid by exile FROM THE BATTLEFIELD and by nothing else.',
  },
  {
    facet: 'rec:full / rec:partial',
    means: 'How much of the card the engine got to the end of.',
    why: 'So a consumer can tell "this card does nothing" from "we could not read this card". Nothing else in the vocabulary can express the difference, and treating them alike is how a silent gap becomes a wrong answer.',
  },
  {
    facet: 'scope:all',
    means: 'It reaches everything, rather than one target.',
    why: 'A board wipe and a removal spell share every other word.',
  },
  {
    facet: 'acost:0',
    means: 'The ability is free to activate.',
    why: 'Free is different in kind, not in degree. It is what makes a combo piece.',
  },
  {
    facet: 'tok:* / ctr:*',
    means: 'The tokens it makes and the counters it uses, by name.',
    why: 'Magic names Treasure and +1/+1 counters but has no vocabulary for "this card is about them", which is what a token or counters deck is built on.',
  },
  {
    facet: 'cares:power',
    means: 'Its effect scales with how big your creatures are. Ghalta, Selvala, The Great Henge.',
    why: 'A CARES word rather than a verb, on purpose. These cards draw off power, make mana off power, deal damage off power and cost less for power, so one verb would be a lie about most of them; what they share is the thing they LOOK AT. A commander carrying it asks for big creatures, which is how Ghalta stopped being a 12/12 in a deck of two-drops.',
  },
  {
    facet: 'eff:copy',
    means: 'Copies a spell or a permanent. Reverberate, Dualcaster Mage, Thousand-Year Storm.',
    why: 'The engine has no way to compile a copy at all, so this word comes entirely from the community tags. Eight of the nine best known copy spells carried only cares:zone:stack - the engine knew they looked at the stack and not that they copied anything.',
  },
  {
    facet: 'trig:enters-self',
    means: 'It triggers on ITS OWN arrival. Ghalta, Urza, Emry, Loran.',
    why: 'Magic calls this and "whenever another creature enters" the same trigger, and they are opposite decks: Ghalta wants ways to blink herself, Tatyova wants lands to keep arriving. One word could serve neither, so the plan for 4,425 cards had nothing to say.',
  },
  {
    facet: 'trig:enters-other',
    means: 'It triggers when something ELSE arrives. Tatyova, Purphoros, Aesi, Ayara.',
    why: 'The other half of the same split. These decks want more permanents entering, which is tokens and extra land drops, not a way to flicker the commander.',
  },
  {
    facet: 'trig:cast-own',
    means: 'Paid when YOU cast a spell. Talrand, Birgi, Sai, K’rrik.',
    why: 'A spellslinger deck.',
  },
  {
    facet: 'trig:cast-opponent',
    means: 'Paid when an OPPONENT casts a spell. Mangara, Kambal, Nezahal.',
    why: 'A stax deck, and the exact opposite of the one above. Both used to say only "trig:cast", so neither could be planned for.',
  },
  {
    facet: 'trig:step:begin-combat',
    means: 'It happens as combat starts. Xenagos, Odric, Brudiclad.',
    why: 'An upkeep trigger, an end step trigger and a beginning of combat trigger are three different cards, and the engine used to call all of them "trig:step". A beginning of combat trigger is worth nothing unless the deck then attacks.',
  },
  {
    facet: 'grants:hexproof',
    means: 'This card GIVES hexproof to something else, rather than having it.',
    why: 'Darksteel Citadel has indestructible; Swiftfoot Boots grants it. A protection slot wants the second and the type line cannot tell them apart, which is why every creature that grants protection used to be refused the role.',
  },
];

const nf = new Intl.NumberFormat();

function ArchetypePanel({ shell, onClose }: { shell: DeckArchetype | null; onClose: () => void }) {
  const names = useMemo(
    () => (shell ? shell.packages.flatMap(p => p.cards) : []),
    [shell]
  );
  const [art, setArt] = useState<Map<string, { id: string; image_uris: unknown }>>(new Map());
  const [reach, setReach] = useState<ArchetypeReach | null>(null);
  const [reachError, setReachError] = useState<string | null>(null);

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

  /* Ask the engine what this shell means, rather than restating the twelve. */
  useEffect(() => {
    if (!shell) return;
    let cancelled = false;
    setReach(null);
    setReachError(null);
    reachFor(shell)
      .then(r => { if (!cancelled) setReach(r); })
      .catch(e => { if (!cancelled) setReachError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [shell]);

  return (
    <Sheet open={Boolean(shell)} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetTitle className="text-xl">{shell?.name ?? ''}</SheetTitle>
        {shell ? (
          <div className="mt-2 space-y-8">
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
                  <span className="text-muted-foreground">usually {shell.colors.join('')}</span>
                )}
              </div>
            </div>

            {/*
              WHAT IT MEANS, FIRST.

              The twelve named cards are a SEED and this is what the engine
              makes of them. Reading the facets they share turns "Aristocrats"
              from a word into a list of things a card can do, and that list is
              what actually decides which cards the builder reaches for. If it
              is wrong, everything downstream is wrong, so it goes above the
              cards rather than under them.
            */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">What the engine reads this as</h4>
                <p className="text-xs text-muted-foreground">
                  Worked out from what the named cards have in common, not written down anywhere.
                  This is the list the builder scores every card against.
                </p>
              </div>
              {reachError && <p className="text-sm text-destructive">{reachError}</p>}
              {!reach && !reachError && (
                <p className="text-sm text-muted-foreground">Reading the shell.</p>
              )}
              {reach && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {reach.plan.wants.map(w => (
                      <span
                        key={w.facet}
                        className="rounded bg-muted/40 px-2 py-1 text-[11px]"
                        title={`${w.facet} — ${w.weight.toFixed(1)}x more common here than in the pool`}
                      >
                        {w.because}
                      </span>
                    ))}
                    {reach.plan.wants.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        Nothing recurred across the named cards, so the engine has no reading of this
                        shell at all. That is a real gap, not a display problem.
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    From {reach.seedsFound} of {reach.seedsNamed} named cards
                    {reach.seedsWithoutRecord > 0
                      ? `, ${reach.seedsWithoutRecord} of which the engine cannot read at all`
                      : ''}
                    .
                  </p>
                </>
              )}
            </div>

            {reach && reach.picks.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">
                    What it reaches for, out of {nf.format(reach.poolSize)} cards
                  </h4>
                  <p className="max-w-3xl text-xs text-muted-foreground">
                    Ranked by how well each one answers the reading above. Nobody chose these. Under
                    each card is every want it matched, and that list is the thing to read: the
                    ranking adds a card's best want to only a little of the rest, so a card that
                    answers one loud want sits beside a card that answers four. If a card here has
                    no business in this shell, the reading is wrong.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {reach.picks.map(card => (
                    <div key={card.id} className="space-y-1.5">
                      {card.imageUris ? (
                        <CardImage
                          card={{ id: card.id, name: card.name, image_uris: card.imageUris } as never}
                          size="md"
                          className="w-full"
                        />
                      ) : (
                        <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-muted/40 p-2 text-center text-[11px] text-muted-foreground">
                          {card.name}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-0.5">
                        {card.matched.map(f => (
                          <code
                            key={f}
                            className="rounded bg-muted/40 px-1 py-0.5 font-mono text-[9px] leading-none text-muted-foreground"
                          >
                            {f}
                          </code>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-semibold">The cards it is defined by</h4>
                <p className="text-xs text-muted-foreground">
                  Twelve, chosen by hand, because somebody had to say what this shell is before the
                  engine could work out the rest. They are the question, not the answer.
                </p>
              </div>
              {shell.packages.map(pkg => (
                <div key={pkg.name} className="space-y-3">
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {pkg.name}
                    </h5>
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
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function EngineDictionary() {
  const [vocab, setVocab] = useState<VocabRow[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageRow[] | null>(null);
  const [openKind, setOpenKind] = useState<string | null>(null);
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

        /*
         * DOES THE ENGINE READ EVERY WORD MAGIC NAMES.
         *
         * The denominator is `mtg_vocabulary`, seeded from Scryfall's own
         * catalog endpoints, which are the lists Wizards maintains. That is
         * what makes this a measurement rather than an opinion, and it is why
         * a keyword from a set released next month turns up here on its own.
         */
        const cov: CoverageRow[] = [];
        for (let page = 0; page < 6; page++) {
          const from = page * 1000;
          const { data, error: err } = await supabase
            .rpc('dictionary_coverage' as never)
            .range(from, from + 999);
          if (err) throw err;
          const batch = (data ?? []) as unknown as CoverageRow[];
          cov.push(...batch);
          if (batch.length < 1000) break;
        }
        if (!cancelled) setCoverage(cov);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /*
   * Grouped by catalog, with the unread ones kept in printed order of how many
   * cards mention them. A word on 941 cards and a word on 3 are different sizes
   * of problem and the screen has to say which is which.
   */
  const byKind = useMemo(() => {
    const groups = new Map<string, { total: number; read: number; missing: CoverageRow[] }>();
    for (const row of coverage ?? []) {
      let g = groups.get(row.kind);
      if (!g) {
        g = { total: 0, read: 0, missing: [] };
        groups.set(row.kind, g);
      }
      g.total += 1;
      if (row.is_read) g.read += 1;
      else g.missing.push(row);
    }
    return [...groups.entries()]
      .map(([kind, g]) => ({ kind, ...g }))
      .sort((a, b) => b.total - a.total);
  }, [coverage]);

  const covTotal = byKind.reduce((n, g) => n + g.total, 0);
  const covRead = byKind.reduce((n, g) => n + g.read, 0);

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

      {/* ------------------------------------------- does it cover Magic? -- */}
      {/*
        FIRST, because it is the only thing on this screen with a real
        denominator. Everything below counts what the engine DOES say. This
        counts what Magic says, and how much of it we answer.
      */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Does this cover Magic?</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Checked against the lists Wizards themselves publish, not against anyone's memory.
                A word counts as read when the engine says it about a real card. When a new set
                introduces a keyword it appears here on its own, unread, without anyone looking.
              </p>
            </div>
            {coverage && (
              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums">
                  {covTotal > 0 ? `${((covRead / covTotal) * 100).toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {nf.format(covRead)} of {nf.format(covTotal)} words
                </div>
              </div>
            )}
          </div>

          {!coverage && <p className="text-sm text-muted-foreground">Checking against Magic.</p>}

          {coverage && (
            <div className="space-y-2">
              {byKind.map(g => {
                const open = openKind === g.kind;
                const share = g.total > 0 ? (g.read / g.total) * 100 : 0;
                return (
                  <div key={g.kind} className="overflow-hidden rounded-lg bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setOpenKind(open ? null : g.kind)}
                      disabled={g.missing.length === 0}
                      className="flex w-full items-center gap-4 p-4 text-left transition-colors enabled:hover:bg-muted/50 disabled:cursor-default"
                    >
                      <h3 className="text-sm font-semibold">{KIND_LABEL[g.kind] ?? g.kind}</h3>
                      {/* A bar, because eleven percentages in a column is a table
                          nobody reads and the shape of the gap is the point. */}
                      <div className="ml-auto flex items-center gap-3">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-background/70 sm:w-40">
                          <div
                            className="h-full rounded-full bg-foreground/70"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <span className="w-32 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {g.read} of {g.total}
                          {g.missing.length > 0 ? `, ${g.missing.length} unread` : ''}
                        </span>
                      </div>
                    </button>
                    {open && g.missing.length > 0 && (
                      <div className="px-4 pb-4">
                        <p className="mb-2 text-xs text-muted-foreground">
                          The engine says nothing about these. The number is how many cards in the
                          catalogue mention the word.
                        </p>
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {g.missing.map(m => (
                            <div
                              key={m.value}
                              className="flex items-baseline gap-2 rounded bg-background/60 px-2 py-1"
                              title={`would be ${m.facet}`}
                            >
                              <span className="min-w-0 flex-1 truncate text-xs">{m.value}</span>
                              <code className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {m.facet}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* The caveat has to sit on the screen, not in a commit message. */}
          <p className="max-w-3xl text-xs text-muted-foreground">
            Read means the engine can name it. It does not mean the engine can play it: knowing a
            card cycles is not the same as paying the cost and drawing the card. Naming is what deck
            building and suggestions need, and it is the number this page reports.
          </p>
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
                  {a.packages.reduce((n, p) => n + p.cards.length, 0)} cards name it, then the engine
                  finds the rest
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

      {/* ------------------------------------------------ our own words -- */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold">Words we had to invent</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Magic has no name for some of the things a deck builder has to know. Each of these
              exists because a real deck came out wrong without it, and the reason is written down
              so nobody deletes a distinction they cannot see the point of.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {OUR_WORDS.map(w => (
              <div key={w.facet} className="space-y-1.5 rounded-lg bg-muted/30 p-4">
                <code className="font-mono text-xs font-semibold">{w.facet}</code>
                <p className="text-sm">{w.means}</p>
                <p className="text-xs text-muted-foreground">{w.why}</p>
              </div>
            ))}
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
