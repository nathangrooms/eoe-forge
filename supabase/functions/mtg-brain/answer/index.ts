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
  BUDGET_PAGE,
  cardByName,
  cardsInLegalityState,
  combosFor,
  decksPlaying,
  printingOf,
  similarTo,
  topByRole,
  topTwoCardCombos,
  type CardRow,
  type Combo,
  type ComboPair,
  type DeckHit,
} from './catalogue.ts';
import {
  budgetFrom,
  copiesFrom,
  countFrom,
  coloursFrom,
  formatFrom,
  looksLikeAPlayerAsking,
  manaValueFrom,
  normalise,
  pointsAtSomething,
  readQuestion,
  roleFrom,
  route,
  shapeAskedIn,
  ASKS,
  type Routing,
} from './route.ts';
import { asksHowTheyMeet, keywordDefinition, keywordsNamedIn } from './glossary.ts';
import {
  FORMATS,
  NO_COMMANDER_DATA,
  NO_META_DATA,
  NO_RULES_CORPUS,
  colourName,
  formatAmount,
  joinWords,
  looksWrong,
  priceLine,
  priceTag,
  readAmount,
  thousands,
  judgementGap,
} from './voice.ts';
import { roleWords } from './vocabulary.ts';
import {
  castingOdds,
  fitFor,
  manaProfileFor,
  planForDeck,
  readRecord,
  thinReadingNote,
  whatItDoes,
  type CardRecord,
  type DeckPlan,
} from './behaviour.ts';
import { copyVerdict, deckRuleVerdicts, printedCopyException, type Fault } from './legality.ts';
import { bandForScore, bracketIdForScore } from '../_engine/power/weights.ts';
import { gradeLands, upgradeTargets, findLandCandidates, tappedNote } from '../manabase.ts';
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
    const text = 'said' in block ? block.said : block.quoted;

    /* The zero price rule applies to EVERY block, quoted ones included.
       A list row reads as quoted because a card name sits in it, but the money
       on that row was formatted by us, and a rendered $0.00 is always something
       we produced. No card's own printed text contains it. */
    if (/\$0\.00|€0\.00/.test(text)) faults.push(`a price printed as zero in: ${text.slice(0, 60)}`);

    // The rest is about how WE write. A card's type line carries an em dash and
    // its name can carry anything, and neither is ours to edit.
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

  /* Six other screens invoke this function with a template rather than a
     question. Reading one of those as if a player had typed it would produce a
     confident answer to something nobody asked. */
  if (!looksLikeAPlayerAsking(question)) return null;

  /* A card can also be named in the question with nothing attached: "budget
     alternatives to Rhystic Study". The name has to appear in what they typed,
     which is a hard guard against a card being conjured out of a coincidence.

     TWO CARDS ARE LOOKED FOR ONLY WHEN THE QUESTION COMPARES TWO, and that is
     a cost decision as much as a correctness one. Finding a second name means
     carrying on through the remaining candidate phrases instead of returning on
     the first that resolves, which is up to eleven more catalogue reads. A
     question that is not a comparison gains nothing from them. */
  const comparing = looksLikeAComparison(question);
  const namedInText = attached
    ? []
    : await cardsNamedInQuestion(req.db, question, comparing ? 2 : 1);
  const named = attached ?? namedInText[0] ?? null;

  const have = {
    card: Boolean(named),
    deck: Boolean(req.deckContext && req.deckCards.length),
    catalogue: true as const,
  };

  const routing = route(question, have);
  if (!routing) return null;

  /* TWO CARDS NAMED, AND THE ANSWER USED TO BE ABOUT ONE OF THEM SILENTLY.
     Which one was decided by `.sort((a, b) => b.length - a.length)`, so the
     card with the longer name won whichever was asked about first: "Path to
     Exile or Swords to Plowshares, which is better?" answered about Swords and
     never said so. Answering half of a comparison without saying which half is
     the worst of the three available options.

     So a comparison gets both cards. Everything we hold about each one, side by
     side, in the order they were written. Which is better is still a table call
     and is still refused, because that is judgement and we do not hold it. */
  if (namedInText.length >= 2 && comparing && routing.subject === 'card') {
    return answerComparison(req, { ...routing, ask: 'compare', wants: COMPARE_WANTS }, namedInText);
  }

  /* A rules question about a card still gets the card. We cannot answer the
     rulings half, and saying only that leaves somebody staring at a card we
     could have read out. So the printed text goes with the refusal. */
  if (routing.gap === 'rules' && named) {
    return answerAboutCard(req, routing, named, ['what', 'text'], NO_RULES_CORPUS);
  }
  if (routing.gap) return refuse(routing);

  /* The ask needs something the request did not carry. Saying "pick a card"
     is right when they clearly meant one and had not selected it, and wrong
     when they said "explain the main archetypes" and never mentioned a card.
     In the second case we have no opinion and say nothing. */
  if (!routing.subject) {
    return pointsAtSomething(question) ? askForContext(routing) : null;
  }

  /* A CARD THAT DOES NOT EXIST, NAMED IN A QUESTION THAT NEEDS ONE.
   *
   * "What does Sol Ring of the Infinite Void do?" resolved to no card, which is
   * right, and then routed on the word "infinite" to the combo list and asked
   * the player to name a card. They had named one. It does not exist, and that
   * is the answer they were owed.
   *
   * Only when the ask WANTED a card and settled for the catalogue instead, and
   * only for a phrase of two words or more that survives having its grammar
   * trimmed off. A single capitalised word is as likely to be the start of a
   * sentence as a card. Nothing is guessed at and nothing is corrected to a
   * near miss: naming the phrase back is the whole answer. */
  if (!named && routing.subject === 'catalogue') {
    const wanted = ASKS.find(a => a.id === routing.ask)?.subjects[0];
    if (wanted === 'card') {
      const invented = await unresolvedCardName(req.db, question);
      if (invented) {
        return finish(
          [
            say(`There is no card called ${invented} in our catalogue, so I have nothing to tell you about it.`),
            say('If that is close to a real name, try the exact printed one and I will read you the card. I am not going to guess at which card you meant and answer about a different one.'),
          ],
          [], routing, ['cards_unique'], 'refused'
        );
      }
    }
  }

  /* The second card, when there is one and the question was not a comparison.
     Not silence: the answer says which card it is about before it starts. */
  const alsoNamed = namedInText.slice(1).map(c => c.name);

  switch (routing.ask) {
    case 'keyword':
      return answerAboutKeyword(req, routing, named);
    case 'legality-in-format':
    case 'legality':
      return routing.subject === 'catalogue'
        ? answerAboutAFormat(req, routing)
        : answerAboutCard(req, routing, named!, ['legality'], undefined, alsoNamed);
    case 'price':
      return routing.subject === 'catalogue'
        ? priceNeedsACard(routing)
        : answerAboutCard(req, routing, named!, ['price'], undefined, alsoNamed);
    case 'combos':
      return routing.subject === 'deck'
        ? combosAreOneCardAtATime(routing)
        : routing.subject === 'catalogue'
          ? answerWithTopCombos(req, routing)
          : answerAboutCard(req, routing, named!, ['combos'], undefined, alsoNamed);
    case 'alternatives':
      return answerAboutCard(req, routing, named!, ['alternatives'], undefined, alsoNamed);
    case 'in-my-decks':
      return answerAboutCard(req, routing, named!, ['decks'], undefined, alsoNamed);
    case 'explain':
      return answerAboutCard(req, routing, named!, ['what', 'text', 'does', 'roles', 'popularity', 'legality', 'price', 'combos', 'decks'], undefined, alsoNamed);
    case 'copies':
      return answerAboutCopies(req, routing, named);
    case 'does-it-fit':
      return answerDoesItFit(req, routing, named);
    case 'can-i-cast':
      return answerCanICast(req, routing, named);
    case 'deck-rating':
      return answerDeckRating(req, routing);
    case 'deck-value':
      return answerDeckValue(req, routing);
    case 'deck-missing':
      return answerDeckMissing(req, routing);
    case 'deck-legal':
      return answerDeckIsLegal(req, routing);
    case 'deck-shape':
      return answerDeckShape(req, routing);
    case 'colour-identity':
      return answerColourIdentity(req, routing);
    case 'ban-reason':
      return answerBanReason(req, routing, named!);
    case 'deck-colours':
      return answerDeckColours(req, routing);
    case 'build-a-deck':
      return buildingADeckIsElsewhere(routing);
    case 'win-condition':
      return winConditionIsAJudgement(routing);
    case 'best-of':
      return answerWithAList(req, routing);
    case 'staples':
      return answerWithStaples(req, routing);
    case 'upgrades':
      return upgradesAreWorkedOutElsewhere(routing);
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

/* -------------------------------------------------------------------------- *
 * What a keyword means
 *
 * The one part of the rules that is printed on the cards themselves, and the
 * one we were refusing while holding it. Wizards puts a keyword's definition in
 * brackets on the card, and we hold every card: 208 keywords, 5,734 cards,
 * measured 2026-08-29 over `cards_unique`.
 * -------------------------------------------------------------------------- */

/** At most three, because a question naming four keywords is not a question. */
const KEYWORDS_AT_ONCE = 3;

async function answerAboutKeyword(
  req: AnswerRequest,
  routing: Routing,
  named: { name: string } | null
): Promise<Answered | null> {
  const asked = keywordsNamedIn(routing.question).slice(0, KEYWORDS_AT_ONCE);
  if (!asked.length) return null;

  /* A KEYWORD INSIDE A CARD'S NAME IS THE CARD, NOT THE KEYWORD. "What does
     Flash of Insight do?" names a real card and contains a real keyword, and
     the card is plainly what was meant. The router cannot see this, because it
     decides from the words before anything has been looked up, so it is decided
     here where the resolved card is in hand. */
  if (named && asked.every(k => named.name.toLowerCase().includes(k.words))) {
    return answerAboutCard(req, routing, { ...named, setCode: null, collectorNumber: null },
      ['what', 'text', 'does', 'roles', 'popularity', 'legality', 'price']);
  }

  const blocks: Block[] = [];
  const attach: string[] = [];
  const missing: string[] = [];
  let readFailed = false;

  const found: { keyword: string; definition: string; readOff: string; varies: boolean }[] = [];
  for (const keyword of asked) {
    const read = await keywordDefinition(req.db, keyword.name);
    if (!read.ok) {
      readFailed = true;
      continue;
    }
    if (!read.value) {
      missing.push(keyword.name);
      continue;
    }
    found.push(read.value);
    attach.push(read.value.readOff);
  }

  if (!found.length) {
    return finish(
      [say(readFailed
        ? 'The catalogue could not be read just now, so I am not going to tell you what that means from memory. Try again in a moment.'
        : `I could not find a card printing a definition of ${joinWords(asked.map(k => k.name))}, so I have nothing to read you.`),
       say(NO_RULES_CORPUS)],
      [], routing, ['cards_unique'], 'refused'
    );
  }

  blocks.push(say(
    found.length === 1
      ? `**${found[0].keyword}**, in the words Wizards prints on the card:`
      : 'Each one, in the words Wizards prints on the card:'
  ));
  for (const one of found) {
    blocks.push(quote(
      found.length === 1 ? `> ${one.definition}` : `**${one.keyword}**\n> ${one.definition}`
    ));
  }
  blocks.push(say(
    found.length === 1
      ? `That is the reminder text off ${found[0].readOff} itself, not something I wrote.`
      : `Those are the reminder texts off ${joinWords(found.map(f => f.readOff))}, not something I wrote.`
  ));

  let standing: Answered['standing'] = 'full';

  /* THE QUESTION DID NOT USE THE WORD, AND THE ANSWER HAS TO SAY SO.
   *
   * "Can a creature I just played tap for mana the same turn?" reaches haste
   * through the nickname table, because that is the rule the question is
   * about and nobody asking it knows to write the word. Printing haste's
   * definition and stopping leaves the player to make the connection, and
   * worse, it lets the definition read as though it were the rule underneath.
   * It is not. Haste's reminder says what a creature WITH haste may do. The
   * rule that stops one without it is not printed on any card and we do not
   * hold it, so this says both halves out loud.
   *
   * `words` is what the player typed and `keyword` is what the catalogue calls
   * it, so they differ exactly when a nickname did the work. */
  const nicknamed = asked.filter(
    k =>
      found.some(f => f.keyword === k.name) &&
      k.words !== k.name.toLowerCase() &&
      /* A run-together spelling is not a description. Somebody who wrote
         "firststrike" knows the word and does not need telling what it is. */
      k.words.includes(' ')
  );
  if (nicknamed.length) {
    blocks.push(say(
      `You asked that without using the word, so to be plain about it: ${joinWords(nicknamed.map(n => n.name.toLowerCase()))} is the keyword for what you are describing. What is above is Wizards' definition of the keyword. The rule underneath it, the one that applies when a card does not have it, is not printed on any card and is not something we hold.`
    ));
    standing = 'partial';
  }

  /* SOME KEYWORDS HAVE NO ONE WORDING, and saying nothing about that is how
     this prints a wrong rule. Protection is always protection FROM something,
     so the reminder on the card names a colour; cycling, kicker, equip, crew
     and ward name a cost. The wording above is a real one off a real card and
     it is not the whole of the keyword, and the player has to be told which
     they are holding. */
  const varying = found.filter(f => f.varies);
  if (varying.length) {
    blocks.push(say(
      `One thing to hold in mind about ${joinWords(varying.map(v => v.keyword))}. The wording changes from card to card, because the cost or the colour is part of it, so read the brackets on your own card for the version that applies. What is above is one card's.`
    ));
    standing = 'partial';
  }

  if (missing.length) {
    /* "No card prints a definition" would be a claim about the whole catalogue
       made from a sample of it, and the sample is capped for speed. What is
       true is that none of the cards read printed one. */
    blocks.push(say(
      `I could not find a card printing a definition of ${joinWords(missing)} in the ones I read, so that part I cannot give you.`
    ));
    standing = 'partial';
  }

  /* TWO KEYWORDS MEETING IS A DIFFERENT QUESTION FROM TWO DEFINITIONS, and it
     is the one we do not hold. We have what deathtouch says and what trample
     says. How much damage a creature with both has to assign to a blocker is a
     combat damage rule and it is written nowhere in this database. Printing the
     two definitions and stopping would let the answer read as though it settled
     the interaction. */
  /* ONE KEYWORD AND A TIMING QUESTION IS THE SAME GAP. "If I block a creature
     that has first strike, does my creature die before it gets to deal damage?"
     names one keyword, and printing its definition and stopping lets the
     definition read as the answer to a question about the order of the damage
     steps. It is not. Both cases say the same missing thing, in the number the
     sentence needs. */
  if (asksHowTheyMeet(routing.question)) {
    blocks.push(say(
      found.length > 1
        ? 'What each one does is above. What happens when they meet is a rule about combat and the order things happen in, and that is the part we do not hold, so I am not going to work it out for you here.'
        : 'That is what the keyword says. What you are asking is about the order things happen in during combat, and that rule is not printed on any card, so it is not something we hold and I am not going to work it out for you here.'
    ));
    standing = 'partial';
  }

  const cards = await resolveCards(req.db, attach, attach.length, 4);
  return finish(blocks, cards, routing, ['cards_unique'], standing);
}

/* -------------------------------------------------------------------------- *
 * Two cards held up against each other
 * -------------------------------------------------------------------------- */

const COMPARE_WANTS = 'Two cards side by side, on every number we hold for both.';

/**
 * A comparison, which is everything we hold about each card and no verdict.
 *
 * The verdict is the part that is not ours. `judgementGap` says so in the same
 * words it says it everywhere else, and it says it AFTER the facts rather than
 * instead of them, because a player comparing two cards can decide from what
 * each one does, costs and is played at.
 */
async function answerComparison(
  req: AnswerRequest,
  routing: Routing,
  named: NamedCard[]
): Promise<Answered | null> {
  const rows: CardRow[] = [];
  for (const one of named.slice(0, 2)) {
    const found = await cardByName(req.db, one.name);
    if (!found.ok) {
      return finish(
        [say('I could not read the catalogue just now, so I am not going to compare two cards from memory. Try again in a moment.')],
        [], routing, ['cards_unique'], 'refused'
      );
    }
    if (found.value) rows.push(found.value);
  }
  if (rows.length < 2) return null;

  const blocks: Block[] = [
    say(`${joinWords(rows.map(r => r.name))}, side by side. Here is everything we hold about each of them.`),
  ];

  for (const card of rows) {
    blocks.push(say(`**${card.name}**${card.mana_cost ? ` ${card.mana_cost}` : ''}`));
    const head: string[] = [];
    if (card.type_line) head.push(card.type_line);
    if (card.power && card.toughness) head.push(`${card.power}/${card.toughness}`);
    const text = printedText(card);
    blocks.push(quote([head.join('. ') + (head.length ? '.' : ''), text].filter(Boolean).join('\n')));

    /* Two sentences rather than one joined list, because the two facts do not
       share a grammar: "Commander plays it at rank 11 and about $1.34" is what
       joining them produced. */
    const money = priceLine(card.prices);
    blocks.push(say([
      card.edhrec_rank != null
        ? `Commander plays it at rank ${thousands(card.edhrec_rank)}.`
        : 'We hold no popularity number for it.',
      money ? `About ${money}.` : 'We hold no price for it.',
      legalityLine(card),
    ].join(' ')));
  }

  const differences = whatSeparatesThem(rows[0], rows[1]);
  if (differences.length) {
    blocks.push(say('On the numbers we hold:'));
    blocks.push(quote(differences.map(d => `- ${d}`).join('\n')));
  }

  blocks.push(say(judgementGap('Which of two cards is better')));

  const cards = await resolveCards(req.db, rows.map(r => r.name), rows.length, 4);
  return finish(blocks, cards, routing, ['cards_unique'], 'full');
}

/**
 * The differences that are facts rather than opinions.
 *
 * Only three, and each one is a column read twice. Anything beyond this is a
 * judgement about which difference matters, and that is the call being left to
 * the player.
 */
function whatSeparatesThem(a: CardRow, b: CardRow): string[] {
  const out: string[] = [];

  if (a.cmc != null && b.cmc != null) {
    out.push(
      a.cmc === b.cmc
        ? `Both cost ${thousands(a.cmc)} mana.`
        : `${a.cmc < b.cmc ? a.name : b.name} costs less mana: ${thousands(Math.min(a.cmc, b.cmc))} against ${thousands(Math.max(a.cmc, b.cmc))}.`
    );
  }

  if (a.edhrec_rank != null && b.edhrec_rank != null) {
    const more = a.edhrec_rank < b.edhrec_rank ? a : b;
    const less = more === a ? b : a;
    out.push(
      `${more.name} is played more, at rank ${thousands(more.edhrec_rank!)} against ${thousands(less.edhrec_rank!)}.`
    );
  }

  /* A MISSING PRICE IS NOT A CHEAP CARD, so the comparison is only made when
     both have one. Around a thousand printings carry no dollar quote at all,
     and calling one of them the cheaper of two would be inventing the number
     that decided it. */
  const priceA = readAmount(a.prices?.usd);
  const priceB = readAmount(b.prices?.usd);
  if (priceA != null && priceB != null) {
    const cheap = priceA < priceB ? a : b;
    out.push(
      `${cheap.name} costs less to buy: ${formatAmount(Math.min(priceA, priceB), 'USD')} against ${formatAmount(Math.max(priceA, priceB), 'USD')}.`
    );
  } else if (priceA == null || priceB == null) {
    const without = priceA == null ? a : b;
    out.push(`We hold no dollar price for ${without.name}, so I am not saying which is cheaper.`);
  }

  return out;
}

/* -------------------------------------------------------------------------- *
 * The whole catalogue as the subject
 *
 * Three asks used to need a card and refuse without one, while the answer was a
 * single read away. "What cards are banned in commander" is 76 rows. "The best
 * two card combos" is 3,887 rows we already ingest.
 * -------------------------------------------------------------------------- */

/** How many rows a format list prints before it stops. */
const FORMAT_LIST = 20;

/**
 * How many rows are read so the count in the sentence is the real one.
 *
 * The first version of this read one more than it printed and then said
 * "21 or more cards are banned in Commander", which is true and useless: there
 * are 76. The whole list is 76 rows and the read that returns it is 22.8 ms, so
 * there is no reason to state a floor instead of the number.
 */
const FORMAT_LIST_READ = 400;

async function answerAboutAFormat(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const text = routing.question.toLowerCase();
  const format = formatFrom(routing.question) ?? 'commander';
  const says = FORMATS.find(f => f.key === format)?.says ?? format;

  const state: 'banned' | 'restricted' | null =
    /\bban(ned)?\b|\bban list\b|\bbanned list\b/.test(text) ? 'banned'
      : /\brestricted\b/.test(text) ? 'restricted'
        : null;

  /* NO STATE ASKED FOR MEANS NO OPINION, and returning null rather than a
     refusal is deliberate. "Can I play a card with a green mana symbol in its
     rules text?" reaches here, and a paragraph saying legality is a fact about
     a card is a worse answer than the stock one, which at least offers three
     things a player can do next. Null lets that one be given. */
  if (!state) return null;

  const wanted = Math.max(countFrom(routing.question, FORMAT_LIST), FORMAT_LIST);
  const found = await cardsInLegalityState(req.db, format, state, FORMAT_LIST_READ);
  if (!found.ok) {
    return finish(
      [say('The catalogue could not be read just now, so I have no list for you. Try again in a moment.')],
      [], routing, ['cards_unique'], 'refused'
    );
  }
  if (!found.value.length) {
    return finish(
      [say(`We hold no card marked ${state} in ${says}. That is the catalogue answering, not me giving up.`)],
      [], routing, ['cards_unique'], 'full'
    );
  }

  const total = found.value.length;
  const shown = found.value.slice(0, wanted);
  const blocks: Block[] = [
    say(
      total > shown.length
        ? `${thousands(total)}${total >= FORMAT_LIST_READ ? ' or more' : ''} cards are ${state} in ${says}. The ${thousands(shown.length)} most played of them:`
        : `${thousands(total)} ${total === 1 ? 'card is' : 'cards are'} ${state} in ${says}, most played first:`
    ),
    quote(shown.map((row, i) => {
      const rank = row.edhrec_rank != null ? `rank ${thousands(row.edhrec_rank)}` : 'no popularity number';
      return `${i + 1}. ${row.name} ${row.mana_cost ?? ''} ${priceTag(row.prices)}, ${rank}`.replace(/\s+/g, ' ');
    }).join('\n')),
    say(
      `That is read straight off each card's own legality, which is where the list comes from rather than from a page somebody typed up. Why any one of them is ${state} is not something we hold.`
    ),
  ];

  const cards = await resolveCards(req.db, shown.map(r => r.name), shown.length, 10);
  return finish(blocks, cards, routing, ['cards_unique'], 'full');
}

/** How many combos a list prints. */
const COMBO_LIST = 8;

async function answerWithTopCombos(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const text = routing.question.toLowerCase();

  /* "What does it combo with" is a question about a card that has not been
     picked yet, and answering it with the format's most played combos would be
     answering something else. The catalogue is the subject only when the
     question asks about the format rather than about a card. */
  /* "What two cards make infinite mana?" is a question about the format and it
     says none of the words this looked for, so it got the paragraph asking the
     player to name a card when the whole point of the question is that they do
     not know which card to name. Every phrase added here asks for cards rather
     than about one, and the subject is already the catalogue, which means no
     card resolved out of the question in the first place. */
  const aboutTheFormat =
    /\bbest\b|\btop\b|\bmost\b|\bwhat are\b|\blist\b|\bstrongest\b|\bfamous\b|\bcommon\b/.test(text) ||
    /\bwhat (two |three )?cards\b|\bwhich (two |three )?cards\b|\bwhat two\b|\bwhich two\b|\bany two cards\b/.test(text);
  if (!aboutTheFormat) {
    return finish(
      [say('Pick a card at the top of the page, or name it in the question, and I will tell you every combo we hold that it is part of, what the other pieces are and what it produces.')],
      [], routing, [], 'refused'
    );
  }

  /* "WHAT TWO CARDS MAKE INFINITE MANA" ASKS FOR TWO PIECES, NOT TWO ANSWERS.
     `countFrom` already knows a number in front of the singular "card" is
     describing the combo, which is what fixed "the best two card combos". The
     plural slips past it, and "two cards" in a combo question means the same
     thing. Every combo in this list has two pieces by construction, so the
     number is never the list length here. */
  const sizeIsInTheWords = /\b(two|three|2|3)\s+cards?\b/.test(text);
  const wanted = sizeIsInTheWords ? COMBO_LIST : countFrom(routing.question, COMBO_LIST);
  const found = await topTwoCardCombos(req.db, wanted);
  if (!found.ok) {
    return finish(
      [say('The combo list could not be read just now, so I have nothing for you. Try again in a moment.')],
      [], routing, ['meta_combos', 'meta_combo_cards'], 'refused'
    );
  }

  /* "Infinite" is a word the question can carry, and Spellbook writes what a
     combo produces, so it can be honoured rather than ignored. It is applied
     after the read because `produces` is an array of free text. */
  /* "Infinite mana" is a narrower request than "infinite", and Spellbook writes
     what a combo produces in words, so the word after infinite can be honoured
     rather than dropped. Without it "what two cards make infinite mana" came
     back led by infinite lifegain, which is a true list and the wrong one. */
  const wantsInfinite = /\binfinite\b/.test(text);
  const broad = wantsInfinite
    ? found.value.filter(c => c.produces.some(p => /infinite/i.test(p)))
    : found.value;

  /* NARROW ONLY IF NARROWING FINDS SOMETHING. The word after "infinite" is
     "mana" in "what two cards make infinite mana" and "combos" in "the best two
     card infinite combos", and the second is not a thing a combo produces. A
     word list separating them would go stale; letting the data decide does not.
     If the narrower read is empty the broader one stands, which is the same
     rule as never printing a confident zero. */
  const ofWhat = wantsInfinite ? text.match(/\binfinite\s+([a-z]+)/)?.[1] ?? null : null;
  const narrowed = ofWhat
    ? broad.filter(c => c.produces.some(p => /infinite/i.test(p) && p.toLowerCase().includes(ofWhat)))
    : [];

  const rows = (narrowed.length ? narrowed : broad)
    .filter(c => c.pieces.length === 2)
    .slice(0, wanted);

  if (!rows.length) {
    return finish(
      [say('Nothing in the combo list we hold matches that. That list comes from Commander Spellbook and it is not everything anybody has ever found.')],
      [], routing, ['meta_combos', 'meta_combo_cards'], 'full'
    );
  }

  const blocks: Block[] = [
    say(
      `The ${thousands(rows.length)} most played two card ${wantsInfinite ? 'infinite ' : ''}combos we hold, both pieces named and Commander legal:`
    ),
    quote(rows.map((combo, i) => comboPairLine(combo, i)).join('\n')),
    say(
      'That order is how many decks the combo list records each one in, which is popularity and not power. Both pieces are named cards: a combo that needs something described rather than named, like a creature with flying, is left out because it is not a two card combo.'
    ),
  ];

  const attach = rows.slice(0, 4).flatMap(c => c.pieces);
  const cards = await resolveCards(req.db, attach, attach.length, 8);
  return finish(blocks, cards, routing, ['meta_combos', 'meta_combo_cards'], 'full');
}

function comboPairLine(combo: ComboPair, index: number): string {
  const produces = combo.produces.length
    ? joinWords(combo.produces.slice(0, 2).map(p => p.charAt(0).toLowerCase() + p.slice(1))) +
      (combo.produces.length > 2 ? `, plus ${combo.produces.length - 2} more` : '')
    : 'something the combo list does not describe';
  const mana = combo.manaNeeded ? ` Needs ${combo.manaNeeded}.` : '';
  return `${index + 1}. ${joinWords(combo.pieces)}: ${produces}.${mana}`;
}

/* -------------------------------------------------------------------------- *
 * How many of a thing a list in this format runs
 *
 * "How many lands should I run in a commander deck?" is one of the most asked
 * questions in the format and it got the paragraph Tutor prints when it has no
 * route. The number was two joins away. `meta_deck_shape` does them.
 * -------------------------------------------------------------------------- */

/**
 * What the lists we hold are, said every time a number off them is printed.
 *
 * They are preconstructed decks and published lists, not tournament results,
 * and the difference matters: a precon is a fair answer to "how many lands do
 * published Commander decks run" and no answer at all to "how many lands does a
 * deck need to win". Saying which one this is takes one clause.
 */
const WHAT_THE_LISTS_ARE =
  'complete 100 card lists we hold, which are preconstructed decks and published lists rather than tournament results';

async function answerDeckShape(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const shape = shapeAskedIn(routing.question);
  if (!shape) return null;

  /* The format the question named, or Commander, and it is said out loud. A
     number counted over Commander lists must never be printed at somebody who
     asked about Modern without the word Commander in the sentence. */
  const format = formatFrom(routing.question) ?? 'commander';
  const says = FORMATS.find(f => f.key === format)?.says ?? format;

  const { data, error } = await req.db.rpc('meta_deck_shape', {
    p_format: format,
    p_kind: shape.kind,
    p_tag: shape.tag,
  });

  if (error) {
    return finish(
      [say('I could not read the deck lists just now, so I am not going to give you a number from memory. Try again in a moment.')],
      [], routing, ['meta_decks'], 'refused'
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  /* NO ROW IS AN ANSWER. The function refuses to publish a median over fewer
     than thirty lists, which is the same floor the inclusion tables use, so an
     empty result means we hold too little to say anything rather than that the
     answer is zero. */
  if (!row) {
    return finish(
      [say(
        `I do not hold enough ${says} lists to give you a number for that. The lists we hold are grouped by format, and a median worked out from a handful of them would be a made up convention rather than a measurement.`
      )],
      [], routing, ['meta_decks'], 'refused'
    );
  }

  const median = Math.round(Number(row.median));
  const p10 = Math.round(Number(row.p10));
  const p90 = Math.round(Number(row.p90));
  const blocks: Block[] = [];

  blocks.push(say(
    `${median} ${shape.says}. That is the middle of ${thousands(row.decks_in_scope)} ${says} ${WHAT_THE_LISTS_ARE}.`
  ));
  blocks.push(say(
    `Most of them sit between ${p10} and ${p90}, and the whole spread is ${row.lowest} to ${row.highest}. So anywhere in the middle band is normal and the ends are somebody doing something on purpose.`
  ));

  /* Lands and creatures are read off the type line, which the deck page sends
     with every card, so the attached deck can be counted here and put beside
     the number. A tag is not sent with the deck and is not going to be guessed
     at, so that comparison is simply not offered rather than being invented. */
  if (req.deckCards.length && shape.kind !== 'tag') {
    const own = req.deckCards
      .filter(c => !c.isSideboard)
      .filter(c =>
        shape.kind === 'land'
          ? isLand(c)
          : /creature/i.test(c.typeLine) && !isLand(c)
      )
      .reduce((n, c) => n + c.quantity, 0);
    const gap = own - median;
    const where =
      gap === 0 ? 'exactly the middle'
        : own < p10 ? `${p10 - own} under where most of them sit`
          : own > p90 ? `${own - p90} over where most of them sit`
            : 'inside the band most of them sit in';
    blocks.push(say(
      `The deck you have attached runs ${own}, which is ${where}.`
    ));
  }

  if (shape.kind === 'tag') {
    blocks.push(say(
      `Lands are not counted in that. A land that ramps carries the same label, and counting it twice would make the two numbers overlap without saying so.`
    ));
  }

  return finish(blocks, [], routing, ['meta_decks', 'meta_deck_cards', 'cards_unique'], 'full');
}

/* -------------------------------------------------------------------------- *
 * Colour identity
 *
 * "My commander is blue and white. Can I play a card that has a green mana
 * symbol in its rules text?" is a rule, and it is the one rule question we can
 * settle by SHOWING rather than reciting: `color_identity` is a column on every
 * card and it already counts the symbols printed in the rules text.
 * -------------------------------------------------------------------------- */

async function answerColourIdentity(req: AnswerRequest, routing: Routing): Promise<Answered> {
  const asked = coloursFrom(routing.question);
  const colour = asked[asked.length - 1] ?? null;

  const blocks: Block[] = [
    say('Yes it counts, and it is not only the mana cost. A card\'s colour identity is every mana symbol printed on it, in the cost and in the rules text, and a Commander deck may only play cards whose identity fits inside its commander\'s.'),
  ];

  /* The claim is checked against our own rows before it is made. Cards whose
     identity comes ONLY from a symbol in the rules text are the whole point, so
     one is fetched and named. If the read fails, the sentence above still
     stands on the column itself and nothing is invented to fill the gap. */
  let shown = false;
  if (colour) {
    const symbol = `{${colour}}`;
    /* LANDS ARE THROWN OUT, and the first version of this did not and it
       showed the player Breeding Pool. A land has no mana cost at all, so
       "costs nothing and its identity is green and blue" reads as a nonsense
       and teaches nothing: the interesting case is a card with a real cost in
       one set of colours and an identity in another. Talisman of Curiosity
       costs {2} and is green and blue purely because of the {G} it prints. */
    const { data } = await req.db
      .from('cards_unique')
      .select('name, mana_cost, color_identity, oracle_text, edhrec_rank')
      .contains('color_identity', [colour])
      .not('tags', 'cs', '{land}')
      .not('mana_cost', 'ilike', `%${symbol}%`)
      .ilike('oracle_text', `%${symbol}%`)
      .not('edhrec_rank', 'is', null)
      .order('edhrec_rank', { ascending: true })
      .limit(3);

    const rows = ((data ?? []) as CardRow[]).filter(row => row.mana_cost);
    if (rows.length) {
      shown = true;
      blocks.push(say(
        `Here are cards from our own catalogue where that is the whole reason, ${colourName(colour)} in the rules text and nowhere in the cost:`
      ));
      blocks.push(quote(rows.map(row => {
        const identity = (row.color_identity ?? []).map(colourName);
        return `- ${row.name} costs ${row.mana_cost} and its colour identity is ${joinWords(identity)}.`;
      }).join('\n')));
      blocks.push(say(
        `So a deck whose commander is not ${colourName(colour)} cannot play ${rows[0].name}, whatever its cost says.`
      ));
    }
  }

  if (!shown) {
    blocks.push(say(
      'Every card in our catalogue carries its colour identity as its own field, so if you name a card I will read you its identity and you can hold that against your commander.'
    ));
  }

  blocks.push(say(
    'Two things it does not count. Reminder text in brackets does not, and neither does a colour word written out in letters. A hybrid symbol counts as both of its colours.'
  ));

  return finish(blocks, [], routing, ['cards_unique'], shown ? 'full' : 'partial');
}

/* -------------------------------------------------------------------------- *
 * Why a card was banned
 * -------------------------------------------------------------------------- */

/**
 * We hold WHETHER, on the card, and nothing at all about WHY.
 *
 * The old answer to "Why was Jeweled Lotus banned?" was the card's whole page,
 * which printed "Commander plays it at rank 8,914" four lines above "Banned in
 * Commander" and never said the reason was missing. Read together those two
 * lines say nobody plays it in the format it is banned in, and it is banned in
 * that format. Saying the gap first fixes both halves.
 */
async function answerBanReason(
  req: AnswerRequest,
  routing: Routing,
  named: { name: string; setCode: string | null; collectorNumber: string | null }
): Promise<Answered> {
  return answerAboutCard(
    req,
    routing,
    named,
    ['what', 'legality', 'price'],
    undefined,
    [],
    'Why a card was banned is not something we hold. Our catalogue carries whether it is banned and nothing about the thinking, so anything I said about the reason would be me making it up. The format\'s own banned list announcement is where that is written down. Here is what we do hold.'
  );
}

/* -------------------------------------------------------------------------- *
 * Which colours the attached deck is thin on
 * -------------------------------------------------------------------------- */

/** Every coloured pip in a mana cost, so {2}{W}{W} counts white twice. */
function pipsIn(manaCost: string): string[] {
  return [...String(manaCost ?? '').matchAll(/\{([^}]+)\}/g)]
    .flatMap(m => m[1].split('/').filter(part => 'WUBRG'.includes(part)));
}

async function answerDeckColours(req: AnswerRequest, routing: Routing): Promise<Answered> {
  const identity = req.identity.filter(c => 'WUBRG'.includes(c));
  const main = req.deckCards.filter(c => !c.isSideboard);

  if (!identity.length) {
    return finish(
      [say(
        'This deck is colourless. There is no colour for it to be short of, and every land in it that makes any colour is making mana the deck has nothing to spend it on.'
      )],
      [], routing, [], 'full'
    );
  }

  /* Two counts per colour, both read off the deck's own list and nothing else.
     Wanted is coloured pips across every nonland card, which is what the deck
     will actually have to pay. Sources is lands that make it, which is where
     the mana comes from. Neither is a verdict and both are printed. */
  const wanted = new Map<string, number>();
  const sources = new Map<string, number>();
  for (const colour of identity) {
    wanted.set(colour, 0);
    sources.set(colour, 0);
  }

  let unknownLands = 0;
  for (const card of main) {
    if (isLand(card)) {
      if (card.producedMana === null) {
        unknownLands += card.quantity;
        continue;
      }
      for (const colour of new Set(card.producedMana)) {
        if (sources.has(colour)) sources.set(colour, sources.get(colour)! + card.quantity);
      }
      continue;
    }
    for (const pip of pipsIn(card.manaCost)) {
      if (wanted.has(pip)) wanted.set(pip, wanted.get(pip)! + card.quantity);
    }
  }

  const rows = identity
    .map(colour => ({
      colour,
      wanted: wanted.get(colour) ?? 0,
      sources: sources.get(colour) ?? 0,
      /* Sources per pip wanted. Lower means the deck asks for a colour more
         often than its lands make it. It is a ratio off the list, not a
         recommendation, and it is never presented as one. */
      ratio: (wanted.get(colour) ?? 0) === 0 ? Infinity : (sources.get(colour) ?? 0) / (wanted.get(colour) ?? 1),
    }))
    .sort((a, b) => a.ratio - b.ratio);

  const blocks: Block[] = [
    say(
      `Counted off your own list: how often each colour is asked for, and how many of your lands make it.`
    ),
    quote(rows.map(r =>
      `- ${colourName(r.colour).replace(/^./, m => m.toUpperCase())}: ${r.wanted} coloured symbol${r.wanted === 1 ? '' : 's'} across the nonland cards, ${r.sources} land${r.sources === 1 ? '' : 's'} that make it.`
    ).join('\n')),
  ];

  const thinnest = rows[0];
  const widest = rows[rows.length - 1];
  if (rows.length > 1 && thinnest.ratio < widest.ratio) {
    blocks.push(say(
      `${colourName(thinnest.colour).replace(/^./, m => m.toUpperCase())} is the one your lands cover least well against how often the deck asks for it. ${colourName(widest.colour).replace(/^./, m => m.toUpperCase())} is the best covered.`
    ));
  }

  let standing: Answered['standing'] = 'full';
  if (unknownLands) {
    blocks.push(say(
      `${unknownLands} of your lands are left out of the source counts because we do not know what they tap for. Treat the numbers above as at least that many short rather than exact.`
    ));
    standing = 'partial';
  }

  blocks.push(say(
    'That is symbols against sources and nothing else. It does not know which of your spells you cast early and which sit in hand, and that is the part that decides whether a colour actually feels short at the table.'
  ));

  return finish(blocks, [], routing, [], standing);
}

/* -------------------------------------------------------------------------- *
 * Two hand-offs
 * -------------------------------------------------------------------------- */

/**
 * Building a whole deck.
 *
 * The Deck Generator does this, with a budget, and Tutor has never named it. A
 * refusal that does not point at the thing in the same product that does the
 * job reads as the product not knowing itself.
 */
function buildingADeckIsElsewhere(routing: Routing): Answered {
  return finish(
    [
      say('Building a whole deck is what the Deck Generator is for. Give it a commander and a budget and it picks the list, and it works from the same catalogue I read, so the two of us will not disagree with each other.'),
      say('What I will do from here is the parts. Ask me for the most played cards doing a job and I will list them with prices, so *best ramp in green under a dollar* or *best removal in white* gets you a shortlist you can build from.'),
    ],
    [], routing, [], 'refused'
  );
}

/**
 * How a deck wins.
 *
 * The tags on the Atraxa list say counters and proliferate. That is a theme,
 * not a win condition, and printing it as one would be the kind of confident
 * wrong answer this whole answerer exists to avoid.
 */
function winConditionIsAJudgement(routing: Routing): Answered {
  return finish(
    [
      say('How a deck actually wins is a judgement about the list, and I do not hold one. What we store is what each card does and how many decks play it, and neither of those adds up to a plan for closing a game.'),
      say('Two things near it I can do. Pick a card from the deck and I will give you every combo we hold that it is part of, which is usually where the fast win is. And the deck page works out a power score from the list, which says how quickly it can win without saying how.'),
    ],
    [], routing, [], 'refused'
  );
}

/**
 * A price question with no card in it.
 *
 * There is no honest list to give instead. `prices` is jsonb and a database
 * order on `prices->>'usd'` sorts as text, so 9.99 comes out above 10,000, and
 * there is no numeric price column on the view to order by. Reading all 32,449
 * priced rows to sort them here is the shape of read that has taken this
 * database down twice. So this says what it needs and where the other answer
 * lives, rather than serving a list that was sorted wrongly.
 */
function priceNeedsACard(routing: Routing): Answered {
  const text = normalise(routing.question);

  /* THE SAME PARAGRAPH WAS BEING PRINTED AT THREE DIFFERENT QUESTIONS, and for
     two of them it answered something else. "What is the most expensive card in
     Magic?" is not a question that needs a card named; it is a question we
     cannot sort for. "How much is my collection worth?" already has its answer
     on another page and the paragraph buried that in its second sentence. Each
     one gets the sentence that is actually true about it. */
  const aboutTheirOwn = / my collection | my cards | i own | my stuff /.test(text);
  const wantsTheTop =
    /(most|least) expensive|priciest|dearest|cheapest card|top ten by price|highest price/.test(text);

  if (aboutTheirOwn) {
    return finish(
      [
        say('Your collection page prices the whole thing, card by card, from the same numbers I would use. That is the place to look rather than here, because it can see everything you own and I am answering one card at a time.'),
        say('Name a card and I will give you what we hold for it in dollars and in euros.'),
      ],
      [], routing, [], 'refused'
    );
  }

  if (wantsTheTop) {
    return finish(
      [
        say('I cannot put the whole catalogue in price order. Prices are stored here as text rather than as numbers, so a straight sort puts $9.99 above $10,000, and a list built that way would be confidently wrong from the first line.'),
        say('Name a card and I will give you exactly what we hold for it, in dollars and in euros, and say how many printings there are when they do not all cost the same.'),
      ],
      [], routing, [], 'refused'
    );
  }

  return finish(
    [
      say('A price is a fact about one card, and often about one printing of it, so I need to know which. Pick a card at the top of the page or name it in the question and I will give you what we hold in dollars and in euros.'),
      say('If you are asking what your own cards are worth rather than one card, your collection page prices the whole thing from the same numbers I would use.'),
    ],
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
function upgradesAreWorkedOutElsewhere(routing: Routing): Answered {
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
    /* WRITTEN AS A LIST BECAUSE IT IS A LIST.
       Owner: "Tutor responses are very poorly formatted". This was five long
       sentences run together into three paragraphs, and what it is actually
       saying is "here are the three things I can do". Tutor.tsx renders every
       answer through ReactMarkdown with prose spacing already configured, so
       the structure was available the whole time and this was not using it.

       A player who has just been told no is reading to find their next move.
       Three bullets they can scan beats a paragraph they have to parse. */
    'I cannot answer that one, and I would rather say so than guess.',
    '',
    'Here is what I can settle right now, straight from the catalogue:',
    '',
    '- **Pick a card** at the top of the page and I will tell you what it does, what it is legal in, what it costs, what it combos with and whether you already run it.',
    '- **Ask for the most played cards doing a job** and I will list them. Try *best three mana counterspells* or *best removal in black under a dollar*.',
    /* The keyword line is here because the sentence at the bottom of this list
       used to say we hold no rules reference at all, which sent players away
       from something we do hold. Wizards prints a keyword's definition on the
       card and we hold every card. */
    '- **Ask what a keyword means** and I will read you Wizards\' own words off the card. Try *what does hexproof mean* or *what is overload*.',
  ];
  if (have.deck) {
    lines.push('- **Ask about your lands** and I will go through this deck one slot at a time, say which are weak and what to play instead.');
  } else {
    lines.push('- **Attach a deck** and I will go through its lands and say which slots are weak.');
  }
  lines.push('');
  /* NARROWED, because the old sentence was wider than the truth. It said we
     hold no rules reference at all, and we hold the keyword glossary, printed
     by Wizards on the cards themselves. What we genuinely do not hold is the
     rules that are not printed on a card. */
  lines.push('What I do not hold is the rules that are not printed on a card, which is timing, the stack and priority. Nor anything about what is winning at the moment, nor an opinion on whether a card is good.');
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
/**
 * The words that are grammar rather than part of a card's name.
 *
 * Only ever stripped from the ENDS of a phrase. "Path to Exile" and "Swords to
 * Plowshares" both carry "to" in the middle and must keep it.
 */
const EDGE_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for',
  'from', 'how', 'i', 'if', 'in', 'is', 'it', 'my', 'of', 'on', 'or', 'should',
  'that', 'the', 'this', 'to', 'was', 'were', 'what', 'when', 'which', 'why',
  'with', 'would', 'you', 'your',
  /* THE WORD A QUESTION OPENS WITH IS GRAMMAR TOO, and it is capitalised for
     the same reason "Is" was: it starts the sentence. "Explain Cyclonic Rift in
     plain terms" produced the phrase "Explain Cyclonic Rift in", whose core
     kept "explain" and therefore looked like a longer name containing the card,
     so the card was thrown away and the reply asked the player to name a card
     they had just named. */
  'explain', 'tell', 'me', 'about', 'show', 'give', 'find', 'name',
  /* THE AUXILIARY VERBS A QUESTION OPENS WITH. Same fault as "Is", found on
     "Has Rhystic Study gone up in price this year?": the phrase "Has Rhystic
     Study" kept its "has", so it read as a longer name containing the card, the
     card was thrown away as a fragment, and the answer said there is no card
     called Has Rhystic Study. Only words that are grammar go in here, and only
     the ends of a phrase are ever trimmed. */
  'has', 'have', 'had', 'did', 'could', 'might', 'must', 'am', 'been', 'shall',
]);

/**
 * The question with plural card names made singular, for one ask only.
 *
 * "Can I run two Islands in my commander deck?" names a real card in the plural,
 * and `extractCardNames` offers the catalogue `Islands`, which is not a card. A
 * bare `s` off the end of a capitalised word is crude and would break "Swords to
 * Plowshares", which is exactly why the only caller runs it as a SECOND attempt
 * after the question's own words have already failed to name anything.
 */
function depluralised(question: string): string {
  return question.replace(/\b([A-Z][a-z]{2,})s\b/g, '$1');
}

/**
 * A FORMAT NAME AT THE END OF A PHRASE IS THE QUESTION, NOT THE CARD.
 *
 * `extractCardNames` joins capitalised words across small connecting words, so
 * "Can I play Swords to Plowshares in Modern?" emits the single phrase
 * "Swords to Plowshares in Modern". The fragment guard below then read that as
 * a longer name containing the card and threw the card away, and a legality
 * question about a real card got the stock refusal.
 *
 * These are the only words that can be trimmed for that, and they are trimmed
 * only off the END. They are the same format list every legality line is
 * written from, so a format Tutor can say is a format it can be asked in.
 *
 * IT MUST STAY THIS NARROW. Trimming anything that merely follows a connector
 * would put back the fault the guard exists for: "What does Sol Ring of the
 * Gods do?" has the same shape, "Gods" is not a format, and answering it about
 * Sol Ring is a confident answer about a card nobody asked for.
 */
const FORMAT_WORDS = new Set(FORMATS.flatMap(f => [f.key, f.says.toLowerCase()]).concat('edh'));

/** A phrase with its grammar trimmed off both ends, lowercased. */
function coreName(phrase: string): string {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  while (words.length && EDGE_STOPWORDS.has(words[0])) words.shift();
  while (
    words.length &&
    (EDGE_STOPWORDS.has(words[words.length - 1]) || FORMAT_WORDS.has(words[words.length - 1]))
  ) {
    words.pop();
  }
  return words.join(' ');
}

export interface NamedCard {
  name: string;
  setCode: null;
  collectorNumber: null;
}

/**
 * Whether the question is holding two cards up against each other.
 *
 * Only used to decide whether it is worth looking for a second card name, and
 * a false positive costs a few catalogue reads rather than a wrong answer: a
 * question with one card in it still finds one card and is answered the same
 * way it was before.
 */
const COMPARISON_WORDS = [
  ' or ', ' vs ', ' vs. ', ' versus ', ' better ', ' best of ', ' compare ',
  ' comparison ', ' difference between ', ' rather than ', ' over ',
  ' instead of ', ' which one ', ' stronger ', ' worse ',
];

export function looksLikeAComparison(question: string): boolean {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()} `;
  return COMPARISON_WORDS.some(word => text.includes(word.replace(/\s+/g, ' ')));
}

/**
 * The card-shaped phrase in a question that turned out not to be a card.
 *
 * Returns the longest such phrase, or null when nothing in the question looks
 * like a name. Deliberately strict, because the cost of a false positive is
 * telling somebody a real card does not exist:
 *
 *   - two words or more AFTER the grammar is trimmed off both ends, so "Is" and
 *     "Explain" and a trailing format name cannot make a phrase qualify
 *   - the phrase has to be capitalised the way a name is, which
 *     `extractCardNames` already requires
 *   - and it is only ever called when the catalogue has already been asked and
 *     said no
 */
async function unresolvedCardName(db: any, question: string): Promise<string | null> {
  const { extractCardNames } = await import('../resolve-cards.ts');
  const { names } = extractCardNames(question);
  const asked = question.toLowerCase();

  const shaped = names
    .filter(n => asked.includes(n.toLowerCase()))
    .filter(n => coreName(n).split(' ').filter(Boolean).length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const phrase of shaped) {
    const hit = await cardByName(db, phrase);
    /* A read that failed is not a card that does not exist. Saying nothing is
       the honest outcome when the catalogue could not be asked. */
    if (!hit.ok) return null;
    if (!hit.value) return phrase;
  }
  return null;
}

/** One card, which is what every ask other than a comparison wants. */
async function cardNamedInQuestion(db: any, question: string): Promise<NamedCard | null> {
  return (await cardsNamedInQuestion(db, question, 1))[0] ?? null;
}

/**
 * The cards the question names, in the order they were written.
 *
 * WRITTEN ORDER, NOT LENGTH ORDER, and that is the fix for the comparison bug.
 * Candidates are still TRIED longest first, because a long phrase that resolves
 * is better evidence than a short one inside it, but what comes back is sorted
 * by where each name sits in the question. "Path to Exile or Swords to
 * Plowshares" now leads with Path to Exile, which is what was asked first.
 */
async function cardsNamedInQuestion(db: any, question: string, want: number): Promise<NamedCard[]> {
  const { extractCardNames } = await import('../resolve-cards.ts');
  const { names } = extractCardNames(question);
  const asked = question.toLowerCase();

  const present = names.filter(n => n.length >= 4 && asked.includes(n.toLowerCase()));

  /* FOUR WAS NOT ENOUGH, and the ones it cut were the real cards.
     "How does the Thassa's Oracle and Demonic Consultation combo work?" emits
     fifteen phrases. Both card names are in that list, at positions seven and
     ten, and the four that got tried were all long joined phrases that resolve
     to nothing. The most famous combo in the format, held correctly in our own
     table, and neither piece was ever looked up.

     Twelve rather than four, and the extra lookups only happen on a question
     that names nothing, because the loop stops once it has what it was asked
     for, which is one card unless the question compares two. */
  const worthTrying = [...present].sort((a, b) => b.length - a.length).slice(0, 12);
  const found: { name: string; at: number }[] = [];

  for (const candidate of worthTrying) {
    if (found.length >= want) break;
    const hit = await cardByName(db, candidate);
    if (!hit.ok || !hit.value) continue;

    const resolved = hit.value.name.toLowerCase().split(' // ')[0];
    if (!asked.includes(resolved)) continue;
    if (found.some(f => f.name === hit.value!.name)) continue;

    /* THE FRAGMENT TRAP, found by running it.
     *
     * "Explain Blastoderm Supreme, what does it do?" names a card that does not
     * exist. The full phrase resolved to nothing, the loop fell through to
     * "Blastoderm", which is a real card, and the answer came back confidently
     * about a different card than the one asked about. That is the fabrication
     * rule broken by a substring.
     *
     * So a match is rejected when the question also contains a longer phrase
     * that this one sits inside. If they meant Blastoderm they would not have
     * written another capitalised word after it. */
    /* A LONGER PHRASE IS ONLY EVIDENCE IF IT IS A NAME, NOT A SENTENCE.
     *
     * This rejected on the mere existence of a longer phrase containing the
     * match, and `extractCardNames` emits every capitalised run including the
     * word that opened the sentence. So "Is Sol Ring legal in Modern?" produced
     * "Is Sol Ring", which is not a card and never will be, and "Sol Ring" was
     * thrown away as a fragment of it. Measured over fifty real questions: six
     * had the card resolved and discarded this way, and the singleton question
     * lost Sol Ring to the phrase "Sol Ring in".
     *
     * The discriminator is whether the extra words are STOPWORDS. Strip the
     * leading and trailing ones and compare what is left:
     *
     *   "Is Sol Ring"        -> "sol ring"            same card, not evidence
     *   "Sol Ring in"        -> "sol ring"            same card, not evidence
     *   "Blastoderm Supreme" -> "blastoderm supreme"  a DIFFERENT name, and the
     *                                                 original trap: reject
     *
     * So the Blastoderm case stays fixed. A player who meant Blastoderm would
     * not have written another real word after it, and "Supreme" is a real word
     * where "Is" is grammar. */
    const isAFragment = present.some(other => {
      const core = coreName(other);
      if (core === resolved || !core.includes(resolved) || core.length <= resolved.length) return false;

      /* A PHRASE THAT JOINS TWO NAMES IS NOT ONE LONGER NAME.
         "How does the Thassa's Oracle and Demonic Consultation combo work?"
         emits "Thassa's Oracle and Demonic Consultation", which is longer than
         "Thassa's Oracle" and contains it, so the guard threw the card away.
         Both pieces resolve on their own; the most played combo in the format
         was refused because of the word between them.

         Splitting on the joiners answers it. If either side IS the card, the
         phrase is a conjunction and says nothing about which card was meant.

         Cards whose own name carries "and" are safe: Rin and Seri, Inseparable
         resolves as a whole, and the loop tries longest first, so it returns
         before anything reaches this check. */
      const parts = core.split(/\s+(?:and|or|vs\.?|versus)\s+|\s*,\s*/).filter(Boolean);
      if (parts.length > 1 && parts.some(part => part.trim() === resolved)) return false;

      return true;
    });
    if (isAFragment) continue;

    found.push({ name: hit.value.name, at: asked.indexOf(resolved) });
  }

  return found
    .sort((a, b) => a.at - b.at)
    .map(f => ({ name: f.name, setCode: null, collectorNumber: null }));
}

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

function refuse(routing: Routing): Answered {
  const blocks: Block[] = [];
  if (routing.gap === 'rules') blocks.push(say(NO_RULES_CORPUS));
  else if (routing.gap === 'meta') blocks.push(say(NO_META_DATA));
  else if (routing.gap === 'commander-scope') blocks.push(say(NO_COMMANDER_DATA));
  else blocks.push(say(judgementGap(routing.subject === 'deck' ? 'How to play a deck' : 'That')));

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

type Part = 'what' | 'text' | 'does' | 'roles' | 'popularity' | 'legality' | 'price' | 'combos' | 'alternatives' | 'decks';

async function answerAboutCard(
  req: AnswerRequest,
  routing: Routing,
  focus: { name: string; setCode: string | null; collectorNumber: string | null },
  parts: Part[],
  /** Something honest to add at the end, such as the rules gap. */
  closing?: string,
  /**
   * Other cards the question also named.
   *
   * Said out loud before anything else. A question naming two cards and getting
   * an answer about one of them without a word about the other is the fault
   * this exists to stop: it reads as a complete answer and is half of one.
   */
  alsoNamed: string[] = [],
  /**
   * Something that has to be said BEFORE the card, because it is the answer.
   *
   * "Why was Jeweled Lotus banned?" is answered by "we do not hold why". Put
   * that at the bottom and the player reads a card page first and has to get to
   * the end to find out the question was not answered. One case uses this and
   * it is worth the parameter.
   */
  opening?: string
): Promise<Answered> {
  const basis: string[] = ['cards_unique'];
  const blocks: Block[] = [];
  const attach: string[] = [];
  let standing: Answered['standing'] = 'full';

  if (opening) {
    blocks.push(say(opening));
    standing = 'partial';
  }

  if (alsoNamed.length) {
    blocks.push(say(
      `You named ${joinWords([focus.name, ...alsoNamed])}. This answer is about ${focus.name}. Ask me about ${joinWords(alsoNamed)} on ${alsoNamed.length === 1 ? 'its' : 'their'} own and I will do the same for ${alsoNamed.length === 1 ? 'it' : 'them'}.`
    ));
  }

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

  /* -- what it actually does -------------------------------------------- */
  if (parts.includes('does')) {
    const said = await saysWhatItDoes(card);
    blocks.push(...said.blocks);
    if (said.thin) standing = standing === 'full' ? 'partial' : standing;
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
    /* The format they asked about, first and in plain words, then the rest.
       Only when the question is ABOUT legality: "What does Sol Ring do?" with
       an attached Commander deck names a format too, and opening the card's
       page with "Yes, Sol Ring is legal in Commander" answers a question
       nobody asked. */
    if (routing.ask === 'legality' || routing.ask === 'legality-in-format') {
      const verdict = verdictInFormat(card, routing.question);
      if (verdict) blocks.push(say(verdict));
    }
    blocks.push(say(legalityLine(card)));
  }

  /* -- price ------------------------------------------------------------- */
  if (parts.includes('price')) {
    const priced = await pricePart(req, card, focus);
    basis.push(...priced.basis);
    blocks.push(...priced.blocks);
    if (priced.partial) standing = 'partial';

    /* A PRICE ON A CARD YOU CANNOT PLAY IS HALF AN ANSWER. "How much does Mana
       Crypt cost?" came back with $40.03 and nothing else, at a player about to
       spend forty dollars on a card banned in the format this whole product is
       built around. One line, and only when the legality is not already being
       printed underneath, so no answer says it twice. */
    if (!parts.includes('legality')) {
      const state = (card.legalities ?? {})['commander'];
      if (state === 'banned') {
        blocks.push(say(`Worth knowing before you buy: ${card.name} is banned in Commander.`));
      } else if (state === 'restricted') {
        blocks.push(say(`Worth knowing before you buy: ${card.name} is restricted in Commander, so one copy only.`));
      }
    }
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
    const similar = await similarTo(req.db, card, 6);
    if (!similar.ok) {
      blocks.push(say('The shortlist of cards doing the same job could not be read just now.'));
      standing = 'partial';
    } else if (!similar.value.length) {
      blocks.push(say(`Nothing else in the catalogue is filed the same way as ${card.name}, so I have no honest shortlist to give you.`));
      standing = 'partial';
    } else {
      const mine = readAmount(card.prices?.usd);

      /* "Budget alternatives to Rhystic Study" is a question about money, and
         answering it in popularity order put a $56 card at the top of a budget
         list. When the question says budget, the list is ordered by price and
         says so. Cards with no price on file go last, because a card we cannot
         price is not a cheap card. */
      const onABudget = /\bbudget\b|\bcheap(er|est)?\b|\bafford/i.test(routing.question);
      const listed = onABudget
        ? [...similar.value].sort(
            (a, b) => (readAmount(a.prices?.usd) ?? Infinity) - (readAmount(b.prices?.usd) ?? Infinity)
          )
        : similar.value;

      /* Said out loud, because it is the difference between a list you can use
         and a list of cards you cannot cast. Only when the card has a colour:
         a colourless card constrains nothing and the sentence would be noise. */
      const identity = (card.color_identity ?? []).filter(c => 'WUBRG'.includes(c));
      const inColour = identity.length
        ? ` Every one is inside ${joinWords(identity.map(colourName))}, so a deck that plays ${card.name} can play it.`
        : '';

      blocks.push(say(
        (onABudget
          ? `Cards filed the same way as ${card.name}, cheapest first. Whether any of them is right for your deck is your call, so here is the price and how many decks run each one.`
          : `Cards filed the same way as ${card.name}, closest first and then by how much Commander plays them. Whether any of them is better for your deck is your call, so here is what each one costs and how many decks run it.`) + inColour
      ));
      blocks.push(quote(listed.map(row => {
        const rank = row.edhrec_rank != null ? `rank ${thousands(row.edhrec_rank)}` : 'no popularity number';
        const price = priceTag(row.prices);
        const theirs = readAmount(row.prices?.usd);
        /* Not worth saying on a list already sorted by price: every row would
           carry it and it would stop meaning anything. */
        const cheaper = !onABudget && mine != null && theirs != null && theirs < mine ? ', cheaper' : '';
        return `- ${row.name} ${row.mana_cost ?? ''} ${price}, ${rank}${cheaper}`.replace(/\s+/g, ' ');
      }).join('\n')));
      for (const row of listed) attach.push(row.name);
    }
  }

  /* -- their own decks ---------------------------------------------------- */
  if (parts.includes('decks')) {
    const mine = await decksPlaying(req.userDb, card.name);
    if (mine === null) {
      /* Signed out. Never "none of your decks", which is a claim we have not
         checked, the same rule as a missing price. When the whole question was
         about their decks, silence is its own wrong answer, so that one case
         says why there is nothing. */
      if (routing.ask === 'in-my-decks') {
        /* "Do I own a Sol Ring?" and "which of my decks play it" are two
           different questions and this used to answer only the second one at a
           player asking the first. Both are owner scoped, both need a sign in,
           and the collection is where owning is answered. */
        blocks.push(say(
          'I can only read your decks and your collection while you are signed in. Sign in and ask again and I will tell you which of your decks run it. What you own rather than what you play is on your collection page.'
        ));
        standing = 'partial';
      }
    } else if (!mine.ok) {
      blocks.push(say('I could not read your decks just now, so I cannot say whether you already run it.'));
      standing = 'partial';
    } else {
      basis.push('user_decks', 'deck_cards');
      blocks.push(say(deckHitLine(mine.value)));
    }
  }

  /* -- the part that is not ours ------------------------------------------ */
  if (asksWhenItIsGood(routing.question)) {
    blocks.push(say(judgementGap('When it is good')));
    standing = standing === 'full' ? 'partial' : standing;
  }
  if (closing) {
    blocks.push(say(closing));
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
  const restricted: string[] = [];
  for (const format of FORMATS) {
    const state = legalities[format.key];
    if (!state) continue;
    if (state === 'legal') legal.push(format.says);
    else if (state === 'banned') banned.push(format.says);
    /* RESTRICTED GETS ITS OWN SENTENCE, and this is the fix for a line that
       read as permission to break the singleton rule.
       "Legal in Commander and Vintage (one copy only)" was one array with a
       qualifier glued onto one item, so the bracket landed at the end and
       attached to the whole list. Sol Ring is restricted in VINTAGE. A player
       asking whether they may run two copies in Commander was shown a sentence
       that says one copy applies to something, somewhere. */
    else if (state === 'restricted') restricted.push(format.says);
    else not.push(format.says);
  }
  if (!legal.length && !not.length && !banned.length && !restricted.length) {
    return 'We hold no legality for this card, so I will not guess which formats take it.';
  }
  const parts: string[] = [];
  if (legal.length) parts.push(`Legal in ${joinWords(legal)}.`);
  if (restricted.length) {
    parts.push(
      `Restricted in ${joinWords(restricted)}, which means you may play it there but only one copy.`
    );
  }
  if (banned.length) parts.push(`Banned in ${joinWords(banned)}.`);
  if (not.length) parts.push(`Not legal in ${joinWords(not)}.`);
  return parts.join(' ');
}

/**
 * The answer to the format the question actually named, first, in one line.
 *
 * "Is Sol Ring legal in Modern?" was answered with every format the card has a
 * state for, and Modern sat sixth in the "Not legal in" list at the end. The
 * fact was there and the player had to find it. Every legality answer that
 * names a format now opens with yes or no about that format and then gives the
 * rest, which is the order a person answers a question in.
 *
 * Null when the question named no format, or when we hold no state for it, and
 * a null falls through to the full line rather than guessing at one.
 */
function verdictInFormat(card: CardRow, question: string): string | null {
  const key = formatFrom(question);
  if (!key) return null;
  const says = FORMATS.find(f => f.key === key)?.says ?? key;
  const state = (card.legalities ?? {})[key];
  if (!state) return null;
  if (state === 'legal') return `Yes. ${card.name} is legal in ${says}.`;
  if (state === 'banned') return `No. ${card.name} is banned in ${says}.`;
  if (state === 'restricted') {
    return `Yes, but one copy only. ${card.name} is restricted in ${says}.`;
  }
  /* Just the state. Why a card is outside a format's pool is not a column we
     hold, and "it was never printed in a set that format uses" is true of most
     of them and not all, so it is not mine to add. */
  return `No. ${card.name} is not legal in ${says}.`;
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

function deckHitLine(hits: DeckHit[]): string {
  if (!hits.length) return `It is not in any of your decks.`;
  const said = hits.map(h => {
    const where = h.isCommander ? ' as the commander' : h.quantity > 1 ? `, ${h.quantity} copies` : '';
    return `${h.deckName}${where}`;
  });
  return `You already run it in ${joinWords(said)}.`;
}

/* -------------------------------------------------------------------------- *
 * What a card does, read from the same record the optimiser reads
 * -------------------------------------------------------------------------- */

/**
 * The short reading of a card, and the sentence that says when it is thin.
 *
 * Used by three answers, which is the whole reason it is a function: the note
 * about a partial reading has to be the same words wherever it appears, or a
 * player meets two different descriptions of one gap and reasonably concludes
 * they are two different gaps.
 *
 * A COLON LIST, NOT A SENTENCE, for the reason `roleWords` is a colon list. The
 * phrases mix grammar: "adds mana" is a verb and "2 mana at a time" is not, so
 * any sentence trying to hold both comes out wrong. Sol Ring reads
 * "adds mana, 2 mana at a time, costs nothing to use", which is right as a list
 * and ungrammatical as a sentence.
 *
 * An empty reading prints nothing at all. Doubling Season is the case: every
 * paragraph was read, and what came back says nothing that can stand on its
 * own. The card's own text is printed two blocks above either way.
 */
async function saysWhatItDoes(
  card: CardRow
): Promise<{ blocks: Block[]; record: CardRecord; thin: boolean }> {
  const record = await readRecord(card);
  const blocks: Block[] = [];

  const does = whatItDoes(record);
  if (does.length) blocks.push(say(`In short: ${does.join(', ')}.`));

  const note = thinReadingNote(record.standing);
  /* The note is worth saying when there was a reading to be thin about, or when
     the absence of one is why nothing was said. Both are true here, and both
     are honest; what would not be honest is a summary that reads as complete
     when it is not. */
  if (note) blocks.push(say(note));

  return { blocks, record, thin: Boolean(note) };
}

/* -------------------------------------------------------------------------- *
 * The copy rule
 * -------------------------------------------------------------------------- */

/** The verdict a fault leads with, before the validator's own line. */
const FAULT_VERDICT: Record<Fault['fault'], string> = {
  banned: 'No, and not at any count.',
  'not-legal': 'No, and not at any count.',
  restricted: 'No.',
  'copy-limit': 'No.',
  'colour-identity': 'No, and it cannot go in this deck at one copy either.',
  'no-data': 'I cannot tell you, because we hold no legality for this card.',
};

/**
 * How many copies, answered by `deckLegality.ts`.
 *
 * Which format matters more than anything else in this answer, so it is read in
 * a fixed order and SAID: the format named in the question first, then the
 * attached deck's own format, then Commander because that is what this product
 * is for. A silent guess is how the wrong rule gets believed.
 */
async function answerAboutCopies(
  req: AnswerRequest,
  routing: Routing,
  named: { name: string } | null
): Promise<Answered | null> {
  const asked = formatFrom(routing.question);
  const deckFormat = typeof req.deckContext?.format === 'string' ? req.deckContext.format : null;
  const format = asked ?? deckFormat ?? 'commander';
  const copies = copiesFrom(routing.question);
  const identity = req.identity.filter(c => 'WUBRG'.includes(c));
  const commander = req.deckCards.find(c => c.isCommander && !c.isSideboard) ?? null;

  const blocks: Block[] = [];
  const attach: string[] = [];

  /* THE ONE ASK WHERE A PLAYER WRITES THE PLURAL, so it is the one ask that
     tries the singular.

     "Can I run two Islands in my commander deck?" is the case where the answer
     is yes, and it was the one copy question that reached no card at all:
     `Islands` is not a card and `Island` is. Every other ask names one card and
     a plural there would be a different question, so this retry is deliberately
     local rather than being pushed into `cardNamedInQuestion`.

     It runs only when the normal reading found nothing, which is what keeps
     "Swords to Plowshares" safe: that resolves first, and the depluralised form
     "Sword to Plowshare" is never reached.

     No card named. The rule still stands on its own and is worth stating, but
     nothing can be checked against a particular card, and the answer says which
     half it is giving. */
  const subject = named ?? (await cardNamedInQuestion(req.db, depluralised(routing.question)));

  if (!subject) {
    const rules = deckRuleVerdicts(req.deckCards, format);
    const copyRule = rules.rules.find(r => r.id === 'copies');
    if (!rules.rulesKnown || !copyRule) return null;
    return finish(
      [
        say(`In ${rules.formatLabel} the rule is: ${copyRule.label.toLowerCase()}.`),
        say('Name the card and I will check that one against your deck, including whether your commander\'s colours allow it at all.'),
      ],
      [], routing, [], 'partial'
    );
  }

  const found = await cardByName(req.db, subject.name);
  if (!found.ok) {
    return finish(
      [say(`I could not read the catalogue just now, so I am not going to tell you the rule for ${subject.name} from memory. Try again in a moment.`)],
      [], routing, ['cards_unique'], 'refused'
    );
  }
  if (!found.value) {
    return finish(
      [say(`There is no card called ${subject.name} in our catalogue, so there is nothing for me to check the rule against.`)],
      [], routing, ['cards_unique'], 'refused'
    );
  }

  const card = found.value;
  attach.push(card.name);

  const verdict = copyVerdict({
    card: {
      name: card.name,
      legalities: card.legalities,
      colorIdentity: card.color_identity,
    },
    copies,
    format,
    commanderName: commander?.name ?? null,
    commanderIdentity: identity.length ? identity : null,
  });

  const said =
    asked ? `You asked about ${verdict.formatLabel}.`
      : deckFormat ? `Your deck is a ${verdict.formatLabel} deck, so that is the rule I am using.`
        : `Taking this as a ${verdict.formatLabel} question, because that is what this deck picker is built around.`;
  blocks.push(say(said));

  if (!verdict.rulesKnown) {
    blocks.push(say(
      `We do not hold the deck building rules for ${verdict.formatLabel}, so I can tell you whether the card is legal there and not how many of it you may run.`
    ));
    if (verdict.faults.length) {
      blocks.push(quote(verdict.faults.map(f => `- ${f.detail}`).join('\n')));
    }
    const cards = await resolveCards(req.db, attach, attach.length, 4);
    return finish(blocks, cards, routing, ['cards_unique'], 'partial');
  }

  if (verdict.rule) blocks.push(say(`The rule is: ${verdict.rule.toLowerCase()}.`));

  /* THE CARD BEATS THE FORMAT WHEN THE CARD SAYS SO.
     Checked before any copy verdict is read out, and the other faults are kept:
     Shadowborn Apostle may be run in any number and still cannot go in a deck
     whose commander is not black. Only the copy limit is set aside, because
     only the copy limit is what the card overrode. */
  const exception = printedCopyException(printedText(card));
  if (exception) {
    const others = verdict.faults.filter(f => f.fault !== 'copy-limit');
    blocks.push(say(`${card.name} says otherwise on the card itself:`));
    blocks.push(quote(`> ${exception.line}`));
    blocks.push(say(
      exception.allowance.startsWith('any number')
        ? `That is printed on the card and it beats the format's rule, so run as many as you like.`
        : `That is printed on the card and it beats the format's rule, so ${exception.allowance} is your limit rather than one.`
    ));
    if (others.length) {
      blocks.push(say('Something else does stop it though:'));
      blocks.push(quote(others.map(f => `- ${f.detail}`).join('\n')));
    }
    const cards = await resolveCards(req.db, attach, attach.length, 4);
    return finish(blocks, cards, routing, ['cards_unique'], 'full');
  }

  if (verdict.basicLandExempt && !verdict.faults.length) {
    blocks.push(say(
      `${card.name} is a basic land, and basics are the exception to that rule. Run as many as you want.`
    ));
    const cards = await resolveCards(req.db, attach, attach.length, 4);
    return finish(blocks, cards, routing, ['cards_unique'], 'full');
  }

  if (!verdict.faults.length) {
    /* The allowance is stated as a NUMBER, because "you may run it up to the
       limit above" is what the first draft said, and in a singleton format that
       sentence means one while reading like permission for more. That is the
       same shape as the fault this whole ask exists to fix: a true sentence
       that answers "can I run two" as though the answer were yes. */
    const cap =
      verdict.allowed == null
        ? `${verdict.formatLabel} sets no copy limit we hold, so nothing here caps it.`
        : verdict.allowed === 1
          ? 'One copy, and one only.'
          : `Up to ${thousands(verdict.allowed)} copies.`;
    blocks.push(say(
      copies != null
        ? `Yes. ${thousands(copies)} ${copies === 1 ? 'copy' : 'copies'} of ${card.name} is fine in ${verdict.formatLabel}. ${cap}`
        : `${cap} ${card.name} breaks nothing else in ${verdict.formatLabel} either.`
    ));
    const cards = await resolveCards(req.db, attach, attach.length, 4);
    return finish(blocks, cards, routing, ['cards_unique'], 'full');
  }

  blocks.push(say(FAULT_VERDICT[verdict.faults[0].fault]));
  blocks.push(quote(verdict.faults.map(f => `- ${f.detail}`).join('\n')));

  const cards = await resolveCards(req.db, attach, attach.length, 4);
  return finish(blocks, cards, routing, ['cards_unique'], 'full');
}

