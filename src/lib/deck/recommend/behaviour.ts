/**
 * The producer: a card row in, behaviour facets out.
 *
 * This is the join between the two halves of the app that had never been
 * connected. `src/lib/cards/abilities/` compiles Scryfall oracle text into the
 * structured `Ability` DSL and `src/lib/cards/xmage/` holds the ported XMage
 * records behind the same shapes. Both were built for PLAY. Nothing in deck
 * building or recommendation had ever read either of them, which is why the
 * generator still decided what a card was by matching words.
 *
 * WHY THE PRODUCER IS HERE AND NOT IN THE ENGINE
 * ----------------------------------------------
 * `engine-parity.test.ts` requires that nothing under `src/engine/` imports
 * outside `src/engine/`, and that rule is load-bearing: it is the only reason
 * the whole engine tree can be mirrored byte for byte into an edge function
 * bundle. So the engine declares the facet vocabulary
 * (`src/engine/knowledge/behaviour.ts`) and reads facets off the card; this
 * file is the one place that knows how to produce them, and it lives outside.
 *
 * THE PRECEDENCE RULE IS NOT REDECIDED HERE
 * -----------------------------------------
 * Which of the two sources speaks for a card is already settled by
 * `src/lib/cards/xmage/lowered.ts`: the oracle-text compiler wins whenever it
 * fully understands the card, and the XMage record is consulted only for a card
 * the compiler has already marked incomplete. This file calls `xmageSwapFor`
 * rather than reimplementing that rule, so there is one answer to "what does
 * this card do" in the whole repository.
 *
 * WHAT THAT RULE COSTS TODAY, MEASURED
 * ------------------------------------
 * `scratch/xmage-source-census.mjs` runs this producer over all 31,833
 * commander-legal cards in the 2026-08-19 catalogue snapshot and counts where
 * each answer came from. On 2026-08-23: **compiler 24,268, XMage record 1,541,
 * no record at all 7,565**.
 *
 * THAT SECOND FIGURE CORRECTS AN EARLIER ONE. `ENGINE-PICKS.md` part two
 * reported "XMage record 0" and concluded the two sources were disjoint in
 * exactly the wrong place. They are not. The zero came from this file deriving
 * `source` from `abilities.length` instead of from `CardAbilities.source`,
 * which hid every card the compiler had ALREADY swapped internally. Wrath of
 * God and Damnation are two of the 1,541. The reading is fixed below and the
 * report is corrected in part three.
 *
 * The `xmageSwapFor` call here is separate from the compiler's own, and it
 * still fires zero times for the reason the old note gave: it only runs when
 * the compiler is incomplete, and by then the compiler has already consulted
 * the same table. It stays because the day either source moves, it pays.
 *
 * Pure. No network, no database, no AI.
 */

import type {
  Ability,
  CardFilter,
  Cost,
  Effect,
  Selector,
  TokenSpec,
  ValueExpr,
} from '../../cards/abilities/dsl.ts';
import { compileCardAbilities } from '../../cards/abilities/compiler.ts';
import { normalizeCard, type AbilityCard } from '../../cards/abilities/normalize.ts';
import { xmageSwapFor } from '../../cards/xmage/lowered.ts';
import { parseCost } from '../../cards/xmage/compare.ts';
import type { Facet } from '../../../engine/knowledge/behaviour.ts';

/* ------------------------------------------------------------------ *
 * Public shape
 * ------------------------------------------------------------------ */

export interface FacetResult {
  facets: Facet[];
  /**
   * Which source spoke for this card.
   *
   * `'compiler'` — the oracle-text compiler produced abilities.
   * `'xmage'`    — the compiler was incomplete and the ported record replaced it.
   * `'none'`     — neither produced an ability. The engine falls back to tags,
   *                and the caller should count how often this happens.
   */
  source: 'compiler' | 'xmage' | 'none';
  /** The compiler's own verdict, carried through so a caller can report it. */
  coverage: string;
}

/** A row this can read. Every field is a column on `cards` / `cards_unique`. */
export interface FacetInput extends AbilityCard {
  type_line?: string | null;
  oracle_text?: string | null;
}

/**
 * Read one card.
 *
 * Facets are sorted and deduped so two cards with the same behaviour produce
 * the same array, which is what lets a caller compare them, cache them by
 * oracle id, or one day put them in a `text[]` column with a GIN index.
 */
