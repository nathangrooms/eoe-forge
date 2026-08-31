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
     * in the catalogue — every token maker and every value creature carries an
     * enters trigger — so including it offered Blink to Krenko and to Talrand,
     * neither of whom flickers anything. What makes a deck a blink deck is the
     * card LEAVING and coming back, which is `eff:move-zone` and `trig:leaves`.
     */
    facets: ['eff:move-zone', 'trig:leaves'],
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
    facets: ['cares:type:enchantment', 'type:enchantment', 'cares:sub:saga'],
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
    facets: ['cares:type:creature', 'kw:changeling'],
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

    const plan = planForCommander({
      name: commander.name,
      typeLine: commander.type_line,
      tags: [...tags],
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
    for (const s of scored) {
      if (out.length >= STRATEGY_SLOTS) break;
      out.push(offerFrom(s.shell, s.synergy, s.score));
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