/* -------------------------------------------------------------------------- *
 * Does it fit this deck
 * -------------------------------------------------------------------------- */

/**
 * A card against the deck the question came with.
 *
 * Four questions in the order a player would ask them, and the first one that
 * settles it stops the rest: may it go in at all, does it do the commander's
 * job, will the deck cast it, and is it already there.
 *
 * The fit half is `planFit` against `planForCommander`, which is the signal the
 * optimiser ranks its whole pool on. Tutor reads it for one card, which is why
 * it costs one card's worth of compiling rather than a pool's.
 */
async function answerDoesItFit(
  req: AnswerRequest,
  routing: Routing,
  named: { name: string } | null
): Promise<Answered | null> {
  if (!named) {
    return finish(
      [say('Pick a card at the top of the page, or name it in the question, and I will hold it up against this deck.')],
      [], routing, [], 'refused'
    );
  }

  const found = await cardByName(req.db, named.name);
  if (!found.ok) {
    return finish(
      [say('I could not read the catalogue just now, so I am not going to judge a card against your deck from memory.')],
      [], routing, ['cards_unique'], 'refused'
    );
  }
  if (!found.value) {
    return finish(
      [say(`There is no card called ${named.name} in our catalogue.`)],
      [], routing, ['cards_unique'], 'refused'
    );
  }

  const card = found.value;
  const blocks: Block[] = [say(`**${card.name}**${card.mana_cost ? ` ${card.mana_cost}` : ''} against ${req.deckContext?.name ?? 'this deck'}.`)];
  const attach = [card.name];
  let standing: Answered['standing'] = 'full';
  const identity = req.identity.filter(c => 'WUBRG'.includes(c));
  const commander = req.deckCards.find(c => c.isCommander && !c.isSideboard) ?? null;

  /* One. May it go in at all. A card outside the commander's colours is not a
     close call about synergy, it is a card that cannot be in the deck, and
     saying anything else first would bury the only answer that matters. */
  const legal = copyVerdict({
    card: { name: card.name, legalities: card.legalities, colorIdentity: card.color_identity },
    copies: null,
    format: typeof req.deckContext?.format === 'string' ? req.deckContext.format : 'commander',
    commanderName: commander?.name ?? null,
    commanderIdentity: identity.length ? identity : null,
  });
  if (legal.faults.length) {
    blocks.push(say('It cannot go in this deck, so nothing else about it matters:'));
    blocks.push(quote(legal.faults.map(f => `- ${f.detail}`).join('\n')));
    const cards = await resolveCards(req.db, attach, attach.length, 4);
    return finish(blocks, cards, routing, ['cards_unique'], 'full');
  }

  /* Two. Already in the list. Cheap, and the fastest way to prove the answer
     read the deck rather than talked about a card in the abstract. */
  const already = req.deckCards.find(
    c => !c.isSideboard && c.name.toLowerCase() === card.name.toLowerCase()
  );
  if (already) {
    blocks.push(say(
      already.isCommander
        ? 'It is this deck\'s commander, so it is already doing its job from the command zone.'
        : 'You already run it in this deck. The rest of this is why it is in there.'
    ));
  }

  /* Three. What it does, and what the commander wants. */
  const said = await saysWhatItDoes(card);
  blocks.push(...said.blocks);
  if (said.thin) standing = 'partial';

  const plan = await planForDeck(req.deckCards, async name => {
    const row = await cardByName(req.db, name);
    return row.ok && row.value ? { tags: row.value.tags } : null;
  });
  blocks.push(...fitBlocks(plan, said.record));
  if (plan && plan.standing !== 'full') standing = 'partial';

  /* Four. Whether the mana is there. */
  blocks.push(...castBlocks(req, card));

  const cards = await resolveCards(req.db, attach, attach.length, 4);
  return finish(blocks, cards, routing, ['cards_unique'], standing);
}

