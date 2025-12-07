import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getAdminConfig, DEFAULT_CONFIG } from './admin-config.ts';
import { DeckValidator } from './deck-validator.ts';

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
  runTests?: boolean;
}

interface DeckPlan {
  strategy: string;
  keyCards: string[];
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
    
    console.log('='.repeat(80));
    console.log('AI DECK BUILDER V2 - ITERATIVE BUILD');
    console.log('='.repeat(80));
    console.log('Commander:', buildRequest.commander.name);
    console.log('Archetype:', buildRequest.archetype);
    console.log('Power Level:', buildRequest.powerLevel);
    console.log('Budget:', buildRequest.budget || 'unlimited');
    console.log('Max Iterations:', config.maxBuildIterations);
    console.log('Power Tolerance:', `±${config.powerLevelTolerance}`);
    console.log('Budget Tolerance:', `${config.budgetTolerance * 100}%`);
    console.log('='.repeat(80));

    // Phase 1: AI Planning
    let deckPlan: DeckPlan | null = null;
    
    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      console.log('\n📋 Phase 1: AI Strategy Planning...');
      deckPlan = await generateDeckPlan(buildRequest, lovableApiKey);
      if (deckPlan) {
        console.log('✓ Strategy:', deckPlan.strategy?.substring(0, 100) + '...');
        console.log('✓ Key Cards:', deckPlan.keyCards?.length || 0);
      }
    }

    // Phase 2: Fetch card pool
    console.log('\n📦 Phase 2: Fetching card pool...');
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .eq('legalities->>commander', 'legal');

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    if (!cards || cards.length === 0) throw new Error('No legal cards found');
    console.log(`✓ Loaded ${cards.length} legal cards`);

    // Phase 3: Iterative Build Process
    console.log('\n🔄 Phase 3: Iterative Build Process...');
    
    const { BuilderOrchestrator } = await import('./builder-orchestrator.ts');
    
    let bestResult: any = null;
    let bestValidation: any = null;
    let iteration = 0;
    let excludeCards: Set<string> = new Set();
    
    while (iteration < config.maxBuildIterations) {
      iteration++;
      console.log(`\n--- Iteration ${iteration}/${config.maxBuildIterations} ---`);
      
      // Filter out excluded cards for this iteration
      const availableCards = cards.filter(c => !excludeCards.has(c.name));
      
      // Build deck
      const result = await BuilderOrchestrator.buildDeck(
        availableCards,
        {
          format: 'commander',
          themeId: buildRequest.archetype,
          powerTarget: buildRequest.powerLevel,
          identity: buildRequest.commander.color_identity,
          budget: buildRequest.budget ? 
            (buildRequest.budget < 200 ? 'low' : buildRequest.budget < 500 ? 'med' : 'high') : 
            'med',
          seed: Date.now() + iteration
        },
        deckPlan
      );
      
      console.log(`Built deck: ${result.deck.length} cards`);
      
      // Check EDH power level
      let edhPowerLevel: number | null = null;
      try {
        const powerCheckResponse = await checkEdhPower(result.deck, buildRequest.commander, supabaseUrl, supabaseKey);
        edhPowerLevel = powerCheckResponse?.powerLevel || null;
        console.log(`EDH Power Level: ${edhPowerLevel || 'N/A'}`);
      } catch (e) {
        console.log('EDH power check skipped:', e);
      }
      
      // Validate deck
      const validation = DeckValidator.validate(
        result.deck,
        buildRequest.commander,
        buildRequest.powerLevel,
        buildRequest.budget || 500,
        config,
        edhPowerLevel
      );
      
      console.log(`Validation: ${validation.isValid ? '✓ PASS' : '✗ FAIL'}`);
      if (validation.issues.length > 0) {
        console.log('Issues:', validation.issues.join('; '));
      }
      
      // Store best result
      if (!bestResult || validation.issues.length < (bestValidation?.issues?.length || 999)) {
        bestResult = { ...result, edhPowerLevel };
        bestValidation = validation;
      }
      
      // If valid, we're done!
      if (validation.isValid) {
        console.log('✓ Deck meets all requirements!');
        break;
      }
      
      // If not valid and more iterations, get cards to replace
      if (iteration < config.maxBuildIterations) {
        const cardsToReplace = DeckValidator.getCardsToReplace(
          result.deck,
          validation,
          buildRequest.budget || 500
        );
        
        // Add to exclude list for next iteration
        for (const card of cardsToReplace) {
          excludeCards.add(card.name);
        }
        console.log(`Excluding ${cardsToReplace.length} cards for next iteration`);
      }
    }
    
    console.log(`\n🏁 Build complete after ${iteration} iteration(s)`);
    console.log(`Final validation: ${bestValidation?.issues?.length || 0} issues`);

    // Phase 4: AI Validation (optional)
    if (config.useAIValidation && lovableApiKey && bestResult) {
      console.log('\n🧠 Phase 4: AI Quality Check...');
      const aiFeedback = await getAIValidation(bestResult, buildRequest, lovableApiKey);
      bestResult.aiFeedback = aiFeedback;
    }

    // Return result (don't auto-save - let frontend handle it)
    const finalResult = {
      status: 'complete',
      result: {
        deck: bestResult?.deck || [],
        analysis: bestResult?.analysis || {},
        changeLog: bestResult?.changeLog || [],
        aiFeedback: bestResult?.aiFeedback,
        validation: bestValidation || { isValid: false, issues: ['Build failed'] }
      },
      plan: deckPlan,
      edhPowerLevel: bestResult?.edhPowerLevel,
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

// Helper: Generate deck plan with AI
async function generateDeckPlan(buildRequest: BuildRequest, apiKey: string): Promise<DeckPlan | null> {
  const planningPrompt = `You are a world-class Magic: The Gathering deck architect. Create a strategically coherent deck building blueprint.

## COMMANDER
**Name:** ${buildRequest.commander.name}
**Type:** ${buildRequest.commander.type_line}
**Colors:** ${buildRequest.commander.color_identity.join(', ')}
**Abilities:** ${buildRequest.commander.oracle_text}

## PARAMETERS
**Archetype:** ${buildRequest.archetype}
**Power Level:** ${buildRequest.powerLevel}/10
- 1-3: Casual (win turn 12+)
- 4-6: Focused (win turn 9-11)  
- 7-8: High Power (win turn 6-8)
- 9-10: cEDH (win turn 3-5)

## OUTPUT (JSON only, no markdown):
{
  "strategy": "2-3 sentence gameplan summary",
  "keyCards": ["Card Name 1", "Card Name 2", ...10-15 must-include cards],
  "cardQuotas": {
    "ramp": {"min": 10, "max": 14},
    "card_draw": {"min": 10, "max": 15},
    "spot_removal": {"min": 6, "max": 10},
    "board_wipes": {"min": 2, "max": 4}
  },
  "synergies": ["key_synergy_1", "key_synergy_2"],
  "warnings": ["Weakness to watch for"],
  "recommendations": ["Specific advice"]
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Expert MTG deck builder. Respond with valid JSON only, no markdown.' },
          { role: 'user', content: planningPrompt }
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

// Helper: Check EDH power level
async function checkEdhPower(deck: any[], commander: any, supabaseUrl: string, supabaseKey: string): Promise<any> {
  try {
    // Build decklist for EDH power check
    const decklist = {
      commander: commander,
      cards: deck
    };
    
    const response = await fetch(`${supabaseUrl}/functions/v1/edh-power-check`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ decklist })
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

// Helper: Get AI validation feedback
async function getAIValidation(result: any, buildRequest: BuildRequest, apiKey: string): Promise<string | null> {
  try {
    const rampCount = result.deck.filter((c: any) => {
      const text = (c.oracle_text || '').toLowerCase();
      return text.includes('add') && text.includes('mana') || text.includes('search') && text.includes('land');
    }).length;
    
    const drawCount = result.deck.filter((c: any) => {
      const text = (c.oracle_text || '').toLowerCase();
      return text.includes('draw') && text.includes('card');
    }).length;
    
    const avgCMC = result.deck.reduce((sum: number, c: any) => sum + (c.cmc || 0), 0) / result.deck.length;
    
    const validationPrompt = `Review ${buildRequest.commander.name} ${buildRequest.archetype} deck.

Metrics: ${result.deck.length} cards | Ramp: ${rampCount} | Draw: ${drawCount} | Avg CMC: ${avgCMC.toFixed(2)}
Power Target: ${buildRequest.powerLevel}/10 | EDH Power: ${result.edhPowerLevel || 'N/A'}

Give a 2-3 sentence quality assessment. Be honest - is this a good deck for the archetype? What's the biggest improvement needed?`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'MTG deck analyst. Brief, critical, constructive.' },
          { role: 'user', content: validationPrompt }
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    return null;
  }
}
