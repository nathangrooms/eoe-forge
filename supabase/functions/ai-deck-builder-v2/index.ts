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
      
      console.log('Phase 1: Consulting MTG Brain for deck strategy...');
      
      const planningPrompt = `You are a world-class Magic: The Gathering deck architect with deep expertise in Commander format. Your task is to create a mathematically sound, strategically coherent deck building blueprint for tournament-viable play.

## COMMANDER ANALYSIS
**Name:** ${buildRequest.commander.name}
**Type:** ${buildRequest.commander.type_line}
**Colors:** ${buildRequest.commander.color_identity.join(', ')}
**Abilities:** ${buildRequest.commander.oracle_text}

## DECK PARAMETERS
**Target Archetype:** ${buildRequest.archetype}
**Power Level:** ${buildRequest.powerLevel}/10
- 1-3: Precon/Casual (unoptimized, theme-first, win turn 12+)
- 4-6: Focused/Optimized (good mana, some tutors, win turn 9-11)
- 7-8: High Power (excellent mana, compact combos, win turn 6-8)
- 9-10: cEDH (perfect mana, all tutors, win turn 3-5)

## STRATEGIC FRAMEWORK

### Step 1: Commander Win Condition Identification
**Analyze the commander's text to identify:**
1. **Primary Mechanic:** What does this commander DO? (e.g., draw cards, make tokens, deal damage, tutor, ramp)
2. **Scaling Factor:** How does it snowball? (per creature, per spell cast, per land drop, per mana spent)
3. **Natural Win Paths:** What are the 2-3 most efficient ways this commander closes games?
4. **Enabler Requirements:** What MUST be in play for this commander to function? (e.g., creatures for Edric, artifacts for Jhoira, spells for Kalamax)

### Step 2: Archetype-Specific Construction Blueprint
**Match the archetype to these proven patterns:**

**VOLTRON (Power 7-8):**
- Win via 21 commander damage with equipment/auras
- QUOTAS: 12-15 equipment/auras, 8-10 protection spells, 6-8 evasion enablers
- KEY CARDS: Colossus Hammer, Swiftfoot Boots, Teferi's Protection, Deflecting Swat
- CURVE: Low (2.5-3.0 avg CMC) - need to deploy commander early and protect
- MANA: 34-36 lands, 10-12 ramp (prioritize artifact ramp for redundancy)

**ARISTOCRATS (Power 7-9):**
- Win via death triggers + infinite sacrifice loops
- QUOTAS: 4-6 Blood Artist effects, 4-6 free sac outlets, 10-15 token generators, 3-5 combo pieces
- KEY CARDS: Blood Artist, Zulaport Cutthroat, Ashnod's Altar, Phyrexian Altar, Bitterblossom
- COMBOS: Mikaeus + Triskelion, Persist creature + sac outlet + Blood Artist
- CURVE: Medium (3.0-3.5 avg CMC) - need engine pieces online by turn 4-5
- MANA: 35-37 lands, 10-12 ramp

**SPELLSLINGER (Power 7-8):**
- Win via storm count, copy effects, or commander damage from spell triggers
- QUOTAS: 25-35 instants/sorceries, 6-8 cost reduction, 4-6 copy effects, 3-5 recursion
- KEY CARDS: Thousand-Year Storm, Arcane Denial, Counterspell, Snapcaster Mage, Underworld Breach
- CURVE: Low-Med (2.8-3.3 avg CMC) - need to cast multiple spells per turn
- MANA: 34-36 lands, 12-14 ramp (emphasize ritual effects)

**COMBO (Power 9-10, cEDH):**
- Win via 2-3 card infinite loops by turn 3-5
- QUOTAS: 8-12 tutors, 6-10 counterspells, 10-15 fast mana, 2-4 compact combos
- KEY CARDS: Demonic Tutor, Vampiric Tutor, Mana Crypt, Force of Will, Pact of Negation
- COMBOS: Thassa's Oracle + Demonic Consultation, Dramatic Reversal + Isochron Scepter
- CURVE: Very Low (2.0-2.5 avg CMC) - every card must be hyper-efficient
- MANA: 28-32 lands, 15-20 fast mana/ramp

**STAX (Power 8-10):**
- Win via resource lock + slow incremental advantage
- QUOTAS: 12-18 stax pieces (tax, lock, denial), 8-12 asymmetric effects, 3-5 win conditions
- KEY CARDS: Winter Orb, Static Orb, Rule of Law, Aven Mindcensor, Cursed Totem
- CURVE: Low (2.5-3.0 avg CMC) - deploy locks early
- MANA: 30-34 lands, 12-16 fast mana (need to break parity)

**LANDFALL/RAMP (Power 6-8):**
- Win via landfall triggers + big mana payoffs
- QUOTAS: 10-15 extra land drops, 8-12 land recursion, 6-10 landfall payoffs, 5-8 big finishers
- KEY CARDS: Azusa, Oracle of Mul Daya, Crucible of Worlds, Avenger of Zendikar, Scute Swarm
- CURVE: Medium-High (3.5-4.0 avg CMC) - can support high curve with ramp
- MANA: 38-42 lands, 8-12 ramp

### Step 3: Critical Card Quotas (NON-NEGOTIABLE for functional decks)
**These quotas ensure the deck actually works:**

**RAMP (10-14 pieces):**
- Tier S: Sol Ring, Mana Crypt, Arcane Signet, Fellwar Stone
- Tier A: Nature's Lore, Three Visits, Farseek (green), Talismans, Signets
- Tier B: Cultivate, Kodama's Reach, Commander's Sphere
- TARGET: Turn 1-2 ramp to accelerate commander deployment

**CARD DRAW (10-15 engines):**
- Tier S: Rhystic Study, Mystic Remora, Esper Sentinel, Trouble in Pairs
- Tier A: Phyrexian Arena, Sylvan Library, Guardian Project, Greed
- Tier B: Harmonize, Night's Whisper, Sign in Blood
- TARGET: Draw 2+ cards per turn cycle by mid-game

**REMOVAL (10-15 total: 6-10 spot, 2-4 board wipes):**
- Spot (Tier S): Swords to Plowshares, Path to Exile, Beast Within, Chaos Warp
- Spot (Tier A): Generous Gift, Assassin's Trophy, Anguished Unmaking
- Wipes (Tier S): Cyclonic Rift, Toxic Deluge, Blasphemous Act, Damnation
- Wipes (Tier A): Wrath of God, Supreme Verdict, Delayed Blast Fireball
- TARGET: Answer any threat at instant speed, reset board when behind

**PROTECTION (3-6 pieces):**
- Tier S: Teferi's Protection, Flawless Maneuver, Heroic Intervention, Deflecting Swat
- Tier A: Counterspell, Arcane Denial, Boros Charm, Imp's Mischief
- TARGET: Protect combo turn or commander from removal

### Step 4: Mana Curve Construction
**Build curve to match archetype speed:**
- Aggro/Voltron: Peak at 2-3 CMC, avg 2.5-3.0
- Midrange/Value: Peak at 3-4 CMC, avg 3.0-3.5  
- Control/Combo: Peak at 2 CMC (interaction), avg 2.5-3.0
- Ramp/Big: Peak at 3-4 CMC, avg 3.5-4.0

**Avoid These Common Mistakes:**
- Too many 6+ CMC cards (causes clunky hands, slow starts)
- Too few 1-2 CMC cards (no early plays, fall behind)
- Uneven distribution (e.g., nothing at 3 CMC, then 10 cards at 5 CMC)

### Step 5: Synergy Web Construction
**Identify 10-15 "must-include" cards that directly enable the strategy:**
- List specific card names (not "add card draw" → "Rhystic Study, Mystic Remora")
- Include CMC for each card
- Explain HOW each card synergizes with the commander
- Categorize: Enablers (make commander work), Payoffs (win with commander), Protection (keep commander alive)

### Step 6: Win Condition Clarity
**Define 3-5 explicit ways this deck wins:**
- Primary Win: [Most common path, e.g., "Commander damage via Voltron"]
- Secondary Win: [Backup plan, e.g., "Combat damage from pumped tokens"]
- Combo Win: [If applicable, e.g., "Infinite mana → Ballista for lethal"]
- Value Win: [Grind plan, e.g., "Outvalue via card advantage engines"]

## OUTPUT FORMAT (STRICT JSON)
Respond with ONLY valid JSON (no markdown, no code blocks, no explanations):

{
  "strategy": "2-3 sentence summary of optimal gameplan and primary win condition",
  "keyCards": ["Card Name 1 (CMC)", "Card Name 2 (CMC)", ...10-15 cards],
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
  "warnings": ["Avoid X because Y", "Watch out for Z weakness"],
  "recommendations": ["Include A for B reason", "Prioritize C over D"],
  "manaCurve": {
    "avgCMC": 3.0,
    "distribution": "Front-loaded curve peaking at 2-3 CMC for early tempo",
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

        // Phase 4: Post-build validation with MTG Brain (optimized)
        console.log('\nPhase 4: Quick quality check...');
        
        if (buildRequest.useAIPlanning !== false && lovableApiKey) {
          // Count key metrics for validation
          const rampCount = result.deck.filter((c: any) => c.tags?.has('ramp')).length;
          const drawCount = result.deck.filter((c: any) => c.tags?.has('draw')).length;
          const removalCount = result.deck.filter((c: any) => 
            c.tags?.has('removal-spot') || c.tags?.has('removal-sweeper')
          ).length;
          const avgCMC = result.deck.reduce((sum: number, c: any) => sum + (c.cmc || 0), 0) / result.deck.length;
          
          // OPTIMIZED: Send only stats and top cards, not full deck list
          const topCards = result.deck
            .sort((a: any, b: any) => (b.cmc || 0) - (a.cmc || 0))
            .slice(0, 15)
            .map((c: any) => c.name)
            .join(', ');
          
          const validationPrompt = `Review ${buildRequest.commander.name} ${buildRequest.archetype} deck.

**Metrics:**
- Cards: ${result.deck.length} | Ramp: ${rampCount} | Draw: ${drawCount} | Removal: ${removalCount}
- Avg CMC: ${avgCMC.toFixed(2)} | Power Target: ${buildRequest.powerLevel}/10

**Top Cards:** ${topCards}

**Analysis (max 150 words):**
1. Proper ${buildRequest.archetype} execution?
2. Card quotas OK? (need 10-14 ramp, 10-15 draw, 10-15 interaction)
3. CMC appropriate? (should be 2.8-3.5)
4. Quality score (1-10) + ONE key improvement

Be HONEST. If bad, say why.`;

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
                    content: 'MTG deck analyst. Be critical, precise, constructive. Focus on gameplay viability.' 
                  },
                  { role: 'user', content: validationPrompt }
                ],
                temperature: 0.3,
                max_tokens: 400, // Reduced from no limit
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
