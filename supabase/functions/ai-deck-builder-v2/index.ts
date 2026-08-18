import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getAdminConfig, AI_PROMPTS } from './admin-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BuildRequest {
  commander: {
    id: string;
    name: string;
    oracle_text: string;
    type_line: string;
    color_identity: string[];
    colors: string[];
  };
  archetype: string;
  powerLevel: number;
  budget?: number;
  customPrompt?: string;
  useAIPlanning?: boolean;
}

/**
 * A Commander deck is 100 physical cards: the commander plus 99 others.
 * Every count in this file is a count of PHYSICAL CARDS (sum of `quantity`),
 * never a count of array entries. A 99-card deck legitimately occupies far
 * fewer than 99 array slots because basics stack.
 */
const DECK_SLOTS = 99;

// Basic lands are the only cards exempt from singleton. Wastes covers the
// colourless case — the old code substituted Plains for colourless commanders,
// which is not even a legal source of mana for them.
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const COLOR_TO_BASIC: Record<string, string> = {
  W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes'
};

const isBasicLandName = (name: string) => BASIC_LANDS.includes(name);

/** Physical card count. The ONLY legitimate way to size a deck. */
const countCopies = (deck: any[]): number =>
  deck.reduce((sum, c) => sum + (Number(c?.quantity) || 1), 0);

