/**
 * What a well-built version of an archetype is made of.
 *
 * ## Where this came from
 *
 * `ArchetypeLibrary.tsx` — a component nothing imported, so nothing could ever
 * render it. It was deleted, and this is the part of it that existed nowhere
 * else in the product: a catalogue of shells, the packages each one is built
 * out of, and where a well-built version of it lands on the power scale.
 * Rendering a searchable wall of archetypes is a page nobody asked for; the
 * content is worth keeping, because the Analysis tab detects an archetype and
 * then has nothing to offer about it.
 *
 * ## Target power is a target
 *
 * `targetPower` says where a well-built version of the shell scores. It is not
 * a measurement of anybody's deck and must never be printed as one. It is on
 * the same 1–10 scale as `@/lib/deck/power`, so `bandForScore` and
 * `bracketIdForScore` read it correctly.
 *
 * ## What this is not
 *
 * Not a decklist and not a recommendation engine. The card names are the
 * canonical examples of each package, written down, not ranked or priced. The
 * ranked, deck-aware version of "what should I add" is `src/engine/advise`.
 *
 * ## The card names are now load-bearing, and that is new
 *
 * They used to be display text. `deriveDeckShape` and the ranker now read this
 * catalogue to find out what an archetype WANTS: the generator looks these
 * names up in the card database, compiles each one's oracle text into behaviour
 * facets, and the facets that recur across a shell's own cards are the wants
 * that shell contributes to a build. See `planForArchetype` in
 * `src/engine/knowledge/behaviour.ts`.
 *
 * Two consequences worth stating before anybody edits a list:
 *
 *   1. A NAME THAT DOES NOT RESOLVE CONTRIBUTES NOTHING. It must match
 *      `cards.name` exactly, ASCII apostrophe included. Three names here did
 *      not resolve against the 2026-08-19 catalogue snapshot until this pass
 *      fixed them: `Nature's Lore`, `Tyvar's Stand` and `Thassa's Oracle`
 *      carried a typographic apostrophe, and `Vorinclex` was not a card name at
 *      all (there are three Vorinclexes; the big-mana one is Voice of Hunger).
 *   2. A CARD ADDED FOR FLAVOUR CHANGES WHAT THE SHELL BUILDS. The engine reads
 *      what these cards do, so a package padded with a card that does something
 *      else moves the shell toward that something else.
 *
 * ## Shells whose card lists were written for this pass
 *
 * `tokens`, `counters` and `value` are new. They exist because `AIBuilder.tsx`
 * offers exactly those three off the commander's own oracle text, and a player
 * who picked one of them was choosing a strategy the builder had no shell for,
 * so the choice reached the language model's prompt and nothing else. Their
 * card lists follow the same rule as the five above: canonical examples of the
 * package, chosen on merit and then checked to resolve.
 */

export interface DeckArchetype {
  id: string;
  name: string;
  description: string;
  formats: string[];
  colors: string[];
  /** Where a well-built version of this shell scores. A target, not a score. */
  targetPower: { min: number; max: number };
  /** The pieces the shell is actually made of. */
  packages: Array<{ name: string; blurb: string; cards: string[] }>;
}

