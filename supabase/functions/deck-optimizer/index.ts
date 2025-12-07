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
    console.log('Deck Optimizer v2 - Enhanced analysis');
    
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

    // Build detailed type breakdown
    const typeBreakdown = buildTypeBreakdown(cards || []);
    
    // Extract low playability cards from EDH analysis
    const lowPlayabilityCards = extractLowPlayabilityCards(edhAnalysis);
    
    // Calculate mana curve data
    const manaCurve = calculateManaCurve(cards || []);

    // Build the enhanced prompt
    const prompt = buildEnhancedPrompt({
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
      collectionCards,
      manaCurve
    });

    console.log('Sending enhanced request to AI with comprehensive tool schema');

    // Enhanced tool schema for better structured output
    const tools = [
      {
        type: "function",
        function: {
          name: "deck_analysis",
          description: "Provide comprehensive deck analysis with scoring, issues, strengths, strategy tips, and card replacement suggestions",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "2-3 sentence executive summary highlighting the deck's main strengths and priority improvements"
              },
              categories: {
                type: "object",
                description: "Score each aspect from 0-100",
                properties: {
                  synergy: { type: "number", description: "How well cards work together (0-100)" },
                  consistency: { type: "number", description: "Draw quality and redundancy (0-100)" },
                  power: { type: "number", description: "Raw power level and win conditions (0-100)" },
                  interaction: { type: "number", description: "Removal, counterspells, protection (0-100)" },
                  manabase: { type: "number", description: "Land count, fixing, ramp quality (0-100)" }
                },
                required: ["synergy", "consistency", "power", "interaction", "manabase"]
              },
              issues: {
                type: "array",
                description: "Problematic cards that should be replaced, ordered by priority",
                items: {
                  type: "object",
                  properties: {
                    card: { type: "string", description: "Exact card name" },
                    reason: { type: "string", description: "Specific reason why this card underperforms" },
                    severity: { type: "string", enum: ["low", "medium", "high"], description: "high = must replace, medium = should replace, low = consider replacing" },
                    category: { type: "string", description: "Issue category: 'synergy', 'power', 'mana', 'strategy'" }
                  },
                  required: ["card", "reason", "severity"]
                }
              },
              strengths: {
                type: "array",
                description: "What the deck does well - be specific about card combinations",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Specific strength with card names" }
                  },
                  required: ["text"]
                }
              },
              strategy: {
                type: "array",
                description: "Actionable gameplay tips for piloting this specific deck",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Strategic tip with specific examples" }
                  },
                  required: ["text"]
                }
              },
              manabase: {
                type: "array",
                description: "Mana base analysis - land count, fixing, curve alignment",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Specific mana base observation" }
                  },
                  required: ["text"]
                }
              },
              replacements: {
                type: "array",
                description: "Specific card-for-card replacements. Each must include real MTG card names.",
                items: {
                  type: "object",
                  properties: {
                    remove: { type: "string", description: "Exact name of card to remove" },
                    removeReason: { type: "string", description: "Why remove this specific card" },
                    add: { type: "string", description: "Exact name of card to add (must be a real MTG card)" },
                    addBenefit: { type: "string", description: "Specific benefit of the replacement" },
                    addType: { type: "string", description: "Card type of the replacement" },
                    synergy: { type: "string", description: "How it synergizes with commander/strategy" },
                    priority: { type: "string", enum: ["high", "medium", "low"], description: "How urgently this swap should be made" }
                  },
                  required: ["remove", "removeReason", "add", "addBenefit", "priority"]
                }
              },
              additions: {
                type: "array",
                description: "Cards to add if deck is missing cards",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Exact card name to add" },
                    reason: { type: "string", description: "Why this card improves the deck" },
                    type: { type: "string", description: "Card type" },
                    priority: { type: "string", enum: ["high", "medium", "low"] }
                  },
                  required: ["name", "reason"]
                }
              }
            },
            required: ["summary", "categories", "issues", "strengths", "strategy", "manabase", "replacements"]
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
            content: `You are an elite Magic: The Gathering deck optimizer with deep knowledge of competitive and casual play.

Your analysis must be:
- SPECIFIC: Reference actual card names, not generic descriptions
- ACTIONABLE: Every suggestion should be immediately implementable
- BALANCED: Consider both budget and optimal options
- SYNERGY-FOCUSED: Prioritize cards that work with the commander's strategy

For Commander/EDH decks, consider:
- Color identity restrictions
- Singleton format implications
- Commander synergy and protection
- Mana curve (aim for avg CMC 2.5-3.5)
- Ideal land count (35-38 lands typically)
- Ramp package (10+ sources recommended)
- Card draw engines
- Removal package (8-12 pieces)
- Win conditions and combos

IMPORTANT: Only suggest REAL Magic: The Gathering cards that exist and are legal in the format.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 5000,
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
          return new Response(JSON.stringify({ analysis: normalizeAnalysis(parsed) }), {
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

    // Normalize and validate the analysis
    analysis = normalizeAnalysis(analysis);

    console.log(`Analysis complete: ${analysis.issues?.length || 0} issues, ${analysis.replacements?.length || 0} replacements`);

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

function normalizeAnalysis(analysis: any): any {
  return {
    summary: analysis.summary || 'Deck analysis complete.',
    categories: {
      synergy: Math.min(100, Math.max(0, analysis.categories?.synergy || 70)),
      consistency: Math.min(100, Math.max(0, analysis.categories?.consistency || 65)),
      power: Math.min(100, Math.max(0, analysis.categories?.power || 70)),
      interaction: Math.min(100, Math.max(0, analysis.categories?.interaction || 60)),
      manabase: Math.min(100, Math.max(0, analysis.categories?.manabase || 75))
    },
    issues: (analysis.issues || []).map((i: any) => ({
      card: String(i.card || ''),
      reason: String(i.reason || ''),
      severity: ['high', 'medium', 'low'].includes(i.severity) ? i.severity : 'medium',
      category: i.category || null
    })),
    strengths: (analysis.strengths || []).map((s: any) => ({ 
      text: typeof s === 'string' ? s : String(s.text || '') 
    })),
    strategy: (analysis.strategy || []).map((s: any) => ({ 
      text: typeof s === 'string' ? s : String(s.text || '') 
    })),
    manabase: (analysis.manabase || []).map((s: any) => ({ 
      text: typeof s === 'string' ? s : String(s.text || '') 
    })),
    replacements: (analysis.replacements || []).map((r: any) => ({
      remove: String(r.remove || ''),
      removeReason: String(r.removeReason || ''),
      add: String(r.add || ''),
      addBenefit: String(r.addBenefit || ''),
      addType: r.addType || null,
      synergy: r.synergy || null,
      priority: ['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium'
    })),
    additions: (analysis.additions || []).map((a: any) => ({
      name: String(a.name || ''),
      reason: String(a.reason || ''),
      type: a.type || null,
      priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium'
    }))
  };
}

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

function calculateManaCurve(cards: any[]): Record<string, number> {
  const curve: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
  for (const card of cards) {
    if (card.type_line?.includes('Land')) continue;
    const cmc = card.cmc || 0;
    const qty = card.quantity || 1;
    if (cmc >= 6) curve['6+'] += qty;
    else curve[String(cmc)] += qty;
  }
  return curve;
}

function extractLowPlayabilityCards(edhAnalysis: any): string[] {
  if (!edhAnalysis?.cardAnalysis) return [];
  return edhAnalysis.cardAnalysis
    .filter((c: any) => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a: any, b: any) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10)
    .map((c: any) => `${c.name} (${c.playability}% playability)`);
}

function buildEnhancedPrompt(params: {
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
  manaCurve: Record<string, number>;
}): string {
  const {
    name, format, commander, cards, power,
    totalWithCommander, requiredCards, missingCards,
    typeBreakdown, lowPlayabilityCards, edhAnalysis,
    useCollection, collectionCards, manaCurve
  } = params;

  const avgCMC = cards.filter(c => !c.type_line?.includes('Land'))
    .reduce((sum, c) => sum + ((c.cmc || 0) * (c.quantity || 1)), 0) / 
    cards.filter(c => !c.type_line?.includes('Land'))
    .reduce((sum, c) => sum + (c.quantity || 1), 1);

  let prompt = `# Deck Optimization Request