/**
 * The commander half of the fit, or the honest reason there is not one.
 *
 * A card that matches nothing is NOT reported as a bad card. The plan is read
 * off one card's rules text and it is a reading rather than a verdict, so the
 * strongest thing that can honestly be said about no match is that no match was
 * found, which is what this says.
 */
function fitBlocks(plan: DeckPlan | null, record: CardRecord): Block[] {
  if (!plan) {
    return [say('This deck has no commander set, so there is no commander plan to hold the card up against.')];
  }
  if (plan.standing === 'none' || plan.standing === 'unread') {
    return [say(
      `I could not work out what ${plan.commanderName} does from the text on the card, so I have nothing to measure a card against. That is a gap on our side and not a fact about your commander.`
    )];
  }

  /* A PLAN WITH NO WANTS IS NOT A CARD THAT FITS NOTHING, and the difference is
     the whole reason this branch exists. Measured on the two real decks
     recorded in `scratch/tutor-decks.json`: Atraxa's reading produces three
     wants, and Ulamog's produces none, because the parts of Ulamog the compiler
     read do not match any rule that turns a commander's behaviour into
     something to look for. Reporting that as "nothing it does lines up with
     what Ulamog does" would be a verdict on the card when the truth is that we
     have nothing to hold it against. */
  if (!plan.plan.wants.length) {
    return [say(
      `I could not work out anything ${plan.commanderName} is built around, so there is nothing here for me to hold this card up against. What the card does is above, and the call is yours.`
    )];
  }

  const verdict = fitFor(plan, record);
  if (!verdict.matches) {
    const missed = [say(
      `Nothing it does lines up with what ${plan.commanderName} does. That is not the same as it being wrong for the deck: plenty of good cards in a deck are there for the format rather than for the commander.`
    )];
    /* The same note as when something DOES match, and it matters more here. A
       no is worth less when it was measured against half a commander, and a
       player owed that caveat on a yes is owed it on a no. */
    if (plan.standing === 'partial') {
      missed.push(say(
        `That is measured against the part of ${plan.commanderName} I could work out, which is not all of it.`
      ));
    }
    return missed;
  }

  const blocks: Block[] = [
    say(`It does ${verdict.matches === 1 ? 'one of the things' : `${verdict.matches} of the things`} ${plan.commanderName} is built around:`),
    quote(verdict.lines.map(l => `- ${l}`).join('\n')),
  ];
  if (plan.standing === 'partial') {
    blocks.push(say(
      `That is measured against the part of ${plan.commanderName} I could work out, which is not all of it.`
    ));
  }
  return blocks;
}

