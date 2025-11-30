import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tutor catalog with quality weights
const TUTOR_CATALOG = {
  "broad": {
    "weight": 1.0,
    "cards": ["Demonic Tutor", "Vampiric Tutor", "Imperial Seal", "Diabolic Intent", "Grim Tutor", "Cruel Tutor", "Profane Tutor"]
  },
  "category_high": {
    "weight": 0.85,
    "cards": ["Enlightened Tutor", "Mystical Tutor", "Worldly Tutor", "Gamble", "Burning Wish", "Living Wish"]
  },
  "category_mid": {
    "weight": 0.7,
    "cards": ["Idyllic Tutor", "Fabricate", "Steelshaper's Gift", "Chord of Calling", "Green Sun's Zenith", "Finale of Devastation", "Eladamri's Call", "Congregation at Dawn"]
  },
  "narrow": {
    "weight": 0.5,
    "cards": ["Expedition Map", "Muddle the Mixture", "Dimir Infiltrator", "Drift of Phantasms", "Perplex", "Dizzy Spell", "Merchant Scroll", "Mystical Teachings", "Shred Memory"]
  },
  "pseudo": {
    "weight": 0.35,
    "cards": ["Dig Through Time", "Treasure Cruise", "Intuition", "Impulse", "Fact or Fiction", "Brainstorm"]
  }
};

// Game changer catalog
const GAME_CHANGER_CATALOG = {
  "compact_combo": [
    { "name": "Thassa's Oracle", "requires": ["Demonic Consultation", "Tainted Pact"] },
    { "name": "Isochron Scepter", "requires": ["Dramatic Reversal"] },
    { "name": "Dockside Extortionist", "requires": ["Temur Sabertooth", "Cloudstone Curio", "Deadeye Navigator"] },
    { "name": "Kiki-Jiki, Mirror Breaker", "requires": ["Deceiver Exarch", "Pestermite", "Felidar Guardian", "Zealous Conscripts"] },
    { "name": "Splinter Twin", "requires": ["Deceiver Exarch", "Pestermite"] },
    { "name": "Underworld Breach", "requires": ["Brain Freeze", "Lion's Eye Diamond"] },
    { "name": "Food Chain", "requires": ["Eternal Scourge", "Misthollow Griffin", "Squee, the Immortal"] },
    { "name": "Protean Hulk", "requires": [] }
  ],
  "finisher_bomb": [
    "Craterhoof Behemoth", "Torment of Hailfire", "Exsanguinate", "Aetherflux Reservoir", 
    "Approach of the Second Sun", "Finale of Devastation", "Crackle with Power", "Expropriate", 
    "Insurrection", "Triumph of the Hordes"
  ],
  "inevitability_engine": [
    "Rhystic Study", "Mystic Remora", "Bolas's Citadel", "The Gitrog Monster", 
    "Dark Confidant", "Necropotence", "Phyrexian Arena", "Ad Nauseam", 
    "Thrasios, Triton Hero", "Kinnan, Bonder Prodigy"
  ],
  "massive_swing": [
    "Cyclonic Rift", "Time Warp", "Nexus of Fate", "Temporal Manipulation", 
    "Capture of Jingzhou", "Time Stretch", "Aggravated Assault", "Savage Beating", 
    "Waves of Aggression", "Insurrection", "Expropriate"
  ]
};

// Fast mana sources
const FAST_MANA = [
  "Mana Crypt", "Sol Ring", "Mana Vault", "Chrome Mox", "Mox Diamond", "Mox Opal",
  "Jeweled Lotus", "Lotus Petal", "Lion's Eye Diamond", "Grim Monolith"
];

interface Card {
  id?: string;
  name: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  mana_cost?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
}

function detectTutors(cards: Card[]): { quality: number; list: Array<{name: string; quality: string; mv: number}> } {
  let quality = 0;
  const list: Array<{name: string; quality: string; mv: number}> = [];
  
  cards.forEach(card => {
    const name = card.name;
    const text = card.oracle_text?.toLowerCase() || '';
    
    // Check catalog
    for (const [category, data] of Object.entries(TUTOR_CATALOG)) {
      if (data.cards.some(t => t.toLowerCase() === name.toLowerCase())) {
        quality += data.weight;
        list.push({ name, quality: category, mv: card.cmc });
        return;
      }
    }
    
    // Heuristic detection for unlisted tutors
    if (text.includes('search') && text.includes('library') && !text.includes('basic land')) {
      let weight = 0;
      if (text.includes('any card')) weight = 1.0;
      else if (text.includes('creature') || text.includes('artifact') || text.includes('enchantment')) weight = 0.7;
      else weight = 0.5;
      
      if (weight > 0) {
        quality += weight;
        list.push({ name, quality: 'detected', mv: card.cmc });
      }
    }
  });
  
  return { quality, list };
}

