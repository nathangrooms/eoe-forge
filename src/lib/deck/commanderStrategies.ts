/**
 * Which ways of building THIS commander to offer a player.
 *
 * ## The complaint this answers
 *
 * The owner, 31 Aug 2026: *"syr vondom benefits from cards being exhiled, but
 * strategy doesnt show a blink option ... Feels like very limited stratgies for
 * each commander they can be played in so many ways."*
 *
 * Both halves were true, for two separate reasons, and both are fixed here.
 *
 * **There were eight shells.** The tagger names 66 concepts, of which 12 are
 * card types, 26 are jobs one card does, and **28 are strategies a deck can be
 * built around**. Eight shells against 28 strategies is why so many commanders
 * were offered the same four generic decks. There are eighteen now.
 *
 * **And the offer was made by a word list.** `AIBuilder` carried seven
 * `TEXT_HINTS`, each a substring of the commander's rules text mapped to a
 * shell by hand: `graveyard` meant Value, because no reanimator shell existed,
 * and nothing anywhere mentioned exile. That was a fourth implementation of
 * "what does this commander want", beside the ability compiler, the 113 intent
 * rules and the tagger, and it was by far the worst of the four.
 *
 * ## What it reads instead
 *
 * Two things the engine already produces, and nothing else:
 *
 * 1. **`planForCommander`** — the commander's wants, as facets with weights.
 *    This is the real reading, and it carries its own sentence saying WHY, in
 *    the engine's voice, which is what the player is shown.
 * 2. **`deriveCardTags`** — the tagger, run in the browser on the commander
 *    itself. It needs no database call and it is the same 66 rules the
 *    catalogue is tagged with, so a strategy the app can already name is a
 *    strategy it can already offer.
 *
 * A shell is offered when the commander wants the facets that shell is made of,
 * or when the commander's own tags name that strategy. Nothing here decides
 * what a card does; it only decides what to put in front of a person.
 *
 * ## Why the table below is not a fifth implementation
 *
 * It says what each SHELL is made of. That is a fact about our own eighteen
 * shells and it exists nowhere else. It is deliberately not a second reading of
 * the commander: every fact about the commander comes from the two functions
 * above.
 */

import { deriveCardTags } from '../../engine/knowledge/tagger.ts';
import { planForCommander } from '../../engine/knowledge/behaviour.ts';
import { facetsForCard } from './recommend/behaviour.ts';
import { DECK_ARCHETYPES, type DeckArchetype } from './archetypeShells.ts';

/** Everything read off the commander. A Scryfall card satisfies this as it is. */
export interface StrategyCommander {
  name?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
  keywords?: string[] | null;
  mana_cost?: string | null;
  cmc?: number | string | null;
  tags?: string[] | null;
  card_faces?: Array<{ name?: string | null; type_line?: string | null; oracle_text?: string | null }> | null;
  faces?: Array<{ name?: string | null; type_line?: string | null; oracle_text?: string | null }> | null;
}

export interface StrategyOffer {
  /** The shell id, which is what the builder is given. */
  value: string;
  label: string;
  description: string;
  /** One sentence saying why this is being offered, in the engine's own words. */
  synergy: string;
  powerLevel: number;
  /**
   * How strongly the commander asked for it. Zero means nobody asked and this
   * is one of the shells offered to everybody.
   */
  score: number;
}

interface ShellSignal {
  /** Facets from the commander's plan that this shell supplies. */
  facets: readonly string[];
  /** Tagger tags on the commander that name this strategy outright. */
  tags: readonly string[];
  /** Said when only the tag matched, so there is no plan sentence to use. */
  fallback: string;
}

/*
 * What each shell is made of.
 *
 * `facets` are the wants a plan can carry that this deck would satisfy;
 * `tags` are the tagger's own name for the strategy, which is a much stronger
 * signal because it means the commander IS this deck rather than merely
 * benefiting from it.
 */