export function facetsForCard(row: FacetInput): FacetResult {
  const out = new Set<Facet>();

  // Type line facts. Always available, never from a record, and the only source
  // for `type:` and `sub:` — the engine's creature role is decided here.
  readTypeLine(row.type_line ?? null, out);

  let abilities: readonly Ability[] = [];
  let source: FacetResult['source'] = 'none';
  let coverage = 'unknown';

  try {
    const compiled = compileCardAbilities(row);
    coverage = compiled.coverage;
    abilities = compiled.abilities;
    /*
     * READ THE COMPILER'S OWN VERDICT, not the length of its output.
     *
     * This line used to say `abilities.length > 0 ? 'compiler' : 'none'`, and
     * that is how `ENGINE-PICKS.md` came to report "XMage record 0". The
     * compiler performs the XMage swap ITSELF — see `xmageSwapFor` inside
     * `compiler.ts` — and reports it on `CardAbilities.source`, so every card
     * the ported record spoke for was being counted as the compiler's.
     * Re-measured over the same 31,833 rows on 2026-08-23 by
     * `scratch/xmage-source-census.mjs`: the record speaks for 1,541 of them,
     * 4.8%, including Wrath of God and Damnation. `book` is the hand-authored
     * path and does not fire anywhere in this catalogue; it is grouped with the
     * compiler rather than given a fourth name nobody would ever see.
     */
    source =
      abilities.length === 0 ? 'none' : compiled.source === 'xmage' ? 'xmage' : 'compiler';

    if (compiled.coverage !== 'full') {
      const swap = xmageSwapFor(compiled, normalizeCard(row));
      if ('swap' in swap && swap.swap.abilities.length > 0) {
        abilities = swap.swap.abilities;
        source = 'xmage';
      }
    }
  } catch {
    // A row the compiler cannot even normalise is a row with no record. It is
    // not a row with no behaviour, and the difference is exactly what `source`
    // carries: the engine will fall back to tags for it.
    abilities = [];
    source = 'none';
  }

  for (const ability of abilities) readAbility(ability, out);

  /*
   * HOW COMPLETELY THE RECORD READ THE CARD. The engine needs this, and it is
   * the difference between two very different silences.
   *
   * Bone Saw compiles to `coverage: 'full'`: the compiler read every clause and
   * none of them is a win condition, so "no wincon facet" is a POSITIVE answer
   * and the engine should not go looking for a `voltron` tag to overrule it.
   *
   * Craterhoof Behemoth compiles to `coverage: 'partial'`: the compiler took
   * the haste keyword and the enters trigger and refused the "creatures you
   * control get +X/+X" clause, which is the entire card. Here "no wincon facet"
   * means NOT READ, and the tags are the only thing left that knows.
   *
   * Emitting the distinction rather than letting the engine infer it from an
   * absence is the same principle the compiler itself runs on: a gap is
   * counted and named, never silently dropped.
   */
  if (coverage === 'full') out.add('rec:full');
  else if (abilities.length > 0) out.add('rec:partial');

  readOwnTypeInRules(row, out);

  return { facets: [...out].sort(), source, coverage };
}

