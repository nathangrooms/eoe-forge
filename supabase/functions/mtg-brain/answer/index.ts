/**
 * Tutor answering out of the catalogue, with nothing else involved.
 *
 * THE INSTRUCTION THIS EXISTS FOR
 * -------------------------------
 * The owner, asked what Tutor should run on now that the gateway is out of
 * credits: "they should run automatically through our engine, I dont want to
 * use any LLM we have so much knowledge?"
 *
 * The second half of that is a question, and the honest answer is "for a lot of
 * it, yes". We hold every printing of every card with its rules text, cost,
 * type, colours, legality, price and how much Commander plays it. We hold
 * 61,500 combos with every piece named. We hold a tag on 33,010 of 33,032
 * cards. A card question is nearly all lookup, and lookup is exactly what a
 * language model is worst at: it was inventing prices and telling a Commander
 * deck it "could add another copy" of Mystic Remora, which is the singleton
 * rule broken in the one format this product is built around.
 *
 * So the deterministic answer goes first. When it can answer, it answers, and
 * nothing else is consulted. When it cannot, it says which of two things is
 * true, and they are different: either we do not hold this, or we could not
 * read it just now.
 *
 * WHAT WE DO NOT HOLD, MEASURED RATHER THAN GUESSED
 * ------------------------------------------------
 * - No rules reference. 82 base tables and not one carries rules text, rulings
 *   or a glossary. `cards` has 39 columns and none of them is about rulings.
 * - No field data. `meta_card_inclusion` and `meta_card_pairs` carry format
 *   scope only, 2 scopes, largest denominator 552 decks, none of it tournament
 *   results. There is no per commander scope and there was never going to be:
 *   precons give roughly one deck per commander, and the 30 deck floor
 *   correctly refuses to publish a rate from that.
 * - No judgement. "When is it good" is not in any column.
 *
 * Those three are refused by name. A refusal that is correct is a good answer
 * and is reported as one.
 *
 * SAID AND QUOTED
 * ---------------
 * The copy rules ban the em dash, and every creature in Magic has one in its
 * type line. So an answer is built as blocks that are either something we said,
 * which the rules apply to and which `checkVoice` enforces, or something we
 * quoted off a card, which is printed as printed. Altering a card's own text to
 * satisfy a house style would be the fabrication rule broken to satisfy the
 * copy rule.
 */

import {
  cardByName,
  combosFor,
  decksPlaying,
  printingOf,
  similarTo,
  tagRarity,
  topByRole,
  type CardRow,
  type Combo,
  type DeckHit,
  type Read,
} from './catalogue.ts';
import {
  countFrom,
  coloursFrom,
  manaValueFrom,
  pointsAtSomething,
  readQuestion,
  roleFrom,
  route,
  type Routing,
} from './route.ts';
import {
  FORMATS,
  NO_META_DATA,
  NO_RULES_CORPUS,
  colourName,
  joinWords,
  looksWrong,
  priceLine,
  priceTag,
  roleWords,
  thousands,
  judgementGap,
  TAG_SYNONYMS,
} from './voice.ts';
import { gradeLands, upgradeTargets, findLandCandidates } from '../manabase.ts';
import { isLand, type NormalisedCard } from '../deck-context.ts';
import { resolveCards, type ResolvedCard } from '../resolve-cards.ts';

/* -------------------------------------------------------------------------- *
 * Blocks
 * -------------------------------------------------------------------------- */

type Block = { said: string } | { quoted: string };

const say = (text: string): Block => ({ said: text });
const quote = (text: string): Block => ({ quoted: text });

function render(blocks: Block[]): string {
  return blocks
    .map(b => ('said' in b ? b.said : b.quoted))
    .filter(t => t && t.trim())
    .join('\n\n')
    .trim();
}

/**
 * The copy rules, checked on the way out instead of trusted.
 *
 * Only what we said. A card's own type line carries an em dash and its own
 * rules text carries whatever it carries, and neither is ours to edit.
 */
function checkVoice(blocks: Block[]): string[] {
  const faults: string[] = [];
  for (const block of blocks) {
    if (!('said' in block)) continue;
    for (const fault of looksWrong(block.said)) {
      faults.push(`${fault} in: ${block.said.slice(0, 60)}`);
    }
  }
  return faults;
}

/* -------------------------------------------------------------------------- *
 * The result
 * -------------------------------------------------------------------------- */

export interface Chart {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: { name: string; value: number }[];
}

