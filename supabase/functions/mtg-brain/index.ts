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

// Scryfall API integration for edge functions
class ScryfallAPI {
  private baseUrl = 'https://api.scryfall.com';

  async makeRequest<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MTG-Brain/1.0' }
    });

    if (!response.ok) {
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    return response.json();
  }

  async searchCards(query: string): Promise<any> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/cards/search?q=${encodedQuery}&order=name&unique=cards`;
    return this.makeRequest(url);
  }

  async getCardByName(name: string): Promise<any> {
    const encodedName = encodeURIComponent(name);
    const url = `${this.baseUrl}/cards/named?fuzzy=${encodedName}`;
    return this.makeRequest(url);
  }
}

// Card name detection patterns
const detectCardMentions = (text: string): string[] => {
  const cardNames = new Set<string>();
  
  console.log('Processing text for card detection:', text.substring(0, 200) + '...');
  
  // Pattern for "Referenced Cards:" section at end of AI responses (highest priority)
  const referencedCardsMatch = text.match(/Referenced Cards?:\s*([^\n]*(?:\n(?!\n)[^\n]*)*)/i);
  if (referencedCardsMatch) {
    console.log('Found Referenced Cards section:', referencedCardsMatch[1]);
    const referencedSection = referencedCardsMatch[1];
    const cards = referencedSection
      .split(/[;,\n]/)
      .flatMap(seg => seg.split(/\s*•\s*/))
      .map(card => card.trim().replace(/^[\-•]\s*/, ''))
      .filter(card => card.length > 1);
    console.log('Parsed cards from Referenced section:', cards);
    // If explicit referenced cards are present, prefer ONLY these
    return Array.from(new Set(cards));
  }
  
  // Pattern for quoted card names: "Card Name"
  const quotedNames = text.match(/"([^"]+)"/g);
  if (quotedNames) {
    quotedNames.forEach(match => {
      const name = match.slice(1, -1).trim();
      if (name.length > 2) {
        console.log('Found quoted card:', name);
        cardNames.add(name);
      }
    });
  }
  
  // Pattern for [[Card Name]] (common MTG notation)
  const bracketNames = text.match(/\[\[([^\]]+)\]\]/g);
  if (bracketNames) {
    bracketNames.forEach(match => {
      const name = match.slice(2, -2).trim();
      if (name.length > 2) {
        console.log('Found bracketed card:', name);
        cardNames.add(name);
      }
    });
  }
  
  return Array.from(cardNames);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('MTG Brain function called');
    
    const { message, deckContext, conversationHistory = [], responseStyle = 'concise' } = await req.json();
    console.log('Received message:', message);
    console.log('Response style:', responseStyle);
    console.log('Deck context:', deckContext);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Initialize Scryfall API and detect card mentions
    const scryfallAPI = new ScryfallAPI();
    const allText = message; // Only analyze the current user message to avoid stale detections
    console.log('All text being analyzed:', allText);
    const mentionedCards = detectCardMentions(allText);
    
    console.log('Detected card mentions:', mentionedCards);

    // Search for card data and images
    let cardContext = '';
    const cardData: any[] = [];
    
    if (mentionedCards.length > 0) {
      console.log('Searching for card data...');
      
      // Limit to first 10 cards to avoid overwhelming the context
      const cardsToSearch = mentionedCards.slice(0, 10);
      
      for (const cardName of cardsToSearch) {
        try {
          const card = await scryfallAPI.getCardByName(cardName);
          cardData.push({
            id: card.id,
            set: card.set,
            collector_number: card.collector_number,
            name: card.name,
            image_uri: card.image_uris?.normal || card.image_uris?.large,
            image_uris: card.image_uris || null,
            mana_cost: card.mana_cost,
            type_line: card.type_line,
            oracle_text: card.oracle_text,
            power: card.power,
            toughness: card.toughness,
            cmc: card.cmc,
            colors: card.colors,
            rarity: card.rarity
          });
          
          cardContext += `\n**${card.name}** (${card.mana_cost}) - ${card.type_line}\n`;
          cardContext += `${card.oracle_text}\n`;
          if (card.power && card.toughness) {
            cardContext += `Power/Toughness: ${card.power}/${card.toughness}\n`;
          }
          cardContext += `---\n`;
        } catch (error) {
          console.log(`Could not find card: ${cardName}`);
        }
      }
    }

    // Build comprehensive system prompt with MTG knowledge and card context
    let systemPrompt = `You are the MTG Super Brain, the ultimate Magic: The Gathering expert assistant. You have comprehensive knowledge of:

## CORE KNOWLEDGE
**Game Rules:** ${JSON.stringify(MTG_KNOWLEDGE.GAME_RULES, null, 2)}

**Color Philosophy:** ${JSON.stringify(MTG_KNOWLEDGE.COLOR_PHILOSOPHY, null, 2)}

**Deck Building Principles:** ${JSON.stringify(MTG_KNOWLEDGE.DECK_BUILDING, null, 2)}

**Commander Archetypes:** ${JSON.stringify(MTG_KNOWLEDGE.COMMANDER_ARCHETYPES, null, 2)}

