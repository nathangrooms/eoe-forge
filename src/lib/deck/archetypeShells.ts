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
        cards: ['Nature’s Lore', 'Three Visits', 'Cultivate', 'Sylvan Scrying'],
      },
      {
        name: 'Payoffs',
        blurb: 'The mana has to buy something the table cannot ignore.',
        cards: ['Craterhoof Behemoth', 'Vorinclex', 'Avenger of Zendikar', 'Genesis Wave'],
      },
      {
        name: 'Protection',
        blurb: 'One removal spell should not undo four turns of ramp.',
        cards: ['Heroic Intervention', 'Veil of Summer', 'Tyvar’s Stand'],
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
        cards: ['Thassa’s Oracle', 'Demonic Consultation', 'Underworld Breach', 'Brain Freeze'],
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
    description: 'Cheap threats and reach — end the game before the table stabilises.',
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
];

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
