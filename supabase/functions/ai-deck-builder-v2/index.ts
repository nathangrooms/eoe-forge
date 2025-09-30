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
    
    console.log('AI Deck Builder V2 - Starting build for:', buildRequest.commander.name);
    console.log('Archetype:', buildRequest.archetype, 'Power Level:', buildRequest.powerLevel);
    console.log('AI Planning:', buildRequest.useAIPlanning !== false);

    // Phase 1: AI Planning with MTG Brain (if enabled)
    let deckPlan: DeckPlan | null = null;
    
    if (buildRequest.useAIPlanning !== false && lovableApiKey) {
      console.log('Phase 1: Consulting MTG Brain for deck strategy...');
      
      const planningPrompt = `You are an expert Magic: The Gathering deck builder specializing in Commander format. Analyze this commander and create a comprehensive, tournament-viable deck building plan.

Commander: ${buildRequest.commander.name}
Type: ${buildRequest.commander.type_line}
Colors: ${buildRequest.commander.color_identity.join(', ')}
Abilities: ${buildRequest.commander.oracle_text}

Target Archetype: ${buildRequest.archetype}
Target Power Level: ${buildRequest.powerLevel}/10

Create a strategic deck building plan following EDH best practices:

1. **Core Strategy**: Describe the optimal game plan and win conditions
2. **Card Quotas** (CRITICAL - follow EDH best practices):
   - Ramp: 10-14 cards (mana rocks, land ramp, dorks)
   - Card Draw: 10-15 cards (engines and cantrips)
   - Interaction: 10-15 total (spot removal + board wipes + counterspells)
   - Creatures: 20-30 cards (depends on strategy)
   - Synergy Pieces: 15-25 cards that directly support commander
   
3. **Key Cards**: List 10-15 specific high-impact cards that are essential
4. **Synergies**: Identify the most important mechanics to maximize
5. **Mana Curve**: Recommend the ideal curve (avoid too many 0-1 CMC cards)
6. **Common Pitfalls**: What mistakes to avoid with this commander

Format as JSON:
{
  "strategy": "detailed game plan",
  "keyCards": ["card 1", "card 2", ...],
  "cardQuotas": {
    "ramp": {"min": 10, "max": 14},
    "card_draw": {"min": 10, "max": 15},
    "spot_removal": {"min": 6, "max": 10},
    "board_wipes": {"min": 2, "max": 4},
    "counterspells": {"min": 4, "max": 8},
    "creatures": {"min": 20, "max": 30},
    "synergy_pieces": {"min": 15, "max": 25}
  },
  "synergies": ["synergy 1", "synergy 2"],
  "warnings": ["avoid X", "watch out for Y"],
  "recommendations": ["include Z", "prioritize W"],
  "manaCurve": {
    "avgCMC": 3.0,
    "distribution": "Balanced with focus on 2-4 CMC spells"
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
          
          console.log('AI planning response received');
          
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = planText.match(/```json\s*([\s\S]*?)\s*```/) || planText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            deckPlan = JSON.parse(jsonStr);
            console.log('AI Planning complete - Strategy:', deckPlan?.strategy?.substring(0, 100));
          }
        } else {
          console.error('AI planning request failed:', planResponse.status);
        }
      } catch (error) {
        console.error('AI planning error:', error);
        // Continue with build even if planning fails
      }
    }

    // Phase 2: Fetch card pool
    console.log('Phase 2: Fetching card pool...');
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .eq('legalities->>commander', 'legal');

    if (cardsError) throw new Error(`Failed to fetch cards: ${cardsError.message}`);
    if (!cards || cards.length === 0) throw new Error('No legal cards found');

    console.log(`Loaded ${cards.length} legal cards`);

    // Phase 3: Build with orchestrator
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
        if (buildRequest.useAIPlanning !== false && lovableApiKey) {
          console.log('Phase 4: Validating deck quality with MTG Brain...');
          
          const deckList = result.deck.map(c => c.name).join('\n');
          const validationPrompt = `Review this ${buildRequest.commander.name} Commander deck and provide a quality assessment:

Deck List (${result.deck.length} cards):
${deckList}

Evaluate:
1. Does it follow the ${buildRequest.archetype} strategy?
2. Are the card quotas appropriate (ramp, draw, interaction)?
3. Is the mana curve balanced?
4. Does it have clear win conditions?
5. Overall deck quality score (1-10)

Provide brief feedback on what's good and what needs improvement.`;

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
                  { role: 'system', content: 'You are a Magic: The Gathering deck analyst.' },
                  { role: 'user', content: validationPrompt }
                ],
                temperature: 0.5,
              }),
            });

            if (validationResponse.ok) {
              const validationData = await validationResponse.json();
              const feedback = validationData.choices[0].message.content;
              console.log('Deck validation feedback:', feedback);
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
