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

// Basic lands - always valid
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
const COLOR_TO_BASIC: Record<string, string> = {
  W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest'
};

// Create fake basic land objects for filling
const BASIC_LAND_TEMPLATES: Record<string, any> = {
  Plains: { id: 'basic-plains', name: 'Plains', type_line: 'Basic Land — Plains', color_identity: [], prices: { usd: '0.10' }, cmc: 0, oracle_text: '{T}: Add {W}.' },
  Island: { id: 'basic-island', name: 'Island', type_line: 'Basic Land — Island', color_identity: [], prices: { usd: '0.10' }, cmc: 0, oracle_text: '{T}: Add {U}.' },
  Swamp: { id: 'basic-swamp', name: 'Swamp', type_line: 'Basic Land — Swamp', color_identity: [], prices: { usd: '0.10' }, cmc: 0, oracle_text: '{T}: Add {B}.' },
  Mountain: { id: 'basic-mountain', name: 'Mountain', type_line: 'Basic Land — Mountain', color_identity: [], prices: { usd: '0.10' }, cmc: 0, oracle_text: '{T}: Add {R}.' },
  Forest: { id: 'basic-forest', name: 'Forest', type_line: 'Basic Land — Forest', color_identity: [], prices: { usd: '0.10' }, cmc: 0, oracle_text: '{T}: Add {G}.' },
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
    
    console.log('═'.repeat(60));
    console.log('AI DECK BUILDER V2 - FIXED CARD GENERATION');
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

    // ========== PHASE 2: FETCH CARD POOL WITH PAGINATION ==========
    console.log('\n📦 PHASE 2: Fetching cards (with pagination)...');
    
    // Fetch cards in batches to get more than 1000
    let allCards: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data: batch, error } = await supabase
        .from('cards')
        .select('*')
        .eq('legalities->>commander', 'legal')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw new Error(`Failed to fetch cards: ${error.message}`);
      if (!batch || batch.length === 0) break;
      
      allCards = allCards.concat(batch);
      console.log(`  Fetched batch: ${batch.length} cards (total: ${allCards.length})`);
      
      if (batch.length < batchSize) break;
      offset += batchSize;
      
      // Safety limit
      if (allCards.length >= 50000) break;
    }
    
    console.log(`  Total cards fetched: ${allCards.length}`);

    // Get basic lands from database OR use templates
    const basicLandCards = allCards.filter(c => BASIC_LANDS.includes(c.name));
    console.log(`  Basic lands from DB: ${basicLandCards.length}`);
    
    // Filter non-basic by color identity
    const colorFilteredCards = allCards.filter(card => {
      if (BASIC_LANDS.includes(card.name)) return false;
      const cardIdentity = card.color_identity || [];
      if (isColorless) return cardIdentity.length === 0;
      return cardIdentity.every((c: string) => commanderColors.has(c));
    });
    
    console.log(`  Color-filtered cards: ${colorFilteredCards.length}`);

    // ========== PHASE 3: BUILD DECK ==========
    console.log('\n🔄 PHASE 3: Building deck...');
    
    let bestDeck: any[] = [];
    let bestValidation: any = { isValid: false, issues: [], totalCost: 0, landCount: 0 };
    let bestEdhPower: number | null = null;
    let bestEdhData: any = null;
    let iteration = 0;
    const cardsToAvoid = new Set<string>();
    
    while (iteration < config.maxBuildIterations) {
      iteration++;
      console.log(`\n--- Iteration ${iteration}/${config.maxBuildIterations} ---`);
      
      const usedCardNames = new Set<string>();
      const deck: any[] = [];
      
      // Helper: Add card
      const addCard = (card: any): boolean => {
        if (!card) return false;
        const isBasic = BASIC_LANDS.includes(card.name);
        if (!isBasic && usedCardNames.has(card.name)) return false;
        if (cardsToAvoid.has(card.name)) return false;
        
        deck.push(card);
        if (!isBasic) usedCardNames.add(card.name);
        return true;
      };
      
      // Score card
      const scoreCard = (card: any, isKey: boolean = false): number => {
        let score = 0;
        const price = parseFloat(card.prices?.usd || '0');
        const text = (card.oracle_text || '').toLowerCase();
        
        if (price > 20 && iteration > 1) score -= (price - 20) * 0.5;
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
      
      // Role detection
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
      
      // ===== BUILD DECK =====
      
      // Step 1: Staples
      for (const name of ['Sol Ring', 'Arcane Signet', 'Command Tower']) {
        const card = colorFilteredCards.find(c => c.name === name);
        if (card) addCard(card);
      }
      console.log(`  Staples: ${deck.length}`);
      
      // Step 2: AI key cards
      if (deckPlan?.keyCards?.length) {
        let keyAdded = 0;
        for (const keyName of deckPlan.keyCards.slice(0, 20)) {
          const keyLower = keyName.toLowerCase().trim();
          let match = colorFilteredCards.find(c => 
            c.name.toLowerCase() === keyLower && !usedCardNames.has(c.name)
          );
          if (!match) {
            match = colorFilteredCards.find(c => 
              c.name.toLowerCase().includes(keyLower) && !usedCardNames.has(c.name)
            );
          }
          if (match && addCard(match)) keyAdded++;
        }
        console.log(`  Key cards: ${keyAdded}`);
      }
      
      // Step 3: Cards by role
      for (const { role, count, label } of [
        { role: 'ramp', count: 10, label: 'Ramp' },
        { role: 'draw', count: 10, label: 'Draw' },
        { role: 'removal', count: 8, label: 'Removal' },
        ...(commanderColors.has('U') ? [{ role: 'counter', count: 4, label: 'Counters' }] : [])
      ]) {
        const roleCards = colorFilteredCards
          .filter(c => hasRole(c, role) && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, count);
        roleCards.forEach(c => addCard(c));
        console.log(`  ${label}: ${roleCards.length}/${count}`);
      }
      
      // Step 4: Creatures
      let creaturesAdded = 0;
      for (const { cmc, count } of [{ cmc: 1, count: 4 }, { cmc: 2, count: 8 }, { cmc: 3, count: 8 }, { cmc: 4, count: 5 }, { cmc: 5, count: 4 }, { cmc: 6, count: 2 }]) {
        const creatures = colorFilteredCards
          .filter(c => hasRole(c, 'creature') && !usedCardNames.has(c.name) && Math.floor(c.cmc || 0) === cmc)
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, count);
        creatures.forEach(c => addCard(c));
        creaturesAdded += creatures.length;
      }
      console.log(`  Creatures: ${creaturesAdded}`);
      
      // Step 5: Fill to 63 non-lands
      const targetNonLands = 63;
      const fillNeeded = targetNonLands - deck.length;
      if (fillNeeded > 0) {
        const fillers = colorFilteredCards
          .filter(c => !hasRole(c, 'land') && !usedCardNames.has(c.name) && !cardsToAvoid.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, fillNeeded);
        fillers.forEach(c => addCard(c));
        console.log(`  Fillers: ${fillers.length}`);
      }
      
      // Step 6: Utility lands
      const utilityLands = colorFilteredCards
        .filter(c => hasRole(c, 'land') && !BASIC_LANDS.includes(c.name) && !usedCardNames.has(c.name))
        .sort((a, b) => scoreCard(b) - scoreCard(a))
        .slice(0, 15);
      utilityLands.forEach(c => addCard(c));
      console.log(`  Utility lands: ${utilityLands.length}`);
      
      // Step 7: CRITICAL - Fill remaining with basic lands
      const basicsNeeded = 99 - deck.length;
      console.log(`  Basics needed: ${basicsNeeded}`);
      
      const colors = [...commanderColors];
      if (colors.length === 0) colors.push('W');
      
      for (let i = 0; i < basicsNeeded; i++) {
        const color = colors[i % colors.length];
        const basicName = COLOR_TO_BASIC[color] || 'Plains';
        
        // Try to find in database first
        let basic = basicLandCards.find(c => c.name === basicName);
        
        // If not found, use template
        if (!basic) {
          basic = { ...BASIC_LAND_TEMPLATES[basicName] };
        }
        
        // Add with unique ID
        deck.push({ ...basic, id: `${basic.id}-${iteration}-${i}-${Date.now()}` });
      }
      
      console.log(`  TOTAL CARDS: ${deck.length}`);
      
      // ===== VALIDATION =====
      const validation = validateDeck(deck, buildRequest.commander, targetPower, targetBudget, config);
      console.log(`  Validation: ${validation.isValid ? '✓ PASS' : '✗ FAIL'} - ${validation.issues.join(', ') || 'OK'}`);
      
      // ALWAYS store the best deck so far
      if (deck.length > bestDeck.length || (deck.length === 99 && !bestValidation.isValid && validation.isValid)) {
        bestDeck = [...deck];
        bestValidation = validation;
        console.log(`  ✓ New best: ${deck.length} cards`);
      }
      
      // If we have 99 cards and pass validation, check EDH
      if (deck.length === 99 && validation.issues.filter(i => !i.includes('budget')).length === 0) {
        console.log('  Checking EDH power...');
        const edhResult = await checkEdhPowerFull(supabaseUrl, supabaseKey, buildRequest.commander, deck);
        if (edhResult?.powerLevel) {
          console.log(`  EDH Power: ${edhResult.powerLevel}`);
          bestEdhPower = edhResult.powerLevel;
          bestEdhData = edhResult;
        }
        
        // Good enough - stop
        if (validation.isValid) {
          console.log('  ✓ Requirements met!');
          break;
        }
      }
      
      // If over budget, mark expensive cards to avoid
      if (validation.totalCost > targetBudget * 1.2) {
        const expensive = [...deck]
          .filter(c => !BASIC_LANDS.includes(c.name))
          .sort((a, b) => parseFloat(b.prices?.usd || '0') - parseFloat(a.prices?.usd || '0'))
          .slice(0, 3);
        expensive.forEach(c => cardsToAvoid.add(c.name));
      }
    }

    // ========== FINAL FAILSAFE ==========
    console.log('\n📊 Final check...');
    
    // If bestDeck is still under 99, pad with basics
    while (bestDeck.length < 99) {
      const colors = [...commanderColors];
      if (colors.length === 0) colors.push('W');
      const color = colors[bestDeck.length % colors.length];
      const basicName = COLOR_TO_BASIC[color] || 'Plains';
      const basic = { ...BASIC_LAND_TEMPLATES[basicName], id: `pad-${bestDeck.length}-${Date.now()}` };
      bestDeck.push(basic);
    }
    
    console.log(`  Final deck: ${bestDeck.length} cards`);

    // ========== BUILD RESULT ==========
    const typeBreakdown = {
      creatures: bestDeck.filter(c => c.type_line?.toLowerCase().includes('creature')).length,
      lands: bestDeck.filter(c => c.type_line?.toLowerCase().includes('land')).length,
      instants: bestDeck.filter(c => c.type_line?.toLowerCase().includes('instant')).length,
      sorceries: bestDeck.filter(c => c.type_line?.toLowerCase().includes('sorcery')).length,
      artifacts: bestDeck.filter(c => c.type_line?.toLowerCase().includes('artifact') && !c.type_line?.toLowerCase().includes('creature')).length,
      enchantments: bestDeck.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length,
      planeswalkers: bestDeck.filter(c => c.type_line?.toLowerCase().includes('planeswalker')).length
    };
    
    const totalValue = bestDeck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0);
    
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
    if (!edhUrl && bestDeck.length > 0) {
      let decklistParam = `1x+${encodeURIComponent(buildRequest.commander.name)}~`;
      bestDeck.slice(0, 99).forEach(card => {
        decklistParam += `1x+${encodeURIComponent(card.name)}~`;
      });
      edhUrl = `https://edhpowerlevel.com/?d=${decklistParam.slice(0, -1)}`;
    }

    console.log(`\n✓ Build complete: ${bestDeck.length} cards, $${totalValue.toFixed(2)}`);

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
            totalValue,
            strategy: deckPlan?.strategy || null,
            edhMetrics: bestEdhData?.metrics || null,
            bracket: bestEdhData?.bracket || null,
            cardAnalysis: bestEdhData?.cardAnalysis || null,
            landAnalysis: bestEdhData?.landAnalysis || null
          },
          changeLog: [
            `✓ ${bestDeck.length}/99 cards (+ commander = 100)`,
            `✓ Colors: [${[...commanderColors].join(', ')}]`,
            `✓ Creatures: ${typeBreakdown.creatures}`,
            `✓ Lands: ${typeBreakdown.lands}`,
            `✓ Value: $${totalValue.toFixed(2)}`,
            `✓ Iterations: ${iteration}`,
            bestEdhPower ? `✓ EDH Power: ${bestEdhPower}` : '⏳ EDH Power: Pending'
          ],
          validation: bestValidation
        },
        plan: deckPlan,
        edhPowerLevel: bestEdhPower,
        edhPowerUrl: edhUrl,
        edhAnalysis: bestEdhData ? {
          metrics: bestEdhData.metrics,
          bracket: bestEdhData.bracket,
          cardAnalysis: bestEdhData.cardAnalysis,
          landAnalysis: bestEdhData.landAnalysis,
          url: edhUrl
        } : null,
        iterations: iteration
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Build error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
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