export const DECK_ARCHETYPES: DeckArchetype[] = [
  {
    id: 'aristocrats',
    name: 'Aristocrats',
    description: 'Sacrifice creatures for value and drain the table a point at a time.',
    formats: ['commander', 'brawl'],
    colors: ['B', 'R'],
    targetPower: { min: 6, max: 8 },
    packages: [
      {
        name: 'Sacrifice outlets',
        blurb: 'Free, repeatable outlets are what make the shell a deck rather than a pile.',
        cards: ['Viscera Seer', 'Carrion Feeder', 'Goblin Bombardment', 'Altar of Dementia'],
      },
      {
        name: 'Death payoffs',
        blurb: 'Each death has to cost the table life, or the sacrifices are free for them.',
        cards: ['Blood Artist', 'Zulaport Cutthroat', 'Mayhem Devil', 'Bastion of Remembrance'],
      },
      {
        name: 'Fodder',
        blurb: 'Tokens keep the engine fed without spending real cards.',
        cards: ['Bitterblossom', 'Ophiomancer', 'Grave Titan', 'Pitiless Plunderer'],
      },
    ],
  },
  {
    id: 'control',
    name: 'Control',
    description: 'Answer everything, resolve one threat, and close the game on your terms.',
    formats: ['commander', 'brawl'],
    colors: ['U', 'W'],
    targetPower: { min: 7, max: 9 },
    packages: [
      {
        name: 'Counterspells',
        blurb: 'Cheap, unconditional answers held up across a whole turn cycle.',
        cards: ['Counterspell', 'Swan Song', 'Force of Will', 'Mana Drain'],
      },
      {
        name: 'Sweepers',
        blurb: 'One-sided or asymmetric wipes, so resetting the board is not a reset for you.',
        cards: ['Cyclonic Rift', 'Toxic Deluge', 'Supreme Verdict', 'Farewell'],
      },
      {
        name: 'Draw engines',
        blurb: 'Control loses to running out of answers before it loses to threats.',
        cards: ['Rhystic Study', 'Mystic Remora', 'Consecrated Sphinx', 'Fact or Fiction'],
      },
    ],
  },
  {
    id: 'big-mana',
    name: 'Big mana',
    description: 'Accelerate hard, then land threats the table cannot answer profitably.',
    formats: ['commander', 'brawl'],
    colors: ['G'],
    targetPower: { min: 5, max: 7 },
    packages: [
      {
        name: 'Acceleration',
        blurb: 'Land-based ramp is harder to punish than rocks in a green deck.',
        cards: ["Nature's Lore", 'Three Visits', 'Cultivate', 'Sylvan Scrying'],
      },
      {
        name: 'Payoffs',
        blurb: 'The mana has to buy something the table cannot ignore.',
        cards: ['Craterhoof Behemoth', 'Vorinclex, Voice of Hunger', 'Avenger of Zendikar', 'Genesis Wave'],
      },
      {
        name: 'Protection',
        blurb: 'One removal spell should not undo four turns of ramp.',
        cards: ['Heroic Intervention', 'Veil of Summer', "Tyvar's Stand"],
      },
    ],
  },
  {
    id: 'compact-combo',
    name: 'Two-card combo',
    description: 'Assemble a compact loop and win from an empty board.',
    formats: ['commander'],
    colors: ['U', 'B'],
    targetPower: { min: 8, max: 10 },
    packages: [
      {
        name: 'The combo',
        blurb: 'Two cards, both individually castable, both individually useful.',
        cards: ["Thassa's Oracle", 'Demonic Consultation', 'Underworld Breach', 'Brain Freeze'],
      },
      {
        name: 'Tutors',
        blurb: 'Compact combos live or die on how reliably you can find the halves.',
        cards: ['Demonic Tutor', 'Vampiric Tutor', 'Imperial Seal', 'Grim Tutor'],
      },
      {
        name: 'Protection',
        blurb: 'Winning through one open blue mana is the whole game.',
        cards: ['Silence', 'Grand Abolisher', 'Pact of Negation', 'Veil of Summer'],
      },
    ],
  },
  {
    id: 'aggro',
    name: 'Aggro',
    description: 'Cheap threats and reach. End the game before the table stabilises.',
    formats: ['standard', 'pioneer', 'modern'],
    colors: ['R'],
    targetPower: { min: 4, max: 6 },
    packages: [
      {
        name: 'One-drops',
        blurb: 'Curve out from turn one or the plan does not work.',
        cards: ['Monastery Swiftspear', 'Goblin Guide', 'Kird Ape'],
      },
      {
        name: 'Burn',
        blurb: 'Reach for the last few points once the board stalls.',
        cards: ['Lightning Bolt', 'Lava Spike', 'Rift Bolt', 'Skewer the Critics'],
      },
    ],
  },
  {
    id: 'tokens',
    name: 'Tokens',
    description: 'Fill the board with bodies nobody spent a card on, then make them matter.',
    formats: ['commander', 'brawl'],
    colors: ['G', 'W'],
    targetPower: { min: 5, max: 7 },
    packages: [
      {
        name: 'Token makers',
        blurb: 'One card has to leave several bodies behind, or the board never gets wide.',
        cards: ['Hordeling Outburst', 'Dragon Fodder', 'Secure the Wastes', 'March of the Multitudes'],
      },
      {
        name: 'Doublers',
        blurb: 'The multiplier is what separates a token deck from a deck with some tokens.',
        cards: ['Anointed Procession', 'Parallel Lives', 'Doubling Season'],
      },
      {
        name: 'Payoffs',
        blurb: 'A wide board that cannot convert is a wide board that gets swept.',
        cards: ['Impact Tremors', 'Intangible Virtue', 'Beastmaster Ascension', "Cathars' Crusade"],
      },
    ],
  },
  {
    id: 'counters',
    name: '+1/+1 counters',
    description: 'Grow a small board into an unanswerable one, a counter at a time.',
    formats: ['commander', 'brawl'],
    colors: ['G', 'U'],
    targetPower: { min: 5, max: 7 },
    packages: [
      {
        name: 'Counter engines',
        blurb: 'Something has to put counters out repeatedly rather than once.',
        cards: ['Forgotten Ancient', 'Bloodspore Thrinax', 'The Ozolith'],
      },
      {
        name: 'Multipliers',
        blurb: 'Every counter placed should be worth two.',
        cards: ['Hardened Scales', 'Corpsejack Menace', 'Branching Evolution'],
      },
      {
        name: 'Proliferate',
        blurb: 'The cheapest way to add a counter to everything at once.',
        cards: ['Inexorable Tide', 'Thrummingbird', 'Contagion Clasp', 'Flux Channeler'],
      },
    ],
  },
  {
    id: 'value',
    name: 'Value engine',
    description: 'Spend every card twice and win because the table ran out of cards first.',
    formats: ['commander', 'brawl'],
    colors: ['G', 'B'],
    targetPower: { min: 5, max: 7 },
    packages: [
      {
        name: 'Card advantage',
        blurb: 'A source of extra cards that keeps working after the turn it was cast.',
        cards: ['Phyrexian Arena', 'Sylvan Library', 'Guardian Project', 'Rhystic Study'],
      },
      {
        name: 'Bodies that pay you',
        blurb: 'A creature that already replaced itself costs nothing to lose.',
        cards: ['Solemn Simulacrum', 'Mulldrifter', 'Skyclave Apparition'],
      },
      {
        name: 'Recursion',
        blurb: 'The second copy of a good card is the cheapest good card in the deck.',
        cards: ['Eternal Witness', 'Timeless Witness', 'Regrowth', 'Sun Titan'],
      },
    ],
  },
];