/* -------------------------------------------------------------------------- *
 * Will this deck cast it
 * -------------------------------------------------------------------------- */

async function answerCanICast(
  req: AnswerRequest,
  routing: Routing,
  named: { name: string } | null
): Promise<Answered | null> {
  if (!named) {
    return finish(
      [say('Pick a card at the top of the page, or name it in the question, and I will work out how often this deck has the mana for it.')],
      [], routing, [], 'refused'
    );
  }
  const found = await cardByName(req.db, named.name);
  if (!found.ok || !found.value) {
    return finish(
      [say(found.ok
        ? `There is no card called ${named.name} in our catalogue.`
        : 'I could not read the catalogue just now, so I have no card to work from.')],
      [], routing, ['cards_unique'], 'refused'
    );
  }

  const card = found.value;
  const blocks: Block[] = [say(`**${card.name}**${card.mana_cost ? ` ${card.mana_cost}` : ''}`)];
  blocks.push(...castBlocks(req, card));
  const cards = await resolveCards(req.db, [card.name], 1, 4);
  return finish(blocks, cards, routing, ['cards_unique'], 'full');
}

/**
 * The castability figure, in the words it is actually true in.
 *
 * `cardPlayability` quotes the chance of having the mana ON THE TURN THE COST
 * FIRST BECOMES PAYABLE, drawing normally and on the play. Every one of those
 * conditions changes the number, so every one of them is said. A bare "78%"
 * would be a number a player cannot check.
 *
 * A land gets no figure at all, and that is the engine refusing rather than
 * failing: 100 would be a lie about a card that is never cast and 0 a worse one.
 */
