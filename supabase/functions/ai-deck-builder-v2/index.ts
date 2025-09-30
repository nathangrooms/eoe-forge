import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
  useAIPlanning?: boolean;
  runTests?: boolean; // Add test mode
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
    
    console.log('='.repeat(80));
    console.log('AI DECK BUILDER V2');
    console.log('='.repeat(80));
    console.log('Commander:', buildRequest.commander.name);
    console.log('Archetype:', buildRequest.archetype);
    console.log('Power Level:', buildRequest.powerLevel);
    console.log('AI Planning:', buildRequest.useAIPlanning !== false);
    console.log('Test Mode:', buildRequest.runTests || false);
    console.log('='.repeat(80));

    // Phase 1: AI Planning with MTG Brain (if enabled)
    let deckPlan: DeckPlan | null = null;
    
    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      console.log('Phase 1: Consulting MTG Brain for deck strategy...');
      
      const planningPrompt = `You are an expert Magic: The Gathering deck builder specializing in Commander format. Analyze this commander and create a comprehensive, tournament-viable deck building plan following EDH best practices.

Commander: ${buildRequest.commander.name}
Type: ${buildRequest.commander.type_line}
Colors: ${buildRequest.commander.color_identity.join(', ')}
Abilities: ${buildRequest.commander.oracle_text}

Target Archetype: ${buildRequest.archetype}
Target Power Level: ${buildRequest.powerLevel}/10

CRITICAL REQUIREMENTS FOR FUNCTIONAL COMMANDER DECKS:

**Core Deck Structure** (99 cards total):
- Lands: 36-40 (adjust based on curve and ramp)
- Ramp: 10-14 cards (mana rocks, land ramp, dorks)  
- Card Draw: 10-15 cards (engines and one-shots)
- Spot Removal: 6-10 cards (destroy/exile target permanent)
- Board Wipes: 2-4 cards (mass removal for emergencies)
- Protection: 3-6 cards (counterspells, indestructible, hexproof)
- Win Conditions: 3-5 clear paths to victory
- Synergy Pieces: 15-25 cards that directly support commander's strategy

**Mana Curve Guidelines:**
- Avoid too many 0-1 CMC cards (causes weak mid-game)
- Sweet spot: 2-4 CMC for most spells
- Average CMC: 2.8-3.5 for optimal gameplay
- High CMC spells (6+): Only if they win games or are essential synergy

**Commander-Specific Strategy:**
Analyze ${buildRequest.commander.name}'s abilities and determine:
1. What does this commander DO? (core mechanic)
2. What cards MAXIMIZE this ability? (best synergies)
3. How does this deck WIN? (specific win conditions)
4. What are the WEAKNESSES? (what to protect against)

**Key Cards Identification:**
List 10-15 specific high-impact cards that are ESSENTIAL for this strategy.
These should be cards that directly synergize with the commander or enable key combos.
Include their approximate CMC to ensure curve awareness.

**Common Pitfalls to Avoid:**
- Don't build "goodstuff" without synergy
- Don't ignore interaction (removal/counterspells)
- Don't have unclear win conditions
- Don't  build too low or too high on the curve
- Don't include cards that don't support the strategy

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "strategy": "2-3 sentence summary of optimal game plan and primary win condition",
  "keyCards": ["Card Name 1", "Card Name 2", ...],
  "cardQuotas": {
    "ramp": {"min": 10, "max": 14},
    "card_draw": {"min": 10, "max": 15},
    "spot_removal": {"min": 6, "max": 10},
    "board_wipes": {"min": 2, "max": 4},
    "counterspells": {"min": 0, "max": 8},
    "protection": {"min": 3, "max": 6},
    "creatures": {"min": 15, "max": 30},
    "synergy_pieces": {"min": 15, "max": 25}
  },
  "synergies": ["primary_synergy_1", "primary_synergy_2", "primary_synergy_3"],
  "winConditions": ["Win condition 1", "Win condition 2", "Win condition 3"],
  "warnings": ["Avoid X because Y", "Watch out for Z"],
  "recommendations": ["Include A for B reason", "Prioritize C"],
  "manaCurve": {
    "avgCMC": 3.0,
    "distribution": "Description of ideal curve",
    "landCount": 37
  }
}`;

      try {
        const planResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { 
                role: 'system', 
                content: 'You are an expert Magic: The Gathering deck builder. Provide strategic, actionable advice. Always respond with valid JSON only.' 
              },
              { role: 'user', content: planningPrompt }
            ],
          }),
        });

        if (planResponse.ok) {
          const planData = await planResponse.json();
          const planText = planData.choices[0].message.content;
          
          console.log('✓ AI planning response received');
          
          // Extract JSON from response (handle various formats)
          let jsonStr = planText.trim();
          
          // Remove markdown code blocks if present
          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1];
          }
          
          // Find JSON object if wrapped in text
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonStr = jsonMatch[0];
          }
          
          try {
            deckPlan = JSON.parse(jsonStr);
            console.log('✓ AI Planning complete');
            console.log('  Strategy:', deckPlan?.strategy?.substring(0, 100) + '...');
            console.log('  Key Cards:', deckPlan?.keyCards?.length || 0);
            console.log('  Synergies:', deckPlan?.synergies?.join(', ') || 'none');
          } catch (parseError) {
            console.error('Failed to parse AI plan:', parseError);
            console.error('Raw response:', planText.substring(0, 500));
          }
        } else {
          console.error('AI planning request failed:', planResponse.status);
        }
      } catch (error) {
        console.error('AI planning error:', error);
        // Continue with build even if planning fails
      }
    }

    // Handle test mode
    if (buildRequest.runTests) {
      console.log('\n🧪 TEST MODE ACTIVATED\n');
      
      const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .eq('legalities->>commander', 'legal');

      if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
      if (!cards || cards.length === 0) throw new Error('No legal cards found');

      const { DeckBuilderTester } = await import('./test-builder.ts');
      const testResults = await DeckBuilderTester.runTests(cards, lovableApiKey);
      
      return new Response(
        JSON.stringify({ status: 'tests_complete', results: testResults }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Phase 2: Fetch card pool
    console.log('\nPhase 2: Fetching card pool...');
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .eq('legalities->>commander', 'legal');

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    if (!cards || cards.length === 0) throw new Error('No legal cards found');

    console.log(`✓ Loaded ${cards.length} legal cards`);

    // Phase 3: Build with orchestrator
    console.log('\nPhase 3: Building deck with advanced algorithm...');
    const { BuilderOrchestrator } = await import('./builder-orchestrator.ts');
    
    const result = await BuilderOrchestrator.buildDeck(
      cards,
      {
        format: 'commander',
        themeId: buildRequest.archetype,
        powerTarget: buildRequest.powerLevel,
        identity: buildRequest.commander.color_identity,
        budget: 'med',
        seed: Date.now()
      },
      deckPlan
    );
    
    console.log(`✓ Deck built: ${result.deck.length} cards`);
    console.log(`✓ Validation: ${result.validation.isLegal ? 'LEGAL' : 'INVALID'}`);
    if (result.validation.warnings.length > 0) {
      console.log('⚠ Warnings:');
      result.validation.warnings.forEach((w: string) => console.log(`  - ${w}`));
    }

    // Save deck to database
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        const { data: deckData, error: deckError } = await supabase
          .from('user_decks')
          .insert({
            user_id: user.id,
            name: `${buildRequest.commander.name} - ${buildRequest.archetype}`,
            format: 'commander',
            colors: buildRequest.commander.color_identity,
            power_level: buildRequest.powerLevel,
            archetype: buildRequest.archetype,
            description: deckPlan?.strategy || `AI-built ${buildRequest.archetype} deck`,
          })
          .select()
          .single();

        if (!deckError && deckData) {
          const cardInserts = [
            {
              deck_id: deckData.id,
              card_id: buildRequest.commander.id,
              card_name: buildRequest.commander.name,
              quantity: 1,
              is_commander: true,
              is_sideboard: false
            },
            ...result.deck.map(card => ({
              deck_id: deckData.id,
              card_id: card.id,
              card_name: card.name,
              quantity: 1,
              is_commander: false,
              is_sideboard: false
            }))
          ];

          await supabase.from('deck_cards').insert(cardInserts);
          
          return new Response(
            JSON.stringify({ status: 'complete', deckId: deckData.id, result, plan: deckPlan }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

        // Phase 4: Post-build validation with MTG Brain
        console.log('\nPhase 4: Validating deck quality with MTG Brain...');
        
        if (buildRequest.useAIPlanning !== false && lovableApiKey) {
          const deckList = result.deck.map(c => c.name).join('\n');
          
          // Count key metrics for validation
          const rampCount = result.deck.filter((c: any) => c.tags?.has('ramp')).length;
          const drawCount = result.deck.filter((c: any) => c.tags?.has('draw')).length;
          const removalCount = result.deck.filter((c: any) => 
            c.tags?.has('removal-spot') || c.tags?.has('removal-sweeper')
          ).length;
          const avgCMC = result.deck.reduce((sum: number, c: any) => sum + (c.cmc || 0), 0) / result.deck.length;
          
          const validationPrompt = `You are a professional Magic: The Gathering deck analyst. Review this ${buildRequest.commander.name} Commander deck critically.

**Deck Metrics:**
- Total cards: ${result.deck.length}
- Ramp: ${rampCount} cards
- Card Draw: ${drawCount} cards  
- Removal: ${removalCount} cards
- Average CMC: ${avgCMC.toFixed(2)}

**Deck List:**
${deckList}

**Analysis Required:**
1. Does it properly execute the ${buildRequest.archetype} strategy?
2. Are the card quotas optimal for Commander? (Should have 10-14 ramp, 10-15 draw, 10-15 interaction)
3. Is the mana curve appropriate? (Should average 2.8-3.5 CMC)
4. Does it have clear, achievable win conditions?
5. Quality score (1-10) and ONE key improvement needed

Be BRUTALLY HONEST. If the deck is bad, say so and explain why. Maximum 250 words.`;

          try {
            const validationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lovableApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  { 
                    role: 'system', 
                    content: 'You are an expert Magic: The Gathering deck analyst. Be critical, precise, and constructive. Focus on actual gameplay viability.' 
                  },
                  { role: 'user', content: validationPrompt }
                ],
                temperature: 0.3,
              }),
            });

            if (validationResponse.ok) {
              const validationData = await validationResponse.json();
              const feedback = validationData.choices[0].message.content;
              console.log('\n' + '='.repeat(80));
              console.log('MTG BRAIN DECK ANALYSIS');
              console.log('='.repeat(80));
              console.log(feedback);
              console.log('='.repeat(80) + '\n');
              
              // Store feedback in result
              result.aiFeedback = feedback;
            }
          } catch (error) {
            console.error('Validation failed:', error);
          }
        }

    
    return new Response(
      JSON.stringify({ status: 'complete', result, plan: deckPlan }),
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
