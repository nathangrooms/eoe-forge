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
  console.log(`📊 Updating sync status: ${status}, processed: ${processed}, total: ${total}, error: ${error}`);
  
  try {
    const updateData: any = { 
      status, 
      last_sync: new Date().toISOString() 
    };
    
    if (error) updateData.error_message = error;
    if (processed !== undefined) updateData.records_processed = processed;
    if (total !== undefined) updateData.total_records = total;

    // Use upsert to handle both insert and update cases
    const { error: updateError } = await supabase
      .from('sync_status')
      .upsert({
        id,
        ...updateData
      }, { 
        onConflict: 'id'
      });

    if (updateError) {
      console.error('❌ Failed to update sync status:', updateError);
      console.error('Update data was:', { id, ...updateData });
    } else {
      console.log('✅ Sync status updated successfully');
    }
  } catch (err) {
    console.error('💥 Exception updating sync status:', err);
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
  console.log('🚀 Starting Oracle Cards bulk sync...');
  
  try {
    console.log('📝 Updating initial sync status...');
    await updateSyncStatus('scryfall_cards', 'running', null, 0, 0);
    console.log('✅ Initial status update complete');
    
    // Get bulk data info from Scryfall
    console.log('🌐 Fetching bulk data info from Scryfall...');
    const bulkResponse = await fetchWithRetry('https://api.scryfall.com/bulk-data');
    
    if (!bulkResponse.ok) {
      throw new Error(`Bulk data fetch failed: ${bulkResponse.status} ${bulkResponse.statusText}`);
    }
    
    const bulkData = await bulkResponse.json();
    console.log(`📦 Bulk data received, found ${bulkData.data?.length || 0} data types`);
    
    // Find Oracle Cards bulk data (smaller, ~27K unique cards)
    const oracleCards = bulkData.data.find((item: any) => item.type === 'oracle_cards');
    if (!oracleCards) {
      throw new Error('Oracle cards bulk data not found');
    }
    
    console.log(`🎯 Found Oracle Cards bulk data:`);
    console.log(`   - Size: ${(oracleCards.size / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   - Updated: ${oracleCards.updated_at}`);
    console.log(`   - URI: ${oracleCards.download_uri}`);

    // Pre-calculate total by doing a quick count pass
    console.log('📊 Pre-calculating total card count...');
    const countResponse = await fetchWithRetry(oracleCards.download_uri);
    if (!countResponse.ok || !countResponse.body) {
      throw new Error(`Count fetch failed: ${countResponse.status}`);
    }
    
    const countReader = countResponse.body.getReader();
    const countDecoder = new TextDecoder();
    let countBuffer = '';
    let estimatedTotal = 0;
    
    try {
      while (true) {
        const { done, value } = await countReader.read();
        if (done) break;
        
        const chunk = countDecoder.decode(value, { stream: true });
        countBuffer += chunk;
        
        // Count valid card entries (lines with oracle_id and no "token" in type_line)
        const lines = countBuffer.split('\n');
        countBuffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const card = JSON.parse(line);
            if (card.oracle_id && card.type_line && !card.type_line.toLowerCase().includes('token')) {
              estimatedTotal++;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      countReader.releaseLock();
    }
    
    console.log(`🔢 Estimated total cards: ${estimatedTotal}`);
    await updateSyncStatus('scryfall_cards', 'running', null, 0, estimatedTotal);
    
    // Start streaming download
    console.log('⬇️ Starting Oracle Cards download...');
    const cardsResponse = await fetchWithRetry(oracleCards.download_uri);
    
    if (!cardsResponse.ok || !cardsResponse.body) {
      throw new Error(`Download failed: ${cardsResponse.status}`);
    }
    
    console.log('✅ Download stream connected, processing cards...');
    
    const reader = cardsResponse.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let validCardCount = 0;
    let batchSize = 50; // Much smaller batches for frequent updates
    let currentBatch: any[] = [];
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('📊 Stream complete');
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const card = JSON.parse(line);
            
            // Filter out tokens and invalid cards
            if (!card.type_line || !card.set || card.type_line.toLowerCase().includes('token')) {
              continue;
            }
            
            // Add to current batch
            currentBatch.push({
              id: card.id,
              oracle_id: card.oracle_id,
              name: card.name,
              set_code: card.set,
              collector_number: card.collector_number,
              layout: card.layout || 'normal',
              type_line: card.type_line,
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
              image_uris: card.image_uris || {},
              prices: card.prices || {},
              is_legendary: card.type_line.toLowerCase().includes('legendary'),
              is_reserved: card.reserved || false,
              rarity: card.rarity || 'common',
              tags: tagCard(card)
            });
            
            validCardCount++;
            
            // Process batch when it reaches batchSize
            if (currentBatch.length >= batchSize) {
              await processBatch(currentBatch, validCardCount);
              console.log(`💾 Batch saved: ${validCardCount} total cards processed`);
              currentBatch = [];
              
                              // Update progress frequently for live updates
                              await updateSyncStatus('scryfall_cards', 'running', null, validCardCount, estimatedTotal);
              
              // Small delay to prevent overwhelming
              await delay(25);
            }
            
          } catch (parseError) {
            // Skip invalid JSON
            continue;
          }
        }
      }
      
      // Process final batch
      if (currentBatch.length > 0) {
        await processBatch(currentBatch, validCardCount);
        console.log(`💾 Final batch saved: ${validCardCount} total cards`);
      }
      
    } finally {
      reader.releaseLock();
    }
    
    console.log(`✅ Oracle Cards sync completed: ${validCardCount} cards processed`);
    await updateSyncStatus('scryfall_cards', 'completed', null, validCardCount, validCardCount);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    await updateSyncStatus('scryfall_cards', 'failed', error.message);
    throw error;
  }
}

