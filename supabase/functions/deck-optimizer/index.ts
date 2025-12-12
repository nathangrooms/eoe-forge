import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Deterministic seed for consistent results
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Deck Optimizer v4 - Consistent multi-phase analysis with land recommendations');
    
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
    const excessCards = Math.max(0, totalWithCommander - requiredCards);
    const isDeckComplete = totalWithCommander === requiredCards;

    // Build detailed type breakdown
    const typeBreakdown = buildTypeBreakdown(cards || []);
    
    // Extract existing card names to prevent duplicate suggestions
    const existingCardNames = new Set((cards || []).map((c: any) => c.name.toLowerCase()));
    
    // Extract low playability cards from EDH analysis
    const lowPlayabilityCards = extractLowPlayabilityCards(edhAnalysis);
    
    // Calculate mana curve data
    const manaCurve = calculateManaCurve(cards || []);
    
    // Calculate average CMC
    const nonLandCards = (cards || []).filter((c: any) => !c.type_line?.includes('Land'));
    const avgCMC = nonLandCards.length > 0 
      ? nonLandCards.reduce((sum: number, c: any) => sum + ((c.cmc || 0) * (c.quantity || 1)), 0) / 
        nonLandCards.reduce((sum: number, c: any) => sum + (c.quantity || 1), 1)
      : 0;

    // Calculate land count
    const landCount = (cards || []).filter((c: any) => c.type_line?.toLowerCase().includes('land'))
      .reduce((sum: number, c: any) => sum + (c.quantity || 1), 0);
    const idealLandCount = isCommander ? 37 : 24;
    const landDiff = landCount - idealLandCount;

    // Generate deterministic seed for consistent results
    const deckHash = hashString(existingCardNames.sort().join(',') + (commander?.name || ''));
    
    console.log(`Deck status: ${totalWithCommander}/${requiredCards} cards. Missing: ${missingCards}, Excess: ${excessCards}. Lands: ${landCount}/${idealLandCount}`);

    // Build the prompt based on deck status
    const prompt = buildEnhancedPrompt({
      name,
      format,
      commander,
      cards,
      power,
      totalWithCommander,
      requiredCards,
      missingCards,
      excessCards,
      isDeckComplete,
      typeBreakdown,
      lowPlayabilityCards,
      edhAnalysis,
      useCollection,
      collectionCards,
      manaCurve,
      avgCMC,
      existingCardNames: Array.from(existingCardNames),
      landCount,
      idealLandCount,
      landDiff,
      deckHash
    });

    // Enhanced tool schema for comprehensive output
    const tools = [
      {
        type: "function",
        function: {
          name: "deck_analysis",
          description: "Provide comprehensive deck analysis with scoring, issues, and recommendations based on deck status",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "2-3 sentence executive summary of deck status and priority actions"
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
              currentPowerLevel: {
                type: "number",
                description: "Estimated current EDH power level (1-10)"
              },
              projectedPowerLevel: {
                type: "number", 
                description: "Estimated power level after applying all recommendations (1-10)"
              },
              issues: {
                type: "array",
                description: "Problematic cards that should be addressed",
                items: {
                  type: "object",
                  properties: {
                    card: { type: "string", description: "Exact card name" },
                    reason: { type: "string", description: "Specific reason why this card is problematic" },
                    severity: { type: "string", enum: ["low", "medium", "high"] },
                    category: { type: "string", description: "Issue category: 'synergy', 'power', 'mana', 'strategy'" }
                  },
                  required: ["card", "reason", "severity"]
                }
              },
              strengths: {
                type: "array",
                items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
              },
              strategy: {
                type: "array",
                items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
              },
              manabase: {
                type: "array",
                items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
              },
              additions: {
                type: "array",
                description: "Cards to ADD to incomplete deck. ONLY suggest if deck needs more cards. Each must be a DIFFERENT card not already in deck.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Exact card name (must not already be in deck)" },
                    reason: { type: "string", description: "Why this card improves the deck" },
                    type: { type: "string", description: "Card type line" },
                    category: { type: "string", description: "Role category: 'Essential', 'Ramp', 'Card Draw', 'Removal', 'Creatures', 'Lands', 'Other'" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    edhImpact: { type: "number", description: "Estimated power level impact (+0.1 to +0.5)" }
                  },
                  required: ["name", "reason", "priority"]
                }
              },
              removals: {
                type: "array",
                description: "Cards to REMOVE from overloaded deck. ONLY suggest if deck has too many cards.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Exact card name to remove" },
                    reason: { type: "string", description: "Why this card should be cut" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    edhImpact: { type: "number", description: "Power level impact of removal (usually negative or 0)" }
                  },
                  required: ["name", "reason", "priority"]
                }
              },
              replacements: {
                type: "array",
                description: "Card-for-card swaps to improve deck. Only for complete decks or as additional optimization.",
                items: {
                  type: "object",
                  properties: {
                    remove: { type: "string", description: "Exact name of card to remove" },
                    removeReason: { type: "string", description: "Why remove this specific card" },
                    add: { type: "string", description: "Exact name of card to add (must be real MTG card)" },
                    addBenefit: { type: "string", description: "Specific benefit of the replacement" },
                    addType: { type: "string", description: "Card type of the replacement" },
                    synergy: { type: "string", description: "How it synergizes with commander/strategy" },
                    category: { type: "string", description: "Replacement category: 'Upgrade', 'Synergy', 'Mana Fix', 'Power'" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    edhImpact: { type: "number", description: "Estimated power level change (+/- 0.1 to 0.3)" }
                  },
                  required: ["remove", "removeReason", "add", "addBenefit", "priority"]
                }
              },
              landRecommendations: {
                type: "array",
                description: "Land-specific recommendations if mana base needs adjustment",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["add", "remove"], description: "Whether to add or remove this land" },
                    name: { type: "string", description: "Land card name" },
                    reason: { type: "string", description: "Why this change helps the mana base" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    category: { type: "string", description: "Land type: 'Basic', 'Dual', 'Fetch', 'Utility'" }
                  },
                  required: ["type", "name", "reason", "priority"]
                }
              }
            },
            required: ["summary", "categories", "issues", "strengths", "strategy", "manabase"]
          }
        }
      }
    ];

    console.log('Sending enhanced request to AI Gateway');

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
            content: `You are an elite Magic: The Gathering deck optimizer with deep knowledge of Commander/EDH format.

Your analysis must be:
- SPECIFIC: Reference actual card names
- ACTIONABLE: Every suggestion should be immediately implementable  
- CONTEXT-AWARE: Respond appropriately to deck status (incomplete vs overloaded vs complete)
- CONSISTENT: Given the same deck, provide the same core recommendations
- UNIQUE: Never suggest cards already in the deck

CRITICAL RULES:
1. For INCOMPLETE decks (missing cards): Focus on ADDITIONS - suggest many diverse cards to fill gaps
2. For OVERLOADED decks (too many cards): Focus on REMOVALS - identify weakest cards to cut
3. For COMPLETE decks: Focus on SWAPS - suggest upgrades and optimizations
4. NEVER suggest a card that's already in the deck
5. All card names MUST be real Magic: The Gathering cards legal in the format
6. Provide estimated EDH power level impact for suggestions
7. ALWAYS analyze land count and provide land recommendations if not optimal

CONSISTENCY REQUIREMENT:
- Prioritize the SAME swap targets each time (lowest playability cards first)
- Suggest the SAME replacement cards for the same weak cards
- Focus on the 5 most obvious improvements first before suggesting alternatives

Commander deck guidelines:
- Ideal land count: 35-38 lands (37 recommended)
- Ramp sources: 10+ pieces
- Card draw: 8-10 sources
- Removal: 8-12 pieces
- Average CMC: 2.5-3.5
- Too few lands (<34): Risk of mana screw
- Too many lands (>40): Risk of flood`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 6000,
        tools,
        tool_choice: { type: "function", function: { name: "deck_analysis" } }
      }),
    });

    console.log('AI Gateway response status:', response.status);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limits exceeded. Please wait a moment and try again.',
          type: 'rate_limit' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
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
    const toolCalls = aiResponse.choices?.[0]?.message?.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      const content = aiResponse.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = parseJsonFallback(content);
          return new Response(JSON.stringify({ 
            analysis: normalizeAnalysis(parsed, existingCardNames, missingCards, excessCards) 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('Failed to parse content fallback:', e);
        }
      }
      throw new Error('No valid response from AI');
    }

    const toolCall = toolCalls[0];
    let analysis;
    try {
      analysis = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('Failed to parse tool arguments:', e);
      throw new Error('Invalid tool call response');
    }

    // Normalize and filter the analysis
    analysis = normalizeAnalysis(analysis, existingCardNames, missingCards, excessCards, landCount, idealLandCount);

    console.log(`Analysis complete: ${analysis.additions?.length || 0} additions, ${analysis.removals?.length || 0} removals, ${analysis.replacements?.length || 0} swaps, ${analysis.landRecommendations?.length || 0} land recs`);

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