function castBlocks(req: AnswerRequest, card: CardRow): Block[] {
  const profile = manaProfileFor(req.deckCards, req.identity.filter(c => 'WUBRG'.includes(c)));
  if (!profile) return [];

  const odds = castingOdds(
    {
      name: card.name,
      type_line: card.type_line,
      mana_cost: card.mana_cost,
      cmc: card.cmc,
      oracle_text: card.oracle_text,
    },
    profile
  );

  if (odds.skipped === 'land') {
    return [say('It is a land, so there is no casting it and no number to give you.')];
  }
  if (odds.pct == null || odds.turn == null) {
    return [say('We hold no mana cost for it, so I cannot work out how often you would have the mana.')];
  }
  if (odds.pct === 100 && odds.turn === 1) {
    return [say('It costs no mana, so having the mana for it is never the question.')];
  }

  const rounded = Math.round(odds.pct);
  const lines = [
    `On this deck's mana, you have what it costs on turn ${thousands(odds.turn)} in about ${rounded} games out of 100. That counts ${thousands(odds.landCount)} mana sources across ${thousands(odds.librarySize)} cards, drawing normally and on the play, and turn ${thousands(odds.turn)} is simply the first turn the cost can be paid at all.`,
  ];
  if (odds.approximate) {
    lines.push('That figure is worked out the long way for this cost and comes out close rather than exact.');
  }
  return [say(lines.join('\n\n'))];
}

