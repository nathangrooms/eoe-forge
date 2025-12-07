import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Deck Optimizer function called');
    
    const { deckContext, edhAnalysis, useCollection, collectionCards = [] } = await req.json();
    
    if (!deckContext) {
      throw new Error('deckContext is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { name, format, commander, cards, power } = deckContext;
    const isCommander = format?.toLowerCase() === 'commander' || format?.toLowerCase() === 'edh';
    const requiredCards = isCommander ? 100 : 60;
    
    // Calculate actual card count with quantities
    const totalCards = (cards || []).reduce((sum: number, c: any) => sum + (c.quantity || 1), 0);
    const commanderCount = isCommander && commander ? 1 : 0;
    const totalWithCommander = totalCards + commanderCount;
    const missingCards = Math.max(0, requiredCards - totalWithCommander);

    // Build card type breakdown
    const typeBreakdown = buildTypeBreakdown(cards || []);
    
    // Extract low playability cards from EDH analysis
    const lowPlayabilityCards = extractLowPlayabilityCards(edhAnalysis);

    // Build the prompt
    const prompt = buildPrompt({
      name,
      format,
      commander,
      cards,
      power,
      totalWithCommander,
      requiredCards,
      missingCards,
      typeBreakdown,
      lowPlayabilityCards,
      edhAnalysis,
      useCollection,
      collectionCards
    });

    console.log('Sending request to AI with structured output via tool calling');

    // Use tool calling to enforce structured JSON output
    const tools = [
      {
        type: "function",
        function: {
          name: "deck_analysis",
          description: "Provide deck analysis with issues, strengths, strategy tips, and card replacement suggestions",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "2-3 sentence summary of the deck's current state and main improvement areas"
              },
              issues: {
                type: "array",
                description: "List of problematic cards to consider removing",
                items: {
                  type: "object",
                  properties: {
                    card: { type: "string", description: "Name of the problematic card" },
                    reason: { type: "string", description: "Why this card should be replaced" },
                    severity: { type: "string", enum: ["low", "medium", "high"], description: "How urgently this should be replaced" }
                  },
                  required: ["card", "reason", "severity"]
                }
              },
              strengths: {
                type: "array",
                description: "List of deck strengths",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Description of a deck strength" }
                  },
                  required: ["text"]
                }
              },
              strategy: {
                type: "array",
                description: "Strategic tips for piloting the deck",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "A strategic tip" }
                  },
                  required: ["text"]
                }
              },
              manabase: {
                type: "array",
                description: "Mana base observations and suggestions",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Mana base observation" }
                  },
                  required: ["text"]
                }
              },
              replacements: {
                type: "array",
                description: "Specific card replacement suggestions (remove X, add Y)",
                items: {
                  type: "object",
                  properties: {
                    remove: { type: "string", description: "Name of card to remove" },
                    removeReason: { type: "string", description: "Why to remove this card" },
                    add: { type: "string", description: "Name of card to add instead" },
                    addBenefit: { type: "string", description: "Why the new card is better" },
                    addType: { type: "string", description: "Card type of the replacement" }
                  },
                  required: ["remove", "removeReason", "add", "addBenefit"]
                }
              },
              additions: {
                type: "array",
                description: "Cards to add if deck is missing cards",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Name of card to add" },
                    reason: { type: "string", description: "Why to add this card" },
                    type: { type: "string", description: "Card type" }
                  },
                  required: ["name", "reason"]
                }
              }
            },
            required: ["summary", "issues", "strengths", "strategy", "manabase", "replacements"]
          }
        }
      }
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: `You are an expert Magic: The Gathering deck optimizer. Analyze decks and provide specific, actionable recommendations. Focus on card-level analysis. Always use real, legal MTG card names.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        tools,
        tool_choice: { type: "function", function: { name: "deck_analysis" } }
      }),
    });

    console.log('AI Gateway response status:', response.status);

    if (!response.ok) {
      if (response.status === 429) {
        console.log('Rate limit hit');
        return new Response(JSON.stringify({ 
          error: 'Rate limits exceeded. Please wait a moment and try again.',
          type: 'rate_limit' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        console.log('Payment required');
        return new Response(JSON.stringify({ 
          error: 'AI credits exhausted. Please add credits to continue.',
          type: 'payment_required' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log('AI response received');

    // Extract the tool call result
    const toolCalls = aiResponse.choices?.[0]?.message?.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      // Fallback: try to parse content as JSON if no tool calls
      const content = aiResponse.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = parseJsonFallback(content);
          console.log('Parsed from content fallback');
          return new Response(JSON.stringify({ analysis: parsed }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('Failed to parse content fallback:', e);
        }
      }
      throw new Error('No valid response from AI');
    }

    const toolCall = toolCalls[0];
    if (toolCall.function?.name !== 'deck_analysis') {
      throw new Error('Unexpected tool call');
    }

    let analysis;
    try {
      analysis = JSON.parse(toolCall.function.arguments);
      console.log('Successfully parsed tool call arguments');
    } catch (e) {
      console.error('Failed to parse tool arguments:', e);
      throw new Error('Invalid tool call response');
    }

    // Ensure arrays exist
    analysis.issues = analysis.issues || [];
    analysis.strengths = analysis.strengths || [];
    analysis.strategy = analysis.strategy || [];
    analysis.manabase = analysis.manabase || [];
    analysis.replacements = analysis.replacements || [];
    analysis.additions = analysis.additions || [];

    console.log(`Analysis complete: ${analysis.issues.length} issues, ${analysis.replacements.length} replacements`);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Deck optimizer error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      type: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildTypeBreakdown(cards: any[]): string {
  const types: Record<string, number> = {};
  for (const card of cards) {
    const typeLine = card.type_line || '';
    const qty = card.quantity || 1;
    if (typeLine.includes('Creature')) types['Creatures'] = (types['Creatures'] || 0) + qty;
    else if (typeLine.includes('Land')) types['Lands'] = (types['Lands'] || 0) + qty;
    else if (typeLine.includes('Instant')) types['Instants'] = (types['Instants'] || 0) + qty;
    else if (typeLine.includes('Sorcery')) types['Sorceries'] = (types['Sorceries'] || 0) + qty;
    else if (typeLine.includes('Artifact')) types['Artifacts'] = (types['Artifacts'] || 0) + qty;
    else if (typeLine.includes('Enchantment')) types['Enchantments'] = (types['Enchantments'] || 0) + qty;
    else if (typeLine.includes('Planeswalker')) types['Planeswalkers'] = (types['Planeswalkers'] || 0) + qty;
    else types['Other'] = (types['Other'] || 0) + qty;
  }
  return Object.entries(types).map(([t, c]) => `${t}: ${c}`).join(', ');
}

function extractLowPlayabilityCards(edhAnalysis: any): string[] {
  if (!edhAnalysis?.cardAnalysis) return [];
  return edhAnalysis.cardAnalysis
    .filter((c: any) => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a: any, b: any) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10)
    .map((c: any) => `${c.name} (${c.playability}% playability)`);
}

function buildPrompt(params: {
  name: string;
  format: string;
  commander: any;
  cards: any[];
  power: any;
  totalWithCommander: number;
  requiredCards: number;
  missingCards: number;
  typeBreakdown: string;
  lowPlayabilityCards: string[];
  edhAnalysis: any;
  useCollection: boolean;
  collectionCards: string[];
}): string {
  const {
    name, format, commander, cards, power,
    totalWithCommander, requiredCards, missingCards,
    typeBreakdown, lowPlayabilityCards, edhAnalysis,
    useCollection, collectionCards
  } = params;

  let prompt = `Analyze this Magic: The Gathering deck and provide optimization recommendations.

