import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'MTGDeckBuilder/1.0';
const RATE_LIMIT_DELAY = 110; // 110ms between requests (safe under 10/sec)

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  layout: string;
  type_line: string;
  cmc: number;
  colors?: string[];
  color_identity?: string[];
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
  legalities: Record<string, string>;
  image_uris?: Record<string, string>;
  card_faces?: Array<{ image_uris?: Record<string, string> }>;
  prices?: Record<string, string>;
  rarity: string;
  reserved?: boolean;
  games?: string[];
}

async function updateSyncStatus(
  status: string, 
  processed?: number, 
  total?: number, 
  step?: string, 
  error?: string
) {
  const updateData: Record<string, any> = { 
    status, 
    last_sync: new Date().toISOString() 
  };
  
  if (processed !== undefined) updateData.records_processed = processed;
  if (total !== undefined) updateData.total_records = total;
  if (step) updateData.current_step = step;
  if (error) updateData.error_message = error;
  else updateData.error_message = null;

  await supabase.from('sync_status').upsert({ id: 'scryfall_cards', ...updateData }, { onConflict: 'id' });
}

function tagCard(card: ScryfallCard): string[] {
  const tags: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  
  if (typeLine.includes('land')) tags.push('land');
  if (typeLine.includes('creature')) tags.push('creature');
  if (typeLine.includes('instant')) tags.push('instant');
  if (typeLine.includes('sorcery')) tags.push('sorcery');
  if (typeLine.includes('artifact')) tags.push('artifact');
  if (typeLine.includes('enchantment')) tags.push('enchantment');
  if (typeLine.includes('planeswalker')) tags.push('planeswalker');
  
  if (text.includes('add') && text.includes('mana')) tags.push('ramp');
  if (text.includes('destroy') || text.includes('exile')) tags.push('removal');
  if (text.includes('draw') && text.includes('card')) tags.push('draw');
  if (text.includes('search') && text.includes('library')) tags.push('tutor');
  if (text.includes('token')) tags.push('tokens');
  
  return tags;
}

function getImageUris(card: ScryfallCard): Record<string, string> {
  if (card.image_uris) return card.image_uris;
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris;
  return {};
}

function transformCard(card: ScryfallCard) {
  return {
    id: card.id,
    oracle_id: card.oracle_id || card.id,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number,
    layout: card.layout || 'normal',
    type_line: card.type_line || 'Unknown',
    cmc: card.cmc || 0,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    oracle_text: card.oracle_text,
    mana_cost: card.mana_cost,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    keywords: card.keywords || [],
    legalities: card.legalities || {},
    image_uris: getImageUris(card),
    prices: card.prices || {},
    is_legendary: (card.type_line || '').toLowerCase().includes('legendary'),
    is_reserved: card.reserved || false,
    rarity: card.rarity || 'common',
    tags: tagCard(card),
  };
}

async function fetchPage(url: string): Promise<{ cards: ScryfallCard[]; nextPage: string | null; total: number }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
  });
  
  if (response.status === 404 || response.status === 422) {
    return { cards: [], nextPage: null, total: 0 };
  }
  
  if (!response.ok) {
    throw new Error(`Scryfall API error: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    cards: data.data || [],
    nextPage: data.has_more ? data.next_page : null,
    total: data.total_cards || 0
  };
}

async function syncCards(): Promise<{ success: boolean; processed: number; error?: string }> {
  console.log('🚀 Starting paginated card sync from Scryfall...');
  
  try {
    await updateSyncStatus('running', 0, 0, 'initializing');
    
    let totalProcessed = 0;
    let page = 1;
    let consecutiveErrors = 0;
    let estimatedTotal = 0;
    
    // Use search API with pagination - get all paper cards
    let currentUrl: string | null = 'https://api.scryfall.com/cards/search?q=-is%3Adigital+game%3Apaper&unique=cards&page=1';
    
    while (currentUrl) {
      try {
        console.log(`📦 Fetching page ${page}...`);
        
        const { cards, nextPage, total } = await fetchPage(currentUrl);
        
        if (page === 1) {
          estimatedTotal = total;
          console.log(`📊 Total cards to sync: ${estimatedTotal}`);
        }
        
        if (cards.length === 0) {
          console.log('✅ No more cards - sync complete');
          break;
        }
        
        // Filter out tokens and transform
        const validCards = cards.filter(c => c.type_line && !c.type_line.includes('Token'));
        const transformed = validCards.map(transformCard);
        
        if (transformed.length > 0) {
          const { error } = await supabase
            .from('cards')
            .upsert(transformed, { onConflict: 'id', ignoreDuplicates: false });
          
          if (error) {
            console.error(`❌ DB error on page ${page}:`, error.message);
            consecutiveErrors++;
            if (consecutiveErrors >= 5) throw new Error(`Too many errors: ${error.message}`);
            await new Promise(r => setTimeout(r, 2000));
            continue; // Retry same page
          }
          
          consecutiveErrors = 0;
          totalProcessed += transformed.length;
          console.log(`✅ Page ${page}: saved ${transformed.length} cards (total: ${totalProcessed})`);
        }
        
        // Update progress every 5 pages
        if (page % 5 === 0) {
          await updateSyncStatus('running', totalProcessed, estimatedTotal, 'processing');
        }
        
        currentUrl = nextPage;
        page++;
        
        // Rate limit
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
        
      } catch (pageError) {
        console.error(`❌ Error on page ${page}:`, (pageError as Error).message);
        consecutiveErrors++;
        if (consecutiveErrors >= 5) throw pageError;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    console.log(`🎉 Sync complete! Total: ${totalProcessed} cards`);
    await updateSyncStatus('completed', totalProcessed, totalProcessed, 'complete');
    return { success: true, processed: totalProcessed };
    
  } catch (error) {
    const message = (error as Error).message;
    console.error('💥 Sync failed:', message);
    await updateSyncStatus('failed', 0, 0, 'error', message);
    return { success: false, processed: 0, error: message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let action = 'sync';
    try {
      const body = await req.json();
      action = body.action || 'sync';
    } catch { /* default to sync */ }
    
    if (action === 'status') {
      const { data } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      return new Response(JSON.stringify(data || { status: 'never' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'stop') {
      await updateSyncStatus('stopped', undefined, undefined, 'stopped', 'Manually stopped');
      return new Response(JSON.stringify({ message: 'Sync stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'sync') {
      // Check if already running
      const { data: status } = await supabase
        .from('sync_status')
        .select('status, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      if (status?.status === 'running') {
        const minutesAgo = (Date.now() - new Date(status.last_sync).getTime()) / 60000;
        if (minutesAgo < 3) {
          return new Response(JSON.stringify({ 
            message: 'Sync already in progress',
            status: 'running'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409
          });
        }
      }
      
      // Use EdgeRuntime.waitUntil if available
      const syncPromise = syncCards();
      
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(syncPromise);
        return new Response(JSON.stringify({ 
          message: 'Sync started in background',
          status: 'started'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        const result = await syncPromise;
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500
        });
      }
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
    
  } catch (error) {
    console.error('💥 Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