const SHELL_SIGNALS: Record<string, ShellSignal> = {
  aristocrats: {
    facets: ['cost:sacrifice', 'eff:sacrifice', 'trig:dies', 'eff:lose-life'],
    tags: ['aristocrats', 'sacrifice-outlet'],
    fallback: 'This commander is paid when your own creatures die',
  },
  control: {
    facets: ['eff:counter', 'eff:destroy', 'eff:unless-pays', 'eff:tap'],
    tags: ['counterspell', 'stax', 'board-wipe'],
    fallback: 'This commander is already interacting with the table',
  },
  'big-mana': {
    facets: ['eff:add-mana', 'cares:zone:library-land', 'eff:untap'],
    tags: ['ramp', 'x-spell'],
    fallback: 'This commander turns extra mana into something',
  },
  'compact-combo': {
    facets: ['eff:search-library', 'eff:untap', 'eff:win-game', 'eff:lose-game'],
    tags: ['tutor', 'tutor-broad'],
    fallback: 'This commander can find the pieces it needs',
  },
  aggro: {
    facets: ['trig:attacks', 'kw:haste', 'eff:extra-combat', 'eff:pump'],
    tags: ['extra-combat', 'haste-enabler', 'evasion'],
    fallback: 'This commander wants to attack every turn',
  },
  tokens: {
    facets: ['eff:create-token'],
    tags: ['token-maker', 'mass-pump'],
    fallback: 'This commander makes or rewards tokens',
  },
  counters: {
    facets: ['ctr:+1/+1', 'eff:add-counters', 'eff:proliferate'],
    tags: ['counters', 'proliferate', 'infect'],
    fallback: 'This commander works with counters',
  },
  value: {
    facets: ['eff:draw', 'trig:enters', 'eff:return-from'],
    tags: ['card-draw', 'etb'],
    fallback: 'This commander draws you cards',
  },
  blink: {
    /*
     * `trig:enters` is NOT here, and it was. It is one of the commonest facets
     * in the catalogue: every token maker and every value creature carries an
     * enters trigger, so including it offered Blink to Krenko and to Talrand,
     * neither of whom flickers anything. What makes a deck a blink deck is the
     * card LEAVING and coming back.
     *
     * `eff:exile-own` IS THAT, and it is what a blink spell actually carries.
     * Added 1 Sep 2026 after the compiler learned to read "exile target
     * creature you control, THEN return it": Cloudshift, Ephemerate, Momentary
     * Blink, Scrollshift, Conjurer's Closet, Teleportation Circle and Felidar
     * Guardian all carry it, 206 cards in all, and before that rule existed not
     * one of them produced an effect facet at all.
     *
     * THIS LIST WAS BROKEN BY A CHANGE ELSEWHERE AND THE TEST CAUGHT IT. Syr
     * Vondam's intent rule used to want `eff:move-zone`, which no blink card
     * carries, and moving it to `eff:exile-own` left this shell matching
     * nothing for him. `eff:move-zone` stays, because bouncing a permanent is
     * still a way to reuse an enters trigger, but it is no longer the whole
     * signal.
     */
    facets: ['eff:exile-own', 'eff:move-zone', 'trig:leaves'],
    tags: ['blink'],
    fallback: 'This commander is paid when creatures leave and come back',
  },
  reanimator: {
    facets: ['cares:zone:graveyard', 'eff:return-from', 'eff:mill', 'eff:discard'],
    tags: ['reanimator', 'graveyard-recursion', 'self-mill', 'discard-outlet'],
    fallback: 'This commander plays out of the graveyard',
  },
  voltron: {
    facets: ['sub:equipment', 'sub:aura', 'cares:sub:equipment', 'cares:sub:aura', 'eff:attach'],
    tags: ['voltron', 'protection'],
    fallback: 'This commander wants to be suited up and swung with',
  },
  spellslinger: {
    facets: ['type:instant', 'type:sorcery', 'cares:type:instant', 'cares:type:sorcery', 'trig:cast'],
    tags: ['spellslinger', 'prowess', 'storm'],
    fallback: 'This commander is paid for casting instants and sorceries',
  },
  landfall: {
    facets: ['cares:type:land', 'cares:zone:library-land'],
    tags: ['landfall', 'lands-matter'],
    fallback: 'This commander is paid for playing lands',
  },
  enchantress: {
    /* `type:enchantment` was here and it reads the commander's OWN type line.
       Xenagos, God of Revels is an enchantment creature, so he was offered
       Enchantress; so is every God, Theros or otherwise. The same has-versus-
       cares distinction the facet vocabulary already draws for keywords. */
    facets: ['cares:type:enchantment', 'cares:sub:saga'],
    tags: ['enchantments-matter'],
    fallback: 'This commander is paid for casting enchantments',
  },
  artifacts: {
    facets: ['cares:type:artifact', 'type:artifact', 'cares:sub:treasure'],
    tags: ['artifacts-matter', 'treasure'],
    fallback: 'This commander is paid for casting artifacts',
  },
  lifegain: {
    facets: ['eff:gain-life', 'trig:gains-life', 'kw:lifelink'],
    tags: ['lifegain'],
    fallback: 'This commander gains life, and life can be a resource',
  },
  superfriends: {
    facets: ['type:planeswalker', 'cares:type:planeswalker', 'ctr:loyalty'],
    tags: ['planeswalker'],
    fallback: 'This commander works with planeswalkers',
  },
  tribal: {
    /* `cares:type:creature` was here and it is not tribal: Feather, the
       Redeemed cares about creatures because her spells target them, and she
       was offered Tribal while KRENKO, MOB BOSS and YURIKO, THE TIGER'S SHADOW
       were not - the Goblin commander and the Ninja commander. The tribe is
       on the plan, not in this list, and `TRIBE_OFFER` below reads it. */
    facets: ['kw:changeling'],
    tags: ['tribal-payoff'],
    fallback: 'This commander cares about one creature type',
  },
};