**Deck:** ${name || 'Unnamed Deck'}
${commander ? `**Commander:** ${commander.name}` : ''}
**Format:** ${format}
**Cards:** ${totalWithCommander}/${requiredCards} ${missingCards > 0 ? `(MISSING ${missingCards} CARDS)` : '(Complete)'}
**Type Breakdown:** ${typeBreakdown}
${power?.score ? `**Power Level:** ${power.score}/10` : ''}

`;

  if (lowPlayabilityCards.length > 0) {
    prompt += `**Low Playability Cards (from EDH analysis - prioritize replacing these):**
${lowPlayabilityCards.join('\n')}

`;
  }

  if (edhAnalysis) {
    prompt += `**EDH Analysis Data:**
- Tipping Point: Turn ${edhAnalysis.tippingPoint || 'N/A'}
- Efficiency: ${edhAnalysis.efficiency || 'N/A'}/10
- Impact Score: ${edhAnalysis.impact || 'N/A'}/10

`;
  }

  prompt += `**Current Card List:**
${(cards || []).map((c: any) => `- ${c.name} (${c.type_line || 'Unknown'})`).join('\n')}

`;

  if (useCollection && collectionCards.length > 0) {
    prompt += `**User's Collection (prefer these for replacements):**
${collectionCards.slice(0, 50).join(', ')}

`;
  }

  prompt += `**Instructions:**
1. Identify 3-8 cards that should be replaced (focus on low playability cards)
2. For each card to remove, suggest a specific replacement card
3. Provide 3-5 deck strengths
4. Provide 3-5 strategic tips for piloting
5. Note any mana base issues
${missingCards > 0 ? `6. Suggest ${Math.min(missingCards, 10)} cards to add to complete the deck` : ''}

Use ONLY real, legal Magic: The Gathering card names. Be specific and actionable.`;

  return prompt;
}

function parseJsonFallback(text: string): any {
  // Strip markdown code blocks
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  
  // Find JSON boundaries
  const startIdx = clean.indexOf('{');
  if (startIdx === -1) throw new Error('No JSON found');
  
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  
  if (endIdx === -1) throw new Error('Incomplete JSON');
  
  return JSON.parse(clean.substring(startIdx, endIdx + 1));
}