/**
 * DOES THIS CARD'S RULES TEXT NAME ITS OWN CREATURE TYPE.
 *
 * A printed-truth read, and it is here because the record misses it on exactly
 * the cards where it matters most.
 *
 * `CommanderPlan.tribe` in the engine states the rule: the subtype has to be on
 * the commander's own type line AND inside one of its abilities. Krenko passes
 * and Talrand fails, which is right. The problem is the second half. The engine
 * can only ask a compiled record, and the compiler refuses precisely the
 * clauses that make a tribal commander tribal. Measured by
 * `scratch/refute-eight.mjs` on the 2026-08-19 snapshot, over eight commanders
 * the tuning never saw:
 *
 *   Edgar Markov   record reads kw:first strike, kw:haste, sub:knight,
 *                  sub:vampire. The eminence trigger and the +1/+1 attack
 *                  trigger are both refused, so there is no `cares:sub:vampire`
 *                  and no `tok:vampire`.
 *   Lathril        No `tok:elf` from "create that many 1/1 Elf Warrior tokens",
 *                  no `cares:sub:elf` from "Tap ten untapped Elves you control".
 *   Yuriko         No `cares:sub:ninja` from "Whenever a Ninja you control deals
 *                  combat damage to a player".
 *
 * All three came back `tribe: null`, two of them with no wants at all, and all
 * three built a deck of cheap colourless artifacts that was LESS on theme than
 * drawing at random from their own colour pool. That is the owner's "every
 * commander has unique style" test failing on three of eight, silently.
 *
 * So this asks the printed text the same question the record could not answer:
 * does a subtype from this card's own type line appear as a word in its own
 * rules text. Under the division of sources in CLAUDE.md that is Scryfall's
 * half of the job, "printed truth: names, costs, type lines, oracle text", and
 * it is not an attempt to work out what the card DOES, which stays XMage's half
 * and stays with the compiler.
 *
 * WHAT IT DELIBERATELY CANNOT DO. It emits `cares:sub:` and never `tok:` and
 * never an effect, so it can say "this card is about Vampires" and can never
 * say what it does about them. A word is weaker evidence than a record, so the
 * facet it produces is the weakest one that still carries the meaning.
 *
 * THE CASES IT HAS TO GET RIGHT, all asserted in `behaviour.test.ts`:
 *
 *   Talrand, Sky Summoner  A Merfolk Wizard whose text says "instant or sorcery"
 *                          and "Drake". Neither of its own subtypes appears, so
 *                          nothing is emitted and Talrand still has no tribe.
 *   Kaalia of the Vast     A Human Cleric whose text names Angel, Demon and
 *                          Dragon. None of those is her own subtype, so nothing
 *                          is emitted and she gets no tribe, which is right:
 *                          she is not a tribal commander.
 *   Yuriko                 "Ninjutsu" must not match `sub:ninja`. Word
 *                          boundaries, not substrings.
 *
 * Reminder text is stripped first, because "(This card is every creature
 * type.)" is an explanation of a keyword and not the card naming a tribe.
 */
function readOwnTypeInRules(row: FacetInput, out: Set<Facet>): void {
  const subs = [...out].filter(f => f.startsWith('sub:')).map(f => f.slice('sub:'.length));
  if (subs.length === 0) return;

  const text = rulesTextOf(row);
  if (!text) return;

  for (const sub of subs) {
    if (!/^[a-z][a-z'-]*$/.test(sub)) continue;
    if (namesWord(text, sub)) out.add(`cares:sub:${sub}`);
  }
}

/** Every face's rules text, with bracketed reminder text removed. */
function rulesTextOf(row: FacetInput): string {
  const parts: string[] = [];
  if (typeof row.oracle_text === 'string') parts.push(row.oracle_text);
  const faces = (row as { card_faces?: { oracle_text?: string | null }[] | null }).card_faces;
  for (const face of faces ?? []) {
    if (typeof face?.oracle_text === 'string') parts.push(face.oracle_text);
  }
  return parts.join('\n').replace(/\([^)]*\)/g, ' ').toLowerCase();
}

/**
 * Is `word` present as a word, allowing the plurals Magic actually prints?
 *
 * `Elves` is the form that matters and the one a stemmer gets wrong in both
 * directions, so the irregulars are listed rather than derived.
 */
const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  elf: 'elves',
  dwarf: 'dwarves',
  wolf: 'wolves',
  mouse: 'mice',
  goose: 'geese',
};

function namesWord(text: string, word: string): boolean {
  const forms = new Set([word, `${word}s`, `${word}es`]);
  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) forms.add(irregular);
  for (const form of forms) {
    if (new RegExp(`(^|[^a-z'])${escapeRe(form)}([^a-z']|$)`).test(text)) return true;
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
}

/* ------------------------------------------------------------------ *
 * The type line
 * ------------------------------------------------------------------ */

/** Card types the engine has a use for. Anything else is skipped, not guessed. */
const CARD_TYPES: readonly string[] = [
  'creature',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
  'legendary',
];

function readTypeLine(typeLine: string | null, out: Set<Facet>): void {
  if (!typeLine) return;
  const front = typeLine.split('//')[0];
  // The em dash is the printed separator between types and subtypes. Some rows
  // carry a hyphen instead, so both are accepted; nothing else is.
  const dash = front.search(/[—-]/);
  const types = (dash >= 0 ? front.slice(0, dash) : front).toLowerCase();
  const subs = dash >= 0 ? front.slice(dash + 1) : '';

  for (const t of CARD_TYPES) {
    if (new RegExp(`\\b${t}\\b`).test(types)) out.add(`type:${t}`);
  }
  for (const word of subs.trim().split(/\s+/)) {
    const w = word.trim().toLowerCase();
    if (w) out.add(`sub:${w}`);
  }
}

