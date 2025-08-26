
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
      format = 'standard', 
      powerLevel = 6, 
      themes = [], 
      budget = 'medium',
      buildMode = 'collection',
      selectedSet,
      selectedColors = []
    } = await req.json();

    console.log('AI Deck Builder Request:', { 
      commander: commander?.name, 
      collectionSize: collection?.length, 
      format, 
      powerLevel, 
      themes, 
      budget,
      buildMode,
      selectedSet,
      selectedColors
    });

    // Determine deck size based on format
    const deckSize = format === 'commander' ? 99 : 60; // 99 + 1 commander = 100 for EDH
    const landCount = format === 'commander' ? 36 : 24;
    const nonLandCount = deckSize - landCount;

    console.log(`Building ${format} deck: ${deckSize} total cards (${nonLandCount} non-lands + ${landCount} lands)`);

    // Analyze commander and build deck strategy
    const strategy = await analyzeCommander(commander, themes, powerLevel, format);
    console.log('Deck Strategy:', strategy);

    // Build the deck based on strategy
    const deckList = await buildDeckFromStrategy(
      strategy, 
      collection, 
      commander, 
      format, 
      powerLevel, 
      deckSize,
      landCount,
      buildMode,
      selectedSet,
      selectedColors
    );

    console.log(`Final deck built with ${deckList.length} cards`);

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
        colorIdentity: getColorIdentity(deckList, commander),
        deckSize: deckSize,
        landCount: landCount
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

async function analyzeCommander(commander: any, themes: string[], powerLevel: number, format: string) {
  if (!openAIApiKey || (!commander && format === 'commander')) {
    return generateBasicStrategy(commander, themes, powerLevel, format);
  }

  const prompt = format === 'commander' ? `Analyze this Magic: The Gathering commander and create a deck building strategy:

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
    "creatures": { "count": 25, "description": "creature strategy" },
    "instants": { "count": 12, "description": "instant strategy" },
    "sorceries": { "count": 8, "description": "sorcery strategy" },
    "enchantments": { "count": 5, "description": "enchantment strategy" },
    "artifacts": { "count": 8, "description": "artifact strategy" },
    "planeswalkers": { "count": 2, "description": "planeswalker strategy" },
    "lands": { "count": 36, "description": "mana base strategy" }
  },
  "synergyTags": ["tag1", "tag2", "tag3"],
  "avoidTags": ["tag1", "tag2"],
  "curvePriority": "early/mid/late game focus",
  "removal": { "spot": 6, "sweepers": 2 },
  "ramp": 8,
  "draw": 10,
  "protection": 4
}` : `Create a deck building strategy for ${format} format:

Power Level Target: ${powerLevel}/10
Preferred Themes: ${themes.join(', ') || 'None specified'}
Colors: ${themes.join(', ') || 'Multi-color'}

Please provide a JSON response optimized for ${format} with appropriate card counts for a 60-card deck.`;

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
    return generateBasicStrategy(commander, themes, powerLevel, format);
  }
}

function generateBasicStrategy(commander: any, themes: string[], powerLevel: number, format: string) {
  const colors = commander?.colors || [];
  const isAggressive = commander?.power && parseInt(commander.power) >= 3;
  
  const isCommander = format === 'commander';
  
  return {
    primaryStrategy: isAggressive ? "Aggressive creature strategy" : "Value-based control strategy",
    secondaryStrategies: ["Combat damage", "Synergy value"],
    keyMechanics: themes.length > 0 ? themes : ["value", "synergy"],
    cardTypes: {
      creatures: { count: isCommander ? 25 : 16, description: "Core creatures and synergy pieces" },
      instants: { count: isCommander ? 12 : 8, description: "Interaction and protection" },
      sorceries: { count: isCommander ? 8 : 6, description: "Ramp and draw spells" },
      enchantments: { count: isCommander ? 5 : 3, description: "Permanent value engines" },
      artifacts: { count: isCommander ? 8 : 3, description: "Utility and ramp" },
      planeswalkers: { count: 2, description: "Additional win conditions" },
      lands: { count: isCommander ? 36 : 24, description: "Consistent mana base" }
    },
    synergyTags: themes,
    avoidTags: [],
    curvePriority: powerLevel >= 7 ? "early" : "mid",
    removal: { spot: isCommander ? 6 : 4, sweepers: isCommander ? 2 : 1 },
    ramp: isCommander ? 8 : 4,
    draw: isCommander ? 10 : 6,
    protection: isCommander ? 4 : 2
  };
}