function normalizeAnalysis(analysis: any, existingCardNames: Set<string>, missingCards: number, excessCards: number, landCount: number, idealLandCount: number): any {
  // Filter out additions that are already in the deck
  const filteredAdditions = (analysis.additions || [])
    .filter((a: any) => !existingCardNames.has(String(a.name || '').toLowerCase()))
    .map((a: any) => ({
      name: String(a.name || ''),
      reason: String(a.reason || ''),
      type: a.type || null,
      category: a.category || 'Other',
      priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
      edhImpact: typeof a.edhImpact === 'number' ? a.edhImpact : 0.2
    }));

  // Only include additions if deck is incomplete
  const additions = missingCards > 0 ? filteredAdditions.slice(0, Math.max(missingCards + 5, 15)) : [];

  // Filter removals to only cards in deck
  const filteredRemovals = (analysis.removals || [])
    .filter((r: any) => existingCardNames.has(String(r.name || '').toLowerCase()))
    .map((r: any) => ({
      name: String(r.name || ''),
      reason: String(r.reason || ''),
      priority: ['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium',
      edhImpact: typeof r.edhImpact === 'number' ? r.edhImpact : -0.1
    }));

  // Only include removals if deck has too many cards
  const removals = excessCards > 0 ? filteredRemovals.slice(0, Math.max(excessCards + 3, 10)) : [];

  // Filter replacements: remove card must be in deck, add card must not be in deck
  // Sort by priority to ensure consistency
  const filteredReplacements = (analysis.replacements || [])
    .filter((r: any) => 
      existingCardNames.has(String(r.remove || '').toLowerCase()) &&
      !existingCardNames.has(String(r.add || '').toLowerCase())
    )
    .map((r: any) => ({
      remove: String(r.remove || ''),
      removeReason: String(r.removeReason || ''),
      add: String(r.add || ''),
      addBenefit: String(r.addBenefit || ''),
      addType: r.addType || null,
      synergy: r.synergy || null,
      category: r.category || null,
      priority: ['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium',
      edhImpact: typeof r.edhImpact === 'number' ? r.edhImpact : 0.1
    }))
    // Sort by priority for consistency
    .sort((a: any, b: any) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
    });

  // Process land recommendations
  const landDiff = landCount - idealLandCount;
  const landRecommendations = (analysis.landRecommendations || [])
    .filter((l: any) => {
      const name = String(l.name || '').toLowerCase();
      if (l.type === 'add') return !existingCardNames.has(name);
      if (l.type === 'remove') return existingCardNames.has(name);
      return false;
    })
    .map((l: any) => ({
      type: l.type === 'add' ? 'add' : 'remove',
      name: String(l.name || ''),
      reason: String(l.reason || ''),
      priority: ['high', 'medium', 'low'].includes(l.priority) ? l.priority : 'medium',
      category: l.category || 'Basic'
    }));

  return {
    summary: analysis.summary || 'Deck analysis complete.',
    categories: {
      synergy: Math.min(100, Math.max(0, analysis.categories?.synergy || 70)),
      consistency: Math.min(100, Math.max(0, analysis.categories?.consistency || 65)),
      power: Math.min(100, Math.max(0, analysis.categories?.power || 70)),
      interaction: Math.min(100, Math.max(0, analysis.categories?.interaction || 60)),
      manabase: Math.min(100, Math.max(0, analysis.categories?.manabase || 75))
    },
    currentPowerLevel: typeof analysis.currentPowerLevel === 'number' ? analysis.currentPowerLevel : null,
    projectedPowerLevel: typeof analysis.projectedPowerLevel === 'number' ? analysis.projectedPowerLevel : null,
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
    additions,
    removals,
    replacements: filteredReplacements.slice(0, 10),
    landRecommendations: landRecommendations.slice(0, 8),
    landCount,
    idealLandCount
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
  excessCards: number;
  isDeckComplete: boolean;
  typeBreakdown: string;
  lowPlayabilityCards: string[];
  edhAnalysis: any;
  useCollection: boolean;
  collectionCards: string[];
  manaCurve: Record<string, number>;
  avgCMC: number;
  existingCardNames: string[];
  landCount: number;
  idealLandCount: number;
  landDiff: number;
  deckHash: number;
}): string {
  const {
    name, format, commander, cards, power,
    totalWithCommander, requiredCards, missingCards, excessCards, isDeckComplete,
    typeBreakdown, lowPlayabilityCards, edhAnalysis,
    useCollection, collectionCards, manaCurve, avgCMC, existingCardNames,
    landCount, idealLandCount, landDiff, deckHash
  } = params;

  let deckStatus = '✅ Complete';
  let priorityAction = 'SWAPS - optimize card choices';
  
  if (missingCards > 0) {
    deckStatus = `⚠️ INCOMPLETE - needs ${missingCards} more cards`;
    priorityAction = `ADDITIONS - suggest ${missingCards}+ cards to add (no duplicates!)`;
  } else if (excessCards > 0) {
    deckStatus = `⚠️ OVERLOADED - has ${excessCards} too many cards`;
    priorityAction = `REMOVALS - identify ${excessCards}+ cards to cut`;
  }

  // Land status
  let landStatus = '✅ Optimal';
  if (landDiff < -2) landStatus = `⚠️ LOW - needs ${Math.abs(landDiff)} more lands`;
  else if (landDiff > 2) landStatus = `⚠️ HIGH - ${landDiff} too many lands`;

  let prompt = `# Deck Optimization Request
## Consistency Seed: ${deckHash}

## Deck Status: ${deckStatus}
## PRIORITY ACTION: ${priorityAction}

## Deck Information
**Name:** ${name || 'Unnamed Deck'}
**Format:** ${format}
${commander ? `**Commander:** ${commander.name}` : ''}
**Card Count:** ${totalWithCommander}/${requiredCards}
**Target Power Level:** ${power?.score || 'Not specified'}/10

## Mana Base Status: ${landStatus}
**Current Lands:** ${landCount}
**Ideal Lands:** ${idealLandCount}

## Composition
${typeBreakdown}

## Mana Curve (Non-Land)
${Object.entries(manaCurve).map(([cmc, count]) => `CMC ${cmc}: ${count}`).join(' | ')}
**Average CMC:** ${avgCMC.toFixed(2)}

`;

  if (lowPlayabilityCards.length > 0) {
    prompt += `## 🔴 Low Playability Cards
${lowPlayabilityCards.map(c => `- ${c}`).join('\n')}

`;
  }

  if (edhAnalysis) {
    prompt += `## EDH Metrics
- Tipping Point: Turn ${edhAnalysis.tippingPoint || 'N/A'}
- Efficiency: ${edhAnalysis.efficiency || 'N/A'}/10
- Impact: ${edhAnalysis.impact || 'N/A'}/10

`;
  }

  prompt += `## Current Cards (DO NOT SUGGEST THESE AS ADDITIONS)
${existingCardNames.slice(0, 100).join(', ')}

## Complete Card List
${(cards || []).map((c: any) => `- ${c.name}${c.quantity > 1 ? ` (x${c.quantity})` : ''} [${c.type_line || 'Unknown'}]`).join('\n')}

`;

  if (useCollection && collectionCards.length > 0) {
    prompt += `## User's Collection (prefer these)
${collectionCards.slice(0, 100).join(', ')}

`;
  }

  prompt += `## Analysis Requirements

`;

  if (missingCards > 0) {
    prompt += `### PRIORITY: ADDITIONS (deck needs ${missingCards} cards)
Suggest at least ${Math.min(missingCards + 5, 20)} cards to add. Group by category:
- Essential (must-have staples)
- Ramp (mana acceleration)
- Card Draw (card advantage)
- Removal (interaction)
- Creatures (threats/blockers)
- Lands (mana base)

For each addition, estimate the EDH power level impact (+0.1 to +0.5).
CRITICAL: Do NOT suggest any card already in the deck!

`;
  } else if (excessCards > 0) {
    prompt += `### PRIORITY: REMOVALS (deck has ${excessCards} too many cards)
Identify at least ${excessCards + 2} cards that could be cut, prioritized by:
- high: Weakest cards that hurt consistency
- medium: Redundant effects or off-theme cards
- low: Cards that could go but aren't critical cuts

For each removal, estimate the EDH power level impact (usually negative or 0).

`;
  } else {
    prompt += `### PRIORITY: SWAPS (deck is complete - optimize)
Suggest 5-8 card replacements to improve the deck:
- Focus on upgrading low playability cards
- Consider budget and collection availability
- Prioritize synergy with commander

For each swap, estimate the net EDH power level change.

`;
  }

  // Add land recommendation section
  if (Math.abs(landDiff) > 2) {
    prompt += `### LAND RECOMMENDATIONS
Current: ${landCount} lands, Ideal: ${idealLandCount} lands
${landDiff < 0 ? `Suggest ${Math.abs(landDiff)} lands to ADD. Consider:
- Basic lands matching color identity
- Dual lands that enter untapped
- Utility lands that fit the strategy` : 
`Suggest ${landDiff} lands to REMOVE. Prioritize:
- Lands that enter tapped with minimal benefit
- Lands outside color identity
- Excess basic lands`}

`;
  }

  prompt += `### Also provide:
1. Category scores (0-100): synergy, consistency, power, interaction, manabase
2. Current estimated power level (1-10) and projected level after changes
3. 3-5 key strengths
4. 3-5 strategic tips
5. Mana base observations
6. Land recommendations if mana base needs adjustment

All card names MUST be real MTG cards legal in ${format}.`;

  return prompt;

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
