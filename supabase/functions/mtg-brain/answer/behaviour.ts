/**
 * The record Tutor reads a card from, which is the record the optimiser reads.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Counted by imports rather than by intention, before this file was written:
 *
 *                       engine  facets  tagger  behaviour  DSL
 *   deck generation         22      13       5         11    6
 *   deck optimisation       22      13       5         11    6
 *   play (src/lib/game)      -       -       -          -   32
 *   Tutor (mtg-brain)        0       0       0          0    0
 *
 * The vocabulary work closed the first and third columns: Tutor takes its tag
 * names from `tagger.ts` now instead of keeping its own list. It still read
 * `cards.tags` and nothing else, which is one word per card, while the
 * optimiser sitting beside it read the structure the ability compiler produces
 * from the same oracle text. So the two halves of the product held different
 * amounts of the same knowledge about the same card, and the thinner half was
 * the one talking to the player.
 *
 * This is the seam. Nothing here decides what a card does. It calls
 * `facetsForCard`, which is byte-identical to the copy the optimiser and the
 * generator call, and then makes three decisions that ARE Tutor's:
 *
 *   1. WHICH facts about a card are safe to state on their own. See
 *      `SAYABLE_PREFIXES`, which is the most load-bearing thing in this file.
 *   2. HOW a commander plan is read out loud.
 *   3. WHEN to say the reading is thin, and in what words. One sentence per
 *      case, written once, so the same gap is never described two ways.
 *
 * WHY THE PRODUCER IS LOADED ON DEMAND
 * ------------------------------------
 * `_lib/deck/recommend/behaviour.ts` reaches the ported XMage table, which is
 * 3.16 MB of the 3.68 MB the mirror costs. Measured under Deno on this machine:
 * the module tree takes 114 ms to load, then 8.3 ms for the first card and
 * about 0.1 ms for each one after. Most questions Tutor answers never need it:
 * a price, a legality line, a list of the most played counterspells are all
 * column reads. So it is imported on first use rather than at module load, the
 * same way `resolve-cards.ts` already is, and the 114 ms lands on the questions
 * that spend it rather than on every question.
 */

import {
  REC_FULL,
  REC_PARTIAL,
  describeSharedFacets,
  planFit,
  planForCommander,
  type CommanderPlan,
  type Facet,
  type Want,
} from '../_engine/knowledge/behaviour.ts';
import {
  buildManaProfile,
  cardPlayability,
  coloursToMask,
  type ManaProfile,
  type PlayabilityCardInput,
} from '../_engine/playability/castability.ts';
import type { NormalisedCard } from '../deck-context.ts';
import { joinWords } from './voice.ts';

/* -------------------------------------------------------------------------- *
 * Loading the producer
 * -------------------------------------------------------------------------- */

type Producer = typeof import('../_lib/deck/recommend/behaviour.ts');

let producer: Producer | null = null;
let producerFailed = false;

/**
 * The facet producer, or null if it could not be loaded.
 *
 * Null rather than a throw, and the callers treat it as "we could not read
 * this" rather than "this card does nothing". Those are the two facts this
 * whole answerer keeps apart, and a module that failed to load is squarely the
 * first one.
 */
async function loadProducer(): Promise<Producer | null> {
  if (producer) return producer;
  if (producerFailed) return null;
  try {
    producer = await import('../_lib/deck/recommend/behaviour.ts');
    return producer;
  } catch (err) {
    producerFailed = true;
    console.error('tutor: the card reader could not be loaded', err);
    return null;
  }
}

/* -------------------------------------------------------------------------- *
 * Reading one card
 * -------------------------------------------------------------------------- */

/**
 * How completely the card was read.
 *
 * `full` is the compiler saying it consumed every paragraph. It is NOT the
 * compiler saying it was right, and CLAUDE.md is explicit that the two must
 * never be conflated, which is why nothing below ever tells a player that a
 * card is fully understood. `full` says nothing extra at all; the other two say
 * what is missing.
 */
export type RecordStanding = 'full' | 'partial' | 'none' | 'unread';

export interface CardRecord {
  facets: readonly Facet[];
  standing: RecordStanding;
  /** `compiler`, `xmage` or `none`, straight off the producer. Logged, not said. */
  source: string;
}

const NO_RECORD: CardRecord = Object.freeze({
  facets: Object.freeze([]) as readonly Facet[],
  standing: 'unread',
  source: 'unavailable',
});