function detectGameChangers(cards: Card[]) {
  const result = {
    count: 0,
    compact_combo: 0,
    finisher_bombs: 0,
    inevitability_engines: 0,
    massive_swing: 0,
    list: [] as Array<{name: string; class: string; reason: string}>
  };
  
  const cardNames = cards.map(c => c.name.toLowerCase());
  
  // Check compact combos
  for (const combo of GAME_CHANGER_CATALOG.compact_combo) {
    const hasComboCard = cardNames.some(name => name === combo.name.toLowerCase());
    if (hasComboCard) {
      const hasPartner = combo.requires.length === 0 || 
        combo.requires.some(req => cardNames.some(name => name === req.toLowerCase()));
      
      if (hasPartner) {
        result.compact_combo++;
        result.count++;
        result.list.push({
          name: combo.name,
          class: 'compact_combo',
          reason: combo.requires.length > 0 ? `with ${combo.requires.join(' or ')}` : 'standalone'
        });
      }
    }
  }
  
  // Check finisher bombs
  for (const bomb of GAME_CHANGER_CATALOG.finisher_bomb) {
    if (cardNames.some(name => name === bomb.toLowerCase())) {
      result.finisher_bombs++;
      result.count++;
      result.list.push({ name: bomb, class: 'finisher_bomb', reason: 'game-ending threat' });
    }
  }
  
  // Check inevitability engines
  for (const engine of GAME_CHANGER_CATALOG.inevitability_engine) {
    if (cardNames.some(name => name === engine.toLowerCase())) {
      result.inevitability_engines++;
      result.count++;
      result.list.push({ name: engine, class: 'inevitability_engine', reason: 'card advantage engine' });
    }
  }
  
  // Check massive swings
  for (const swing of GAME_CHANGER_CATALOG.massive_swing) {
    if (cardNames.some(name => name === swing.toLowerCase())) {
      result.massive_swing++;
      result.count++;
      result.list.push({ name: swing, class: 'massive_swing', reason: 'tempo swing' });
    }
  }
  
  return result;
}

function calculatePowerScore(cards: Card[], commander?: Card) {
  const allCards = commander ? [commander, ...cards] : cards;
  
  // Detect tutors and game changers
  const tutorAnalysis = detectTutors(allCards);
  const gameChangerAnalysis = detectGameChangers(allCards);
  
  // Calculate basic metrics
  const totalCards = allCards.length;
  const avgCmc = allCards.reduce((sum, c) => sum + (c.cmc || 0), 0) / totalCards;
  const lowCurveCount = allCards.filter(c => c.cmc <= 2 && !c.type_line.toLowerCase().includes('land')).length;
  
  // Fast mana count
  const fastManaCount = allCards.filter(c => 
    FAST_MANA.some(fm => fm.toLowerCase() === c.name.toLowerCase()) ||
    (c.cmc <= 2 && c.oracle_text?.toLowerCase().includes('add') && 
     c.oracle_text?.toLowerCase().includes('mana') && 
     !c.type_line.toLowerCase().includes('land'))
  ).length;
  
  // Interaction count
  const interactionCount = allCards.filter(c => {
    const text = c.oracle_text?.toLowerCase() || '';
    return text.includes('counter target') || 
           text.includes('destroy') || 
           text.includes('exile') ||
           text.includes('remove') ||
           text.includes('return') && text.includes('hand');
  }).length;
  
  // Card advantage count
  const cardAdvCount = allCards.filter(c => {
    const text = c.oracle_text?.toLowerCase() || '';
    return text.includes('draw') && text.includes('card') ||
           text.includes('whenever') && text.includes('draw');
  }).length;
  
  // Calculate subscores (0-100)
  const subscores = {
    speed: Math.min(100, (fastManaCount * 8) + (lowCurveCount * 1.5) + ((10 - avgCmc) * 5)),
    interaction: Math.min(100, interactionCount * 4),
    tutors: Math.min(100, tutorAnalysis.quality * 10),
    resilience: Math.min(100, interactionCount * 2 + fastManaCount * 3),
    card_advantage: Math.min(100, cardAdvCount * 5),
    mana: Math.min(100, fastManaCount * 6 + (lowCurveCount * 0.8)),
    consistency: Math.min(100, tutorAnalysis.quality * 8 + (lowCurveCount * 1.2)),
    stax_pressure: 0, // Simplified for now
    synergy: Math.min(100, gameChangerAnalysis.count * 8)
  };
  
  // Calculate weighted score
  const weights = {
    speed: 0.20,
    interaction: 0.15,
    tutors: 0.12,
    resilience: 0.12,
    card_advantage: 0.10,
    mana: 0.12,
    consistency: 0.12,
    stax_pressure: 0.04,
    synergy: 0.03
  };
  
  const rawScore = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (subscores[key as keyof typeof subscores] * weight);
  }, 0);
  
  // Map to 1-10 scale using logistic function
  const normalized = (rawScore - 55) / 12;
  const sigmoid = 1 / (1 + Math.exp(-normalized));
  let power = 1 + (sigmoid * 9);
  
  // Determine band
  let band: 'casual' | 'mid' | 'high' | 'cedh';
  if (power <= 3.4) band = 'casual';
  else if (power <= 6.6) band = 'mid';
  else if (power <= 8.5) band = 'high';
  else band = 'cedh';
  
  // Flags and adjustments
  const tutorThreshold = band === 'cedh' ? 6.0 : (band === 'high' ? 3.0 : 1.5);
  const gcThreshold = (band === 'cedh' || band === 'high') ? 2 : 1;
  
  const no_tutors = tutorAnalysis.quality < tutorThreshold;
  const no_game_changers = gameChangerAnalysis.count < gcThreshold;
  
  let powerAdjustment = 0;
  
  if (no_tutors) {
    subscores.tutors = Math.min(subscores.tutors, 35);
    powerAdjustment -= band === 'cedh' ? 1.0 : 0.6;
  }
  
  if (no_game_changers) {
    subscores.speed = Math.max(0, subscores.speed - 8);
    subscores.resilience = Math.max(0, subscores.resilience - 6);
    powerAdjustment -= band === 'cedh' ? 1.4 : 0.8;
  }
  
  power = Math.max(1, Math.min(10, power + powerAdjustment));
  
  // Recalculate band after adjustments
  if (power <= 3.4) band = 'casual';
  else if (power <= 6.6) band = 'mid';
  else if (power <= 8.5) band = 'high';
  else band = 'cedh';
  
  // Identify drivers and drags
  const drivers: string[] = [];
  const drags: string[] = [];
  const threshold = power >= 7 ? 70 : power >= 4 ? 60 : 50;
  
  Object.entries(subscores).forEach(([category, score]) => {
    if (score >= threshold && drivers.length < 3) {
      drivers.push(`Strong ${category} (${Math.round(score)}/100)`);
    } else if (score <= (power >= 7 ? 50 : power >= 4 ? 40 : 30) && drags.length < 3) {
      drags.push(`Weak ${category} (${Math.round(score)}/100)`);
    }
  });
  
  return {
    power: Math.round(power * 10) / 10,
    band,
    subscores,
    flags: {
      no_tutors,
      no_game_changers
    },
    diagnostics: {
      tutors: {
        count_raw: tutorAnalysis.list.length,
        count_quality: tutorAnalysis.quality,
        list: tutorAnalysis.list
      },
      game_changers: {
        count: gameChangerAnalysis.count,
        classes: {
          compact_combo: gameChangerAnalysis.compact_combo,
          finisher_bombs: gameChangerAnalysis.finisher_bombs,
          inevitability_engines: gameChangerAnalysis.inevitability_engines,
          massive_swing: gameChangerAnalysis.massive_swing
        },
        list: gameChangerAnalysis.list
      }
    },
    drivers,
    drags,
    metrics: {
      avgCmc,
      fastManaCount,
      interactionCount,
      cardAdvCount,
      lowCurveCount
    }
  };
}