export interface Answered {
  message: string;
  cards: ResolvedCard[];
  charts: Chart[];
  routing: Routing;
  /** Every table and view this answer was built from. Logged, and returned. */
  basis: string[];
  /**
   * `full`     everything asked for was in the catalogue and is in the answer.
   * `partial`  part of it was, and the answer says which part was not.
   * `refused`  none of it was, and the answer says why in plain words.
   */
  standing: 'full' | 'partial' | 'refused';
}

export interface AnswerRequest {
  message: string;
  deckContext: any;
  deckCards: NormalisedCard[];
  identity: string[];
  /** Reads the catalogue. The anon key is enough; nothing here writes. */
  db: any;
  /** Carries the caller's own sign in, so their decks can be read. Null when signed out. */
  userDb: any | null;
}

/* -------------------------------------------------------------------------- *
 * The one entry point
 * -------------------------------------------------------------------------- */

/**
 * Answer if we can, and return null if we cannot.
 *
 * Null means "no opinion", not "no". The caller is free to try something else
 * with it. Everything this returns is finished, and the caller must not add to
 * it, because an answer built from the catalogue and then decorated by
 * something else is no longer an answer built from the catalogue.
 */
export async function answerFromCatalogue(req: AnswerRequest): Promise<Answered | null> {
  const { question, card: attached } = readQuestion(req.message);
  if (!question) return null;

  // A card can also be named in the question with nothing attached: "budget
  // alternatives to Rhystic Study". The name has to appear in what they typed,
  // which is a hard guard against a card being conjured out of a coincidence.
  const named = attached ?? (await cardNamedInQuestion(req.db, question));

  const have = {
    card: Boolean(named),
    deck: Boolean(req.deckContext && req.deckCards.length),
    catalogue: true as const,
  };

  const routing = route(question, have);
  if (!routing) return null;

  if (routing.gap) return refuse(routing);

  /* The ask needs something the request did not carry. Saying "pick a card"
     is right when they clearly meant one and had not selected it, and wrong
     when they said "explain the main archetypes" and never mentioned a card.
     In the second case we have no opinion and say nothing. */
  if (!routing.subject) {
    return pointsAtSomething(question) ? askForContext(routing) : null;
  }

  switch (routing.ask) {
    case 'legality':
      return answerAboutCard(req, routing, named!, ['legality']);
    case 'price':
      return answerAboutCard(req, routing, named!, ['price']);
    case 'combos':
      return routing.subject === 'deck'
        ? combosAreOneCardAtATime(routing)
        : answerAboutCard(req, routing, named!, ['combos']);
    case 'alternatives':
      return answerAboutCard(req, routing, named!, ['alternatives']);
    case 'in-my-decks':
      return answerAboutCard(req, routing, named!, ['decks']);
    case 'explain':
      return answerAboutCard(req, routing, named!, ['what', 'text', 'roles', 'popularity', 'legality', 'price', 'combos', 'decks']);
    case 'best-of':
      return answerWithAList(req, routing);
    case 'staples':
      return answerWithStaples(req, routing);
    case 'upgrades':
      return upgradesAreWorkedOutElsewhere(req, routing);
    case 'lands':
      return answerAboutLands(req, routing);
    default:
      return null;
  }
}

/**
 * A combo question about a whole deck.
 *
 * We hold 61,500 combos and every piece of every one of them, and checking a
 * hundred cards against all of it is a read across the whole combo list. On the
 * real Atraxa deck it measured 3.1 s on a cold cache against a 3 s limit, and
 * this database has twice been pushed over by work that looked affordable. So
 * it is not done, and saying that is better than doing it badly or pretending
 * the deck has no combos in it.
 */
function combosAreOneCardAtATime(routing: Routing): Answered {
  return finish(
    [say([
      'I can do this one card at a time, not a whole deck at once. Pick a card at the top of the page and I will tell you every combo we hold that it is part of, what the other pieces are and what it produces.',
      'Checking a hundred cards against every combo we hold is not something I can do quickly enough yet, and I would rather say that than tell you your deck has no combos when I have not really looked.',
    ].join('\n\n'))],
    [], routing, [], 'refused'
  );
}

/**
 * Adds and cuts.
 *
 * The optimiser already does this properly: it ranks every card the deck could
 * play against what the deck is short of, and it names what comes out for what
 * goes in with a reason on each line. Writing a second, worse version of that
 * here is the duplication the whole overhaul exists to remove, and it is the
 * project's own standing rule: one way to do each thing.
 */