**Synergy Patterns:** ${JSON.stringify(MTG_KNOWLEDGE.SYNERGY_PATTERNS, null, 2)}

**Format Rules:** ${JSON.stringify(MTG_KNOWLEDGE.FORMAT_RULES, null, 2)}

**Staple Cards:** ${JSON.stringify(MTG_KNOWLEDGE.STAPLE_CARDS, null, 2)}

## CURRENT DECK CONTEXT
${deckContext ? `The user is currently working on: ${JSON.stringify(deckContext, null, 2)}` : 'No deck currently loaded.'}`;

    // Add card context if cards were mentioned
    if (cardContext) {
      systemPrompt += `

## REFERENCED CARDS IN CONVERSATION
The following cards have been mentioned in this conversation:
${cardContext}

When discussing these cards, reference their actual mechanics, costs, and abilities as shown above.`;
    }

    systemPrompt += `

## YOUR ROLE
You are an expert MTG strategist, deck builder, and rules advisor. Provide:
- **Detailed Analysis:** Use specific MTG knowledge and terminology
- **Strategic Insights:** Reference actual cards, combos, and interactions
- **Format Expertise:** Understand meta trends and competitive play
- **Deck Building Advice:** Apply Rule of 9, mana curves, and archetype knowledge
- **Practical Recommendations:** Suggest specific cards and strategies
- **Card Searches:** When users ask for specific card recommendations (e.g., "show me white legendary creatures under 5 mana"), provide detailed lists with explanations

## CRITICAL: COLOR IDENTITY RESTRICTIONS
When users specify color requirements (e.g., "white black only", "mono red", "green blue commanders"):
- **STRICTLY** adhere to the specified colors only
- For partner commanders, BOTH partners must fit the color restriction
- Do not suggest cards outside the specified color identity
- If a user says "white black only" - suggest ONLY white, black, or white/black cards
- Explain color identity clearly when relevant

## CRITICAL: CARD REFERENCE FORMAT
**ALWAYS end your response with a "Referenced Cards:" section listing any Magic cards mentioned in your response.** This helps our system display card images and details. Format it like this:

Referenced Cards: Sol Ring, Lightning Bolt, Counterspell, Rhystic Study

Even if you mention cards within your response text, ALWAYS include this section at the end for reliable card detection and display.

## RESPONSE STYLE
${responseStyle === 'detailed' ? `
**DETAILED ANALYSIS MODE:** Provide comprehensive, in-depth responses with:
- Detailed explanations of card interactions and synergies
- Multiple strategic options and their trade-offs  
- Specific card recommendations with reasoning
- Meta considerations and competitive insights
- Step-by-step analysis of complex interactions
- Budget alternatives and upgrade paths when relevant
` : `
**QUICK RESPONSE MODE:** Provide clear, focused responses that:
- Get straight to the point with actionable advice
- Focus on the most important 2-3 key points
- Use bullet points for easy scanning  
- Avoid lengthy explanations unless critical
- Prioritize practical, immediately useful information
`}
${responseStyle === 'detailed' ? `
- **Comprehensive Analysis:** Provide in-depth explanations with multiple examples
- **Detailed Card Lists:** Include extensive card suggestions with reasoning
- **Strategic Deep Dives:** Explain complex interactions and meta considerations
- **Extended Recommendations:** Cover multiple approaches and alternatives
` : `
- **Concise and Focused:** Keep responses brief and to the point
- **Essential Information Only:** Highlight key cards and strategies without lengthy explanations
- **Quick Recommendations:** Provide actionable advice without excessive detail
- **Bullet Points Preferred:** Use clear, scannable formatting
`}

Always ground your responses in the provided knowledge base, referenced card data, and current deck context.`;

    console.log('Calling Lovable AI Gateway...');
    
    const temperature = responseStyle === 'detailed' ? 0.8 : 0.2;
    const max_tokens = responseStyle === 'detailed' ? 2000 : 600;
    
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
        temperature,
        max_tokens
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

    // Re-detect cards from the assistant's response for better accuracy
    const responseCardMentions = detectCardMentions(assistantMessage);
    console.log('Cards detected from AI response:', responseCardMentions);
    
    // Add any newly detected cards to cardData (STRICTLY prefer AI response list)
    if (responseCardMentions.length > 0) {
      console.log('Rebuilding cards strictly from AI response list...');
      cardData.length = 0; // clear any stale detections from prior context
      for (const cardName of responseCardMentions.slice(0, 10)) {
        try {
          const card = await scryfallAPI.getCardByName(cardName);
          cardData.push({
            id: card.id,
            set: card.set,
            collector_number: card.collector_number,
            name: card.name,
            image_uri: card.image_uris?.normal || card.image_uris?.large,
            image_uris: card.image_uris || null,
            mana_cost: card.mana_cost,
            type_line: card.type_line,
            oracle_text: card.oracle_text,
            power: card.power,
            toughness: card.toughness,
            cmc: card.cmc,
            colors: card.colors,
            rarity: card.rarity
          });
        } catch (error) {
          console.log(`Could not find card: ${cardName}`);
        }
      }
    }

    return new Response(JSON.stringify({ 
      message: assistantMessage,
      cards: cardData,
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