serve(async (req) => {
  console.log('calculate-deck-power function called');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { deck_id } = await req.json();
    
    if (!deck_id) {
      throw new Error('deck_id is required');
    }

    console.log(`Calculating power for deck ${deck_id}`);

    // Fetch deck info
    const { data: deck, error: deckError } = await supabase
      .from('user_decks')
      .select('*')
      .eq('id', deck_id)
      .single();

    if (deckError) throw deckError;
    if (!deck) throw new Error('Deck not found');

    // Fetch deck cards with card data
    const { data: deckCards, error: cardsError } = await supabase
      .from('deck_cards')
      .select(`
        *,
        card:cards(*)
      `)
      .eq('deck_id', deck_id);

    if (cardsError) throw cardsError;

    // Transform cards
    const cards: Card[] = [];
    let commander: Card | undefined;

    deckCards.forEach((dc: any) => {
      if (!dc.card) return;
      
      const card: Card = {
        id: dc.card.id,
        name: dc.card.name,
        cmc: dc.card.cmc || 0,
        type_line: dc.card.type_line || '',
        oracle_text: dc.card.oracle_text || '',
        colors: dc.card.colors || [],
        color_identity: dc.card.color_identity || [],
        mana_cost: dc.card.mana_cost || '',
        power: dc.card.power,
        toughness: dc.card.toughness,
        keywords: dc.card.keywords || []
      };

      if (dc.is_commander) {
        commander = card;
      } else {
        for (let i = 0; i < dc.quantity; i++) {
          cards.push(card);
        }
      }
    });

    console.log(`Deck has ${cards.length} cards, commander: ${commander?.name || 'none'}`);

    // Calculate power
    const powerScore = calculatePowerScore(cards, commander);

    console.log(`Calculated power: ${powerScore.power} (${powerScore.band})`);

    // Update deck with new power level
    const { error: updateError } = await supabase
      .from('user_decks')
      .update({ power_level: Math.round(powerScore.power) })
      .eq('id', deck_id);

    if (updateError) {
      console.error('Error updating deck power:', updateError);
    }

    return new Response(
      JSON.stringify(powerScore),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in calculate-deck-power:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to calculate deck power'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
