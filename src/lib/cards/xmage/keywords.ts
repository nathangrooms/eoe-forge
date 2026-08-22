/**
 * Keyword abilities: XMage's keyword classes as `dsl.ts` `KeywordAbility`.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The XMage clone is read in place and nothing from it is vendored. Forge is
 * GPL-3.0 and was not fetched, read or referenced.
 *
 * ## Why keywords head the work order
 *
 * `scripts/coverage/.data/xmage-record-shape.json` ranks what blocks the most
 * cards from being run at all. Four of the top fifteen entries are keywords:
 * `keyword:Flying` 3,103 cards, `keyword:Enchant` 1,235, `keyword:Trample` 980,
 * `keyword:Vigilance` 705. `scripts/xmage/census.mjs keywords` counted **122
 * distinct keyword classes**, and the twelve most common cover 76.7% of the
 * cards that have one. So this is one table and one lowering, and it is the
 * single cheapest thing on the list.
 *
 * ## The line this file draws, and it is structural rather than a taste call
 *
 * `dsl.ts`'s `KeywordAbility` is `{ keyword, parameter? }` and nothing else. A
 * keyword is portable into that shape when the keyword's WHOLE meaning is the
 * word, plus at most one printed parameter. Flying is: a permanent either has
 * it or does not, and everything that follows is the runtime's business.
 *
 * Kicker is not. "Kicker {2}" says a spell may be cast for more, and what the
 * extra mana BUYS lives in other abilities and conditions on the card that the
 * record holds separately and cannot connect. Emitting `keyword: 'kicker'` and
 * calling the card lowered would produce a card that resolves and quietly never
 * kicks. That is the Cyclonic Rift failure exactly: something that runs and is
 * wrong, which is worse than something that refuses.
 *
 * So: a keyword that is a static property of an object is ported, and a keyword
 * that changes how a spell is cast or that carries behaviour the record holds
 * elsewhere is refused by name, with the count it costs. `REFUSED_KEYWORDS` is
 * the second half of the table and is as much of the answer as the first.
 */

import type { CardFilter, KeywordAbility } from '../abilities/dsl.ts';
import { type AbilityRecord, type Slot } from './record.ts';

export interface KeywordEntry {
  /** The word, as `dsl.ts` spells keywords: lower case, spaces not camel case. */
  keyword: string;
  /**
   * `'none'`   the class takes no parameter, or takes only a display hint.
   * `'number'` the parameter is a count and prints as one: "annihilator 2".
   * `'mana'`   the parameter is a cost and prints in mana symbols: "ward {2}".
   * `'object'` the parameter names what the ability applies to, and the word
   *            comes from the TYPE, never from copied rules text: "enchant
   *            creature".
   */
  parameter: 'none' | 'number' | 'mana' | 'object';
}

/**
 * Keywords whose whole meaning is the word.
 *
 * Counts are cards, from `scripts/xmage/census.mjs keywords`, denominator
 * 32,168 XMage card files.
 */