/** Every card name this catalogue names, deduplicated. */
export function shellCardNames(shell: DeckArchetype): string[] {
  return [...new Set(shell.packages.flatMap(p => p.cards))];
}

/**
 * The shell behind an archetype a PLAYER asked for, when there is one.
 *
 * Separate from {@link shellForArchetype} below, which answers about an
 * archetype the analyser DETECTED in a finished deck. This one answers about a
 * string that arrived in a build request, and the two vocabularies do not
 * match: the request value comes from `AIBuilder.tsx`, which offers four
 * options built from the commander's own oracle text plus fillers, and a
 * language model is free to return others beside them.
 *
 * Matching is on the id, the name, or one of the aliases below, lowercased with
 * punctuation stripped. It is deliberately NOT fuzzy. A shell decides what a
 * deck is built out of now, so matching "aggressive tokens" to the aggro shell
 * because both contain a letter run would build the wrong deck and say nothing;
 * an unmatched name returns undefined, the build is shaped by the commander
 * alone, and `pipeline.ts` logs the name that did not match so the gap is
 * countable rather than invisible.
 *
 * `midrange` is deliberately absent. `AIBuilder.tsx` offers it as the first of
 * four fillers when the commander's text suggests nothing, and its own blurb
 * calls it "balanced approach with efficient threats", which is a description
 * of having no shell. Mapping it to one would be inventing a strategy the
 * player did not ask for.
 */
const SHELL_ALIASES: Record<string, string> = {
  aristocrats: 'aristocrats',
  sacrifice: 'aristocrats',
  sac: 'aristocrats',
  control: 'control',
  'draw go': 'control',
  bigmana: 'big-mana',
  'big mana': 'big-mana',
  ramp: 'big-mana',
  'ramp big mana': 'big-mana',
  combo: 'compact-combo',
  'compact combo': 'compact-combo',
  'two card combo': 'compact-combo',
  aggro: 'aggro',
  aggressive: 'aggro',
  beatdown: 'aggro',
  tokens: 'tokens',
  token: 'tokens',
  'token strategy': 'tokens',
  'go wide': 'tokens',
  counters: 'counters',
  // `shellKey` turns "+1/+1 counters" into this, which is also what the shell's
  // own name reduces to, so the name match below would catch it too.
  '1 1 counters': 'counters',
  'plus one counters': 'counters',
  value: 'value',
  'value engine': 'value',
};

/** Lowercase, and every run of non-alphanumerics becomes one space. */
function shellKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function shellForRequestedArchetype(requested: string): DeckArchetype | undefined {
  const key = shellKey(requested ?? '');
  if (!key) return undefined;
  const id = SHELL_ALIASES[key];
  if (id) return DECK_ARCHETYPES.find(shell => shell.id === id);
  return DECK_ARCHETYPES.find(
    shell => shellKey(shell.id) === key || shellKey(shell.name) === key
  );
}

/**
 * The shell behind a detected archetype name, when there is one.
 *
 * `ArchetypeDetection` names themes off `cards.tags` density and its
 * vocabulary is wider than this catalogue: Blink/ETB, Voltron, Storm, Landfall
 * and the rest are detected and have no shell written down. Those return
 * `undefined` rather than being matched to something close, because a shell
 * that is nearly the deck you are holding is worse than no shell.
 */
const SHELL_BY_DETECTED_NAME: Record<string, string> = {
  Aristocrats: 'aristocrats',
  Control: 'control',
  'Ramp/Big Mana': 'big-mana',
};

export function shellForArchetype(detectedName: string): DeckArchetype | undefined {
  const id = SHELL_BY_DETECTED_NAME[detectedName];
  return id ? DECK_ARCHETYPES.find(shell => shell.id === id) : undefined;
}
