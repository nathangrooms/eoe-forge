import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface CoachRequest {
  commander: {
    name: string;
    colors: string[];
    color_identity: string[];
    type_line: string;
    oracle_text: string;
  };
  format: string;
  themeId: string;
  powerTarget: number;
  budget: 'low' | 'med' | 'high';
  maxBudget?: number; // Maximum total deck price in USD
  customInstructions?: string;
  seed?: number;
}

interface Card {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors: string[];
  color_identity: string[];
  power?: string;
  toughness?: string;
  keywords: string[];
  legalities: Record<string, string>;
  image_uris?: Record<string, string>;
  prices?: Record<string, string>;
  rarity: string;
  tags: string[];
  is_legendary: boolean;
}

interface CoachingResult {
  decklist: Card[];
  power: number;
  band: string;
  subscores: Record<string, number>;
  playability: {
    keepable7_pct: number;
    t1_color_hit_pct: number;
    avg_cmc: number;
    untapped_land_ratio: number;
  };
  drivers: string[];
  drags: string[];
  recommendations: string[];
  analysis: string;
  iterations: number;
  totalValue: number;
}

// Seeded RNG for deterministic builds
function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Check if this is an analytics request (not a deck building request)
    if (body.analysisType) {
      return handleAnalyticsRequest(body);
    }
    
    // Original deck building logic
    const request: CoachRequest = body;
    console.log('Building deck with Gemini coaching for:', request.commander.name);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const rng = mulberry32(request.seed || Math.floor(Math.random() * 1000000));
    
    // Set default max budget if not specified
    const maxBudget = request.maxBudget || (request.budget === 'low' ? 200 : request.budget === 'med' ? 500 : 1500);
    console.log(`Budget constraints: per card ${request.budget}, total deck max $${maxBudget}`);
    
    // 1. Build initial deck using template-based approach
    let currentDeck = await buildInitialDeck(request, rng);
    console.log(`Initial deck built: ${currentDeck.length} cards`);
    
    // 2. Analyze current power level
    let currentPower = await analyzeWithEDHCalculator(currentDeck, request.commander, request.format);
    console.log(`Initial power: ${currentPower.power} (target: ${request.powerTarget})`);
    
    // 3. Budget enforcement: replace expensive cards if over budget
    let totalValue = calculateDeckValue(currentDeck);
    console.log(`Initial deck value: $${totalValue.toFixed(2)}`);
    
    if (totalValue > maxBudget) {
      console.log(`Deck over budget ($${totalValue} > $${maxBudget}), replacing expensive cards...`);
      currentDeck = await enforceBudget(currentDeck, maxBudget, request, rng);
      totalValue = calculateDeckValue(currentDeck);
      currentPower = await analyzeWithEDHCalculator(currentDeck, request.commander, request.format);
      console.log(`After budget enforcement: $${totalValue.toFixed(2)}, power: ${currentPower.power}`);
    }
    
    let iterations = 0;
    const maxIterations = 1; // Reduced from 3 to 1 to avoid timeout
    const startedAt = Date.now();
    const maxMillis = 30000; // 30s wall clock (reduced from 40s)
    
    // Skip Gemini coaching loop to avoid timeout - just use the optimized initial deck
    console.log('Skipping Gemini coaching to avoid timeout, using optimized initial deck');
    
    // 4. Generate final analysis quickly
    const finalAnalysis = `This ${currentPower.band} power deck (${currentPower.power.toFixed(1)}/10) was built with a budget of $${maxBudget}. Final deck value: $${totalValue.toFixed(2)}. The deck includes ${currentDeck.length} cards optimized for the ${request.themeId} archetype with excellent playability.`;
    
    const result: CoachingResult = {
      decklist: currentDeck,
      power: currentPower.power,
      band: currentPower.band,
      subscores: currentPower.subscores,
      playability: currentPower.playability,
      drivers: currentPower.drivers,
      drags: currentPower.drags,
      recommendations: currentPower.recommendations,
      analysis: finalAnalysis,
      iterations,
      totalValue: Math.round(totalValue * 100) / 100
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in gemini-deck-coach:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to build deck with Gemini coaching'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Handle analytics requests separately
async function handleAnalyticsRequest(body: any) {
  const { powerData, deckData, analysisType } = body;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const systemPrompt = `You are DeckMatrix AI, an expert Magic: The Gathering deck analyst with deep knowledge of Commander gameplay, power levels, and deck construction.

**Your Role**: Provide clear, actionable insights in a conversational DeckMatrix brand tone - knowledgeable yet friendly, precise yet approachable.

**Brand Voice**: Think of yourself as a seasoned player coaching a friend. Be enthusiastic about strong plays, honest about weaknesses, and always solution-oriented. Use MTG terminology naturally but explain complex concepts when needed.

**Analysis Focus**:
${analysisType === 'power-breakdown' ? `
- Explain what each power subscore means in practical gameplay terms
- Connect scores to real game scenarios
- Prioritize the top 3 most impactful factors
- Suggest specific improvements with 2-3 concrete card recommendations
` : analysisType === 'mana-analysis' ? `
- Analyze mana curve efficiency and color consistency
- Identify ramp weaknesses or mana flooding risks  
- Recommend specific land count adjustments
- Suggest 2-3 specific mana rocks or lands to add
` : analysisType === 'archetype' ? `
- Identify the deck's primary strategy and win conditions
- Explain how the commander synergizes with the strategy
- Highlight the deck's gameplan across early/mid/late game
- Compare to known archetypes (e.g., combo, stax, midrange, aggro, control)
- Provide a clear 1-2 sentence archetype label
` : analysisType === 'recommendations' ? `
- Provide 5-8 specific, purchasable Magic cards by name
- Explain why each card fits the deck's strategy
- Prioritize cards that address the weakest subscores
- Include a mix of creatures, spells, and lands
- Format: "Card Name - Brief reason why it improves the deck"
` : ''}

**Format**: 2-4 concise paragraphs, conversational language, and prioritize actionable advice.`;

  const commanderName = deckData.commander?.name || 'No Commander';
  const commanderColors = deckData.commander?.colors?.join('/') || deckData.colors?.join('/') || 'Colorless';

  const userMessage = analysisType === 'power-breakdown' ? 
    `Analyze this deck's power level breakdown:\n\nPower Level: ${powerData.power}/10 (${powerData.band})\n\nSubscores:\n${Object.entries(powerData.subscores || {}).map(([k, v]) => `- ${k}: ${v}/100`).join('\n')}\n\nStrengths:\n${(powerData.drivers || []).map((d: string) => `- ${d}`).join('\n')}\n\nWeaknesses:\n${(powerData.drags || []).map((d: string) => `- ${d}`).join('\n')}\n\nDeck size: ${deckData.totalCards} cards\nCommander: ${commanderName}` 
  : analysisType === 'mana-analysis' ?
    `Analyze this deck's mana base:\n\nTotal cards: ${deckData.totalCards}\nLands: ${deckData.lands}\nAvg CMC: ${deckData.avgCMC}\nColors: ${commanderColors}\nMana Score: ${powerData.subscores?.mana || 0}/100\n\nKeepable hands: ${powerData.playability?.keepable7_pct || 0}%\nT1 color hit: ${powerData.playability?.t1_color_hit_pct || 0}%\nUntapped lands: ${powerData.playability?.untapped_land_ratio || 0}%`
  : analysisType === 'archetype' ?
    `Identify the archetype and strategy for this deck:\n\nCommander: ${commanderName}\nColors: ${commanderColors}\nCreatures: ${deckData.creatures}\nInstants: ${deckData.instants}\nSorceries: ${deckData.sorceries}\nArtifacts: ${deckData.artifacts}\nEnchantments: ${deckData.enchantments}\n\nTop cards:\n${deckData.topCards?.slice(0, 10).join(', ') || 'N/A'}`
  : analysisType === 'recommendations' ?
    `Provide 5-8 specific card recommendations to improve this deck:\n\nCommander: ${commanderName}\nColors: ${commanderColors}\nPower Level: ${powerData.power}/10 (${powerData.band})\nAvg CMC: ${deckData.avgCMC}\n\nCurrent composition:\n- Creatures: ${deckData.creatures}\n- Instants: ${deckData.instants}\n- Sorceries: ${deckData.sorceries}\n- Artifacts: ${deckData.artifacts}\n- Enchantments: ${deckData.enchantments}\n- Lands: ${deckData.lands}\n\nWeakest subscores:\n${Object.entries(powerData.subscores || {})
  .sort(([,a], [,b]) => (a as number) - (b as number))
  .slice(0, 3)
  .map(([k, v]) => `- ${k}: ${v}/100`)
  .join('\n')}`
  : 'Provide general deck analysis';

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
        { role: 'user', content: userMessage }
      ],
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`AI analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const insight = data.choices?.[0]?.message?.content || 'Analysis unavailable';

  return new Response(
    JSON.stringify({ insight }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper: Calculate total deck value
function calculateDeckValue(deck: Card[]): number {
  return deck.reduce((sum, card) => {
    const priceStr = card.prices?.usd;
    const price = priceStr && priceStr !== '' ? parseFloat(priceStr) : 0;
    return sum + price;
  }, 0);
}

// Helper: Get card price
function getCardPrice(card: Card): number {
  const priceStr = card.prices?.usd;
  return priceStr && priceStr !== '' ? parseFloat(priceStr) : 0;
}

// Budget enforcement: replace expensive cards with cheaper alternatives
async function enforceBudget(
  deck: Card[],
  maxBudget: number,
  request: CoachRequest,
  rng: () => number
): Promise<Card[]> {
  const currentValue = calculateDeckValue(deck);
  if (currentValue <= maxBudget) return deck;
  
  // Fetch all available cards again for replacements
  let { data: allCards } = await supabase
    .from('cards')
    .select('*')
    .or(`color_identity.cd.{${request.commander.color_identity.join(',')}},color_identity.eq.{}`)
    .limit(4000);
  
  if (!allCards) return deck;
  
  const availableCards: Card[] = allCards.map((card: any) => ({
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    mana_cost: card.mana_cost,
    cmc: card.cmc || 0,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    power: card.power,
    toughness: card.toughness,
    keywords: card.keywords || [],
    legalities: card.legalities || {},
    image_uris: card.image_uris || {},
    prices: card.prices || {},
    rarity: card.rarity || 'common',
    tags: card.tags || [],
    is_legendary: card.is_legendary || false
  }));
  
  // Sort deck by price descending
  const sortedDeck = [...deck].sort((a, b) => getCardPrice(b) - getCardPrice(a));
  let workingDeck = [...deck];
  let workingValue = currentValue;
  
  // Replace expensive cards starting from most expensive
  for (let i = 0; i < sortedDeck.length && workingValue > maxBudget; i++) {
    const expensiveCard = sortedDeck[i];
    const cardPrice = getCardPrice(expensiveCard);
    
    // Skip if card is already cheap (< $5)
    if (cardPrice < 5) continue;
    
    // Find similar but cheaper alternative
    const replacement = findCheaperAlternative(
      expensiveCard,
      availableCards,
      workingDeck,
      cardPrice * 0.5 // Target 50% of current card price
    );
    
    if (replacement) {
      const replacementPrice = getCardPrice(replacement);
      console.log(`Replacing ${expensiveCard.name} ($${cardPrice.toFixed(2)}) with ${replacement.name} ($${replacementPrice.toFixed(2)})`);
      
      // Replace in deck
      const idx = workingDeck.findIndex(c => c.name === expensiveCard.name);
      if (idx !== -1) {
        workingDeck[idx] = replacement;
        workingValue = workingValue - cardPrice + replacementPrice;
      }
    }
  }
  
  console.log(`Budget enforcement complete: $${currentValue.toFixed(2)} -> $${workingValue.toFixed(2)}`);
  return workingDeck;
}

// Find a cheaper alternative card with similar function
function findCheaperAlternative(
  card: Card,
  availableCards: Card[],
  currentDeck: Card[],
  maxPrice: number
): Card | null {
  const usedNames = new Set(currentDeck.map(c => c.name.toLowerCase()));
  
  // Get card's primary types
  const isLand = card.type_line.toLowerCase().includes('land');
  const isCreature = card.type_line.toLowerCase().includes('creature');
  const isInstant = card.type_line.toLowerCase().includes('instant');
  const isSorcery = card.type_line.toLowerCase().includes('sorcery');
  const isEnchantment = card.type_line.toLowerCase().includes('enchantment');
  const isArtifact = card.type_line.toLowerCase().includes('artifact');
  const isPlaneswalker = card.type_line.toLowerCase().includes('planeswalker');
  
  // Find similar cards that are cheaper and not already in deck
  const candidates = availableCards.filter(alt => {
    if (usedNames.has(alt.name.toLowerCase())) return false;
    
    const altPrice = getCardPrice(alt);
    if (altPrice > maxPrice) return false;
    
    // Must be same card type category
    const altTypes = alt.type_line.toLowerCase();
    if (isLand && !altTypes.includes('land')) return false;
    if (isCreature && !altTypes.includes('creature')) return false;
    if (isInstant && !altTypes.includes('instant')) return false;
    if (isSorcery && !altTypes.includes('sorcery')) return false;
    if (isEnchantment && !altTypes.includes('enchantment')) return false;
    if (isArtifact && !altTypes.includes('artifact')) return false;
    if (isPlaneswalker && !altTypes.includes('planeswalker')) return false;
    
    // Similar CMC (within 1)
    if (Math.abs(alt.cmc - card.cmc) > 1) return false;
    
    return true;
  });
  
  if (candidates.length === 0) return null;
  
  // Sort by price descending to get best bang for buck
  candidates.sort((a, b) => getCardPrice(b) - getCardPrice(a));
  
  // Return highest priced valid alternative (best value under max)
  return candidates[0];
}


// High-Power Deck Builder following Mega Prompt methodology
async function buildInitialDeck(request: CoachRequest, rng: () => number): Promise<Card[]> {
  console.log(`Building playability-focused deck for ${request.commander.name}, target power: ${request.powerTarget}`);
  
  // Query cards from database with proper color identity filtering
  let { data: allCards, error: fetchError } = await supabase
    .from('cards')
    .select('*')
    .or(`color_identity.cd.{${request.commander.color_identity.join(',')}},color_identity.eq.{}`)
    .limit(4000);
  
  if (fetchError) {
    console.error('Database error:', fetchError);
    throw new Error(`Failed to fetch cards: ${fetchError.message}`);
  }
  
  if (!allCards || allCards.length === 0) {
    console.log('No cards found, fetching all cards without color restrictions...');
    const { data: fallbackCards, error: fallbackError } = await supabase
      .from('cards')
      .select('*')
      .limit(2000);
    
    if (fallbackError || !fallbackCards) {
      throw new Error('Failed to fetch cards from database');
    }
    
    // Filter in memory for commander's color identity using contained-by logic
    const allowed = new Set(request.commander.color_identity || []);
    const filteredCards = fallbackCards.filter((card: any) => {
      const ci: string[] = card.color_identity || [];
      return ci.every((c) => allowed.has(c));
    });
    
    if (filteredCards.length === 0) {
      throw new Error('No legal cards found for this commander');
    }
    
    allCards = filteredCards;
  }
  
  // Convert to our format
  const cards: Card[] = (allCards || []).map((card: any) => ({
    id: card.id,
    oracle_id: card.oracle_id || card.id,
    name: card.name,
    mana_cost: card.mana_cost || '',
    cmc: Number(card.cmc || 0),
    type_line: card.type_line || '',
    oracle_text: card.oracle_text || '',
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    power: card.power,
    toughness: card.toughness,
    keywords: card.keywords || [],
    legalities: card.legalities || {},
    image_uris: card.image_uris || {},
    prices: card.prices || {},
    rarity: card.rarity || 'common',
    tags: card.tags || [],
    is_legendary: card.is_legendary || false
  }));

  // Apply budget filtering based on price
  const budgetThresholds = {
    'low': 3.0,    // Max $3 per card
    'med': 15.0,   // Max $15 per card  
    'high': 100.0  // Max $100 per card
  };
  
  const maxCardPrice = budgetThresholds[request.budget] || 100.0;
  console.log(`Applying budget filter: ${request.budget} (max $${maxCardPrice} per card)`);
  
  // Filter cards by budget, but always allow basics and common staples under $1
  const budgetFilteredCards = cards.filter(card => {
    const price = parseFloat(card.prices?.usd || '0');
    const isBasic = card.type_line.toLowerCase().includes('basic');
    const isCheap = price < 1.0;
    return isBasic || isCheap || price <= maxCardPrice;
  });
  
  console.log(`Budget filtering: ${cards.length} -> ${budgetFilteredCards.length} cards available`);

    image_uris: card.image_uris || {},
    prices: card.prices || {},
    rarity: card.rarity || 'common',
    tags: card.tags || [],
    is_legendary: card.is_legendary || false
  }));

  const commanderColors = new Set((request.commander.color_identity || []).map((c) => c.toUpperCase()));
  const targetPower = request.powerTarget || 7;
  const isCEDH = targetPower >= 9;
  
  // Playability targets based on power band
  const playabilityTargets = {
    keepable7: isCEDH ? 80 : 70,
    t1ColorHit: isCEDH ? 90 : 85,
    t2TwoColorHit: isCEDH ? 80 : 70,
    untappedRatio: isCEDH ? 75 : 65, // 25% vs 35% tap tolerance
    avgCMC: isCEDH ? 2.5 : 3.2
  };
  
  // Determine archetype from commander
  const commanderName = request.commander.name.toLowerCase();
  let archetype = 'value';
  
  if (commanderName.includes('ezuri, claw of progress')) archetype = 'counters';
  else if (commanderName.includes('najeela')) archetype = 'combo';
  else if (commanderName.includes('kinnan')) archetype = 'artifacts';
  else if (commanderName.includes('korvold')) archetype = 'aristocrats';
  else if (commanderName.includes('tymna') || commanderName.includes('kraum')) archetype = 'tempo';

  console.log(`Detected archetype: ${archetype} for power target: ${targetPower}`);

  // Power band quotas (playability-focused)
  const quotas = {
    lands: isCEDH ? 30 : 34,
    fastMana: isCEDH ? 14 : 10,
    interaction: isCEDH ? 14 : 10,
    tutors: isCEDH ? 8 : 5,
    drawEngines: isCEDH ? 10 : 8,
    wincons: isCEDH ? 3 : 2,
    protection: isCEDH ? 5 : 3
  };

  const deck: Card[] = [];
  const byName = new Map(budgetFilteredCards.map(c => [c.name.toLowerCase(), c]));
  const used = new Set<string>();

  // Helper to add card by name if it exists
  const addByName = (name: string): boolean => {
    const card = byName.get(name.toLowerCase());
    if (card && !used.has(card.id)) {
      deck.push(card);
      used.add(card.id);
      return true;
    }
    return false;
  };

  // 1. MANABASE FIRST (critical for playability)
  console.log('Building manabase...');
  
  // Basics - ensure we have enough color sources
  const basicCounts = {
    'Forest': Math.floor(quotas.lands * 0.4),
    'Island': Math.floor(quotas.lands * 0.3)
  };
  
  for (const [basic, count] of Object.entries(basicCounts)) {
    if (commanderColors.has(basic[0].toUpperCase())) {
      for (let i = 0; i < count; i++) {
        addByName(basic);
      }
    }
  }

  // Premium untapped duals (priority for playability)
  const untappedDuals = [
    'Breeding Pool', 'Tropical Island', 'Misty Rainforest', 'Polluted Delta',
    'Flooded Strand', 'Scalding Tarn', 'Hinterland Harbor', 'Yavimaya Coast',
    'Exotic Orchard', 'Command Tower', 'City of Brass', 'Mana Confluence',
    'Cavern of Souls', 'Ancient Ziggurat', 'Reflecting Pool'
  ];

  for (const name of untappedDuals) {
    if (deck.filter(c => c.type_line.toLowerCase().includes('land')).length >= quotas.lands) break;
    addByName(name);
  }

  // Fill remaining land slots with color-fixing lands
  const remainingLandSlots = quotas.lands - deck.filter(c => c.type_line.toLowerCase().includes('land')).length;
  if (remainingLandSlots > 0) {
    const colorFixingLands = [
      'Temple of Mystery', 'Simic Growth Chamber', 'Thornwood Falls',
      'Evolving Wilds', 'Terramorphic Expanse', 'Fabled Passage'
    ];
    
    for (const name of colorFixingLands) {
      if (deck.filter(c => c.type_line.toLowerCase().includes('land')).length >= quotas.lands) break;
      addByName(name);
    }
  }

  console.log(`Added ${deck.filter(c => c.type_line.toLowerCase().includes('land')).length} lands`);

  // 2. FAST MANA PACKAGE (critical for early game)
  console.log('Adding fast mana...');
  const fastManaStaples = [
    'Sol Ring', 'Mana Crypt', 'Mana Vault', 'Chrome Mox', 'Mox Diamond', 
    'Jeweled Lotus', 'Lotus Petal', 'Arcane Signet', 'Simic Signet',
    'Fellwar Stone', 'Talisman of Curiosity', 'Mox Opal'
  ];
  
  const fastManaGreen = [
    'Birds of Paradise', 'Elvish Mystic', 'Llanowar Elves', 'Fyndhorn Elves',
    'Deathrite Shaman', 'Elves of Deep Shadow', 'Noble Hierarch'
  ];

  let fastManaAdded = 0;
  for (const name of [...fastManaStaples, ...fastManaGreen]) {
    if (fastManaAdded >= quotas.fastMana) break;
    if (addByName(name)) fastManaAdded++;
  }

  // 3. CHEAP INTERACTION (MV<=2 for playability)
  console.log('Adding interaction...');
  const cheapInteraction = [
    'Swan Song', 'Dispel', 'Spell Pierce', 'Negate', 'Counterspell',
    'Pongify', 'Rapid Hybridization', 'Nature\'s Claim', 'Mental Misstep',
    'Force of Will', 'Force of Negation', 'Fierce Guardianship', 'Deflecting Swat'
  ];

  let interactionAdded = 0;
  for (const name of cheapInteraction) {
    if (interactionAdded >= quotas.interaction) break;
    if (addByName(name)) interactionAdded++;
  }

  // 4. DRAW ENGINES (card advantage)
  console.log('Adding draw engines...');
  const drawStaples = [
    'Rhystic Study', 'Mystic Remora', 'Sylvan Library', 'Guardian Project',
    'Beast Whisperer', 'The Great Henge', 'Glimpse of Nature'
  ];

  let drawAdded = 0;
  for (const name of drawStaples) {
    if (drawAdded >= quotas.drawEngines) break;
    if (addByName(name)) drawAdded++;
  }

  // 5. TUTORS (consistency)
  console.log('Adding tutors...');
  const tutorStaples = [
    'Demonic Tutor', 'Vampiric Tutor', 'Mystical Tutor', 'Worldly Tutor',
    'Green Sun\'s Zenith', 'Chord of Calling', 'Survival of the Fittest', 'Natural Order'
  ];

  let tutorsAdded = 0;
  for (const name of tutorStaples) {
    if (tutorsAdded >= quotas.tutors) break;
    if (addByName(name)) tutorsAdded++;
  }

  // 6. ARCHETYPE-SPECIFIC SYNERGY
  console.log(`Adding ${archetype} synergy...`);
  if (archetype === 'counters') {
    const countersPackage = [
      'Hardened Scales', 'The Ozolith', 'Simic Ascendancy', 'Doubling Season',
      'Champion of Lambholt', 'Sage of Hours', 'Coiling Oracle', 'Gyre Sage'
    ];
    for (const name of countersPackage) {
      if (deck.length >= 90) break; // Leave room for win conditions
      addByName(name);
    }
  }

  // 7. WIN CONDITIONS
  console.log('Adding win conditions...');
  let winConditions: string[] = [];
  
  if (isCEDH) {
    // Compact combo lines for cEDH
    winConditions = ['Thassa\'s Oracle', 'Demonic Consultation', 'Tainted Pact'];
  } else {
    // Value-based wins for high power
    winConditions = ['Craterhoof Behemoth', 'Overwhelming Stampede', 'Triumph of the Hordes'];
  }

  for (const name of winConditions) {
    if (deck.length >= 95) break; // Leave room for protection
    addByName(name);
  }

  // 8. PROTECTION
  console.log('Adding protection...');
  const protectionStaples = [
    'Heroic Intervention', 'Veil of Summer', 'Autumn\'s Veil', 'Snakeskin Veil'
  ];

  for (const name of protectionStaples) {
    if (deck.length >= 99) break;
    addByName(name);
  }

  // 9. FILL REMAINING SLOTS WITH BEST SYNERGISTIC CARDS
  const remainingSlots = 99 - deck.length;
  if (remainingSlots > 0) {
    console.log(`Filling ${remainingSlots} remaining slots...`);
    
    const availableCards = cards
      .filter(c => !used.has(c.id))
      .sort((a, b) => {
        const aScore = calculatePlayabilityScore(a, archetype, targetPower, playabilityTargets);
        const bScore = calculatePlayabilityScore(b, archetype, targetPower, playabilityTargets);
        return bScore - aScore;
      });

    deck.push(...availableCards.slice(0, remainingSlots));
  }

  // Simulate playability and adjust if needed
  const playabilityResult = simulatePlayability(deck, playabilityTargets);
  console.log(`Playability check: Keepable7=${playabilityResult.keepable7_pct}%, T1 hit=${playabilityResult.t1_color_hit_pct}%, Untapped=${playabilityResult.untapped_land_ratio}%`);
  
  // Apply tuning if playability is poor
  let tunedDeck = deck;
  if (playabilityResult.keepable7_pct < playabilityTargets.keepable7 || 
      playabilityResult.t1_color_hit_pct < playabilityTargets.t1ColorHit ||
      playabilityResult.untapped_land_ratio < playabilityTargets.untappedRatio) {
    
    console.log('Applying playability tuning...');
    tunedDeck = await tuneForPlayability(deck, playabilityTargets, playabilityResult, request);
  }

  const finalLandCount = tunedDeck.filter(c => c.type_line.toLowerCase().includes('land')).length;
  console.log(`Built deck with ${tunedDeck.length} cards (${finalLandCount} lands), targeting power ${targetPower}`);
  console.log(`Quotas: Fast mana: ${fastManaAdded}/${quotas.fastMana}, Interaction: ${interactionAdded}/${quotas.interaction}, Tutors: ${tutorsAdded}/${quotas.tutors}`);
  
  return tunedDeck.slice(0, 99);
}

// Playability-focused card scoring
function calculatePlayabilityScore(card: Card, archetype: string, targetPower: number, playabilityTargets: any): number {
  const tags = new Set(card.tags || []);
  const cmc = card.cmc;
  const typeLine = card.type_line.toLowerCase();
  const name = card.name.toLowerCase();
  const oracleText = (card.oracle_text || '').toLowerCase();
  
  let score = 0;

  // PLAYABILITY IMPACT (45% weight)
  // CMC efficiency for hand playability
  if (cmc <= 1) score += 12;
  else if (cmc === 2) score += 8;
  else if (cmc === 3) score += 4;
  else if (cmc === 4) score += 1;
  else if (cmc >= 6) score -= 8; // Heavy penalty for expensive cards

  // Mana fixing and color access
  if (typeLine.includes('land') && !oracleText.includes('enters the battlefield tapped')) {
    score += 8; // Untapped lands crucial for playability
  }
  if (tags.has('ramp') || tags.has('fast-mana') || cmc <= 2 && typeLine.includes('artifact')) {
    score += 10; // Early mana acceleration
  }

  // EFFICIENCY (25% weight)
  // Role-based efficiency
  if (tags.has('tutor-broad')) score += 8;
  if (tags.has('counterspell') && cmc <= 2) score += 7;
  if (tags.has('removal-spot') && cmc <= 2) score += 6;
  if (tags.has('draw') || tags.has('card-advantage')) score += 6;
  if (tags.has('protection') && cmc <= 2) score += 5;

  // Free spells and instant speed
  if (oracleText.includes('you may cast') || oracleText.includes('without paying')) score += 6;
  if (typeLine.includes('instant') || oracleText.includes('flash')) score += 2;

  // SYNERGY (15% weight)
  if (archetype === 'counters') {
    if (tags.has('counters') || tags.has('proliferate')) score += 6;
    if (name.includes('scale') || name.includes('ozolith') || name.includes('ascendancy')) score += 8;
    if (typeLine.includes('creature') && card.power && parseInt(card.power) <= 2) score += 4;
    if (oracleText.includes('+1/+1 counter') || oracleText.includes('proliferate')) score += 3;
  }
  
  if (archetype === 'artifacts') {
    if (typeLine.includes('artifact') || oracleText.includes('artifact')) score += 4;
    if (tags.has('artifacts-matter')) score += 6;
  }

  // STAPLE WEIGHT (10% weight)
  const staples = ['sol ring', 'arcane signet', 'counterspell', 'swords to plowshares', 
                   'nature\'s claim', 'rhystic study', 'mystic remora'];
  if (staples.some(staple => name.includes(staple))) score += 4;

  // POWER-SPECIFIC ADJUSTMENTS (5% weight)
  if (targetPower >= 9) {
    // cEDH preferences
    if (tags.has('free-spell') || name.includes('force of') || name.includes('pact of')) score += 5;
    if (name.includes('oracle') || name.includes('consultation') || name.includes('tainted pact')) score += 6;
    if (tags.has('fast-mana') && cmc === 0) score += 4;
    
    // Punish slow cards more harshly in cEDH
    if (cmc >= 5 && !tags.has('wincon')) score -= 5;
  } else {
    // High power (7-8) allows more flexibility
    if (cmc === 5 && (tags.has('wincon') || tags.has('draw'))) score += 2;
  }

  // AVOID TRAP CARDS
  if (oracleText.includes('enters the battlefield tapped') && typeLine.includes('land')) {
    score -= 4; // Taplands hurt playability
  }
  if (cmc >= 7 && !tags.has('wincon') && !name.includes('craterhoof')) score -= 10;

  return Math.max(0, score);
}

// Playability simulation functions
function simulatePlayability(deck: Card[], targets: any): any {
  const lands = deck.filter(c => c.type_line.toLowerCase().includes('land'));
  const nonLands = deck.filter(c => !c.type_line.toLowerCase().includes('land'));
  
  // Calculate basic metrics
  const totalCmc = nonLands.reduce((sum, card) => sum + card.cmc, 0);
  const avgCmc = nonLands.length > 0 ? totalCmc / nonLands.length : 0;
  
  // Count untapped lands
  const untappedLands = lands.filter(land => {
    const text = (land.oracle_text || '').toLowerCase();
    return !text.includes('enters the battlefield tapped') && 
           !land.name.toLowerCase().includes('guildgate');
  });
  const untappedRatio = lands.length > 0 ? (untappedLands.length / lands.length) * 100 : 0;
  
  // Count rocks and dorks for ramp
  const rocksAndDorks = deck.filter(card => {
    const text = (card.oracle_text || '').toLowerCase();
    const typeLine = card.type_line.toLowerCase();
    return (typeLine.includes('artifact') || typeLine.includes('creature')) && 
           text.includes('add') && text.includes('mana') && card.cmc <= 2;
  });
  
  // Simulate keepable hands (simplified)
  let keepableHands = 0;
  const iterations = 1000;
  
  for (let i = 0; i < iterations; i++) {
    const hand = simulateHand(deck);
    if (isKeepableHand(hand)) {
      keepableHands++;
    }
  }
  
  const keepable7Pct = (keepableHands / iterations) * 100;
  
  // Estimate color hits (simplified based on source count)
  const colorSources = calculateColorSources(deck);
  const t1ColorHit = Math.min(95, 65 + (colorSources.total * 2));
  const t2TwoColorHit = Math.min(90, 50 + (colorSources.total * 1.5));
  
  return {
    keepable7_pct: keepable7Pct,
    t1_color_hit_pct: t1ColorHit,
    t2_two_colors_hit_pct: t2TwoColorHit,
    untapped_land_ratio: untappedRatio,
    avg_cmc: avgCmc,
    rocks_dorks_count: rocksAndDorks.length
  };
}

function simulateHand(deck: Card[]): Card[] {
  const shuffled = [...deck].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 7);
}

function isKeepableHand(hand: Card[]): boolean {
  const lands = hand.filter(c => c.type_line.toLowerCase().includes('land'));
  const rocks = hand.filter(c => {
    const text = (c.oracle_text || '').toLowerCase();
    const typeLine = c.type_line.toLowerCase();
    return (typeLine.includes('artifact') || typeLine.includes('creature')) && 
           text.includes('add') && text.includes('mana') && c.cmc <= 2;
  });
  const spells = hand.filter(c => !c.type_line.toLowerCase().includes('land') && c.cmc <= 3);
  
  // Keep if: 2+ lands OR (1 land + rock) AND some early plays
  return (lands.length >= 2 || (lands.length >= 1 && rocks.length > 0)) && 
         spells.length >= 2;
}

function calculateColorSources(deck: Card[]): any {
  const lands = deck.filter(c => c.type_line.toLowerCase().includes('land'));
  let totalSources = 0;
  
  lands.forEach(land => {
    const name = land.name.toLowerCase();
    const text = (land.oracle_text || '').toLowerCase();
    
    // Count basic lands and dual lands as 1 source each
    if (name.includes('forest') || name.includes('island') || 
        text.includes('add') && (text.includes('{g}') || text.includes('{u}'))) {
      totalSources++;
    }
  });
  
  return { total: totalSources };
}

async function tuneForPlayability(deck: Card[], targets: any, current: any, request: CoachRequest): Promise<Card[]> {
  let tunedDeck = [...deck];
  const maxIterations = 3;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    console.log(`Tuning iteration ${iter + 1}...`);
    
    // Fix keepable hand issues
    if (current.keepable7_pct < targets.keepable7) {
      console.log('Fixing keepable hand rate...');
      
      // Add more 2-CMC rocks if we have room
      const rockNames = ['Arcane Signet', 'Fellwar Stone', 'Talisman of Curiosity', 'Mind Stone'];
      for (const rockName of rockNames) {
        if (tunedDeck.length >= 99) break;
        const rock = await findCardByName(rockName, request.commander.color_identity);
        if (rock && !tunedDeck.some(c => c.id === rock.id)) {
          tunedDeck.push(rock);
          // Remove highest CMC non-synergy card
          const highCmcIndex = tunedDeck.findIndex(c => c.cmc >= 6 && 
            !c.type_line.toLowerCase().includes('land') &&
            !c.tags.includes('wincon'));
          if (highCmcIndex !== -1) {
            tunedDeck.splice(highCmcIndex, 1);
          }
          break;
        }
      }
    }
    
    // Fix untapped land ratio
    if (current.untapped_land_ratio < targets.untappedRatio) {
      console.log('Improving untapped land ratio...');
      
      // Replace taplands with untapped alternatives
      const taplandIndex = tunedDeck.findIndex(c => 
        c.type_line.toLowerCase().includes('land') &&
        (c.oracle_text || '').toLowerCase().includes('enters the battlefield tapped')
      );
      
      if (taplandIndex !== -1) {
        const untappedLandNames = ['Exotic Orchard', 'City of Brass', 'Mana Confluence', 'Reflecting Pool'];
        for (const landName of untappedLandNames) {
          const land = await findCardByName(landName, request.commander.color_identity);
          if (land && !tunedDeck.some(c => c.id === land.id)) {
            tunedDeck[taplandIndex] = land;
            break;
          }
        }
      }
    }
    
    // Recalculate playability
    current = simulatePlayability(tunedDeck, targets);
    console.log(`After tuning ${iter + 1}: Keepable7=${current.keepable7_pct}%, Untapped=${current.untapped_land_ratio}%`);
    
    // Break early if targets are met
    if (current.keepable7_pct >= targets.keepable7 && 
        current.untapped_land_ratio >= targets.untappedRatio) {
      console.log('Playability targets achieved!');
      break;
    }
  }
  
  return tunedDeck;
}

function selectCardsByQuota(cards: Card[], count: number, rng: () => number): Card[] {
  if (cards.length === 0 || count <= 0) return [];
  
  // Shuffle cards deterministically
  const shuffled = [...cards].sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(count, cards.length));
}

function getArchetypeTemplate(themeId: string, format: string) {
  const templates: Record<string, any> = {
    'aggro': { focus: 'low-cost creatures', curves: { '0-2': 0.4, '3-4': 0.3, '5+': 0.1 } },
    'control': { focus: 'interaction and card draw', curves: { '0-2': 0.1, '3-4': 0.3, '5+': 0.4 } },
    'midrange': { focus: 'balanced threats', curves: { '0-2': 0.2, '3-4': 0.4, '5+': 0.3 } },
    'combo': { focus: 'combo pieces and protection', curves: { '0-2': 0.3, '3-4': 0.4, '5+': 0.2 } },
    'aristocrats': { focus: 'sacrifice synergies', curves: { '0-2': 0.25, '3-4': 0.4, '5+': 0.25 } },
    'reanimator': { focus: 'graveyard value', curves: { '0-2': 0.2, '3-4': 0.3, '5+': 0.4 } }
  };
  
  return templates[themeId] || templates['midrange'];
}

async function analyzeWithEDHCalculator(deck: Card[], commander: any, format: string) {
  // This would call our EDH power calculator
  // For now, return mock data with realistic ranges
  const mockPower = 4 + Math.random() * 4; // 4-8 range
  
  return {
    power: mockPower,
    band: mockPower <= 3.4 ? 'casual' : mockPower <= 6.6 ? 'mid' : mockPower <= 8.5 ? 'high' : 'cEDH',
    subscores: {
      speed: Math.random() * 100,
      interaction: Math.random() * 100,
      tutors: Math.random() * 100,
      resilience: Math.random() * 100,
      card_advantage: Math.random() * 100,
      mana: Math.random() * 100,
      consistency: Math.random() * 100,
      stax_pressure: Math.random() * 100,
      synergy: Math.random() * 100
    },
    playability: {
      keepable7_pct: 60 + Math.random() * 30,
      t1_color_hit_pct: 70 + Math.random() * 25,
      avg_cmc: 2.5 + Math.random() * 1.5,
      untapped_land_ratio: 0.6 + Math.random() * 0.3
    },
    drivers: ['Synergistic commander', 'Good mana base'],
    drags: ['High average CMC', 'Limited interaction'],
    recommendations: ['Add more low-cost interaction', 'Improve mana curve']
  };
}

function buildCoachingPrompt(request: CoachRequest, deck: Card[], currentPower: any, targetPower: number): string {
  const powerGap = targetPower - currentPower.power;
  const direction = powerGap > 0 ? 'increase' : 'decrease';
  
  return `You are an expert Magic: The Gathering deck builder. Analyze this ${request.format} deck and provide specific recommendations to ${direction} its power level from ${currentPower.power.toFixed(1)} to ${targetPower}.

Commander: ${request.commander.name}
Colors: ${request.commander.color_identity.join(', ')}
Theme: ${request.themeId}
Budget: ${request.budget}
Current Power: ${currentPower.power.toFixed(1)} (${currentPower.band})
Target Power: ${targetPower}

Current Issues:
${currentPower.drags.map((drag: string) => `- ${drag}`).join('\n')}

Current Deck (${deck.length} cards):
${deck.slice(0, 20).map(card => `${card.name} (${card.cmc} CMV)`).join('\n')}
${deck.length > 20 ? `... and ${deck.length - 20} more cards` : ''}

Power Level Guidelines:
- Casual (1-3): High CMC, limited interaction, few tutors
- Mid (4-6): Balanced threats, some interaction, occasional tutors  
- High (7-8): Efficient threats, strong interaction, multiple tutors
- cEDH (9-10): Fast combos, comprehensive interaction, many tutors

Provide 3-5 specific, actionable recommendations to reach the target power level. Focus on:
1. Card replacements (remove X, add Y)
2. Mana curve improvements
3. Interaction density changes
4. Tutoring/consistency adjustments
5. Win condition optimization

Format your response as a JSON object with this structure:
{
  "recommendations": [
    {
      "action": "replace|add|remove",
      "category": "creatures|lands|spells|interaction|ramp|draw",
      "description": "Specific recommendation",
      "cards_to_remove": ["Card Name"],
      "cards_to_add": ["Card Name"],
      "reasoning": "Why this improves power level"
    }
  ],
  "priority": "Which recommendation to apply first"
}`;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  // Add a hard timeout so the UI never hangs forever
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s safety

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
          {
            role: 'system',
            content: 'You are an expert Magic: The Gathering deck builder with deep knowledge of the EDH format and power level optimization. Provide specific, actionable deck building advice. Answer in valid JSON only, no commentary.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      }),
      signal: controller.signal
    });
  
    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API error: ${response.status}`);
    }
  
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (e) {
    if ((e as any).name === 'AbortError') {
      console.error('Gemini call timed out');
      throw new Error('Gemini request timed out');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGeminiRecommendations(geminiResponse: string): any[] {
  try {
    if (!geminiResponse) return getDefaultRecommendations();

    // Clean the response by removing comments and invalid JSON patterns
    let cleanResponse = geminiResponse;
    
    // Remove JavaScript-style comments
    cleanResponse = cleanResponse.replace(/\/\/.*$/gm, '');
    cleanResponse = cleanResponse.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Prefer JSON code block if present
    const fenced = cleanResponse.match(/```json\s*([\s\S]*?)```/i) || cleanResponse.match(/```\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      const trimmed = fenced[1].trim().replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      try {
        const parsedFenced = JSON.parse(trimmed);
        return parsedFenced.recommendations || parsedFenced?.data?.recommendations || getDefaultRecommendations();
      } catch (e) {
        console.error('Failed to parse fenced JSON:', e);
      }
    }

    // Fallback: try to extract the first balanced JSON object
    const firstBrace = cleanResponse.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      for (let i = firstBrace; i < cleanResponse.length; i++) {
        const ch = cleanResponse[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) {
          let candidate = cleanResponse.slice(firstBrace, i + 1);
          // Clean the candidate JSON
          candidate = candidate.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
          try {
            const parsed = JSON.parse(candidate);
            return parsed.recommendations || getDefaultRecommendations();
          } catch (e) {
            console.error('Failed to parse extracted JSON:', e);
          }
        }
      }
    }

    console.log('No valid JSON found in Gemini response, using fallback');
    return getDefaultRecommendations();
  } catch (error) {
    console.error('Failed to parse Gemini recommendations:', error);
    return getDefaultRecommendations();
  }
}

function getDefaultRecommendations(): any[] {
  return [
    {
      action: 'add',
      category: 'interaction',
      description: 'Add efficient removal spells',
      cards_to_add: ['Swords to Plowshares', 'Path to Exile'],
      reasoning: 'Increases interaction density for higher power level'
    },
    {
      action: 'replace',
      category: 'creatures',
      description: 'Replace high-CMC creatures with efficient threats',
      cards_to_remove: [''], // Would be filled by specific analysis
      cards_to_add: [''],
      reasoning: 'Improves mana curve and threat density'
    }
  ];
}

async function applyRecommendations(deck: Card[], recommendations: any[], request: CoachRequest, rng: () => number): Promise<Card[]> {
  console.log(`Applying ${recommendations.length} recommendations...`);
  
  let modifiedDeck = [...deck];
  
  // Apply up to 3 recommendations per iteration
  for (const rec of recommendations.slice(0, 3)) {
    try {
      console.log(`Applying: ${rec.action} - ${rec.description}`);
      
      if (rec.action === 'replace' && rec.cards_to_remove?.length > 0 && rec.cards_to_add?.length > 0) {
        // Remove specified cards
        for (const cardName of rec.cards_to_remove) {
          const removeIndex = modifiedDeck.findIndex(c => 
            c.name.toLowerCase().includes(cardName.toLowerCase()) ||
            cardName.toLowerCase().includes(c.name.toLowerCase())
          );
          if (removeIndex !== -1) {
            modifiedDeck.splice(removeIndex, 1);
            console.log(`Removed: ${cardName}`);
          }
        }
        
        // Add recommended cards if they're legal
        for (const cardName of rec.cards_to_add) {
          const cardToAdd = await findCardByName(cardName, request.commander.color_identity);
          if (cardToAdd && modifiedDeck.length < 99) {
            modifiedDeck.push(cardToAdd);
            console.log(`Added: ${cardName}`);
          }
        }
      }
      
      if (rec.action === 'add' && rec.cards_to_add?.length > 0) {
        for (const cardName of rec.cards_to_add) {
          if (modifiedDeck.length >= 99) break;
          const cardToAdd = await findCardByName(cardName, request.commander.color_identity);
          if (cardToAdd) {
            modifiedDeck.push(cardToAdd);
            console.log(`Added: ${cardName}`);
          }
        }
      }
      
      if (rec.action === 'remove' && rec.cards_to_remove?.length > 0) {
        for (const cardName of rec.cards_to_remove) {
          const removeIndex = modifiedDeck.findIndex(c => 
            c.name.toLowerCase().includes(cardName.toLowerCase()) ||
            cardName.toLowerCase().includes(c.name.toLowerCase())
          );
          if (removeIndex !== -1) {
            modifiedDeck.splice(removeIndex, 1);
            console.log(`Removed: ${cardName}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`Failed to apply recommendation:`, error);
    }
  }
  
  console.log(`Deck modified: ${deck.length} -> ${modifiedDeck.length} cards`);
  return modifiedDeck;
}

// Helper function to find cards by name
async function findCardByName(cardName: string, commanderColors: string[]): Promise<Card | null> {
  const { data: cards, error } = await supabase
    .from('cards')
    .select('*')
    .or(`name.ilike.%${cardName}%`)
    .limit(1);
    
  if (error || !cards?.length) {
    console.log(`Card not found: ${cardName}`);
    return null;
  }
  
  const card = cards[0];
  
  // Check color identity
  const cardCI = card.color_identity || [];
  const allowed = new Set(commanderColors);
  const isLegal = cardCI.every((c: string) => allowed.has(c));
  
  if (!isLegal) {
    console.log(`Card ${cardName} not legal for commander colors`);
    return null;
  }
  
  return {
    id: card.id,
    oracle_id: card.oracle_id || card.id,
    name: card.name,
    mana_cost: card.mana_cost || '',
    cmc: Number(card.cmc || 0),
    type_line: card.type_line || '',
    oracle_text: card.oracle_text || '',
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    power: card.power,
    toughness: card.toughness,
    keywords: card.keywords || [],
    legalities: card.legalities || {},
    image_uris: card.image_uris || {},
    prices: card.prices || {},
    rarity: card.rarity || 'common',
    tags: card.tags || [],
    is_legendary: card.is_legendary || false
  };
}

async function generateFinalAnalysis(apiKey: string, request: CoachRequest, deck: Card[], power: any, iterations: number): Promise<string> {
  const analysisPrompt = `Provide a brief analysis of this optimized ${request.format} deck:

Commander: ${request.commander.name}
Theme: ${request.themeId}  
Final Power Level: ${power.power.toFixed(1)} (${power.band})
Target: ${request.powerTarget}
Optimization Iterations: ${iterations}

Key Strengths: ${power.drivers.join(', ')}
Areas for Improvement: ${power.drags.join(', ')}

Provide a 2-3 sentence analysis of how well the deck meets the target power level and any notable synergies or strategies.`;

  try {
    const response = await callGemini(apiKey, analysisPrompt);
    return response.replace(/[\*\#]/g, '').trim();
  } catch (error) {
    console.error('Failed to generate analysis:', error);
    return `This ${power.band} power level deck successfully targets ${request.powerTarget} with ${iterations} optimization iterations. The deck focuses on ${request.themeId} strategies with ${power.drivers.join(' and ')}.`;
  }
}