export const XMAGE_KEYWORDS: Record<string, KeywordEntry> = {
  /* evasion and combat: a property of the permanent, checked by the combat rules */
  Flying: { keyword: 'flying', parameter: 'none' }, // 3,110
  Trample: { keyword: 'trample', parameter: 'none' }, // 986
  Vigilance: { keyword: 'vigilance', parameter: 'none' }, // 713
  Haste: { keyword: 'haste', parameter: 'none' }, // 640
  Reach: { keyword: 'reach', parameter: 'none' }, // 420
  // XMage's `MenaceAbility(boolean)` argument is `showAbilityHint`, a client
  // display flag, and both constructors build the same ability. Reading it as
  // part of the card would invent a distinction the card does not have. Checked
  // against MenaceAbility.java, not assumed.
  Menace: { keyword: 'menace', parameter: 'none' }, // 378
  FirstStrike: { keyword: 'first strike', parameter: 'none' }, // 375
  DoubleStrike: { keyword: 'double strike', parameter: 'none' }, // 116
  Lifelink: { keyword: 'lifelink', parameter: 'none' }, // 351
  Deathtouch: { keyword: 'deathtouch', parameter: 'none' }, // 320
  Defender: { keyword: 'defender', parameter: 'none' }, // 309
  Indestructible: { keyword: 'indestructible', parameter: 'none' }, // 106
  Hexproof: { keyword: 'hexproof', parameter: 'none' }, // 81
  Shroud: { keyword: 'shroud', parameter: 'none' }, // 34
  Infect: { keyword: 'infect', parameter: 'none' }, // 45
  Wither: { keyword: 'wither', parameter: 'none' }, // 26
  Fear: { keyword: 'fear', parameter: 'none' }, // 40
  Shadow: { keyword: 'shadow', parameter: 'none' }, // 37
  Intimidate: { keyword: 'intimidate', parameter: 'none' }, // 23
  Horsemanship: { keyword: 'horsemanship', parameter: 'none' }, // 28
  Daunt: { keyword: 'daunt', parameter: 'none' }, // 28
  Skulk: { keyword: 'skulk', parameter: 'none' },
  Spaceflight: { keyword: 'spaceflight', parameter: 'none' }, // 27
  Swampwalk: { keyword: 'swampwalk', parameter: 'none' }, // 41
  Islandwalk: { keyword: 'islandwalk', parameter: 'none' }, // 33
  Forestwalk: { keyword: 'forestwalk', parameter: 'none' }, // 28
  Mountainwalk: { keyword: 'mountainwalk', parameter: 'none' }, // 17
  Plainswalk: { keyword: 'plainswalk', parameter: 'none' },
  /* characteristic-defining: layer 4 and layer 5, still just the word */
  Changeling: { keyword: 'changeling', parameter: 'none' }, // 65
  Devoid: { keyword: 'devoid', parameter: 'none' }, // 132
  /* timing */
  Flash: { keyword: 'flash', parameter: 'none' }, // 603
  /* deck construction, which the deck-building consumer reads and the reducer ignores */
  Partner: { keyword: 'partner', parameter: 'none' }, // 58
  DoctorsCompanion: { keyword: "doctor's companion", parameter: 'none' }, // 26
  /* parameterised, where the parameter prints as a number or a cost */
  Toxic: { keyword: 'toxic', parameter: 'number' }, // 37
  Annihilator: { keyword: 'annihilator', parameter: 'number' },
  Ward: { keyword: 'ward', parameter: 'mana' }, // 188
  /* the aura restriction, whose parameter is the type it may be attached to */
  Enchant: { keyword: 'enchant', parameter: 'object' }, // 1,241
};

/**
 * Keywords deliberately NOT ported, and why. Counts are cards.
 *
 * Every entry here is a card the record refuses to run. That is the point: the
 * alternative is a card that runs without its kicker, its madness cost or its
 * protection, and nothing downstream would notice.
 */
