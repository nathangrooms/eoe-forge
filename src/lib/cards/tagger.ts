/**
 * Deterministic MTG role tagger.
 *
 * The `cards.tags` column used to hold card *types* — `creature`, `instant`,
 * `artifact` — plus five crude role guesses derived from `text.includes('add')`
 * style tests. Measured across the 34,088-row catalogue that produced
 * `creature` 18,824 / `removal` 5,536 / `sacrifice` 66 / `recursion` 23, and
 * left Sol Ring carrying no role at all. "Works well with" and the deck
 * builder's role quotas had nothing to work from.
 *
 * This module derives ROLES. It is pure: a card row in, a sorted string[] out,
 * no network, no database, no clock. Every rule is a boolean tree over four
 * normalised inputs — oracle text, type line, keywords, mana cost/value — so
 * the same rules can be, and are, compiled to a Postgres function
 * (`public.derive_card_tags`) by `scripts/generate-tagger-sql.ts`. The SQL is
 * generated from `TAG_RULES` below, never hand-written, so the two can not
 * drift.
 *
 * ## Precision over recall
 * A wrong tag is worse than a missing one: a mis-tagged card poisons every
 * synergy list it appears in, whereas an untagged card is merely absent. So the
 * rules demand specific phrasing. `draw a card` is card draw; the bare word
 * "draw" is not. `sacrifice a creature:` (a colon — an activated-ability cost)
 * is a sacrifice outlet; the word "sacrifice" is not.
 *
 * ## Three things the normaliser has to do first
 * 1. **Reminder text is stripped.** Smothering Tithe's Treasure reminder reads
 *    "{T}, Sacrifice this token: Add one mana of any color" — matching it would
 *    make every Treasure producer a sacrifice outlet and a mana rock.
 * 2. **The card's own name is replaced with `~`.** Oracle text still says
 *    "Blasphemous Act deals 13 damage to each creature", and card names contain
 *    trigger words.
 * 3. **Faces are folded in.** 802 rows have a null `oracle_text` and a populated
 *    `faces` — every transform, modal DFC, split and adventure card. Reading
 *    only the top level classifies all of them as blanks.
 *
 * ## Templating note
 * Post-2024 oracle text says "When this creature enters", not "When CARDNAME
 * enters the battlefield". Craterhoof Behemoth in our own table reads "When
 * this creature enters, creatures you control gain trample...". Any pattern
 * anchored on the literal "enters the battlefield" now misses most of the
 * catalogue, so the rules match on `enters` and accept both.
 *
 * ## Portability constraint
 * Patterns must mean the same thing to JavaScript and to Postgres ARE:
 *   - no lookaround (Postgres has none),
 *   - no bare `.` (Postgres `.` matches newline, JS `.` does not) — use an
 *     explicit class such as `[^\n]`,
 *   - lowercase literals only; the inputs are lowercased so no `i` flag is
 *     needed and none is applied.
 * `assertPortablePatterns()` enforces this and the test suite calls it.
 */

/* ------------------------------------------------------------------ *
 * Card shape
 * ------------------------------------------------------------------ */

export interface TaggerCardFace {
  name?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
}

/** Every field the rules read. Structurally satisfied by a `cards` row. */
export interface TaggerCard {
  name?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
  keywords?: string[] | null;
  mana_cost?: string | null;
  cmc?: number | string | null;
  /** Our column. */
  faces?: TaggerCardFace[] | null;
  /** Scryfall's name for the same thing, so a live API card also works. */
  card_faces?: TaggerCardFace[] | null;
}

/* ------------------------------------------------------------------ *
 * Condition model — the single source of truth, compiled to SQL
 * ------------------------------------------------------------------ */

export type TagCondition =
  /** Normalised oracle text matches. */
  | { kind: 'text'; re: string }
  /** Normalised type line matches. */
  | { kind: 'type'; re: string }
  /** Raw mana cost (lowercased) matches. */
  | { kind: 'mana'; re: string }
  /** Scryfall keyword list contains any of these (lowercased). */
  | { kind: 'kw'; of: string[] }
  | { kind: 'cmcLte'; n: number }
  | { kind: 'cmcGte'; n: number }
  | { kind: 'not'; of: TagCondition }
  | { kind: 'any'; of: TagCondition[] }
  | { kind: 'all'; of: TagCondition[] };

