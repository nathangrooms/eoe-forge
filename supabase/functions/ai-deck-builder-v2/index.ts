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
    
    console.log('='.repeat(80));
    console.log('AI DECK BUILDER V2 - STRICT COMMANDER RULES');
    console.log('='.repeat(80));
    console.log('Commander:', buildRequest.commander.name);
    console.log('Color Identity:', [...commanderColors].join(', ') || 'Colorless');
    console.log('Archetype:', buildRequest.archetype);
    console.log('Power Level:', buildRequest.powerLevel);
    console.log('Budget:', buildRequest.budget || 'unlimited');
    console.log('='.repeat(80));

    // Phase 1: AI Planning with enhanced prompts
    let deckPlan: DeckPlan | null = null;
    
    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      console.log('\n📋 Phase 1: AI Strategy Planning...');
      deckPlan = await generateDeckPlan(buildRequest, lovableApiKey, config);
      if (deckPlan) {
        console.log('✓ Strategy:', deckPlan.strategy?.substring(0, 100) + '...');
        console.log('✓ Key Cards:', deckPlan.keyCards?.length || 0);
        console.log('✓ Win Conditions:', deckPlan.winConditions?.join(', ') || 'N/A');
      }
    }

    // Phase 2: Fetch card pool - STRICT COLOR IDENTITY FILTER
    console.log('\n📦 Phase 2: Fetching card pool with STRICT color identity filter...');
    const { data: allCards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .eq('legalities->>commander', 'legal');

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    if (!allCards || allCards.length === 0) throw new Error('No legal cards found');
    
    console.log(`Total legal cards: ${allCards.length}`);
    
    // STRICT color identity filter - card's color identity must be subset of commander's
    const colorFilteredCards = allCards.filter(card => {
      const cardIdentity = card.color_identity || [];
      // Every color in card's identity must be in commander's identity
      const isValid = cardIdentity.every((c: string) => commanderColors.has(c));
      return isValid;
    });
    
    console.log(`After color filter: ${colorFilteredCards.length} cards`);

    // Phase 3: Build deck with iterative refinement
    console.log('\n🔄 Phase 3: Building deck with iterative refinement...');
    
    let bestDeck: any[] = [];
    let bestValidation: any = null;
    let iteration = 0;
    const usedCardNames = new Set<string>();
    
    while (iteration < config.maxBuildIterations) {
      iteration++;
      console.log(`\n--- Iteration ${iteration}/${config.maxBuildIterations} ---`);
      
      usedCardNames.clear();
      const deck: any[] = [];
      
      // Build deck in phases with singleton enforcement
      const addCards = (cards: any[], count: number, phase: string): any[] => {
        const added: any[] = [];
        for (const card of cards) {
          if (added.length >= count) break;
          // Check singleton (basic lands exempt)
          const isBasic = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(card.name);
          if (!isBasic && usedCardNames.has(card.name)) continue;
          
          added.push(card);
          if (!isBasic) usedCardNames.add(card.name);
        }
        console.log(`  ${phase}: Added ${added.length}/${count}`);
        return added;
      };

      // Score cards for sorting
      const scoreCard = (card: any, isPriority: boolean = false): number => {
        let score = 0;
        const text = (card.oracle_text || '').toLowerCase();
        const price = parseFloat(card.prices?.usd || '0');
        
        // Price bonus (higher price often = better card)
        score += Math.min(price * 0.5, 10);
        
        // Rarity bonus
        if (card.rarity === 'mythic') score += 4;
        if (card.rarity === 'rare') score += 2;
        
        // Synergy with commander
        const cmdrText = (buildRequest.commander.oracle_text || '').toLowerCase();
        if (cmdrText.includes('token') && text.includes('token')) score += 3;
        if (cmdrText.includes('counter') && text.includes('counter')) score += 3;
        if (cmdrText.includes('sacrifice') && text.includes('sacrifice')) score += 3;
        if (cmdrText.includes('graveyard') && text.includes('graveyard')) score += 3;
        
        // Priority cards from AI plan
        if (isPriority) score += 20;
        
        // EDH staples
        if (/sol ring|mana crypt|rhystic study|cyclonic rift|demonic tutor/i.test(card.name)) {
          score += 15;
        }
        
        return score;
      };

      // Check if card has specific role
      const hasRole = (card: any, role: string): boolean => {
        const text = (card.oracle_text || '').toLowerCase();
        const type = (card.type_line || '').toLowerCase();
        
        switch (role) {
          case 'ramp':
            if (text.includes('add') && text.includes('mana')) return true;
            if (text.includes('search') && text.includes('land') && text.includes('battlefield')) return true;
            return false;
          case 'draw':
            return text.includes('draw') && text.includes('card');
          case 'removal-spot':
            return text.includes('destroy target') || text.includes('exile target');
          case 'removal-sweeper':
            return text.includes('destroy all') || text.includes('exile all');
          case 'counterspell':
            return text.includes('counter target spell');
          case 'protection':
            return text.includes('hexproof') || text.includes('indestructible') || text.includes('protection from');
          case 'land':
            return type.includes('land');
          default:
            return false;
        }
      };

      // Phase A: Prioritize AI-recommended key cards
      if (deckPlan?.keyCards) {
        const keyCardMatches = colorFilteredCards
          .filter(c => deckPlan!.keyCards.some(kc => 
            c.name.toLowerCase().includes(kc.toLowerCase()) || 
            kc.toLowerCase().includes(c.name.toLowerCase())
          ))
          .sort((a, b) => scoreCard(b, true) - scoreCard(a, true));
        
        const keyCards = addCards(keyCardMatches, Math.min(15, deckPlan.keyCards.length), 'Key Cards');
        deck.push(...keyCards);
      }

      // Phase B: Ramp (10-14)
      const rampCount = deckPlan?.cardQuotas?.ramp?.min || 10;
      const rampCards = addCards(
        colorFilteredCards
          .filter(c => hasRole(c, 'ramp') && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a)),
        rampCount,
        'Ramp'
      );
      deck.push(...rampCards);

      // Phase C: Card Draw (10-15)
      const drawCount = deckPlan?.cardQuotas?.card_draw?.min || 10;
      const drawCards = addCards(
        colorFilteredCards
          .filter(c => hasRole(c, 'draw') && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a)),
        drawCount,
        'Card Draw'
      );
      deck.push(...drawCards);

      // Phase D: Removal (8-12 spot + 2-4 sweepers)
      const spotRemovalCount = deckPlan?.cardQuotas?.spot_removal?.min || 8;
      const spotRemoval = addCards(
        colorFilteredCards
          .filter(c => hasRole(c, 'removal-spot') && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a)),
        spotRemovalCount,
        'Spot Removal'
      );
      deck.push(...spotRemoval);

      const sweeperCount = deckPlan?.cardQuotas?.board_wipes?.min || 3;
      const sweepers = addCards(
        colorFilteredCards
          .filter(c => hasRole(c, 'removal-sweeper') && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a)),
        sweeperCount,
        'Board Wipes'
      );
      deck.push(...sweepers);

      // Phase E: Counterspells (if blue)
      if (commanderColors.has('U')) {
        const counterCount = deckPlan?.cardQuotas?.counterspells?.min || 4;
        const counters = addCards(
          colorFilteredCards
            .filter(c => hasRole(c, 'counterspell') && !usedCardNames.has(c.name))
            .sort((a, b) => scoreCard(b) - scoreCard(a)),
          counterCount,
          'Counterspells'
        );
        deck.push(...counters);
      }

      // Phase F: Protection
      const protectionCount = deckPlan?.cardQuotas?.protection?.min || 4;
      const protection = addCards(
        colorFilteredCards
          .filter(c => hasRole(c, 'protection') && !usedCardNames.has(c.name))
          .sort((a, b) => scoreCard(b) - scoreCard(a)),
        protectionCount,
        'Protection'
      );
      deck.push(...protection);

      // Phase G: Creatures by mana curve
      const creaturesByMV: Record<number, any[]> = {};
      colorFilteredCards
        .filter(c => c.type_line?.includes('Creature') && !usedCardNames.has(c.name))
        .forEach(c => {
          const mv = Math.floor(c.cmc || 0);
          if (!creaturesByMV[mv]) creaturesByMV[mv] = [];
          creaturesByMV[mv].push(c);
        });

      const creatureCurve = [
        { mv: 1, count: 3 },
        { mv: 2, count: 7 },
        { mv: 3, count: 8 },
        { mv: 4, count: 6 },
        { mv: 5, count: 4 },
        { mv: 6, count: 2 }
      ];

      for (const { mv, count } of creatureCurve) {
        const creatures = addCards(
          (creaturesByMV[mv] || []).sort((a, b) => scoreCard(b) - scoreCard(a)),
          count,
          `Creatures (CMC ${mv})`
        );
        deck.push(...creatures);
      }

      // Phase H: Non-creature spells to fill
      const nonLandNonCreatureTarget = 63; // 99 - 36 lands
      const currentNonLand = deck.length;
      const fillersNeeded = nonLandNonCreatureTarget - currentNonLand;
      
      if (fillersNeeded > 0) {
        const fillers = addCards(
          colorFilteredCards
            .filter(c => !c.type_line?.includes('Land') && !usedCardNames.has(c.name))
            .sort((a, b) => scoreCard(b) - scoreCard(a)),
          fillersNeeded,
          'Synergy Fillers'
        );
        deck.push(...fillers);
      }

      // Phase I: Lands (exactly enough to reach 99)
      const landTarget = 99 - deck.length;
      console.log(`  Need ${landTarget} lands to reach 99 cards`);
      
      const lands = buildManabase(colorFilteredCards, buildRequest.commander, deck, usedCardNames, landTarget);
      deck.push(...lands);
      console.log(`  Lands: Added ${lands.length}/${landTarget}`);

      // FINAL PAD: If still under 99, add basic lands
      while (deck.length < 99) {
        const colors = [...commanderColors];
        const color = colors[deck.length % colors.length] || 'W';
        const basicName = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' }[color] || 'Plains';
        const basic = colorFilteredCards.find(c => c.name === basicName);
        if (basic) {
          deck.push({ ...basic, id: `${basic.id}-pad-${deck.length}` });
        } else {
          break;
        }
      }

      console.log(`Built deck: ${deck.length} cards`);

      // Validate
      const validation = validateDeck(deck, buildRequest.commander, buildRequest.powerLevel, buildRequest.budget || 500, config);
      
      console.log(`Validation: ${validation.isValid ? '✓ PASS' : '✗ FAIL'}`);
      if (validation.issues.length > 0) {
        console.log('Issues:', validation.issues.slice(0, 3).join('; '));
      }

      // Store best result
      if (!bestDeck.length || validation.issues.length < (bestValidation?.issues?.length || 999)) {
        bestDeck = deck;
        bestValidation = validation;
      }

      if (validation.isValid || iteration >= config.maxBuildIterations) {
        break;
      }
    }

    console.log(`\n🏁 Build complete after ${iteration} iteration(s)`);
    console.log(`Final deck: ${bestDeck.length} cards`);
    console.log(`Issues: ${bestValidation?.issues?.length || 0}`);

    // Check EDH power level
    let edhPowerLevel: number | null = null;
    let edhPowerUrl: string | null = null;
    
    try {
      console.log('\n📊 Checking EDH power level...');
      const powerCheckResponse = await fetch(`${supabaseUrl}/functions/v1/edh-power-check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decklist: {
            commander: buildRequest.commander,
            cards: bestDeck
          }
        })
      });
      
      if (powerCheckResponse.ok) {
        const powerData = await powerCheckResponse.json();
        edhPowerLevel = powerData?.powerLevel;
        edhPowerUrl = powerData?.url;
        console.log(`EDH Power Level: ${edhPowerLevel || 'N/A'}`);
      }
    } catch (e) {
      console.log('EDH power check skipped');
    }

    // Calculate deck value
    const totalValue = bestDeck.reduce((sum, card) => {
      const price = parseFloat(card.prices?.usd || '0');
      return sum + price;
    }, 0);

    // Calculate type breakdown
    const typeBreakdown = {
      creatures: bestDeck.filter(c => c.type_line?.toLowerCase().includes('creature')).length,
      lands: bestDeck.filter(c => c.type_line?.toLowerCase().includes('land')).length,
      instants: bestDeck.filter(c => c.type_line?.toLowerCase().includes('instant')).length,
      sorceries: bestDeck.filter(c => c.type_line?.toLowerCase().includes('sorcery')).length,
      artifacts: bestDeck.filter(c => c.type_line?.toLowerCase().includes('artifact') && !c.type_line?.toLowerCase().includes('creature')).length,
      enchantments: bestDeck.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length,
      planeswalkers: bestDeck.filter(c => c.type_line?.toLowerCase().includes('planeswalker')).length
    };

    // Calculate mana curve
    const manaCurve: Record<string, number> = {};
    bestDeck.filter(c => !c.type_line?.includes('Land')).forEach(c => {
      const mv = Math.floor(c.cmc || 0);
      const key = mv >= 7 ? '7+' : mv.toString();
      manaCurve[key] = (manaCurve[key] || 0) + 1;
    });

    const avgCmc = bestDeck.filter(c => !c.type_line?.includes('Land'))
      .reduce((sum, c) => sum + (c.cmc || 0), 0) / 
      Math.max(1, bestDeck.filter(c => !c.type_line?.includes('Land')).length);

    // Return result
    const finalResult = {
      status: 'complete',
      result: {
        deck: bestDeck,
        analysis: {
          power: edhPowerLevel || buildRequest.powerLevel,
          typeBreakdown,
          manaCurve,
          avgCmc,
          totalValue
        },
        changeLog: [
          'AI-guided Commander deck build with strict singleton enforcement',
          `Total cards: ${bestDeck.length}/99 (+ commander = 100)`,
          `Color identity: [${[...commanderColors].join(', ')}]`,
          `Creatures: ${typeBreakdown.creatures}`,
          `Lands: ${typeBreakdown.lands}`,
          `Instants/Sorceries: ${typeBreakdown.instants + typeBreakdown.sorceries}`,
          `Artifacts/Enchantments: ${typeBreakdown.artifacts + typeBreakdown.enchantments}`,
          `Iterations: ${iteration}`,
          bestValidation?.isValid ? '✓ All validation checks passed' : `Issues: ${bestValidation?.issues?.join(', ')}`
        ],
        validation: bestValidation || { isValid: false, issues: ['Build failed'] }
      },
      plan: deckPlan,
      edhPowerLevel,
      edhPowerUrl,
      iterations: iteration,
      config: {
        maxIterations: config.maxBuildIterations,
        powerTolerance: config.powerLevelTolerance,
        budgetTolerance: config.budgetTolerance
      }
    };
    
    return new Response(
      JSON.stringify(finalResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in ai-deck-builder-v2:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Build optimized manabase
function buildManabase(
  pool: any[],
  commander: any,
  deck: any[],
  usedNames: Set<string>,
  targetLands: number
): any[] {
  const lands: any[] = [];
  const identity = commander.color_identity || [];
  const landPool = pool.filter(c => c.type_line?.includes('Land'));
  
  // Calculate color requirements from deck
  const colorPips: Record<string, number> = {};
  for (const card of deck) {
    const cost = card.mana_cost || '';
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      const matches = cost.match(new RegExp(`{${color}}`, 'g'));
      colorPips[color] = (colorPips[color] || 0) + (matches?.length || 0);
    }
  }
  
  const sortedColors = identity.length > 0 
    ? [...identity].sort((a, b) => (colorPips[b] || 0) - (colorPips[a] || 0))
    : ['W'];

  const isBasicLand = (name: string) => ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(name);
  
  // Add utility lands (singleton)
  const utilityLands = landPool
    .filter(l => !isBasicLand(l.name) && !usedNames.has(l.name) && (l.oracle_text?.length || 0) > 10)
    .sort((a, b) => (parseFloat(b.prices?.usd || '0') - parseFloat(a.prices?.usd || '0')))
    .slice(0, Math.min(8, targetLands));
  
  for (const land of utilityLands) {
    if (lands.length >= targetLands) break;
    lands.push(land);
    usedNames.add(land.name);
  }

  // Add dual/fetch lands (singleton)
  const dualLands = landPool
    .filter(l => {
      if (usedNames.has(l.name)) return false;
      if (isBasicLand(l.name)) return false;
      const text = l.oracle_text || '';
      return text.match(/{[WUBRG]}/g)?.length >= 2;
    })
    .sort((a, b) => (parseFloat(b.prices?.usd || '0') - parseFloat(a.prices?.usd || '0')))
    .slice(0, Math.min(10, targetLands - lands.length));
  
  for (const land of dualLands) {
    if (lands.length >= targetLands) break;
    lands.push(land);
    usedNames.add(land.name);
  }

  // Fill with basics (can have duplicates)
  const basicsNeeded = targetLands - lands.length;
  const basicNames: Record<string, string> = {
    W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest'
  };
  
  for (let i = 0; i < basicsNeeded; i++) {
    const color = sortedColors[i % sortedColors.length];
    const basicName = basicNames[color] || 'Plains';
    const basic = landPool.find(l => l.name === basicName);
    if (basic) {
      lands.push({ ...basic, id: `${basic.id}-basic-${i}` });
    }
  }

  return lands;
}

// Validate deck
function validateDeck(deck: any[], commander: any, targetPower: number, targetBudget: number, config: any) {
  const issues: string[] = [];
  const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  
  // Check card count
  if (deck.length !== 99) {
    issues.push(`Deck has ${deck.length} cards, needs exactly 99`);
  }
  
  // Check singleton
  const nonBasicNames = deck.filter(c => !basicLands.includes(c.name)).map(c => c.name);
  const duplicates = nonBasicNames.filter((name, idx) => nonBasicNames.indexOf(name) !== idx);
  if (duplicates.length > 0) {
    issues.push(`Duplicate cards: ${[...new Set(duplicates)].slice(0, 3).join(', ')}`);
  }
  
  // Check color identity
  const commanderColors = new Set(commander.color_identity || []);
  const colorViolations = deck.filter(card => {
    const cardColors = card.color_identity || [];
    return cardColors.some((c: string) => !commanderColors.has(c));
  });
  if (colorViolations.length > 0) {
    issues.push(`${colorViolations.length} cards violate color identity`);
  }
  
  // Check land count
  const landCount = deck.filter(c => c.type_line?.toLowerCase().includes('land')).length;
  if (landCount < config.minLandCount) {
    issues.push(`Only ${landCount} lands, need ${config.minLandCount}+`);
  }
  
  // Check budget
  const totalCost = deck.reduce((sum, c) => sum + parseFloat(c.prices?.usd || '0'), 0);
  const budgetMax = targetBudget * (1 + config.budgetTolerance);
  if (totalCost > budgetMax) {
    issues.push(`Deck cost $${totalCost.toFixed(0)} exceeds budget $${targetBudget}`);
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    totalCost,
    landCount
  };
}

// Generate deck plan with AI
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
          { role: 'system', content: 'You are an expert MTG Commander deck architect. Respond with valid JSON only, no markdown code blocks.' },
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