export const REFUSED_KEYWORDS: Record<string, string> = {
  Kicker:
    '224 cards. An additional cost, and what the kicker BUYS lives in a separate condition on the card that the record holds but cannot connect to this ability. Emitting the word alone gives a spell that resolves and never kicks.',
  Multikicker: '18 cards. Same as kicker, with a repeat count.',
  Protection:
    '191 cards. The parameter is a filter, and `KeywordAbility.parameter` is printed text. Turning a filter into "from red" means writing rules text this project takes from Scryfall, not from XMage. Protection is also four separate rules, not one flag.',
  Convoke: '104 cards. Changes what may pay the spell\'s cost. Cost payment is outside the record.',
  Affinity: '36 cards. A cost reduction computed from the board.',
  AffinityForArtifacts: '37 cards. Same.',
  Improvise: '23 cards. Same.',
  Delve: '28 cards. Same, and it exiles cards as it goes.',
  Assist: 'A cost another player may pay. Outside the record.',
  Madness: '62 cards. An alternative cost triggered by discarding, with a replacement effect attached.',
  Buyback: '40 cards. An additional cost that changes where the spell goes on resolution.',
  Evoke: '35 cards. An alternative cost plus a sacrifice trigger.',
  Dash: '22 cards. An alternative cost plus haste plus a return trigger.',
  Entwine: '31 cards. An additional cost that changes how many modes are chosen.',
  Splice: '30 cards. Adds this card\'s text to another spell.',
  Replicate: '19 cards. An additional cost that copies the spell.',
  Spree: '21 cards. Additional costs per mode.',
  Bargain: '20 cards. An additional cost that other abilities on the card check.',
  Offspring: '20 cards. An additional cost that creates a token copy.',
  Gift: '25 cards. An additional cost promising an opponent something.',
  Flashback: '209 cards. An alternative way to cast from the graveyard.',
  Cycling: '303 cards. An activated ability from hand with its own cost and effect.',
  Morph: '184 cards. A face-down alternative cast plus a turn-up cost.',
  Crew: '178 cards. An activated ability with a tap-creatures cost measured by power.',
  Daybound: '35 cards. A transform state machine tied to the turn.',
  Nightbound: '35 cards. Same.',
  Rebound: '34 cards. Recasting from exile on the next upkeep.',
  Aftermath: '27 cards. A split card half castable only from the graveyard.',
  Vanishing: '20 cards. Counters plus an upkeep trigger plus a sacrifice.',
  Fading: '18 cards. Same shape.',
  Devour: '23 cards. An as-enters sacrifice that scales the creature.',
  Bloodthirst: '21 cards. An as-enters counter conditional on damage this turn.',
  Ascend: '22 cards. A game-wide state ("the city\'s blessing") the record has no place for.',
  Exert: '23 cards. Attaches a triggered ability whose effect the record holds separately.',
  Leyline: '18 cards. An opening-hand replacement, which is play outside the game.',
  Banding: '24 cards. Combat damage assignment by another player. Not one flag.',
  StartYourEngines: '41 cards. Introduces a per-player speed counter.',
  StationLevel: '32 cards. A level ladder with per-level abilities.',
  ClassReminder: '34 cards. A level ladder with per-level abilities.',
  CantBeBlockedSource:
    '59 cards. Not a printed keyword: XMage files "this creature can\'t be blocked" under its keyword package. It is a restriction and belongs in the static-ability path, not here.',
  Prowess: 'A triggered ability, not a static property.',
};

/**
 * The noun for an "enchant X" parameter, from the TYPE the aura may be
 * attached to.
 *
 * Deliberately narrow: it reads a type or subtype out of the filter and returns
 * that word lower cased. It does not describe a compound filter, because
 * describing one means writing a phrase, and a written phrase is rules text
 * this project takes from Scryfall. "Enchant creature you control" comes back
 * as `null` and the ability is refused rather than printed as "enchant
 * creature", which would be a different card.
 */
export function objectNoun(filter: CardFilter | undefined): string | null {
  if (!filter) return null;
  if (filter.is === 'type' || filter.is === 'subtype') return filter.value.toLowerCase();
  if (filter.is === 'any') return 'permanent';
  return null;
}

export interface KeywordLowering {
  ok: boolean;
  ability?: KeywordAbility;
  /** The primitive that has to be written, in work-order form, when `ok` is false. */
  missing?: string;
  why?: string;
}