/** A card id we can actually write to `deck_cards.card_id`. */
const hasPersistableId = (c: any): boolean =>
  typeof c?.id === 'string' &&
  c.id.length > 0 &&
  !c.id.startsWith('missing-basic-') &&
  !c.id.includes('pad-');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const buildRequest: BuildRequest = await req.json();
    const config = getAdminConfig();

    if (!buildRequest?.commander?.name) {
      throw new Error('No commander supplied. Pick a commander and try again.');
    }

    const commanderColors = new Set(buildRequest.commander.color_identity || []);
    const isColorless = commanderColors.size === 0;
    const targetBudget = buildRequest.budget || 500;
    const targetPower = buildRequest.powerLevel;

    console.log('═'.repeat(60));
    console.log('AI DECK BUILDER V2');
    console.log('═'.repeat(60));
    console.log(`Commander: ${buildRequest.commander.name}`);
    console.log(`Colors: [${[...commanderColors].join(', ') || 'Colorless'}]`);
    console.log(`Target Power: ${targetPower}, Budget: $${targetBudget}`);

    // ========== PHASE 1: AI PLANNING ==========
    console.log('\n📋 PHASE 1: AI Planning...');
    let deckPlan: any = null;

    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      deckPlan = await generateDeckPlan(buildRequest, lovableApiKey, config);
      if (deckPlan) {
        console.log(`  ✓ Key cards: ${deckPlan.keyCards?.length || 0}`);
      }
    }

    // ========== PHASE 2: FETCH CARD POOL ==========
    console.log('\n📦 PHASE 2: Fetching cards...');

    let cardQuery = supabase
      .from('cards')
      .select('id, name, type_line, oracle_text, cmc, color_identity, colors, rarity, prices, mana_cost, keywords')
      .eq('legalities->>commander', 'legal');

    if (isColorless) {
      cardQuery = cardQuery.or('color_identity.eq.{},color_identity.is.null');
    }

    const { data: allCards, error: cardsError } = await cardQuery.limit(8000);

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    console.log(`  Total cards fetched: ${allCards?.length || 0}`);

    /*
     * Basic lands, with their REAL database ids.
     *
     * This query used to carry `.limit(5)` on the assumption of one printing per
     * basic. The cards table now holds several printings of each, and the index
     * scan returns them in name-alphabetical order, so `.limit(5)` handed back
     * five Forests and Islands and left Mountain/Plains/Swamp permanently
     * unresolvable. Every short deck the builder has ever produced started here.
     * Fetch them all, then keep one row per distinct name.
     */
    const { data: basicRows, error: basicError } = await supabase
      .from('cards')
      .select('id, name, type_line, oracle_text, cmc, color_identity, colors, prices, mana_cost')
      .in('name', BASIC_LANDS);

    if (basicError) throw new Error(`Failed to fetch basic lands: ${basicError.message}`);

    const basicLandMap: Record<string, any> = {};
    for (const name of BASIC_LANDS) {
      const matches = (basicRows || []).filter(r => r.name === name);
      if (!matches.length) continue;
      // Prefer a row that really is a basic land, in case something odd shares the name.
      const chosen = matches.find(r => (r.type_line || '').startsWith('Basic Land')) || matches[0];
      if (hasPersistableId(chosen)) basicLandMap[name] = chosen;
    }
    console.log(
      `  Basic lands resolved: ${Object.keys(basicLandMap).join(', ') || 'NONE'} ` +
      `(from ${basicRows?.length || 0} printings)`
    );

    // The basics this deck is allowed to run, in colour order.
    const deckColors = [...commanderColors];
    const wantedBasics = (deckColors.length ? deckColors : ['C'])
      .map(c => COLOR_TO_BASIC[c])
      .filter(Boolean);
    const availableBasics = wantedBasics.filter(n => basicLandMap[n]);
    const missingBasics = wantedBasics.filter(n => !basicLandMap[n]);
    if (missingBasics.length) {
      console.warn(`  ⚠ Basics missing from the card database: ${missingBasics.join(', ')}`);
    }

    // Colour-identity filter. The commander itself is removed from the pool so it
    // can never be counted twice — once as the commander and once in the 99.
    const commanderName = buildRequest.commander.name;
    const commanderIdFromRequest = buildRequest.commander.id;
    const colorFilteredCards = (allCards || []).filter(card => {
      if (isBasicLandName(card.name)) return false;
      if (card.name === commanderName) return false;
      if (commanderIdFromRequest && card.id === commanderIdFromRequest) return false;
      if (!hasPersistableId(card)) return false;
      const cardIdentity = card.color_identity || [];
      if (isColorless) return cardIdentity.length === 0;
      return cardIdentity.every((c: string) => commanderColors.has(c));
    });

    console.log(`  Color-filtered cards: ${colorFilteredCards.length}`);

    if (colorFilteredCards.length < 40 && availableBasics.length === 0) {
      throw new Error(
        `The card database has too few legal cards for ${commanderName} ` +
        `(${colorFilteredCards.length} in colour identity, no basic lands available). ` +
        `Run a card sync before building.`
      );
    }

    // ========== PHASE 3: BUILD DECK ==========
    console.log('\n🔄 PHASE 3: Building deck...');

    const usedCardNames = new Set<string>();
    const cardsToAvoid = new Set<string>(
      (deckPlan?.mustAvoidCards || []).map((n: string) => String(n).toLowerCase())
    );
    /** Entries the trimmer is not allowed to touch. */
    const protectedNames = new Set<string>();
    const deck: any[] = [];

    /** Every entry that lands in `deck` is a clone carrying an explicit quantity. */
    const addCard = (card: any, opts: { protect?: boolean } = {}): boolean => {
      if (!card || !hasPersistableId(card)) return false;
      const isBasic = isBasicLandName(card.name);
      if (!isBasic && usedCardNames.has(card.name)) return false;
      if (cardsToAvoid.has(card.name.toLowerCase())) return false;

      deck.push({ ...card, quantity: 1, isBasicLand: isBasic });
      if (!isBasic) usedCardNames.add(card.name);
      if (opts.protect) protectedNames.add(card.name);
      return true;
    };

    const scoreCard = (card: any, isKey: boolean = false): number => {
      let score = 0;
      const price = parseFloat(card.prices?.usd || '0');
      const text = (card.oracle_text || '').toLowerCase();

      if (price > 20) score -= (price - 20) * 0.5;
      if (card.rarity === 'mythic') score += 4;
      if (card.rarity === 'rare') score += 2;
      score += Math.max(0, 5 - (card.cmc || 0));

      const cmdrText = (buildRequest.commander.oracle_text || '').toLowerCase();
      for (const kw of ['token', 'counter', 'sacrifice', 'graveyard', 'draw']) {
        if (cmdrText.includes(kw) && text.includes(kw)) score += 2;
      }

      if (isKey) score += 25;
      if (/sol ring|arcane signet|command tower/i.test(card.name)) score += 20;

      return score;
    };

    const hasRole = (card: any, role: string): boolean => {
      const text = (card.oracle_text || '').toLowerCase();
      const type = (card.type_line || '').toLowerCase();

      switch (role) {
        case 'ramp': return (text.includes('add') && /\{[wubrgc]\}/.test(text)) ||
                            (text.includes('search') && text.includes('land'));
        case 'draw': return text.includes('draw') && text.includes('card');
        case 'removal': return text.includes('destroy target') || text.includes('exile target') ||
                               text.includes('destroy all');
        case 'counter': return text.includes('counter target spell');
        case 'land': return type.includes('land');
        case 'creature': return type.includes('creature');
        default: return false;
      }
    };

    const isLandEntry = (c: any) => (c.type_line || '').toLowerCase().includes('land');

    /*
     * The slot plan, decided BEFORE any card is picked.
     *
     * The old builder ran quota after quota with no budget and then computed
     * `basicsNeeded = 99 - deck.length`. When the quotas overfilled, that number
     * went negative, no basics were added, and nothing trimmed the deck back —
     * so the function returned whatever it happened to have. Here every phase is
     * handed a hard cap and can only ever spend room that exists.
     */
    const targetLands = Math.max(
      config.minLandCount ?? 35,
      Math.min(config.maxLandCount ?? 38, 36)
    );
    const nonLandTarget = DECK_SLOTS - targetLands;

    const nonLandCopiesNow = () => countCopies(deck.filter(c => !isLandEntry(c)));
    const nonLandRoom = () => Math.max(0, nonLandTarget - nonLandCopiesNow());

    // ----- Step 1: Staples (three cards, always affordable at this point) -----
    for (const name of ['Sol Ring', 'Arcane Signet', 'Command Tower']) {
      const card = colorFilteredCards.find(c => c.name === name);
      if (card) addCard(card, { protect: true });
    }
    console.log(`  Staples: ${countCopies(deck)}`);

    // ----- Step 2: AI key cards -----
    if (deckPlan?.keyCards?.length) {
      let keyAdded = 0;
      for (const keyName of deckPlan.keyCards.slice(0, 20)) {
        if (nonLandRoom() <= 0) break;
        const keyLower = String(keyName).toLowerCase().trim();
        if (!keyLower) continue;
        let match = colorFilteredCards.find(c =>
          c.name.toLowerCase() === keyLower && !usedCardNames.has(c.name)
        );
        if (!match) {
          match = colorFilteredCards.find(c =>
            c.name.toLowerCase().includes(keyLower) && !usedCardNames.has(c.name)
          );
        }
        if (match && addCard(match, { protect: true })) keyAdded++;
      }
      console.log(`  Key cards: ${keyAdded}`);
    }

    /*
     * Step 3: role quotas, each capped by the spell budget.
     *
     * The planner's named picks for a role go in first — that is the whole point
     * of asking it — and the scored pool tops the quota up. The planner is never
     * trusted to reach the quota by itself.
     */
    const planPicks = (field: string): string[] =>
      Array.isArray(deckPlan?.[field]) ? deckPlan[field].map((n: any) => String(n)) : [];

    for (const { role, count, label, picks } of [
      { role: 'ramp', count: config.minRampCount ?? 10, label: 'Ramp', picks: planPicks('rampPicks') },
      { role: 'draw', count: config.minDrawCount ?? 10, label: 'Draw', picks: planPicks('drawPicks') },
      { role: 'removal', count: config.minRemovalCount ?? 8, label: 'Removal', picks: planPicks('removalPicks') },
      ...(commanderColors.has('U') ? [{ role: 'counter', count: 4, label: 'Counters', picks: [] as string[] }] : [])
    ]) {
      let added = 0;
      const quota = Math.min(count, nonLandRoom());

      for (const pick of picks) {
        if (added >= quota || nonLandRoom() <= 0) break;
        const lower = pick.toLowerCase().trim();
        if (!lower) continue;
        const match = colorFilteredCards.find(c =>
          c.name.toLowerCase() === lower && !isLandEntry(c) && !usedCardNames.has(c.name)
        );
        if (match && addCard(match, { protect: true })) added++;
      }

      const remaining = Math.min(count - added, nonLandRoom());
      if (remaining > 0) {
        const roleCards = colorFilteredCards
          .filter(c => hasRole(c, role) && !isLandEntry(c) && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, remaining);
        roleCards.forEach(c => { if (addCard(c, { protect: true })) added++; });
      }
      console.log(`  ${label}: ${added}/${count}`);
    }

    // ----- Step 4: Creatures across the curve, inside whatever room is left -----
    let creaturesAdded = 0;
    const creatureShape = [
      { cmc: 1, weight: 4 }, { cmc: 2, weight: 8 }, { cmc: 3, weight: 8 },
      { cmc: 4, weight: 5 }, { cmc: 5, weight: 4 }, { cmc: 6, weight: 2 }
    ];
    const creatureBudget = Math.max(0, Math.min(nonLandRoom(), 31));
    const shapeTotal = creatureShape.reduce((s, b) => s + b.weight, 0);
    for (const { cmc, weight } of creatureShape) {
      const room = Math.min(nonLandRoom(), Math.round((weight / shapeTotal) * creatureBudget));
      if (room <= 0) continue;
      const creatures = colorFilteredCards
        .filter(c => hasRole(c, 'creature') && !usedCardNames.has(c.name) && Math.floor(c.cmc || 0) === cmc)
        .sort((a, b) => scoreCard(b) - scoreCard(a))
        .slice(0, room);
      creatures.forEach(c => { if (addCard(c)) creaturesAdded++; });
    }
    console.log(`  Creatures: ${creaturesAdded}`);

    // ----- Step 5: Fill any remaining spell slots -----
    const fillRoom = nonLandRoom();
    if (fillRoom > 0) {
      const fillers = colorFilteredCards
        .filter(c => !isLandEntry(c) && !usedCardNames.has(c.name))
        .sort((a, b) => scoreCard(b) - scoreCard(a))
        .slice(0, fillRoom);
      fillers.forEach(c => addCard(c));
      console.log(`  Fillers: ${fillers.length}`);
    }

    // ----- Step 6: Utility lands -----
    const landCopiesNow = () => countCopies(deck.filter(isLandEntry));
    const utilityLandTarget = availableBasics.length
      ? Math.min(15, targetLands)
      : targetLands;
    const utilityRoom = Math.max(0, utilityLandTarget - landCopiesNow());
    if (utilityRoom > 0) {
      const utilityLands = colorFilteredCards
        .filter(c => isLandEntry(c) && !usedCardNames.has(c.name))
        .sort((a, b) => scoreCard(b) - scoreCard(a))
        .slice(0, utilityRoom);
      utilityLands.forEach(c => addCard(c, { protect: true }));
    }
    console.log(`  Lands before basics: ${landCopiesNow()}`);

    const coreTarget = DECK_SLOTS - (
      availableBasics.length ? Math.max(0, targetLands - landCopiesNow()) : 0
    );

    /**
     * Remove copies until the deck is at most `target` physical cards.
     * Basics shrink first (a basic is the cheapest thing to lose), then the
     * lowest-scoring unprotected spells, then unprotected lands. Returns how
     * many copies it actually managed to remove.
     */
    const trimTo = (target: number): number => {
      let removed = 0;
      let total = countCopies(deck);
      let guard = 0;
      while (total > target && guard++ < 400) {
        const over = total - target;

        const basics = deck
          .filter(c => c.isBasicLand && (c.quantity || 1) > 1)
          .sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
        if (basics.length) {
          const take = Math.min(over, (basics[0].quantity || 1) - 1);
          basics[0].quantity -= take;
          total -= take;
          removed += take;
          continue;
        }

        const candidates = deck
          .filter(c => !protectedNames.has(c.name))
          .sort((a, b) => {
            const landDelta = Number(isLandEntry(a)) - Number(isLandEntry(b));
            if (landDelta !== 0) return landDelta; // non-lands go first
            return scoreCard(a) - scoreCard(b);
          });
        if (!candidates.length) break;

        const worst = candidates[0];
        const idx = deck.indexOf(worst);
        if (idx === -1) break;
        deck.splice(idx, 1);
        usedCardNames.delete(worst.name);
        total -= (worst.quantity || 1);
        removed += (worst.quantity || 1);
      }
      return removed;
    };

    const trimmed = trimTo(coreTarget);
    if (trimmed) console.log(`  Trimmed ${trimmed} over-quota cards`);

    // ----- Step 7: Basics complete the manabase -----
    const basicsNeeded = DECK_SLOTS - countCopies(deck);
    console.log(`  Basics needed: ${basicsNeeded}`);

    if (basicsNeeded > 0 && availableBasics.length) {
      const basicCounts: Record<string, number> = {};
      for (let i = 0; i < basicsNeeded; i++) {
        const name = availableBasics[i % availableBasics.length];
        basicCounts[name] = (basicCounts[name] || 0) + 1;
      }
      for (const [basicName, count] of Object.entries(basicCounts)) {
        // basicLandMap[basicName] is guaranteed present: availableBasics is
        // derived from it. There is no synthetic-id fallback any more — a card
        // this function cannot persist is never emitted.
        deck.push({ ...basicLandMap[basicName], quantity: count, isBasicLand: true });
      }
    }

    /**
     * Deterministic top-up. Basics first (they fix the mana base), then the best
     * remaining on-colour cards from the legal pool. Never invents an id.
     */
    const topUpTo = (target: number): number => {
      let added = 0;
      let total = countCopies(deck);

      if (total < target && availableBasics.length) {
        const need = target - total;
        for (let i = 0; i < need; i++) {
          const name = availableBasics[i % availableBasics.length];
          const existing = deck.find(c => c.isBasicLand && c.name === name);
          if (existing) existing.quantity = (existing.quantity || 1) + 1;
          else deck.push({ ...basicLandMap[name], quantity: 1, isBasicLand: true });
        }
        added += need;
        total += need;
      }

      if (total < target) {
        // No basics available (e.g. a colourless commander with no Wastes
        // synced). Fall back to the best remaining on-colour cards so the deck
        // still comes out at exactly 99 rather than short.
        const spares = colorFilteredCards
          .filter(c => !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a));
        for (const c of spares) {
          if (total >= target) break;
          if (addCard(c)) { added++; total++; }
        }
      }

      return added;
    };

    const toppedUp = topUpTo(DECK_SLOTS);
    if (toppedUp) console.log(`  Topped up ${toppedUp} cards`);

    // ========== PHASE 4: REPAIR LOOP + HARD GATE ==========
    console.log('\n📊 PHASE 4: Validation...');

    // Repair, don't just report. Three passes is plenty: each pass moves the
    // total strictly toward 99 and the pool only shrinks.
    for (let pass = 0; pass < 3; pass++) {
      const total = countCopies(deck);
      if (total === DECK_SLOTS) break;
      if (total > DECK_SLOTS) trimTo(DECK_SLOTS);
      else topUpTo(DECK_SLOTS);
    }

    const bestDeck = deck;
    const finalTotal = countCopies(bestDeck);
    const bestValidation = validateDeck(bestDeck, buildRequest.commander, targetBudget, config);

    console.log(
      `  Final deck: ${bestDeck.length} entries, ${finalTotal} cards, ` +
      `${bestValidation.landCount} lands`
    );
    console.log(`  Validation: ${bestValidation.isValid ? '✓ PASS' : '✗ FAIL'} — ${bestValidation.issues.join('; ') || 'OK'}`);

    // Refuse to hand back something that cannot be saved. A 200 with a short
    // deck is what produced 67-, 79- and 86-card "Commander decks".
    if (bestValidation.blocking.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Could not build a legal 100-card deck for ${commanderName}: ${bestValidation.blocking.join('; ')}`,
          validation: bestValidation
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== BUILD RESULT ==========
    // Everything below counts copies, so a 99-card deck held in 84 entries
    // reports 99 — the same number the client persists.
    const qty = (c: any) => Number(c.quantity) || 1;
    const sumBy = (pred: (c: any) => boolean) =>
      bestDeck.filter(pred).reduce((s, c) => s + qty(c), 0);
    const typeOf = (c: any) => (c.type_line || '').toLowerCase();

    const typeBreakdown = {
      creatures: sumBy(c => typeOf(c).includes('creature')),
      lands: sumBy(c => typeOf(c).includes('land')),
      instants: sumBy(c => typeOf(c).includes('instant')),
      sorceries: sumBy(c => typeOf(c).includes('sorcery')),
      artifacts: sumBy(c => typeOf(c).includes('artifact') && !typeOf(c).includes('creature')),
      enchantments: sumBy(c => typeOf(c).includes('enchantment')),
      planeswalkers: sumBy(c => typeOf(c).includes('planeswalker'))
    };

    const totalValue = bestDeck.reduce(
      (sum, c) => sum + parseFloat(c.prices?.usd || '0') * qty(c), 0
    );

    const nonLands = bestDeck.filter(c => !typeOf(c).includes('land'));
    const nonLandCopies = nonLands.reduce((s, c) => s + qty(c), 0);

    const manaCurve: Record<string, number> = {};
    nonLands.forEach(c => {
      const mv = Math.floor(c.cmc || 0);
      const key = mv >= 7 ? '7+' : mv.toString();
      manaCurve[key] = (manaCurve[key] || 0) + qty(c);
    });

    const avgCmc = nonLandCopies > 0
      ? nonLands.reduce((sum, c) => sum + (c.cmc || 0) * qty(c), 0) / nonLandCopies
      : 0;

    // EDH URL — expand quantities so the manabase is represented honestly.
    let decklistParam = `1x+${encodeURIComponent(commanderName)}~`;
    bestDeck.forEach(card => {
      decklistParam += `${qty(card)}x+${encodeURIComponent(card.name)}~`;
    });
    const edhUrl = `https://edhpowerlevel.com/?d=${decklistParam.slice(0, -1)}`;

    console.log(`\n✓ Build complete: ${finalTotal} cards, $${totalValue.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        status: 'complete',
        result: {
          deck: bestDeck,
          totals: {
            deckCards: finalTotal,
            withCommander: finalTotal + 1,
            entries: bestDeck.length,
            lands: typeBreakdown.lands
          },
          analysis: {
            power: targetPower,
            typeBreakdown,
            manaCurve,
            avgCmc,
            totalValue,
            strategy: deckPlan?.strategy || null,
            edhMetrics: null,
            bracket: null,
            cardAnalysis: null,
            landAnalysis: null
          },
          changeLog: [
            `✓ ${finalTotal}/99 cards (+ commander = ${finalTotal + 1})`,
            `✓ Colors: [${[...commanderColors].join(', ') || 'Colorless'}]`,
            `✓ Lands: ${typeBreakdown.lands} (${sumBy(c => c.isBasicLand)} basic)`,
            `✓ Creatures: ${typeBreakdown.creatures}`,
            `✓ Value: $${totalValue.toFixed(2)}`,
            missingBasics.length
              ? `⚠ Basics not in card database: ${missingBasics.join(', ')}`
              : `✓ Basics resolved: ${availableBasics.join(', ') || 'none needed'}`,
            ...bestValidation.issues.map(i => `⚠ ${i}`)
          ],
          validation: bestValidation
        },
        plan: deckPlan,
        edhPowerLevel: null,
        edhPowerUrl: edhUrl,
        edhAnalysis: null,
        iterations: 1
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Build error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function checkEdhPowerFull(supabaseUrl: string, supabaseKey: string, commander: any, deck: any[]): Promise<any> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/edh-power-check`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decklist: { commander, cards: deck } })
    });
    if (response.ok) return await response.json();
  } catch (e) {
    console.log('EDH check failed:', e);
  }
  return null;
}