/**
 * Shells offered when the commander asked for too few, so there are always
 * enough to choose between. Ordered by how widely they apply.
 */
const ALWAYS_OFFERED: ReadonlyArray<{ id: string; synergy: string }> = [
  { id: 'value', synergy: 'Works with any commander: spend every card twice' },
  { id: 'control', synergy: 'Works with any commander: answer the table first' },
  { id: 'big-mana', synergy: 'Works with any commander: more mana, bigger threats' },
  { id: 'tokens', synergy: 'Works with any commander: go wide' },
  { id: 'aristocrats', synergy: 'Works with any commander: drain the table a point at a time' },
  { id: 'compact-combo', synergy: 'Works with any commander: assemble two cards and win' },
];

/**
 * A tag is worth more than a want.
 *
 * A want is the engine saying this deck would help. A tag is the engine saying
 * this commander IS this deck, which is a stronger claim and should outrank any
 * single facet.
 */
const TAG_WEIGHT = 1.1;

/** How many to offer. Two columns, three rows, no scrolling on a phone. */
export const STRATEGY_SLOTS = 6;

const offerFrom = (shell: DeckArchetype, synergy: string, score: number): StrategyOffer => ({
  value: shell.id,
  label: shell.name,
  description: shell.description,
  synergy,
  // The shell's own target, halfway through the range a well-built one scores.
  powerLevel: Math.round((shell.targetPower.min + shell.targetPower.max) / 2),
  score,
});

/**
 * The ways this commander can be built, best first.
 *
 * Never empty: a commander whose card says nothing readable still gets the
 * shells that work with anything, which is the honest answer rather than a
 * blank panel.
 */