function parameterText(entry: KeywordEntry, slot: Slot | undefined): { text?: string; ok: boolean } {
  if (entry.parameter === 'none') return { ok: true };
  if (!slot) return { ok: false };
  const value = slot.value;
  if (entry.parameter === 'number' && value?.k === 'int') return { ok: true, text: String(value.n) };
  if (entry.parameter === 'mana' && value?.k === 'mana') return { ok: true, text: value.cost };
  if (entry.parameter === 'mana' && value?.k === 'int') return { ok: true, text: `{${value.n}}` };
  if (entry.parameter === 'object') {
    // The enchant target arrives as a nested `Target` construction whose filter
    // has already been resolved into `dsl.ts`'s filter language.
    if (value?.k === 'invoke') {
      const filterSlot = value.invocation.args.find((a) => a.name === 'filter');
      const objects = filterSlot?.value;
      const noun = objectNoun(objects?.k === 'objects' ? objects.filter : undefined);
      if (noun) return { ok: true, text: noun };
      // A target class with no filter argument names its object in the class:
      // `TargetCreaturePermanent` is "enchant creature".
      const implied = IMPLIED_ENCHANT_NOUN[value.invocation.prim];
      if (implied) return { ok: true, text: implied };
    }
    if (value?.k === 'objects') {
      const noun = objectNoun(value.filter);
      if (noun) return { ok: true, text: noun };
    }
    return { ok: false };
  }
  return { ok: false };
}

/**
 * Target classes that name their object in the class name rather than in a
 * filter argument. An explicit table, never decomposed from the spelling: a
 * text search on an identifier is the thing this whole port replaces.
 */
const IMPLIED_ENCHANT_NOUN: Record<string, string> = {
  'xmage:TargetCreaturePermanent': 'creature',
  'xmage:TargetPermanent': 'permanent',
  'xmage:TargetLandPermanent': 'land',
  'xmage:TargetArtifactPermanent': 'artifact',
  'xmage:TargetEnchantmentPermanent': 'enchantment',
  'xmage:TargetPlayer': 'player',
  'xmage:TargetCreatureOrPlayer': 'creature or player',
  'xmage:TargetControlledCreaturePermanent': 'creature you control',
  'xmage:TargetOpponentsCreaturePermanent': 'creature an opponent controls',
};

/**
 * The keyword an ability GRANTED by an effect stands for.
 *
 * `GainAbilityTargetEffect(new FlyingAbility(), Duration.EndOfTurn)` is 1,069
 * cards, and every one of them needs the granted ability named. Only keywords
 * in the table above come back; a granted activated or triggered ability
 * returns `null`, because `dsl.ts` grants abilities as a list of keyword
 * strings and there is no way to spell "gains {T}: draw a card" in that field.
 *
 * A granted keyword with a parameter is refused for the same reason: "gains
 * protection from red" and "gains protection" are different, and the second is
 * not a card.
 */
export function grantedKeywordFrom(slot: Slot | undefined): string | null {
  const value = slot?.value;
  if (value?.k !== 'invoke') return null;
  const cls = value.invocation.prim.replace(/^xmage:/, '').replace(/Ability$/, '');
  const entry = XMAGE_KEYWORDS[cls];
  if (!entry) return null;
  if (entry.parameter !== 'none') return null;
  return entry.keyword;
}

/**
 * One keyword ability, lowered.
 *
 * `id` is the record's own ability id so the action log can name it. `text` is
 * empty for the same reason it is empty everywhere else in this port: a card's
 * printed words are Wizards of the Coast's, not XMage's to license, and the
 * renderer fills them from Scryfall at display time.
 */
export function lowerKeywordAbility(ability: AbilityRecord): KeywordLowering {
  const cls = ability.keyword?.name ?? ability.via.prim.replace(/^xmage:/, '').replace(/Ability$/, '');
  const refused = REFUSED_KEYWORDS[cls];
  if (refused) return { ok: false, missing: `keyword:${cls}`, why: refused };

  const entry = XMAGE_KEYWORDS[cls];
  if (!entry) return { ok: false, missing: `keyword:${cls}`, why: 'no entry in the keyword table' };

  const parameter = parameterText(entry, ability.keyword?.parameter);
  if (!parameter.ok) {
    return {
      ok: false,
      missing: `keyword:${cls}`,
      why: `the ${entry.parameter} parameter did not resolve, and a keyword printed without its parameter is a different card`,
    };
  }

  const lowered: KeywordAbility = {
    id: ability.id,
    text: '',
    confidence: 'exact',
    kind: 'keyword',
    keyword: entry.keyword,
  };
  if (parameter.text !== undefined) lowered.parameter = parameter.text;
  return { ok: true, ability: lowered };
}