## Deck Information
**Name:** ${name || 'Unnamed Deck'}
**Format:** ${format}
${commander ? `**Commander:** ${commander.name}` : ''}
**Card Count:** ${totalWithCommander}/${requiredCards} ${missingCards > 0 ? `⚠️ INCOMPLETE - needs ${missingCards} more cards` : '✅ Complete'}
**Target Power Level:** ${power?.score || 'Not specified'}/10

## Composition Breakdown
${typeBreakdown}

## Mana Curve (Non-Land)
${Object.entries(manaCurve).map(([cmc, count]) => `CMC ${cmc}: ${count} cards`).join(' | ')}
**Average CMC:** ${avgCMC.toFixed(2)}

`;

  if (lowPlayabilityCards.length > 0) {
    prompt += `## 🔴 Low Playability Cards (PRIORITY REPLACEMENTS)
These cards have been flagged as underperforming based on EDH statistics:
${lowPlayabilityCards.map(c => `- ${c}`).join('\n')}

`;
  }

  if (edhAnalysis) {
    prompt += `## EDH Analysis Metrics
- Tipping Point: Turn ${edhAnalysis.tippingPoint || 'N/A'}
- Efficiency Score: ${edhAnalysis.efficiency || 'N/A'}/10
- Impact Score: ${edhAnalysis.impact || 'N/A'}/10