async function processBatch(cards: any[], totalProcessed: number): Promise<void> {
  if (cards.length === 0) return;
  
  const { error } = await supabase
    .from('cards')
    .upsert(cards, { onConflict: 'id' });
  
  if (error) {
    console.error('Batch upsert error:', error);
    throw error;
  }
  
  console.log(`💾 Saved batch of ${cards.length} cards (total processed: ${totalProcessed})`);
}

serve(async (req) => {
  console.log('🌟 Edge function invoked:', new Date().toISOString());
  console.log('📥 Request method:', req.method);
  console.log('🔗 Request URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body with better error handling
    let requestBody;
    try {
      const text = await req.text();
      requestBody = text ? JSON.parse(text) : { action: 'sync' };
    } catch (parseError) {
      console.log('📋 No JSON body, defaulting to sync action');
      requestBody = { action: 'sync' };
    }
    
    console.log('📋 Request body:', JSON.stringify(requestBody));
    const { action } = requestBody;
    
    if (action === 'sync') {
      console.log('🔄 Sync action requested');
      
      // Check if sync is already running
      const { data: existingSync, error: fetchError } = await supabase
        .from('sync_status')
        .select('status, last_sync')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      if (fetchError) {
        console.error('❌ Failed to fetch sync status:', fetchError);
        throw fetchError;
      }
      
      console.log('📊 Current sync status:', existingSync);
      
      if (existingSync?.status === 'running') {
        // Check if it's been running for more than 30 minutes (likely stuck)
        const lastSync = new Date(existingSync.last_sync);
        const now = new Date();
        const minutesSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60);
        
        console.log('⏰ Minutes since last sync:', minutesSinceLastSync);
        
        if (minutesSinceLastSync < 30) {
          console.log('⚠️ Sync already running, rejecting request');
          return new Response(
            JSON.stringify({ 
              message: 'Sync already running', 
              status: existingSync.status,
              lastSync: existingSync.last_sync 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409 
            }
          );
        } else {
          console.log('🔄 Resetting stuck sync status');
          await updateSyncStatus('scryfall_cards', 'failed', 'Sync timeout - automatically reset');
        }
      }
      
      console.log('🚀 Starting background sync task');
      
      // Start sync as background task to avoid timeout
      syncCards().catch(async (syncError) => {
        console.error('💥 Background sync failed:', syncError);
        await updateSyncStatus('scryfall_cards', 'failed', `Sync error: ${syncError.message}`);
      });
      
      console.log('✅ Sync task started in background');
      return new Response(
        JSON.stringify({ 
          message: 'Card sync started successfully', 
          timestamp: new Date().toISOString(),
          status: 'started'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    if (action === 'stop') {
      console.log('🛑 Stop sync requested');
      
      await updateSyncStatus('scryfall_cards', 'failed', 'Manually stopped by user');
      
      console.log('✅ Sync stopped successfully');
      return new Response(
        JSON.stringify({ 
          message: 'Sync stopped', 
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    if (action === 'status') {
      console.log('📊 Status check requested');
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .eq('id', 'scryfall_cards')
        .maybeSingle();
      
      if (error) {
        console.error('❌ Status fetch error:', error);
        throw error;
      }
      
      console.log('✅ Status retrieved:', data);
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('❌ Invalid action received:', action);
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
    
  } catch (error) {
    console.error('💥 Edge function error:', error);
    console.error('📋 Error stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});