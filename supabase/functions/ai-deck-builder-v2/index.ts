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

// Basic lands - these are always valid in any deck regardless of color filtering
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
    // If colorless commander, allow all colors for lands but no colored spells
    const isColorless = commanderColors.size === 0;
    
    console.log('='.repeat(80));
    console.log('AI DECK BUILDER V2 - STRICT 100 CARD ENFORCEMENT');
    console.log('='.repeat(80));
    console.log('Commander:', buildRequest.commander.name);
    console.log('Color Identity:', [...commanderColors].join(', ') || 'Colorless');
    console.log('Archetype:', buildRequest.archetype);
    console.log('Power Level Target:', buildRequest.powerLevel);
    console.log('Budget:', buildRequest.budget || 'unlimited');
    console.log('Max Iterations:', config.maxBuildIterations);
    console.log('='.repeat(80));

    // Phase 1: AI Planning
    let deckPlan: DeckPlan | null = null;
    
    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      console.log('\n📋 Phase 1: AI Strategy Planning...');
      deckPlan = await generateDeckPlan(buildRequest, lovableApiKey, config);
      if (deckPlan) {
        console.log('✓ Strategy:', deckPlan.strategy?.substring(0, 80) + '...');
        console.log('✓ Key Cards Suggested:', deckPlan.keyCards?.length || 0);
      }
    }

    // Phase 2: Fetch ALL cards - we need basic lands regardless of color
    console.log('\n📦 Phase 2: Fetching card pool...');
    const { data: allCards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .eq('legalities->>commander', 'legal');

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    if (!allCards || allCards.length === 0) throw new Error('No legal cards found');
    
    console.log(`Total legal cards: ${allCards.length}`);
    
    // Separate basic lands - they are ALWAYS valid
    const basicLandCards = allCards.filter(c => BASIC_LANDS.includes(c.name));
    console.log(`Basic lands found: ${basicLandCards.length}`);
    
    // Filter non-basic cards by color identity
    const colorFilteredCards = allCards.filter(card => {
      // Skip basic lands - handled separately
      if (BASIC_LANDS.includes(card.name)) return false;
      
      const cardIdentity = card.color_identity || [];
      // For colorless commanders, only allow colorless cards
      if (isColorless) {
        return cardIdentity.length === 0;
      }
      // Card's identity must be subset of commander's identity
      return cardIdentity.every((c: string) => commanderColors.has(c));
    });
    
    console.log(`Color-filtered cards (non-basic): ${colorFilteredCards.length}`);

    // Phase 3: Build deck with STRICT 99 card enforcement
    console.log('\n🔄 Phase 3: Building deck with strict 99 card target...');
    
    let bestDeck: any[] = [];
    let bestValidation: any = null;
    let bestEdhPower: number | null = null;
    let iteration = 0;
    const targetNonLands = 99 - config.minLandCount; // ~63 non-lands
    
    while (iteration < config.maxBuildIterations) {
      iteration++;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`ITERATION ${iteration}/${config.maxBuildIterations}`);
      console.log(`${'─'.repeat(60)}`);
      
      const usedCardNames = new Set<string>();
      const deck: any[] = [];
      
      // Helper to add cards with singleton check
      const addCard = (card: any): boolean => {
        if (!card) return false;
        const isBasic = BASIC_LANDS.includes(card.name);
        if (!isBasic && usedCardNames.has(card.name)) return false;
        
        deck.push(card);
        if (!isBasic) usedCardNames.add(card.name);
        return true;
      };
      
      // Score cards for quality
      const scoreCard = (card: any, isKeyCard: boolean = false): number => {
        let score = 0;
        const text = (card.oracle_text || '').toLowerCase();
        const price = parseFloat(card.prices?.usd || '0');
        
        // Price bonus (correlates with power for older cards)
        score += Math.min(price * 0.3, 8);
        
        // Rarity bonus
        if (card.rarity === 'mythic') score += 5;
        if (card.rarity === 'rare') score += 3;
        
        // Low CMC is good
        score += Math.max(0, 5 - (card.cmc || 0));
        
        // Commander synergy
        const cmdrText = (buildRequest.commander.oracle_text || '').toLowerCase();
        const synergyKeywords = ['token', 'counter', 'sacrifice', 'graveyard', 'draw', 'creature', 'enchantment'];
        for (const kw of synergyKeywords) {
          if (cmdrText.includes(kw) && text.includes(kw)) score += 2;
        }
        
        // Key card bonus
        if (isKeyCard) score += 25;
        
        // EDH staples
        if (/sol ring|mana crypt|arcane signet|command tower/i.test(card.name)) score += 20;
        if (/rhystic study|smothering tithe|cyclonic rift|demonic tutor|swords to plowshares/i.test(card.name)) score += 15;
        
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
      
      // Step 1: Add staples that every deck needs
      console.log('  Adding essential staples...');
      const stapleNames = ['Sol Ring', 'Arcane Signet', 'Command Tower'];
      for (const name of stapleNames) {
        const card = colorFilteredCards.find(c => c.name === name);
        if (card) addCard(card);
      }
      console.log(`    Staples: ${deck.length}`);
      
      // Step 2: Add AI-recommended key cards (fuzzy match)
      if (deckPlan?.keyCards?.length) {
        console.log('  Adding AI-recommended cards...');
        const keyMatches: any[] = [];
        for (const keyName of deckPlan.keyCards) {
          const keyLower = keyName.toLowerCase().trim();
          // Try exact match first
          let match = colorFilteredCards.find(c => 
            c.name.toLowerCase() === keyLower && !usedCardNames.has(c.name)
          );
          // Then fuzzy match
          if (!match) {
            match = colorFilteredCards.find(c => 
              (c.name.toLowerCase().includes(keyLower) || keyLower.includes(c.name.toLowerCase())) &&
              !usedCardNames.has(c.name)
            );
          }
          if (match) keyMatches.push(match);
        }
        keyMatches
          .sort((a, b) => scoreCard(b, true) - scoreCard(a, true))
          .slice(0, 15)
          .forEach(c => addCard(c));
        console.log(`    Key cards: ${keyMatches.length}`);
      }
      
      // Step 3: Add cards by role
      const roleTargets = [
        { role: 'ramp', min: config.minRampCount, label: 'Ramp' },
        { role: 'draw', min: config.minDrawCount, label: 'Card Draw' },
        { role: 'removal', min: config.minRemovalCount, label: 'Removal' },
      ];
      
      // Add counterspells if blue
      if (commanderColors.has('U')) {
        roleTargets.push({ role: 'counter', min: 4, label: 'Counterspells' });
      }
      
      for (const { role, min, label } of roleTargets) {
        const roleCards = colorFilteredCards
          .filter(c => cardHasRole(c, role) && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, min);
        roleCards.forEach(c => addCard(c));
        console.log(`    ${label}: ${roleCards.length}/${min}`);
      }
      
      // Step 4: Add creatures by curve
      console.log('  Adding creatures by mana curve...');
      const curveCounts = [
        { cmc: 1, count: 4 },
        { cmc: 2, count: 8 },
        { cmc: 3, count: 10 },
        { cmc: 4, count: 7 },
        { cmc: 5, count: 5 },
        { cmc: 6, count: 3 },
      ];
      
      let totalCreatures = 0;
      for (const { cmc, count } of curveCounts) {
        const creatures = colorFilteredCards
          .filter(c => 
            cardHasRole(c, 'creature') && 
            !usedCardNames.has(c.name) &&
            Math.floor(c.cmc || 0) === cmc
          )
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, count);
        creatures.forEach(c => addCard(c));
        totalCreatures += creatures.length;
      }
      console.log(`    Creatures: ${totalCreatures}`);
      
      // Step 5: Fill remaining non-land slots
      const nonLandCount = deck.length;
      const fillNeeded = targetNonLands - nonLandCount;
      console.log(`  Current non-lands: ${nonLandCount}, need ${fillNeeded} more...`);
      
      if (fillNeeded > 0) {
        const fillers = colorFilteredCards
          .filter(c => !cardHasRole(c, 'land') && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a))
          .slice(0, fillNeeded);
        fillers.forEach(c => addCard(c));
        console.log(`    Fillers added: ${fillers.length}`);
      }
      
      // Step 6: Build manabase - CRITICAL for hitting 99
      const nonLandTotal = deck.length;
      const landsNeeded = 99 - nonLandTotal;
      console.log(`  Building manabase: need ${landsNeeded} lands...`);
      
      // Add utility lands (singleton)
      const utilityLands = colorFilteredCards
        .filter(c => 
          cardHasRole(c, 'land') && 
          !BASIC_LANDS.includes(c.name) && 
          !usedCardNames.has(c.name)
        )
        .sort((a, b) => scoreCard(b) - scoreCard(a))
        .slice(0, Math.min(15, landsNeeded));
      
      utilityLands.forEach(c => addCard(c));
      console.log(`    Utility lands: ${utilityLands.length}`);
      
      // Fill rest with basic lands (CAN be duplicates)
      const basicsNeeded = 99 - deck.length;
      console.log(`    Basics needed: ${basicsNeeded}`);
      
      // Get color distribution for basics
      const colors = [...commanderColors];
      if (colors.length === 0) colors.push('W'); // Default for colorless
      
      for (let i = 0; i < basicsNeeded; i++) {
        const color = colors[i % colors.length];
        const basicName = COLOR_TO_BASIC[color] || 'Plains';
        const basic = basicLandCards.find(c => c.name === basicName);
        if (basic) {
          // Create unique ID for each basic land copy
          deck.push({ ...basic, id: `${basic.id}-basic-${i}-${Date.now()}` });
        }
      }
      console.log(`    Total lands: ${deck.filter(c => c.type_line?.toLowerCase().includes('land')).length}`);
      console.log(`  DECK TOTAL: ${deck.length} cards`);
      
      // Validate
      const validation = validateDeck(deck, buildRequest.commander, buildRequest.powerLevel, buildRequest.budget || 500, config);
      console.log(`  Validation: ${validation.isValid ? '✓ PASS' : '✗ FAIL'}`);
      if (validation.issues.length > 0) {
        console.log(`    Issues: ${validation.issues.join(', ')}`);
      }
      
      // If we have 99 cards and pass validation, check EDH power
      if (deck.length === 99 && validation.issues.length === 0) {
        console.log('  Checking EDH power level...');
        const edhPower = await checkEdhPower(supabaseUrl, supabaseKey, buildRequest.commander, deck);
        console.log(`  EDH Power: ${edhPower || 'N/A'}`);
        
        const targetPower = buildRequest.powerLevel;
        const tolerance = config.powerLevelTolerance;
        const minPower = targetPower * (1 - tolerance);
        const maxPower = targetPower * (1 + tolerance);
        
        if (edhPower !== null && (edhPower < minPower || edhPower > maxPower)) {
          console.log(`  Power ${edhPower} outside target range ${minPower.toFixed(1)}-${maxPower.toFixed(1)}`);
          
          // Store as best if closer to target
          if (!bestEdhPower || Math.abs(edhPower - targetPower) < Math.abs(bestEdhPower - targetPower)) {
            bestDeck = [...deck];
            bestValidation = validation;
            bestEdhPower = edhPower;
          }
          continue; // Try again with different cards
        }
        
        // Perfect deck found!
        bestDeck = deck;
        bestValidation = validation;
        bestEdhPower = edhPower;
        console.log('  ✓ Deck meets all requirements!');
        break;
      }
      
      // Store best result
      if (!bestDeck.length || deck.length > bestDeck.length) {
        bestDeck = [...deck];
        bestValidation = validation;
      }
    }

    // Final stats
    console.log(`\n${'='.repeat(60)}`);
    console.log('BUILD COMPLETE');
    console.log(`${'='.repeat(60)}`);
    console.log(`Iterations: ${iteration}`);
    console.log(`Final deck: ${bestDeck.length} cards`);
    
    const typeBreakdown = {
      creatures: bestDeck.filter(c => c.type_line?.toLowerCase().includes('creature')).length,
      lands: bestDeck.filter(c => c.type_line?.toLowerCase().includes('land')).length,
      instants: bestDeck.filter(c => c.type_line?.toLowerCase().includes('instant')).length,
      sorceries: bestDeck.filter(c => c.type_line?.toLowerCase().includes('sorcery')).length,
      artifacts: bestDeck.filter(c => c.type_line?.toLowerCase().includes('artifact') && !c.type_line?.toLowerCase().includes('creature')).length,
      enchantments: bestDeck.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length,
      planeswalkers: bestDeck.filter(c => c.type_line?.toLowerCase().includes('planeswalker')).length
    };
    
    console.log(`Creatures: ${typeBreakdown.creatures}`);
    console.log(`Lands: ${typeBreakdown.lands}`);
    console.log(`Instants/Sorceries: ${typeBreakdown.instants + typeBreakdown.sorceries}`);
    
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

    return new Response(
      JSON.stringify({
        status: 'complete',
        result: {
          deck: bestDeck,
          analysis: {
            power: bestEdhPower || buildRequest.powerLevel,
            typeBreakdown,
            manaCurve,
            avgCmc,
            totalValue
          },
          changeLog: [
            `Built ${bestDeck.length}/99 cards (+ commander = 100)`,
            `Color identity: [${[...commanderColors].join(', ')}]`,
            `Creatures: ${typeBreakdown.creatures}`,
            `Lands: ${typeBreakdown.lands}`,
            `Total value: $${totalValue.toFixed(2)}`,
            `Iterations: ${iteration}`,
            bestValidation?.isValid ? '✓ All checks passed' : `Issues: ${bestValidation?.issues?.join(', ')}`
          ],
          validation: bestValidation || { isValid: false, issues: ['Build incomplete'] }
        },
        plan: deckPlan,
        edhPowerLevel: bestEdhPower,
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

// Check EDH power level via external service
async function checkEdhPower(supabaseUrl: string, supabaseKey: string, commander: any, deck: any[]): Promise<number | null> {
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
      const data = await response.json();
      return data?.powerLevel || null;
    }
  } catch (e) {
    console.log('EDH power check failed:', e);
  }
  return null;
}

// Validate deck meets requirements
function validateDeck(deck: any[], commander: any, targetPower: number, targetBudget: number, config: any) {
  const issues: string[] = [];
  
  // Card count
  if (deck.length !== 99) {
    issues.push(`Has ${deck.length} cards, needs 99`);
  }
  
  // Singleton check (excluding basic lands)
  const nonBasicNames = deck
    .filter(c => !BASIC_LANDS.includes(c.name))
    .map(c => c.name);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of nonBasicNames) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
  }
  if (duplicates.length > 0) {
    issues.push(`Duplicates: ${[...new Set(duplicates)].slice(0, 3).join(', ')}`);
  }
  
  // Color identity
  const commanderColors = new Set(commander.color_identity || []);
  const violations = deck.filter(card => {
    if (BASIC_LANDS.includes(card.name)) return false;
    const cardColors = card.color_identity || [];
    return cardColors.some((c: string) => !commanderColors.has(c));
  });
  if (violations.length > 0) {
    issues.push(`${violations.length} color identity violations`);
  }
  
  // Land count
  const landCount = deck.filter(c => c.type_line?.toLowerCase().includes('land')).length;
  if (landCount < config.minLandCount) {
    issues.push(`Only ${landCount} lands, need ${config.minLandCount}+`);
  }
  
  // Budget
  const totalCost = deck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0);
  const budgetMax = targetBudget * (1 + config.budgetTolerance);
  if (totalCost > budgetMax) {
    issues.push(`Cost $${totalCost.toFixed(0)} exceeds budget $${targetBudget}`);
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
          { role: 'system', content: 'You are an expert MTG Commander deck builder. Return valid JSON only, no markdown.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) return null;
    
    const data = await response.json();
    const text = data.choices[0].message.content;
    
    // Extract JSON
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
