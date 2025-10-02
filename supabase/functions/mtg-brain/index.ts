import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory response cache (resets on cold start, but that's fine)
const responseCache = new Map<string, { data: any; timestamp: number; ttl: number }>();

function getCacheKey(deckId: string | undefined, message: string): string {
  const normalized = message.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  const hash = hashString(normalized);
  return `${deckId || 'no-deck'}:${hash}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCached(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > entry.ttl) {
    responseCache.delete(key);
    return null;
  }
  
  return entry.data;
}

function setCache(key: string, data: any, ttl: number = 300000) { // 5 min default
  responseCache.set(key, { data, timestamp: Date.now(), ttl });
  
  // Keep cache size under control
  if (responseCache.size > 100) {
    const oldest = Array.from(responseCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    responseCache.delete(oldest[0]);
  }
}

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

// Strictly extract cards only from a final "Referenced Cards:" section in the text
const detectReferencedCardsStrict = (text: string): string[] => {
  const match = text.match(/Referenced Cards?:\s*([^\n]*(?:\n(?!\n)[^\n]*)*)/i);
  if (!match) return [];
  const section = match[1];
  const cards = section
    .split(/[;\n]/)
    .flatMap((seg) => seg.split(/\s*•\s*/))
    .map((c) => c.trim().replace(/^[\-•]\s*/, ''))
    .filter((c) => c.length > 1);
  return Array.from(new Set(cards));
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

    // Check cache first
    const cacheKey = getCacheKey(deckContext?.id, message);
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('Cache hit! Returning cached response');
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

    // Detect if user needs full card list (card-specific analysis)
    const needsFullCardList = /(card list|specific cards|which cards|card analysis|cut these|replace these|show me the|what cards)/i.test(message);
    
    // Build CONDENSED system prompt (was 8,000+ tokens, now ~500)
    let systemPrompt = `You are MTG Super Brain, the ultimate Magic: The Gathering expert.

### Core Expertise
**Colors:** W(life/protection/removal), U(draw/control/counter), B(removal/tutors/recursion), R(damage/haste/artifact-hate), G(ramp/creatures/enchantment-hate)

**Commander Essentials:** 36-40 lands, 10-14 ramp, 10-15 draw, 8-12 removal, 3-5 board wipes, clear win conditions

**Mana Curve:** Target 2.8-3.5 avg CMC. Curve peaks at 2-3 CMC for efficient gameplay.

**Archetypes:** Aggro, Midrange, Control, Combo, Tribal, Voltron, Tokens, Aristocrats, Stax, Reanimator, Spellslinger

${deckContext ? `### Current Deck
- Name: ${deckContext.name || 'Unnamed'}
- Format: ${deckContext.format || 'Unknown'}
- Commander: ${deckContext.commander?.name || 'None'}
- Power: ${deckContext.power?.score || '?'}/10
- Cards: ${deckContext.counts?.total || 0} (Lands: ${deckContext.counts?.lands || 0}, Creatures: ${deckContext.counts?.creatures || 0})
- Curve Bins: ${JSON.stringify(deckContext.curve?.bins || {})}
- Mana Sources: ${JSON.stringify(deckContext.mana?.sources || {})}

${needsFullCardList && deckContext.cards?.length > 0 ? 
  `**Card Names:** ${deckContext.cards.map((c: any) => c.name).join(', ').substring(0, 500)}${deckContext.cards.length > 30 ? '...' : ''}` 
  : ''}` 
  : ''}`;

    // Add card context if cards were mentioned
    if (cardContext) {
      systemPrompt += `

## REFERENCED CARDS IN CONVERSATION
The following cards have been mentioned in this conversation:
${cardContext}

When discussing these cards, reference their actual mechanics, costs, and abilities as shown above.`;
    }

    systemPrompt += `

### RESPONSE PROTOCOL
**Style:** ${responseStyle === 'detailed' ? 'COMPREHENSIVE - Use tables, charts, multi-paragraph analysis with specific examples' : 'CONCISE - Bullet points, key takeaways, 2-3 sentences max per section'}
**Structure:** Use ## headings for sections, **bold** critical terms, bullet lists for options
**Card References:** ALWAYS end with "**Referenced Cards:** [Card 1]; [Card 2]; [Card 3]" (semicolon-separated)
**Data Visualization:** Call create_chart() for mana curves, type distribution, CMC analysis. Call create_table() for card comparisons.
**Specificity:** Provide EXACT card names with context (not "add more ramp" → "Add Nature's Lore, Three Visits, or Farseek")
**Power Calibration:** When suggesting upgrades, match user's power target (don't suggest cEDH cards for casual decks)

### COMMON QUERIES & RESPONSES
**"Improve my deck"** → Analyze quotas (ramp, draw, removal), suggest 5-8 specific swaps with reasoning
**"Card suggestions for [theme]"** → Provide 8-12 cards with prices, CMC, and exact synergies
**"Is this deck good?"** → Power level (1-10), strengths, 3 biggest weaknesses, win condition clarity
**"What should I cut?"** → Identify 5-10 underperformers (high CMC, low synergy, win-more cards)
**"Mana base help"** → Calculate color requirements, suggest dual lands, fixing, utility lands

### CRITICAL RULES
1. **NEVER** suggest banned cards in the format being discussed
2. **ALWAYS** consider budget when recommending cards (mention if card is $20+)
3. **GROUND** all advice in the specific commander's strategy and colors
4. **PRIORITIZE** functional upgrades over pet cards or "cool" inclusions
5. **EXPLAIN WHY** - Don't just list cards, explain the strategic reasoning

Base all analysis on tournament-proven strategies, statistical deck construction principles, and the provided deck context.`;


    console.log('Calling Lovable AI Gateway...');
    
    const temperature = responseStyle === 'detailed' ? 0.8 : 0.2;
    const max_tokens = responseStyle === 'detailed' ? 1000 : 400; // Reduced from 2000/600
    
    // Define visual tools for structured output
    const tools = [
      {
        type: "function",
        function: {
          name: "create_chart",
          description: "Create a chart visualization (bar, pie, or line chart) for deck statistics or analysis data",
          parameters: {
            type: "object",
            properties: {
              chart_type: { type: "string", enum: ["bar", "pie", "line"] },
              title: { type: "string", description: "Chart title" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    value: { type: "number" }
                  },
                  required: ["name", "value"]
                }
              }
            },
            required: ["chart_type", "title", "data"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_table",
          description: "Create a data table for card comparisons, deck breakdowns, or structured lists",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Table title" },
              headers: { type: "array", items: { type: "string" } },
              rows: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "string" }
                }
              }
            },
            required: ["title", "headers", "rows"]
          }
        }
      }
    ];
    
    // Build messages array with full conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg: any) => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: message }
    ];
    
    console.log(`Sending ${messages.length} messages to AI (including ${conversationHistory.length} history messages)`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        temperature,
        max_tokens,
        tools
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
          error: 'Payment required: AI usage credits exhausted. Please add credits to your workspace.',
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

    let assistantMessage = aiResponse.choices?.[0]?.message?.content;
    const toolCalls = aiResponse.choices?.[0]?.message?.tool_calls;
    
    // Process tool calls for visual data
    const visualData: any = { charts: [], tables: [] };
    if (toolCalls && Array.isArray(toolCalls)) {
      console.log('Processing tool calls for visual data:', toolCalls.length);
      for (const toolCall of toolCalls) {
        if (toolCall.function?.name === 'create_chart') {
          const args = JSON.parse(toolCall.function.arguments);
          visualData.charts.push({
            type: args.chart_type,
            title: args.title,
            data: args.data
          });
        } else if (toolCall.function?.name === 'create_table') {
          const args = JSON.parse(toolCall.function.arguments);
          visualData.tables.push({
            title: args.title,
            headers: args.headers,
            rows: args.rows
          });
        }
      }
    }

    // Auto-build visuals from deck context when relevant or if the model didn't call tools
    try {
      const wantCurve = /(curve|mana curve|cmc)/i.test(message || '');
      const curveBins = (deckContext?.curve?.bins || deckContext?.curve) as Record<string, number> | undefined;
      if (curveBins && (visualData.charts.length === 0 || wantCurve)) {
        const chartData = Object.entries(curveBins).map(([name, value]) => ({ name: String(name), value: Number(value || 0) }));
        visualData.charts.push({ type: 'bar', title: 'CMC Distribution', data: chartData });
      }

      const wantColors = /(color|pip|mana sources|color distribution)/i.test(message || '');
      const src = deckContext?.mana?.sources as Record<string, number> | undefined;
      if (src && (visualData.charts.length < 2 || wantColors)) {
        const keys = ['W','U','B','R','G','C'];
        const data = keys.filter(k => src[k] !== undefined).map(k => ({ name: k, value: Number(src[k] || 0) }));
        if (data.length) visualData.charts.push({ type: 'pie', title: 'Mana Sources by Color', data });
      }
    } catch (e) {
      console.log('Auto-visual generation failed (non-fatal):', e);
    }
    
    if (!assistantMessage) {
      throw new Error('No response content from AI');
    }

    // Re-detect cards from the assistant's response STRICTLY from the "Referenced Cards:" section
    let responseCardMentions = detectReferencedCardsStrict(assistantMessage);
    console.log('Cards detected from AI response (strict):', responseCardMentions);
    
    // Always clear any previously collected card data to avoid mismatches
    cardData.length = 0;

    if (responseCardMentions.length > 0) {
      console.log('Rebuilding cards from AI referenced list with smart comma-join + de-dup...');

      const segments = responseCardMentions.map((s) => s.trim()).filter(Boolean);
      const seen = new Set<string>();

      for (let i = 0; i < segments.length; i++) {
        let name = segments[i];
        let fetched: any = null;

        // Try to merge with next token to handle names like "Tevesh Szat, Doom of Fools"
        if (i + 1 < segments.length) {
          const combined = `${name}, ${segments[i + 1]}`.trim();
          try {
            const card = await scryfallAPI.getCardByName(combined);
            if (card && typeof card.name === 'string' && card.name.toLowerCase().startsWith(name.toLowerCase() + ',')) {
              fetched = card;
              i++; // consume next segment
            }
          } catch (_) {
            // ignore and fall back to single-token lookup
          }
        }

        // Fallback: try current token as-is
        if (!fetched) {
          try {
            fetched = await scryfallAPI.getCardByName(name);
          } catch (_) {
            console.log(`Could not find card: ${name}`);
            continue;
          }
        }

        if (fetched && !seen.has(fetched.id)) {
          seen.add(fetched.id);
          cardData.push({
            id: fetched.id,
            set: fetched.set,
            collector_number: fetched.collector_number,
            name: fetched.name,
            image_uri: fetched.image_uris?.normal || fetched.image_uris?.large,
            image_uris: fetched.image_uris || null,
            mana_cost: fetched.mana_cost,
            type_line: fetched.type_line,
            oracle_text: fetched.oracle_text,
            power: fetched.power,
            toughness: fetched.toughness,
            cmc: fetched.cmc,
            colors: fetched.colors,
            rarity: fetched.rarity,
          });
        }
      }
    } else {
      // Fallback: try general detection from the assistant message body and fetch cards
      const fallbackNames = detectCardMentions(assistantMessage).slice(0, 12);
      console.log('No strict list found. Fallback detected names:', fallbackNames);
      for (const name of fallbackNames) {
        try {
          const c = await scryfallAPI.getCardByName(name);
          cardData.push({
            id: c.id,
            set: c.set,
            collector_number: c.collector_number,
            name: c.name,
            image_uri: c.image_uris?.normal || c.image_uris?.large,
            image_uris: c.image_uris || null,
            mana_cost: c.mana_cost,
            type_line: c.type_line,
            oracle_text: c.oracle_text,
            power: c.power,
            toughness: c.toughness,
            cmc: c.cmc,
            colors: c.colors,
            rarity: c.rarity,
          });
        } catch (_) {
          console.log(`Fallback could not find card: ${name}`);
        }
      }

      if (cardData.length === 0) {
        console.log('No cards could be extracted from message.');
      } else {
        // Ensure the assistant message ends with a Referenced Cards section so the UI can parse next time
        if (!/Referenced Cards?:/i.test(assistantMessage)) {
          assistantMessage = `${assistantMessage.trim()}\n\nReferenced Cards: ${cardData.map((c:any) => c.name).join('; ')}`;
        }
      }
    }

    // If the user asked about commanders, ensure we only surface legal commanders
    const commanderIntent = /(\bcommander\b|\bedh\b|\bgeneral\b)/i.test(message || '');
    if (commanderIntent && cardData.length) {
      const isLegalCommander = (c: any) => {
        const tl = (c.type_line || '').toLowerCase();
        const ot = (c.oracle_text || '').toLowerCase();
        const isLegendaryCreature = tl.includes('legendary creature');
        const hasCommanderText = ot.includes('can be your commander');
        const isPlaneswalkerCommander = tl.includes('planeswalker') && hasCommanderText;
        return isLegendaryCreature || isPlaneswalkerCommander || hasCommanderText;
      };

      const filtered = cardData.filter(isLegalCommander);
      if (filtered.length !== cardData.length) {
        // Rebuild the Referenced Cards section to match the filtered list
        const names = filtered.map((c: any) => c.name);
        const refSection = `Referenced Cards: ${names.join('; ')}`;
        if (/Referenced Cards?:/i.test(assistantMessage)) {
          assistantMessage = assistantMessage.replace(/Referenced Cards?:\s*([^\n]*(?:\n(?!\n)[^\n]*)*)/i, refSection);
        } else {
          assistantMessage = `${assistantMessage.trim()}\n\n${refSection}`;
        }
        cardData.length = 0;
        cardData.push(...filtered);
      }
    }

    const result = { 
      message: assistantMessage,
      cards: cardData,
      visualData: (visualData.charts.length > 0 || visualData.tables.length > 0) ? visualData : null,
      success: true 
    };
    
    // Cache the response
    setCache(cacheKey, result);
    
    return new Response(JSON.stringify(result), {
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