export interface TagRule {
  /** Canonical tag. */
  tag: string;
  when: TagCondition;
  /**
   * Legacy tag names emitted alongside the canonical one. The deck builder's
   * templates and `ArchetypeDetection` already query `removal-spot`,
   * `sac_outlet`, `lands-matter` and friends; dropping those names would
   * silently empty existing quotas, so the canonical rule emits both.
   */
  also?: string[];
  /** Why this rule exists / what it deliberately excludes. */
  note?: string;
}

const t = (re: string): TagCondition => ({ kind: 'text', re });
const tl = (re: string): TagCondition => ({ kind: 'type', re });
const mana = (re: string): TagCondition => ({ kind: 'mana', re });
const kw = (...of: string[]): TagCondition => ({ kind: 'kw', of });
const not = (of: TagCondition): TagCondition => ({ kind: 'not', of });
const any = (...of: TagCondition[]): TagCondition => ({ kind: 'any', of });
const all = (...of: TagCondition[]): TagCondition => ({ kind: 'all', of });
const cmcLte = (n: number): TagCondition => ({ kind: 'cmcLte', n });

/* ------------------------------------------------------------------ *
 * Shared sub-patterns
 * ------------------------------------------------------------------ */

/**
 * An activated mana ability: something to the left of a colon, "add" to the
 * right. Catches Sol Ring's "{T}: Add {C}{C}", Llanowar Elves' "{T}: Add {G}"
 * and every signet, and excludes rituals (no colon) which are matched
 * separately.
 */
const MANA_ABILITY = ': add (\\{|one |two |three |four |five |six |x |that much )';

/**
 * A mana ability whose cost includes a sacrifice — Ashnod's Altar, Krark-Clan
 * Ironworks, Phyrexian Altar. These are sacrifice outlets that happen to make
 * mana, not mana rocks, so `mana-rock`/`mana-dork` exclude them.
 */
const SAC_MANA_ABILITY = '(^|\\n)[^\\n:]{0,60}sacrifice[^\\n:]{0,60}: add ';

/** A ritual: "Add {B}{B}{B}." as a spell effect, no activated-ability colon. */
const RITUAL = '(^|\\n)add (\\{|one |two |three |four |x )';

/** Searching specifically and only for lands — that is ramp, not tutoring. */
const LAND_SEARCH =
  'search your library for [^\\n]{0,60}(basic land|land card|basic plains|plains, island|island, swamp|forest card|mountain card|swamp card|plains card)';

/**
 * Creature types common enough to anchor a tribal payoff on. Both singular and
 * plural spellings, because "elves"/"dwarves"/"wolves" do not pluralise with a
 * bare `s` and a `s?` suffix would miss every Elf lord.
 */
const TRIBES = [
  'human', 'humans', 'elf', 'elves', 'goblin', 'goblins', 'wizard', 'wizards',
  'warrior', 'warriors', 'soldier', 'soldiers', 'beast', 'beasts', 'dragon', 'dragons',
  'angel', 'angels', 'demon', 'demons', 'vampire', 'vampires', 'zombie', 'zombies',
  'spirit', 'spirits', 'elemental', 'elementals', 'merfolk', 'knight', 'knights',
  'cleric', 'clerics', 'rogue', 'rogues', 'shaman', 'shamans', 'giant', 'giants',
  'dwarf', 'dwarves', 'treefolk', 'sliver', 'slivers', 'cat', 'cats', 'dog', 'dogs',
  'wolf', 'wolves', 'bird', 'birds', 'snake', 'snakes', 'spider', 'spiders',
  'insect', 'insects', 'fungus', 'fungi', 'saproling', 'saprolings', 'pirate', 'pirates',
  'ninja', 'ninjas', 'samurai', 'monk', 'monks', 'druid', 'druids', 'rat', 'rats',
  'bear', 'bears', 'horror', 'horrors', 'construct', 'constructs', 'golem', 'golems',
  'thopter', 'thopters', 'phyrexian', 'phyrexians', 'dinosaur', 'dinosaurs',
  'hydra', 'hydras', 'god', 'gods', 'minotaur', 'minotaurs', 'centaur', 'centaurs',
  'satyr', 'satyrs', 'faerie', 'faeries', 'kithkin', 'kor', 'leonin', 'naga',
  'orc', 'orcs', 'ogre', 'ogres', 'troll', 'trolls', 'myr', 'assassin', 'assassins',
  'archer', 'archers', 'berserker', 'berserkers', 'advisor', 'advisors',
  'noble', 'nobles', 'peasant', 'peasants', 'citizen', 'citizens',
  'artificer', 'artificers', 'mercenary', 'mercenaries', 'rebel', 'rebels',
  'werewolf', 'werewolves', 'wurm', 'wurms', 'kraken', 'leviathan', 'leviathans',
  'serpent', 'serpents', 'crab', 'crabs', 'fish', 'frog', 'frogs', 'lizard', 'lizards',
  'salamander', 'salamanders', 'turtle', 'turtles', 'plant', 'plants', 'bat', 'bats',
  'boar', 'boars', 'elephant', 'elephants', 'ox', 'oxen', 'goat', 'goats',
  'rhino', 'rhinos', 'squirrel', 'squirrels', 'otter', 'otters', 'fox', 'foxes',
  'griffin', 'griffins', 'pegasus', 'unicorn', 'unicorns', 'sphinx', 'sphinxes',
  'gargoyle', 'gargoyles', 'scarecrow', 'scarecrows', 'servo', 'servos',
  'drake', 'drakes', 'imp', 'imps', 'devil', 'devils', 'nightmare', 'nightmares',
  'shade', 'shades', 'skeleton', 'skeletons', 'monkey', 'monkeys', 'ape', 'apes',
  'mouse', 'mice', 'raccoon', 'raccoons', 'bringer', 'illusion', 'illusions',
].join('|');

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