/* -------------------------------------------------------------------------- *
 * The three facts the request already carried
 *
 * Every one of these was refused while the answer sat in the request body. The
 * page sends the deck it is looking at, and the deck it sends carries the
 * score, the value and the legality verdict its own deck page computed.
 * -------------------------------------------------------------------------- */

/**
 * What `basis` says when the answer came out of the request rather than a read.
 *
 * `basis` is logged and returned on every answer so "where did that come from"
 * is readable rather than reconstructed, and every other entry in it is a table
 * or a view. These three answers read no table at all, and leaving `basis`
 * empty would report them the same way as an answer that read nothing because
 * it had nothing to say.
 */
const ATTACHED_DECK = 'the deck attached to the question';

/** A number the body carried, or null. Never a zero standing in for absence. */
function bodyNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

const BAND_WORDS: Record<string, string> = {
  casual: 'casual',
  mid: 'mid power',
  high: 'high power',
  cedh: 'the top of the format',
};

/**
 * How strong the deck is, from the score the deck page already computed.
 *
 * TWO NUMBERS FOR ONE THING ARRIVE IN EVERY REQUEST, and only one of them is
 * printed. The body carries `power.score` (7.34 on the deck this was measured
 * against) and `power_level` (6). CLAUDE.md's design law is explicit that five
 * competing power fields existed, that there must be exactly one canonical
 * implementation and one accessor, and `power.score` is the one the canonical
 * evaluator writes. `power_level` is the older field and is deliberately
 * ignored here rather than averaged, reconciled or mentioned.
 *
 * The band and the bracket are DERIVED from that score with the engine's own
 * `bandForScore` and `bracketIdForScore` rather than read off `power.band`,
 * for one reason: whatever is printed has to agree with the score printed
 * beside it. Reading a band the page computed at some other time is how two
 * numbers on one screen come to disagree.
 */