/** Every column the producer reads. `cards_unique` and `cards` both carry them. */
export interface ReadableCard {
  name?: string | null;
  oracle_id?: string | null;
  type_line?: string | null;
  oracle_text?: string | null;
  mana_cost?: string | null;
  cmc?: number | null;
  keywords?: string[] | null;
  power?: string | null;
  toughness?: string | null;
  layout?: string | null;
  faces?: unknown;
}

export async function readRecord(card: ReadableCard | null | undefined): Promise<CardRecord> {
  if (!card) return NO_RECORD;
  const mod = await loadProducer();
  if (!mod) return NO_RECORD;

  try {
    const result = mod.facetsForCard(card as never);
    const standing: RecordStanding = result.facets.includes(REC_FULL)
      ? 'full'
      : result.facets.includes(REC_PARTIAL)
        ? 'partial'
        : 'none';
    return { facets: result.facets, standing, source: result.source };
  } catch (err) {
    /* A card that throws the reader is a card we could not read, which is the
       `unread` case and not the `none` case. Saying "this card's text says
       nothing we could use" about a crash would be a claim about the card. */
    console.error(`tutor: could not read ${card.name ?? 'a card'}`, err);
    return NO_RECORD;
  }
}

/* -------------------------------------------------------------------------- *
 * What a card does, in a form that is safe to say on its own
 * -------------------------------------------------------------------------- */

/**
 * The facet prefixes Tutor will state as a fact about one card.
 *
 * `describeSharedFacets` is the engine's own phrasing and nothing here rewrites
 * it. What this list decides is WHICH facets get handed to it, and the reason
 * the list is short is that the engine's phrases were written for a card
 * against a card. On a tile that says "these two both hit everything at once"
 * every phrase is true of the pair. Standing alone under one card, three of the
 * prefixes stop being true, and each one was caught by reading a real card:
 *
 *   `scope:`  Rhystic Study carries `scope:all`, because the trigger's filter
 *             names every spell an opponent casts. The phrase is "hits
 *             everything at once", and Rhystic Study hits nothing. Wrath of
 *             God carries the same facet and there it is exactly right, so the
 *             facet is not wrong. It is not sayable without the verb it belongs
 *             to, and gluing it to the verb would be writing English out of
 *             structure.
 *   `cares:type:` Cyclonic Rift carries `cares:type:land`, from "nonland
 *             permanents". The phrase is "about lands". It is about everything
 *             that is not a land. A filter reads the same whether it includes
 *             or excludes, so no `cares:type:` phrase can be trusted alone.
 *   `trig:`   Smothering Tithe carries `trig:draws-card` and Atraxa carries
 *             `trig:step`, and those print as "triggers on draws-card" and
 *             "triggers on step". Those are our own internal names for an
 *             event, and the copy rules say a product-invented word does not
 *             go in front of a player.
 *
 * `sub:` and `type:` are excluded for a different reason: they are the type
 * line, which every answer prints two lines above this one.
 *
 * What is left is the verb, what the verb makes, and what it costs. Checked
 * against the cards a reviewer would check: Sol Ring reads "adds mana, 2 mana
 * at a time, costs nothing to use"; Wrath of God "destroys"; Rhystic Study
 * "draws cards, taxes the opponent"; Counterspell "counters a spell"; Blood
 * Artist "gains life, drains life". Wrath of God loses "hits everything at
 * once", which is true of it, and that is the trade: one true phrase lost so
 * that no false one is printed.
 */
const SAYABLE_PREFIXES = ['eff:', 'tok:', 'ctr:', 'mana:', 'acost:', 'kw:'] as const;

/**
 * The order they are said in, which is the order a player would say them.
 *
 * The producer sorts facets alphabetically, which is right for comparing two
 * cards and reads as nonsense out loud: Wrath of God came back "about
 * creatures, destroys". The verb goes first, then what the verb produces, then
 * what it costs to use, then the keywords printed on the card.
 */
const SAY_ORDER = ['eff:', 'tok:', 'ctr:', 'mana:', 'acost:', 'kw:'];

/**
 * A general statement dropped because the card carries the specific one.
 *
 * Smothering Tithe carries `eff:create-token` and `tok:treasure`, which print
 * as "makes tokens" and "makes treasure tokens". Both are true and saying both
 * says one fact twice, which is the same judgement `SUPERSEDED` makes about tag
 * names in `vocabulary.ts`.
 */
function isSuperseded(facet: Facet, held: ReadonlySet<Facet>): boolean {
  if (facet !== 'eff:create-token') return false;
  for (const f of held) if (f.startsWith('tok:')) return true;
  return false;
}