export const TAG_RULES: TagRule[] = [
  /* ---- Card types. Kept because CardRelated and the builder both read them,
     and because a role list without types loses the type-line filters. ---- */
  { tag: 'creature', when: tl('creature') },
  { tag: 'instant', when: tl('instant') },
  { tag: 'sorcery', when: tl('sorcery') },
  { tag: 'artifact', when: tl('artifact') },
  { tag: 'enchantment', when: tl('enchantment') },
  { tag: 'planeswalker', when: tl('planeswalker') },
  { tag: 'land', when: tl('land') },
  { tag: 'battle', when: tl('battle') },
  { tag: 'basic-land', when: tl('basic[^\\n]{0,20}land') },
  { tag: 'equipment', when: tl('equipment') },
  { tag: 'aura', when: tl('aura'), also: ['auras'] },
  { tag: 'vehicle', when: tl('vehicle') },

  /* ---- Mana ---- */
  {
    tag: 'ramp',
    note:
      'Mana production or extra land drops. Lands qualify only when a single ' +
      'activation yields two or more mana (Ancient Tomb, Cabal Coffers) — ' +
      'otherwise every basic Forest would be "ramp".',
    when: any(
      all(t(MANA_ABILITY), not(tl('land'))),
      t(RITUAL),
      t('search your library for [^\\n]{0,70}land[^\\n]{0,90}onto the battlefield'),
      t('you may play an additional land'),
      t('play an additional land'),
      t('creates? [^\\n]{0,60}treasure token'),
      all(
        tl('land'),
        any(
          t(': add [^\\n]{0,8}\\{[wubrgc]\\}[^\\n]{0,8}\\{[wubrgc]\\}'),
          t(': add [^\\n]{0,40}for each'),
          t(': add (two|three|four|x) '),
        ),
      ),
    ),
  },
  {
    tag: 'mana-rock',
    note: 'Non-creature artifact with a mana ability whose cost is not a sacrifice.',
    when: all(tl('artifact'), not(tl('creature')), not(tl('land')), t(MANA_ABILITY), not(t(SAC_MANA_ABILITY))),
  },
  {
    tag: 'mana-dork',
    when: all(tl('creature'), t(MANA_ABILITY), not(t(SAC_MANA_ABILITY))),
  },
  {
    tag: 'fast-mana',
    note: 'One mana or less, produces two or more — Sol Ring, Mana Crypt, Lotus Petal.',
    when: all(
      cmcLte(1),
      not(tl('land')),
      any(
        t(': add [^\\n]{0,8}\\{[wubrgc]\\}[^\\n]{0,8}\\{[wubrgc]\\}'),
        t(': add (two|three|four) '),
        t('(^|\\n)add [^\\n]{0,8}\\{[wubrgc]\\}[^\\n]{0,8}\\{[wubrgc]\\}'),
      ),
    ),
  },
  { tag: 'treasure', when: t('treasure token') },
  {
    tag: 'cost-reduction',
    note:
      'Reduces OTHER spells. "This spell costs {1} less" (Blasphemous Act) is ' +
      'self-discounting, not a cost reducer, and is excluded by requiring ' +
      '"you cast cost" or "spells cost".',
    when: any(
      t('you cast costs? \\{\\d+\\} less'),
      t('spells cost \\{\\d+\\} less to cast'),
      t('abilities [^\\n]{0,30}cost \\{\\d+\\} less'),
      t('you cast costs? \\{\\d+\\} less to cast'),
    ),
  },

  /* ---- Card flow ---- */
  {
    tag: 'card-draw',
    note:
      'English templating separates "draw" (you) from "draws" (someone else), ' +
      'so requiring "draw <quantity> card" keeps out "each player draws a card" ' +
      'and "target opponent draws", which are group-hug and gift effects.',
    also: ['draw'],
    when: any(
      t('draw (a|one|two|three|four|five|six|seven|eight|nine|ten|x|\\d+|that many) cards?'),
      t('draw cards equal to'),
      t('draw that many cards'),
    ),
  },
  {
    tag: 'tutor',
    note: 'Library search that is not purely a land fetch.',
    when: all(t('search your library for'), not(t(LAND_SEARCH))),
  },
  {
    tag: 'tutor-broad',
    note: 'Fetches any card at all — Demonic Tutor, Vampiric Tutor, Enlightened Tutor is narrow.',
    when: any(t('search your library for a card'), t('search your library for any card')),
  },
  {
    tag: 'tutor-narrow',
    when: all(t('search your library for'), not(t(LAND_SEARCH)), not(t('search your library for a card'))),
  },
  {
    tag: 'group-hug',
    when: any(
      t('each player draws'),
      t('each other player draws'),
      t('each player may draw'),
      t('each player searches their library'),
      t('each player may search'),
    ),
  },
  {
    tag: 'mill',
    when: any(
      t('mills? (a|one|two|three|four|five|six|seven|ten|x|\\d+|that many)'),
      t('puts? the top (\\d+|one|two|three|four|five|seven|ten|x) cards? of [^\\n]{0,30}library into [^\\n]{0,30}graveyard'),
    ),
  },
  {
    tag: 'self-mill',
    when: any(t('you mill (a|one|two|three|four|five|six|seven|ten|x|\\d+)'), t('mill (a|one|two|three|four|five|six|seven|ten|x|\\d+) cards?, then')),
  },
  {
    tag: 'discard',
    note: 'Opponent-facing hand attack only. Self-discard is `discard-outlet`.',
    when: any(
      t('(each|target|that) (opponent|player|other player) discards'),
      t('each other player discards'),
      t('opponents? discards?'),
      t('discards? their hand'),
    ),
  },
  {
    tag: 'discard-outlet',
    when: any(
      t('(^|\\n|, )discard (a|one|two|three|x|\\d+|your hand) card'),
      t('discard (a|one|two|three|x|\\d+) cards?:'),
      t('then discard (a|one|two|three|x|\\d+) cards?'),
    ),
  },

  /* ---- Interaction ---- */
  {
    tag: 'targeted-removal',
    also: ['removal', 'removal-spot'],
    note:
      'Exiling something YOU control is a blink or a sacrifice, not removal — ' +
      'Ephemerate reads "exile target creature you control, then return it". ' +
      'Oblivion Ring, which exiles an opponent\'s permanent and returns it ' +
      'later, is deliberately still removal.',
    when: all(
      not(t('(destroy|exile) (target|another target)[^\\n]{0,40}(creature|permanent|artifact|enchantment|land) you control')),
      any(
        t('(destroy|exile) (target|another target|up to (one|two|three|four|x) target|each of up to (one|two|three) target)[^\\n]{0,60}(creature|permanent|artifact|enchantment|planeswalker|land|battle)'),
        t('target creature gets -\\d+/-\\d+'),
        t('target creature gets -x/-x'),
        t('deals \\d+ damage to target (creature|planeswalker|battle|creature or)'),
        t('deals \\d+ damage to any target'),
        t('deals x damage to (target|any target)'),
        t('deals damage to (target creature|any target) equal to'),
        t('target (player|opponent) sacrifices a (creature|permanent|nonland permanent)'),
        t('each opponent sacrifices a (creature|permanent|nonland permanent)'),
        t('fights? target creature'),
        t('put target (creature|nonland permanent)[^\\n]{0,40}(on the bottom|into (its|their) owner)'),
      ),
    ),
  },
  {
    tag: 'board-wipe',
    also: ['removal', 'removal-sweeper'],
    note:
      'Cyclonic Rift reaches this through `overload`, which rewrites "target" ' +
      'to "each" — the single-target text alone would never read as a wipe.',
    when: any(
      t('(destroy|exile) all (creature|nonland|permanent|artifact|enchantment|land|planeswalker|token)'),
      t('(destroy|exile) each (creature|nonland|permanent|artifact|enchantment)'),
      t('all creatures get -\\d+/-\\d+'),
      t('all creatures get -x/-x'),
      t('deals \\d+ damage to each creature'),
      t('deals x damage to each creature'),
      t('each player sacrifices (all|half|x|\\d+|one|two|three)'),
      t('sacrifices all (creature|permanent)'),
      t('return all (nonland permanents|creatures|permanents|artifacts|enchantments)'),
      all(
        t('overload \\{'),
        any(
          t('(destroy|exile) target'),
          t('return target'),
          t('target creature gets -'),
          t('deals \\d+ damage to target'),
        ),
      ),
    ),
  },
  {
    tag: 'bounce',
    when: any(
      t('return (target|all|each|another target|up to (one|two|three|x) target)[^\\n]{0,80}to (its|their) owner'),
      t('return (target|all|each)[^\\n]{0,80}to (its|their) (owner|controller)'),
    ),
  },
  {
    tag: 'counterspell',
    when: any(
      t('counter target (spell|creature spell|noncreature spell|artifact spell|activated|triggered|ability)'),
      t('counter that spell'),
      t('counter it unless'),
      t('counter target spell'),
    ),
  },
  {
    tag: 'land-destruction',
    when: any(
      t('(destroy|exile) target( nonbasic| basic)? land'),
      t('destroy all lands'),
      t('(each player|target player|each opponent) sacrifices a land'),
    ),
  },
  {
    tag: 'graveyard-hate',
    note:
      'Someone else\'s graveyard. "Exile two cards from your graveyard" is a ' +
      'delve/escape COST, not hate, so a bare "from your graveyard" does not qualify.',
    when: any(
      t('exile [^\\n]{0,50}from (a|target players|each players|target opponents|all) graveyard'),
      t('exile (target players|each players|all|target opponents)[^\\n]{0,20}graveyard'),
      t('exile all cards from (all|each|target)'),
      t('cards? in graveyards? cant be'),
      t('graveyards? cant'),
      t('if a card would be put into (a|an opponents) graveyard'),
    ),
  },
  {
    tag: 'stax',
    note:
      'Taxes and denial. Rhystic Study lands here as well as card-draw via ' +
      '"unless that player pays" — it genuinely is a tax effect.',
    when: any(
      t('spells? cost \\{\\d+\\} more'),
      t('costs? \\{\\d+\\} more to cast'),
      t('unless that player pays'),
      t('unless they pay'),
      t('unless its controller pays'),
      t('unless that players? controller pays'),
      t('players cant'),
      t('your opponents cant'),
      t('each opponent cant'),
      t('cant cast spells'),
      t('cant search'),
      // Plural subject only. "This artifact doesn't untap during your untap
      // step" is Basalt Monolith's own drawback, not a stax piece.
      t('(lands|creatures|permanents|artifacts|players) [^\\n]{0,30}dont untap during'),
      t('skip (your|their|that players) (draw|untap|combat|precombat)'),
      // "You have no maximum hand size" is Reliquary Tower, a benefit.
      t('maximum hand size is'),
      t('cant draw more than'),
      t('creatures cant attack'),
    ),
  },
  {
    tag: 'protection',
    note: 'Grants protection. A creature that merely HAS hexproof is not a protection spell.',
    when: any(
      t('gains? (hexproof|indestructible|shroud|protection from|ward)'),
      t('(creatures|permanents|artifacts|enchantments) you control (have|gain) (hexproof|indestructible|shroud|protection from|ward)'),
      t('you have hexproof'),
      t('have (hexproof|indestructible|shroud) until end of turn'),
      t('prevent all (damage|combat damage)'),
      t('regenerate target'),
      t('(creatures|permanents) you control cant be'),
    ),
  },

  /* ---- Graveyard ---- */
  {
    tag: 'graveyard-recursion',
    also: ['recursion'],
    when: any(
      t('return [^\\n]{0,70}from your graveyard to (your hand|the battlefield)'),
      t('return [^\\n]{0,70}from (a|your|target players) graveyard to the battlefield'),
      t('put [^\\n]{0,70}from your graveyard (onto|on) the battlefield'),
      t('return [^\\n]{0,40}card from your graveyard'),
      kw('flashback', 'unearth', 'escape', 'disturb', 'embalm', 'eternalize', 'encore', 'jump-start', 'aftermath', 'retrace'),
    ),
  },
  {
    tag: 'reanimator',
    when: any(
      t('return target creature card from (a|your|target players) graveyard to the battlefield'),
      t('put target creature card from (a|your) graveyard onto the battlefield'),
      t('return [^\\n]{0,30}creature card[^\\n]{0,40}graveyard to the battlefield'),
      kw('unearth', 'encore'),
    ),
  },

  /* ---- Sacrifice / aristocrats ---- */
  {
    tag: 'sacrifice-outlet',
    also: ['sac-outlet', 'sac_outlet', 'sacrifice'],
    note:
      'The sacrifice must sit in an activated-ability COST — left of a colon on ' +
      'its own line. "Sacrifice a creature. If you do..." is a one-shot effect, ' +
      'not an outlet, and has no colon.',
    when: any(
      t('(^|\\n)[^\\n:]{0,70}sacrifice (a|an|another|one|two|three|x|\\d+|this|it|any number of)[^\\n:]{0,60}:'),
      t('(^|\\n)[^\\n:]{0,70}sacrifice (a|an|another)[^\\n:]{0,60}:'),
    ),
  },
  {
    tag: 'aristocrats',
    when: any(
      t('whenever [^\\n]{0,70}creature[^\\n]{0,30} dies'),
      t('whenever [^\\n]{0,50}dies, (you|each|target|that)'),
      t('whenever you sacrifice'),
      t('whenever [^\\n]{0,40}creature you control dies'),
    ),
  },

  /* ---- Tokens & counters ---- */
  {
    tag: 'token-maker',
    also: ['tokens'],
    note: 'The verb "create" is required — "creature tokens you control get +1/+1" is a payoff, not a maker.',
    when: any(
      t('creates? [^\\n]{0,90}token'),
      t('put [^\\n]{0,50}token onto the battlefield'),
      t('creates? that many'),
    ),
  },
  {
    tag: 'counters',
    when: any(t('\\+1/\\+1 counter'), kw('modular', 'evolve', 'adapt', 'bolster', 'outlast', 'renown', 'mentor', 'training', 'backup')),
  },
  { tag: 'proliferate', when: t('proliferate') },
  { tag: 'infect', when: any(kw('infect', 'toxic'), t('poison counter'), t('(^|\\n)infect')) },

  /* ---- Tempo / combat ---- */
  {
    tag: 'haste-enabler',
    note: 'Grants haste to something else. A creature that simply has Haste does not qualify.',
    when: any(
      t('(creatures|creature tokens|permanents|they|it|those creatures) you control (gain|gains|have|has) haste'),
      t('gains? haste'),
      t('creatures you control have haste'),
      t('has haste for as long as'),
    ),
  },
  { tag: 'extra-turn', when: any(t('takes? an extra turn'), t('take an extra turn after this one')) },
  { tag: 'extra-combat', when: any(t('additional combat phase'), t('an additional combat')) },
  {
    tag: 'untapper',
    when: any(
      t('untap (target|another target|all|each|up to (one|two|three|four|five|x) target)'),
      t('untap all (creatures|lands|permanents|artifacts)'),
      t('untap [^\\n]{0,30}during each (other players|opponents) untap step'),
    ),
  },
  {
    tag: 'blink',
    when: any(
      t('exile [^\\n]{0,90}return (it|them|that card|those cards|the exiled card|the exiled cards)[^\\n]{0,90}to the battlefield'),
      t('exile [^\\n]{0,90}then return (it|them|those cards)[^\\n]{0,60}to the battlefield'),
      t('exile [^\\n]{0,60}return (it|them)[^\\n]{0,60}under (its|their|your) owners control'),
    ),
  },
  {
    tag: 'clone',
    when: any(t('as a copy of'), t('copy of (any|target) (creature|permanent|artifact)'), t('enters as a copy')),
  },
  { tag: 'flash', when: any(kw('flash'), t('as though it had flash')) },
  { tag: 'cascade', when: kw('cascade') },
  {
    tag: 'evasion',
    when: any(kw('flying', 'menace', 'shadow', 'fear', 'intimidate', 'horsemanship', 'skulk'), t('cant be blocked')),
  },
  {
    tag: 'finisher',
    note: 'Mass pump and alternate wins. Craterhoof reaches this through "creatures you control ... get +X/+X".',
    when: any(
      t('you win the game'),
      t('(target player|each opponent) loses the game'),
      t('creatures you control [^\\n]{0,60}get \\+(x|\\d+)/\\+(x|\\d+)'),
      t('creatures you control get \\+(x|\\d+)/\\+(x|\\d+)'),
      t('each opponent loses \\d+ life for each'),
    ),
    also: ['wincon'],
  },
  { tag: 'mass-pump', when: any(t('creatures you control get \\+'), t('creatures you control [^\\n]{0,60}get \\+')) },
  {
    tag: 'lifegain',
    note: '"Its controller gains life" (Swords to Plowshares) is the opponent gaining, and is excluded.',
    when: any(
      t('you gain (\\d+|x|that much) life'),
      t('you gain life equal to'),
      t('(^|\\n)gain (\\d+|x) life'),
      t('whenever you gain life'),
      kw('lifelink'),
      t('(creatures|permanents) you control (have|gain) lifelink'),
    ),
  },

  /* ---- Archetype anchors ---- */
  { tag: 'voltron', when: any(t('equipped creature gets \\+'), t('enchanted creature gets \\+'), t('equipped creature has'), t('enchanted creature has')) },
  { tag: 'landfall', also: ['lands-matter'], when: any(t('landfall'), t('whenever a land (you control )?enters')) },
  { tag: 'lands-matter', when: any(t('for each land you control'), t('lands you control'), t('whenever a land [^\\n]{0,20}enters')) },
  { tag: 'artifacts-matter', when: any(t('for each artifact you control'), t('artifacts you control (get|have|gain)'), t('whenever (an|another) artifact [^\\n]{0,30}enters'), kw('affinity', 'metalcraft', 'improvise', 'prototype')) },
  { tag: 'enchantments-matter', when: any(t('for each enchantment you control'), t('enchantments you control (get|have|gain)'), t('whenever an enchantment [^\\n]{0,30}enters'), kw('constellation')) },
  { tag: 'spellslinger', when: any(t('whenever you cast (an|a) (instant|sorcery|noncreature)'), t('instant or sorcery spell you cast'), t('for each instant and sorcery card')) },
  { tag: 'prowess', when: any(kw('prowess'), t('whenever you cast a noncreature spell, this')) },
  { tag: 'storm', when: any(kw('storm'), t('for each spell cast before it'), t('for each spell (youve|you have) cast this turn')) },
  {
    tag: 'tribal-payoff',
    when: any(
      t(`(^| )(other )?(${TRIBES}) (creatures )?you control (get|gain|have)`),
      t('choose a creature type'),
      t('creatures of the chosen type'),
      t(`(^| )other (${TRIBES}) you control`),
      t('creature type of your choice'),
    ),
  },
  { tag: 'etb', when: any(t('when [^\\n]{0,40}enters'), t('whenever [^\\n]{0,40}enters the battlefield')) },
  { tag: 'x-spell', when: mana('\\{x\\}') },
];

