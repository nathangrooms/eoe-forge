import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      commander, 
      collection, 
      format = 'commander', 
      powerLevel = 6, 
      themes = [], 
      budget = 'medium',
      deckSize = 100 
    } = await req.json();

    console.log('AI Deck Builder Request:', { 
      commander: commander?.name, 
      collectionSize: collection?.length, 
      format, 
      powerLevel, 
      themes, 
      budget 
    });

    // Analyze commander and build deck strategy
    const strategy = await analyzeCommander(commander, themes, powerLevel);
    console.log('Deck Strategy:', strategy);

    // Build the deck based on strategy
    const deckList = await buildDeckFromStrategy(
      strategy, 
      collection, 
      commander, 
      format, 
      powerLevel, 
      deckSize
    );

    // Analyze final deck for improvements
    const analysis = await analyzeDeck(deckList, commander, powerLevel);

    return new Response(JSON.stringify({
      success: true,
      deck: deckList,
      strategy: strategy,
      analysis: analysis,
      metadata: {
        format,
        powerLevel,
        totalCards: deckList.length,
        avgCMC: calculateAverageCMC(deckList),
        colorIdentity: getColorIdentity(deckList, commander)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in AI deck builder:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzeCommander(commander: any, themes: string[], powerLevel: number) {
  if (!openAIApiKey || !commander) {
    return generateBasicStrategy(commander, themes, powerLevel);
  }

  const prompt = `Analyze this Magic: The Gathering commander and create a deck building strategy:

Commander: ${commander.name}
Mana Cost: ${commander.mana_cost || 'Unknown'}
Type: ${commander.type_line}
Text: ${commander.oracle_text || 'No text available'}
Colors: ${commander.colors?.join(', ') || 'Colorless'}
Power Level Target: ${powerLevel}/10
Preferred Themes: ${themes.join(', ') || 'None specified'}

Please provide a JSON response with this structure:
{
  "primaryStrategy": "Main win condition and strategy",
  "secondaryStrategies": ["backup win conditions"],
  "keyMechanics": ["important mechanics to focus on"],
  "cardTypes": {
    "creatures": { "count": 30, "description": "creature strategy" },
    "instants": { "count": 10, "description": "instant strategy" },
    "sorceries": { "count": 8, "description": "sorcery strategy" },
    "enchantments": { "count": 6, "description": "enchantment strategy" },
    "artifacts": { "count": 10, "description": "artifact strategy" },
    "planeswalkers": { "count": 2, "description": "planeswalker strategy" },
    "lands": { "count": 33, "description": "mana base strategy" }
  },
  "synergyTags": ["tag1", "tag2", "tag3"],
  "avoidTags": ["tag1", "tag2"],
  "curvePriority": "early/mid/late game focus",
  "removal": { "spot": 6, "sweepers": 2 },
  "ramp": 8,
  "draw": 10,
  "protection": 4
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert Magic: The Gathering deck builder. Analyze commanders and provide strategic deck building advice in valid JSON format only.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI analysis failed, using fallback:', error);
    return generateBasicStrategy(commander, themes, powerLevel);
  }
}

function generateBasicStrategy(commander: any, themes: string[], powerLevel: number) {
  const colors = commander?.colors || [];
  const isAggressive = commander?.power && parseInt(commander.power) >= 3;
  
  return {
    primaryStrategy: isAggressive ? "Aggressive creature strategy" : "Value-based control strategy",
    secondaryStrategies: ["Combat damage", "Synergy value"],
    keyMechanics: themes.length > 0 ? themes : ["value", "synergy"],
    cardTypes: {
      creatures: { count: format === 'commander' ? 25 : 20, description: "Core creatures and synergy pieces" },
      instants: { count: format === 'commander' ? 12 : 8, description: "Interaction and protection" },
      sorceries: { count: format === 'commander' ? 8 : 6, description: "Ramp and draw spells" },
      enchantments: { count: format === 'commander' ? 5 : 3, description: "Permanent value engines" },
      artifacts: { count: format === 'commander' ? 8 : 6, description: "Utility and ramp" },
      planeswalkers: { count: format === 'commander' ? 2 : 2, description: "Additional win conditions" },
      lands: { count: format === 'commander' ? 36 : 24, description: "Consistent mana base" }
    },
    synergyTags: themes,
    avoidTags: [],
    curvePriority: powerLevel >= 7 ? "early" : "mid",
    removal: { spot: format === 'commander' ? 6 : 4, sweepers: format === 'commander' ? 2 : 1 },
    ramp: format === 'commander' ? 8 : 4,
    draw: format === 'commander' ? 10 : 6,
    protection: format === 'commander' ? 4 : 2
  };
}

async function buildDeckFromStrategy(
  strategy: any, 
  collection: any[], 
  commander: any, 
  format: string, 
  powerLevel: number, 
  deckSize: number
) {
  const deck = [];
  const usedCards = new Set();
  
  console.log(`Starting deck build with collection size: ${collection.length}`);
  console.log(`Commander: ${commander?.name || 'None'}`);
  console.log(`Format: ${format}, Power Level: ${powerLevel}, Deck Size: ${deckSize}`);
  
  // Filter collection by commander's color identity
  const commanderColors = commander?.color_identity || commander?.colors || [];
  console.log(`Commander colors: ${JSON.stringify(commanderColors)}`);
  
  const availableCards = collection.filter(card => {
    const isColorLegal = isLegalInColors(card, commanderColors);
    const isNotCommander = card.name !== commander?.name;
    return isColorLegal && isNotCommander;
  });

  console.log(`Available cards after color filtering: ${availableCards.length}`);
  
  if (availableCards.length === 0) {
    console.log('No cards available after filtering - returning empty deck');
    return [];
  }

  // Categorize available cards
  const categorizedCards = categorizeCards(availableCards);
  console.log('Categorized cards:', Object.keys(categorizedCards).map(key => 
    `${key}: ${categorizedCards[key].length}`
  ).join(', '));
  
  // Build deck according to strategy
  const categories = [
    { type: 'ramp', target: strategy.ramp || 8 },
    { type: 'draw', target: strategy.draw || 10 },
    { type: 'removal', target: (strategy.removal?.spot || 6) + (strategy.removal?.sweepers || 2) },
    { type: 'creatures', target: strategy.cardTypes?.creatures?.count || 25 },
    { type: 'lands', target: strategy.cardTypes?.lands?.count || 36 }
  ];

  for (const category of categories) {
    const categoryCards = categorizedCards[category.type] || [];
    console.log(`Selecting ${category.target} cards from ${categoryCards.length} ${category.type} cards`);
    const selected = selectBestCards(categoryCards, category.target, powerLevel, usedCards);
    console.log(`Selected ${selected.length} ${category.type} cards`);
    deck.push(...selected);
    selected.forEach(card => usedCards.add(card.name));
  }

  // Fill remaining slots with synergy cards
  const remainingSlots = deckSize - 1 - deck.length; // -1 for commander
  console.log(`Remaining slots to fill: ${remainingSlots}`);
  
  if (remainingSlots > 0) {
    const synergyCards = findSynergyCards(availableCards, strategy.synergyTags || [], usedCards);
    console.log(`Found ${synergyCards.length} synergy cards`);
    const selected = selectBestCards(synergyCards, remainingSlots, powerLevel, usedCards);
    console.log(`Selected ${selected.length} synergy cards`);
    deck.push(...selected);
  }

  console.log(`Built deck with ${deck.length} cards`);
  return deck;
}

function categorizeCards(cards: any[]) {
  const categories: Record<string, any[]> = {
    ramp: [],
    draw: [],
    removal: [],
    creatures: [],
    lands: [],
    artifacts: [],
    enchantments: [],
    instants: [],
    sorceries: [],
    planeswalkers: []
  };

  for (const card of cards) {
    const type = card.type_line?.toLowerCase() || '';
    const text = card.oracle_text?.toLowerCase() || '';
    
    // Categorize by type
    if (type.includes('creature')) categories.creatures.push(card);
    else if (type.includes('land')) categories.lands.push(card);
    else if (type.includes('artifact')) categories.artifacts.push(card);
    else if (type.includes('enchantment')) categories.enchantments.push(card);
    else if (type.includes('instant')) categories.instants.push(card);
    else if (type.includes('sorcery')) categories.sorceries.push(card);
    else if (type.includes('planeswalker')) categories.planeswalkers.push(card);

    // Categorize by function
    if (text.includes('search') && text.includes('land')) categories.ramp.push(card);
    if (text.includes('draw') || text.includes('card')) categories.draw.push(card);
    if (text.includes('destroy') || text.includes('exile') || text.includes('damage')) {
      categories.removal.push(card);
    }
  }

  return categories;
}

function selectBestCards(cards: any[], target: number, powerLevel: number, usedCards: Set<string>) {
  const available = cards.filter(card => !usedCards.has(card.name));
  
  // Sort by power level and synergy (simplified scoring)
  const scored = available.map(card => ({
    ...card,
    score: calculateCardScore(card, powerLevel)
  })).sort((a, b) => b.score - a.score);

  return scored.slice(0, target);
}

function calculateCardScore(card: any, powerLevel: number) {
  let score = 0;
  const cmc = card.cmc || 0;
  const text = card.oracle_text?.toLowerCase() || '';
  
  // Prefer lower CMC for higher power levels
  if (powerLevel >= 7) {
    score += Math.max(0, 5 - cmc);
  } else {
    score += Math.max(0, 3 - Math.abs(cmc - 3));
  }
  
  // Bonus for powerful effects
  if (text.includes('tutor') || text.includes('search')) score += 3;
  if (text.includes('draw') && text.includes('card')) score += 2;
  if (text.includes('destroy') || text.includes('exile')) score += 2;
  if (text.includes('counter') && text.includes('spell')) score += 2;
  
  return score;
}

function findSynergyCards(cards: any[], synergyTags: string[], usedCards: Set<string>) {
  return cards.filter(card => {
    if (usedCards.has(card.name)) return false;
    
    const text = card.oracle_text?.toLowerCase() || '';
    const type = card.type_line?.toLowerCase() || '';
    
    return synergyTags.some(tag => 
      text.includes(tag.toLowerCase()) || 
      type.includes(tag.toLowerCase())
    );
  });
}

function isLegalInColors(card: any, commanderColors: string[]) {
  // If no commander colors specified (colorless), allow all cards
  if (!commanderColors || commanderColors.length === 0) {
    return true;
  }
  
  const cardColors = card.color_identity || card.colors || [];
  console.log(`Checking card ${card.name}: card colors [${cardColors}] vs commander colors [${commanderColors}]`);
  
  // Every color in the card must be present in the commander's color identity
  const isLegal = cardColors.every(color => commanderColors.includes(color));
  console.log(`Card ${card.name} is ${isLegal ? 'legal' : 'illegal'}`);
  
  return isLegal;
}

async function analyzeDeck(deck: any[], commander: any, powerLevel: number) {
  const analysis = {
    curve: calculateManaCurve(deck),
    colors: calculateColorDistribution(deck),
    types: calculateTypeDistribution(deck),
    powerLevel: estimatePowerLevel(deck),
    suggestions: []
  };

  // Add suggestions based on analysis
  if (analysis.curve[0] + analysis.curve[1] < 8) {
    analysis.suggestions.push("Consider adding more 1-2 mana cards for early game presence");
  }
  
  if (analysis.powerLevel < powerLevel - 1) {
    analysis.suggestions.push("Deck power level is below target - consider stronger cards");
  }

  return analysis;
}

function calculateManaCurve(deck: any[]) {
  const curve = [0, 0, 0, 0, 0, 0, 0]; // 0-6+ CMC
  
  deck.forEach(card => {
    const cmc = Math.min(card.cmc || 0, 6);
    curve[cmc]++;
  });
  
  return curve;
}

function calculateColorDistribution(deck: any[]) {
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  
  deck.forEach(card => {
    (card.colors || []).forEach((color: string) => {
      if (colors.hasOwnProperty(color)) colors[color as keyof typeof colors]++;
    });
  });
  
  return colors;
}

function calculateTypeDistribution(deck: any[]) {
  const types: Record<string, number> = {};
  
  deck.forEach(card => {
    const mainType = card.type_line?.split(' ')[0] || 'Unknown';
    types[mainType] = (types[mainType] || 0) + 1;
  });
  
  return types;
}

function estimatePowerLevel(deck: any[]) {
  let score = 0;
  let cardCount = 0;
  
  deck.forEach(card => {
    const cmc = card.cmc || 0;
    const text = card.oracle_text?.toLowerCase() || '';
    
    // Base score from CMC efficiency
    if (cmc <= 2) score += 2;
    else if (cmc <= 4) score += 1;
    
    // Bonus for powerful effects
    if (text.includes('tutor')) score += 3;
    if (text.includes('extra turn')) score += 4;
    if (text.includes('infinite')) score += 5;
    
    cardCount++;
  });
  
  return Math.min(10, Math.max(1, Math.round(score / cardCount * 2)));
}

function calculateAverageCMC(deck: any[]) {
  const totalCMC = deck.reduce((sum, card) => sum + (card.cmc || 0), 0);
  return deck.length > 0 ? (totalCMC / deck.length).toFixed(2) : 0;
}

function getColorIdentity(deck: any[], commander: any) {
  const colors = new Set();
  
  // Add commander colors
  (commander?.color_identity || []).forEach((color: string) => colors.add(color));
  
  // Add deck colors
  deck.forEach(card => {
    (card.color_identity || card.colors || []).forEach((color: string) => colors.add(color));
  });
  
  return Array.from(colors);
}