/**
 * What this card does, as short phrases, or an empty list.
 *
 * Empty is a real answer and the caller must print nothing rather than an empty
 * line. Doubling Season is the case that proves it: the compiler read every
 * paragraph, so the reading is `full`, and the only facets it produced are
 * `rec:full` and `type:enchantment`. There is nothing sayable there, and the
 * card's own text is printed above anyway.
 */
export function whatItDoes(record: CardRecord, limit = 4): string[] {
  const held = new Set(record.facets);
  const ordered = record.facets
    .filter(f => SAYABLE_PREFIXES.some(p => f.startsWith(p)))
    .filter(f => !isSuperseded(f, held))
    .sort((a, b) => {
      const ra = SAY_ORDER.findIndex(p => a.startsWith(p));
      const rb = SAY_ORDER.findIndex(p => b.startsWith(p));
      return ra - rb || a.localeCompare(b);
    });
  return describeSharedFacets(ordered, limit);
}

/* -------------------------------------------------------------------------- *
 * Saying that the reading is thin, the same way every time
 * -------------------------------------------------------------------------- */

/**
 * One sentence per standing, written once.
 *
 * Measured over the 1,000 most played Commander legal cards on 2026-08-29
 * (`scripts/tutor-behaviour-probe.ts`): every paragraph read on 402, part read
 * on 413, nothing read on 185. Over the whole catalogue CLAUDE.md records
 * 30.3% / 46.4% / 23.3%, so on the cards a player is most likely to ask about
 * the reading is better than average and still thin on well over half of them.
 * A sentence that appears on more than half the answers has to be short and has
 * to be the same words every time, or it reads as hedging.
 *
 * `full` says nothing. It is the compiler reporting that it consumed every
 * paragraph, NOT that it was right, and telling a player a card is fully
 * understood on the strength of that would be the one claim this whole
 * arrangement is built to avoid.
 */
export function thinReadingNote(standing: RecordStanding): string | null {
  if (standing === 'full') return null;
  if (standing === 'partial') {
    return 'I have only worked out part of what this card does, so read what I say about it as that part and not the whole card. The text above is the whole card.';
  }
  if (standing === 'none') {
    return 'I could not work this card\'s text out into anything I can reason about, so I can quote it and I am not going to summarise it.';
  }
  return 'I could not read the card properly just now, so anything below is missing what the card itself does.';
}

/** True when an answer built on this reading should be reported as partial. */
export const readingIsThin = (standing: RecordStanding): boolean => standing !== 'full';

/* -------------------------------------------------------------------------- *
 * Does it fit the deck the question came with
 * -------------------------------------------------------------------------- */

export interface DeckPlan {
  plan: CommanderPlan;
  commanderName: string;
  /** The commander's own reading, so a thin plan can say it is thin. */
  standing: RecordStanding;
}

/**
 * The commander's plan, built the way the optimiser builds it.
 *
 * The deck in the request body carries the commander's own type line and rules
 * text, so the record itself costs nothing but one card's worth of compiling.
 * That is the difference the brief names between this and the optimiser: the
 * optimiser compiles a pool of twenty four thousand rows, Tutor compiles one.
 *
 * ONE READ IS STILL WORTH MAKING, and it is for the tags rather than the text.
 * `planForCommander` falls back to a commander's TAGS when its ability record is
 * empty, and the fallback is the difference between a plan and nothing at all
 * for a commander the compiler cannot read. The page sends no tags, so without
 * this read the fallback could never fire and Tutor would build a weaker plan
 * than the optimiser builds for the same commander, which is the exact split
 * this work exists to close. It is one row by name and it fails soft: no read,
 * no tags, and the plan is still built from the record.
 *
 * Null when the deck has no commander, which is not a failure. A deck with no
 * commander has no plan to fit, and saying so is the answer.
 */
export async function planForDeck(
  deckCards: readonly NormalisedCard[],
  lookup?: (name: string) => Promise<{ tags: string[] | null } | null>
): Promise<DeckPlan | null> {
  const commander = deckCards.find(c => c.isCommander && !c.isSideboard);
  if (!commander) return null;

  const record = await readRecord({
    name: commander.name,
    type_line: commander.typeLine,
    oracle_text: commander.oracleText,
    mana_cost: commander.manaCost,
    cmc: commander.cmc,
  });

  let tags: string[] | null = null;
  if (lookup) {
    try {
      tags = (await lookup(commander.name))?.tags ?? null;
    } catch {
      /* A failed read is not an empty tag list. Leaving it null means the
         engine's own `fromTagsOnly` flag stays false and the plan reports
         itself as record-only, which is what actually happened. */
      tags = null;
    }
  }

  const plan = planForCommander({
    name: commander.name,
    typeLine: commander.typeLine,
    facets: record.facets,
    tags,
  });

  return { plan, commanderName: commander.name, standing: record.standing };
}