/** Every tag the module can emit, sorted. Useful for UI filters and tests. */
export const ALL_TAGS: string[] = Array.from(
  new Set(TAG_RULES.flatMap((r) => [r.tag, ...(r.also ?? [])])),
).sort();

/* ------------------------------------------------------------------ *
 * Normalisation — must match `public.derive_card_tags` exactly
 * ------------------------------------------------------------------ */

function faceList(card: TaggerCard): TaggerCardFace[] {
  const faces = card.faces ?? card.card_faces;
  return Array.isArray(faces) ? faces : [];
}

/**
 * Oracle text of every face, lowercased, with the card's own name replaced by
 * `~`, reminder text removed and apostrophes dropped.
 *
 * Apostrophes go because oracle text mixes the typographic U+2019 with ASCII
 * `'` depending on vintage; normalising both away lets a single pattern
 * (`cant`, `dont`, `owners hand`) match either.
 */
export function normalizeOracleText(card: TaggerCard): string {
  const parts: string[] = [];
  if (card.oracle_text) parts.push(card.oracle_text);
  for (const face of faceList(card)) if (face?.oracle_text) parts.push(face.oracle_text);

  let s = parts.join('\n').toLowerCase();

  // Card names carry trigger words ("Sacrifice", "Draw"), and oracle text still
  // refers to the card by name: "Blasphemous Act deals 13 damage to each creature".
  const names = new Set<string>();
  if (card.name) {
    const lower = card.name.toLowerCase();
    names.add(lower);
    for (const part of lower.split(' // ')) names.add(part.trim());
  }
  for (const face of faceList(card)) if (face?.name) names.add(face.name.toLowerCase());
  for (const n of Array.from(names).sort((a, b) => b.length - a.length)) {
    if (n.length >= 3) s = s.split(n).join('~');
  }

  s = s.replace(/\([^)]*\)/g, ' '); // reminder text
  s = s.replace(/[’'`]/g, ''); // cant / dont / owners
  s = s.replace(/[ \t]+/g, ' ');
  return s;
}

/** Type line of every face, lowercased, em dashes flattened. */
export function normalizeTypeLine(card: TaggerCard): string {
  const parts: string[] = [];
  if (card.type_line) parts.push(card.type_line);
  for (const face of faceList(card)) if (face?.type_line) parts.push(face.type_line);
  return parts.join(' // ').toLowerCase().replace(/[—–]/g, '-');
}

function normalizeKeywords(card: TaggerCard): string[] {
  return (card.keywords ?? []).filter(Boolean).map((k) => String(k).toLowerCase());
}

function numericCmc(card: TaggerCard): number {
  const n = typeof card.cmc === 'string' ? Number(card.cmc) : card.cmc;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

const reCache = new Map<string, RegExp>();
function compiled(source: string): RegExp {
  let re = reCache.get(source);
  if (!re) {
    re = new RegExp(source);
    reCache.set(source, re);
  }
  return re;
}

interface EvalContext {
  text: string;
  type: string;
  keywords: string[];
  mana: string;
  cmc: number;
}

function evaluate(cond: TagCondition, ctx: EvalContext): boolean {
  switch (cond.kind) {
    case 'text':
      return compiled(cond.re).test(ctx.text);
    case 'type':
      return compiled(cond.re).test(ctx.type);
    case 'mana':
      return compiled(cond.re).test(ctx.mana);
    case 'kw':
      return cond.of.some((k) => ctx.keywords.includes(k));
    case 'cmcLte':
      return ctx.cmc <= cond.n;
    case 'cmcGte':
      return ctx.cmc >= cond.n;
    case 'not':
      return !evaluate(cond.of, ctx);
    case 'any':
      return cond.of.some((c) => evaluate(c, ctx));
    case 'all':
      return cond.of.every((c) => evaluate(c, ctx));
  }
}

/**
 * The tagger. Deterministic, side-effect free, order-independent: the same row
 * always yields the same sorted array.
 */
export function deriveCardTags(card: TaggerCard): string[] {
  const ctx: EvalContext = {
    text: normalizeOracleText(card),
    type: normalizeTypeLine(card),
    keywords: normalizeKeywords(card),
    mana: (card.mana_cost ?? '').toLowerCase(),
    cmc: numericCmc(card),
  };

  const out = new Set<string>();
  for (const rule of TAG_RULES) {
    if (!evaluate(rule.when, ctx)) continue;
    out.add(rule.tag);
    for (const alias of rule.also ?? []) out.add(alias);
  }
  return Array.from(out).sort();
}

/* ------------------------------------------------------------------ *
 * Portability guard
 * ------------------------------------------------------------------ */

/**
 * Rejects any pattern that would behave differently in Postgres than in
 * JavaScript. Called by the test suite and by the SQL generator, so a rule that
 * would silently diverge fails loudly at authoring time instead of quietly
 * mis-tagging 34,000 rows.
 */
export function assertPortablePatterns(): void {
  const problems: string[] = [];

  const check = (cond: TagCondition, tag: string): void => {
    switch (cond.kind) {
      case 'text':
      case 'type':
      case 'mana': {
        const re = cond.re;
        // Lookaround: Postgres ARE has none.
        if (/\(\?[=!<]/.test(re)) problems.push(`${tag}: lookaround in /${re}/`);
        // Bare '.' matches newline in Postgres but not in JS.
        let inClass = false;
        for (let i = 0; i < re.length; i++) {
          const ch = re[i];
          if (ch === '\\') { i++; continue; }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '.' && !inClass) problems.push(`${tag}: unescaped '.' in /${re}/`);
        }
        // Uppercase literals would never match the lowercased inputs.
        if (/[A-Z]/.test(re.replace(/\\[A-Za-z]/g, ''))) problems.push(`${tag}: uppercase literal in /${re}/`);
        try { new RegExp(re); } catch { problems.push(`${tag}: invalid regex /${re}/`); }
        break;
      }
      case 'not':
        check(cond.of, tag);
        break;
      case 'any':
      case 'all':
        cond.of.forEach((c) => check(c, tag));
        break;
      default:
        break;
    }
  };

  for (const rule of TAG_RULES) check(rule.when, rule.tag);
  if (problems.length) throw new Error(`Non-portable tagger patterns:\n${problems.join('\n')}`);
}
