import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MTG Knowledge Base (condensed for edge function)
const MTG_KNOWLEDGE = {
  GAME_RULES: {
    turn_structure: {
      phases: ['Untap', 'Upkeep', 'Draw', 'Main Phase 1', 'Combat', 'Main Phase 2', 'End Step', 'Cleanup'],
      combat_steps: ['Beginning of Combat', 'Declare Attackers', 'Declare Blockers', 'Combat Damage', 'End of Combat']
    },
    zones: ['Library', 'Hand', 'Battlefield', 'Graveyard', 'Stack', 'Exile', 'Command Zone'],
    card_types: {
      permanent: ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle'],
      non_permanent: ['Instant', 'Sorcery']
    }
  },
  
  COLOR_PHILOSOPHY: {
    W: {
      name: 'White',
      philosophy: 'Peace through structure, morality, order, protection',
      strengths: ['Life gain', 'Protection', 'Board wipes', 'Token generation', 'Removal (exile)', 'Tax effects'],
      weaknesses: ['Card draw', 'Ramp', 'Direct damage'],
      keywords: ['Vigilance', 'Lifelink', 'Protection', 'Flying', 'First Strike', 'Indestructible']
    },
    U: {
      name: 'Blue',
      philosophy: 'Perfection through knowledge, manipulation, control',
      strengths: ['Card draw', 'Counterspells', 'Bounce', 'Theft effects', 'Evasion', 'Extra turns'],
      weaknesses: ['Creature removal', 'Direct damage', 'Enchantment removal'],
      keywords: ['Flying', 'Flash', 'Hexproof', 'Prowess', 'Scry']
    },
    B: {
      name: 'Black',
      philosophy: 'Power through ruthlessness, ambition, death',
      strengths: ['Creature removal', 'Reanimation', 'Tutors', 'Drain effects', 'Sacrifice value', 'Card draw (at a cost)'],
      weaknesses: ['Artifact/enchantment removal', 'Life total management'],
      keywords: ['Deathtouch', 'Menace', 'Lifelink', 'Flying', 'Regenerate']
    },
    R: {
      name: 'Red',
      philosophy: 'Freedom through action, emotion, chaos',
      strengths: ['Direct damage', 'Haste', 'Artifact removal', 'Temporary theft', 'Impulse draw', 'Fast mana'],
      weaknesses: ['Card draw', 'Enchantment removal', 'Life gain', 'Long game'],
      keywords: ['Haste', 'First Strike', 'Trample', 'Menace', 'Double Strike']
    },
    G: {
      name: 'Green',
      philosophy: 'Growth through nature, community, tradition',
      strengths: ['Ramp', 'Big creatures', 'Artifact/enchantment removal', 'Card draw (creatures)', 'Fight effects', 'Trample'],
      weaknesses: ['Flying', 'Counterspells', 'Board wipes', 'Creature removal'],
      keywords: ['Trample', 'Reach', 'Hexproof', 'Vigilance', 'Deathtouch']
    }
  },

  DECK_BUILDING: {
    rule_of_9: {
      description: 'Include 9 copies of each card concept (adjust for singleton formats)',
      roles: ['Ramp', 'Draw', 'Removal', 'Threats', 'Interaction', 'Win Conditions', 'Recursion', 'Protection', 'Utility']
    },
    mana_curve: {
      aggressive: { '1': '8-12', '2': '12-16', '3': '8-12', '4': '4-6', '5+': '2-4', lands: '20-22' },
      midrange: { '1': '2-4', '2': '8-12', '3': '10-14', '4': '8-10', '5+': '6-8', lands: '23-25' },
      control: { '1': '0-2', '2': '8-12', '3': '6-8', '4': '8-12', '5+': '10-14', lands: '26-28' },
      commander: { '1': '4-6', '2': '8-12', '3': '10-14', '4': '8-12', '5': '6-10', '6+': '8-12', lands: '36-40', ramp: '10-15' }
    }
  },

  COMMANDER_ARCHETYPES: {
    voltron: { description: 'Single creature with equipment/auras for 21 commander damage', key_cards: ['Equipment', 'Auras', 'Protection', 'Evasion'] },
    aristocrats: { description: 'Sacrifice creatures for value', key_cards: ['Blood Artist effects', 'Sacrifice outlets', 'Token generators', 'Recursion'] },
    spellslinger: { description: 'Cast many instants/sorceries', key_cards: ['Copy effects', 'Storm', 'Prowess', 'Cost reduction', 'Recursion'] },
    tribal: { description: 'Creature type synergy', key_cards: ['Lords', 'Tribal payoffs', 'Token generators', 'Cost reduction'] },
    combo: { description: 'Win with infinite loops or combos', key_cards: ['Tutors', 'Combo pieces', 'Protection', 'Fast mana'] },
    tokens: { description: 'Create many creature tokens', key_cards: ['Token generators', 'Anthems', 'Sacrifice outlets', 'Token doublers'] }
  },

  SYNERGY_PATTERNS: {
    sacrifice: { outlets: ['Free sac (Ashnod\'s Altar)', 'Mana producing (Phyrexian Altar)', 'Value sac (Viscera Seer)'], payoffs: ['Death triggers (Blood Artist)', 'Token generators', 'Recursion'] },
    graveyard: { fillers: ['Self-mill', 'Discard', 'Sacrifice', 'Dredge'], payoffs: ['Reanimation', 'Recursion', 'Delve', 'Threshold', 'Escape'] },
    tokens: { generators: ['One-shot', 'Repeatable', 'Triggered'], payoffs: ['Anthems', 'Sacrifice outlets', 'Tap effects', 'ETB triggers'] }
  },

  FORMAT_RULES: {
    standard: { deck_size: 60, max_copies: 4, sideboard: 15, power_level: 'Rotating, lower power' },
    modern: { deck_size: 60, max_copies: 4, sideboard: 15, power_level: 'Non-rotating, high power' },
    commander: { deck_size: 100, singleton: true, commander: 1, starting_life: 40, commander_damage: 21, power_level: 'Varies by playgroup' },
    legacy: { deck_size: 60, max_copies: 4, sideboard: 15, power_level: 'Extremely high, fast combo' },
    vintage: { deck_size: 60, max_copies: 4, sideboard: 15, restricted: 'Power 9 restricted to 1 copy', power_level: 'Highest power level' }
  },

  STAPLE_CARDS: {
    ramp: {
      colorless: ['Sol Ring', 'Arcane Signet', 'Fellwar Stone', 'Mind Stone', 'Commander\'s Sphere'],
      green: ['Nature\'s Lore', 'Three Visits', 'Farseek', 'Rampant Growth', 'Kodama\'s Reach', 'Cultivate']
    },
    removal: {
      white: ['Swords to Plowshares', 'Path to Exile', 'Generous Gift', 'Fateful Absence'],
      blue: ['Counterspell', 'Swan Song', 'Cyclonic Rift', 'Pongify', 'Rapid Hybridization'],
      black: ['Fatal Push', 'Go for the Throat', 'Toxic Deluge', 'Damnation'],
      red: ['Chaos Warp', 'Vandalblast', 'Blasphemous Act', 'By Force'],
      green: ['Beast Within', 'Nature\'s Claim', 'Krosan Grip', 'Return to Nature']
    },
    card_draw: {
      white: ['Esper Sentinel', 'Welcoming Vampire', 'Mentor of the Meek'],
      blue: ['Rhystic Study', 'Mystic Remora', 'Ponder', 'Preordain', 'Brainstorm'],
      black: ['Necropotence', 'Phyrexian Arena', 'Sign in Blood', 'Night\'s Whisper'],
      red: ['Wheel of Fortune', 'Faithless Looting', 'Light Up the Stage'],
      green: ['Sylvan Library', 'Guardian Project', 'Harmonize', 'Return of the Wildspeaker']
    }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('MTG Brain function called');
    
    const { message, deckContext } = await req.json();
    console.log('Received message:', message);
    console.log('Deck context:', deckContext);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build comprehensive system prompt with MTG knowledge
    const systemPrompt = `You are the MTG Super Brain, the ultimate Magic: The Gathering expert assistant. You have comprehensive knowledge of:

## CORE KNOWLEDGE
**Game Rules:** ${JSON.stringify(MTG_KNOWLEDGE.GAME_RULES, null, 2)}

**Color Philosophy:** ${JSON.stringify(MTG_KNOWLEDGE.COLOR_PHILOSOPHY, null, 2)}

**Deck Building Principles:** ${JSON.stringify(MTG_KNOWLEDGE.DECK_BUILDING, null, 2)}

**Commander Archetypes:** ${JSON.stringify(MTG_KNOWLEDGE.COMMANDER_ARCHETYPES, null, 2)}

**Synergy Patterns:** ${JSON.stringify(MTG_KNOWLEDGE.SYNERGY_PATTERNS, null, 2)}

**Format Rules:** ${JSON.stringify(MTG_KNOWLEDGE.FORMAT_RULES, null, 2)}

**Staple Cards:** ${JSON.stringify(MTG_KNOWLEDGE.STAPLE_CARDS, null, 2)}

## CURRENT DECK CONTEXT
${deckContext ? `The user is currently working on: ${JSON.stringify(deckContext, null, 2)}` : 'No deck currently loaded.'}

## YOUR ROLE
You are an expert MTG strategist, deck builder, and rules advisor. Provide:
- **Detailed Analysis:** Use specific MTG knowledge and terminology
- **Strategic Insights:** Reference actual cards, combos, and interactions
- **Format Expertise:** Understand meta trends and competitive play
- **Deck Building Advice:** Apply Rule of 9, mana curves, and archetype knowledge
- **Practical Recommendations:** Suggest specific cards and strategies

## RESPONSE STYLE
- Use markdown formatting with headers and bullet points
- Be comprehensive but concise
- Reference specific cards and interactions when relevant
- Provide actionable advice
- Include reasoning behind recommendations
- Use MTG terminology correctly

Always ground your responses in the provided knowledge base and current deck context.`;

    console.log('Calling Lovable AI Gateway...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 2000
      }),
    });

    console.log('AI Gateway response status:', response.status);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limits exceeded. Please try again in a moment.',
          type: 'rate_limit' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI usage credits exhausted. Please add credits to your workspace.',
          type: 'payment_required' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status} ${errorText}`);
    }

    const aiResponse = await response.json();
    console.log('AI response received:', aiResponse?.choices?.[0]?.message?.content?.substring(0, 100) + '...');

    const assistantMessage = aiResponse.choices?.[0]?.message?.content;
    
    if (!assistantMessage) {
      throw new Error('No response content from AI');
    }

    return new Response(JSON.stringify({ 
      message: assistantMessage,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('MTG Brain error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});