async function answerDeckRating(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const score = bodyNumber(req.deckContext?.power?.score);
  if (score == null) {
    return finish(
      [say('This deck arrived without a power score, so I have nothing to rate it from. Open its own page once and the score is worked out there, then ask me again.')],
      [], routing, [ATTACHED_DECK], 'refused'
    );
  }

  const band = bandForScore(score);
  const bracket = bracketIdForScore(score);
  const counts = req.deckContext?.counts ?? {};
  const total = bodyNumber(counts.total);

  const blocks: Block[] = [
    say(`${score.toFixed(1)} out of 10, which is ${BAND_WORDS[band] ?? band} and sits in bracket ${bracket}.`),
    say('That score is worked out from the list itself: how fast it can win, how much it interacts, how well it draws, how the mana holds up and what it can find. It is one measure and it is not the same as whether the deck is fun at your table.'),
  ];
  if (total != null) {
    blocks.push(say(`Counted over ${thousands(total)} cards, which is what the deck page sent with this question.`));
  }
  blocks.push(say('Ask about your lands and I will go through the weak slots one at a time, which is the part of that score I can act on from this page.'));

  return finish(blocks, [], routing, [ATTACHED_DECK], 'full');
}

/** What the deck costs, from the valuation the body carried. */
/**
 * How much of the attached deck the player already owns.
 *
 * `economy.missing` and `economy.ownedPct` are computed by the deck page and
 * travel on the request, so this is a read of what was already sent. WHICH
 * cards are missing is not sent, and it is not going to be guessed at: the
 * count is given and the page that lists them is named.
 */
