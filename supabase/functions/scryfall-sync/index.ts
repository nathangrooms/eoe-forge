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
  prices?: Record<string, string>;
  rarity: string;
  reserved?: boolean;
  faces?: any[];
}

async function updateSyncStatus(id: string, status: string, error?: string, processed?: number, total?: number) {
  const updateData: any = { 
    status, 
    last_sync: new Date().toISOString() 
  };
  
  if (error) updateData.error_message = error;
  if (processed !== undefined) updateData.records_processed = processed;
  if (total !== undefined) updateData.total_records = total;

  const { error: updateError } = await supabase
    .from('sync_status')
    .upsert({
      id,
      ...updateData
    });

  if (updateError) {
    console.error('Failed to update sync status:', updateError);
  }
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * (i + 1);
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${i + 1}`);
        await delay(waitTime);
        continue;
      }
      
      if (response.ok) {
        return response;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1));
    }
  }
  
  throw new Error('Max retries exceeded');
}

function tagCard(card: ScryfallCard): string[] {
  const tags: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = card.type_line.toLowerCase();
  
  // Basic type tags
  if (typeLine.includes('land')) tags.push('land');
  if (typeLine.includes('creature')) tags.push('creature');
  if (typeLine.includes('instant')) tags.push('instant');
  if (typeLine.includes('sorcery')) tags.push('sorcery');
  if (typeLine.includes('artifact')) tags.push('artifact');
  if (typeLine.includes('enchantment')) tags.push('enchantment');
  if (typeLine.includes('planeswalker')) tags.push('planeswalker');
  
  // Role tags
  if (text.includes('add') && text.includes('mana')) tags.push('ramp');
  if (text.includes('destroy') || text.includes('exile')) tags.push('removal');
  if (text.includes('counter target') && typeLine.includes('instant')) tags.push('counterspell');
  if (text.includes('draw') && text.includes('card')) tags.push('draw');
  if (text.includes('search') && text.includes('library')) tags.push('tutor');
  if (text.includes('return') && text.includes('graveyard')) tags.push('recursion');
  if (text.includes('hexproof') || text.includes('indestructible') || text.includes('protection')) tags.push('protection');
  
  // Synergy tags
  if (text.includes('token')) tags.push('tokens');
  if (text.includes('sacrifice')) tags.push('sacrifice');
  if (text.includes('enters the battlefield') || text.includes('enter the battlefield')) tags.push('etb');
  if (text.includes('equipment')) tags.push('equipment');
  if (text.includes('aura')) tags.push('auras');
  if (text.includes('landfall')) tags.push('landfall');
  if (text.includes('storm')) tags.push('storm');
  if (text.includes('energy')) tags.push('energy');
  
  // Win condition detection
  if (text.includes('wins the game') || text.includes('lose the game')) tags.push('wincon');
  if (text.includes('infinite') || (text.includes('copy') && text.includes('spell'))) tags.push('combo-piece');
  
  // Fast mana
  if ((card.cmc <= 2 && tags.includes('ramp')) || 
      (typeLine.includes('artifact') && text.includes('add') && card.cmc <= 2)) {
    tags.push('fast-mana');
  }
  
  return tags;
}

async function syncCards(): Promise<void> {
  console.log('🚀 Starting Scryfall card sync...');
  console.log('📊 Current time:', new Date().toISOString());
  
  await updateSyncStatus('scryfall_cards', 'running');
  
  try {
    // Get bulk data info with detailed logging
    console.log('📡 Fetching bulk data info from Scryfall...');
    console.log('URL: https://api.scryfall.com/bulk-data');
    
    const bulkResponse = await fetchWithRetry('https://api.scryfall.com/bulk-data');
    console.log(`✅ Bulk data response status: ${bulkResponse.status}`);
    
    const bulkData = await bulkResponse.json();
    console.log(`📦 Bulk data received, found ${bulkData.data?.length || 0} data types`);
    
    // Find default cards bulk data
    const defaultCards = bulkData.data.find((item: any) => item.type === 'default_cards');
    if (!defaultCards) {
      console.error('❌ Default cards bulk data not found in response:', JSON.stringify(bulkData.data.map((d: any) => d.type)));
      throw new Error('Default cards bulk data not found');
    }
    
    console.log(`🎯 Found default cards bulk data:`);
    console.log(`   - File size: ${defaultCards.size ? (defaultCards.size / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'}`);
    console.log(`   - Compressed size: ${defaultCards.compressed_size ? (defaultCards.compressed_size / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'}`);
    console.log(`   - Download URI: ${defaultCards.download_uri}`);
    console.log(`   - Updated: ${defaultCards.updated_at}`);
    
    // Don't set total count yet - we'll determine it after filtering
    await updateSyncStatus('scryfall_cards', 'running', undefined, 0, 0);
    
    // Download and process cards with streaming to avoid memory issues
    console.log('⬇️ Starting streaming download of card data...');
    const downloadStartTime = Date.now();
    
    const cardsResponse = await fetchWithRetry(defaultCards.download_uri);
    const downloadTime = Date.now() - downloadStartTime;
    
    console.log(`✅ Download connection established in ${(downloadTime / 1000).toFixed(1)}s`);
    console.log(`📄 Response status: ${cardsResponse.status}`);
    console.log(`📊 Content length: ${cardsResponse.headers.get('content-length') || 'unknown'}`);
    
    if (!cardsResponse.body) {
      throw new Error('No response body received');
    }
    
    console.log('🔍 Processing card data stream...');
    const parseStartTime = Date.now();
    
    const reader = cardsResponse.body.getReader();
    const decoder = new TextDecoder();
    const cards: ScryfallCard[] = [];
    let buffer = '';
    let totalProcessed = 0;
    let cardCount = 0;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        totalProcessed += value.length;
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            try {
              const card = JSON.parse(trimmedLine) as ScryfallCard;
              // Filter out tokens and non-paper cards
              if (card.type_line && !card.type_line.toLowerCase().includes('token') && card.set) {
                cards.push(card);
              }
              cardCount++;
              
              // Process in batches to avoid memory buildup
              if (cards.length >= 1000) {
                await processBatch(cards.splice(0, 1000), cardCount);
              }
              
              // Log progress every 10k cards
              if (cardCount % 10000 === 0) {
                console.log(`📊 Processed ${cardCount} cards, found ${cards.length} valid cards in current batch`);
                await updateSyncStatus('scryfall_cards', 'running', undefined, cardCount, 0);
              }
              
            } catch (parseError) {
              console.warn(`⚠️ Failed to parse card: ${parseError.message}`);
            }
          }
        }
      }
      
      // Process remaining cards in buffer
      if (buffer.trim()) {
        try {
          const card = JSON.parse(buffer.trim()) as ScryfallCard;
          if (card.type_line && !card.type_line.toLowerCase().includes('token') && card.set) {
            cards.push(card);
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse final card: ${parseError.message}`);
        }
      }
      
      // Process final batch
      if (cards.length > 0) {
        await processBatch(cards, cardCount);
      }
      
    } finally {
      reader.releaseLock();
    }
    
    const parseTime = Date.now() - parseStartTime;
    console.log(`✅ Streaming completed in ${(parseTime / 1000).toFixed(1)}s`);
    console.log(`🃏 Successfully processed ${cardCount} total cards`);
    console.log(`📊 Processed ${(totalProcessed / 1024 / 1024).toFixed(1)}MB of data`);
    
    await updateSyncStatus('scryfall_cards', 'running', undefined, cardCount, cardCount);
    
    console.log(`✅ All cards processed successfully`);
    await updateSyncStatus('scryfall_cards', 'completed', undefined, cardCount, cardCount);
    
  } catch (error) {
    console.error('Sync failed:', error);
    await updateSyncStatus('scryfall_cards', 'failed', error.message);
    throw error;
  }
}

async function processBatch(cards: ScryfallCard[], totalProcessed: number): Promise<void> {
  const cardData = cards.map(card => ({
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    set_code: card.set,
    collector_number: card.collector_number,
    layout: card.layout,
    type_line: card.type_line,
    cmc: card.cmc,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    oracle_text: card.oracle_text,
    mana_cost: card.mana_cost,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    keywords: card.keywords || [],
    legalities: card.legalities,
    image_uris: card.image_uris || {},
    prices: card.prices || {},
    is_legendary: card.type_line.toLowerCase().includes('legendary'),
    is_reserved: card.reserved || false,
    rarity: card.rarity,
    tags: tagCard(card),
    faces: card.faces
  }));
  
  const { error } = await supabase
    .from('cards')
    .upsert(cardData, { onConflict: 'id' });
  
  if (error) {
    console.error('Batch upsert error:', error);
    throw error;
  }
  
  console.log(`💾 Processed batch of ${cards.length} cards (total: ${totalProcessed})`);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json().catch(() => ({ action: 'sync' }));
    
    if (action === 'sync') {
      // Check if sync is already running
      const { data: existingSync } = await supabase
        .from('sync_status')
        .select('status, last_sync')
        .eq('id', 'scryfall_cards')
        .single();
      
      if (existingSync?.status === 'running') {
        // Check if it's been running for more than 1 hour (likely stuck)
        const lastSync = new Date(existingSync.last_sync);
        const now = new Date();
        const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastSync < 1) {
          return new Response(
            JSON.stringify({ message: 'Sync already running', status: existingSync.status }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409 
            }
          );
        } else {
          console.log('Resetting stuck sync status');
          await updateSyncStatus('scryfall_cards', 'failed', 'Sync timeout - automatically reset');
        }
      }
      
      // Use background task to prevent timeout
      const backgroundSync = syncCards().catch(error => {
        console.error('Background sync failed:', error);
        updateSyncStatus('scryfall_cards', 'failed', error.message);
      });
      
      // Start the background task
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(backgroundSync);
      } else {
        // Fallback for environments without EdgeRuntime
        backgroundSync;
      }
      
      return new Response(
        JSON.stringify({ message: 'Card sync started', timestamp: new Date().toISOString() }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202 
        }
      );
    }
    
    if (action === 'status') {
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .single();
      
      if (error) {
        throw error;
      }
      
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});