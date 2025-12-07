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
  useAIPlanning?: boolean;
}

interface DeckPlan {
  strategy: string;
  keyCards: string[];
  winConditions: string[];
  cardQuotas: Record<string, { min: number; max: number }>;
  synergies: string[];
  warnings: string[];
  recommendations: string[];
}

// Basic lands - always valid
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
const COLOR_TO_BASIC: Record<string, string> = {
  W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest'
};

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
    
    const commanderColors = new Set(buildRequest.commander.color_identity || []);
    const isColorless = commanderColors.size === 0;
    const targetBudget = buildRequest.budget || 500;
    const targetPower = buildRequest.powerLevel;
    
    console.log('═'.repeat(80));
    console.log('AI DECK BUILDER V2 - ITERATIVE REFINEMENT ENGINE');
    console.log('═'.repeat(80));
    console.log(`Commander: ${buildRequest.commander.name}`);
    console.log(`Colors: [${[...commanderColors].join(', ') || 'Colorless'}]`);
    console.log(`Archetype: ${buildRequest.archetype}`);
    console.log(`Target Power: ${targetPower}`);
    console.log(`Target Budget: $${targetBudget}`);
    console.log(`Max Iterations: ${config.maxBuildIterations}`);
    console.log('═'.repeat(80));

    // ========== PHASE 1: AI PLANNING ==========
    console.log('\n📋 PHASE 1: AI Strategy Planning...');
    let deckPlan: DeckPlan | null = null;
    
    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      deckPlan = await generateDeckPlan(buildRequest, lovableApiKey, config);
      if (deckPlan) {
        console.log(`  ✓ Strategy: ${deckPlan.strategy?.substring(0, 60)}...`);
        console.log(`  ✓ Key Cards: ${deckPlan.keyCards?.length || 0}`);
      }
    }

    // ========== PHASE 2: FETCH CARD POOL ==========
    console.log('\n📦 PHASE 2: Fetching card pool...');
    const { data: allCards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .eq('legalities->>commander', 'legal');

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    if (!allCards || allCards.length === 0) throw new Error('No legal cards found');
    
    console.log(`  Total legal cards: ${allCards.length}`);
    
    // Separate basic lands
    const basicLandCards = allCards.filter(c => BASIC_LANDS.includes(c.name));
    console.log(`  Basic lands: ${basicLandCards.length}`);
    
    // Filter non-basic by color identity
    const colorFilteredCards = allCards.filter(card => {
      if (BASIC_LANDS.includes(card.name)) return false;
      const cardIdentity = card.color_identity || [];
      if (isColorless) return cardIdentity.length === 0;
      return cardIdentity.every((c: string) => commanderColors.has(c));
    });
    
    console.log(`  Color-filtered cards: ${colorFilteredCards.length}`);

    // ========== PHASE 3: ITERATIVE DECK BUILDING ==========
    console.log('\n🔄 PHASE 3: Iterative Deck Building...');
    
    let bestDeck: any[] = [];
    let bestValidation: any = null;
    let bestEdhPower: number | null = null;
    let bestEdhData: any = null;
    let bestScore = -Infinity;
    let iteration = 0;
    
    // Track cards to avoid/prefer across iterations
    const cardsToAvoid = new Set<string>();
    const expensiveCards = new Set<string>();
    
    while (iteration < config.maxBuildIterations) {
      iteration++;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`ITERATION ${iteration}/${config.maxBuildIterations}`);
      console.log(`${'─'.repeat(60)}`);
      
      const usedCardNames = new Set<string>();
      const deck: any[] = [];
      
      // Helper: Add card with singleton check
      const addCard = (card: any): boolean => {
        if (!card) return false;
        const isBasic = BASIC_LANDS.includes(card.name);
        if (!isBasic && usedCardNames.has(card.name)) return false;
        if (cardsToAvoid.has(card.name)) return false;
        
        deck.push(card);
        if (!isBasic) usedCardNames.add(card.name);
        return true;
      };
      
      // Score card for quality (budget-aware)
      const scoreCard = (card: any, isKeyCard: boolean = false): number => {
        let score = 0;
        const price = parseFloat(card.prices?.usd || '0');
        const text = (card.oracle_text || '').toLowerCase();
        
        // Penalize expensive cards if over budget
        if (expensiveCards.has(card.name)) score -= 50;
        
        // Prefer cards with good price/value ratio
        score += Math.min(price * 0.2, 5);
        if (price > 20) score -= (price - 20) * 0.5; // Penalize very expensive
        
        // Rarity bonus
        if (card.rarity === 'mythic') score += 4;
        if (card.rarity === 'rare') score += 2;
        
        // Low CMC is efficient
        score += Math.max(0, 5 - (card.cmc || 0));
        
        // Commander synergy
        const cmdrText = (buildRequest.commander.oracle_text || '').toLowerCase();
        for (const kw of ['token', 'counter', 'sacrifice', 'graveyard', 'draw', 'creature', 'enchantment', 'artifact']) {
          if (cmdrText.includes(kw) && text.includes(kw)) score += 2;
        }
        
        // Key card bonus
        if (isKeyCard) score += 25;
        
        // EDH staples
        if (/sol ring|arcane signet|command tower/i.test(card.name)) score += 20;
        if (/rhystic study|smothering tithe|cyclonic rift|demonic tutor|swords to plowshares/i.test(card.name)) score += 15;
        if (/mana crypt|mox diamond|chrome mox|mana vault/i.test(card.name)) score += 10;
        
        return score;
      };
      
      // Role detection
      const cardHasRole = (card: any, role: string): boolean => {
        const text = (card.oracle_text || '').toLowerCase();
        const type = (card.type_line || '').toLowerCase();
        
        switch (role) {
          case 'ramp':
            return (text.includes('add') && /\{[wubrgc]\}/.test(text)) || 
                   (text.includes('search') && text.includes('land') && text.includes('battlefield'));
          case 'draw':
            return text.includes('draw') && text.includes('card');
          case 'removal':
            return text.includes('destroy target') || text.includes('exile target') || 
                   text.includes('destroy all') || text.includes('exile all');
          case 'counter':
            return text.includes('counter target spell');
          case 'land':
            return type.includes('land');
          case 'creature':
            return type.includes('creature');
          default:
            return false;
        }
      };
      
      // ===== BUILD DECK =====
      
      // Step 1: Essential staples
      console.log('  Building deck...');
      for (const name of ['Sol Ring', 'Arcane Signet', 'Command Tower']) {
        const card = colorFilteredCards.find(c => c.name === name);
        if (card) addCard(card);
      }
      
      // Step 2: AI key cards (fuzzy match)
      if (deckPlan?.keyCards?.length) {
        let keyAdded = 0;
        for (const keyName of deckPlan.keyCards) {
          const keyLower = keyName.toLowerCase().trim();
          let match = colorFilteredCards.find(c => 
            c.name.toLowerCase() === keyLower && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name)
          );
          if (!match) {
            match = colorFilteredCards.find(c => 
              (c.name.toLowerCase().includes(keyLower) || keyLower.includes(c.name.toLowerCase())) &&
              !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name)
            );
          }
          if (match && addCard(match)) keyAdded++;
          if (keyAdded >= 15) break;
        }
        console.log(`    Key cards: ${keyAdded}`);
      }
      
      // Step 3: Cards by role
      const roleTargets = [
        { role: 'ramp', count: config.minRampCount, label: 'Ramp' },
        { role: 'draw', count: config.minDrawCount, label: 'Draw' },
        { role: 'removal', count: config.minRemovalCount, label: 'Removal' },
      ];
      if (commanderColors.has('U')) {
        roleTargets.push({ role: 'counter', count: 4, label: 'Counters' });
      }
      
      for (const { role, count, label } of roleTargets) {
        const roleCards = colorFilteredCards
          .filter(c => cardHasRole(c, role) && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, count);
        roleCards.forEach(c => addCard(c));
        console.log(`    ${label}: ${roleCards.length}/${count}`);
      }
      
      // Step 4: Creatures by curve
      const targetCreatures = 30;
      let creaturesAdded = 0;
      for (const { cmc, count } of [{ cmc: 1, count: 4 }, { cmc: 2, count: 8 }, { cmc: 3, count: 10 }, { cmc: 4, count: 5 }, { cmc: 5, count: 3 }]) {
        const creatures = colorFilteredCards
          .filter(c => cardHasRole(c, 'creature') && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name) && Math.floor(c.cmc || 0) === cmc)
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, count);
        creatures.forEach(c => addCard(c));
        creaturesAdded += creatures.length;
      }
      console.log(`    Creatures: ${creaturesAdded}`);
      
      // Step 5: Fill to target non-lands (63 non-lands for ~36 lands)
      const targetNonLands = 99 - config.minLandCount;
      const fillNeeded = targetNonLands - deck.length;
      if (fillNeeded > 0) {
        const fillers = colorFilteredCards
          .filter(c => !cardHasRole(c, 'land') && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, fillNeeded);
        fillers.forEach(c => addCard(c));
        console.log(`    Fillers: ${fillers.length}`);
      }
      
      // Step 6: Lands
      const landsNeeded = 99 - deck.length;
      console.log(`    Lands needed: ${landsNeeded}`);
      
      // Utility lands
      const utilityLands = colorFilteredCards
        .filter(c => cardHasRole(c, 'land') && !BASIC_LANDS.includes(c.name) && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name))
        .sort((a, b) => scoreCard(b) - scoreCard(a))
        .slice(0, Math.min(15, landsNeeded));
      utilityLands.forEach(c => addCard(c));
      
      // Fill with basics
      const basicsNeeded = 99 - deck.length;
      const colors = [...commanderColors];
      if (colors.length === 0) colors.push('W');
      
      for (let i = 0; i < basicsNeeded; i++) {
        const color = colors[i % colors.length];
        const basicName = COLOR_TO_BASIC[color] || 'Plains';
        const basic = basicLandCards.find(c => c.name === basicName);
        if (basic) {
          deck.push({ ...basic, id: `${basic.id}-b${iteration}-${i}` });
        }
      }
      
      console.log(`  DECK TOTAL: ${deck.length} cards`);
      
      // ===== VALIDATION =====
      const validation = validateDeck(deck, buildRequest.commander, targetPower, targetBudget, config);
      console.log(`  Validation: ${validation.isValid ? '✓ PASS' : '✗ FAIL'}`);
      if (validation.issues.length > 0) {
        console.log(`    Issues: ${validation.issues.join(', ')}`);
      }
      
      // If not 99 cards, fail fast
      if (deck.length !== 99) {
        console.log(`  ✗ CRITICAL: ${deck.length}/99 cards - retrying...`);
        continue;
      }
      
      // ===== EDH POWER CHECK =====
      console.log('  Fetching EDH power level...');
      const edhResult = await checkEdhPowerFull(supabaseUrl, supabaseKey, buildRequest.commander, deck);
      const edhPower = edhResult?.powerLevel || null;
      console.log(`  EDH Power: ${edhPower ?? 'N/A'}`);
      
      // ===== SCORE THIS BUILD =====
      let buildScore = 0;
      
      // Power level score (closer to target = better)
      if (edhPower !== null) {
        const powerDiff = Math.abs(edhPower - targetPower);
        const tolerance = targetPower * config.powerLevelTolerance;
        if (powerDiff <= tolerance) {
          buildScore += 50 - (powerDiff * 5);
        } else {
          buildScore -= powerDiff * 10;
        }
      }
      
      // Budget score
      const budgetTolerance = targetBudget * config.budgetTolerance;
      if (validation.totalCost <= targetBudget + budgetTolerance) {
        buildScore += 30;
      } else {
        buildScore -= (validation.totalCost - targetBudget) * 0.1;
        // Mark expensive cards to avoid next iteration
        deck.filter(c => parseFloat(c.prices?.usd || '0') > 15)
          .forEach(c => expensiveCards.add(c.name));
      }
      
      // Card count bonus
      if (deck.length === 99) buildScore += 20;
      
      // Land count bonus
      if (validation.landCount >= config.minLandCount) buildScore += 10;
      
      console.log(`  Build Score: ${buildScore.toFixed(1)}`);
      
      // Is this the best build?
      if (buildScore > bestScore) {
        bestScore = buildScore;
        bestDeck = [...deck];
        bestValidation = validation;
        bestEdhPower = edhPower;
        bestEdhData = edhResult;
        console.log(`  ✓ NEW BEST BUILD`);
      }
      
      // Check if good enough to stop
      const powerOk = edhPower === null || Math.abs(edhPower - targetPower) <= (targetPower * config.powerLevelTolerance);
      const budgetOk = validation.totalCost <= targetBudget * (1 + config.budgetTolerance);
      const countOk = deck.length === 99;
      
      if (powerOk && budgetOk && countOk && validation.isValid) {
        console.log(`  ✓ All requirements met - stopping early`);
        break;
      }
      
      // If over budget, mark expensive non-essential cards to avoid
      if (!budgetOk) {
        const sortedByPrice = [...deck]
          .filter(c => !['Sol Ring', 'Arcane Signet', 'Command Tower'].includes(c.name))
          .sort((a, b) => parseFloat(b.prices?.usd || '0') - parseFloat(a.prices?.usd || '0'));
        
        // Mark top 5 expensive cards to avoid
        sortedByPrice.slice(0, 5).forEach(c => cardsToAvoid.add(c.name));
        console.log(`  Marked ${Math.min(5, sortedByPrice.length)} expensive cards to avoid`);
      }
    }

    // ========== PHASE 4: FINAL CARD COUNT CHECK ==========
    console.log('\n📊 PHASE 4: Final Validation...');
    
    // CRITICAL: If still not 99 cards, pad with basics
    while (bestDeck.length < 99) {
      const colors = [...commanderColors];
      if (colors.length === 0) colors.push('W');
      const color = colors[bestDeck.length % colors.length];
      const basicName = COLOR_TO_BASIC[color] || 'Plains';
      const basic = basicLandCards.find(c => c.name === basicName);
      if (basic) {
        bestDeck.push({ ...basic, id: `${basic.id}-pad-${bestDeck.length}` });
      } else {
        break;
      }
    }
    
    console.log(`  Final card count: ${bestDeck.length}`);

    // ========== BUILD RESULT ==========
    console.log('\n═'.repeat(60));
    console.log('BUILD COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Iterations: ${iteration}`);
    console.log(`Best Score: ${bestScore.toFixed(1)}`);
    console.log(`Final Cards: ${bestDeck.length}`);
    console.log(`EDH Power: ${bestEdhPower ?? 'N/A'}`);
    console.log(`Total Cost: $${bestValidation?.totalCost?.toFixed(2) ?? 'N/A'}`);
    
    const typeBreakdown = {
      creatures: bestDeck.filter(c => c.type_line?.toLowerCase().includes('creature')).length,
      lands: bestDeck.filter(c => c.type_line?.toLowerCase().includes('land')).length,
      instants: bestDeck.filter(c => c.type_line?.toLowerCase().includes('instant')).length,
      sorceries: bestDeck.filter(c => c.type_line?.toLowerCase().includes('sorcery')).length,
      artifacts: bestDeck.filter(c => c.type_line?.toLowerCase().includes('artifact') && !c.type_line?.toLowerCase().includes('creature')).length,
      enchantments: bestDeck.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length,
      planeswalkers: bestDeck.filter(c => c.type_line?.toLowerCase().includes('planeswalker')).length
    };
    
    const manaCurve: Record<string, number> = {};
    bestDeck.filter(c => !c.type_line?.includes('Land')).forEach(c => {
      const mv = Math.floor(c.cmc || 0);
      const key = mv >= 7 ? '7+' : mv.toString();
      manaCurve[key] = (manaCurve[key] || 0) + 1;
    });

    const avgCmc = bestDeck.filter(c => !c.type_line?.includes('Land'))
      .reduce((sum, c) => sum + (c.cmc || 0), 0) / 
      Math.max(1, bestDeck.filter(c => !c.type_line?.includes('Land')).length);

    // Build EDH URL
    let edhUrl = bestEdhData?.url || null;
    if (!edhUrl) {
      let decklistParam = `1x+${encodeURIComponent(buildRequest.commander.name)}~`;
      bestDeck.forEach(card => {
        decklistParam += `1x+${encodeURIComponent(card.name)}~`;
      });
      if (decklistParam.endsWith('~')) decklistParam = decklistParam.slice(0, -1);
      edhUrl = `https://edhpowerlevel.com/?d=${decklistParam}`;
    }

    return new Response(
      JSON.stringify({
        status: 'complete',
        result: {
          deck: bestDeck,
          analysis: {
            power: bestEdhPower || targetPower,
            typeBreakdown,
            manaCurve,
            avgCmc,
            totalValue: bestValidation?.totalCost || 0,
            strategy: deckPlan?.strategy || null,
            edhMetrics: bestEdhData?.metrics || null,
            bracket: bestEdhData?.bracket || null,
            cardAnalysis: bestEdhData?.cardAnalysis || null,
            landAnalysis: bestEdhData?.landAnalysis || null
          },
          changeLog: [
            `✓ Built ${bestDeck.length}/99 cards (+ commander = 100)`,
            `✓ Color identity: [${[...commanderColors].join(', ')}]`,
            `✓ Creatures: ${typeBreakdown.creatures}`,
            `✓ Lands: ${typeBreakdown.lands}`,
            `✓ Total value: $${(bestValidation?.totalCost || 0).toFixed(2)}`,
            `✓ Iterations: ${iteration}`,
            `✓ EDH Power: ${bestEdhPower ?? 'Pending'}`,
            bestValidation?.isValid ? '✓ All validation checks passed' : `⚠ Issues: ${bestValidation?.issues?.join(', ')}`
          ],
          validation: bestValidation || { isValid: false, issues: ['Build incomplete'] }
        },
        plan: deckPlan,
        edhPowerLevel: bestEdhPower,
        edhPowerUrl: edhUrl,
        edhAnalysis: {
          metrics: bestEdhData?.metrics || null,
          bracket: bestEdhData?.bracket || null,
          cardAnalysis: bestEdhData?.cardAnalysis || null,
          landAnalysis: bestEdhData?.landAnalysis || null,
          url: edhUrl
        },
        iterations: iteration,
        config: {
          maxIterations: config.maxBuildIterations,
          powerTolerance: config.powerLevelTolerance,
          budgetTolerance: config.budgetTolerance
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in ai-deck-builder-v2:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Get full EDH power data including card analysis
async function checkEdhPowerFull(supabaseUrl: string, supabaseKey: string, commander: any, deck: any[]): Promise<any> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/edh-power-check`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        decklist: { commander, cards: deck }
      })
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('EDH power check failed:', e);
  }
  return null;
}

// Validate deck
function validateDeck(deck: any[], commander: any, targetPower: number, targetBudget: number, config: any) {
  const issues: string[] = [];
  
  if (deck.length !== 99) {
    issues.push(`${deck.length}/99 cards`);
  }
  
  // Singleton check
  const nonBasicNames = deck.filter(c => !BASIC_LANDS.includes(c.name)).map(c => c.name);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of nonBasicNames) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
  }
  if (duplicates.length > 0) {
    issues.push(`Duplicates: ${[...new Set(duplicates)].slice(0, 2).join(', ')}`);
  }
  
  // Color identity
  const commanderColors = new Set(commander.color_identity || []);
  const violations = deck.filter(card => {
    if (BASIC_LANDS.includes(card.name)) return false;
    const cardColors = card.color_identity || [];
    return cardColors.some((c: string) => !commanderColors.has(c));
  });
  if (violations.length > 0) {
    issues.push(`${violations.length} color violations`);
  }
  
  // Land count
  const landCount = deck.filter(c => c.type_line?.toLowerCase().includes('land')).length;
  if (landCount < config.minLandCount) {
    issues.push(`Only ${landCount} lands`);
  }
  
  // Budget
  const totalCost = deck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0);
  const budgetMax = targetBudget * (1 + config.budgetTolerance);
  if (totalCost > budgetMax) {
    issues.push(`$${totalCost.toFixed(0)} > budget`);
  }
  
  return { isValid: issues.length === 0, issues, totalCost, landCount };
}

// Generate AI deck plan
async function generateDeckPlan(buildRequest: any, apiKey: string, config: any): Promise<DeckPlan | null> {
  const prompt = AI_PROMPTS.deckPlanning(
    buildRequest.commander,
    buildRequest.archetype,
    buildRequest.powerLevel,
    buildRequest.budget || 500
  );

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.aiValidationModel,
        messages: [
          { role: 'system', content: 'You are an expert MTG Commander deck builder. Return valid JSON only.' },
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
    
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('AI planning error:', e);
    return null;
  }
}