async function answerDeckMissing(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const missing = bodyNumber(req.deckContext?.economy?.missing);
  const ownedPct = bodyNumber(req.deckContext?.economy?.ownedPct);
  const total = bodyNumber(req.deckContext?.counts?.total);

  if (missing == null) {
    return finish(
      [say('The deck page works out what you already own and it did not send that with this question, so I have nothing to count. Open the deck and ask again and the number comes with it.')],
      [], routing, [], 'refused'
    );
  }

  const blocks: Block[] = [];
  if (missing === 0) {
    blocks.push(say(
      `Nothing. Every card in this list is already in your collection${total != null ? `, all ${thousands(total)} of them` : ''}.`
    ));
  } else {
    blocks.push(say(
      `${thousands(missing)} card${missing === 1 ? '' : 's'} in this list ${missing === 1 ? 'is' : 'are'} not in your collection${
        ownedPct != null ? `, so you own about ${ownedPct}% of it` : ''
      }.`
    ));
    blocks.push(say(
      `Which ones is on the deck page itself, where every row says whether you have it. That is ${ATTACHED_DECK} counted by the page and sent with your question, so it is the same number you see there.`
    ));
  }

  blocks.push(say(
    'Cards we hold no price for are not counted in the value beside it, and there is no way to count them honestly.'
  ));

  return finish(blocks, [], routing, [], 'full');
}

async function answerDeckValue(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const economy = req.deckContext?.economy ?? {};
  const usd = readAmount(economy.priceUSD);

  if (usd == null) {
    return finish(
      [say('This deck arrived without a value on it, and a missing price is not a price of nothing, so I am not putting a number on it.')],
      [], routing, [ATTACHED_DECK], 'refused'
    );
  }

  const blocks: Block[] = [say(`About ${formatAmount(usd, 'USD')} for the whole list.`)];

  const owned = bodyNumber(economy.ownedPct);
  const missing = bodyNumber(economy.missing);
  if (owned != null && missing != null) {
    blocks.push(say(
      `You own about ${Math.round(owned)}% of it from your collection, and ${thousands(missing)} ${missing === 1 ? 'card is' : 'cards are'} missing.`
    ));
  }
  blocks.push(say(
    'That is the value the deck page worked out and sent with your question, so it is the same number you see there. Cards we hold no price for are not counted in it, and there is no way to count them honestly.'
  ));

  return finish(blocks, [], routing, [ATTACHED_DECK], 'full');
}

/**
 * Is the deck a legal deck.
 *
 * TWO HALVES FROM TWO PLACES, and the answer says which is which because they
 * are not equally fresh. The construction rules are recomputed here from the
 * list in the request by `deckRules`, which reads names and quantities and
 * nothing else, so it is exact and needs no database read. Whether every single
 * card is legal in the format needs each card's own legality column, which the
 * page does not send, so that half is the verdict the deck page computed and
 * put in the body.
 */
async function answerDeckIsLegal(req: AnswerRequest, routing: Routing): Promise<Answered | null> {
  const format =
    formatFrom(routing.question) ??
    (typeof req.deckContext?.format === 'string' ? req.deckContext.format : null) ??
    'commander';
  const verdict = deckRuleVerdicts(req.deckCards, format);

  const blocks: Block[] = [];
  if (!verdict.rulesKnown || !verdict.rules.length) {
    blocks.push(say(
      `We do not hold the deck building rules for ${verdict.formatLabel}, so I cannot check the size or the copy limit. What I can tell you is what the deck page found card by card, below.`
    ));
  } else {
    const failed = verdict.rules.filter(r => !r.ok);
    blocks.push(say(
      failed.length === 0
        ? `Against the ${verdict.formatLabel} rules, this list passes every one I can check from it:`
        : `Against the ${verdict.formatLabel} rules, ${failed.length === 1 ? 'one thing is' : `${failed.length} things are`} wrong:`
    ));
    blocks.push(quote(
      verdict.rules.map(r => `- ${r.ok ? 'Yes' : 'No'}. ${r.label}, and ${r.reading}.`).join('\n')
    ));
  }

  const bodyVerdict = req.deckContext?.legality;
  const issues: string[] = Array.isArray(bodyVerdict?.issues)
    ? bodyVerdict.issues.map((i: unknown) => String(i)).filter(Boolean)
    : [];

  if (bodyVerdict && typeof bodyVerdict.ok === 'boolean') {
    if (bodyVerdict.ok && !issues.length) {
      blocks.push(say(
        'Card by card, the deck page checked every one of these against the format and found nothing wrong. That check reads each card\'s own legality, which is why it happens there and not here.'
      ));
    } else {
      blocks.push(say(`Card by card, the deck page found ${issues.length === 1 ? 'this' : 'these'}:`));
      blocks.push(quote(issues.slice(0, 12).map(i => `- ${i}`).join('\n')));
      if (issues.length > 12) {
        blocks.push(say(`Plus ${thousands(issues.length - 12)} more on the deck's own page.`));
      }
    }
    return finish(blocks, [], routing, [ATTACHED_DECK], 'full');
  }

  blocks.push(say(
    'The card by card check did not come through with this deck, so treat the above as the deck building rules only. The deck\'s own page runs the rest.'
  ));
  return finish(blocks, [], routing, [ATTACHED_DECK], 'partial');
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
  /* THE BUDGET IN THE QUESTION, WHICH USED TO BE READ AS THE LIST LENGTH.
     "The best black removal spell under one dollar" printed one card, chosen
     with no price filter, at $4.59. The "one" was the dollar, not the count. */
  const maxUsd = budgetFrom(routing.question);

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
    maxUsd,
    limit: wanted,
  });

  if (!found.ok) {
    return finish(
      [say('The catalogue could not be read just now, so I have no list for you. Try again in a moment.')],
      [], routing, ['cards_unique'], 'refused'
    );
  }

  const budgetSaid = maxUsd != null ? ` under ${formatAmount(maxUsd, 'USD')}` : '';
  const shape = [
    manaValue != null ? `${manaValue} mana` : '',
    useColours.length ? joinWords(useColours.map(colourName)) : '',
    role.says,
  ].filter(Boolean).join(' ') + budgetSaid;

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
  if (maxUsd != null) {
    /* HOW FAR THE BUDGET LOOKED, SAID OUT LOUD. The order is popularity and the
       price filter runs after it, so the list is "the cheapest of the most
       played" and not "the most played of the cheap". Those are different lists
       and only one of them is what this read can produce.

       A card with no dollar price is not in it either, which is the same rule
       as everywhere else: absence is not zero, and letting an unpriced card
       through would put it at the top of a list of cards under a dollar. */
    blocks.push(say(
      `That is inside your ${formatAmount(maxUsd, 'USD')}, checked against each card's own dollar price, looking down the ${thousands(BUDGET_PAGE)} most played that match. A card we hold no dollar price for is left out rather than counted as cheap.`
    ));
  }

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
  let standing: Answered['standing'] = 'full';

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
    let read = 0;
    for (const colour of colours) {
      const found = await topByRole(req.db, { mustInclude: colour, limit: perColour });
      if (!found.ok) {
        blocks.push(say(`The ${colourName(colour)} list could not be read just now.`));
        /* A list that failed is not a list. Reporting this as a whole answer is
           how the first run of this function said "full" while every one of the
           five colours had timed out. */
        standing = 'partial';
        continue;
      }
      read++;
      blocks.push(say(`**${colourName(colour).replace(/^./, c => c.toUpperCase())}**`));
      blocks.push(quote(found.value.map((r, i) => staplesLine(r, i)).join('\n')));
      for (const r of found.value.slice(0, 2)) attach.push(r.name);
    }
    if (!read) {
      return finish(
        [say('The catalogue could not be read just now, so I have no list for you. Try again in a moment.')],
        [], routing, ['cards_unique'], 'refused'
      );
    }
  }

  blocks.push(say(
    'That is popularity, not quality. It is what we actually hold, and it is a fair place to start, but a card being everywhere does not make it right for your deck.'
  ));

  const cards = await resolveCards(req.db, attach, attach.length, 10);
  return finish(blocks, cards, routing, ['cards_unique'], standing);
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

  /* The caveat is not optional. `gradeLands` judges a land on the colours it
     makes and nothing else, so Rogue's Passage and Academy Ruins come out at
     the top of the weak list for making no colour, which is true and is not the
     same as being bad cards. Leaving that unsaid turns a fair measurement into
     an unfair recommendation. */
  if (targets.some(t => (t.produces ?? []).length > 0 || t.verdict === 'no colour')) {
    blocks.push(say(
      'One thing to hold in mind. This is judged on colours only, so a land that makes no colour sits at the top of the list whatever else it does. If one of those is in there for what it does rather than what it taps for, keep it.'
    ));
  }

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
      return `- Cut ${out}, play ${land.name}. Taps for ${makes}, ${tappedNote(land.oracle_text)}. ${priceTag(land.prices)}.`;
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