export function strategiesFor(commander: StrategyCommander | null | undefined): StrategyOffer[] {
  const shellById = new Map(DECK_ARCHETYPES.map(s => [s.id, s]));
  const out: StrategyOffer[] = [];

  if (commander?.name) {
    /* The commander's own tags, preferring the ones already stored on the row.
       A Scryfall card has none, so the tagger runs here; it is the same 66
       rules, so the two answers agree. */
    const tags = new Set(
      commander.tags?.length
        ? commander.tags
        : deriveCardTags({
            name: commander.name,
            type_line: commander.type_line,
            oracle_text: commander.oracle_text,
            keywords: commander.keywords,
            mana_cost: commander.mana_cost,
            cmc: commander.cmc,
            faces: commander.faces ?? commander.card_faces,
          })
    );

    /*
     * WITH FACETS, and without them this call was answering a different
     * question. `tribeOf` requires the commander's own creature type to appear
     * in its own RULES TEXT, which it checks against the facets; handed none,
     * it returns null for everybody. So `plan.tribe` was always empty here and
     * Krenko, Mob Boss - the Goblin commander - was not offered Goblin tribal,
     * nor Yuriko, the Tiger's Shadow Ninjas. Every other consumer of
     * `planForCommander` passes facets; this one was written without them and
     * nothing noticed, because a plan with no tribe still returns wants.
     */
    const plan = planForCommander({
      name: commander.name,
      typeLine: commander.type_line,
      tags: [...tags],
      facets: commander.facets ?? facetsForCard({
        name: commander.name,
        type_line: commander.type_line,
        oracle_text: commander.oracle_text,
        keywords: commander.keywords,
        mana_cost: commander.mana_cost,
        cmc: commander.cmc,
        faces: commander.faces ?? commander.card_faces,
      }).facets,
      oracleText: commander.oracle_text,
      faces: commander.faces ?? commander.card_faces,
    });

    /* The strongest want a shell supplies, and the sentence that came with it.
       Strongest rather than summed: a shell that happens to touch four weak
       wants is not a better read than one that answers the commander's single
       loudest want, and summing made Value win everything because `eff:draw`
       is in so many plans. */
    const wantWeight = new Map<string, { weight: number; because: string }>();
    for (const want of plan.wants) {
      const prev = wantWeight.get(want.facet);
      if (!prev || prev.weight < want.weight) {
        wantWeight.set(want.facet, { weight: want.weight, because: want.because });
      }
    }

    const scored: Array<{ shell: DeckArchetype; score: number; synergy: string }> = [];

    /*
     * THE TRIBE IS A STRATEGY, and it is the one the tag and facet lists
     * cannot see. `plan.tribe` is set when the commander's own creature type
     * appears inside its own rules text - Krenko counting Goblins, Yuriko
     * counting Ninjas, Edgar counting Vampires - and it is the defining way
     * those commanders are built. Offered at the tribe want's own weight, so
     * it leads the list for a commander who is genuinely tribal.
     */
    const tribalShell = shellById.get('tribal');
    if (plan.tribe && tribalShell) {
      scored.push({
        shell: tribalShell,
        score: wantWeight.get(`sub:${plan.tribe}`)?.weight ?? 1,
        synergy: `${commander.name} counts ${plan.tribe}s, so the deck can be built as ${plan.tribe} tribal`,
      });
    }
    for (const [id, signal] of Object.entries(SHELL_SIGNALS)) {
      const shell = shellById.get(id);
      if (!shell) continue;

      let best = 0;
      let synergy = '';
      for (const facet of signal.facets) {
        const hit = wantWeight.get(facet);
        if (hit && hit.weight > best) {
          best = hit.weight;
          synergy = hit.because;
        }
      }

      const named = signal.tags.filter(t => tags.has(t));
      if (named.length && TAG_WEIGHT > best) {
        best = TAG_WEIGHT;
        synergy = signal.fallback;
      }

      if (best > 0) scored.push({ shell, score: best, synergy });
    }

    /* Ties broken by shell id so the same commander always offers the same
       list in the same order. A list that reshuffles between visits reads as
       the app changing its mind. */
    scored.sort((a, b) => b.score - a.score || a.shell.id.localeCompare(b.shell.id));

    /*
     * NO SENTENCE TWICE.
     *
     * One want can be the reason for several shells: Krenko, Mob Boss "does its
     * work through a tap ability", and that single want is why Big mana,
     * Two-card combo, Aggro and Voltron were all offered. All four tiles then
     * carried the identical line, which on screen reads as the panel being
     * broken rather than as four strategies sharing a reason.
     *
     * The loudest offer keeps the engine's sentence, because it earned it, and
     * the rest fall back to the shell's own description of what it is. That is
     * still true and it is the more useful thing to say on the second tile.
     */
    const saidAlready = new Set<string>();
    for (const s of scored) {
      if (out.length >= STRATEGY_SLOTS) break;
      const synergy = saidAlready.has(s.synergy)
        ? (SHELL_SIGNALS[s.shell.id]?.fallback ?? s.synergy)
        : s.synergy;
      saidAlready.add(s.synergy);
      out.push(offerFrom(s.shell, synergy, s.score));
    }
  }

  for (const filler of ALWAYS_OFFERED) {
    if (out.length >= STRATEGY_SLOTS) break;
    if (out.some(o => o.value === filler.id)) continue;
    const shell = shellById.get(filler.id);
    if (shell) out.push(offerFrom(shell, filler.synergy, 0));
  }

  return out;
}

/**
 * What the builder read off this commander, in its own sentences.
 *
 * The plan's `because` lines, deduplicated and ordered by how loudly the
 * commander asked. They are written to complete "…, so the deck wants" and are
 * already in a player's words — "is paid when your creatures die", "does its
 * work through a tap ability" — so they need no rewriting to be shown.
 *
 * It exists because the configure screen had 300px of empty charcoal under the
 * commander's card while the panel beside it ran on, and because the one thing
 * a player cannot otherwise check is whether the builder understood the card
 * they chose. A generator that says what it read can be argued with; one that
 * does not has to be trusted.
 */
export function readingFor(commander: StrategyCommander | null | undefined): string[] {
  if (!commander?.name) return [];
  const plan = planForCommander({
    name: commander.name,
    typeLine: commander.type_line,
    tags: commander.tags,
    oracleText: commander.oracle_text,
    faces: commander.faces ?? commander.card_faces,
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const want of [...plan.wants].sort((a, b) => b.weight - a.weight)) {
    /* The commander's own name opens every sentence the plan builds, and
       repeating it down a list is noise when the card is beside it. */
    const line = want.because.startsWith(`${commander.name} `)
      ? want.because.slice(commander.name.length + 1)
      : want.because;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