/* ------------------------------------------------------------------ *
 * The record
 * ------------------------------------------------------------------ */

function readAbility(ability: Ability, out: Set<Facet>): void {
  if (ability.kind === 'keyword') {
    out.add(`kw:${ability.keyword.toLowerCase()}`);
    // Four keywords ARE effects the deck builder cares about and have no
    // `Effect` member, because the runtime handles them structurally. Reading
    // them here is the same fact by a different route, not a new judgement.
    if (ability.keyword.toLowerCase() === 'infect') out.add('eff:poison');
    return;
  }

  if (ability.kind === 'triggered') {
    out.add(`trig:${ability.event.on}`);
    readTriggerEvent(ability.event, out);
    readEffects(ability.effects, out);
    for (const t of ability.targets ?? []) if (t.filter) readFilter(t.filter, out, 'cares');
    return;
  }

  if (ability.kind === 'activated' || ability.kind === 'mana') {
    readEffects(ability.effects, out);
    readActivationCost(ability.costs, out);
    if (ability.kind === 'activated') {
      for (const t of ability.targets ?? []) if (t.filter) readFilter(t.filter, out, 'cares');
    }
    return;
  }

  if (ability.kind === 'spell') {
    readEffects(ability.effects, out);
    for (const t of ability.targets ?? []) if (t.filter) readFilter(t.filter, out, 'cares');
    return;
  }

  if (ability.kind === 'static') {
    readSelector(ability.affects, out);
    for (const mod of ability.modifications) {
      if (mod.layer === 'pt-modify' || mod.layer === 'pt-set') out.add('eff:pump');
      if (mod.layer === 'ability') {
        for (const g of mod.grant ?? []) out.add(`kw:${String(g).toLowerCase()}`);
      }
    }
    return;
  }

  if (ability.kind === 'replacement') {
    if (ability.result.do === 'enters-with-counters') {
      out.add('eff:add-counters');
      out.add(`ctr:${ability.result.counter.toLowerCase()}`);
    }
    if (ability.result.do === 'additional') readEffects(ability.result.effects, out);
  }
}

/**
 * WHAT THE ABILITY COSTS TO USE, which is half of what it does.
 *
 * Sol Ring reads `{T}: Add {C}{C}` and a Dimir Signet reads `{1}, {T}: Add
 * {U}{B}`. Every other fact about the two cards is identical — artifact, adds
 * mana, adds two of it — so without this facet they are the same card, and
 * measured on 2026-08-23 that is exactly what happened: ranking a Sol Ring page
 * on facets alone returned ten Signets at a perfect score and pushed Mana Crypt
 * off the list. The activation cost is the argument that separates them, and
 * throwing an argument away is the precise mistake the XMage re-extraction
 * exists to stop making.
 *
 * `{X}` costs are not a number, so a cost containing one contributes nothing
 * rather than a floor pretending to be a price. That is `parseCost`'s rule and
 * it is read from `parseCost`, not restated here.
 *
 * Capped at 3, like `mana:`, because past that the exact figure stops
 * separating cards a player would compare.
 */
function readActivationCost(costs: readonly Cost[] | undefined, out: Set<Facet>): void {
  let mana = 0;
  let sawMana = false;
  for (const cost of costs ?? []) {
    if (cost.pay !== 'mana') continue;
    const parsed = parseCost(cost.cost);
    if (parsed.hasX) return;
    mana += parsed.manaValue ?? 0;
    sawMana = true;
  }
  if (!sawMana && (costs ?? []).length === 0) return;
  out.add(`acost:${Math.min(mana, 3)}`);
}

function readTriggerEvent(event: { on: string } & Record<string, unknown>, out: Set<Facet>): void {
  const who = (event as { who?: Selector; what?: Selector }).who ?? (event as { what?: Selector }).what;
  if (who) readSelector(who, out);
  const counter = (event as { counter?: string }).counter;
  if (typeof counter === 'string' && counter) out.add(`ctr:${counter.toLowerCase()}`);
}

function readEffects(effects: readonly Effect[] | undefined, out: Set<Facet>): void {
  for (const e of effects ?? []) readEffect(e, out);
}