function upgradesAreWorkedOutElsewhere(req: AnswerRequest, routing: Routing): Answered {
  const said = [
    'Adds and cuts are worked out on this deck\'s own Optimise view. It ranks every card the deck could play against what the deck is short of, and it says what comes out for what goes in, with the reason on each line.',
    'I am not going to do a rougher version of that here and have the two disagree with each other.',
    'What I will do from this page is your lands. Ask which lands to upgrade and I will go through them one by one against your colours.',
  ].join('\n\n');
  return finish([say(said)], [], routing, [], 'refused');
}

/* -------------------------------------------------------------------------- *
 * When nothing can answer
 * -------------------------------------------------------------------------- */

/**
 * The last thing said when the catalogue had no route and nothing else answered
 * either.
 *
 * It has to be a real message rather than an error, for a reason that cost this
 * product a fortnight. When the function returned an error status the page
 * caught it and printed its own fallback, which is built out of the attached
 * deck's counts. Both questions asked after the credits ran out had no deck, so
 * both interpolations were empty and the message stored in the database is
 * literally "That question could not be answered just now. Here is what your
 * deck holds, counted from the list itself:" followed by nothing at all.
 *
 * It also says what WOULD work, because a player who has just been told no is
 * owed the next move rather than a shrug.
 */
export function nothingToAnswerWith(have: { card: boolean; deck: boolean }): string {
  const lines = [
    'I cannot answer that one. Rather than guess, here is what I can settle right now, straight out of the catalogue.',
    '',
    'Pick a card at the top of the page and I will tell you what it does, what it is legal in, what it costs, what it combos with and whether you already run it.',
    'Ask for the most played cards doing a job and I will list them. Try "best three mana counterspells" or "best removal in black".',
  ];
  if (have.deck) {
    lines.push('With this deck attached I can go through its lands, say which slots are weak and what to play instead.');
  } else {
    lines.push('Attach a deck and I can go through its lands and say which slots are weak.');
  }
  lines.push('');
  lines.push('What I do not hold is a rules reference, anything about what is winning at the moment, and any opinion about whether a card is good. I would rather say that than make it up.');
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * Finding a card the question named
 * -------------------------------------------------------------------------- */

/**
 * A card name typed into the question itself.
 *
 * `extractCardNames` was written to pull names out of an answer and is reused
 * here on the question, because it does the right job: it offers every
 * capitalised phrase to the catalogue and the catalogue throws out everything
 * that is not a card. Only the longest match is kept, so "Rhystic Study" beats
 * "Rhystic".
 *
 * The guard that matters is that the resolved name must appear in what the
 * player typed. Without it a stray capital can attach a card nobody mentioned,
 * and then the whole answer is about the wrong card while looking confident.
 */
async function cardNamedInQuestion(db: any, question: string): Promise<{ name: string; setCode: null; collectorNumber: null } | null> {
  const { extractCardNames } = await import('../resolve-cards.ts');
  const { names } = extractCardNames(question);
  const asked = question.toLowerCase();

  const worthTrying = names
    .filter(n => n.length >= 4 && asked.includes(n.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);

  for (const candidate of worthTrying) {
    const found = await cardByName(db, candidate);
    if (!found.ok || !found.value) continue;
    if (!asked.includes(found.value.name.toLowerCase().split(' // ')[0])) continue;
    return { name: found.value.name, setCode: null, collectorNumber: null };
  }
  return null;
}

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

function refuse(routing: Routing): Answered {
  const blocks: Block[] = [];
  if (routing.gap === 'rules') blocks.push(say(NO_RULES_CORPUS));
  else if (routing.gap === 'meta') blocks.push(say(NO_META_DATA));
  else blocks.push(say(judgementGap('That')));

  return finish(blocks, [], routing, [], 'refused');
}

function askForContext(routing: Routing): Answered {
  const missing = routing.missing;
  const words =
    missing === 'card'
      ? 'Pick a card at the top of the page and ask again, or name it in the question and I will look it up.'
      : missing === 'deck'
        ? 'Attach a deck at the top of the page and ask again. Without one I would be answering about a deck I cannot see.'
        : 'I am not sure what that is about.';
  return finish([say(words)], [], routing, [], 'refused');
}

/* -------------------------------------------------------------------------- *
 * A card
 * -------------------------------------------------------------------------- */

type Part = 'what' | 'text' | 'roles' | 'popularity' | 'legality' | 'price' | 'combos' | 'alternatives' | 'decks';

async function answerAboutCard(
  req: AnswerRequest,
  routing: Routing,
  focus: { name: string; setCode: string | null; collectorNumber: string | null },
  parts: Part[]
): Promise<Answered> {
  const basis: string[] = ['cards_unique'];
  const blocks: Block[] = [];
  const attach: string[] = [];
  let standing: Answered['standing'] = 'full';

  const found = await cardByName(req.db, focus.name);
  if (!found.ok) {
    return finish(
      [say(`I could not read the catalogue just now, so I am not going to tell you about ${focus.name} from memory. Try again in a moment.`)],
      [], routing, basis, 'refused'
    );
  }
  if (!found.value) {
    return finish(
      [say(`There is no card called ${focus.name} in our catalogue. If you have the exact printed name, try that.`)],
      [], routing, basis, 'refused'
    );
  }

  const card = found.value;
  attach.push(card.name);

  /* -- what it is ------------------------------------------------------- */
  if (parts.includes('what') || parts.length === 1) {
    const cost = card.mana_cost ? ` ${card.mana_cost}` : '';
    blocks.push(say(`**${card.name}**${cost}`));
    const line: string[] = [];
    if (card.type_line) line.push(card.type_line);
    if (card.power && card.toughness) line.push(`${card.power}/${card.toughness}`);
    if (card.loyalty) line.push(`Starts on ${card.loyalty} loyalty`);
    if (line.length) blocks.push(quote(line.join('. ') + '.'));
  }

  /* -- the printed text ------------------------------------------------- */
  if (parts.includes('text')) {
    const text = printedText(card);
    if (text) {
      blocks.push(say('What it says, straight off the card:'));
      blocks.push(quote(text.split('\n').map(l => `> ${l}`).join('\n')));
    } else if (!isVanilla(card)) {
      blocks.push(say('We do not hold the rules text for this one, so read it off the card itself.'));
      standing = 'partial';
    } else {
      blocks.push(say('No rules text. It is a plain body and nothing more.'));
    }
  }

  /* -- what it is for --------------------------------------------------- */
  if (parts.includes('roles')) {
    const words = roleWords(card.tags);
    /* A colon list rather than a sentence. Some of these read as nouns
       ("a counterspell") and some as verbs ("untaps things"), and any sentence
       that tries to hold both ends up ungrammatical. Measured on Tezzeret,
       which produced "We file it under a tutor, a tutor for one kind of card
       and untaps things." */
    if (words.length) blocks.push(say(`We file it under: ${words.slice(0, 4).join(', ')}.`));
  }

  /* -- how much it is played -------------------------------------------- */
  if (parts.includes('popularity')) {
    if (card.edhrec_rank != null) {
      blocks.push(say(
        `Commander plays it at rank ${thousands(card.edhrec_rank)}. That is a place in a list of every card sorted by how many decks run it, so rank 1 is the most played card there is.`
      ));
    } else {
      blocks.push(say('We hold no popularity number for this one, so I cannot tell you how many decks run it.'));
      standing = 'partial';
    }
    if (card.game_changer) {
      blocks.push(say('It is on the Commander game changer list, which matters for bracket three and below.'));
    }
  }

  /* -- legality ---------------------------------------------------------- */
  if (parts.includes('legality')) {
    blocks.push(say(legalityLine(card)));
  }

  /* -- price ------------------------------------------------------------- */
  if (parts.includes('price')) {
    const priced = await pricePart(req, card, focus);
    basis.push(...priced.basis);
    blocks.push(...priced.blocks);
    if (priced.partial) standing = 'partial';
  }

  /* -- combos ------------------------------------------------------------ */
  if (parts.includes('combos')) {
    if (!card.oracle_id) {
      blocks.push(say('I cannot check the combo list for this one, because we hold no card id for it.'));
      standing = 'partial';
    } else {
      basis.push('meta_combos', 'meta_combo_cards');
      const combos = await combosFor(req.db, card.oracle_id, 4);
      if (!combos.ok) {
        blocks.push(say('The combo list took too long to read just now, so treat this answer as missing that part rather than as there being nothing.'));
        standing = 'partial';
      } else if (!combos.value.length) {
        blocks.push(say('Nothing in the combo list we hold pairs it with anything. That list comes from Commander Spellbook and it is not everything anybody has ever found.'));
      } else {
        const written = comboLines(combos.value, card.name);
        blocks.push(say(written.intro));
        blocks.push(quote(written.lines.join('\n')));
        for (const piece of written.pieces) attach.push(piece);
      }
    }
  }

  /* -- other cards doing the same job ------------------------------------ */
  if (parts.includes('alternatives')) {
    const rarity = await tagRarity(req.db, TAG_SYNONYMS.map(t => t.tag));
    const similar = await similarTo(req.db, card, rarity, 6);
    if (!similar.ok) {
      blocks.push(say('The shortlist of cards doing the same job could not be read just now.'));
      standing = 'partial';
    } else if (!similar.value.length) {
      blocks.push(say(`Nothing else in the catalogue is filed the same way as ${card.name}, so I have no honest shortlist to give you.`));
      standing = 'partial';
    } else {
      const mine = card.prices?.usd != null ? Number(card.prices.usd) : null;
      blocks.push(say(
        `Cards filed the same way as ${card.name}, most played first. Whether any of them is better for your deck is your call, but here is what each one costs and how much Commander runs it.`
      ));
      blocks.push(quote(similar.value.map(row => {
        const rank = row.edhrec_rank != null ? `rank ${thousands(row.edhrec_rank)}` : 'no popularity number';
        const price = priceTag(row.prices);
        const cheaper = mine != null && row.prices?.usd != null && Number(row.prices.usd) < mine ? ', cheaper' : '';
        return `- ${row.name} ${row.mana_cost ?? ''} ${price}, ${rank}${cheaper}`.replace(/\s+/g, ' ');
      }).join('\n')));
      for (const row of similar.value) attach.push(row.name);
    }
  }

  /* -- their own decks ---------------------------------------------------- */
  if (parts.includes('decks')) {
    const mine = await decksPlaying(req.userDb, card.name);
    if (mine === null) {
      // Signed out. Say nothing rather than "none of your decks", which is a
      // claim we have not checked. Same rule as a missing price.
    } else if (!mine.ok) {
      blocks.push(say('I could not read your decks just now, so I cannot say whether you already run it.'));
      standing = 'partial';
    } else {
      basis.push('user_decks', 'deck_cards');
      blocks.push(say(deckHitLine(card.name, mine.value)));
    }
  }

  /* -- the part that is not ours ------------------------------------------ */
  if (asksWhenItIsGood(routing.question)) {
    blocks.push(say(judgementGap('When it is good')));
    standing = standing === 'full' ? 'partial' : standing;
  }

  const cards = await resolveCards(req.db, attach, attach.length, 8);
  return finish(blocks, cards, routing, basis, standing);
}

const WORTH_IT = [
  'when it is good', 'when its good', 'when is it good', 'worth a slot',
  'is it any good', 'how good is', 'should i play it', 'be honest about',
];

function asksWhenItIsGood(question: string): boolean {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return WORTH_IT.some(p => text.includes(` ${p} `));
}

/** Multi face cards carry no top level rules text; theirs lives per face. */
function printedText(card: CardRow): string {
  if (card.oracle_text && card.oracle_text.trim()) return card.oracle_text.trim();
  const faces = Array.isArray(card.faces) ? (card.faces as any[]) : [];
  const parts = faces
    .map(f => {
      const head = [f?.name, f?.mana_cost].filter(Boolean).join(' ');
      const type = f?.type_line ? `\n${f.type_line}` : '';
      const body = f?.oracle_text ? `\n${f.oracle_text}` : '';
      return `${head}${type}${body}`.trim();
    })
    .filter(Boolean);
  return parts.join('\n\n');
}

/**
 * An empty rules text is not a gap. 351 rows in this catalogue are plain
 * creatures with genuinely nothing printed on them, and writing text into them
 * would be inventing a card.
 */
function isVanilla(card: CardRow): boolean {
  return card.oracle_text === '' && /creature/i.test(card.type_line ?? '');
}

function legalityLine(card: CardRow): string {
  const legalities = card.legalities ?? {};
  const legal: string[] = [];
  const not: string[] = [];
  const banned: string[] = [];
  for (const format of FORMATS) {
    const state = legalities[format.key];
    if (!state) continue;
    if (state === 'legal') legal.push(format.says);
    else if (state === 'banned') banned.push(format.says);
    else if (state === 'restricted') legal.push(`${format.says} (one copy only)`);
    else not.push(format.says);
  }
  if (!legal.length && !not.length && !banned.length) {
    return 'We hold no legality for this card, so I will not guess which formats take it.';
  }
  const parts: string[] = [];
  if (legal.length) parts.push(`Legal in ${joinWords(legal)}.`);
  if (banned.length) parts.push(`Banned in ${joinWords(banned)}.`);
  if (not.length) parts.push(`Not legal in ${joinWords(not)}.`);
  return parts.join(' ');
}

async function pricePart(
  req: AnswerRequest,
  card: CardRow,
  focus: { setCode: string | null; collectorNumber: string | null }
): Promise<{ blocks: Block[]; basis: string[]; partial: boolean }> {
  const basis: string[] = [];
  const blocks: Block[] = [];

  /* The printing on screen, not the cheapest one. Two printings of the same
     card can be a dollar and two hundred, so quoting the cheapest at somebody
     looking at a Secret Lair is a wrong number wearing a right number's
     clothes. */
  let priced: CardRow = card;
  let printingSaid = '';
  if (focus.setCode && focus.collectorNumber) {
    basis.push('cards');
    const exact = await printingOf(req.db, card.name, focus.setCode, focus.collectorNumber);
    if (exact.ok && exact.value) {
      priced = exact.value;
      printingSaid = `The printing you have open is ${exact.value.set_name ?? String(focus.setCode).toUpperCase()} number ${focus.collectorNumber}. `;
    }
  }

  const money = priceLine(priced.prices);
  const spread =
    (card.printings_count ?? 0) > 1
      ? ` There are ${thousands(card.printings_count!)} printings and they do not all cost the same.`
      : '';

  if (money) {
    blocks.push(say(`${printingSaid}About ${money}.${spread}`));
    return { blocks, basis, partial: false };
  }

  /* No number is not a price of nothing. This is the exact bug that showed a
     2,199 euro Shivan Dragon as $0.00 in the watchlist. */
  blocks.push(say(
    `${printingSaid}We hold no dollar or euro price for it, so I am not putting a number on it. That is a gap in our data, not a card nobody wants.`.trim()
  ));
  return { blocks, basis, partial: true };
}

function comboLines(combos: Combo[], cardName: string): { intro: string; lines: string[]; pieces: string[] } {
  const total = combos[0]?.totalCombos ?? combos.length;
  const shown = Math.min(combos.length, total);
  const intro =
    total > shown
      ? `It turns up in ${thousands(total)} combos we hold. The ${shown} most played:`
      : `It turns up in ${thousands(total)} ${total === 1 ? 'combo' : 'combos'} we hold:`;

  const pieces: string[] = [];
  const lines = combos.map(combo => {
    const others = combo.pieces.filter(p => p.toLowerCase() !== cardName.toLowerCase());
    for (const other of others) pieces.push(other);
    /* Two, not all of them. Spellbook lists every consequence separately, so
       one combo can carry five lines that all say the same thing in different
       words, and the line stops being readable. */
    const produces = combo.produces.length
      ? joinWords(combo.produces.slice(0, 2).map(p => p.charAt(0).toLowerCase() + p.slice(1))) +
        (combo.produces.length > 2 ? `, plus ${combo.produces.length - 2} more` : '')
      : 'something the combo list does not describe';
    const mana = combo.manaNeeded ? ` Needs ${combo.manaNeeded}.` : '';
    /* A combo with template pieces needs something we cannot name, like "a
       creature with flying". Saying "with Yahenni" and stopping would be a two
       card combo that is not one. */
    const more =
      combo.templateCount && combo.templateCount > 0
        ? ` Plus ${combo.templateCount} more piece${combo.templateCount === 1 ? '' : 's'} the combo list describes rather than names, so check it before you count on it.`
        : '';
    return `- with ${joinWords(others)}: ${produces}.${mana}${more}`;
  });

  return { intro, lines, pieces };
}

function deckHitLine(cardName: string, hits: DeckHit[]): string {
  if (!hits.length) return `It is not in any of your decks.`;
  const said = hits.map(h => {
    const where = h.isCommander ? ' as the commander' : h.quantity > 1 ? `, ${h.quantity} copies` : '';
    return `${h.deckName}${where}`;
  });
  return `You already run it in ${joinWords(said)}.`;
}

/* -------------------------------------------------------------------------- *
 * A list of cards doing one job
 * -------------------------------------------------------------------------- */

async function answerWithAList(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const role = roleFrom(routing.question);

  /* No role word means no list. "What are the best cards" is not a question the
     catalogue can answer and pretending otherwise would produce the most played
     cards in Magic, which is a fact about nothing. */
  if (!role) return null;

  const colours = coloursFrom(routing.question);
  const manaValue = manaValueFrom(routing.question);
  const wanted = countFrom(routing.question, 8);

  /* With a deck attached the same question means "for this deck", so the list
     is narrowed to its colours and its own cards come out of it. Suggesting a
     card somebody already runs is the fastest way to prove nothing read the
     list. */
  const deckColours = routing.subject === 'deck' ? req.identity.filter(c => 'WUBRG'.includes(c)) : [];
  const useColours = colours.length ? colours : deckColours;
  const exclude = routing.subject === 'deck' ? req.deckCards.map(c => c.name) : [];

  const found = await topByRole(req.db, {
    tag: role.tag,
    colours: useColours,
    manaValue,
    exclude,
    limit: wanted,
  });

  if (!found.ok) {
    return finish(
      [say('The catalogue could not be read just now, so I have no list for you. Try again in a moment.')],
      [], routing, ['cards_unique'], 'refused'
    );
  }

  const shape = [
    manaValue != null ? `${manaValue} mana` : '',
    useColours.length ? useColours.map(colourName).join(' and ') : '',
    role.says,
  ].filter(Boolean).join(' ');

  if (!found.value.length) {
    return finish(
      [say(`Nothing in the catalogue matches ${shape}${exclude.length ? ' that this deck does not already run' : ''}. That is the catalogue answering, not me giving up.`)],
      [], routing, ['cards_unique'], 'full'
    );
  }

  const blocks: Block[] = [];
  blocks.push(say(
    `The ${found.value.length} most played ${shape}${routing.subject === 'deck' ? ' your deck can play and does not already run' : ''}, Commander legal:`
  ));
  blocks.push(quote(found.value.map((row, i) => {
    const rank = row.edhrec_rank != null ? `rank ${thousands(row.edhrec_rank)}` : 'no popularity number';
    return `${i + 1}. ${row.name} ${row.mana_cost ?? ''} ${priceTag(row.prices)}, ${rank}`.replace(/\s+/g, ' ');
  }).join('\n')));
  blocks.push(say(
    'That order is how many Commander decks run each card, which is popularity and not quality. It is the honest measure we hold, and the top of a popularity list is usually where you want to start anyway.'
  ));

  const cards = await resolveCards(req.db, found.value.map(r => r.name), found.value.length, 10);
  return finish(blocks, cards, routing, ['cards_unique'], 'full');
}

/**
 * The cards Commander plays most, by colour.
 *
 * There is no cleverness here and there should not be. `edhrec_rank` is a
 * straight ordering of how many Commander decks run each card, so "the staples"
 * is the top of that list and nothing else. What the answer must not do is call
 * it a list of the best cards, because that is a different claim and we do not
 * hold it.
 */
async function answerWithStaples(req: AnswerRequest, routing: Routing): Promise<Answered> {
  const text = routing.question.toLowerCase();
  const eachColour = /each colou?r|every colou?r|all five|per colou?r/.test(text);
  const asked = coloursFrom(routing.question);
  const colours = eachColour ? ['W', 'U', 'B', 'R', 'G'] : asked;
  const perColour = Math.min(countFrom(routing.question, colours.length > 1 ? 5 : 10), 10);

  const blocks: Block[] = [];
  const attach: string[] = [];

  if (!colours.length) {
    const found = await topByRole(req.db, { limit: perColour });
    if (!found.ok) {
      return finish([say('The catalogue could not be read just now, so I have no list for you.')], [], routing, ['cards_unique'], 'refused');
    }
    blocks.push(say(`The ${found.value.length} cards Commander runs more than any others, whatever the colours:`));
    blocks.push(quote(found.value.map((r, i) => staplesLine(r, i)).join('\n')));
    for (const r of found.value) attach.push(r.name);
  } else {
    blocks.push(say(`The cards Commander runs most in ${joinWords(colours.map(colourName))}, counted by how many decks play them:`));
    for (const colour of colours) {
      const found = await topByRole(req.db, { colours: [colour], limit: perColour });
      if (!found.ok) {
        blocks.push(say(`The ${colourName(colour)} list could not be read just now.`));
        continue;
      }
      blocks.push(say(`**${colourName(colour).replace(/^./, c => c.toUpperCase())}**`));
      blocks.push(quote(found.value.map((r, i) => staplesLine(r, i)).join('\n')));
      for (const r of found.value.slice(0, 2)) attach.push(r.name);
    }
  }

  blocks.push(say(
    'That is popularity, not quality. It is what we actually hold, and it is a fair place to start, but a card being everywhere does not make it right for your deck.'
  ));

  const cards = await resolveCards(req.db, attach, attach.length, 10);
  return finish(blocks, cards, routing, ['cards_unique'], 'full');
}

function staplesLine(row: CardRow, index: number): string {
  const rank = row.edhrec_rank != null ? `rank ${thousands(row.edhrec_rank)}` : 'no popularity number';
  return `${index + 1}. ${row.name} ${row.mana_cost ?? ''} ${priceTag(row.prices)}, ${rank}`.replace(/\s+/g, ' ');
}

/* -------------------------------------------------------------------------- *
 * The lands in a deck
 *
 * All of this was already computed and then handed to something else to write
 * up. `gradeLands` reads what each land taps for against the deck's colours and
 * `findLandCandidates` pulls the fixing the deck does not run. The answer is
 * the shortlist itself.
 * -------------------------------------------------------------------------- */

async function answerAboutLands(req: AnswerRequest, routing: Routing): Promise<Answered> {
  const basis = ['cards'];
  const colours = req.identity.filter(c => 'WUBRG'.includes(c));
  const verdicts = gradeLands(req.deckCards, colours);
  const targets = upgradeTargets(verdicts);
  const landCount = req.deckCards.filter(c => !c.isSideboard && isLand(c))
    .reduce((n, c) => n + c.quantity, 0);

  const blocks: Block[] = [];
  let standing: Answered['standing'] = 'full';

  const unclassified = verdicts.filter(v => v.produces === null).map(v => v.name);
  if (unclassified.length) {
    blocks.push(say(
      `First, a gap on our side. We do not know what ${joinWords(unclassified.slice(0, 6))} taps for, so ${unclassified.length === 1 ? 'it is' : 'they are'} left out of everything below rather than counted as making nothing.`
    ));
    standing = 'partial';
  }

  if (!targets.length) {
    blocks.push(say(
      `${thousands(landCount)} lands, and every nonbasic one of them makes at least two of your colours. There is no weak slot for me to point at.`
    ));
    return finish(blocks, [], routing, basis, standing);
  }

  blocks.push(say(
    `${thousands(landCount)} lands. These are the weakest slots, worst first, judged on what each one taps for against ${colours.length ? colours.join('') : 'your colours'}:`
  ));
  blocks.push(quote(targets.map(t => {
    const taps = t.produces === null
      ? 'we do not know what it taps for'
      : t.produces.length === 0
        ? 'makes no mana itself'
        : `taps for ${t.produces.join('')}`;
    const why =
      t.verdict === 'no colour' ? 'none of your colours'
        : t.verdict === 'makes no mana' ? 'no mana at all'
          : t.verdict === 'one colour, enters tapped' ? 'one colour, and it enters tapped'
            : 'one colour';
    return `- ${t.name}: ${taps}. That is ${why}.`;
  }).join('\n')));

  const candidates = await findLandCandidates(req.db, colours, req.deckCards.map(c => c.name));
  const attach = targets.slice(0, 3).map(t => t.name);

  if (candidates === null) {
    blocks.push(say(
      'The list of lands to put in their place could not be read just now, so I am not naming any from memory. The lands above still stand, because they came out of your own list.'
    ));
    standing = 'partial';
  } else if (!candidates.length) {
    blocks.push(say(
      `No land in the catalogue makes two or more of ${colours.join('')} that you do not already run. The weak slots above are real, but I have nothing to swap them for.`
    ));
  } else {
    const swaps = candidates.slice(0, Math.min(targets.length, 6));
    blocks.push(say(`Straight swaps, keeping the land count where it is at ${thousands(landCount)}:`));
    blocks.push(quote(swaps.map((land, i) => {
      const out = targets[i]?.name;
      const makes = (land.produced_mana ?? []).filter(m => colours.includes(m)).join('');
      const tapped = /enters tapped|enters the battlefield tapped/i.test(land.oracle_text ?? '')
        ? ', enters tapped'
        : ', enters untapped';
      return `- Cut ${out}, play ${land.name}. Taps for ${makes}${tapped}. ${priceTag(land.prices)}.`;
    }).join('\n')));
    for (const land of swaps) attach.push(land.name);
  }

  const cards = await resolveCards(req.db, attach, attach.length, 8);
  return finish(blocks, cards, routing, basis, standing);
}

/* -------------------------------------------------------------------------- *
 * Finishing
 * -------------------------------------------------------------------------- */

function finish(
  blocks: Block[],
  cards: ResolvedCard[],
  routing: Routing,
  basis: string[],
  standing: Answered['standing']
): Answered {
  const faults = checkVoice(blocks);
  if (faults.length) {
    // Loud rather than silent. A house style broken in an answer nobody checks
    // is how "AI credits are exhausted for this workspace" reached a player.
    console.warn(`tutor voice check: ${faults.join(' | ')}`);
  }
  return {
    message: render(blocks),
    cards,
    charts: [],
    routing,
    basis: [...new Set(basis)],
    standing,
  };
}