export interface BuildValidation {
  isValid: boolean;
  /** Problems that make the deck impossible to save. Non-empty ⇒ do not return 200. */
  blocking: string[];
  /** Everything, blocking and advisory. */
  issues: string[];
  totalCards: number;
  totalCost: number;
  landCount: number;
}

/**
 * Validates the deck the way Commander actually works: by physical card count.
 * The previous version compared `deck.length` (array entries) to 99, which
 * declared every correct deck invalid the moment basics started stacking, and
 * declared a 79-card deck valid whenever it happened to occupy 99 slots.
 */
function validateDeck(
  deck: any[],
  commander: any,
  targetBudget: number,
  config: any
): BuildValidation {
  const blocking: string[] = [];
  const advisory: string[] = [];
  const qty = (c: any) => Number(c.quantity) || 1;

  const totalCards = countCopies(deck);
  if (totalCards !== DECK_SLOTS) {
    blocking.push(`${totalCards} cards in the 99 (needs exactly ${DECK_SLOTS})`);
  }

  const unsaveable = deck.filter(c => !hasPersistableId(c));
  if (unsaveable.length) {
    blocking.push(
      `${unsaveable.length} card(s) have no database id: ${unsaveable.slice(0, 3).map(c => c.name).join(', ')}`
    );
  }

  // Singleton, counted in copies so a stacked non-basic is caught.
  const copiesByName = new Map<string, number>();
  for (const c of deck) {
    if (isBasicLandName(c.name)) continue;
    copiesByName.set(c.name, (copiesByName.get(c.name) || 0) + qty(c));
  }
  const duplicates = [...copiesByName.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  if (duplicates.length > 0) {
    blocking.push(`Singleton broken: ${duplicates.slice(0, 3).join(', ')}`);
  }

  if (deck.some(c => c.name === commander?.name)) {
    blocking.push(`The commander (${commander?.name}) also appears in the 99`);
  }

  const commanderColors = new Set<string>(commander?.color_identity || []);
  const violations = deck.filter(card => {
    const cardColors: string[] = card.color_identity || [];
    return cardColors.some(c => !commanderColors.has(c));
  });
  if (violations.length > 0) {
    blocking.push(
      `${violations.length} card(s) outside colour identity: ${violations.slice(0, 3).map(c => c.name).join(', ')}`
    );
  }

  const landCount = deck
    .filter(c => (c.type_line || '').toLowerCase().includes('land'))
    .reduce((s, c) => s + qty(c), 0);
  const minLands = config?.minLandCount ?? 35;
  if (landCount < Math.min(30, minLands)) {
    advisory.push(`Only ${landCount} lands`);
  }

  const totalCost = deck.reduce(
    (sum, c) => sum + parseFloat(c.prices?.usd || '0') * qty(c), 0
  );
  if (totalCost > targetBudget * 1.3) {
    advisory.push(`$${totalCost.toFixed(0)} over the $${targetBudget} budget`);
  }

  return {
    isValid: blocking.length === 0 && advisory.length === 0,
    blocking,
    issues: [...blocking, ...advisory],
    totalCards,
    totalCost,
    landCount
  };
}

async function generateDeckPlan(buildRequest: any, apiKey: string, config: any): Promise<any> {
  const prompt = AI_PROMPTS.deckPlanning(
    buildRequest.commander,
    buildRequest.archetype,
    buildRequest.powerLevel,
    buildRequest.budget || 500,
    buildRequest.customPrompt || ''
  );

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.aiValidationModel,
        messages: [
          { role: 'system', content: AI_PROMPTS.plannerSystem },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.choices[0].message.content;

    let jsonStr = text.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlock) jsonStr = codeBlock[1];
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const plan = JSON.parse(jsonStr);

    // The model returns suggestions, never counts we depend on. Normalise the
    // only two fields the builder actually consumes.
    return {
      ...plan,
      keyCards: Array.isArray(plan.keyCards) ? plan.keyCards.map((c: any) => String(c)) : [],
      mustAvoidCards: Array.isArray(plan.mustAvoidCards) ? plan.mustAvoidCards.map((c: any) => String(c)) : []
    };
  } catch (e) {
    console.error('AI planning error:', e);
    return null;
  }
}