async function buildDeckFromStrategy(
  strategy: any, 
  collection: any[], 
  commander: any, 
  format: string, 
  powerLevel: number, 
  deckSize: number,
  landCount: number,
  buildMode: string,
  selectedSet?: string,
  selectedColors: string[] = []
) {
  const deck = [];
  const usedCards = new Set();
  
  console.log(`Starting deck build with collection size: ${collection?.length || 0}`);
  console.log(`Commander: ${commander?.name || 'None'}`);
  console.log(`Format: ${format}, Power Level: ${powerLevel}, Deck Size: ${deckSize}`);
  console.log(`Build Mode: ${buildMode}, Selected Set: ${selectedSet}`);
  
  // Filter collection by commander's color identity and format legality
  const commanderColors = commander?.color_identity || commander?.colors || selectedColors || [];
  console.log(`Commander colors: ${JSON.stringify(commanderColors)}`);
  
  let availableCards = [];
  
  if (buildMode === 'set' && selectedSet) {
    // Fetch cards from Scryfall API for the selected set
    console.log(`Fetching cards from set: ${selectedSet}`);
    try {
      let searchQuery = `set:${selectedSet}`;
      
      // Add format legality if specified
      if (format && format !== 'casual') {
        searchQuery += ` legal:${format}`;
      }
      
      // Add color identity if specified
      if (selectedColors && selectedColors.length > 0) {
        const colorQuery = selectedColors.join('');
        searchQuery += ` c<=${colorQuery}`;
      }
      
      console.log(`Scryfall search query: ${searchQuery}`);
      
      let hasMore = true;
      let page = 1;
      
      while (hasMore && availableCards.length < 2000) {
        const response = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchQuery)}&page=${page}`,
          {
            headers: {
              'User-Agent': 'MTG-Deck-Builder/1.0'
            }
          }
        );
        
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`No cards found for query: ${searchQuery}`);
            break;
          }
          console.error(`Scryfall API error: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          availableCards.push(...data.data);
        }
        
        hasMore = data.has_more;
        page++;
        
        // Rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`Fetched ${availableCards.length} cards from Scryfall`);
      
      // If no cards found with format restriction, try without format filter
      if (availableCards.length === 0 && format && format !== 'casual') {
        console.log('Retrying without format restriction...');
        searchQuery = `set:${selectedSet}`;
        
        if (selectedColors && selectedColors.length > 0) {
          const colorQuery = selectedColors.join('');
          searchQuery += ` c<=${colorQuery}`;
        }
        
        const response = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchQuery)}`,
          {
            headers: {
              'User-Agent': 'MTG-Deck-Builder/1.0'
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.data) {
            availableCards = data.data;
            console.log(`Fetched ${availableCards.length} cards without format restriction`);
          }
        }
      }
      
    } catch (error) {
      console.error('Error fetching cards from Scryfall:', error);
      availableCards = [];
    }
  } else {
    // Use collection mode
    availableCards = collection || [];
  }
  
  // Apply additional filtering
  availableCards = availableCards.filter(card => {
    if (!card || !card.name) return false;
    
    const isColorLegal = format === 'commander' ? isLegalInColors(card, commanderColors) : true;
    const isNotCommander = card.name !== commander?.name;
    const isFormatLegal = isLegalInFormat(card, format);
    
    // Exclude problematic card types
    const excludeTypes = ['token', 'emblem', 'scheme', 'plane', 'phenomenon'];
    const hasExcludedType = excludeTypes.some(type => 
      card.type_line?.toLowerCase().includes(type)
    );
    
    return isColorLegal && isNotCommander && isFormatLegal && !hasExcludedType;
  });

  console.log(`Available cards after filtering: ${availableCards.length}`);
  
  if (availableCards.length === 0) {
    console.log('No cards available after filtering - returning empty deck');
    return [];
  }

  // Categorize available cards
  const categorizedCards = categorizeCards(availableCards);
  console.log('Categorized cards:', Object.keys(categorizedCards).map(key => 
    `${key}: ${categorizedCards[key].length}`
  ).join(', '));
  
  // Build deck according to strategy - non-land cards first
  const nonLandSlots = deckSize - landCount;
  const categories = [
    { type: 'ramp', target: Math.min(strategy.ramp || 4, Math.floor(nonLandSlots * 0.1)) },
    { type: 'draw', target: Math.min(strategy.draw || 6, Math.floor(nonLandSlots * 0.15)) },
    { type: 'removal', target: Math.min((strategy.removal?.spot || 4) + (strategy.removal?.sweepers || 1), Math.floor(nonLandSlots * 0.15)) },
    { type: 'creatures', target: Math.min(strategy.cardTypes?.creatures?.count || 16, Math.floor(nonLandSlots * 0.4)) }
  ];

  let totalAllocated = 0;
  for (const category of categories) {
    const categoryCards = categorizedCards[category.type] || [];
    console.log(`Selecting ${category.target} cards from ${categoryCards.length} ${category.type} cards`);
    const selected = selectBestCards(categoryCards, category.target, powerLevel, usedCards, buildMode === 'set' ? 'medium' : 'medium');
    console.log(`Selected ${selected.length} ${category.type} cards`);
    deck.push(...selected);
    selected.forEach(card => usedCards.add(card.name));
    totalAllocated += selected.length;
  }

  // Fill remaining non-land slots with best available cards
  const remainingNonLandSlots = nonLandSlots - totalAllocated;
  console.log(`Remaining non-land slots to fill: ${remainingNonLandSlots}`);
  
  if (remainingNonLandSlots > 0) {
    const remainingCards = availableCards.filter(card => 
      !usedCards.has(card.name) && 
      !isLand(card) &&
      (!strategy.synergyTags?.length || strategy.synergyTags.some(tag => 
        card.oracle_text?.toLowerCase().includes(tag.toLowerCase()) ||
        card.type_line?.toLowerCase().includes(tag.toLowerCase())
      ))
    );
    
    console.log(`Found ${remainingCards.length} remaining non-land cards`);
    const selected = selectBestCards(remainingCards, remainingNonLandSlots, powerLevel, usedCards, 'medium');
    console.log(`Selected ${selected.length} additional non-land cards`);
    deck.push(...selected);
    selected.forEach(card => usedCards.add(card.name));
  }

  // Add lands
  const lands = categorizedCards.lands || [];
  console.log(`Selecting ${landCount} lands from ${lands.length} available lands`);
  
  if (lands.length > 0) {
    const selectedLands = selectBestLands(lands, landCount, commanderColors, format);
    console.log(`Selected ${selectedLands.length} lands`);
    deck.push(...selectedLands);
  } else {
    console.log('No lands available - adding basic lands for mana base');
    // Add basic lands if no lands available in collection
    const basicLandNames = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    const colorsNeeded = commanderColors.length > 0 ? commanderColors : ['W'];
    
    for (let i = 0; i < landCount; i++) {
      const colorIndex = i % colorsNeeded.length;
      const color = colorsNeeded[colorIndex];
      const landName = getBasicLandName(color);
      const basicLand = {
        id: `${landName.toLowerCase()}_${i}`,
        name: landName,
        type_line: 'Basic Land',
        oracle_text: `{T}: Add {${color}}.`,
        cmc: 0,
        colors: [],
        color_identity: [color]
      };
      deck.push(basicLand);
    }
  }

  console.log(`Built deck with ${deck.length} cards (target: ${deckSize})`);
  return deck;
}

function isLegalInFormat(card: any, format: string) {
  if (!card.legalities) return true;
  
  const legality = card.legalities[format.toLowerCase()];
  return legality === 'legal' || legality === 'restricted';
}

function isLand(card: any) {
  return card.type_line?.toLowerCase().includes('land') || false;
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
    
    // Categorize by type first
    if (type.includes('creature')) {
      categories.creatures.push(card);
    } else if (type.includes('land')) {
      categories.lands.push(card);
    } else if (type.includes('artifact')) {
      categories.artifacts.push(card);
      // Artifacts can also provide ramp
      if (text.includes('mana') || text.includes('add') || card.name?.toLowerCase().includes('sol ring')) {
        categories.ramp.push(card);
      }
    } else if (type.includes('enchantment')) {
      categories.enchantments.push(card);
    } else if (type.includes('instant')) {
      categories.instants.push(card);
    } else if (type.includes('sorcery')) {
      categories.sorceries.push(card);
    } else if (type.includes('planeswalker')) {
      categories.planeswalkers.push(card);
    }

    // Categorize by function (cards can be in multiple categories)
    if (text.includes('search') && (text.includes('land') || text.includes('basic')) || 
        text.includes('ramp') || 
        (text.includes('add') && text.includes('mana'))) {
      categories.ramp.push(card);
    }
    
    if (text.includes('draw') || 
        text.includes('card') && (text.includes('draw') || text.includes('hand')) ||
        card.name?.toLowerCase().includes('divination')) {
      categories.draw.push(card);
    }
    
    if (text.includes('destroy') || 
        text.includes('exile') || 
        text.includes('damage') && text.includes('target') ||
        (text.includes('counter') && text.includes('spell')) ||
        text.includes('remove') ||
        card.name?.toLowerCase().includes('murder') ||
        card.name?.toLowerCase().includes('lightning bolt')) {
      categories.removal.push(card);
    }
  }

  return categories;
}

function selectBestCards(cards: any[], target: number, powerLevel: number, usedCards: Set<string>, budget: string = 'medium') {
  const available = cards.filter(card => !usedCards.has(card.name));
  
  // Sort by power level and price efficiency
  const scored = available.map(card => ({
    ...card,
    score: calculateCardScore(card, powerLevel, budget)
  })).sort((a, b) => b.score - a.score);

  return scored.slice(0, target);
}

function selectBestLands(lands: any[], target: number, colors: string[], format: string) {
  const basicLands = lands.filter(land => 
    land.type_line?.includes('Basic') && 
    (colors.length === 0 || colors.some(color => 
      land.oracle_text?.includes(getColorName(color)) ||
      land.name?.toLowerCase().includes(getColorName(color))
    ))
  );
  
  const nonBasicLands = lands.filter(land => !land.type_line?.includes('Basic'));
  
  // For multi-color decks, prioritize dual lands and fixing
  const dualLands = nonBasicLands.filter(land => {
    const text = land.oracle_text?.toLowerCase() || '';
    return text.includes('add') && (text.includes('or') || colors.length <= 1);
  });
  
  const selected = [];
  
  // Add some dual lands for fixing (up to 1/3 of land count)
  const dualLandCount = Math.min(Math.floor(target / 3), dualLands.length);
  selected.push(...dualLands.slice(0, dualLandCount));
  
  // Fill rest with basic lands
  const remainingSlots = target - selected.length;
  const basicsNeeded = Math.min(remainingSlots, basicLands.length);
  
  if (colors.length > 0) {
    // Distribute basics based on color requirements
    const basicsPerColor = Math.floor(basicsNeeded / colors.length);
    const remainder = basicsNeeded % colors.length;
    
    for (let i = 0; i < colors.length; i++) {
      const colorBasics = basicLands.filter(land => 
        land.name?.toLowerCase().includes(getColorName(colors[i]))
      );
      const count = basicsPerColor + (i < remainder ? 1 : 0);
      selected.push(...colorBasics.slice(0, count));
    }
  } else {
    // Colorless or no specific colors - just add available basics
    selected.push(...basicLands.slice(0, basicsNeeded));
  }
  
  return selected.slice(0, target);
}

function getColorName(color: string): string {
  const colorMap: Record<string, string> = {
    'W': 'plains',
    'U': 'island', 
    'B': 'swamp',
    'R': 'mountain',
    'G': 'forest'
  };
  return colorMap[color] || color.toLowerCase();
}

function getBasicLandName(color: string): string {
  const landMap: Record<string, string> = {
    'W': 'Plains',
    'U': 'Island', 
    'B': 'Swamp',
    'R': 'Mountain',
    'G': 'Forest'
  };
  return landMap[color] || 'Plains';
}

function calculateCardScore(card: any, powerLevel: number, budget: string) {
  let score = 0;
  const cmc = card.cmc || 0;
  const text = card.oracle_text?.toLowerCase() || '';
  const price = parseFloat(card.prices?.usd || '0');
  
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
  
  // Price considerations
  const budgetMultiplier = budget === 'budget' ? 0.5 : budget === 'high' ? 2.0 : 1.0;
  if (price > 0) {
    const maxPrice = budget === 'budget' ? 5 : budget === 'high' ? 50 : 15;
    if (price <= maxPrice * budgetMultiplier) {
      score += 1;
    } else {
      score -= 2; // Penalize expensive cards if not in high budget
    }
  }
  
  return score;
}

function isLegalInColors(card: any, commanderColors: string[]) {
  // If no commander colors specified (colorless), allow all cards
  if (!commanderColors || commanderColors.length === 0) {
    return true;
  }
  
  const cardColors = card.color_identity || card.colors || [];
  
  // Every color in the card must be present in the commander's color identity
  return cardColors.every((color: string) => commanderColors.includes(color));
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
  const nonLands = deck.filter(card => !card.type_line?.toLowerCase().includes('land'));
  const totalCMC = nonLands.reduce((sum, card) => sum + (card.cmc || 0), 0);
  return nonLands.length > 0 ? (totalCMC / nonLands.length).toFixed(2) : 0;
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