function validateDeck(deck: any[], commander: any, targetPower: number, targetBudget: number, config: any) {
  const issues: string[] = [];
  
  if (deck.length !== 99) issues.push(`${deck.length}/99 cards`);
  
  const nonBasicNames = deck.filter(c => !BASIC_LANDS.includes(c.name)).map(c => c.name);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of nonBasicNames) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
  }
  if (duplicates.length > 0) issues.push(`Duplicates: ${duplicates.slice(0, 2).join(', ')}`);
  
  const commanderColors = new Set(commander.color_identity || []);
  const violations = deck.filter(card => {
    if (BASIC_LANDS.includes(card.name)) return false;
    const cardColors = card.color_identity || [];
    return cardColors.some((c: string) => !commanderColors.has(c));
  });
  if (violations.length > 0) issues.push(`${violations.length} color violations`);
  
  const landCount = deck.filter(c => c.type_line?.toLowerCase().includes('land')).length;
  if (landCount < 30) issues.push(`Only ${landCount} lands`);
  
  const totalCost = deck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0);
  if (totalCost > targetBudget * 1.3) issues.push(`$${totalCost.toFixed(0)} over budget`);
  
  return { isValid: issues.length === 0, issues, totalCost, landCount };
}

async function generateDeckPlan(buildRequest: any, apiKey: string, config: any): Promise<any> {
  const prompt = AI_PROMPTS.deckPlanning(
    buildRequest.commander,
    buildRequest.archetype,
    buildRequest.powerLevel,
    buildRequest.budget || 500
  );

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.aiValidationModel,
        messages: [
          { role: 'system', content: 'You are an MTG Commander deck builder. Return valid JSON only.' },
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