/**
 * One effect.
 *
 * Control flow members recurse; everything else contributes its verb and
 * whatever arguments the deck builder can use. The recursion is what makes
 * "destroy all creatures" inside a mode of a modal spell count the same as one
 * printed on its own line, which the tag matcher could never do.
 */
function readEffect(effect: Effect, out: Set<Facet>): void {
  switch (effect.do) {
    case 'if':
      readEffects(effect.then, out);
      readEffects(effect.else, out);
      return;
    /* Both branches are read, and the verb itself is recorded, because a deck
     * built around "you may pay 2 life: draw a card" is built around a
     * repeatable optional cost, and a reader that saw only the draw would price
     * it as a cantrip. */
    case 'do-if-cost-paid':
      out.add('eff:do-if-cost-paid');
      readEffects(effect.then, out);
      readEffects(effect.else, out);
      return;
    case 'for-each':
    case 'repeat':
    case 'may':
    case 'unless-pays':
      if (effect.do === 'unless-pays') out.add('eff:unless-pays');
      readEffects(effect.effects, out);
      return;
    case 'choose-mode':
      for (const m of effect.modes) readEffects(m.effects, out);
      return;

    /*
     * `manual` is not a gap to be skipped. The compiler assigns a hint id from
     * a named rule in `effect-rules.ts`, so "proliferate" is a rule that fired,
     * not a word that appeared. Four of those ids are things a deck is built
     * around, and proliferate is the whole of Atraxa, so the id is read and
     * anything else stays unread rather than being guessed at.
     */
    case 'manual': {
      const id = manualId(effect.hint ?? effect.text ?? '');
      if (id) out.add(`eff:${id}`);
      return;
    }

    case 'xmage-body':
      // A pointer at translated Java. It carries no verb, so there is nothing
      // to read and `CARD-SEMANTICS.md` says so in as many words.
      return;

    case 'add-mana': {
      out.add('eff:add-mana');
      const pips = (effect.mana.match(/\{[^}]+\}/g) ?? []).length;
      if (pips > 0) out.add(`mana:${Math.min(pips, 3)}`);
      return;
    }

    case 'create-token': {
      out.add('eff:create-token');
      readToken(effect.token, out);
      return;
    }

    case 'add-counters':
    case 'remove-counters':
      out.add(`eff:${effect.do}`);
      out.add(`ctr:${effect.counter.toLowerCase()}`);
      readSelector(effect.what, out);
      return;

    case 'player-counter':
      out.add('eff:player-counter');
      out.add(`ctr:${effect.counter.toLowerCase()}`);
      return;

    case 'return-from':
      out.add('eff:return-from');
      out.add(`cares:zone:${effect.zone}`);
      readSelector(effect.what, out);
      return;

    case 'move-zone':
      out.add('eff:move-zone');
      out.add(`cares:zone:${effect.to}`);
      readSelector(effect.what, out);
      return;

    case 'search-library':
      out.add('eff:search-library');
      // A search that finds lands is ramp, a search that finds anything else is
      // a tutor. The filter is what says which, so the filter is read.
      if (effect.what.sel === 'all' && namesType(effect.what.where, 'land')) {
        out.add('cares:zone:library-land');
      }
      readSelector(effect.what, out);
      return;

    case 'pump':
      out.add('eff:pump');
      readSelector(effect.what, out);
      for (const g of effect.grant ?? []) out.add(`kw:${String(g).toLowerCase()}`);
      return;

    case 'destroy':
    case 'exile':
    case 'tap':
    case 'untap':
    case 'counter':
      out.add(`eff:${effect.do}`);
      readSelector(effect.what, out);
      return;

    case 'gain-control':
      out.add('eff:gain-control');
      readSelector(effect.what, out);
      return;

    case 'sacrifice':
      out.add('eff:sacrifice');
      readSelector(effect.what, out);
      return;

    case 'damage':
      out.add('eff:damage');
      if ('sel' in effect.to) readSelector(effect.to as Selector, out);
      return;

    case 'draw':
    case 'mill':
    case 'discard':
    case 'gain-life':
    case 'lose-life':
    case 'set-life':
    case 'poison':
    case 'shuffle':
    case 'scry':
    case 'surveil':
    case 'look-and-pick':
    case 'attach':
    case 'set-monarch':
    case 'win-game':
    case 'lose-game':
      out.add(`eff:${effect.do}`);
      return;

    default:
      return;
  }
}