export interface FitVerdict {
  /** How many of the commander's wants this card satisfies. */
  matches: number;
  /** One line per reason, each naming the commander's own behaviour. */
  lines: string[];
}

/**
 * What this card does that the commander wants, in the commander's own terms.
 *
 * `planFit` returns the wants that matched, and every want carries a `because`
 * built from the commander's record rather than from free text. Several wants
 * usually share one `because`, so they are grouped by it: Atraxa proliferates,
 * and that one fact about her is why she wants both proliferate and counters.
 * Printing it twice would read as two reasons where there is one.
 *
 * The fit NUMBER is not printed anywhere. It is a weight for ranking a pool and
 * it has no units a player could check, so putting it on screen would be
 * inventing a score. What is printed is which things line up, which is the part
 * that can be read back against the two cards.
 */
export function fitFor(deckPlan: DeckPlan, record: CardRecord): FitVerdict {
  const fit = planFit(deckPlan.plan, { facets: record.facets });
  if (!fit.matched.length) return { matches: 0, lines: [] };

  const byReason = new Map<string, Want[]>();
  for (const want of fit.matched) {
    const list = byReason.get(want.because);
    if (list) list.push(want);
    else byReason.set(want.because, [want]);
  }

  const lines: string[] = [];
  for (const [because, wants] of byReason) {
    const does = describeSharedFacets(
      wants.map(w => w.facet),
      3
    );
    /* A want whose facet has no phrase contributes nothing rather than being
       printed raw, which is the rule `describeSharedFacets` already follows.
       The reason still stands on its own, so the line is kept. */
    lines.push(does.length ? `${because}, and this ${joinWords(does)}.` : `${because}.`);
  }
  return { matches: fit.matched.length, lines };
}

/* -------------------------------------------------------------------------- *
 * Can this deck cast it
 * -------------------------------------------------------------------------- */

export interface CastingOdds {
  /** 0 to 100, or null when the question has no answer for this card. */
  pct: number | null;
  turn: number | null;
  /** Why there is no figure: it is a land, or it has no cost to pay. */
  skipped: string | null;
  /** The engine had to fall back from the exact sum. Said out loud when true. */
  approximate: boolean;
  landCount: number;
  librarySize: number;
}

/**
 * The deck's mana, built from the list the page already sent.
 *
 * ONE THING IS SUPPLIED RATHER THAN READ, and it is worth writing down.
 * `buildManaProfile` unions every card's `color_identity` to work out which
 * colours the deck can make, because "search your library for a basic land" can
 * only fetch a colour the deck plays. The page does not send `color_identity`
 * per card. It does send the deck's own colour identity, which is that same
 * union read off the deck rather than reconstructed from its parts, so that is
 * what is passed in. Without it the mask is zero and every fetch land in the
 * deck counts as producing nothing.
 */
export function manaProfileFor(
  deckCards: readonly NormalisedCard[],
  identity: readonly string[]
): ManaProfile | null {
  const main = deckCards.filter(c => !c.isSideboard);
  if (!main.length) return null;

  const deckMask = coloursToMask(identity);
  const input: PlayabilityCardInput[] = main.map(c => ({
    name: c.name,
    type_line: c.typeLine,
    mana_cost: c.manaCost || null,
    cmc: c.cmc,
    oracle_text: c.oracleText || null,
    /* Every card carries the deck's identity so the union comes out right. It
       is not a claim about any one card, and nothing downstream of
       `buildManaProfile` reads this field for anything else. */
    color_identity: [...identity],
    quantity: c.quantity,
    isCommander: c.isCommander,
  }));

  const profile = buildManaProfile(input);
  return deckMask ? { ...profile, deckColourMask: deckMask } : profile;
}

export function castingOdds(
  card: { name: string; type_line?: string | null; mana_cost?: string | null; cmc?: number | null; oracle_text?: string | null },
  profile: ManaProfile
): CastingOdds {
  const result = cardPlayability(
    {
      name: card.name,
      type_line: card.type_line ?? '',
      mana_cost: card.mana_cost ?? null,
      cmc: card.cmc ?? null,
      oracle_text: card.oracle_text ?? null,
    },
    profile
  );
  return {
    pct: result.pct,
    turn: result.turn,
    skipped: result.skipped,
    approximate: result.approximate,
    landCount: profile.landCount,
    librarySize: profile.librarySize,
  };
}