`;
  }

  prompt += `## Complete Card List
${(cards || []).map((c: any) => `- ${c.name}${c.quantity > 1 ? ` (x${c.quantity})` : ''} [${c.type_line || 'Unknown'}]${c.cmc ? ` CMC:${c.cmc}` : ''}`).join('\n')}

`;

  if (useCollection && collectionCards.length > 0) {
    prompt += `## User's Collection (PREFER THESE FOR REPLACEMENTS)
The user owns these cards - prioritize suggestions from this list when possible:
${collectionCards.slice(0, 100).join(', ')}

`;
  }

  prompt += `## Analysis Requirements

1. **ISSUES**: Identify 4-8 problematic cards with specific reasons. Focus on:
   - Cards that don't support the commander's strategy
   - Overcosted effects
   - Dead draws in typical game situations
   - Cards with low EDH playability (if data provided above)

2. **REPLACEMENTS**: For each issue, suggest a specific replacement. Consider:
   - Similar mana cost where possible
   - Better synergy with commander
   - Format staples that improve consistency
   ${useCollection ? '- PREFER cards from the user\'s collection listed above' : ''}

3. **CATEGORY SCORES**: Rate the deck objectively from 0-100:
   - Synergy: How well cards work together
   - Consistency: Card selection and redundancy
   - Power: Win conditions and threat density
   - Interaction: Removal, counters, protection
   - Manabase: Land count, color fixing, ramp

4. **STRENGTHS**: Identify 3-5 things the deck does well

5. **STRATEGY**: Provide 3-5 gameplay tips specific to this deck

6. **MANABASE**: Analyze the mana base - land count, fixing, ramp

${missingCards > 0 ? `7. **ADDITIONS**: The deck needs ${missingCards} more cards. Suggest the most impactful additions.` : ''}

IMPORTANT: All card names MUST be real Magic: The Gathering cards that are legal in ${format}.`;

  return prompt;
}

function parseJsonFallback(text: string): any {
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  
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