/**
 * The named `manual` hints worth reading, and only these.
 *
 * Each is a rule id in `effect-rules.ts`, matched on the hint's own prefix
 * because that is how the hint is assembled there: `"<id>: <why it refused>"`.
 * A hint whose id is not on this list contributes nothing, which is the same
 * refusal the compiler already made.
 */
const MANUAL_IDS: readonly string[] = ['proliferate', 'extra-turn', 'extra-combat', 'scry'];

function manualId(hint: string): string | null {
  const head = hint.split(':')[0].trim().toLowerCase();
  return MANUAL_IDS.includes(head) ? head : null;
}

function readToken(token: TokenSpec, out: Set<Facet>): void {
  const line = token.typeLine ?? '';
  const dash = line.search(/[—-]/);
  const subs = dash >= 0 ? line.slice(dash + 1) : '';
  for (const word of subs.trim().split(/\s+/)) {
    const w = word.trim().toLowerCase();
    if (w) out.add(`tok:${w}`);
  }
  if (!subs && token.name) out.add(`tok:${token.name.trim().toLowerCase()}`);
}

/**
 * A selector: what an effect is pointed at.
 *
 * `sel:'all'` with a filter is a mass effect and gets `scope:all`, which is the
 * facet that separates Wrath of God from Doom Blade. The filter itself becomes
 * `cares:` facets, which is how "destroys all creatures" and "destroys all
 * lands" stop being the same fact.
 */
function readSelector(selector: Selector, out: Set<Facet>): void {
  if (selector.sel !== 'all') return;
  out.add('scope:all');
  if (selector.zone && selector.zone !== 'battlefield') out.add(`cares:zone:${selector.zone}`);
  readFilter(selector.where, out, 'cares');
}

function readFilter(filter: CardFilter, out: Set<Facet>, prefix: 'cares'): void {
  switch (filter.is) {
    case 'type':
      out.add(`${prefix}:type:${filter.value.toLowerCase()}`);
      return;
    case 'subtype':
      out.add(`${prefix}:sub:${filter.value.toLowerCase()}`);
      return;
    case 'keyword':
      out.add(`kw:${filter.value.toLowerCase()}`);
      return;
    case 'has-counter':
      out.add(`ctr:${filter.counter.toLowerCase()}`);
      return;
    case 'token':
      out.add(`${prefix}:type:token`);
      return;
    case 'not':
      readFilter(filter.of, out, prefix);
      return;
    case 'and':
    case 'or':
      for (const f of filter.of) readFilter(f, out, prefix);
      return;
    default:
      return;
  }
}

/** Does this filter certainly name this card type? Used only for land search. */
function namesType(filter: CardFilter, type: string): boolean {
  switch (filter.is) {
    case 'type':
      return filter.value.toLowerCase() === type;
    case 'and':
    case 'or':
      return filter.of.some(f => namesType(f, type));
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * Bulk
 * ------------------------------------------------------------------ */

export interface FacetCensus {
  cards: number;
  compiler: number;
  xmage: number;
  none: number;
  facets: number;
}

/**
 * Read a pool, and hand back the census alongside it.
 *
 * The census is not optional and not a debug aid. The engine's fallback to tags
 * is invisible from the outside, so a caller that does not know how often it
 * fired cannot tell a behaviour-driven deck from a word-matched one.
 */
export function facetsForPool<T extends FacetInput>(
  rows: readonly T[]
): { byOracleId: Map<string, Facet[]>; census: FacetCensus } {
  const byOracleId = new Map<string, Facet[]>();
  const census: FacetCensus = { cards: 0, compiler: 0, xmage: 0, none: 0, facets: 0 };

  for (const row of rows) {
    const id = row.oracle_id;
    if (!id || byOracleId.has(id)) continue;
    const result = facetsForCard(row);
    byOracleId.set(id, result.facets);
    census.cards += 1;
    census[result.source] += 1;
    census.facets += result.facets.length;
  }

  return { byOracleId, census };
}

/**
 * The unused-value type import above is deliberate: `ValueExpr` names the shape
 * a count argument takes, and a reader looking for "where does the count go"
 * should find the answer here rather than concluding it was dropped. Counts are
 * NOT read into facets, because "create X tokens" and "create one token" are
 * the same behaviour for a deck builder and a different one only for the
 * runtime. Stated rather than silently omitted.
 */
export type CountArgument = ValueExpr;
