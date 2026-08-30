/**
 * Self-tests for the synergy engine.
 *
 * The project has no test runner installed, and adding one was out of scope for
 * a prototype, so these are written as plain assertions behind one exported
 * function. Run them with:
 *
 *   node scripts/synergy-selftest.mjs
 *
 * which transpiles this file with the esbuild that Vite already ships. When a
 * runner is eventually added, each `check` below becomes an `it` unchanged.
 *
 * Two kinds of test live here:
 *   • Unit tests against a hand-built five-deck toy corpus, where every count
 *     is known and asserted exactly.
 *   • Integration checks against the real 184-deck corpus, which assert the
 *     properties that motivated the design — staples must not rank as synergy,
 *     colour-pair duals must not rank as synergy, and known real synergies must.
 */

import type { PreconCorpusDeck } from '@/data/precon-corpus';
import { associate, associationScore, MIN_SUPPORT } from './association';
import {
  buildCorpusIndex,
  cardId,
  cooccurrence,
  eligibleDecks,
  eligibleForBoth,
  inferIdentity,
} from './corpus';
import {
  canonicalIdentityKey,
  colorIdentityKey,
  detectMechanics,
  fitsIdentity,
  mechanicOverlap,
  sharedCreatureTypes,
  subtypesOf,
  textualReferences,
} from './mechanics';
import {
  identityCompatibility,
  isManaBase,
  profile,
  recommendFromCorpus,
  scorePair,
  scoreProfiles,
  type SynergyEngine,
} from './score';
import type { SynergyCard } from './types';

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function check(
  results: CheckResult[],
  name: string,
  fn: () => { ok: boolean; detail: string }
): void {
  try {
    const { ok, detail } = fn();
    results.push({ name, pass: ok, detail });
  } catch (error) {
    results.push({
      name,
      pass: false,
      detail: `threw: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Toy corpus — five decks, nine cards, every count checkable by hand
 * ------------------------------------------------------------------ */

const TOY_CARDS = [
  'Sol Ring',        // 0 — in all five, the staple
  'Hardened Scales', // 1 — green, counters
  'Inspiring Call',  // 2 — green, counters
  'Blood Artist',    // 3 — black, aristocrats
  'Elvish Mystic',   // 4 — green elf
  'Elvish Archdruid',// 5 — green elf lord
  'Command Tower',   // 6 — land, all five
  'Swamp Thing',     // 7 — black only
  'Lightning Bolt',  // 8 — red only
];

const TOY_DECKS: PreconCorpusDeck[] = [
  { id: 'g1', name: 'Green One',  set: 'T', ci: 'G',  commanders: [5], cards: [0, 1, 2, 4, 5, 6] },
  { id: 'g2', name: 'Green Two',  set: 'T', ci: 'G',  commanders: [5], cards: [0, 1, 2, 4, 6] },
  { id: 'g3', name: 'Green Three',set: 'T', ci: 'G',  commanders: [4], cards: [0, 1, 2, 6] },
  { id: 'b1', name: 'Black One',  set: 'T', ci: 'B',  commanders: [3], cards: [0, 3, 6, 7] },
  { id: 'r1', name: 'Red One',    set: 'T', ci: 'R',  commanders: [8], cards: [0, 6, 8] },
];

const CARD_DATA: Record<string, SynergyCard> = {
  'Sol Ring': {
    name: 'Sol Ring',
    type_line: 'Artifact',
    oracle_text: '{T}: Add {C}{C}.',
    color_identity: [],
    cmc: 1,
  },
  'Hardened Scales': {
    name: 'Hardened Scales',
    type_line: 'Enchantment',
    oracle_text:
      'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.',
    color_identity: ['G'],
    cmc: 1,
  },
  'Inspiring Call': {
    name: 'Inspiring Call',
    type_line: 'Instant',
    oracle_text:
      'Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain indestructible until end of turn.',
    color_identity: ['G'],
    cmc: 3,
  },
  'Blood Artist': {
    name: 'Blood Artist',
    type_line: 'Creature — Vampire',
    oracle_text:
      'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.',
    color_identity: ['B'],
    cmc: 2,
  },
  'Elvish Mystic': {
    name: 'Elvish Mystic',
    type_line: 'Creature — Elf Druid',
    oracle_text: '{T}: Add {G}.',
    color_identity: ['G'],
    cmc: 1,
  },
  'Elvish Archdruid': {
    name: 'Elvish Archdruid',
    type_line: 'Creature — Elf Druid',
    oracle_text:
      'Other Elf creatures you control get +1/+1. {T}: Add {G} for each Elf you control.',
    color_identity: ['G'],
    cmc: 3,
  },
  'Command Tower': {
    name: 'Command Tower',
    type_line: 'Land',
    oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
    color_identity: [],
    cmc: 0,
  },
  'Swamp Thing': {
    name: 'Swamp Thing',
    type_line: 'Creature — Plant',
    oracle_text: 'Whenever a creature dies, put a +1/+1 counter on Swamp Thing.',
    color_identity: ['B'],
    cmc: 4,
  },
  'Lightning Bolt': {
    name: 'Lightning Bolt',
    type_line: 'Instant',
    oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    color_identity: ['R'],
    cmc: 1,
  },
};

function toyEngine(): SynergyEngine {
  return { index: buildCorpusIndex(TOY_CARDS, TOY_DECKS), decks: TOY_DECKS };
}

/* ------------------------------------------------------------------ *
 * The tests
 * ------------------------------------------------------------------ */

export async function runSynergySelfTest(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const engine = toyEngine();
  const { index } = engine;

  /* --- corpus indexing ------------------------------------------- */

  check(results, 'cardId resolves case-insensitively', () => {
    const a = cardId(index, 'Sol Ring');
    const b = cardId(index, '  sol ring ');
    return { ok: a === 0 && b === 0, detail: `got ${a}, ${b}` };
  });

  check(results, 'cardId returns null for unknown cards', () => {
    const id = cardId(index, 'Black Lotus');
    return { ok: id === null, detail: `got ${id}` };
  });

  check(results, 'cooccurrence counts decks exactly', () => {
    // Hardened Scales (1) and Inspiring Call (2) share g1, g2, g3 = 3.
    const n = cooccurrence(index, 1, 2);
    return { ok: n === 3, detail: `expected 3, got ${n}` };
  });

  check(results, 'cooccurrence with a staple counts all shared decks', () => {
    // Sol Ring (0) is in all 5; Hardened Scales (1) in 3 → 3 shared.
    const n = cooccurrence(index, 0, 1);
    return { ok: n === 3, detail: `expected 3, got ${n}` };
  });

  check(results, 'disjoint cards co-occur zero times', () => {
    // Blood Artist (3, black deck only) and Hardened Scales (1, green only).
    const n = cooccurrence(index, 3, 1);
    return { ok: n === 0, detail: `expected 0, got ${n}` };
  });

  check(results, 'colourless cards are eligible in every deck', () => {
    const n = eligibleDecks(index, '');
    return { ok: n === 5, detail: `expected 5, got ${n}` };
  });

  check(results, 'mono-green cards are eligible only in green decks', () => {
    const n = eligibleDecks(index, 'G');
    return { ok: n === 3, detail: `expected 3, got ${n}` };
  });

  check(results, 'eligibility keys normalise regardless of colour order', () => {
    // Regression: 'GU' used to miss the WUBRG-ordered map and silently return
    // 0, which downstream read as "no colour-compatible decks" — recommendations
    // came back empty with no error anywhere.
    const canonical = eligibleDecks(index, 'UG');
    const reversed = eligibleDecks(index, 'GU');
    const lower = eligibleDecks(index, 'gu');
    return {
      ok: canonical === reversed && reversed === lower,
      detail: `UG=${canonical} GU=${reversed} gu=${lower}`,
    };
  });

  check(results, 'canonicalIdentityKey orders and upper-cases', () => {
    const k = canonicalIdentityKey('gu');
    return { ok: k === 'UG', detail: k };
  });

  check(results, 'inferred identity of a colourless staple is colourless', () => {
    // Sol Ring (0) is in green, black and red toy decks, so the intersection
    // of their identities is empty — correctly colourless.
    const inferred = inferIdentity(index, 0);
    return { ok: inferred === '', detail: `"${inferred}"` };
  });

  check(results, 'inferred identity of a mono-green card is green', () => {
    // Hardened Scales (1) appears only in the three green toy decks.
    const inferred = inferIdentity(index, 1);
    return { ok: inferred === 'G', detail: `"${inferred}"` };
  });

  check(results, 'eligibility for two conflicting colours is zero', () => {
    // No deck in the toy corpus is both green and black.
    const n = eligibleForBoth(index, 'G', 'B');
    return { ok: n === 0, detail: `expected 0, got ${n}` };
  });

  /* --- association ------------------------------------------------ */

  check(results, 'a ubiquitous staple shows no association', () => {
    // Sol Ring in 5/5 eligible, Hardened Scales in 3/3 eligible, together 3/3.
    // p(joint)=1, p(a)=1, p(b)=1 → lift 1.0. Ubiquity is not synergy.
    const a = associate(3, 5, 3, 5, 3, 3);
    return {
      ok: Math.abs(a.lift - 1) < 1e-9,
      detail: `lift ${a.lift.toFixed(4)} (expected 1.0)`,
    };
  });

  check(results, 'a genuinely correlated pair shows lift above 1', () => {
    // 8 decks eligible for both, each card in 4, together in 4 → lift 2.0.
    const a = associate(4, 4, 4, 8, 8, 8);
    return { ok: a.lift > 1.9 && a.lift < 2.1, detail: `lift ${a.lift.toFixed(3)}` };
  });

  check(results, 'support below MIN_SUPPORT is never significant', () => {
    const a = associate(MIN_SUPPORT - 1, 4, 4, 40, 40, 40);
    return { ok: !a.significant && associationScore(a) === 0, detail: `significant=${a.significant}` };
  });

  check(results, 'shrinkage ranks larger samples above small ones at equal NPMI', () => {
    // Both are "always together" (npmi 1) but one has far more evidence.
    const small = associate(3, 3, 3, 30, 30, 30);
    const large = associate(30, 30, 30, 120, 120, 120);
    const s = associationScore(small);
    const l = associationScore(large);
    return { ok: l > s, detail: `small ${s.toFixed(3)} vs large ${l.toFixed(3)}` };
  });

  check(results, 'negative association floors at zero', () => {
    // Two common cards that almost never meet.
    const a = associate(3, 30, 30, 40, 40, 40);
    const s = associationScore(a);
    return { ok: s === 0, detail: `npmi ${a.npmi.toFixed(3)} score ${s}` };
  });

  /* --- mechanics -------------------------------------------------- */

  check(results, 'detects +1/+1 counter cards', () => {
    const m = detectMechanics(CARD_DATA['Hardened Scales']);
    return { ok: m.has('counters'), detail: [...m].join(',') };
  });

  check(results, 'detects death triggers', () => {
    const m = detectMechanics(CARD_DATA['Blood Artist']);
    return { ok: m.has('death-trigger'), detail: [...m].join(',') };
  });

  check(results, 'detects lifegain via text', () => {
    const m = detectMechanics(CARD_DATA['Blood Artist']);
    return { ok: m.has('lifegain'), detail: [...m].join(',') };
  });

  check(results, 'keywords supplement text detection', () => {
    const m = detectMechanics({
      name: 'X', oracle_text: 'Flying', keywords: ['Lifelink'], type_line: 'Creature — Angel',
    });
    return { ok: m.has('lifegain'), detail: [...m].join(',') };
  });

  check(results, 'a card with no oracle text yields no mechanics', () => {
    const m = detectMechanics({ name: 'Vanilla', type_line: 'Creature — Bear' });
    return { ok: m.size === 0, detail: `${m.size} found` };
  });

  check(results, 'mechanic overlap is symmetric', () => {
    const a = detectMechanics(CARD_DATA['Hardened Scales']);
    const b = detectMechanics(CARD_DATA['Inspiring Call']);
    const ab = mechanicOverlap(a, b).score;
    const ba = mechanicOverlap(b, a).score;
    return { ok: Math.abs(ab - ba) < 1e-9, detail: `${ab.toFixed(3)} vs ${ba.toFixed(3)}` };
  });

  check(results, 'ubiquitous mechanics are down-weighted', () => {
    // Two cards sharing only "card-draw" must score below two sharing only
    // "counters", because a large share of the pool draws cards.
    const draw = mechanicOverlap(new Set(['card-draw']), new Set(['card-draw'])).score;
    const counters = mechanicOverlap(new Set(['counters']), new Set(['counters'])).score;
    return { ok: draw <= counters, detail: `draw ${draw.toFixed(2)}, counters ${counters.toFixed(2)}` };
  });

  check(results, 'subtypes parse from an em-dash type line', () => {
    const t = subtypesOf('Legendary Creature — Elf Druid');
    return { ok: t.length === 2 && t[0] === 'Elf' && t[1] === 'Druid', detail: t.join('|') };
  });

  check(results, 'type lines without a dash yield no subtypes', () => {
    const t = subtypesOf('Artifact');
    return { ok: t.length === 0, detail: t.join('|') };
  });

  check(results, 'shared creature types detect tribal', () => {
    const shared = sharedCreatureTypes(CARD_DATA['Elvish Mystic'], CARD_DATA['Elvish Archdruid']);
    return { ok: shared.includes('Elf'), detail: shared.join('|') };
  });

  check(results, 'tribal requires both cards to be creatures', () => {
    const shared = sharedCreatureTypes(CARD_DATA['Hardened Scales'], CARD_DATA['Elvish Archdruid']);
    return { ok: shared.length === 0, detail: shared.join('|') };
  });

  check(results, 'a lord textually references its tribe', () => {
    const refs = textualReferences(CARD_DATA['Elvish Archdruid'], CARD_DATA['Elvish Mystic']);
    return { ok: refs.includes('Elf'), detail: refs.join('|') };
  });

  check(results, 'unrelated cards produce no textual reference', () => {
    const refs = textualReferences(CARD_DATA['Lightning Bolt'], CARD_DATA['Elvish Mystic']);
    return { ok: refs.length === 0, detail: refs.join('|') };
  });

  /* --- colour identity -------------------------------------------- */

  check(results, 'colour identity keys are WUBRG-ordered', () => {
    const k = colorIdentityKey(['G', 'W', 'B']);
    return { ok: k === 'WBG', detail: k };
  });

  check(results, 'colourless fits every deck', () => {
    return { ok: fitsIdentity('', 'WUBRG') && fitsIdentity('', ''), detail: 'ok' };
  });

  check(results, 'a green card does not fit a mono-black deck', () => {
    return { ok: !fitsIdentity('G', 'B'), detail: 'ok' };
  });

  /* --- mana base suppression --------------------------------------- */

  check(results, 'lands are recognised as mana base', () => {
    return { ok: isManaBase(CARD_DATA['Command Tower']), detail: 'ok' };
  });

  check(results, 'mana rocks are recognised as mana base', () => {
    return { ok: isManaBase(CARD_DATA['Sol Ring']), detail: 'ok' };
  });

  check(results, 'a creature is never mana base', () => {
    return { ok: !isManaBase(CARD_DATA['Elvish Mystic']), detail: 'ok' };
  });

  check(results, 'two mana-base cards get no co-occurrence credit', () => {
    // Sol Ring and Command Tower are in all five decks together — the single
    // loudest false positive in the real corpus. It must score zero here.
    const r = scorePair(engine, CARD_DATA['Sol Ring'], CARD_DATA['Command Tower']);
    return {
      ok: r.breakdown.cooccurrence === null,
      detail: `cooccurrence=${r.breakdown.cooccurrence}`,
    };
  });

  /* --- pair scoring ------------------------------------------------ */

  check(results, 'identities no corpus deck can combine score zero', () => {
    // The toy corpus has no multicolour deck, so green and black never meet.
    const r = scorePair(
      engine,
      { name: 'A', color_identity: ['G'], type_line: 'Creature — Human', oracle_text: 'Whenever a creature dies, draw a card.' },
      { name: 'B', color_identity: ['B'], type_line: 'Creature — Human', oracle_text: 'Whenever a creature dies, draw a card.' }
    );
    return { ok: r.score === 0, detail: `score ${r.score}, compat ${identityCompatibility(index, 'G', 'B')}` };
  });

  check(results, 'identity compatibility is 1 for identical identities', () => {
    const c = identityCompatibility(index, 'G', 'G');
    return { ok: c === 1, detail: `${c}` };
  });

  check(results, 'colourless is fully compatible with any playable identity', () => {
    const c = identityCompatibility(index, '', 'G');
    return { ok: c === 1, detail: `${c}` };
  });

  check(results, 'identity compatibility is symmetric', () => {
    const ab = identityCompatibility(index, '', 'B');
    const ba = identityCompatibility(index, 'B', '');
    return { ok: ab === ba, detail: `${ab} vs ${ba}` };
  });

  check(results, 'a real synergy pair outscores an unrelated pair', () => {
    const synergy = scorePair(engine, CARD_DATA['Hardened Scales'], CARD_DATA['Inspiring Call']);
    const unrelated = scorePair(engine, CARD_DATA['Hardened Scales'], CARD_DATA['Lightning Bolt']);
    return {
      ok: synergy.score > unrelated.score,
      detail: `synergy ${synergy.score.toFixed(3)} vs unrelated ${unrelated.score.toFixed(3)}`,
    };
  });

  check(results, 'scoring is symmetric', () => {
    const ab = scorePair(engine, CARD_DATA['Hardened Scales'], CARD_DATA['Inspiring Call']).score;
    const ba = scorePair(engine, CARD_DATA['Inspiring Call'], CARD_DATA['Hardened Scales']).score;
    return { ok: Math.abs(ab - ba) < 1e-9, detail: `${ab.toFixed(4)} vs ${ba.toFixed(4)}` };
  });

  check(results, 'every score is within 0..1', () => {
    const names = Object.keys(CARD_DATA);
    let worst = '';
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        const r = scorePair(engine, CARD_DATA[a], CARD_DATA[b]);
        if (r.score < 0 || r.score > 1 || Number.isNaN(r.score)) worst = `${a}+${b}=${r.score}`;
        if (r.confidence < 0 || r.confidence > 1) worst = `${a}+${b} confidence=${r.confidence}`;
      }
    }
    return { ok: worst === '', detail: worst || 'all in range' };
  });

  check(results, 'text-only matches report low confidence', () => {
    // Two cards with no corpus overlap at all, matching only on text.
    const r = scorePair(
      engine,
      { name: 'Unknown A', color_identity: ['G'], type_line: 'Creature — Elf', oracle_text: 'Put a +1/+1 counter on target creature.' },
      { name: 'Unknown B', color_identity: ['G'], type_line: 'Creature — Elf', oracle_text: 'Put a +1/+1 counter on target creature.' }
    );
    return {
      ok: r.breakdown.cooccurrence === null && r.confidence <= 0.35,
      detail: `confidence ${r.confidence.toFixed(2)}, cooc ${r.breakdown.cooccurrence}`,
    };
  });

  check(results, 'reasons are populated and sorted by weight', () => {
    const r = scorePair(engine, CARD_DATA['Elvish Mystic'], CARD_DATA['Elvish Archdruid']);
    const sorted = r.reasons.every((x, i) => i === 0 || r.reasons[i - 1].weight >= x.weight);
    return { ok: r.reasons.length > 0 && sorted, detail: r.reasons.map(x => x.kind).join(',') };
  });

  /* --- recommendation ---------------------------------------------- */

  check(results, 'recommendations exclude cards already in the deck', () => {
    const deck = [CARD_DATA['Hardened Scales'], CARD_DATA['Elvish Mystic']];
    const recs = recommendFromCorpus(engine, deck, 'G');
    const names = new Set(recs.map(r => r.card));
    return {
      ok: !names.has('Hardened Scales') && !names.has('Elvish Mystic'),
      detail: recs.map(r => r.card).join(', ') || '(none)',
    };
  });

  check(results, 'recommendations cite the cards that drove them', () => {
    const deck = [CARD_DATA['Hardened Scales']];
    const recs = recommendFromCorpus(engine, deck, 'G');
    const ok = recs.length === 0 || recs.every(r => r.becauseOf.length > 0);
    return { ok, detail: recs.map(r => `${r.card}<=${r.becauseOf.join('/')}`).join('; ') || '(none)' };
  });

  /* --- determinism -------------------------------------------------- */

  check(results, 'the same inputs always produce the same score', () => {
    const a = scorePair(engine, CARD_DATA['Blood Artist'], CARD_DATA['Swamp Thing']).score;
    const b = scorePair(toyEngine(), CARD_DATA['Blood Artist'], CARD_DATA['Swamp Thing']).score;
    return { ok: a === b, detail: `${a} vs ${b}` };
  });

  /* --- integration against the real corpus -------------------------- */

  const real = await loadRealEngine();
  if (real) {
    const { engine: realEngine, meta } = real;

    check(results, `real corpus loads (${meta.deckCount} decks, ${meta.cardCount} cards)`, () => ({
      ok: realEngine.index.deckCount === meta.deckCount && meta.deckCount > 150,
      detail: `${realEngine.index.deckCount} decks indexed`,
    }));

    check(results, 'real corpus: Sol Ring is near-ubiquitous', () => {
      const id = cardId(realEngine.index, 'Sol Ring');
      const n = id === null ? 0 : realEngine.index.frequency[id];
      return { ok: n > 170, detail: `${n} of ${meta.deckCount} decks` };
    });

    check(results, 'real corpus: Sol Ring + Command Tower scores no co-occurrence', () => {
      const r = scorePair(realEngine, CARD_DATA['Sol Ring'], CARD_DATA['Command Tower']);
      return {
        ok: r.breakdown.cooccurrence === null,
        detail: `suppressed as mana base; score ${r.score.toFixed(3)}`,
      };
    });

    check(results, 'real corpus: colour-pair duals do not read as synergy', () => {
      // Canopy Vista and Fortified Village co-occur 20 times — the top pair by
      // uncorrected NPMI. Both are lands, so co-occurrence must be suppressed.
      const a: SynergyCard = { name: 'Canopy Vista', type_line: 'Land', oracle_text: 'Canopy Vista enters tapped unless you control two or more basic lands.', color_identity: ['G', 'W'], cmc: 0 };
      const b: SynergyCard = { name: 'Fortified Village', type_line: 'Land', oracle_text: 'As Fortified Village enters, you may reveal a Plains or Forest card from your hand.', color_identity: ['G', 'W'], cmc: 0 };
      const r = scorePair(realEngine, a, b);
      return { ok: r.breakdown.cooccurrence === null, detail: `score ${r.score.toFixed(3)}` };
    });

    check(results, 'real corpus: a known counters pair is measured and positive', () => {
      const a: SynergyCard = { name: 'Hardened Scales', type_line: 'Enchantment', oracle_text: CARD_DATA['Hardened Scales'].oracle_text, color_identity: ['G'], cmc: 1 };
      const b: SynergyCard = { name: 'Bred for the Hunt', type_line: 'Enchantment', oracle_text: 'Whenever a creature you control with a +1/+1 counter on it deals combat damage to a player, draw a card.', color_identity: ['G', 'U'], cmc: 3 };
      const r = scorePair(realEngine, a, b);
      return {
        ok: r.breakdown.cooccurrence !== null && r.score > 0,
        detail: `score ${r.score.toFixed(3)}, evidence ${r.evidence ? `${r.evidence.together}/${r.evidence.eligible} lift ${r.evidence.lift.toFixed(1)}` : 'none'}`,
      };
    });

    check(results, 'real corpus: measured pairs report higher confidence than text-only ones', () => {
      // Measured: 6 decks of 47 colour-compatible ones play both.
      const scales: SynergyCard = { name: 'Hardened Scales', type_line: 'Enchantment', oracle_text: CARD_DATA['Hardened Scales'].oracle_text, color_identity: ['G'], cmc: 1 };
      const bred: SynergyCard = { name: 'Bred for the Hunt', type_line: 'Enchantment', oracle_text: 'Whenever a creature you control with a +1/+1 counter on it deals combat damage to a player, draw a card.', color_identity: ['G', 'U'], cmc: 3 };
      const measured = scorePair(realEngine, scales, bred);
      // Inferred: two cards the corpus has never seen, matching only on text.
      const inferred = scorePair(
        realEngine,
        { name: 'Nonexistent Alpha', color_identity: ['G'], type_line: 'Creature — Elf', oracle_text: 'Put a +1/+1 counter on target creature.' },
        { name: 'Nonexistent Beta', color_identity: ['G'], type_line: 'Creature — Elf', oracle_text: 'Put a +1/+1 counter on target creature.' }
      );
      return {
        ok: measured.confidence > inferred.confidence && inferred.breakdown.cooccurrence === null,
        detail: `measured ${measured.confidence.toFixed(2)} vs inferred ${inferred.confidence.toFixed(2)}`,
      };
    });

    check(results, 'real corpus: five-colour-only pairs are discounted, not banned', () => {
      // WUB with RG needs a five-colour commander — 7 of 184 decks.
      const c = identityCompatibility(realEngine.index, 'WUB', 'RG');
      return { ok: c > 0 && c < 0.5, detail: `compatibility ${c.toFixed(3)}` };
    });

    check(results, 'real corpus: recommendations are legal, cited and ranked', () => {
      const deck: SynergyCard[] = [
        { name: 'Hardened Scales', type_line: 'Enchantment', oracle_text: CARD_DATA['Hardened Scales'].oracle_text, color_identity: ['G'], cmc: 1 },
        { name: 'Inspiring Call', type_line: 'Instant', oracle_text: CARD_DATA['Inspiring Call'].oracle_text, color_identity: ['G'], cmc: 3 },
      ];
      const recs = recommendFromCorpus(realEngine, deck, 'GU', { limit: 8 });
      const ranked = recs.every((r, i) => i === 0 || recs[i - 1].score >= r.score);
      const cited = recs.every(r => r.becauseOf.length > 0);
      const excluded = !recs.some(r => r.card === 'Hardened Scales' || r.card === 'Inspiring Call');
      return {
        ok: recs.length > 0 && ranked && cited && excluded,
        detail: recs.slice(0, 5).map(r => `${r.card} ${r.score.toFixed(2)}`).join(', ') || '(none)',
      };
    });

    check(results, 'real corpus: an unrelated cross-archetype pair scores below a synergy pair', () => {
      const scales: SynergyCard = { name: 'Hardened Scales', type_line: 'Enchantment', oracle_text: CARD_DATA['Hardened Scales'].oracle_text, color_identity: ['G'], cmc: 1 };
      const call: SynergyCard = { name: 'Inspiring Call', type_line: 'Instant', oracle_text: CARD_DATA['Inspiring Call'].oracle_text, color_identity: ['G'], cmc: 3 };
      const bolt: SynergyCard = { name: 'Lightning Bolt', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.', color_identity: ['R'], cmc: 1 };
      const good = scorePair(realEngine, scales, call).score;
      const bad = scorePair(realEngine, scales, bolt).score;
      return { ok: good > bad, detail: `${good.toFixed(3)} vs ${bad.toFixed(3)}` };
    });

    check(results, 'real corpus: scoring a 100-card deck stays under 250ms', () => {
      const deck: SynergyCard[] = [];
      for (let i = 0; i < 100; i += 1) {
        const name = realEngine.index.names[i];
        deck.push({ name, type_line: 'Creature — Human', oracle_text: 'Put a +1/+1 counter on target creature.', color_identity: ['G'], cmc: 3 });
      }
      const profiles = deck.map(c => profile(realEngine.index, c));
      const start = Date.now();
      let pairs = 0;
      for (let i = 0; i < profiles.length; i += 1) {
        for (let j = i + 1; j < profiles.length; j += 1) {
          scoreProfiles(realEngine, profiles[i], profiles[j]);
          pairs += 1;
        }
      }
      const ms = Date.now() - start;
      return { ok: ms < 250, detail: `${pairs} pairs in ${ms}ms` };
    });

    check(results, 'real corpus: coverage is honestly reported', () => {
      const share = meta.singletonCount / meta.cardCount;
      return {
        ok: share > 0,
        detail:
          `${meta.singletonCount}/${meta.cardCount} cards (${(share * 100).toFixed(1)}%) ` +
          `appear in exactly one deck and have no co-occurrence signal`,
      };
    });
  } else {
    results.push({
      name: 'real corpus integration',
      pass: false,
      detail: 'precon-corpus.ts could not be imported. Run scripts/generate-synergy-corpus.mjs',
    });
  }

  return results;
}

async function loadRealEngine(): Promise<
  { engine: SynergyEngine; meta: { deckCount: number; cardCount: number; singletonCount: number } } | null
> {
  try {
    const module = await import('@/data/precon-corpus');
    return {
      engine: {
        index: buildCorpusIndex(module.PRECON_CORPUS_CARDS, module.PRECON_CORPUS_DECKS),
        decks: module.PRECON_CORPUS_DECKS,
      },
      meta: module.PRECON_CORPUS_META,
    };
  } catch {
    return null;
  }
}
